#!/bin/bash

# Multi-architecture build script for ByeDPI Web Manager
# Builds Docker images for MikroTik RouterOS compatibility

set -e

# Configuration
IMAGE_NAME="byedpi-web-manager"
TAG="${1:-latest}"
REGISTRY="${REGISTRY:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[BUILD]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check dependencies
check_dependencies() {
    log "Checking dependencies..."
    
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed or not in PATH"
        exit 1
    fi
    
    if ! docker buildx version &> /dev/null; then
        error "Docker buildx is not available"
        exit 1
    fi
    
    # Check if buildx supports multiple architectures
    if ! docker buildx ls | grep -q "linux/arm64"; then
        warn "Multi-architecture support may not be available"
        warn "Run: docker run --privileged --rm tonistiigi/binfmt --install all"
    fi
}

# Create builder if not exists
setup_builder() {
    log "Setting up multi-architecture builder..."
    
    if ! docker buildx ls | grep -q "byedpi-builder"; then
        docker buildx create --name byedpi-builder --use --bootstrap
    else
        docker buildx use byedpi-builder
    fi
}

# Build for specific architecture
build_single_arch() {
    local arch="$1"
    local platform="$2"
    
    log "Building for $arch ($platform)..."
    
    local tag_suffix=""
    if [ "$arch" != "amd64" ]; then
        tag_suffix="-$arch"
    fi
    
    local full_tag="${IMAGE_NAME}:${TAG}${tag_suffix}"
    if [ -n "$REGISTRY" ]; then
        full_tag="${REGISTRY}/${full_tag}"
    fi
    
    docker buildx build \
        --platform "$platform" \
        --tag "$full_tag" \
        --file docker/Dockerfile \
        --load \
        .
    
    log "Successfully built $full_tag"
}

# Build multi-architecture image
build_multi_arch() {
    log "Building multi-architecture image..."
    
    local full_tag="${IMAGE_NAME}:${TAG}"
    if [ -n "$REGISTRY" ]; then
        full_tag="${REGISTRY}/${full_tag}"
    fi
    
    # Define supported platforms for MikroTik
    local platforms="linux/amd64,linux/arm64,linux/arm/v7,linux/arm/v6,linux/arm/v5"
    
    if [ -n "$REGISTRY" ]; then
        # Push to registry
        docker buildx build \
            --platform "$platforms" \
            --tag "$full_tag" \
            --file docker/Dockerfile \
            --push \
            .
    else
        # Build locally (only amd64 will be available)
        docker buildx build \
            --platform "linux/amd64" \
            --tag "$full_tag" \
            --file docker/Dockerfile \
            --load \
            .
    fi
    
    log "Successfully built multi-architecture image: $full_tag"
}

# Export image as tar
export_image() {
    local arch="$1"
    
    log "Exporting image for $arch..."
    
    local tag_suffix=""
    if [ "$arch" != "amd64" ]; then
        tag_suffix="-$arch"
    fi
    
    local image_tag="${IMAGE_NAME}:${TAG}${tag_suffix}"
    local output_file="byedpi-web-manager-${TAG}-${arch}.tar"
    
    if docker image inspect "$image_tag" >/dev/null 2>&1; then
        docker save "$image_tag" > "$output_file"
        log "Exported: $output_file"
    else
        warn "Image $image_tag not found, skipping export"
    fi
}

# Clean up builder
cleanup() {
    if [ "$1" = "full" ]; then
        log "Cleaning up builder..."
        docker buildx rm byedpi-builder || true
    fi
}

# Main build process
main() {
    log "Starting ByeDPI Web Manager build process..."
    log "Tag: $TAG"
    
    check_dependencies
    setup_builder
    
    case "${1:-multi}" in
        "amd64")
            build_single_arch "amd64" "linux/amd64"
            export_image "amd64"
            ;;
        "arm64")
            build_single_arch "arm64" "linux/arm64"
            export_image "arm64"
            ;;
        "armv7")
            build_single_arch "armv7" "linux/arm/v7"
            export_image "armv7"
            ;;
        "armv6")
            build_single_arch "armv6" "linux/arm/v6"
            export_image "armv6"
            ;;
        "armv5")
            build_single_arch "armv5" "linux/arm/v5"
            export_image "armv5"
            ;;
        "all")
            build_single_arch "amd64" "linux/amd64"
            build_single_arch "arm64" "linux/arm64"
            build_single_arch "armv7" "linux/arm/v7"
            build_single_arch "armv6" "linux/arm/v6"
            build_single_arch "armv5" "linux/arm/v5"
            
            export_image "amd64"
            export_image "arm64"
            export_image "armv7"
            export_image "armv6"
            export_image "armv5"
            ;;
        "multi")
            build_multi_arch
            ;;
        "clean")
            cleanup full
            exit 0
            ;;
        *)
            echo "Usage: $0 [amd64|arm64|armv7|armv6|armv5|all|multi|clean] [tag]"
            echo ""
            echo "Architectures:"
            echo "  amd64  - Build for x86_64 (CCR/CRS series)"
            echo "  arm64  - Build for ARM64 (hAP ax2, CCR2004, etc.)"
            echo "  armv7  - Build for ARM32v7 (RB4011, hAP ac2, etc.)"
            echo "  armv6  - Build for ARM32v6 (старые MikroTik, Pi Zero, hAP ac2 old)"
            echo "  armv5  - Build for ARM32v5 (hEX Refresh with EN7562CT)"
            echo "  all    - Build all architectures separately"
            echo "  multi  - Build multi-architecture image (default)"
            echo "  clean  - Clean up build environment"
            echo ""
            echo "Environment variables:"
            echo "  REGISTRY - Docker registry (optional)"
            echo ""
            echo "Examples:"
            echo "  $0 multi latest"
            echo "  REGISTRY=myregistry.com $0 multi v1.0"
            echo "  $0 armv6 latest  # Для старых ARM"
            exit 1
            ;;
    esac
    
    log "Build process completed successfully!"
}

# Handle script arguments
if [ "$1" = "clean" ]; then
    cleanup full
    exit 0
fi

main "$@" 