---
title: Your first document
---

This page takes about ten minutes and builds a small document from nothing: two inputs, a formula that multiplies them, and a sentence that says the answer, and then you use it in Live.

You need edgy running (see [Install and run](/start/install/)) and a window on a computer; on a phone a document opens in Live, where you can't shape it, so press **Edit** first.

## Start a blank document

1. Open the library at `http://localhost:5173`.
2. Press **New document**. A blank document opens in **Edit**: one empty cell that says *Type, or press / to choose*, under the title **Untitled**.
3. Click the title, select all (⌘A, or Ctrl+A), type `Trip cost` and press Enter. Clicking puts the cursor in the title but does not select *Untitled*, so without the select-all your words would be added to it.

Every document is a tree of [cells](term:cell). Yours is a tree with one cell, and you grow it by splitting.

## Split the first cell

Click the cell. It is outlined, a toolbar floats above it, and a **+** appears in the middle of each edge.

::shot split "A selected cell with a + on each edge."

1. Press the **+** on the bottom edge, or press ⌥↓ (Alt+↓ on Windows and Linux). The cell becomes two, one above the other, and the new one is selected.
2. Select the upper cell: click it, or press ↑.
3. Press the **+** on its right edge, or ⌥→. The upper cell is now two cells side by side, and the new one on the right is selected.
4. Press ⌥→ again. Now there are three cells in a row, above one wide cell.

::clip split "Splitting a cell with the + on its edges, then choosing what the new cells hold."

A split cuts the selected cell in half and puts a new, empty cell on the side you chose. Splitting sideways a cell that sits in a stack makes a row around it, which is why steps 3 and 4 give you a row above the wide cell. The row is a [group](term:group): a cell that holds other cells. The first cell is now twice as wide as the other two, because step 4 cut the second one in half. Drag the line between two cells to change that, or leave it.

If you split the wrong way, press ⌘Z (Ctrl+Z elsewhere) to undo. See [the split shortcut](key:split) and [the other keys](/start/keyboard/).

## Choose what the cells hold

An empty cell holds nothing yet. You choose its [kind](term:kind) with the `/` menu.

1. Click the left cell of the row and press `/`. A menu opens over the cell with a search field.
2. Type `number` and press Enter. The cell becomes a number input holding `0`.
3. Click the middle cell, press `/`, type `number`, press Enter.

Leave the cell on the right empty for a moment. The `/` menu lists every kind; see [The / menu](/editor/slash-menu/) and [Cells](/cells/).

## Name the cells

A formula finds a cell by its name, so each cell it reads needs one. Names go in **Cell details**, the panel on the right. If it is closed (a narrow window starts with it closed), press the panel button in the header, the one titled **Cell details**.

Select the left cell. In **Cell details**:

1. In **Name**, type `qty` and press Enter.
2. Under **Content**, in **Label**, type `Quantity` and press Enter. The label is shown above the input.
3. In **Value**, type `3` and press Enter. This is what the input holds to start with.

Select the middle cell and do the same: **Name** `price`, **Label** `Price`, **Value** `12.5`.

A name starts with a letter and holds letters, digits, `-` and `_`; no two cells share one. See [Names and references](/language/names/). Once a cell has a name, the formula bar under the header shows it in bold instead of an id such as `c4`.

## Add the formula

Click the empty cell on the right, press `/`, type `formula` and press Enter. The cell turns into a code field. Type:

```sx
(* qty price)
```

and press Enter. The cell shows `37.5`: three times twelve and a half. Instead of typing a name you can click the cell that has it while you write the formula, and edgy inserts the name.

> [!TIP]
> Faster still: in an empty cell, type `=(* qty price)` and press Enter. The cell becomes a formula (see [the = shortcut](key:cell-formula)).

Now name it and format it. With the formula cell selected, in **Cell details**:

1. **Name**: `total`.
2. **Show the result as**: **Currency**. The cell shows `$37.50`.

Select `total` again and look at the document: lines run from `qty` and `price` to the formula. **Cell details** lists them under **Links**, as *Reads*. This is how edgy knows to work `total` out again when either input changes. Press the **Show what the selected cell reads and feeds** button in the header to turn the lines off and on.

## Write the sentence

Click the wide cell at the bottom and type:

```text
Total: {{total | currency}} for {{qty}} items.
```

You don't need to open anything first: the first letter you type starts the text. Press Esc when you have finished. The cell reads *Total: $37.50 for 3 items.*

Text between double braces is a [text template](term:text-template). edgy works out what is inside and puts the result in the sentence. `| currency` is a [format](format:currency), the same one you picked for `total`:

```sx
(fmt 37.5 "currency")
⇒ "$37.50"
```

See [Text templates](/language/templates/) and [Formats](/language/formats/).

## Use it in Live

Press **Live** in the header. The outlines, the **+** buttons and the toolbar go away, and what is left is the document as someone will use it.

Click into **Quantity**, select its number and type `5`. The total changes to `$62.50`, and so does the sentence. Change **Price** and watch both again.

What you type in Live is kept in the document, so type `3` and `12.5` again if you want the starting numbers back. To shape the document again, press **Edit**. **Edit**, **Live** and **Page** are explained in [Edit, Live and Page](/start/views/).

Open **Activity and messages** in the header and look at the list: each step you took is there as a short expression that starts with the name of an op (`split`, `put`, `set`…), with your name and the time. This is how every change is made, by a person or by an agent. See [Activity](/editor/activity/).

## The finished document

This is the document you built, running in the page. Change a number.

```live id=trip title="Trip cost" height=170
["col",
  ["row", {"size": "hug"},
    ["input", {"name": "qty", "type": "number", "label": "Quantity", "value": 3}],
    ["input", {"name": "price", "type": "number", "label": "Price", "value": 12.5}],
    ["formula", {"name": "total", "format": "currency"}, ["*", "$qty", "$price"]]],
  ["text", {"size": "hug"}, "Total: {{total | currency}} for {{qty}} items."]]
```

Pressing a key in an input sets the cell, and `total` follows. The same can be done from code, which is what a button does:

```sx in=trip
(* qty price)
⇒ 37.5
(set! qty 5)
(* qty price)
⇒ 62.5
```

## Where to go next

- To add a button that saves what you worked out, follow the [quote tutorial](/tutorials/quote/).
- To learn the keys you used and the ones you didn't, see [Keyboard](/start/keyboard/).
- To see what else a cell can hold, see [Cells](/cells/).
