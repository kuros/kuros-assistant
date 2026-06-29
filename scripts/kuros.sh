#!/usr/bin/env bash
#
# kuros.sh — run Kuros Manager (db + backend + frontend) as a background process.
#
# Usage:
#   kuros start     # start the app in the background
#   kuros stop      # stop the background app
#   kuros restart   # stop then start
#   kuros status    # show whether it's running
#   kuros logs      # tail the combined log (Ctrl-C to stop tailing)
#
set -euo pipefail

# Resolve the repo root regardless of where the script is called from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

RUN_DIR="$ROOT_DIR/.run"
PID_FILE="$RUN_DIR/kuros.pid"
LOG_FILE="$RUN_DIR/kuros.log"

mkdir -p "$RUN_DIR"

is_running() {
  [[ -f "$PID_FILE" ]] || return 1
  local pid
  pid="$(cat "$PID_FILE")"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

start() {
  if is_running; then
    echo "Kuros is already running (pid $(cat "$PID_FILE"))."
    return 0
  fi

  echo "Starting Postgres (docker)..."
  (cd "$ROOT_DIR" && pnpm db:up) >>"$LOG_FILE" 2>&1 || {
    echo "Failed to start db. See $LOG_FILE"; exit 1;
  }

  echo "Starting backend + frontend in the background..."
  # setsid detaches the process group so it survives the terminal closing.
  setsid bash -c "cd '$ROOT_DIR' && exec pnpm dev" >>"$LOG_FILE" 2>&1 &
  echo $! >"$PID_FILE"

  sleep 1
  if is_running; then
    echo "Kuros started (pid $(cat "$PID_FILE"))."
    echo "  Backend:  http://localhost:3000"
    echo "  Frontend: http://localhost:5173"
    echo "  Logs:     kuros logs   (file: $LOG_FILE)"
  else
    echo "Kuros failed to start. See $LOG_FILE"
    exit 1
  fi
}

stop() {
  if ! is_running; then
    echo "Kuros is not running."
    rm -f "$PID_FILE"
    return 0
  fi
  local pid
  pid="$(cat "$PID_FILE")"
  echo "Stopping Kuros (pid $pid)..."
  # Kill the whole process group (negative pid) so child node procs die too.
  kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  sleep 2
  kill -KILL -- "-$pid" 2>/dev/null || true
  rm -f "$PID_FILE"
  echo "Stopped. (Postgres container is left running; use 'pnpm db:down' to stop it.)"
}

status() {
  if is_running; then
    echo "Kuros is running (pid $(cat "$PID_FILE"))."
  else
    echo "Kuros is not running."
  fi
}

logs() {
  [[ -f "$LOG_FILE" ]] || { echo "No log file yet at $LOG_FILE"; exit 0; }
  tail -f "$LOG_FILE"
}

case "${1:-}" in
  start)   start ;;
  stop)    stop ;;
  restart) stop; start ;;
  status)  status ;;
  logs)    logs ;;
  *)
    echo "Usage: kuros {start|stop|restart|status|logs}"
    exit 1
    ;;
esac