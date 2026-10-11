---
title: The engine
---

The engine works out what a document says now: every cell's value, its resolved style, whether it is hidden, and which cells it reads. This page describes `evaluate`, the order cells are worked out in, how dependencies are recorded, the `World` a document sees outside itself, how a clock makes values tick, and how an error stays in the cell that caused it.

It describes [engine.ts](src:src/core/engine.ts). The language it runs is in [sx.ts](src:src/core/sx.ts), described on [The interpreter](/internals/interpreter/).

## What evaluate gives back

```ts
export function evaluate(doc: Doc, world: World, prev?: Computed): Computed

export interface Computed {
  cells: Record<string, CellState>;
  /** For each cell, the cells that read it. */
  feeds: Record<string, string[]>;
  usesNow: boolean;
  collections: string[];
}

export interface CellState {
  value: unknown;
  error?: string;
  style?: Record<string, unknown>;
  hidden?: boolean;
  /** Resolved label, placeholder, src, alt, options, min, max, step; a calendar's events; a stat's compare and trend. */
  props?: Record<string, unknown>;
  /** Ids of the cells this one reads. */
  reads?: string[];
}
```

The result is plain data, keyed by cell id. Evaluating the **Quote** from [the model](/internals/model/) gives (shortened):

```json
{
  "cells": {
    "c4": { "value": 2 },
    "c5": { "value": 40 },
    "c6": { "value": 80, "reads": ["c4", "c5"] }
  },
  "feeds": { "c4": ["c6"], "c5": ["c6"] },
  "usesNow": false,
  "collections": []
}
```

`evaluate` is a function of the document and the world, nothing more. It keeps no state between calls. Each call makes a new `Evaluator`, which owns a memo table for that one pass. The editor, the server's `view()` for agents, the runner, the export and the compose checker each call it when they need values.

## The order

`evaluate` walks the tree in document order and asks the evaluator for the state of each cell. That is the order values are *requested* in, not the order they are *worked out*. A formula that reads a cell further down needs that cell's value first, so reading it computes it on the spot.

```notation id=sheet title="Formulas that read the ones below them"
["col", {"name": "sheet"},
  ["formula", {"name": "total"}, ["+", "$subtotal", "$tax"]],
  ["formula", {"name": "tax"}, ["*", "$subtotal", 0.2]],
  ["formula", {"name": "subtotal"}, ["*", "$qty", "$price"]],
  ["input", {"name": "qty", "type": "number", "value": 3}],
  ["input", {"name": "price", "type": "number", "value": 10}]]
```

```sx in=sheet
total
⇒ 36
```

Asking for **total** (the first formula) computes **subtotal**, then **tax**, which reuses the subtotal it has worked out, then **total**. Each cell is computed once. The mechanism is `valueOf(cell)`:

1. If the memo has an answer for the cell (a value or an error), return it.
2. If the cell is already on the `computing` stack, this is a loop: throw `circular reference: a → b → a`.
3. Push the cell on the stack, call `compute(cell)`, store the result in the memo, pop.

So the order is a depth-first walk that follows reads, and the dependency graph never has to be built up front or sorted. There is no topological sort. A document with a loop reports it where it happens instead of failing to start.

::diagram eval-graph

### What each kind is worth

`compute` decides a cell's value by its kind:

| Cell | Its value |
| --- | --- |
| a group (`row`, `col`) | The list of its children's values. |
| `tabs`, `accordion`, `collapsible` | What is open: the open tab's title, the open sections' titles, or whether it is open (`containerValue`). |
| `text`, `image` | The text, or the `src`, after its [templates](term:text-template) are filled in. |
| `formula`, `chart`, `stat` | The value of `expr`; `null` with none. |
| `table`, `list` | The value of `expr`, or the rows or items typed into the cell. |
| `input` | Its `value`, read as a number for `number`, `slider` and `rating`, a boolean for `checkbox` and `toggle`, and text otherwise. |
| `data` | Its `value`, which readers never see. |
| `timer` | Whether it runs: `true` unless its `value` is `false`. |
| `fetch` | The last answer, which comes from the world (below), not the document. |
| `calendar` | The picked day, or `null`. Its events are worked out as a prop. |
| `button`, `icon`, `canvas`, `diagram` | Its label, its icon name, its strokes, its elements. |

`state(cell)` then adds what the value is not: the cell's `style` with every expression evaluated, its `hidden` condition as a boolean, and `props` for the other expression-valued settings (`label` and the like as templates; `options`, `min`, `max`, `step`, `compare`, `trend` as expressions; a calendar's `events`; a diagram's label texts; a fetch cell's state).

## Dependencies: reads and feeds

Whenever an expression reads another cell, `read(cell)` records the edge before it asks for the value:

```ts
const me = this.context.at(-1);
if (me && me.id !== cell.id) {
  // reads.get(me.id).add(cell.id)
}
```

`context` is the stack of cells whose expressions are being run: `evalIn(cell, expr)` pushes the cell, runs the interpreter and pops it. So an edge says "this cell's expression read that cell", and only direct reads are stored. **total** reads `c4` (subtotal) and `c3` (tax); **subtotal** reads `c5` and `c6`.

After the walk, `evaluate` inverts the edges once:

```ts
for (const [id, st] of Object.entries(cells)) {
  for (const r of st.reads ?? []) (feeds[r] ??= []).push(id);
}
```

`reads` answers "what does this cell depend on?" and `feeds` answers "what changes if I change this?". The editor draws its lines between cells from them (**Show links between cells**), and the **Links** section of **Cell details** lists them as **Reads** and **Feeds**. Groups record no reads: their value is a list of their children, which is not a read in this sense.

The interpreter reaches the document only through the host the evaluator builds, so every way to read is a recorded edge or a flag:

- `ref`, a plain name, `sib` and `selected` go through `read`, so they record edges. `sib` and `idx` resolve relative to the current cell. `child` and `status` only look a cell up by name, so they record none.
- `rows` adds the collection's name to `collections`, which tells the browser which records to load and the server which collections a document reads (see [Access](/internals/access/)).
- `now` sets `usesNow`.

## The World

A document is not a closed system. Records, the clock and fetch answers live outside it, and the engine sees them through one interface, passed in by whoever calls `evaluate`:

```ts
export interface World {
  rows(collection: string): unknown[];
  now: number;
  /** Where each fetch cell's request stands, by cell id (kept by the server, not the document). */
  fetched?(cell: string): FetchState | undefined;
}
```

Everything that calls the engine builds its own world:

| Caller | `rows` | `now` | `fetched` |
| --- | --- | --- | --- |
| The browser, `Session.world()` | The collections it loaded through the API, `[]` until they arrive. | A value it ticks. | The fetch states the stream reports. |
| The server, `world()` in [app.ts](src:src/server/app.ts) | The owner's records. For anyone but the owner, only collections the document reaches; others throw. | The clock. | The runner's states. |
| The runner | The same records, through the same check. | Its clock (a fake one in tests). | Its own states. |
| The docs' doc-tests | The sample records of a `live` block, if it brings any. | A fixed 11 October 2026, 09:00 UTC. | None. |

Because `now` is a plain number the caller passes in, tests and the docs can run the engine at any moment they like, and the same document gives the same answer to the same world.

## Ticking

A formula that reads the time changes without anyone touching the document. `usesNow` is how the caller knows. The evaluator sets it when an expression calls the host's `now` (`(now)`, `(today)`, `(fmt x "ago")`) or when a text template uses the `ago` format. Nothing else sets it.

In the browser, `Session.evaluate()` looks at `computed.usesNow` after every pass. If it is true and no clock is running, the session starts a one-second `setInterval` that patches `now` and so evaluates again. When a later pass finds the document no longer uses the time, it stops the interval. A document that never asks for the time never ticks.

```sx
(today)
⇒ "2026-10-11"
```

The server does not tick formulas. A timer *cell* is a different thing: the runner fires its `tick` event, whose handler may change the document. See [The runner](/internals/runner/).

## Errors stay in their cell

An error is a value of a cell's state, not an exception for the caller. `state()` runs the value, the style, the `hidden` condition and each prop in a `guard`, which catches what they throw and keeps the first message in `st.error`. A cell whose value fails has `value: null`. Every other cell is still evaluated.

When a cell reads one that failed, the failure travels with it. `read()` rethrows the message, prefixed with the failed cell's name unless the message already carries one:

```notation id=broken title="A loop, and a failure that spreads"
["col",
  ["formula", {"name": "a"}, ["+", "$b", 1]],
  ["formula", {"name": "b"}, ["+", "$a", 1]],
  ["input", {"name": "zero", "type": "number", "value": 0}],
  ["formula", {"name": "ratio"}, ["/", 1, "$zero"]],
  ["formula", {"name": "shown"}, ["+", "$ratio", 1]]]
```

```sx in=broken
a
⇒ error: circular reference: a → b → a
ratio
⇒ error: division by zero
shown
⇒ error: ratio: division by zero
```

The memo stores errors as well as values, so a cell that fails is not computed twice in one pass, and every reader gets the same message. A loop is reported on every cell in it.

A cell with handlers, an action or row actions gets one more check in `state()`: `actionProblems` looks for calls to names that exist nowhere (not built in, not a custom action, not a cell, not a variable). The message looks like `on click: no action or function called "greet"` and is shown before anything runs.

The group that holds a failed cell fails with it, because its value is the list of its children's. That is why the outline and the agents' `errors` map leave groups out: the interesting error is on the leaf (see `outline` in [outline.ts](src:src/core/outline.ts) and `view` in [app.ts](src:src/server/app.ts)).

## Reusing the last result

`evaluate` takes the previous `Computed` as its third argument. After the new pass it compares each cell's new state with the old one using `deepEqual` and, where they match, keeps the old object. The session passes the previous result every time, so the React components that read one cell's state see the same object and don't re-render when it hasn't changed.

```ts
const before = prev?.cells[id];
if (before && deepEqual(before, st)) cells[id] = before;
```

Setting **price** to 12 in the example above gives new objects for the formulas that depend on it and keeps the one for **qty**. The group's value changes whenever any child does, so it is always new.

## The other entry points

| Function | Used for |
| --- | --- |
| `evalIn(doc, world, expr, cellId?)` | One expression against the document, as if written in a cell. Gives `{ value }` or `{ error }`. [POST /api/docs/:id/eval](<route:POST /api/docs/:id/eval>), the agents' [edgy_eval](tool:edgy_eval) and the docs' doc-tests use it, and so does `finish` in [compose.ts](src:src/server/compose.ts) for the preview of a composed answer. |
| `runAction(doc, world, cellId, action, vars?)` | Runs an action and returns what it asks for, as a list of effects. A button's `do`, a handler and a table's row action go through it. |
| `actionsOf`, `actionProblems`, `customAction` | Find the actions a cell or the document holds; find calls to names that don't exist; look up a custom action. |
| `display`, `plainValue` | How a value is shown with the cell's format; a value made safe to send as JSON (a function becomes `ƒ`, a non-finite number becomes text). |

`runAction` is where the engine meets [actions](term:action). It makes an evaluator with an `effects` list. While that list exists, the host gives `set!`, `insert!`, `emit!` and the others somewhere to put their effects. Without it (any value, style or condition) they throw `set! only works in an action, such as a button`. An action does not change what the evaluator sees: reads inside it see the document as it was, and the effects, `op`s included, are applied afterwards by `react()` in [events.ts](src:src/core/events.ts).
