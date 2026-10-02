# Progress

Goal: five new things a cell can be. A **collapsible** (a heading that folds what is under it), an
**accordion** (sections that fold, one at a time or any number), **tabs** (panels behind a tab bar) — all
three holding any cells, with their open state as a value formulas read and actions set; a **diagram**
drawn in the app's own SVG in the manner of Excalidraw, whose content is data agents write and formulas
read; and a **data cell** that holds a value readers never see. Each is a full citizen: `/` menu,
designer, notation, outline, minimap, guide, Blocks, Ask AI.

Started 2026-10-02 on branch `main` at `50bf912`. Brief: Brief 4 in `FEATURES_PROMPTS.md`.

**Next:** nothing — every contract item passes (final audit 2026-10-02).

## Contract (Done means)

| # | criterion | verified by | evidence | status |
|---|---|---|---|---|
| G1 | Typecheck, all tests and the production build pass, no chunk warning | `gates.sh` | Log | pass — 132 tests, typecheck, build, no chunk warning (Editor chunk 399 kB) |
| G2 | Zero console/network problems on every screen at 1440×900 and 390×844, plus tablet 820×1180 and dark | `sweep.sh` + `cdp.mjs --dark` | Log | pass — sweep of all 6 templates + containers doc: 0 problems; tablet, dark, phone-dark shots 0 CONSOLE |
| G3 | A showcase template using all five kinds in one realistic document, verified on desktop, phone and print | sweep + reading the images | `docs/showcase/new-elements/` | pass — `docs/showcase/new-elements/` (template `elements`, Order desk) |
| D1 | Collapsible: click on the heading, Enter or Space folds and unfolds; the state survives a reload; it can start folded; the heading has `aria-expanded` | `cdp.mjs --js` click + key events, reload, read `aria-expanded` | `collapsible.png`, Log | pass — `collapsible.png`; trusted Enter/Space, aria-expanded false→true→(reload) true→false |
| D2 | Accordion: one-at-a-time closes the open section when another opens; "any number" keeps them independent; a section holds a table and a chart | scripted clicks in both modes, screenshot | `accordion.png` | pass — `accordion.png`, `containers.test.ts` |
| D3 | Tabs: click and arrow keys change the tab; the open tab is the value and a formula elsewhere reacts; a button with `set!` changes it; at 390px the tab bar scrolls inside itself with no page overflow; formulas in hidden panels still evaluate | scripted clicks/keys + `GET /read`; phone shot + `scrollWidth` check | `tabs.png`, `tabs-phone.png`, Log | pass — `tabs.png`, `tabs-phone.png` (bar 576>346, page 390) |
| D4 | Inside containers cells split, merge, move, duplicate and are removed; tabs and sections are added, renamed, reordered and removed from the designer and on the page; undo restores each step; a container with one child survives `normalize` | unit tests + scripted UI run with undo | `containers-edit.png`, Log | pass — `containers-edit.png`, `panels.png`, `containers.test.ts` (inverses checked) |
| D5 | Paper: collapsibles and accordions print unfolded; tabs print every panel in order under its title; no cell is cut between pages | PDF rendered to PNG, read | `new-elements.pdf`, `printed.png` | pass — `new-elements.pdf` (3 pages), `printed.png`, `paginate.test.ts` |
| D6 | Diagram by hand: draw three shapes, connect them with arrows, label them; move a shape and arrows follow; resize, delete; undo/redo each step; persists after reload; works by touch at 390×844; dark mode reads well; prints as vector | scripted pointer/touch events, reload, dark shot, PDF | `diagram-hand.png`, `diagram-touch.png`, `diagram-dark.png` | pass — `diagram-hand.png`, `diagram-touch.png`, `diagram-dark.png` (9 undo / 9 redo) |
| D7 | Diagram as data: one ops POST builds a five-node flowchart from notation and it renders as written; a shape whose text is `{{total \| currency}}` updates when `total` changes; a formula counts the shapes | curl + screenshot + `GET /read` | `diagram-data.png`, Log | pass — `diagram-data.png`; formula counts 5; label $2,450.50 |
| D8 | Data cell: invisible and taking no space in Live, Page view and PDF; a chip in Edit; a button's `set!` changes it and a `hidden` rule reacts; its value shows in the outline; the showcase wizard's Next and Back run on one | DOM size check in Live/Page, screenshots, `GET /read` | `data-chip.png`, `wizard.png` | pass — `data-chip.png`, `wizard.png`; 0 data elements drawn in Live/Page |
| D9 | Each of the five: in the `/` menu, designed in the panel without code, round-trips through notation, an outline line, a minimap glyph, described in `/api/guide` | screenshots of menu, each designer, home minimap; tests; curl guide | `menu.png`, `panel-*.png`, `minimap.png` | pass — `menu.png`, `panels.png`, `minimap.png`, round-trip tests, guide text |
| D10 | Ask AI answers a sentence about each kind ("a button that opens the Details tab", "go to the next step", and one each for accordion, collapsible, diagram) on the offline composer and the Claude path (mocked fetch) | compose tests + one run through the studio | `ask-ai.png`, tests | pass — `ask-ai.txt` (offline, via API), compose tests offline + mocked Claude; live Claude not checked (no key) |
| D11 | New tests cover notation and ops round trips of each kind, `normalize` with containers, tab and accordion state, arrow geometry, data cell evaluation and `set!`, pagination with unfolded containers | `npm test` count goes up | Log | pass — 99 → 132 tests |
| D12 | Events: brief 2 isn't built, so a tab changing, a section opening or closing and a shape being clicked all go through one obvious place (`session.raise`, kinds declared in `src/core/events.ts`) | code + a scripted check of `raised` | Log | pass — `session.raise`; shoot.sh prints click/change/close/open |
| D13 | Documents made before this change open unchanged; `canvas` and the `hidden` prop behave as before | existing tests + sweep of existing templates | Log | pass — old templates untouched in source; sweep 0 problems; data-tables PDF still 5 pages |
| D14 | README and the guide describe the five kinds | read the text | Log | pass — README section, guide in `src/core/reference.ts` |

Status: `open` → `pass` (with evidence) or `blocked` (see Blocked).

## Milestones

1. [x] **Core model**: kinds, notation, ops inside containers, values, diagram geometry/layout/draw/erase ops, data cell, outline, guide, events registry, tests (D4 core, D7 core, D11 part, D12 core)
2. [x] **Containers and data UI** (lead): tabs/accordion/collapsible/panel rendering in Edit/Live/Page, keyboard and ARIA, on-page add/rename/reorder/remove, data chip and invisibility, print rules and pagination test (D1–D5, D8)
3. [x] **Diagram editor** (agent): `src/web/kinds/Diagram.tsx` — draw, select, move, resize, connect, label, duplicate, delete, colours, touch, undo, print (D6, D7)
4. [x] **Designers and metadata** (agent): inspector panels for the five kinds, empty-cell tiles, minimap glyphs, studio icons/labels/code props, Blocks (D9)
5. [x] **Ask AI** (agent): compose offline rules + Claude prompt for the new kinds, tests (D10)
6. [x] **Integration**: end-to-end runs in the browser, fixes (D1–D10, D12, D13)
7. [x] **Showcase**: template + evidence in `docs/showcase/new-elements/` (G3)
8. [x] **Final audit**: code review, clean build, empty data, all gates, full sweep, every contract item checked

## Decisions

- **Containers are new group kinds, with an explicit `panel` kind** — `tabs` and `accordion` hold only `panel` children (each titled, stacked like a col); `collapsible` is itself a titled stack. Rejected: "a col whose children carry titles". With titles on arbitrary children, every op that wraps or replaces a child (split, merge, normalize collapsing a single-child group, put) would have to carry the title across, and deleting a tab's only cell would delete the tab. An explicit panel keeps the title where it can't be lost, and the existing row/col rules carry on inside it. *(overrule if you disagree)*
- **What the structural ops mean inside containers**: inside a panel or collapsible cells behave as in a col (split col adds a sibling; split row wraps in a row; a plain col dissolves into the panel). Splitting a *panel* adds a panel beside it (direction ignored). `dup` of a panel is a new tab with a fresh title ("Details 2"). `move`/`swap` reorder panels, and only panel-with-panel. Removing the last cell of a panel leaves an empty cell (as the root does); the last panel of tabs can't be removed (remove the tabs). Merging across panels is refused; merging a whole panel keeps the panel. A check after every op enforces "tabs/accordions hold only panels, panels sit only there".
- **`normalize`** never dissolves a tabs/accordion/collapsible/panel, even with one child (they are what the person made). Only plain row/col dissolve. A tabs or accordion with no panels is refused rather than turned into an empty cell.
- **State as value, keyed by title**: tabs → the open title (unset or unknown → the first; matching forgives case); accordion → the list of open titles (accepts a list, one title or `true`; one-at-a-time keeps the first); collapsible → `true` while open (unset means open, so new content is visible to edit). Untitled or repeated titles get a deterministic key ("Tab 2", "Details 2"). Renaming the open panel moves the value with it. People's clicks save with `set value` like a ticked list item (undoable, coalesced per cell).
- **Accordion default**: one at a time (`multiple: true` for any number), all closed when unset; from the `/` menu the first section starts open.
- **Choosing a tab or opening a section is not an undo step** (it is saved in the document, but it is moving around, not editing); a button's `set!` still is, like every action.
- **Paper**: in the Page view and the PDF collapsibles and accordions show unfolded and tabs show every panel, in order, each under its title as a heading. Headings are kept with the first cell after them.
- **Diagram built natively in SVG**, no third-party editor: Excalidraw would add ~1 MB, bring its own colours (not our theme tokens), its own JSON (not our notation/ops) and canvas rendering (not vector print).
- **Diagram data model**: `value` is a list of elements `{id, type: rect|ellipse|diamond|text|arrow|line, x, y, w, h, text, color, fill, size, dash, from, to, x1, y1, x2, y2}`. Boxes without x/y are laid out top to bottom along the arrows (layered, loops ignored) when written, so agents don't need coordinates. Arrows attached with from/to are drawn from the outline of one box to the other, computed on render, so they follow when a box moves. Element ids are the agent's or `e1, e2…`. New ops `draw` (upsert elements; fields set to null are removed) and `erase` (removes attached connectors too) change single elements; `set value` still replaces the whole list. Applied `draw` ops record whole elements so replay is exact.
- **Diagram editing happens in Edit** (it is authored content, like text); in Live and on paper it is read-only and shapes can be clicked (an event). *(overrule if readers should draw)*
- **Diagram text**: labels wrap by an estimated character width (pure, testable, the same in print) and are drawn as SVG text, so print is vector.
- **Data cell** is a leaf kind `data` with a literal `value` (no expression; that's a formula). From the `/` menu it gets a name (`data`, `data2`…) because it exists to be read by name. In Live, Page and print it renders nothing at all (no wrapper, no divider, no gap); in Edit it's a chip that hugs its content.
- **Events**: brief 2 isn't built. Kinds declare what they raise in `src/core/events.ts`; the web calls `session.raise(cell, name, data)` from the tabs, accordion, collapsible and diagram; `raise` keeps the last 20 and does nothing else yet.

## Blocked

- *(none)*

## Notes

- `node_modules` was missing most `@fontsource-variable/*` packages at the start (build failed); `npm install` from the lockfile restored them.
- `isGroup` is now true for all six group kinds; use `flowOf(cell)` for "lays out as row/col", `holdsPanels` for tabs/accordion, `isContainer` for the three with state.
- A `hidden` expression that is false gives `st.hidden === false`, not undefined.

- tsx's test runner makes an IPC socket under TMPDIR; the scratchpad path can exceed macOS's ~104-char socket limit (EADDRINUSE). If the test gate fails that way, run `npm test` with the default TMPDIR.
- Ask AI (offline): opening an accordion section needs its title; "next tab" stops at the ends; with several diagrams and none named, the one around the edited cell (else the first) is used.

## Log

- 2026-10-02: baseline: 99 tests pass, typecheck clean, build passes after `npm install` (font packages had gone missing from node_modules).
- 2026-10-02: M1 core: kinds, notation, ops, engine, diagram geometry/layout, outline, guide, events registry. 99 → 112 tests.
- 2026-10-02: M2 containers UI: tabs/accordion/collapsible render in Edit/Live/Page; checked by scripted clicks and trusted keys (Enter folds a collapsible, ArrowRight moves tab and focus), button `set!` opens a tab and a hidden rule reacts, accordion one-at-a-time with a table and a chart, phone tab bar scrolls inside (459 > 346 px) with page scrollWidth 390, PDF prints all panels under titles (2 pages). On-page rename/add/move/remove + 5 undos each restored. `keepWithNext` pagination test. cdp.mjs gained `--press` for trusted keys.
- 2026-10-02: M5 Ask AI (agent): offline + mocked Claude for all five kinds; compose tests 12 → 17; full suite 130 pass (checked by lead with `npm test`).
- 2026-10-02: M4 designers (agent): panels for tabs/accordion/collapsible/panel/data/diagram, empty-cell tiles, minimap, studio icons, Blocks value choices; driven from the panel only by the agent; lead re-shot each designer on the Order desk template (0 console). Fixes: toolbar above a selected panel's container; data chip capped to the sheet width; panels drop sizes in normalize. 130 tests.
- 2026-10-02: M3 diagram editor (agent) verified by the lead: touch scenario at 390×844 (3 shapes, 2 arrows, label, move, resize, delete, 9 undo/9 redo), one-POST flowchart + live label + shape count. Parallel connectors offset.
- 2026-10-02: code review (fresh reviewer): fixed Escape saving in inspector inputs, compose taking tabs for form lines, `$` titles read as references (compose + Blocks), keyboard crash when nothing is shown, O(n²) parallel-connector scan (memoised). Rejected: "undo of draw/erase can throw on an invalid old value" — old values were validated when written. 132 tests.
- 2026-10-02: M7 showcase evidence in `docs/showcase/new-elements/` from `shoot.sh` (fresh server); all images read; sweep of every template 0 problems.
- 2026-10-02: final audit: fresh build and empty data on 8791, gates 132/132, sweep of all six templates and a containers doc 0 problems, evidence re-read, `/api/guide` describes the six kinds and draw/erase, servers stopped, tree clean.
