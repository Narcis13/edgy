# edgy: project facts for the goal loop

The tools are in `scripts/`, next to this file. Call them by path:
`S=.claude/skills/goal-loop/scripts`. Set `TMPDIR` to your scratchpad so logs, data and screenshots stay
out of the repo.

## Gates

```bash
$S/gates.sh            # typecheck, npm test, production build: one PASS/FAIL line each, exit 1 on any FAIL
```

- `npm test` runs the explicit globs listed in `package.json` (`src/core`, `src/server`, `src/web/print`,
  `src/web/kinds`, `src/web/code`). **A new test file in any other directory doesn't run until you add its
  glob to the `test` script.** Check the test count goes up when you add tests.
- Tests use Node's test runner (`node:test` + `assert`) through tsx. Follow `src/core/core.test.ts`.
- A Vite "chunks are larger" warning counts as a finding. Lazy-load the way `src/web/App.tsx` already does.

## Running the app for verification

```bash
$S/serve.sh fresh 8791 "$TMPDIR/data"    # build, empty data, production server: app and API on one port
$S/serve.sh stop 8791
```

- Never verify against `data/edgy.db`, and never stop the user's dev server (5173 for web, 8787 for API).
  Use port 8791, or 8792 and up for a second instance.
- `serve.sh` builds first, so run it again after code changes. It's a production build, with no hot reload.
- URLs: `/` (home), `/data` (collections), `/d/<id>?view=edit|live|page`. On a phone the editor opens in Live by default.
- Create documents over HTTP, which is reproducible and scriptable:
  - `POST /api/docs` with body `{"template":"showcase"}`, `{"title":…,"root":<notation>}` or `{}`. The response has `id`.
  - `POST /api/docs/<id>/ops` with body `{"actor":{"kind":"agent","name":"Claude"},"ops":[["set","qty","value",5]]}`.
  - `GET /api/docs/<id>/read` returns the outline with values and errors; this is how you check computed values.
  - `GET /api/guide` returns the full notation, language and ops reference.
- The `edgy_*` MCP tools from `.mcp.json` talk to **8787**, the user's dev server, not your isolated one.
  Use them only to check the agent-facing experience, and only when that server is running.

## Screens and viewports

```bash
$S/sweep.sh http://127.0.0.1:8791 "$TMPDIR/sweep" <doc-id> [<doc-id> …]
```

This shoots home, data, and for each document Edit, Live and Page at 1440×900 (full height); Live
(one image per screenful) and Page at 390×844 phone emulation; and prints the PDF and renders its pages
into one PNG (`<id>-pdf.png`). It prints the problems found on each screen and exits non-zero if there
were any.

For one screen or an interaction, use `cdp.mjs` directly:

```bash
node $S/cdp.mjs shot "<url>" out.png --size 390x844 --mobile [--dark] [--full|--scroll] \
  --js "const i = document.querySelector('.ktable-search input'); …" --wait 3500
node $S/cdp.mjs pdf "<url>?view=page" out.pdf && swift $S/pdfpng.swift out.pdf out.png
swift $S/montage.swift strip.png 0.5 a.png b.png c.png    # side by side, for evidence
```

- `--js` runs after load and its value is printed. Use it to click, type and dispatch events, then let the
  screenshot capture the result. Find selectors by reading the components (`src/web/**`).
  Inputs controlled by React need the native value setter followed by an `input` event.
- Exit code 3 means there was at least one `CONSOLE` line: a console error or warning, an uncaught exception, a failed
  request, or an HTTP status of 400 or above. The goal requires zero.
- Viewports to cover: 1440×900 desktop, 390×844 phone. When layout is part of the goal, also check
  820×1180 tablet and `--dark`.
- Print checks: the page count is what you expect, no cell is cut between pages, the footer and page numbers are present, the
  paper is light in dark mode, and editing controls are hidden. Page sizes are A4, A5, Letter and Legal, in portrait or landscape.

## Where things live

```
src/core      model, language (sx.ts), ops, engine, notation, outline, templates. No dependencies.
src/server    Hono API, SQLite store, SSE events, compose (sentence → code)
src/mcp       MCP server; every tool calls the HTTP API
src/web       React app: editor/, code/ (code studio), kinds/ (cell types), print/, pages/
```

- A new cell kind touches core (types, engine, notation, ops, outline, the guide text), the web renderer in
  `src/web/kinds/`, `KindMenu`, `Inspector`, the minimap glyphs, and the guide that agents read. Grep for an
  existing kind such as `calendar` to find every place.
- Anything that calls Claude (`src/server/compose.ts`) means loading the `claude-api` skill first. Tests mock
  `fetch`; there may be no `ANTHROPIC_API_KEY`, so keep an offline path working and say which path you verified.

## Showcase and evidence

- Make the showcase reproducible as a template in `src/core/templates.ts` (see `showcase`, "Team offsite")
  and add it to `TEMPLATES`. Extend the existing showcase or add a new one when the goal is separate from it.
- Committed evidence goes in `docs/showcase/<slug>/`: the key screenshots (desktop, phone, page view, the
  interaction that matters), the printed PDF, and an `INDEX.md` that maps each contract item to its files.
  Keep it to the shots that prove something; loop screenshots stay in the scratchpad.
- When the goal changes how the app is used, update `README.md`: features, keyboard shortcuts, the scripts table.

## Conventions

- Commit style: see `git log`. A short title, then a bulleted body written from the user's side.
- Node ≥ 22.13 (`node:sqlite`). TypeScript strict. React 19. No new dependencies without a reason in
  **Decisions**.
- Prose in the UI and docs is plain and concrete, with no marketing voice.
