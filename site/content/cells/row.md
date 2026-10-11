---
title: Row
---

A row holds cells side by side and shares its width between them.

::ref kind row

## When to use it

Use a row when cells belong on one line: a label beside its field, three numbers across, a title on the left and a date on the right, the columns of a line in a quote. When cells belong one under another, use a [col](kind:col). Rows and columns nest, and a document is usually a column of rows.

A row shows nothing of its own, but you can give it a look: a background, a border, padding. Group cells in a row when they share a look or a name, and when a formula needs to read them as one.

## Try it

Each cell in a row says how much width it wants. The first cell here hugs its text, the next two share what is left in the proportion 1 to 2, and the last has a fixed width:

```live id=widths title="Widths in a row" height=110
["row", {"style": {"gap": 8}},
  ["text", {"size": "hug", "style": {"bg": "accent-soft", "radius": 8}}, "**Hug**"],
  ["text", {"style": {"bg": "sunken", "radius": 8}}, "Weight 1"],
  ["text", {"size": 2, "style": {"bg": "sunken", "radius": 8}}, "Weight 2, twice the width of weight 1"],
  ["text", {"size": "120px", "style": {"bg": "live-soft", "radius": 8}}, "Fixed, 120px"]]
```

A row that has a name can be read. Here the row is called `line`, and `(sib 1)` and `(sib 2)` in the last cell read the cells at positions 1 and 2 of the row they sit in. Change a number:

```live id=line title="A row you can read" height=110
["row", {"name": "line", "style": {"gap": 12}},
  ["text", {"size": "hug", "style": {"valign": "center"}}, "Tea"],
  ["input", {"type": "number", "label": "Quantity", "value": 2}],
  ["input", {"type": "number", "label": "Unit price", "value": 3}],
  ["formula", {"format": "currency", "style": {"valign": "center"}}, ["*", ["sib", 1], ["sib", 2]]]]
```

The row's value is the list of the values of its cells, in order. The text is a text, the inputs are numbers, and the formula is their product:

```sx in=line
line
⇒ (list "Tea" 2 3 6)
```

```sx in=line
(sum line)
⇒ 11
(nth line 3)
⇒ 6
```

`sum` adds every number it finds and skips the text, so it adds the quantity, the price and the amount: 2 + 3 + 6 is 11. `nth` reads the cell at position 3, counted from 0: the amount. This is why `sib` works in a copy of the row too: it reads the cells next to it, whatever they are called.

## Adding and designing one

A row isn't in the `/` menu. You make one by splitting a cell:

1. Select a cell in **Edit**.
2. Click the **+** on its right or left edge, press Alt+→ or Alt+← ([the key](key:split)), or press **Split into left and right** in the toolbar above the cell.
3. The cell and a new, empty cell are now a row. If the cell was already in a row, the new cell joins that row beside it, and the two share the width the cell had.
4. Choose what the new cell holds with `/`.

::clip split "Splitting a cell with the + on its edges, then choosing what the new cells hold."

To work on the row itself, select a cell in it and press Esc ([the key](key:parent)): Esc selects the cell around the selected one. The toolbar then says **Row of 3**, and **Cell details** shows the row's designer.

::shot designer-row "The row's designer: which way its cells run, how many there are, the gap between them and what happens on a phone."

The designer has four settings:

- **Cells run**: **Side by side** is a row; **Stacked** turns it into a [col](kind:col) with the same cells.
- **Cells**: how many. **+** adds an empty cell at the end. **−** removes the last cell, and only while it is empty; a row keeps at least two cells.
- **Gap between cells**: **None**, 4, 8 or 16 pixels, or any number in the box.
- **On a phone**: **Stack**, **Keep in line** or **Always stack**. See [On a phone and on paper](#on-a-phone-and-on-paper).

The width of each cell is the cell's own setting. Select the cell, open **Spacing and size** and choose under **Width**: **Fill** shares the room by weight (**shares**, 1 unless you change it), **Hug** fits the content, **Fixed** is a number of pixels. In **Edit** you can also drag the edge between two cells to move room from one to the other, and double-click it to make two cells that fill even. Pressing ⌘M ([the key](key:merge)) merges selected neighbouring cells back into one.

## In notation

The cells are the body. A bare string is a text cell:

```notation id=header
["row", {"size": "hug", "style": {"gap": 12}},
  ["text", {"style": {"size": 22, "weight": 700}}, "Northwind Studio"],
  ["text", {"size": "hug", "style": {"fg": "muted"}}, "Quote 2026-014"],
  "Valid for 30 days"]
```

| Prop | What it is |
| --- | --- |
| `name` | Lets other cells read the row: the list of its cells' values. |
| `size` | The row's own room inside its parent: a weight, `"hug"` or `"120px"`. |
| `hidden` | `true`, or an expression: the whole row is out of sight while it holds. |
| `style.gap` | Pixels between the cells. |
| `style.stack` | What happens on a phone: `"auto"` (the default), `"never"` or `"always"`. |
| `style` | The rest of the look: `bg`, `pad`, `border`, `radius`, and so on. See [Style keys](/styling/style-keys/). |

There are two things called size. A cell's `size` is the room it takes in its row or column. Its `style.size` is the size of its letters, in pixels.

## Its value

A row has no value of its own: it reads as the list of the values of its cells, in order. Only a row with a name can be read by other cells. Inside a row, `(sib n)` is the value of its n-th cell (counted from 0; negative numbers count from the end) and `(idx)` is the position of the cell that asks. See [Names and references](/language/names/).

## Events

::ref events-of row

A row raises none. Give the handlers to the cells inside it, or to the document. See [Events and actions](/events/).

## Actions that change it

No action changes how a row lays its cells out. Actions work on the cells in it, and on the row as a whole:

- `(dup! (child line 0))` copies the first cell of `line` after itself, and `(remove! (child line -1))` removes its last cell. `child` picks the n-th cell of a named row or column; -1 is the last. These are most useful on a column of repeated rows: see [col](kind:col).
- `(hide! line)` hides the whole row and `(show! line)` brings it back.

A row can also hide itself while something holds, with a `hidden` condition. This one shows a row only on step 2 of a wizard:

```sx
(!= step 2)
```

## On a phone and on paper

When the document has 600 pixels of room or less, which a phone gives it, a row lets its cells wrap onto the next line instead of squeezing them. What it does depends on **On a phone**:

- **Stack** (`"auto"`, the default): cells that share the room keep at least 120 pixels, or 260 for a [table](kind:table), [chart](kind:chart), [calendar](kind:calendar), [canvas](kind:canvas) or a group of cells. Those that no longer fit move under the others, so a few short fields stay in one line and a long row of them wraps onto several. Cells that hug keep their size.
- **Keep in line** (`"never"`): the cells stay side by side and give up some padding, like the lines of a table. The [Quote](template:quote) template uses it for its lines.
- **Always stack** (`"always"`): the cells are one under another at any width.

On paper a row keeps its cells side by side whatever the width of the paper. A printed page ends between cells, never through one if that can be avoided, and between rows rather than inside one when it can. See [The Page view](/editor/page-view/).

## Usual mistakes

- **A row inside a row has gone.** A row nobody named, styled, hid or gave handlers to is only structure, so edgy folds it into the row around it, and its cells become cells of the outer row. Give the inner row a name or a style, such as padding, and it stays.
- **A row with one cell has gone too.** For the same reason: a plain row left with a single cell is replaced by that cell. A row with nothing left in it becomes an empty cell.
- **The − next to Cells is greyed out.** A row keeps at least two cells, and only an empty last cell can be removed from the designer. Delete the cell itself instead: select it and press Backspace, twice if it holds something (the first press clears it, the second removes it).
- **On a phone the cells of my table line have stacked.** Set **On a phone** to **Keep in line**.
- **I can't select the row.** Selecting a cell inside it selects that cell. Press Esc to select the row around it, or choose the row in the trail above its name in **Cell details**.
