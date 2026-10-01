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

- [x] 1 Core model (kinds list/calendar/canvas/stat/break, props compare/trend/columns, style.stack, page meta, reader error positions, 4 new tests)
- [ ] 2 AI compose
- [ ] 3 Code studio
- [ ] 4 Content types
- [~] 5 Mobile — fluid sheet (max-width = doc width), rows wrap under 600px (`style.stack` auto/never/always; columns give way before leaves), phone header with ⋯ menu, drawers with backdrop, Live by default on phones. Verified on the Quote doc at 390px.
- [x] 6 Print surface — Page view (Edit/Live/Page), `?view=page`, page setup in a bar and in the document panel, slicing pagination (src/web/print/paginate.ts, 7 tests), footers, light paper in dark theme, `@page` size, ⌘P. Verified: headless Chrome PDF of a 39-row doc = 4 A4 pages identical to the screen, cuts between rows, forced break honoured.
- [ ] 7 Showcase + verification

## Log

- 2026-10-01: baseline — 18 tests pass, typecheck clean. Mobile currently overflows (fixed 880px sheet).
- 2026-10-01: three agents in parallel — compose server (src/server/compose.ts), code studio (src/web/code), content types (src/web/kinds). Lead did core, mobile, print.
- Verification harness (scratchpad, not in repo): cdp.mjs drives headless Chrome over CDP for full-resolution screenshots at phone/desktop sizes, PDFs, and console error capture; pdfpng renders PDF pages with PDFKit.
