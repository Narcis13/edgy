---
title: The / menu
---

The `/` menu is where you choose what a cell holds: press `/` on a selected cell, pick a kind from the list, and the cell becomes that kind.

::shot slash-menu "The / menu open under an empty cell: a search field, and the kinds with a short line about each."

## Opening it

- Select a cell in Edit and press `/` ([kind-menu](key:kind-menu)).
- Or press the button in the toolbar above the cell that names what it holds now; its tooltip says *Change what this cell holds*.
- On a group (a row or a column), `/` opens the menu for the first cell inside it.

An empty cell also shows the same choices in **Cell details**, grouped under headings such as **Words and numbers**, **Things people fill in** and **Charts**, with the question *What should this cell hold?*. Typing a letter into an empty cell starts text instead, and starting with `=` makes the cell a [formula](kind:formula) when you finish.

## Choosing

Each line has an icon, a name and a line about it. Type in **Search…** to narrow the list: it matches the name and the line under it, anywhere in the words, whatever the case. ↑ and ↓ move through the list, Enter chooses the highlighted line, and Esc closes the menu. So does a click anywhere else. The line for what the cell holds now is marked.

Choosing a line is one change, so ⌘Z puts the cell back as it was.

After you choose, a text or formula cell opens at once so you can start typing; any other kind stays selected, with its designer open in [Cell details](/editor/panel/).

## One kind, several lines

Some kinds have more than one line in the menu, because their *type* is the first thing you decide. You can also change the type later by choosing another line of the same kind.

| Kind | Lines in the menu |
| --- | --- |
| [input](kind:input) | **Number**, **Text field**, **Slider**, **Checkbox**, **Toggle**, **Choice**, **Date**, **Long text**, **Rating** |
| [chart](kind:chart) | **Bar chart**, **Line chart**, **Area chart**, **Donut**, **Meter** |
| [list](kind:list) | **Checklist**, **Bulleted list**, **Numbered list** |
| [canvas](kind:canvas) | **Drawing**, and **Signature**, a drawing that starts with the label *Sign here* |

Every other kind has one line. The menu also holds **Empty**, which clears the cell. The kinds themselves, with what each is for, are listed on [Cells](/cells/).

## What changing a cell's kind keeps

Choosing a kind replaces the cell's content but not the cell. These stay:

- Its place in the document, its id and its **size**.
- Its **name**, as long as no other cell took it in the meantime. Formulas that read the cell keep reading it.
- Its **look**: padding, fill, border, font and the rest of its [style](/styling/style-keys/).

Almost everything else belongs to the old kind and is dropped: a button's action, a formula's format, a hide condition, the cell's handlers. What carries over from the old kind depends on the new one:

| You choose | What it starts with |
| --- | --- |
| **Text** | The text of a text cell, or the label of a button. |
| **Formula** | The expression of any cell that had one: a formula, chart, table, stat or calendar. |
| **Button** | The old text or label, or *Button*. |
| An **input** | A starting value for the type: 0 for **Number**, 50 for **Slider** (from 0 to 100), unticked for **Checkbox** and **Toggle**, 3 stars for **Rating**, the choices *First*, *Second*, *Third* for **Choice**. The label stays if the cell was an input already. |
| A **chart** | A few sample numbers, or the data of a chart you are changing the type of. |
| A **table** | Three sample rows (Tea, Cake, Juice). A table you choose **Table** on again keeps its rows, columns and look. |
| A **list** | Sample items. Changing one list type to another keeps the items, reshaped: a checklist gets a done flag on each. |
| **Stat**, **Calendar**, **Diagram** | A sample to show how they work; the same kind again keeps what it has. |
| **Tabs**, **Accordion**, **Collapsible** | The old content, inside the first tab or section (or inside the collapsible), and for tabs and an accordion a second, empty tab or section beside it. |
| **Data (hidden)** | A name (`data`, or `data2` if that is taken, unless the cell has one already) and, from an input or text cell, its value. |
| **Timer**, **Fetch** | A free name (`timer`, `rate`), a tick every 30 seconds, and for **Fetch** the demo address. |
| **Empty** | Nothing. |

> [!WARNING]
> Choosing a kind on a cell that holds something throws away what the new kind can't use, with no question asked. If you chose wrong, press ⌘Z at once.

The code behind this is `Session.setKind` in [session.ts](src:src/web/session.ts), and the lines of the menu are in [KindMenu.tsx](src:src/web/editor/KindMenu.tsx).
