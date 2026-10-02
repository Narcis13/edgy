// Who may do what. The one place the server decides it, so accounts (a later
// brief) extend this file rather than every route.
//
// A request without a share token is the owner's: the person running edgy on
// this machine. A request with one (header x-edgy-share, or ?share= where a
// header can't be sent, as on an event stream) is a guest's, and reaches only
// the token's document:
//
//   view  read the document and its fetch answers, the records it reads, and
//         listen to its changes
//   edit  also change it (ops), save records to the collections it uses, and
//         fetch again
//
// "The collections it reads" are fixed by its owner: those the document used
// when the link was made or the owner last changed it, never what a guest's
// own changes make it read. Fetch addresses and headers stay with the owner.
//
// Everything else (other documents, the library, the data browser, history,
// messages, the outline, composing, exporting, uploads, share links) is refused.

import type { Store, Access, Share } from './store';

export type Grant =
  | { level: 'owner' }
  | { level: Access; doc: string; token: string; collections: string[] };

export interface Refusal {
  status: 403 | 404 | 410;
  error: string;
  /** unknown: no such link; revoked: turned off; forbidden: not with this link. */
  reason: 'unknown' | 'revoked' | 'forbidden';
}

export const SHARE_HEADER = 'x-edgy-share';

/** Who is asking: the owner, a guest with a link that is on, or a refusal. */
export function grantFor(store: Store, token: string | undefined): Grant | Refusal {
  if (!token) return { level: 'owner' };
  const share: Share | null = store.share(token);
  if (!share) return { status: 404, error: 'this link does not open anything', reason: 'unknown' };
  if (share.revokedAt != null) return { status: 410, error: 'this document is no longer shared', reason: 'revoked' };
  return { level: share.access, doc: share.doc, token, collections: share.collections };
}

type Need = 'view' | 'edit';
/** What a guest's link reaches: [method, path, the link it needs, what the first group names]. */
const GUEST: [string, RegExp, Need, 'doc' | 'collection' | null][] = [
  ['GET', /^\/api\/shared$/, 'view', null],
  ['GET', /^\/api\/health$/, 'view', null],
  ['GET', /^\/api\/docs\/([^/]+)$/, 'view', 'doc'],
  ['GET', /^\/api\/docs\/([^/]+)\/(?:events|fetched)$/, 'view', 'doc'],
  ['POST', /^\/api\/docs\/([^/]+)\/viewer$/, 'view', 'doc'],
  ['POST', /^\/api\/docs\/([^/]+)\/ops$/, 'edit', 'doc'],
  ['POST', /^\/api\/docs\/([^/]+)\/fetch\/[^/]+$/, 'edit', 'doc'],
  ['GET', /^\/api\/data\/([^/]+)$/, 'view', 'collection'],
  ['POST', /^\/api\/data\/([^/]+)$/, 'edit', 'collection'],
  ['PATCH', /^\/api\/data\/([^/]+)\/[^/]+$/, 'edit', 'collection'],
  ['DELETE', /^\/api\/data\/([^/]+)(?:\/[^/]+)?$/, 'edit', 'collection'],
];

const FORBIDDEN: Refusal = { status: 403, error: 'this link does not reach that', reason: 'forbidden' };

/** Whether a grant allows this request. */
export function allows(grant: Grant, method: string, path: string): true | Refusal {
  if (grant.level === 'owner') return true;
  for (const [m, re, need, what] of GUEST) {
    if (m !== method) continue;
    const hit = re.exec(path);
    if (!hit) continue;
    if (need === 'edit' && grant.level !== 'edit') return { status: 403, error: 'this link can view the document, not change it', reason: 'forbidden' };
    let named: string | undefined;
    try {
      named = hit[1] ? decodeURIComponent(hit[1]) : undefined;
    } catch {
      return FORBIDDEN;
    }
    if (what === 'doc' && named !== grant.doc) return FORBIDDEN;
    if (what === 'collection' && !grant.collections.includes(named!)) return FORBIDDEN;
    return true;
  }
  return FORBIDDEN;
}

/** Which live events a guest's stream carries: changes, records it reaches, fetch answers, its own link going away. */
export function guestHears(grant: Grant, e: { type: string; collection?: string; token?: string }): boolean {
  if (grant.level === 'owner') return true;
  if (e.type === 'data') return grant.collections.includes(e.collection ?? '');
  if (e.type === 'unshared') return e.token === grant.token;
  return ['hello', 'ops', 'fetch', 'deleted'].includes(e.type);
}
