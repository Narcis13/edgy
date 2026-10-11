---
title: The right-hand panel
nav: Cell details
---

The right-hand panel, **Cell details**, is where you name the selected cell, design what it holds, style it and tell it what to do when something happens; with no cell selected it holds the document's own settings.

::shot panel "Cell details for a formula cell: its name, what it is, then Content, Text, Spacing and size, Box and Events."

Open and close it with the panel button in the header (**Cell details** in the **More** menu on a phone). It opens by itself in a window wider than 1000 pixels. A person who may only read a document doesn't get it.

## From the top

1. A trail of **crumbs** shows where the cell sits: the groups around it, then the cell. Click a crumb to select that group.
2. The heading names the kind (**Row of 3**, **Tabs, 2 tabs**, **Formula**) and shows the cell's id.
3. A sentence says what the kind is for, followed by a link, for example **Formula in the docs**, that opens that kind's page in a new tab.
4. **Name** is the name other cells use to read this one. A name starts with a letter and holds letters, digits, `-` and `_`. Renaming a cell updates every formula, action and template that reads it. See [Names and references](/language/names/).

Below that come folding sections. Each remembers whether you left it open, on this browser, for every cell.

## Content

The first section is **Content**, and it changes with the kind of the cell: this is the cell's designer. It has the controls for what the cell holds, so you rarely need the cell's notation. The designer for each kind has its own page.

| Kind | What you set in its designer |
| --- | --- |
| [empty](kind:empty) | Nothing yet: a list of kinds to choose from, in groups, under *What should this cell hold?* |
| [text](kind:text) | **Text**, with Markdown and `{{name}}` templates |
| [formula](kind:formula) | **Formula**, and **Show the result as** (the [format](/language/formats/)) |
| [input](kind:input) | **Kind of field**, **Label**, **Placeholder**, **Value**, and, by kind, **Range**, **Stars** or **Choices** |
| [button](kind:button) | **Label**, **What it does**, **Look**, **Icon**, **Ask first** |
| [image](kind:image) | **Picture** (upload or link), **Fit**, **Description** |
| [icon](kind:icon) | Which symbol; its colour and size are under **Text** |
| [chart](kind:chart) | **Numbers**, **Kind of chart**, **Title**, **Colour**, **Show numbers as**, **Maximum** |
| [stat](kind:stat) | **Number**, **Label**, **Show the number as**, **Compare with**, **Trend**, **Icon** |
| [list](kind:list) | **Kind of list**, **Title**, **Marker**, **Spacing**, or **Computed from** an expression |
| [table](kind:table) | Where the rows come from, the columns, row buttons and the look |
| [calendar](kind:calendar) | **Events**, **Title**, **Picked day**, **Weeks start on** |
| [canvas](kind:canvas) | **Words under the line**, **Paper**, **Pen colour** |
| [diagram](kind:diagram) | A count of what is drawn; you draw in the cell |
| [data](kind:data) | **Kind of value** and the value |
| [timer](kind:timer) | **Ticks**: every so often, or once after the document opens |
| [fetch](kind:fetch) | **Address** and **Fetch again every** |
| [tabs](kind:tabs), [accordion](kind:accordion), [collapsible](kind:collapsible), [panel](kind:panel) | The panels (their titles, order and which are open), or the heading |
| [row](kind:row), [col](kind:col) | **Cells run** (side by side or stacked), how many **Cells**, **Gap between cells**, **On a phone** |
| [break](kind:break) | Nothing to set |

A field that holds code, such as **Formula** or **What it does**, is a [code field](/editor/code-studio/): colours, suggestions and a live result. Next to it, a button opens the [code studio](/editor/code-studio/).

## Text

The **Text** section sets how the words in a cell look. It is open by default on a text cell and is left out for pictures, drawings, diagrams, page breaks, data cells, timers and fetches.

- **Text style** gives ready-made looks to start from: **Title**, **Heading**, **Subheading**, **Body**, **Small**, **Caption**, **Label**, **Quote** and **Big number**. Each is a handful of the settings below, so you can fine-tune after.
- **Font**, **Size**, **Weight**, **Emphasis and case** (italic, underline, strike through, capitals), **Colour**, **Alignment** (across and up and down), **Line height**, **Letter spacing** and **Space between paragraphs**.

Each setting that you have changed shows a **Default** button that puts it back. These are [style keys](/styling/style-keys/) of the cell, and colours are [colour tokens](/styling/theme/) that follow the light and dark themes.

## Spacing and size

- **Width** (in a row) or **Height** (in a column): **Fill**, **Hug** or **Fixed**, as described in [Working with cells](/editor/cells/#sizes). It appears when the cell sits in a row or a column.
- **Padding**: the room between the cell's edge and what is inside it. Choose **None**, **S**, **M** or **L**, type a number, or press the link button to set each side on its own.

## Box

**Fill** (a colour behind the cell), **Border** (none, all round, or some sides, with a **Border colour** and **Border width**), **Corners** and **Shadow** (**None**, **Soft**, **Medium** or **Deep**). A cell that takes no room (a page break, a data cell, a timer) has neither spacing nor a box.

## Show only when

Every cell except a data cell or a timer has this section. **Always** shows the cell, **Never** hides it while people use the document or print it (you still see it while you edit), and **Depends…** hides it while an expression is true:

```sx
(= total 0)
```

Read that as: *hide this cell while `total` is 0*. The expression is a normal one, so it can read any named cell.

## Events

A cell that raises [events](/events/) has an **Events** section: a line for each handler it has, and **Add a handler**. A handler line shows when it runs ("When it is clicked") and its code on one line. Press the line, or **Add a handler**, and the [code studio](/editor/code-studio/) opens on its Events part, where a handler is picked from ready-made starts or written. See [Events and actions](/events/) and [the list of events](/events/reference/).

::shot events-section "The Events section of a checkbox: its change handler, and the button that adds another."

A cell that raises no events and has no handlers has no **Events** section.

## What is at the bottom

- **Links** lists the cells this one **Reads** and the cells it **Feeds** (those that read it), as buttons that select them. See [Links between cells](/editor/links/).
- **Value** shows what the cell holds or works out right now, or the error it has.
- **Notation** unfolds the cell as an agent sees it, as [notation](term:notation). Edit it and press **Replace cell** to replace the whole cell, or **Copy** to copy it.

## Several cells at once

Select more than one cell and the heading reads *3 cells*. **Content** becomes a list of the cells you picked (press one to look at it alone). **Text**, **Spacing and size** and **Box** are there: text, padding and box changes go to every selected cell. There is no **Name**, **Show only when** or **Events**.

## The document

With nothing selected the heading reads **Document**, and the sections are the document's.

::shot page-setup "Printing in the document panel: paper size, orientation, margins and footer."

- **Page**:
  - **Title** and **Description**. The description shows on the document's card in the [library](term:library) and is found by search.
  - **Width** in pixels (the document is up to 880 wide unless you say otherwise) and **Least height** (560).
  - **Margin** in pixels: the padding inside the document on screen (28). Not the margin of a printed page; that is under **Printing**.
  - **Currency**, a three-letter code such as `EUR`: the money the [currency](format:currency) format writes. `USD` unless you set one.
- **Typography**: **Text font**, **Heading font** (for `#` headings and title styles) and **Base text size**, the size text has in cells that don't set their own.
- **Events and actions**: the document's own [handlers](term:handler), such as what happens when it opens or closes, and its [custom actions](term:custom-action): functions every handler and button can call by name. **Add a handler** and **New action** open the code studio. See [Custom events and actions](/events/custom/).
- **Printing**: paper, orientation, margins and footer, with **See the pages**. See [The Page view](/editor/page-view/).
