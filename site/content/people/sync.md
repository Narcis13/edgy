---
title: Sync between machines
nav: Sync
---

Sync keeps the file edgy works in on one machine and a cloud database in step, so your account finds the same documents, history and records on another machine; this page covers setting it up, the badge, working offline and how conflicts are settled.

Without sync, everything stays in one file on one machine (`data/edgy.db`). With sync, that file stays your working copy, and edgy also sends what changes to a [Turso](https://turso.tech) database and brings back what other machines sent. Nothing about how you work changes: editing, [Live](term:view) and search all use the local file, so they are as quick offline as online.

::diagram sync-logs

## Setting it up

You need a Turso database: its URL, and a token that can write to it. Put them in a `.env` file at the root of the project (it is in `.gitignore`; never commit it):

```text
TURSO_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=…
```

Then start edgy with:

```bash
npm run dev:sync
```

`npm run dev:sync` is `npm run dev` with `.env` loaded. Plain `npm run dev` does not read `.env`, so a file you use only locally never syncs by surprise. You can also set the two variables in the server's environment any other way. When either is missing, edgy stays local and says so in the top bar: **Sync off**.

Do the same on each machine, with the same database, and sign in on it with the same email and password. The account comes down from the cloud with its documents (see [Signing in on a new machine](#signing-in-on-a-new-machine)).

Two more variables are optional: `EDGY_SYNC_INTERVAL`, how often a machine asks the cloud for news, in milliseconds (3000 by default).

## The badge

A small badge in the top bar of the library and of every document says where sync stands. A click syncs now.

| Badge | Means |
| --- | --- |
| **Synced** | Every change made here is in the cloud. |
| **Syncing** with a number | That many changes are on their way. |
| **Offline** with a number | The cloud can't be reached. Your changes wait here and go when it answers. |
| **Sync stopped** | The cloud answered but refused something. Changes stay here; point at the badge for what it said, and click to try again. |
| **Sync off** | No cloud is set up: this machine only. |

On a phone only the icon shows; point at it, or open it, for the words.

## What a round does

A change is sent a moment after you make it (about 300 milliseconds). Every few seconds each machine also asks the cloud only for what is new since last time, using an index, so an idle machine reads one row and writes none. While the cloud can't be reached, a machine tries every 30 seconds instead.

## What syncs

Everything an account owns:

- **Documents**, with their whole history (every [op](term:op)), and deletions.
- **Records** in its [collections](term:collection).
- **Library state**: pins and their order, the archive, and decks with the documents in them.
- **Sharing**: [share links](/library/share-links/) and who has access to a document.
- **The profile**: name, colour, theme, email and password (so you can sign in on another machine).
- **Pictures** you uploaded, fetched from the cloud by name when a machine first needs one.

Not synced: sessions (you sign in on each machine), [API keys](/people/api-keys/) (a key belongs to the server it was made on), the messages you leave for agents, and [presence](/people/presence/).

A machine syncs every account that exists on it. Deleting an account deletes its space in the cloud.

## Working offline

Edit as usual. Everything you do is saved to the local file and queued; the badge shows **Offline** with how many changes wait. When the cloud answers, they go up and the other machines' changes come down, and the badge goes back to **Synced**. Your own browser tab also keeps working if the server restarts; it queues changes and shows **Offline, will retry** until it reconnects.

If you edit the same document on two machines while one is cut off, the next section says what happens.

## When two machines disagree

The cloud's order is the truth. Every change is an [op](term:op), and each one gets a place in one order, the order in which it **reaches the cloud**. When a machine syncs, the document becomes: the last state the cloud confirmed, then the confirmed ops in the cloud's order, then your own ops that haven't been confirmed, played again on top. Every machine ends with the same ops in the same order, so the histories on all of them are identical.

Three cases follow from that.

**Different cells: both changes stay.** Ana, offline on her laptop, changes the cell named `note`. Ben, on his desktop, changes the cell named `price`. When she reconnects both are in the order, neither undoes the other, and both machines show both changes.

**The same cell: the last to reach the cloud wins.** Ana changes `price` to 90 offline. Ben, meanwhile, changes `price` to 95, and his change reaches the cloud first. When Ana reconnects, her change reaches the cloud after his, so it is applied after his: the price is 90 on both machines. Ben's change is not lost; it is in the history, overwritten by a change that came later.

**A change that no longer applies: skipped.** Ben removes the cell `note` while Ana, offline, edits it. When she reconnects, her edit has nothing to apply to. It is kept in the history and marked a **conflict**; it changes nothing, on every machine. [Activity](/editor/activity/) shows it as *skipped: conflict, changed nothing*, so everyone can see what happened.

Other things follow the same rule:

| Thing | When two machines changed it |
| --- | --- |
| A document deleted on one machine | Stays deleted; later edits to it are dropped. |
| A record | Merges field by field. Different fields both stay; for the same field, the last to reach the cloud wins. A deleted record stays deleted. |
| Clearing a collection | Deletes the records that machine had; a record added on another machine meanwhile survives. |
| Pins, archive, a deck's contents, links, who has access | The last to reach the cloud wins, item by item. |

> [!NOTE]
> “Last” means last to reach the cloud, not last to be typed. A change made earlier on a machine that stayed offline longer can win over one made later on a machine that was online.

## Signing in on a new machine

On a machine that has never seen your account, sign in with your email and password. edgy asks the cloud for that email, checks the password against the one stored there, and brings the account down with its documents. This waits for the first pull to finish (up to ten seconds, then it carries on and finishes in the background). The cloud must be reachable: a machine can't sign in an account it has never seen while it is offline.

Signing up on a second machine with an email the cloud already knows is refused (*An account with this email already exists. Sign in instead.*), so one email is one account everywhere. When you change your password on one machine, your sessions on the others end once the change arrives.

If a machine is pointed at a different database from the one it last synced with, edgy notices and starts over: everything on the machine goes up, and what the new cloud holds comes down.

## For developers

`GET /api/sync` and `POST /api/sync` (sync now) are what the badge uses. The status holds the state, the number of waiting changes, the time of the last sync, counts of requests, rows read and written, and `conflicts` and `skipped` (rows from the cloud that could not be applied here).

| Route | For |
| --- | --- |
| [GET /api/sync](route:GET /api/sync) | The sync status |
| [POST /api/sync](route:POST /api/sync) | Sync now |

The cloud is one append-only log per account, written with plain HTTP requests to Turso, so there is no extra dependency; a push is idempotent, so sending twice never duplicates. The engine is [sync.ts](src:src/server/sync.ts), the cloud client is [cloud.ts](src:src/server/cloud.ts), and the badge is [SyncBadge.tsx](src:src/web/sync/SyncBadge.tsx). For more, see [how sync works](/internals/sync/).
