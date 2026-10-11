---
title: Notation and outline
---

Notation is how cells are written down as short JSON lists, and the outline is how a document is read as a compact tree of text. This page describes `build`, which turns notation into cells, `toNotation`, which turns them back, why the two round-trip, and `outline`, the view an agent reads.

It describes [notation.ts](src:src/core/notation.ts) and [outline.ts](src:src/core/outline.ts). For how agents write notation, see [Notation](/agents/notation/).

## The shape

A cell in notation is a list: its kind, then optional props in an object, then a body.

```notation id=quote title="The Quote, in notation"
["col", {"name": "quote"},
  ["text", "Quote for Northwind Studio"],
  ["row",
    ["input", {"name": "qty", "type": "number", "value": 2}],
    ["input", {"name": "price", "type": "number", "value": 40}]],
  ["formula", {"name": "total", "format": "currency"}, ["*", "$qty", "$price"]],
  ["button", {"do": ["set!", "qty", ["+", "$qty", 1]]}, "Add one"]]
```

`[kind, props?, ...body]`. If the first item after the kind is an object, it is the props; everything after it is the body. What the body *is* depends on the kind, and is the one thing notation decides for each kind (`BODY` in `notation.ts`):

| Kind | The body is | Stored as |
| --- | --- | --- |
| `row`, `col`, `panel`, `collapsible` | The child cells. | `children` |
| `tabs`, `accordion` | The panels. With none written, two to start from. | `children` |
| `text` | The text. | `text` |
| `formula`, `chart`, `table`, `calendar`, `stat` | The expression. | `expr` |
| `button` | The label, then optionally the action. | `label`, `do` |
| `image`, `icon` | The source, the icon name. | `src`, `icon` |
| `data` | The value. | `value` |
| `fetch` | The address. | `url` |
| `list`, `diagram` | The items, the elements. | `value` |

A bare string among the children of a group is a text cell, so `["col", "Hello"]` works. The same cell may also be given as an object, `{"kind": "text", "text": "Hello"}`: `build` accepts it too, which is how a stored cell is fed back in.

## From notation to cells

```ts
export function build(n: Json, ctx: BuildCtx): Cell

export interface BuildCtx {
  gen: () => string;
  /** Ids already taken. Explicit ids are checked against it and added to it. */
  used: Set<string>;
  names: Set<string>;
}
```

`build` is where untrusted JSON becomes a cell, so it is where most of the checks are. It runs in this order:

1. **Kind.** A string is a text cell. A list needs its first item to be a string; an object needs a `kind`. An unknown kind throws `unknown kind "…"` followed by the kinds it knows.
2. **Id.** `props.id`, if given, must be free (`id c3 is already taken`) and is then reserved. Otherwise `ctx.gen()` makes the next one.
3. **Props.** Each one is checked as it is copied. A prop that isn't in `SETTABLE` throws `unknown property "…" on button`. `name` goes through `checkName`; `size` through `validSize`; `style` through `checkStyle`, which refuses unknown style keys; `on` through `checkOn`; `every`, `after` and `headers` through their own checks. `null` props are skipped, which is how an absent prop is written.
4. **Body.** It is put where the table above says, unless the same prop was also given in the object. A group builds its children recursively, and tabs and accordions refuse anything that isn't a panel. `diagram` elements go through `prepareDiagram`.

Every error is a `NotationError`; `applyOp` turns it into an `OpError` (see [Applying ops](/internals/ops/)).

Ids and names are checked against `ctx` as the build goes. The `ctx` an op builds with is a working copy (`workOn` in `ops.ts`), so a build that throws leaves the document as it was.

`build` is the one door for new cells. `put`, `replace` and the `cell` option of `split` call it. So do the templates, `POST /api/docs` with a `root`, and the agents' [edgy_create](tool:edgy_create). A cell can't get into a document without going through the same checks.

## From cells to notation

```ts
export function toNotation(cell: Cell, withIds = true): Json
```

`toNotation` is the inverse. It splits a cell into its kind, its props and a body, putting the body prop out of the props object. It writes `id` into the props first, unless `withIds` is false.

```text
toNotation(root)
["col",{"id":"c1","name":"quote"},
  ["text",{"id":"c2"},"Quote for Northwind Studio"],
  ["row",{"id":"c3"},
    ["input",{"id":"c4","name":"qty","type":"number","value":2}],
    ["input",{"id":"c5","name":"price","type":"number","value":40}]],
  ["formula",{"id":"c6","name":"total","format":"currency"},["*","$qty","$price"]],
  ["button",{"id":"c7","do":["set!","qty",["+","$qty",1]]},"Add one"]]

toNotation(root, false)
["col",{"name":"quote"},
  ["text","Quote for Northwind Studio"],
  …]
```

The props object is left out when there is nothing to put in it, and kept when the body's first item is itself an object, so `build` never mistakes a body for props.

With ids, the notation is complete: `build(toNotation(cell))` is the same cell, and `toNotation(build(n))` is the same notation, apart from the order of keys and the defaults the model never stores (a `size` of 1). Without ids it is what a person or an agent would write, and what the docs' examples show. The first form is what the system uses to move subtrees around.

### Where it is used

Wherever a subtree has to be written down, it is notation with ids:

- **Normalized ops.** A `split` carries `{"cell": ["empty", {"id": "c7"}]}`; a `put` becomes `["replace", "c6", [...]]`.
- **Inverse ops.** An undo of a structural change is a `replace` with the old subtree in notation (see [Applying ops](/internals/ops/)). The undo stack in the browser and the op log on the server therefore hold nothing but JSON lists.
- **Reading a document.** [GET /api/docs/:id/read](<route:GET /api/docs/:id/read>) returns the `outline` by default; `?format=notation` gives the notation instead (with ids, so an agent can name any cell) and `?format=both` gives both.

## The outline

Notation is complete but long. The outline is short and meant for reading: one line per cell.

```text
"Quote" — doc k3m9x2qa, version 1
c1 col quote
├─ c2 text "Quote for Northwind Studio"
├─ c3 row
│  ├─ c4 input:number qty = 2
│  └─ c5 input:number price = 40
├─ c6 formula total = (* qty price) → 80
└─ c7 button "Add one" do (set! qty (+ qty 1))
```

`outline(doc, computed?)` writes the title, the document id and its version, then the document's own handlers and custom actions, then the tree with box-drawing characters. Each cell's line is built by `line()`:

```text
<id> <kind>[:<type>] [<name>] [[<size>]] [(hidden)] <kind-specific summary> [on <event> <action>]… [→ <value> | → ! <error>]
```

- The **id** and **kind** come first, so an agent can name a cell in its next op without asking. An input shows its type (`input:number`); a text cell does not.
- The **summary** is what is useful about the kind: a text's words, a formula's expression (`= (* qty price)`), a table's expression or the number of rows typed into it, a button's label and action, a timer's schedule and whether it runs, a fetch cell's address and state.
- With a `computed` result, formulas, stats and templated texts add `→ <value>`. A cell with an error shows `→ ! <message>` instead (groups don't, unless they have handlers, since a group's error is a child's).
- Long pieces are cut: text at 64 characters, values at 80, expressions at 90, each with an ellipsis.

The outline is what `view()` in [app.ts](src:src/server/app.ts) puts in `outline`, so it is what [edgy_read](tool:edgy_read) gives an agent, and `systemPrompt` in [compose.ts](src:src/server/compose.ts) puts the same text in front of the model when it writes code for a cell (see [Compose](/internals/compose/)). The expressions in it are printed with `print`, so they look as people type them.

The three views of a document are the same data at different sizes: the JSON in [the model](/internals/model/) for the machine, notation for writing, the outline for reading.
