---
title: Button
---

A button runs an action when someone presses it in Live: it changes a value, saves a record, opens a tab or sends an event.

::ref kind button

## When to use it

Use a button when something should happen only when a person asks for it: adding one to a counter, saving the quote as it stands, moving a wizard to its next step, clearing a form. When a value should follow other values all the time, use a [formula](kind:formula) instead: formulas never change anything, buttons never work anything out for display.

## Try it

```live id=counter title="A counter" height=110
["row", {"size": "hug"},
  ["data", {"name": "count"}, 0],
  ["button", {"do": ["set!", "count", ["+", "$count", 1]], "icon": "plus"}, "Add one"],
  ["button", {"variant": "ghost", "do": ["set!", "count", 0], "confirm": "Start again from 0?"}, "Reset"],
  ["text", {"style": {"valign": "center", "size": 18}}, "Pressed **{{count}}** times"]]
```

The number lives in a [data](kind:data) cell named `count`, which readers never see. **Add one** runs `(set! count (+ count 1))`: it reads `count` as it is and sets it one higher; the text shows it with a [text template](/language/templates/). **Reset** asks first, because it has a question in **Ask first**.

```sx in=counter
(set! count (+ count 1))
(set! count (+ count 1))
count
⇒ 2
```

## Adding and designing one

1. Select a cell in Edit and press `/`, then choose **Button** (or type its name in the menu's search).
2. Type its label straight into the cell, or in **Label** under **Cell details**.
3. Write what it does in **What it does**. The field is a code editor: it colours the code, suggests functions and the document's cells, and underlines mistakes. ⌘E opens the [code studio](/editor/code-studio/), where **Blocks** and **Ask AI** can write it for you.

::shot designer-button "The button's designer: its label, what it does, its look, its icon and the question it asks first."

The designer's other settings:

- **Look**: **Solid** (the default, in the accent colour), **Soft** (a tinted background) or **Quiet** (text only, for second choices).
- **Icon**: an icon before the label, or alone when there is no label.
- **Ask first**: a question shown in place of the button when it is pressed, with **Yes** and **No**. The action runs only on **Yes**. Use it for anything that is hard to take back.

## In notation

The label is the body; `do` is the action:

```notation id=save
["col",
  ["input", {"name": "client", "type": "text", "value": "Ada Lovelace"}],
  ["formula", {"name": "total", "format": "currency"}, 1840],
  ["button", {"variant": "soft", "icon": "save", "confirm": "Save this quote?",
              "do": ["insert!", "quotes", {"client": "$client", "total": "$total"}]}, "Save this quote"]]
```

| Prop | What it is |
| --- | --- |
| `do` | The action, as an expression. Several actions in one: `(do (set! a 1) (set! b 2))`. |
| `variant` | `"solid"` (default), `"soft"` or `"ghost"` (shown as **Quiet**). |
| `icon` | An icon name, such as `"plus"` or `"save"`. |
| `confirm` | The question asked before it runs. |
| `label` | The words on it, when not given as the body. |

## Its value

A button has no value of its own: other cells can't read it. What it does shows in the cells it changes and the records it saves.

## Events

::ref events-of button

A button's `do` runs first, then its `click` handler, if it has one; both, and everything their changes set off, are one step for undo. Most buttons need only `do`, and a button needs one: with a `click` handler but nothing in **What it does**, pressing it runs nothing at all. A handler is for other cells: any cell that shows something can react to a click with its own `on.click`. See [Events and actions](/events/).

## Actions that change it

None change a button itself. A button can hide while it has nothing to do: give it a `hidden` condition, as **Remove the last** does in the [Quote](template:quote) template:

```sx
(<= (len lines) 1)
```

## On a phone and on paper

On a phone a button keeps its full width in the one column cells stack into, and it is tall enough to tap. On paper a button prints as its label in a box, because it can't be pressed: nothing runs when a document is printed.

## Usual mistakes

- **Nothing happens.** A button with nothing in **What it does** is shown faded and its tooltip says *This button does nothing yet*. In Edit, pressing a button runs its action but not its `click` handler or anything its changes set off: handlers run only in **Live**.
- **"That button failed: set! only works in an action, such as a button".** An action was written where a value is expected, in a formula or a condition. Move it to the button's **What it does**.
- **"That button failed: no cell called "…"".** The action names a cell that doesn't exist, or was renamed. Names in actions follow renames made in edgy; a name typed by hand has to match exactly.
- **The number doesn't change.** `set!` sets a cell's value, and a formula's value always comes from its expression, so setting a formula changes nothing you can see. Keep a number that buttons change in a [data](kind:data) cell or an [input](kind:input), and let formulas read it.
- **It saves the same record twice.** Each press runs the action once. If people double-press, add **Ask first**, or hide the button once the record is saved with a `hidden` condition that reads a [data](kind:data) cell the action sets.
