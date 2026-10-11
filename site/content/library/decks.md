---
title: Decks and Play
nav: Decks
---

A deck groups documents in an order so you can play them one after another as slides; this page covers making a deck, arranging it, playing it and exporting it.

::shot deck "A deck's page: its documents in order as small maps, with Play, Export as HTML, Pin and Ungroup above them."

A deck is not a bigger document. Each slide is a whole [document](term:document) that stays what it was: you can open it, edit it and put it in another deck's place later. Grouping only keeps them together in an order. A document is in at most one deck.

## Making a deck

1. In the [library](/library/), tick the checkbox on two or more documents.
2. In the bar at the bottom, choose **Group into a deck**. The button stays off with a tip while fewer than two documents are ticked, or when a deck is among them (**Decks can not go inside a deck**).
3. In the dialog, give it a **Title** (it starts as the first document's title and a count, such as “Quote and 2 more”) and, if you like, a **Description**. Choose **Group**.

The documents go into the deck in the order they are on screen, and the deck's card glows for a moment where it landed. The documents leave the main list and sit inside the deck's card; a pinned document stays in the **Pinned** section. Documents already in another deck move to the new one.

Only your own documents can go in a deck.

## The deck's card

In the library a deck is one card with the maps of its first three documents stacked, **Deck · 3 documents**, and a **Play** button. Its menu has **Open**, **Play**, **Edit description**, **Pin**, **Export as HTML**, **Archive** and **Ungroup**. Decks can be pinned and archived like documents, and found by search. A deck has no **Share…**: share its documents one by one with [share links](/library/share-links/) or [people](/people/sharing/).

## The deck page

Open the card to see the deck at `/deck/…`. Along the top:

- **Deck title** and **Description**: type to change them; they save when you leave the field or press Enter (Shift+Enter makes a new line in the description, Esc undoes).
- **Play**, **Export as HTML**, **Pin** or **Unpin**, and **Ungroup**.
- A count: **3 documents, one per slide**.

Below is the list of slides, numbered, each with the document's map, title and description. To change the order, drag a slide by its grip, or use **Move up** and **Move down**. The **×** button takes a slide out of the deck; the document stays in your library. **Add documents** opens a search: tick the documents to add them at the end. One that is in another deck says **moves from** and that deck's name.

A document you have archived stays in the deck and says **Archived, skipped in Play**. **Ungroup** asks first, then removes the deck; every document stays, back in your list as it was.

## Play

**Play** shows the deck one slide at a time. It starts from the library card, the card's menu or the deck page, asks the browser for full screen (browsers allow that only right after a click), and when you leave it takes you back to where you started.

::clip play "Playing a deck: the first slide, then the next, then leaving."

::shot play "A slide fills the screen. The bar underneath has the slide number, the deck and slide titles, full screen and Leave."

Each slide is its document in [Live](term:view), working on its own: inputs, buttons, [handlers](term:handler) and [timers](kind:timer) do what they do in the editor's Live view. A slide's [open](event:open) event runs the first time you reach it, and its [close](event:close) event runs when you leave Play. Slides do not see each other's cells. They share only [collections](term:collection): a button on one slide can save a record that a table on the next one shows.

Only the slide on screen listens to the server, so its timers and fetches run while it is on screen; the others wait and catch up when you come back to them.

### Keys and gestures

| Key | Does |
| --- | --- |
| [→ or Page Down](key:play-next) | Next slide. Page Down first scrolls a long slide. |
| [← or Page Up](key:play-previous) | Previous slide. Page Up first scrolls a long slide back. |
| [↓, ↑, Space, Shift+Space](key:play-scroll) | Scroll a long slide. Space at the bottom goes to the next slide. |
| [Home, End](key:play-ends) | First and last slide. |
| [F](key:play-full) | Full screen on or off. |
| [Esc](key:play-leave) | Leave. In full screen the browser keeps Esc for itself and leaves full screen, and that leaves Play too. |

Keys with ⌘, Ctrl or Alt are left to the browser. While you type in a field, keys type; Esc leaves the field. A focused button, tab or slider keeps Space, Enter and the arrows for itself.

With a mouse, click beside the slide (not on it): the left half goes back, the right half goes forward. On a touch screen, swipe across the slide. A swipe that starts on something that drags or scrolls sideways (a slider, a drawing, a [diagram](kind:diagram), a wide table) is left to it. The bar at the bottom has **Previous slide**, **Next slide**, **Full screen** and **Leave** buttons and shows **2 / 5**.

The address carries the slide number (`/deck/…/play#2`), so reloading keeps your place.

### How a document becomes a slide

A slide is laid out at the width its document was designed at (880 pixels unless the document's settings say otherwise), or at the screen's width when the screen is narrower, so a phone gets the phone layout. Then it is scaled: up to fill a big screen (at most 1.5 times), down to fit the screen's height as long as it stays readable (not below 0.62 times, or 0.8 on a screen under 600 pixels wide).

### Long slides

A document that would need more shrinking than that keeps a readable size and scrolls inside its slide. A pill, **More below ↓**, shows while there is more to see. Scroll with the wheel, the arrows or Space; Space at the very bottom moves on.

> [!TIP]
> Design slides to fit: one idea, a few cells, no more height than a screen. A long document makes a poor slide and a good page.

Play skips archived documents. A deck with nothing to play says **Nothing to play**, and **Play** is off on the deck page.

## Exporting a deck

**Export as HTML** on the deck page, in the card's menu, or the [edgy_export](tool:edgy_export) tool, makes one file that plays the deck with no server and no network. Archived documents are left out. See [Exporting](/library/export/).

## For agents and scripts

[edgy_deck](tool:edgy_deck) creates, reads, reorders, adds, removes, describes and ungroups decks.

| Route | For |
| --- | --- |
| [POST /api/decks](route:POST /api/decks) | Make a deck from document ids, in order |
| [GET /api/decks/:id](route:GET /api/decks/:id) | A deck with its documents' cards in order |
| [PATCH /api/decks/:id](route:PATCH /api/decks/:id) | Title, description, `docs` (the new order; one left out is taken out), `pinned`, `archived` |
| [DELETE /api/decks/:id](route:DELETE /api/decks/:id) | Ungroup |
| [GET /api/decks/:id/export](route:GET /api/decks/:id/export) | The deck as one HTML file |

Decks belong to their owner: anyone else gets a 404, "no such deck". [The deck tutorial](/tutorials/deck/) walks through making one.

## Under the hood

The deck page is [DeckPage.tsx](src:src/web/decks/DeckPage.tsx); Play is [Play.tsx](src:src/web/play/Play.tsx), and [fit.ts](src:src/web/play/fit.ts) holds the scaling rules above. Decks are kept by [store.ts](src:src/server/store.ts).
