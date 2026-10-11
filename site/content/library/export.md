---
title: Exporting
---

Exporting turns a document or a deck into one HTML file that opens from your disk in any browser, with no server and no network; this page covers what the file carries, what still works in it, and what doesn't.

The file is a copy. It works like the [Live](term:view) view of the document, with the records, answers and pictures the document had at the moment you exported it. Send it by email, put it on a USB stick or open it on a plane.

## Making the file

You can export what you own. Three places do it:

- In the editor, the **Export as HTML** button in the header (a download arrow, next to Print), or **Export as HTML** in the **More** menu on a phone.
- In the [library](/library/), **Export as HTML** in a card's menu, for a document or a deck.
- On a [deck's page](/library/decks/), the **Export as HTML** button.

The browser downloads a file named after the title, made safe: *Café menu* becomes `cafe-menu.html`. A deck exports its documents in order as slides; archived documents are left out.

Someone you shared a document with can't export it: only its owner can.

## What the file carries

| In the file | Notes |
| --- | --- |
| The document, or the deck's documents | Every cell, its settings and its handlers, as they stand now. |
| The records it reads | For each [collection](term:collection) the document reads or writes, the records in it right now. Collections it doesn't touch are not in the file, nor are other documents. |
| Fetch answers | The last answer each [fetch](kind:fetch) cell had, as it was. The cell's address and headers are removed, because an address can hold a key. |
| Fonts | The font files the text needs, inside the file: only the families the document uses, only the character sets its text falls in, italics only if something is italic. |
| Pictures | Each [image](kind:image) is turned into data inside the file: uploads from this server, and pictures from the web (fetched by the server, with the same checks as a fetch cell). A picture that can't be read leaves its cell empty. |
| The app | The part of edgy that shows a document in Live, built into the file. |

A *Content-Security-Policy* inside the file keeps every request inside the file: it can't load a script, a font or a picture from anywhere else, and it can't send anything out. Opening it never contacts a server.

## What works offline

Open the file and you get the document in Live, under a bar that says **Offline copy**, the day it was exported, and *changes stay in this page*. You can type in [inputs](kind:input), press [buttons](kind:button), and watch [formulas](kind:formula), [tables](kind:table), [charts](kind:chart) and everything else follow, as in the editor. [Handlers](term:handler) run, and a button that saves a record puts it in the page's own copy of the collection, where a table reading that collection shows it. There is a light and a dark theme button.

A deck opens on a page with its title, description, the maps of its slides and **Play**. Play works as in the app: arrows, **F** for full screen, **Esc** to leave, which brings you back to the list. See [Decks and Play](/library/decks/). Slides share the records the way they do in the app.

## What doesn't

The file has no server behind it, so what needs one is not there:

- **Nothing is saved.** What you type, the records a button saves and every change stay in that page until you close or reload it, and then they are gone. The file on disk never changes. Export again for a fresh copy.
- **Timers don't tick.** A [timer](kind:timer) is run by the server; in the file it stays where it was. See [Timers](/events/timers/).
- **Fetch cells don't fetch.** They show the answer they had when you exported; **Retry** and a handler's [refresh!](fn:refresh!) give back the same answer. See [Fetch](/events/fetch/).
- **No editing.** There is no Edit view, no Cell details, no [Activity](/editor/activity/), no Ask AI, no sharing. The file shows a document, it doesn't change one.
- **Other documents are not there.** The file holds only this document, or only the documents of this deck.

> [!NOTE]
> Everything in the file is readable by whoever has it: the document's cells and the records it reads are in the file as plain data. Export only what you would hand to that person.

## For developers

In a production build the offline app is built next to the main one (`npm run build`). In development the server builds it once, on the first export of a run, so that first export takes a while. Without a build the export answers 503, "the offline build is missing; run npm run build".

The answer carries an `x-edgy-missing-pictures` header with the number of pictures that could not be read.

| Route | For |
| --- | --- |
| [GET /api/docs/:id/export](route:GET /api/docs/:id/export) | One document, as an attachment. Owner only. |
| [GET /api/decks/:id/export](route:GET /api/decks/:id/export) | A deck, as slides |

The [edgy_export](tool:edgy_export) tool saves the file where you say, or gives the address to download it. The [print and export tutorial](/tutorials/print-export/) shows a whole round trip.

## Under the hood

[export.ts](src:src/server/export.ts) writes the file: the Content-Security-Policy, the font subsetting, the pictures, and the removal of fetch addresses. [offline.ts](src:src/core/offline.ts) defines the payload the file carries. Inside the file, [main.tsx](src:src/web/offline/main.tsx) starts the app, and [standin.ts](src:src/web/offline/standin.ts) plays the server: the app asks it the questions it would ask the real one, and it answers from memory. The longer story is on the [export internals](/internals/export/) page.
