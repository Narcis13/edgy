---
title: Architecture
---

This page covers how edgy is put together: the four parts of the source, how they talk to each other, and the path one change takes from a keystroke to the other browsers and the cloud log. Each page after this one takes a piece of that path and describes the files that do it.

It describes the layout of `src/`, following [app.ts](src:src/server/app.ts), [session.ts](src:src/web/session.ts), [ops.ts](src:src/core/ops.ts) and [tools.ts](src:src/mcp/tools.ts).

## The four parts

| Folder | What it is | Depends on |
| --- | --- | --- |
| `src/core` | The model and the language: [types.ts](src:src/core/types.ts), [ops.ts](src:src/core/ops.ts), [tree.ts](src:src/core/tree.ts), [engine.ts](src:src/core/engine.ts), [sx.ts](src:src/core/sx.ts), [notation.ts](src:src/core/notation.ts), [events.ts](src:src/core/events.ts). Plain TypeScript with no framework and no Node-only imports. | Nothing. |
| `src/server` | Hono on Node: the HTTP API ([app.ts](src:src/server/app.ts)), SQLite storage ([store.ts](src:src/server/store.ts)), live events ([hub.ts](src:src/server/hub.ts)), timers and fetches ([runner.ts](src:src/server/runner.ts)), who may do what ([access.ts](src:src/server/access.ts)), sync ([sync.ts](src:src/server/sync.ts)), export and compose. | `core` |
| `src/mcp` | The MCP server for agents. Each [tool](tool:edgy_read) calls the HTTP API with the person's [API key](term:api-key). It holds no document state. | The HTTP API |
| `src/web` | React and Vite: the editor, the library, the data page, the Page view. [session.ts](src:src/web/session.ts) is the one open document. | `core`, the HTTP API |

The point of `core` is that the same functions run everywhere. The browser applies an op with the `applyOp` the server uses to confirm it. The server evaluates a document with the `evaluate` the browser uses to draw it. The docs you are reading run their `sx` examples with the same interpreter, and the exported `.html` files carry it inside. Because `core` has no dependencies, there is exactly one definition of what an op does and what a formula means.

## How the parts talk

They talk in three ways, and only three.

- **HTTP.** The browser and the agents call the same routes. A route says what it needs before its handler runs (see [Access](/internals/access/)).
- **One event stream per open document.** The server pushes what happened (ops, records, presence, fetch answers) over server-sent events. See [The event stream](/internals/event-stream/).
- **Ops.** A change to a document is always an [op](term:op): a small JSON list that `applyOp` applies as a pure function. Nothing else changes a document, whether a person made the change, an agent, a handler or a pull from the cloud.

The server never calls into the browser, and `core` never calls out. Everything that changes over time (the clock, saved records, a fetch cell's answer) reaches `core` through the `World` object you pass to `evaluate` (see [The engine](/internals/engine/)).

## One request's path

Take someone typing `3` into the **qty** input of a [quote](template:quote) in Live.

1. The input cell calls `session.dispatch(["set", "c4", "value", 3], { key })` in [session.ts](src:src/web/session.ts). Because the document is in Live, `react()` first works out which handlers the change sets off and adds their ops to the same list.
2. `applyOps` runs here, in the browser. The screen shows the new document at once; this is the optimistic copy. The inverse op is pushed on the undo stack. The ops join a *pending* batch.
3. `flush()` sends the batch: [POST /api/docs/:id/ops](<route:POST /api/docs/:id/ops>) with the ops, the browser's `client` id and a `batch` id.
4. On the server, the middleware in `createApp` works out who is asking, and the route's `need({ doc: 'edit', link: 'edit' })` guard checks they may change this document.
5. `change()` in [app.ts](src:src/server/app.ts) runs `applyOps` again on the stored document. This is the authority: if the ops don't apply, the caller gets a 422 and nothing is saved. Otherwise the version goes up by one, and `Store.saveDoc` writes the new body and one row of the op log in a single transaction.
6. The hub publishes an `ops` event with the new version, the actor, the ops as applied, the cells they touched and the sender's `client` and `batch`. `runner.changed()` brings timers and fetches in line with the new document.
7. Every browser with the document open receives the event. The sender sees its own `batch` come back and drops it from its pending queue. Everyone else applies the ops to their confirmed copy, then rebases whatever they still have in flight on top.
8. In parallel, `saveDoc` has told the sync engine something changed. When sync is on, it pushes the op to the cloud log about 300 ms later, and other machines pull it on their next round (see [Sync](/internals/sync/)).

::diagram op-life

The order matters. The browser shows the change before the server has seen it, the server's answer is what makes it real, and the stream carries the same ops to everyone, including the sender. The sender's own ops are recognised by their `batch` id and not applied twice.

## What is not in that path

Some work never goes through a browser's session:

- **Timers and fetch cells** run on the server, once per document, while someone has it open in Live. Their handlers' changes are saved as a version by the actor `Events`. See [The runner](/internals/runner/).
- **Agents** send ops over HTTP like the browser. If an agent changes a document while someone is in Live, the server runs the handlers that change sets off.
- **Export and the docs' live examples** use the same `core` and `Session` with a different transport, a stand-in for the server. See [Export](/internals/export/). **Printing** is the Page view, a different way to draw the same document; see [Pagination](/internals/pagination/).

## The pages in this section

::ref pages internals/model/
::ref pages internals/ops/
::ref pages internals/normalize/
::ref pages internals/engine/
::ref pages internals/interpreter/
::ref pages internals/notation/
::ref pages internals/session/
::ref pages internals/event-stream/
::ref pages internals/storage/
::ref pages internals/runner/
::ref pages internals/access/
::ref pages internals/sync/
::ref pages internals/export/
::ref pages internals/pagination/
::ref pages internals/compose/

To change edgy itself, read [Contributing](/contributing/), which lists the gates a change passes and the places each kind of change touches.
