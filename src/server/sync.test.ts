import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from './app';
import { Store } from './store';
import { LocalCloud, pipelineUrl } from './cloud';

/** One machine: its own database, the same cloud as the others. Sync runs only when asked (round). */
function machine(cloud: LocalCloud, store = new Store(':memory:'), cookieFrom?: { cookie: () => Record<string, string> }) {
  // (A store and a session can be carried over: the same machine pointed at another cloud.)
  const { app, sync } = createApp(store, join(mkdtempSync(join(tmpdir(), 'edgy-')), 'assets'), undefined, { auth: 'accounts', cloud, syncInterval: 0 });
  let cookie: Record<string, string> = cookieFrom?.cookie() ?? {};
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
  return { store, sync: sync!, call, round, doc, values, log, cookie: () => cookie };
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
  const { app } = createApp(store, join(mkdtempSync(join(tmpdir(), 'edgy-')), 'assets'), undefined, { auth: 'local' });
  const r = (await (await app.request('/api/sync')).json()) as any;
  assert.equal(r.state, 'off');
});

test("rows in one account's space never touch another account's things; a row that can't be applied is skipped, not a wall", async () => {
  const { cloud, one, two } = await pair();
  const id = (await one.call('POST', '/api/docs', { title: 'Ana only', root: ROOT })).json.id;
  await settle(one, two);
  // Mallory has an account on machine two; her space syncs there.
  assert.equal((await two.call('POST', '/api/auth/signout')).status, 200);
  const m = await two.call('POST', '/api/auth/signup', { email: 'mallory@example.test', password: 'correct horse', name: 'Mallory' });
  const mid = m.json.user.id as string;
  const ana = two.store.userByEmail('ana@example.test')!;
  await two.round();
  // Rows written into Mallory's space that name Ana's things.
  const forge = (kind: string, key: string, body: unknown) =>
    cloud.db.prepare('INSERT INTO edgy_log (space, oid, kind, key, origin, ts, body) VALUES (?, ?, ?, ?, ?, ?, ?)').run(mid, `forged-${kind}-${Math.random()}`, kind, key, 'x', Date.now(), JSON.stringify(body));
  forge('account', ana.id, { email: 'ana@example.test', name: 'Pwned', color: '#000000', theme: null, password: 'scrypt$1$1$1$x$y' });
  forge('access', `${id} ${mid}`, { doc: id, user: mid, role: 'editor' });
  forge('doc', id, { deleted: true });
  forge('share', 'forged-token', { token: 'forged-token', doc: id, access: 'edit', createdAt: 1, revokedAt: null, collections: [] });
  await two.round();
  assert.equal(two.store.user(ana.id)!.name, 'Ana', 'her profile stays hers');
  assert.equal(two.store.roleOf(id, mid), null, 'no access was given');
  assert.ok(two.store.getDoc(id), 'her document is still there');
  assert.equal(two.store.share('forged-token'), null, 'no link was made');
  // A row of Ana's own that clashes here (an email Mallory has on this machine) is skipped; what comes after still arrives.
  cloud.db.prepare('INSERT INTO edgy_log (space, oid, kind, key, origin, ts, body) VALUES (?, ?, ?, ?, ?, ?, ?)').run(ana.id, 'clash-1', 'account', ana.id, 'x', Date.now(), JSON.stringify({ email: 'mallory@example.test', name: 'Ana', color: '#000000', theme: null, password: two.store.passwordOf(ana.id) }));
  await one.call('POST', `/api/docs/${id}/ops`, { ops: [['set', 'qty', 'value', 42]] });
  await one.round();
  await two.round();
  assert.equal(two.sync.status().skipped, 1);
  assert.equal(two.store.getDoc(id)!.root.children![0].value, 42, 'the edit after the bad row arrived');
});

// ── from the code review ──

test('a first upload that breaks off midway leaves nothing half sent: every document arrives with its whole history', async () => {
  const { cloud, one, two } = await pair();
  cloud.down = true;
  const ids: string[] = [];
  for (let i = 0; i < 40; i++) {
    const id = (await one.call('POST', '/api/docs', { title: `Doc ${i}`, root: ROOT })).json.id;
    for (let n = 2; n < 6; n++) await one.call('POST', `/api/docs/${id}/ops`, { ops: [['set', 'qty', 'value', n]] });
    ids.push(id);
  }
  cloud.down = false;
  // The second request of the upload breaks off.
  let pushes = 0;
  cloud.failIf = (stmts) => stmts[0]?.sql === 'BEGIN' && ++pushes === 2;
  await one.round().catch(() => {});
  cloud.failIf = null;
  await settle(one, two);
  for (const id of ids) assert.deepEqual(two.log(id), one.log(id), `${id}: the same history on both`);
});

test('a document deleted while its first upload is on its way stays deleted everywhere', async () => {
  const { cloud, one, two } = await pair();
  const id = (await one.call('POST', '/api/docs', { title: 'Zombie' })).json.id;
  // The upload goes; the pull that would confirm it breaks off.
  let sent = false;
  cloud.failIf = (stmts) => {
    if (stmts.some((s) => /INSERT INTO edgy_log/.test(s.sql) && s.args?.[2] === 'create')) sent = true;
    return sent && /^SELECT seq/.test(stmts[0]?.sql ?? '');
  };
  await one.round().catch(() => {});
  cloud.failIf = null;
  await one.call('DELETE', `/api/docs/${id}`);
  await settle(one, two);
  assert.equal((await two.call('GET', `/api/docs/${id}`)).status, 404);
});

test('pointed at a new cloud database, a machine sends everything again', async () => {
  const { one } = await pair();
  for (const t of ['A', 'B', 'C']) await one.call('POST', '/api/docs', { title: t, root: ROOT });
  await one.round();
  const fresh = new LocalCloud();
  const again = machine(fresh, one.store, one);
  await again.round();
  await again.round();
  const creates = new Set(fresh.db.prepare("SELECT key FROM edgy_log WHERE kind = 'create'").all().map((r: any) => r.key));
  assert.equal(creates.size, one.store.listDocs(one.store.users()[0].id).length, 'every document is in the new cloud');
  assert.equal(again.sync.status().pending, 0);
});

test('a page pulled again is not news: nothing is applied twice or skipped', async () => {
  const { one, two } = await pair();
  const id = (await one.call('POST', '/api/docs', { title: 'Twice', root: ROOT })).json.id;
  await one.call('POST', `/api/docs/${id}/ops`, { ops: [['set', 'qty', 'value', 3]] });
  await settle(one, two);
  const before = two.log(id);
  for (const s of two.store.spaces()) two.store.setCursor(s.space, 0);
  await two.round();
  assert.deepEqual(two.log(id), before);
  assert.equal(two.sync.status().skipped, 0);
});

test('Flow travels like any record: an item posted on one, commented on the other, reacted to on both while the cloud is down', async () => {
  const { cloud, one, two } = await pair();
  const item = (await one.call('POST', '/api/flow', { text: 'Call Ben tomorrow 3pm #sales' })).json;
  assert.equal(item.kind, 'event');
  await settle(one, two);
  const onTwo = (await two.call('GET', '/api/flow')).json;
  assert.deepEqual(onTwo.items.map((i: any) => [i.id, i.text, i.tags]), [[item.id, 'Call Ben', ['sales']]], 'the item is on the second machine');
  await two.call('POST', `/api/flow/${item.id}/comments`, { text: 'Bring the numbers' });
  cloud.down = true;
  await one.call('POST', `/api/flow/${item.id}/react`, { kind: 'like' });
  await two.call('POST', `/api/flow/${item.id}/react`, { kind: 'idea' });
  await one.call('PATCH', `/api/flow/${item.id}`, { priority: 2 });
  await two.call('PATCH', `/api/flow/${item.id}`, { pinned: true });
  cloud.down = false;
  await settle(one, two);
  const a = (await one.call('GET', '/api/flow')).json;
  const b = (await two.call('GET', '/api/flow')).json;
  assert.deepEqual(a.comments.map((k: any) => k.text), ['Bring the numbers']);
  assert.deepEqual(a.reactions.map((r: any) => r.kind).sort(), ['idea', 'like'], 'both reactions survive');
  assert.deepEqual([a.items[0].priority, a.items[0].pinned], [2, true], 'fields changed on each side both survive');
  assert.deepEqual(a.items, b.items);
  assert.deepEqual(a.comments, b.comments);
  assert.deepEqual(a.reactions.map((r: any) => r.id).sort(), b.reactions.map((r: any) => r.id).sort());
  // Deleting on one takes the comments and reactions away on the other too.
  await one.call('DELETE', `/api/flow/${item.id}`);
  await settle(one, two);
  const gone = (await two.call('GET', '/api/flow')).json;
  assert.deepEqual([gone.items.length, gone.comments.length, gone.reactions.length], [0, 0, 0]);
});
