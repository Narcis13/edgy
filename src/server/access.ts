// Who may do what. The one place the server decides it.
//
// Every request is first resolved to who is asking (`Principal`):
//
//   a person   by the session cookie (a browser), or by an API key (an agent
//              acting for them), or, in local mode, by being on this machine
//   a guest    by a share link's token (header x-edgy-share, or ?share= where a
//              header can't be sent, as on an event stream)
//   nobody     anything else: 401 on every route but the few public ones
//
// Then every route declares what it needs (`need(…)`, a middleware put before
// its handler), and the guard checks it with the route's own parameters:
//
//   documents  owner > editor > viewer. A stranger gets 404, as if there were no
//              such document; someone whose role is too low gets 403.
//   decks      their owner only.
//   data       a person's own collections; or a document's owner's, through
//              that document (?doc=): viewers read, editors write, and only the
//              collections the document's owner let it use (see `reaches`).
//   links      a guest reaches the link's document and nothing else: view reads
//              it, its values, the records it reaches and its stream; edit also
//              changes it, saves those records and fetches again.
//
// A test walks the route table: every /api route must carry a `need`.

import type { Context, MiddlewareHandler } from 'hono';
import type { Access, ApiKey, Role, Share, Store, User } from './store';

export type AuthMode = 'local' | 'accounts';

export type Principal =
  | { kind: 'user'; user: User; via: 'session'; session: string }
  | { kind: 'user'; user: User; via: 'key'; key: ApiKey }
  | { kind: 'user'; user: User; via: 'local' }
  | { kind: 'guest'; level: Access; doc: string; token: string; collections: string[] }
  | { kind: 'none' };

export interface Refusal {
  status: 400 | 401 | 403 | 404 | 410;
  error: string;
  /** unknown: no such link; revoked: turned off; forbidden: not with this link or role; signin: nobody is signed in. */
  reason: 'unknown' | 'revoked' | 'forbidden' | 'signin';
}

export const SHARE_HEADER = 'x-edgy-share';

/** A share link's token: who it lets in, or why not. */
export function guestFor(store: Store, token: string, reaches: (doc: string) => string[]): Principal | Refusal {
  const share: Share | null = store.share(token);
  if (!share) return { status: 404, error: 'this link does not open anything', reason: 'unknown' };
  if (share.revokedAt != null) return { status: 410, error: 'this document is no longer shared', reason: 'revoked' };
  return { kind: 'guest', level: share.access, doc: share.doc, token, collections: reaches(share.doc) };
}

// ── what a route needs ──

export type Need =
  /** Anyone, signed in or not. */
  | 'public'
  /** Anyone with a credential: a person or a guest. */
  | 'in'
  /** A person: session, key or local mode. */
  | 'user'
  /** A person themselves, not an agent with their key: the profile, keys, password. */
  | 'person'
  /** The :id document. `link` lets a guest with that link do it too. */
  | { doc: 'view' | 'edit' | 'owner'; link?: Access }
  /** The :id deck, its owner. */
  | { deck: 'owner' }
  /** The :name collection: one's own, or through ?doc=. */
  | { data: 'read' | 'write'; link?: Access }
  /** A guest only: the page a link opens asks what it opens. */
  | { guest: true };

/** The routes nobody needs to be signed in for. A route marked 'public' must be one of these. */
export const PUBLIC: [string, string][] = [
  ['GET', '/api/health'],
  ['POST', '/api/auth/signup'],
  ['POST', '/api/auth/signin'],
];

export const isPublic = (method: string, path: string) => PUBLIC.some(([m, p]) => m === method && p === path);

export const SIGN_IN: Refusal = { status: 401, error: 'sign in first', reason: 'signin' };
const NO_DOC: Refusal = { status: 404, error: 'no such document', reason: 'forbidden' };
const NOT_WITH_LINK: Refusal = { status: 403, error: 'this link does not reach that', reason: 'forbidden' };

/** What the guard found out, for the handler. */
export interface Checked {
  /** Your role on the :id document. */
  role?: Role | 'owner' | 'guest';
  /** Whose collection the :name collection is. */
  dataOwner?: string | null;
}

export interface Env {
  Variables: { who: Principal; checked: Checked };
}

export interface AccessDeps {
  store: Store;
  /** The collections a document's owner let it use. */
  reaches: (doc: string) => string[];
}

const RANK = { viewer: 1, editor: 2, owner: 3 } as const;

/** Whether `who` may do what `need` says, with these route parameters. */
export function check(deps: AccessDeps, who: Principal, need: Need, param: (k: string) => string | undefined, query: (k: string) => string | undefined): Checked | Refusal {
  if (need === 'public') return {};
  if (who.kind === 'none') return SIGN_IN;
  if (need === 'in') return {};
  if (who.kind === 'guest') {
    if (typeof need === 'string' || 'deck' in need) return NOT_WITH_LINK;
    if ('guest' in need) return {};
    if (!need.link) return NOT_WITH_LINK;
    if (need.link === 'edit' && who.level !== 'edit') return { status: 403, error: 'this link can view the document, not change it', reason: 'forbidden' };
    if ('doc' in need) return param('id') === who.doc ? { role: 'guest' } : NOT_WITH_LINK;
    const doc = query('doc');
    if (doc !== undefined && doc !== who.doc) return NOT_WITH_LINK;
    if (!who.collections.includes(param('name') ?? '')) return NOT_WITH_LINK;
    return { dataOwner: deps.store.docOwner(who.doc) ?? null };
  }
  // A person.
  const me = who.user.id;
  if (need === 'user') return {};
  if (need === 'person') return who.via === 'key' ? { status: 403, error: 'an API key can not do that; sign in in the browser', reason: 'forbidden' } : {};
  if ('guest' in need) return { status: 400, error: `send the link's token in the ${SHARE_HEADER} header`, reason: 'forbidden' };
  if ('deck' in need) return deps.store.ownerOf(param('id') ?? '') === me && deps.store.deck(param('id') ?? '') ? {} : { status: 404, error: 'no such deck', reason: 'forbidden' };
  if ('doc' in need) {
    const role = deps.store.roleOf(param('id') ?? '', me);
    if (!role) return NO_DOC;
    if (RANK[role] < RANK[need.doc === 'view' ? 'viewer' : need.doc === 'edit' ? 'editor' : 'owner']) {
      return { status: 403, error: need.doc === 'edit' ? 'you can view this document, not change it' : 'only its owner can do that', reason: 'forbidden' };
    }
    return { role };
  }
  // Data: one's own collection, or a document's owner's through that document.
  const doc = query('doc');
  if (!doc) return { dataOwner: me };
  const role = deps.store.roleOf(doc, me);
  if (!role) return NO_DOC;
  if (need.data === 'write' && role === 'viewer') return { status: 403, error: 'you can view this document, not change it', reason: 'forbidden' };
  const owner = deps.store.docOwner(doc) ?? null;
  if (role !== 'owner' && !deps.reaches(doc).includes(param('name') ?? '')) {
    return { status: 403, error: `this document does not reach the collection "${param('name')}"`, reason: 'forbidden' };
  }
  return { dataOwner: owner };
}

/** The guard a route puts before its handler. The test finds it by its `need`. */
export type Guard = MiddlewareHandler<Env> & { need: Need };

export function guards(deps: AccessDeps) {
  return (need: Need): Guard => {
    const guard = (async (c: Context<Env>, next: () => Promise<void>) => {
      const got = check(deps, c.get('who'), need, (k) => c.req.param(k), (k) => c.req.query(k));
      if ('status' in got) return c.json({ error: got.error, reason: got.reason }, got.status);
      c.set('checked', got);
      await next();
    }) as Guard;
    guard.need = need;
    return guard;
  };
}

/** Which live events a guest's stream carries: changes, records it reaches, fetch answers, its own link going away. */
export function guestHears(who: Principal, e: { type: string; collection?: string; owner?: string | null; token?: string }): boolean {
  if (who.kind !== 'guest') return true;
  if (e.type === 'data') return who.collections.includes(e.collection ?? '');
  if (e.type === 'unshared') return e.token === who.token;
  return ['hello', 'ops', 'fetch', 'deleted', 'reset'].includes(e.type);
}

// ── the request came from the app itself ──

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const LOOPBACK_HOST = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])(:\d+)?$/i;

/**
 * A write made with the cookie (or as local mode's account) must come from
 * edgy's own pages: a cross-site form or script can't make one. Browsers say
 * where a request comes from in Sec-Fetch-Site, or else in Origin; a client
 * that sends neither is not a browser carrying someone's cookie.
 */
export function crossSite(method: string, header: (k: string) => string | undefined, origins: string[]): string | null {
  if (!UNSAFE.has(method)) return null;
  const site = header('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return 'a page on another site can not change edgy';
  const origin = header('origin');
  if (origin && origin !== 'null' && !origins.includes(origin)) return 'a page on another site can not change edgy';
  if (origin === 'null') return 'a page on another site can not change edgy';
  return null;
}

/** Local mode trusts this machine; a page that rebinds its own name to 127.0.0.1 is not this machine. */
export const loopbackHost = (host: string | undefined) => !host || LOOPBACK_HOST.test(host);

export const isLoopbackAddress = (addr: string | undefined) => !!addr && (addr === '::1' || addr.startsWith('127.') || addr.startsWith('::ffff:127.'));
