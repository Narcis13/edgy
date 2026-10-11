---
title: The minimap
---

The minimap is the small picture of a document's layout that stands in for the document on library cards, on decks and in the template strip: each cell is a tiny block, so you can tell documents apart by their shape before you open one.

## Where it appears

- On every document's card in the [library](term:library), above its title.
- On a deck's card, as a stack of up to three sheets: the first three documents of the deck, the first on top.
- In the row of templates at the top of the library (**Start from a template** to a screen reader), one for each [template](term:template). The row is there while you are not searching or filtering.
- On a deck's page, beside each document in the deck's order. See [Decks](/library/decks/).
- In the list of slides of a deck that has been exported as an HTML file. See [Exporting](/library/export/).

It isn't in the editor itself. There the document is the whole screen.

## What it shows

The minimap is the document's tree drawn small. Groups lay their blocks out side by side or stacked, and a block's share of the room follows the cell's size, so a document with a narrow left column and a wide right one looks that way. A cell that hugs its content is drawn small.

Each kind has a look of its own, so you can read a minimap without a legend:

| Kind | Drawn as |
| --- | --- |
| [text](kind:text) | A few lines |
| [formula](kind:formula) | A pale accent block with an accent outline |
| [input](kind:input) | An outlined box |
| [button](kind:button) | A solid accent block |
| [chart](kind:chart) | A box filled from the bottom |
| [table](kind:table) | Rows of faint lines |
| [list](kind:list) | Dots with a line beside each |
| [calendar](kind:calendar) | A grid |
| [empty](kind:empty) | An empty outline |

Other kinds have a look too: a stat is a bar on a tinted block, a drawing has a baseline, a diagram has two boxes and a line, and a page break is a dashed line.

Containers keep their shape. [Tabs](kind:tabs) show a tab bar with the open tab's cells under it; an [accordion](kind:accordion) shows its sections, with the open ones open; a [collapsible](kind:collapsible) shows its heading and, when open, what is under it. A tab or section that is closed shows only a block, not what is inside.

Things that take no room aren't drawn: [data](kind:data) cells and [timers](kind:timer). A [fetch](kind:fetch) is a thin tinted strip.

It never shows content: no text, no values, no pictures. A minimap is the same for any values the document holds.

## How it is made

A document's card doesn't carry the document. For the library to list hundreds of documents quickly, each carries a *shape*, a small summary of its tree: the kind of each cell, its size, and which tabs or sections are open. The shape holds at most 32 cells, down to four levels deep; what is left over is drawn as one block of text. The templates in the strip are drawn from their full notation instead.

The minimap is hidden from screen readers, because the card's title and description say what the document is.

The code is in [Minimap.tsx](src:src/web/pages/Minimap.tsx) and the shape in [library.ts](src:src/core/library.ts).
