// Fill a running edgy with many documents, to see how the library holds up.
//
//   node scripts/seed-library.mjs http://127.0.0.1:8791 300
//
// Uses only POST /api/docs and the ops endpoint, so it works against any version of
// the server. Every tenth document is a template; the rest are short notes, each with
// a word of its own ("seedword17") in a cell, so search can be checked by hand.
const [base = 'http://127.0.0.1:8791', count = '300'] = process.argv.slice(2);
const n = Number(count);
const TEMPLATES = ['quote', 'savings', 'feedback', 'showcase', 'tables', 'elements', 'events'];
const TOPICS = ['Budget', 'Roadmap', 'Hiring plan', 'Sprint notes', 'Launch checklist', 'Vendor review', 'Trip', 'Recipe costs',
  'Reading list', 'Garden plan', 'Invoice', 'Retro', 'Onboarding', 'Workshop', 'Survey', 'Inventory', 'Moving house', 'Wedding'];
const PLACES = ['Lisbon', 'Cluj', 'Oslo', 'Porto', 'Kyoto', 'Austin', 'Ghent', 'Turin', 'Bergen', 'Leeds', 'Lyon', 'Graz'];

async function post(path, body) {
  const res = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

const actor = { kind: 'agent', name: 'Seed' };
const started = Date.now();
for (let i = 0; i < n; i++) {
  const title = `${TOPICS[i % TOPICS.length]} ${PLACES[Math.floor(i / TOPICS.length) % PLACES.length]} ${i + 1}`;
  if (i % 10 === 9) {
    await post('/api/docs', { title, template: TEMPLATES[(i / 10 | 0) % TEMPLATES.length], actor });
    continue;
  }
  await post('/api/docs', {
    title, actor,
    root: ['col',
      ['text', { size: 'hug', style: { size: 26, weight: 700 } }, title],
      ['text', { size: 'hug' }, `Notes kept while planning. The word seedword${i + 1} appears only here.`],
      ['row', { size: 'hug' },
        ['input', { name: 'qty', type: 'number', value: (i % 7) + 1, label: 'Quantity' }],
        ['input', { name: 'price', type: 'number', value: 10 + (i % 13) * 5, label: 'Price' }],
        ['formula', { name: 'total', label: 'Total' }, ['*', '$qty', '$price']]],
      ['list', { type: 'check', label: 'To do' }, 'Ask around', { text: 'Write it down', done: i % 2 === 0 }, 'Decide']],
  });
}
console.log(`${n} documents in ${((Date.now() - started) / 1000).toFixed(1)} s at ${base}`);
