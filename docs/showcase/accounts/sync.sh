#!/usr/bin/env bash
# Sync against the real Turso database in .env: two edgy servers (ports 8795 and 8796, each
# with its own empty data), both pointed at cloud-gate.mjs (port 9900), which forwards to
# Turso with the token from .env and can cut the cloud off. Writes sync.txt next to this script.
#   TMPDIR=/tmp/x docs/showcase/accounts/sync.sh
# KEEP=1 leaves the servers running (and the account in place) to take screenshots.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
OUT=docs/showcase/accounts
WORK="${TMPDIR:-/tmp}/sync-check"
GATE=9900; P1=8795; P2=8796
[ -f .env ] || { echo "no .env with TURSO_URL and TURSO_AUTH_TOKEN"; exit 1; }

stop_port() {
  lsof -ti "tcp:$1" -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null
  command -v powershell >/dev/null && powershell -NoProfile -Command "Stop-Process -Force -Id (Get-NetTCPConnection -State Listen -LocalPort $1 -ErrorAction SilentlyContinue).OwningProcess" >/dev/null 2>&1
  true
}
for p in $GATE $P1 $P2; do stop_port $p; done
rm -rf "$WORK"; mkdir -p "$WORK"

nohup node --env-file=.env "$OUT/cloud-gate.mjs" $GATE >"$WORK/gate.log" 2>&1 &
for port in $P1 $P2; do
  # The servers never see the token: the gate adds it.
  EDGY_AUTH=accounts EDGY_PORT=$port EDGY_DATA="$WORK/data-$port" EDGY_SYNC_INTERVAL=1000 \
  TURSO_URL="http://127.0.0.1:$GATE" TURSO_AUTH_TOKEN=gate EDGY_DIST="${EDGY_DIST:-$WORK/none}" NODE_ENV=${NODE_ENV:-development} \
    nohup node --disable-warning=ExperimentalWarning --import tsx src/server/index.ts >"$WORK/server-$port.log" 2>&1 &
done
for port in $P1 $P2; do
  for _ in $(seq 1 60); do curl -sf "http://127.0.0.1:$port/api/health" >/dev/null && break; sleep 0.5; done
done
curl -sf "http://127.0.0.1:$GATE/__gate" >/dev/null || { echo "the gate did not start"; cat "$WORK/gate.log"; exit 1; }

node "$OUT/sync-check.mjs" "http://127.0.0.1:$P1" "http://127.0.0.1:$P2" "http://127.0.0.1:$GATE" "$OUT/sync.txt"
code=$?
# No token in anything the servers wrote.
if grep -q "$(node --env-file=.env -e 'process.stdout.write((process.env.TURSO_AUTH_TOKEN||"").slice(8,40))')" "$WORK"/server-*.log "$OUT/sync.txt" 2>/dev/null; then
  echo "FAIL the token appears in a log"; code=1
else
  echo "the token appears in no server log and not in sync.txt" | tee -a "$OUT/sync.txt"
fi
grep -i "error" "$WORK"/server-*.log | head -5
[ "${KEEP:-}" = 1 ] || for p in $GATE $P1 $P2; do stop_port $p; done
exit $code
