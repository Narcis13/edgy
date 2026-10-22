// The HTTP API. People's browsers and agents use the same endpoints.
//
// Who may call what is decided in access.ts: every request is resolved to who
// is asking (the middleware below), and every route says what it needs
// (`need(…)` before its handler).

import { Hono } from 'hono';
import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { bodyLimit } from 'hono/body-limit';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IncomingMessage } from 'node:http';
import { type Actor, type Doc, type Json, type Op, type Sx, isContainer, isGroup, newDoc } from '../core/types';
import { OpError, applyOps } from '../core/ops';
import { type Computed, type World, evalIn, evaluate, plainValue } from '../core/engine';
import { toNotation } from '../core/notation';
import { outline } from '../core/outline';
import { SxError, read } from '../core/sx';
import { indexTree, walk } from '../core/tree';
import { GUIDE } from '../core/reference';
import { TEMPLATES, tour } from '../core/templates';
import { TUTORIALS } from '../core/tutorials';
import { type Entry, type Filter, type Sort, FILTERS, SORTS, arrange, match, queryWords } from '../core/library';
import { collectionsUsed } from '../core/events';
import {
  type AuthMode, type Env, type Need, type Principal, SHARE_HEADER, SIGN_IN,
  crossSite, guards, guestFor, guestHears, isLoopbackAddress, isPublic, loopbackHost,
} from './access';
import {
  KEY_PREFIX, SESSION_COOKIE, SESSION_DAYS, Throttle, colorFor, digest, emailProblem, hashPassword, initials,
  newApiKey, newSecret, normalEmail, passwordProblem, readCookie, sessionCookie, verifyPassword,
} from './auth';
import { type DocEvent, Hub, type Present } from './hub';
import { type Clock, type Getter, EVENTS_ACTOR, Runner } from './runner';
import { type Provider, ComposeError, Requests, TARGETS, accept, claudeConfig, compose, context, eventOf, eventProblem, isTarget } from './compose';
import { type Bundle, type Pictures, composeHtml, dataUri, fileName, forExport, quietState, sniffImage, withoutAddresses, withoutAddressesIn } from './export';
import { getGuarded } from './runner';
import type { ExportPayload } from '../core/offline';
import { shapeOf } from '../core/library';
import { type Access, type Deck, type DocSummary, type Role, type Share, type Store, type User, StoreError, isDeckId, shortId } from './store';
import type { Cloud } from './cloud';
import { Sync } from './sync';
import { flowRoutes } from './flow';

const ASSET_TYPES: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif', 'image/svg+xml': 'svg',
};
const MAX_ASSET = 8 * 1024 * 1024;
/** The largest request body: a picture, or a document's worth of ops. */
const MAX_BODY = 16 * 1024 * 1024;
/** The most ids one request may list (pins, a bulk action, a deck's documents). */
const MAX_IDS = 1000;
/** The pictures one exported file may hold in all, as text: more would make a file no browser opens well. */
const MAX_EXPORT_PICTURES = 64 * 1024 * 1024;
/** How long a person's compose request waits for a listening agent. */
const AGENT_WAIT = 45_000;
/** A session's expiry moves forward at most this often, so reading doesn't write on every request. */
const SESSION_SLIDE = 60 * 60_000;

const cleanName = (n: unknown, max = 40) => (typeof n === 'string' ? n.trim().slice(0, max) : '');
/** A request body as an object: JSON that is null, a number or a list is an empty one, so the route's own checks answer. */
const objectOf = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) as Record<string, unknown>;

/** What tests swap: the clock timers run on, how addresses are fetched, the environment secrets come from. */
export interface AppOptions {
  clock?: Clock;
  get?: Getter;
  env?: Record<string, string | undefined>;
  /** The offline build exports are made from (see export.ts). */
  offline?: () => Promise<Bundle | null>;
  /** local: a request from this machine with no session or key is the local account's. Default local. */
  auth?: AuthMode;
  /** The clock sign-in throttling counts on. */
  now?: () => number;
  /** The cloud to sync with (see sync.ts); none: local only. */
  cloud?: Cloud | null;
  /** How often sync pulls, in ms; 0: only when asked (tests). */
  syncInterval?: number;
}

/** What node's server hands each request, and what in-process requests carry instead. */
type Bindings = { incoming?: IncomingMessage; internal?: { doc: string } };
export type AppEnv = Env & { Bindings: Bindings };
type C = Context<AppEnv>;

/** One open event stream: whose it is and what they are doing. */
interface Listener {
  doc: string;
  who: Principal;
  client: string;
  mode: string;
  selected: string | null;
  send: (e: DocEvent) => Promise<unknown>;
  /** Hear nothing more, and end the stream once `after` (what was sent last) has gone out. */
  close: (after?: Promise<unknown>) => void;
}

export function createApp(store: Store, assetsDir: string, webUrl?: string, opts: AppOptions = {}) {
  const mode: AuthMode = opts.auth ?? 'accounts';
  const app = new Hono<AppEnv>();
  const hub = new Hub();
  const requests = new Requests();
  // Failed sign-ins slow down the guesser: fast for one email from one address, much later for an email
  // (so someone else can't lock a person out) or for an address (a proxy's, shared by many) alone.
  const clock = { now: opts.now ?? Date.now };
  const throttles = { pair: new Throttle(clock, 4), email: new Throttle(clock, 50), address: new Throttle(clock, 30), signup: new Throttle(clock, 10) };
  /** off: nobody new signs up once the server has its first account (EDGY_SIGNUPS=off, for a server on the internet). */
  const signupsOpen = () => (opts.env ?? process.env).EDGY_SIGNUPS !== 'off' || !store.users().some((u) => !u.local);
  /**
   * Ask AI with Claude spends the server's ANTHROPIC_API_KEY, which is its owner's, like its secrets: it answers
   * in the owner's documents (and for whoever the owner lets edit them), or in everyone's with EDGY_AI_USERS=all.
   */
  const claudeFor = (docId: string | undefined, asker: string | null) => {
    const claude = claudeConfig(opts.env ?? process.env);
    if (!claude || (opts.env ?? process.env).EDGY_AI_USERS === 'all') return claude;
    const owner = store.serverOwner();
    return owner && (docId ? store.docOwner(docId) : asker) === owner ? claude : null;
  };

  // ── records, as each document sees them ──

  /** The collections a document reads or writes, by version (with its owner's full view). */
  const readsCache = new Map<string, { v: number; names: string[] }>();
  function reads(docId: string): string[] {
    const doc = store.getDoc(docId);
    if (!doc) return [];
    const hit = readsCache.get(docId);
    if (hit && hit.v === doc.v) return hit.names;
    const owner = store.docOwner(docId) ?? null;
    const full: World = { rows: (name) => store.rows(owner, name), now: Date.now(), fetched: (id) => runner.states(docId)[id] };
    const names = [...new Set([...collectionsUsed(doc), ...evaluate(doc, full).collections])].sort();
    readsCache.set(docId, { v: doc.v, names });
    return names;
  }

  /**
   * The collections a document's owner let it use: those it used at the owner's
   * last change (see `approve`). Never worked out from what someone else made it say.
   */
  function reaches(docId: string): string[] {
    return store.reaches(docId) ?? [];
  }

  /** The collections Ask AI may name for this document: all its owner's for the owner, those it reaches for anyone else. */
  const collectionsFor = (docId: string, role: string | undefined) =>
    role === 'owner' ? store.collections(store.docOwner(docId) ?? null).map((x) => x.name) : reaches(docId);

  /** Who sees fetch cells' addresses and headers: the owner and editors (who can change them anyway). */
  const seesAddresses = (role: string | undefined) => role === 'owner' || role === 'editor';

  /** A document's fetch cells, by id and by name. */
  function fetchCells(docId: string): Set<string> {
    const out = new Set<string>();
    const doc = store.getDoc(docId);
    if (doc) walk(doc.root, (c) => {
      if (c.kind !== 'fetch') return;
      out.add(c.id);
      if (c.name) out.add(c.name);
    });
    return out;
  }

  /** Where a fetch goes, for approving secrets: this server, or an origin. */
  const originOf = (url: string) => {
    if (url.startsWith('/')) return 'this-server';
    try { return new URL(url).origin; } catch { return ''; }
  };

  /** Each fetch cell's secrets and where they go, as the document says now: "<cell> <origin> <SECRET>". */
  function secretUses(docId: string): string[] {
    const doc = store.getDoc(docId);
    if (!doc) return [];
    const out: string[] = [];
    let computed: Computed | null = null;
    walk(doc.root, (c) => {
      if (c.kind !== 'fetch' || !c.headers || typeof c.headers !== 'object' || Array.isArray(c.headers)) return;
      const names = Object.values(c.headers as Record<string, unknown>).map((v) => (typeof v === 'string' ? /^secret:([A-Za-z_]\w*)$/.exec(v.trim())?.[1] : undefined)).filter((n): n is string => !!n);
      if (!names.length) return;
      computed ??= evaluate(doc, world(docId, true));
      const url = String(computed.cells[c.id]?.props?.url ?? c.url ?? '');
      for (const n of names) out.push(`${c.id} ${originOf(url)} ${n}`);
    });
    return out.sort();
  }

  /**
   * The owner stands behind the document as it is now: the collections it uses
   * become what it reaches, and its fetch cells' secrets may go where they point.
   * Called on the owner's own changes (`touched`: the cells that change touched)
   * and when the owner first lets someone else in. A secret is approved only for a
   * cell the owner's own change touched, or where it was approved before: an
   * owner renaming the document doesn't send a secret where an editor pointed a cell.
   */
  function approve(docId: string, touched?: string[]) {
    store.setReaches(docId, reads(docId));
    const before = store.trusted(docId);
    const now = secretUses(docId);
    store.setTrusted(docId, touched ? now.filter((e) => before.includes(e) || touched.includes(e.split(' ')[0])) : now);
  }

  const unreached = (name: string) => new Error(`this document does not reach the collection "${name}"; its owner's next change to it lets it`);

  /** What formulas see: records (the owner's; for anyone else, only those the document reaches), the time, fetch answers. */
  function world(docId: string, full = false): World {
    const base = runner.world(docId);
    const owner = store.docOwner(docId) ?? null;
    return {
      ...base,
      rows: (name) => {
        if (!full && !reaches(docId).includes(name)) throw unreached(name);
        return store.rows(owner, name);
      },
    };
  }

  /** Tell the documents of this owner that are open (and only those) that a collection changed. */
  function dataChanged(owner: string | null, collection: string) {
    for (const id of hub.roomIds()) if ((store.docOwner(id) ?? null) === owner) hub.publish(id, { type: 'data', collection });
    flow.notify(owner, collection);
  }

  const runner = new Runner({
    store, hub, ...opts,
    data: {
      rows: (doc, name) => {
        if (!reaches(doc).includes(name)) throw unreached(name);
        return store.rows(store.docOwner(doc) ?? null, name);
      },
      write: (doc, e) => {
        const name = String(e.collection);
        const owner = store.docOwner(doc) ?? null;
        if (!reaches(doc).includes(name)) return false;
        const plain = (v: unknown) => JSON.parse(JSON.stringify(v ?? null)) as Record<string, Json>;
        if (e.type === 'insert') store.insert(owner, name, plain(e.record), { doc, events: true });
        else if (e.type === 'update') store.update(owner, name, String(e.id), plain(e.fields));
        else if (e.type === 'delete') store.deleteRow(owner, name, String(e.id));
        else if (e.type === 'clear') store.clear(owner, name);
        dataChanged(owner, name);
        return true;
      },
      // The server's secrets are its owner's: only that account's documents send them, and only from the cell
      // and to the origin the owner left them in (an editor who points the cell elsewhere sends nothing).
      secret: (doc, cell, url, name) => {
        const owner = store.serverOwner();
        return !!owner && store.docOwner(doc) === owner && store.trusted(doc).includes(`${cell} ${originOf(url)} ${name}`);
      },
    },
    // A fetch cell's path on this server is answered here, in process, as the document (see access.ts).
    local: async (doc, path, headers) => {
      const res = await app.request(path, { headers }, { internal: { doc } });
      return { status: res.status, body: await res.text() };
    },
  });

  // ── the cloud: what other machines changed arrives here ──

  const sync = opts.cloud
    ? new Sync(store, opts.cloud, {
        reset: (doc, v) => {
          readsCache.delete(doc);
          hub.publish(doc, { type: 'reset', v });
          runner.changed(doc);
        },
        deleted: (doc) => {
          gone(doc);
          recheck(doc);
        },
        data: (owner, collection) => dataChanged(owner, collection),
        account: (id, passwordChanged) => {
          const user = store.user(id);
          if (user) renamed(user);
          // A new password on another machine ends the sessions here too.
          if (passwordChanged) {
            store.endSessions(id);
            recheck();
          }
        },
        accountDeleted: (id) => {
          for (const doc of store.deleteUser(id)) gone(doc);
          recheck();
        },
        access: (doc) => recheck(doc),
        unshared: (doc, token) => hub.publish(doc, { type: 'unshared', token }),
      }, { interval: opts.syncInterval, assetsDir })
    : null;
  if (sync) store.onChange = () => sync.kick();

  // Documents nobody but their owner could have changed (from before reaches were kept, say) are approved as they are.
  for (const id of store.unapproved()) approve(id);

  // ── who is asking ──

  /** The account local mode signs in by itself, made on first use, with the tour unless it has documents already. */
  function localUser(): User {
    const known = store.localUser();
    if (known) return known;
    const user = store.createUser({ email: null, name: 'You', color: colorFor('local'), password: null, local: true });
    if (!store.listDocs(user.id).length) create(undefined, 'tour', undefined, { kind: 'agent', name: 'Edgy' }, user.id);
    return user;
  }

  /** A request from this machine: its socket says so; a request made in process has none. */
  const fromHere = (c: C) => {
    const incoming = c.env?.incoming;
    return !incoming || isLoopbackAddress(incoming.socket?.remoteAddress);
  };
  /**
   * Who is knocking, for slowing down guesses. Behind a proxy on this machine (how edgy is put online) every
   * socket is the proxy's, so its X-Forwarded-For counts: the last entry, the one the proxy added itself.
   * From anywhere else the header is the caller's own word and is ignored.
   */
  const address = (c: C) => {
    const socket = c.env?.incoming?.socket?.remoteAddress;
    const hops = socket && isLoopbackAddress(socket) ? (c.req.header('x-forwarded-for') ?? '').split(',').map((s) => s.trim()).filter(Boolean) : [];
    return hops.at(-1) ?? socket ?? 'here';
  };
  const secure = (c: C) => new URL(c.req.url).protocol === 'https:' || c.req.header('x-forwarded-proto') === 'https';

  /** Who is asking, or why the credential they sent doesn't count. */
  function resolve(c: C): Principal | { status: 400 | 401 | 403 | 404 | 410; error: string; reason: string } {
    const internal = c.env?.internal;
    // A fetch cell reading this server: the document itself, with what its links could reach for "edit".
    if (internal) return { kind: 'guest', level: 'edit', doc: internal.doc, token: '', collections: reaches(internal.doc) };
    const token = c.req.header(SHARE_HEADER) ?? c.req.query('share');
    if (token) return guestFor(store, token, reaches);
    // Only an edgy key is a key: another Authorization (a proxy's basic auth, say) leaves the cookie to speak.
    const m = /^Bearer\s+(\S+)$/i.exec(c.req.header('authorization') ?? '');
    if (m && m[1].startsWith(KEY_PREFIX)) {
      const key = store.keyByHash(digest(m[1]));
      if (!key) return { status: 401, error: 'this API key is not valid; make one in your profile (Profile → API keys)', reason: 'signin' };
      if (key.revokedAt != null) return { status: 401, error: 'this API key was revoked; make a new one in your profile', reason: 'signin' };
      const user = store.user(key.userId);
      if (!user) return { status: 401, error: 'this API key belongs to an account that no longer exists', reason: 'signin' };
      const now = Date.now();
      if (!key.lastUsedAt || now - key.lastUsedAt > 60_000) store.touchKey(key.id, now);
      return { kind: 'user', user, via: 'key', key };
    }
    const cookie = readCookie(c.req.header('cookie'), SESSION_COOKIE);
    if (cookie) {
      const hash = digest(cookie);
      const s = store.session(hash);
      const user = s && store.user(s.userId);
      if (s && user) {
        const now = Date.now();
        if (now - s.seenAt > SESSION_SLIDE) {
          store.touchSession(hash, now, now + SESSION_DAYS * 86400_000);
          c.header('set-cookie', sessionCookie(cookie, secure(c)), { append: true });
        }
        return { kind: 'user', user, via: 'session', session: hash };
      }
    }
    // A request a proxy forwarded came from somewhere else, whatever its socket says.
    const forwarded = ['forwarded', 'x-forwarded-for', 'x-real-ip'].some((h) => c.req.header(h));
    if (mode === 'local' && !forwarded && fromHere(c) && loopbackHost(c.req.header('host'))) return { kind: 'user', user: localUser(), via: 'local' };
    return { kind: 'none' };
  }

  /**
   * This server's address as the browser sees it. Behind a proxy that ends HTTPS (how edgy is put online) the
   * request arrives as plain http, perhaps for another host name: the proxy's X-Forwarded-Proto and -Host say
   * what the browser asked for. (A page on another site can't set these headers on a person's request.)
   */
  const publicOrigin = (c: C) => {
    const url = new URL(c.req.url);
    const host = c.req.header('x-forwarded-host')?.split(',')[0].trim();
    return `${secure(c) ? 'https:' : url.protocol}//${host && /^[\w.-]+(:\d+)?$|^\[[\da-f:.]+\](:\d+)?$/i.test(host) ? host : url.host}`;
  };
  /** The origins edgy's own pages are served from: this server (as asked, and as the browser sees it), and the dev server in development. */
  const origins = (c: C) => [new URL(c.req.url).origin, publicOrigin(c), ...(webUrl ? [new URL(webUrl).origin] : [])];

  // Every answer: no other site may frame edgy (a click on its buttons there would be the person's), nor learn a
  // share link's address from the Referer, and no browser guesses a type other than the one sent.
  app.use('*', async (c, next) => {
    await next();
    const guard = (h: Headers) => {
      h.set('x-content-type-options', 'nosniff');
      h.set('referrer-policy', 'same-origin');
      h.set('x-frame-options', 'SAMEORIGIN');
      if (!h.has('content-security-policy')) h.set('content-security-policy', "frame-ancestors 'self'");
    };
    try {
      guard(c.res.headers);
    } catch {
      // A response whose headers can't change (a redirect made by Response.redirect, say): copied, then set.
      c.res = new Response(c.res.body, c.res);
      guard(c.res.headers);
    }
  });

  // Every request passes here first: who is asking, and nobody gets past without a credential.
  app.use('/api/*', async (c, next) => {
    const who = resolve(c);
    if ('status' in who) {
      // The page a link opens asks first what it opens; "nothing any more" is an answer, not a failure.
      if (c.req.path === '/api/shared') return c.json({ refused: who.reason, error: who.error });
      return c.json({ error: who.error, reason: who.reason }, who.status);
    }
    if (who.kind === 'none' && !isPublic(c.req.method, c.req.path)) return c.json({ error: SIGN_IN.error, reason: SIGN_IN.reason }, 401);
    if (who.kind === 'user' && who.via !== 'key') {
      const wrong = crossSite(c.req.method, (k) => c.req.header(k), origins(c));
      if (wrong) return c.json({ error: wrong, reason: 'forbidden' }, 403);
    }
    c.set('who', who);
    c.set('checked', {});
    await next();
  });

  // A body is read whole into memory, so none may be large: a picture's 8 MB with room to spare, a sign-in's few words.
  // Checked once the asker is known, so nobody without a credential gets to send megabytes.
  const tooLarge = (max: string) => (c: C) => c.json({ error: `that request is larger than ${max}` }, 413);
  app.use('/api/auth/*', bodyLimit({ maxSize: 64 * 1024, onError: tooLarge('64 KB') }));
  app.use('/api/*', bodyLimit({ maxSize: MAX_BODY, onError: tooLarge(`${MAX_BODY / 1024 / 1024} MB`) }));

  const need = guards({ store, reaches });
  const me = (c: C): User | null => {
    const who = c.get('who');
    return who.kind === 'user' ? who.user : null;
  };
  const myId = (c: C) => me(c)?.id ?? null;

  /** Who the history says did it: the server knows, the body only names an agent. */
  function actorOf(c: C, claimed: unknown): Actor {
    const who = c.get('who');
    const said = cleanName((claimed as { name?: unknown } | null)?.name);
    if (who.kind === 'user' && who.via === 'key') return { kind: 'agent', name: said || who.key.name || 'Agent', id: who.user.id, for: who.user.name };
    // On this machine without a key (local mode), an agent says it is one, as before accounts.
    if (who.kind === 'user' && who.via === 'local' && (claimed as { kind?: unknown } | null)?.kind === 'agent') return { kind: 'agent', name: said || 'Agent', id: who.user.id, for: who.user.name };
    if (who.kind === 'user') return { kind: 'human', name: who.user.name, id: who.user.id };
    if (who.kind === 'guest' && !who.token) return EVENTS_ACTOR;
    return { kind: 'human', name: said && said !== 'You' ? said : 'Guest', guest: true };
  }

  /** What someone may see of a person. */
  const publicUser = (u: User) => ({ id: u.id, name: u.name, color: u.color, initials: initials(u.name) });
  const profile = (u: User) => ({ ...publicUser(u), email: u.email, theme: u.theme, local: u.local, hasPassword: u.hasPassword, createdAt: u.createdAt });

  // ── Flow: the account's notes, tasks, events, comments and reactions (see flow.ts) ──

  const flow = flowRoutes(app, { store, need, me, actorOf, changed: dataChanged });

  // ── live streams: who has a document open, and access that changes under them ──

  const listeners = new Set<Listener>();

  /** Everyone with the document open, one entry per person; agents and guests aren't listed by name. */
  function present(docId: string): Present[] {
    const byUser = new Map<string, Present>();
    for (const l of listeners) {
      if (l.doc !== docId || l.who.kind !== 'user') continue;
      const u = l.who.user;
      const p = byUser.get(u.id) ?? { id: u.id, name: u.name, color: u.color, kind: l.who.via === 'key' ? 'agent' as const : 'human' as const, selected: null, mode: l.mode, clients: [] };
      p.clients.push(l.client);
      if (l.selected) p.selected = l.selected;
      if (l.mode === 'edit') p.mode = 'edit';
      byUser.set(u.id, p);
    }
    return [...byUser.values()];
  }

  const announce = (docId: string) => hub.publish(docId, { type: 'people', people: present(docId) });

  /**
   * Access changed: every open stream (of one document, or all) is checked
   * again. One that lost access hears why and closes; one whose role moved hears the new role.
   */
  function recheck(docId?: string) {
    const touched = new Set<string>();
    for (const l of [...listeners]) {
      if (docId && l.doc !== docId) continue;
      const who = l.who;
      if (who.kind !== 'user') continue;
      let why: 'access' | 'signedout' | 'deleted' | null = null;
      const user = store.user(who.user.id);
      if (!user) why = 'deleted';
      else if (who.via === 'session' && !store.session(who.session)) why = 'signedout';
      else if (who.via === 'key' && store.keys(user.id).find((k) => k.id === who.key.id)?.revokedAt != null) why = 'signedout';
      const role = why ? null : store.roleOf(l.doc, who.user.id);
      if (!why && !role) why = 'access';
      if (why) {
        l.close(l.send({ type: 'revoked', why }));
        touched.add(l.doc);
      } else {
        if (user && user.name !== who.user.name) (who as { user: User }).user = user;
        void l.send({ type: 'access', role: role! });
      }
    }
    for (const id of touched) announce(id);
  }

  /** A person's name or colour changed: the documents they have open show it. */
  function renamed(user: User) {
    const docs = new Set<string>();
    for (const l of listeners) {
      if (l.who.kind === 'user' && l.who.user.id === user.id) {
        (l.who as { user: User }).user = user;
        docs.add(l.doc);
      }
    }
    for (const id of docs) announce(id);
  }

  // ── documents ──

  /** Apply ops as someone, save them, and tell everyone watching. */
  function change(doc: Doc, raw: Op[], actor: Actor, o: { client?: string; batch?: string; owner?: boolean } = {}) {
    const r = applyOps(doc, raw);
    const next: Doc = { ...r.doc, v: doc.v + 1 };
    const ops = raw.length === 1 ? [r.op] : (r.op.slice(1) as Op[]);
    const ts = store.saveDoc(next, actor, ops);
    // The owner's changes decide which collections the document (and its links) reach; nobody else's do.
    if (o.owner) approve(doc.id, r.touched);
    hub.publish(doc.id, { type: 'ops', v: next.v, ts, actor, ops, touched: r.touched, client: o.client, batch: o.batch });
    runner.changed(doc.id);
    return { next, ops, touched: r.touched };
  }

  /** Gone for good (a deck: ungrouped), and everyone watching is told. */
  function remove(id: string): boolean {
    if (isDeckId(id)) return store.deleteDeck(id);
    const ok = store.deleteDoc(id);
    if (ok) gone(id);
    return ok;
  }

  function gone(id: string) {
    runner.forget(id);
    readsCache.delete(id);
    hub.publish(id, { type: 'deleted' });
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

  const names = () => new Map(store.users().map((u) => [u.id, u.name]));

  /** The home page: my documents and decks (or those shared with me), filtered, searched, pinned first, sorted. */
  function library(owner: string, q: string, filter: Filter, sort: Sort, scope: 'mine' | 'shared') {
    let entries: (Entry & Record<string, unknown>)[];
    let texts: () => Map<string, { id: string; title: string; description: string; text: string }>;
    if (scope === 'shared') {
      const who = names();
      const docs = store.sharedWith(owner);
      // Someone else's arrangement (pins, archive, decks) is theirs; here it is a plain list.
      entries = docs.map((d) => ({ type: 'doc' as const, ...d, pinned: null, archivedAt: null, deck: null, ownerName: who.get(d.owner ?? '') ?? 'Someone' }));
      texts = () => new Map(store.texts(undefined, docs.map((d) => d.id)).map((t) => [t.id, t]));
    } else {
      const docs = store.listDocs(owner);
      const byId = new Map(docs.map((d) => [d.id, d]));
      const decks = store.decks(owner);
      const deckTitle = new Map(decks.map((k) => [k.id, k.title]));
      entries = [
        ...docs.map((d) => ({ type: 'doc' as const, ...d, ...(d.deck ? { deckTitle: deckTitle.get(d.deck) } : {}) })),
        ...decks.map((k) => deckEntry(k, byId)),
      ];
      texts = () => new Map(store.texts(owner).map((t) => [t.id, t]));
    }
    const words = queryWords(q);
    if (words.length) {
      const known = texts();
      entries = entries.filter((e) => {
        const m = match(words, e.type === 'doc' ? known.get(e.id)! : { title: e.title, description: e.description, text: '' });
        if (m) e.match = m;
        return !!m;
      });
    }
    return { ...arrange(entries, { filter: scope === 'shared' ? 'all' : filter, sort, searching: words.length > 0 }), query: q, filter, sort, scope };
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

  /**
   * Pictures for one export: each address fetched once (a picture in fifty cells is one request), four at a time,
   * and at most MAX_EXPORT_PICTURES of them in all; past that they are left out and counted as missing.
   */
  function picturesFor(): Pictures {
    const got = new Map<string, Promise<string | null>>();
    const waiting: (() => void)[] = [];
    let running = 0;
    let total = 0;
    const slot = () => (running < 4 ? (running++, Promise.resolve()) : new Promise<void>((go) => waiting.push(go)));
    const free = () => {
      const next = waiting.shift();
      if (next) next();
      else running--;
    };
    return async (src) => {
      let p = got.get(src);
      if (!p) {
        p = slot().then(() => pictures(src)).finally(free);
        got.set(src, p);
      }
      const uri = await p;
      if (!uri || total + uri.length > MAX_EXPORT_PICTURES) return null;
      total += uri.length;
      return uri;
    };
  }

  /** What an export of these documents holds: them, the records they read, their fetch answers; nothing else. */
  async function exportOf(docs: Doc[], deck?: Deck) {
    const missing: string[] = [];
    const payload: ExportPayload = { kind: deck ? 'deck' : 'doc', exportedAt: Date.now(), docs: [], shapes: {}, records: {}, fetched: {} };
    const once = picturesFor();
    for (const doc of docs) {
      const computed = evaluate(doc, world(doc.id, true));
      payload.docs.push(await forExport(doc, (c) => computed.cells[c.id]?.value, once, missing));
      payload.shapes[doc.id] = shapeOf(doc.root);
      const owner = store.docOwner(doc.id) ?? null;
      for (const name of reads(doc.id)) payload.records[name] ??= store.rows(owner, name);
      const fetched = Object.fromEntries(Object.entries(runner.states(doc.id)).map(([k, st]) => [k, quietState(st)]));
      if (Object.keys(fetched).length) payload.fetched[doc.id] = fetched;
    }
    if (deck) payload.deck = { id: deck.id, title: deck.title, description: deck.description, docs: docs.map((d) => d.id) };
    return { payload, missing };
  }

  async function sendExport(c: C, docs: Doc[], title: string, deck?: Deck) {
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
  function view(doc: Doc, format: string, full = true) {
    const computed = evaluate(doc, world(doc.id, full));
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

  function create(title: string | undefined, templateId: string | undefined, root: Json | undefined, actor: Actor, owner: string | null): Doc {
    const template = templateId === 'tour' ? tour : [...TEMPLATES, ...TUTORIALS].find((t) => t.id === templateId);
    if (templateId && !template) throw new OpError(`no template "${templateId}"`);
    let doc = newDoc(shortId(), title?.trim() || template?.title || 'Untitled');
    const ops: Op[] = [];
    if (template?.meta) for (const [k, v] of Object.entries(template.meta)) ops.push(['meta', k, v]);
    const content = root ?? template?.root;
    if (content != null) ops.push(['put', 'c1', content]);
    if (!ops.length) {
      store.createDoc(doc, owner);
      approve(doc.id);
      return doc;
    }
    const r = applyOps(doc, ops);
    doc = { ...r.doc, v: 1 };
    // Sample records, once the document is known to build: only into the owner's collections that are still empty.
    for (const [name, records] of Object.entries(template?.data ?? {})) {
      if (store.rows(owner, name).length) continue;
      for (const record of records) store.insert(owner, name, record, { template: template!.id });
      dataChanged(owner, name);
    }
    store.createDoc({ ...doc, v: 0 }, owner);
    store.saveDoc(doc, actor, ops.length === 1 ? [r.op] : (r.op.slice(1) as Op[]));
    approve(doc.id);
    return doc;
  }

  /** With sync: the id of the account the cloud knows by this email, null, or 'unknown' when the cloud can't be asked. */
  async function emailElsewhere(email: string): Promise<string | null> {
    if (!sync) return null;
    try {
      return (await sync.findAccount(email))?.id ?? null;
    } catch {
      return 'unknown';
    }
  }

  /** A session for this account, and its cookie on the answer. */
  function signIn(c: C, user: User) {
    const token = newSecret();
    store.createSession(digest(token), user.id, Date.now() + SESSION_DAYS * 86400_000, c.req.header('user-agent'));
    c.header('set-cookie', sessionCookie(token, secure(c)), { append: true });
  }

  app.onError((e, c) => {
    if (e instanceof OpError || e instanceof SxError) return c.json({ error: e.message }, 422);
    if (e instanceof SyntaxError) return c.json({ error: 'the request body is not valid JSON' }, 400);
    console.error(e);
    return c.json({ error: 'something went wrong on the server' }, 500);
  });

  // Public: whether the server is up, its mode, and whether the asker is signed in (so a signed-out page asks nothing it would be refused).
  app.get('/api/health', need('public'), (c) => c.json({ ok: true, name: 'edgy', web: webUrl ?? publicOrigin(c), auth: mode, signedIn: c.get('who').kind === 'user', sync: !!sync, signups: signupsOpen() }));
  app.get('/api/guide', need('user'), (c) => c.text(GUIDE));
  app.get('/api/templates', need('user'), (c) => c.json(TEMPLATES.map((t) => ({ id: t.id, title: t.title, about: t.about, root: t.root }))));

  // ── accounts ──

  app.post('/api/auth/signup', need('public'), async (c) => {
    const body = objectOf(await c.req.json().catch(() => ({}))) as { email?: unknown; password?: unknown; name?: unknown };
    if (!signupsOpen()) return c.json({ error: "This server does not take new accounts. Sign in with the one you have, or ask the server's owner.", reason: 'closed' }, 403);
    // Each new account costs a password hash and a tour document: one address makes a few, then waits.
    const waitNew = throttles.signup.wait(address(c));
    if (waitNew > 0) {
      const s = Math.ceil(waitNew / 1000);
      c.header('retry-after', String(s));
      return c.json({ error: `Too many new accounts from here. Wait ${s} seconds and try again.`, wait: s }, 429);
    }
    const email = normalEmail(body.email);
    const wrong = emailProblem(email) ?? passwordProblem(body.password);
    if (wrong) return c.json({ error: wrong }, 400);
    if (store.userByEmail(email)) return c.json({ error: 'An account with this email already exists. Sign in instead.' }, 409);
    // With sync, an account made on another machine counts too; one email is one account everywhere.
    const elsewhere = await emailElsewhere(email);
    if (elsewhere === 'unknown') return c.json({ error: 'The cloud cannot be reached to check this email. Try again in a moment.' }, 503);
    if (elsewhere) return c.json({ error: 'An account with this email already exists. Sign in instead.' }, 409);
    const name = cleanName(body.name, 60) || email.split('@')[0];
    const hash = await hashPassword(body.password as string);
    // Someone else may have taken the email while this one was being checked and hashed.
    if (store.userByEmail(email)) return c.json({ error: 'An account with this email already exists. Sign in instead.' }, 409);
    const user = store.createUser({ email, name, color: colorFor(email), password: hash });
    throttles.signup.fail(address(c));
    // Someone new starts with the tour, unless (the first account) they own what was here before.
    if (!store.listDocs(user.id).length) create(undefined, 'tour', undefined, { kind: 'agent', name: 'Edgy' }, user.id);
    signIn(c, user);
    return c.json({ user: profile(user) }, 201);
  });

  app.post('/api/auth/signin', need('public'), async (c) => {
    const body = objectOf(await c.req.json().catch(() => ({}))) as { email?: unknown; password?: unknown };
    const email = normalEmail(body.email);
    const pair = email + ' ' + address(c);
    const wait = Math.max(throttles.pair.wait(pair), throttles.email.wait(email), throttles.address.wait(address(c)));
    if (wait > 0) {
      const s = Math.ceil(wait / 1000);
      c.header('retry-after', String(s));
      return c.json({ error: `Too many tries. Wait ${s} seconds and try again.`, wait: s }, 429);
    }
    const password = typeof body.password === 'string' ? body.password : '';
    let user = email ? store.userByEmail(email) : null;
    let ok = await verifyPassword(password, user ? store.passwordOf(user.id) : null);
    // Not on this machine: with sync, an account made on another one signs in here, and its documents follow.
    if (!user && sync && email) {
      const there = await sync.findAccount(email).catch(() => null);
      if (there?.password && (await verifyPassword(password, there.password))) {
        // Two sign-ins at once: the first one brings the account down, the second finds it here.
        user = store.user(there.id) ?? store.createUser({ id: there.id, email, name: there.name, color: there.color, password: there.password, createdAt: there.createdAt, fromCloud: true });
        if (there.theme === 'light' || there.theme === 'dark') store.quietly(() => store.updateUser(user!.id, { theme: there.theme as 'light' | 'dark' }));
        ok = true;
        // Bring its documents down before showing the library (or carry on, if that takes long).
        let timer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([sync.round(), new Promise((r) => { timer = setTimeout(r, 10_000); })]);
        clearTimeout(timer);
      }
    }
    if (!user || !ok) {
      throttles.pair.fail(pair);
      throttles.email.fail(email);
      throttles.address.fail(address(c));
      return c.json({ error: 'Wrong email or password.' }, 401);
    }
    throttles.pair.clear(pair);
    signIn(c, user);
    return c.json({ user: profile(user) });
  });

  app.post('/api/auth/signout', need('person'), (c) => {
    const who = c.get('who');
    if (who.kind === 'user' && who.via === 'session') store.deleteSession(who.session);
    c.header('set-cookie', sessionCookie(null, secure(c)), { append: true });
    recheck();
    return c.json({ ok: true });
  });

  app.get('/api/me', need('user'), (c) => {
    const who = c.get('who');
    if (who.kind !== 'user') return c.json({ error: SIGN_IN.error }, 401);
    return c.json({ user: profile(who.user), via: who.via, auth: mode, ...(who.via === 'key' ? { key: { id: who.key.id, name: who.key.name } } : {}) });
  });

  app.patch('/api/me', need('person'), async (c) => {
    const user = me(c)!;
    const body = objectOf(await c.req.json()) as { name?: unknown; color?: unknown; theme?: unknown; email?: unknown };
    const fields: Parameters<Store['updateUser']>[1] = {};
    if (body.name !== undefined) {
      const name = cleanName(body.name, 60);
      if (!name) return c.json({ error: 'A name can not be empty.' }, 400);
      fields.name = name;
    }
    if (body.color !== undefined) {
      if (typeof body.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(body.color)) return c.json({ error: 'A colour is #rrggbb.' }, 400);
      fields.color = body.color.toLowerCase();
    }
    if (body.theme !== undefined) {
      if (body.theme !== null && body.theme !== 'light' && body.theme !== 'dark') return c.json({ error: 'The theme is light, dark or null.' }, 400);
      fields.theme = body.theme as 'light' | 'dark' | null;
    }
    if (body.email !== undefined) {
      const email = normalEmail(body.email);
      const wrong = emailProblem(email);
      if (wrong) return c.json({ error: wrong }, 400);
      const other = store.userByEmail(email);
      if (other && other.id !== user.id) return c.json({ error: 'Another account uses that email.' }, 409);
      const elsewhere = await emailElsewhere(email);
      if (elsewhere === 'unknown') return c.json({ error: 'The cloud cannot be reached to check this email. Try again in a moment.' }, 503);
      if (elsewhere && elsewhere !== user.id) return c.json({ error: 'Another account uses that email.' }, 409);
      fields.email = email;
    }
    const next = store.updateUser(user.id, fields)!;
    if (fields.name || fields.color) renamed(next);
    return c.json({ user: profile(next) });
  });

  /** A new password. The person's other sessions end; this one stays. */
  app.post('/api/me/password', need('person'), async (c) => {
    const user = me(c)!;
    const body = objectOf(await c.req.json()) as { current?: unknown; password?: unknown };
    const stored = store.passwordOf(user.id);
    if (stored && !(await verifyPassword(typeof body.current === 'string' ? body.current : '', stored))) return c.json({ error: 'The current password is wrong.' }, 403);
    const wrong = passwordProblem(body.password);
    if (wrong) return c.json({ error: wrong }, 400);
    if (!user.email) return c.json({ error: 'Give the account an email first, so it can sign in with it.' }, 400);
    store.updateUser(user.id, { password: await hashPassword(body.password as string) });
    const who = c.get('who');
    const ended = store.endSessions(user.id, who.kind === 'user' && who.via === 'session' ? who.session : undefined);
    recheck();
    return c.json({ ok: true, signedOut: ended.length });
  });

  /** The account goes, with everything it owns (see Decisions). Asks for the password when it has one. */
  app.delete('/api/me', need('person'), async (c) => {
    const user = me(c)!;
    const body = objectOf(await c.req.json().catch(() => ({}))) as { password?: unknown; confirm?: unknown };
    const stored = store.passwordOf(user.id);
    if (stored ? !(await verifyPassword(typeof body.password === 'string' ? body.password : '', stored)) : body.confirm !== user.name) {
      return c.json({ error: stored ? 'The password is wrong.' : 'Type the account name to confirm.' }, 403);
    }
    const docs = store.deleteUser(user.id);
    for (const id of docs) gone(id);
    sync?.deleteAccount(user.id);
    c.header('set-cookie', sessionCookie(null, secure(c)), { append: true });
    recheck();
    return c.json({ ok: true, deleted: docs.length });
  });

  // API keys: shown once, kept as a digest.
  app.get('/api/me/keys', need('person'), (c) => c.json(store.keys(myId(c)!)));

  app.post('/api/me/keys', need('person'), async (c) => {
    const body = objectOf(await c.req.json().catch(() => ({}))) as { name?: unknown };
    const name = cleanName(body.name, 60) || 'Agent';
    const key = newApiKey();
    const saved = store.createKey(myId(c)!, name, digest(key), key.slice(0, KEY_PREFIX.length + 6));
    return c.json({ ...saved, key }, 201);
  });

  app.delete('/api/me/keys/:key', need('person'), (c) => {
    const key = store.revokeKey(myId(c)!, c.req.param('key'));
    if (!key) return c.json({ error: 'no such key' }, 404);
    recheck();
    return c.json(key);
  });

  // ── documents ──

  app.get('/api/docs', need('user'), (c) => c.json(store.listDocs(myId(c)!)));

  app.post('/api/docs', need('user'), async (c) => {
    const body = objectOf(await c.req.json().catch(() => ({}))) as { title?: string; template?: string; root?: Json; actor?: unknown };
    const doc = create(body.title, body.template, body.root, actorOf(c, body.actor), myId(c));
    return c.json(doc, 201);
  });

  app.get('/api/docs/:id', need({ doc: 'view', link: 'view' }), (c) => {
    const doc = store.getDoc(c.req.param('id'));
    if (!doc) return c.json({ error: 'no such document' }, 404);
    // Its owner and editors see where fetch cells fetch from; viewers and links see what they answered.
    const role = c.get('checked').role;
    return c.json(role === 'owner' || role === 'editor' ? doc : withoutAddresses(doc));
  });

  app.get('/api/docs/:id/read', need({ doc: 'view' }), (c) => {
    const doc = store.getDoc(c.req.param('id'));
    if (!doc) return c.json({ error: 'no such document' }, 404);
    const name = c.req.query('agent');
    if (name) hub.publish(doc.id, { type: 'presence', actor: { ...actorOf(c, { name }), kind: 'agent' }, state: 'reading', ts: Date.now() });
    const role = c.get('checked').role;
    return c.json(view(seesAddresses(role) ? doc : withoutAddresses(doc), c.req.query('format') ?? 'outline', role === 'owner'));
  });

  app.delete('/api/docs/:id', need({ doc: 'owner' }), (c) => {
    const ok = !isDeckId(c.req.param('id')) && remove(c.req.param('id'));
    if (ok) recheck(c.req.param('id'));
    return ok ? c.json({ ok }) : c.json({ error: 'no such document' }, 404);
  });

  /** The document's title and description (saved as ops, in its history), and, for its owner, its place in the library. */
  app.patch('/api/docs/:id', need({ doc: 'edit' }), async (c) => {
    const doc = store.getDoc(c.req.param('id'));
    if (!doc) return c.json({ error: 'no such document' }, 404);
    const body = objectOf(await c.req.json()) as { title?: unknown; description?: unknown; pinned?: unknown; archived?: unknown; actor?: unknown };
    const owner = c.get('checked').role === 'owner';
    if (!owner && (body.pinned !== undefined || body.archived !== undefined)) return c.json({ error: 'only its owner can pin or archive it' }, 403);
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
    if (ops.length) change(doc, ops, actorOf(c, body.actor), { owner });
    if (body.archived !== undefined) store.setArchived(doc.id, !!body.archived);
    if (body.pinned !== undefined) store.setPinned(doc.id, !!body.pinned);
    return c.json(store.summary(doc.id));
  });

  app.post('/api/docs/:id/ops', need({ doc: 'edit', link: 'edit' }), async (c) => {
    const body = objectOf(await c.req.json()) as { ops?: Op[]; actor?: unknown; client?: string; batch?: string; format?: string };
    // Read the document after the body has arrived, so a change saved meanwhile (a timer's) is the base.
    const doc = store.getDoc(c.req.param('id'));
    if (!doc) return c.json({ error: 'no such document' }, 404);
    if (!Array.isArray(body.ops) || !body.ops.length) return c.json({ error: 'send {"ops": [[verb, …], …]}' }, 400);
    const actor = actorOf(c, body.actor);
    const role = c.get('checked').role;
    const { next, ops, touched } = change(doc, body.ops, actor, { client: body.client, batch: body.batch, owner: role === 'owner' });
    // A person's browser ran its own handlers; an agent's change sets them off here, if someone is in Live.
    if (actor.kind === 'agent' && !body.client) runner.agentChanged(doc.id, doc, ops);
    const answer: Record<string, unknown> = actor.kind === 'human'
      ? { v: next.v, ops, touched }
      : { ops, touched, ...view(next, body.format ?? 'outline', role === 'owner') };
    return c.json(answer);
  });

  app.get('/api/docs/:id/log', need({ doc: 'view' }), (c) => {
    const id = c.req.param('id');
    // A limit that isn't a number from 1 to 500 is 200: a negative one would mean no limit at all to SQLite.
    const limit = Math.trunc(Number(c.req.query('limit') ?? 200));
    const log = store.log(id, Number(c.req.query('since') ?? 0) || 0, limit >= 1 && limit <= 500 ? limit : limit > 500 ? 500 : 200);
    return c.json(seesAddresses(c.get('checked').role) ? log : withoutAddressesIn(log, fetchCells(id)));
  });

  app.post('/api/docs/:id/eval', need({ doc: 'view' }), async (c) => {
    const doc = store.getDoc(c.req.param('id'));
    if (!doc) return c.json({ error: 'no such document' }, 404);
    const body = objectOf(await c.req.json()) as { expr?: Sx; src?: string; cell?: string };
    const expr = typeof body.src === 'string' ? read(body.src) : (body.expr ?? null);
    const r = evalIn(doc, world(doc.id, c.get('checked').role === 'owner'), expr, body.cell);
    return c.json(r.error ? { error: r.error } : { value: plainValue(r.value) });
  });

  app.get('/api/docs/:id/events', need({ doc: 'view', link: 'view' }), (c) => {
    const id = c.req.param('id');
    const doc = store.getDoc(id);
    if (!doc) return c.json({ error: 'no such document' }, 404);
    // The browser says who it is and whether it is in Live: timers and fetches run while anyone is.
    const client = (c.req.query('client') ?? '').slice(0, 40);
    const who = c.get('who');
    const role = c.get('checked').role;
    // A viewer changes nothing, so it doesn't keep timers and fetches running either.
    const viewOnly = role === 'viewer' || (who.kind === 'guest' && who.level === 'view');
    const mode = viewOnly ? 'page' : c.req.query('mode') ?? 'edit';
    return streamSSE(c, async (stream) => {
      let gone = false;
      const write = (e: DocEvent) => stream.writeSSE({ event: e.type, data: JSON.stringify(e) }).catch(() => off());
      const me: Listener = {
        doc: id, who, client, mode, selected: null,
        send: (e) => write(e),
        close: (after) => {
          off();
          void (after ?? Promise.resolve()).then(() => stream.close());
        },
      };
      const unsubscribe = hub.subscribe(id, (e) => {
        // Someone with a link hears changes, not the conversation, the people or the agents' work.
        if (!guestHears(who, e as { type: string })) return;
        // A request for an agent is for the asker's agent's wait (see Requests), not for everyone's browser.
        if (e.type === 'compose') return;
        // Records of the owner's that this document doesn't reach are none of a collaborator's business, not even by name.
        if (e.type === 'data' && role !== 'owner' && !reaches(id).includes(e.collection)) return;
        // Viewers and links see what fetch cells answered, never where from (nor what handlers did with addresses).
        let sent: DocEvent = e;
        if (!seesAddresses(role)) {
          if (e.type === 'trace') return;
          if (e.type === 'fetch') sent = { ...e, state: quietState(e.state) as typeof e.state };
          if (e.type === 'ops') sent = { ...e, ops: withoutAddressesIn(e.ops, fetchCells(id)) };
        }
        const written = write(sent as DocEvent);
        // A link turned off hears that, and then nothing more.
        if (e.type === 'unshared' && who.kind === 'guest') {
          unsubscribe();
          void written.then(() => {
            off();
            return stream.close();
          });
        }
      });
      const token = client ? runner.join(id, client, mode) : 0;
      listeners.add(me);
      const off = () => {
        if (gone) return;
        gone = true;
        unsubscribe();
        listeners.delete(me);
        if (token) runner.leave(id, token);
        if (who.kind === 'user') announce(id);
      };
      stream.onAbort(off);
      await stream.writeSSE({ event: 'hello', data: JSON.stringify({ type: 'hello', v: store.getDoc(id)?.v ?? doc.v }) });
      if (who.kind === 'user') announce(id);
      while (!stream.aborted && !stream.closed && !gone) {
        await stream.sleep(10_000);
        // A session that ran out while the stream was open ends it too.
        if (who.kind === 'user' && who.via === 'session' && !store.session(who.session)) {
          me.close(write({ type: 'revoked', why: 'signedout' }));
          break;
        }
        if (!gone) await stream.writeSSE({ event: 'ping', data: '{}' }).catch(() => {});
      }
      off();
    });
  });

  /** A browser switched between Edit, Live and Page, or selected a cell. */
  app.post('/api/docs/:id/viewer', need({ doc: 'view', link: 'view' }), async (c) => {
    const id = c.req.param('id');
    const body = objectOf(await c.req.json()) as { client?: string; mode?: string; selected?: unknown };
    if (typeof body.client !== 'string' || !['edit', 'live', 'page'].includes(body.mode ?? '')) return c.json({ error: 'send {"client", "mode": "edit"|"live"|"page"}' }, 400);
    const who = c.get('who');
    const role = c.get('checked').role;
    const viewOnly = role === 'viewer' || (who.kind === 'guest' && who.level === 'view');
    const client = body.client.slice(0, 40);
    // Only the caller's own tabs: a viewer can't take someone else out of Live by naming their client.
    const mine = (l: Listener) => (who.kind === 'user' && l.who.kind === 'user' ? l.who.user.id === who.user.id : who.kind === 'guest' && l.who.kind === 'guest' && l.who.token === who.token);
    if ([...listeners].some((l) => l.doc === id && l.client === client && !mine(l))) return c.json({ error: 'that is not your tab' }, 403);
    runner.mode(id, client, viewOnly ? 'page' : body.mode!);
    let moved = false;
    for (const l of listeners) {
      if (l.doc !== id || l.client !== client || !mine(l)) continue;
      const selected = typeof body.selected === 'string' ? body.selected.slice(0, 40) : null;
      if (l.selected !== selected || l.mode !== body.mode) moved = true;
      l.selected = selected;
      l.mode = body.mode!;
    }
    if (moved && who.kind === 'user') announce(id);
    return c.json({ live: runner.isLive(id) });
  });

  // ── people: who else may open a document ──

  app.get('/api/docs/:id/people', need({ doc: 'view' }), (c) => {
    const id = c.req.param('id');
    return c.json({ people: store.people(id), present: present(id), role: c.get('checked').role });
  });

  /** Give someone access by the email of their account, or change it. */
  app.post('/api/docs/:id/people', need({ doc: 'owner' }), async (c) => {
    const id = c.req.param('id');
    const body = objectOf(await c.req.json()) as { email?: unknown; role?: unknown };
    const role = body.role ?? 'viewer';
    if (role !== 'viewer' && role !== 'editor') return c.json({ error: 'role is "viewer" or "editor"' }, 400);
    const user = store.userByEmail(normalEmail(body.email));
    if (!user) return c.json({ error: 'There is no account with that email on this server. Ask them to sign up first.' }, 404);
    if (user.id === myId(c)) return c.json({ error: 'You own this document already.' }, 400);
    // Letting someone in: the document as it stands is what its owner stands behind.
    if (store.reaches(id) === null) approve(id);
    store.setRole(id, user.id, role as Role);
    recheck(id);
    return c.json({ people: store.people(id) });
  });

  /** Change someone's role, or take their access away (the owner); or leave a document shared with you. */
  app.patch('/api/docs/:id/people/:user', need({ doc: 'owner' }), async (c) => {
    const id = c.req.param('id');
    const body = objectOf(await c.req.json()) as { role?: unknown };
    if (body.role !== 'viewer' && body.role !== 'editor') return c.json({ error: 'role is "viewer" or "editor"' }, 400);
    if (!store.people(id).some((p) => p.id === c.req.param('user') && p.role !== 'owner')) return c.json({ error: 'that person has no access to change' }, 404);
    store.setRole(id, c.req.param('user'), body.role);
    recheck(id);
    return c.json({ people: store.people(id) });
  });

  app.delete('/api/docs/:id/people/:user', need({ doc: 'view' }), (c) => {
    const id = c.req.param('id');
    const user = c.req.param('user');
    if (c.get('checked').role !== 'owner' && user !== myId(c)) return c.json({ error: 'only its owner can do that' }, 403);
    if (user === store.docOwner(id)) return c.json({ error: 'the owner can not leave their own document' }, 400);
    store.setRole(id, user, null);
    recheck(id);
    return c.json({ people: store.people(id) });
  });

  // ── the library: search, pins, archive, decks ──

  app.get('/api/library', need('user'), (c) => {
    const filter = (c.req.query('filter') || 'all') as Filter;
    const sort = (c.req.query('sort') || 'updated') as Sort;
    const scope = c.req.query('scope') === 'shared' ? 'shared' : 'mine';
    if (!FILTERS.includes(filter)) return c.json({ error: `filter is one of ${FILTERS.join(', ')}` }, 400);
    if (!SORTS.includes(sort)) return c.json({ error: `sort is one of ${SORTS.join(', ')}` }, 400);
    return c.json(library(myId(c)!, (c.req.query('q') ?? '').slice(0, 200), filter, sort, scope));
  });

  /** Pinned documents and decks, in this order. */
  app.post('/api/library/pins', need('user'), async (c) => {
    const body = objectOf(await c.req.json()) as { ids?: unknown };
    if (!Array.isArray(body.ids) || body.ids.length > MAX_IDS || body.ids.some((x) => typeof x !== 'string')) return c.json({ error: `send {"ids": [the pinned ids, in order]}, at most ${MAX_IDS}` }, 400);
    return c.json({ pins: store.orderPins(myId(c), body.ids as string[]) });
  });

  /** One action on several of my documents or decks: pin, unpin, archive, restore, delete (a deck: ungroup). */
  app.post('/api/library/bulk', need('user'), async (c) => {
    const body = objectOf(await c.req.json()) as { ids?: unknown; action?: string };
    const actions = ['pin', 'unpin', 'archive', 'restore', 'delete'];
    if (!Array.isArray(body.ids) || body.ids.length > MAX_IDS || body.ids.some((x) => typeof x !== 'string') || !actions.includes(body.action ?? '')) {
      return c.json({ error: `send {"action": one of ${actions.join(', ')}, "ids": [...]}` }, 400);
    }
    const done: string[] = [];
    const skipped: string[] = [];
    for (const id of body.ids as string[]) {
      // Only what is mine; someone else's is skipped like something that isn't there.
      const mine = (isDeckId(id) ? !!store.deck(id) : store.docOwner(id) !== undefined) && store.ownerOf(id) === myId(c);
      const ok = mine && (body.action === 'pin' ? store.setPinned(id, true)
        : body.action === 'unpin' ? store.setPinned(id, false)
        : body.action === 'archive' ? store.setArchived(id, true)
        : body.action === 'restore' ? store.setArchived(id, false)
        : remove(id));
      (ok ? done : skipped).push(id);
    }
    if (body.action === 'delete') recheck();
    return c.json({ action: body.action, done, skipped });
  });

  /** One document's card, or null: how the editor learns that a document is gone, or archived, before opening it. */
  app.get('/api/library/:id', need('in'), (c) => {
    const id = c.req.param('id');
    const who = c.get('who');
    const reach = who.kind === 'guest' ? who.doc === id : who.kind === 'user' && !!store.roleOf(id, who.user.id);
    const entry = reach ? store.summary(id) : null;
    // Someone else's document: not its owner's arrangement (pins, archive, deck), nor who the owner is.
    return c.json({ entry: entry && !(who.kind === 'user' && entry.owner === who.user.id) ? { ...entry, owner: null, pinned: null, archivedAt: null, deck: null } : entry });
  });

  app.get('/api/decks', need('user'), (c) => c.json(store.decks(myId(c))));

  /** Group my documents into a deck, in this order. */
  app.post('/api/decks', need('user'), async (c) => {
    const body = objectOf(await c.req.json()) as { title?: unknown; description?: unknown; docs?: unknown };
    if (!Array.isArray(body.docs) || !body.docs.length || body.docs.length > MAX_IDS || body.docs.some((x) => typeof x !== 'string')) {
      return c.json({ error: 'send {"title": …, "docs": [document ids, in order]}' }, 400);
    }
    const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 200) : 'Untitled deck';
    const description = typeof body.description === 'string' ? body.description.trim().slice(0, 2000) : '';
    try {
      return c.json(store.createDeck(title, description, body.docs as string[], myId(c)), 201);
    } catch (e) {
      if (e instanceof StoreError) return c.json({ error: e.message }, 400);
      throw e;
    }
  });

  /** A deck, with its documents' summaries in order. */
  app.get('/api/decks/:id', need({ deck: 'owner' }), (c) => {
    const deck = store.deck(c.req.param('id'))!;
    const docs = new Map(store.listDocs(myId(c)!).map((d) => [d.id, d]));
    return c.json({ ...deck, items: deck.docs.map((id) => docs.get(id)).filter(Boolean) });
  });

  /** Rename, describe, reorder (docs: the ids in their new order; one left out is taken out), pin, archive. */
  app.patch('/api/decks/:id', need({ deck: 'owner' }), async (c) => {
    const id = c.req.param('id');
    const body = objectOf(await c.req.json()) as { title?: unknown; description?: unknown; docs?: unknown; pinned?: unknown; archived?: unknown };
    const fields: { title?: string; description?: string } = {};
    if (typeof body.title === 'string') fields.title = body.title.trim().slice(0, 200) || 'Untitled deck';
    if (typeof body.description === 'string' || body.description === null) fields.description = ((body.description as string | null) ?? '').trim().slice(0, 2000);
    if (body.docs !== undefined) {
      if (!Array.isArray(body.docs) || body.docs.length > MAX_IDS || body.docs.some((x) => typeof x !== 'string')) return c.json({ error: `docs is a list of at most ${MAX_IDS} document ids` }, 400);
      try {
        store.setDeckDocs(id, body.docs as string[]);
      } catch (e) {
        if (e instanceof StoreError) return c.json({ error: e.message }, 400);
        throw e;
      }
    }
    if (Object.keys(fields).length) store.updateDeck(id, fields);
    if (body.archived !== undefined) store.setArchived(id, !!body.archived);
    if (body.pinned && store.deck(id)?.archivedAt != null) return c.json({ error: 'an archived deck can not be pinned; restore it first' }, 409);
    if (body.pinned !== undefined) store.setPinned(id, !!body.pinned);
    return c.json(store.deck(id));
  });

  /** Ungroup: the deck goes, every document in it stays. */
  app.delete('/api/decks/:id', need({ deck: 'owner' }), (c) => (store.deleteDeck(c.req.param('id')) ? c.json({ ok: true }) : c.json({ error: 'no such deck' }, 404)));

  // ── share links ──

  /** For the page a link opens: which document, and what the link may do. */
  app.get('/api/shared', need({ guest: true }), (c) => {
    const who = c.get('who');
    if (who.kind !== 'guest') return c.json({ error: `send the link's token in the ${SHARE_HEADER} header` }, 400);
    const doc = store.getDoc(who.doc);
    return c.json(doc ? { id: doc.id, title: doc.meta.title, access: who.level } : { refused: 'unknown', error: 'this link does not open anything' });
  });

  /** The links that are on. */
  app.get('/api/docs/:id/shares', need({ doc: 'owner' }), (c) => {
    const origin = publicOrigin(c);
    return c.json(store.shares(c.req.param('id')).filter((s) => s.revokedAt == null).map((s) => shareView(s, origin)));
  });

  /** Turn a link on, "view" or "edit"; the one already on is returned as it is. */
  app.post('/api/docs/:id/shares', need({ doc: 'owner' }), async (c) => {
    const id = c.req.param('id');
    const body = objectOf(await c.req.json().catch(() => ({}))) as { access?: string };
    const access = (body.access ?? 'view') as Access;
    if (access !== 'view' && access !== 'edit') return c.json({ error: 'access is "view" or "edit"' }, 400);
    if (store.reaches(id) === null) approve(id);
    return c.json(shareView(store.openShare(id, access, reaches(id)), publicOrigin(c)), 201);
  });

  /** Turn a link off. Whoever has it open sees that it is no longer shared. */
  app.delete('/api/shares/:token', need('user'), (c) => {
    const found = store.share(c.req.param('token'));
    if (!found || store.docOwner(found.doc) !== myId(c)) return c.json({ error: 'no such link' }, 404);
    const share = store.closeShare(found.token)!;
    hub.publish(share.doc, { type: 'unshared', token: share.token });
    return c.json(shareView(share, publicOrigin(c)));
  });

  // ── one self-contained .html file ──

  app.get('/api/docs/:id/export', need({ doc: 'owner' }), async (c) => {
    const doc = store.getDoc(c.req.param('id'))!;
    return sendExport(c, [doc], doc.meta.title);
  });

  /** A deck's file plays its documents (archived ones left out) as slides. */
  app.get('/api/decks/:id/export', need({ deck: 'owner' }), async (c) => {
    const deck = store.deck(c.req.param('id'))!;
    const docs = store.listDocs(myId(c)!).filter((d) => deck.docs.includes(d.id) && d.archivedAt == null).sort((a, b) => deck.docs.indexOf(a.id) - deck.docs.indexOf(b.id));
    return sendExport(c, docs.map((d) => store.getDoc(d.id)!), deck.title, deck);
  });

  // ── fetch cells: JSON from an address, fetched here for everyone ──

  app.get('/api/docs/:id/fetched', need({ doc: 'view', link: 'view' }), (c) => {
    const states = runner.states(c.req.param('id'));
    const role = c.get('checked').role;
    return c.json(role === 'owner' || role === 'editor' ? states : Object.fromEntries(Object.entries(states).map(([k, st]) => [k, quietState(st)])));
  });

  /** Fetch now (refresh!, Retry, the studio's Fetch now). {"handlers": false} skips load and fail. */
  app.post('/api/docs/:id/fetch/:cell', need({ doc: 'edit', link: 'edit' }), async (c) => {
    const id = c.req.param('id');
    const doc = store.getDoc(id);
    if (!doc) return c.json({ error: 'no such document' }, 404);
    const cell = indexTree(doc.root).byId.get(c.req.param('cell')) ?? indexTree(doc.root).byName.get(c.req.param('cell'));
    if (!cell || cell.kind !== 'fetch') return c.json({ error: `no fetch cell "${c.req.param('cell')}"` }, 404);
    const body = objectOf(await c.req.json().catch(() => ({}))) as { handlers?: boolean };
    return c.json(await runner.refresh(id, cell.id, body.handlers !== false));
  });

  // ── demo answers, so fetch cells can be tried (and tested) without the network ──

  const RATES = [4.82, 5.07, 4.95, 5.21, 4.88];
  let rateCall = 0;
  app.get('/api/demo/rate', need('in'), (c) => {
    const forced = Number(c.req.query('rate'));
    const rate = c.req.query('rate') && Number.isFinite(forced) ? forced : RATES[rateCall++ % RATES.length];
    return c.json({ base: 'EUR', quote: 'RON', rate, at: new Date().toISOString() });
  });
  app.get('/api/demo/slow', need('in'), async (c) => {
    const ms = Math.min(5000, Math.max(0, Number(c.req.query('ms') ?? 1500) || 0));
    await new Promise((r) => setTimeout(r, ms));
    return c.json({ ok: true, waited: ms, at: new Date().toISOString() });
  });
  app.get('/api/demo/fail', need('in'), (c) => c.json({ error: 'the demo service is down' }, 500));
  app.get('/api/demo/weather', need('in'), (c) => c.json({ city: c.req.query('city') ?? 'Cluj', temp: 17, sky: 'clear', wind: 9 }));

  // ── messages: how a person and an agent talk about a document ──

  app.get('/api/docs/:id/messages', need({ doc: 'view' }), (c) => c.json(store.messages(c.req.param('id'), Number(c.req.query('after') ?? 0))));

  app.post('/api/docs/:id/messages', need({ doc: 'edit' }), async (c) => {
    const id = c.req.param('id');
    const body = objectOf(await c.req.json()) as { text?: string; actor?: unknown; cell?: string };
    const text = (body.text ?? '').trim();
    if (!text) return c.json({ error: 'a message needs text' }, 400);
    const message = store.addMessage(id, actorOf(c, body.actor), text.slice(0, 4000), body.cell);
    hub.publish(id, { type: 'message', message });
    return c.json(message, 201);
  });

  /** Long-poll: an agent waits here for the next thing a person says, or asks it to write. */
  app.get('/api/docs/:id/messages/wait', need({ doc: 'edit' }), async (c) => {
    const id = c.req.param('id');
    const after = Number(c.req.query('after') ?? 0);
    const seconds = Math.min(120, Math.max(1, Number(c.req.query('timeout') ?? 25)));
    const stop = hub.listen(id, myId(c));
    try {
      const waiting = store.messages(id, after).filter((m) => m.actor.kind === 'human');
      const asked = requests.take(id, myId(c));
      if (waiting.length || asked.length) return c.json({ messages: waiting, requests: asked });
      const actor: Actor = { ...actorOf(c, { name: c.req.query('agent') || 'Agent' }), kind: 'agent' };
      hub.publish(id, { type: 'presence', actor, state: 'listening', ts: Date.now() });
      const e = await hub.waitFor(id, (ev) => (ev.type === 'message' && ev.message.actor.kind === 'human') || ev.type === 'compose', seconds * 1000, c.req.raw.signal);
      hub.publish(id, { type: 'presence', actor, state: e ? 'reading' : 'idle', ts: Date.now() });
      return c.json({ messages: e && e.type === 'message' ? [e.message] : [], requests: requests.take(id, myId(c)) });
    } finally {
      stop();
    }
  });

  // ── composing: words in, checked code out ──

  app.get('/api/ai', need('user'), (c) => {
    const claude = claudeFor(c.req.query('doc') || undefined, myId(c));
    return c.json({ providers: { claude: !!claude, agent: hub.listening(c.req.query('doc') || undefined, myId(c)), local: true }, model: claude?.model ?? null });
  });

  app.post('/api/docs/:id/compose', need({ doc: 'edit' }), async (c) => {
    const doc = store.getDoc(c.req.param('id'));
    if (!doc) return c.json({ error: 'no such document' }, 404);
    const body = objectOf(await c.req.json()) as { prompt?: string; cell?: string; target?: string; current?: string; provider?: string };
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, 2000) : '';
    if (!prompt) return c.json({ error: 'say what the cell should do' }, 400);
    const target = body.target ?? 'expr';
    if (!isTarget(target)) return c.json({ error: `target is one of ${TARGETS.join(', ')} or on.<event>` }, 400);
    const provider = body.provider as Provider | undefined;
    if (provider && !['claude', 'agent', 'local'].includes(provider)) return c.json({ error: 'provider is claude, agent or local' }, 400);
    const ctx = context(doc, world(doc.id, c.get('checked').role === 'owner'), collectionsFor(doc.id, c.get('checked').role), { cell: body.cell, target, current: typeof body.current === 'string' ? body.current : '' });
    if (body.cell && !ctx.cell) return c.json({ error: `no cell "${body.cell}"` }, 400);
    const event = eventOf(target);
    const wrong = event && eventProblem(ctx.cell ?? null, event);
    if (wrong) return c.json({ error: wrong }, 400);
    const cell = ctx.cell;
    const agent = hub.listening(doc.id, myId(c))
      ? () => {
          const { request, answer } = requests.open(doc.id, myId(c), {
            prompt, target, current: ctx.current,
            ...(cell ? { cell: cell.id, ...(cell.name ? { cellName: cell.name } : {}) } : {}),
          }, AGENT_WAIT, c.req.raw.signal);
          hub.publish(doc.id, { type: 'compose', request });
          return answer;
        }
      : null;
    try {
      return c.json(await compose(ctx, prompt, { provider, claude: claudeFor(doc.id, myId(c)), agent }));
    } catch (e) {
      if (e instanceof ComposeError) return c.json({ error: e.message, ...(e.suggestions?.length ? { suggestions: e.suggestions } : {}) }, 422);
      throw e;
    }
  });

  /** An agent's answer to a compose request. Checked like any other; a failure can be resent. */
  app.post('/api/docs/:id/compose/:rid', need({ doc: 'edit' }), async (c) => {
    const id = c.req.param('id');
    const doc = store.getDoc(id);
    const request = doc && requests.get(id, c.req.param('rid'), myId(c));
    if (!doc || !request) return c.json({ error: 'no such request; it may have been answered or timed out' }, 404);
    const body = objectOf(await c.req.json()) as { code?: unknown; explanation?: string; actor?: unknown };
    let answer: ReturnType<typeof accept>;
    try {
      const ctx = context(doc, world(id, c.get('checked').role === 'owner'), collectionsFor(id, c.get('checked').role), { cell: request.cell, target: request.target, current: request.current });
      // For target events, code is the ops: a JSON array, {ops}, or that as text.
      answer = accept(ctx, body.code);
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 422);
    }
    const explanation = typeof body.explanation === 'string' ? body.explanation.slice(0, 600) : undefined;
    requests.answer(request.id, explanation ? { ...answer, explanation } : answer);
    hub.publish(id, { type: 'presence', actor: { ...actorOf(c, body.actor), kind: 'agent' }, state: 'editing', ts: Date.now() });
    return c.json({ ok: true });
  });

  // ── collections: mine, or a document's owner's through that document (see access.ts) ──

  const dataOwner = (c: C) => c.get('checked').dataOwner ?? null;

  // Your collections; with ?doc=, the ones that document may name (all its owner's for the owner, those it reaches for others).
  app.get('/api/data', need('user'), (c) => {
    const doc = c.req.query('doc');
    if (!doc) return c.json(store.collections(myId(c)));
    const role = store.roleOf(doc, myId(c)!);
    if (!role) return c.json({ error: 'no such document' }, 404);
    const owner = store.docOwner(doc) ?? null;
    const names = new Set(collectionsFor(doc, role));
    return c.json(store.collections(owner).filter((x) => names.has(x.name)));
  });
  app.get('/api/data/:name', need({ data: 'read', link: 'view' }), (c) => c.json(store.rows(dataOwner(c), c.req.param('name'))));

  app.post('/api/data/:name', need({ data: 'write', link: 'edit' }), async (c) => {
    const name = c.req.param('name');
    if (!/^[\w-]{1,60}$/.test(name)) return c.json({ error: 'collection names use letters, digits, - and _' }, 400);
    const body = objectOf(await c.req.json()) as { record?: Record<string, Json>; source?: Json };
    if (!body.record || typeof body.record !== 'object' || Array.isArray(body.record)) return c.json({ error: 'send {"record": {…}}' }, 400);
    const row = store.insert(dataOwner(c), name, plainValue(body.record) as Record<string, Json>, body.source);
    dataChanged(dataOwner(c), name);
    return c.json(row, 201);
  });

  app.patch('/api/data/:name/:id', need({ data: 'write', link: 'edit' }), async (c) => {
    const name = c.req.param('name');
    const body = objectOf(await c.req.json()) as { fields?: Record<string, Json> };
    if (!body.fields || typeof body.fields !== 'object' || Array.isArray(body.fields)) return c.json({ error: 'send {"fields": {…}}' }, 400);
    const id = c.req.param('id');
    const row = store.update(dataOwner(c), name, id, plainValue(body.fields) as Record<string, Json>);
    if (!row) return c.json({ error: `no record ${id} in "${name}"` }, 404);
    dataChanged(dataOwner(c), name);
    return c.json(row as Record<string, unknown>, 200);
  });

  app.delete('/api/data/:name/:id', need({ data: 'write', link: 'edit' }), (c) => {
    const ok = store.deleteRow(dataOwner(c), c.req.param('name'), c.req.param('id'));
    if (ok) dataChanged(dataOwner(c), c.req.param('name'));
    return c.json({ ok });
  });

  app.delete('/api/data/:name', need({ data: 'write', link: 'edit' }), (c) => {
    const removed = store.clear(dataOwner(c), c.req.param('name'));
    dataChanged(dataOwner(c), c.req.param('name'));
    return c.json({ removed });
  });

  // ── sync ──

  const missingAssets = new Map<string, number>();

  /** Whether this machine's changes have reached the cloud: off, synced, syncing (changes waiting) or offline. */
  app.get('/api/sync', need('user'), (c) => c.json(sync ? sync.status(myId(c) ?? undefined) : { state: 'off', pending: 0, lastSyncAt: null, error: null }));

  /** Sync now (the status's "Sync now"), and answer how it went. */
  app.post('/api/sync', need('user'), async (c) => {
    if (!sync) return c.json({ state: 'off', pending: 0, lastSyncAt: null, error: null });
    await sync.round();
    return c.json(sync.status(myId(c) ?? undefined));
  });

  // ── pictures ──

  app.post('/api/assets', need('user'), async (c) => {
    const said = (c.req.header('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!ASSET_TYPES[said]) return c.json({ error: 'pictures can be PNG, JPEG, GIF, WebP, AVIF or SVG' }, 415);
    if (Number(c.req.header('content-length') ?? 0) > MAX_ASSET) return c.json({ error: 'that picture is larger than 8 MB' }, 413);
    const bytes = Buffer.from(await c.req.arrayBuffer());
    if (bytes.length > MAX_ASSET) return c.json({ error: 'that picture is larger than 8 MB' }, 413);
    // What the bytes are, not what the request says: a page or a script sent as "image/png" is not a picture.
    const type = sniffImage(bytes);
    const ext = type && ASSET_TYPES[type];
    if (!ext) return c.json({ error: 'that file is not a PNG, JPEG, GIF, WebP, AVIF or SVG picture' }, 415);
    const file = createHash('sha256').update(bytes).digest('hex').slice(0, 20) + '.' + ext;
    mkdirSync(assetsDir, { recursive: true });
    if (!existsSync(join(assetsDir, file))) {
      writeFileSync(join(assetsDir, file), bytes);
      if (sync) store.assetToSend(file);
    }
    return c.json({ url: '/assets/' + file }, 201);
  });

  // Pictures are named by their content's digest: whoever has the address (a document, a link) can load it.
  app.get('/assets/:file', async (c) => {
    const file = c.req.param('file');
    const ext = file.split('.').pop() ?? '';
    const type = Object.entries(ASSET_TYPES).find(([, e]) => e === ext)?.[0];
    if (!/^[a-f0-9]{20}\.\w+$/.test(file) || !type) return c.notFound();
    // Uploaded on another machine: fetched from the cloud once, then kept here.
    if (!existsSync(join(assetsDir, file)) && sync && (missingAssets.get(file) ?? 0) < Date.now()) {
      const got = await sync.fetchAsset(file).catch(() => null);
      // Not there either: don't ask the cloud again for a while (each ask is a read it bills). Anyone can ask for
      // made-up names, so what is remembered is kept small: past entries go, then the oldest.
      if (!got) {
        if (missingAssets.size >= 5_000) {
          for (const [k, until] of missingAssets) if (until < Date.now()) missingAssets.delete(k);
          for (const k of missingAssets.keys()) if (missingAssets.size >= 5_000) missingAssets.delete(k);
        }
        missingAssets.set(file, Date.now() + 10 * 60_000);
      }
      if (got) {
        mkdirSync(assetsDir, { recursive: true });
        writeFileSync(join(assetsDir, file), got.bytes);
      }
    }
    if (!existsSync(join(assetsDir, file))) return c.notFound();
    return c.body(new Uint8Array(readFileSync(join(assetsDir, file))), 200, {
      'content-type': type,
      'cache-control': 'public, max-age=31536000, immutable',
      // An uploaded SVG must never run script if someone opens it directly; nor may a browser guess another type.
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'x-content-type-options': 'nosniff',
    });
  });

  // An /api address no route answers is an error an agent can read, not the app's page (which a built server sends for any other path).
  app.all('/api/*', (c) => c.json({ error: `no such route: ${c.req.method} ${c.req.path}` }, 404));

  return { app, hub, view, runner, mode, sync };
}

export type { Computed, Need };
