---
title: The HTTP API
nav: HTTP API
---

The HTTP API is how everything reaches a document: edgy's own pages, the [MCP server](/agents/mcp/) and any program that speaks JSON use the same routes. This page says who may call a route and then lists every route, with what it takes and what it answers.

The API is served at `http://127.0.0.1:8787` while you develop. Bodies and answers are JSON unless the route says otherwise. A mistake comes back as `{"error": "…"}` with a status that says what kind.

## Who is asking

Every request is first resolved to who is asking, and every route says who it needs. The first of these that the request carries decides:

1. **A share link:** the token in the `x-edgy-share` header, or in `?share=` where a header can't be sent, as on an event stream. The asker is a *guest* of that link's document.
2. **An API key:** `Authorization: Bearer edgy_…`. The asker is the key's person, acting as an agent. Only a token that starts with `edgy_` counts; any other `Authorization` header is ignored.
3. **A session:** the `edgy_session` cookie that [POST /api/auth/signin](route:POST /api/auth/signin) sets (`HttpOnly`, `SameSite=Lax`, kept for 30 days of use). The asker is that person, in the browser.
4. **Local mode:** no credential at all, but the request comes from this machine. The asker is the local account. A request that a proxy forwarded, or whose `Host` isn't a loopback name, doesn't count. See [Local mode and accounts mode](/start/install/#local-mode-and-accounts-mode).
5. **Nobody.** Every route but [GET /api/health](route:GET /api/health), [POST /api/auth/signup](route:POST /api/auth/signup) and [POST /api/auth/signin](route:POST /api/auth/signin) answers `401` and `{"error": "sign in first", "reason": "signin"}`.

An agent acts for its person: with their key it sees and changes what they can, and no more. The routes that change the profile or the password, delete the account, make, list or revoke keys, or sign out are the person's alone (reading [GET /api/me](route:GET /api/me) is open to a key); with a key they answer `403` and `an API key can not do that; sign in in the browser`. A key that is wrong gets `401` and `this API key is not valid; make one in your profile (Profile → API keys)`, or `this API key was revoked; make a new one in your profile`. See [API keys](/people/api-keys/).

::diagram access-model

### Roles and what you get told

On a document, a person is its owner, an editor or a viewer (see [Sharing with people](/people/sharing/)). A route says which it needs, and the answer tells you why not:

| Answer | When |
| --- | --- |
| `404` `no such document` | The document doesn't exist, or you have no access to it: edgy doesn't say which. A deck that isn't yours answers `no such deck`. |
| `403` `you can view this document, not change it` | You are a viewer and the route changes the document. |
| `403` `only its owner can do that` | The route needs the owner. |
| `403` `this link can view the document, not change it` | A guest with a view link on a route that changes. |
| `403` `this link does not reach that` | A guest on a route that links do not open, or on another document than their link's. A link opens its own document (reading it, its event stream, the answers of its fetch cells, and with an edit link its ops and fetching now) and the records it reaches. |
| `404` `this link does not open anything` | The share token doesn't exist. |
| `410` `this document is no longer shared` | The link was turned off. |

Errors from the guard carry a `reason`: `signin`, `forbidden`, `unknown` or `revoked`. The other statuses: `400` for a body that isn't right (`the request body is not valid JSON` or the route's own words), `422` for ops or an expression that don't apply, `409` for a clash, `413` and `415` for pictures, `429` for sign-ins that come too fast, `500` for `something went wrong on the server`.

### Writes from a page and the Origin check

A write made with the session cookie, or as local mode's account, must come from edgy's own pages, so that a page on another site can't make one. For `POST`, `PUT`, `PATCH` and `DELETE`, if the request has a `Sec-Fetch-Site` that isn't `same-origin` or `none`, or an `Origin` that isn't edgy's (the server's own, or the web app's), the answer is `403` and `a page on another site can not change edgy`.

A client that sends neither header, such as `curl` or a script, passes: it isn't a browser carrying someone's cookie. Requests with an API key or a share link are not checked, since neither is sent by the browser by itself.

## Every route

::ref routes

## Server and guide

::: route GET /api/health
Says whether the server is up and how it runs, and whether the asker is signed in, so that a signed-out page asks for nothing it would be refused.

```json
{"ok": true, "name": "edgy", "web": "http://localhost:5173", "auth": "local", "signedIn": true, "sync": false}
```

`web` is where people open edgy (the API's own address once the app is built); `auth` is `"local"` or `"accounts"`; `sync` says whether a cloud is set up.
:::

::: route GET /api/guide
Answers the agents' guide as plain text: the notation of every kind of cell, the language and its functions, events, ops, records, accounts and the library. It is what [edgy_guide](tool:edgy_guide) returns. Agents are given this text, not these pages.
:::

::: route GET /api/templates
Answers the starting documents as a list of `{id, title, about, root}`, where `root` is the template's notation. The id is what `template` takes in [POST /api/docs](route:POST /api/docs). See [Templates](/library/templates/).
:::

## Documents

::: route GET /api/docs
Lists the asker's own documents, newest change first, as summaries without their cells: `id`, `owner`, `title`, `description`, `v` (the version), `createdAt`, `updatedAt`, `pinned` (its place among the pinned, or `null`), `archivedAt`, `deck`, `shared` (`{view, edit, people}`: which links are on and how many people besides the owner may open it) and `shape` (a small map of its layout). Documents that others shared with you come from [GET /api/library?scope=shared](route:GET /api/library).
:::

::: route POST /api/docs
Makes a document owned by the asker.

```http
POST /api/docs
Authorization: Bearer edgy_…
Content-Type: application/json

{"title": "Quote", "root": ["col", ["input", {"name": "qty", "type": "number", "value": 2}]],
 "actor": {"kind": "agent", "name": "Claude"}}
```

`title` and `root` (the document's notation, see [Outline and notation](/agents/notation/)) are both optional, and so is `template`, the id of a starting document (one from [GET /api/templates](route:GET /api/templates), `tour`, or a tutorial such as `tutorial-quote`); `root` wins over a template's cells. Without any, the document is a single empty cell. The answer is `201` and the whole document, `{id, v, nextId, meta, root}`. When the document has content, that content is the first change in its history. An unknown template or a notation that doesn't build answers `422`.
:::

::: route GET /api/docs/:id
Answers the whole document as JSON: `{id, v, nextId, meta, root}`, where `root` is the tree of cells as they are stored. Viewers and guests get fetch cells without their addresses and headers; the owner and editors see them. A guest needs the share token.
:::

::: route GET /api/docs/:id/read
Answers a document the way an agent wants to see it: the outline, the values and the errors. [edgy_read](tool:edgy_read) calls it.

`?format=` is `outline` (the default), `notation` or `both`. `?agent=Claude` makes the document show that agent as reading it.

```json
{
  "id": "xebuqd2c", "title": "Quote", "v": 1, "meta": {"title": "Quote"},
  "outline": "\"Quote\" — doc xebuqd2c, version 1\nc1 col\n├─ …",
  "values": {"client": "Ada Lovelace", "qty": 2, "total": 80},
  "errors": {}
}
```

`values` has every named cell that has a value, `errors` every cell that shows an error (by name, else by id), and `notation` replaces or joins `outline` when asked for. The owner's reading sees all of their collections; anyone else's sees only those the document reaches. See [Outline and notation](/agents/notation/).
:::

::: route PATCH /api/docs/:id
Changes a document's title or description, and for its owner its place in the library. The body takes `title` (text), `description` (text or `null`), `pinned` and `archived` (true or false).

The title and the description are saved as [meta](op:meta) ops, so they are in the history and the people watching see them change; the answer is the document's summary, as in [GET /api/docs](route:GET /api/docs). Pinning and archiving belong to the owner (`only its owner can pin or archive it` for an editor). An archived document can't be pinned: restore it first (`409`).
:::

::: route DELETE /api/docs/:id
Deletes a document for good, with its history, its messages and its share links. Whoever has it open is told. The records it saved stay in their collections. The answer is `{"ok": true}`. Archive it instead if you may want it back: see [POST /api/library/bulk](route:POST /api/library/bulk).
:::

## Ops, evaluation and events

::: route POST /api/docs/:id/ops
Applies ops to a document, together or not at all, as the person or agent making the request. This is how a document is changed. The body is `{"ops": [["set", "qty", "value", 5]], "actor": {"kind": "agent", "name": "Claude"}}`; it can also hold `format`, `client` and `batch`.

The answer for an agent is the applied ops, the touched cells, and the document as [GET /api/docs/:id/read](route:GET /api/docs/:id/read) shows it. A person's browser gets `{v, ops, touched}` and nothing more. Everything about the ops, the actor and the answers is on [Ops](/agents/ops/#sending-ops).
:::

::: route GET /api/docs/:id/log
Lists the document's history, oldest first: one entry for each change, `{v, ts, actor, ops}`, with `conflict: true` on a change that [sync](/people/sync/) put after another machine's change that it no longer applies to.

`?since=` is the version after which to list (0 by default), and `?limit=` is how many of the newest entries to return (200 by default, 500 at most). The `actor` is `{kind, name, id?, for?}`: an agent acting for a person has `for` set to that person's name. Fetch cell addresses are left out of what viewers read. A link can not read the log.
:::

::: route POST /api/docs/:id/eval
Works out an expression against the document and changes nothing. [edgy_eval](tool:edgy_eval) calls it.

```http
POST /api/docs/xebuqd2c/eval
Content-Type: application/json

{"src": "(* qty 2)"}
```

The body takes `src`, the expression in the language's text syntax, or `expr`, the same as JSON, and optionally `cell`, the cell to work it out from (the root by default), which matters for relative references such as `(sib 1)`. The answer is `{"value": 10}`, or `{"error": "no cell called \"nope\""}` when it can't be worked out, with status 200 for both. Text that doesn't even read, like `(* qty`, answers `422` and `{"error": "missing )"}`. The records the expression sees are the owner's, in full; for anyone else only those the document reaches.
:::

::: route GET /api/docs/:id/events
Opens a stream of what happens to the document, as server-sent events: changes, messages, who is here, fetch answers and the server's handlers at work. The page keeps it open while the document is; an agent can too. A guest sends the token as `?share=`, since an event stream can't carry a header.

The query takes `client`, an id the page makes up for itself (up to 40 characters; with it, the server counts the page in when it decides whether timers and fetches should run) and `mode`, `edit` (the default), `live` or `page`. A viewer is always counted as `page`.

Each message is an `event:` line with the type and a `data:` line with the same JSON including `type`; an event named `ping` every ten seconds keeps the connection alive.

```text
event: ops
data: {"type":"ops","v":3,"ts":1791703954847,"actor":{"kind":"agent","name":"Claude","for":"You"},"ops":[["set","c3","value",4]],"touched":["c3"]}
```

| Type | What it carries |
| --- | --- |
| `hello` | `v`: the version, first thing on the stream. |
| `ops` | `v`, `ts`, `actor`, `ops`, `touched`, and the `client` and `batch` of the page that made them. |
| `message` | `message`: one line of the conversation. |
| `presence` | `actor` and `state`: `reading`, `editing`, `listening` or `idle`. What an agent is doing. |
| `people` | `people`: who has the document open (one entry for each person, with their `selected` cell and `mode`). |
| `data` | `collection`: a collection the document reads changed. |
| `compose` | `request`: a person asked **Ask AI** for code and an agent is listening. |
| `trace` | `trace`: handlers the server ran, and what they changed. Owner and editors only. |
| `fetch` | `cell` and `state`: a fetch cell started, answered or failed. |
| `deleted` | The document is gone. |
| `unshared` | `token`: a share link was turned off. |
| `access` | `role`: your role changed. |
| `revoked` | `why`: `access`, `signedout` or `deleted`. The stream then closes. |
| `reset` | `v`: the document was replaced by [sync](/people/sync/); read it again. |

A guest hears only `hello`, `ops`, `fetch`, `deleted` and `reset`, `data` for the collections the link reaches, and `unshared` for their own link. What happens on the stream in a browser is on [The event stream](/internals/event-stream/).
:::

::: route POST /api/docs/:id/viewer
Tells the server what one page of the document is doing: which of **Edit**, **Live** and **Page** it is in, and which cell is selected. Timers and fetches run on the server while anyone has the document open in **Live**; this is how it knows.

The body is `{"client": "tab-1", "mode": "live", "selected": "c3"}`; `selected` is optional. The answer is `{"live": true}`: whether anyone is in **Live** now. A page can only speak for its own client id (`403` and `that is not your tab` otherwise).
:::

## Messages and compose

These routes carry the conversation between a person and an agent, and the requests that [Ask AI](/editor/ask-ai/) hands to an agent.

::: route GET /api/docs/:id/messages
Lists the messages of a document's conversation, oldest first, as `{id, ts, actor, text, cell?}`. `?after=` gives only those with a bigger id.
:::

::: route POST /api/docs/:id/messages
Adds a message that shows in the **Activity** panel and goes out on the event stream. [edgy_say](tool:edgy_say) calls it.

```http
POST /api/docs/xebuqd2c/messages
Content-Type: application/json

{"text": "I set the quantity to 5.", "cell": "qty", "actor": {"kind": "agent", "name": "Claude"}}
```

`text` is required and is cut to 4000 characters; `cell` is the cell the message is about. The answer is `201` and the message.
:::

::: route GET /api/docs/:id/messages/wait
Holds the request open until the person writes, or a request for code arrives, and then answers. This is how an agent sits in a document. [edgy_listen](tool:edgy_listen) calls it.

`?after=` is the id of the last message seen, `?timeout=` the seconds to wait (1 to 120, 25 by default), and `?agent=` the name to show while waiting. If a message from a person, or a request, is already waiting, the answer is immediate. The answer is `{"messages": [...], "requests": [...]}`, both empty when the time ran out. Only messages from people are returned. While it waits, the document shows the agent as listening.

A request is `{id, prompt, cell?, cellName?, target, current?, ts}`; answer it with [POST /api/docs/:id/compose/:rid](route:POST /api/docs/:id/compose/:rid).
:::

::: route GET /api/ai
Says which helpers can answer **Ask AI** right now, so the page can choose.

```json
{"providers": {"claude": false, "agent": true, "local": true}, "model": null}
```

`claude` is true when the server has an `ANTHROPIC_API_KEY` and `EDGY_AI` isn't `off` (and `model` says which model); `agent` is true when an agent is listening on the document in `?doc=` (on any document when `doc` is left out), which it counts as for 30 seconds after its last wait ended; `local` is the built-in composer, which is always there.
:::

::: route POST /api/docs/:id/compose
Turns a sentence into code that fits the document. The helper that answers is Claude if the server has a key, then an agent that is listening (it has 45 seconds), then the built-in composer; `provider` in the body (`claude`, `agent` or `local`) tries that one first.

The body is `{"prompt": "what is left after 20 percent tax", "cell": "total", "target": "expr"}`. `prompt` is required (2000 characters); `cell` is the cell the code is for; `target` says what it is for and defaults to `expr`: `expr`, `do`, `hidden`, `style`, `options`, `compare`, `trend`, `action`, `events` or `on.<event>`; `current` is the code there now.

```json
{"code": "(* total 1.2)", "expr": ["*", "$total", 1.2], "explanation": "Adds 20% to total. It updates whenever total changes.", "provider": "local", "preview": {"value": 192, "display": "192"}}
```

For `events` the answer has `ops` and `changes` instead of one expression. `notes` says why another helper answered. Code that doesn't fit the document answers `422`, with `suggestions` when the built-in composer has some; a bad `target` or `provider` answers `400`.
:::

::: route POST /api/docs/:id/compose/:rid
An agent's answer to a request from [GET /api/docs/:id/messages/wait](route:GET /api/docs/:id/messages/wait). [edgy_answer](tool:edgy_answer) calls it.

The body is `{"code": "(* qty price 0.8)", "explanation": "…", "actor": {…}}`; for the target `events`, `code` is the list of ops. The code is checked against the document like any other: when it fails the answer is `422` with the reason, and the agent may answer again. When it passes, the answer is `{"ok": true}` and the person sees it. A request that was answered or timed out gives `404` and `no such request; it may have been answered or timed out`.
:::

## Library

::: route GET /api/library
Answers the home page's list: documents and decks, searched, filtered, sorted, pinned first. [edgy_docs](tool:edgy_docs) calls it.

The query takes `q` (words that all have to appear in the title, description or text; any case, accents ignored), `filter` (`all`, `pinned`, `shared`, `decks` or `archived`), `sort` (`updated`, `created` or `title`) and `scope` (`mine`, or `shared` for documents others gave you access to). A bad `filter` or `sort` answers `400` and names the choices.

```http
GET /api/library?q=quote&sort=title
```

The answer is `{pinned, rest, total, query, filter, sort, scope}`. `pinned` and `rest` hold cards: `{type: "doc", id, title, description, v, updatedAt, pinned, archivedAt, deck, shared, shape}` or `{type: "deck", id, title, description, docs, count, covers, …}`. A search adds `match: {field, snippet}` to a card to say where the words were found. In the shared scope a card has `ownerName` and your `role`. See [Library](/library/).
:::

::: route POST /api/library/pins
Sets the order of the pinned. The body is `{"ids": ["t6mggyig", "kfgqcxen"]}`: the ids given go first in that order, and pinned ones left out follow. It pins nothing new; use [POST /api/library/bulk](route:POST /api/library/bulk) for that. The answer is `{"pins": [...]}`.
:::

::: route POST /api/library/bulk
Does one thing to several of the asker's documents or decks: `{"action": "archive", "ids": ["kfgqcxen", "t6mggyig"]}`. The actions are `pin`, `unpin`, `archive`, `restore` and `delete`. Archiving takes a document out of the list without losing anything; `delete` is for good (for a deck it ungroups it).

The answer lists what happened: `{"action": "archive", "done": [...], "skipped": [...]}`. An id that isn't yours, or doesn't exist, is skipped, and so is an archived one you ask to `pin`. A bad action or body answers `400`.
:::

::: route GET /api/library/:id
Answers `{"entry": {...}}`: one document's card, or `{"entry": null}` when it isn't there or isn't yours to see. A page uses it to learn that a document is gone or archived before opening it. For someone else's document, the owner's arrangement (pins, archive, deck) is left out.
:::

## Decks

A deck groups documents in an order, played as slides. See [Decks](/library/decks/). A deck's id starts with `deck-`.

::: route GET /api/decks
Lists the asker's decks as `{id, owner, title, description, createdAt, updatedAt, pinned, archivedAt, docs}`, where `docs` is the ids of its documents in order.
:::

::: route POST /api/decks
Makes a deck of the asker's documents, in the order given.

```http
POST /api/decks
Content-Type: application/json

{"title": "Pitch", "description": "For Northwind", "docs": ["ndbgqcuy", "abbyehyo"]}
```

`docs` is required and can't be empty; `title` defaults to `Untitled deck`. The answer is `201` and the deck. A document that isn't yours answers `400` and `no document …`. A document that was in another deck moves to this one.
:::

::: route GET /api/decks/:id
Answers a deck and its documents' summaries in order: the deck's fields and `items`.
:::

::: route PATCH /api/decks/:id
Changes a deck. The body takes `title`, `description`, `docs`, `pinned` and `archived`. `docs` is all of the deck's documents in their new order: one you leave out is taken out of the deck, one you add joins it. The answer is the deck. An archived deck can't be pinned (`409`).
:::

::: route DELETE /api/decks/:id
Ungroups a deck: the deck goes and every document in it stays. The answer is `{"ok": true}`.
:::

::: route GET /api/decks/:id/export
Answers the deck as one `.html` file that works offline and plays the documents as slides, in the deck's order. Archived documents are left out. See [GET /api/docs/:id/export](route:GET /api/docs/:id/export) for the file.
:::

## Share links and export

A share link lets anyone open one document in **Live**, with no account. See [Share links](/library/share-links/).

::: route GET /api/shared
Tells the page a link opens what it opens. The asker is the link's guest, so the token goes in the `x-edgy-share` header. The answer is `{id, title, access}`. A link that doesn't exist or was turned off answers `200` and `{"refused": "unknown" | "revoked", "error": "…"}`, because "nothing any more" is an answer for this page and not a failure. A signed-in person who sends no token gets `400`.
:::

::: route GET /api/docs/:id/shares
Lists the links that are on for a document, as `{token, doc, access, createdAt, revokedAt, collections, url}`. `url` is the address people open (`…/s/<token>`); `collections` is the records the link reaches.
:::

::: route POST /api/docs/:id/shares
Turns a link on. The body is `{"access": "view"}` or `{"access": "edit"}` (`view` if left out). A link of that kind that is already on is returned as it is. The answer is `201` and the link, in the form above.

The link reaches the collections the document used when its owner last changed it, and no others.
:::

::: route DELETE /api/shares/:token
Turns a link off. Whoever has it open is told on their event stream, and the link then answers `410`. Only the document's owner may; the token of someone else's link answers `404` and `no such link`. The answer is the link, with `revokedAt` set.
:::

::: route GET /api/docs/:id/export
Answers the document as one self-contained `.html` file (`content-disposition: attachment`) that opens from disk with no server: layout, fonts, pictures and icons inside, formulas and buttons working, the records it reads as they are now. The header `x-edgy-missing-pictures` counts the pictures that could not be fetched. If the offline build isn't there the answer is `503` and `the offline build is missing; run npm run build`. See [Export](/library/export/).
:::

## People

These routes say who else may open a document. See [Sharing with people](/people/sharing/).

::: route GET /api/docs/:id/people
Lists who may open the document and who has it open now: `{people, present, role}`. Each person is `{id, name, email, color, role}`, the owner first; `present` is who has it open, with their selected cell; `role` is the asker's.
:::

::: route POST /api/docs/:id/people
Gives a person access by the email of their account, or changes their role. The body is `{"email": "ana@example.test", "role": "editor"}`; `role` is `viewer` (the default) or `editor`. The answer is `{"people": [...]}`.

Without an account with that email on this server the answer is `404` and `There is no account with that email on this server. Ask them to sign up first.` You can't give yourself access to your own document (`400`).
:::

::: route PATCH /api/docs/:id/people/:user
Changes the role of someone who has access: `{"role": "viewer"}` or `{"role": "editor"}`. The answer is `{"people": [...]}`. The owner's role can't be changed (`404`).
:::

::: route DELETE /api/docs/:id/people/:user
Takes a person's access away. The owner may do it for anyone; anyone else may do it only for themselves, which is how a person leaves a document shared with them. The owner can't leave their own document (`400`). The person's open streams are told they lost access. The answer is `{"people": [...]}`.
:::

## Data

Records live in named collections that belong to an account. Without `?doc=` a route works on the asker's own collections. With `?doc=<id>` it works through a document: the collections of that document's owner: all of them for the owner, only those the document reaches for anyone else. Viewers read, editors write, and a share link reaches its own document's collections the same way. See [Collections](/data/collections/).

::: route GET /api/data
Lists the collections as `[{name, count, updatedAt}]`. With `?doc=` it lists those the document may name: all of the owner's collections for the owner, those it reaches for anyone else. A document you can't open answers `404`.
:::

::: route GET /api/data/:name
Lists a collection's records, oldest first. Each record is its fields plus `id` and `at`, the time it was saved in milliseconds. A collection that doesn't exist is empty.
:::

::: route POST /api/data/:name
Adds a record.

```http
POST /api/data/quotes
Content-Type: application/json

{"record": {"client": "Ada Lovelace", "total": 80}}
```

The answer is `201` and the record with its new `id` and `at`: `{"client": "Ada Lovelace", "total": 80, "id": "rafgpwqg", "at": 1791704065247}`. A collection name uses letters, digits, `-` and `_` (60 at most). The body may also hold `source`, which is kept with the record to say where it came from.
:::

::: route PATCH /api/data/:name/:id
Merges fields into a record: `{"fields": {"total": 90}}`. The answer is the record. An id that isn't there answers `404` and `no record … in "…"`.
:::

::: route DELETE /api/data/:name/:id
Deletes one record. The answer is `{"ok": true}`, or `{"ok": false}` when there was no such record.
:::

::: route DELETE /api/data/:name
Empties a collection. The answer is `{"removed": 3}`: how many records went.
:::

## Fetch cells and demo fixtures

A [fetch](kind:fetch) cell gets JSON from an address; the server does the fetching, for everyone who has the document open in **Live**. See [Fetch cells](/events/fetch/).

::: route GET /api/docs/:id/fetched
Answers the state of every fetch cell, by cell id: whether it is loading, ready or failed, when it last answered, and the answer. Viewers and guests get the state without the address or what the handlers did with it.
:::

::: route POST /api/docs/:id/fetch/:cell
Fetches a fetch cell now, as **Retry** and `(refresh! rate)` do. `:cell` is the cell's id or name; anything that isn't a fetch cell answers `404` and `no fetch cell "…"`. The body `{"handlers": false}` skips the cell's `load` and `fail` handlers. The answer is the cell's new state.
:::

The next four routes answer the same way every time, so that fetch cells can be tried and tested without the network. They need only that the asker is signed in or has a link, and a fetch cell reading this server may call them too.

::: route GET /api/demo/rate
Answers an exchange rate, `{base: "EUR", quote: "RON", rate, at}`. The rate steps through 4.82, 5.07, 4.95, 5.21 and 4.88, one for each call, so a refreshing cell shows it move; `?rate=5.5` forces one.
:::

::: route GET /api/demo/slow
Answers after a wait: `{ok: true, waited, at}`. `?ms=` is the wait in milliseconds (1500 by default, 5000 at most). It shows a fetch cell in its loading state.
:::

::: route GET /api/demo/fail
Always answers `500` and `{"error": "the demo service is down"}`. It shows a fetch cell in its failed state and runs its `fail` handler.
:::

::: route GET /api/demo/weather
Answers `{city, temp: 17, sky: "clear", wind: 9}`; `?city=` names the city (`Cluj` by default).
:::

## Accounts and profile

The accounts routes are for the person in the browser. In local mode there is nothing to sign in to, but they work. See [Accounts](/people/accounts/).

::: route POST /api/auth/signup
Makes an account and signs it in. The body is `{"email": "ana@example.test", "password": "…", "name": "Ana Pop"}`; `name` defaults to the part of the email before the `@`. The answer is `201`, the profile in `{"user": {...}}` and a session cookie.

An email that isn't one answers `400` and `That is not an email address.`; a password under 8 characters, `A password needs at least 8 characters.`, and one over 200, `That password is longer than 200 characters.`; an email already used, `409` and `An account with this email already exists. Sign in instead.` A new account starts with a tour document.
:::

::: route POST /api/auth/signin
Signs in with `{"email": "…", "password": "…"}` and answers the profile in `{"user": {...}}` with a session cookie. A wrong email or password answers `401` and `Wrong email or password.`

Repeated failures slow the guesser down: after a few for the same email from the same address, a try answers `429` and `Too many tries. Wait 8 seconds and try again.`, with a `Retry-After` header and `wait` in the body, and the wait doubles up to five minutes.
:::

::: route POST /api/auth/signout
Ends this session and clears the cookie. The answer is `{"ok": true}`. It is for the browser's session; a key can't call it.
:::

::: route GET /api/me
Says who the asker is: `{user, via, auth}` with `key: {id, name}` when it is a key. `via` is `session`, `key` or `local`; `auth` is the server's mode. The `user` is the profile: `id`, `name`, `color`, `initials`, `email`, `theme`, `local`, `hasPassword`, `createdAt`. An agent calls it to learn whose key it holds.
:::

::: route PATCH /api/me
Changes the profile. The body takes `name` (not empty, 60 characters), `color` (`#rrggbb`), `theme` (`light`, `dark` or `null`) and `email`. The answer is `{"user": {...}}`. An email already used by another account answers `409`.
:::

::: route POST /api/me/password
Changes the password: `{"current": "…", "password": "…"}`. The person's other sessions end and this one stays; the answer is `{"ok": true, "signedOut": 2}`, with how many ended. A wrong `current` answers `403`. An account with no email has to be given one first (`400`).
:::

::: route DELETE /api/me
Deletes the account, with its documents, decks, records and keys. The body is `{"password": "…"}`, or, for an account that has none (local mode), `{"confirm": "<the account's name>"}`; otherwise `403`. The answer is `{"ok": true, "deleted": 4}`: how many documents went. What the person changed in other people's documents stays.
:::

## API keys

An API key lets an agent act for one person. The routes are for the person in the browser; a key can't make or list keys. See [API keys](/people/api-keys/).

::: route GET /api/me/keys
Lists the person's keys, newest last, without their secrets: `{id, userId, name, prefix, createdAt, lastUsedAt, revokedAt}`. `prefix` is the first characters of the key, so keys can be told apart.
:::

::: route POST /api/me/keys
Makes a key. The body may hold `name` (60 characters, `Agent` by default). The answer is `201` and the key's record with `key`, the secret itself: `edgy_` and 43 more characters.

```json
{"id": "kyneihpxug", "userId": "…", "name": "Claude", "prefix": "edgy_Qo8vza", "createdAt": 1791704000900, "lastUsedAt": null, "revokedAt": null, "key": "edgy_…"}
```

The secret is shown this once: edgy keeps only a digest of it and can't show it again.
:::

::: route DELETE /api/me/keys/:key
Revokes a key, by its `id`. Anything that uses it gets `401` from then on, and its open event streams end. The answer is the key's record with `revokedAt` set; an id that isn't the person's answers `404`.
:::

## Sync

Sync keeps this machine and a cloud database in step. See [Sync](/people/sync/).

::: route GET /api/sync
Says whether this machine's changes have reached the cloud. The answer is `{state, pending, lastSyncAt, error, …}`. `state` is `off` (no cloud is set up), `synced`, `syncing` (changes are waiting), `offline` (the cloud can't be reached) or `error`; `pending` counts the changes waiting. With a cloud the answer also holds `stats`, `conflicts` and `skipped`.
:::

::: route POST /api/sync
Syncs now and answers how it went, in the form above. With no cloud set up it answers the `off` state at once.
:::

## Pictures

::: route POST /api/assets
Uploads a picture for an [image](kind:image) cell. The body is the picture itself, and the `Content-Type` says what it is: PNG, JPEG, GIF, WebP, AVIF or SVG. The answer is `201` and `{"url": "/assets/<name>.<ext>"}`, where the name is a digest of the bytes, so the same picture uploaded twice is one file.

Another type answers `415` and `pictures can be PNG, JPEG, GIF, WebP, AVIF or SVG`; more than 8 MB, `413`. The address is served at `/assets/<name>.<ext>` to anyone who has it, with a header that stops an SVG from running script.
:::

Source: [app.ts](src:src/server/app.ts) (the routes), [access.ts](src:src/server/access.ts) (who may call what).
