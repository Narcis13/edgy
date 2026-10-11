---
title: Cells
---

A cell is the one building block of an edgy document: a box that holds text, a field, a formula, a button, a chart, or other cells.

This page explains what a cell is, how cells fit into a tree, what names are for, and how to choose a [kind](term:kind) for a cell. Every kind has its own page, linked below.

## What a cell is

Every cell has a **kind**, which says what it is: text, an input, a formula, a table. It has an id that edgy gives it, and it can have a **name** that other cells use to read it. Everything else is optional:

| Prop | What it is |
| --- | --- |
| `name` | What other cells call it: `qty`, `total`. See [Names](#names). |
| `size` | How much room it takes inside its row or column: a weight (the default is 1), `"hug"`, or a fixed `"120px"`. See [Sizes](#sizes-in-a-row-or-column). |
| `hidden` | `true`, or an expression: the cell is out of sight while it holds. |
| `on` | What the cell does when something happens to it, such as a click or a change. See [Events and actions](/events/). |
| `style` | Its look: colours, padding, type, borders. See [Style keys](/styling/style-keys/). |

The rest of a cell's props depend on its kind: an input has a `type` and a `value`, a button has a `do`.

Here is a small document. Change a number and the total follows. The three cells in the row are three cells; so are the text above them and the row itself.

```live id=tree title="A column holding a text cell and a row" height=190
["col", {"style": {"gap": 8}},
  ["text", {"style": {"size": 20, "weight": 700}}, "Quote for Ada Lovelace"],
  ["row", {"style": {"gap": 8}},
    ["input", {"name": "qty", "type": "number", "label": "Quantity", "value": 2}],
    ["input", {"name": "price", "type": "number", "label": "Unit price", "value": 40}],
    ["formula", {"name": "total", "format": "currency"}, ["*", "$qty", "$price"]]]]
```

```sx in=tree
(* qty price)
total
⇒ 80
```

## The cell tree

A document is one **root cell**. When you split a cell, it becomes a [row](kind:row) (cells side by side) or a [col](kind:col) (cells stacked) that holds the cell you split and a new, empty one. Split again and the tree grows. So a document is a tree of cells, and there are only four sorts of cell in it:

- **Groups**, the [row](kind:row) and the [col](kind:col). They hold other cells and lay them out. They show nothing of their own.
- **Containers**, [tabs](kind:tabs), an [accordion](kind:accordion) and a [collapsible](kind:collapsible). They hold other cells and show some of them at a time. [Tabs](kind:tabs) and an [accordion](kind:accordion) hold [panels](kind:panel), one panel for each tab or section; a [collapsible](kind:collapsible) holds its cells directly, under a heading that folds.
- **Panels**, [panel](kind:panel) cells. A panel is one tab or one section: a title and the cells under it. It only ever sits directly inside tabs or an accordion.
- **Leaves**, everything else. A leaf holds no cells; it is the text, the field, the chart.

::diagram cell-tree

The document above, as the outline an [agent](term:agent) reads, is this tree:

```text
c1 col
├─ c2 text "Quote for Ada Lovelace"
└─ c3 row
   ├─ c4 input:number qty = 2
   ├─ c5 input:number price = 40
   └─ c6 formula total = (* qty price) → 80
```

Each line is a cell: its id, its kind, its name, what it holds. In notation the same tree is a nested list; `["col", cell, cell]` has the cells as its body. The tree changes only through [ops](term:op). Splitting a cell that sits in a row, in the direction of the row, adds a cell beside it; splitting it the other way wraps it in a new group:

```ops in=tree
[["split", "c4", "row"], ["split", "c2", "row"]]
```

The first op adds an empty cell next to the quantity, because `c4` is already in a row. The second turns the text `c2` into a row of itself and a new empty cell, because `c2` sits in a column.

The tree keeps itself tidy. A row or column that nobody named or styled is only structure, so edgy removes it when it holds a single cell, and folds it into its parent when the parent runs the same way. A row inside a row becomes more cells in the outer row. Containers, panels, and any group with a name, a style, a `hidden` rule or handlers stay as you made them. The internals page on [normalizing the tree](/internals/normalize/) has the rules.

> [!NOTE]
> The document you edit and the document people use are the same tree, seen in different views: **Edit** to shape it, **Live** to use it, **Page** to see it as printed pages. See [Edit, Live and Page](/start/views/).

## Names

A name lets a cell be read. A formula that says `(* qty price)` reads the cells named `qty` and `price`; a [text template](term:text-template) says `{{total}}`; a button says `(set! count 0)`. A cell with no name can still be read by its id, such as `c4`, but ids are for edgy: they don't tell a person anything, so name the cells that others use.

A name starts with a letter (or `_`) and holds letters, digits, `-` and `_`. No other cell can have the same name, and a name can't be `true`, `false`, `nil`, `null`, `it`, `i` or `acc`. Type it in **Name**, at the top of **Cell details**. When you rename a cell in edgy, the formulas, buttons, handlers and templates that read it follow the new name.

A named group reads as the list of its cells' values. That is how a column of order lines is added up. See [Names and references](/language/names/).

## Sizes in a row or column

The cells of a row share its width; the cells of a column share its height. Each cell says how much it wants with its `size`:

- **Fill**, a weight. The default is 1. A cell with weight 2 gets twice the room of a cell with weight 1, out of what the others leave.
- **Hug**, as small as its content.
- **Fixed**, an exact number of pixels.

Select a cell, open **Spacing and size** in **Cell details** and choose under **Width** (in a row) or **Height** (in a column). Dragging the edge between two cells moves room from one to the other; double-clicking the edge makes two cells that fill even. The [row](kind:row) and [col](kind:col) pages have the details.

## Kinds, and how to choose one

A cell's kind is what it holds. You choose it, and change it later, from the `/` menu:

1. In **Edit**, select a cell.
2. Press `/` ([the key](key:kind-menu)), or click the kind's name in the toolbar that floats above the selected cell.
3. Type to narrow the list; the search looks at each entry's name and at the hint under it. Move with the arrow keys and press Enter, or click.

::shot slash-menu "The / menu open over an empty cell: the kinds to choose from, with a search field."

An empty cell lists most of the choices in groups in **Cell details**, under **What should this cell hold?** ([timer](kind:timer) and [fetch](kind:fetch) are only in the `/` menu). Typing into an empty cell starts a text cell; starting with `=` makes it a formula.

The menu is a little finer than the kinds. An [input](kind:input) appears as nine entries, one for each type of field: **Number**, **Text field**, **Slider**, **Checkbox**, **Toggle**, **Choice**, **Date**, **Long text** and **Rating**. A [chart](kind:chart) is five (**Bar chart**, **Line chart**, **Area chart**, **Donut** and **Meter**), a [list](kind:list) three (**Checklist**, **Bulleted list** and **Numbered list**), and a [canvas](kind:canvas) is **Drawing** or **Signature**. Rows, columns and panels aren't in the menu: you make a row or a column by splitting a cell, and a panel with tabs or an accordion.

Choosing a kind replaces what the cell held. Its name and size stay, and so does its style for most kinds; [undo](key:undo) brings it all back. A text cell's words carry over to a button's label or a data cell's value. The exceptions are **Tabs**, **Accordion** and **Collapsible**, which take the old cell, with its name and style, inside their first panel or under their heading.

To choose, start from what you want to do:

| You want | Use |
| --- | --- |
| Words, headings, a list of points | [text](kind:text) |
| A picture, or a small symbol | [image](kind:image), [icon](kind:icon) |
| People to type, pick or tick a value | [input](kind:input) |
| A value worked out from other cells | [formula](kind:formula), or [stat](kind:stat) for a headline number |
| A value that only formulas and buttons use | [data](kind:data) |
| Something to happen when pressed | [button](kind:button) |
| Rows of records, or items people add and tick | [table](kind:table), [list](kind:list) |
| Numbers drawn as a picture | [chart](kind:chart) |
| Cells side by side, or stacked | [row](kind:row), [col](kind:col) |
| Cells in one place, one shown at a time | [tabs](kind:tabs), [accordion](kind:accordion) |
| A section that folds away | [collapsible](kind:collapsible) |
| A new page when printed | [break](kind:break) |

## The groups of kinds

The pages are in the order the sidebar shows them.

**Layout** puts cells where you want them: [row](kind:row) and [col](kind:col) lay out the cells they hold, and [empty](kind:empty) is a cell with nothing in it yet, which is also what you use for space.

**Holding other cells**: [tabs](kind:tabs) and [accordion](kind:accordion) hold [panel](kind:panel) cells, one for each tab or section, and [collapsible](kind:collapsible) folds the cells under one heading. What is open is the container's value, so formulas and buttons can read and change it.

**Words and pictures**: [text](kind:text) holds Markdown with live values in it, [image](kind:image) a picture, [icon](kind:icon) a small symbol, and [break](kind:break) starts a new page when the document is printed.

**Values**: [input](kind:input) is what people fill in, [formula](kind:formula) works a value out from other cells, [data](kind:data) keeps a value for formulas and buttons that readers never see, and [stat](kind:stat) shows a headline number and how it moved.

**Doing things**: [button](kind:button) runs an action when pressed.

**Many things**: [list](kind:list) holds items people add, edit and tick, [table](kind:table) holds records people search, sort and pick, and [calendar](kind:calendar) shows a month of events.

**Drawing**: [chart](kind:chart) draws numbers, [diagram](kind:diagram) holds shapes and arrows that stay joined, and [canvas](kind:canvas) is a surface to draw or sign on.

**Live sources**: [timer](kind:timer) ticks while the document is open, and [fetch](kind:fetch) brings in JSON from a web address.

## Every kind

::ref kinds

Each kind's page follows the same plan: the facts about the kind, when to use it, an example you can use, how to add and design one, how it is written in notation, what its value is, which events it raises, which actions change it, how it looks on a phone and on paper, and the mistakes people make with it.
