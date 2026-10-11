---
title: Printing and exporting
nav: Printing and export
---

You set up a two-page report for paper, put a page break where the second page should start, print it to a PDF, and export the document as one HTML file that works offline. It takes about twenty minutes. Read [Edit, Live and Page](/start/views/) first, because printing is the third view.

You will use the page setup, the **Page break** cell, **Page** view, **Print** and **Export as HTML**.

A [page](term:page) in edgy is a sheet of paper. The document is laid out once at the paper's width and cut into pages between cells, never through one.

## The report

1. On the home page, press **New document**. Click the title at the top, select all (⌘A, or Ctrl+A), type `Corner Cafe: quarterly report` and press Enter.
2. Click the empty cell and type `# Corner Cafe: quarterly report`. Press Esc.
3. Press [⌥↓](key:split) (Alt+↓ elsewhere). Type `What sold this quarter, and what we plan next.` and press Esc.
4. Press ⌥↓, then `/`, type `Table` and press Enter. The cell shows three sample rows. Under **Look** in **Cell details**, set **Title** to `Sold this quarter` and press Enter.
5. Press ⌥↓, then `/`, type `Page break` and press Enter. In Edit the cell shows as a dashed line labelled *Page break*; in Live it is invisible.
6. Press ⌥↓. Type `## Next quarter` and press Esc.
7. Press ⌥↓, then `/`, type `Bulleted list` and press Enter. Click the text of the first item, select it all (⌘A, or Ctrl+A) and type `Add a lunch menu`. Press Tab. Click the second item and type `Open on Sundays`. Press Tab.

## Set up the paper

8. Press Esc until no cell is selected. **Cell details** shows the **Document** panel. In its **Printing** section, the choices are **Paper**, **Turn**, **Margins** and **Footer**.
9. Set **Margins** to **Wide** and **Footer** to **Title and numbers**. Leave **Paper** on A4 and **Turn** on *Portrait*; try Letter or *Landscape* afterwards to see the pages change.

::shot page-setup "Page setup in Cell details: paper size, orientation, margins and footer."

10. Press **See the pages**. The document opens in **Page** view.

## Read the pages

The pages show as they will print. The bar over them holds the same four choices and says *2 pages*. Page 1 holds the heading, the sentence and the table. The page break ended it, so page 2 starts at *Next quarter*. At the foot of each page, the title sits at the left and *Page 1 of 2* at the right.

::shot editor-page "The Page view: printed pages with margins and a footer, and the page setup above them."

Without the page break, the second part would follow the table on page 1 and move to a new page only when there was no room left.

## Print to PDF

11. Press **Print** in the bar over the pages. The browser's print dialog opens, showing those pages. Choose a printer or a PDF destination such as **Save as PDF**, and confirm.

You can print from any view with ⌘P (Ctrl+P): edgy switches to **Page** view, waits for the pages to be laid out and then prints. Nothing runs on paper.

## Export a file

12. Switch to **Edit**. In the header, press the download button, **Export as HTML** (its tip reads *Export as one HTML file that works offline*). The browser saves `corner-cafe-quarterly-report.html`.
13. Open that file from your downloads folder, with a double-click. The report opens in the browser with no edgy running. A bar says **Offline copy** and when it was exported. Inputs and buttons work; what you change stays in that page until you close it.
14. Turn off your network and reload the file. It still opens: the fonts, pictures and the records it reads are inside it.

Only the owner can export. A deck exports too: see [Documents played as slides](/tutorials/deck/).

## The finished document

::shot tutorial-print-export "The finished report in Live: the heading, the table, and below the page break the next quarter."

This is the document, ready to print. You can open it as a template: the [Corner Cafe: quarterly report](template:tutorial-print-export) entry on [Templates](/library/templates/) has an **Open in edgy** button, and it comes with the wide margins and the footer already set.

## What you learned

- The document's page setup (paper, orientation, margins and footer) is kept with the document, and the same four choices show in **Cell details** and over the pages. See [The Page view](/editor/page-view/).
- A **Page break** cell starts a new page; it is a dashed line in Edit and nothing in Live. See [break](kind:break).
- ⌘P prints exactly the pages **Page** view shows. See [Printing](key:print).
- **Export as HTML** makes one file that works with no server and no network. See [Exporting](/library/export/) and [how it is made](/internals/export/).

Next, let an agent build a document for you: [Agent](/tutorials/agent/).
