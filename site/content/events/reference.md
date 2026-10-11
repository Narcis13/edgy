---
title: Every event
---

This page lists every event a cell or the document can raise, who raises it, when it fires and what data it hands to a handler.

An event reaches only the handlers of the cell that raised it, except a [custom event](/events/custom/), which reaches every cell. Which events a kind raises is fixed: a [table](kind:table) can raise `pick`, a [timer](kind:timer) can raise `tick`, and a [row](kind:row) raises nothing. Each cell's page lists its events under **Events**.

::ref events

## The names a handler finds

An event hands its data to the handler by name. These are all the names there are; each event below says which of them it binds.

| Name | What it holds |
| --- | --- |
| `value` | The cell's value after the event: the text typed, `true` or `false`, the picked day, the open tab's title. |
| `was` | The cell's value before. `nil` when it had none. |
| `row` | A table row, as a record: `(get row "name")`. |
| `item` | A list item: its text, or for a checklist the record `{text "Book" done true}`. |
| `index` | A position, counting from 0: of the row in the table's value, of the item in the list. |
| `element` | A shape in a diagram, as a record. |
| `rows` | The records a table has picked. |
| `title` | The name of an accordion section. |
| `count`, `at` | A timer's number of ticks and the moment of the tick. |
| `data`, `message`, `status` | What a fetch got, or why it failed. |
| `payload`, `from` | What a custom event was sent with, and the cell that sent it. |

Every handler also finds `target` and `event`, described in [Events and actions](/events/).

## The events

::: event click
A person clicked or tapped the cell in **Live**. The cells that raise it are the ones that show something ([text](kind:text), [formula](kind:formula), [stat](kind:stat), [chart](kind:chart), [image](kind:image), [icon](kind:icon), [list](kind:list), [table](kind:table), [calendar](kind:calendar), [diagram](kind:diagram)), and [input](kind:input) and [button](kind:button).

```live id=click title="Click a text, click a row" height=300
["col", {"style": {"gap": 8}},
  ["data", {"name": "clicks"}, 0],
  ["data", {"name": "picked"}, "nobody"],
  ["text", {"style": {"bg": "accent-soft", "radius": 8, "pad": 12},
            "on": {"click": ["set!", "clicks", ["+", "$clicks", 1]]}}, "Click this cell. Clicks so far: **{{clicks}}**"],
  ["table", {"name": "people", "search": false, "columns": ["name", "role"],
             "value": [{"name": "Ada Lovelace", "role": "Mathematician"}, {"name": "Grace Hopper", "role": "Admiral"}],
             "on": {"click": ["set!", "picked", ["get", "$row", "name"]]}}],
  ["text", "You clicked **{{picked}}**."]]
```

The text cell has no data of its own to hand over, only `target`. A table hands over the row that was clicked, as a record in `row`, and `index`, its position in the table's value counting from 0 (a search or a sort doesn't change it). A click on a table that is not on a row gives `row` and `index` as `nil`. A list hands over `item` and `index` the same way, and a diagram `element`: the shape clicked, as a record, or `nil` for the background.

A click on something inside the cell that does its own job (a button, a link, a tick box, a tab) is not a click on the cell, and a click on a cell inside another is a click on the inner one only. An [input](kind:input) is itself a control, so clicking into it counts.

A button raises `click` when it is pressed. Its `do` runs first, then the `click` handler, which sees what `do` changed.

The cells that look like plain content (text, formula, stat, chart, image, icon) can be reached with the keyboard when they handle a click: **Tab** moves to one and **Enter** or **Space** runs the handler, as if it had been clicked.

If the same cell also handles `dblclick`, a single click waits before it runs. See [dblclick](#event-dblclick).
:::

::: event dblclick
A person double-clicked the cell. Plain content cells, [lists](kind:list), [tables](kind:table) and [diagrams](kind:diagram) raise it; an input, a button and a calendar do not.

```live id=dblclick title="One click or two" height=150
["col", {"style": {"gap": 8}},
  ["data", {"name": "what"}, "nothing yet"],
  ["text", {"style": {"bg": "sunken", "radius": 8, "pad": 12},
            "on": {"click": ["set!", "what", "a single click"],
                   "dblclick": ["set!", "what", "a double-click"]}}, "Click once or twice here"],
  ["text", "That was **{{what}}**."]]
```

A cell that handles both events has to decide, on the first click, whether a second one is coming. So its `click` handler waits **250 ms** after a single click. If a second click arrives within that time, only `dblclick` runs; `click` does not run at all. A third click in a row does nothing.

A cell that handles only `click` doesn't wait: its handler runs at once, on every click, so two quick clicks run it twice. A cell that handles only `dblclick` ignores single clicks.

The data is the same as for [click](#event-click): `row` and `index` for a table, `item` and `index` for a list, `element` for a diagram. On a plain content cell that handles only `dblclick`, **Enter** or **Space** runs it.
:::

::: event change
The cell's value is different from what it was a moment ago. Nearly every cell that has a value raises this one.

`value` is the new value and `was` the old one, both `nil` when the cell had none. What counts as the value depends on the kind: an [input](kind:input) gives its text, number, `true` or `false`; a [calendar](kind:calendar) the day picked (`"2026-10-11"`) or `nil`; [tabs](kind:tabs) the title of the open tab; an [accordion](kind:accordion) the list of open titles; a [collapsible](kind:collapsible) `true` or `false`; a [table](kind:table) and a [list](kind:list) their rows or items; a [formula](kind:formula) what it works out.

```live id=change title="What changed" height=240
["col", {"style": {"gap": 8}},
  ["data", {"name": "note"}, "Change a value"],
  ["input", {"name": "qty", "type": "number", "label": "Quantity", "value": 1,
             "on": {"change": ["set!", "note", ["str", "was ", "$was", ", now ", "$value"]]}}],
  ["list", {"name": "todo", "type": "check",
            "on": {"change": ["set!", "note", ["str", "item ", "$index", ": ", ["get", "$item", "text"]]]}},
    "Book the venue", "Send the invites"],
  ["text", "**{{note}}**"]]
```

```sx in=change
(set! qty 5)
note
⇒ "was 1, now 5"
```

A list also hands over `item` and `index`: the item at the first position that differs between the old and the new list, as it is now (or as it was, when the list got shorter). Ticking, adding and editing an item all give the item concerned.

`change` follows the value, whoever changed it: a person typing, a button's `set!`, another handler, an agent. A text input raises it with every keystroke. A formula raises it when what it reads changes and its own result is different. Setting a cell to the value it already has raises nothing, and opening a document raises nothing: there is no "before" yet.

A handler on `change` may set the very cell that changed. Only a different value starts another round, which is how [loops start](/events/loops-and-undo/).
:::

::: event pick
A person picked rows in a [table](kind:table) that has **Picking rows** switched to **One** or **Many**, or unpicked them.

`rows` holds the picked rows as records, `value` their keys and `was` the keys before. A key is the row's `id` when it has one (saved records always do) and otherwise its position.

```live id=pick title="Picking rows" height=280
["col", {"style": {"gap": 8}},
  ["data", {"name": "count"}, 0],
  ["table", {"name": "orders", "select": "many", "search": false, "columns": ["customer", "total"],
             "value": [{"customer": "Mira Patel", "total": 52.8}, {"customer": "Tom Okafor", "total": 140.4}, {"customer": "Ana Lima", "total": 32.4}],
             "on": {"pick": ["set!", "count", ["len", "$rows"]]}}],
  ["text", "**{{count}}** picked."]]
```

`pick` is not `change`: it follows which rows are picked, while `change` follows the rows themselves. A cell that only needs the picked rows doesn't need a handler: [selected](fn:selected) gives them whenever the cell is worked out, as `(selected orders)`.
:::

::: event open
A section of an [accordion](kind:accordion) opened, a [collapsible](kind:collapsible) unfolded, or a person opened the document in **Live**.

An accordion hands over `title`, the section that opened, and `value`, the titles that are open now. If one change opens two sections, the handler runs once for each. A collapsible hands over `value`, which is `true`.

```live id=open title="Open and close" height=300
["col", {"style": {"gap": 8}},
  ["data", {"name": "log"}, "Nothing opened yet"],
  ["accordion", {"name": "faq", "value": ["Delivery"],
                 "on": {"open": ["set!", "log", ["str", "opened ", "$title"]], "close": ["set!", "log", ["str", "closed ", "$title"]]}},
    ["panel", {"title": "Delivery"}, ["text", "We deliver on weekdays."]],
    ["panel", {"title": "Returns"}, ["text", "Send it back within 30 days."]]],
  ["text", "**{{log}}**"]]
```

```sx in=open
(set! faq (list "Returns"))
log
⇒ "closed Delivery"
```

The last line shows the order. `(set! faq (list "Returns"))` opens *Returns* and closes *Delivery* in one change, so the handler runs for each, opens first. The one that ran last decides what `log` says.

The document raises `open` too, with no data. Its handler goes in the document's `on`, set with `["meta", "on.open", action]`. It runs once each time a person opens the document, in that person's browser: the first time they use it in **Live**, whether they opened it in Live or switched to Live from **Edit**. Switching between views afterwards doesn't run it again. Every person who opens the document runs it, so a counter in `open` counts openings, not people. Its changes are not a step for undo: nobody made them.
:::

::: event close
A section of an [accordion](kind:accordion) closed, a [collapsible](kind:collapsible) folded, or the person using the document left it.

An accordion hands over `title`, the section that closed, and `value`, the titles that are open now. A collapsible hands over `value`, which is `false`.

The document's `close` runs when the person leaves the document, in their browser, if the document is in **Live** at that moment. If they had switched to **Edit** or **Page** first, nothing runs. When the whole tab or browser is closed, the browser is asked to send what the handler changed on its way out, which it does not always allow: treat the document's `close` as best effort, never as the only place to save something that matters.

```notation id=goodbye
["col",
  ["data", {"name": "last-visit"}, "never"],
  ["text", "You were last here on {{last-visit}}."]]
```

```ops in=goodbye
[["meta", "on.close", ["set!", "last-visit", ["today"]]]]
```
:::

::: event tick
A [timer](kind:timer) ticked. The server raises it, not a browser, and only while someone has the document open in **Live**.

`count` is how many times this timer has ticked since it started and `at` the moment of the tick, in milliseconds. A timer that ticks `every` 30 seconds hands over 1, then 2, then 3; a timer set `after` a delay ticks once, with `count` 1. The count starts again when the timer is started again with [start!](fn:start!), when its time is changed, and when nobody had the document open in Live in between.

Timers don't tick in an example on this page, because the page has no server to tick them; [Timers](/events/timers/) shows one with notation.
:::

::: event load
A [fetch](kind:fetch) cell got its answer. The server raises it, once for each fetch that worked, and only while someone has the document open in **Live**.

`data` is the answer, already read as JSON, and `value` is the same. A handler can use it before any formula does: `(set! warn (> (get data "rate") 5))`. When the answer is different from the last one, the `change` handlers of the cells that read it run first and `load` follows; `load` fires even when the answer is the same as before.

[Fetch cells](/events/fetch/) explains where a fetch is made from and what can go wrong.
:::

::: event fail
A [fetch](kind:fetch) cell could not get its answer. The server raises it, and only while someone has the document open in **Live**.

`message` says what went wrong in words, such as *the server answered 500: the demo service is down* or *the answer is not JSON*. `status` is the HTTP status the other end answered with, or `nil` when there was none (no connection, a timeout, an address that isn't allowed). The cell keeps the last good answer, so a formula that reads it still has something to show.

A handler on `fail` can tell people: `(set! problem message)`.
:::
