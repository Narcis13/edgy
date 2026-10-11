---
title: The runner
---

The runner is what makes a document do things by itself: timers ticking, fetch cells getting their JSON, and the handlers those set off. This page describes how it decides when to run, how a timer and a fetch are scheduled, how a handler's changes are saved, and what a fetch is and is not allowed to reach.

It describes [runner.ts](src:src/server/runner.ts). It runs on the server, once per document, and only while at least one person has the document open in **Live**. Everything a person does with their own hands (a click, typing, a button) runs in their browser instead, in [the session](/internals/session/).

## Why on the server

A [timer](kind:timer) that ticks every minute must tick once a minute. If each open browser ran it, ten people would make ten ticks and ten saves, and a tab that went to sleep would stop it. So the server runs timers and fetches itself, whatever the number of viewers, and saves what their handlers change as ordinary versions of the document that everyone then receives. Live examples in these docs have no server, which is why timers don't tick in them and fetch cells have no network.

## Who is looking

The runner keeps, for each document, the tabs that have it open:

```ts
private viewers = new Map<string, Map<number, { client: string; mode: string }>>();
private live = new Map<string, Live>();   // documents that have a tab in Live
```

`join(doc, client, mode)` is called by the event stream when a tab connects (see [The event stream](/internals/event-stream/)), `mode(doc, client, mode)` when the tab switches between Edit, Live and Page, and `leave(doc, token)` when it goes. After each, `update(doc)` asks `isLive(doc)`: is any tab in `live`?

- If yes, and the document has no schedule yet, one is made and `sync(doc)` brings it in line with the document.
- If no, `stop(doc)` cancels every timer and every refresh of the document.

So the cost of a document is nothing while nobody is using it. A document open in Edit or Page, or only by viewers (whose streams count as `page`), runs nothing. Open it in Live and its timers start; close the last Live tab and they stop. A timer's count starts over from 1 each time, since the schedule is rebuilt.

`changed(doc)` is called after every saved change and runs `sync(doc)` again. It is how editing a timer's `every` while in Live takes effect at once.

## Timers

`sync(doc)` evaluates the document (with `evaluate`, so templated props are resolved) and walks it. For each [timer](kind:timer) cell it works out a key:

```ts
const key = JSON.stringify([c.every ?? null, c.after ?? null, c.value ?? null]);
```

A timer is skipped if its `value` is `false` (stopped) or it has neither `every` nor `after`. If the same cell already runs with the same key, nothing changes. If the key moved (it was edited, or `(start! t)` set its `value` to the time it started), the old schedule is cleared and a new one begins, which is why starting a running timer starts it over.

A timer with `every` becomes a `setInterval`, never faster than `MIN_TICK`, one second. One with `after` becomes a single `setTimeout`. When it fires, the runner raises the cell's `tick` event with `{ count, at }`:

```ts
this.apply(docId, { events: [{ cell: c.id, name: 'tick', data: { count: t.count, at: this.clock.now() } }] });
```

A one-off timer stays listed after it has fired so it doesn't fire again until it is changed or the document is reopened. Timers the document no longer has are cleared on the next `sync`.

The clock is injected: `Clock` has `now`, `setTimeout`, `setInterval` and their clears, `realClock` is the default, and tests pass a fake that they advance by hand. The same seam is how a test for "a minute passes" doesn't take a minute.

```notation title="A timer that counts minutes (timers don't tick in the docs' examples)"
["col",
  ["data", {"name": "minutes"}, 0],
  ["timer", {"name": "every-minute", "every": 60,
             "on": {"tick": ["set!", "minutes", ["+", "$minutes", 1]]}}]]
```

## Fetch cells

For each [fetch](kind:fetch) cell, `sync` takes its address from the evaluated props (so `{{templates}}` in the URL are filled in) and builds a key `[url, every, headers]`. A new or changed key starts a poll: with `every`, a `setInterval` of at least `MIN_REFRESH` (five seconds) that calls `refresh`. It also fetches now, unless an answer for the same address is fresh, meaning ready, for this url, and younger than `every` (or a minute with no `every`).

`refresh(doc, cell, handlers = true)` does the work, and calls for the same cell share one request. If a second caller wanted `load` or `fail` handlers and the request had been started without them, they run once at the end.

`fetchNow` goes in these steps:

1. Mark the cell `loading` in memory and publish it.
2. Get the JSON (below).
3. Store `ready` with the data, or `failed` with the message (keeping the last good data), and publish a `fetch` event.
4. If handlers are wanted *and someone is still in Live*, run `load` or `fail` through `apply()`, with the value change for `change` handlers worked out by comparing the answer to the one before.

A fetch's state is not in the document. It is held in a `Map` in the runner, so a restart forgets it and the next time someone goes Live it is fetched again. The engine sees it through `World.fetched`, and [GET /api/docs/:id/fetched](<route:GET /api/docs/:id/fetched>) gives it to browsers and agents. If the address changes while a request is in flight, `recheck` fetches the new one when the old finishes.

```notation title="A fetch cell with a load handler (fetch cells have no network in the docs' examples)"
["col",
  ["data", {"name": "latest"}, 0],
  ["fetch", {"name": "rate", "every": 60,
             "on": {"load": ["set!", "latest", ["get", "$data", "rate"]]}}, "/api/demo/rate"]]
```

### What a fetch may reach

`getJson` is the only place the server makes an outward request on a document's behalf, so it is strict.

- **A path on this server** (starting with `/`) is allowed only if it matches `LOCAL_PATHS`: `/api/data/<collection>` or `/api/demo/…`. It is answered in process, by the app itself, as the document, never over the network (see [Access](/internals/access/)).
- **An address elsewhere** must be `http:` or `https:`. `getGuarded` looks up the host and refuses it if *any* answer is a private, loopback, link-local, carrier-grade NAT, multicast or other special address, including IPv6 forms that wrap an IPv4 one (`isPrivateAddress`). The connection is then made to the address it checked, never to a second DNS answer, so a host that answers differently the second time gets nowhere. At most three redirects are followed. The document's headers go only to the origin it named, not to wherever a redirect points.
- **Limits.** Ten seconds (`LIMITS.ms`), one megabyte (`LIMITS.bytes`), and the answer must parse as JSON. A status outside 200 to 299 is a failure with `the server answered 500` and the answer's own `error` text if it has one.
- **Secrets.** A header value `secret:NAME` is replaced by the server's `EDGY_SECRET_NAME` environment variable, never stored in a document. It is sent only if the document belongs to the server's owner and its owner approved that exact cell, origin and secret: an editor who points the cell somewhere else sends nothing. The approval is `trusted` in [Storage](/internals/storage/); the rule is `DocData.secret` in [app.ts](src:src/server/app.ts).

## Saving what a handler did

When an event fires, `apply(docId, start, from?)` runs the reaction and saves it:

1. `react(stored, world, start, now)` from [events.ts](src:src/core/events.ts) runs the handlers, in order, each seeing what the one before changed. The result has the ops they made, the effects they asked for, and a trace.
2. If there are ops, they are applied to the *stored* document with `applyOps`, the version goes up by one, and `Store.saveDoc` writes it with the actor `Events` (`{ kind: 'agent', name: 'Events' }`). It is **one version for the whole reaction**, whatever the number of handlers. An `ops` event is published, so every browser applies it the way it applies anyone's change.
3. Effects are carried out: a record to insert, update, delete or clear goes through `DocData.write`, which checks that the document reaches that collection and tells open documents the collection changed; a `refresh` calls `refresh()`.
4. The trace is published as a `trace` event. Browsers add it to Activity, marked as run by the server.
5. `changed(doc)` brings the schedule in line with what the handlers changed.

If saving fails (the ops no longer apply), a trace entry named `save` carries the error, instead of nothing.

A handler that errors stops there and is shown in the trace; the other handlers still run. A loop of handlers setting each other off is ended by `MAX_DEPTH` (8) and `MAX_RUNS` (64) in `react`.

## An agent's change

An agent changes a document through [POST /api/docs/:id/ops](<route:POST /api/docs/:id/ops>), not through a browser. Nothing has run the handlers for it, so after saving, the route calls `runner.agentChanged(docId, before, ops)`, but only when the actor is an agent and the request has no `client`. If someone is in Live, `apply` runs the handlers that change sets off, with `from` set to the document before it (the agent's ops are already saved). A change that came with a `client` is a browser's, which ran its own handlers, so the server does not run them again.

Without anyone in Live, nothing happens: handlers are about people using the document.

## What is in the file and what is not

| Part | Where it lives |
| --- | --- |
| Timers and polls | In memory, rebuilt from the document each time someone enters Live. |
| Fetch states | In memory, per document and cell. |
| What a handler changed | In the document and its op log, as the actor `Events`. |
| Records a handler saved | In `records`, for the document's owner. |

Nothing the runner needs survives a restart except the document. That is on purpose: the document says what should happen, and the runner can always work out from it what is scheduled.
