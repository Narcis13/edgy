---
title: The Page view
---

The Page view shows the document as the printed pages it will make, with the paper size, margins and footer you chose, and it is where you set those up and print.

::shot editor-page "The Page view: the document cut into sheets with margins and a footer, and the page setup above them."

## Opening it and printing

Press **Page** in the header, or open a document at an address that ends in `?view=page`. The pages are laid out on the desk, one under the other, in the light theme whatever theme the editor is in, because paper is white. A bar above them holds the page setup, the number of pages and **Print**.

The pages are still live: you can type in an input, formulas follow, and a button runs its action. [Handlers](term:handler) do not run on paper.

⌘P ([print](key:print)), **Print** in the header and **Print** in the **More** menu all do the same thing, in any view, even while you are typing: they switch to the Page view, wait until the pages are laid out and the fonts have loaded, and open the browser's print dialog. Choose your printer there, or **Save as PDF**. edgy asks the browser for a sheet of the paper size you chose, with no margin of its own: the margins you see on the page are the document's.

## Page setup

Four settings, in the bar above the pages and in **Cell details** under **Printing** when nothing is selected:

| Setting | Choices | Default |
| --- | --- | --- |
| **Paper** | **A4** (210 × 297 mm), **A5** (148 × 210 mm), **Letter** (215.9 × 279.4 mm), **Legal** (215.9 × 355.6 mm) | A4 |
| **Turn** | **Portrait**, **Landscape** | Portrait |
| **Margins** | **Narrow** (10 mm), **Normal** (16 mm), **Wide** (25 mm) | Normal |
| **Footer** | **Page numbers**, **Title and numbers**, **Nothing** | Page numbers |

The footer is a line of small print at the foot of every page. **Page numbers** puts *Page 2 of 5* on the right. **Title and numbers** adds the document's title on the left.

The settings belong to the document, not to you: they are saved in it and everyone who prints it gets the same pages. Each is one step for [undo](/editor/undo/). An agent or a template can set them in notation, with margins anywhere from 0 to 60 mm:

```notation id=letter
{"root": ["col",
   ["text", "Quarterly report"],
   ["break"],
   ["text", "Page two starts here."]],
 "meta": {"title": "Quarterly report", "page": "Letter", "orientation": "landscape", "margin": 25, "footer": "title"}}
```

A margin that isn't one of the three choices shows none of them selected.

::shot page-setup "Page setup: paper, turn, margins and footer."

## How the document is cut into pages

The document is laid out once, at the width of a page inside its margins, and then cut into pages. A page is a window onto that one long layout.

::diagram pagination

The cuts are chosen so that a page never ends in the middle of a cell if that can be helped:

1. A **page break** cell always ends a page. Put it between the cells of the top column. Nothing shows of it in Live; in the editor it is a dashed line labelled **Page break**. See [break](kind:break).
2. Otherwise a page ends at an edge between two cells. Edges in the lower part of the page (past three fifths of it) are preferred to earlier ones. Among those, the edge that cuts through the fewest groups wins, and if several tie, the latest one.
3. A cell taller than a whole page, such as a long table, has to be sliced; it is cut where the page ends.
4. A tab's or section's title is kept with the first cell under it, so a page never ends right after a heading.
5. A last page that would hold only empty space is left out.

On paper, [tabs](kind:tabs) and [accordions](kind:accordion) print every panel, in order, under its title, whatever is open on screen. A cell hidden by its condition does not print, and neither do [data](kind:data) cells, [timers](kind:timer) and [fetches](kind:fetch). A [button](kind:button) prints as its label in a box, and the small controls for changing things (adding list items, searching a table, moving a calendar's month, a drawing's tools) are left off the page. Colours print as they are.

Cells that grow when they have more to show, such as a list or a table, move the cuts as they grow, and the page count with them.

## On a small screen

The pages shrink to fit a narrow window. Printing ignores that: it prints at full size.

The code is in [Pages.tsx](src:src/web/print/Pages.tsx), [paginate.ts](src:src/web/print/paginate.ts) and [PageSetup.tsx](src:src/web/print/PageSetup.tsx). How the cuts are chosen is on [Pagination](/internals/pagination/).
