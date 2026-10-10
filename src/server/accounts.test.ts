import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from './app';
import { Store } from './store';
import { PUBLIC, crossSite, isPublic } from './access';
import { Throttle, hashPassword, initials, verifyPassword } from './auth';

const dir = () => mkdtempSync(join(tmpdir(), 'edgy-'));

/** An installation in accounts mode, and a way to call it as someone. */
function server(store = new Store(':memory:'), opts: { now?: () => number } = {}) {
  const made = createApp(store, join(dir(), 'assets'), undefined, { auth: 'accounts', ...opts });
  const { app } = made;
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await app.request(path, {
      method,
      headers: { ...headers, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, json, headers: res.headers };
  };
  /** Sign up and return the cookie header that signs in as them. */
  const signup = async (email: string, name?: string, password = 'correct horse') => {
    const r = await call('POST', '/api/auth/signup', { email, password, name });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    const cookie = /edgy_session=([^;]+)/.exec(r.headers.get('set-cookie') ?? '')![1];
    return { cookie: { cookie: `edgy_session=${cookie}` }, user: r.json.user as { id: string; name: string } };
  };
  return { ...made, call, signup, store };
}

const docOf = async (s: ReturnType<typeof server>, as: Record<string, string>, title: string, root?: unknown) =>
  (await s.call('POST', '/api/docs', { title, ...(root ? { root } : {}) }, as)).json.id as string;

test('passwords: scrypt with a salt of their own, checked in constant time, unknown accounts cost the same', async () => {
  const a = await hashPassword('correct horse');
  const b = await hashPassword('correct horse');
  assert.match(a, /^scrypt\$15\$8\$1\$[\w-]{22}\$[\w-]{43}$/);
  assert.notEqual(a, b, 'every password gets its own salt');
  assert.equal(await verifyPassword('correct horse', a), true);
  assert.equal(await verifyPassword('correct horsf', a), false);
  assert.equal(await verifyPassword('anything', null), false);
  assert.ok(!a.includes('correct'), 'the password itself is not stored');
  assert.equal(initials('Ana Pop'), 'AP');
  assert.equal(initials('ben@example.com'), 'B');
});

test('repeated failures are slowed down, doubling, and a wait ends', () => {
  let now = 0;
  const t = new Throttle({ now: () => now });
  for (let i = 0; i < 4; i++) {
    assert.equal(t.wait('e'), 0, `try ${i + 1} is free`);
    t.fail('e');
  }
  t.fail('e');
  assert.equal(t.wait('e'), 2000);
  now += 2000;
  assert.equal(t.wait('e'), 0);
  t.fail('e');
  assert.equal(t.wait('e'), 4000, 'each further failure doubles the wait');
  t.clear('e');
  assert.equal(t.wait('e'), 0);
});

test('sign up, sign out, sign in: a session cookie that is HttpOnly and SameSite, a clear message for a wrong password', async () => {
  const s = server();
  const up = await s.call('POST', '/api/auth/signup', { email: ' Ana@Example.com ', password: 'correct horse', name: 'Ana Pop' });
  assert.equal(up.status, 201);
  const set = up.headers.get('set-cookie')!;
  assert.match(set, /^edgy_session=[\w-]{43}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=2592000$/);
  assert.equal(up.json.user.email, 'ana@example.com');
  assert.ok(!JSON.stringify(up.json).includes('scrypt'), 'no hash in the answer');
  const cookie = { cookie: set.split(';')[0] };
  assert.equal((await s.call('GET', '/api/me', undefined, cookie)).json.user.name, 'Ana Pop');
  assert.equal((await s.call('POST', '/api/auth/signup', { email: 'ana@example.com', password: 'another one' })).status, 409, 'one account per email');
  assert.equal((await s.call('POST', '/api/auth/signup', { email: 'ben@example.com', password: 'short' })).json.error, 'A password needs at least 8 characters.');

  const out = await s.call('POST', '/api/auth/signout', undefined, cookie);
  assert.match(out.headers.get('set-cookie')!, /^edgy_session=; .*Max-Age=0/);
  assert.equal((await s.call('GET', '/api/me', undefined, cookie)).status, 401, 'a session signed out is over');

  const wrong = await s.call('POST', '/api/auth/signin', { email: 'ana@example.com', password: 'wrong horse' });
  assert.deepEqual([wrong.status, wrong.json.error], [401, 'Wrong email or password.']);
  const nobody = await s.call('POST', '/api/auth/signin', { email: 'nobody@example.com', password: 'wrong horse' });
  assert.deepEqual([nobody.status, nobody.json.error], [401, 'Wrong email or password.'], 'the same answer: it does not tell which emails exist');
  const ok = await s.call('POST', '/api/auth/signin', { email: 'ANA@example.com', password: 'correct horse' });
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('set-cookie')!, /HttpOnly; SameSite=Lax/);
});

test('sign-in slows down after repeated failures, with a message saying how long', async () => {
  let now = 1_000_000;
  const s = server(new Store(':memory:'), { now: () => now });
  await s.signup('ana@example.com');
  const tries: number[] = [];
  for (let i = 0; i < 6; i++) tries.push((await s.call('POST', '/api/auth/signin', { email: 'ana@example.com', password: 'nope nope' })).status);
  assert.deepEqual(tries, [401, 401, 401, 401, 401, 429]);
  const slowed = await s.call('POST', '/api/auth/signin', { email: 'ana@example.com', password: 'correct horse' });
  assert.equal(slowed.status, 429, 'even the right password waits');
  assert.match(slowed.json.error, /^Too many tries\. Wait \d+ seconds/);
  assert.ok(Number(slowed.headers.get('retry-after')) >= 1);
  now += 5_000;
  assert.equal((await s.call('POST', '/api/auth/signin', { email: 'ana@example.com', password: 'correct horse' })).status, 200);
});

test('sessions survive a restart: they are kept in the database, as a digest', async () => {
  const file = join(dir(), 'edgy.db');
  const first = server(new Store(file));
  const { cookie } = await first.signup('ana@example.com', 'Ana');
  first.store.close();
  const again = server(new Store(file));
  assert.equal((await again.call('GET', '/api/me', undefined, cookie)).json.user.name, 'Ana');
  const raw = new DatabaseSync(file);
  const stored = raw.prepare('SELECT hash FROM sessions').all().map((r) => r.hash as string);
  raw.close();
  assert.ok(!stored.includes(cookie.cookie.split('=')[1]), 'the cookie itself is not stored');
});

/** A route's path with its parameters filled in. */
const fill = (path: string, p: Record<string, string>) => path.replace(/:(\w+)/g, (_, k) => p[k] ?? 'x');

test('the route table: every /api route declares what it needs, and signed out only the public ones answer', async () => {
  const s = server();
  const routes = new Map<string, { method: string; path: string; needs: unknown[] }>();
  for (const r of s.app.routes) {
    if (!r.path.startsWith('/api/') || r.method === 'ALL') continue;
    const key = `${r.method} ${r.path}`;
    const e = routes.get(key) ?? { method: r.method, path: r.path, needs: [] };
    const need = (r.handler as { need?: unknown }).need;
    if (need !== undefined) e.needs.push(need);
    routes.set(key, e);
  }
  assert.ok(routes.size > 50, `found ${routes.size} routes`);
  for (const { method, path, needs } of routes.values()) {
    assert.equal(needs.length, 1, `${method} ${path} must say what it needs (need(…) before its handler)`);
    assert.equal(needs[0] === 'public', isPublic(method, path), `${method} ${path}: public routes are exactly the PUBLIC list`);
    if (needs[0] === 'public') continue;
    const r = await s.call(method, fill(path, {}), method === 'GET' || method === 'DELETE' ? undefined : {});
    assert.equal(r.status, 401, `${method} ${path} signed out`);
    assert.equal(r.json.error, 'sign in first');
  }
  for (const [m, p] of PUBLIC) assert.ok(routes.has(`${m} ${p}`), `${m} ${p} exists`);
});

test("user B can not list, read, change, delete or listen to A's document on any route until A gives access", async () => {
  const s = server();
  const a = await s.signup('ana@example.com', 'Ana');
  const b = await s.signup('ben@example.com', 'Ben');
  const id = await docOf(s, a.cookie, 'Ana plans', ['col', ['input', { name: 'n', type: 'number', value: 1 }], ['fetch', { name: 'f' }, '/api/demo/rate']]);
  await s.call('POST', `/api/data/plans`, { record: { secret: 'ana-only' } }, a.cookie);
  const deck = (await s.call('POST', '/api/decks', { title: 'Ana deck', docs: [id] }, a.cookie)).json.id;
  const link = (await s.call('POST', `/api/docs/${id}/shares`, { access: 'view' }, a.cookie)).json.token;
  const params = { id, cell: 'f', user: a.user.id, rid: 'r1', token: link, name: 'plans', key: 'k1', file: 'x' };

  assert.ok(!JSON.stringify((await s.call('GET', '/api/docs', undefined, b.cookie)).json).includes(id), 'not in B\'s list');
  assert.ok(!JSON.stringify((await s.call('GET', '/api/library?q=plans', undefined, b.cookie)).json).includes(id), 'not found by B\'s search');
  assert.ok(!JSON.stringify((await s.call('GET', '/api/library?scope=shared', undefined, b.cookie)).json).includes(id));
  assert.equal((await s.call('GET', `/api/library/${id}`, undefined, b.cookie)).json.entry, null);

  // Every route about a document, a deck or a collection (through the document) refuses B.
  let checked = 0;
  for (const r of s.app.routes) {
    const need = (r.handler as { need?: any }).need;
    if (!need || typeof need !== 'object' || 'guest' in need) continue;
    const path = fill(r.path, params) + ('data' in need ? `?doc=${id}` : '');
    if (path.startsWith('/api/decks/') && !r.path.includes(':id')) continue;
    const res = await s.call(r.method, 'deck' in need ? path.replace(id, deck) : path, r.method === 'GET' || r.method === 'DELETE' ? undefined : { ops: [['set', 'n', 'value', 9]], email: 'ben@example.com', role: 'editor', record: { x: 1 }, fields: { x: 1 }, text: 'hi', prompt: 'x', client: 'c', mode: 'live' }, b.cookie);
    assert.equal(res.status, 404, `${r.method} ${r.path} as a stranger: ${JSON.stringify(res.json)}`);
    checked++;
  }
  assert.ok(checked >= 25, `${checked} routes checked`);
  assert.equal((await s.call('GET', `/api/docs/${id}/read`, undefined, a.cookie)).json.values.n, 1, 'nothing B tried changed it');
  assert.equal((await s.call('DELETE', `/api/shares/${link}`, undefined, b.cookie)).status, 404, 'nor turn off its link');
  assert.equal((await s.call('POST', '/api/library/bulk', { action: 'delete', ids: [id, deck] }, b.cookie)).json.skipped.length, 2, 'nor delete it in bulk');
  assert.equal((await s.call('GET', `/api/data/plans`, undefined, b.cookie)).json.length, 0, 'B\'s own "plans" is empty');

  // A makes B a viewer: B reads, can't change.
  assert.equal((await s.call('POST', `/api/docs/${id}/people`, { email: 'ben@example.com', role: 'viewer' }, a.cookie)).status, 200);
  assert.equal((await s.call('GET', `/api/docs/${id}`, undefined, b.cookie)).status, 200);
  assert.equal((await s.call('GET', `/api/docs/${id}/read`, undefined, b.cookie)).json.values.n, 1);
  assert.equal((await s.call('GET', '/api/library?scope=shared', undefined, b.cookie)).json.rest[0].ownerName, 'Ana');
  const refused = await s.call('POST', `/api/docs/${id}/ops`, { ops: [['set', 'n', 'value', 2]] }, b.cookie);
  assert.deepEqual([refused.status, refused.json.error], [403, 'you can view this document, not change it']);
  assert.equal((await s.call('DELETE', `/api/docs/${id}`, undefined, b.cookie)).status, 403);
  // An editor can, and the history says who.
  await s.call('PATCH', `/api/docs/${id}/people/${b.user.id}`, { role: 'editor' }, a.cookie);
  assert.equal((await s.call('POST', `/api/docs/${id}/ops`, { ops: [['set', 'n', 'value', 2]], actor: { kind: 'human', name: 'Mallory' } }, b.cookie)).status, 200);
  const last = (await s.call('GET', `/api/docs/${id}/log`, undefined, a.cookie)).json.at(-1).actor;
  assert.deepEqual([last.name, last.id], ['Ben', b.user.id], 'named by the server, not by the request');
  assert.equal((await s.call('DELETE', `/api/docs/${id}`, undefined, b.cookie)).status, 403, 'only the owner deletes');
  assert.equal((await s.call('POST', `/api/docs/${id}/shares`, { access: 'edit' }, b.cookie)).status, 403, 'only the owner shares');
  // Taken away: at once.
  await s.call('DELETE', `/api/docs/${id}/people/${b.user.id}`, undefined, a.cookie);
  assert.equal((await s.call('GET', `/api/docs/${id}`, undefined, b.cookie)).status, 404);
});

/** Read an event stream until `stop` says so (or a few seconds pass). */
async function readStream(res: Response, stop: (events: string[]) => boolean): Promise<{ events: string[]; ended: boolean }> {
  const reader = res.body!.getReader();
  const events: string[] = [];
  let buf = '';
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    const r = await Promise.race([reader.read(), new Promise<{ done: true; value: undefined; timeout: true }>((ok) => setTimeout(() => ok({ done: true, value: undefined, timeout: true }), 4000))]);
    if (r.done) return { events, ended: !('timeout' in r) };
    buf += new TextDecoder().decode(r.value);
    for (const m of buf.matchAll(/event: (\w+)/g)) events.push(m[1]);
    buf = '';
    if (stop(events)) {
      // Give the server a moment to close it, then see whether it did (and that nothing more came).
      const after = await Promise.race([reader.read(), new Promise<null>((ok) => setTimeout(() => ok(null), 500))]);
      if (after?.value) events.push(...[...new TextDecoder().decode(after.value).matchAll(/event: (\w+)/g)].map((m) => m[1]));
      return { events, ended: !!after?.done };
    }
  }
  return { events, ended: false };
}

test('taking access away closes a stream that is already open, and presence shows who is in the document', async () => {
  const s = server();
  const a = await s.signup('ana@example.com', 'Ana');
  const b = await s.signup('ben@example.com', 'Ben');
  const id = await docOf(s, a.cookie, 'Shared');
  await s.call('POST', `/api/docs/${id}/people`, { email: 'ben@example.com', role: 'editor' }, a.cookie);
  const heard: any[] = [];
  s.hub.subscribe(id, (e) => heard.push(e));
  const res = await s.app.request(`/api/docs/${id}/events?client=bbb&mode=edit`, { headers: b.cookie });
  assert.equal(res.status, 200);
  await new Promise((r) => setTimeout(r, 50));
  await s.call('POST', `/api/docs/${id}/viewer`, { client: 'bbb', mode: 'edit', selected: 'c1' }, b.cookie);
  const people = heard.filter((e) => e.type === 'people').at(-1).people;
  assert.deepEqual(people.map((p: any) => [p.name, p.selected, p.clients]), [['Ben', 'c1', ['bbb']]]);
  assert.equal((await s.call('GET', `/api/docs/${id}/people`, undefined, a.cookie)).json.present[0].name, 'Ben');
  const reading = readStream(res, (ev) => ev.includes('revoked'));
  await new Promise((r) => setTimeout(r, 50));
  await s.call('DELETE', `/api/docs/${id}/people/${b.user.id}`, undefined, a.cookie);
  const { events, ended } = await reading;
  assert.equal(events.at(-1), 'revoked', `heard: ${events}`);
  assert.equal(ended, true, 'and the stream closed');
  assert.deepEqual(heard.filter((e) => e.type === 'people').at(-1).people, [], 'Ben is no longer listed as present');
});

test('collections belong to their owner: B reads none of A\'s records, not by name, not with rows, not beyond what a shared document reaches', async () => {
  const s = server();
  const a = await s.signup('ana@example.com', 'Ana');
  const b = await s.signup('ben@example.com', 'Ben');
  await s.call('POST', '/api/data/orders', { record: { item: 'tea' } }, a.cookie);
  await s.call('POST', '/api/data/salaries', { record: { who: 'Ana', pay: 100 } }, a.cookie);
  assert.deepEqual((await s.call('GET', '/api/data', undefined, b.cookie)).json, [], 'B lists none of A\'s collections');
  assert.deepEqual((await s.call('GET', '/api/data/salaries', undefined, b.cookie)).json, [], 'B\'s "salaries" is B\'s own, empty');
  // (rows …) in B's own document reads B's records.
  const mine = await docOf(s, b.cookie, 'Ben sums', ['formula', { name: 'n' }, ['len', ['rows', 'salaries']]]);
  assert.equal((await s.call('GET', `/api/docs/${mine}/read`, undefined, b.cookie)).json.values.n, 0);
  // Through A's document shared with B: what it reaches, and nothing more.
  const shop = await docOf(s, a.cookie, 'Shop', ['formula', { name: 'n' }, ['len', ['rows', 'orders']]]);
  await s.call('POST', `/api/docs/${shop}/people`, { email: 'ben@example.com', role: 'editor' }, a.cookie);
  assert.equal((await s.call('GET', `/api/docs/${shop}/read`, undefined, b.cookie)).json.values.n, 1, 'B sees the shop count A\'s orders');
  assert.equal((await s.call('GET', `/api/data/orders?doc=${shop}`, undefined, b.cookie)).json[0].item, 'tea');
  assert.equal((await s.call('GET', `/api/data/salaries?doc=${shop}`, undefined, b.cookie)).status, 403, 'the shop does not reach salaries');
  // B, an editor, makes the shop read salaries: still not reached until A changes it.
  await s.call('POST', `/api/docs/${shop}/ops`, { ops: [['put', 'c1', ['col', ['formula', { name: 'n' }, ['len', ['rows', 'orders']]], ['formula', { name: 'pay' }, ['rows', 'salaries']]]]] }, b.cookie);
  const read = (await s.call('GET', `/api/docs/${shop}/read`, undefined, b.cookie)).json;
  assert.match(read.errors.pay, /does not reach the collection "salaries"/);
  assert.equal((await s.call('GET', `/api/data/salaries?doc=${shop}`, undefined, b.cookie)).status, 403);
  assert.ok(!JSON.stringify(read).includes('100'), 'no salary in what B reads');
  assert.equal((await s.call('POST', `/api/docs/${shop}/eval`, { src: '(rows "salaries")' }, b.cookie)).json.error?.includes('does not reach'), true);
  // Writing through the document is for editors, into what it reaches.
  assert.equal((await s.call('POST', `/api/data/orders?doc=${shop}`, { record: { item: 'cake' } }, b.cookie)).status, 201);
  assert.equal((await s.call('GET', '/api/data/orders', undefined, a.cookie)).json.length, 2, 'B\'s order landed in A\'s collection');
  await s.call('PATCH', `/api/docs/${shop}/people/${b.user.id}`, { role: 'viewer' }, a.cookie);
  assert.equal((await s.call('POST', `/api/data/orders?doc=${shop}`, { record: { item: 'x' } }, b.cookie)).status, 403, 'a viewer saves nothing');
});

test('API keys: shown once, kept as a digest, an agent acting for its person; revoked or wrong keys fail clearly', async () => {
  const s = server();
  const a = await s.signup('ana@example.com', 'Ana');
  const b = await s.signup('ben@example.com', 'Ben');
  const bens = await docOf(s, b.cookie, 'Ben only');
  const made = await s.call('POST', '/api/me/keys', { name: 'Laptop Claude' }, a.cookie);
  assert.equal(made.status, 201);
  const key = made.json.key as string;
  assert.match(key, /^edgy_[\w-]{43}$/);
  const listed = (await s.call('GET', '/api/me/keys', undefined, a.cookie)).json;
  assert.equal(listed.length, 1);
  assert.ok(!JSON.stringify(listed).includes(key), 'the list never shows the key again');
  assert.equal(listed[0].prefix, key.slice(0, 11));
  const bearer = { authorization: `Bearer ${key}` };
  const docs = (await s.call('GET', '/api/docs', undefined, bearer)).json;
  assert.ok(docs.length >= 1 && !docs.some((d: any) => d.id === bens), 'only Ana\'s documents');
  const id = docs[0].id;
  const r = await s.call('POST', `/api/docs/${id}/ops`, { ops: [['meta', 'title', 'Renamed by the agent']], actor: { kind: 'agent', name: 'Claude' } }, bearer);
  assert.equal(r.status, 200);
  const entry = (await s.call('GET', `/api/docs/${id}/log`, undefined, a.cookie)).json.at(-1);
  assert.deepEqual(entry.actor, { kind: 'agent', name: 'Claude', id: a.user.id, for: 'Ana' });
  assert.ok((await s.call('GET', '/api/me/keys', undefined, a.cookie)).json[0].lastUsedAt > 0, 'last used is kept');
  assert.equal((await s.call('POST', '/api/me/keys', { name: 'x' }, bearer)).status, 403, 'a key can not make keys');
  assert.equal((await s.call('GET', `/api/docs/${bens}`, undefined, bearer)).status, 404);
  // Nothing anyone can read afterwards holds the key.
  const everything = JSON.stringify([
    (await s.call('GET', `/api/docs/${id}`, undefined, a.cookie)).json, (await s.call('GET', `/api/docs/${id}/log`, undefined, a.cookie)).json,
    (await s.call('GET', '/api/me', undefined, bearer)).json, (await s.call('GET', '/api/me/keys', undefined, a.cookie)).json,
  ]);
  assert.ok(!everything.includes(key) && !everything.includes(key.slice(11)), 'no response after creation holds the key');
  await s.call('DELETE', `/api/me/keys/${listed[0].id}`, undefined, a.cookie);
  const revoked = await s.call('GET', '/api/docs', undefined, bearer);
  assert.deepEqual([revoked.status, revoked.json.error], [401, 'this API key was revoked; make a new one in your profile']);
  const wrong = await s.call('GET', '/api/docs', undefined, { authorization: 'Bearer edgy_nope' });
  assert.deepEqual([wrong.status, wrong.json.error], [401, 'this API key is not valid; make one in your profile (Profile → API keys)']);
});

test('profile: a new name shows in presence and history; a new password ends the other sessions; deleting the account takes its documents', async () => {
  const s = server();
  const a = await s.signup('ana@example.com', 'Ana');
  const other = (await s.call('POST', '/api/auth/signin', { email: 'ana@example.com', password: 'correct horse' })).headers.get('set-cookie')!.split(';')[0];
  const b = await s.signup('ben@example.com', 'Ben');
  const id = await docOf(s, a.cookie, 'Kept');
  await s.call('POST', `/api/docs/${id}/people`, { email: 'ben@example.com', role: 'editor' }, a.cookie);
  const bensDoc = await docOf(s, b.cookie, 'Ben\'s');
  await s.call('POST', `/api/docs/${bensDoc}/people`, { email: 'ana@example.com', role: 'editor' }, b.cookie);
  await s.call('POST', `/api/docs/${bensDoc}/ops`, { ops: [['meta', 'title', 'Edited by Ana']] }, a.cookie);

  assert.equal((await s.call('PATCH', '/api/me', { name: 'Ana Maria', color: '#16a34a' }, a.cookie)).json.user.name, 'Ana Maria');
  assert.equal((await s.call('GET', `/api/docs/${id}/people`, undefined, b.cookie)).json.people[0].name, 'Ana Maria');
  assert.equal((await s.call('PATCH', '/api/me', { email: 'ben@example.com' }, a.cookie)).status, 409, 'an email is one account\'s');

  assert.equal((await s.call('POST', '/api/me/password', { current: 'wrong', password: 'new password 1' }, a.cookie)).status, 403);
  const changed = await s.call('POST', '/api/me/password', { current: 'correct horse', password: 'new password 1' }, a.cookie);
  assert.deepEqual([changed.status, changed.json.signedOut], [200, 1]);
  assert.equal((await s.call('GET', '/api/me', undefined, { cookie: other })).status, 401, 'the other session is over');
  assert.equal((await s.call('GET', '/api/me', undefined, a.cookie)).status, 200, 'this one stays');
  assert.equal((await s.call('POST', '/api/auth/signin', { email: 'ana@example.com', password: 'new password 1' })).status, 200);

  assert.equal((await s.call('DELETE', '/api/me', { password: 'correct horse' }, a.cookie)).status, 403, 'deleting asks for the password');
  const gone = await s.call('DELETE', '/api/me', { password: 'new password 1' }, a.cookie);
  assert.equal(gone.status, 200);
  assert.equal((await s.call('GET', `/api/docs/${id}`, undefined, b.cookie)).status, 404, 'its documents went with it');
  assert.equal((await s.call('GET', '/api/me', undefined, a.cookie)).status, 401);
  assert.equal((await s.call('GET', `/api/docs/${bensDoc}`, undefined, b.cookie)).json.meta.title, 'Edited by Ana', 'what it did in other people\'s documents stays');
  assert.deepEqual((await s.call('GET', `/api/docs/${bensDoc}/people`, undefined, b.cookie)).json.people.map((p: any) => p.name), ['Ben']);
});

test('the first account owns what an installation had before accounts; later accounts start with the tour', async () => {
  const store = new Store(':memory:');
  const s = server(store);
  // Made before any account: the tour, and records.
  const before = store.listDocs();
  assert.equal(before.length, 1);
  store.insert(null, 'notes', { text: 'from before' });
  const a = await s.signup('ana@example.com', 'Ana');
  const mine = (await s.call('GET', '/api/docs', undefined, a.cookie)).json;
  assert.deepEqual(mine.map((d: any) => d.id), before.map((d) => d.id));
  assert.equal((await s.call('GET', '/api/data/notes', undefined, a.cookie)).json[0].text, 'from before');
  const b = await s.signup('ben@example.com', 'Ben');
  const bens = (await s.call('GET', '/api/docs', undefined, b.cookie)).json;
  assert.equal(bens.length, 1, 'Ben gets a tour of his own');
  assert.notEqual(bens[0].id, mine[0].id);
});

test('writes made with the cookie must come from edgy\'s own pages', async () => {
  const s = server();
  const a = await s.signup('ana@example.com', 'Ana');
  const evil = await s.call('POST', '/api/docs', { title: 'x' }, { ...a.cookie, origin: 'https://evil.example' });
  assert.deepEqual([evil.status, evil.json.error], [403, 'a page on another site can not change edgy']);
  assert.equal((await s.call('POST', '/api/docs', { title: 'x' }, { ...a.cookie, 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal((await s.call('POST', '/api/docs', { title: 'x' }, { ...a.cookie, 'sec-fetch-site': 'same-origin', origin: 'http://localhost' })).status, 201);
  assert.equal((await s.call('GET', '/api/docs', undefined, { ...a.cookie, 'sec-fetch-site': 'cross-site' })).status, 200, 'reading is not a write');
  assert.equal(crossSite('DELETE', (k) => ({ origin: 'null' } as Record<string, string>)[k], ['http://localhost']), 'a page on another site can not change edgy');
});

test('local mode: this machine is the local account without signing in, but not a page that rebinds its name', async () => {
  const { app } = createApp(new Store(':memory:'), join(dir(), 'assets'));
  const me = await app.request('/api/me');
  assert.equal(((await me.json()) as any).user.name, 'You');
  const rebound = await app.request('/api/me', { headers: { host: 'evil.example' } });
  assert.equal(rebound.status, 401);
  assert.equal((await app.request('/api/docs', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{}' })).status, 403);
});
