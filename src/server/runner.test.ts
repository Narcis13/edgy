import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type AppOptions, createApp } from './app';
import { Store } from './store';
import { type Clock, FetchError, type Getter, getGuarded, isPrivateAddress } from './runner';
import { read } from '../core/sx';
import type { Json } from '../core/types';

/** A clock that only moves when told to, running due timers in order. */
class FakeClock implements Clock {
  t = Date.UTC(2026, 9, 2, 9);
  private timers = new Map<number, { at: number; fn: () => void; every?: number }>();
  private n = 0;
  now = () => this.t;
  setTimeout = (fn: () => void, ms: number) => { this.timers.set(++this.n, { at: this.t + ms, fn }); return this.n; };
  setInterval = (fn: () => void, ms: number) => { this.timers.set(++this.n, { at: this.t + ms, fn, every: ms }); return this.n; };
  clearTimeout = (h: unknown) => void this.timers.delete(h as number);
  clearInterval = (h: unknown) => void this.timers.delete(h as number);
  get pending() { return this.timers.size; }
  advance(ms: number) {
    const end = this.t + ms;
    for (;;) {
      const next = [...this.timers.entries()].filter(([, x]) => x.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      const [h, x] = next;
      this.t = x.at;
      if (x.every) x.at += x.every;
      else this.timers.delete(h);
      x.fn();
    }
    this.t = end;
  }
}

function setup(opts: AppOptions = {}) {
  const clock = new FakeClock();
  const { app, hub, runner } = createApp(new Store(':memory:'), join(mkdtempSync(join(tmpdir(), 'edgy-')), 'assets'), undefined, { clock, ...opts });
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await app.request(path, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json()) as any };
  };
  const make = async (root: Json) => (await call('POST', '/api/docs', { title: 'Events', root })).json.id as string;
  const values = async (id: string) => (await call('GET', `/api/docs/${id}/read`)).json.values as Record<string, unknown>;
  return { clock, call, hub, runner, make, values };
}

const sx = (s: string) => read(s) as Json;

test('a timer ticks every 2 s while someone is in Live, and stops when stopped or when everyone leaves', async () => {
  const { clock, runner, make, values, call } = setup();
  const id = await make(['col',
    ['timer', { name: 'poll', every: 2, on: { tick: sx('(set! n (+ n 1))') } }],
    ['timer', { name: 'once', after: 3, on: { tick: sx('(set! m (+ m 1))') } }],
    ['data', { name: 'n' }, 0], ['data', { name: 'm' }, 0]]);
  // In Edit nothing runs.
  const editing = runner.join(id, 'a', 'edit');
  clock.advance(7000);
  assert.deepEqual(await values(id), { poll: true, once: true, n: 0, m: 0 });
  runner.mode(id, 'a', 'live');
  clock.advance(7000);
  assert.equal((await values(id)).n, 3);
  assert.equal((await values(id)).m, 1, 'the one-off delay runs once');
  clock.advance(10_000);
  assert.equal((await values(id)).m, 1);
  // A second person in Live does not make it tick twice.
  const other = runner.join(id, 'b', 'live');
  clock.advance(2000);
  assert.equal((await values(id)).n, 9);
  // An action stops it.
  await call('POST', `/api/docs/${id}/ops`, { actor: { kind: 'human', name: 'Ann' }, client: 'a', ops: [['set', 'poll', 'value', false]] });
  clock.advance(6000);
  assert.equal((await values(id)).n, 9);
  assert.deepEqual(runner.scheduled(id), { timers: 0, polls: 0 });
  // Started again, then everyone leaves: no more ticks, no timers left.
  await call('POST', `/api/docs/${id}/ops`, { actor: { kind: 'human', name: 'Ann' }, client: 'a', ops: [['set', 'poll', 'value', clock.now()]] });
  clock.advance(2000);
  assert.equal((await values(id)).n, 10);
  runner.leave(id, editing);
  runner.leave(id, other);
  assert.equal(clock.pending, 0);
  clock.advance(10_000);
  assert.equal((await values(id)).n, 10);
});

test('the server runs a tick handler once and logs it as Events, with a trace for Activity', async () => {
  const { clock, runner, make, hub, call } = setup();
  const id = await make(['col', ['timer', { name: 't', every: 1, on: { tick: sx('(set! n count)') } }], ['data', { name: 'n' }, 0]]);
  const seen: { type: string; trace?: unknown[] }[] = [];
  hub.subscribe(id, (e) => seen.push(e as never));
  runner.join(id, 'a', 'live');
  clock.advance(1000);
  assert.deepEqual(seen.map((e) => e.type), ['ops', 'trace']);
  const trace = seen[1].trace as { name: string; ops: unknown[] }[];
  assert.equal(trace[0].name, 'tick');
  assert.equal(trace[0].ops.length, 1);
  const log = (await call('GET', `/api/docs/${id}/log`)).json as { actor: { name: string } }[];
  assert.equal(log.at(-1)!.actor.name, 'Events');
});

test('fetch: loading, the answer, the load handler and a formula reading a field', async () => {
  const { runner, make, values, hub, call } = setup();
  const id = await make(['col',
    ['fetch', { name: 'rate', on: { load: sx('(set! seen (get data "rate"))') } }, '/api/demo/rate?rate=4.2'],
    ['formula', { name: 'shown' }, sx('(str (status rate) " " (get rate "rate"))')],
    ['data', { name: 'seen' }, 0]]);
  const states: string[] = [];
  hub.subscribe(id, (e) => { if (e.type === 'fetch') states.push(e.state.state); });
  assert.equal((await values(id)).shown, 'idle ');
  runner.join(id, 'a', 'live');
  await runner.settled();
  assert.deepEqual(states, ['loading', 'ready']);
  const v = await values(id);
  assert.equal(v.shown, 'ready 4.2');
  assert.equal(v.seen, 4.2);
  assert.deepEqual(v.rate, { base: 'EUR', quote: 'RON', rate: 4.2, at: (v.rate as { at: string }).at });
  const fetched = (await call('GET', `/api/docs/${id}/fetched`)).json;
  assert.equal(Object.values(fetched as Record<string, { state: string }>)[0].state, 'ready');
  assert.match((await call('GET', `/api/docs/${id}/read`)).json.outline, /fetch rate \/api\/demo\/rate\?rate=4.2 ready/);
});

test('fetch: a 500 and an unreachable address run fail with a message, and the error shows', async () => {
  const get: Getter = async () => { throw new FetchError('the address unreachable.invalid could not be found'); };
  const { runner, make, values, call } = setup({ get });
  const id = await make(['col',
    ['fetch', { name: 'down', on: { fail: sx('(set! why message)') } }, '/api/demo/fail'],
    ['fetch', { name: 'gone', on: { fail: sx('(set! why2 (str status ":" message))') } }, 'https://unreachable.invalid/x.json'],
    ['formula', { name: 'problem' }, sx('(error-of down)')],
    ['data', { name: 'why' }, ''], ['data', { name: 'why2' }, '']]);
  runner.join(id, 'a', 'live');
  await runner.settled();
  const v = await values(id);
  assert.equal(v.why, 'the server answered 500: the demo service is down');
  assert.equal(v.why2, ':the address unreachable.invalid could not be found');
  assert.equal(v.problem, 'the server answered 500: the demo service is down');
  const r = await call('POST', `/api/docs/${id}/fetch/down`, { handlers: false });
  assert.equal(r.json.state, 'failed');
  assert.match((await call('GET', `/api/docs/${id}/read`)).json.outline, /failed: the server answered 500/);
});

test('fetch: secrets come from the server, refreshes repeat on an interval, and requests are shared', async () => {
  const seen: Record<string, string>[] = [];
  let calls = 0;
  const get: Getter = async (_url, headers) => {
    seen.push(headers);
    calls++;
    return { status: 200, body: JSON.stringify({ n: calls }) };
  };
  const { clock, runner, make, values, call } = setup({ get, env: { EDGY_SECRET_RATES_KEY: 'k-123' } });
  const id = await make(['col',
    ['fetch', { name: 'f', every: 10, headers: { Authorization: 'secret:RATES_KEY' } }, 'https://api.example.com/n'],
    ['fetch', { name: 'nokey', headers: { Authorization: 'secret:MISSING' } }, 'https://api.example.com/n']]);
  const doc = (await call('GET', `/api/docs/${id}`)).json;
  assert.ok(!JSON.stringify(doc).includes('k-123'), 'the secret is never in the document');
  runner.join(id, 'a', 'live');
  await runner.settled();
  assert.equal(seen[0].authorization, 'k-123');
  assert.deepEqual((await values(id)).f, { n: 1 });
  assert.match((await call('GET', `/api/docs/${id}/read`)).json.outline, /failed: the secret MISSING is not set on this server/);
  clock.advance(10_000);
  await runner.settled();
  assert.deepEqual((await values(id)).f, { n: 2 });
  const fid = Object.keys((await call('GET', `/api/docs/${id}/fetched`)).json)[0];
  const [a, b] = await Promise.all([runner.refresh(id, fid), runner.refresh(id, fid)]);
  assert.deepEqual(a, b);
  assert.equal(calls, 3, 'two refreshes at once share one request');
});

test('an agent changing a value sets off its handler on the server, but only while someone is in Live', async () => {
  const { runner, make, values, call } = setup();
  const id = await make(['col', ['input', { name: 'qty', type: 'number', value: 1, on: { change: sx('(set! doubled (* value 2))') } }], ['data', { name: 'doubled' }, 0]]);
  const agent = { kind: 'agent', name: 'Claude' };
  await call('POST', `/api/docs/${id}/ops`, { actor: agent, ops: [['set', 'qty', 'value', 3]] });
  assert.equal((await values(id)).doubled, 0);
  runner.join(id, 'a', 'live');
  await call('POST', `/api/docs/${id}/ops`, { actor: agent, ops: [['set', 'qty', 'value', 5]] });
  assert.equal((await values(id)).doubled, 10);
  // A person's browser ran its own handlers; the server doesn't run them again.
  await call('POST', `/api/docs/${id}/ops`, { actor: { kind: 'human', name: 'Ann' }, client: 'a', ops: [['set', 'qty', 'value', 7]] });
  assert.equal((await values(id)).doubled, 10);
});

test('viewers switch modes over HTTP, and the demo answers work', async () => {
  const { runner, make, call } = setup();
  const id = await make(['timer', { name: 't', every: 5 }]);
  runner.join(id, 'a', 'edit');
  assert.equal((await call('POST', `/api/docs/${id}/viewer`, { client: 'a', mode: 'live' })).json.live, true);
  assert.equal(runner.scheduled(id).timers, 1);
  assert.equal((await call('POST', `/api/docs/${id}/viewer`, { client: 'a', mode: 'page' })).json.live, false);
  assert.equal(runner.scheduled(id).timers, 0);
  assert.equal((await call('POST', `/api/docs/${id}/viewer`, { client: 'a', mode: 'nope' })).status, 400);
  assert.equal((await call('GET', '/api/demo/rate?rate=6')).json.rate, 6);
  assert.equal((await call('GET', '/api/demo/fail')).status, 500);
});

test('private and local addresses are refused before connecting', async () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) {
    assert.ok(isPrivateAddress(ip), ip);
  }
  for (const ip of ['93.184.216.34', '1.1.1.1', '2606:4700::1111']) assert.ok(!isPrivateAddress(ip), ip);
  await assert.rejects(getGuarded('http://127.0.0.1:9/x', {}, { ms: 1000, bytes: 1000 }), /private or local address/);
  await assert.rejects(getGuarded('http://[::1]:9/x', {}, { ms: 1000, bytes: 1000 }), /private or local address/);
});
