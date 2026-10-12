// Flow over HTTP: the signed-in account's items, comments, reactions and board,
// kept as records in its own collections (see core/flow.ts), so they sync,
// show on the Data page and are read by documents like any record. These
// routes add what plain records don't have: the author set from who is asking
// (a person, or an agent with their key), the quick-add syntax, the rules of
// done and columns, the clock, reactions that toggle, deletions that take the
// comments and reactions along, and one event stream per account that says
// when any of it changed, whoever changed it (a document's insert!, an agent,
// another machine through sync).

import type { Context, Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { Actor, Json } from '../core/types';
import {
  type FlowBoard, type FlowItem, type FlowReaction, type Priority, type Who, FLOW, FLOW_COLLECTIONS, KINDS, REACTIONS,
  moveTo, normalizeBoard, normalizeComment, normalizeItem, normalizeReaction, parseQuick, recordOf, sameWho, tagOf,
} from '../core/flow';
import type { Guard, Need } from './access';
import type { AppEnv } from './app';
import type { Store, User } from './store';

type Raw = Record<string, Json>;

export interface FlowDeps {
  store: Store;
  need: (n: Need) => Guard;
  /** The person asking (never a guest here: every route needs a user). */
  me: (c: Context<AppEnv>) => User | null;
  /** Who the record says did it: the person, or an agent acting for them. */
  actorOf: (c: Context<AppEnv>, claimed: unknown) => Actor;
  /** Tell open documents (and the Flow streams) that a collection changed. */
  changed: (owner: string | null, collection: string) => void;
}

const isFlowCollection = (name: string) => (FLOW_COLLECTIONS as string[]).includes(name);

export function flowRoutes(app: Hono<AppEnv>, deps: FlowDeps) {
  const { store, need } = deps;
  const watchers = new Map<string, Set<(collection: string) => void>>();

  /** A collection of this owner's changed: every open Flow page of theirs hears it. */
  const notify = (owner: string | null, collection: string): void => {
    if (!owner || !isFlowCollection(collection)) return;
    for (const fn of [...(watchers.get(owner) ?? [])]) fn(collection);
  };

  const whoOf = (c: Context<AppEnv>, claimed?: unknown): Who => {
    const a = deps.actorOf(c, claimed);
    const user = deps.me(c);
    const w: Who = { kind: a.kind, name: a.name };
    if (a.id) w.id = a.id;
    if (a.for) w.for = a.for;
    if (a.kind === 'human' && user) w.color = user.color;
    return w;
  };
  const ownerWho = (user: User): Who => ({ kind: 'human', name: user.name, id: user.id, color: user.color });

  const board = (owner: string): FlowBoard => normalizeBoard(store.rows(owner, FLOW.board)[0] as Raw | undefined);
  const rawItem = (owner: string, id: string): Raw | null => (store.rows(owner, FLOW.items).find((r) => r.id === id) as Raw | undefined) ?? null;
  const itemOf = (owner: string, user: User, id: string): FlowItem | null => {
    const r = rawItem(owner, id);
    return r ? normalizeItem(r, ownerWho(user)) : null;
  };
  const all = (owner: string, user: User) => {
    const me = ownerWho(user);
    const items = store.rows(owner, FLOW.items).map((r) => normalizeItem(r as Raw, me));
    const comments = store.rows(owner, FLOW.comments).map((r) => normalizeComment(r as Raw, me)).filter((k) => k.item && k.text);
    const reactions = store.rows(owner, FLOW.reactions).map((r) => normalizeReaction(r as Raw, me)).filter((r): r is FlowReaction => !!r);
    const docs: Record<string, string> = {};
    for (const i of items) if (i.doc && !(i.doc in docs)) docs[i.doc] = store.summary(i.doc)?.title ?? '';
    return { items, comments, reactions, board: board(owner), docs };
  };

  /** The fields a request may set on an item, cleaned; anything else is left out. */
  function cleanFields(body: Raw, cols: string[]): { fields: Raw; error?: string } {
    const f: Raw = {};
    if ('kind' in body) {
      if (!KINDS.includes(body.kind as never)) return { fields: f, error: 'kind is note, task or event' };
      f.kind = body.kind;
    }
    if ('text' in body) f.text = String(body.text ?? '').trim().slice(0, 2000);
    if ('body' in body) f.body = String(body.body ?? '').trim().slice(0, 20_000);
    if ('tags' in body) {
      if (!Array.isArray(body.tags)) return { fields: f, error: 'tags is a list of words' };
      f.tags = [...new Set(body.tags.map((t) => tagOf(String(t))).filter(Boolean))].slice(0, 20);
    }
    if ('status' in body) {
      const s = String(body.status ?? '');
      if (s && !cols.includes(s)) return { fields: f, error: `no column "${s}"; the board has ${cols.join(', ')}` };
      f.status = s;
    }
    if ('done' in body) f.done = !!body.done;
    for (const k of ['due', 'start', 'end'] as const) {
      if (!(k in body)) continue;
      const v = body[k];
      if (v == null || v === '') f[k] = null;
      else if (typeof v === 'string' && (k === 'due' ? /^\d{4}-\d{2}-\d{2}$/ : /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/).test(v)) f[k] = v;
      else return { fields: f, error: `${k} is a day (2026-10-20)${k === 'due' ? '' : ' or a time (2026-10-20T15:00)'}` };
    }
    if ('priority' in body) {
      const p = Number(body.priority);
      if (![0, 1, 2].includes(p)) return { fields: f, error: 'priority is 0, 1 or 2' };
      f.priority = p as Priority;
    }
    if ('pinned' in body) f.pinned = !!body.pinned;
    if ('order' in body) {
      if (typeof body.order !== 'number' || !Number.isFinite(body.order)) return { fields: f, error: 'order is a number' };
      f.order = body.order;
    }
    if ('doc' in body) {
      if (body.doc == null || body.doc === '') f.doc = null;
      else if (typeof body.doc === 'string') f.doc = body.doc;
      else return { fields: f, error: 'doc is a document id' };
    }
    return { fields: f };
  }

  const canOpen = (user: User, doc: string) => !!store.roleOf(doc, user.id);

  /** Done and the column agree: into the last column means done, done means the last column, out of it means not done. */
  function settle(cur: FlowItem, f: Raw, cols: string[], now: number): Raw {
    const last = cols[cols.length - 1];
    const out = { ...f };
    const kind = (out.kind ?? cur.kind) as FlowItem['kind'];
    if (kind === 'task' && !(out.status ?? cur.status)) out.status = cols[0];
    if (typeof out.status === 'string' && !('done' in out)) Object.assign(out, moveTo(out.status || cols[0], cols));
    if ('done' in out) {
      const done = !!out.done;
      if (done !== cur.done) out.doneAt = done ? now : null;
      if (done && out.status !== last) out.status = last;
      if (!done && (out.status ?? cur.status) === last) out.status = cols[0];
    }
    return out;
  }

  const bump = (owner: string, id: string, now: number) => store.update(owner, FLOW.items, id, { updated: now });

  /** A comment the server writes for the person: the clock's log line. */
  const say = (owner: string, item: string, who: Who, text: string, now: number) =>
    store.insert(owner, FLOW.comments, { item, text, by: who as unknown as Json, posted: now });

  /** Stop the clock on an item: its minutes are kept, and a comment says so. */
  function stopClock(owner: string, item: FlowItem, who: Who, now: number): void {
    if (!item.clock) return;
    const minutes = Math.max(0, Math.floor((now - item.clock) / 60_000));
    store.update(owner, FLOW.items, item.id, { clock: null, spent: item.spent + minutes, updated: now });
    if (minutes >= 1) say(owner, item.id, who, `Worked ${minutes} min on this`, now);
  }

  const ownerOf = (c: Context<AppEnv>): { owner: string; user: User } => {
    const user = deps.me(c)!;
    return { owner: user.id, user };
  };
  const notFound = (c: Context<AppEnv>, id: string) => c.json({ error: `no item ${id}` }, 404);
  const changed = (owner: string, ...collections: string[]) => {
    for (const col of collections) deps.changed(owner, col);
  };

  // ── everything, once ──

  app.get('/api/flow', need('user'), (c) => {
    const { owner, user } = ownerOf(c);
    return c.json({ ...all(owner, user), me: whoOf(c) });
  });

  // ── the stream: which of the account's Flow collections changed ──

  app.get('/api/flow/events', need('user'), (c) => {
    const { owner } = ownerOf(c);
    const who = c.get('who');
    return streamSSE(c, async (stream) => {
      let gone = false;
      const fn = (collection: string) => {
        stream.writeSSE({ event: 'data', data: JSON.stringify({ type: 'data', collection }) }).catch(() => off());
      };
      let set = watchers.get(owner);
      if (!set) watchers.set(owner, (set = new Set()));
      set.add(fn);
      const off = () => {
        if (gone) return;
        gone = true;
        set!.delete(fn);
        if (!set!.size) watchers.delete(owner);
      };
      stream.onAbort(off);
      await stream.writeSSE({ event: 'hello', data: '{}' });
      while (!stream.aborted && !stream.closed && !gone) {
        await stream.sleep(10_000);
        if (who.kind === 'user' && who.via === 'session' && !store.session(who.session)) break;
        if (!gone) await stream.writeSSE({ event: 'ping', data: '{}' }).catch(() => {});
      }
      off();
    });
  });

  // ── the board ──

  app.put('/api/flow/board', need('user'), async (c) => {
    const { owner } = ownerOf(c);
    const body = (await c.req.json()) as { columns?: unknown; rename?: { from?: unknown; to?: unknown } };
    const cols = Array.isArray(body.columns) ? [...new Set(body.columns.map((x) => String(x ?? '').trim().slice(0, 40)).filter(Boolean))] : [];
    if (cols.length < 2 || cols.length > 8) return c.json({ error: 'the board has two to eight columns' }, 400);
    const cur = store.rows(owner, FLOW.board)[0];
    if (cur) store.update(owner, FLOW.board, cur.id, { columns: cols });
    else store.insert(owner, FLOW.board, { columns: cols });
    // A renamed column keeps its cards; cards of a column that went start again; the last column still means done.
    const from = typeof body.rename?.from === 'string' ? body.rename.from : null;
    const to = typeof body.rename?.to === 'string' && cols.includes(body.rename.to) ? body.rename.to : null;
    for (const r of store.rows(owner, FLOW.items)) {
      const s = r.status as string | undefined;
      if (r.kind !== 'task' || !s) continue;
      if (from && to && s === from) store.update(owner, FLOW.items, r.id, { status: to });
      else if (!r.done && !cols.includes(s)) store.update(owner, FLOW.items, r.id, { status: cols[0] });
    }
    changed(owner, FLOW.board, FLOW.items);
    return c.json(board(owner));
  });

  // ── items ──

  app.post('/api/flow', need('user'), async (c) => {
    const { owner, user } = ownerOf(c);
    const body = ((await c.req.json()) ?? {}) as Raw & { actor?: unknown; plain?: unknown };
    const who = whoOf(c, body.actor);
    const now = Date.now();
    const cols = board(owner).columns;
    const text = String(body.text ?? '');
    // Something brought in from elsewhere keeps its own time, as long as it is in the past.
    const posted = typeof body.posted === 'number' && Number.isFinite(body.posted) && body.posted <= now + 60_000 ? Math.round(body.posted) : now;
    if (!text.trim() && !String(body.body ?? '').trim()) return c.json({ error: 'say something: {"text": "Call Ben tomorrow 3pm #sales"}' }, 400);
    // The text is read as quick-add (a date, a time, #tags, !); fields given beside it win. plain: keep the text as it is.
    const lines = text.replace(/\r/g, '').split('\n');
    const quick = body.plain
      ? { kind: 'note' as const, text: lines[0].trim(), body: lines.slice(1).join('\n').trim(), tags: [], priority: 0 as const, due: null, start: null, end: null }
      : parseQuick(text);
    const base = recordOf(quick, who, posted, cols[0]);
    const { fields, error } = cleanFields(body, cols);
    if (error) return c.json({ error }, 400);
    delete fields.text;
    if (fields.doc && !canOpen(user, fields.doc as string)) return c.json({ error: 'no such document to attach' }, 400);
    const merged = settle(normalizeItem({ ...base, id: 'new', at: now }, who), { ...base, ...fields }, cols, posted);
    merged.order = typeof fields.order === 'number' ? fields.order : posted;
    const row = store.insert(owner, FLOW.items, merged, { flow: true });
    changed(owner, FLOW.items);
    return c.json(normalizeItem(row as Raw, ownerWho(user)), 201);
  });

  app.patch('/api/flow/:id', need('user'), async (c) => {
    const { owner, user } = ownerOf(c);
    const id = c.req.param('id');
    const cur = itemOf(owner, user, id);
    if (!cur) return notFound(c, id);
    const body = ((await c.req.json()) ?? {}) as Raw;
    const cols = board(owner).columns;
    const { fields, error } = cleanFields(body, cols);
    if (error) return c.json({ error }, 400);
    if (fields.doc && !canOpen(user, fields.doc as string)) return c.json({ error: 'no such document to attach' }, 400);
    const now = Date.now();
    const out = settle(cur, fields, cols, now);
    const row = store.update(owner, FLOW.items, id, { ...out, updated: now });
    changed(owner, FLOW.items);
    return c.json(normalizeItem(row as Raw, ownerWho(user)));
  });

  app.delete('/api/flow/:id', need('user'), (c) => {
    const { owner } = ownerOf(c);
    const id = c.req.param('id');
    const ok = store.deleteRow(owner, FLOW.items, id);
    if (!ok) return notFound(c, id);
    for (const r of store.rows(owner, FLOW.comments)) if (r.item === id) store.deleteRow(owner, FLOW.comments, r.id);
    for (const r of store.rows(owner, FLOW.reactions)) if (r.item === id) store.deleteRow(owner, FLOW.reactions, r.id);
    changed(owner, FLOW.items, FLOW.comments, FLOW.reactions);
    return c.json({ ok: true });
  });

  // ── comments ──

  app.post('/api/flow/:id/comments', need('user'), async (c) => {
    const { owner, user } = ownerOf(c);
    const id = c.req.param('id');
    const cur = itemOf(owner, user, id);
    if (!cur) return notFound(c, id);
    const body = ((await c.req.json()) ?? {}) as { text?: unknown; actor?: unknown; posted?: unknown };
    const text = String(body.text ?? '').trim().slice(0, 5000);
    if (!text) return c.json({ error: 'send {"text": "…"}' }, 400);
    const now = Date.now();
    const posted = typeof body.posted === 'number' && Number.isFinite(body.posted) && body.posted <= now + 60_000 ? Math.round(body.posted) : now;
    const row = say(owner, id, whoOf(c, body.actor), text, posted);
    bump(owner, id, Math.max(posted, cur.updated));
    changed(owner, FLOW.comments, FLOW.items);
    return c.json(normalizeComment(row as Raw, ownerWho(user)), 201);
  });

  app.delete('/api/flow/comments/:id', need('user'), (c) => {
    const { owner } = ownerOf(c);
    const id = c.req.param('id');
    const ok = store.deleteRow(owner, FLOW.comments, id);
    if (!ok) return c.json({ error: `no comment ${id}` }, 404);
    changed(owner, FLOW.comments);
    return c.json({ ok: true });
  });

  // ── reactions: one per person (or agent) and kind, toggled ──

  app.post('/api/flow/:id/react', need('user'), async (c) => {
    const { owner, user } = ownerOf(c);
    const id = c.req.param('id');
    if (!itemOf(owner, user, id)) return notFound(c, id);
    const body = ((await c.req.json()) ?? {}) as { kind?: unknown; actor?: unknown };
    const kind = REACTIONS.find((r) => r.kind === body.kind)?.kind;
    if (!kind) return c.json({ error: `kind is one of ${REACTIONS.map((r) => r.kind).join(', ')}` }, 400);
    const who = whoOf(c, body.actor);
    const me = ownerWho(user);
    const mine = store.rows(owner, FLOW.reactions)
      .map((r) => normalizeReaction(r as Raw, me))
      .filter((r): r is FlowReaction => !!r && r.item === id && r.kind === kind && sameWho(r.by, who));
    let on: boolean;
    if (mine.length) {
      for (const r of mine) store.deleteRow(owner, FLOW.reactions, r.id);
      on = false;
    } else {
      store.insert(owner, FLOW.reactions, { item: id, kind, by: who as unknown as Json });
      on = true;
    }
    changed(owner, FLOW.reactions);
    const reactions = store.rows(owner, FLOW.reactions).map((r) => normalizeReaction(r as Raw, me)).filter((r): r is FlowReaction => !!r && r.item === id);
    return c.json({ on, reactions });
  });

  // ── the clock: one runs at a time; stopping logs the minutes ──

  app.post('/api/flow/:id/clock', need('user'), async (c) => {
    const { owner, user } = ownerOf(c);
    const id = c.req.param('id');
    const cur = itemOf(owner, user, id);
    if (!cur) return notFound(c, id);
    const body = ((await c.req.json()) ?? {}) as { running?: unknown; actor?: unknown };
    const who = whoOf(c, body.actor);
    const now = Date.now();
    const me = ownerWho(user);
    if (body.running) {
      for (const r of store.rows(owner, FLOW.items)) if (r.clock && r.id !== id) stopClock(owner, normalizeItem(r as Raw, me), who, now);
      if (!cur.clock) store.update(owner, FLOW.items, id, { clock: now, updated: now });
    } else stopClock(owner, cur, who, now);
    changed(owner, FLOW.items, FLOW.comments);
    return c.json(itemOf(owner, user, id));
  });

  return { notify };
}

