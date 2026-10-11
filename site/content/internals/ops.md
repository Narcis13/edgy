---
title: Applying ops
nav: Applying ops
---

Every change to a document goes through one pure function, `applyOp`. This page describes what it takes, what it returns (the document, the op with every id filled in, and the op that undoes it), how `do` makes several ops one, and how a failure is reported.

It describes [ops.ts](src:src/core/ops.ts), using [tree.ts](src:src/core/tree.ts) for the tree rewriting and [notation.ts](src:src/core/notation.ts) for building cells from notation. For the ops as an agent writes them, see [Ops](/agents/ops/).

## The shape of the call

```ts
export function applyOp(doc: Doc, op: Op): Applied

export interface Applied {
  doc: Doc;
  op: Op;
  inverse: Op;
  touched: string[];
}
```

`applyOp` never mutates `doc` and never reads a clock, a random number or the network. It returns a new document that shares every unchanged cell with the old one, or throws an `OpError` and leaves everything as it was. Because it is pure, the browser, the server, the sync engine and the docs' doc-tests all use the very same function and get the same answer.

The verbs are listed in `OP_VERBS`:

::ref ops

`applyOps(doc, ops)` applies a list: one op as itself, several as `["do", …]`.

`applyOp` does not change `doc.v`. The version belongs to whoever saves the result: `change()` in [app.ts](src:src/server/app.ts) and `step()` in [sync.ts](src:src/server/sync.ts) both write `{ ...result.doc, v: doc.v + 1 }`.

## What happens inside

For any verb except `meta` and `do`, `applyOp` does the same five things:

1. `workOn(doc)` builds the working state: an id generator that continues from `doc.nextId` and skips ids already in use, the set of used ids, and the set of names.
2. `run()` picks the verb's function (`split`, `merge`, `remove`, `dup`, `swap`, `move`, `put`/`replace`, `set`/`name`, `style`, `draw`, `erase`). It resolves every cell reference with `must()`, which accepts an id or a name and throws `no cell called "…"` if neither matches. It returns the new root, the normalized op, the cells it touched and, sometimes, an inverse.
3. `normalize()` tidies the new root (see [The tidy tree](/internals/normalize/)).
4. `checkPanels()` enforces the one structural rule normalize can't: a `panel` sits only directly inside `tabs` or an `accordion`, and those hold only panels.
5. The result is assembled. `touched` is filtered to cells that still exist, and the document gets the new root and the generator's counter as `nextId`.

`meta` changes `doc.meta` and nothing else, so it skips steps 3 and 4. `do` applies its sub-ops one after another.

## The normalized op

What you pass in is a request; what comes back in `op` is a record. Names become ids, defaults are written out, and every id the op created is filled in, so replaying the record needs no choices.

```text
["split", "price", "col"]
→ ["split", "c5", "col", { "cell": ["empty", { "id": "c7" }], "group": "c8" }]
```

That is the **Quote** document from [the model](/internals/model/) with its **price** input split into a column. `price` became `c5`. The new empty cell got `c7`, and the column that now holds both got `c8`. The op names them, so every machine that replays it makes the same tree.

The same happens to the other verbs:

| You send | The record says |
| --- | --- |
| `["dup", "total"]` | `["dup", "c6", { "ids": ["c7"] }]`: the ids the copy got. |
| `["merge", "qty", "price"]` | `["merge", "c4", "c5"]`: the leaf cells it fused, in document order. |
| `["put", "total", ["text", "hi"]]` | `["replace", "c6", ["text", { "id": "c6", "name": "total" }, "hi"]]`. A `put` keeps the cell's identity and becomes a `replace` that spells it out. |
| `["name", "qty", "count"]` | `["set", "c4", "name", "count"]`. `name` is short for setting the name. |

Replaying the record on the original document gives the same tree (the property order inside an object may differ). One thing a replay does not do is move the id counter, because every id it needs is already in the op. `nextId` is a hint for *generating* ids; a normalized op never asks for one.

## The inverse

The second thing `applyOp` returns is `inverse`: an op that, applied to `doc`'s result, gives back the tree you started with. Undo is nothing more than dispatching it. There are three ways an inverse is made.

**Exact.** For a change to one place, the inverse puts the old value back:

```text
["set", "c4", "value", 3]   inverse   ["set", "c4", "value", 2]
["style", "c6", { "fg": "accent" }]   inverse   ["style", "c6", { "fg": null }]
["meta", "currency", "EUR"]   inverse   ["meta", "currency", null]
["swap", "c4", "c5"]   inverse   ["swap", "c4", "c5"]
```

A `null` in a `set`, `style` or `meta` means "remove it", so a property that wasn't there is restored by removing it. `put` and `replace` are exact too: the inverse is a `replace` of the new cell with the old subtree. `draw` and `erase` keep the diagram's elements in `value`, so theirs is a `set` of the old `value`.

**By anchor.** Splitting, merging, removing, duplicating and moving change the shape of the tree, and `normalize` may then dissolve groups the op never named. Instead of working out the opposite op, each of these verbs returns `anchors`: the cell's ancestors, deepest first, as they were before. `undoVia` takes the first anchor that still exists after the change and returns `["replace", anchor.id, <that anchor as it was>]`. If none survived it replaces the root.

Removing **price** shows why. Its row has two cells; after the removal the row has one, so normalize replaces the row with that cell. The row, `c3`, is gone, so the first surviving ancestor is the column `c1`, and the inverse restores all of `c1`:

```text
["remove", "c5"]
inverse   ["replace", "c1", ["col", { "id": "c1", "name": "quote" }, …the whole column as it was…]]
```

An undo of a structural change therefore rewrites the smallest piece of tree that is certain to hold everything the change touched.

**By order.** A `do` collects the inverses of its sub-ops and reverses them (`undo.unshift(r.inverse)`), so the last change is undone first.

> [!NOTE]
> An inverse is made against the document it was computed from. Applying it after someone else has changed the same cells can fail or restore too much. The browser's undo stack lives with that risk; see [The browser session](/internals/session/).

## do: several ops as one

```text
["do", ["set", "c4", "value", 4], ["set", "c4", "value", 5]]
inverse ["do", ["set", "c4", "value", 4], ["set", "c4", "value", 2]]
```

`do` applies each sub-op to the result of the one before, so a later op may refer to a cell an earlier one made. If any sub-op throws, the whole `do` throws and the document is as it was; there is no partial result. A `do` is one entry in the op log, one `ops` event on the stream and one undo step. Nested `do`s are allowed.

When a caller sends `[a, b]` to `applyOps`, the answer's `op` is `["do", a', b']` with each part normalized. The browser and the server unwrap it with `op.slice(1)` before sending or storing, so the log holds a flat list of ops.

## Things an op checks

Most of the work in `ops.ts` is refusing changes that would make a broken document:

- **Names.** `set … name` runs `checkName` (see [the model](/internals/model/)). A rename also rewrites every reference to the old name with `renameRefs`, in formulas, actions, styles, handlers, text templates and diagram labels, and `renameInMeta` does the same for the document's own handlers and actions. A reference inside `(quote …)` is left alone, and so is a name that a `fn` or `let` binds as its own variable.
- **Props.** `set` only accepts props in `SETTABLE`, and only `style` and `on` take a path such as `style.bg` or `on.click`. A size must be a weight, `"hug"` or `"120px"`; a style key must be known; an event name must be a name; `every` and `after` must be durations.
- **Structure.** `merge` refuses cells that aren't next to each other (`those cells are not next to each other`) or don't form a rectangle. `swap` refuses a cell and one inside it, and `move` refuses to put a cell next to something inside it. The last panel of tabs or an accordion can't be removed (`tabs keep at least one panel; remove the tabs instead`).
- **Ids.** An op that gives a cell an id already in use throws `id c3 is already taken`.

Try a rename on the **Quote** document from [the model](/internals/model/). The op changes the name; the formula that read it follows:

```notation id=quote title="The Quote document"
["col", {"name": "quote"},
  ["text", "Quote for Northwind Studio"],
  ["row",
    ["input", {"name": "qty", "type": "number", "value": 2}],
    ["input", {"name": "price", "type": "number", "value": 40}]],
  ["formula", {"name": "total", "format": "currency"}, ["*", "$qty", "$price"]]]
```

```ops id=renamed in=quote
[["set", "qty", "name", "count"]]
```

```sx in=renamed
count
⇒ 2
total
⇒ 80
(set! count 3)
total
⇒ 120
```

## OpError

```ts
export class OpError extends Error {}
```

`OpError` is the one error an op raises on purpose. `applyOp` also catches the `NotationError` that `build` throws for bad notation and rethrows it as an `OpError`, so a caller handles one class. The messages are written for a person or an agent to act on: `no cell called "nope"`, `unknown op "frob"` followed by the verbs it knows, `a panel only sits directly in tabs or an accordion`.

Who sees the message depends on who applied the op:

- **The server.** `app.onError` turns an `OpError` (and an `SxError`) into `422 { "error": message }`. Nothing was saved and nothing was published.
- **The browser.** `dispatch` applies the ops locally first. If that throws, a toast shows the message and the document doesn't change. If the local copy accepts an op the server then refuses (the server's document had moved on), `flush` drops the pending batch, shows `That change was not saved.` and the message, and rebases.
- **Sync.** `attempt()` in `sync.ts` catches the error and records the op as a conflict: a version that changes nothing. See [Sync](/internals/sync/).
- **Ask AI.** `validateOps` in `compose.ts` applies the proposed ops to a copy and reports the error before anything is applied. See [Compose](/internals/compose/).

## touched

`touched` lists the ids of the cells an op changed or made, for the interface to flash and for the server to approve secrets. It is not a diff. For `split` it is the cell and the new one; for `remove` it is the parent; for `set` it is the cell. Ids of cells that no longer exist are dropped, which is why the `remove price` example above reports none: the row it would name was dissolved.
