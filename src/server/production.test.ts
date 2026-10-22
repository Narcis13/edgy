// What a server on the internet needs beyond what each feature's tests check: headers on every answer, bodies
// with a size, sign-ups that can be closed and slowed down, guesses slowed down per person behind a proxy,
// Claude spent only where its owner meant, and answers that are errors rather than crashes.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type AppOptions, createApp } from './app';
import { Store } from './store';
import { Throttle } from './auth';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

/** An installation in accounts mode; `from` makes a request arrive on a socket from that address. */
function server(opts: Omit<AppOptions, 'auth'> = {}) {
  const made = createApp(new Store(':memory:'), join(mkdtempSync(join(tmpdir(), 'edgy-')), 'assets'), undefined, { auth: 'accounts', ...opts });
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}, from?: string) => {
    const raw = typeof body === 'string' || body instanceof Uint8Array;
    const res = await made.app.request(path, {
      method,
      headers: { ...(body === undefined || raw ? {} : { 'content-type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : raw ? (body as string) : JSON.stringify(body),
    }, from ? { incoming: { socket: { remoteAddress: from } } } as never : undefined);
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, json, headers: res.headers };
  };
  const signup = async (email: string, name?: string) => {
    const r = await call('POST', '/api/auth/signup', { email, password: 'correct horse', name });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    const cookie = /edgy_session=([^;]+)/.exec(r.headers.get('set-cookie') ?? '')![1];
    return { cookie: { cookie: `edgy_session=${cookie}` }, user: r.json.user as { id: string } };
  };
  return { ...made, call, signup };
}

test('every answer says: not framed by another site, no Referer elsewhere, no guessed types', async () => {
  const s = server();
  for (const path of ['/api/health', '/api/docs', '/api/nothing-here']) {
    const r = await s.call('GET', path);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff', path);
    assert.equal(r.headers.get('referrer-policy'), 'same-origin', path);
    assert.equal(r.headers.get('x-frame-options'), 'SAMEORIGIN', path);
    assert.equal(r.headers.get('content-security-policy'), "frame-ancestors 'self'", path);
  }
  const a = await s.signup('ana@example.test');
  const url = (await s.call('POST', '/api/assets', PNG, { ...a.cookie, 'content-type': 'image/png' })).json.url;
  const pic = await s.call('GET', url);
  assert.match(pic.headers.get('content-security-policy')!, /sandbox/, 'a picture keeps its own, stricter policy');
  assert.equal(pic.headers.get('x-content-type-options'), 'nosniff');
});

test('an /api address no route answers is a JSON 404, once signed in', async () => {
  const s = server();
  assert.equal((await s.call('GET', '/api/nothing-here')).status, 401, 'signed out, it asks for a sign-in first');
  const a = await s.signup('ana@example.test');
  const r = await s.call('GET', '/api/nothing-here', undefined, a.cookie);
  assert.deepEqual([r.status, r.json.error], [404, 'no such route: GET /api/nothing-here']);
});

test('a body larger than the limit is refused; nobody without a credential gets to send one', async () => {
  const s = server();
  const big = await s.call('POST', '/api/auth/signin', { email: 'a@b.co', password: 'x'.repeat(70_000) });
  assert.deepEqual([big.status, big.json.error], [413, 'that request is larger than 64 KB']);
  assert.equal((await s.call('POST', '/api/docs', 'x'.repeat(17 * 1024 * 1024), { 'content-type': 'application/json' })).status, 401, 'signed out: refused before the body counts');
  const a = await s.signup('ana@example.test');
  const id = (await s.call('POST', '/api/docs', { title: 'T' }, a.cookie)).json.id;
  const huge = await s.call('POST', `/api/docs/${id}/ops`, { ops: [['meta', 'description', 'x'.repeat(17 * 1024 * 1024)]] }, a.cookie);
  assert.deepEqual([huge.status, huge.json.error], [413, 'that request is larger than 16 MB']);
  assert.equal((await s.call('POST', `/api/docs/${id}/ops`, { ops: [['meta', 'description', 'x'.repeat(1024 * 1024)]] }, a.cookie)).status, 200, 'a megabyte is fine');
});

test('JSON that is not an object is the route\'s own 400, not a server error', async () => {
  const s = server();
  assert.equal((await s.call('POST', '/api/auth/signup', null)).status, 400);
  assert.equal((await s.call('POST', '/api/auth/signin', 7)).status, 401, 'no email: a wrong sign-in, not a crash');
  const a = await s.signup('ana@example.test');
  const id = (await s.call('POST', '/api/docs', { title: 'T' }, a.cookie)).json.id;
  for (const body of [null, [], 'text', 3]) {
    const r = await s.call('POST', `/api/docs/${id}/ops`, body, a.cookie);
    assert.equal(r.status, 400, `${JSON.stringify(body)}: ${JSON.stringify(r.json)}`);
  }
  assert.equal((await s.call('POST', `/api/docs/${id}/messages`, null, a.cookie)).status, 400);
  assert.equal((await s.call('PATCH', '/api/me', null, a.cookie)).status, 200, 'nothing to change is no change');
});

test('the history comes in pages of at most 500, whatever limit is asked for', async () => {
  const s = server();
  const a = await s.signup('ana@example.test');
  const id = (await s.call('POST', '/api/docs', { title: 'T' }, a.cookie)).json.id;
  for (let i = 0; i < 210; i++) await s.call('POST', `/api/docs/${id}/ops`, { ops: [['meta', 'description', `d${i}`]] }, a.cookie);
  const n = async (q: string) => (await s.call('GET', `/api/docs/${id}/log${q}`, undefined, a.cookie)).json.length;
  assert.equal(await n(''), 200);
  assert.equal(await n('?limit=-1'), 200, 'a negative limit is not "everything"');
  assert.equal(await n('?limit=abc'), 200);
  assert.equal(await n('?limit=5'), 5);
  assert.equal(await n('?limit=100000'), 210, 'capped at 500, and this one has 210');
  assert.equal(await n('?since=abc&limit=3'), 3);
});

test('a picture is what its bytes are, whatever the request says', async () => {
  const s = server();
  const a = await s.signup('ana@example.test');
  const up = (body: string | Buffer, type: string) => s.call('POST', '/api/assets', body instanceof Buffer ? new Uint8Array(body) : body, { ...a.cookie, 'content-type': type });
  const page = await up('<html><script>alert(1)</script></html>', 'image/png');
  assert.deepEqual([page.status, page.json.error], [415, 'that file is not a PNG, JPEG, GIF, WebP, AVIF or SVG picture']);
  assert.equal((await up('hello', 'text/html')).status, 415);
  assert.match((await up(PNG, 'image/jpeg')).json.url, /^\/assets\/[a-f0-9]{20}\.png$/, 'a PNG called a JPEG is kept as the PNG it is');
  const svg = '<?xml version="1.0"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n<svg xmlns="http://www.w3.org/2000/svg"/>';
  assert.match((await up(svg, 'image/svg+xml')).json.url, /\.svg$/, 'an SVG with a doctype, as editors save them');
});

test('sign-ups can be closed once the server has its first account', async () => {
  const s = server({ env: { EDGY_SIGNUPS: 'off' } });
  await s.signup('owner@example.test', 'Owner');
  const r = await s.call('POST', '/api/auth/signup', { email: 'stranger@example.test', password: 'correct horse' });
  assert.deepEqual([r.status, r.json.reason], [403, 'closed']);
  assert.equal((await s.call('POST', '/api/auth/signin', { email: 'owner@example.test', password: 'correct horse' })).status, 200, 'the owner still signs in');
  assert.equal((await s.call('GET', '/api/health')).json.signups, false, 'the sign-in page can tell');
  assert.equal((await server().call('GET', '/api/health')).json.signups, true);
});

test('one address makes a few accounts, then waits', async () => {
  let now = 1_000_000;
  const s = server({ now: () => now });
  for (let i = 0; i < 11; i++) await s.signup(`p${i}@example.test`);
  const r = await s.call('POST', '/api/auth/signup', { email: 'p11@example.test', password: 'correct horse' });
  assert.equal(r.status, 429);
  assert.match(r.json.error, /Too many new accounts from here/);
  now += 2000;
  await s.signup('p11@example.test');
});

test('behind a proxy on this machine, each forwarded address is slowed down on its own; from elsewhere the header counts for nothing', async () => {
  let now = 1_000_000;
  const s = server({ now: () => now });
  const signin = (email: string, xff: string, from: string) =>
    s.call('POST', '/api/auth/signin', { email, password: 'wrong wrong' }, { 'x-forwarded-for': xff }, from);
  // 31 wrong guesses, each for a different email, from one person behind the proxy.
  for (let i = 0; i < 31; i++) assert.equal((await signin(`g${i}@example.test`, '203.0.113.9', '127.0.0.1')).status, 401);
  assert.equal((await signin('next@example.test', '203.0.113.9', '127.0.0.1')).status, 429, 'that person waits');
  assert.equal((await signin('next@example.test', '198.51.100.7', '127.0.0.1')).status, 401, 'someone else behind the same proxy does not');
  assert.equal((await signin('next@example.test', '10.0.0.1, 198.51.100.8', '127.0.0.1')).status, 401, 'the last hop is the one the proxy added');
  // Straight from the internet, X-Forwarded-For is the caller's own word: changing it changes nothing.
  for (let i = 0; i < 31; i++) await signin(`h${i}@example.test`, `192.0.2.${i}`, '198.51.100.50');
  assert.equal((await signin('next@example.test', '192.0.2.200', '198.51.100.50')).status, 429);
});

test('behind a proxy that ends HTTPS, the browser\'s own writes go through, other sites\' still do not, and links say https', async () => {
  const s = server();
  const a = await s.signup('ana@example.test');
  // As a proxy hands it on: plain http to this process, the host the browser asked for, X-Forwarded-Proto https.
  const asBrowser = (origin: string, path = '/api/docs', body: unknown = { title: 'T' }) =>
    s.app.request(`http://edgy.example.org${path}`, {
      method: 'POST',
      headers: { ...a.cookie, 'content-type': 'application/json', origin, 'sec-fetch-site': origin === 'https://edgy.example.org' ? 'same-origin' : 'cross-site', 'x-forwarded-proto': 'https', 'x-forwarded-for': '203.0.113.4' },
      body: JSON.stringify(body),
    });
  const made = await asBrowser('https://edgy.example.org');
  assert.equal(made.status, 201, await made.clone().text());
  assert.equal((await asBrowser('https://evil.example')).status, 403, 'another site still can not');
  const id = ((await made.json()) as { id: string }).id;
  const link = (await (await asBrowser('https://edgy.example.org', `/api/docs/${id}/shares`, { access: 'view' })).json()) as { url: string };
  assert.match(link.url, /^https:\/\/edgy\.example\.org\/s\//, 'a share link has the address people open');
  // A proxy that sends its own host name on (nginx's default) says which one the browser asked for.
  const renamed = await s.app.request('http://127.0.0.1:8787/api/docs', {
    method: 'POST',
    headers: { ...a.cookie, 'content-type': 'application/json', origin: 'https://edgy.example.org', 'sec-fetch-site': 'same-origin', 'x-forwarded-proto': 'https', 'x-forwarded-host': 'edgy.example.org' },
    body: JSON.stringify({ title: 'T' }),
  });
  assert.equal(renamed.status, 201);
});

test('a throttle forgets old entries rather than growing without end', () => {
  let now = 0;
  const t = new Throttle({ now: () => now });
  for (let i = 0; i < 10_000; i++) t.fail(`e${i}`);
  now += 16 * 60_000;
  t.fail('fresh');
  assert.equal(t.wait('e1'), 0);
  assert.equal((t as unknown as { seen: Map<string, unknown> }).seen.size, 1, 'everything past its window went at once');
  for (let i = 0; i < 12_000; i++) t.fail(`f${i}`);
  assert.ok((t as unknown as { seen: Map<string, unknown> }).seen.size <= 10_000, 'and fresh ones are capped');
});

test("Claude answers in the server owner's documents; others get the built-in composer", async () => {
  const s = server({ env: { ANTHROPIC_API_KEY: 'test-key' } });
  const owner = await s.signup('owner@example.test', 'Owner');
  const ben = await s.signup('ben@example.test', 'Ben');
  const ai = async (as: Record<string, string>, doc?: string) => (await s.call('GET', `/api/ai${doc ? `?doc=${doc}` : ''}`, undefined, as)).json.providers.claude;
  assert.equal(await ai(owner.cookie), true);
  assert.equal(await ai(ben.cookie), false);
  const owners = (await s.call('POST', '/api/docs', { title: 'Owner', root: ['input', { name: 'qty', type: 'number', value: 2 }] }, owner.cookie)).json.id;
  await s.call('POST', `/api/docs/${owners}/people`, { email: 'ben@example.test', role: 'editor' }, owner.cookie);
  assert.equal(await ai(ben.cookie, owners), true, "in the owner's document, for someone the owner lets edit it");
  const bens = (await s.call('POST', '/api/docs', { title: 'Ben', root: ['input', { name: 'qty', type: 'number', value: 2 }] }, ben.cookie)).json.id;
  assert.equal(await ai(ben.cookie, bens), false);
  const r = await s.call('POST', `/api/docs/${bens}/compose`, { prompt: 'qty times two', provider: 'claude' }, ben.cookie);
  assert.equal(r.json.provider, 'local');
  assert.match(r.json.notes[0], /not set up for this document/);
  const open = server({ env: { ANTHROPIC_API_KEY: 'test-key', EDGY_AI_USERS: 'all' } });
  await open.signup('owner@example.test');
  const other = await open.signup('ben@example.test');
  assert.equal((await open.call('GET', '/api/ai', undefined, other.cookie)).json.providers.claude, true, 'EDGY_AI_USERS=all lets everyone');
});

test("someone else who can edit a document neither hears nor answers the owner's request to an agent", async () => {
  const s = server();
  const ana = await s.signup('ana@example.test', 'Ana');
  const ben = await s.signup('ben@example.test', 'Ben');
  const id = (await s.call('POST', '/api/docs', { title: 'Quote', root: ['col', ['input', { name: 'qty', type: 'number', value: 2 }], ['formula', { name: 'total' }, 0]] }, ana.cookie)).json.id;
  await s.call('POST', `/api/docs/${id}/people`, { email: 'ben@example.test', role: 'editor' }, ana.cookie);
  // Ben listens on Ana's document, as if he were her agent.
  const bens = s.call('GET', `/api/docs/${id}/messages/wait?timeout=2`, undefined, ben.cookie);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal((await s.call('GET', `/api/ai?doc=${id}`, undefined, ana.cookie)).json.providers.agent, false, "Ben's listening is not Ana's agent");
  const asked = await s.call('POST', `/api/docs/${id}/compose`, { prompt: 'qty times two', cell: 'total', provider: 'agent' }, ana.cookie);
  assert.equal(asked.json.provider, 'local', 'with no agent of hers listening, the built-in composer answers');
  assert.deepEqual((await bens).json.requests, [], 'and Ben heard nothing');
  // Ana's own agent listens: it gets the request; Ben can't answer it in its place.
  const anas = s.call('GET', `/api/docs/${id}/messages/wait?timeout=5`, undefined, ana.cookie);
  await new Promise((r) => setTimeout(r, 30));
  const composing = s.call('POST', `/api/docs/${id}/compose`, { prompt: 'qty times two', cell: 'total' }, ana.cookie);
  const req = (await anas).json.requests[0];
  assert.equal(req.prompt, 'qty times two');
  assert.equal((await s.call('POST', `/api/docs/${id}/compose/${req.id}`, { code: '(* qty 100)' }, ben.cookie)).status, 404);
  assert.equal((await s.call('POST', `/api/docs/${id}/compose/${req.id}`, { code: '(* qty 2)' }, ana.cookie)).status, 200);
  assert.equal((await composing).json.code, '(* qty 2)');
});

test('lists of ids in one request have a limit', async () => {
  const s = server();
  const a = await s.signup('ana@example.test');
  const many = Array.from({ length: 1001 }, (_, i) => `d${i}`);
  assert.equal((await s.call('POST', '/api/decks', { title: 'Big', docs: many }, a.cookie)).status, 400);
  assert.equal((await s.call('POST', '/api/library/pins', { ids: many }, a.cookie)).status, 400);
  assert.equal((await s.call('POST', '/api/library/bulk', { action: 'pin', ids: many }, a.cookie)).status, 400);
  assert.equal((await s.call('POST', '/api/library/bulk', { action: 'pin', ids: many.slice(0, 1000) }, a.cookie)).status, 200, 'a thousand is fine');
});

test('the docs folder serves its own files only: not a sibling whose name starts the same, not a malformed address', async () => {
  const { Hono } = await import('hono');
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const { serveDocs } = await import('./docs');
  const base = mkdtempSync(join(tmpdir(), 'edgy-docs-'));
  mkdirSync(join(base, 'docs'));
  mkdirSync(join(base, 'docs-old'));
  writeFileSync(join(base, 'docs', 'index.html'), '<html><head></head><body>docs</body></html>');
  writeFileSync(join(base, 'docs', '404.html'), '<html><head></head><body>not here</body></html>');
  writeFileSync(join(base, 'docs-old', 'secret.html'), '<html><head></head><body>secret</body></html>');
  const app = new Hono();
  serveDocs(app, join(base, 'docs'));
  const get = async (path: string) => {
    const res = await app.request(path);
    return { status: res.status, text: await res.text() };
  };
  assert.match((await get('/docs/')).text, /docs/);
  const sibling = await get('/docs/..%2Fdocs-old%2Fsecret.html');
  assert.equal(sibling.status, 404);
  assert.ok(!sibling.text.includes('secret'), 'the sibling folder is not served');
  assert.equal((await get('/docs/%E0%A4%A')).status, 404, 'a malformed address is a missing page, not a server error');
});
