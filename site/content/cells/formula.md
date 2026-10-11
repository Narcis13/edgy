---
title: Formula
---

A formula cell shows a value worked out from an expression, and works it out again whenever a cell it reads changes.

::ref kind formula

## When to use it

Use a formula for anything that should follow other cells: a total, a status word, a yes or no, a date worked out from another date. Nobody types into it and nothing a person does changes it; only the cells it reads do.

When the answer belongs inside a sentence, use a [text](kind:text) cell with a [text template](/language/templates/) instead: `Total: {{total | currency}}`. When a value must be changed by a button or a handler, keep it in a [data](kind:data) cell or an [input](kind:input) and let a formula read it.

## Try it

```live id=sale title="A sale" height=270
["col",
  ["row", {"size": "hug"},
    ["input", {"name": "qty", "type": "number", "label": "Quantity", "value": 2}],
    ["input", {"name": "price", "type": "number", "label": "Unit price", "value": 40}]],
  ["row", {"size": "hug"}, ["text", "Subtotal"], ["formula", {"name": "subtotal", "format": "currency"}, ["*", "$qty", "$price"]]],
  ["row", {"size": "hug"}, ["text", "Shipping (free from 100)"], ["formula", {"name": "shipping", "format": "currency"}, ["if", [">=", "$subtotal", 100], 0, 9]]],
  ["row", {"size": "hug"}, ["text", "**Total**"], ["formula", {"name": "total", "format": "currency", "style": {"weight": 650}}, ["+", "$subtotal", "$shipping"]]]]
```

Change the quantity to 3. The subtotal reaches 120, shipping drops to nothing and the total follows, all in one step. A formula never needs to be told to update: it reads cells by name, and edgy works out the cells in the order they depend on each other (see [the engine](/internals/engine/)).

```sx in=sale
subtotal
⇒ 80
shipping
⇒ 9
(set! qty 3)
total
⇒ 120
shipping
⇒ 0
```

## Adding and designing one

1. Select an empty cell and type `=` followed by the expression, then press [Enter](key:cell-formula). Or press `/` and choose **Formula**.
2. Give it a name in **Name** at the top of **Cell details**, so other cells can read it. `total` is read as `total` in `(* total 0.2)`.
3. Write or change the expression in **Formula**, in the **Content** section. It is a code editor: it colours the code, suggests functions and the document's cells, and shows the result while you type. Clicking a cell in the document while you type puts its name in the expression. ⌘E opens the [code studio](/editor/code-studio/). Enter on a selected formula edits it in place.

::shot designer-formula "The formula's designer: the expression with its live result, and the way the result is written."

**Show the result as** chooses how the value is written: **Automatic**, **Whole number**, **Two decimals**, **One decimal**, **Percent**, **Compact (1.2k)**, **Currency**, **US dollars**, **Euros**, **Pounds**, **Lei**, **Date**, **Time**, **Date and time** or **Time ago**. The formats are listed on [Formats](/language/formats/).

## In notation

The expression is the body:

```notation id=vat
["col",
  ["input", {"name": "net", "type": "number", "label": "Net", "value": 200}],
  ["formula", {"name": "gross", "format": "EUR"}, ["*", "$net", 1.2]]]
```

| Prop | What it is |
| --- | --- |
| `format` | How the result is written: `"int"`, `"number"`, `"percent"`, `"compact"`, `"currency"`, a three-letter currency such as `"EUR"`, a pattern such as `"0.00"` or `"0.0%"`, `"date"`, `"time"`, `"datetime"` or `"ago"`. Unset, the value is shown as the language writes it. |

A formula has the props every cell has (`name`, `size`, `hidden`, `style`, `on`); see [Cells](/cells/).

## Its value

A formula's value is what its expression gives: a number, text, a yes or no, a list, a record, or nothing. Other cells read it by name.

How a value is shown depends on its kind. A true or false result shows as `yes` or `no`. A list shows its items with commas: `1, 2, 3`. A number with no format shows up to two decimals, or four when it is under 1. A result of nothing shows the word *nothing* in grey. A formula that holds a function, such as `(fn (x) (* x 2))`, shows `ƒ`; other cells call it by the formula's name.

A formula that can't be worked out has no value. It shows its problem in red, and a cell that reads it shows the same problem with the formula's name in front:

```notation id=broken
["col", ["formula", {"name": "price_with_vat"}, ["*", "$price", 1.2]]]
```

```sx in=broken
price_with_vat
⇒ error: no cell called "price"
```

## Events

::ref events-of formula

`change` fires when what the formula reads changes and its result is different, whoever made the change; a formula with a `change` handler is a way to react to a computed value, such as a total crossing a limit. In Live a formula with a `click` or `dblclick` handler can be pressed like a button. See [Events and actions](/events/).

## Actions that change it

None. A formula's value always comes from its expression, so `set!` on a formula changes nothing you can see. To change what a formula says, change the cells it reads. To change the formula itself, edit its expression in Edit.

A formula can hide while it has nothing to say: give it a `hidden` condition, such as `(= qty 0)`.

## On a phone and on paper

A formula is a line of text, so on a phone it takes its place in the column cells stack into, and long results wrap. On paper it prints the value it shows in Live.

## Usual mistakes

- **The number doesn't change when a button sets it.** `set!` on a formula does nothing. Keep the number in a [data](kind:data) cell or an [input](kind:input), set that, and let the formula read it.
- **"set! only works in an action, such as a button".** An action was written where a value is expected. Move it to a button's **What it does** or to a handler.
- **`no cell called "price"`.** The expression names a cell that doesn't exist, isn't named yet, or was renamed by hand. Names follow renames made in edgy; a name typed by hand has to match exactly.
- **`circular reference: b → c → b`.** Two formulas read each other. Break the loop: one of them has to read something that doesn't read it back.
- **`expected a number, got "x"`.** Arithmetic was given text that is not a number. An empty cell counts as 0, and text that holds a number (`"12"`, `"1,200"`) counts as that number, but `"x"` or `"12 kg"` is an error. Check which cell holds the text.
- ***Empty formula*.** The cell has no expression yet. Write one in **Formula**.
