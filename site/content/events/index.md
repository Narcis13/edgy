---
title: Events and actions
---

Events and actions are how a document reacts: a cell or the document raises an event, a handler runs an action, and the action changes cells, saves records or sends another event.

## A checkbox that sets a text

```live id=agree title="A checkbox that sets a text" height=150
["col",
  ["data", {"name": "status"}, "Not yet"],
  ["input", {"name": "agree", "type": "checkbox", "label": "I agree to the terms",
             "on": {"change": ["set!", "status", ["if", "$value", "Agreed", "Not yet"]]}}],
  ["text", "Status: **{{status}}**"]]
```

Tick the box. The text changes because the checkbox has a handler: under `on`, the event `change` is tied to an action, `(set! status (if value "Agreed" "Not yet"))`. The action runs each time the checkbox changes, and `value` is the checkbox's new value, filled in by the event.

```sx in=agree
(set! agree true)
status
⇒ "Agreed"
```

The `set!` above does what your tick does: it changes the checkbox, the checkbox raises `change`, and the handler runs. It makes no difference who changed the value, a person, a button, another handler or an [agent](term:agent).

## The model

Three words carry the whole idea:

- An [event](term:event) is something that happens to a cell or the document: a click, a value changing, a timer's tick, the document opening. The cell's kind decides which events it raises. See [Every event](/events/reference/).
- A [handler](term:handler) is an [action](term:action) tied to an event. A cell keeps its handlers in `on`, a name for each event: `{"change": …, "click": …}`. The document keeps its own the same way, for `open` and `close` and for [custom events](/events/custom/).
- An action is an expression that changes something instead of working out a value: [set!](fn:set!), [insert!](fn:insert!), [emit!](fn:emit!). A button's `do` is an action too, and so is a [custom action](term:custom-action).

When an event happens, edgy looks for a handler on the cell that raised it and runs its action. The action finds the event's data bound by name, so `value` and `was` are there for a `change`, `row` and `index` for a click on a table row, `count` for a timer's `tick`.

::diagram event-dispatch

What a handler changes can raise more events. A handler that sets a cell makes that cell raise `change`, and a handler on that cell runs in turn. These run one after the other, each seeing the document as the one before left it. Edgy stops a chain that goes on too long: see [Loops and undo](/events/loops-and-undo/).

## What a handler finds bound

Besides the data of its event, every handler sees two names:

| Name | What it holds |
| --- | --- |
| `target` | The name of the cell that raised the event (its id when it has no name), or `nil` for the document and for a [custom event](/events/custom/). |
| `event` | A record: `name`, `target`, the event's data, and `listener` (the cell whose handler is running, when it is not the one that raised the event). |

A bound name hides a cell with the same name inside that handler. If a cell is called `value`, write `(ref "value")` to read the cell and `value` to read the event's data. The events' data are listed in [Every event](/events/reference/).

## A button and a handler

A [button](kind:button) has its own action, `do`, and can have a `click` handler as well. `do` runs first, then the handler, and the handler sees what `do` changed.

```live id=hello title="do first, then the click handler" height=150
["col",
  ["data", {"name": "trail"}, "Nothing pressed yet"],
  ["button", {"do": ["set!", "trail", "do"],
              "on": {"click": ["set!", "trail", ["str", "$trail", ", then click"]]}}, "Press me"],
  ["text", "Last press: **{{trail}}**"]]
```

Press it. The text reads *do, then click*. A button needs a `do` to be pressed at all; a button with only a `click` handler is shown faded and does nothing, so give it a `do`, even a small one, or put the handler on a cell that is not a button.

## Where handlers run

Handlers run only while someone uses the document in **Live**. In **Edit** a click selects a cell and raises no event, and on paper nothing runs at all. (A button you press in Edit still runs its own `do`, so you can try it, but not its `click` handler.) In Live:

- Clicks and changes a person makes run in that person's browser. Their changes are saved like any other change, so everyone with the document open sees them.
- [Timers](/events/timers/), [fetches](/events/fetch/) and the changes agents make run once, on the server, while anyone has the document open in Live.
- `open` and `close` run once for each person who opens the document.

[Which browser runs what](/events/who-runs-what/) goes through each case, including two people with the document open.

## Writing a handler

1. Select a cell in Edit and find **Events** in **Cell details**. For the document itself, select nothing: its section is called **Events and actions**.
2. Press **Add a handler**, choose the event, then a ready-made action, or write your own.
3. Press **Try it** to run the handler once with sample data. Its changes are real and undo takes them back.

::shot events-section "The Events section of Cell details for a checkbox: its change handler written as an expression."

In notation a handler is a prop of the cell, and the document's handlers are set with a `meta` op:

```notation id=visitor
["col",
  ["data", {"name": "visits"}, 0],
  ["text", "You opened this {{visits}} time(s)."]]
```

```ops in=visitor
[["meta", "on.open", ["set!", "visits", ["+", "$visits", 1]]]]
```

> [!NOTE]
> Events happen to the person using the document. Switching between **Edit** and **Live** does not run `open` again, and closing a tab runs `close` only as far as the browser allows. [Every event](/events/reference/) says exactly when each one fires.

## In this section

::ref pages events/reference/,events/timers/,events/fetch/,events/custom/,events/loops-and-undo/,events/who-runs-what/
