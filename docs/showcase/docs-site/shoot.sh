#!/usr/bin/env bash
# Rebuilds the evidence for the docs site (brief 5) from a fresh state, into this folder.
#
#   bash docs/showcase/docs-site/shoot.sh [--pictures] [--tutorials]
#
# Always: a fresh docs build (size, page count, link check of the folder, weight), the static folder
# served on its own under /edgy-docs/ with no edgy server running (a crawl of every page at three
# sizes in both themes with axe and every live example started, then evidence.mjs static: live
# examples, search, theme, drawer, paper), and a fresh edgy on 8791 serving /docs/ (evidence.mjs app:
# signed out, the Docs links, the panel and code-studio links, the theme from the app), plus the app's
# home and the docs' home side by side in light and dark.
# --pictures also remakes the docs' own screenshots and clips (site/scripts/shoot.mjs, port 8793).
# --tutorials also replays the ten tutorials (tutorials/replay.sh, port 8794).
#
# Needs Chrome (CHROME=… when not in the usual place) and ffmpeg. Set TMPDIR to a scratch folder.
cd "$(git rev-parse --show-toplevel)" || exit 1
OUT=docs/showcase/docs-site
export TMPDIR="${TMPDIR:-${TEMP:-/tmp}}"
[ -z "$CHROME" ] && [ -f "C:/Program Files/Google/Chrome/Application/chrome.exe" ] && export CHROME="C:/Program Files/Google/Chrome/Application/chrome.exe"
export MSYS_NO_PATHCONV=1
STATIC=4174
APP=8791

if [[ " $* " == *" --pictures "* ]]; then node site/scripts/shoot.mjs || exit 1; fi

# ── the build ──
npm run --silent docs:build > "$TMPDIR/docs-build.txt" 2>&1 || { cat "$TMPDIR/docs-build.txt"; exit 1; }
{
  echo "# npm run docs:build, $(date -u +%Y-%m-%d)"
  grep "^docs:" "$TMPDIR/docs-build.txt"
  echo "pages: $(find dist/docs -name index.html | wc -l | tr -d ' ') (index.html files, plus 404.html)"
  echo "folder: $(du -sh dist/docs | cut -f1) ($(du -sh dist/docs/_/shots dist/docs/_/clips | cut -f1 | paste -sd+ -) of it pictures and clips)"
  echo
  echo "# link check of the built folder (site/scripts/linkcheck.ts)"
  npx tsx site/scripts/linkcheck.ts dist/docs | grep -v "^  https://github.com/Narcis13/edgy/blob/"
  echo "  (and $(npx tsx site/scripts/linkcheck.ts dist/docs | grep -c '^  https://github.com/Narcis13/edgy/blob/') links to source files on GitHub)"
  echo
  echo "# weight (site/scripts/weight.mjs)"
  node site/scripts/weight.mjs dist/docs
} > "$OUT/build.txt" 2>&1
cat "$OUT/build.txt" | head -5

# ── the static folder, alone: no edgy server on the usual ports ──
bash .claude/goal-loop/serve.sh stop $APP >/dev/null
for p in 8787 $APP 8793; do
  if curl -sf --max-time 2 -o /dev/null "http://127.0.0.1:$p/api/health"; then echo "an edgy server answers on $p; the static check needs none (8787 is yours: stop it first)"; exit 1; fi
done
node site/scripts/serve.mjs dist/docs $STATIC /edgy-docs/ > "$TMPDIR/static-server.log" 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
sleep 1
{
  echo "# every page under http://127.0.0.1:$STATIC/edgy-docs/ (site/scripts/serve.mjs: a plain static server), no edgy server running"
  echo "# crawl: desktop 1440x900, tablet 820x1180, phone 390x844; light and dark; axe on desktop and phone; every live example started"
  node site/scripts/crawl.mjs "http://127.0.0.1:$STATIC/edgy-docs/" "$TMPDIR/docs-crawl" --axe --live --shots
  echo "# live examples run: $(node -e "const r=require(process.argv[1]);let e=0,n=0;for(const x of r)if(x.live){e+=x.live.examples;n+=x.live.running}console.log(n+' of '+e)" "$TMPDIR/docs-crawl/report.json")"
} > "$OUT/static.txt" 2>&1
tail -2 "$OUT/static.txt"
node docs/showcase/docs-site/evidence.mjs static "http://127.0.0.1:$STATIC/edgy-docs/" "$OUT"
kill $SERVER 2>/dev/null

# ── the app serves the docs ──
bash .claude/goal-loop/serve.sh fresh $APP "$TMPDIR/docs-app-data" | tail -1
export CDP_COOKIE="$(bash .claude/goal-loop/serve.sh session $APP)"
export DOC_ID="$(curl -s -XPOST http://127.0.0.1:$APP/api/docs -H "cookie: $CDP_COOKIE" -H 'content-type: application/json' -d '{"template":"quote"}' | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).id))")"
node docs/showcase/docs-site/evidence.mjs app "http://127.0.0.1:$APP/" "$OUT"

# ── the look: the app's home and the docs' home, light and dark ──
for theme in light dark; do
  dark=""; [ $theme = dark ] && dark="--dark"
  node goal-loop/scripts/cdp.mjs shot "http://127.0.0.1:$APP/" "$TMPDIR/look-app-$theme.png" --size 1440x900 $dark >/dev/null
  CDP_COOKIE=none node goal-loop/scripts/cdp.mjs shot "http://127.0.0.1:$APP/docs/" "$TMPDIR/look-docs-$theme.png" --size 1440x900 $dark >/dev/null
  ffmpeg -loglevel error -y -i "$TMPDIR/look-app-$theme.png" -i "$TMPDIR/look-docs-$theme.png" -filter_complex "[0:v]scale=960:-2[a];[1:v]scale=960:-2[b];[a][b]hstack=inputs=2" "$OUT/look-$theme.png"
done
bash .claude/goal-loop/serve.sh stop $APP >/dev/null

if [[ " $* " == *" --tutorials "* ]]; then bash docs/showcase/docs-site/tutorials/replay.sh; fi
echo "evidence written to $OUT"
