#!/usr/bin/env bash
# Regenerates the evidence in this folder from a fresh server with empty data:
#   TMPDIR=/tmp/ne docs/showcase/new-elements/shoot.sh
# Builds, starts edgy on port 8796, creates the "Order desk" template and a few
# small documents, drives the interactions that matter and saves the screenshots.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
S=goal-loop/scripts
P=.claude/goal-loop
export CDP_PANE=".desk, .home, .records"   # the app scrolls in these, not the page
OUT=docs/showcase/new-elements
WORK="${TMPDIR:-/tmp}/new-elements-shots"
PORT=8796
URL="http://127.0.0.1:$PORT"
mkdir -p "$WORK"
$P/serve.sh fresh $PORT "$WORK/data" >/dev/null

new() { curl -s -XPOST "$URL/api/docs" -H 'content-type: application/json' -d "$1" | node -pe 'JSON.parse(require("fs").readFileSync(0)).id'; }
shot() { node $S/cdp.mjs shot "$@" | grep -v '^OK' || true; }
crop() { sips -c "$3" "$4" --cropOffset "$5" "$6" "$1" --out "$2" >/dev/null; }   # in out h w y x
read_doc() { curl -s "$URL/api/docs/$1/read"; }

ID=$(new '{"template":"elements"}')
HAND=$(new '{"title":"Drawn by hand","root":["col",["text","# Drawn by hand"],["diagram",{"name":"d"}]]}')
TOUCH=$(new '{"title":"Drawn by touch","root":["col",["text","# Drawn by touch"],["diagram",{"name":"d"}]]}')
AGENT=$(new '{"title":"Refund flow"}')
LONG=$(new '{"title":"Many tabs","root":["col",["text","# Many tabs"],["tabs",{"name":"view","value":"History"},["panel",{"title":"Overview"},"The overview."],["panel",{"title":"Details and specifications"},"Details."],["panel",{"title":"Notes"},"Notes."],["panel",{"title":"History"},"What happened before."],["panel",{"title":"Attachments"},"Files."]]]}')
echo "documents: order desk $ID, by hand $HAND, by touch $TOUCH, agent $AGENT"

# Helpers the page scripts share.
H='const sleep=(ms)=>new Promise(r=>setTimeout(r,ms)); const btn=(t)=>[...document.querySelectorAll("button")].find(b=>b.textContent.trim()===t); const tab=(t)=>[...document.querySelectorAll("[role=tab]")].find(b=>b.textContent.trim()===t); const sel=(id)=>window.edgy.select(id); const named=(n)=>{const f=(c)=>c.name===n?c:(c.children||[]).map(f).find(Boolean); return f(window.edgy.state.doc.root);};'

# ── the whole document ──
shot "$URL/d/$ID?view=live" "$WORK/desktop.png" --size 1440x900 --full --wait 3000
crop "$WORK/desktop.png" "$OUT/desktop.png" 1620 820 90 310
shot "$URL/d/$ID?view=live" "$WORK/desktop-dark.png" --size 1440x900 --full --dark --wait 3000
crop "$WORK/desktop-dark.png" "$OUT/desktop-dark.png" 1620 820 90 310
shot "$URL/d/$ID?view=live" "$OUT/tablet.png" --size 820x1180 --wait 3000
shot "$URL/d/$ID?view=live" "$OUT/phone.png" --size 390x844 --mobile --wait 3000

# ── data cells: chips while designing, nothing at all for readers ──
shot "$URL/d/$ID?view=edit" "$WORK/edit.png" --size 1440x900 --wait 3000
crop "$WORK/edit.png" "$OUT/data-chip.png" 420 820 90 310
for v in live page; do
  shot "$URL/d/$ID?view=$v" "$WORK/count-$v.png" --size 1440x900 --wait 3000 \
    --js "'$v: data cells drawn: ' + document.querySelectorAll('.kind-data, .kdata-chip').length + ', first cell on the sheet: ' + (document.querySelector('.sheet .cell.leaf, .page-flow .cell.leaf')?.textContent.slice(0, 30))"
done

# ── tabs: a button opens one (and hides itself), the arrow keys move along, the phone bar scrolls ──
shot "$URL/d/$ID?view=live" "$WORK/tabs.png" --size 1440x1100 --wait 3000 \
  --js "$H (async()=>{btn('See the orders').click(); await sleep(600); return [document.querySelector('[role=tab][aria-selected=true]').textContent, !!btn('See the orders'), !!btn('Take a phone order')]; })()" \
  --press "[role=tab][aria-selected=true]|ArrowRight" \
  --then "[document.querySelector('[role=tab][aria-selected=true]').textContent, document.activeElement.textContent]"
read_doc "$ID" | node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); "view is now " + JSON.stringify(d.values.view)'
shot "$URL/d/$ID?view=live" "$WORK/tabs-orders.png" --size 1440x1100 --wait 3000 --js "$H (async()=>{tab('Orders').click(); await sleep(600); return 'ok'; })()"
crop "$WORK/tabs-orders.png" "$OUT/tabs.png" 900 820 90 310
shot "$URL/d/$LONG?view=live" "$OUT/tabs-phone.png" --size 390x844 --mobile --wait 3000 \
  --js "(()=>{const b=document.querySelector('.ktabs-bar'); return {bar: [b.scrollWidth, b.clientWidth, 'scrolled to', b.scrollLeft], page: [document.documentElement.scrollWidth, innerWidth], open: document.querySelector('[role=tab][aria-selected=true]').textContent}; })()"

# ── the wizard: Next and Back run on the step data cell ──
W="$H const step=()=>named('step').value; const shotOf=()=>document.querySelector('.ktabs-panel').innerText.split('\\n').slice(0,4).join(' / ');"
shot "$URL/d/$ID?view=live" "$WORK/wizard-1.png" --size 1440x1000 --wait 3000 --js "$W (async()=>{tab('Phone order').click(); await sleep(600); document.querySelector('.ktabs-bar').scrollIntoView(); return [step(), shotOf()]; })()"
shot "$URL/d/$ID?view=live" "$WORK/wizard-2.png" --size 1440x1000 --wait 3000 --js "$W (async()=>{btn('Next').click(); await sleep(600); document.querySelector('.ktabs-bar').scrollIntoView(); return [step(), shotOf()]; })()"
shot "$URL/d/$ID?view=live" "$WORK/wizard-3.png" --size 1440x1000 --wait 3000 --js "$W (async()=>{btn('Next').click(); await sleep(600); document.querySelector('.ktabs-bar').scrollIntoView(); return [step(), shotOf()]; })()"
shot "$URL/d/$ID?view=live" "$WORK/wizard-4.png" --size 1440x1000 --wait 3000 --js "$W (async()=>{btn('Back').click(); await sleep(600); document.querySelector('.ktabs-bar').scrollIntoView(); return [step(), shotOf()]; })()"
for i in 1 2 3 4; do crop "$WORK/wizard-$i.png" "$WORK/wizard-$i-c.png" 520 820 0 310; done
swift $S/montage.swift "$OUT/wizard.png" 0.6 "$WORK/wizard-1-c.png" "$WORK/wizard-2-c.png" "$WORK/wizard-3-c.png" "$WORK/wizard-4-c.png"
read_doc "$ID" | node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); "outline: " + d.outline.split("\n").filter(l=>/data step/.test(l)).join("")'

# ── accordion one at a time; the collapsible by keyboard, kept after a reload ──
shot "$URL/d/$ID?view=live" "$WORK/accordion.png" --size 1440x1400 --wait 3000 \
  --js "$H (async()=>{const a=document.querySelector('.kind-accordion'); a.scrollIntoView(); btn('Returns').click(); await sleep(700); a.scrollIntoView(); return [...a.querySelectorAll('.kfold-btn')].map(b=>b.textContent+'='+b.getAttribute('aria-expanded')).join(' '); })()"
crop "$WORK/accordion.png" "$OUT/accordion.png" 760 820 0 310
shot "$URL/d/$ID?view=live" "$WORK/fold.png" --size 1440x1400 --wait 3000 \
  --js "document.querySelector('.kind-collapsible .kfold-btn').getAttribute('aria-expanded')" \
  --press ".kind-collapsible .kfold-btn|Enter" \
  --then "(()=>{const c=document.querySelector('.kind-collapsible'); c.scrollIntoView({block:'end'}); return 'after Enter: ' + c.querySelector('.kfold-btn').getAttribute('aria-expanded'); })()"
shot "$URL/d/$ID?view=live" "$WORK/fold-reload.png" --size 1440x1400 --wait 3000 \
  --js "(()=>{const c=document.querySelector('.kind-collapsible'); c.scrollIntoView({block:'end'}); return 'after reload: ' + c.querySelector('.kfold-btn').getAttribute('aria-expanded'); })()" \
  --press ".kind-collapsible .kfold-btn|Space" \
  --then "'after Space: ' + document.querySelector('.kind-collapsible .kfold-btn').getAttribute('aria-expanded')"
crop "$WORK/fold-reload.png" "$OUT/collapsible.png" 700 820 700 310

# ── designing containers on the page: a tab's menu ──
shot "$URL/d/$ID?view=edit" "$WORK/containers-edit.png" --size 1440x900 --wait 3000 \
  --js "$H (async()=>{document.querySelector('.ktabs-bar').scrollIntoView(); document.querySelector('.desk').scrollTop -= 120; await sleep(300); document.querySelector('.ktab.is-active .kpanel-more').click(); await sleep(400); return [...document.querySelectorAll('.kpanel-list button')].map(b=>b.textContent).join(', '); })()"
crop "$WORK/containers-edit.png" "$OUT/containers-edit.png" 640 820 90 310

# ── the / menu and the designers ──
shot "$URL/d/$HAND?view=edit" "$WORK/menu.png" --size 1440x1100 --wait 3000 \
  --js "$H (async()=>{const t=document.querySelector('.sheet .leaf.kind-text'); sel(t.dataset.cell); await sleep(300); window.edgy.openMenu(t.dataset.cell); await sleep(500); const box=document.querySelector('.popover'); const list=[...box.querySelectorAll('*')].find(e=>e.scrollHeight>e.clientHeight+4); if (list) list.scrollTop=list.scrollHeight; await sleep(300); return [...box.querySelectorAll('button')].map(b=>b.textContent.trim()).filter(Boolean).slice(-12).join(' | '); })()"
crop "$WORK/menu.png" "$OUT/menu.png" 1010 820 90 310
for name in view faq about step flow; do
  shot "$URL/d/$ID?view=edit" "$WORK/panel-$name.png" --size 1440x1300 --wait 3000 --js "$H (async()=>{sel(named('$name').id); await sleep(800); return 'ok'; })()"
  crop "$WORK/panel-$name.png" "$WORK/panel-$name-c.png" 1100 330 90 1110
done
swift $S/montage.swift "$OUT/panels.png" 0.8 "$WORK/panel-view-c.png" "$WORK/panel-faq-c.png" "$WORK/panel-about-c.png" "$WORK/panel-step-c.png" "$WORK/panel-flow-c.png"

# ── the diagram by hand (mouse) and by touch at phone size ──
DRAW="$(cat "$OUT/draw.js")"
shot "$URL/d/$HAND?view=edit" "$WORK/diagram-hand.png" --size 1440x900 --wait 3000 --js "const POINTER='mouse'; $DRAW"
crop "$WORK/diagram-hand.png" "$OUT/diagram-hand.png" 700 820 90 310
shot "$URL/d/$HAND?view=live" "$WORK/diagram-reload.png" --size 1440x900 --wait 3000 --js "document.querySelector('.kind-diagram svg').getAttribute('aria-label')"
shot "$URL/d/$TOUCH?view=edit" "$OUT/diagram-touch.png" --size 390x844 --mobile --wait 3000 --js "const POINTER='touch'; $DRAW"
shot "$URL/d/$ID?view=live" "$WORK/diagram-dark.png" --size 1440x1100 --dark --wait 3000 --js "$H (async()=>{tab('Flow').click(); await sleep(600); document.querySelector('.kind-diagram').scrollIntoView(); return 'ok'; })()"
crop "$WORK/diagram-dark.png" "$OUT/diagram-dark.png" 820 820 140 310

# ── the diagram as data: one ops POST, then a live label and a formula ──
curl -s -XPOST "$URL/api/docs/$AGENT/ops" -H 'content-type: application/json' -d @"$OUT/flowchart-ops.json" >/dev/null
read_doc "$AGENT" | node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); "shapes counted by a formula: " + d.values.shapes + "; " + d.outline.split("\n").find(l=>/diagram/.test(l))'
curl -s -XPOST "$URL/api/docs/$AGENT/ops" -H 'content-type: application/json' -d '{"actor":{"kind":"agent","name":"Claude"},"ops":[["set","total","value",2450.5]]}' >/dev/null
shot "$URL/d/$AGENT?view=live" "$WORK/diagram-data.png" --size 1440x1100 --wait 3000 --js "[...document.querySelectorAll('.kind-diagram svg text')].map(t=>t.textContent).join(' ').match(/Refund.*?far/)?.[0]"
crop "$WORK/diagram-data.png" "$OUT/diagram-data.png" 1000 820 90 310

# ── the minimap on the home page ──
shot "$URL/" "$WORK/home.png" --size 1440x900 --wait 3000
crop "$WORK/home.png" "$OUT/minimap.png" 280 290 200 445

# ── events: the one place cells raise them ──
shot "$URL/d/$ID?view=live" "$WORK/events.png" --size 1440x900 --wait 3000 \
  --js "$H (async()=>{tab('Flow').click(); await sleep(500); const s=document.querySelector('.kind-diagram svg'); const e=named('flow').value[0]; const m=s.getScreenCTM(); s.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:m.a*(e.x+e.w/2)+m.e,clientY:m.d*(e.y+e.h/2)+m.f})); tab('Orders').click(); await sleep(300); btn('Returns').click(); await sleep(300); document.querySelector('.kind-collapsible .kfold-btn').click(); await sleep(300); await sleep(300); return window.edgy.raised.map(e=>e.name+':'+JSON.stringify(e.data).slice(0,40)).join(' | '); })()"

# ── paper ──
node $S/cdp.mjs pdf "$URL/d/$ID?view=page" "$OUT/new-elements.pdf" --wait 3500 | grep -v '^OK' || true
swift $S/pdfpng.swift "$OUT/new-elements.pdf" "$OUT/printed.png"
