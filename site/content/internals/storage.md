---
title: Storage
---

Everything edgy remembers is in one SQLite file, plus a folder of uploaded pictures. This page describes the `Store` class that wraps the file, its tables, how a document and its op log are saved together, how the schema is versioned and migrated with `user_version`, how records and collections are kept, and where assets live.

It describes [store.ts](src:src/server/store.ts). It runs on Node's built-in `node:sqlite` (`DatabaseSync`), so there is no database server and no native module to install. The server opens it in [index.ts](src:src/server/index.ts) as `join(dataDir, 'edgy.db')`, where `dataDir` is `EDGY_DATA` or `./data`.

## One file, JSON in the columns

The store's header comment is the map:

| Table | What it holds |
| --- | --- |
| `docs` | The current state of each document, and what the library shows of it. |
| `ops` | The append-only history of what changed, by whom. |
| `records` | Rows ([records](term:record)) saved from documents into named [collections](term:collection). |
| `messages` | The conversation between people and agents on a document. |
| `decks`, `deck_docs` | Ordered sets of documents that play as slides. A document is in at most one. |
| `shares` | [Share links](term:share-link): "view" or "edit", and the collections they may reach. |
| `users`, `sessions`, `api_keys`, `doc_access` | Accounts, signed-in browsers, agents' keys, and who else may open a document. |
| `sync_docs`, `sync_spaces`, `sync_meta`, `sync_dirty`, `sync_gone`, `sync_assets` | What the cloud has confirmed and what is still to send. See [Sync](/internals/sync/). |

Every payload is JSON in a text column (`body`, `actor`, `ops`, `data`) and the columns around it are what the store needs to look things up. A document is not split into rows; the whole `Doc` from [the model](/internals/model/) is one `body`. That is deliberate: the document is always read and written whole, and a row per cell would only add a way for the tree and the table to disagree.

The file runs with `PRAGMA journal_mode = WAL`, so readers don't wait for the writer.

## docs and the op log

A document has two homes that are written together: its current state in `docs.body`, and the change that produced it in `ops`.

```ts
saveDoc(doc: Doc, actor: Actor, ops: Op[]): number
```

`saveDoc` opens a transaction and, in it:

1. `UPDATE docs` with the new `body`, the new `v` and `updated_at`, and the library's derived columns.
2. `INSERT INTO ops (doc_id, v, ts, actor, ops, oid)` with the same `v`.

Then it commits, replaces the document in the cache, and calls `onChange` so the sync engine knows. If either statement fails, neither happened. There is never a document at version 15 without its version-15 entry in the log, nor the reverse.

One row of `ops` is one *saved batch*, not one op: the `ops` column holds the list that `change()` in [app.ts](src:src/server/app.ts) saved, as applied (see [Applying ops](/internals/ops/)). A row looks like this:

```text
doc_id    k3m9x2qa
v         15                      primary key with doc_id
ts        1791709200000
actor     {"kind":"human","name":"Ada Lovelace","id":"u4kd8m2xq"}
ops       [["set","c4","value",3]]
oid       Qm3x9aTb2kLw            a unique id, so sync can name this exact entry
seq       NULL                    where the cloud ordered it, once it has
conflict  0                       1 when sync found it no longer applied
```

`(doc_id, v)` is the primary key. The version `v` is the one the document had after the batch, so the log is a complete, ordered history: start from an empty document, apply each row's `ops` in order, and you have `docs.body`. `GET /api/docs/:id/log` reads it (`log(docId, since, limit)`); sync pushes it; Activity shows it.

`docs` also keeps columns that are not the document, because other pages need them without parsing every body:

- `title`, `description`, `text` and `shape`. The library searches `text` (the words in the document) and draws `shape` (a small map of the cells). `derived(doc)` recomputes all three on each save from [library.ts](src:src/core/library.ts), so they are never stale.
- `owner`, `pinned`, `archived_at`: whose it is, and the owner's arrangement of the library.
- `reaches` and `trusted`: the collections the document's owner let it use, and which fetch cell may send which secret where. See [Access](/internals/access/).

### The cache

`getDoc(id)` returns a parsed `Doc` from a `Map` in memory, reading the row only the first time. `saveDoc`, `createDoc` and the sync functions update the map. The cache assumes one server process owns the file. A second process writing to it would not invalidate the first's cache.

### Why saves don't need locks

`DatabaseSync` is synchronous, and Node runs one JavaScript function at a time. In the ops route, the handler reads the document only after the request body has arrived and then applies, saves and publishes without ever yielding. Two requests for the same document are therefore strictly ordered, and each starts from the document the previous one saved. A timer's change that the runner saves in between is part of the base too. The comment in the route says so: "Read the document after the body has arrived, so a change saved meanwhile (a timer's) is the base."

## The schema version

SQLite keeps a number in the file header, `user_version`. The store uses it as the schema's version, and `SCHEMA` is the version this code writes:

```ts
/** The schema this code writes. 1: docs, ops, records, messages. 2: the library. 3: the collections a link reaches. 4: accounts. 5: sync. 6: secrets a document's owner approved. */
export const SCHEMA = 6;
```

The constructor first runs `CREATE TABLE IF NOT EXISTS` for version 1's tables, then `migrate()`:

1. Read `user_version`. If it is already `SCHEMA` or newer, stop. A file from a newer edgy is opened as it is and never downgraded.
2. `BEGIN`.
3. For each step the file lacks, run it: `toLibrary` (2), a column for the collections a link reaches (3), `toAccounts` (4), `toSync` (5), `toTrusted` (6).
4. Set `user_version` to `SCHEMA`, `COMMIT`. If anything threw, `ROLLBACK` and rethrow, so the file is exactly as it was and the server doesn't start on a half-migrated database.

A step only ever adds: new tables with `IF NOT EXISTS`, new columns after asking `PRAGMA table_info` whether they are there (`columns()`), new indexes. It never drops, renames or rewrites a body. Two steps fill in derived data from what is already stored: version 2 computes each document's library columns from its body, and version 4 turns what each document's links reached into what the document reaches.

Version 4 adds an `owner` column to `docs`, `decks` and `records` and leaves it empty until the first account is created, which then claims everything that has no owner (`claimOrphans`). That is how an installation from before accounts becomes the first account's.

To change the schema, add a step, raise `SCHEMA`, and make the step safe to run on a file that has some of its changes already. [Adding things](/contributing/checklists/) lists the other places a change like that touches.

## Records and collections

A record is a row of `records`:

```text
id          r4xk2q9      'r' + 7 random characters
collection  orders
data        {"client":"Ada Lovelace","total":1840}
ts          1791709200000
source      {"doc":"k3m9x2qa","cell":"c7"}    what saved it, or NULL
owner       u4kd8m2xq
```

The fields live in `data`; `id` and `at` (the `ts`) are added when a row is read (`rows(owner, collection)`), in the order they were saved. A record can't set its own `id` or `at`: `insert` and `update` strip them. `update` merges fields into the existing `data`; it can't remove one.

Every collection belongs to an account: the key is `(owner, collection)`, and two people's `orders` are two collections. The store never takes a collection name alone. Whether a request may reach a collection is decided in [Access](/internals/access/); the store only does what it is told for the owner it is given.

Each write to `records` also marks the record as changed for sync (`dirty('record', id, owner)`). An `update` passes the names of the fields it touched, so the cloud receives a change to those fields and not to the whole record.

## Assets

Pictures are not in SQLite. [POST /api/assets](<route:POST /api/assets>) takes the raw image, checks its type (PNG, JPEG, GIF, WebP, AVIF or SVG) and size (8 MB), and writes it to `<EDGY_DATA>/assets/` under a name made from its content:

```text
/assets/9f2b6c1e4a7d3b58f0c2.png      sha256 of the bytes, first 20 hex digits, then the extension
```

Uploading the same picture twice makes one file. The name is the permission: `GET /assets/:file` is not behind a `need`, and anyone who has the address can load it, with `cache-control: immutable` and a content-security-policy that stops an uploaded SVG from running script if someone opens it directly. With sync on, a new file is recorded in `sync_assets` until the cloud has it, and a file missing here is fetched from the cloud once when first asked for.

## Deleting

`deleteDoc` removes a document, its history, messages, links, place in a deck and access list in one transaction, and renumbers the owner's pins. Records stay: they belong to a collection, not to a document. It also writes a tombstone to `sync_gone`, so a late change from another machine doesn't bring the document back.
