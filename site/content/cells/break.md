---
title: Page break
---

A page break ends the printed page it sits on: the cells after it start the next page.

::ref kind break

## When to use it

edgy cuts a document into pages by itself, between cells, so a cell is not split across two pages if that can be helped. Use a page break when you want a page to end somewhere else: a cover page before the content, each chapter on its own page, the signature alone on the last page.

A break shows nothing while people use the document. It matters only in the **Page** view and on paper.

## Try it

This document has a break between the report and its appendix. In **Live** you see no break at all; that is how it is meant to look. If this page is served by edgy, **Open in edgy** makes the example a document of your own: choose **Page** in the header, and the page bar counts two pages.

```live id=report title="A report and an appendix" height=170
["col", {"style": {"gap": 8}},
  ["text", {"style": {"size": 28, "weight": 700}}, "Quarterly report"],
  ["text", "Revenue grew in every region this quarter."],
  ["break"],
  ["text", {"style": {"size": 22, "weight": 650}}, "Appendix"],
  ["text", "This starts on the second printed page."]]
```

## Adding and designing one

1. Select a cell in **Edit** and press `/`, then choose **Page break** ([the key](key:kind-menu)). The cell becomes the break.
2. In **Edit** a break is a dashed line with *Page break* on it, so you can find and select it. Select it and press Backspace to clear it.

Put a break between the cells of the top column: split a cell, and make the new cell the break. A break shows nothing and has no height of its own while the document is in use.

::shot designer-break "The designer of a page break: it has nothing to set."

A page break has nothing to design: **Cell details** only says *Printing starts a new page here. Nothing shows while the document is in use. Put it between the cells of the top column.* It has no text or box settings. It does have **Show only when**, so a break can apply only while a condition holds.

The page itself is set in **Page setup**: its size, orientation, margins and footer. See [The Page view](/editor/page-view/).

::shot editor-page "The Page view: the document cut into printed pages, with a footer and the page setup."

## In notation

A break has no body and no props to set:

```notation id=cut
["col",
  ["text", "Cover"],
  ["break"],
  ["text", "Contents"]]
```

| Prop | What it is |
| --- | --- |
| `hidden` | `true`, or an expression: while it holds, the break is ignored. |

## Its value

None: a break is worth nothing (`nil`).

## Events

::ref events-of break

A break raises none.

## Actions that change it

None. A break can be skipped with a `hidden` condition. This one starts a new page only when the report has an appendix:

```sx
(not has-appendix)
```

## On a phone and on paper

A break has no look on a phone: it isn't there.

On paper a break always ends the page it is on. The cells before it stay on that page, and the rest of the page is left blank. A break at the very end of the document does not add an empty page. Between breaks, pages still end where they must: between cells, with as few groups cut as possible.

## Usual mistakes

- **Nothing happens.** A break does nothing while you edit or use a document. Choose **Page** in the header, or print with ⌘P ([the key](key:print)), to see where it falls.
- **A page ended in the wrong place.** The break is inside a row or a nested column, and a page ends at its position whatever is beside it, which can cut through the cells next to it. Keep breaks between the cells of the top column.
- **A page is half empty.** That is what a break is for. Take the break out, and edgy fills each page and cuts between cells.
