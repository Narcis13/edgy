---
title: Outline and notation
nav: Outline and notation
---

An agent reads a document as an outline and writes cells as notation: two compact forms of the same tree of [cells](term:cell), one made for reading and one made for writing. This page shows both, line by line.

An agent calls [edgy_read](tool:edgy_read) (or [GET /api/docs/:id/read](route:GET /api/docs/:id/read)) to get the outline, and sends notation inside ops such as [put](op:put) and [split](op:split), or when it creates a document with [edgy_create](tool:edgy_create).

## The outline

The outline is one line for every cell: its id, its kind, its name, what it holds and, when it has one, the value it works out. Here is a small document in notation:

```notation id=quote
["col",
  ["text", {"style": {"size": 28, "weight": 650}}, "Quote for {{client}}"],
  ["input", {"name": "client", "type": "text", "value": "Ada Lovelace"}],
  ["row", {"size": "hug"},
    ["input", {"name": "qty", "type": "number", "value": 2, "label": "Quantity"}],
    ["input", {"name": "price", "type": "number", "value": 40}],
    ["formula", {"name": "total", "format": "currency"}, ["*", "$qty", "$price"]]],
  ["tabs", {"name": "view"},
    ["panel", {"title": "Overview"},
      ["list", {"type": "check", "name": "todo"}, "Book the venue", {"text": "Send invites", "done": true}]],
    ["panel", {"title": "Flow"},
      ["diagram", {"name": "flow"},
        {"id": "a", "type": "rect", "text": "Order"},
        {"id": "b", "type": "rect", "text": "Ship"},
        {"type": "arrow", "from": "a", "to": "b"}]]],
  ["data", {"name": "vat"}, 0.2],
  ["button", {"icon": "plus", "do": ["set!", "qty", ["+", "$qty", 1]]}, "One more"]]
```

An agent that reads it (the document's id is `xebuqd2c`, its title Quote, at version 3) gets:

```text
"Quote" — doc xebuqd2c, version 3
c1 col
├─ c2 text "Quote for {{client}}" → "Quote for Ada Lovelace"
├─ c3 input:text client = "Ada Lovelace"
├─ c4 row [hug]
│  ├─ c5 input:number qty = 2
│  ├─ c6 input:number price = 40
│  └─ c7 formula total = (* qty price) → 80
├─ c8 tabs view 2 tabs, open "Overview"
│  ├─ c9 panel "Overview"
│  │  └─ c10 list:check todo 2 items
│  └─ c11 panel "Flow"
│     └─ c12 diagram flow 2 shapes, 1 connector
├─ c13 data vat (never shown) = 0.2
└─ c14 button "One more" do (set! qty (+ qty 1))
```

The tool adds what the outline can't show: after it, the line `No errors.`, or `Errors:` and one line for each cell that shows an error. [edgy_read](tool:edgy_read) can also give the [notation](#round-trips) of the same document.

### Reading a line

A line reads, from left to right: the id, the kind, the name, the room it takes, then what it holds, then any handlers, then its value.

| Part | What it says |
| --- | --- |
| `c7` | The cell's id. Ops take it, or the name. Edgy gives each cell an id (unless the notation wrote one) and the cell keeps it. |
| `input:number` | The kind, and for an [input](kind:input), a [list](kind:list) or a [chart](kind:chart) its type. A text cell is `text` alone. |
| `total` | The name, when the cell has one. Other cells read the cell by it. |
| `[hug]`, `[2]` | The room the cell takes in its row or col, when it isn't the usual 1. |
| `(hidden)` | The cell is hidden right now, because its `hidden` condition is true. |
| `= (* qty price)` | What the cell works out from, as an expression in the language's own syntax. For an input or a data cell it is the value itself. |
| `on click (set! …)` | A handler: the event, then the action. |
| `→ 80` | The value the cell works out now. Shown for formulas, stats, computed lists and text with `{{…}}` in it. |
| `→ ! no cell called "prise"` | The cell shows an error, and why. |

What follows the name depends on the kind:

| Kind | After the name |
| --- | --- |
| [text](kind:text) | The text in quotes. A line break is shown as `⏎`. |
| [formula](kind:formula), [chart](kind:chart), [stat](kind:stat) | `= ` and the expression. |
| [table](kind:table) | `= ` and the expression, or the number of typed rows; then `grouped by …`, `select … picked …` and the number of row actions, when it has them. |
| [list](kind:list) | `= ` and the expression, or the number of items. |
| [calendar](kind:calendar) | `events ` and the expression, then `picked ` and the day. |
| [canvas](kind:canvas) | The number of strokes. |
| [tabs](kind:tabs), [accordion](kind:accordion) | The number of panels and which are open. An accordion also says `one open at a time` or `any number open`. |
| [collapsible](kind:collapsible), [panel](kind:panel) | The title, and for a collapsible `open` or `folded`. |
| [diagram](kind:diagram) | The count of shapes and connectors, and of text elements when there are any. |
| [data](kind:data) | `(never shown)` and the value. |
| [timer](kind:timer) | How often it ticks (or `once, after …`) and `running` or `stopped`. |
| [fetch](kind:fetch) | The address, `every …`, and `idle`, `loading`, `ready` (then `→` the answer) or `failed: …`. |
| [input](kind:input) | `= ` and the value. |
| [button](kind:button) | The label in quotes and `do ` and the action. |
| [image](kind:image), [icon](kind:icon) | The source, or the icon's name. |

Text, expressions and values that are long are cut with `…`, so the outline stays short. Read the notation when you need a cell in full.

### Handlers, actions and errors

Before the cells, the outline lists the document's own handlers and custom actions, and any problem with an action. Here is a document with a handler on opening, a custom action, a typo in a formula, a hidden cell, a timer and a fetch cell. The `meta` part holds the document's own settings; the [meta](op:meta) op sets them.


```notation id=broken
{"meta": {
   "title": "Check",
   "on": {"open": ["set!", "qty", 1]},
   "actions": {"bump": ["fn", ["n"], ["set!", "qty", ["+", "$qty", "$n"]]]}},
 "root": ["col",
   ["input", {"name": "qty", "type": "number", "value": 8}],
   ["formula", {"name": "total"}, ["*", "$qty", "$prise"]],
   ["text", {"hidden": [">", "$qty", 5]}, "Total: {{total}}"],
   ["timer", {"name": "tick", "every": 30, "on": {"tick": ["set!", "qty", ["+", "$qty", 1]]}}],
   ["fetch", {"name": "rate", "every": 60}, "/api/demo/rate"]]}
```

```text
"Check" — doc k3m9x2ab, version 5
document on open (set! qty 1)
action bump (n) (set! qty (+ qty n))
c1 col
├─ c2 input:number qty = 8
├─ c3 formula total = (* qty prise) → ! no cell called "prise"
├─ c4 text (hidden) "Total: {{total}}" → ! total: no cell called "prise"
├─ c5 timer tick every 30 s running on tick (set! qty (+ qty 1))
└─ c6 fetch rate /api/demo/rate every 1 min idle
```

The error on `total` is the typo `prise`. The text that reads `total` shows an error too, with the name of the cell it came through.

Timers don't tick and fetch cells have no network in these pages, so the timer and the fetch line are shown here, not run. In a real document the timer counts and the fetch cell reads `ready` once its address has answered.

## Notation

Notation is the way an agent writes cells. A cell is a list:

```text
[kind, props?, ...body]
```

The kind comes first. Then, if the cell has properties, one object with them. Then the body, which depends on the kind. Both of these are optional:

```notation id=shape
["formula", {"name": "total", "format": "currency"}, ["*", "$qty", "$price"]]
```

The formula's kind is `formula`, its properties are the name and the format, and its body is the expression. The expression is a list too: a call written as JSON, where a text that starts with `$` reads the cell with that name. The same expression is shown as `(* qty price)` in the outline. See [The language](/language/).

### What the body is

| Kind | The body is |
| --- | --- |
| [row](kind:row), [col](kind:col) | The cells inside, in order. |
| [tabs](kind:tabs), [accordion](kind:accordion) | Panels: `["panel", {"title": "Details"}, …cells]`. With none written you get two, titled Tab 1 and Tab 2 (Section 1 and Section 2). |
| [panel](kind:panel), [collapsible](kind:collapsible) | The cells inside. With none, an empty cell. |
| [text](kind:text) | The text, in Markdown, with `{{…}}` templates. |
| [formula](kind:formula), [chart](kind:chart), [stat](kind:stat), [table](kind:table), [calendar](kind:calendar) | The expression. The rows typed into a table go in its `value` property. |
| [button](kind:button) | The label, and then, if you like, the action: `["button", "Add", ["set!", "n", 1]]`. |
| [image](kind:image) | The source. |
| [icon](kind:icon) | The icon's name. |
| [list](kind:list) | The items themselves. |
| [diagram](kind:diagram) | The elements. |
| [data](kind:data) | The value. |
| [fetch](kind:fetch) | The address. |
| [input](kind:input), [timer](kind:timer), [canvas](kind:canvas), [empty](kind:empty), [break](kind:break) | Nothing. Everything goes in the properties. |

Each kind's page lists its properties under **In notation**. Every cell can also have these:

| Property | What it is |
| --- | --- |
| `id` | The cell's id. Leave it out and edgy gives one (`c15`). |
| `name` | What other cells read it by. |
| `size` | Its room in a row or col: a weight (`2`), `"hug"` or a fixed `"120px"`. The usual weight, 1, is left out. |
| `style` | An object of [style keys](/styling/style-keys/): `{"bg": "accent-soft", "pad": 12}`. |
| `hidden` | `true`, or an expression: the cell disappears while it holds. |
| `on` | Handlers: `{"click": ["set!", "n", 1]}`. See [Events and actions](/events/). |

A property with the value `null` is left out.

### Bare strings, ids and names

A text among the cells of a row or col is a text cell, so these two are the same:

```notation id=bare
["row", "Left", ["text", "Right"]]
```

An `id` you write has to be free (`id c3 is already taken` otherwise). Write ids when a later op in the same request has to name the new cell. A `name` starts with a letter, then letters, digits, `-` or `_`; it can't be one of `true`, `false`, `nil`, `null`, `it`, `i` and `acc`, can't be another cell's name or id, and can't be taken twice in one notation.

### Tabs and lists

Tabs hold panels, and a panel holds whatever a column does. A list's items and a diagram's elements are the body:

```notation id=tabs
["tabs", {"name": "view", "value": "Details"},
  ["panel", {"title": "Overview"}, "Written for Northwind Studio."],
  ["panel", {"title": "Details"},
    ["list", {"type": "check", "name": "todo"},
      "Book the venue",
      {"text": "Send invites", "done": true}]]]
```

`value` on tabs is the open panel's title. The list holds one item given as text and one as a record.

### The cell as stored

A cell may also be written as the object it is stored as, with `children` for the cells inside: `{"kind": "text", "text": "Hi"}`. Prefer the list form; it is shorter and it is what edgy writes back.

### After an op

An op tidies the tree. A col with a single plain cell in it is replaced by that cell, so putting `["col", ["text", "x"]]` into a cell leaves a text. Give the group a `name`, a `style`, a `hidden` condition or a handler when it must stay.

## Round trips

Reading notation gives back what you could write. [edgy_read](tool:edgy_read) with `format: "notation"` (or `"both"`) and [GET /api/docs/:id/read?format=notation](route:GET /api/docs/:id/read) return the whole document as notation, with every cell's id in its properties:

```notation id=round
["col", {"id": "c1"},
  ["text", {"id": "c2"}, "Hello, {{name}}"],
  ["input", {"id": "c3", "name": "name", "type": "text", "value": "Ada"}],
  ["list", {"id": "c4", "type": "check"}, "Milk", {"text": "Eggs", "done": true}],
  ["button", {"id": "c5", "variant": "soft", "do": ["insert!", "people", {"name": "$name"}]}, "Save"]]
```

What was in the properties and belongs in the body moved there: the text of a text cell, the expression of a formula, the items of a list. The button's label is its body, and its action stays in the properties as `do`.

That notation can be put straight back. Take the part you want to change, edit it and send it with [put](op:put). The cell keeps its id, and the ids you leave in the notation stay as they are:

```ops in=round
[["put", "c3", ["input", {"name": "name", "type": "text", "value": "Grace"}]]]
```

The op comes back as a `replace` with the id written in, and its inverse is a `replace` with the old notation:

```text
op       ["replace","c3",["input",{"id":"c3","name":"name","type":"text","value":"Grace"}]]
inverse  ["replace","c3",["input",{"id":"c3","name":"name","type":"text","value":"Ada"}]]
```

Putting a document's whole notation into a new document, or replacing a cell with its own notation, gives the same notation back. What does not survive a round trip is what the tidying changes: a plain group with a single cell.

## Mistakes

A notation that doesn't build comes back as the message of the op it was in:

| Message | What is wrong |
| --- | --- |
| `a cell is written [kind, props?, ...body]` | The list doesn't start with a kind, or the value isn't a list or a string. |
| `unknown kind "blob"; known: row, col, …` | There is no such kind. The message lists them all. |
| `unknown property "foo" on row` | The property isn't one a cell can have. |
| `"1a" is not a usable name: start with a letter, then letters, digits, - or _` | The name is not allowed. |
| `another cell is already named "qty"` | Two cells with the same name. |
| `tabs hold panels, each with a title: ["panel", {"title": "Tab 1"}, …cells]` | A tabs or accordion holds something else than panels. |
| `unknown style "blob"; known: bg, fg, …` | A style key that doesn't exist. |
| `size must be a weight, "hug" or "120px", got …` | A size that isn't one of the three. |
| `on must be an object of event names and actions, like {"click": ["set!", "n", 1]}` | Handlers written as anything else. |
| `a list holds its items as a list` | A list given a value that isn't a list. |

Source: [notation.ts](src:src/core/notation.ts) (writing and reading cells), [outline.ts](src:src/core/outline.ts) (the outline). The same notation is how templates are written; see [Notation under the hood](/internals/notation/).
