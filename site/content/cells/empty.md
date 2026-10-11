---
title: Empty
---

An empty cell holds nothing yet: it is the new cell you get when you split a cell, waiting for you to choose what it holds.

::ref kind empty

## When to use it

You don't have to choose an empty cell: you get one each time you split a cell, and every document starts as one. Fill it by typing or by pressing `/`. Leave one empty on purpose when you want space: an empty cell takes its share of a row or column and shows nothing, so it pushes the cells beside it apart.

## Try it

The empty cell in the middle of this row takes all the room the title and the toggle leave, so the toggle sits at the far end:

```live id=spacer title="An empty cell as a spacer" height=90
["row", {"name": "bar", "style": {"gap": 8}},
  ["text", {"size": "hug", "style": {"size": 20, "weight": 700}}, "Orders"],
  ["empty"],
  ["input", {"type": "toggle", "label": "Show paid", "size": "hug"}]]
```

The row still counts it as a cell, and its value is nothing:

```sx in=spacer
bar
⇒ (list "Orders" nil false)
(len bar)
⇒ 3
```

## Adding and designing one

There are four ways to get an empty cell:

- Split a cell. The new cell is empty. Click a **+** on the cell's edge, or press Alt+Arrow ([the key](key:split)).
- Press Backspace on a cell that holds something. The cell is cleared: it is empty again. Pressing it on a cell that is already empty removes the cell, and its neighbours take the room ([the key](key:clear)).
- Choose **Empty** from the `/` menu.
- Turn a row or a column that has no cells left into one: edgy replaces it with an empty cell that keeps its name and size.

In **Edit** an empty cell shows the hint *Type, or press / to choose*. What you can do with it:

- Type. The first letter starts a [text](kind:text) cell. Starting with `=` and then an expression makes it a [formula](kind:formula): press Enter to finish.
- Press `/` ([the key](key:kind-menu)) and choose a kind.
- Drop a picture file onto it, or paste one while it is selected: the cell becomes a [picture](kind:image).
- Select it and choose from **Cell details**, which asks **What should this cell hold?** and lists the kinds in groups.

::shot designer-empty "The designer of an empty cell: the kinds it can hold, in groups."

An empty cell has nothing else to design, but it has the settings every cell has: **Spacing and size**, **Box**, **Show only when**. You can give it a background to make a patch of colour.

## In notation

```notation id=blank
["row",
  ["text", "Left"],
  ["empty", {"size": 2}],
  ["text", {"size": "hug"}, "Right"]]
```

| Prop | What it is |
| --- | --- |
| `name` | A name, so that a formula can read it. |
| `size` | Its room inside its row or column: a weight, `"hug"` or `"120px"`. |
| `hidden` | `true`, or an expression: the cell is out of sight while it holds. |
| `style` | Its look, such as `bg` for a patch of colour. See [Style keys](/styling/style-keys/). |

## Its value

An empty cell is worth nothing (`nil`). In a named row or column it is a `nil` in the list, as in `bar` above.

## Events

::ref events-of empty

An empty cell raises none.

## Actions that change it

None. It holds nothing, so there is nothing to set. Choosing what it holds is an editing step, done with `/` or by typing.

## On a phone and on paper

An empty cell takes at least 44 pixels of height, in **Live** and on paper too, even though nothing shows in it. On a phone it also follows the rules of any other cell that shares the width: in a row that wraps, a spacer that no longer fits moves to a line of its own, and leaves a blank band. Set the row's **On a phone** to **Keep in line** if that happens. See [row](kind:row).

On paper an empty cell prints as blank space.

## Usual mistakes

- **There is a blank band in Live that I didn't mean.** It is an empty cell, which keeps at least 44 pixels of height. Select it in **Edit** and press Backspace to remove it, or give it a `hidden` condition.
- **Backspace removed the cell I wanted to keep.** On a cell that is already empty, Backspace removes it. Use undo ([the key](key:undo)) to bring it back.
- **I can't type into it in Live.** Cells are filled in **Edit**; **Live** is for using the document.
- **My text started with `=` and became a formula.** An empty cell whose text starts with `=` and goes on as an expression becomes a formula when you finish typing. If you meant text, press `/`, choose **Text** and type it again: in a text cell a leading `=` stays text.
