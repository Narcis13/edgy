---
title: The model, as plain JSON
nav: The model
---

A document in edgy is one JSON value: a tree of cells, a few settings and a version. This page describes the three types the whole app is built on (`Cell`, `Doc` and `Op`), how cells are identified and named, and what lives in a document's `meta`.

It describes [types.ts](src:src/core/types.ts), with [tree.ts](src:src/core/tree.ts) for finding cells and [notation.ts](src:src/core/notation.ts) for the rules a name must follow.

## A document as stored

Here is the **Quote** document used in the pages that follow, exactly as the server stores it: a column with a title, a row of two inputs and a formula.

```json
{
  "id": "k3m9x2qa",
  "v": 1,
  "nextId": 7,
  "meta": { "title": "Quote" },
  "root": {
    "id": "c1", "kind": "col", "name": "quote",
    "children": [
      { "id": "c2", "kind": "text", "text": "Quote for Northwind Studio" },
      { "id": "c3", "kind": "row", "children": [
        { "id": "c4", "kind": "input", "name": "qty", "type": "number", "value": 2 },
        { "id": "c5", "kind": "input", "name": "price", "type": "number", "value": 40 }
      ] },
      { "id": "c6", "kind": "formula", "name": "total", "format": "currency", "expr": ["*", "$qty", "$price"] }
    ]
  }
}
```

There is nothing else. No class instances, no dates, no functions: a document survives `JSON.stringify` and `JSON.parse` unchanged, which is how it is saved, sent, synced and exported. The same document in [notation](term:notation), the shorter spelling agents write, is on [Notation and outline](/internals/notation/).

## Cell, Doc and Op

```ts
export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/** An s-expression written as JSON: `["*", "$qty", "$price"]`. */
export type Sx = Json;

export interface Doc {
  id: string;
  v: number;
  nextId: number;
  meta: DocMeta;
  root: Cell;
}

/** An update, also an s-expression: `["split", "c1", "row"]`. */
export type Op = [string, ...Json[]];
```

A `Doc` is its `id`, a version `v`, a counter `nextId` for new cell ids, its `meta` and its `root` [cell](term:cell). An `Op` is a JSON list whose first item is the verb. An `Sx` is a JSON value that the [interpreter](/internals/interpreter/) reads as an expression.

A `Cell` has a handful of fields every cell shares and a long tail of props that only some kinds use:

```ts
export interface Cell {
  id: string;
  kind: Kind;
  name?: string;
  size?: Size;
  style?: Record<string, Sx>;
  hidden?: Sx;
  children?: Cell[];

  text?: string;
  expr?: Sx;
  value?: Json;
  do?: Sx;
  on?: Record<string, Sx>;
  // …and the props that belong to one kind: format, type, label, options,
  // columns, every, url, headers, and so on
}
```

The real interface lists every prop, with a comment saying which kind reads it. Three rules hold for all of them:

- **In any prop, a JSON array is an expression and a string may carry `{{templates}}`.** `["*", "$qty", "$price"]` is a call; `"Total: {{total | currency}}"` is a [text template](term:text-template).
- **Absent means default.** A cell with no `size` has weight 1, one with no `style` has no styles. The tree never stores a default, so two documents that look the same compare equal. `withSize` drops a weight of 1 for this reason.
- **Only groups have `children`.** The group kinds are `row`, `col`, `tabs`, `accordion`, `collapsible` and `panel` (`GROUP_KINDS`); everything else is a leaf. `isGroup` tells them apart. See [the cell kinds](/cells/) for what each one is.

### Kinds

`Kind` is `GroupKind | LeafKind`, two `as const` lists in `types.ts`. Don't copy them anywhere: the list of kinds on [Cells](/cells/) is generated from the same constants.

Three helpers say how a group holds its children. `holdsPanels` is true for `tabs` and `accordion`, whose children are `panel` cells and nothing else. `isContainer` adds `collapsible`; the value of a container is what is open. `flowOf` gives `'row'` for a `row`, `'col'` for `col`, `panel` and `collapsible`, and `null` for tabs and accordions, which lay their panels out themselves.

### Size

```ts
/** A weight (shares free space), "hug" (as small as the content) or a fixed "120px". */
export type Size = number | string;
```

A number is a weight: in a row of three cells with weights 1, 1 and 2, the last gets half the width. `"hug"` is as small as the content; `"120px"` is fixed. `validSize` in `tree.ts` accepts exactly those three forms. How weights are kept in step when cells are split, merged and removed is on [The tidy tree](/internals/normalize/).

## Ids and names

Every cell has an `id`, unique in the document and never changed. New ids come from the document's own counter: `workOn` in `ops.ts` builds a generator that returns `'c' + n`, skipping any id already in use, and writes the counter back to `nextId` when the op has applied. Because the counter lives in the document, replaying the same ops on the same document makes the same ids on every machine.

A cell may also have a `name`, so that other cells can read it. A name must match this pattern and must not be reserved:

```ts
export const NAME_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;
export const RESERVED_NAMES = new Set(['true', 'false', 'nil', 'null', 'it', 'i', 'acc']);
```

`checkName` in `notation.ts` adds two more rules: no other cell has that name, and no other cell has it as its *id*. That last rule is what lets a reference be either one.

`resolve(root, ref)` finds a cell from a reference. It strips a leading `$`, then looks in the index by name first and by id second. `indexTree` builds that index once per tree (`byId`, `byName`, `parent`, `pos`) and caches it in a `WeakMap` keyed by the root cell, so the cache is dropped with the tree. This is why cells are never mutated: a change copies the path from the root to the changed cell and shares the rest, and a new root means a new index.

```notation id=quote title="The Quote document"
["col", {"name": "quote"},
  ["text", "Quote for Northwind Studio"],
  ["row",
    ["input", {"name": "qty", "type": "number", "value": 2}],
    ["input", {"name": "price", "type": "number", "value": 40}]],
  ["formula", {"name": "total", "format": "currency"}, ["*", "$qty", "$price"]]]
```

In an expression a cell is read by its name (`qty`) or by its id (`c4`). Both reach the same cell:

```sx in=quote
(= qty c4)
⇒ true
total
⇒ 80
(* qty price)
⇒ 80
```

## The cell tree

Splitting turns a cell into a `row` or `col` holding the old cell and a new one; merging goes the other way; removing hands a cell's share of space to a neighbour. The picture shows a tree before and after a split and a merge.

::diagram cell-tree

## The document's settings

`meta` holds what belongs to the document rather than to a cell:

```ts
export interface DocMeta {
  title: string;
  width?: number;
  minHeight?: number;
  currency?: string;
  page?: string;          // "A4", "A5", "Letter" or "Legal"
  orientation?: string;   // "portrait" or "landscape"
  margin?: number;        // page margin in millimetres
  footer?: string;        // "none", "number" or "title"
  on?: Record<string, Sx>;
  actions?: Record<string, Sx>;
  [k: string]: Json | undefined;
}
```

`title` is always a string: the `meta` op puts `"Untitled"` back if it would be removed. `currency` sets what the `currency` format means. The page keys drive [pagination](/internals/pagination/). `on` holds the document's own handlers (`open`, `close` and [custom events](term:custom-event)) and `actions` its [custom actions](term:custom-action). The type is open-ended on purpose, for settings such as the font a document is set in. Settings change through the `meta` op, one key at a time; `"on.open"` and `"actions.greet"` reach a single handler or action. See [meta](op:meta).

## Actors

Who made a change is not part of the op. The server stamps it next to the op in the log:

```ts
export interface Actor {
  kind: 'human' | 'agent';
  name: string;
  /** A person's account id; an agent's is the person it acts for. Browsers' own session ids before accounts. */
  id?: string;
  /** An agent acting for a person (with their API key): that person's name. */
  for?: string;
  /** Someone who came in by a share link. */
  guest?: boolean;
}
```

The body of a request can name an agent, but the server decides the rest from the credential (see `actorOf` in [app.ts](src:src/server/app.ts) and [Access](/internals/access/)). Handlers the server runs for timers and fetches are saved as the actor `{ kind: 'agent', name: 'Events' }`.

Ops change this model; the next page describes how.
