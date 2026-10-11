#!/usr/bin/env bash
# A production edgy (built app + API in one process) on its own port and its own data,
# so verification never touches data/edgy.db or a dev server the user has open.
#
#   serve.sh start [port=8791] [data-dir=$TMPDIR/goal-loop-data]   builds, starts, waits for health
#   serve.sh stop  [port=8791]
#   serve.sh fresh [port=8791] [data-dir]                           stop, wipe the data dir, start
#   serve.sh session [port=8791] [email] [name]                     sign up (or in) a test account; prints edgy_session=…
#
# The server runs in accounts mode (sign-in needed), like a hosted edgy; EDGY_AUTH=local serve.sh … for local mode.
# Sweep signed in: export CDP_COOKIE="$(serve.sh session 8791)" (cdp.mjs and sweep.sh send it with every page).
# Sync stays off unless TURSO_URL and TURSO_AUTH_TOKEN are in the environment (see docs/showcase/accounts/sync.sh).
cd "$(git rev-parse --show-toplevel)" || exit 1
cmd="${1:-start}"; port="${2:-8791}"; data="${3:-${TMPDIR:-/tmp}/goal-loop-data}"
pidfile="${TMPDIR:-/tmp}/goal-loop-serve-$port.pid"
log="${TMPDIR:-/tmp}/goal-loop-serve-$port.log"
# Each server gets its own build, so a rebuild for one port never pulls files from under another.
dist="${TMPDIR:-/tmp}/goal-loop-dist-$port"

stop() {
  [ -f "$pidfile" ] && kill "$(cat "$pidfile")" 2>/dev/null
  rm -f "$pidfile"
  # Make sure nothing else keeps the port (lsof where there is one, PowerShell on Windows).
  lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null
  command -v powershell >/dev/null && powershell -NoProfile -Command "Stop-Process -Force -Id (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue).OwningProcess" >/dev/null 2>&1
  true
}

start() {
  stop
  mkdir -p "$data"
  npx vite build --outDir "$dist" --emptyOutDir >"$log" 2>&1 || { echo "build failed, see $log"; exit 1; }
  # The app as exported files carry it.
  npx vite build -c vite.offline.config.ts --outDir "$dist/offline" --emptyOutDir >>"$log" 2>&1 || { echo "offline build failed, see $log"; exit 1; }
  # The documentation, served at /docs/.
  npx tsx --disable-warning=ExperimentalWarning site/build/build.ts --out "$dist/docs" >>"$log" 2>&1 || { echo "docs build failed, see $log"; exit 1; }
  NODE_ENV=production EDGY_AUTH="${EDGY_AUTH:-accounts}" EDGY_PORT="$port" EDGY_DATA="$data" EDGY_DIST="$dist" \
    nohup node --disable-warning=ExperimentalWarning --import tsx src/server/index.ts >>"$log" 2>&1 &
  echo $! >"$pidfile"
  for _ in $(seq 1 60); do
    curl -sf "http://127.0.0.1:$port/api/health" >/dev/null && { echo "http://127.0.0.1:$port  (data in $data, log $log)"; exit 0; }
    sleep 0.5
  done
  echo "server did not come up, see $log"; tail -n 20 "$log"; exit 1
}

# A test account on the isolated server: signs up, or signs in when it exists. The password is a test value.
session() {
  local email="${3:-ana@example.test}" name="${4:-Ana}"
  local body="{\"email\":\"$email\",\"password\":\"correct horse\",\"name\":\"$name\"}"
  local set
  for route in signup signin; do
    set="$(curl -si -XPOST "http://127.0.0.1:$port/api/auth/$route" -H 'content-type: application/json' -d "$body" | tr -d '\r' | grep -i '^set-cookie: edgy_session=')"
    [ -n "$set" ] && break
  done
  [ -n "$set" ] || { echo "could not sign in on $port" >&2; exit 1; }
  echo "$set" | sed -E 's/^[Ss]et-[Cc]ookie: (edgy_session=[^;]+).*/\1/'
}

case "$cmd" in
  start) start ;;
  stop) stop; echo stopped ;;
  fresh) stop; rm -rf "$data"; start ;;
  session) session "$@" ;;
  *) echo "usage: serve.sh start|stop|fresh|session [port] [data-dir | email name]"; exit 1 ;;
esac
