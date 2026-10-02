import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from './app';
import { SCHEMA, Store } from './store';
import { allows, grantFor } from './access';

function api(store = new Store(':memory:')) {
  const { app, hub } = createApp(store, join(mkdtempSync(join(tmpdir(), 'edgy-')), 'assets'));
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await app.request(path, {
      method,
      headers: { ...headers, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json()) as any };
  };
  return { call, hub, store };
}

const make = async (call: ReturnType<typeof api>['call'], title: string, root?: unknown) =>
  (await call('POST', '/api/docs', { title, ...(root ? { root } : {}) })).json.id as string;
const ids = (lib: any, part: 'pinned' | 'rest' = 'rest') => lib[part].map((e: any) => e.id);

test('the list carries summaries and shapes, never whole documents', async () => {
  const { call } = api();
  const id = await make(call, 'Secret plans', ['col', ['text', 'The password is swordfish']]);
  const list = (await call('GET', '/api/docs')).json;
  const mine = list.find((d: any) => d.id === id);
  assert.equal(mine.title, 'Secret plans');
  assert.ok(mine.shape && !('root' in mine), 'a shape instead of the root');
  assert.ok(!JSON.stringify(list).includes('swordfish'), 'no content in the list');
});

test('search finds a word only in the title, only in the description, only in a cell; nothing found is empty', async () => {
  const { call } = api();
  const a = await make(call, 'Lighthouse budget');
  const b = await make(call, 'Notes');
  const c = await make(call, 'Other', ['col', ['text', 'The ferry leaves from pier nine']]);
  await call('PATCH', `/api/docs/${b}`, { description: 'Everything about the regatta' });
  const find = async (q: string) => (await call('GET', `/api/library?q=${encodeURIComponent(q)}`)).json;
  const one = async (q: string, id: string, field: string) => {
    const r = await find(q);
    assert.deepEqual(ids(r), [id], q);
    assert.equal(r.rest[0].match.field, field, q);
  };
  await one('lighthouse', a, 'title');
  await one('REGATTA', b, 'description');
  await one('ferry pier', c, 'text');
  assert.equal((await find('submarine')).total, 0);
  // Clearing the search lists everything again (the tour included).
  assert.equal((await find('')).total, 4);
});

test('a description is part of the document: an op in its history, readable inside it', async () => {
  const { call } = api();
  const id = await make(call, 'Garden');
  const r = await call('PATCH', `/api/docs/${id}`, { description: '  Beds, seeds and the watering rota ', actor: { kind: 'human', name: 'Ana' } });
  assert.equal(r.json.description, 'Beds, seeds and the watering rota');
  assert.equal((await call('GET', `/api/docs/${id}`)).json.meta.description, 'Beds, seeds and the watering rota');
  const log = (await call('GET', `/api/docs/${id}/log`)).json;
  assert.deepEqual(log.at(-1).ops, [['meta', 'description', 'Beds, seeds and the watering rota']]);
  assert.equal(log.at(-1).actor.name, 'Ana');
  // Set from inside the document, with an op, the library sees it too.
  await call('POST', `/api/docs/${id}/ops`, { ops: [['meta', 'description', 'Only seeds now']] });
  assert.equal((await call('GET', '/api/docs')).json.find((d: any) => d.id === id).description, 'Only seeds now');
  assert.equal((await call('PATCH', `/api/docs/${id}`, { description: 42 })).status, 400);
});

test('pinned documents keep their order across sorts; reordering and unpinning stick', async () => {
  const { call } = api();
  const [a, b, c] = [await make(call, 'Alpha'), await make(call, 'Beta'), await make(call, 'Gamma')];
  await call('PATCH', `/api/docs/${c}`, { pinned: true });
  await call('PATCH', `/api/docs/${a}`, { pinned: true });
  for (const sort of ['updated', 'created', 'title']) {
    assert.deepEqual(ids((await call('GET', `/api/library?sort=${sort}`)).json, 'pinned'), [c, a], sort);
  }
  assert.deepEqual((await call('POST', '/api/library/pins', { ids: [a, c] })).json.pins, [a, c]);
  assert.deepEqual(ids((await call('GET', '/api/library')).json, 'pinned'), [a, c]);
  await call('PATCH', `/api/docs/${a}`, { pinned: false });
  const lib = (await call('GET', '/api/library')).json;
  assert.deepEqual(ids(lib, 'pinned'), [c]);
  assert.ok(ids(lib).includes(a) && ids(lib).includes(b), 'unpinned goes back among the rest');
  // Pinning again goes to the end; pinning what is pinned keeps its place.
  await call('PATCH', `/api/docs/${a}`, { pinned: true });
  await call('PATCH', `/api/docs/${c}`, { pinned: true });
  assert.deepEqual(ids((await call('GET', '/api/library')).json, 'pinned'), [c, a]);
});

test('archive and restore leave content and history untouched; delete is for good', async () => {
  const { call } = api();
  const id = await make(call, 'Ledger', ['col', ['input', { name: 'n', type: 'number', value: 1 }]]);
  await call('POST', `/api/docs/${id}/ops`, { ops: [['set', 'n', 'value', 7]] });
  await call('PATCH', `/api/docs/${id}`, { pinned: true });
  const before = [(await call('GET', `/api/docs/${id}`)).json, (await call('GET', `/api/docs/${id}/log`)).json];
  await call('POST', '/api/library/bulk', { action: 'archive', ids: [id] });
  assert.ok(!ids((await call('GET', '/api/library')).json).includes(id), 'out of the default list');
  const archived = (await call('GET', '/api/library?filter=archived')).json;
  assert.deepEqual(ids(archived), [id]);
  assert.equal(archived.rest[0].pinned, null, 'archiving unpins');
  assert.equal((await call('PATCH', `/api/docs/${id}`, { pinned: true })).status, 409, 'an archived document can not be pinned');
  await call('POST', '/api/library/bulk', { action: 'restore', ids: [id] });
  assert.ok(ids((await call('GET', '/api/library')).json).includes(id));
  assert.deepEqual([(await call('GET', `/api/docs/${id}`)).json, (await call('GET', `/api/docs/${id}/log`)).json], before);

  const gone = await make(call, 'Scrap');
  const r = (await call('POST', '/api/library/bulk', { action: 'delete', ids: [gone, 'nope'] })).json;
  assert.deepEqual([r.done, r.skipped], [[gone], ['nope']]);
  assert.equal((await call('GET', `/api/docs/${gone}`)).status, 404);
});

test('a deck refers to its documents in order; reorder, take out, ungroup; deleting a document leaves the deck', async () => {
  const { call } = api();
  const [a, b, c] = [await make(call, 'One'), await make(call, 'Two'), await make(call, 'Three')];
  const deck = (await call('POST', '/api/decks', { title: 'Review', description: 'Quarterly', docs: [a, b, c] })).json;
  assert.match(deck.id, /^deck-/);
  assert.deepEqual(deck.docs, [a, b, c]);
  let lib = (await call('GET', '/api/library')).json;
  assert.ok(ids(lib).includes(deck.id) && !ids(lib).includes(a), 'its documents sit in its card');
  assert.equal(lib.rest.find((e: any) => e.id === deck.id).count, 3);
  assert.deepEqual((await call('PATCH', `/api/decks/${deck.id}`, { docs: [c, a, b] })).json.docs, [c, a, b]);
  assert.deepEqual((await call('GET', `/api/decks/${deck.id}`)).json.items.map((d: any) => d.title), ['Three', 'One', 'Two']);
  assert.equal((await call('PATCH', `/api/decks/${deck.id}`, { docs: [c, 'missing'] })).status, 400);
  // A document is in one deck at a time: grouping it again moves it.
  const other = (await call('POST', '/api/decks', { title: 'Other', docs: [b] })).json;
  assert.deepEqual((await call('GET', `/api/decks/${deck.id}`)).json.docs, [c, a]);
  await call('DELETE', `/api/docs/${a}`);
  assert.deepEqual((await call('GET', `/api/decks/${deck.id}`)).json.docs, [c]);
  await call('DELETE', `/api/decks/${deck.id}`);
  await call('POST', '/api/library/bulk', { action: 'delete', ids: [other.id] });
  lib = (await call('GET', '/api/library')).json;
  assert.ok(ids(lib).includes(b) && ids(lib).includes(c), 'ungrouping keeps every document');
  assert.equal((await call('GET', `/api/docs/${c}`)).status, 200);
});

test('share links: long random tokens; view reads only its document; edit changes it; off means no longer shared', async () => {
  const { call, hub } = api();
  const id = await make(call, 'Menu', ['col', ['input', { name: 'price', type: 'number', value: 4 }], ['formula', { name: 'n' }, ['len', ['rows', 'orders']]]]);
  const other = await make(call, 'Payroll');
  await call('POST', '/api/data/orders', { record: { item: 'tea' } });
  await call('POST', '/api/data/salaries', { record: { who: 'Ann', pay: 1 } });
  const view = (await call('POST', `/api/docs/${id}/shares`, { access: 'view' })).json;
  const edit = (await call('POST', `/api/docs/${id}/shares`, { access: 'edit' })).json;
  assert.match(view.token, /^[\w-]{43}$/);
  assert.notEqual(view.token, edit.token);
  assert.ok(view.url.endsWith(`/s/${view.token}`));
  assert.equal((await call('POST', `/api/docs/${id}/shares`, { access: 'view' })).json.token, view.token, 'one view link at a time');
  assert.equal((await call('GET', '/api/docs')).json.find((d: any) => d.id === id).shared.view, true);

  const as = (token: string) => ({ 'x-edgy-share': token });
  assert.deepEqual((await call('GET', '/api/shared', undefined, as(view.token))).json, { id, title: 'Menu', access: 'view' });
  assert.equal((await call('GET', `/api/docs/${id}`, undefined, as(view.token))).status, 200);
  assert.equal((await call('GET', `/api/docs/${id}/read`, undefined, as(view.token))).json.values.n, 1);
  assert.equal((await call('GET', '/api/data/orders', undefined, as(view.token))).status, 200, 'records it reads');
  for (const [method, path] of [['GET', `/api/docs/${other}`], ['GET', '/api/docs'], ['GET', '/api/library'], ['GET', '/api/data'], ['GET', '/api/data/salaries'],
    ['GET', `/api/docs/${id}/log`], ['GET', `/api/docs/${id}/messages`], ['DELETE', `/api/docs/${id}`], ['POST', `/api/docs/${id}/shares`], ['GET', '/api/guide']]) {
    assert.equal((await call(method, path, undefined, as(edit.token))).status, 403, `${method} ${path}`);
  }
  const ops = { ops: [['set', 'price', 'value', 9]], actor: { kind: 'agent', name: 'Mallory' } };
  const refused = await call('POST', `/api/docs/${id}/ops`, ops, as(view.token));
  assert.equal(refused.status, 403);
  assert.equal((await call('POST', '/api/data/orders', { record: { item: 'x' } }, as(view.token))).status, 403);
  assert.equal((await call('GET', `/api/docs/${id}/read`)).json.values.price, 4, 'a view link changes nothing');

  const seen: string[] = [];
  hub.subscribe(id, (e) => seen.push(e.type));
  const r = await call('POST', `/api/docs/${id}/ops`, ops, as(edit.token));
  assert.equal(r.status, 200);
  assert.equal((await call('GET', `/api/docs/${id}/read`)).json.values.price, 9);
  assert.equal((await call('GET', `/api/docs/${id}/log`)).json.at(-1).actor.kind, 'human', 'a guest is a person, whatever it claims');
  assert.ok(seen.includes('ops'), 'the owner hears the change');
  assert.equal((await call('POST', '/api/data/orders', { record: { item: 'scone' } }, as(edit.token))).status, 201);
  assert.equal((await call('POST', '/api/data/salaries', { record: { who: 'x' } }, as(edit.token))).status, 403, 'only collections it uses');

  await call('DELETE', `/api/shares/${view.token}`);
  assert.ok(seen.includes('unshared'));
  // The page the link opens asks what it opens, and is told; everything else is refused.
  const off = await call('GET', '/api/shared', undefined, as(view.token));
  assert.deepEqual([off.status, off.json.refused], [200, 'revoked']);
  const gone = await call('GET', `/api/docs/${id}`, undefined, as(view.token));
  assert.deepEqual([gone.status, gone.json.reason], [410, 'revoked']);
  assert.equal((await call('GET', `/api/docs/${id}`, undefined, as('x'.repeat(43)))).json.reason, 'unknown');
  assert.equal((await call('GET', '/api/shared', undefined, as('x'.repeat(43)))).json.refused, 'unknown');
  const again = (await call('POST', `/api/docs/${id}/shares`, { access: 'view' })).json;
  assert.notEqual(again.token, view.token, 'turning it on again makes a new link');
  assert.equal((await call('GET', `/api/docs/${id}`, undefined, as(view.token))).status, 410, 'the old one stays off');
});

test('the access rules on their own', () => {
  const store = new Store(':memory:');
  assert.deepEqual(grantFor(store, undefined), { level: 'owner' });
  const grant = { level: 'view' as const, doc: 'd1', token: 't' };
  const reads = () => ['orders'];
  assert.equal(allows(grant, 'GET', '/api/docs/d1', reads), true);
  assert.equal(allows(grant, 'GET', '/api/docs/d1/events', reads), true);
  assert.equal(allows(grant, 'GET', '/api/docs/d2', reads) === true, false);
  assert.equal(allows(grant, 'POST', '/api/docs/d1/ops', reads) === true, false);
  assert.equal(allows({ ...grant, level: 'edit' }, 'POST', '/api/docs/d1/ops', reads), true);
  assert.equal(allows({ ...grant, level: 'edit' }, 'PATCH', '/api/docs/d1', reads) === true, false, 'not the title or the library');
  assert.equal(allows(grant, 'GET', '/api/data/orders', reads), true);
  assert.equal(allows(grant, 'GET', '/api/data/other', reads) === true, false);
  assert.equal(allows({ level: 'owner' }, 'DELETE', '/api/docs/d1', reads), true);
});

/** The schema written by the code before this version (commit 40b398d), word for word. */
const V1 = `
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS docs (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL,
    v INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS ops (
    doc_id TEXT NOT NULL, v INTEGER NOT NULL, ts INTEGER NOT NULL, actor TEXT NOT NULL, ops TEXT NOT NULL,
    PRIMARY KEY (doc_id, v));
  CREATE TABLE IF NOT EXISTS records (
    id TEXT PRIMARY KEY, collection TEXT NOT NULL, data TEXT NOT NULL, ts INTEGER NOT NULL, source TEXT);
  CREATE INDEX IF NOT EXISTS records_by_collection ON records (collection, ts);
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT, doc_id TEXT NOT NULL, ts INTEGER NOT NULL,
    actor TEXT NOT NULL, text TEXT NOT NULL, cell TEXT);
  CREATE INDEX IF NOT EXISTS messages_by_doc ON messages (doc_id, id);
`;

test('a database from the previous version opens with every document, its history and its records', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'edgy-old-')), 'edgy.db');
  const old = new DatabaseSync(file);
  old.exec(V1);
  const body = { id: 'abc12345', v: 2, nextId: 4, meta: { title: 'Old quote', description: 'kept from before' }, root: { id: 'c1', kind: 'col', children: [{ id: 'c2', kind: 'text', text: 'Harbour lights' }, { id: 'c3', kind: 'input', name: 'n', type: 'number', value: 5 }] } };
  old.prepare('INSERT INTO docs VALUES (?, ?, ?, ?, ?, ?)').run(body.id, 'Old quote', JSON.stringify(body), 2, 1000, 2000);
  old.prepare('INSERT INTO ops VALUES (?, ?, ?, ?, ?)').run(body.id, 1, 1500, '{"kind":"human","name":"Ann"}', '[["put","c1",["col","Harbour lights"]]]');
  old.prepare('INSERT INTO ops VALUES (?, ?, ?, ?, ?)').run(body.id, 2, 2000, '{"kind":"agent","name":"Claude"}', '[["set","n","value",5]]');
  old.prepare('INSERT INTO records VALUES (?, ?, ?, ?, ?)').run('r1', 'quotes', '{"total":120}', 1800, null);
  old.prepare('INSERT INTO messages (doc_id, ts, actor, text) VALUES (?, ?, ?, ?)').run(body.id, 1900, '{"kind":"human","name":"Ann"}', 'looks good');
  old.close();

  const store = new Store(file);
  assert.equal(store.version(), SCHEMA);
  assert.deepEqual(store.getDoc(body.id), body);
  assert.deepEqual(store.log(body.id).map((e) => [e.v, e.actor.name]), [[1, 'Ann'], [2, 'Claude']]);
  assert.deepEqual(store.rows('quotes'), [{ total: 120, id: 'r1', at: 1800 }]);
  assert.equal(store.messages(body.id)[0].text, 'looks good');
  const summary = store.summary(body.id)!;
  assert.deepEqual([summary.description, summary.createdAt, summary.updatedAt, summary.pinned, summary.archivedAt], ['kept from before', 1000, 2000, null, null]);
  assert.ok(store.texts()[0].text.includes('Harbour lights'), 'old documents are searchable');
  store.close();
  // Opening it again changes nothing.
  const again = new Store(file);
  assert.deepEqual(again.getDoc(body.id), body);
  const { call } = api(again);
  assert.deepEqual(ids((await call('GET', '/api/library?q=harbour')).json), [body.id]);
  again.close();
});
