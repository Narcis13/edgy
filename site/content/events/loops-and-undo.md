---
title: Loops and undo
---

This page explains how edgy stops handlers that set each other off for ever, and how a gesture and everything its handlers changed come back together when you undo.

## Handlers that settle

A handler's changes can raise events, and those can run more handlers. That is useful: a clamp keeps a value in range by setting the very cell it listens to.

```live id=clamp title="A handler that settles" height=130
["col", {"style": {"gap": 8}},
  ["input", {"name": "qty", "type": "number", "label": "How many (10 at most)", "value": 1,
             "on": {"change": ["set!", "qty", ["min", "$value", 10]]}}],
  ["text", "You asked for **{{qty}}**."]]
```

Type 15. The cell changes to 15, so `change` runs the handler, which sets it to `(min 15 10)`, which is 10. That is a change too, so the handler runs again, sets it to `(min 10 10)`, which is the value it already has, and nothing more happens. Setting a cell to the value it has raises no event, which is what ends most chains.

```sx in=clamp
(set! qty 15)
qty
⇒ 10
```

## Handlers that do not settle

Two cells that each set the other to something new never settle:

```notation id=loop
["col",
  ["input", {"name": "a", "type": "number", "value": 0,
             "on": {"change": ["set!", "b", ["+", "$a", 1]]}}],
  ["input", {"name": "b", "type": "number", "value": 0,
             "on": {"change": ["set!", "a", ["+", "$b", 1]]}}]]
```

Change `a`, and its handler sets `b`; that raises `change` on `b`, whose handler sets `a`; and so on. Edgy follows a chain only so far.

```sx in=loop
(set! a 5)
⇒ error: events went 8 deep
```

## The two limits

| Limit | Value | What it stops |
| --- | --- | --- |
| Depth | 8 | A chain in which each handler sets off the next. The event you started is level 0; each event that a handler's changes raise, or that it sends with [emit!](fn:emit!), is one level further. Level 8 does not run. |
| Handlers | 64 | One gesture running too many handlers in all, at any depth. It catches an event that fans out to a crowd, such as a [custom event](/events/custom/) that every one of a hundred cells listens for. |

When a limit is reached, edgy stops at once and says why. The message names the cells the chain went through:

> stopped: events went 8 deep (a → b → a → b → a → b → a → b → a); a handler is probably setting off itself

or, for the other limit:

> stopped after 64 handlers ran for one event

You see it as a message on screen, starting with the name of the event, and as an error line in **Activity** against the handler that was refused. The handlers that had already run keep their changes, and what was waiting to run is dropped. For a chain that ran on the server (a timer, a fetch) the message is in **Activity** only.

The usual cause is the one above: two handlers that each set a cell the other listens to, to something new. Look for the pair and take one of them away. When the second cell should only follow the first, a [formula](kind:formula) that reads it does that without any handler: a formula follows the cells it reads on its own.

## What one gesture is

A gesture is what a person did: a press of a button, a tick of a box, a click on a row, a few keystrokes. Everything the gesture sets off in their browser is part of it: the change itself, the handlers it ran, the events those handlers raised, and so on until the chain ends. The limits above apply to one gesture.

## Undo

**Undo** ([⌘Z](key:undo), Ctrl+Z elsewhere) takes back a whole gesture in one step, including everything its handlers changed. Tick a checkbox whose handler sets a text, as in [Events and actions](/events/), press undo in Live, and the box and the text it set go back together.

- **A button.** Its `do`, its `click` handler and everything they set off are one step.
- **A click, a tick, a picked row.** The change and every handler it ran are one step.
- **Typing.** Keystrokes in the same cell within a moment and a half join one step. What each keystroke's handlers changed is taken back with them.
- **Undo runs no handlers.** Undoing puts the cell back and puts every cell the handlers changed back, as one set of changes. It does not raise `change` again, so nothing runs a second time and nothing is left half undone.
- **Trying a handler.** The **Try it** button in the studio fires an event by hand. Its changes are real, and one step for undo.

The undo history is yours and lives in your browser. It keeps the last 200 steps, and starts afresh when the document is replaced, for example when an earlier version is restored. Your undo takes back only your own steps, never what someone else did.

Some changes are nobody's step:

- **The document's `open` handler.** It ran because you opened the document, not because you did something. Its changes stay.
- **What the server runs.** A timer's tick, a fetch's `load` and `fail`, and the handlers an agent's change set off are not in anyone's history. They are in **Activity**, marked *on the server*.
- **Records.** `insert!`, `update!`, `delete!` and `clear!` save to a [collection](/data/collections/), outside the document. Undo changes the document's cells and does not take a saved record back. Delete it from the [Data page](/data/data-page/), or with `delete!`.

> [!WARNING]
> Pressing a button that saves a record and then undoing leaves the record saved, while the cells it changed go back.

See [Undo](/editor/undo/) for undo in the editor in general.
