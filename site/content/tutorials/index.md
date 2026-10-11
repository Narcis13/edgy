---
title: Tutorials
---

The ten tutorials teach edgy by building ten small documents, one idea each; this page says what each one teaches, in what order to read them, and what to have ready before you start.

Each tutorial takes 15 to 25 minutes. It starts with what you will build and learn, gives numbered steps you can do in the real app, and ends with the finished document. Six of the finished documents run on the page, so you can use them before you build them. Every one of them can be opened as a template: the entry for it on [Templates](/library/templates/) has an **Open in edgy** button when the docs are served by edgy.

::ref pages tutorials/quote/,tutorials/checklist/,tutorials/wizard/,tutorials/order-tracker/,tutorials/dashboard/,tutorials/flowchart/,tutorials/deck/,tutorials/sharing/,tutorials/print-export/,tutorials/agent/

## The order

The first four build on each other; the rest stand on their own.

1. **Quote.** Formulas: a quote with line items, a subtotal, VAT and a total, a format and a sentence that quotes a value.
2. **Checklist.** Events: a list whose change handler shows a message and saves a record once every box is ticked.
3. **Wizard.** A hidden value holding the current step, cells that hide, and buttons that change the step.
4. **Order tracker.** Records: a form that saves orders, a table that reads them, a button on each row, and the **Data** page.
5. **Dashboard.** Stats and charts worked out from the saved orders. It reads the records the order tracker saves.
6. **Flowchart.** A diagram drawn in Edit, whose shapes show live values.
7. **Deck.** Several documents grouped, ordered and played as slides.
8. **Sharing.** A document given to a colleague as an editor and as a viewer, and share links. It needs two browser windows.
9. **Printing and export.** Page setup, a page break, a PDF and an offline HTML file.
10. **Agent.** An AI agent connected over MCP that builds a document while you watch.

If you have not used edgy yet, read [Install](/start/install/), [The screens](/start/screens/) and [Your first document](/start/first-document/) first.

## Before you start

- **Have edgy running.** Run `npm run dev` in the edgy folder and open `http://localhost:5173`. The steps say **New document** for the button on the home page.
- **Use a wide window.** **Cell details** opens by itself when the window is more than 1000 pixels wide. In a narrower one, press the **Cell details** button in the header.
- **Know the keys.** The steps use a few keys of the sheet: `/` to choose what a cell holds, ⌥ with an arrow to add a cell on that side, Esc to select the cell around the selected one, and ⌘D to duplicate. ⌥ is Alt and ⌘ is Ctrl outside a Mac. They are all on [Keyboard](/start/keyboard/).

> [!NOTE]
> Keys pressed in **Cell details** stay in it. After you press a button or choose from a drop-down there, click the cell on the sheet once before you use a key such as ⌥↓. After you press Enter in one of its text fields you do not need to. A click on a text cell that is already selected opens it for typing; press Esc to close it again, with the cell still selected. Pressing a button on the sheet runs it, even in Edit, so the tutorials select buttons by creating them or with Tab and do not click them.

## Typing into cells and fields

To set a field in **Cell details**, click it, select all (⌘A, or Ctrl+A) so that nothing old is left, type the new value and press Enter. The steps write that as "set **Label** to ...". In a field of the sheet, such as an input, and in the document's title, the same applies.

The steps often say "type": in an empty cell, any character starts its text, and a text that starts with `=` becomes a formula when you finish. Esc finishes typing in a cell. In a code field, brackets and quotes close themselves, and typing the closing one steps over it, so you can type an expression in one go; in the panel's code fields Enter keeps it.

## The finished documents

The finished document of a tutorial is exactly what its steps make. They are written in [notation](/agents/notation/), the same list-of-lists an agent writes, and the home page's list of templates does not include them. Opening one from a tutorial's page makes a document of your own that you can change; the ones that read records (the order tracker and the dashboard) also bring six sample orders, saved only when your `orders` collection is empty.
