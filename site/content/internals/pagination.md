---
title: Pagination
---

Pagination decides where a document is cut into printed pages. This page describes how the Page view lays the document out once, measures the cells, and chooses page ends so that no cell is cut in half when it can be helped; how a page break cell and a cell taller than a page are handled; and how the footer and printing work.

It describes the files in `src/web/print/`: [paginate.ts](src:src/web/print/paginate.ts) (the algorithm, with no DOM), [Pages.tsx](src:src/web/print/Pages.tsx) (measuring, drawing and printing), [PageSetup.tsx](src:src/web/print/PageSetup.tsx) and [print.css](src:src/web/print/print.css). Their tests are in [paginate.test.ts](src:src/web/print/paginate.test.ts). For what a person sees, see [The Page view](/editor/page-view/).

## One long layout, many windows

The trick that keeps the Page view simple is that the document is laid out *once*. It is rendered at the width of a page's printable area, as a single tall column. Each page then shows a window onto that column, from where the last page ended (`start`) to where this one ends (`end`).

::diagram pagination

So every page contains the whole document, clipped. `Pages.tsx` renders the same `CellView` in each page, inside a `page-window` of height `end - start` and moved up by `start`:

```tsx
<div className="page-window" style={{ height: slice.end - slice.start }}>
  <div className="page-flow" style={{ ...docCss(doc.meta), top: -slice.start }}>
    <CellView cell={doc.root} dir={null} />
  </div>
</div>
```

Only the first page's `page-flow` is measured (it carries the `flow` ref). Because every page is the same layout shifted, what you see is what prints, and cells stay live in the Page view.

The cost is that all pages render all cells. That is acceptable for documents of the size edgy is for, and it removes the hard parts of printing: cells never have to be split across components, and a formula or a picture is drawn by exactly the code that draws it everywhere else.

## The page spec

A document's page settings come from its `meta` (see [the model](/internals/model/)), through `pageSpec`:

```ts
export interface PageSpec {
  size: string;
  landscape: boolean;
  /** Page width and height in millimetres, after orientation. */
  w: number;
  h: number;
  margin: number;
  footer: Footer;
}
```

An unknown `page` falls back to **A4**, a margin to 16 mm (at most 60), and a footer to `number`. Sizes come from `PAGE_SIZES`: A4 210 × 297, A5 148 × 210, Letter 215.9 × 279.4 and Legal 215.9 × 355.6 millimetres, swapped when the orientation is `landscape`.

The printable height of a page is `room = (h − 2 × margin) × MM`, where `MM = 96 / 25.4` converts millimetres to CSS pixels. The layout is measured in those pixels. `PageSetup` writes the settings back with `meta` ops, so they are part of the document, saved, synced and undone like any change.

## Measuring

`measure()` in `Pages.tsx` runs after every render and whenever the layout's size changes (a `ResizeObserver`), and once the fonts have loaded, since a font changes text heights. It reads the first page's DOM and turns it into a `Layout`:

```ts
export interface Layout {
  /** Height of the whole document. */
  total: number;
  /** Printable height of one page. */
  room: number;
  /** Leaf cells: never cut through these if it can be helped. */
  leaves: Box[];
  /** Groups: cutting through fewer of them reads better. */
  groups: Box[];
  /** Where page break cells sit. */
  forced: number[];
}
```

| Field | Measured from |
| --- | --- |
| `total` | The height of the layout. |
| `leaves` | Every `.cell.leaf`, as the top and bottom of its box, plus the *keep with next* boxes below. |
| `groups` | Every `.cell.group`. |
| `forced` | The top of every `.cell.kind-break`: a [break](kind:break) cell. |

Boxes are measured with `offsetTop` and `offsetHeight`, added up through the offset parents (`offsetIn`), not with `getBoundingClientRect`, so a transform on the pages (they scale down to fit a narrow screen) doesn't change the numbers.

**Keep with next.** When tabs and accordions are drawn on paper, each panel's title is followed by its cell. A title alone at the foot of a page would be wrong, so `keepWithNext(heads, leaves)` joins each element marked `data-keep` (the title) with the first cell that starts below it into one box that can't be cut. The new box is added to `leaves`.

The slices only change when the cuts really move: `sameSlices` compares the new result with the last, to within half a pixel, and keeps the old one if they match, so measuring after every render doesn't loop.

## Choosing the cuts

`paginate(layout)` is a pure function from a `Layout` to a list of `{ start, end }`. It first makes the list of **edges**, the places a page could end: the top and bottom of every leaf and group, every forced break, and the end of the document. Then it goes page by page:

```ts
const limit = start + room;
const forcedHere = breaks.find((y) => y > start + EPS && y <= limit + EPS);
```

For the page that starts at `start`, in order:

1. **A page break cell** that falls on this page ends it there, always.
2. **The rest fits.** If `limit` reaches the end of the document, this is the last page.
3. **Otherwise** the candidates are the edges between `start` and `limit` that no leaf straddles (`whole(y)`: cutting there cuts no leaf cell).
   - If there are none, the page must cut something, so it ends at `limit`.
   - If there are, prefer those at least 60% of the way down the page (`start + 0.6 × room`), so a page isn't left half empty to avoid a cut. Among those, pick the edge that **cuts through the fewest groups** (`cuts(y)`), and, on a tie, the lowest on the page.
4. **Resume.** The next page starts where the next thing does (`resume`), not in the gap before it: if the cut is between cells it jumps to the next cell's top; if it cut through a cell, the next page starts exactly there, and shows the rest of that cell.
5. If what remains is only whitespace, stop: there is no empty last page.

The tests show each case. With four cells of 400 and a room of 1000, the page ends at 800 (between cells) and not at 1000 (inside the third):

```ts
paginate({ total: 1600, room: 1000, leaves: stack(400, 400, 400, 400), groups: [], forced: [] })
// [{ start: 0, end: 800 }, { start: 800, end: 1600 }]
```

A group is a reason to cut early. Two cards of four lines each, 600 tall, room 760: the second card straddles 760, but 600 sits between the cards, so the first page ends there:

```ts
const groups = [{ top: 0, bottom: 600 }, { top: 600, bottom: 1200 }];
paginate({ total: 1200, room: 760, leaves: stack(150, 150, 150, 150, 150, 150, 150, 150), groups, forced: [] })[0].end
// 600
```

A leaf taller than a page can't avoid being cut, so it is sliced where it must be, and each next page resumes the slice:

```ts
paginate({ total: 2500, room: 1000, leaves: [{ top: 0, bottom: 2500 }], groups: [], forced: [] })
// [{ start: 0, end: 1000 }, { start: 1000, end: 2000 }, { start: 2000, end: 2500 }]
```

## The footer and the page

Each page is a `section.page` of the paper's size with the margin as padding. Under the window is the footer, unless the setting is `none`: the title on the left when it is `title`, and `Page n of N` on the right. It sits in the bottom margin. `N` is the number of slices, so adding a cell can change the number on every page.

Below the screen's width the pages scale to fit (`fit`, never below 0.2 or above 1), with a `transform` on the page and a wrapper (`page-slot`) of the scaled size. Printing ignores the scale.

## Printing

Printing is the browser's: `window.print()`. Two pieces make it print what is on the screen.

- A `<style>` in the Page view sets the paper: `@page { size: 210mm 297mm; margin: 0 }`, from the spec. The margin is the page's own padding, so nothing is lost to the printer's.
- The `@media print` rules in [print.css](src:src/web/print/print.css) hide everything but the pages (the header, panels, the page bar), turn the stack of pages into normal flow, remove shadows and scaling, and set `break-after: page` on each `.page` so each slice is one sheet. Colours are kept (`print-color-adjust: exact`), and controls for changing a cell, such as a list's add button, are hidden: paper shows content.

**Print** (in the page bar, and in the menu) does not call `window.print()` straight away. `session.print()` switches to the Page view and sets `printing`; the Page view waits until the document has been measured, the fonts are ready and two animation frames have passed, so the cuts are final, and only then prints and clears the flag (`session.printed()`). That is why printing from the Edit view shows the Page view for a moment.

A [break](kind:break) cell prints nothing and takes no room on a page: its `min-height` and padding are zero in the pages. It exists only to be a `forced` entry in the layout.
