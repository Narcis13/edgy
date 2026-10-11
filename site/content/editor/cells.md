---
title: Working with cells
nav: Cells
---

This page covers how you shape a document in Edit: selecting [cells](term:cell), splitting one into two, merging several into one, duplicating, clearing and removing them, and changing how much room each one takes.

A document is one tree of cells. A [group](term:group) (a row or a col) holds other cells side by side or stacked; everything else is a [leaf](term:leaf). You never draw boxes: you start with one empty cell and divide it.

## Selecting

Click a cell to select it. A selected cell has a coloured outline, a toolbar above it and a **+** on each edge. These all change the selection:

- **Click** a cell. Click a text or empty cell that is already selected to type in it. Double-click a text, empty, formula or button cell to edit it at once.
- **Arrow keys** ([move](key:move)) select the nearest cell in that direction. Hold Shift to add it to the selection instead.
- **Shift-click** (⌘-click on a Mac) adds a cell to the selection, or takes it out if it is already in.
- **Tab** and **Shift+Tab** ([next-cell](key:next-cell)) select the next or the previous cell in reading order, and wrap round at the ends. Cells behind a tab that isn't showing, or in a closed section, are skipped.
- **Esc** ([parent](key:parent)) selects the cell around the selected one: the row or column it sits in. Press it again to go up another level, and once more to select nothing.
- With nothing selected, ↓, → or Tab select the first cell.

Selecting a group is how you act on it as a whole. The toolbar says what you have, for example **Row of 3**.

When you select several cells, **Cell details** lists them and applies text, padding and box changes to all of them. See [The right-hand panel](/editor/panel/).

While you are typing a formula, a click on a cell doesn't select it: it types the cell's name into the formula instead.

## Splitting

To split a cell, select it and do one of these:

- Press the **+** on the edge you want the new cell on. Pointing at one shades the half of the cell the new cell will take.
- Press ⌥ and an arrow ([split](key:split)): ⌥→ adds a cell on the right, ⌥← on the left, ⌥↓ below, ⌥↑ above.
- Use **Split into left and right** or **Split into top and bottom** in the toolbar.

::shot split "A selected cell with a + on the middle of each edge, and the toolbar above it."

::clip split "Splitting a cell with the + on its edges, then choosing what the new cells hold."

The new cell is empty and selected, so you can type or press `/` at once. The cell you split gives up half of its room: in a row, the two cells share the width the old one had; the document doesn't grow.

Where the cell sits decides what the split builds:

- If the cell is already in a group that runs the same way (you split to the right inside a row), the new cell joins that group and takes half of the old cell's share.
- Otherwise a new group takes the cell's place and holds the old cell and the new one, half each.
- Splitting a tab or a section adds another tab or section beside it, with a title of its own, instead of an empty cell.

::diagram cell-tree

Every split is an [op](term:op), the same small instruction an agent sends. This pair splits a cell and merges it back:

```notation id=pair
["col",
  ["text", {"name": "intro"}, "Hello"],
  ["text", {"name": "outro"}, "Goodbye"]]
```

```ops in=pair
[["split", "intro", "row", {"id": "side"}],
 ["merge", "intro", "side"]]
```

The editor tidies the tree after every change: a row or column that nobody named or styled, and that is left with one cell, is replaced by that cell, so you don't build up layers that do nothing.

## Merging

Select the cells and press ⌘M ([merge](key:merge)), or **Merge into one cell** in the toolbar. The button is greyed out, and says **Select neighbouring cells to merge them**, while the selection can't be merged. Three selections work:

- **Neighbours**: two or more cells next to each other in the same group.
- **A rectangle of a grid**: cells that span several rows of a grid whose rows are cut at the same places. The merged cell takes the whole block.
- **A whole row or column**: select the group itself. It becomes one cell.

The merged cell keeps what the first cell with content held. If every cell with content is text, their texts are joined with a blank line between. Whatever else the other cells held is dropped, so merge empty cells freely and merge full ones with care; ⌘Z brings them back. The merged cell takes the room the cells had together.

When a merge can't be done, the editor says why: *those cells are not next to each other*, *those cells don't form a rectangle*, or, for cells in different tabs, that they can't be merged until you move them into one.

## Moving and swapping

Cells do not drag to a new place. To change the order:

- Select exactly two cells and press **Swap the two cells** in the toolbar. They trade places and keep their own sizes.
- A tab or a section moves with **Move left** and **Move right** (**Move up** and **Move down** in an accordion) in the **⋯** menu on its title, or with the arrows beside it under **Cell details**.
- An agent, or you in [notation](term:notation), can place a cell beside any other with the [move](op:move) op.

## Duplicating

⌘D ([duplicate](key:duplicate)), or **Duplicate** in the toolbar, copies the selected cell and everything in it, and puts the copy right after it: below in a column, to the right in a row. The copy is selected. A cell with a name gets a free one with a number on the end: `qty` becomes `qty2`, so formulas keep reading the original.

## Clearing and removing

⌫ or Delete ([clear](key:clear)) does one of two things:

- On a cell that holds something, it **clears** it: the cell stays, empty, with its place and size.
- On a cell that is already empty, it **removes** it: the cell goes and a neighbour takes its room.

On a selected group it removes the whole group and every cell in it. The toolbar button's tooltip says which it will do, **Clear (⌫)** or **Remove (⌫)**. The only cell that can't be removed is the last one of the document, which stays as an empty cell. A tab bar or an accordion keeps at least one tab or section.

## Sizes

A cell's size is its share of the group it is in. There are three kinds:

| Size | In **Cell details** | What it means |
| --- | --- | --- |
| A number of **shares** | **Fill** | The cell shares what is left with the other cells that fill, in proportion: a cell with 2 shares gets twice the room of a cell with 1. A new cell has 1. |
| **Hug** | **Hug** | As small as its content needs: a button in a row takes the width of its label. |
| A number of pixels | **Fixed** | Exactly that wide (in a row) or that high (in a column). |

Shares only mean something next to other cells in the same group. They are called **Width** in a row and **Height** in a column, under **Spacing and size** in [Cell details](/editor/panel/).

To change a size by hand, drag the line between two cells. When both cells fill, the pair keeps its total and trades room, so the rest of the row doesn't move. The least a cell can shrink to is 24 pixels. Dragging next to a cell that hugs or is fixed turns that cell into a fixed one at the width you drag to. Double-click the line to even out two cells that fill. A drag is one step for undo.

## Usual mistakes

- **Merge is greyed out.** The cells aren't neighbours, or don't make a rectangle. Select cells that touch, or press Esc to select the row or column around them and merge that.
- **The + isn't there.** The **+** buttons show for exactly one selected cell that you aren't typing in, and not while the `/` menu is open. Press Esc, then select the cell.
- **Delete took a whole row.** A selected group is removed with everything in it. ⌘Z puts it back.
