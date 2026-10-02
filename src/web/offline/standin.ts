// A stand-in for the server inside an exported file. The app asks it the same
// questions it asks the real one (through web/lib/transport.ts) and it
// answers from memory: the documents, their records and fetch answers as they
// were exported. Changes (typing, ticking, buttons, saved records) apply here
// and last until the page is closed. Nothing ever reaches the network.

import type { Doc, Json, Op } from '../../core/types';
import { applyOps } from '../../core/ops';
import type { ExportPayload } from '../../core/offline';
import type { Transport } from '../lib/transport';

type Listener = (e: { data: string }) => void;

/** Behaves enough like an EventSource for the session: hello, then ops and data as they happen, and a ping. */
class Stream {
  readyState = 1;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private ping: ReturnType<typeof setInterval>;
  constructor(readonly doc: string, private hub: StandIn) {
    hub.streams.add(this);
    queueMicrotask(() => {
      this.onopen?.();
      this.emit('hello', { type: 'hello', v: hub.docs.get(doc)?.v ?? 0 });
    });
    this.ping = setInterval(() => this.emit('ping', {}), 10_000);
  }
  addEventListener(type: string, fn: Listener): void {
    let set = this.listeners.get(type);
    if (!set) this.listeners.set(type, (set = new Set()));
    set.add(fn);
  }
  removeEventListener(type: string, fn: Listener): void {
    this.listeners.get(type)?.delete(fn);
  }
  emit(type: string, data: unknown): void {
    const msg = { data: JSON.stringify(data) };
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn(msg);
  }
  close(): void {
    this.readyState = 2;
    clearInterval(this.ping);
    this.hub.streams.delete(this);
  }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const rid = () => 'r' + Math.random().toString(36).slice(2, 9);

export class StandIn {
  docs = new Map<string, Doc>();
  streams = new Set<Stream>();
  private records: ExportPayload['records'];

  constructor(private payload: ExportPayload) {
    for (const d of payload.docs) this.docs.set(d.id, d);
    this.records = structuredClone(payload.records);
  }

  transport(): Transport {
    return {
      fetch: async (url, init) => this.answer(url, init?.method ?? 'GET', typeof init?.body === 'string' ? JSON.parse(init.body) : undefined),
      stream: (url) => new Stream(/\/api\/docs\/([^/]+)\/events/.exec(url)?.[1] ?? '', this) as unknown as EventSource,
    };
  }

  private tell(doc: string | null, type: string, data: unknown): void {
    for (const s of this.streams) if (doc === null || s.doc === doc) queueMicrotask(() => s.emit(type, data));
  }

  private answer(url: string, method: string, body: Record<string, unknown> | undefined): Response {
    const path = url.split(/[?#]/)[0];
    let m: RegExpExecArray | null;
    if ((m = /^\/api\/docs\/([^/]+)(\/.*)?$/.exec(path))) {
      const id = decodeURIComponent(m[1]);
      const doc = this.docs.get(id);
      if (!doc) return json({ error: 'not in this offline copy' }, 404);
      const rest = m[2] ?? '';
      if (rest === '' && method === 'GET') return json(doc);
      if (rest === '/log' || rest === '/messages') return json([]);
      if (rest === '/fetched') return json(this.payload.fetched[id] ?? {});
      if (rest === '/viewer') return json({ live: true });
      if (rest.startsWith('/fetch/')) return json(this.payload.fetched[id]?.[decodeURIComponent(rest.slice(7))] ?? {});
      if (rest === '/ops' && method === 'POST') {
        const ops = (body?.ops ?? []) as Op[];
        try {
          const r = applyOps(doc, ops);
          const next = { ...r.doc, v: doc.v + 1 };
          this.docs.set(id, next);
          const sent = ops.length === 1 ? [r.op] : (r.op.slice(1) as Op[]);
          this.tell(id, 'ops', { type: 'ops', v: next.v, ts: Date.now(), actor: body?.actor, ops: sent, touched: r.touched, client: body?.client, batch: body?.batch });
          return json({ v: next.v, ops: sent, touched: r.touched });
        } catch (e) {
          return json({ error: e instanceof Error ? e.message : 'that change does not apply' }, 422);
        }
      }
      return json({ error: 'not in this offline copy' }, 404);
    }
    if ((m = /^\/api\/data\/([^/]+)(?:\/([^/]+))?$/.exec(path))) {
      const name = decodeURIComponent(m[1]);
      const id = m[2] && decodeURIComponent(m[2]);
      const rows = (this.records[name] ??= []);
      const changed = () => this.tell(null, 'data', { type: 'data', collection: name });
      if (method === 'GET') return json(rows);
      if (method === 'POST') {
        const { id: _i, at: _a, ...record } = (body?.record ?? {}) as Record<string, Json>;
        const row = { ...record, id: rid(), at: Date.now() };
        rows.push(row);
        changed();
        return json(row, 201);
      }
      if (method === 'PATCH' && id) {
        const i = rows.findIndex((r) => r.id === id);
        if (i < 0) return json({ error: `no record ${id}` }, 404);
        const { id: _i, at: _a, ...fields } = (body?.fields ?? {}) as Record<string, Json>;
        rows[i] = { ...rows[i], ...fields };
        changed();
        return json(rows[i]);
      }
      if (method === 'DELETE') {
        const before = rows.length;
        this.records[name] = id ? rows.filter((r) => r.id !== id) : [];
        changed();
        return json(id ? { ok: this.records[name].length !== before } : { removed: before });
      }
    }
    if ((m = /^\/api\/decks\/([^/]+)$/.exec(path)) && this.payload.deck && m[1] === this.payload.deck.id) {
      const deck = this.payload.deck;
      const items = deck.docs.map((id) => this.docs.get(id)).filter((d): d is Doc => !!d).map((d) => ({
        id: d.id, title: d.meta.title, description: typeof d.meta.description === 'string' ? d.meta.description : '', v: d.v,
        createdAt: 0, updatedAt: 0, pinned: null, archivedAt: null, deck: deck.id, shared: { view: false, edit: false }, shape: this.payload.shapes[d.id],
      }));
      return json({ ...deck, createdAt: 0, updatedAt: 0, pinned: null, archivedAt: null, items });
    }
    if ((m = /^\/api\/library\/([^/]+)$/.exec(path))) return json({ entry: this.docs.has(decodeURIComponent(m[1])) ? { archivedAt: null } : null });
    if (path === '/api/health') return json({ ok: true, name: 'edgy', offline: true });
    return json({ error: 'not in this offline copy' }, 404);
  }
}
