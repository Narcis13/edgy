# Progress

Goal (brief 3 in `FEATURES_PROMPTS.md`): edgy becomes multi-user. Sign up, sign in and sign out with email
and password; a profile (name, avatar colour and initials, email, password, theme, API keys, delete account);
every document has an owner who gives other accounts view or edit access; the live stream carries real
identities (presence, the cell each person has selected, names in Activity); collections stop leaking
between people; MCP and HTTP clients use per-person API keys; and the local SQLite file syncs both ways with
a Turso database, so the same account finds the same documents, history and records on another machine,
offline included.

Started 2026-10-10 on branch `main` at `056806e`. Brief: `/goal-loop Brief 3 in FEATURES_PROMPTS.md, that brief only`.

**Next:** nothing — every contract item passes (final audit 2026-10-10).

## Contract (Done means)

| # | criterion | verified by | evidence | status |
|---|---|---|---|---|
| G1 | Typecheck, all tests and the production build (app and offline bundle) pass, no chunk warning | `gates.sh` | Log | pass — typecheck, 248 tests, app + offline build, no chunk warning (final audit) |
| G2 | Zero console/network problems on every screen signed in at 1440×900 and 390×844 (home, data, every showcase document in Edit/Live/Page, deck, play, shared link), plus sign-in, sign-up and profile signed out/in; 820×1180 and dark for the new screens | `sweep.sh` with the session cookie + `cdp.mjs` | Log | pass — fresh server, signed in (Ana) with 8 documents (7 templates + one Ben shared): sweep of every screen incl. sign-in/up/phone signed out, Shared with me, profile: 83 files, 0 problems; shoot.sh: 0 problems except the expected 401/429 on wrong-password.png and slowed.png; tablet 820×1180 and dark: profile-tablet-dark.png, shared-with-me-tablet-dark.png, signup-dark.png |
| G3 | A reproducible showcase: two accounts, a document one shares with the other (editor) and one shared as viewer, a collection each, presence, an API key used through MCP, sync between two instances; evidence and `INDEX.md` | `docs/showcase/accounts/seed.mjs` + `shoot.sh` | `docs/showcase/accounts/` | pass — `docs/showcase/accounts/` (seed.mjs, shoot.sh, sync.sh, mcp-check.mjs, migration.sh, INDEX.md), all regenerated from fresh servers |
| A1 | Sign up, sign out and sign in work in the browser at 1440×900 and 390×844; a wrong password gives a clear message; repeated failures are slowed down (measured); passwords are stored with scrypt and a per-password salt; the session cookie is `HttpOnly` and `SameSite=Lax` (Set-Cookie read back) | cdp drive + curl + `auth.test.ts` | `signin-*.png`, `auth.txt` | pass — signin*.png, signup-*.png, wrong-password.png, slowed.png ("Too many tries. Wait 4 seconds", countdown), auth.txt (HttpOnly; SameSite=Lax; scrypt$15$8$1 hashes; 5th failure → 429), accounts.test.ts |
| A2 | Signed out, every page except sign-in, sign-up and share links leads to sign-in; every `/api` route except the public few (health, sign-in/up, share-link landing) answers 401 without a session or a key; a test walks Hono's route table, so a route added later without an access rule fails the test | cdp + `routes.test.ts` | `signed-out.png`, tests | pass — signed-out.png (/d/… → /signin?next=…), signed-in-back.png (back to the document), auth.txt (401s), route-table test |
| A3 | User B cannot list, read, change, delete or listen to user A's document over any route until A gives access; a viewer cannot post ops, an editor can; taking access away takes effect at once, an already open event stream included | `access.test.ts` (every route) + a live stream check | tests, `auth.txt` | pass — accounts.test.ts (every document/deck/data route as a stranger → 404; viewer 403 on ops, editor 200; stream closed on removal), viewer.png, revoked.png, together.txt |
| A4 | A database made by the current code (commit `056806e`): after the upgrade the first account owns every document, deck, link and collection, and nothing is lost (documents, history, records, messages compared) | migration test + `migration.sh` on an old-code database | `migration.txt`, tests | pass — migration.txt (056806e database: schema 3 → 6, identical documents/logs/messages/collections/pins/deck/links, all owned by the first account; a second account sees none) |
| C1 | Two browsers signed in as two people in one document: each sees the other present and the cell they selected; an edit appears on the other side within a second (measured); simultaneous edits to different cells both survive; Activity shows both names; screenshots of both sides | two headless pages driven at once | `together-*.png`, `together.txt` | pass — together-ana.png / together-ben.png (each sees the other present and their selected cell), together.txt (21 ms and 30 ms, both edits kept, both names) |
| P1 | Profile: a changed name shows in presence and in Activity; a password change signs out the person's other sessions (their open stream closes too); deleting the account asks first (in-page dialog) and does what Decisions says | drive + API + tests | `profile-*.png`, `auth.txt` | pass — renamed.png (Activity shows "Ana Maria Pop"), profile*.png, delete-dialog.png, auth.txt, accounts.test.ts (password change ends the other session; delete takes documents) |
| K1 | API keys: create one, it is shown once; through the MCP server (`EDGY_API_KEY`) it lists only that person's documents and applies an op, traced as the agent acting for the person; a revoked or missing key fails with a clear message on every tool; the key appears in no log, document or response after creation | MCP client against the isolated server + grep of logs and responses | `mcp.txt`, tests | pass — mcp.txt (only her documents; op traced {kind:agent, name:Claude, for:Ana}; revoked and missing key: clear message on all 14 tools; the key nowhere afterwards incl. the server log), key-created.png |
| D1 | Collections follow the rule in Decisions; tests show B cannot read A's records through `/api/data`, through `(rows …)` in B's own document, or through a document A shared beyond what the rule allows | `collections.test.ts` | tests | pass — accounts.test.ts ("collections belong to their owner", "a blank document … reaches nothing"), viewer.png |
| S1 | Sync, two isolated instances, one account, the Turso database in `.env`: a document created on one appears on the other; edits travel both ways; edits made while the cloud is unreachable are delivered when it returns with no lost or duplicated ops (the two op logs compared); conflicting offline edits resolve as Decisions says; the UI shows synced, syncing and offline; row counts on both sides in the Log | `docs/showcase/accounts/sync.sh` (two servers, a cut-able gate to Turso) | `sync.txt`, `sync-*.png` | pass — sync.txt against Turso (22 checks: appears on two, both ways, offline edits on both delivered, logs 11 = 11, last-to-cloud wins, conflict kept, records merged), sync-synced/two/offline/offline-phone/merged.png |
| S2 | Without `TURSO_URL`/`TURSO_AUTH_TOKEN` edgy runs local-only as before and the UI says sync is off | server without the variables + cdp | `sync-off.png` | pass — "Sync off" in every top bar of shoot.sh and the sweep (library-ana.png, profile.png); sync.test.ts ("without the cloud") |
| S3 | Turso costs stay small: an idle pull reads only its index probe (one row) and every pull reads from an indexed position (rows_read per query in the Log); each verification run works in its own account and removes what it created (counts before and after) | `rows_read` from the HTTP answers | `sync.txt` | pass — sync.txt: idle 6 s → 6 requests, 6 rows read (the index probe each), 0 written; plan SEARCH edgy_log USING INDEX edgy_log_space; each run deletes its account and rows; Turso afterwards: edgy_log/accounts/assets 0 rows, edgy_meta 1 (the database id) |
| S4 | The sync engine is unit-tested against a local stand-in for the cloud: create, edits both ways, offline catch-up, interleaved conflicting edits converge to identical logs and documents, records merge, deletes | `sync.test.ts` | tests | pass — sync.test.ts (14): create, both ways, offline, conflicts, records, decks/links/deletes, password and account deletion, space ownership, broken-off uploads, create-then-delete, a new cloud, a page pulled twice |
| L0 | `npm run dev` with nothing configured needs no sign-up: a single local account is signed in automatically (local mode, see Decisions); the user's MCP setup keeps working there | server in local mode + cdp + MCP call | `local-mode.png`, Log | pass — local-mode.png ("Local account, no sign-in needed"), auth.txt (keyless GET works locally; a rebinding Host is refused) |
| R1 | The review before the final audit includes a security pass (authorization on every route, token and key handling, CSRF on cookie writes); findings fixed or listed with the reason | reviewer agent + fixes | Log, Decisions | pass — security pass (opus) and code review (sonnet); every finding fixed with a test or kept with a reason under Decisions |
| R2 | `.claude/goal-loop/` (`project.md`, `serve.sh`, `screens`, the cdp recipes) lets later loops verify signed-in screens, and the full sweep passes signed in | `serve.sh` + `sweep.sh` | Log | pass — project.md (accounts, serve.sh session, CDP_COOKIE, sync.sh), serve.sh, screens, cdp.mjs --cookie/--js await; the full sweep passes signed in |
| R3 | README covers accounts, sharing with people, API keys for agents, local mode and setting up sync; the guide (`/api/guide`) tells agents about keys | read | `README.md`, guide | pass — README: Accounts and people, API keys for agents, Sync between machines, local mode, scripts; guide: Data, Accounts and access, secrets rule |
| T1 | New tests cover password hashing, sessions, throttling, the route table, the access matrix, collections per owner, API keys, presence, the migration and the sync engine | `npm test` count goes up | Log | pass — 198 → 248 tests (accounts.test.ts 21, sync.test.ts 14, people/paths web tests, …) |

Status: `open` → `pass` (with evidence) or `blocked` (see Blocked).

## Milestones

1. [x] **Store + accounts core**: schema 4 (users, sessions, api_keys, owners, doc_access, records by owner, what a document reaches), scrypt, sessions, keys, throttling, `access.ts` rewritten around declared routes, auth routes, first-account ownership, local mode, CSRF; existing tests run in local mode; new tests (A1–A4 server side, D1, T1 part)
2. [x] **Sharing with people + live identities**: people endpoints, Mine / Shared with me, streams that know who listens (presence, selection, revocation closes them), actor from the session, collections through a document (C1 and A3 server side, P1 server side)
3. [x] **Web: sign-in, profile, people, presence**: sign-in/up pages and the gate, user menu, profile page with keys and delete, Share dialog people section, Mine / Shared with me, presence stack and remote selections, Activity names (A1, A2, C1, P1, L0)
4. [x] **MCP + guide**: `EDGY_API_KEY`, clear messages, actor for the person, guide section (K1)
5. [x] **Sync engine**: cloud client (Turso over HTTP, local stand-in), outbox/dirty tracking, push/pull, rebase of document ops, records and library state, assets, status endpoint and UI (S1–S4)
6. [x] **Verification tooling**: cdp `--cookie`, `serve.sh` signed in, screens, project.md (R2)
7. [x] **Showcase + evidence**: two accounts seed, together/profile/keys/sync scripts, two-instance sync against Turso with a cut-able gate (G3, C1, S1, S3)
8. [x] **Review (with security pass) + final audit** (R1, everything)

## Decisions

*(the access model and the sync design were thought through before code; overrule anything here)*

### Accounts

- **Email and password only.** No OAuth (it needs client credentials the brief doesn't give). Emails are
  stored lower-cased and trimmed; a password has at least 8 characters.
- **Hashing:** `node:crypto` scrypt, N=2^15, r=8, p=1, 16-byte random salt, 32-byte key, stored as
  `scrypt$15$8$1$<salt>$<hash>` so the cost can be raised later; compared with `timingSafeEqual`. A sign-in
  for an unknown email still runs one scrypt so timing doesn't tell which emails exist. No library.
- **Sessions:** a random 32-byte token in the cookie `edgy_session` (`HttpOnly; SameSite=Lax; Path=/`,
  `Secure` when the request came over https, 30 days, renewed while used). Only its SHA-256 is stored
  (`sessions` table), so they survive a restart and a stolen database doesn't hold live cookies.
- **Throttling:** failures are counted per email and per client address in memory over 15 minutes. From the
  fifth failure on, sign-in answers 429 "Too many tries. Wait N seconds." with N doubling (2, 4, 8 … 300).
  A success clears the email's count. (In memory: a restart resets it; that is acceptable for a slow-down.)
- **CSRF:** the cookie is SameSite=Lax, and every write (POST, PATCH, PUT, DELETE) that is authenticated by
  the cookie, or by local mode, must come from the app itself: `Sec-Fetch-Site` same-origin/none when the
  browser sends it, otherwise an `Origin` equal to the server's own or the dev web origin. Requests with an
  API key or a share token carry their own secret and aren't checked. In local mode the `Host` must also be
  a loopback name, so a DNS-rebinding page can't act as the local account.
- **Local mode (one-command start).** `EDGY_AUTH=local|accounts`. Default: `local` when the server listens
  on a loopback address (the default `127.0.0.1`), `accounts` otherwise, so a server reachable from other
  machines always asks for sign-in. In local mode a request from this machine with no session and no key is
  the local account's (created on first start, called "You", no email or password needed): `npm run dev`
  opens straight into the library and `.mcp.json` keeps working without a key, as before. Sign-in, other
  accounts and keys all still work in local mode; giving the local account an email and password in the
  profile is how it is used on another machine. `serve.sh` (verification) runs `accounts`.
- **Public routes** (no session, no key): `GET /api/health` (which also says `signedIn` and `auth`, so a
  signed-out page never asks `/api/me` and logs no 401), sign-up and sign-in. Share-link routes answer a link's
  token. Everything else under `/api` is 401 signed out. Local mode has no route of its own: a request from this
  machine without a session or key simply is the local account.
- **Sign-up is open** to whoever reaches the server (a server on 127.0.0.1 is reached only from this
  machine). The first account created owns every document, deck, link and collection that has no owner.
- **Deleting an account** (asks first, needs the password): its documents and decks are deleted (with their
  history, messages, links and access lists), its collections' records are deleted, its sessions and keys
  go, and its access to other people's documents is removed. Its name stays as text on changes it made to
  other people's documents. With sync on, its space in the cloud is deleted too (a tombstone row says so).

### Access model (one place: `server/access.ts`)

- **Principals:** a person by session cookie; an agent by API key, acting for its person; a guest by share
  link; nobody. Every request is resolved to one of them once, in middleware.
- **Every route declares what it needs** when it is registered (`route(method, path, need, handler)`):
  `public`, `signed-in`, `doc:view|edit|owner`, `deck:owner`, `key-free` … The guard runs before the handler
  with the route's own params. A test walks `app.routes`: every `/api` route must have a declaration, every
  non-public one must answer 401 signed out, and every document route must refuse a stranger. Deny is the
  default: a route without a declaration answers 403.
- **Document roles:** owner > editor > viewer. A stranger gets 404 "no such document" (it doesn't learn the
  document exists); someone with too low a role gets 403 with what they can do. Viewers read the document,
  its values, the records it reads, fetch answers, its outline and history, and listen to its stream.
  Editors also post ops, refresh fetches, save records into the collections it reaches, send messages and
  compose. Only the owner renames from the library, archives, pins, deletes, exports, manages links and
  people, and puts it in a deck.
- **Library state is the owner's**: pins, archive and decks arrange the owner's own documents. The home page
  has two scopes: **Mine** (as before) and **Shared with me** (documents others gave me access to, newest
  first, with the owner's name and my role; I can leave one). Share links still work and belong to the owner.
- **Access is given to existing accounts by email** (no email is sent). The owner adds someone as viewer or
  editor, changes the role, removes them. Adding an unknown email says there is no such account.
- **Taking access away is immediate:** every open event stream knows whose it is; when a document's access
  changes, its streams are re-checked: a stream that lost access gets `revoked` and is closed, one whose role
  changed gets `access` with the new role. Signing out, a password change and account deletion close the
  streams of the sessions that ended.
- **Who did it:** the server stamps the actor, never the body: a session is `{kind:'human', id, name}`, a key
  is `{kind:'agent', name: <agent name or key name>, id: <user id>, for: <person's name>}`, a guest is a human
  named as they say, marked as a guest. Activity shows a person's current name by id.

### Collections (per owner)

- A collection belongs to an account: (owner, name). Two people can each have "orders"; they never see each
  other's. `/api/data` and the Data page list and change the signed-in person's own collections.
- **A document reads and writes its owner's collections**, whoever is looking: it is the owner's app. So B,
  editing A's shared document, sees and saves A's records through it, and `(rows "orders")` in B's own
  document reads B's "orders".
- **What a document reaches is fixed by its owner:** the collections the document used at the owner's last
  change (stored per document, `reaches`; the rule links already had). A collaborator who adds
  `(rows "salaries")` to A's document doesn't reach A's salaries: the cell shows an error until A changes the
  document. The browser reads records through the document (`/api/data/<name>?doc=<id>`); the server checks
  the role (view to read, edit to write) and the reach set.
- Server-run handlers and fetch cells reading `/api/data/…` act for the document's owner under the same rule.

### Sync (Turso)

- **Client: plain HTTP to Turso's `/v2/pipeline` (Hrana over HTTP) with `fetch`.** No dependency: the protocol
  is one JSON POST, and `@libsql/client` would add a native module for nothing. A local stand-in (node:sqlite
  running the same SQL) implements the same interface for tests.
- **Turned on by the environment only:** `TURSO_URL` and `TURSO_AUTH_TOKEN`. Plain `npm run dev` doesn't read
  `.env`, so the user's own `data/edgy.db` never syncs by surprise; `npm run dev:sync` passes `--env-file=.env`.
- **The cloud is an append-only log per account ("space")**: `edgy_log(seq AUTOINCREMENT, space, oid UNIQUE,
  kind, key, origin, ts, body)` with an index on (space, seq), plus `edgy_accounts` (for signing in on a new
  machine) and `edgy_assets` (pictures by hash). A pull is `WHERE space=? AND seq>? ORDER BY seq LIMIT 500`:
  an index range (SEARCH edgy_log USING INDEX edgy_log_space), never a scan; an idle pull reads one row by Turso's count
  (the index probe) and writes none. A push is `INSERT … ON CONFLICT(oid) DO NOTHING`,
  so a retried push never duplicates. libSQL has one writer, so seq order is commit order and a pull past a
  seq never misses a row.
- **What syncs:** everything an account owns: its documents (created as a snapshot plus their history, then
  every op), deletions, its records, pins, archive, decks, share links and the access it gave, its profile,
  and uploaded pictures (fetched by hash when first needed). Not synced: sessions, API keys (credentials of
  one server), messages with agents, presence. A machine syncs every account that exists on it; signing in
  on a new machine with an email that is only in the cloud brings the account (and then its space) down.
- **The cloud's order is the truth.** Ops are the unit for documents: each local op gets a global id (oid)
  when it is saved. After a pull, a document is: its last confirmed state, the confirmed ops in cloud order,
  then this machine's ops not yet confirmed, replayed on top. Both machines end with the same ops in the same
  order, so the op logs compare equal.
- **Signing in on a new machine:** an email not known here is looked up in `edgy_accounts`; the password is checked
  against the hash stored there; the account comes down with its id (it claims nothing local) and its space is pulled
  before the answer (up to 10 s). Sign-up refuses an email the cloud knows. A password changed on one machine ends
  the sessions on the others when its profile arrives. With the cloud unreachable, a new machine can't sign in an
  account it has never seen.
- **Tours:** an installation no longer makes a tour before any account exists; each new account (and the local
  account) starts with one unless it owns documents already (the first account owns an upgraded installation's).
- **Conflicts:** concurrent edits to different cells both survive. On the same property, the edit that
  reaches the cloud last wins (it is applied last everywhere). An op that no longer applies (its cell was
  removed by the other side) is skipped on every machine, kept in the history, and shown in Activity as
  "skipped: conflict" (`conflict: true` in `/log`). An unsent op that no longer applies after a pull is kept
  the same way and still sent, so every machine shows it. A document deleted on one side stays deleted (later edits to it are dropped).
  Records merge field by field (different fields both survive, the same field: the one reaching the cloud
  last); a deleted record stays deleted; clearing a collection deletes the records that machine had, so a
  record added elsewhere meanwhile survives. Pins, archive, deck contents, links and access are
  last-writer-wins per item, in cloud order.
- **Rounds:** a change pushes within ~300 ms; a pull runs every 3 s (`EDGY_SYNC_INTERVAL`) and backs off to
  30 s while the cloud is unreachable. The status is `off`, `synced`, `syncing` (changes waiting) or
  `offline` (the cloud didn't answer), shown in the home and editor top bars (`GET /api/sync`).

### From the security review (R1)

An opus reviewer went through every route, the streams, tokens, CSRF, local mode and sync; findings reproduced
with a throwaway test. Fixed (each with a regression test in `accounts.test.ts` or `sync.test.ts`):

- **High: server secrets sent where an editor pointed a fetch cell.** Secrets now go out only from documents of
  the server's owner (stored explicitly as `server-owner` when the first account is made here, not "the oldest
  user"), and only from a cell, to an origin, for a secret name the owner approved (`docs.trusted`, schema 6). An
  owner's change approves secrets only for cells it touched, so renaming the document doesn't bless an editor's
  new address. Local mode no longer hands secrets to every document.
- **Medium: a blank document's reach worked out from a collaborator's edit.** `reaches` is set only by the owner
  (creation, own changes, and the first time they let someone in: a person or a link); a document never approved
  reaches nothing. Documents nobody else can change are approved at startup.
- **Medium: an email clash stopping sync for everyone on a machine.** Sign-up and email changes check the cloud
  (and refuse, 503, when it can't be asked); the email index in `edgy_accounts` is written on its own, so a clash
  stops nothing else; every pulled row is applied on its own: one that can't be applied is skipped and counted
  (`skipped` in `/api/sync`), and the badge says **Sync stopped** when a round fails for a reason other than the network.
- **Medium: cloud rows trusted whatever space they were in.** A row now changes only what belongs to its space's
  account (its profile, its documents, records, decks, pins, links, access lists); anything else is ignored.
- **Medium-low: viewers and links could read fetch addresses** through the outline, the log and the stream.
  Viewers and links get documents, outlines, history and ops without fetch addresses and headers, no handler traces,
  and fetch answers without their address; data events for collections the document doesn't reach go only to its owner.
- **Low:** sign-in throttling no longer lets someone lock a person out (fast per email+address, much later per email
  alone or per address alone); `/viewer` changes only the caller's own tabs; Ask AI for an editor names only the
  collections the document reaches (it answered 500 before); a session that expires closes its streams; access
  taken away and links turned off on another machine reach streams here; local mode refuses requests a proxy
  forwarded, and `createApp` defaults to accounts (the server picks local only on a loopback host); a malformed
  cookie is no session rather than a 500; a picture missing in the cloud too isn't asked for again for 10 minutes;
  `/api/library/:id` no longer tells someone else who owns a document.

Kept as they are, on purpose:

- People with access see each other's names and emails in the People list (as in shared documents elsewhere).
- Sign-up and "add people" say when an email has no account / has one: enumeration is the price of adding people
  by email; a server reachable from outside should be behind its own sign-up policy (out of scope).
- A password change ends sessions, not API keys: keys are separate, long-lived credentials with their own
  revoke, listed with when each was last used. Changing the email needs a signed-in session (cookie writes are
  CSRF-checked), not the password.
- The owner's next change approves what collaborators made the document read (the reach rule): that is what
  "fixed by its owner" means; secrets are held to the stricter per-cell rule above.
- With sync, sign-in for an email this machine doesn't know takes a cloud lookup (slower), so timing tells whether
  the email is local; it doesn't tell whether the account exists.

### From the code review

A sonnet reviewer read the whole diff and reproduced each finding with scripts. Fixed, with tests in `sync.test.ts`
and `accounts.test.ts`:

- A first upload split across requests could lose a document's history: a document's state and history now always go
  in one request, and each request is a transaction (a request that breaks off leaves nothing half sent).
- A document deleted while its first upload was on its way came back on other machines: deleting always sends the
  deletion.
- Pointed at a new or restored cloud database, a machine stopped syncing: the cloud carries an id (`edgy_meta`); a
  different one starts the machine's sync again from nothing.
- A page pulled twice applied ops twice: confirmed ops are recognised and left alone.
- Pictures uploaded before sync was on now go up once; a picture the cloud refuses (too large) doesn't stop a round;
  "Syncing" shows only while changes wait or go, not during idle pulls; any failed round waits 30 s before the next.
- Any `Authorization` header that wasn't an edgy key hid the session cookie (hosting behind basic auth): only
  `Bearer edgy_…` is a key now. Sign-in's 10 s wait timer is cleared; two sign-ins or sign-ups at once no longer
  answer 500.
- The editor's collection pickers listed the signed-in person's collections, not the document's: `GET /api/data?doc=`
  lists what the document may name; caches are dropped on sign-out. A sync reset keeps the cell being typed in open.
- `edgy_data` takes `doc`, to read and write records through a document shared with the key's person.

Kept: deleting an account isn't one transaction (each document's deletion is; a failure midway leaves the account,
which can be deleted again); a sync reset clears undo (its entries refer to a history that was replaced);
`useLibrary` asking again for the shared count and `summary(id)` scanning link and access tables are cheap at this
size. The web `Session` has no unit tests for the new events; they are covered by the driven evidence (together,
viewer, revoked, sync screenshots).

## Blocked

- *(none)*

## Notes

- No git identity is configured on this machine: commit with `git -c user.name="Narcis Brindusescu" -c user.email="narcis75@gmail.com" commit …`.
- Most source files are CRLF.
- Git Bash heredocs lose backslashes, and the Write/Edit tools turn \uXXXX escapes into characters: write patch scripts with the Write tool.
- Set `TMPDIR` explicitly in every Bash call (`TMPDIR=C:/Users/User1/AppData/Local/Temp/claude/C--dev-edgy/c2f5bc2a-3d9b-427d-a6af-f75601ba2b9b/scratchpad`); with it unset, `cat > "$TMPDIR/x"` writes to `/x` and waits on stdin.
- Turso: `TURSO_URL` is `libsql://…` → `https://…/v2/pipeline`; answers carry `rows_read`/`rows_written`; one statement's error in a pipeline doesn't stop the others. Never print the token: read it only through `node --env-file=.env`.
- The web client trusts nothing about identity today: `session.ts` actor is `{kind:'human', name:'You', id: client}`; presence is keyed by name; Activity special-cases "You". Concurrent ops already merge: the server applies ops to its current document and the browser rebases its pending batches on remote ops.

## Log

- 2026-10-10: baseline at `056806e`: typecheck, build pass; 198 tests pass. Turso reachable over `/v2/pipeline`, empty database.
- 2026-10-10: M1 store + accounts core: schema 4 (users, sessions, api_keys, doc_access, owner columns, reaches), `auth.ts` (scrypt, secrets, throttle), `access.ts` rewritten (principals, `need(…)` guards on every route), app routes for sign-up/in/out, me, password, delete, keys, people; streams know whose they are (presence with selection, revocation closes them); collections per owner and through documents; runner reads and writes records through the app. The 198 old tests run in local mode (3 expectations changed: the server names the actor; the guide is for people only; the access-rule unit test uses the new `check`). New `accounts.test.ts` (14). Gates pass: 212 tests.
- 2026-10-10: M2–M5. Web (two sonnet agents, disjoint files, briefs in the scratchpad): sign-in/up pages and the gate, user menu, profile (name, colour, email, password, theme, keys shown once, delete), Mine/Shared with me; presence stack, remote selection outlines, Activity names by id ("Claude for Ana"), viewers read-only, revoked page, Share dialog people. I added `account/me.ts`, `Avatar`, the sync badge, `signedIn` on health (no 401 on signed-out pages), owner-only export. MCP: `EDGY_API_KEY`, clear messages, `scope` on edgy_docs; guide sections on data and accounts. Sync: `cloud.ts` (Turso over /v2/pipeline, LocalCloud stand-in), `sync.ts` (push/pull, rebase, conflicts, records merge, LWW library state, assets, account deletion), store schema 5; `sync.test.ts` (9). Real Turso: `docs/showcase/accounts/sync.sh` through `cloud-gate.mjs`: all 22 checks pass (offline edits on both, logs equal 11 = 11, conflict kept, idle pull 1 row read/request, index search plan, cleanup to 0 rows, token in no log). Full sweep signed in on a fresh server (7 templates + one shared by Ben, new screens signed out and in): 0 problems. Gates: 237 tests.
- Agent notes: the editor agent left 2 small things unverified (Leave after redirect re-run; phone header with many real people); the account agent: "Mine" has no count. To check in the evidence pass.
- 2026-10-10: reviews. Security pass (opus): 1 high (secrets via an editor-set address), 4 medium, several low: all fixed with tests or kept with reasons (Decisions). Code review (sonnet): split uploads, create-then-delete, a new cloud, re-pulled pages, assets, basic auth hiding the cookie, pickers, MCP doc: fixed with tests. Schema 6 (trusted secrets, server owner). 248 tests.
- 2026-10-10: final audit from fresh servers and builds: gates pass (248 tests, no chunk warning); full sweep signed in, 83 files, 0 problems; shoot.sh regenerated (only the expected 401/429 on the two sign-in failure shots); SHOTS=1 sync.sh against Turso: all passed, token in no log, the run's rows removed (Turso left with its 4 empty tables and the edgy_meta id); mcp-check: as expected; migration.sh: identical. Every evidence file read. Servers stopped.
