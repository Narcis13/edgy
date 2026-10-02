#!/usr/bin/env bash
# Regenerates the evidence in this folder from a fresh server with empty data:
#   TMPDIR=/tmp/eg docs/showcase/data-tables/shoot.sh
# Builds, starts edgy on port 8795, creates the "Studio billing" template and two
# small documents, drives the interactions that matter and saves the screenshots.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
S=goal-loop/scripts
P=.claude/goal-loop
export CDP_PANE=".desk, .home, .records"   # the app scrolls in these, not the page
OUT=docs/showcase/data-tables
WORK="${TMPDIR:-/tmp}/data-tables-shots"
PORT=8795
URL="http://127.0.0.1:$PORT"
mkdir -p "$WORK"
$P/serve.sh fresh $PORT "$WORK/data" >/dev/null

new() { curl -s -XPOST "$URL/api/docs" -H 'content-type: application/json' -d "$1" | node -pe 'JSON.parse(require("fs").readFileSync(0)).id'; }
shot() { node $S/cdp.mjs shot "$@" | grep -v '^OK' || true; }
crop() { sips -c "$3" "$4" --cropOffset "$5" "$6" "$1" --out "$2" >/dev/null; }   # in out h w y x

ID=$(new '{"template":"tables"}')
TYPO=$(new "$(cat "$OUT/typography.json")")
LOOKS=$(new "$(cat "$OUT/looks.json")")
echo "documents: tables $ID, typography $TYPO, looks $LOOKS"

# Helpers the page scripts share.
H='const sleep=(ms)=>new Promise(r=>setTimeout(r,ms)); const rowOf=(t,txt)=>[...t.querySelectorAll("tbody tr")].find(r=>r.textContent.includes(txt)); const tbl=(n)=>document.querySelectorAll(".ktable")[n];'

# The whole document, used on a desk.
shot "$URL/d/$ID?view=live" "$WORK/desktop.png" --size 1440x900 --full --wait 3000
crop "$WORK/desktop.png" "$OUT/desktop.png" 2400 820 0 310

# Picking rows feeds the stat and the summary.
shot "$URL/d/$ID?view=live" "$WORK/select.png" --size 1440x1400 --js "$H (async()=>{const t=tbl(0); for (const r of [...t.querySelectorAll('tbody tr')].filter(r=>/Kite Bikes|Orbit/.test(r.textContent))) { r.click(); await sleep(250); } await sleep(400); return document.querySelector('.kstat-label')?.parentElement?.parentElement?.textContent; })()" --wait 1500
crop "$WORK/select.png" "$OUT/select.png" 1400 820 0 310

# Folding groups.
shot "$URL/d/$ID?view=live" "$WORK/groups.png" --size 1440x1100 --js "$H (async()=>{const t=tbl(0); t.scrollIntoView(); for (const g of ['Paid','Sent']) { [...t.querySelectorAll('.ktable-ghead button')].find(b=>b.textContent.includes(g))?.click(); await sleep(250); } t.scrollIntoView(); return 'folded'; })()" --wait 1500
crop "$WORK/groups.png" "$OUT/groups.png" 1000 820 90 310

# Row buttons: settle one, draft a reminder from another, and ask before deleting a third.
shot "$URL/d/$ID?view=live" "$WORK/actions.png" --size 1440x1300 --js "$H (async()=>{const t=tbl(0); const btn=(r,re)=>[...r.querySelectorAll('.ktable-acts button')].find(b=>re.test(b.getAttribute('aria-label')||b.textContent)); btn(rowOf(t,'Annual report'),/^Paid/).click(); await sleep(900); btn(rowOf(t,'Menu boards'),/Email/).click(); await sleep(400); btn(rowOf(t,'Website copy'),/Delete/).click(); await sleep(300); t.scrollIntoView(); return 'ok'; })()" --wait 2000
crop "$WORK/actions.png" "$OUT/actions.png" 1300 820 0 310
curl -s "$URL/api/data/studio-invoices" | node -pe 'const r=JSON.parse(require("fs").readFileSync(0)).find(r=>r.project==="Annual report"); "Annual report is now " + r.status'

# Projects: progress, checks, stars, links, totals and colour; typed rows edited in place.
shot "$URL/d/$ID?view=edit" "$WORK/typed.png" --size 1440x1100 --js "$H (async()=>{const t=tbl(1); t.scrollIntoView(); await sleep(300); const td=rowOf(t,'Menu boards').querySelectorAll('td')[1]; td.dispatchEvent(new MouseEvent('dblclick',{bubbles:true})); await sleep(300); const i=t.querySelector('.ktable-input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'0.45'); i.dispatchEvent(new Event('input',{bubbles:true})); i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); await sleep(500); const td2=rowOf(t,'Patient app').querySelectorAll('td')[5]; td2.dispatchEvent(new MouseEvent('dblclick',{bubbles:true})); await sleep(300); t.scrollIntoView(); return window.edgy.state.doc && JSON.stringify(window.edgy.cell(t.closest('[data-cell]').dataset.cell).value.find(r=>r.project==='Menu boards')); })()" --wait 1500
crop "$WORK/typed.png" "$OUT/typed.png" 1000 820 90 310

# Resizing a column by dragging its header edge (saved in the document).
shot "$URL/d/$ID?view=edit" "$WORK/resize.png" --size 1440x1000 --js "$H (async()=>{const t=tbl(0); t.scrollIntoView(); await sleep(300); const h=t.querySelector('.ktable-resize'); const b=h.getBoundingClientRect(); const o={bubbles:true,pointerId:7,isPrimary:true,button:0,clientY:b.top+5}; h.dispatchEvent(new PointerEvent('pointerdown',{...o,clientX:b.left+3})); for (let x=0;x<=90;x+=15) { h.dispatchEvent(new PointerEvent('pointermove',{...o,clientX:b.left+3+x})); await sleep(30); } h.dispatchEvent(new PointerEvent('pointerup',{...o,clientX:b.left+93})); await sleep(500); window.edgy.select(t.closest('[data-cell]').dataset.cell); await sleep(400); t.scrollIntoView(); return JSON.stringify(window.edgy.cell(t.closest('[data-cell]').dataset.cell).columns[0]); })()" --wait 1500
crop "$WORK/resize.png" "$OUT/resize.png" 900 1440 90 0

# The table designer, the text designer, and the panel on a phone in dark mode.
shot "$URL/d/$ID?view=edit" "$WORK/panel-table.png" --size 1440x2400 --js "window.edgy.select(document.querySelector('.ktable').closest('[data-cell]').dataset.cell); 'ok'" --wait 2000
crop "$WORK/panel-table.png" "$WORK/panel-table-a.png" 1200 330 0 1110
crop "$WORK/panel-table.png" "$WORK/panel-table-b.png" 1200 330 1200 1110
swift $S/montage.swift "$OUT/panel-table.png" 1 "$WORK/panel-table-a.png" "$WORK/panel-table-b.png"
shot "$URL/d/$ID?view=edit" "$WORK/panel-text.png" --size 1440x2000 --js "window.edgy.select([...document.querySelectorAll('.leaf.kind-text')][1].dataset.cell); 'ok'" --wait 2000
crop "$WORK/panel-text.png" "$OUT/panel-text.png" 2000 330 0 1110
shot "$URL/d/$ID?view=edit" "$OUT/panel-phone.png" --size 390x844 --mobile --dark --js "$H (async()=>{window.edgy.select(document.querySelector('.ktable').closest('[data-cell]').dataset.cell); await sleep(300); document.querySelector('button[aria-label=More]').click(); await sleep(200); [...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Cell details').click(); return 'ok'; })()" --wait 2000

# A designer for each kind: canvas, list, calendar, chart, stat and button panels side by side.
kinds=()
for k in canvas list calendar chart stat button; do
  shot "$URL/d/$TYPO?view=edit" "$WORK/k-$k.png" --size 1440x1500 --js "window.edgy.select(document.querySelector('.leaf.kind-$k').dataset.cell); 'ok'" --wait 1800
  crop "$WORK/k-$k.png" "$WORK/kc-$k.png" 1500 330 0 1110
  kinds+=("$WORK/kc-$k.png")
done
swift $S/montage.swift "$OUT/panel-kinds.png" 0.8 "${kinds[@]}"

# Typography and the kinds' own options, and the table looks.
shot "$URL/d/$TYPO?view=live" "$WORK/typography.png" --size 1440x900 --full --wait 2500
crop "$WORK/typography.png" "$OUT/typography.png" 1700 820 0 310
shot "$URL/d/$LOOKS?view=live" "$WORK/looks.png" --size 1440x900 --full --wait 2500
crop "$WORK/looks.png" "$OUT/looks.png" 950 820 0 310
shot "$URL/d/$LOOKS?view=live" "$OUT/looks-dark.png" --size 1440x1200 --dark --wait 2500

# Phone, tablet and dark.
shot "$URL/d/$ID?view=live" "$OUT/phone.png" --size 390x844 --mobile --js "document.querySelector('.ktable').scrollIntoView(); 'ok'" --wait 2000
shot "$URL/d/$ID?view=live" "$OUT/tablet.png" --size 820x1180 --wait 2500
shot "$URL/d/$ID?view=live" "$OUT/desktop-dark.png" --size 1440x1100 --dark --js "document.querySelectorAll('.ktable')[1].scrollIntoView(); 'ok'" --wait 2500

# Paper.
node $S/cdp.mjs pdf "$URL/d/$ID?view=page" "$OUT/data-tables.pdf" | grep -v '^OK' || true
swift $S/pdfpng.swift "$OUT/data-tables.pdf" "$OUT/printed.png"

$P/serve.sh stop $PORT >/dev/null
echo "evidence in $OUT"
