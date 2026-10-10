// The accounts showcase: three people on one edgy, working together.
//
//   node docs/showcase/accounts/seed.mjs http://127.0.0.1:8792
//
// Ana Pop owns "Team offsite" and gives Ben Ortiz edit access; she gives Cleo Diaz
// view access to her "Quote". Each keeps records in a collection called "quotes":
// two collections, never mixed. Ana and Ben both edit the offsite, and Claude
// (an agent with Ana's API key) adds a line, so the history names all three.
// Prints shell assignments for shoot.sh (ids, and the sessions of this test server).
// The password is a test value for this local server only.
const base = process.argv[2] ?? 'http://127.0.0.1:8792';
const PASSWORD = 'correct horse';

async function call(who, method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(who?.cookie ? { cookie: who.cookie } : {}), ...(who?.key ? { authorization: `Bearer ${who.key}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text}`);
  return { json: JSON.parse(text), cookie: res.headers.get('set-cookie')?.split(';')[0] };
}

async function person(email, name) {
  const r = await call(null, 'POST', '/api/auth/signup', { email, password: PASSWORD, name });
  return { id: r.json.user.id, name, email, cookie: r.cookie };
}

const ana = await person('ana@example.test', 'Ana Pop');
const ben = await person('ben@example.test', 'Ben Ortiz');
const cleo = await person('cleo@example.test', 'Cleo Diaz');

// Ana's documents.
const offsite = (await call(ana, 'POST', '/api/docs', { template: 'showcase' })).json.id;
await call(ana, 'PATCH', `/api/docs/${offsite}`, { description: 'Three days in Lisbon for the whole team. Ben runs the budget with me.' });
const quote = (await call(ana, 'POST', '/api/docs', { template: 'quote' })).json.id;
await call(ana, 'PATCH', `/api/docs/${quote}`, { description: 'For Northwind. Cleo checks it before it goes out.' });
await call(ana, 'PATCH', `/api/docs/${offsite}`, { pinned: true });

// Who else may open them.
await call(ana, 'POST', `/api/docs/${offsite}/people`, { email: ben.email, role: 'editor' });
await call(ana, 'POST', `/api/docs/${quote}/people`, { email: cleo.email, role: 'viewer' });

// Two collections called "quotes": Ana's and Ben's.
for (const r of [{ client: 'Northwind', total: 6404.58 }, { client: 'Harbour Lights', total: 2380 }]) await call(ana, 'POST', '/api/data/quotes', { record: r });
await call(ben, 'POST', '/api/data/quotes', { record: { client: 'Ben’s own client', total: 990 } });
const bens = (await call(ben, 'POST', '/api/docs', {
  title: 'Ben’s quotes',
  root: ['col', ['text', '# My quotes'], ['formula', { name: 'count', format: 'number' }, ['len', ['rows', 'quotes']]],
    ['text', 'This counts the records in **my** "quotes" collection. Ana’s collection with the same name is hers.']],
})).json.id;

// Both edit the offsite: each name is on its change.
await call(ana, 'POST', `/api/docs/${offsite}/ops`, { ops: [['set', 'budget', 'value', 15000]] });
await call(ben, 'POST', `/api/docs/${offsite}/ops`, { ops: [['set', 'people', 'value', 16]] });

// Claude, with an API key Ana made, adds to her offsite: "Claude for Ana Pop" in the history.
const key = (await call(ana, 'POST', '/api/me/keys', { name: 'Claude on Ana’s laptop' })).json.key;
await call({ key }, 'POST', `/api/docs/${offsite}/ops`, { actor: { kind: 'agent', name: 'Claude' }, ops: [['meta', 'description', 'Three days in Lisbon for the whole team. Ben runs the budget with me. Claude keeps the list tidy.']] });

console.log([
  `OFFSITE=${offsite}`, `QUOTE=${quote}`, `BENS=${bens}`,
  `ANA_ID=${ana.id}`, `BEN_ID=${ben.id}`, `CLEO_ID=${cleo.id}`,
  `ANA=${ana.cookie}`, `BEN=${ben.cookie}`, `CLEO=${cleo.cookie}`,
].join('\n'));
