#!/usr/bin/env bash
# The gates every milestone must pass: typecheck, tests, production build.
# Runs all of them (a failure doesn't hide the next one), prints one summary line each,
# and exits non-zero if any failed. Full output of a failed gate is in $LOGS/<gate>.log.
cd "$(git rev-parse --show-toplevel)" || exit 1
LOGS="${LOGS:-${TMPDIR:-/tmp}/goal-loop-gates}"
mkdir -p "$LOGS"
fail=0
gate() {
  local name="$1"; shift
  local start=$SECONDS
  if "$@" >"$LOGS/$name.log" 2>&1; then
    echo "PASS  $name  ($((SECONDS - start))s)"
  else
    fail=1
    echo "FAIL  $name  ($((SECONDS - start))s)  → $LOGS/$name.log"
    tail -n 25 "$LOGS/$name.log" | sed 's/^/      /'
  fi
}
gate typecheck npm run --silent typecheck
gate test npm test --silent
gate build npm run --silent build
# Node's test runner prints a summary; surface the counts so PROGRESS.md can quote them.
grep -E '^# (tests|pass|fail)' "$LOGS/test.log" | tr '\n' ' '; echo
# Vite warns about oversized chunks without failing; treat it as a finding, not a pass.
grep -i 'chunks are larger' "$LOGS/build.log" >/dev/null && echo "WARN  build: chunk size warning (see $LOGS/build.log)"
exit $fail
