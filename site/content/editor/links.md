---
title: Links between cells
nav: Links
---

Show links between cells draws lines from the selected cell to the cells it reads and to the cells that read it, so you can see what a cell depends on and what depends on it before you change it.

::shot links "A selected formula with a solid blue line from each cell it reads and a dashed green line to each cell that reads it. Each linked cell is outlined and tagged with its name."

## Turning it on

The button with the line-and-dots icon in the header is **Show what the selected cell reads and feeds**; on a phone it is **Show links between cells** in the **More** menu. It is on when you open a document. Press it to turn the lines off, and again to bring them back. It isn't there for someone who may only read the document.

## What you see

Select one cell in Edit. If it reads other cells, or others read it, edgy draws:

- A **solid blue line** from each cell it **reads**, with an arrow into the selected cell. Those cells are outlined in blue and tagged with their names.
- A **dashed green line** to each cell it **feeds**, with an arrow out of the selected cell. Those cells are outlined in green and tagged.

The lines leave and arrive through the edges that face each other, and follow the cells as the layout changes.

Take a small document:

```notation id=links
["col",
  ["input", {"name": "qty", "type": "number", "value": 3}],
  ["input", {"name": "price", "type": "number", "value": 4}],
  ["formula", {"name": "subtotal"}, ["*", "$qty", "$price"]],
  ["formula", {"name": "total", "format": "currency"}, ["*", "$subtotal", 1.2]]]
```

Select `subtotal` and you see two blue lines, from `qty` and from `price`, and one green dashed line to `total`. Select `qty` and you see one green dashed line to `subtotal`: it feeds it, and `total` only indirectly, so `total` isn't linked.

## What counts

A cell **reads** another when working out its own value uses the other's value: a name in a formula, in a text template, in a condition or in any other expression of the cell. A cell **feeds** the cells that read it. Only direct links are drawn.

::diagram eval-graph

The same two lists are at the foot of **Cell details**, under **Links**, as buttons: **Reads** and **Feeds**. Press one to select that cell. See [The right-hand panel](/editor/panel/).

Links are about values. A button's action that changes a cell, or a handler that sets one, does not draw a line, because it doesn't read the cell to show it. A cell that reads a collection with [rows](fn:rows) has no line for it either, since a collection isn't a cell.

## What it's for

- **Before you change a cell.** Select it and see everything that follows it. Renaming a cell updates every formula that reads it, but deleting one leaves them with an error.
- **When a number is wrong.** Select the formula that shows it and follow the blue lines back to what it reads.
- **To tidy up.** A cell with no lines at all is read by nothing and reads nothing.

Lines are drawn only in Edit, and only for exactly one selected cell. In Live and on paper there are none.
