# Progress

Goal: the home page becomes a library that stays usable with hundreds of documents: search (titles,
descriptions, the text inside), sort, filters, grid and list; descriptions; pinned documents in an order
people set; archive and delete, one or many; share links (view or edit, turned off again); decks that play
as slides; a document or deck exported as one self-contained `.html`; all of it over HTTP and MCP.

Started 2026-10-02 on branch `main` at `40b398d`. Brief: given inline to `/goal-loop` (library brief).

**Next:** M6 export (offline bundle, composer, stand-in server); a subagent builds the home library UI (M3) in parallel.

## Contract (Done means)

| # | criterion | verified by | evidence | status |
|---|---|---|---|---|
| G1 | Typecheck, all tests and the production build (app and offline bundle) pass, no chunk warning | `gates.sh` | Log | open |
| G2 | Zero console/network problems on every screen at 1440×900 and 390×844 (home, deck, play, shared, not-found, export), plus 820×1180 and dark for the new UI | `sweep.sh` + `cdp.mjs` | Log | open |
| G3 | A showcase library (seed script) using every feature together: described, pinned, archived, shared documents and a deck, verified on desktop and phone | `docs/showcase/library/shoot.sh` | `docs/showcase/library/` | open |
| L1 | 300 seeded documents: home loads, scrolls and answers typing in search without visible lag at 1440×900 and 390×844 (measured: time to first cards, keystroke → results, frame gaps while scrolling); `GET /api/docs` no longer carries whole documents (bytes before/after in the Log) | seed + `drive.mjs` timings | `perf.txt`, `home-300*.png`, Log | open |
| L2 | Search finds a document by a word only in its title, only in its description, only inside one of its cells; clearing restores the list; no results shows an empty state | unit tests + typing in the box | `search-*.png`, `library.test.ts` | open |
| L3 | A description typed on a card survives a reload and can be read and changed inside the document (Document panel) | drive + reload + `/read` meta | `describe-*.png` | open |
| L4 | A pinned document stays in the Pinned section across reloads and every sort; the pinned order can be changed (drag, and keyboard/menu) and is kept; unpinning puts it back | drive + reload; unit test | `pinned-*.png`, tests | open |
| L5 | Archive takes a document out of the default list, it appears under Archived, and Restore brings it back with content and history unchanged (`/api/docs/:id` and `/log` equal before/after); Delete asks first (an in-page dialog); afterwards `/d/<id>` shows a clear "not found" page | drive + API diff; unit test | `archive-*.png`, `deleted.png`, tests | open |
| L6 | Selecting several documents offers Pin, Archive, Delete and Group, by keyboard (Tab/Space/Enter) and on a phone (tap) | `--press` keys at 1440×900; taps at 390×844 `--mobile` | `select-keyboard.png`, `select-phone.png` | open |
| S1 | A share link opened in a fresh profile shows the document in Live with no editing controls and no navigation (no Edit, inspector, logo link or home link) | cdp fresh profile + DOM check | `shared-view.png`, `shared-phone.png` | open |
| S2 | A "can view" link cannot change the stored document: ops POST with its token → 403, document unchanged; other documents, the library, data browser and log are refused | curl + unit tests (`access.test.ts`) | `share.txt`, tests | open |
| S3 | A "can edit" link's changes appear live for the owner (owner's open editor shows the guest's change without reload) | two pages driven at once | `shared-edit-owner.png`, `share.txt` | open |
| S4 | A link that was turned off shows a clear "no longer shared" page; tokens are ≥ 43 random base64url characters | cdp + unit test | `unshared.png`, tests | open |
| K1 | Grouping three selected documents makes one deck card; the deck's documents leave the main list; reordering is kept across reloads; ungrouping leaves the documents intact (content and history) | drive + API; unit tests | `deck-card.png`, `deck-page.png`, tests | open |
| K2 | Play: → and ← move slides, a swipe on a phone moves them, a click on the side moves them; the counter shows n / N; full screen button; each slide fits 1440×900 and 390×844 with no horizontal overflow (scrollWidth ≤ clientWidth on every slide); an input changed on slide 1 is still changed after slide 2 and back; Esc returns to where Play started | drive with real keys and touch | `play-*.png`, `play.txt` | open |
| E1 | The exported HTML of the showcase document, opened from `file://` with the network disabled, looks like its Live view (side by side), recalculates a formula when an input changes, and makes zero network requests | drive offline + request count | `export-side-by-side.png`, `export.txt` | open |
| E2 | The exported deck plays every slide offline; file sizes of both exports in the Log | drive offline | `export-deck-*.png`, `export.txt` | open |
| E3 | An export holds only what its document shows and reads: no other documents, no unrelated collections, no keys or fetch addresses, no external URLs | unit test on the composer + the real file | tests, `export.txt` | open |
| A1 | Over the HTTP API and MCP an agent can search, describe, pin, archive and restore documents, create and reorder a deck (and share, export); the guide describes how | MCP client against the isolated server; `/api/guide` | `mcp.txt`, `guide.txt` | open |
| M1 | A database made by the old code (commit `40b398d`) opens after the upgrade with every document, its history and its records in place | unit test on the v1 schema + old server run, copy, new server | `migration.txt`, tests | open |
| T1 | New tests cover search matching, pinned order, archive and restore, deck ordering, the share token access rules, the migration, and an export with no external URLs | `npm test` count goes up | Log | open |

Status: `open` → `pass` (with evidence) or `blocked` (see Blocked).

## Milestones

1. [x] **Core + store**: `core/library.ts` (document text, search match and snippet, shape for the card, arrange: filter/sort/pinned), store migration v2 (description, pinned, archived, search, shape columns; shares; decks), tests (L2, L4, L5, K1, M1, T1 part)
2. [x] **API + access + MCP + guide**: library list/search, PATCH doc, bulk actions, pins order, decks, shares, the share-token check in one place (`server/access.ts`) with a filtered event stream, MCP tools, guide section, tests (S2, S4, A1, T1 part)
3. [ ] **Home library UI**: search, sort, filters, grid/list, pinned section with reorder, selection bar, card menu, describe on the card, delete dialog, archive/restore, incremental rendering; not-found page; description in the Document panel (L1–L6)
4. [ ] **Sharing UI**: Share dialog in the editor, `/s/<token>` view (Live only, view or edit), banners, "no longer shared" (S1–S4)
5. [ ] **Decks + Play**: deck card and page (reorder, add, remove, ungroup), Play with fit-to-screen slides, keys, click, swipe, counter, full screen, Esc (K1, K2)
6. [ ] **Export**: offline bundle (second Vite build), composer (fonts and pictures inlined, records and fetch answers as of export), in-page stand-in for the server, offline doc view and deck player (E1–E3)
7. [ ] **Showcase + evidence**: seed, shoot.sh, perf, migration on an old-code database, MCP check (G3, L1, M1, A1)
8. [ ] **Final audit**: review, clean build, empty data, gates, full sweep, every contract item checked

## Decisions

- **Offline records (asked in the brief; the user chose the recommendation):** in an exported file, `insert!`, `update!`, `delete!` and `clear!` work on the records in memory for that session; a visible "Offline copy" note says nothing is saved. Ops (typing, ticking, buttons) also apply in memory only.
- **Hosting is out of scope** (as the brief says): links and access rules only; the server still listens on 127.0.0.1.
- **What is library state and what is document state.** The description is part of the document (`meta.description`, set with an op like the title), so it has history, undo, and agents set it with ops too; a copy sits in a column for listing and search. Pinned (with its position), archived, share links and deck membership describe how the library is arranged, not what the document says: they live in their own columns and tables, outside the ops history, and don't change "last changed".
- **Search** is server-side, over a normalised text column kept up to date on every save: title, description and every word a reader sees in the cells (text, labels, placeholders, list items, table rows, panel and diagram texts, options), without markdown marks, `{{templates}}`, names or code. Every word of the query must appear (AND), case- and accent-insensitive, anywhere in a word (prefixes and parts match). Results put title matches first, then description, then text, each kept in the chosen sort; each says where it matched with a snippet. The browser waits 120 ms after the last key and keeps the old results on screen until the new ones arrive.
- **The list request** sends summaries only: id, title, description, times, flags and a small "shape" (kinds and sizes, at most 3 levels and 8 children per group) for the card's minimap. The home page renders 60 cards at a time and more as the list scrolls near its end, with `content-visibility: auto` on cards.
- **Archive** clears the pin (restore doesn't re-pin); an archived document still opens from its link, with a banner and Restore. Delete is permanent after an in-page dialog (no `window.confirm`), removes the document's history, messages, share links and deck membership; records saved into collections stay (they belong to the collection).
- **Share links**: per document, a "can view" link and a "can edit" link, each on or off. A token is 32 random bytes in base64url (43 characters). Turning a link off keeps its row (revoked), so the old link says "no longer shared" rather than "not found"; turning it on again makes a new token, so an old link never comes back. Without a token a request is the owner's (the person running edgy on this machine); brief 3 adds accounts in the same function. The check is one function, `server/access.ts`, run as middleware on every `/api` request that carries a token (header `x-edgy-share` or `?share=`): the token's document only; view reads the document, its values, the records it reads, fetch answers and its event stream (ops, data, fetch, deleted, unshared; not messages, presence, compose requests or traces); edit also sends ops, saves records to the collections the document uses, and refreshes fetches. Everything else is 403. A view guest can still type into inputs to try the document: changes stay in their tab and a note says so.
- **Decks are folders that play**: a document is in at most one deck; its documents leave the main list and show in the deck's card; ungrouping (or deleting the deck) puts them back; deleting a document takes it out of its deck. Decks have a title, description, pin and archive like documents. Search finds documents inside decks too, labelled with their deck. Play skips archived documents.
- **A document as a slide**: it is laid out at its own width (meta.width, default 880) or the screen's when narrower, so a phone gets the phone layout and nothing is ever wider than the screen (tables and diagrams scroll inside their own box). Then it is scaled: up to fill a big screen (at most 1.5×), down to fit the height when that keeps it readable (at least 0.62×); a document that would need more shrinking keeps a readable scale and scrolls vertically inside its slide, with a fade and "more below"; ↓ ↑ Space PgDn PgUp scroll it, → ← move between slides. Each slide is its own live session (evaluates on its own); only the current slide keeps a stream to the server, so a long deck doesn't use up the browser's connections; a slide's state is kept while Play is open. The document's `open` handler runs the first time its slide shows, `close` when Play ends.
- **Export** is a second Vite build (`vite.offline.config.ts`, one JS file and one CSS file, no code splitting) of the same components Live uses. The server composes the file: the bundle inline, the document(s) as JSON, the records of every collection they read (as of the export), fetch cells' last answers (their addresses and headers removed, since they are never fetched offline and may hold keys), uploaded and external pictures as data URIs, and only the font files the document's text needs (its families, the subsets its characters fall in). In the page, a stand-in for the server answers the app's requests from memory (`web/lib/transport.ts` is the one seam), so formulas, inputs, buttons and handlers run unchanged. A Content-Security-Policy meta tag (`default-src 'none'`, data: for images and fonts) guarantees no request leaves the file. Timers don't tick and fetches don't refresh offline. When the bundle isn't built (development), the server builds it once on first export.
- **"No external URLs"** means nothing the page loads or calls is outside the file: no `src`, `href`, `url()` or `@import` to a host, no fetch addresses or picture URLs in the data. Links a person wrote into text stay clickable (they are content, not requests), and URL-shaped strings inside the bundled library code (React's error links, the SVG namespace) are not requests either; the CSP and the zero-request run prove it.

## Blocked

- *(none)*

## Notes

- No git identity is configured on this machine: commit with `git -c user.name="Narcis Brindusescu" -c user.email="narcis75@gmail.com" commit …`.
- Most source files are CRLF.
- `GET /api/docs` before this goal, 301 documents (300 seeded with `scripts/seed-library.mjs` + the tour): 393,854 bytes.

## Log

- 2026-10-02: baseline: typecheck, 170 tests, build pass; sweep (home, data, showcase in edit/live/page/phone/pdf) with 300 seeded documents: 0 problems. `GET /api/docs` with 301 docs: 393,854 bytes.
- 2026-10-02: M1+M2: core/library.ts (document text, search match + snippet, card shape, arrange), store schema 2 with in-place migration (docs columns, decks, deck_docs, shares), server/access.ts (one check for share tokens, filtered event stream), library/pins/bulk/decks/shares endpoints, MCP tools edgy_docs (search), edgy_organize, edgy_deck, edgy_share, edgy_export, guide Library section. 170 → 185 tests (search, pins, archive/restore, decks, share rules, migration from the v1 schema). Pushed 0ca480c.
- 2026-10-02: M4/M5 in progress: transport seam (share token header / stream param), Session options (guest view/edit, embedded, pause/resume), Notice page (not found / no longer shared), Description in the Document panel, Share dialog + editor Share button, /s/<token> page (Live only), deck page, Play (fit.ts, keys, click beside, swipe, counter, full screen, Esc). Checked headless: shared view has no brand/mode/home link; Play 1440×900 scale 1.07, phone fits (scrollWidth 390 = clientWidth) and a real touch swipe moves 1→2; input typed on slide 1 kept after → ←; Esc returns to from=.
