# Progress

Goal: take the table cell to a full data table — grouped rows, selectable rows, resizable columns, cell
borders, action buttons in rows, per-column alignment and formatting, rows typed in place — and
overhaul the right-hand panel so every kind of cell (table, canvas, list, calendar, chart, stat, …) has
its own designer, usable by beginners. Add more fonts, typography and spacing controls. Finish with a
demo document that shows all of it, verified end to end with no console errors.

Started 2026-10-01 on branch `main` at `5d03fa9`.

**Next:** nothing — every contract item passes (final audit 2026-10-01).

## Contract (Done means)

| # | criterion | verified by | evidence | status |
|---|---|---|---|---|
| G1 | Typecheck, all tests and the production build pass, no chunk warning | `gates.sh` | Log | pass — 99 tests, typecheck, build, no chunk warning (Log) |
| G2 | Zero console/network problems on every screen at 1440×900, 390×844, 820×1180 and dark | `sweep.sh` + `cdp.mjs --dark`/tablet | Log | pass — sweep of 4 documents 0 problems; tablet + dark + phone-dark shots 0 CONSOLE (Log) |
| G3 | A showcase template using every new feature, verified on desktop, phone and print | sweep + reading the images | `docs/showcase/data-tables/` | pass — `docs/showcase/data-tables/` |
| D1 | Grouped rows: `group` shows collapsible group headers with a count and subtotals; collapsing hides the rows; works in cards mode too | click a group header with `cdp.mjs --js`, screenshot | `docs/showcase/data-tables/groups.png` | pass — `groups.png` |
| D2 | Selectable rows: one or many; a header box selects all shown rows; the selection is saved in the doc and `(selected t)` feeds other cells | click boxes, then `GET /read` shows the dependent value | `select.png`, Log | pass — `select.png`, server test |
| D3 | Column widths: drag a header edge to resize; the width is saved in `columns[].width` and can be typed in the designer | pointer events via `--js`, then `GET /api/docs/<id>` | `resize.png`, Log | pass — `resize.png` (width 217 saved) |
| D4 | Lines and look: borders none / rows / columns / grid / outer, stripes, density, header style | montage of the looks | `looks.png` | pass — `looks.png`, `looks-dark.png` |
| D5 | Row actions: buttons in each row run with `row` bound; `update!` changes a saved record, `delete!` removes one, `set!` picks into a cell | click in the browser, then `GET /api/data/<c>` | `actions.png`, Log | pass — `actions.png`, `GET /api/data` showed Paid |
| D6 | Column formatting: align, number format, show as (text, badge with colors, progress, check, link), width, wrap, bold, color; totals row (sum, avg, count, min, max) | screenshot | `formatting.png` | pass — `desktop.png`, `typed.png` |
| D7 | Typed rows: a table can hold its own rows; in Edit, double-click a cell to edit (Enter/Tab/Esc), add and delete rows and columns | interaction screenshots + doc JSON | `typed.png` | pass — `typed.png` |
| D8 | Inspector overhaul: sections per concern; each kind has its own designer; every table feature (D1–D7) can be set without writing code | scripted clicks in the panel build a table's features; screenshot of each kind's panel | `panel-*.png` | pass — `panel-table.png`, `panel-kinds.png`, scripted design from an empty cell (Log) |
| D9 | Per-kind options beyond the generic ones render: canvas paper + pen, list marker + density + progress, calendar week start, chart color, stat "lower is better", button icon + confirm | screenshots | `kinds.png` | pass — `typography.png`, `panel-kinds.png` |
| D10 | Fonts: at least 8 new self-hosted families, a picker that previews each, text style presets, document body/heading font and base size | screenshot; network shows fonts served from the app with no failures | `typography.png` | pass — `typography.png`, `panel-text.png` |
| D11 | Typography and spacing: letter spacing, case, underline/strike, paragraph spacing, per-side padding, line height, border color/width, shadow | screenshot of a styled text cell and its panel | `typography.png` | pass — `typography.png`, `panel-text.png` |
| D12 | Beginner usability: plain labels and hints, presets (table looks, text styles, row actions), empty states, keyboard reachable, panel usable on a phone and in dark mode | screenshots at 390×844 and dark | `panel-phone.png`, `panel-dark.png` | pass — `panel-phone.png`, `tablet.png`, `desktop-dark.png` |
| D13 | New tests cover table rows logic (groups, totals, keys, widths), engine (typed rows, `selected`, row-scoped actions), `update!` + PATCH route, new style keys, notation/ops of new props | `npm test` count goes up | Log | pass — 61 → 99 tests |
| D14 | Print: tables print whole with groups and totals, no search bar, checkboxes or action buttons on paper; chosen fonts appear in the PDF | PDF rendered to PNG | `printed.png`, `data-tables.pdf` | pass — `data-tables.pdf`, `printed.png` |
| D15 | The agent guide (`/api/guide`) and README describe the new props, functions and style keys | read the text | Log | pass — guide in `src/core/reference.ts`, README sections |

Status: `open` → `pass` (with evidence) or `blocked` (see Blocked).

## Milestones

1. [x] **Core model**: table props (`value` rows, `selected`, `group`, `select`, `actions`, `borders`, `stripes`, `density`, `header`, `search`, extended `columns`), `selected` + `update!` + row-scoped actions, PATCH record route, new style keys, font registry, per-kind props (paper, pen, marker, progress, week, color, better, confirm), guide, tests (D2, D5, D7, D13, D15)
2. [x] **Data table renderer**: groups, selection, resize, looks, actions, column formatting, totals, typed-row editing, cards, print (D1–D7, D14)
3. [x] **Inspector overhaul**: sectioned panel, per-kind designers, table designer, style designer with font picker, text presets, spacing (D8, D11, D12)
4. [x] **Fonts and kind options**: font packages, document typography, new style keys in CSS, canvas/list/calendar/chart/stat/button options rendered (D9, D10, D11)
5. [x] **Integration**: end-to-end runs of every feature in the browser, fixes (D1–D12)
6. [x] **Showcase**: template `tables` ("Data tables") + evidence in `docs/showcase/data-tables/` (G3, D14)
7. [x] **Final audit**: code review, clean build, empty data, all gates, full sweep, every contract item checked

## Decisions

- **Table config as flat props**, like the existing `columns`, `compare`, `fit`: `group`, `select`, `actions`, `borders`, `stripes`, `density`, `header`, `search`. Reads best in notation and matches the codebase. *(overrule if you disagree)*
- **Typed rows live in `value`** (as a list's items do); `expr`, when set, wins. The selection is a separate prop `selected` (row keys), so a table's value stays its rows and existing formulas that read tables keep working. Other cells read the selection with a new function `(selected t)`.
- **Row key** = the record's `id` when it has one (records from collections do), otherwise its position in the data.
- **Row actions** are `{label, do, icon?, variant?, confirm?}`; `do` runs with `row` (and `it`) bound to the row's record. New action `update!` merges fields into a saved record (`PATCH /api/data/:name/:id`).
- **Column widths persist in the document** (`columns[].width`) in both Edit and Live, like other things people do to a document in Live (ticking a list).
- **Typed rows are edited in Edit mode only**; Live shows them read-only, so a reader can't change a price list by accident. Collections change through row actions.
- **Fonts are self-hosted `@fontsource-variable` packages** (8 new: Inter, Manrope, Space Grotesk, Lora, Source Serif 4, Fraunces, Playfair Display, JetBrains Mono, Caveat — 9), like the existing Recursive and Newsreader: no requests to third parties, works offline and in PDFs. Browsers only download a face when it is used.
- **Review findings not taken**: arrow keys between "pick one" radios (each radio is its own tab stop; fine for now), moving focus after Yes in a row confirmation, removing the old `filterRows`/`sortRows` (still tested helpers). Rows without an id in a *computed* table are known by position, so a pick can move if the data upstream is filtered differently; giving records an `id` avoids it (saved records always have one).
- **Typing into an empty column** gives a number, unless it has leading zeros ("007" stays text), so sums work and postcodes survive.
- **The panel is split into collapsible sections** (Content first, then Text, Spacing, Box, Logic, Notation) instead of tabs: beginners see what a kind can do first, and nothing is hidden behind a tab they don't know to click.

## Blocked

- *(none)*

## Notes

- `TMPDIR` must be short for tsx's IPC pipe: `ln -sfn <scratchpad> /tmp/eg` and use `TMPDIR=/tmp/eg` (the scratchpad path overflows the Unix socket path limit and every test fails with EINVAL).
- In the editor, select a cell with `window.edgy.select(id)` rather than clicking (cdp clicks hit the sheet overlay).
- Ports: lead 8791, table agent 8793, inspector agent 8794. Gates per agent with `LOGS=/tmp/eg/gates-<who>`.

## Log

- 2026-10-01: baseline: 61 tests pass, typecheck clean, build clean, sweep of showcase 0 problems (home, data, edit, live, page, phone, pdf 4 pages).
- 2026-10-01: M1 core done (aeed131): table props, `selected`, `update!` + PATCH, row-scoped actions, style keys, font registry, guide. 67 tests.
- 2026-10-01: serve.sh/gates.sh build into their own folders (EDGY_DIST) so parallel agents don't collide (341a0e9).
- 2026-10-01: two agents launched: table renderer (Table.tsx, rows.ts, table.css; port 8793) and inspector (Inspector.tsx, editor/inspector/; port 8794).
- 2026-10-01: M4 done (c010722): 9 fonts, new style keys in CSS (look.test.ts), doc typography, canvas paper/pen, list marker/density/progress, calendar week, chart colour, stat better, button icon + confirm. Verified in the browser: a typography test doc at 1440 and dark; button confirm → Yes set x=1 (GET /read).
- 2026-10-01: showcase template `tables` ("Studio billing") with seeded `studio-invoices` records (templates can seed empty collections); server test covers seeding and (selected invoices).
- 2026-10-01: table renderer agent done (7ba2774): groups, picking, actions, resize, looks, formats, totals, typed rows, cards, print. Verified myself on the showcase: picking 2 rows → stat; Paid action moved Harbor & Co to Paid (GET /api/data); envelope drafted the reminder. Fixed: quick clicks lost picks (read the doc's latest picks); small tables no longer turn into cards in narrow cells (`cardsAt`).
- 2026-10-01: inspector agent done (d5b4185): sectioned panel, a designer per kind, table designer, text styles, font picker, spacing, box, doc typography. Verified by a script that designs a table from an empty cell using only the panel (group, picking, EUR, stars, right align, sum total, looks) and by screenshots of each kind, phone drawer, dark.
- 2026-10-01: code review (fresh agent) → fixes (966b371): field rename/add collisions, picks after a typed-row delete, one undo step per in-place edit, panel defaults matching the renderer (align, row button look), group shadow inheritance, canvas pen colour, picked count, leading zeros, AddColumn double add, template seeding after the doc builds, pointer capture.
- 2026-10-01: final audit: fresh server, empty data; gates PASS (99 tests); sweep of Studio billing, Team offsite, Table looks, Typography test: 0 problems (edit, live, page, phone, phone page, PDF 5/4/1/2 pages); tablet 820×1180 and dark (desktop and phone) for each: 0 CONSOLE. Evidence regenerated with `docs/showcase/data-tables/shoot.sh` (resize saved width 217, Annual report → Paid, typed 0.45 saved).

