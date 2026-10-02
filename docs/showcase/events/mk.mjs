// node mk.mjs <base> <doc.json> [ops.json…]: create a document, apply extra ops as an agent, print its id.
import { readFileSync } from 'node:fs';
const [base, file, ...more] = process.argv.slice(2);
const body = JSON.parse(readFileSync(file, 'utf8'));
const r = await fetch(`${base}/api/docs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: body.title, root: body.root }) });
const doc = await r.json();
if (!r.ok) { console.error(doc); process.exit(1); }
const ops = [...(body.ops ?? []), ...more.flatMap((f) => JSON.parse(readFileSync(f, 'utf8')))];
if (ops.length) {
  const o = await fetch(`${base}/api/docs/${doc.id}/ops`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ actor: { kind: 'agent', name: 'Setup' }, ops }) });
  if (!o.ok) { console.error(await o.text()); process.exit(1); }
}
console.log(doc.id);
