#!/usr/bin/env bash
# A database written before accounts (commit 056806e: no sign-in, schema 3) opens with the
# current code in accounts mode: the first account to sign up owns everything that was there,
# nothing in it changes, and a second account sees none of it.
#   TMPDIR=/tmp/ev docs/showcase/accounts/migration.sh
# Uses ports 8799 (the old code) and 8798 (this code). Writes migration.txt next to this script.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
OUT=docs/showcase/accounts
WORK="${TMPDIR:-/tmp}/accounts-migration"
OLD="$WORK/old-code"
OLDPORT=8799
NEWPORT=8798
rm -rf "$WORK"; mkdir -p "$WORK"
git worktree remove --force "$OLD" 2>/dev/null
git worktree add --detach "$OLD" 056806e >/dev/null 2>&1 || { echo "worktree failed"; exit 1; }
# The old code runs with today's packages (it uses no package the new code dropped).
ln -s "$(pwd)/node_modules" "$OLD/node_modules" 2>/dev/null || cmd //c mklink //J "$(cygpath -w "$OLD/node_modules")" "$(cygpath -w "$(pwd)/node_modules")" >/dev/null

# Stop whatever listens on a port: lsof where there is one, PowerShell on Windows.
stop_port() {
  lsof -ti "tcp:$1" -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null
  command -v powershell >/dev/null && powershell -NoProfile -Command "Stop-Process -Force -Id (Get-NetTCPConnection -State Listen -LocalPort $1 -ErrorAction SilentlyContinue).OwningProcess" >/dev/null 2>&1
  sleep 1
}
cleanup() {
  stop_port $OLDPORT
  bash .claude/goal-loop/serve.sh stop $NEWPORT >/dev/null 2>&1
  git worktree remove --force "$OLD" >/dev/null 2>&1
}
trap cleanup EXIT

json() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=JSON.parse(s);console.log(eval(process.argv[1]))})' "$1"; }
post() { curl -s -XPOST "$1$2" -H 'content-type: application/json' -d "$3"; }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
# What a file's schema version is (node:sqlite, read-only).
version() { node --disable-warning=ExperimentalWarning -e 'const {DatabaseSync}=require("node:sqlite");const d=new DatabaseSync(process.argv[1],{readOnly:true});console.log(d.prepare("PRAGMA user_version").get().user_version);d.close()' "$1"; }

# The snapshot: ids and hashes of every document body, its log and its messages, every collection's
# records, the library's order and pins, each deck, each document's links. Same for old and new code.
cat >"$WORK/snapshot.mjs" <<'EOF'
import { createHash } from 'node:crypto';
const [url, cookie = ''] = process.argv.slice(2);
const get = async (p) => {
  const r = await fetch(url + p, { headers: cookie ? { cookie } : {} });
  if (!r.ok) throw new Error(`${p} answered ${r.status}`);
  return r.json();
};
const sha = (v) => createHash('sha1').update(JSON.stringify(v)).digest('hex').slice(0, 12);
const docs = (await get('/api/docs')).map((d) => d.id).sort();
for (const d of docs) {
  const body = await get(`/api/docs/${d}`);
  const log = await get(`/api/docs/${d}/log?limit=500`);
  const messages = await get(`/api/docs/${d}/messages`);
  const shares = (await get(`/api/docs/${d}/shares`)).map((s) => `${s.token}:${s.access}`).sort();
  console.log(`doc ${d}: ${sha(body)} log ${sha(log)} messages ${sha(messages)} (${log.length} changes, ${messages.length} messages) links [${shares.join(' ')}]`);
}
for (const c of (await get('/api/data')).map((c) => c.name).sort()) {
  const rows = await get(`/api/data/${c}`);
  console.log(`collection ${c}: ${sha(rows)} (${rows.length} records)`);
}
const lib = await get('/api/library');
const card = (e) => [e.id, e.type, e.title, e.pinned ?? null, e.docs ?? null, e.deckTitle ?? null, e.archivedAt ?? null];
console.log(`library: ${lib.total} entries, pinned [${lib.pinned.map((e) => e.id).join(' ')}], then [${lib.rest.map((e) => e.id).join(' ')}], cards ${sha([...lib.pinned, ...lib.rest].map(card))}`);
for (const k of (await get('/api/decks')).map((k) => k.id).sort()) {
  const deck = await get(`/api/decks/${k}`);
  console.log(`deck ${k}: "${deck.title}", ${deck.docs.length} documents in order [${deck.docs.join(' ')}], ${sha([deck.id, deck.title, deck.description, deck.docs])}`);
}
EOF

# ── 1. before: the code before accounts, no sign-in ──
curl -sf "http://127.0.0.1:$OLDPORT/api/health" >/dev/null && { echo "port $OLDPORT is taken; stop what runs there first"; exit 1; }
curl -sf "http://127.0.0.1:$NEWPORT/api/health" >/dev/null && { echo "port $NEWPORT is taken; stop what runs there first"; exit 1; }
(cd "$OLD" && EDGY_PORT=$OLDPORT EDGY_DATA="$WORK/old-data" nohup node --disable-warning=ExperimentalWarning --import tsx src/server/index.ts >"$WORK/old.log" 2>&1 & echo $! >"$WORK/old.pid")
for _ in $(seq 1 60); do curl -sf "http://127.0.0.1:$OLDPORT/api/health" >/dev/null && break; sleep 0.5; done
U="http://127.0.0.1:$OLDPORT"
curl -sf "$U/api/health" >/dev/null || { echo "the old server did not start, see $WORK/old.log"; exit 1; }
A=$(post $U /api/docs '{"template":"showcase"}' | json v.id)
B=$(post $U /api/docs '{"template":"events"}' | json v.id)
C=$(post $U /api/docs '{"title":"Kept notes","root":["col",["text","Harbour lights and the old pier"],["input",{"name":"n","type":"number","value":1}]]}' | json v.id)
post $U "/api/docs/$C/ops" '{"actor":{"kind":"agent","name":"Claude"},"ops":[["set","n","value",7]]}' >/dev/null
post $U "/api/docs/$C/ops" '{"actor":{"kind":"human","name":"Ann"},"ops":[["meta","title","Kept notes, edited"]]}' >/dev/null
post $U "/api/docs/$A/ops" '{"actor":{"kind":"human","name":"Ann"},"ops":[["set","people","value",20]]}' >/dev/null
post $U /api/data/offsite-events '{"record":{"date":"2026-10-15","title":"Dinner"}}' >/dev/null
post $U /api/data/offsite-events '{"record":{"date":"2026-10-16","title":"Hike"}}' >/dev/null
post $U /api/data/budget-lines '{"record":{"item":"Venue","amount":1200}}' >/dev/null
post $U "/api/docs/$C/messages" '{"text":"Looks right to me","actor":{"kind":"human","name":"Ann"}}' >/dev/null
DECK=$(post $U /api/decks "{\"title\":\"Offsite pack\",\"description\":\"For the team\",\"docs\":[\"$A\",\"$B\"]}" | json v.id)
post $U /api/library/bulk "{\"action\":\"pin\",\"ids\":[\"$C\"]}" >/dev/null
VIEW=$(post $U "/api/docs/$C/shares" '{"access":"view"}' | json v.token)
post $U "/api/docs/$B/shares" '{"access":"edit"}' >/dev/null

node "$WORK/snapshot.mjs" "$U" >"$WORK/before.txt" || { echo "the snapshot of the old server failed"; exit 1; }
# The shell's kill may not reach node itself on Windows; stop it by its port.
kill "$(cat "$WORK/old.pid")" 2>/dev/null
stop_port $OLDPORT
curl -sf "http://127.0.0.1:$OLDPORT/api/health" >/dev/null && { echo "the old server did not stop"; exit 1; }
# The copy, made by the old code, is what the new code opens. Its version is read from a spare copy.
mkdir -p "$WORK/copy" "$WORK/peek" && cp "$WORK/old-data/"edgy.db* "$WORK/copy/" && cp "$WORK/old-data/"edgy.db* "$WORK/peek/"
V_BEFORE=$(version "$WORK/peek/edgy.db")

# ── 2. after: this code, accounts mode, the same file ──
EDGY_AUTH=accounts bash .claude/goal-loop/serve.sh start $NEWPORT "$WORK/copy" >/dev/null || exit 1
N="http://127.0.0.1:$NEWPORT"
SIGNED_OUT=$(code "$N/api/docs")
CK_ANA=$(bash .claude/goal-loop/serve.sh session $NEWPORT ana@example.test Ana)
node "$WORK/snapshot.mjs" "$N" "$CK_ANA" >"$WORK/after.txt" || { echo "the snapshot of the new server failed"; exit 1; }
OWNERS=""; ALLMINE=yes
for d in $(curl -s "$N/api/docs" -H "cookie: $CK_ANA" | json 'v.map(d=>d.id).sort().join(" ")'); do
  who=$(curl -s "$N/api/docs/$d/people" -H "cookie: $CK_ANA" | json 'v.people.filter(p=>p.role=="owner").map(p=>p.name).join()')
  OWNERS="$OWNERS  $d: owned by $who ($(curl -s "$N/api/docs/$d/people" -H "cookie: $CK_ANA" | json 'v.people.length') people)
"
  [ "$who" = "Ana" ] || ALLMINE=no
done
LINK_GUEST=$(code "$N/api/docs/$C" -H "x-edgy-share: $VIEW")
CK_BEN=$(bash .claude/goal-loop/serve.sh session $NEWPORT ben@example.test Ben)
BEN_DOCS=$(curl -s "$N/api/docs" -H "cookie: $CK_BEN" | json 'v.map(d=>`"${d.title}"`).join(", ")')
BEN_N=$(curl -s "$N/api/docs" -H "cookie: $CK_BEN" | json 'v.length')
BEN_DATA=$(curl -s "$N/api/data" -H "cookie: $CK_BEN")
BEN_LIB=$(curl -s "$N/api/library" -H "cookie: $CK_BEN" | json '`${v.total} entries: ${[...v.pinned,...v.rest].map(e=>e.title).join(", ")}`')
BEN_DECKS=$(curl -s "$N/api/decks" -H "cookie: $CK_BEN")
BEN_OPENS=$(code "$N/api/docs/$A" -H "cookie: $CK_BEN")
BEN_LOG=$(code "$N/api/docs/$C/log" -H "cookie: $CK_BEN")
BEN_RECORDS=$(code "$N/api/data/offsite-events" -H "cookie: $CK_BEN")
BEN_RECORDS_N=$(curl -s "$N/api/data/offsite-events" -H "cookie: $CK_BEN" | json 'v.length')
BEN_SHARES=$(code "$N/api/docs/$C/shares" -H "cookie: $CK_BEN")
bash .claude/goal-loop/serve.sh stop $NEWPORT >/dev/null
V_AFTER=$(version "$WORK/copy/edgy.db")

FAIL=0
verdict() { # label ok-condition(0 = ok) detail
  if [ "$2" = 0 ]; then echo "  ok   $1${3:+: $3}"; else echo "  FAIL $1${3:+: $3}   <-- UNEXPECTED"; FAIL=1; fi
}
{
  echo "Migration check, $(date -u +%Y-%m-%dT%H:%MZ): a database written by commit 056806e (before accounts), copied, opened by this version in accounts mode."
  echo
  echo "Before (old code, no sign-in; PRAGMA user_version = $V_BEFORE):"
  echo "  made: documents $A (template showcase), $B (template events, an edit link), $C (edits by Claude and Ann, a message, a view link, pinned)"
  echo "        (and the one document an empty old server makes for itself); deck $DECK \"Offsite pack\" of $A and $B; collections offsite-events (2 records) and budget-lines (1)"
  sed 's/^/  /' "$WORK/before.txt"
  echo
  echo "After (this code on a copy of the file, accounts mode; PRAGMA user_version = $V_AFTER):"
  echo "  signed out, GET /api/docs answers $SIGNED_OUT"
  echo "  the first account signs up (Ana) and reads with her cookie:"
  sed 's/^/  /' "$WORK/after.txt"
  echo
  echo "Who owns what (GET /api/docs/<id>/people):"
  printf '%s' "$OWNERS"
  echo
  verdict "schema version before" "$([ "$V_BEFORE" = 3 ]; echo $?)" "$V_BEFORE"
  verdict "schema version after" "$([ "$V_AFTER" = 5 ]; echo $?)" "$V_AFTER"
  verdict "signed out, the documents are refused" "$([ "$SIGNED_OUT" = 401 ]; echo $?)" "$SIGNED_OUT"
  verdict "every document is owned by the first account" "$([ "$ALLMINE" = yes ]; echo $?)"
  verdict "the view link made before accounts still opens its document for a guest" "$([ "$LINK_GUEST" = 200 ]; echo $?)" "$LINK_GUEST"
  echo
  if diff -q "$WORK/before.txt" "$WORK/after.txt" >/dev/null; then
    echo "Identical: every document, its history, its messages, every collection, the library order and pins, the deck and the links."
  else
    echo "DIFFERENT:"; diff "$WORK/before.txt" "$WORK/after.txt"; FAIL=1
  fi
  echo
  echo "A second account (Ben) signs up on the same file:"
  echo "  GET /api/docs:      $BEN_N: $BEN_DOCS"
  echo "  GET /api/data:      $BEN_DATA"
  echo "  GET /api/library:   $BEN_LIB"
  echo "  GET /api/decks:     $BEN_DECKS"
  echo "  GET /api/docs/$A: $BEN_OPENS;  /api/docs/$C/log: $BEN_LOG;  /api/docs/$C/shares: $BEN_SHARES"
  echo "  GET /api/data/offsite-events: $BEN_RECORDS, $BEN_RECORDS_N records"
  verdict "the second account has only its own tour" "$([ "$BEN_N" = 1 ] && [ "$BEN_DOCS" = '"Start here"' ]; echo $?)"
  verdict "the second account has no collections, no deck, and sees none of the first account's documents" "$([ "$BEN_DATA" = '[]' ] && [ "$BEN_DECKS" = '[]' ] && [ "$BEN_OPENS" = 404 ] && [ "$BEN_LOG" = 404 ] && [ "$BEN_SHARES" = 404 ] && [ "$BEN_RECORDS_N" = 0 ]; echo $?)"
  echo
  [ "$FAIL" = 0 ] && echo "Verdict: all checks came out as expected." || echo "Verdict: SOMETHING DID NOT COME OUT AS EXPECTED."
} | tee "$OUT/migration.txt"
cleanup
trap - EXIT
grep -q "^Verdict: all checks" "$OUT/migration.txt"
