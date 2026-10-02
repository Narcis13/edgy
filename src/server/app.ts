// The HTTP API. People's browsers and agents use the same endpoints.

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Actor, type Doc, type Json, type Op, type Sx, isContainer, isGroup, newDoc } from '../core/types';
import { OpError, applyOps } from '../core/ops';
import { type Computed, type World, evalIn, evaluate, plainValue } from '../core/engine';
import { toNotation } from '../core/notation';
import { outline } from '../core/outline';
import { SxError, read } from '../core/sx';
import { indexTree } from '../core/tree';
import { GUIDE } from '../core/reference';
import { TEMPLATES, tour } from '../core/templates';
import { type Entry, type Filter, type Sort, FILTERS, SORTS, arrange, match, queryWords } from '../core/library';
import { collectionsUsed } from '../core/events';
import { type Grant, SHARE_HEADER, allows, grantFor, guestHears } from './access';
import { Hub } from './hub';
import { type Clock, type Getter, Runner } from './runner';
import { type Provider, ComposeError, Requests, TARGETS, accept, claudeConfig, compose, context, eventOf, eventProblem, isTarget } from './compose';
import { type Bundle, type Pictures, composeHtml, dataUri, fileName, forExport, sniffImage } from './export';
import { getGuarded } from './runner';
import type { ExportPayload } from '../core/offline';
import { shapeOf } from '../core/library';
import { type Access, type Deck, type DocSummary, type Share, type Store, StoreError, isDeckId, shortId } from './store';

const ASSET_TYPES: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif', 'image/svg+xml': 'svg',
};
const MAX_ASSET = 8 * 1024 * 1024;
/** How long a person's compose request waits for a listening agent. */
const AGENT_WAIT = 45_000;

function cleanActor(a: unknown): Actor {
  const o = (a ?? {}) as Record<string, unknown>;
  const kind = o.kind === 'agent' ? 'agent' : 'human';
  const name = typeof o.name === 'string' && o.name.trim() ? o.name.trim().slice(0, 40) : kind === 'agent' ? 'Agent' : 'Someone';
  return { kind, name, ...(typeof o.id === 'string' ? { id: o.id.slice(0, 40) } : {}) };
}

/** What tests swap: the clock timers run on, how addresses are fetched, the environment secrets come from. */
export interface AppOptions {
  clock?: Clock;
  get?: Getter;
  env?: Record<string, string | undefined>;
  /** The offline build exports are made from (see export.ts). */
  offline?: () => Promise<Bundle | null>;
}

export function createApp(store: Store, assetsDir: string, webUrl?: string, opts: AppOptions = {}) {
  const app = new Hono<{ Variables: { grant: Grant } }>();
  const hub = new Hub();
  const requests = new Requests();
  const runner = new Runner({
    store, hub, ...opts,
    // A fetch cell's path on this server is answered here, in process, without the network.
    local: async (path, headers) => {
      const res = await app.request(path, { headers });
      return { status: res.status, body: await res.text() };
    },
  });
  /** What formulas see: saved records, the time, and (for a document) its fetch cells' answers. */
  const world = (docId?: string): World => (docId ? runner.world(docId) : { rows: (name) => store.rows(name), now: Date.now() });
  const collections = () => store.collections().map((c) => c.name);

  /** The collections a document reads or writes, by version: what a link to it may reach. */
  const readsCache = new Map<string, { v: number; names: string[] }>();
  function reads(docId: string): string[] {
    const doc = store.getDoc(docId);
    if (!doc) return [];
    const hit = readsCache.get(docId);
    if (hit && hit.v === doc.v) return hit.names;
    const names = [...new Set([...collectionsUsed(doc), ...evaluate(doc, world(docId)).collections])];
    readsCache.set(docId, { v: doc.v, names });
    return names;
  }

  // Every request passes here first: a share link reaches its own document and nothing else (see access.ts).
  app.use('/api/*', async (c, next) => {
    const grant = grantFor(store, c.req.header(SHARE_HEADER) ?? c.req.query('share') ?? undefined);
    if ('status' in grant) return c.json({ error: grant.error, reason: grant.reason }, grant.status);
    const ok = allows(grant, c.req.method, c.req.path, () => (grant.level === 'owner' ? [] : reads(grant.doc)));
    if (ok !== true) return c.json({ error: ok.error, reason: ok.reason }, ok.status);
    c.set('grant', grant);
    await next();
  });

  /** Apply ops as someone, save them, and tell everyone watching. */
  function change(doc: Doc, raw: Op[], actor: Actor, o: { client?: string; batch?: string } = {}) {
    const r = applyOps(doc, raw);
    const next: Doc = { ...r.doc, v: doc.v + 1 };
    const ops = raw.length === 1 ? [r.op] : (r.op.slice(1) as Op[]);
    const ts = store.saveDoc(next, actor, ops);
    hub.publish(doc.id, { type: 'ops', v: next.v, ts, actor, ops, touched: r.touched, client: o.client, batch: o.batch });
    runner.changed(doc.id);
    return { next, ops, touched: r.touched };
  }

  /** Gone for good (a deck: ungrouped), and everyone watching is told. */
  function remove(id: string): boolean {
    if (isDeckId(id)) return store.deleteDeck(id);
    const ok = store.deleteDoc(id);
    if (ok) {
      runner.forget(id);
      readsCache.delete(id);
      hub.publish(id, { type: 'deleted' });
    }
    return ok;
  }

  /** A deck's card on the home page: what it is, how many documents, the first few to draw. */
  function deckEntry(k: Deck, docs: Map<string, DocSummary>): Entry & Record<string, unknown> {
    const members = k.docs.map((id) => docs.get(id)).filter((d): d is DocSummary => !!d);
    return {
      type: 'deck', id: k.id, title: k.title, description: k.description, createdAt: k.createdAt, updatedAt: k.updatedAt,
      pinned: k.pinned, archivedAt: k.archivedAt, docs: k.docs, count: members.length,
      covers: members.slice(0, 3).map((d) => ({ id: d.id, title: d.title, shape: d.shape })),
    };
  }

  /** The home page: documents and decks, filtered, searched, pinned first, sorted. */
  function library(q: string, filter: Filter, sort: Sort) {
    const docs = store.listDocs();
    const byId = new Map(docs.map((d) => [d.id, d]));
    const decks = store.decks();
    const deckTitle = new Map(decks.map((k) => [k.id, k.title]));
    let entries: (Entry & Record<string, unknown>)[] = [
      ...docs.map((d) => ({ type: 'doc' as const, ...d, ...(d.deck ? { deckTitle: deckTitle.get(d.deck) } : {}) })),
      ...decks.map((k) => deckEntry(k, byId)),
    ];
    const words = queryWords(q);
    if (words.length) {
      const texts = new Map(store.texts().map((t) => [t.id, t]));
      entries = entries.filter((e) => {
        const m = match(words, e.type === 'doc' ? texts.get(e.id)! : { title: e.title, description: e.description, text: '' });
        if (m) e.match = m;
        return !!m;
      });
    }
    return { ...arrange(entries, { filter, sort, searching: words.length > 0 }), query: q, filter, sort };
  }

  const shareView = (s: Share, origin: string) => ({ ...s, url: `${webUrl ?? origin}/s/${s.token}` });

  /** A picture as data: an upload from this server, or one from the network, checked like a fetch cell's address. */
  const pictures: Pictures = async (src) => {
    if (/^data:image\//.test(src)) return src;
    const local = /^\/assets\/([a-f0-9]{20}\.\w+)$/.exec(src);
    if (local) {
      const file = join(assetsDir, local[1]);
      if (!existsSync(file)) return null;
      const bytes = readFileSync(file);
      const type = sniffImage(bytes);
      return type ? dataUri(type, bytes) : null;
    }
    if (!/^https?:\/\//i.test(src)) return null;
    try {
      const got = await (opts.get ?? getGuarded)(src, { accept: 'image/*' }, { ms: 10_000, bytes: MAX_ASSET });
      const type = got.status >= 200 && got.status < 300 && got.bytes ? sniffImage(got.bytes) : null;
      return type ? dataUri(type, got.bytes!) : null;
    } catch {
      return null;
    }
  };

  /** What an export of these documents holds: them, the records they read, their fetch answers; nothing else. */
  async function exportOf(docs: Doc[], deck?: Deck) {
    const missing: string[] = [];
    const payload: ExportPayload = { kind: deck ? 'deck' : 'doc', exportedAt: Date.now(), docs: [], shapes: {}, records: {}, fetched: {} };
    for (const doc of docs) {
      const computed = evaluate(doc, world(doc.id));
      payload.docs.push(await forExport(doc, (c) => computed.cells[c.id]?.value, pictures, missing));
      payload.shapes[doc.id] = shapeOf(doc.root);
      for (const name of reads(doc.id)) payload.records[name] ??= store.rows(name);
      const fetched = runner.states(doc.id);
      if (Object.keys(fetched).length) payload.fetched[doc.id] = fetched;
    }
    if (deck) payload.deck = { id: deck.id, title: deck.title, description: deck.description, docs: docs.map((d) => d.id) };
    return { payload, missing };
  }

  async function sendExport(c: { body: (b: string, s: 200, h: Record<string, string>) => Response; json: (b: unknown, s: 503) => Response }, docs: Doc[], title: string, deck?: Deck) {
    const bundle = await opts.offline?.();
    if (!bundle) return c.json({ error: 'the offline build is missing; run npm run build' }, 503);
    const { payload, missing } = await exportOf(docs, deck);
    const html = composeHtml(payload, bundle, title);
    return c.body(html, 200, {
      'content-type': 'text/html; charset=utf-8',
      'content-disposition': `attachment; filename="${fileName(title)}"`,
      'x-edgy-missing-pictures': String(missing.length),
    });
  }

  /** What an agent needs to see of a document: structure, values and what is broken. */
  function view(doc: Doc, format: string) {
    const computed = evaluate(doc, world(doc.id));
    const idx = indexTree(doc.root);
    const values: Record<string, unknown> = {};
    const errors: Record<string, string> = {};
    for (const [id, st] of Object.entries(computed.cells)) {
      const cell = idx.byId.get(id)!;
      // Groups are only their children, except tabs, accordions and collapsibles, whose value is what is open.
      if (isGroup(cell) && !isContainer(cell)) continue;
      if (st.error) errors[cell.name ?? id] = st.error;
      else if (cell.name) values[cell.name] = plainValue(st.value);
    }
    return {
      id: doc.id,
      title: doc.meta.title,
      v: doc.v,
      meta: doc.meta,
      ...(format !== 'notation' ? { outline: outline(doc, computed) } : {}),
      ...(format !== 'outline' ? { notation: toNotation(doc.root) } : {}),
      values,
      errors,
    };
  }

  function create(title: string | undefined, templateId?: string, root?: Json, actor: Actor = { kind: 'human', name: 'Someone' }): Doc {
    const template = templateId === 'tour' ? tour : TEMPLATES.find((t) => t.id === templateId);
    if (templateId && !template) throw new OpError(`no template "${templateId}"`);
    let doc = newDoc(shortId(), title?.trim() || template?.title || 'Untitled');
    const ops: Op[] = [];
    if (template?.meta) for (const [k, v] of Object.entries(template.meta)) ops.push(['meta', k, v]);
    const content = root ?? template?.root;
    if (content != null) ops.push(['put', 'c1', content]);
    if (!ops.length) {
      store.createDoc(doc);
      return doc;
    }
    const r = applyOps(doc, ops);
    doc = { ...r.doc, v: 1 };
    // Sample records, once the document is known to build: only into collections that are still empty.
    for (const [name, records] of Object.entries(template?.data ?? {})) {
      if (store.rows(name).length) continue;
      for (const record of records) store.insert(name, record, { template: template!.id });
      hub.publishAll({ type: 'data', collection: name });
    }
    store.createDoc({ ...doc, v: 0 });
    store.saveDoc(doc, actor, ops.length === 1 ? [r.op] : (r.op.slice(1) as Op[]));
    return doc;
  }

  if (!store.listDocs().length) create(undefined, 'tour', undefined, { kind: 'agent', name: 'Edgy' });

  app.onError((e, c) => {
    if (e instanceof OpError || e instanceof SxError) return c.json({ error: e.message }, 422);
    if (e instanceof SyntaxError) return c.json({ error: 'the request body is not valid JSON' }, 400);
    console.error(e);
    return c.json({ error: 'something went wrong on the server' }, 500);
  });

  app.get('/api/health', (c) => c.json({ ok: true, name: 'edgy', web: webUrl ?? new URL(c.req.url).origin }));
  app.get('/api/guide', (c) => c.text(GUIDE));
  app.get('/api/templates', (c) => c.json(TEMPLATES.map((t) => ({ id: t.id, title: t.title, about: t.about, root: t.root }))));

  // ── documents ──

  app.get('/api/docs', (c) => c.json(store.listDocs()));

  app.post('/api/docs', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { title?: string; template?: string; root?: Json; actor?: unknown };
    const doc = create(body.title, body.template, body.root, cleanActor(body.actor));
    return c.json(doc, 201);
  });

  app.get('/api/docs/:id', (c) => {
    const doc = store.getDoc(c.req.param('id'));
    return doc ? c.json(doc) : c.json({ error: 'no such document' }, 404);
  });

  app.get('/api/docs/:id/read', (c) => {
    const doc = store.getDoc(c.req.param('id'));
    if (!doc) return c.json({ error: 'no such document' }, 404);
    const name = c.req.query('agent');
    if (name) hub.publish(doc.id, { type: 'presence', actor: { kind: 'agent', name }, state: 'reading', ts: Date.now() });
    return c.json(view(doc, c.req.query('format') ?? 'outline'));
  });

  app.delete('/api/docs/:id', (c) => {
    const ok = !isDeckId(c.req.param('id')) && remove(c.req.param('id'));
    return ok ? c.json({ ok }) : c.json({ error: 'no such document' }, 404);
  });

  /** The document's title and description (saved as ops, in its history), and its place in the library. */
  app.patch('/api/docs/:id', async (c) => {
    const doc = store.getDoc(c.req.param('id'));
    if (!doc) return c.json({ error: 'no such document' }, 404);
    const body = (await c.req.json()) as { title?: unknown; description?: unknown; pinned?: unknown; archived?: unknown; actor?: unknown };
    const ops: Op[] = [];
    if (body.title !== undefined) {
      if (typeof body.title !== 'string') return c.json({ error: 'a title is text' }, 400);
      const title = body.title.trim().slice(0, 200) || 'Untitled';
      if (title !== doc.meta.title) ops.push(['meta', 'title', title]);
    }
    if (body.description !== undefined) {
      if (body.description !== null && typeof body.description !== 'string') return c.json({ error: 'a description is text' }, 400);
      const text = (body.description ?? '').trim().slice(0, 2000);
      if (text !== (doc.meta.description ?? '')) ops.push(['meta', 'description', text || null]);
    }
    if (body.pinned && body.archived === undefined && store.summary(doc.id)?.archivedAt != null) {
      return c.json({ error: 'an archived document can not be pinned; restore it first' }, 409);
    }
    if (ops.length) change(doc, ops, cleanActor(body.actor));
    if (body.archived !== undefined) store.setArchived(doc.id, !!body.archived);
    if (body.pinned !== undefined) store.setPinned(doc.id, !!body.pinned);
    return c.json(store.summary(doc.id));
  });

  app.post('/api/docs/:id/ops', async (c) => {
    const body = (await c.req.json()) as { ops?: Op[]; actor?: unknown; client?: string; batch?: string; format?: string };
    // Read the document after the body has arrived, so a change saved meanwhile (a timer's) is the base.
    const doc = store.getDoc(c.req.param('id'));
    if (!doc) return c.json({ error: 'no such document' }, 404);
    if (!Array.isArray(body.ops) || !body.ops.length) return c.json({ error: 'send {"ops": [[verb, …], …]}' }, 400);
    let actor = cleanActor(body.actor);
    // Someone with a link is a person, whatever they call themselves.
    if (c.get('grant').level !== 'owner') actor = { ...actor, kind: 'human' };
    const { next, ops, touched } = change(doc, body.ops, actor, { client: body.client, batch: body.batch });
    // A person's browser ran its own handlers; an agent's change sets them off here, if someone is in Live.
    if (actor.kind === 'agent' && !body.client) runner.agentChanged(doc.id, doc, ops);
    const answer: Record<string, unknown> = actor.kind === 'human'
      ? { v: next.v, ops, touched }
      : { ops, touched, ...view(next, body.format ?? 'outline') };
    return c.json(answer);
  });

  app.get('/api/docs/:id/log', (c) => {
    const id = c.req.param('id');
    if (!store.getDoc(id)) return c.json({ error: 'no such document' }, 404);
    return c.json(store.log(id, Number(c.req.query('since') ?? 0), Math.min(500, Number(c.req.query('limit') ?? 200))));
  });

  app.post('/api/docs/:id/eval', async (c) => {
    const doc = store.getDoc(c.req.param('id'));
    if (!doc) return c.json({ error: 'no such document' }, 404);
    const body = (await c.req.json()) as { expr?: Sx; src?: string; cell?: string };
    const expr = typeof body.src === 'string' ? read(body.src) : (body.expr ?? null);
    const r = evalIn(doc, world(doc.id), expr, body.cell);
    return c.json(r.error ? { error: r.error } : { value: plainValue(r.value) });
  });

  app.get('/api/docs/:id/events', (c) => {
    const id = c.req.param('id');
    const doc = store.getDoc(id);
    if (!doc) return c.json({ error: 'no such document' }, 404);
    // The browser says who it is and whether it is in Live: timers and fetches run while anyone is.
    const client = (c.req.query('client') ?? '').slice(0, 40);
    const mode = c.req.query('mode') ?? 'edit';
    return streamSSE(c, async (stream) => {
      const grant = c.get('grant');
      const unsubscribe = hub.subscribe(id, (e) => {
        // Someone with a link hears changes, not the conversation or the agents' work.
        if (!guestHears(grant, e as { type: string }, () => reads(id))) return;
        stream.writeSSE({ event: e.type, data: JSON.stringify(e) }).catch(() => off());
      });
      const token = client ? runner.join(id, client, mode) : 0;
      let gone = false;
      const off = () => {
        if (gone) return;
        gone = true;
        unsubscribe();
        if (token) runner.leave(id, token);
      };
      stream.onAbort(off);
      await stream.writeSSE({ event: 'hello', data: JSON.stringify({ type: 'hello', v: store.getDoc(id)?.v ?? doc.v }) });
      while (!stream.aborted && !stream.closed) {
        await stream.sleep(10_000);
        await stream.writeSSE({ event: 'ping', data: '{}' }).catch(() => {});
      }
      off();
    });
  });

  /** A browser switched between Edit, Live and Page. */
  app.post('/api/docs/:id/viewer', async (c) => {
    const id = c.req.param('id');
    if (!store.getDoc(id)) return c.json({ error: 'no such document' }, 404);
    const body = (await c.req.json()) as { client?: string; mode?: string };
    if (typeof body.client !== 'string' || !['edit', 'live', 'page'].includes(body.mode ?? '')) return c.json({ error: 'send {"client", "mode": "edit"|"live"|"page"}' }, 400);
    runner.mode(id, body.client.slice(0, 40), body.mode!);
    return c.json({ live: runner.isLive(id) });
  });

  // ── the library: search, pins, archive, decks ──

  app.get('/api/library', (c) => {
    const filter = (c.req.query('filter') || 'all') as Filter;
    const sort = (c.req.query('sort') || 'updated') as Sort;
    if (!FILTERS.includes(filter)) return c.json({ error: `filter is one of ${FILTERS.join(', ')}` }, 400);
    if (!SORTS.includes(sort)) return c.json({ error: `sort is one of ${SORTS.join(', ')}` }, 400);
    return c.json(library((c.req.query('q') ?? '').slice(0, 200), filter, sort));
  });

  /** Pinned documents and decks, in this order. */
  app.post('/api/library/pins', async (c) => {
    const body = (await c.req.json()) as { ids?: unknown };
    if (!Array.isArray(body.ids) || body.ids.some((x) => typeof x !== 'string')) return c.json({ error: 'send {"ids": [the pinned ids, in order]}' }, 400);
    return c.json({ pins: store.orderPins(body.ids as string[]) });
  });

  /** One action on several documents or decks: pin, unpin, archive, restore, delete (a deck: ungroup). */
  app.post('/api/library/bulk', async (c) => {
    const body = (await c.req.json()) as { ids?: unknown; action?: string };
    const actions = ['pin', 'unpin', 'archive', 'restore', 'delete'];
    if (!Array.isArray(body.ids) || body.ids.some((x) => typeof x !== 'string') || !actions.includes(body.action ?? '')) {
      return c.json({ error: `send {"action": one of ${actions.join(', ')}, "ids": [...]}` }, 400);
    }
    const done: string[] = [];
    const skipped: string[] = [];
    for (const id of body.ids as string[]) {
      const ok = body.action === 'pin' ? store.setPinned(id, true)
        : body.action === 'unpin' ? store.setPinned(id, false)
        : body.action === 'archive' ? store.setArchived(id, true)
        : body.action === 'restore' ? store.setArchived(id, false)
        : remove(id);
      (ok ? done : skipped).push(id);
    }
    return c.json({ action: body.action, done, skipped });
  });

  app.get('/api/decks', (c) => c.json(store.decks()));

  /** Group documents into a deck, in this order. */
  app.post('/api/decks', async (c) => {
    const body = (await c.req.json()) as { title?: unknown; description?: unknown; docs?: unknown };
    if (!Array.isArray(body.docs) || !body.docs.length || body.docs.some((x) => typeof x !== 'string')) {
      return c.json({ error: 'send {"title": …, "docs": [document ids, in order]}' }, 400);
    }
    const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 200) : 'Untitled deck';
    const description = typeof body.description === 'string' ? body.description.trim().slice(0, 2000) : '';
    try {
      return c.json(store.createDeck(title, description, body.docs as string[]), 201);
    } catch (e) {
      if (e instanceof StoreError) return c.json({ error: e.message }, 400);
      throw e;
    }
  });

  /** A deck, with its documents' summaries in order. */
  app.get('/api/decks/:id', (c) => {
    const deck = store.deck(c.req.param('id'));
    if (!deck) return c.json({ error: 'no such deck' }, 404);
    const docs = new Map(store.listDocs().map((d) => [d.id, d]));
    return c.json({ ...deck, items: deck.docs.map((id) => docs.get(id)).filter(Boolean) });
  });

  /** Rename, describe, reorder (docs: the ids in their new order; one left out is taken out), pin, archive. */
  app.patch('/api/decks/:id', async (c) => {
    const id = c.req.param('id');
    if (!store.deck(id)) return c.json({ error: 'no such deck' }, 404);
    const body = (await c.req.json()) as { title?: unknown; description?: unknown; docs?: unknown; pinned?: unknown; archived?: unknown };
    const fields: { title?: string; description?: string } = {};
    if (typeof body.title === 'string') fields.title = body.title.trim().slice(0, 200) || 'Untitled deck';
    if (typeof body.description === 'string' || body.description === null) fields.description = ((body.description as string | null) ?? '').trim().slice(0, 2000);
    if (body.docs !== undefined) {
      if (!Array.isArray(body.docs) || body.docs.some((x) => typeof x !== 'string')) return c.json({ error: 'docs is a list of document ids' }, 400);
      try {
        store.setDeckDocs(id, body.docs as string[]);
      } catch (e) {
        if (e instanceof StoreError) return c.json({ error: e.message }, 400);
        throw e;
      }
    }
    if (Object.keys(fields).length) store.updateDeck(id, fields);
    if (body.archived !== undefined) store.setArchived(id, !!body.archived);
    if (body.pinned !== undefined) store.setPinned(id, !!body.pinned);
    return c.json(store.deck(id));
  });

  /** Ungroup: the deck goes, every document in it stays. */
  app.delete('/api/decks/:id', (c) => (store.deleteDeck(c.req.param('id')) ? c.json({ ok: true }) : c.json({ error: 'no such deck' }, 404)));

  // ── share links ──

  /** For the page a link opens: which document, and what the link may do. */
  app.get('/api/shared', (c) => {
    const grant = c.get('grant');
    if (grant.level === 'owner') return c.json({ error: `send the link's token in the ${SHARE_HEADER} header` }, 400);
    const doc = store.getDoc(grant.doc);
    return doc ? c.json({ id: doc.id, title: doc.meta.title, access: grant.level }) : c.json({ error: 'this link does not open anything', reason: 'unknown' }, 404);
  });

  /** The links that are on. */
  app.get('/api/docs/:id/shares', (c) => {
    const id = c.req.param('id');
    if (!store.getDoc(id)) return c.json({ error: 'no such document' }, 404);
    const origin = new URL(c.req.url).origin;
    return c.json(store.shares(id).filter((s) => s.revokedAt == null).map((s) => shareView(s, origin)));
  });

  /** Turn a link on, "view" or "edit"; the one already on is returned as it is. */
  app.post('/api/docs/:id/shares', async (c) => {
    const id = c.req.param('id');
    if (!store.getDoc(id)) return c.json({ error: 'no such document' }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { access?: string };
    const access = (body.access ?? 'view') as Access;
    if (access !== 'view' && access !== 'edit') return c.json({ error: 'access is "view" or "edit"' }, 400);
    return c.json(shareView(store.openShare(id, access), new URL(c.req.url).origin), 201);
  });

  /** Turn a link off. Whoever has it open sees that it is no longer shared. */
  app.delete('/api/shares/:token', (c) => {
    const share = store.closeShare(c.req.param('token'));
    if (!share) return c.json({ error: 'no such link' }, 404);
    hub.publish(share.doc, { type: 'unshared', token: share.token });
    return c.json(shareView(share, new URL(c.req.url).origin));
  });

  // ── one self-contained .html file ──

  app.get('/api/docs/:id/export', async (c) => {
    const doc = store.getDoc(c.req.param('id'));
    if (!doc) return c.json({ error: 'no such document' }, 404);
    return sendExport(c, [doc], doc.meta.title);
  });

  /** A deck's file plays its documents (archived ones left out) as slides. */
  app.get('/api/decks/:id/export', async (c) => {
    const deck = store.deck(c.req.param('id'));
    if (!deck) return c.json({ error: 'no such deck' }, 404);
    const docs = store.listDocs().filter((d) => deck.docs.includes(d.id) && d.archivedAt == null).sort((a, b) => deck.docs.indexOf(a.id) - deck.docs.indexOf(b.id));
    return sendExport(c, docs.map((d) => store.getDoc(d.id)!), deck.title, deck);
  });

  // ── fetch cells: JSON from an address, fetched here for everyone ──

  app.get('/api/docs/:id/fetched', (c) => {
    const id = c.req.param('id');
    if (!store.getDoc(id)) return c.json({ error: 'no such document' }, 404);
    return c.json(runner.states(id));
  });

  /** Fetch now (refresh!, Retry, the studio's Fetch now). {"handlers": false} skips load and fail. */
  app.post('/api/docs/:id/fetch/:cell', async (c) => {
    const id = c.req.param('id');
    const doc = store.getDoc(id);
    if (!doc) return c.json({ error: 'no such document' }, 404);
    const cell = indexTree(doc.root).byId.get(c.req.param('cell')) ?? indexTree(doc.root).byName.get(c.req.param('cell'));
    if (!cell || cell.kind !== 'fetch') return c.json({ error: `no fetch cell "${c.req.param('cell')}"` }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { handlers?: boolean };
    return c.json(await runner.refresh(id, cell.id, body.handlers !== false));
  });

  // ── demo answers, so fetch cells can be tried (and tested) without the network ──

  const RATES = [4.82, 5.07, 4.95, 5.21, 4.88];
  let rateCall = 0;
  app.get('/api/demo/rate', (c) => {
    const forced = Number(c.req.query('rate'));
    const rate = c.req.query('rate') && Number.isFinite(forced) ? forced : RATES[rateCall++ % RATES.length];
    return c.json({ base: 'EUR', quote: 'RON', rate, at: new Date().toISOString() });
  });
  app.get('/api/demo/slow', async (c) => {
    const ms = Math.min(5000, Math.max(0, Number(c.req.query('ms') ?? 1500) || 0));
    await new Promise((r) => setTimeout(r, ms));
    return c.json({ ok: true, waited: ms, at: new Date().toISOString() });
  });
  app.get('/api/demo/fail', (c) => c.json({ error: 'the demo service is down' }, 500));
  app.get('/api/demo/weather', (c) => c.json({ city: c.req.query('city') ?? 'Cluj', temp: 17, sky: 'clear', wind: 9 }));

  // ── messages: how a person and an agent talk about a document ──

  app.get('/api/docs/:id/messages', (c) => {
    const id = c.req.param('id');
    if (!store.getDoc(id)) return c.json({ error: 'no such document' }, 404);
    return c.json(store.messages(id, Number(c.req.query('after') ?? 0)));
  });

  app.post('/api/docs/:id/messages', async (c) => {
    const id = c.req.param('id');
    if (!store.getDoc(id)) return c.json({ error: 'no such document' }, 404);
    const body = (await c.req.json()) as { text?: string; actor?: unknown; cell?: string };
    const text = (body.text ?? '').trim();
    if (!text) return c.json({ error: 'a message needs text' }, 400);
    const message = store.addMessage(id, cleanActor(body.actor), text.slice(0, 4000), body.cell);
    hub.publish(id, { type: 'message', message });
    return c.json(message, 201);
  });

  /** Long-poll: an agent waits here for the next thing a person says, or asks it to write. */
  app.get('/api/docs/:id/messages/wait', async (c) => {
    const id = c.req.param('id');
    if (!store.getDoc(id)) return c.json({ error: 'no such document' }, 404);
    const after = Number(c.req.query('after') ?? 0);
    const seconds = Math.min(120, Math.max(1, Number(c.req.query('timeout') ?? 25)));
    const stop = hub.listen(id);
    try {
      const waiting = store.messages(id, after).filter((m) => m.actor.kind === 'human');
      const asked = requests.take(id);
      if (waiting.length || asked.length) return c.json({ messages: waiting, requests: asked });
      const actor: Actor = { kind: 'agent', name: c.req.query('agent') || 'Agent' };
      hub.publish(id, { type: 'presence', actor, state: 'listening', ts: Date.now() });
      const e = await hub.waitFor(id, (ev) => (ev.type === 'message' && ev.message.actor.kind === 'human') || ev.type === 'compose', seconds * 1000, c.req.raw.signal);
      hub.publish(id, { type: 'presence', actor, state: e ? 'reading' : 'idle', ts: Date.now() });
      return c.json({ messages: e && e.type === 'message' ? [e.message] : [], requests: requests.take(id) });
    } finally {
      stop();
    }
  });

  // ── composing: words in, checked code out ──

  app.get('/api/ai', (c) => {
    const claude = claudeConfig();
    return c.json({ providers: { claude: !!claude, agent: hub.listening(c.req.query('doc') || undefined), local: true }, model: claude?.model ?? null });
  });

  app.post('/api/docs/:id/compose', async (c) => {
    const doc = store.getDoc(c.req.param('id'));
    if (!doc) return c.json({ error: 'no such document' }, 404);
    const body = (await c.req.json()) as { prompt?: string; cell?: string; target?: string; current?: string; provider?: string };
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, 2000) : '';
    if (!prompt) return c.json({ error: 'say what the cell should do' }, 400);
    const target = body.target ?? 'expr';
    if (!isTarget(target)) return c.json({ error: `target is one of ${TARGETS.join(', ')} or on.<event>` }, 400);
    const provider = body.provider as Provider | undefined;
    if (provider && !['claude', 'agent', 'local'].includes(provider)) return c.json({ error: 'provider is claude, agent or local' }, 400);
    const ctx = context(doc, world(doc.id), collections(), { cell: body.cell, target, current: typeof body.current === 'string' ? body.current : '' });
    if (body.cell && !ctx.cell) return c.json({ error: `no cell "${body.cell}"` }, 400);
    const event = eventOf(target);
    const wrong = event && eventProblem(ctx.cell ?? null, event);
    if (wrong) return c.json({ error: wrong }, 400);
    const cell = ctx.cell;
    const agent = hub.listening(doc.id)
      ? () => {
          const { request, answer } = requests.open(doc.id, {
            prompt, target, current: ctx.current,
            ...(cell ? { cell: cell.id, ...(cell.name ? { cellName: cell.name } : {}) } : {}),
          }, AGENT_WAIT, c.req.raw.signal);
          hub.publish(doc.id, { type: 'compose', request });
          return answer;
        }
      : null;
    try {
      return c.json(await compose(ctx, prompt, { provider, claude: claudeConfig(), agent }));
    } catch (e) {
      if (e instanceof ComposeError) return c.json({ error: e.message, ...(e.suggestions?.length ? { suggestions: e.suggestions } : {}) }, 422);
      throw e;
    }
  });

  /** An agent's answer to a compose request. Checked like any other; a failure can be resent. */
  app.post('/api/docs/:id/compose/:rid', async (c) => {
    const id = c.req.param('id');
    const doc = store.getDoc(id);
    const request = doc && requests.get(id, c.req.param('rid'));
    if (!doc || !request) return c.json({ error: 'no such request; it may have been answered or timed out' }, 404);
    const body = (await c.req.json()) as { code?: unknown; explanation?: string; actor?: unknown };
    let answer: ReturnType<typeof accept>;
    try {
      const ctx = context(doc, world(id), collections(), { cell: request.cell, target: request.target, current: request.current });
      // For target events, code is the ops: a JSON array, {ops}, or that as text.
      answer = accept(ctx, body.code);
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 422);
    }
    const explanation = typeof body.explanation === 'string' ? body.explanation.slice(0, 600) : undefined;
    requests.answer(request.id, explanation ? { ...answer, explanation } : answer);
    hub.publish(id, { type: 'presence', actor: { ...cleanActor(body.actor), kind: 'agent' }, state: 'editing', ts: Date.now() });
    return c.json({ ok: true });
  });

  // ── collections ──

  app.get('/api/data', (c) => c.json(store.collections()));
  app.get('/api/data/:name', (c) => c.json(store.rows(c.req.param('name'))));

  app.post('/api/data/:name', async (c) => {
    const name = c.req.param('name');
    if (!/^[\w-]{1,60}$/.test(name)) return c.json({ error: 'collection names use letters, digits, - and _' }, 400);
    const body = (await c.req.json()) as { record?: Record<string, Json>; source?: Json };
    if (!body.record || typeof body.record !== 'object' || Array.isArray(body.record)) return c.json({ error: 'send {"record": {…}}' }, 400);
    const row = store.insert(name, plainValue(body.record) as Record<string, Json>, body.source);
    hub.publishAll({ type: 'data', collection: name });
    return c.json(row, 201);
  });

  app.patch('/api/data/:name/:id', async (c) => {
    const name = c.req.param('name');
    const body = (await c.req.json()) as { fields?: Record<string, Json> };
    if (!body.fields || typeof body.fields !== 'object' || Array.isArray(body.fields)) return c.json({ error: 'send {"fields": {…}}' }, 400);
    const id = c.req.param('id');
    const row = store.update(name, id, plainValue(body.fields) as Record<string, Json>);
    if (!row) return c.json({ error: `no record ${id} in "${name}"` }, 404);
    hub.publishAll({ type: 'data', collection: name });
    return c.json(row as Record<string, unknown>, 200);
  });

  app.delete('/api/data/:name/:id', (c) => {
    const ok = store.deleteRow(c.req.param('name'), c.req.param('id'));
    if (ok) hub.publishAll({ type: 'data', collection: c.req.param('name') });
    return c.json({ ok });
  });

  app.delete('/api/data/:name', (c) => {
    const removed = store.clear(c.req.param('name'));
    hub.publishAll({ type: 'data', collection: c.req.param('name') });
    return c.json({ removed });
  });

  // ── pictures ──

  app.post('/api/assets', async (c) => {
    const type = (c.req.header('content-type') ?? '').split(';')[0];
    const ext = ASSET_TYPES[type];
    if (!ext) return c.json({ error: 'pictures can be PNG, JPEG, GIF, WebP, AVIF or SVG' }, 415);
    const bytes = Buffer.from(await c.req.arrayBuffer());
    if (bytes.length > MAX_ASSET) return c.json({ error: 'that picture is larger than 8 MB' }, 413);
    const file = createHash('sha256').update(bytes).digest('hex').slice(0, 20) + '.' + ext;
    mkdirSync(assetsDir, { recursive: true });
    if (!existsSync(join(assetsDir, file))) writeFileSync(join(assetsDir, file), bytes);
    return c.json({ url: '/assets/' + file }, 201);
  });

  app.get('/assets/:file', (c) => {
    const file = c.req.param('file');
    const ext = file.split('.').pop() ?? '';
    const type = Object.entries(ASSET_TYPES).find(([, e]) => e === ext)?.[0];
    if (!/^[a-f0-9]{20}\.\w+$/.test(file) || !type || !existsSync(join(assetsDir, file))) return c.notFound();
    return c.body(new Uint8Array(readFileSync(join(assetsDir, file))), 200, {
      'content-type': type,
      'cache-control': 'public, max-age=31536000, immutable',
      // An uploaded SVG must never run script if someone opens it directly.
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    });
  });

  return { app, hub, view, runner };
}

export type { Computed };
