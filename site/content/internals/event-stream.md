---
title: The event stream
---

Everything that happens to an open document reaches its browsers over one server-sent event stream per tab. This page describes the hub that fans events out, the stream route, every event it carries, and who is allowed to hear which.

It describes [hub.ts](src:src/server/hub.ts), the `events` route in [app.ts](src:src/server/app.ts) and `guestHears` in [access.ts](src:src/server/access.ts). The other end is [The browser session](/internals/session/).

## The hub

```ts
export class Hub {
  subscribe(docId: string, fn: Listener): () => void
  publish(docId: string, e: DocEvent): void
  roomIds(): string[]
  listen(docId: string): () => void
  listening(docId?: string): boolean
  waitFor(docId: string, match: (e: DocEvent) => boolean, ms: number, signal?: AbortSignal): Promise<DocEvent | null>
}
```

A `Hub` keeps a *room* per document: a set of listener functions. `publish(docId, event)` calls every function in the room, synchronously, on a copy of the set so a listener that unsubscribes while it runs is safe. A room exists only while someone is in it. `roomIds()` says which documents someone is watching now; the server uses it to tell only the open documents of an owner that a collection changed.

There is one hub for the server. It has no memory: an event published when nobody is listening is gone, and there is no replay. A browser that missed something catches up by asking for the document again (see `resync` in [The browser session](/internals/session/)), not by asking the hub.

The hub also does two small jobs for agents. `listen(docId)` marks "an agent is waiting here" and `listening()` is true while one waits and for 30 seconds after (an agent loops on [edgy_listen](tool:edgy_listen)). `waitFor` resolves with the first event that matches, or `null` after a timeout; it is what [GET /api/docs/:id/messages/wait](<route:GET /api/docs/:id/messages/wait>) is built on.

## The stream route

`GET /api/docs/:id/events` is declared `need({ doc: 'view', link: 'view' })`: a viewer, an editor, the owner, or a guest with any share link may listen. Its query:

| Query | What it is |
| --- | --- |
| `client` | The tab's id (the session's `client`). Without it the stream still works, but the tab isn't counted as being in Live. |
| `mode` | `edit`, `live` or `page`: what this tab is doing. A viewer, or a guest with a view link, is always counted as `page`. |
| `share` | A share link's token, because an `EventSource` can't send a header. |

The route answers with `streamSSE` and then, for as long as the connection lasts:

1. Subscribes the stream to the document's room, behind the filters below.
2. Registers the tab with the runner (`runner.join(id, client, mode)`) so timers and fetches run while anyone is in Live. See [The runner](/internals/runner/).
3. Writes `hello` with the document's current version.
4. Announces who is present.
5. Sleeps ten seconds, checks that a signed-in session hasn't expired, writes a `ping` and sleeps again.

On the wire each event is a standard frame whose `event:` is the event's type and whose `data:` is the event as JSON:

```text
event: hello
data: {"type":"hello","v":14}

event: ops
data: {"type":"ops","v":15,"ts":1791709200000,"actor":{"kind":"human","name":"Ada Lovelace","id":"u4kd8m2xq"},"ops":[["set","c4","value",3]],"touched":["c4"],"client":"x7k2m9qa","batch":"p3n8d1ze"}

event: ping
data: {}
```

Frames have no `id:`, so the browser's automatic reconnection cannot ask for what it missed. It reconnects to the same address on its own, and the session's `hello` handler compares versions and resyncs if they differ.

When the connection closes (`stream.onAbort`), the stream leaves the room, the runner is told, and everyone else is sent a new list of who is present.

## The events

`DocEvent` is the union of every event the hub carries. `ping` is not in it: the route writes that one itself.

| Event | Published when | By |
| --- | --- | --- |
| `hello` | The stream opens. Carries the current version `v`. | The route. |
| `ops` | A batch of ops was saved. Carries `v`, `ts`, the `actor`, the `ops` as applied, the `touched` cell ids and the sender's `client` and `batch`. | `change()` for people and agents; the runner for handlers it ran. |
| `message` | A person or an agent said something about the document. | [POST /api/docs/:id/messages](<route:POST /api/docs/:id/messages>). |
| `presence` | An agent read, listened, or answered: `reading`, `editing`, `listening` or `idle`. | The read, wait and compose routes. |
| `people` | The set of people with the document open changed, each with the cell they selected. | `announce()`. |
| `data` | A collection of the document's owner changed. Carries the collection's name, not its rows. | `dataChanged()`, after any write to records. |
| `compose` | A person asked Ask AI and a listening agent is asked to answer. | The compose route. |
| `trace` | Handlers the server ran, and what they did. | The runner. |
| `fetch` | A fetch cell started loading, got its answer or failed. | The runner. |
| `access` | This stream's role changed. Carries the new role. | `recheck()`. |
| `revoked` | This person can no longer have the document open: `access`, `signedout` or `deleted`. The stream closes after it. | `recheck()`. |
| `reset` | The document was replaced: sync rewrote its history. Load it again. | The sync engine's hook. |
| `deleted` | The document is gone. | `gone()`. |
| `unshared` | A share link was turned off. Carries its token. | [DELETE /api/shares/:token](<route:DELETE /api/shares/:token>), and sync. |

Three of them are not through the hub. `access` and `revoked` are sent straight to one listener by `recheck()`, because they are about one stream, not the document. `ping` is written by the route.

An `ops` event is the same record the log keeps (see [Storage](/internals/storage/)), plus the fields that let a session recognise its own change.

## Who hears what

The first filter is the kind of listener. A signed-in person hears everything the room carries. Someone who came in with a share link is a *guest*, and `guestHears` lets through only what a guest needs:

```ts
export function guestHears(who: Principal, e: { type: string; collection?: string; owner?: string | null; token?: string }): boolean {
  if (who.kind !== 'guest') return true;
  if (e.type === 'data') return who.collections.includes(e.collection ?? '');
  if (e.type === 'unshared') return e.token === who.token;
  return ['hello', 'ops', 'fetch', 'deleted', 'reset'].includes(e.type);
}
```

A guest hears changes to the document, fetch answers, the document going away or being reset, a `data` event only for a collection their link reaches, and `unshared` only for their own link. They don't hear the conversation, who is present, the agents' presence or the handlers' traces. When their link is turned off, the route writes the `unshared` event, then closes the stream.

The route then applies three more filters, for people who can read a document but are not allowed everything about it:

- **Collections the document doesn't reach.** A `data` event for a collection outside the document's reach goes only to the owner. For anyone else it would reveal that the owner has such a collection. See [Access](/internals/access/).
- **Fetch addresses.** Only the owner and editors may see where a fetch cell fetches from. For a viewer or a guest, `trace` events are dropped, a `fetch` event has its address removed (`quietState`), and the ops in an `ops` event have fetch cells' `url` and `headers` replaced (`withoutAddressesIn`).
- **Mode.** A viewer's or view-link guest's stream is counted as `page`, whatever the tab says, so a person who can't change the document doesn't keep its timers running.

## Presence

This is how [presence](term:presence) reaches the screen. `present(docId)` builds the list for the `people` event from the open streams (`listeners`): one entry per person however many tabs, with their name, colour, whether it is a person or an agent (an agent when the stream was opened with an API key), the cell they have selected, their mode (`edit` if any tab is editing) and the ids of their tabs. Guests are not listed by name.

A tab says what it has selected by posting to [POST /api/docs/:id/viewer](<route:POST /api/docs/:id/viewer>), which updates its listener (only the caller's own tabs; naming someone else's `client` is refused) and, if something moved, announces. `announce` runs when a stream opens or closes, when a person's name or colour changes, and after access changes.

`recheck(docId?)` is called whenever access might have changed (a role given or taken away, a password change, sign-out, an API key revoked, an account deleted, access changed on another machine). It looks at every open stream. A stream whose person lost access gets `revoked` and is closed after the event is written; one whose role changed gets `access`. That is what makes taking access away immediate rather than waiting for the next request.
