#!/usr/bin/env bash
# Replays every tutorial of site/content/tutorials/ for real, from a fresh server, and writes the evidence
# into this folder: <name>-replayed.png, <name>-template.png, <name>-side-by-side.png and replay.txt.
#
#   bash docs/showcase/docs-site/tutorials/replay.sh [name …]      all ten, or just the ones named
#
# A production server of its own on port 8794 with empty data ($TMPDIR/replay-data); headless Chrome
# (CHROME=… when it is not in the usual place); ffmpeg on the PATH. Stops the server at the end.
# REPLAY_PORT changes the port (never 8787, 5173, 8791, 8793 or 4174).
cd "$(git rev-parse --show-toplevel)" || exit 1
PORT="${REPLAY_PORT:-8794}"
case "$PORT" in 8787|5173|8791|8793|4174) echo "port $PORT is not for the replay"; exit 1;; esac
export REPLAY_PORT="$PORT"
export TMPDIR="${TMPDIR:-${TEMP:-/tmp}}"
[ -z "$CHROME" ] && [ -f "C:/Program Files/Google/Chrome/Application/chrome.exe" ] && export CHROME="C:/Program Files/Google/Chrome/Application/chrome.exe"
D=docs/showcase/docs-site/tutorials
export REPLAY_WORK="$TMPDIR/replay-work"
[ $# -eq 0 ] && rm -rf "$REPLAY_WORK"; mkdir -p "$REPLAY_WORK"

bash .claude/goal-loop/serve.sh fresh "$PORT" "$TMPDIR/replay-data" || exit 1
node "$D/replay.mjs" "$@"
status=$?
node "$D/report.mjs" >/dev/null
bash .claude/goal-loop/serve.sh stop "$PORT" >/dev/null
echo "replay.txt written to $D/replay.txt"
exit $status
