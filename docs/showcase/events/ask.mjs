// node ask.mjs <base> <doc-id>: ask the offline composer for one sentence of each family of events,
// print what it proposes, apply it as an agent would, and show the outline lines it changed.
const [base, id] = process.argv.slice(2);
const asks = [
  ['lifecycle', 'When the document opens, add 1 to visits.', undefined],
  ['value change', 'When agree changes, set status to the new value', 'agree'],
  ['value change', 'When every box is ticked, save the checklist to done and show the thank-you note.', 'checklist'],
  ['pointer', 'When this is clicked, add 1 to clicks', 'hello'],
  ['pointer', 'on double click reset count', 'hello'],
  ['value change', 'When a row is picked, set chosen to its name', 'people'],
  ['time', 'After 5 seconds show the welcome note', undefined],
  ['fetch', 'Every minute fetch the rate and warn when it is above 5.', 'rate'],
  ['fetch', 'When the rate fails to load, show the error note', 'rate'],
  ['custom event', 'When the button is pressed, send saved with the total. When saved happens, add 1 to saves.', 'save'],
  ['custom action', 'Make an action called reset that sets qty to 0 and clears note. When this is clicked, call reset.', 'save'],
];
const post = async (path, body) => {
  const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { ok: r.ok, json: await r.json() };
};
let n = 0;
for (const [family, prompt, cell] of asks) {
  const r = await post(`/api/docs/${id}/compose`, { prompt, target: 'events', provider: 'local', ...(cell ? { cell } : {}) });
  console.log(`\n${++n}. [${family}] "${prompt}"${cell ? ` (asked on ${cell})` : ' (asked on the document)'}`);
  if (!r.ok) { console.log('   ✗ ' + r.json.error); continue; }
  console.log(`   ${r.json.provider} · ${r.json.explanation}`);
  for (const c of r.json.changes) console.log(`   ${c.label}: ${c.code.replace(/\n\s*/g, ' ')}`);
  const applied = await post(`/api/docs/${id}/ops`, { actor: { kind: 'agent', name: 'Ask AI check' }, ops: r.json.ops });
  console.log(applied.ok ? `   applied: ${r.json.ops.length} op(s), errors after: ${JSON.stringify(applied.json.errors)}` : `   ✗ did not apply: ${applied.json.error}`);
}
const read = await (await fetch(`${base}/api/docs/${id}/read`)).json();
console.log('\nThe outline afterwards (handlers, actions and new cells):');
console.log(read.outline.split('\n').filter((l) => / on |^document |^action |timer|fetch/.test(l)).join('\n'));
