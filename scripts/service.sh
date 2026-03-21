#!/bin/bash

# MonkAgents Service Management Script
# Usage: ./scripts/service.sh [start|stop|restart|status] [backend|frontend|all]

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Ports
BACKEND_PORT=3000
FRONTEND_PORT=5173

# PID files directory
PID_DIR="./pids"
mkdir -p "$PID_DIR"

# Get PID from port
get_pid_from_port() {
    local port=$1
    if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
        # Windows
        netstat -ano 2>/dev/null | grep ":$port" | grep LISTENING | awk '{print $5}' | head -1
    else
        # Unix/Linux/Mac
        lsof -ti:$port 2>/dev/null
    fi
}

# Check if process is running
is_running() {
    local pid=$1
    if [[ -n "$pid" ]]; then
        if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
            tasklist //FI "PID eq $pid" 2>/dev/null | grep -q "$pid"
        else
            kill -0 $pid 2>/dev/null
        fi
        return $?
    fi
    return 1
}

# Start backend service
start_backend() {
    echo -e "${BLUE}Starting backend service...${NC}"

    local pid=$(get_pid_from_port $BACKEND_PORT)
    if [[ -n "$pid" ]]; then
        echo -e "${YELLOW}Backend is already running (PID: $pid)${NC}"
        return 0
    fi

    # Start backend in background
    npm run start:dev -w @monkagents/backend > ./logs/backend.log 2>&1 &
    local backend_pid=$!

    # Wait for service to start
    sleep 3

    pid=$(get_pid_from_port $BACKEND_PORT)
    if [[ -n "$pid" ]]; then
        echo $pid > "$PID_DIR/backend.pid"
        echo -e "${GREEN}Backend started successfully (PID: $pid, Port: $BACKEND_PORT)${NC}"
    else
        echo -e "${RED}Failed to start backend${NC}"
        return 1
    fi
}

# Start frontend service
start_frontend() {
    echo -e "${BLUE}Starting frontend service...${NC}"

    local pid=$(get_pid_from_port $FRONTEND_PORT)
    if [[ -n "$pid" ]]; then
        echo -e "${YELLOW}Frontend is already running (PID: $pid)${NC}"
        return 0
    fi

    # Start frontend in background
    cd packages/frontend && npm run dev > ../../logs/frontend.log 2>&1 &
    local frontend_pid=$!
    cd ../..

    # Wait for service to start
    sleep 2

    pid=$(get_pid_from_port $FRONTEND_PORT)
    if [[ -n "$pid" ]]; then
        echo $pid > "$PID_DIR/frontend.pid"
        echo -e "${GREEN}Frontend started successfully (PID: $pid, Port: $FRONTEND_PORT)${NC}"
    else
        echo -e "${RED}Failed to start frontend${NC}"
        return 1
    fi
}

# Stop backend service
stop_backend() {
    echo -e "${BLUE}Stopping backend service...${NC}"

    local pid=$(get_pid_from_port $BACKEND_PORT)
    if [[ -z "$pid" ]]; then
        echo -e "${YELLOW}Backend is not running${NC}"
        rm -f "$PID_DIR/backend.pid"
        return 0
    fi

    if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
        taskkill //PID $pid //F 2>/dev/null
    else
        kill $pid 2>/dev/null
        sleep 2
        if is_running $pid; then
            kill -9 $pid 2>/dev/null
        fi
    fi

    rm -f "$PID_DIR/backend.pid"
    echo -e "${GREEN}Backend stopped${NC}"
}

# Stop frontend service
stop_frontend() {
    echo -e "${BLUE}Stopping frontend service...${NC}"

    local pid=$(get_pid_from_port $FRONTEND_PORT)
    if [[ -z "$pid" ]]; then
        echo -e "${YELLOW}Frontend is not running${NC}"
        rm -f "$PID_DIR/frontend.pid"
        return 0
    fi

    if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
        taskkill //PID $pid //F 2>/dev/null
    else
        kill $pid 2>/dev/null
        sleep 2
        if is_running $pid; then
            kill -9 $pid 2>/dev/null
        fi
    fi

    rm -f "$PID_DIR/frontend.pid"
    echo -e "${GREEN}Frontend stopped${NC}"
}

# Show service status
show_status() {
    echo -e "\n${BLUE}=== MonkAgents Service Status ===${NC}\n"

    # Backend status
    local backend_pid=$(get_pid_from_port $BACKEND_PORT)
    if [[ -n "$backend_pid" ]]; then
        echo -e "Backend:  ${GREEN}Running${NC} (PID: $backend_pid, Port: $BACKEND_PORT)"
    else
        echo -e "Backend:  ${RED}Stopped${NC}"
    fi

    # Frontend status
    local frontend_pid=$(get_pid_from_port $FRONTEND_PORT)
    if [[ -n "$frontend_pid" ]]; then
        echo -e "Frontend: ${GREEN}Running${NC} (PID: $frontend_pid, Port: $FRONTEND_PORT)"
    else
        echo -e "Frontend: ${RED}Stopped${NC}"
    fi

    echo ""
}

# Main script
case "$1" in
    start)
        mkdir -p ./logs
        case "$2" in
            backend)
                start_backend
                ;;
            frontend)
                start_frontend
                ;;
            all|"")
                start_backend
                start_frontend
                ;;
            *)
                echo "Usage: $0 start [backend|frontend|all]"
                exit 1
                ;;
        esac
        ;;

    stop)
        case "$2" in
            backend)
                stop_backend
                ;;
            frontend)
                stop_frontend
                ;;
            all|"")
                stop_backend
                stop_frontend
                ;;
            *)
                echo "Usage: $0 stop [backend|frontend|all]"
                exit 1
                ;;
        esac
        ;;

    restart)
        case "$2" in
            backend)
                stop_backend
                start_backend
                ;;
            frontend)
                stop_frontend
                start_frontend
                ;;
            all|"")
                stop_backend
                stop_frontend
                start_backend
                start_frontend
                ;;
            *)
                echo "Usage: $0 restart [backend|frontend|all]"
                exit 1
                ;;
        esac
        ;;

    status)
        show_status
        ;;

    *)
        echo "MonkAgents Service Management"
        echo ""
        echo "Usage: $0 {start|stop|restart|status} [backend|frontend|all]"
        echo ""
        echo "Commands:"
        echo "  start    Start services"
        echo "  stop     Stop services"
        echo "  restart  Restart services"
        echo "  status   Show service status"
        echo ""
        echo "Examples:"
        echo "  $0 start all       Start both backend and frontend"
        echo "  $0 stop backend    Stop backend only"
        echo "  $0 restart         Restart all services"
        echo "  $0 status          Show current status"
        exit 1
        ;;
esac