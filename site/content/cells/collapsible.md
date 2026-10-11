---
title: Collapsible
---

A collapsible puts cells under a heading that folds them away and brings them back when someone clicks it.

::ref kind collapsible

## When to use it

Use a collapsible for something that most readers don't need but some do: the small print of a quote, advanced settings, the working behind a number. It is one heading over its cells. When there are several such parts, an [accordion](kind:accordion) keeps their titles together; when readers should look at one part at a time, use [tabs](kind:tabs).

Whether it is open is the collapsible's [value](term:value): `true` while open, `false` while folded. A formula can react to it and a button can fold and unfold it.

## Try it

The heading shows the quantity, as any text does. The collapsible starts folded; press its heading, or the button:

```live id=more title="A collapsible" height=260
["col", {"style": {"gap": 8}},
  ["input", {"name": "qty", "type": "number", "label": "Quantity", "value": 3}],
  ["collapsible", {"name": "more", "title": "Details for {{qty}} chairs", "value": false},
    ["text", "Chairs ship flat. Assembly takes ten minutes."],
    ["formula", {"name": "total", "format": "currency"}, ["*", "$qty", 45]]],
  ["row", {"size": "hug", "style": {"gap": 8}},
    ["text", {"style": {"valign": "center"}}, "It is **{{(if more \"open\" \"folded\")}}**."],
    ["button", {"size": "hug", "variant": "soft", "do": ["toggle!", "more"]}, "Fold or unfold"]]]
```

The collapsible is named `more`:

```sx in=more
more
⇒ false
(toggle! more)
more
⇒ true
total
⇒ 135
(set! more false)
more
⇒ false
```

The cells under a heading go on working when it is folded: `total` is still the quantity times 45.

## Adding and designing one

1. Select a cell in **Edit** and press `/`, then choose **Collapsible**. The cell moves under a heading, **Details**, and the collapsible starts open so that you can keep working.
2. Double-click the heading to rename it: Enter keeps the new title and Esc drops it ([the key](key:tabs-rename)).
3. Click the heading to fold and unfold. Work on the cells under it as you do in a [column](kind:col): split, merge, move, duplicate. The last cell taken out leaves an empty cell behind.

::shot designer-collapsible "The designer of a collapsible: its heading, whether it is open, the number of cells and how formulas read it."

**Cell details** has:

- **Heading**: the words on the bar. It can carry a text template.
- **Right now**: **Open** or **Folded**. A folded collapsible shows only its heading, in **Edit** as well. The hint adds that printed pages always show it open.
- **Cells**: how many cells are under the heading, with **+** to add an empty one.
- How formulas read it: `(if more "Open" "Folded")`, and the action that changes it, `(toggle! more)`. When the collapsible has no name it offers **Name it** `more`.

## In notation

The cells are the body:

```notation id=small-print
["collapsible", {"name": "terms", "title": "Small print", "value": false},
  ["text", "Prices include delivery inside the UK. A quote is valid for 30 days."],
  ["text", {"style": {"fg": "muted", "size": 13}}, "Northwind Studio, 12 Harbour Lane, Bristol"]]
```

| Prop | What it is |
| --- | --- |
| `title` | The heading. Left out, it reads **Details**. It can carry a text template, such as `Items ({{count}})`. |
| `name` | Lets other cells read and change whether it is open. |
| `value` | `false` while folded. Left out or `true`, it is open. |
| `size` | The collapsible's own room inside its row or column: a weight, `"hug"` or `"120px"`. |
| `hidden` | `true`, or an expression: the whole collapsible is out of sight while it holds. |
| `style` | The look of the whole cell. See [Style keys](/styling/style-keys/). |
| `on` | Handlers: `open`, `close` and `change`. |

A collapsible written with no cells holds one empty cell.

## Its value

`true` while it is open and `false` while it is folded. A collapsible with no value set is open, so `(if more …)` reads it as open. Folding or unfolding it, in **Edit** or in **Live**, saves the value, the way ticking a list item does. It is kept in the document, and it is not a step for undo.

## Events

::ref events-of collapsible

[open](event:open) runs when it unfolds and [close](event:close) when it folds; [change](event:change) runs for either. They follow the value, so they run whoever changes it: a person, a button or another handler. See [Events and actions](/events/).

## Actions that change it

[toggle!](fn:toggle!) folds it when it is open and unfolds it when it is folded. [set!](fn:set!) sets it: `(set! more false)` folds it and `(set! more true)` unfolds it.

```sx
(toggle! more)
```

## On a phone and on paper

On a phone the collapsible takes the full width, and its heading is at least 44 pixels tall, to tap.

On paper it is always unfolded, so nothing a reader folded away is lost from the printed page; the heading prints as a title, without the arrow. A printed page doesn't end between the title and the first cell under it. See [The Page view](/editor/page-view/).

## Usual mistakes

- **I can't see the cells in Edit.** The collapsible is folded, and **Edit** folds it too. Click its heading, or choose **Open** under **Right now**.
- **The button does nothing.** The collapsible needs a name for `(toggle! more)` to find it, and it has none. The message is *That button failed:* `no cell called "more"`.
- **The heading reads "Details".** A collapsible with no title shows **Details**. Type a heading.
- **I folded it and it was open when I printed.** Printed pages always show a collapsible open.
- **I set it to `"no"` and it stayed open.** The value is `true` or `false`. In `(set! more "no")` the text `"no"` counts as true. Only `false`, `0`, empty text and an empty list fold it, and `nil` removes the value, which leaves it open.
