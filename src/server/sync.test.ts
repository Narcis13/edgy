import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from './app';
import { Store } from './store';
import { LocalCloud, pipelineUrl } from './cloud';

/** One machine: its own database, the same cloud as the others. Sync runs only when asked (round). */
function machine(cloud: LocalCloud) {
  const store = new Store(':memory:');
  const { app, sync } = createApp(store, join(mkdtempSync(join(tmpdir(), 'edgy-')), 'assets'), undefined, { auth: 'accounts', cloud, syncInterval: 0 });
  let cookie: Record<string, string> = {};
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await app.request(path, {
      method,
      headers: { ...cookie, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set && /edgy_session=[^;]+/.test(set) && !/Max-Age=0/.test(set)) cookie = { cookie: set.split(';')[0] };
    return { status: res.status, json: (await res.json()) as any };
  };
  const round = () => sync!.round();
  const doc = async (id: string) => (await call('GET', `/api/docs/${id}`)).json;
  const values = async (id: string) => (await call('GET', `/api/docs/${id}/read`)).json.values;
  const log = (id: string) => store.fullLog(id).map((e) => ({ v: e.v, oid: e.oid, ops: e.ops, conflict: e.conflict, who: e.actor.name }));
  return { store, sync: sync!, call, round, doc, values, log };
}

/** Two machines, one account: made on the first, signed in on the second. */
async function pair() {
  const cloud = new LocalCloud();
  const one = machine(cloud);
  const two = machine(cloud);
  assert.equal((await one.call('POST', '/api/auth/signup', { email: 'ana@example.test', password: 'correct horse', name: 'Ana' })).status, 201);
  await one.round();
  const r = await two.call('POST', '/api/auth/signin', { email: 'ana@example.test', password: 'correct horse' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  return { cloud, one, two };
}

const ROOT = ['col', ['input', { name: 'qty', type: 'number', value: 1 }], ['input', { name: 'price', type: 'number', value: 10 }], ['text', { name: 'note' }, 'Hello']];

/** Sync both until neither has anything left to send. */
async function settle(...ms: ReturnType<typeof machine>[]) {
  for (let i = 0; i < 3; i++) for (const m of ms) await m.round();
}

test('the cloud address: libsql:// is https, a local gate is used as it is', () => {
  assert.equal(pipelineUrl('libsql://db-org.turso.io'), 'https://db-org.turso.io/v2/pipeline');
  assert.equal(pipelineUrl('http://127.0.0.1:9900/'), 'http://127.0.0.1:9900/v2/pipeline');
});

test('an account signs in on a second machine and finds its documents, their history and its records', async () => {
  const { one, two } = await pair();
  const id = (await one.call('POST', '/api/docs', { title: 'Shop', root: ROOT })).json.id;
  await one.call('POST', `/api/docs/${id}/ops`, { ops: [['set', 'qty', 'value', 3]] });
  await one.call('POST', '/api/data/orders', { record: { item: 'tea', n: 2 } });
  await one.call('PATCH', `/api/docs/${id}`, { pinned: true });
  await settle(one, two);
  const mine = (await two.call('GET', '/api/docs')).json.map((d: any) => d.title).sort();
  assert.deepEqual(mine, (await one.call('GET', '/api/docs')).json.map((d: any) => d.title).sort());
  assert.equal((await two.values(id)).qty, 3);
  assert.deepEqual(two.log(id), one.log(id), 'the same history');
  assert.equal((await two.call('GET', '/api/data/orders')).json[0].item, 'tea');
  assert.equal((await two.call('GET', '/api/library')).json.pinned[0].id, id, 'pins travel');
  assert.equal(one.sync.status().state, 'synced');
  assert.equal(one.sync.status().pending, 0);
});

test('edits travel both ways', async () => {
  const { one, two } = await pair();
  const id = (await one.call('POST', '/api/docs', { title: 'Both', root: ROOT })).json.id;
  await settle(one, two);
  await one.call('POST', `/api/docs/${id}/ops`, { ops: [['set', 'qty', 'value', 5]] });
  await settle(one, two);
  assert.equal((await two.values(id)).qty, 5);
  await two.call('POST', `/api/docs/${id}/ops`, { ops: [['set', 'price', 'value', 12]] });
  await settle(two, one);
  assert.deepEqual([(await one.values(id)).qty, (await one.values(id)).price], [5, 12]);
  assert.deepEqual(one.log(id), two.log(id));
});

test('edits made while the cloud is unreachable arrive when it returns: none lost, none twice, the same order everywhere', async () => {
  const { cloud, one, two } = await pair();
  const id = (await one.call('POST', '/api/docs', { title: 'Offline', root: ROOT })).json.id;
  await settle(one, two);
  cloud.down = true;
  for (const n of [2, 3, 4]) await one.call('POST', `/api/docs/${id}/ops`, { ops: [['set', 'qty', 'value', n]] });
  for (const p of [20, 30]) await two.call('POST', `/api/docs/${id}/ops`, { ops: [['set', 'price', 'value', p]] });
  await two.call('POST', `/api/docs/${id}/ops`, { ops: [['set', 'note', 'text', 'Written offline']] });
  await one.round();
  await two.round();
  assert.equal(one.sync.status().state, 'offline');
  assert.ok(two.sync.status().pending >= 3, 'the changes wait');
  cloud.down = false;
  await settle(one, two);
  const a = await one.doc(id);
  const b = await two.doc(id);
  assert.deepEqual(a, b, 'the same document on both');
  assert.deepEqual([(await one.values(id)).qty, (await one.values(id)).price], [4, 30], 'every edit survived');
  const la = one.log(id);
  assert.deepEqual(la, two.log(id), 'the same ops in the same order');
  const oids = la.map((e) => e.oid).filter(Boolean);
  assert.equal(new Set(oids).size, oids.length, 'no op twice');
  // (The history keeps ops as applied: cells by id.)
  assert.equal(la.filter((e) => e.ops.some((o: any) => o[0] === 'set' && o[2] === 'value' && [2, 3, 4].includes(o[3]))).length, 3, 'all three qty edits');
  assert.equal(one.sync.status().state, 'synced');
});

test('conflicting offline edits: the edit that reaches the cloud last wins; an edit to a removed cell is kept as a conflict and changes nothing', async () => {
  const { cloud, one, two } = await pair();
  const id = (await one.call('POST', '/api/docs', { title: 'Clash', root: ROOT })).json.id;
  await settle(one, two);
  cloud.down = true;
  await one.call('POST', `/api/docs/${id}/ops`, { ops: [['set', 'qty', 'value', 7]] });
  await two.call('POST', `/api/docs/${id}/ops`, { ops: [['set', 'qty', 'value', 9]] });
  await one.call('POST', `/api/docs/${id}/ops`, { ops: [['remove', 'note']] });
  await two.call('POST', `/api/docs/${id}/ops`, { ops: [['set', 'note', 'text', 'Edited while it was being removed']] });
  cloud.down = false;
  await one.round(); // one reaches the cloud first …
  await settle(two, one); // … then two
  assert.equal((await one.values(id)).qty, 9, 'two reached the cloud last: its value wins');
  assert.equal((await two.values(id)).qty, 9);
  const log = one.log(id);
  assert.deepEqual(log, two.log(id));
  const clash = log.find((e) => e.ops.some((o: any) => o[0] === 'set' && o[3] === 'Edited while it was being removed'));
  assert.equal(clash?.conflict, true, 'kept in the history, marked');
  assert.ok(!JSON.stringify(await one.doc(id)).includes('Edited while it was being removed'), 'and it changed nothing');
  assert.deepEqual(await one.doc(id), await two.doc(id));
  assert.ok(two.sync.status().conflicts >= 1);
});

test('records merge field by field; deleted stays deleted; clearing keeps what was added elsewhere', async () => {
  const { cloud, one, two } = await pair();
  const r = (await one.call('POST', '/api/data/orders', { record: { item: 'tea', qty: 1, paid: false } })).json;
  const gone = (await one.call('POST', '/api/data/orders', { record: { item: 'cake', qty: 1 } })).json;
  await one.call('POST', '/api/data/notes', { record: { text: 'old' } });
  await settle(one, two);
  cloud.down = true;
  await one.call('PATCH', `/api/data/orders/${r.id}`, { fields: { qty: 4 } });
  await two.call('PATCH', `/api/data/orders/${r.id}`, { fields: { paid: true } });
  await one.call('DELETE', `/api/data/orders/${gone.id}`);
  await two.call('PATCH', `/api/data/orders/${gone.id}`, { fields: { qty: 9 } });
  await one.call('DELETE', '/api/data/notes');
  await two.call('POST', '/api/data/notes', { record: { text: 'added on two' } });
  cloud.down = false;
  await settle(one, two);
  for (const m of [one, two]) {
    const orders = (await m.call('GET', '/api/data/orders')).json;
    assert.deepEqual(orders.map((o: any) => [o.item, o.qty, o.paid]), [['tea', 4, true]], 'both fields survive; the deleted one stays deleted');
    assert.deepEqual((await m.call('GET', '/api/data/notes')).json.map((n: any) => n.text), ['added on two']);
  }
});

test('archive, decks, links and access travel; a deleted document stays deleted and later edits to it are dropped', async () => {
  const { cloud, one, two } = await pair();
  const a = (await one.call('POST', '/api/docs', { title: 'A', root: ROOT })).json.id;
  const b = (await one.call('POST', '/api/docs', { title: 'B' })).json.id;
  const c = (await one.call('POST', '/api/docs', { title: 'C' })).json.id;
  const deck = (await one.call('POST', '/api/decks', { title: 'Deck', docs: [b, c] })).json.id;
  await one.call('PATCH', `/api/docs/${c}`, { archived: true });
  const link = (await one.call('POST', `/api/docs/${b}/shares`, { access: 'view' })).json.token;
  await settle(one, two);
  assert.deepEqual((await two.call('GET', `/api/decks/${deck}`)).json.docs, [b, c]);
  assert.ok((await two.call('GET', '/api/library?filter=archived')).json.rest.some((e: any) => e.id === c));
  assert.equal((await two.call('GET', `/api/docs/${b}/shares`)).json[0].token, link, 'the link works on both');
  cloud.down = true;
  await one.call('DELETE', `/api/docs/${a}`);
  await two.call('POST', `/api/docs/${a}/ops`, { ops: [['set', 'qty', 'value', 99]] });
  cloud.down = false;
  await settle(one, two);
  assert.equal((await two.call('GET', `/api/docs/${a}`)).status, 404, 'deleted on one, deleted on two');
  assert.equal((await one.call('GET', `/api/docs/${a}`)).status, 404, 'and not brought back');
});

test('a new password on one machine ends the sessions on the other; deleting the account empties its space in the cloud', async () => {
  const { cloud, one, two } = await pair();
  await one.call('POST', '/api/docs', { title: 'Mine' });
  await settle(one, two);
  assert.ok(Number((cloud.db.prepare("SELECT COUNT(*) AS n FROM edgy_log").get() as any).n) > 0);
  await one.call('POST', '/api/me/password', { current: 'correct horse', password: 'battery staple' });
  await settle(one, two);
  assert.equal((await two.call('GET', '/api/me')).status, 401, 'signed out on two');
  assert.equal((await two.call('POST', '/api/auth/signin', { email: 'ana@example.test', password: 'battery staple' })).status, 200);
  assert.equal((await one.call('DELETE', '/api/me', { password: 'battery staple' })).status, 200);
  await settle(one, two);
  const left = cloud.db.prepare('SELECT kind FROM edgy_log').all().map((r: any) => r.kind);
  assert.deepEqual(left, ['account-deleted'], 'only the note that it went');
  assert.equal(two.store.users().length, 0, 'gone on two as well');
  assert.equal((await two.call('GET', '/api/me')).status, 401);
});

test('without the cloud, nothing changes: sync is off', async () => {
  const store = new Store(':memory:');
  const { app } = createApp(store, join(mkdtempSync(join(tmpdir(), 'edgy-')), 'assets'));
  const r = (await (await app.request('/api/sync')).json()) as any;
  assert.equal(r.state, 'off');
});
