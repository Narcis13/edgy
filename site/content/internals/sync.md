---
title: Sync
---

Sync keeps your local file and a cloud database in step, so the same account finds the same documents on another machine. This page describes the design: an append-only log in the cloud, how a round pushes and pulls, the order documents are replayed in, how conflicts are settled, and the stand-in cloud that tests use.

It describes [sync.ts](src:src/server/sync.ts) and [cloud.ts](src:src/server/cloud.ts), with the tables they use in [store.ts](src:src/server/store.ts). The reasons behind the design are in the *Sync (Turso)* section of [the accounts record](src:docs/progress/2026-10-10-accounts.md); this page follows it and says where the code decides. For what a person sees, see [Sync](/people/sync/).

## The idea

The local SQLite file stays the working store. Reads and writes never wait for the cloud, so edgy works the same offline. In the background, everything an account owns travels both ways through one **append-only log** in the cloud, with one *space* per account. The log's order is the order every machine replays, so every machine ends with the same history, op for op.

::diagram sync-logs

Sync is on only when both `TURSO_URL` and `TURSO_AUTH_TOKEN` are set (`cloudFromEnv`). `npm run dev` doesn't read `.env`, so your own data never syncs by surprise; `npm run dev:sync` passes `--env-file=.env`.

## The cloud's tables

```text
edgy_log       seq (autoincrement), space, oid (unique), kind, key, origin, ts, body
edgy_accounts  id, email (unique), body, updated_at, deleted_at
edgy_assets    file, type, bytes
edgy_meta      key, value
```

`edgy_log` is the log. An index on `(space, seq)` makes a pull an index range, never a scan. The other three exist for things that must be looked up rather than replayed: finding an account by email when someone signs in on a new machine, pictures by their file name, and the id that says which database this is.

Each row of the log says what it is with `kind` and `key`, and carries a JSON `body`:

| `kind` | `key` | `body` |
| --- | --- | --- |
| `create` | document id | `{ doc, createdAt, updatedAt }`: a document the cloud didn't have, as of its version. |
| `hist` | document id | `{ base, entries }`: its history up to that version, 100 entries to a row. |
| `op` | document id | `{ v, ts, actor, ops }`: one saved batch of ops. |
| `doc` | document id | `{ deleted: true }`. |
| `doclib` | document id | `{ archivedAt, reaches, trusted }`: the library flags. |
| `record` | record id | `{ collection, at, set, source }`, or `{ deleted: true }`. |
| `pins`, `deck`, `share`, `access` | what they name | The latest state of that one thing. |
| `account`, `account-deleted` | account id | The profile (with its password hash); or that it was removed. |

Documents are sent as events (the ops) because the unit that matters for them is *what changed in what order*. Everything else is sent as **the latest state of one thing**, which later rows replace.

## A round

`Sync.round()` is one trip. `once()` does:

```ts
await this.connect();      // the cloud's tables, once
await this.removals();     // accounts deleted here: their space goes
await this.pull();         // what is new in the log
if (await this.push()) await this.pull();   // what is new here, then see it come back
```

Rounds start in four ways: at startup (`start()`), 300 ms after a local change (`kick()`, wired to `Store.onChange`), every three seconds (`EDGY_SYNC_INTERVAL`), and when someone asks ([POST /api/sync](<route:POST /api/sync>)). If a round is under way, a new call marks `again` and shares it, so there is never more than one at a time and a change made during a round is sent in the next one without waiting for the timer. After an error the next round waits at least 30 seconds.

`connect()` creates the cloud's tables and reads `edgy_meta.id`, the identity of this cloud database. If the id differs from the one this file last synced with (a new database, or one restored from a backup), the file starts again as if it had never synced: `resetSync()` forgets what it thought the cloud had confirmed, so everything here goes up and what the cloud has comes down.

### Push

What is waiting to go is found in three places:

- **Documents the cloud doesn't have** (`unsentDocs`): a `create` row with the document and `hist` rows with its history.
- **Ops made since the cloud last confirmed** (`pendingOps`): one `op` row each, in order, with the op's own `oid`.
- **Everything else that changed**, from `sync_dirty` (`dirtyItems`): one row with the thing's latest state, from `describe()`.

`sync_dirty` has one row per `(kind, key)`: a counter `n` that only goes up, and which `fields` changed (all of them, or a list). Writing the same thing twice replaces the row, so a record edited ten times offline is sent once. After a push, `clearDirty(kind, key, n)` deletes the row only if `n` is still the one that was sent; if the thing changed again meanwhile, its row stays and goes in the next round.

Two details make a push safe:

- **A unit is never split.** A document's `create` and `hist` rows go in one request, and each request is wrapped in `BEGIN … COMMIT` and holds whole units, about 100 statements at most. A request that breaks off leaves nothing half sent.
- **Sending twice is harmless.** Every row is `INSERT … ON CONFLICT (oid) DO NOTHING`. An op's `oid` is its own; a state row's is `<origin>:<n>`, where `origin` is a random id this file made the first time it synced.

Pictures go last, one request each, because they can be large. A picture the cloud refuses doesn't stop a round.

### Pull

For each account on this machine (`spaces()`), the pull asks for the next page of its space:

```sql
SELECT seq, oid, kind, key, origin, ts, body FROM edgy_log WHERE space = ? AND seq > ? ORDER BY seq LIMIT 500
```

`seq` is a number the cloud's single writer hands out in commit order, so a pull past a `seq` can never miss a row. The account's cursor is stored after each page. A page of 500 means there may be more, and the loop goes on. If the cloud has nothing at all for an account that has never synced, `markAll` marks everything the account owns as waiting to go.

Each row is applied on its own (`safely`). One that can't be applied here, because it clashes with something local, is skipped and counted (`skipped` in the status) and the rest still go in. And a row only ever changes what belongs to the account whose log it is in: a row naming another account's document, record or profile is ignored, whoever wrote it to the cloud.

## Documents: the cloud's order is the truth

The cloud stores the ops of a document in the order they reached it. A machine's view of a document is, therefore:

> the last **confirmed** state, then the confirmed ops in cloud order, then this machine's own ops that are not yet confirmed, replayed on top.

For each document, the store keeps the last state the cloud confirmed (`sync_docs.base_v`, `base_body`) next to the local one. `applyOps` in `sync.ts` handles the ops that came down for a document, in three cases.

**Already known.** Ops whose `oid` is already confirmed here (`confirmedOids`) are dropped. This is for a page pulled twice, after a crash for instance.

**Ours, in our order.** The common case: the rows are exactly this machine's next unconfirmed ops. They are *confirmed where they are*: the base moves forward and each op's `seq` is recorded. Nothing is rewritten and no browser needs to reload. (If replaying them turns out a conflict the local history didn't record, this case falls through to the rebuild below.)

**Someone else's came first.** Otherwise the base is rebuilt in cloud order, and this machine's unconfirmed ops go on top:

```ts
let cur = sd.base;
for (const r of rows) {                 // cloud order
  const a = attempt(cur, read(r).ops);  // one step; a conflict if it no longer applies
  cur = a.doc;
  entries.push({ v: cur.v, …, oid: r.oid, seq: r.seq, …(a.conflict ? { conflict: true } : {}) });
}
const base = cur;
for (const p of pending) {              // ours, not yet confirmed
  if (seen.has(p.oid)) continue;
  const a = attempt(cur, p.ops);
  cur = a.doc;
  entries.push({ v: cur.v, …, oid: p.oid, …(a.conflict ? { conflict: true } : {}) });
}
s.rewriteHistory(cur, sd.baseV, entries);   // the history after the base becomes these entries
s.setSyncDoc(docId, sd.space, base.v, base);
this.hooks.reset(docId, cur.v);             // every browser with it open loads it again
```

`rewriteHistory` replaces the local history after the confirmed base with the new order and the document with the result, in one transaction. The `reset` hook publishes a `reset` event, so open browsers fetch the document again (see [The browser session](/internals/session/)). The versions are positions in the history, so after this every machine has the same `v` for the same state.

### An example

Two machines, **A** and **B**, both at version 10, both offline. A sets **qty** to 3 (op `a1`). B sets **price** to 50 (op `b1`).

| Step | Cloud log | A's history | B's history |
| --- | --- | --- | --- |
| A comes online and pushes | `a1` | `a1` (confirmed) | `b1` (pending) |
| B pulls | `a1` | `a1` | `a1`, then `b1` (rebuilt: the cloud's first, ours on top) |
| B pushes | `a1`, `b1` | `a1` | `a1`, `b1` (confirmed) |
| A pulls | `a1`, `b1` | `a1`, `b1` (confirmed where they are) | `a1`, `b1` |

Both end with qty 3, price 50 and the same two entries at versions 11 and 12. Because ops are applied by cell id, two edits to different cells both survive. Edits to the *same property* resolve by order: the op that reaches the cloud last is applied last, everywhere, and wins.

### Conflicts

Some ops can't be replayed: A removed a cell that B then set a value on. In cloud order A's removal is first, and B's `set` has no cell to apply to. `attempt` catches the error and returns the document with only its version raised: the op is kept in the history as a **conflict** (`conflict: true` in the `ops` table and in [GET /api/docs/:id/log](<route:GET /api/docs/:id/log>)) and changes nothing.

An unconfirmed op that no longer applies after a pull is kept the same way, and is still sent, so that every machine records it as a conflict and shows the same history. Activity shows it as skipped. Nothing is lost silently, and no machine is left with a different document from the others.

## The rest of an account

These are last-writer-wins in cloud order, with one rule: **a change made here and not yet sent wins over what came before it.** If `sync_dirty` still has the thing, an incoming row for it is ignored (`dirtyFields`), and the local change goes up and becomes the newest.

- **Records** merge field by field. Different fields of the same record both survive; for the same field, the one that reaches the cloud last wins. Only the fields marked dirty are held back. A deleted record stays deleted (`sync_gone`), and clearing a collection deletes the records that machine had, so a record added elsewhere meanwhile survives.
- **Pins, archive, decks, links and access lists** are replaced whole.
- **Deleted documents stay deleted.** A late change to one is dropped.
- **Accounts.** A profile travels in the log, and also in `edgy_accounts` by email. That table is how sign-in on a new machine works: an email this machine doesn't know is looked up with `findAccount`, the password is checked against the hash stored there, and the account comes down with its id. A new password on one machine ends the sessions on the others when the profile arrives. Deleting an account marks its space for removal (`remove:<id>`), and the next round deletes it, leaving a single tombstone row so other machines learn it is gone.
- **Pictures.** A file is sent to `edgy_assets` and fetched by name the first time another machine needs it.

Not synced: sessions, API keys (credentials of one server), the messages between people and agents, and presence.

## The two clouds

Sync talks to the cloud through a small interface, so the code does not care which one it has.

```ts
export interface Cloud {
  /** Run statements in order, in one request. A statement that fails throws, with its message. */
  run(stmts: Stmt[]): Promise<Result[]>;
  /** Rows read and written so far, by this process. */
  readonly stats: { requests: number; rowsRead: number; rowsWritten: number };
}
```

**`HttpCloud`** is Turso over plain HTTP, using `fetch`: one JSON `POST` to `/v2/pipeline` (Hrana over HTTP) holding every statement of the batch and a `close`. There is no client library, because the protocol is that one request. A network failure, a timeout or a 5xx is `CloudDown`: try again later. A refusal of the credentials, a statement that fails or a request that is too large is an ordinary error, and the status is `error` (**Sync stopped**) instead of `offline`. It counts the rows each statement read and wrote, which is what Turso bills; `GET /api/sync` shows them.

**`LocalCloud`** runs the same SQL in a `node:sqlite` database, in memory or in a file. It exists for tests, and it can play an unreachable cloud: set `down` and every call throws `CloudDown`; set `failIf` and a request that matches breaks off before it runs. A test makes two `Store`s and one `LocalCloud` and calls `round()` on each in turn, which is two machines. `sync.test.ts` uses it for edits that travel both ways, edits made while the cloud is down, conflicting edits, records, deletions, and a first upload that breaks off midway.

## Status

`status(space?)` gives what the interface shows:

| `state` | The badge says | When |
| --- | --- | --- |
| `off` | **Sync off** | No cloud is configured. |
| `synced` | **Synced** | The last round worked and nothing is waiting. |
| `syncing` | **Syncing** | Changes are waiting (`pendingCount`) or going. Idle pulls don't count. |
| `offline` | **Offline** | The cloud didn't answer. |
| `error` | **Sync stopped** | The cloud answered, but something stopped the round. |

[GET /api/sync](<route:GET /api/sync>) returns it, with the time of the last success, the counts above and the number of conflicts and skipped rows.
