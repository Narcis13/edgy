---
title: Library
---

The library is edgy's home page: every [document](term:document) and [deck](term:deck) you own or were given, with search, filters, pins and an archive to help you find the one you want.

::shot library "The library. Pinned documents come first, then the rest as cards, each with a small map of its document."

The page's heading says **Documents**; the docs call the whole page the library. It opens at `/`, and the **Documents** link in the top bar brings you back to it from anywhere.

## What a card shows

Every document and every deck is a card (or a row, in the list view). A card shows:

- A small map of the document, so you can tell two quotes apart without opening them. See [The map on a card](#the-map-on-a-card).
- The title, and under it the description, if there is one.
- **Changed** and how long ago (**Created** when you sort by creation).
- Badges: **Pinned**, **Archived**, and for a document other people can open, **Shared with 2** (people), **Shared · can view** or **Shared · can edit** (a [share link](/library/share-links/) is on). A deck says **Deck** and how many documents it holds.

Click a card to open it in this tab. Ctrl+click or middle-click opens it in a new tab. The **⋯** button on a card opens its menu: **Open**, **Add a description**, **Pin**, **Share…**, **Export as HTML**, **Archive**, **Delete**. The menu works from the keyboard: arrows move, Home and End jump, Esc closes it.

## Making a document

**New document** makes an empty one and opens it. Above the cards, while you are looking at everything and not searching, a row of starting points makes a document from a [template](/library/templates/) instead: click one and the new document opens. Your account also starts with a short tour document.

## Search

Type in the search box. The cards change as you type, a moment after the last key.

::shot library-search "A search for “quote”. Each card shows where the words were found, and marks them."

Search reads three things in every document: its title, its description, and the words in its cells (the text people read, labels, list items, column headings). It does not read cell names, styles or the records in your collections. A formula adds only the text it quotes: one that says `"Large order"` makes those words searchable.

| Rule | What it means |
| --- | --- |
| Every word | Each word you type must appear somewhere in the same document, in the title, the description or the text. They need not be together or in the same place. Up to 8 words count. |
| Case and accents | Ignored. `cafe` finds a document called Café. |
| Parts of words | A word matches inside longer words: `plan` finds Planning. |
| Where it matched | The first part to hold the most of your words. A match in the title marks the word in the title. A match in the description shows a piece of the description with the word marked, in place of the description, under **In the description:**. A match in the text shows a snippet under **In the text:**. |
| Order | Matches in a title first, then in a description, then in the text; each group in your chosen sort. |
| Inside decks | Without a search, a deck's documents are inside its card. A search finds them on their own, with an **In** badge naming the deck. Decks are searched by title and description. |

The heading changes to the number of results for your words. Esc in the search box, or the **×** button, clears it ([Esc](key:library-search)). When nothing matches, the page says so and offers **Clear search**.

Search covers the first 20,000 characters of a document's text. Archived documents are found only under the **Archived** filter.

## Filters and sort

The filters sit beside the search box, on **Mine**:

| Filter | Shows |
| --- | --- |
| **All** | Your documents and decks, except archived ones. A document inside a deck is in the deck's card, unless it is pinned. |
| **Pinned** | Only what you pinned, documents and decks. |
| **Shared** | Documents with a share link turned on, or with people added. |
| **Decks** | Only decks. |
| **Archived** | What you archived. |

A filter and a search work together: **Nothing matches “plan” in Pinned.**

**Sort by** orders the cards that aren't pinned: **Last changed** (newest first, the default), **Created** (newest first) or **Title** (A to Z, numbers in order: Week 2 before Week 10). The **Grid** and **List** buttons change how cards are laid out.

edgy remembers your sort, your layout and whether you were on **Mine** or **Shared with me**, in this browser. It does not remember the filter or the search: each visit starts at **All**, with an empty search.

## Pins

Pin what you open most. Choose **Pin** in a card's menu (**Unpin** takes it back). Pinned cards sit in a **Pinned** section above everything else, whatever the sort, and a new pin goes to the end.

To reorder them, drag a pinned card onto another, or choose **Move up** or **Move down** in its menu. Moving works only when every pin is on screen: under **All** or **Pinned**, and not while searching. Pins belong to the account that owns the document: someone you share with sees no pins on your documents.

## Archive and restore

Archiving puts a document or deck away without losing anything.

- **Archive** (in the card's menu) takes it out of **All** and every other filter, and unpins it. It shows only under **Archived**.
- An archived document still opens, by its address or from a deck page. The editor says **This document is archived: it is out of your list, and nothing in it is lost.** and offers **Restore**.
- **Restore** brings it back. A toast with **Undo** follows an archive or a restore for 8 seconds; undoing an archive puts the pins back where they were.
- An archived document can't be pinned: restore it first. An archived document in a deck stays in the deck but is skipped by Play and left out of its export.

**Delete** is different: it asks first (**This can’t be undone. Its history goes too.**), then removes the document, its history, its messages, its links and its place in a deck. Records it saved stay in their [collections](term:collection). For a deck, the menu says **Ungroup** instead: the deck goes and its documents stay.

## Several at once

Each card has a checkbox. Tick one or more and a bar appears at the bottom with how many are selected:

| Button | Does |
| --- | --- |
| **Pin** / **Unpin** | Pins them all, or unpins them when they are all pinned already. Not shown under **Archived**. |
| **Archive** / **Restore** | Archives them; under **Archived**, restores them. |
| **Delete** | Deletes the documents after asking, and ungroups the decks. |
| **Group into a deck** | Makes a [deck](/library/decks/) of the documents, in the order they are on screen. Needs two or more documents and no decks. Not shown under **Archived**. |
| **Clear** | Ends the selection. Esc does the same. |

Only what you own can be changed this way (a card under **Shared with me** has no checkbox). After **Pin** or **Unpin**, a toast tells you how many were done and, if any, how many could not be.

## Descriptions

A description is a sentence about what a document is for. Select **Add a description** on a card (or **Edit description** in its menu), type, and press Enter to save, Shift+Enter for a new line, Esc to cancel. It can be up to 2,000 characters.

A document's description is part of the document: saving one is a change in its history, so it shows in [Activity](/editor/activity/). A deck's description belongs to the deck. Both are searched.

## Mine and Shared with me

Two buttons above the search choose whose documents you see.

**Mine** is everything above. **Shared with me** lists the documents other people gave your account access to, newest first. Each shows the owner's name (**Ana’s**), your role (**Can edit** or **Can view**) and a menu with **Open** and **Leave**. A number on the button says how many are waiting. Open the page at `/?scope=shared` to land there.

Here there are no filters, pins, archive or decks: how a document is arranged is its owner's business, and you can't select or delete someone else's. Search and sort work. **Leave** asks first, then removes the document from your list; its owner can give you access again. See [Sharing with people](/people/sharing/).

## The map on a card

The map is the document drawn as small blocks: groups laid out as they are, each cell as a block as big as the cell's size, tabs with their tab bar and the open tab, folded sections as a bar. [Data](kind:data) and [timer](kind:timer) cells take no room, as on the page. It never shows what a document says, so a card can't leak it.

The server keeps a small outline of each document for this (at most 32 cells, four levels deep; the rest draws as one block of text). A deck's card stacks the maps of its first three documents. See also [the minimap](/editor/minimap/).

## Many documents

The server searches, sorts and filters; the page draws 60 cards at a time and adds more as you reach the end ("Showing 60 of 212…"). When you come back to the tab, the library reloads in case something changed elsewhere.

## For agents and scripts

Everything above is available over HTTP and MCP. The [edgy_organize](tool:edgy_organize) tool describes, pins, unpins, archives and restores documents and puts pins in order; [edgy_deck](tool:edgy_deck) makes and arranges decks.

| Route | For |
| --- | --- |
| [GET /api/library](route:GET /api/library) | The arranged library: `q`, `filter`, `sort` and `scope` (`mine` or `shared`) |
| [POST /api/library/pins](route:POST /api/library/pins) | Put the pinned in a new order |
| [POST /api/library/bulk](route:POST /api/library/bulk) | Pin, unpin, archive, restore or delete several |
| [PATCH /api/docs/:id](route:PATCH /api/docs/:id) | Title, description, and for the owner, pin and archive |

## Under the hood

The searching and arranging are plain functions in [library.ts](src:src/core/library.ts); the server calls them in `app.ts` and keeps pins and archive in [store.ts](src:src/server/store.ts). The page is in `src/web/pages/library/`: [Library.tsx](src:src/web/pages/library/Library.tsx), [Card.tsx](src:src/web/pages/library/Card.tsx) and [Toolbar.tsx](src:src/web/pages/library/Toolbar.tsx).
