---
title: Column
---

A column holds cells one under another and shares its height between them.

::ref kind col

## When to use it

Use a column to stack cells: a heading over its text, a form's fields, the lines of an order, the sections of a document. Most documents are a column of rows. When cells belong side by side on one line, use a [row](kind:row). Rows and columns nest: a column inside a row is one tall cell of that row.

Like a row, a column shows nothing of its own, but it can have a look (a background, a border, padding) and a name, so that a formula can read it as a list of lines.

## Try it

This column is called `lines`. It holds one row for each line of an order. **Add a line** copies the last row, with whatever is typed in it, and **Remove the last** takes it away. The total adds up the amounts, whatever number of lines there are:

```live id=lines title="A column of lines" height=270
["col", {"style": {"gap": 8}},
  ["col", {"name": "lines", "size": "hug"},
    ["row", {"size": "hug"},
      ["input", {"type": "text", "value": "Tea", "size": 2}],
      ["input", {"type": "number", "value": 2, "min": 0}],
      ["input", {"type": "number", "value": 3, "min": 0}],
      ["formula", {"format": "currency", "style": {"valign": "center", "align": "end"}}, ["*", ["sib", 1], ["sib", 2]]]],
    ["row", {"size": "hug"},
      ["input", {"type": "text", "value": "Cake", "size": 2}],
      ["input", {"type": "number", "value": 1, "min": 0}],
      ["input", {"type": "number", "value": 5, "min": 0}],
      ["formula", {"format": "currency", "style": {"valign": "center", "align": "end"}}, ["*", ["sib", 1], ["sib", 2]]]]],
  ["row", {"size": "hug"},
    ["button", {"size": "hug", "variant": "soft", "icon": "plus", "do": ["dup!", ["child", "lines", -1]]}, "Add a line"],
    ["button", {"size": "hug", "variant": "ghost", "do": ["remove!", ["child", "lines", -1]], "hidden": ["<=", ["len", "$lines"], 1]}, "Remove the last"]],
  ["formula", {"name": "total", "format": "currency", "style": {"size": 22, "weight": 700}}, ["sum", ["column", "$lines", 3]]]]
```

Each line is a row whose last cell is `(* (sib 1) (sib 2))`: the quantity times the price, read from the cells beside it. `lines` reads as a list of lists, one list for each row, and `(column lines 3)` is the amounts, the cell at position 3 of every line.

```sx in=lines
total
⇒ 11
(dup! (child lines -1))
(len lines)
⇒ 3
total
⇒ 16
(remove! (child lines -1))
(len lines)
⇒ 2
```

The same two actions are in the buttons. The copy of the Cake line added 5 to the total, and removing the last line took it off again.

## Adding and designing one

A column isn't in the `/` menu. You make one by splitting a cell:

1. Select a cell in **Edit**.
2. Click the **+** on its bottom or top edge, press Alt+↓ or Alt+↑ ([the key](key:split)), or press **Split into top and bottom** in the toolbar above the cell.
3. The cell and a new, empty cell are now a column. If the cell was already in a column, the new cell joins that column, above or below it.
4. Choose what the new cell holds with `/`.

To work on the column itself, select a cell in it and press Esc ([the key](key:parent)): the toolbar then says **Column of 3**, and **Cell details** shows its designer.

::shot designer-col "The column's designer: which way its cells run, how many there are and the gap between them."

The designer has three settings:

- **Cells run**: **Stacked** is a column; **Side by side** turns it into a [row](kind:row) with the same cells.
- **Cells**: how many. **+** adds an empty cell at the end. **−** removes the last cell, and only while it is empty; a column keeps at least two cells.
- **Gap between cells**: **None**, 4, 8 or 16 pixels, or any number in the box.

The height of each cell is the cell's own setting. Select the cell, open **Spacing and size** and choose under **Height**: **Fill** shares the column's height by weight (**shares**, 1 unless you change it), **Hug** is as tall as the content, **Fixed** is a number of pixels. In **Edit** you can also drag the edge between two cells, and double-click it to make two cells that fill even.

A document is at least 560 pixels tall unless you change **Least height**, which is in the document's own settings (select no cell, then **Page**). In a short document the cells of the top column that are set to **Fill** grow to fill that height. Set a cell to **Hug** to keep it to its content, as the [Quote](template:quote) template does for its header and its lines.

## In notation

The cells are the body:

```notation id=card
["col", {"size": "hug", "style": {"gap": 4, "pad": 12, "bg": "sunken", "radius": 12}},
  ["text", {"style": {"size": 11.5, "weight": 650, "case": "upper", "fg": "muted"}}, "Total due"],
  ["text", {"style": {"size": 34, "weight": 750}}, "1,840.00 EUR"],
  ["text", {"style": {"fg": "muted"}}, "Ada Lovelace, due 15 November"]]
```

| Prop | What it is |
| --- | --- |
| `name` | Lets other cells read the column: the list of its cells' values. |
| `size` | The column's own room inside its parent: a weight, `"hug"` or `"120px"`. |
| `hidden` | `true`, or an expression: the whole column is out of sight while it holds. |
| `style.gap` | Pixels between the cells. |
| `style` | The rest of the look: `bg`, `pad`, `border`, `radius`, and so on. See [Style keys](/styling/style-keys/). |

## Its value

A column has no value of its own: it reads as the list of the values of its cells, in order. A column of rows is a list of lists, as `lines` is above. Only a column with a name can be read by other cells. [first](fn:first), [nth](fn:nth), [len](fn:len) and [column](fn:column) take such a list apart. See [Names and references](/language/names/).

## Events

::ref events-of col

A column raises none. Give the handlers to the cells inside it, or to the document. See [Events and actions](/events/).

## Actions that change it

[dup!](fn:dup!) and [remove!](fn:remove!) add and take away cells. `(child lines -1)` is the last cell of `lines`; `0` is the first. A column of repeated rows is how a quote or a list of attendees grows. [hide!](fn:hide!) and [show!](fn:show!) hide the whole column and bring it back, and a column can hide itself with a `hidden` condition. This hides the **Remove the last** button while only one line is left:

```sx
(<= (len lines) 1)
```

## On a phone and on paper

A column stays one column on a phone, and its cells take its full width. Rows inside it wrap their cells as the [row](kind:row) page describes.

On paper the cells print one under another, and a printed page ends between cells, never through one if that can be avoided. To end a page where you choose, put a [page break](kind:break) between the cells of the top column.

## Usual mistakes

- **A cell is taller than its content.** Its height is set to **Fill**, and the column has room to give: a document is at least 560 pixels tall by default. Set **Height** to **Hug**.
- **A column inside a column has gone.** A column nobody named, styled, hid or gave handlers to is only structure, so edgy folds it into the column around it. Give the inner column a name or a style, such as padding, and it stays. A plain column left with a single cell is replaced by that cell.
- **"…has no cell -1".** `(child lines -1)` finds nothing because `lines` has no cells left. A column that loses its last cell becomes an empty cell, and `lines` is then that empty cell. Keep the **Remove the last** button hidden while one line is left, as the example does.
- **The − next to Cells is greyed out.** A column keeps at least two cells, and only an empty last cell can be removed from the designer. Delete the cell itself instead: select it and press Backspace, twice if it holds something (the first press clears it, the second removes it).
- **I can't select the column.** Selecting a cell inside it selects that cell. Press Esc to select the column around it, or choose the column in the trail above its name in **Cell details**.
