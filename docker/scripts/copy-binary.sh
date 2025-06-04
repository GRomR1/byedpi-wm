#!/bin/bash
set -e

echo "Target architecture: ${TARGETARCH}"
echo "Target variant: ${TARGETVARIANT}"

# Copy the appropriate binary based on architecture
case "${TARGETARCH}" in
    "amd64")
        echo "Using x86_64 binary"
        ;;
    "arm64")
        echo "ARM64 architecture detected"
        if [ -f "/app/byedpi/ciadpi-arm64" ]; then
            cp /app/byedpi/ciadpi-arm64 /app/byedpi/ciadpi
            chmod +x /app/byedpi/ciadpi
        else
            echo "Warning: ARM64 binary not found, keeping default"
        fi
        ;;
    "arm")
        echo "ARM32 architecture detected"
        case "${TARGETVARIANT}" in
            "v6")
                echo "Using ARMv6 binary"
                if [ -f "/app/byedpi/ciadpi-armv6" ]; then
                    cp /app/byedpi/ciadpi-armv6 /app/byedpi/ciadpi
                    chmod +x /app/byedpi/ciadpi
                else
                    echo "Warning: ARMv6 binary not found, keeping default"
                fi
                ;;
            "v7")
                echo "Using ARMv7 binary"
                if [ -f "/app/byedpi/ciadpi-armv7l" ]; then
                    cp /app/byedpi/ciadpi-armv7l /app/byedpi/ciadpi
                    chmod +x /app/byedpi/ciadpi
                else
                    echo "Warning: ARMv7 binary not found, keeping default"
                fi
                ;;
            *)
                echo "Using ARMv7 binary as default for ARM32"
                if [ -f "/app/byedpi/ciadpi-armv7l" ]; then
                    cp /app/byedpi/ciadpi-armv7l /app/byedpi/ciadpi
                    chmod +x /app/byedpi/ciadpi
                else
                    echo "Warning: ARMv7 binary not found, keeping default"
                fi
                ;;
        esac
        ;;
    *)
        echo "Unsupported architecture: ${TARGETARCH}"
        echo "Keeping default x86_64 binary"
        ;;
esac

echo "Binary setup complete" 