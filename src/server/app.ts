// The HTTP API. People's browsers and agents use the same endpoints.

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Actor, type Doc, type Json, type Op, type Sx, isGroup, newDoc } from '../core/types';
import { OpError, applyOps } from '../core/ops';
import { type Computed, type World, evalIn, evaluate, plainValue } from '../core/engine';
import { toNotation } from '../core/notation';
import { outline } from '../core/outline';
import { SxError, read } from '../core/sx';
import { indexTree } from '../core/tree';
import { GUIDE } from '../core/reference';
import { TEMPLATES, tour } from '../core/templates';
import { Hub } from './hub';
import { type Store, shortId } from './store';

const ASSET_TYPES: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif', 'image/svg+xml': 'svg',
};
const MAX_ASSET = 8 * 1024 * 1024;

function cleanActor(a: unknown): Actor {
  const o = (a ?? {}) as Record<string, unknown>;
  const kind = o.kind === 'agent' ? 'agent' : 'human';
  const name = typeof o.name === 'string' && o.name.trim() ? o.name.trim().slice(0, 40) : kind === 'agent' ? 'Agent' : 'Someone';
  return { kind, name, ...(typeof o.id === 'string' ? { id: o.id.slice(0, 40) } : {}) };
}

export function createApp(store: Store, assetsDir: string, webUrl?: string) {
  const app = new Hono();
  const hub = new Hub();
  const world = (): World => ({ rows: (name) => store.rows(name), now: Date.now() });

  /** What an agent needs to see of a document: structure, values and what is broken. */
  function view(doc: Doc, format: string) {
    const computed = evaluate(doc, world());
    const idx = indexTree(doc.root);
    const values: Record<string, unknown> = {};
    const errors: Record<string, string> = {};
    for (const [id, st] of Object.entries(computed.cells)) {
      const cell = idx.byId.get(id)!;
      if (isGroup(cell)) continue;
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
    const id = c.req.param('id');
    const ok = store.deleteDoc(id);
    if (ok) hub.publish(id, { type: 'deleted' });
    return ok ? c.json({ ok }) : c.json({ error: 'no such document' }, 404);
  });

  app.post('/api/docs/:id/ops', async (c) => {
    const doc = store.getDoc(c.req.param('id'));
    if (!doc) return c.json({ error: 'no such document' }, 404);
    const body = (await c.req.json()) as { ops?: Op[]; actor?: unknown; client?: string; batch?: string; format?: string };
    if (!Array.isArray(body.ops) || !body.ops.length) return c.json({ error: 'send {"ops": [[verb, …], …]}' }, 400);
    const actor = cleanActor(body.actor);
    const r = applyOps(doc, body.ops);
    const next: Doc = { ...r.doc, v: doc.v + 1 };
    const ops = body.ops.length === 1 ? [r.op] : (r.op.slice(1) as Op[]);
    const ts = store.saveDoc(next, actor, ops);
    hub.publish(doc.id, { type: 'ops', v: next.v, ts, actor, ops, touched: r.touched, client: body.client, batch: body.batch });
    const answer: Record<string, unknown> = actor.kind === 'human'
      ? { v: next.v, ops, touched: r.touched }
      : { ops, touched: r.touched, ...view(next, body.format ?? 'outline') };
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
    const r = evalIn(doc, world(), expr, body.cell);
    return c.json(r.error ? { error: r.error } : { value: plainValue(r.value) });
  });

  app.get('/api/docs/:id/events', (c) => {
    const id = c.req.param('id');
    const doc = store.getDoc(id);
    if (!doc) return c.json({ error: 'no such document' }, 404);
    return streamSSE(c, async (stream) => {
      const off = hub.subscribe(id, (e) => {
        stream.writeSSE({ event: e.type, data: JSON.stringify(e) }).catch(() => off());
      });
      stream.onAbort(off);
      await stream.writeSSE({ event: 'hello', data: JSON.stringify({ type: 'hello', v: store.getDoc(id)?.v ?? doc.v }) });
      while (!stream.aborted && !stream.closed) {
        await stream.sleep(10_000);
        await stream.writeSSE({ event: 'ping', data: '{}' }).catch(() => {});
      }
      off();
    });
  });

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

  /** Long-poll: an agent waits here for the next thing a person says. */
  app.get('/api/docs/:id/messages/wait', async (c) => {
    const id = c.req.param('id');
    if (!store.getDoc(id)) return c.json({ error: 'no such document' }, 404);
    const after = Number(c.req.query('after') ?? 0);
    const seconds = Math.min(120, Math.max(1, Number(c.req.query('timeout') ?? 25)));
    const waiting = store.messages(id, after).filter((m) => m.actor.kind === 'human');
    if (waiting.length) return c.json({ messages: waiting });
    const actor: Actor = { kind: 'agent', name: c.req.query('agent') || 'Agent' };
    hub.publish(id, { type: 'presence', actor, state: 'listening', ts: Date.now() });
    const e = await hub.waitFor(id, (ev) => ev.type === 'message' && ev.message.actor.kind === 'human', seconds * 1000, c.req.raw.signal);
    hub.publish(id, { type: 'presence', actor, state: e ? 'reading' : 'idle', ts: Date.now() });
    return c.json({ messages: e && e.type === 'message' ? [e.message] : [] });
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

  return { app, hub, view };
}

export type { Computed };
