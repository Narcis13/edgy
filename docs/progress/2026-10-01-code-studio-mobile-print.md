# Progress

Feature: a beginner-friendly code studio for the Lisp dialect, natural language → code in the
context of a document, new content types, mobile-first rendering (tables as searchable cards),
and a print surface with standard page formats (A4/Letter/A5/Legal, portrait/landscape).

Done means: all tests pass, no console errors, and a generated showcase document exercising every
new feature, verified by screenshots on desktop, mobile and the print view.

## Plan (milestones)

1. **Core model** — new leaf kinds `list`, `calendar`, `canvas`, `stat`, `break`; props `compare`,
   `trend`, `columns`; reader errors carry a source position; engine, notation, ops, outline, guide, tests.
2. **AI compose** — `POST /api/docs/:id/compose` (+ `GET /api/ai`): providers `claude` (when
   `ANTHROPIC_API_KEY` is set), `agent` (an MCP agent answering live via `edgy_listen`/`edgy_answer`),
   `local` (offline rule-based composer that uses the document's cell names). Every answer is parsed
   and evaluated before it is returned.
3. **Code studio** — highlighted editor with autocomplete, signature help, bracket matching, error
   underline, formatting; visual Blocks mode; function library; cells panel; Ask-AI panel. Replaces the
   plain formula textarea everywhere; ⌘E opens the studio.
4. **Content types** — list (checklist/bullets/numbers, editable or computed), calendar (month grid +
   agenda on narrow widths, selected day is the value), canvas (sketch/signature, strokes are the
   value), stat (KPI with delta + sparkline), page break; table upgrade (search, sort, cards on narrow).
5. **Mobile** — fluid sheet, rows wrap on narrow screens, editor chrome and panels usable on phones.
6. **Print surface** — page setup (size, orientation, margins, header/footer), Page view that
   paginates by slicing the rendered document into page boxes, `@page` CSS, ⌘P prints pages.
7. **Showcase** — a template/document using every feature; verified on desktop, mobile, page view.

## Status

All done. 61 tests pass, typecheck is clean, the production build passes, and no console errors or warnings show on any screen (home, data, editor in Edit/Live/Page) at 1440×900 or 390×844.

- [x] 1 Core model — kinds list/calendar/canvas/stat/break, props compare/trend/columns, `style.stack`, page meta, reader error positions.
- [x] 2 AI compose — `POST /api/docs/:id/compose`, `GET /api/ai`. Claude (when a key is set; mocked in tests), a live MCP agent (`edgy_listen` + `edgy_answer`), and a built-in composer (~100 tested phrasings). Validated against the doc. Verified live: browser Ask AI → agent answer by curl (a typo was rejected with "did you mean budget?") → applied.
- [x] 3 Code studio — highlighted editor with autocomplete (functions, cells with values, locals, collections), signature help, error underline, Format; Blocks; Functions and Cells panels; Ask AI. ⌘E. Phone sheet layout. Fixed during QA: block chips now select their text on open and keep invalid numbers open, marked, instead of dropping them.
- [x] 4 Content types — list, calendar, canvas, stat, break; table search/sort/cards/columns. Verified live: tick → stats update, pick day + Add → event saved to a collection and shown, signature → dependent text, table search "boston" → 2 of 10.
- [x] 5 Mobile — fluid sheet, wrapping rows (columns give way before leaves; `stack: never` lines keep numbers whole), phone header with ⋯ menu, drawers, Live by default on phones.
- [x] 6 Print surface — Page view, page setup, slicing pagination, footers, light paper in dark mode, `@page`, ⌘P, editing controls hidden on paper. Verified with real PDFs from headless Chrome.
- [x] 7 Showcase — template `showcase` ("Team offsite"), document `nxpjjjse`. Evidence in `docs/showcase/`: desktop-live.png, mobile.png, code-studio.png, page-view.png, printed-pages.png, team-offsite.pdf (4 A4 pages).

## Notes

- The Claude path is unit-tested with a mocked `fetch`, but it hasn't run against the real API because no `ANTHROPIC_API_KEY` was available here. It sends the `server-side-fallback-2026-07-01` beta header and `thinking: {type: "between_tools"}` per the claude-api skill; drop them in `src/server/compose.ts` if unwanted.
- Auto mode routes Ask AI to an agent only if one listened on the doc in the last 30 s (an agent loops on `edgy_listen`), so a departed agent doesn't stall requests.
- The editor and data routes are lazy-loaded (no chunk over 500 kB).

## Log

- 2026-10-01: baseline — 18 tests pass, typecheck clean. Mobile currently overflows (fixed 880px sheet).
- 2026-10-01: three agents in parallel — compose server (src/server/compose.ts), code studio (src/web/code), content types (src/web/kinds). Lead did core, mobile, print.
- Verification harness (scratchpad, not in repo): cdp.mjs drives headless Chrome over CDP for full-resolution screenshots at phone/desktop sizes, PDFs, and console error capture; pdfpng renders PDF pages with PDFKit.
