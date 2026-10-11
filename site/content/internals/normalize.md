---
title: Normalizing the tree
nav: The tidy tree
---

After every op, edgy rewrites the cell tree so it has one canonical shape: no empty groups, no group holding a single cell, and no group nested in a group that lays out the same way. This page describes that pass, `normalize`, and the weights that keep the sizes of cells in step through it.

It describes [tree.ts](src:src/core/tree.ts), the file that reads and rewrites the tree, and where [ops.ts](src:src/core/ops.ts) calls it.

## Why a tidy tree

A person splits a cell, deletes one half, splits it again. Without a rule the document would pile up groups that mean nothing: a row holding a column holding a row holding one text cell. Those groups cost layout, confuse the grid detection that `merge` relies on, and make two documents that look the same differ.

So `normalize` is applied to the whole root at the end of every op (`applyOp` calls `normalize(r.root)`), and the tree you get back is always the tidy one. It is a function from a tree to a tree: it changes nothing else, and a tree that is already tidy comes back as the *same object*, so the work for an unchanged branch is a walk and a comparison.

```ts
export function normalize(node: Cell): Cell
```

## The three rules

`normalize` works bottom-up. It first normalizes each child, then looks at what that left in this group.

### A group with no cells becomes an empty cell

A `row` or `col` whose last cell was removed becomes an `empty` cell with the group's `id`, `name` and `size`. A group only gets there if it was kept by a name or a style (see the next rule), so the example is a named row holding one cell:

```notation id=gone title="A named row with one cell"
["col", {"name": "page"},
  ["text", {"name": "title"}, "Quote"],
  ["row", {"name": "r", "size": 2}, ["text", {"name": "a"}, "A"]]]
```

```ops id=gone-after in=gone
[["remove", "a"]]
```

Removing **a** leaves the row empty, and it becomes the cell `["empty", {"name": "r", "size": 2}]` in the same place.

The root can never be removed, so removing the only cell of a document leaves an empty root; `detach` in `ops.ts` returns `{ id, kind: 'empty' }` for that case, and for the last cell of a `panel` or `collapsible`.

### A group with one cell is replaced by it

A *plain* group with a single child is replaced by that child, which takes over the group's `size`. A plain group is a `row` or `col` that nobody has named or styled:

```ts
export const isPlain = (c: Cell) =>
  (c.kind === 'row' || c.kind === 'col') && !c.name && !c.style && c.hidden == null && c.on == null;
```

So a group stays as soon as it means something: a name (other cells read it), a style, a `hidden` condition or a handler. Tabs, accordions, collapsibles and panels are never plain. They are what the person made, even with one cell inside.

A column holding a title and a row of two cells; the second cell of the row is removed:

```notation id=page title="A page with a row"
["col", {"name": "page"},
  ["text", {"name": "title"}, "Quote"],
  ["row",
    ["text", {"name": "left"}, "Left"],
    ["text", {"name": "right"}, "Right"]]]
```

```ops id=page-after in=page
[["remove", "right"]]
```

The row had one cell left, so it dissolved. The column now holds the title and **left** directly:

```notation title="After removing right"
["col", {"name": "page"},
  ["text", {"name": "title"}, "Quote"],
  ["text", {"name": "left"}, "Left"]]
```

The same happens when two cells are merged into one: `["merge", "left", "right"]` leaves one text cell, **left**, with both texts joined by a blank line.

Because a row is gone, an undo of this change has to bring it back. That is why the inverse of a structural op replaces the smallest ancestor that still exists; see [Applying ops](/internals/ops/).

### A group inside a group that lays out the same way dissolves

A plain `col` inside a `col`, `panel` or `collapsible`, or a plain `row` inside a `row`, is flattened into its parent. A `row` inside a `col` stays: that is a line of a form, and a column of such rows is the grid `merge` can work on.

Dissolving a group has to keep what it was worth in its parent's eyes. Its children's weights are scaled so their total is the group's own weight:

```notation title="A column of weight 2 inside a column"
["col", {"name": "page"},
  ["text", {"name": "a"}, "A"],
  ["col", {"size": 2},
    ["text", {"name": "b"}, "B"],
    ["text", {"name": "c", "size": 3}, "C"]],
  ["text", {"name": "d"}, "D"]]
```

The inner column has weight 2, and its children weigh 1 and 3 (4 in all). They become `2 × 1/4 = 0.5` and `2 × 3/4 = 1.5`, and the document stores this:

```notation title="What is stored"
["col", {"name": "page"},
  ["text", {"name": "a"}, "A"],
  ["text", {"name": "b", "size": 0.5}, "B"],
  ["text", {"name": "c", "size": 1.5}, "C"],
  ["text", {"name": "d"}, "D"]]
```

Together **b** and **c** still take the same share of the page as the column did. If the dissolved group was `"hug"` or a fixed size, there is no weight to share out, so its weighted children become `"hug"` and its fixed ones keep their size.

A group that is named, styled, hidden or has a handler is not plain, so it stays as a group:

```notation title="A named column is kept"
["col", {"name": "page"},
  ["text", {"name": "a"}, "A"],
  ["col", {"name": "card"},
    ["text", {"name": "b"}, "B"],
    ["text", {"name": "c"}, "C"]]]
```

## Panels

A panel is shown whole, one at a time or folded, so a size means nothing on it. `normalize` removes `size` from any `panel` that has one. Panels are also exempt from the single-child rule, and `checkPanels` in `ops.ts` (not `normalize`) refuses a tree where a panel sits anywhere but directly inside tabs or an accordion.

## Weights and sizes

A cell's `size` is one of three things (`validSize`):

| Size | Meaning | `weight(c)` |
| --- | --- | --- |
| absent, or a number | A share of the free space. Absent is 1; the document never stores 1. | the number |
| `"hug"` | As small as its content. | `null` |
| `"120px"` | A fixed width or height. | `null` |

`weight()` is `null` for anything that is not a share, and every function that moves space around skips those cells. In the browser, `flexOf` in `look.ts` turns a weight into `flex: <weight> 1 0px`, `"hug"` into `flex: 0 0 auto` and `"120px"` into `flex: 0 0 120px`, so a weight is exactly a `flex-grow`.

Ops keep weights in step with the tree:

- **Splitting** a cell in a group of the same direction divides its weight: with the default ratio of 0.5, a cell of weight 2 becomes two of weight 1. A ratio of 0.25 gives 0.5 and 1.5. A `"hug"` or fixed cell keeps its size and the new cell gets the same one.
- **Splitting** in the other direction makes a new group. The two cells in it get `ratio × 2` and `(1 − ratio) × 2`, which sum to 2, so each has an average weight of 1. The new group takes the old cell's `size`.
- **Removing** a cell gives its weight to a neighbour that has one, the one before it if there is one, else the one after. A hug or fixed cell, or one with no weighted neighbour, hands nothing on.
- **Merging** cells that sit side by side adds their weights with `sumSize`.

```notation id=weights title="A cell of weight 2 and one of weight 1"
["row", {"name": "r"},
  ["text", {"name": "a", "size": 2}, "A"],
  ["text", {"name": "b"}, "B"]]
```

Splitting **a** side by side gives two cells of weight 1 beside **b**; removing **a** gives its 2 to **b**, which becomes 3 (and, alone in a named row, stays there):

```ops id=weights-after in=weights
[["split", "a", "row"]]
```

```text
["row", {"name": "r"},
  ["text", {"name": "a"}, "A"],      ← weight 1 (was 2, halved)
  ["empty"],                          ← weight 1 (the new cell)
  ["text", {"name": "b"}, "B"]]       ← weight 1, unchanged
```

All arithmetic goes through `round4`, which rounds to four decimals, so repeated halving doesn't drift into long fractions.

## The root

The root is the top of the tree, and its id changes when its shape does. Splitting the root in the other direction makes a new group, which becomes the root. Removing all but one cell of the root group leaves that cell as the root. This is why a document's root is not always `c1`, and why the inverse of an op on the root is a `replace` of whatever the root now is.

## Helpers in tree.ts

The rest of the file is small and everything else leans on it:

| Function | What it does |
| --- | --- |
| `walk`, `leaves` | Visit every cell in document order; collect the cells that hold no others. |
| `indexTree` | The `byId`, `byName`, `parent` and `pos` maps, cached per root. See [the model](/internals/model/). |
| `resolve`, `pathTo` | A cell from an id or name; the cells from the root down to one. |
| `rewrite(node, id, fn)` | Replace a cell with a cell, several siblings or nothing, copying only the path from the root to it. Every structural op is built on it. |
| `cloneTree` | Copy a subtree with fresh ids and names made unique (`price` becomes `price2`), for `dup`. |
