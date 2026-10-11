---
title: Data
---

A data cell holds one value for the document's own use: a wizard's current step, a flag, a lookup list. Formulas read it and actions change it, and readers never see it.

::ref kind data

## When to use it

Use a data cell for something the document has to remember that no one types: which step of a wizard is showing, whether a message has been dismissed, a list of regions, a rate of VAT. It is the place [buttons](kind:button) and [handlers](/events/) write to, because a [formula](kind:formula) always works its value out from its expression and can't be set.

When a person types the value, use an [input](kind:input). When the value can be worked out from other cells, use a formula. A data cell that only copies what a formula could say goes out of date the first time someone forgets to update it.

## Try it

```live id=wizard title="A wizard's step" height=130
["col",
  ["data", {"name": "step"}, 1],
  ["text", "Step **{{step}}** of 3"],
  ["row", {"size": "hug"},
    ["button", {"variant": "soft", "do": ["set!", "step", ["max", 1, ["-", "$step", 1]]]}, "Back"],
    ["button", {"do": ["set!", "step", ["min", 3, ["+", "$step", 1]]]}, "Next"]]]
```

The step lives in a data cell named `step`, which no reader ever sees. **Next** sets it one higher, but never past 3; **Back** sets it one lower, but never below 1. The text reads it with a [text template](/language/templates/). The [Order desk](template:elements) and [Market stall](template:events) templates keep their steps, rates and flags the same way.

```sx in=wizard
step
⇒ 1
(set! step (min 3 (+ step 1)))
(set! step (min 3 (+ step 1)))
(set! step (min 3 (+ step 1)))
step
⇒ 3
```

## Adding and designing one

1. Select a cell and press `/`, then choose **Data (hidden)**.
2. The menu names it for you (`data`, or `data2` if that is taken); change it in **Name** at the top of **Cell details**. A data cell written in notation without a name can't be read, and the designer offers one (**Name it** …).
3. In the **Content** section, pick **Kind of value** and type the value.

::shot designer-data "The data cell's designer: its kind of value, the value, and how formulas and buttons use it."

**Kind of value** is one of **Number**, **Text**, **Yes/no**, **List** and **Record**. Changing the kind converts what is there where it can. A list is typed **One item per line**, where numbers stay numbers, or **Edit as JSON**; a record is typed as JSON, with the names in quotes: `{"vat": 0.2, "region": "North"}`. The JSON boxes keep what you typed and show what is wrong until it reads.

Under the value the designer shows how to use it: *Formulas read this value as `step`* and, for a button, an example of changing it that fits the kind, such as `(set! step (+ step 1))` for a number or `(set! flag (not flag))` for a yes or no.

In Edit a data cell is a small chip with its name and value, so you can find and select it. In Live and on paper it takes no space and shows nothing.

## In notation

The value is the body:

```notation id=kinds
["col",
  ["data", {"name": "step"}, 1],
  ["data", {"name": "regions"}, ["North", "South"]],
  ["data", {"name": "cfg"}, {"vat": 0.2}],
  ["data", {"name": "dismissed"}, false]]
```

The props go first, even if there is only a name: a record placed first would be read as the props. A value can also be given as the `value` prop. A data cell without a value holds nothing (`nil`).

| Prop | What it is |
| --- | --- |
| `value` | The value, when not given as the body: a number, text, true or false, a list or a record. |

## Its value

The value is exactly what is stored: a number, text, a yes or no, a list or a record. Other cells read it by name. A text template shows a list with commas and a record as JSON.

```sx in=kinds
(len regions)
⇒ 2
(get cfg "vat")
⇒ 0.2
(* 100 (get cfg "vat"))
⇒ 20
dismissed
⇒ false
```

The value is saved in the document, like an input's. Changing it is a change to the document, so it shows in Activity and undoes with ⌘Z, and everyone who has the document open sees it.

## Events

::ref events-of data

`change` fires whenever the value is different, whoever changed it. A data cell with a `change` handler is a way to react to a counter or a flag, for example to show a message when a step is reached. See [Events and actions](/events/).

## Actions that change it

[set!](fn:set!) puts a new value in; [toggle!](fn:toggle!) flips a yes or no:

```sx in=kinds
(set! regions (concat regions (list "East")))
regions
⇒ (list "North" "South" "East")
(set! cfg (assoc cfg "vat" 0.25))
(get cfg "vat")
⇒ 0.25
(toggle! dismissed)
dismissed
⇒ true
```

[assoc](fn:assoc) and [concat](fn:concat) build a new record or list from the old one; `set!` replaces the whole value. Several actions in one: `(do (set! step 1) (toggle! dismissed))`.

## On a phone and on paper

A data cell is never shown in Live or on paper, so a phone and a printout look the same: nothing. In Edit it is the chip, which takes the width of its content.

## Usual mistakes

- **"Where is it?"** A data cell shows only in Edit, as a chip. Select it there, or select a cell that reads it and press its name in **Reads**, under **Links** in **Cell details**.
- **`another cell is already named "step"`.** Names are unique in a document. Pick another, or rename the cell that has it.
- **Nothing shows when it changes.** A data cell shows nothing itself. Put its value where readers can see it: in a text (`{{step}}`), a [formula](kind:formula) or a [stat](kind:stat).
- **The value is the wrong kind.** `(set! step "2")` stores the text `"2"`, not the number. Set what you mean: `(set! step 2)`.
- **Setting one field of a record loses the others.** `set!` replaces the whole value. Use `(set! cfg (assoc cfg "vat" 0.25))` to change one field and keep the rest.
- **Using it for what is worked out.** If a formula could say it, let a formula say it; a data cell has to be set by hand or by a handler every time.
