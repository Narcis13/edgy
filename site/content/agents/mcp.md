---
title: The MCP server
nav: MCP server
---

The MCP server lets an AI model use edgy through a set of tools: it lists and creates documents, reads and changes them with ops, saves records, and talks to the person who has the document open. Every tool calls the same [HTTP API](/agents/http/) that edgy's own pages use, so a person watching sees each change land.

::ref tools

## Set it up

The repository has a `.mcp.json`, so [Claude Code](https://claude.com/claude-code) opened in the edgy folder finds the server by itself once edgy is running (`npm run dev`):

```json
{
  "mcpServers": {
    "edgy": {
      "command": "npx",
      "args": ["tsx", "src/mcp/server.ts"],
      "env": { "EDGY_URL": "http://127.0.0.1:8787", "EDGY_AGENT_NAME": "Claude" }
    }
  }
}
```

`npm run mcp` starts the same program by hand (`tsx src/mcp/server.ts`). It speaks MCP on standard input and output, so you don't use it yourself: an MCP client starts it and talks to it. For any other client that starts stdio servers, give it that command and the same three settings:

| Setting | What it is |
| --- | --- |
| `EDGY_URL` | Where edgy's API answers. The default is `http://127.0.0.1:8787`; a slash at the end is ignored. |
| `EDGY_API_KEY` | An [API key](/people/api-keys/) from **Profile → API keys**. The server sends it on every request as `Authorization: Bearer …` and never prints it. Leave it out in [local mode](term:local-mode); a server that asks people to sign in needs it. |
| `EDGY_AGENT_NAME` | The name the agent goes by. The default is `Claude`. It is the name in **Activity**, and the name that shows as reading or listening in a document. |

With a key, the agent sees and changes only what its person can, and **Activity** shows it as the agent acting for that person: "Claude for Ada". The key goes next to `EDGY_URL`:

```json
"env": { "EDGY_URL": "http://127.0.0.1:8787", "EDGY_API_KEY": "edgy_…", "EDGY_AGENT_NAME": "Claude" }
```

The tool answers that point a person to a document carry a link: `Open it at …/d/<id>`. The address comes from the `web` field of [GET /api/health](route:GET /api/health), which is the web app (`http://localhost:5173` while you develop) and not the API.

### Documents by id or title

Wherever a tool takes `doc` or `deck`, it takes the id (`xebuqd2c`) or the title (`Quote`, any case). The server looks through the person's own documents and those others gave them access to; an id that matches wins. A title that two documents share, whoever owns them, is refused with their ids, so the agent can choose. A `deck` is looked up among the person's decks by id or title; for two decks with one title, the most recently changed is used.

### When something is wrong

A tool that fails answers with an error, and the text says what to do:

| When | The message |
| --- | --- |
| Edgy isn't running | `Edgy is not running at http://127.0.0.1:8787. Start it with "npm run dev" in the edgy folder, then try again.` |
| The server wants a key and there is none | `Edgy needs an API key: sign in to edgy, open Profile → API keys, create one, and set EDGY_API_KEY next to EDGY_URL in the MCP server's settings.` |
| The key is refused | `Edgy refused the API key in EDGY_API_KEY: this API key was revoked; make a new one in your profile.` The words after the colon come from the server: not valid, revoked, or an account that no longer exists. |
| No such document | `no document "Qoute". Known: ndbgqcuy (Quote), l6nl6xxs (Start here)` |
| Two documents share a title | `several documents are titled "Quote"; use an id: ndbgqcuy, abbyehyo` |
| An op or an expression is wrong | The server's own message, such as `no cell called "nope"` or `missing )`. |
| Anything else | The server's message, or `request failed (<status>)` when the answer has none. |

## The tools

The tools are in the order the server registers them. The first thing a model should do is call [edgy_guide](tool:edgy_guide).

::: tool edgy_guide
Returns the guide: how documents work, in the words an agent needs. It covers the notation of every kind of cell, the expression language with all its functions, events, ops, records, accounts, the library and a few rules for working well. It is the same text as [GET /api/guide](route:GET /api/guide), about 24 KB.

An agent calls it once, before it edits anything. The guide is the agent's own reference; these pages are for the people who build and run agents.

Example call, with no arguments:

```json
{}
```

It returns the guide as text, beginning `# Edgy: documents made of cells`.
:::

::: tool edgy_docs
Lists or searches the library: the documents and decks of the person whose key this is, each with a link they can open. Use it to find a document before reading it, or to see what exists.

`query` finds documents whose title, description or text holds every word. `filter` is `all` (the default: a deck's documents show inside the deck, unless pinned or found by a search), `pinned`, `shared` (documents with a link on or people added), `decks` or `archived` (archived ones show only there). `sort` is `updated` (the default), `created` or `title`. `scope: "shared"` lists the documents other people gave this person access to, with the role; `filter` doesn't apply to it.

```json
{"query": "quote"}
```

It returns one line for each card, pinned ones first under `Pinned:`, and, when there are pinned ones, the rest under `Others:`. A document line is the id, the title, the version, when it changed, and the link; then flags in brackets, a description line and, for a search, where the words were found:

```text
ndbgqcuy  "Quote"  version 2, changed 2026-10-11T07:34:25.225Z  http://localhost:5173/d/ndbgqcuy
    found in the title: Quote
```

The flags are `Ada's, you can edit` (or `view`) for a shared document, `pinned #1`, `archived`, `shared (view)`, `shared (edit)` and `in deck "Pitch"`. A deck line reads `deck-zbre0kb  deck "Pitch"  1 documents: t6mggyig`. When nothing matches, the answer says so: `Nothing matches "zzz".`
:::

::: tool edgy_organize
Arranges documents in the library: describe, pin, unpin, archive, restore, or set the order of the pinned. Use it when the person asks to tidy up, or after creating a document an agent wants found again: a description is searchable and shows on the card.

`docs` are ids or titles (a deck's id works for pin, unpin, archive and restore). `describe` sets the description of the first document in `docs`, one or two sentences; an empty `description` removes it. `order_pins` takes every pinned id or title in the new order.

```json
{"action": "describe", "docs": ["Quote"], "description": "A quote for Northwind Studio"}
```

It returns a sentence: `"Quote" now reads: A quote for Northwind Studio`. For the other actions it names the ids it acted on: `archive: kfgqcxen.` Anything that could not be done, such as pinning an archived document or a deck that isn't the person's, follows as `; not done: …`. For `order_pins` it lists the pinned ids in order: those you gave first, then any pinned ones you left out. Archiving loses nothing; the document comes back with `restore`.
:::

::: tool edgy_deck
Makes and changes decks: documents grouped in an order, shown as one card and played as slides. The documents stay separate documents. Use it to put a set of documents in the order a person will present them.

`create` takes `title`, `description` and `docs` in order. Every other action names the `deck` (id or title): `read` shows it, `reorder` takes `docs` and puts them first, in that order, with the rest after them, `add` appends `docs` or inserts them at position `at` (0 is first), `remove` takes them out, `describe` changes `title` and `description`, and `ungroup` dissolves the deck and leaves its documents.

```json
{"action": "create", "title": "Pitch", "docs": ["Quote", "Second"]}
```

It returns the deck as a numbered list and the address that plays it:

```text
deck-duduji6  "Pitch"
  1. ndbgqcuy "Quote"
  2. abbyehyo "Second"
Play it at http://localhost:5173/deck/deck-duduji6/play
```

`ungroup` answers `Ungrouped deck-duduji6; its documents are back in the list.` A deck that doesn't exist gets `no deck "Pitch". Known: …`. See [Decks](/library/decks/).
:::

::: tool edgy_share
Turns a link to a document on or off. Anyone with the link sees the document in **Live**, with no editor and no way to other documents; an `edit` link also lets them change it. Use it only when the person asks for a link; only a document's owner can turn its links on or off. See [Share links](/library/share-links/).

`action` is `on` (make the link, `access` `view` or `edit`, `view` by default; if that link is already on, you get it back), `off` (turn it off: with `access`, only that link, without it every link) or `list`.

```json
{"doc": "Quote", "action": "on", "access": "view"}
```

It returns `Anyone with this link can view: http://localhost:5173/s/…`. `list` gives one line per link that is on, `view: …` or `edit: …`, or `Not shared.` `off` answers `Turned off: edit.` or `There was no such link.` Whoever has a link that is turned off sees that the document is no longer shared.

The link points at the server's address, which is on this computer: it reaches other people only when edgy is hosted where they can open it.
:::

::: tool edgy_export
Saves a document or a deck as one `.html` file that opens from disk with no server and no network: the layout, fonts, pictures and icons are inside, formulas, inputs and buttons work, a deck plays as slides, and the records the documents read are in it as they are now. See [Export](/library/export/).

Give `doc` or `deck`, not both (`give either doc or deck` otherwise). With `file`, a path on the computer where the MCP server runs, the file is written there. Without it you get the address to download from.

```json
{"doc": "Quote", "file": "C:/Users/ada/Desktop/quote.html"}
```

It returns `Saved C:/Users/ada/Desktop/quote.html (412 KB). It opens in any browser, offline.` Without `file` it returns `Download it from http://127.0.0.1:8787/api/docs/ndbgqcuy/export`; that address needs the same sign-in as the API, so an agent that holds a key does better to give a `file`. Only the owner can export a document.
:::

::: tool edgy_create
Creates a document and returns what it looks like. Give `root`, the notation of the whole document, to start with content; give `template` (`quote`, `savings` or `feedback`, another from [GET /api/templates](route:GET /api/templates), `tour`, or a tutorial such as `tutorial-quote`) to start from one; give neither for a single empty cell. Building the whole document in `root` takes one call and is how an agent should start: see [Outline and notation](/agents/notation/).

```json
{"title": "Quote", "root": ["col", ["input", {"name": "qty", "type": "number", "value": 2}], ["formula", {"name": "total"}, ["*", "$qty", 40]]]}
```

It returns the new id, the link, the outline and a line about errors:

```text
Created ndbgqcuy. Open it at http://localhost:5173/d/ndbgqcuy

"Quote" — doc ndbgqcuy, version 1
c1 col
├─ c2 input:number qty = 2
└─ c3 formula total = (* qty 40) → 80

No errors.
```

The document is the person's, and its history shows the agent as the one who made it.
:::

::: tool edgy_read
Reads a document: the outline, with every cell's id, name, source and current value, and a list of the cells that show an error. Use it before every change, and after it to check the result. It also shows the agent as reading in the document.

`format` is `outline` (the default), `notation` or `both`. Ask for the notation when you need the exact cells to put back: it carries every id. See [Outline and notation](/agents/notation/).

```json
{"doc": "Quote", "format": "both"}
```

It returns the outline, then `Notation:` and the notation on one line if you asked for it, then `No errors.` or `Errors:` and one `name: message` line for each cell with an error.
:::

::: tool edgy_apply
Changes a document with ops. They are applied together or not at all, and the people watching see the change at once, and the ops show in **Activity** under the agent's name. Use it for every change: see [Ops](/agents/ops/) for each verb.

```json
{"doc": "Quote", "ops": [["set", "qty", "value", 5], ["style", "total", {"bg": "accent-soft"}]]}
```

It returns `Applied 2 ops; now version 2.`, then the new outline and the errors, in the same form as [edgy_read](tool:edgy_read). When an op can't be applied nothing changes and the answer is the op's message, for instance `no cell called "nope"`. A change that sets handlers off runs them on the server if someone has the document open in **Live**.
:::

::: tool edgy_eval
Works out an expression against a document without changing it. Use it to try a formula, check a value a formula would give, or ask a question about the records, before writing it into a cell. The expression is written in the document's language, in Lisp syntax: see [The language](/language/).

```json
{"doc": "Quote", "src": "(* qty 2)"}
```

It returns the value as JSON: `10`. An expression that reads wrongly, such as `(+ nope 1)`, answers `Error: no cell called "nope"`; one that can't be read at all, such as `(+ 1`, is refused with `missing )`. An action such as `set!` answers `Error: set! only works in an action, such as a button`: nothing is ever changed.
:::

::: tool edgy_data
Works with the collections that documents save records into. Collections belong to an account: without `doc` they are the person's own; with `doc` (a document of theirs or one shared with them) they are the collections that document reads, which are its owner's. See [Collections](/data/collections/).

`action` is `collections` (the list), `rows` (the records of `collection`), `insert` (add `record`), `update` (merge the fields of `record` into the record with `id`), `delete` (remove the record with `id`) or `clear` (empty the collection). Every action but `collections` names the `collection`.

```json
{"action": "insert", "collection": "quotes", "record": {"client": "Ada Lovelace", "total": 80}}
```

It returns the API's answer as JSON. An insert gives the record with the `id` and `at` (the time) it was given: `{"client":"Ada Lovelace","total":80,"id":"rafgpwqg","at":1791704065247}`. `collections` gives `[{"name":"quotes","count":1,"updatedAt":…}]`, `rows` the list of records, `delete` `{"ok":true}` and `clear` `{"removed":1}`. Through a document that isn't the person's own, only the collections that document's owner let it use are open, and writing needs edit access.
:::

::: tool edgy_say
Leaves a short message in a document's **Activity** panel, for the person who is working there. Use it to say what was changed and why, or to ask a question. It can be about one cell.

```json
{"doc": "Quote", "text": "I set the quantity to 5.", "cell": "qty"}
```

It returns `Sent (message 1).` The person can answer from the same panel, and the agent hears it with [edgy_listen](tool:edgy_listen). Writing needs edit access to the document.
:::

::: tool edgy_listen
Waits for the person to write to the agent in a document's **Activity** panel, and returns what they wrote. Use it to sit in a document and take requests. While it waits, the panel says that an agent is listening.

`after` is the id of the last message the agent has seen, so it hears only newer ones. `timeout` is the seconds to wait, up to 120 (30 by default); a message that is already waiting is returned at once.

It also returns requests from **Ask AI**. When the person describes in words what a cell should compute or how it should react, and an agent is listening, the request goes to the agent, which has 45 seconds to answer it with [edgy_answer](tool:edgy_answer). See [Ask AI](/editor/ask-ai/).

```json
{"doc": "Quote", "after": 2, "timeout": 60}
```

A message is one line, `#2 Ada: Make the total include 20% tax.`, with `(about c3)` after the name when it is about a cell. A request is one line too:

```text
Compose request r1 for cell total (expr): "what is left after 20 percent tax". Current code: (none).  Answer with edgy_answer.
```

It says which cell (or the document) the code is for and the target: `expr` (what the cell shows), `do` (a button's action), `hidden`, `style`, `options`, `compare`, `trend`, `action` (a custom action), `events` (a whole sentence about how the document reacts), or `on.<event>`, one handler. For `on.<event>`, `action` and `events` the line adds what shape the answer takes and which names the event binds. When nothing came in the time given, the answer is `Nothing yet.` Only the person's messages are returned, not the agent's own.
:::

::: tool edgy_answer
Answers a request that [edgy_listen](tool:edgy_listen) returned, with code written in the document's language. Use it once for each request, with the id from the line (`r1`).

`code` is one expression for the request's target, such as `(* qty price 0.8)`. For the target `events` it is the JSON list of ops that makes the change, as a list or as text. `explanation` is one or two plain sentences for a beginner: what the code does and which cells it reads.

```json
{"doc": "Quote", "request": "r1", "code": "(* qty price 0.8)", "explanation": "Multiplies quantity by price, then keeps 80 percent of it."}
```

The code is checked against the document before the person sees it: it must read and fit the cells there, an action is allowed only for a target that runs actions (`do`, `on.<event>`, `action`, `events`), and the ops of an `events` answer are tried against the document. If it passes, the answer is `Answered r1; the person now sees (* qty price 0.8) with a preview.` (When `code` is a list of ops, as for `events`, the ending is `and can apply it` instead.) If not, it is `The code was rejected: …. Fix it and call edgy_answer again for r1.`, and the agent can try again for the same request. A request that was answered, or whose 45 seconds ran out, gives `Request r1 is no longer waiting: it was answered or timed out.`
:::

## Without MCP

Every tool is an HTTP call that you could make yourself; the [HTTP API](/agents/http/) lists them all, and `curl` or any language works. The tools add the lookup of a document by title, the report of errors after each change, and the waiting of [edgy_listen](tool:edgy_listen). An agent that is not an MCP client reads [GET /api/guide](route:GET /api/guide) and sends ops to [POST /api/docs/:id/ops](route:POST /api/docs/:id/ops).

Source: [tools.ts](src:src/mcp/tools.ts) (the tools), [server.ts](src:src/mcp/server.ts) (the stdio server).
