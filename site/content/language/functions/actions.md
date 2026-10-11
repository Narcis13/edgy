---
title: Actions
---

The action functions change something: a cell's value, which cells a document has, the records in a collection, an event sent to handlers, a timer or a fetch.

::ref functions Actions

An [action](term:action) is an expression that changes things instead of working out a value. It runs when something happens: a [button](kind:button)'s `do`, a [handler](term:handler) on an event, a [custom action](term:custom-action) you call by name, or a table's row action. It never runs while a formula is being worked out, so a formula that contains `set!` fails with `set! only works in an action, such as a button`.

## How an action runs

- **Reads see the document as it was when the action began.** Inside one action, a cell you have already set still reads as before. The changes are made together when the action ends, and the next handler, and the next click, see them.
- **One click is one step for undo.** Everything the action changed, and everything its handlers changed after it, is undone together. See [Loops and undo](/events/loops-and-undo/). Records saved on the server are not part of the document's undo history.
- **Changes are real edits.** `set!` changes the cell exactly as typing in it would, so cells that read it follow, and a [change](event:change) handler on it runs.

The examples on this page run the way a click on a button runs: a line that changes something is followed by lines that read the result.

## Changing values

The examples here use a small order. **One more** adds to the quantity, **Toggle gift wrap** switches the box, and a hidden [data](kind:data) cell called `before` keeps a number for the examples.

```live id=shop title="Quantity, price and a gift box" height=250
["col",
  ["row", {"size": "hug"},
    ["input", {"name": "qty", "type": "number", "value": 2, "label": "Quantity"}],
    ["input", {"name": "price", "type": "number", "value": 40, "label": "Unit price"}],
    ["input", {"name": "gift", "type": "checkbox", "value": false, "label": "Gift wrap (5)"}],
    ["data", {"name": "before"}, 0]],
  ["formula", {"name": "total", "format": "currency"}, ["+", ["*", "$qty", "$price"], ["if", "$gift", 5, 0]]],
  ["row", {"size": "hug"},
    ["button", {"do": ["set!", "qty", ["+", "$qty", 1]], "icon": "plus"}, "One more"],
    ["button", {"variant": "soft", "do": ["toggle!", "gift"]}, "Toggle gift wrap"],
    ["button", {"variant": "ghost", "do": ["do", ["set!", "qty", 1], ["set!", "gift", false]]}, "Start again"]]]
```

::: fn set!
Sets the value of a cell: `(set! cell value)`. Name the cell as you would read it; the name is not worked out. The value is.

```sx in=shop
(set! qty 3)
qty
⇒ 3
total
⇒ 120
(set! qty (+ qty 1))
qty
⇒ 4
```

It works on the cells that hold a value people or actions can change: an [input](kind:input), a [data](kind:data) cell (which holds any value, a list or a record included), the open title of [tabs](kind:tabs), the list of open titles of an [accordion](kind:accordion), whether a [collapsible](kind:collapsible) is open, a [calendar](kind:calendar)'s day, and the items typed into a [list](kind:list) or a [table](kind:table) that has no expression.

- **A formula keeps its own value.** A formula's value always comes from its expression, so `(set! total 99)` changes nothing you can see:

```sx in=shop
(set! total 99)
total
⇒ 80
```

- With the value left out, `(set! qty)` empties the cell.
- A name no cell has is an error, `no cell called "x"`. Names written in actions follow renames made in edgy, so a cell you rename keeps working.
- The cell can also be named by an id, as [child](fn:child) gives them.

Keep a number that buttons change in an input or a data cell, and let formulas read it. See also [toggle!](fn:toggle!), [do](fn:do), [Button](kind:button).
:::

::: fn toggle!
Switches a cell between true and false. A value that is false by [the usual rules](/language/truth/) (`0`, `""`, `nil`, an empty list) becomes `true`; any other value becomes `false`.

```sx in=shop
(toggle! gift)
gift
⇒ true
total
⇒ 85
(toggle! gift)
gift
⇒ false
```

It is meant for a checkbox or toggle [input](kind:input), a [collapsible](kind:collapsible) (open or folded) and a flag in a [data](kind:data) cell. Used on a number it gives `false` for anything but zero, which is rarely what you want; use [set!](fn:set!) there. See also [if](fn:if).
:::

::: fn do
Runs several actions in order, and gives the value of the last. A button's **What it does** holds one expression, so `do` is how it does more than one thing.

```sx in=shop
(do (set! qty 10) (set! before qty))
qty
⇒ 10
before
⇒ 2
```

The second step reads `qty` as it was when the action began, so `before` holds `2` and not `10`. Order matters for what is *changed*, not for what is *read*: to use a value you have worked out a step earlier, give it a name with [let](fn:let):

```sx in=shop
(let (next (+ qty 1)) (do (set! qty next) (set! before next)))
before
⇒ 3
```

`(do)` with nothing in it gives `nil`. For a step that happens only sometimes, use [when](fn:when) or [if](fn:if) inside it: `(do (set! qty 1) (when (> total 100) (set! gift true)))`.
:::

## Showing and hiding

```live id=thanks title="Show and hide a cell" height=150
["col",
  ["row", {"size": "hug"},
    ["button", {"do": ["show!", "thanks"]}, "Say thanks"],
    ["button", {"variant": "ghost", "do": ["hide!", "thanks"]}, "Hide it"]],
  ["text", {"name": "thanks", "hidden": true}, "Thank you, Ada."]]
```

::: fn show!
Shows a cell by taking away its `hidden` rule: `(show! thanks)`. The cell can be named by its name or id.

`show!` removes the rule whatever it was, a plain `true` or an expression such as `(> qty 5)`. A cell that was hidden *when* something held is no longer hidden *by* that rule afterwards, even if the rule would hide it again. For a cell that should hide and show depending on a condition, give it a `hidden` expression that reads a [data](kind:data) cell and change the data cell with [set!](fn:set!) or [toggle!](fn:toggle!).

```sx in=thanks
(show! thanks)
```

See also [hide!](fn:hide!).
:::

::: fn hide!
Hides a cell: `(hide! thanks)`. Readers stop seeing it, but it stays in the document with its value, which other cells can still read.

```sx in=thanks
(hide! thanks)
thanks
⇒ "Thank you, Ada."
```

It sets the cell's `hidden` rule to `true`, replacing any expression it had; [show!](fn:show!) takes the rule away again. Hiding a cell is a change to the document, like [set!](fn:set!), and undoes with the click.
:::

## Adding and removing cells

```live id=lines title="Lines you can add and remove" height=240
["col",
  ["col", {"name": "lines"},
    ["row", ["text", "Tea"], ["input", {"type": "number", "value": 2}]],
    ["row", ["text", "Cable"], ["input", {"type": "number", "value": 1}]]],
  ["row", {"size": "hug"},
    ["button", {"do": ["dup!", ["child", "lines", -1]], "icon": "plus"}, "Add a line"],
    ["button", {"variant": "soft", "hidden": ["<=", ["len", "$lines"], 1], "do": ["remove!", ["child", "lines", -1]]}, "Remove the last"]]]
```

::: fn dup!
Copies a cell, with everything inside it, and puts the copy right after the original: `(dup! cell)`. It is how a button adds a line to a list of lines. To copy the last line, ask [child](fn:child) for it: `(dup! (child lines -1))`.

```sx in=lines
(len lines)
⇒ 2
(dup! (child lines -1))
(len lines)
⇒ 3
lines
⇒ (list (list "Tea" 2) (list "Cable" 1) (list "Cable" 1))
```

- A copy gets new ids. A named cell gets the next free name: `line` is copied as `line2`, and `line2` as `line3`.
- Formulas inside the copy that use [sib](fn:sib) and [idx](fn:idx) read the copy's own cells. A formula that read another cell by name would read that cell in every copy.
- Copying a panel adds a panel with a new, free title.

The change is the [dup](op:dup) op. See also [remove!](fn:remove!).
:::

::: fn remove!
Removes a cell and everything inside it: `(remove! cell)`.

```sx in=lines
(remove! (child lines 0))
(len lines)
⇒ 1
lines
⇒ (list (list "Cable" 1))
```

- The cells beside it take up the room it leaves.
- The only cell inside a panel or collapsible is replaced by an empty cell, so the section is not left without content.
- A set of tabs or an accordion keeps at least one panel; to remove the last, remove the container.
- In the live example, **Remove the last** hides once one line is left, with the `hidden` rule `(<= (len lines) 1)`, so the last line is never removed by mistake.

The change is the [remove](op:remove) op. See also [dup!](fn:dup!).
:::

## Saving records

These four actions change a [collection](term:collection) on the server instead of the document. The collection belongs to the account that owns the document, is made by the first record saved to it, and outlives the document. Its name uses letters, digits, `-` and `_`, up to 60 characters. Read it back with [rows](fn:rows); see [Collections](/data/collections/).

```live id=orders title="Orders: save, mark paid, delete" height=420
{"root": ["col",
    ["row", {"size": "hug"},
      ["input", {"name": "client", "type": "text", "value": "Bo Fischer", "label": "Client"}],
      ["input", {"name": "total", "type": "number", "value": 460, "label": "Total"}],
      ["button", {"icon": "save", "do": ["insert!", "orders", {"client": "$client", "total": "$total", "status": "Open"}]}, "Save"],
      ["button", {"variant": "ghost", "confirm": "Delete every saved order?", "do": ["clear!", "orders"]}, "Clear all"]],
    ["table", {"name": "saved", "label": "Saved orders", "columns": ["client", "total", "status"],
               "actions": [
                 {"label": "Paid", "do": ["update!", "orders", ["get", "$row", "id"], {"status": "Paid"}]},
                 {"label": "Delete", "do": ["delete!", "orders", ["get", "$row", "id"]]}]},
      ["rows", "orders"]]],
  "data": {"orders": [
    {"client": "Northwind Studio", "total": 1200, "status": "Open"},
    {"client": "Ada Lovelace", "total": 1840, "status": "Paid"}]}}
```

::: fn insert!
Saves a record in a collection: `(insert! "orders" {client client total total})`. The record is made from the expression, here from the cells `client` and `total`, and added after the records already there.

```sx in=orders
(insert! "orders" {client client total total status "Open"})
(get (last (rows "orders")) "client")
⇒ "Bo Fischer"
(get (last (rows "orders")) "total")
⇒ 460
```

- The second argument has to be a record. `(insert! "orders" 5)` fails with `insert! needs a record`.
- The saved record gets its own `id` and `at` (the time it was saved); fields called `id` or `at` in what you pass are left out.
- Each press saves one record. A button that people may press twice should ask first (**Ask first**), or hide once the record is saved.

The record is added after the action finishes, so rows read in the same action don't show it yet. See also [update!](fn:update!), [rows](fn:rows), [Button](kind:button).
:::

::: fn update!
Changes some fields of a saved record: `(update! "orders" id {status "Paid"})`. Fields you name are set, new ones added, and the rest of the record stays as it was.

```sx in=orders
(update! "orders" (get (first (rows "orders")) "id") {status "Paid"})
(get (first (rows "orders")) "status")
⇒ "Paid"
(get (first (rows "orders")) "client")
⇒ "Northwind Studio"
```

- The second argument is the record's `id`. In a table's row action the row is called `row`, so `(get row "id")` is the id to pass, as in the live example's **Paid** button.
- The third argument has to be a record of fields: `update! needs the fields to change`. A missing id is an error too: `update! needs the id of a record`.
- A record's `id` and `at` can't be changed.

To change a record you hold in a variable without saving it, use [assoc](fn:assoc). See also [insert!](fn:insert!), [get](fn:get).
:::

::: fn delete!
Deletes one record from a collection by its `id`: `(delete! "orders" id)`.

```sx in=orders
(delete! "orders" (get (first (rows "orders")) "id"))
(includes? (column (rows "orders") "client") "Northwind Studio")
⇒ false
```

An id that no record has deletes nothing and is not an error. Saved records are not part of the document's undo history, so a deleted record does not come back with **Undo**; put **Ask first** on buttons that delete. See also [clear!](fn:clear!), [insert!](fn:insert!).
:::

::: fn clear!
Deletes every record of a collection: `(clear! "orders")`.

```sx in=orders
(clear! "orders")
(rows "orders")
⇒ (list)
```

Only the one collection is emptied; others and the document are untouched. Like [delete!](fn:delete!), it can't be undone, so give its button a question to ask first. See also [insert!](fn:insert!).
:::

## Sending an event

```live id=greeter title="A custom event" height=170
["col",
  ["row", {"size": "hug"},
    ["input", {"name": "client", "type": "text", "value": "Ada Lovelace", "label": "Client"}],
    ["button", {"do": ["emit!", "greeted", {"who": "$client"}]}, "Greet"]],
  ["text", {"on": {"greeted": ["set!", "greeting", ["str", "Hello, ", ["get", "$payload", "who"], "."]]}}, "{{greeting}}"],
  ["data", {"name": "greeting"}, ""]]
```

::: fn emit!
Sends a [custom event](term:custom-event) with an optional payload: `(emit! "greeted" {who client})`. Every cell, and the document, with a handler for that event name in its `on` runs it. The handler finds the payload as `payload` and the name of the cell whose action sent it as `from` (its id when it has no name, and nothing when the document's own handler sent it).

In the live example the text cell holds the handler `on.greeted`, which sets the `greeting` cell from `payload`. **Greet** only sends the event and does not know who listens:

```sx in=greeter
(emit! "greeted" {who "Ada"})
greeting
⇒ "Hello, Ada."
```

- The event name starts with a letter and continues with letters, digits, `-` and `_`. Anything else fails with `emit! needs the name of an event`.
- The names the document raises itself ([click](event:click), [change](event:change), [open](event:open), …) are refused, with the message `"open" is an event the document raises itself; give your event a name of its own`.
- Handlers run after the action that sent the event is done. Inside one action, a read after `emit!` does not yet see what the handlers changed.
- Handlers can emit events too. A chain stops after 8 levels (or 64 handlers for one gesture) with an error, and what already ran is kept. A cell that answers an event by emitting the same event is stopped like this:

```notation id=echo
["col", ["text", {"on": {"ping": ["emit!", "ping"]}}, "Echo"]]
```

```sx in=echo
(emit! "ping")
⇒ error: events went 8 deep
```

Events and where handlers run are explained in [Custom events and actions](/events/custom/) and [Loops and undo](/events/loops-and-undo/). See also [set!](fn:set!).
:::

## Timers and fetch cells

A [timer](kind:timer) ticks and a [fetch](kind:fetch) cell fetches only while the document is open in **Live**, and the server does it. Neither runs inside these pages, so this example is shown as notation and the actions as plain snippets with no results.

```notation id=clock
["col",
  ["timer", {"name": "poll", "every": 30}],
  ["fetch", {"name": "rate", "every": 60}, "https://example.test/rate.json"],
  ["row", {"size": "hug"},
    ["button", {"do": ["stop!", "poll"], "variant": "soft"}, "Pause"],
    ["button", {"do": ["start!", "poll"], "variant": "soft"}, "Resume"],
    ["button", {"do": ["refresh!", "rate"]}, "Fetch again"]]]
```

::: fn start!
Starts a [timer](kind:timer), again from now: `(start! poll)`. A timer that is running starts over; a timer that was stopped runs again; a timer with `after` ticks once more.

```sx in=clock
(start! poll)
```

It records the time as the timer's value, so the timer reads as running (`true`) and its tick count starts from 1 again. The ticks themselves, and the handlers on the timer's [tick](event:tick) event, happen on the server. Naming a cell that is not a timer is an error, `start! needs a timer, and "qty" is not one`. See [Timers](/events/timers/). See also [stop!](fn:stop!).
:::

::: fn stop!
Stops a [timer](kind:timer): `(stop! poll)`.

```sx in=clock
(stop! poll)
```

The timer's value becomes `false`, which is how a stopped timer is told from a running one, and no more ticks come. A stopped timer stays stopped, also when the document is opened again, until something calls [start!](fn:start!). The [change](event:change) event of the timer runs, since its value changed. Naming a cell that is not a timer is an error, `stop! needs a timer, and "qty" is not one`.
:::

::: fn refresh!
Fetches a [fetch](kind:fetch) cell's address again, now: `(refresh! rate)`.

```sx in=clock
(refresh! rate)
```

The answer arrives a little later, not within the action. While the request is on its way [status](fn:status) is `"loading"`; then it is `"ready"` and the cell holds the new answer, or `"failed"` and [error-of](fn:error-of) says why. The [load](event:load) or [fail](event:fail) handler runs afterwards. Pressing twice while a request is on its way does not make a second request. Naming a cell that is not a fetch cell is an error, `refresh! needs a fetch cell, and "qty" is not one`. See [Fetch cells and events](/events/fetch/).
:::
