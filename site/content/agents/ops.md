---
title: Ops
---

An op is one change to a document, written as a short list that starts with a verb: `["split", "c4", "row"]`. Every change a person or an agent makes is an op, and an agent changes a document by sending ops to [POST /api/docs/:id/ops](route:POST /api/docs/:id/ops) or to the [edgy_apply](tool:edgy_apply) tool.

An agent reads the document first ([the outline](/agents/notation/)), then sends the smallest list of ops that does what the person asked, then reads the answer: the new outline and the cells that now show an error.

## How ops work

An op is a JSON list: the verb first, then its arguments. The verbs are listed [below](#the-ops), each with the form it takes.

```json
["set", "qty", "value", 5]
```

**Cells by id or name.** Wherever an op takes a cell, you give its id (`c3`) or its name (`qty`). Ids are given by edgy and never change; a name is whatever the person or the agent chose, and it follows a rename: [name](op:name) rewrites every formula, action and text template that read the old one. The ops you get back always use ids.

**Several ops at once.** The ops in one request are applied together or not at all. The server wraps them in a [do](op:do) op: each op sees what the ones before it made, and if one of them fails the document stays exactly as it was and you get that op's message. The history records them as one change that lists each op.

**Fresh ids.** An op that makes cells, like [split](op:split) or [dup](op:dup), picks their ids. Give the id yourself when a later op in the same list needs to name the new cell: `["split", "body", "row", {"id": "side"}]`.

::diagram op-life

### Sending ops

Send `{"ops": [...]}` with an `actor` that names the agent. An agent that holds an API key is shown in **Activity** as the agent acting for its person ("Claude for Ada"); the name comes from `actor.name`, or from the key's name when `actor` is left out.

```http
POST /api/docs/xebuqd2c/ops
Authorization: Bearer edgy_…
Content-Type: application/json

{"actor": {"kind": "agent", "name": "Claude"},
 "ops": [["set", "qty", "value", 4]]}
```

The answer for an agent carries the ops as they were applied, the cells they touched, and the document as the outline shows it:

```json
{
  "ops": [["set", "c3", "value", 4]],
  "touched": ["c3"],
  "id": "xebuqd2c", "title": "Quote", "v": 3, "meta": {"title": "Quote"},
  "outline": "\"Quote\" — doc xebuqd2c, version 3\nc1 col\n…",
  "values": {"client": "Ada Lovelace", "qty": 4, "total": 160},
  "errors": {}
}
```

`v` goes up by one for each request, however many ops it holds. `values` has every named cell that has a value; `errors` has every cell that shows an error, by name or id. Add `"format": "both"` to get the notation as well, or `"notation"` for the notation alone. A request from a person, not an agent, gets only `v`, `ops` and `touched`.

Three things to know about the request:

- **Without a key in local mode,** a request is a person's unless the `actor` says `{"kind": "agent", …}`. On a server that asks people to sign in, only a request with an API key counts as an agent.
- **An agent's change runs the document.** If someone has the document open in **Live**, the server runs the handlers that the change sets off, once. See [Who runs what](/events/who-runs-what/).
- **`client` and `batch`** are for edgy's own pages. Leave them out.

If the ops don't apply, you get `422` and `{"error": "…"}` with the message of the first op that failed. A body that isn't `{"ops": [[verb, …], …]}` gets `400`. See [the HTTP API](/agents/http/) for who may send ops.

### What an op returns

Applying an op gives back three things:

- **The op, filled in.** Every id the op made is written into it, so replaying it later makes the same cells. The cell you named by a name comes back as its id. Two verbs come back as another: [name](op:name) as a `set`, and [put](op:put) as a `replace`. This is what [POST /api/docs/:id/ops](route:POST /api/docs/:id/ops) answers in `ops`, and what [GET /api/docs/:id/log](route:GET /api/docs/:id/log) lists.
- **The inverse,** the op that puts the document back. A browser keeps it for undo; the server doesn't send it. [set](op:set), [style](op:style), [swap](op:swap), [meta](op:meta), [put](op:put), [replace](op:replace), [draw](op:draw) and [erase](op:erase) have an exact inverse. [split](op:split), [merge](op:merge), [remove](op:remove), [dup](op:dup) and [move](op:move) have none, so their inverse is a [replace](op:replace) of the nearest group around them that is still there, with the notation it had before. A [do](op:do) has a `do` of the inverses, last first.
- **The touched cells:** the ids of the cells the op made or changed that are still in the document.

After every op the tree is tidied. A row or col with nothing in it becomes an empty cell. A plain group (no name, style, `hidden` or handlers) with one cell in it is replaced by that cell, and a plain group inside a group that runs the same way dissolves into it. Tabs, accordions, collapsibles and panels are never dissolved. This is why `["col", ["text", "x"]]` comes back as the text alone.

## The ops

::ref ops

Each entry below has an example: a document in [notation](/agents/notation/), then the ops applied to it.

::: op split
`["split", cell, "row" | "col", {before?, ratio?, cell?, id?, group?}]`

Divides a cell in two. `"row"` puts the new cell beside it, `"col"` puts it below. The new cell is empty unless you give its notation in `cell`; `ratio` (0.05 to 0.95, default 0.5) is the share the old cell keeps, and `before: true` puts the new cell first.

When the cell already sits in a group that runs the same way, the new cell joins that group and the two share the old cell's room. Otherwise edgy makes a new group around them, with the id in `group` or a fresh one.

```notation id=op-split
["col",
  ["text", {"id": "title"}, "Quote"],
  ["text", {"id": "body"}, "Thanks for asking."]]
```

```ops in=op-split
[["split", "body", "row", {"ratio": 0.7, "cell": ["input", {"name": "qty", "type": "number", "value": 2}]}]]
```

The row holds `body` (70% of the width) and a new input (30%). The op comes back with the new ids written in:

```text
op       ["split","body","row",{"ratio":0.7,"cell":["input",{"id":"c2","name":"qty","type":"number","value":2}],"group":"c3"}]
inverse  ["replace","c1",["col",{"id":"c1"}, …]]
```

Splitting a panel of [tabs](kind:tabs) or an [accordion](kind:accordion) adds a panel beside it, so `cell` has to be a panel: `["panel", {"title": "…"}, …cells]`.

Errors: `split direction is "row" (side by side) or "col" (stacked)`, `no cell called "…"`.
:::

::: op merge
`["merge", cell, cell, …]`

Fuses cells that sit next to each other into one. Name the cells, or a whole row or col; for a rectangle of a grid, name every cell in it.

The merged cell keeps the first cell that holds something. When every cell you merge is text, their text is joined with a blank line; for any other mix the others' content is dropped. The merged cell takes the room of all of them.

```notation id=op-merge
["row",
  ["text", {"id": "a"}, "One"],
  ["text", {"id": "b"}, "Two"],
  ["text", {"id": "c"}, "Three"]]
```

```ops in=op-merge
[["merge", "a", "b"]]
```

`a` now holds "One", a blank line and "Two", and takes two thirds of the row. The op comes back as it was written, and its inverse is a `replace` of the row.

Errors: `merge needs at least two cells`, `those cells are not next to each other`, `those cells don't form a rectangle`, and for cells in different panels `cells in different tabs can't be merged; move them into one first`.
:::

::: op remove
`["remove", cell]`

Deletes a cell and everything in it. A neighbour takes the room it had. The last cell in a panel or a collapsible leaves an empty cell behind, and so does the root.

```notation id=op-remove
["col",
  ["text", {"id": "a"}, "One"],
  ["text", {"id": "b"}, "Two"],
  ["text", {"id": "c"}, "Three"]]
```

```ops in=op-remove
[["remove", "b"]]
```

`a` now takes the room `b` had. The op touches the group it left, `c1`.

Formulas that read a removed cell by name show `no cell called "…"` until you give them something else to read.

Errors: `tabs keep at least one panel; remove the tabs instead` (the same for an accordion).
:::

::: op dup
`["dup", cell, {ids?, group?}]`

Copies a cell, and everything in it, right after itself. The copy gets fresh ids, and a name gets the next free number: `total` becomes `total2`. A copied panel gets a free title. Copying the root puts both in a new col.

```notation id=op-dup
["col",
  ["input", {"id": "q", "name": "qty", "type": "number", "value": 2}],
  ["input", {"id": "p", "name": "price", "type": "number", "value": 40}],
  ["formula", {"id": "t", "name": "total"}, ["*", "$qty", "$price"]]]
```

```ops in=op-dup
[["dup", "t"]]
```

The copy is a formula named `total2` that reads the same cells. The op comes back as `["dup","t",{"ids":["c2"]}]`; send `ids` yourself to choose the new ids, one for each cell the copy holds.
:::

::: op swap
`["swap", cell, cell]`

Exchanges two cells. Each keeps its content and its id; the room stays with the place, so the other cell takes it.

```notation id=op-swap
["col",
  ["text", {"id": "a"}, "One"],
  ["text", {"id": "b"}, "Two"],
  ["text", {"id": "c"}, "Three"]]
```

```ops in=op-swap
[["swap", "a", "c"]]
```

The inverse of a swap is the same swap: `["swap","a","c"]`.

Errors: `swap needs two different cells`, `a cell can't swap with one inside it`, `a panel only swaps with another panel`.
:::

::: op move
`["move", cell, ref, "before" | "after"]`

Takes a cell out and puts it next to another cell, before or after it (after, when you leave it out). The place it leaves is closed up by a neighbour.

```notation id=op-move
["col",
  ["text", {"id": "a"}, "One"],
  ["text", {"id": "b"}, "Two"],
  ["text", {"id": "c"}, "Three"]]
```

```ops in=op-move
[["move", "a", "c", "after"]]
```

The order is now Two, Three, One.

Errors: `move places a cell "before" or "after" another`, `a cell can't move next to something inside it`, `nothing can sit beside the root; split it instead`. A panel moves only beside another panel, and any other cell only beside a cell that isn't a panel.
:::

::: op put
`["put", cell, notation]`

Gives a cell new content and keeps who it is: the cell keeps its id, its name (when the notation doesn't give one and the name is free) and its room. This is the fastest way to build: put a whole nested row or col into the empty first cell.

```notation id=op-put
["col",
  ["text", {"id": "a", "name": "intro"}, "Draft"],
  ["text", {"id": "b"}, "Body"]]
```

```ops in=op-put
[["put", "intro", ["text", "Hello, Ada."]],
 ["put", "b", ["row", ["text", "Net"], ["text", "Tax"]]]]
```

The first op changes the text and keeps the name `intro`. The second makes `b` a row of two text cells. Cells inside the notation that don't name an id get fresh ones.

The op comes back as a [replace](op:replace) with the cell's id written in, and its inverse is a `replace` with the notation the cell had.

```text
op       ["replace","b",["row",{"id":"b"},["text",{"id":"c2"},"Net"],["text",{"id":"c3"},"Tax"]]]
inverse  ["replace","b",["text",{"id":"b"},"Body"]]
```

Errors: `put needs the new cell: ["put", cell, [kind, props?, ...body]]`, and any message of the [notation](/agents/notation/#mistakes), such as `unknown kind "…"`.
:::

::: op replace
`["replace", cell, notation]`

Swaps the whole subtree of a cell for new notation. Nothing is kept: the new cell has the id the notation gives, or a fresh one, and no name unless the notation names it. Undo and the history use it. For building, [put](op:put) is the one to use.

```notation id=op-replace
["col",
  ["text", {"id": "a", "name": "intro"}, "Draft"],
  ["text", {"id": "b"}, "Body"]]
```

```ops in=op-replace
[["replace", "a", ["formula", {"name": "total"}, ["+", 1, 2]]]]
```

`a` is gone; a formula named `total` with a fresh id (`c2`) stands in its place. The inverse is `["replace","c2",["text",{"id":"a","name":"intro"},"Draft"]]`.

Errors: the same as [put](op:put).
:::

::: op set
`["set", cell, "prop", value]`

Sets one property of a cell. A property is a word like `value`, `expr`, `text`, `label`, `format` or `hidden`, or a part of `style` or `on` written `style.bg` or `on.click`. `null` takes the property away. The full list of what can be set is `SETTABLE` in [notation.ts](src:src/core/notation.ts); the properties are the same ones you write in a cell's [notation](/agents/notation/).

```notation id=op-set
["col",
  ["input", {"id": "q", "name": "qty", "type": "number", "value": 2}],
  ["input", {"id": "p", "name": "price", "type": "number", "value": 40}],
  ["formula", {"id": "t", "name": "total"}, ["*", "$qty", "$price"]]]
```

```ops in=op-set
[["set", "qty", "value", 5],
 ["set", "total", "expr", ["+", ["*", "$qty", "$price"], 10]]]
```

The total is now `(+ (* qty price) 10)` and shows 210. The ops come back with the cells as ids, `["set","q","value",5]`, and each inverse sets the old value: `["set","q","value",2]`.

Setting `name` renames the cell the way [name](op:name) does. Setting a tab panel's `title` keeps that panel open when it was the open one. A cell's kind can't be set: use [put](op:put).

Errors: `"…" can't be set; settable: …. Use put to change the kind.`, `set needs a property: ["set", cell, "value", 3]`, `only style and on have nested properties, like "style.bg" or "on.click"`, and the checks of the property: `text must be a string`, `size is a weight like 2, "hug", or a fixed "120px"`.
:::

::: op name
`["name", cell, "new-name" | null]`

Gives a cell a name, or takes it away with `null`. It is a short way to write `["set", cell, "name", …]` and comes back as that. Every formula, action, style, text template and document handler that read the old name now reads the new one. A name starts with a letter and holds letters, digits, `-` and `_`.

```notation id=op-name
["col",
  ["input", {"id": "q", "name": "qty", "type": "number", "value": 2}],
  ["formula", {"id": "t", "name": "total"}, ["*", "$qty", 40]]]
```

```ops in=op-name
[["name", "qty", "amount"],
 ["name", "amount", null]]
```

After the first op the formula reads `(* amount 40)`. After the second it reads the cell by id: `(* q 40)`. The first op comes back as `["set","q","name","amount"]`, with the inverse `["set","q","name","qty"]`.

Errors: `"…" is not a usable name: start with a letter, then letters, digits, - or _`, `another cell is already named "…"`, `"…" is the id of another cell`, `"true" is reserved` (also `false`, `nil`, `null`, `it`, `i` and `acc`).
:::

::: op style
`["style", cell, {key: value, …}]`

Sets several style keys at once. `null` removes a key. A value is a number, text or an expression, as the key allows: see [style keys](/styling/style-keys/) for each.

```notation id=op-style
["col",
  ["text", {"id": "a"}, "Hi"],
  ["text", {"id": "b"}, "There"]]
```

```ops in=op-style
[["style", "a", {"bg": "accent-soft", "pad": 12}],
 ["style", "a", {"pad": null}]]
```

After both ops `a` has the soft accent background and no padding of its own. The first inverse is `["style","a",{"bg":null,"pad":null}]`: it puts back what each key was, and `null` for a key that wasn't there.

Errors: `style needs an object: ["style", cell, {"bg": "accent-soft"}]`, `unknown style "…"; known: …`.
:::

::: op draw
`["draw", diagram, element, …]`

Adds elements to a [diagram](kind:diagram) cell, or changes the ones whose `id` already exists. A field set to `null` is removed. An element has a `type` (`rect`, `ellipse`, `diamond`, `text`, `arrow` or `line`), an optional `id` and `text`, and a place and size (`x`, `y`, `w`, `h`). An arrow has `from` and `to`: the ids of the elements it joins. A box with no `x` and `y` is laid out below the box an arrow comes from.

```notation id=op-draw
["col",
  ["text", "Flow"],
  ["diagram", {"id": "d", "name": "flow"}]]
```

```ops in=op-draw
[["draw", "flow",
   {"id": "order", "type": "rect", "text": "Order placed"},
   {"id": "ship", "type": "rect", "text": "Shipped"},
   {"type": "arrow", "from": "order", "to": "ship", "text": "pack"}],
 ["draw", "flow", {"id": "ship", "text": "Delivered", "fill": "accent-soft"}]]
```

The first op adds two boxes and an arrow between them. The second changes the text of `ship` and fills it. The first op comes back with the places and the new arrow's id filled in:

```text
op       ["draw","d",{"id":"order","type":"rect","text":"Order placed","x":40,"y":40,"w":160,"h":64},
          {"id":"ship","type":"rect","text":"Shipped","x":40,"y":176,"w":160,"h":64},
          {"type":"arrow","from":"order","to":"ship","text":"pack","id":"e1"}]
inverse  ["set","d","value",null]
```

The inverse puts the diagram's whole list of elements back, which is why it is a `set`.

Errors: `"…" is not a diagram`, `draw needs elements: ["draw", diagram, {"type": "rect", "text": "Start"}, …]`, and a message about the element, such as `element 2 has type "blob"; known: rect, ellipse, diamond, text, arrow, line`.
:::

::: op erase
`["erase", diagram, id, …]`

Removes elements from a diagram, and the arrows and lines that are attached to them.

```notation id=op-erase
["col",
  ["text", "Flow"],
  ["diagram", {"id": "d", "name": "flow"},
    {"id": "order", "type": "rect", "text": "Order placed"},
    {"id": "ship", "type": "rect", "text": "Shipped"},
    {"id": "pack", "type": "arrow", "from": "order", "to": "ship"}]]
```

```ops in=op-erase
[["erase", "flow", "ship"]]
```

`ship` and the arrow that ended at it are gone; the outline now reads "1 shape, 0 connectors". The inverse is a `set` of the diagram's `value` to the list it had.

Errors: `the diagram has no element "…"`, `"…" is not a diagram`.
:::

::: op meta
`["meta", key, value]`

Changes a setting of the document itself, not of a cell: its `title`, its `description` (shown on its card and found by search), the page setup (`page`, `orientation`, `margin`, `footer`), `width`, `currency`, `font`, `headFont`, `fontSize`. `null` removes a setting.

Two keys reach into a part: `on.open` (or `on.<event>`) sets one of the document's [handlers](/events/), and `actions.<name>` defines or removes one [custom action](/events/custom/). An action is a function: `["fn", ["who"], …actions]`.

```notation id=op-meta
["col",
  ["text", "x"],
  ["text", "y"]]
```

```ops in=op-meta
[["meta", "title", "Quote"],
 ["meta", "description", "A quote for Northwind Studio"],
 ["meta", "actions.greet", ["fn", ["who"], ["set!", "hello", ["str", "Hi ", "$who"]]]],
 ["meta", "on.open", ["set!", "hello", "Welcome"]]]
```

A `meta` op touches no cell, so `touched` is empty. Its inverse sets the old value back: `["meta","title","Untitled"]`, and `null` for a key that wasn't set. A document always has a title; removing it makes it "Untitled".

Errors: `meta needs a key: ["meta", "title", "Budget"]`, `only on and actions have parts, like "on.open" or "actions.greet"`, `a description is text: …`, `an action is written as a function: …`, `"…" is not a usable action name: …`, `"…" is not an event name: …`.
:::

::: op do
`["do", op, op, …]`

Applies the ops in order, all or nothing. Each op sees what the ones before it made. If one fails, the whole `do` fails with that op's message and the document is untouched. The server makes a `do` of the ops you send in one request, so you seldom write one yourself; write it when a list of ops has to count as one op inside a larger one.

```notation id=op-do
["col",
  ["input", {"id": "q", "name": "qty", "type": "number", "value": 2}],
  ["formula", {"id": "t", "name": "total"}, ["*", "$qty", 40]]]
```

```ops in=op-do
[["do",
   ["set", "qty", "value", 4],
   ["set", "total", "expr", ["*", "$qty", 50]]]]
```

The quantity is 4 and the total reads `(* qty 50)`, which shows 200. The op comes back with ids, `["do",["set","q","value",4],["set","t","expr",["*","$qty",50]]]`, and its inverse undoes them in the opposite order: `["do",["set","t","expr",["*","$qty",40]],["set","q","value",2]]`.

A `do` that holds a bad op, like `["do", ["set","qty","value",4], ["set","nope","value",1]]`, answers `no cell called "nope"` and leaves `qty` at 2.
:::

## When an op fails

Every message above comes back in `{"error": "…"}` with status `422`, or as the text of the tool's answer when you use [edgy_apply](tool:edgy_apply). They say what was wrong in the op's own words, so an agent can read them and send a better op. The ones an agent meets most:

- `no cell called "…"`: the cell was renamed or removed. Read the document again.
- `unknown op "…"; known: …`: the verb isn't one of the list above.
- `an op is written ["verb", …args]`: the list is empty or doesn't start with a text verb.
- `unknown kind "…"`, `unknown property "…" on …`: the notation in a [put](op:put) or [split](op:split) is wrong. See [Mistakes in notation](/agents/notation/#mistakes).

A failed request changes nothing and writes nothing to the history.

Source: [ops.ts](src:src/core/ops.ts) (the verbs), [tree.ts](src:src/core/tree.ts) (finding cells and tidying the tree), [notation.ts](src:src/core/notation.ts) (what a new cell may hold). How edgy keeps and replays them is in [Ops, undo and the log](/internals/ops/).
