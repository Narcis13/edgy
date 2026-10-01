#!/usr/bin/env bash
# A production edgy (built app + API in one process) on its own port and its own data,
# so verification never touches data/edgy.db or a dev server the user has open.
#
#   serve.sh start [port=8791] [data-dir=$TMPDIR/goal-loop-data]   builds, starts, waits for health
#   serve.sh stop  [port=8791]
#   serve.sh fresh [port=8791] [data-dir]                           stop, wipe the data dir, start
cd "$(git rev-parse --show-toplevel)" || exit 1
cmd="${1:-start}"; port="${2:-8791}"; data="${3:-${TMPDIR:-/tmp}/goal-loop-data}"
pidfile="${TMPDIR:-/tmp}/goal-loop-serve-$port.pid"
log="${TMPDIR:-/tmp}/goal-loop-serve-$port.log"

stop() {
  [ -f "$pidfile" ] && kill "$(cat "$pidfile")" 2>/dev/null
  rm -f "$pidfile"
  # Make sure nothing else keeps the port.
  lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null
  true
}

start() {
  stop
  mkdir -p "$data"
  npm run --silent build >"$log" 2>&1 || { echo "build failed, see $log"; exit 1; }
  NODE_ENV=production EDGY_PORT="$port" EDGY_DATA="$data" \
    nohup node --disable-warning=ExperimentalWarning --import tsx src/server/index.ts >>"$log" 2>&1 &
  echo $! >"$pidfile"
  for _ in $(seq 1 60); do
    curl -sf "http://127.0.0.1:$port/api/health" >/dev/null && { echo "http://127.0.0.1:$port  (data in $data, log $log)"; exit 0; }
    sleep 0.5
  done
  echo "server did not come up, see $log"; tail -n 20 "$log"; exit 1
}

case "$cmd" in
  start) start ;;
  stop) stop; echo stopped ;;
  fresh) stop; rm -rf "$data"; start ;;
  *) echo "usage: serve.sh start|stop|fresh [port] [data-dir]"; exit 1 ;;
esac
