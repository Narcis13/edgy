// What happens by itself: timers ticking, fetch cells getting their JSON, and
// the handlers those set off, plus the handlers set off by agents' changes.
// It all runs here, on the server, once per document, and only while at
// least one person has the document open in Live. People's own clicks and
// changes run in their browsers (web/session.ts); this is everything else.

import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import type { Actor, Doc, Json, Op } from '../core/types';
import { applyOps } from '../core/ops';
import { type World, evaluate } from '../core/engine';
import { type Fired, type Start, type TraceEntry, durationMs, react } from '../core/events';
import { type FetchState, deepEqual } from '../core/sx';
import { walk } from '../core/tree';
import type { Hub } from './hub';
import type { Store } from './store';

/** Who the log shows for changes made by handlers the server ran. */
export const EVENTS_ACTOR: Actor = { kind: 'agent', name: 'Events' };

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(h: unknown): void;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(h: unknown): void;
}

export const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
};

/** An answer from the network, before it is read as JSON. */
export interface Got {
  status: number;
  body: string;
}

/** Gets a URL: limits, redirects and the address check are its job. */
export type Getter = (url: string, headers: Record<string, string>, limits: Limits) => Promise<Got>;

export interface Limits {
  ms: number;
  bytes: number;
}

export const LIMITS: Limits = { ms: 10_000, bytes: 1024 * 1024 };
/** The shortest refresh interval a fetch cell gets, whatever it asks for. */
export const MIN_REFRESH = 5_000;
/** The shortest interval a timer gets. */
export const MIN_TICK = 1_000;

/** The paths on this server a fetch cell may read. */
const LOCAL_PATHS = [/^\/api\/data\/[\w-]+(\?.*)?$/, /^\/api\/demo\/[\w-]+(\?.*)?$/];

/** A promise that gives up after `ms`. */
function withDeadline<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new FetchError(`no answer within ${ms / 1000} s`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export class FetchError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

export interface RunnerDeps {
  store: Store;
  hub: Hub;
  clock?: Clock;
  /** Answers a path on this server ("/api/demo/rate") in process. */
  local?: (path: string, headers: Record<string, string>) => Promise<Got>;
  /** Gets an http(s) address; by default with node's http, refusing private addresses. */
  get?: Getter;
  env?: Record<string, string | undefined>;
  limits?: Limits;
}

interface Timer {
  key: string;
  handle: unknown;
  every: boolean;
  count: number;
}

interface Poll {
  key: string;
  handle: unknown;
}

/** One document while someone has it open in Live. */
interface Live {
  timers: Map<string, Timer>;
  polls: Map<string, Poll>;
}

export class Runner {
  private viewers = new Map<string, Map<number, { client: string; mode: string }>>();
  private live = new Map<string, Live>();
  private fetched = new Map<string, Map<string, FetchState>>();
  private inflight = new Map<string, { p: Promise<FetchState>; job: { handlers: boolean } }>();
  private clock: Clock;
  private limits: Limits;
  private n = 0;

  constructor(private deps: RunnerDeps) {
    this.clock = deps.clock ?? realClock;
    this.limits = deps.limits ?? LIMITS;
  }

  // ── who is looking ──

  /** A browser connected (or switched mode). Returns a token to pass to `leave`. */
  join(doc: string, client: string, mode: string): number {
    const token = ++this.n;
    let room = this.viewers.get(doc);
    if (!room) this.viewers.set(doc, (room = new Map()));
    room.set(token, { client, mode });
    this.update(doc);
    return token;
  }

  leave(doc: string, token: number): void {
    const room = this.viewers.get(doc);
    if (!room) return;
    room.delete(token);
    if (!room.size) this.viewers.delete(doc);
    this.update(doc);
  }

  /** A browser switched between Edit, Live and Page. */
  mode(doc: string, client: string, mode: string): void {
    for (const v of this.viewers.get(doc)?.values() ?? []) if (v.client === client) v.mode = mode;
    this.update(doc);
  }

  isLive(doc: string): boolean {
    return [...(this.viewers.get(doc)?.values() ?? [])].some((v) => v.mode === 'live');
  }

  private update(doc: string): void {
    if (this.isLive(doc)) {
      if (!this.live.has(doc)) this.live.set(doc, { timers: new Map(), polls: new Map() });
      this.sync(doc);
    } else this.stop(doc);
  }

  /** The document was deleted, or nobody is in Live any more: every timer stops. */
  stop(doc: string): void {
    const run = this.live.get(doc);
    if (!run) return;
    for (const t of run.timers.values()) this.clearTimer(t);
    for (const p of run.polls.values()) this.clock.clearInterval(p.handle);
    this.live.delete(doc);
  }

  /** Stop everything (the server is shutting down, or a test is over). */
  close(): void {
    for (const doc of [...this.live.keys()]) this.stop(doc);
  }

  private clearTimer(t: Timer): void {
    if (t.handle === null) return;
    if (t.every) this.clock.clearInterval(t.handle);
    else this.clock.clearTimeout(t.handle);
  }

  // ── the document changed ──

  /** Call after every saved change: timers and fetches follow what the document now says. */
  changed(doc: string): void {
    if (this.live.has(doc)) this.sync(doc);
  }

  /** Bring the document's timers and fetch refreshes in line with its cells. */
  private sync(docId: string): void {
    const run = this.live.get(docId);
    const doc = this.deps.store.getDoc(docId);
    if (!run) return;
    if (!doc) return this.stop(docId);
    const computed = evaluate(doc, this.world(docId));
    const seenTimers = new Set<string>();
    const seenPolls = new Set<string>();
    walk(doc.root, (c) => {
      if (c.kind === 'timer') {
        const every = durationMs(c.every);
        const after = every ? null : durationMs(c.after);
        if (c.value === false || (!every && !after)) return;
        seenTimers.add(c.id);
        const key = JSON.stringify([c.every ?? null, c.after ?? null, c.value ?? null]);
        const had = run.timers.get(c.id);
        if (had?.key === key) return;
        if (had) this.clearTimer(had);
        const t: Timer = { key, handle: null, every: !!every, count: 0 };
        const tick = () => {
          t.count++;
          // A one-off delay is done; it stays listed so it doesn't run again until changed or reopened.
          if (!t.every) t.handle = null;
          this.apply(docId, { events: [{ cell: c.id, name: 'tick', data: { count: t.count, at: this.clock.now() } }] });
        };
        t.handle = every ? this.clock.setInterval(tick, Math.max(MIN_TICK, every)) : this.clock.setTimeout(tick, after!);
        run.timers.set(c.id, t);
      } else if (c.kind === 'fetch') {
        const url = String(computed.cells[c.id]?.props?.url ?? c.url ?? '');
        if (!url) return;
        seenPolls.add(c.id);
        const every = durationMs(c.every);
        const key = JSON.stringify([url, c.every ?? null, c.headers ?? null]);
        const had = run.polls.get(c.id);
        if (had?.key === key) return;
        if (had) this.clock.clearInterval(had.handle);
        const poll: Poll = { key, handle: null };
        if (every) poll.handle = this.clock.setInterval(() => void this.refresh(docId, c.id), Math.max(MIN_REFRESH, every));
        run.polls.set(c.id, poll);
        // First time seen while live, or its address changed: fetch now, unless an answer for this address is fresh.
        const st = this.fetched.get(docId)?.get(c.id);
        const fresh = st?.state === 'ready' && st.at !== undefined && (st as FetchState & { url?: string }).url === url
          && this.clock.now() - st.at < (every ?? 60_000);
        if (!fresh) void this.refresh(docId, c.id);
      }
    });
    for (const [id, t] of run.timers) if (!seenTimers.has(id)) { this.clearTimer(t); run.timers.delete(id); }
    for (const [id, p] of run.polls) if (!seenPolls.has(id)) { this.clock.clearInterval(p.handle); run.polls.delete(id); }
  }

  /** How many timers and refreshes are scheduled for a document (for tests and the health of things). */
  scheduled(doc: string): { timers: number; polls: number } {
    const run = this.live.get(doc);
    return { timers: [...(run?.timers.values() ?? [])].filter((t) => t.handle !== null).length, polls: [...(run?.polls.values() ?? [])].filter((p) => p.handle !== null).length };
  }

  // ── running handlers here ──

  world(doc: string): World {
    const states = this.fetched.get(doc);
    return { rows: (name) => this.deps.store.rows(name), now: this.clock.now(), fetched: (id) => states?.get(id) };
  }

  /** Fetch states of a document, by cell id, for browsers and agents. */
  states(doc: string): Record<string, FetchState> {
    return Object.fromEntries(this.fetched.get(doc) ?? []);
  }

  /** An agent changed the document: run the handlers that follow, if someone is in Live. */
  agentChanged(docId: string, before: Doc, ops: Op[]): void {
    if (!this.isLive(docId)) return;
    this.apply(docId, { ops }, before);
  }

  /**
   * Run what `start` sets off on the stored document, save the changes as one
   * version, carry out records and fetches, and tell every browser what ran.
   * With `from`, `start.ops` were already saved: `from` is the document before them.
   */
  apply(docId: string, start: Start, from?: Doc): TraceEntry[] {
    const stored = this.deps.store.getDoc(docId);
    if (!stored) return [];
    const r = react(from ?? stored, this.world(docId), start, this.clock.now());
    if (r.ops.length) {
      try {
        const done = applyOps(stored, r.ops);
        const next: Doc = { ...done.doc, v: stored.v + 1 };
        const ops = r.ops.length === 1 ? [done.op] : (done.op.slice(1) as Op[]);
        const ts = this.deps.store.saveDoc(next, EVENTS_ACTOR, ops);
        this.deps.hub.publish(docId, { type: 'ops', v: next.v, ts, actor: EVENTS_ACTOR, ops, touched: done.touched });
      } catch (e) {
        r.trace.push({ cell: null, name: 'save', depth: 0, ops: [], effects: [], at: this.clock.now(), error: e instanceof Error ? e.message : String(e) });
      }
    }
    for (const e of r.effects) this.effect(docId, e);
    if (r.trace.length) this.deps.hub.publish(docId, { type: 'trace', trace: r.trace });
    if (r.ops.length) this.changed(docId);
    return r.trace;
  }

  /** Records and fetches a handler asked for. */
  effect(docId: string, e: { type: string } & Record<string, unknown>): void {
    const { store, hub } = this.deps;
    const plain = (v: unknown) => JSON.parse(JSON.stringify(v ?? null)) as Record<string, Json>;
    if (e.type === 'insert') store.insert(String(e.collection), plain(e.record), { doc: docId, events: true });
    else if (e.type === 'update') store.update(String(e.collection), String(e.id), plain(e.fields));
    else if (e.type === 'delete') store.deleteRow(String(e.collection), String(e.id));
    else if (e.type === 'clear') store.clear(String(e.collection));
    else if (e.type === 'refresh') return void this.refresh(docId, String(e.cell));
    else return;
    hub.publishAll({ type: 'data', collection: String(e.collection) });
  }

  // ── fetching ──

  /** Resolves once every fetch on its way has finished (for tests). */
  async settled(): Promise<void> {
    while (this.inflight.size) await Promise.allSettled([...this.inflight.values()].map((f) => f.p));
  }

  /** The document is gone: forget its fetched answers too. */
  forget(doc: string): void {
    this.stop(doc);
    this.fetched.delete(doc);
  }

  private setState(docId: string, cell: string, st: FetchState & { url?: string }): void {
    let m = this.fetched.get(docId);
    if (!m) this.fetched.set(docId, (m = new Map()));
    m.set(cell, st);
    this.deps.hub.publish(docId, { type: 'fetch', cell, state: st });
  }

  /**
   * Fetch a fetch cell's address now. Concurrent calls share one request.
   * With `handlers` (the default) load or fail runs afterwards, once.
   */
  refresh(docId: string, cellId: string, handlers = true): Promise<FetchState> {
    const key = docId + '\n' + cellId;
    const running = this.inflight.get(key);
    if (running) {
      // Someone who wants load or fail joined a request that was started without them: they run once, at the end.
      if (handlers) running.job.handlers = true;
      return running.p;
    }
    const job = { handlers };
    const p = this.fetchNow(docId, cellId, job).finally(() => {
      this.inflight.delete(key);
      this.recheck(docId, cellId);
    });
    this.inflight.set(key, { p, job });
    return p;
  }

  /** The address changed while a request was on its way: fetch the new one, if someone is still looking. */
  private recheck(docId: string, cellId: string): void {
    const doc = this.deps.store.getDoc(docId);
    const cell = doc && walkFind(doc, cellId);
    const st = this.fetched.get(docId)?.get(cellId) as (FetchState & { url?: string }) | undefined;
    if (!doc || !cell || cell.kind !== 'fetch' || !st || !this.isLive(docId)) return;
    const url = String(evaluate(doc, this.world(docId)).cells[cellId]?.props?.url ?? cell.url ?? '');
    if (url && st.url !== url) void this.refresh(docId, cellId);
  }

  private async fetchNow(docId: string, cellId: string, job: { handlers: boolean }): Promise<FetchState> {
    const doc = this.deps.store.getDoc(docId);
    const cell = doc && walkFind(doc, cellId);
    if (!doc || !cell || cell.kind !== 'fetch') return { state: 'failed', error: 'there is no such fetch cell' };
    const before = this.fetched.get(docId)?.get(cellId);
    const url = String(evaluate(doc, this.world(docId)).cells[cellId]?.props?.url ?? cell.url ?? '');
    this.setState(docId, cellId, { ...before, state: 'loading', at: this.clock.now(), url } as FetchState);
    let st: FetchState & { url?: string };
    let events: Fired[];
    try {
      const data = await this.getJson(url, cell.headers);
      st = { state: 'ready', data, at: this.clock.now(), url };
      events = [{ cell: cellId, name: 'load', data: { data, value: data } }];
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      st = { state: 'failed', error: message, at: this.clock.now(), url, ...(before?.data !== undefined ? { data: before.data } : {}) };
      events = [{ cell: cellId, name: 'fail', data: { message, status: e instanceof FetchError ? e.status ?? null : null } }];
    }
    this.setState(docId, cellId, st);
    // Handlers run only while someone is still in Live: an answer arriving after everyone left changes nothing.
    if (job.handlers && this.isLive(docId)) {
      // load or fail, and change for the fetch and for whatever reads it when the answer differs.
      const moved = !deepEqual(before?.data ?? null, st.data ?? null);
      const now = this.world(docId);
      this.apply(docId, { events, ...(moved ? { before: { ...now, fetched: (id) => (id === cellId ? before : now.fetched?.(id)) } } : {}) });
    }
    return st;
  }

  /** The secret a header names ("secret:RATES_KEY" → EDGY_SECRET_RATES_KEY), never stored in the document. */
  private headers(h: Json | undefined): Record<string, string> {
    const out: Record<string, string> = { accept: 'application/json' };
    if (!h || typeof h !== 'object' || Array.isArray(h)) return out;
    const env = this.deps.env ?? process.env;
    for (const [k, v] of Object.entries(h)) {
      if (typeof v !== 'string') continue;
      const m = /^secret:([A-Za-z_][\w]*)$/.exec(v.trim());
      if (m) {
        const s = env[`EDGY_SECRET_${m[1]}`];
        if (!s) throw new FetchError(`the secret ${m[1]} is not set on this server (EDGY_SECRET_${m[1]})`);
        out[k.toLowerCase()] = s;
      } else out[k.toLowerCase()] = v;
    }
    return out;
  }

  async getJson(url: string, headers?: Json): Promise<Json> {
    if (!url) throw new FetchError('the fetch has no address');
    const h = this.headers(headers);
    let got: Got;
    if (url.startsWith('/')) {
      if (!this.deps.local) throw new FetchError('this server cannot answer its own paths');
      // Only read-only answers that end: saved records and the demo answers, never streams or another document.
      if (!LOCAL_PATHS.some((re) => re.test(url))) throw new FetchError('a path on this server can be /api/data/<collection> or /api/demo/…');
      got = await withDeadline(this.deps.local(url, h), this.limits.ms);
    } else {
      let u: URL;
      try { u = new URL(url); } catch { throw new FetchError(`"${url}" is not an address`); }
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new FetchError('only http and https addresses can be fetched');
      got = await (this.deps.get ?? getGuarded)(u.toString(), h, this.limits);
    }
    if (got.status < 200 || got.status >= 300) {
      let why = '';
      try {
        const j = JSON.parse(got.body) as { error?: unknown };
        if (typeof j?.error === 'string') why = `: ${j.error}`;
      } catch { /* not JSON */ }
      throw new FetchError(`the server answered ${got.status}${why}`, got.status);
    }
    if (got.body.length > this.limits.bytes) throw new FetchError(`the answer is larger than ${Math.round(this.limits.bytes / 1024)} KB`);
    try {
      return JSON.parse(got.body) as Json;
    } catch {
      throw new FetchError('the answer is not JSON');
    }
  }
}

function walkFind(doc: Doc, id: string) {
  let found: Doc['root'] | undefined;
  walk(doc.root, (c) => { if (c.id === id) found = c; });
  return found;
}

// ───────────────────────────── the network ─────────────────────────────

/** Loopback, private, link-local, carrier-grade NAT, multicast and other addresses a fetch must never reach. */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 6) {
    const b = ipv6Bytes(ip);
    if (!b) return true;
    const zero = (from: number, to: number) => b.slice(from, to).every((x) => x === 0);
    const v4 = b.slice(12).join('.');
    // IPv4 inside IPv6: mapped (::ffff:a.b.c.d), compatible (::a.b.c.d), translated (::ffff:0:a.b.c.d), NAT64 (64:ff9b::a.b.c.d).
    if (zero(0, 10) && b[10] === 0xff && b[11] === 0xff) return isPrivateAddress(v4);
    if (zero(0, 12)) return true;
    if (zero(0, 8) && b[8] === 0xff && b[9] === 0xff && zero(10, 12)) return isPrivateAddress(v4);
    if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b) return isPrivateAddress(v4);
    return (b[0] & 0xfe) === 0xfc || (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) || b[0] === 0xff
      || (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8) || (b[0] === 0x20 && b[1] === 0x02);
  }
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  return true;
}

/** An IPv6 address as its 16 bytes, whichever way it is written. */
function ipv6Bytes(ip: string): number[] | null {
  let s = ip.toLowerCase().split('%')[0];
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (tail) {
    const q = tail[1].split('.').map(Number);
    s = s.slice(0, -tail[1].length) + ((q[0] << 8) | q[1]).toString(16) + ':' + ((q[2] << 8) | q[3]).toString(16);
  }
  const [head, rest] = s.split('::');
  const a = head ? head.split(':') : [];
  const b = rest !== undefined && rest ? rest.split(':') : [];
  const groups = rest === undefined ? a : [...a, ...Array(8 - a.length - b.length).fill('0'), ...b];
  if (groups.length !== 8) return null;
  return groups.flatMap((g) => {
    const n = parseInt(g || '0', 16);
    return [n >> 8, n & 0xff];
  });
}

/** Resolve a host, refusing it when any of its addresses is private. Used at connect time, so a second lookup can't sneak past. */
async function safeLookup(host: string): Promise<{ address: string; family: number }> {
  const all = isIP(host) ? [{ address: host, family: isIP(host) }] : await dnsLookup(host, { all: true }).catch(() => {
    throw new FetchError(`the address ${host} could not be found`);
  });
  if (!all.length) throw new FetchError(`the address ${host} could not be found`);
  if (all.some((a) => isPrivateAddress(a.address))) throw new FetchError(`${host} is a private or local address, which fetch cells may not reach`);
  return all[0];
}

/** GET with node's http(s): the address checked when connecting, at most 3 redirects, a time and a size limit. */
export const getGuarded: Getter = (url, headers, limits) => withDeadline(getHops(url, headers, limits), limits.ms);

async function getHops(url: string, headers: Record<string, string>, limits: Limits): Promise<Got> {
  let current = new URL(url);
  const origin = current.origin;
  for (let hop = 0; hop <= 3; hop++) {
    const host = current.hostname.replace(/^\[|\]$/g, '');
    const target = await safeLookup(host);
    // The document's headers (and secrets) go only to the origin it named, not to wherever a redirect points.
    const sent = current.origin === origin ? headers : { accept: 'application/json' };
    const got = await new Promise<Got & { location?: string }>((resolve, reject) => {
      const req = (current.protocol === 'https:' ? httpsRequest : httpRequest)(current, {
        method: 'GET',
        headers: { ...sent, 'user-agent': 'edgy-fetch/1' },
        // Connect to the address that was checked, never to a second answer from DNS.
        lookup: ((_h: string, o: { all?: boolean }, cb: (e: Error | null, a: unknown, f?: number) => void) =>
          (o?.all ? cb(null, [{ address: target.address, family: target.family }]) : cb(null, target.address, target.family))) as never,
        timeout: limits.ms,
      }, (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({ status, body: '', location: String(res.headers.location) });
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size > limits.bytes) {
            req.destroy();
            reject(new FetchError(`the answer is larger than ${Math.round(limits.bytes / 1024)} KB`));
          } else chunks.push(c);
        });
        res.on('end', () => resolve({ status, body: Buffer.concat(chunks).toString('utf8') }));
        res.on('error', reject);
      });
      req.on('timeout', () => req.destroy(new FetchError(`no answer within ${limits.ms / 1000} s`)));
      req.on('error', (e) => reject(e instanceof FetchError ? e : new FetchError(`the address could not be reached (${(e as NodeJS.ErrnoException).code ?? e.message})`)));
      req.end();
    });
    if (!got.location) return got;
    current = new URL(got.location, current);
    if (current.protocol !== 'http:' && current.protocol !== 'https:') throw new FetchError('a redirect left http and https');
  }
  throw new FetchError('too many redirects');
}
