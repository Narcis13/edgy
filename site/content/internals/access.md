---
title: Access, passwords and keys
nav: Access
---

Who may do what is decided in one place, and every route says what it needs. This page describes how a request is resolved to a person, an agent with a key, a link's guest or nobody; the `need(…)` each route declares and the test that enforces it; how passwords, sessions and API keys are kept; sign-in throttling; protection against cross-site requests; and local mode.

It describes [access.ts](src:src/server/access.ts) for the rules, [auth.ts](src:src/server/auth.ts) for the secrets, and the middleware and routes in [app.ts](src:src/server/app.ts) that use them. For what these look like to a person, see [Accounts](/people/accounts/) and [Sharing with people](/people/sharing/).

::diagram access-model

## Who is asking

Every request to `/api/*` is first resolved to a `Principal`:

```ts
export type Principal =
  | { kind: 'user'; user: User; via: 'session'; session: string }
  | { kind: 'user'; user: User; via: 'key'; key: ApiKey }
  | { kind: 'user'; user: User; via: 'local' }
  | { kind: 'guest'; level: Access; doc: string; token: string; collections: string[] }
  | { kind: 'none' };
```

`resolve()` in `createApp` tries these, in order, and the first that applies decides:

1. **In process.** A fetch cell reading this server's own `/api/data/…` calls `app.request(path, …, { internal: { doc } })`. That is a guest with `edit` level on that one document, with no token. Nothing from the network can be this: it exists only as an argument of a function call.
2. **A [share link](term:share-link)'s token**, in the `x-edgy-share` header, or `?share=` where a header can't be sent (an event stream). `guestFor` looks the token up: unknown is 404, turned off is 410, otherwise a guest for that document with the collections it reaches.
3. **An API key**: `Authorization: Bearer edgy_…`. Only a header starting with `edgy_` counts, so a proxy's basic authentication leaves the cookie to speak. The key's digest is looked up; unknown or revoked is a 401 that says what to do. The key's person is who is asking.
4. **A session cookie**, `edgy_session`. Its digest is looked up, and if the session exists and hasn't expired, its person is who is asking.
5. **Local mode**, if the server is in it (below): a request from this machine with no credential is the local account's.
6. **Nobody.**

A share token or an API key that is wrong gets an error that says so, and the middleware stops there. A cookie that matches no session is no session, and the request goes on to steps 5 and 6.

The middleware then makes three decisions before any route runs:

- A principal of `none` gets `401 sign in first` on anything that isn't public.
- A person acting by cookie or local mode (not by key) must pass the cross-site check below.
- Otherwise the principal is stored for the route (`c.set('who', who)`).

The server also stamps who made a change, from the credential and never from the body (`actorOf`). A key makes `{ kind: 'agent', name, id: <person's id>, for: <person's name> }`; a session makes a human with the account's name and id; a guest is a human named as they say, marked `guest`. The body of a request may name an agent, and that is all it may say about itself. (One exception: in local mode, where an agent needs no key, a body that says `kind: "agent"` is believed.)

## What a route needs

Every route is registered with a guard between its path and its handler:

```ts
app.post('/api/docs/:id/ops', need({ doc: 'edit', link: 'edit' }), async (c) => { … });
```

`need(…)` comes from `guards()` in `access.ts`, which makes a middleware that calls the pure function `check`:

```ts
export type Need =
  | 'public'                                   // anyone, signed in or not
  | 'in'                                       // anyone with a credential: a person or a guest
  | 'user'                                     // a person: session, key or local mode
  | 'person'                                   // a person themselves, not an agent with their key
  | { doc: 'view' | 'edit' | 'owner'; link?: Access }
  | { deck: 'owner' }
  | { data: 'read' | 'write'; link?: Access }
  | { guest: true };
```

| Need | Who passes |
| --- | --- |
| `public` | Anyone. Only the routes in the `PUBLIC` list may use it: health, sign-up and sign-in. |
| `in` | Any credential. |
| `user` | A person, however they came (cookie, key, local mode). |
| `person` | A person in a browser. A key gets `403 an API key can not do that; sign in in the browser`. This is the profile, keys and password. |
| `doc` | A person whose role on `:id` is at least the one named. With `link`, a guest of *that* document whose link is at least that level too. |
| `deck` | The deck's owner. |
| `data` | A person on their own collections; or on a document's owner's, through `?doc=`; or a guest, for a collection their link reaches. |
| `guest` | A guest only. The page a link opens asks what it opens. |

Documents have three [roles](term:role), ranked `viewer < editor < owner`:

```ts
const RANK = { viewer: 1, editor: 2, owner: 3 } as const;
```

and a refusal depends on what the person is allowed to know. Someone with no role on a document gets `404 no such document`, exactly as if it didn't exist, so a stranger can't tell. Someone with a role that is too low gets `403` with what they can do (`you can view this document, not change it`; `only its owner can do that`).

A guest is held tighter. A guest may do only what a route allows with `link:`, only on the document their link opens, and for `edit` only if the link is an edit link. Anything else, including every route without a `link`, is `403 this link does not reach that`; a view link on a route that needs an edit link gets `403 this link can view the document, not change it`.

### Data

Collections belong to an account. A route with `{ data: … }` finds whose collection `:name` is:

- With no `?doc=`, it is the signed-in person's own.
- With `?doc=<id>`, it is the document's *owner's*, and the person needs a role on the document (`view` to read, `edit` to write) and, unless they are the owner, the document must *reach* the collection.

`reaches` is the list of collections a document's owner let it use. It is worked out from the document only at the owner's own changes (`approve()` in `app.ts`), and when the owner first lets someone else in. A collaborator who adds `(rows "salaries")` to someone's document doesn't reach those records; the cell shows an error until the owner next changes the document. This is also why a document's fetch cells, handlers and `rows` all go through the same check (see [The runner](/internals/runner/)).

### The route-table test

The guard is a function with a `need` property (`type Guard = MiddlewareHandler<Env> & { need: Need }`), and that is what makes the rule testable. `accounts.test.ts` walks `app.routes` and:

- requires that every `/api` route has exactly one `need`;
- requires that `public` is used on exactly the `PUBLIC` list;
- calls every non-public route signed out and requires `401 sign in first`;
- as a second signed-in person with no access, calls every document, deck and data route and requires `404`.

A new route with no `need` fails `npm test`, and so does one that lets a stranger into a document, deck or collection. There is no default that allows.

## Passwords

Passwords are hashed with `scrypt` from `node:crypto`, in `auth.ts`:

```text
scrypt$15$8$1$<salt>$<hash>
```

The cost `N = 2^15`, `r = 8` and `p = 1` are stored with each hash, so the cost can be raised later and old hashes still verify. The salt is 16 random bytes and the key 32, both in base64url. The password is normalized to NFKC before hashing, so the same word typed with different Unicode composition matches. Comparison uses `timingSafeEqual`.

An unknown email costs as much time as a known one. `verifyPassword(password, null)` hashes against a decoy made once from random bytes and answers no, so the time doesn't say which emails have accounts.

A password is 8 to 200 characters (`passwordProblem`). Emails are trimmed and lower-cased.

## Sessions and keys

A session is a random 32-byte token in the `edgy_session` cookie, with `HttpOnly`, `SameSite=Lax`, `Path=/`, 30 days, and `Secure` when the request came over https or a proxy said it did. **Only the SHA-256 of the token is stored** (`sessions.hash`). A copy of the database doesn't hold live cookies. A session slides: if it was last seen more than an hour ago, the next request renews its expiry and the cookie, so reading doesn't write on every request.

An [API key](term:api-key) is `edgy_` followed by a random secret, shown once when it is made and kept only as a digest and a short prefix. `lastUsedAt` is updated at most once a minute. A key acts for its person, never as them: it cannot reach `person` routes, and its changes are stamped as an agent.

Signing out, changing a password, revoking a key or deleting an account ends the streams of the sessions affected right away (`recheck()`; see [The event stream](/internals/event-stream/)).

## Throttling

Failed sign-ins slow down the guesser. `Throttle` counts failures by key over 15 minutes, and after a free number of tries each attempt waits, the wait doubling from 2 seconds to 5 minutes. There are three of them, so a stranger can't lock a person out:

| Counted by | Free tries |
| --- | --- |
| Email and address together | 4 |
| Email alone | 50 |
| Address alone | 30 |

A sign-in that is made too soon gets `429` with `retry-after` and `Too many tries. Wait N seconds and try again.` A success clears the pair's count. The counts are in memory, so a restart resets them, which is acceptable for a slow-down. Each throttle remembers at most 10,000 keys: past that, the ones whose window is over go first, then the oldest, so a guesser trying a new email each time can't make the server's memory grow without end.

A fourth throttle counts new accounts by address (ten free in 15 minutes), and `EDGY_SIGNUPS=off` closes sign-up once the server has an account with an email (`403`, reason `closed`; [GET /api/health](<route:GET /api/health>) says `"signups": false`).

The address is the socket's, except behind a proxy on this machine: when the socket is loopback, the last entry of `X-Forwarded-For` (the one the proxy itself added) is the address. From any other socket the header is the caller's own word and is ignored.

## Cross-site requests

The cookie is `SameSite=Lax`, and on top of that `crossSite()` refuses a *write* (POST, PUT, PATCH, DELETE) made with the cookie, or as the local account, unless it comes from edgy's own pages. Browsers say where a request comes from, in `Sec-Fetch-Site` or else `Origin`:

- `Sec-Fetch-Site` must be `same-origin` or `none` when present.
- `Origin`, when present, must be this server's origin or (in development) the web dev server's. `Origin: null` is refused. Behind a proxy that ends HTTPS, the request reaches edgy as plain `http`, perhaps for another host name; the origin the browser sees is worked out from `X-Forwarded-Proto` and `X-Forwarded-Host` (`publicOrigin`), and counts too. A page on another site can't set those headers on a person's request, so this lets nothing new in; without it, every write from the browser behind such a proxy was refused. Share links are made with the same origin, so they say `https://`.
- A client that sends neither isn't a browser carrying someone's cookie, so it passes. A key and a share token carry their own secrets and aren't checked.

## Every answer

A middleware sets on every response: `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin` (a share link's address never goes to another site in a `Referer`), `X-Frame-Options: SAMEORIGIN`, and, where the answer has no policy of its own, `Content-Security-Policy: frame-ancestors 'self'`: no other site can frame edgy and have a person click its buttons there. An uploaded picture keeps its own stricter policy (`sandbox`).

A request body is read whole, so its size is checked first, once the asker is known (a request with no credential is refused before its body counts): 64 KB for `/api/auth/*`, 16 MB for everything else (`413`, `that request is larger than …`). A JSON body that is `null`, a number or a list counts as an empty object, so the route's own checks answer `400` instead of the server failing. Lists of ids in one request (pins, a bulk action, a deck's documents) have at most 1000.

## Local mode

On a laptop, asking for a password to open your own documents would be pointless. In [local mode](term:local-mode), a request from this machine with no session and no key is the local account: created on first use, named "You", with no email or password, and the tour as its first document.

It is on only when it cannot be reached from elsewhere. `index.ts` picks it when the server listens on a loopback host (the default, `127.0.0.1`) unless `EDGY_AUTH` says `accounts`, refuses to start in local mode on any other host, and `createApp` itself defaults to `accounts`. Then `resolve()` checks three more things before treating a request as local:

- No `forwarded`, `x-forwarded-for` or `x-real-ip` header: a request a proxy passed on came from somewhere else, whatever its socket says.
- The socket's address is loopback (`isLoopbackAddress`).
- The `Host` header is a loopback name (`loopbackHost`), so a web page that points its own name at `127.0.0.1` (DNS rebinding) is not this machine.

Sign-in, other accounts and keys still work in local mode. Giving the local account an email and a password in the profile is how its documents are used from another machine.

## Reading the decisions

The reasons behind these choices, including what was fixed in review, are in [the accounts record](src:docs/progress/2026-10-10-accounts.md). It has the access model, the sync design and the security review, with what was kept on purpose.
