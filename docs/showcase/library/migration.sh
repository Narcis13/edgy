#!/usr/bin/env bash
# A database made by the code before the library (commit 40b398d) opens with the new code:
# every document, its history, its records and its messages in place.
#   TMPDIR=/tmp/ev docs/showcase/library/migration.sh
# Writes migration.txt next to this script.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
OUT=docs/showcase/library
WORK="${TMPDIR:-/tmp}/library-migration"
OLD="$WORK/old-code"
OLDPORT=8797
rm -rf "$WORK"; mkdir -p "$WORK"
git worktree remove --force "$OLD" 2>/dev/null
git worktree add --detach "$OLD" 40b398d >/dev/null 2>&1 || { echo "worktree failed"; exit 1; }
# The old code runs with today's packages (it uses no package the new code dropped).
ln -s "$(pwd)/node_modules" "$OLD/node_modules" 2>/dev/null || cmd //c mklink //J "$(cygpath -w "$OLD/node_modules")" "$(cygpath -w "$(pwd)/node_modules")" >/dev/null

# Stop whatever listens on a port: lsof where there is one, PowerShell on Windows.
stop_port() {
  lsof -ti "tcp:$1" -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null
  command -v powershell >/dev/null && powershell -NoProfile -Command "Stop-Process -Force -Id (Get-NetTCPConnection -State Listen -LocalPort $1 -ErrorAction SilentlyContinue).OwningProcess" >/dev/null 2>&1
  sleep 1
}
json() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=JSON.parse(s);console.log(eval(process.argv[1]))})' "$1"; }
post() { curl -s -XPOST "$1$2" -H 'content-type: application/json' -d "$3"; }

# The old code needs its own port; a server already there would answer instead of it.
curl -sf "http://127.0.0.1:$OLDPORT/api/health" >/dev/null && { echo "port $OLDPORT is taken; stop what runs there first"; exit 1; }
(cd "$OLD" && EDGY_PORT=$OLDPORT EDGY_DATA="$WORK/old-data" nohup node --disable-warning=ExperimentalWarning --import tsx src/server/index.ts >"$WORK/old.log" 2>&1 & echo $! >"$WORK/old.pid")
for _ in $(seq 1 60); do curl -sf "http://127.0.0.1:$OLDPORT/api/health" >/dev/null && break; sleep 0.5; done
U="http://127.0.0.1:$OLDPORT"
A=$(post $U /api/docs '{"template":"showcase"}' | json v.id)
B=$(post $U /api/docs '{"template":"events"}' | json v.id)
C=$(post $U /api/docs '{"title":"Kept notes","root":["col",["text","Harbour lights and the old pier"],["input",{"name":"n","type":"number","value":1}]]}' | json v.id)
post $U "/api/docs/$C/ops" '{"actor":{"kind":"agent","name":"Claude"},"ops":[["set","n","value",7]]}' >/dev/null
post $U "/api/docs/$C/ops" '{"actor":{"kind":"human","name":"Ann"},"ops":[["meta","title","Kept notes, edited"]]}' >/dev/null
post $U "/api/docs/$A/ops" '{"actor":{"kind":"human","name":"Ann"},"ops":[["set","people","value",20]]}' >/dev/null
post $U /api/data/offsite-events '{"record":{"date":"2026-10-15","title":"Dinner"}}' >/dev/null
post $U "/api/docs/$C/messages" '{"text":"Looks right to me","actor":{"kind":"human","name":"Ann"}}' >/dev/null

snapshot() {
  local u=$1
  for d in $(curl -s "$u/api/docs" | json 'v.map(d=>d.id).sort().join(" ")'); do
    echo "doc $d: $(curl -s "$u/api/docs/$d" | json 'JSON.stringify(v)' | sha1sum | cut -c1-12) log $(curl -s "$u/api/docs/$d/log?limit=500" | json 'JSON.stringify(v)' | sha1sum | cut -c1-12) messages $(curl -s "$u/api/docs/$d/messages" | json 'JSON.stringify(v)' | sha1sum | cut -c1-12) ($(curl -s "$u/api/docs/$d/log?limit=500" | json 'v.length') changes)"
  done
  for c in $(curl -s "$u/api/data" | json 'v.map(c=>c.name).join(" ")'); do
    echo "collection $c: $(curl -s "$u/api/data/$c" | json 'JSON.stringify(v)' | sha1sum | cut -c1-12) ($(curl -s "$u/api/data/$c" | json 'v.length') records)"
  done
}
snapshot "$U" >"$WORK/before.txt"
# The shell's kill may not reach node itself on Windows; stop it by its port.
kill "$(cat "$WORK/old.pid")" 2>/dev/null
stop_port $OLDPORT
curl -sf "http://127.0.0.1:$OLDPORT/api/health" >/dev/null && { echo "the old server did not stop"; exit 1; }
# The copy, made by the old code, is what the new code opens.
mkdir -p "$WORK/copy" && cp "$WORK/old-data/"edgy.db* "$WORK/copy/"
bash .claude/goal-loop/serve.sh start 8798 "$WORK/copy" >/dev/null || exit 1
N="http://127.0.0.1:8798"
snapshot "$N" >"$WORK/after.txt"
{
  echo "Migration check, $(date -u +%Y-%m-%dT%H:%MZ): a database written by commit 40b398d (schema 1), copied, opened by this version."
  echo
  echo "Before (old code):"; sed 's/^/  /' "$WORK/before.txt"
  echo "After (new code, same file):"; sed 's/^/  /' "$WORK/after.txt"
  echo
  if diff -q "$WORK/before.txt" "$WORK/after.txt" >/dev/null; then echo "Identical: every document, its history, its messages and every collection."; else echo "DIFFERENT:"; diff "$WORK/before.txt" "$WORK/after.txt"; fi
  echo
  echo "Library on the migrated file: $(curl -s "$N/api/library" | json '`${v.total} entries; titles: ${v.rest.map(e=>e.title).join(", ")}`')"
  echo "Search \"harbour\" (text inside an old document): $(curl -s "$N/api/library?q=harbour" | json 'v.rest.map(e=>`${e.title} (in the ${e.match.field})`).join(", ")')"
} | tee "$OUT/migration.txt"
bash .claude/goal-loop/serve.sh stop 8798 >/dev/null
git worktree remove --force "$OLD" >/dev/null 2>&1
