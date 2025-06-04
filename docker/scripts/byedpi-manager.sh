#!/bin/bash

# ByeDPI Process Manager for Container
# This script monitors configuration and manages ciadpi processes

CONFIG_FILE="/app/config.json"
PID_DIR="/app/logs/pids"
LOG_DIR="/app/logs/byedpi"
BINARY="/app/byedpi/ciadpi"

# Create directories
mkdir -p "$PID_DIR" "$LOG_DIR"

# Function to log with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Function to create default config if not exists
ensure_config() {
    if [ ! -f "$CONFIG_FILE" ]; then
        log "Creating default config file: $CONFIG_FILE"
        cat > "$CONFIG_FILE" << 'EOF'
{
    "local_ip": "127.0.0.1",
    "ciadpi_main_servers_tcp_ports": {},
    "ciadpi_main_servers_latest_used_strategies": {}
}
EOF
        chown nginx:nginx "$CONFIG_FILE" 2>/dev/null || true
        chmod 666 "$CONFIG_FILE" 2>/dev/null || true
    fi
}

# Function to read JSON config safely
read_config() {
    ensure_config
    
    if [ ! -f "$CONFIG_FILE" ]; then
        log "ERROR: Config file not found: $CONFIG_FILE"
        return 1
    fi
    
    # Extract local IP with error handling
    LOCAL_IP=$(php82 -r "
        try {
            \$content = file_get_contents('$CONFIG_FILE');
            if (\$content === false) {
                echo '127.0.0.1';
                exit(0);
            }
            \$config = json_decode(\$content, true);
            if (json_last_error() !== JSON_ERROR_NONE) {
                echo '127.0.0.1';
                exit(0);
            }
            echo \$config['local_ip'] ?? '127.0.0.1';
        } catch (Exception \$e) {
            echo '127.0.0.1';
        }
    " 2>/dev/null || echo "127.0.0.1")
    
    log "Local IP: $LOCAL_IP"
}

# Function to start a ciadpi process
start_process() {
    local server_id="$1"
    local port="$2"
    local strategy="$3"
    
    local pid_file="$PID_DIR/main_${server_id}.pid"
    local log_file="$LOG_DIR/main_${server_id}.log"
    
    # Check if already running
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            log "Process main_${server_id} already running (PID: $pid)"
            return 0
        else
            rm -f "$pid_file"
        fi
    fi
    
    # Build command
    local cmd="$BINARY -p $port"
    if [ -n "$strategy" ] && [ "$strategy" != "null" ] && [ "$strategy" != "" ]; then
        cmd="$cmd $strategy"
    fi
    
    log "Starting main_${server_id} on port $port with strategy: ${strategy:-'none'}"
    
    # Start process in background
    nohup $cmd > "$log_file" 2>&1 &
    local pid=$!
    
    # Save PID
    echo "$pid" > "$pid_file"
    
    # Wait a moment and check if process is still running
    sleep 1
    if kill -0 "$pid" 2>/dev/null; then
        log "Successfully started main_${server_id} (PID: $pid)"
    else
        log "ERROR: Failed to start main_${server_id}"
        rm -f "$pid_file"
        return 1
    fi
}

# Function to stop a process
stop_process() {
    local server_id="$1"
    local pid_file="$PID_DIR/main_${server_id}.pid"
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            log "Stopping main_${server_id} (PID: $pid)"
            kill "$pid"
            sleep 2
            
            # Force kill if still running
            if kill -0 "$pid" 2>/dev/null; then
                log "Force killing main_${server_id}"
                kill -9 "$pid"
            fi
        fi
        rm -f "$pid_file"
    fi
}

# Function to manage all processes based on config
manage_processes() {
    read_config || {
        log "ERROR: Failed to read config, skipping process management"
        return 1
    }
    
    # Read current configuration with error handling
    local config_data=$(php82 -r "
        try {
            \$content = file_get_contents('$CONFIG_FILE');
            if (\$content === false) {
                exit(0);
            }
            \$config = json_decode(\$content, true);
            if (json_last_error() !== JSON_ERROR_NONE) {
                exit(0);
            }
            \$ports = \$config['ciadpi_main_servers_tcp_ports'] ?? [];
            \$strategies = \$config['ciadpi_main_servers_latest_used_strategies'] ?? [];
            
            for (\$i = 1; \$i <= 8; \$i++) {
                \$key = \"main_\$i\";
                \$port = \$ports[\$key] ?? null;
                \$strategy = \$strategies[\$key] ?? '';
                
                if (is_numeric(\$port) && \$port > 0) {
                    echo \"\$i:\$port:\$strategy\n\";
                }
            }
        } catch (Exception \$e) {
            // Silent fail
        }
    " 2>/dev/null || echo "")
    
    # Stop all processes first
    for i in {1..8}; do
        stop_process "$i"
    done
    
    # Start configured processes
    if [ -n "$config_data" ]; then
        echo "$config_data" | while IFS=':' read -r server_id port strategy; do
            if [ -n "$server_id" ] && [ -n "$port" ]; then
                start_process "$server_id" "$port" "$strategy"
            fi
        done
    else
        log "No processes configured to start"
    fi
}

# Function to check process health
check_health() {
    local unhealthy=0
    
    for pid_file in "$PID_DIR"/main_*.pid; do
        if [ -f "$pid_file" ]; then
            local pid=$(cat "$pid_file")
            local server_id=$(basename "$pid_file" .pid)
            
            if ! kill -0 "$pid" 2>/dev/null; then
                log "WARNING: Process $server_id is not running (PID: $pid)"
                unhealthy=$((unhealthy + 1))
                rm -f "$pid_file"
            fi
        fi
    done
    
    return $unhealthy
}

# Signal handlers
cleanup() {
    log "Received shutdown signal, stopping all processes..."
    for i in {1..8}; do
        stop_process "$i"
    done
    exit 0
}

trap cleanup SIGTERM SIGINT

# Main loop
log "ByeDPI Manager starting..."

# Initial setup - ensure config exists first
ensure_config

# Initial process management (don't fail if config is empty)
manage_processes || log "Initial process management failed, continuing..."

# Touch initial check file
touch "/tmp/last_config_check"

# Monitor loop
log "Starting monitoring loop..."
while true; do
    sleep 30
    
    # Check if config has been modified
    if [ "$CONFIG_FILE" -nt "/tmp/last_config_check" ]; then
        log "Configuration change detected, reloading..."
        manage_processes || log "Process management failed during reload"
        touch "/tmp/last_config_check"
    fi
    
    # Health check
    if ! check_health; then
        log "Some processes are unhealthy, attempting restart..."
        manage_processes || log "Process management failed during health check restart"
    fi
done 