# Library showcase: evidence

Regenerate everything here from a fresh server with empty data:

```bash
TMPDIR=/tmp/ev CHROME=/path/to/chrome docs/showcase/library/shoot.sh      # screenshots + library.txt
TMPDIR=/tmp/ev docs/showcase/library/migration.sh                        # migration.txt
node docs/showcase/library/mcp-check.mjs http://127.0.0.1:<port> <dir>  # mcp.txt (against a running edgy)
```

`seed.mjs` builds the showcase library: a studio's documents with descriptions, two pinned in a chosen
order, one archived, a quote shared both ways, and a deck for the quarterly review. `library.txt` is what
each step of `shoot.sh` printed (every screenshot run ends `exit 0`: no console errors or failed requests).

| # | criterion | files |
|---|---|---|
| L1 | 300 documents: list size, first cards, typing, scrolling, desktop and phone | `library.txt` (L1), `home-300.png`, `home-300-phone.png` |
| L2 | search by a word only in a title, a description, a cell; nothing found; cleared | `library.txt` (L2), `search-title.png`, `search-text.png`, `search-none.png` |
| L3 | a description typed on a card, after a reload; read and changed inside the document | `library.txt` (L3), `describe-card.png`, `describe-inside.png` |
| L4 | pinned across reloads and sorts, reordered, unpinned | `library.txt` (L4), `pinned.png` |
| L5 | archive, Archived filter, restore unchanged; delete asks; the gone document's page | `library.txt` (L5), `archived.png`, `delete-dialog.png`, `deleted.png` |
| L6 | several selected by keyboard and on a phone | `select-keyboard.png`, `select-phone.png` |
| S1 | a view link in a fresh profile: Live, no editor, no navigation | `shared-view.png`, `shared-phone.png` |
| S2 | a view token can't change the document or reach anything else | `library.txt` (S2) |
| S3 | an edit link's change appears live for the owner | `shared-edit-owner.png` (owner's editor left, guest's page right) |
| S4 | a link turned off says so; tokens 43 characters | `unshared.png`, `library.txt` (S2, S4) |
| K1 | grouping three makes a deck card; reorder kept; ungroup keeps the documents | `group.png`, `deck-page.png`, `deck-page-phone.png`, `library.txt` (K1) |
| K2 | Play: keys, swipe, counter, fit at 1440×900 and 390×844, input kept, Esc back | `play-1.png`, `play-1440x900-{1,2,3}.png`, `play-390x844-{1,2,3}.png`, `library.txt` (K2) |
| E1 | the showcase document exported: offline from disk, like Live, recalculates, 0 requests | `export-side-by-side.png`, `export-live.png`, `export-offline.png`, `library.txt` (E1) |
| E2 | the exported deck plays every slide; file sizes | `export-deck-overview.png`, `export-deck-play.png`, `library.txt` (E1, E2) |
| A1 | an agent over MCP: search, describe, pin, archive, restore, decks, share, export | `mcp.txt` |
| M1 | a database made by the old code opens with everything in place | `migration.txt` |
| G3 | the showcase library on desktop, phone and dark | `home.png`, `home-phone.png`, `home-dark.png` |
