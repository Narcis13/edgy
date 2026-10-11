---
title: Errors
---

This page lists the errors you can meet in a cell, an action and the code editor, in the words edgy uses, with what each means and what to do about it.

Most mistakes show up in one of five places:

- **In the cell.** A cell that can't work out its value shows the message in a small red tag; the cell holds no value until it is fixed. A [text](kind:text) cell shows its own words in red, and the message appears when you hover.
- **In the formula bar and the code studio.** The result of the expression shows in red. The [code studio](/editor/code-studio/) says **Not finished:** in front of a message about what you typed, because that kind of mistake is one you haven't finished fixing.
- **Under the code field.** While you type, a wavy underline marks the spot once you pause, and the message appears under the field.
- **After pressing a button.** A message appears at the bottom of the screen: `That button failed: …`.
- **After a change that can't be made.** A message appears at the bottom of the screen, as a sentence.

A cell that reads a broken cell is broken too, and says whose fault it is by putting the cell's name in front: `bad: expected a number, got "abc"`.

Try the common ones here. This document has a few cells that go wrong:

```notation id=broken
["col",
  ["input", {"name": "qty", "type": "number", "value": 3}],
  ["formula", {"name": "bad"}, ["+", 1, "abc"]],
  ["formula", {"name": "worse"}, ["*", "$bad", 2]],
  ["formula", {"name": "ping"}, ["+", "$pong", 1]],
  ["formula", {"name": "pong"}, ["+", "$ping", 1]],
  ["row", {"name": "pair"}, ["text", "x"], ["text", "y"]]]
```

```sx in=broken
bad
⇒ error: expected a number, got "abc"
worse
⇒ error: bad: expected a number, got "abc"
ping
⇒ error: circular reference: ping → pong → ping
```

## Reading what you typed

These come from the reader, before anything is worked out. Nothing about the document is wrong; the text doesn't make an expression yet.

```sx
(+ 1 2
```

| Message | What it means and what to do |
| --- | --- |
| `missing )` | A `(` was never closed. The underline is at the bracket that has no partner. Add the `)`. |
| `missing }` | A `{` was never closed. Add the `}`. |
| `unexpected )` | A `)` with no `(` before it. Remove it, or add the `(` it belongs to. |
| `unexpected }` | A `}` with no `{` before it. |
| `a "string" is missing its closing quote` | A piece of text started with `"` and never ended. Add the closing `"`. |
| `expected one expression; wrap several in (do …)` | There is more than one expression, such as `(set! a 1) (set! b 2)`. Join actions with [do](fn:do): `(do (set! a 1) (set! b 2))`. A formula gives one value, so it can't hold two. |
| `{ } needs pairs: {key value key value}` | A record has a key without a value, or the other way round. Write them in pairs. |
| `{ } keys must be words` | The key of a record is something other than a word or text, such as a number or a call. |
| `let needs pairs: (let (x 1 y 2) …)` | The names and values of [let](fn:let) must pair up: `(let (x 1 y 2) body)`. |

The code editor holds back until you pause, so half-typed code isn't scolded. **Apply** in the code studio refuses code that doesn't read, with a note such as `Formula is not finished: missing ).`, and **Format** says `Fix this first: …`.

## Names that aren't there

| Message | What it means and what to do |
| --- | --- |
| `no cell called "x"` | The expression names a cell that doesn't exist. Check the spelling (capitals matter) and that the cell has a name in **Cell details**. Renaming a cell in edgy updates the expressions that read it, so a mismatch usually means a typo or a cell that was removed. |
| `unknown function x` | A call whose first word isn't a function, a custom action or a cell: a typo, or a function edgy doesn't have. The code editor colours such a word as unknown. [Functions](/language/functions/) lists every function. |
| `x is not a function` | The first word of a call is a name that holds a value, not a function: `(qty 1)`. If you meant a calculation, `qty` is the first thing in the list; write `(* qty 1)`. |
| `a list must start with a function; use (list …) for plain data, got 1` | A list in parentheses was used as data: `(1 2 3)`. Write `(list 1 2 3)`. |
| `the action x is not written as (fn (…) …)` | A custom action must be a function: `(fn (who) (set! greeting who))`. See [Custom events and actions](/events/custom/). |

```sx
(nope 1)
⇒ error: unknown function nope
(+ nobody 1)
⇒ error: no cell called "nobody"
(1 2 3)
⇒ error: a list must start with a function
```

A common mistake is writing `it` or `i` outside the place that defines them. In `(map it xs)` the word `it` is looked up as a cell, so the message is `no cell called "it"`. `it` is the item *inside* the first argument of [map](fn:map): `(map (* it 2) xs)`.

## Values of the wrong kind

| Message | What it means and what to do |
| --- | --- |
| `expected a number, got "abc"` | Arithmetic met text that isn't a number. The message says what it got: `"abc"` (text, cut at 24 letters), `a list`, `a record`, `a function`, `true`, `false`. Find the cell that holds it; an empty cell is fine (it counts as 0), but `"abc"` is not. If the cell may hold anything, check it first, or total with [sum](fn:sum), which skips what isn't a number. |
| `expected a date, got "soon"` | A date function got something it can't read as a date. Dates are `"2026-10-11"`, with an optional time, or a time in milliseconds. An empty cell gives `expected a date, got nothing` or `expected a date, got ""`: use `(default d (today))` for a stand-in. |
| `division by zero` | [/](fn:/) or [%](fn:%) with a divisor of 0. Check the divisor first: `(if (= n 0) 0 (/ total n))`. |
| `pmt needs at least one period` | [pmt](fn:pmt) was given 0 periods. |
| `range step cannot be 0` | [range](fn:range) with a step of 0 would never end. |
| `range is too long` | A list of more than 20,000 items was asked for. |

```sx
(+ 1 "abc")
⇒ error: expected a number, got "abc"
(days "soon" (today))
⇒ error: expected a date, got "soon"
(/ 10 0)
⇒ error: division by zero
(range 0 100000)
⇒ error: range is too long
```

Only arithmetic is strict. [sum](fn:sum), [avg](fn:avg), [min](fn:min) and [max](fn:max) skip text that isn't a number, and the comparisons treat nothing as smaller than everything. [What counts as true](/language/truth/) has the details.

## Too much work

| Message | What it means and what to do |
| --- | --- |
| `this takes too long to compute` | One expression used more than 400,000 steps, usually a list worked over inside another list. Make the lists smaller or the expression simpler. |
| `this nests too deeply` | More than 300 calls inside each other. A formula that needs this is better as several cells. |

```sx
(count-if (> (count-if (> it 1) (range 700)) 0) (range 700))
⇒ error: this takes too long to compute
```

## Cells that read each other

| Message | What it means and what to do |
| --- | --- |
| `circular reference: a → b → a` | Each cell in the chain reads the next, and the last reads the first, so none can be worked out first. A cell that reads itself shows `circular reference: a → a`. Break the loop: store one of the values in an [input](kind:input) or [data](kind:data) cell and set it from an action. |
| `bad: expected a number, got "abc"` | A message with a cell name and a colon in front: the cell you read (`bad`) is the one with the problem. Fix that cell. |

## Reading neighbours by place

These come from [sib, idx and child](/language/names/#relative-references-sib-idx-and-child).

| Message | What it means and what to do |
| --- | --- |
| `sib needs a cell that sits in a row or column` | The cell is the root, or alone, so it has no neighbours. Split it first. |
| `there is no sibling 5` | The row or column has no cell at that place. Places start at 0; negative numbers count from the end. |
| `"lines" has no cell 7` | [child](fn:child) asked for a place past the end of the row or column. |
| `"x" is not a table, so nothing in it can be picked` | [selected](fn:selected) names a cell that isn't a [table](kind:table). |
| `selected needs the name of a table: (selected orders)` | `selected` wants a cell's name as it is, not a computed value. |
| `"x" is not a fetch cell` | [status](fn:status) or [error-of](fn:error-of) names a cell that isn't a [fetch](kind:fetch). |
| `status needs the name of a fetch cell: (status rate)` | `status` and `error-of` want the cell's name as it is, not a computed value. |

```sx in=broken
(sib 1)
⇒ error: sib needs a cell that sits in a row or column
(selected qty)
⇒ error: "qty" is not a table
(child pair 9)
⇒ error: "pair" has no cell 9
```

The first of these three is a root cell asking for a neighbour. In a real row, `(sib 1)` is the cell next to it.

## Actions

An action is an expression that changes something, such as [set!](fn:set!). It runs when something happens, never while a value is being worked out.

| Message | What it means and what to do |
| --- | --- |
| `set! only works in an action, such as a button` | An action was written where a value is expected: in a formula, a condition, a style or a text template. Each action says it with its own name: `insert! only works in an action, such as a button`. Move it to a button's **What it does** or to a handler. |
| `insert! needs a record: (insert! "orders" {qty qty})` | The second part of [insert!](fn:insert!) is not a record. |
| `update! needs the id of a record: (update! "orders" (get row "id") {status "paid"})` | The record's id is empty. In a table's row action, the id is `(get row "id")`. |
| `update! needs the fields to change: (update! "orders" id {status "paid"})` | The last part of [update!](fn:update!) is not a record. |
| `emit! needs the name of an event: (emit! "saved" {total total})` | The first part of [emit!](fn:emit!) must be a name: letters, digits, `-` and `_`, starting with a letter. |
| `"open" is an event the document raises itself; give your event a name of its own` | [emit!](fn:emit!) was given the name of a built-in event. Pick another. |
| `start! needs a timer, and "qty" is not one` | [start!](fn:start!) and [stop!](fn:stop!) name a [timer](kind:timer) cell. |
| `refresh! needs a fetch cell, and "qty" is not one` | [refresh!](fn:refresh!) names a [fetch](kind:fetch) cell. |

Actions that name a cell, such as `(set! nobody 1)`, say `no cell called "nobody"`.

```sx
(insert! "orders" 5)
⇒ error: insert! needs a record
(emit! "open")
⇒ error: "open" is an event the document raises itself
(set! nobody 1)
⇒ error: no cell called "nobody"
```

A button with a mistake like these says so when pressed: `That button failed: no cell called "nobody".` A mistake that edgy can find without running anything, a call to a name that exists nowhere, is shown on the cell at once:

| Message | What it means and what to do |
| --- | --- |
| `its action: no action or function called "greet"` | A button's action calls `greet`, which is no function, custom action or cell. |
| `on click: no action or function called "greet"` | The same in a handler; the name of the event comes first. |
| `row action "Paid": no action or function called "greet"` | The same in a table's row action, named by its label. |
| `action greet: write it as (fn (…) …)` | A custom action is defined by something other than a function. |

## Handlers that loop

A handler can change a cell whose own handler changes the first again. edgy stops it:

| Message | What it means and what to do |
| --- | --- |
| `stopped: events went 8 deep (a → b → a); a handler is probably setting off itself` | A change set off a handler, which set off another, eight times in a row. The cells in the loop are listed. Make one of them stop changing the other, or only change it when its value really differs. |
| `stopped after 64 handlers ran for one event` | One gesture would run more than 64 handlers in all. |

Everything that ran before the stop is kept. The message appears at the bottom of the screen with the event's name in front, such as `change: Stopped: events went 8 deep …`, and the line in **Activity** is marked.

```notation id=loop
["col",
  ["input", {"name": "count", "type": "number", "value": 0,
             "on": {"change": ["set!", "count", ["+", "$count", 1]]}}]]
```

```sx in=loop
(set! count 5)
⇒ error: stopped: events went 8 deep
```

[Loops and undo](/events/loops-and-undo/) explains the guard.

## Names and settings that are refused

When a name or a setting is not allowed, the change is not made and the message appears at the bottom of the screen.

| Message | What it means and what to do |
| --- | --- |
| `"1x" is not a usable name: start with a letter, then letters, digits, - or _` | A cell's name has a space, starts with a digit or has another character. |
| `"it" is reserved` | The name is one of `true`, `false`, `nil`, `null`, `it`, `i`, `acc`. |
| `another cell is already named "total"` | Names are unique. Pick another, or rename the other cell first. |
| `"c5" is the id of another cell` | The name is another cell's id. |
| `"x y" is not an event name: start with a letter, then letters, digits, - or _` | The name of an event in a handler or in [emit!](fn:emit!). |
| `unknown style "colour"; known: …` | A style key that doesn't exist; the message lists the ones that do. See [Style keys](/styling/style-keys/). |
| `every is a time in seconds, like 30, or "500ms", "30s", "2m", "1h", at most a day; got "soon"` | A timer's or fetch cell's `every` or `after` that isn't a time; the message names the one it is. |
| `headers are an object of texts, like {"Authorization": "secret:RATES_KEY"}` | A fetch cell's headers must be pairs of texts. |
| `"x y" is not a usable action name: start with a letter, then letters, digits, - or _` | The name of a custom action. |
| `"sum" is a built-in function; give the action a name of its own` | A custom action can't be named like a function that exists. |
| `an action must be a function, like (fn (who) (set! greeting who))` | What was typed as a custom action is not a function. |

## Changes that can't be made

Some changes are refused because of how the document is built. The message appears at the bottom of the screen.

| Message | What it means and what to do |
| --- | --- |
| `merge needs at least two cells` | Select two or more cells to merge. |
| `those cells are not next to each other` | Only neighbours merge. |
| `those cells don't form a rectangle` | The selected cells must fill a rectangle once merged. |
| `cells in different tabs can't be merged; move them into one first` | Cells in two tabs can't be merged. In an accordion the message says `sections` in place of `tabs`. |
| `tabs keep at least one panel; remove the tabs instead` | The last tab or section can't be removed alone. |
| `a cell can't swap with one inside it` | A cell and its own contents can't trade places. |
| `a cell can't move next to something inside it` | The same for moving. |
| `nothing can sit beside the root; split it instead` | The first cell has no neighbours until you split it. |
| `only panels sit in tabs and accordions; move it beside a cell inside the panel` | Tabs and accordions hold panels, and nothing else. |
| `that would leave the document without a root` | A document always has its first cell. |

There are more, all in the same plain style, for notation and ops written by agents or in the code studio; they are on [Notation](/agents/notation/) and [Ops](/agents/ops/).

## When a message isn't here

A fetch cell that can't get its answer says why in `(error-of rate)`; see [Fetch](/events/fetch/). A message that appears with a cell's name in front is another cell's, as in `bad: …` above. If a message looks like a fault in edgy rather than in your document, [Troubleshooting](/troubleshooting/) has what to try.
