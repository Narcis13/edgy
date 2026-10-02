# edgy: project facts for the goal loop

```bash
S=goal-loop/scripts       # the skill's generic tools (also reachable as .claude/skills/goal-loop/scripts)
P=.claude/goal-loop       # edgy's: this file, gates, screens, serve.sh
```

Set `TMPDIR` to your scratchpad so logs, data and screenshots stay out of the repo.

## Kind

- **UI:** web. A React app and its API served from one port.
- **Browser:** both. Headless for the sweep and all committed evidence. Claude in Chrome when a check
  needs a real window: drawing and dragging in the diagram, and long editing flows done by hand.
  Phone criteria still get a headless `--mobile` shot, since Chrome only resizes the window.

## Gates

```bash
$S/gates.sh            # runs $P/gates: typecheck, npm test, production build; one PASS/FAIL line each
```

- `npm test` runs the explicit globs listed in `package.json` (`src/core`, `src/server`, `src/web/print`,
  `src/web/kinds`, `src/web/code`). **A new test file in any other directory doesn't run until you add its
  glob to the `test` script.** Check the test count goes up when you add tests.
- Tests use Node's test runner (`node:test` + `assert`) through tsx. Follow `src/core/core.test.ts`.
- A Vite "chunks are larger" warning counts as a finding. Lazy-load the way `src/web/App.tsx` already does.

## Running the app for verification

```bash
$P/serve.sh fresh 8791 "$TMPDIR/data"    # build, empty data, production server: app and API on one port
$P/serve.sh stop 8791
```

- On Windows (Git Bash) set `CHROME="C:/Program Files/Google/Chrome/Application/chrome.exe"` for `cdp.mjs`/`sweep.sh`; `swift` isn't there, so PDFs aren't rendered to PNG (open the PDF or shoot the Page view instead). `serve.sh stop` kills by pid file (`lsof` is missing, harmless).
- Timers and fetch cells run on the server only while a browser has the document open in Live (the SSE stream says `?client&mode`). A document that should tick in a screenshot must be opened with `?view=live`. `/api/demo/rate`, `/api/demo/fail` and `/api/demo/slow?ms=` are local fixtures for fetch cells.
- Never verify against `data/edgy.db`, and never stop the user's dev server (5173 for web, 8787 for API).
  Use port 8791, or 8792 and up for a second instance.
- `serve.sh` builds first, so run it again after code changes. It's a production build, with no hot reload.
- URLs: `/` (home, the library), `/data` (collections), `/d/<id>?view=edit|live|page`, `/deck/<id>` and `/deck/<id>/play#<n>`,
  `/s/<token>` (a share link: Live only). On a phone the editor opens in Live by default.
- `serve.sh` and `npm run build` also build the offline bundle (`vite.offline.config.ts`) that exports are made from;
  `GET /api/docs/<id>/export` answers 503 without it. In development the server builds it on the first export.
- Fill a server with many documents: `node scripts/seed-library.mjs <url> 300`; the showcase library: `node docs/showcase/library/seed.mjs <url>`
  (prints ids as shell assignments). Share tokens, decks and pins are set over HTTP (see the guide's Library section).
- The schema version is SQLite's `user_version` (now 3); `Store` migrates older files in place on open. `docs/showcase/library/migration.sh`
  checks a database made by commit 40b398d. On Windows, Git Bash's `kill` may not reach a node started with nohup in a subshell: stop by port.
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

The screens are listed in `$P/screens`: home, data, and for each document Edit, Live and Page at
1440×900 (full height); Live (one image per screenful) and Page at 390×844 phone emulation; and the
printed PDF with its pages rendered into one PNG (`<id>-pdf.png`). It prints the problems found on each
screen and exits non-zero if there were any. Add a line there when a goal adds a screen.

For one screen or an interaction, use `cdp.mjs` directly:

```bash
node $S/cdp.mjs shot "<url>" out.png --size 390x844 --mobile [--dark] [--full|--scroll] --pane ".desk, .home, .records" \
  --js "const i = document.querySelector('.ktable-search input'); …" --wait 3500
node $S/cdp.mjs pdf "<url>?view=page" out.pdf && swift $S/pdfpng.swift out.pdf out.png
swift $S/montage.swift strip.png 0.5 a.png b.png c.png    # side by side, for evidence
```

- The app scrolls inside `.desk` (documents), `.home` and `.records`, not the page. `--full` and `--scroll`
  need `--pane ".desk, .home, .records"` (or `CDP_PANE` set to it) when you call `cdp.mjs` directly.
- `--js` runs after load and its value is printed. Use it to click, type and dispatch events, then let the
  screenshot capture the result. Find selectors by reading the components (`src/web/**`).
  Inputs controlled by React need the native value setter followed by an `input` event.
- `--swipe "x1,y1,x2,y2"` sends a real touch swipe; `--offline` turns the network off (open an export with `file:///…`); every run prints
  `REQUESTS n`, the requests that went to the network.
- A background headless tab has no focus: `el.focus()`/`blur()` fire nothing, so fields that save on blur need `FocusEvent('focusin'/'focusout')`
  dispatched (see the `SETV` helpers in `docs/showcase/library/shoot.sh`).
- Exit code 3 means there was at least one `CONSOLE` line: a console error or warning, an uncaught exception, a failed
  request, or an HTTP status of 400 or above. The goal requires zero.
- Viewports to cover: 1440×900 desktop, 390×844 phone. When layout is part of the goal, also check
  820×1180 tablet and `--dark`.
- In the editor, `window.edgy` is the live session (`src/web/editor/Editor.tsx`), so `select`,
  `openMenu`, `state` and `raised` work from `--js` and from Chrome's `javascript_tool`. In Chrome, use
  it for state checks and the pointer for the drawing.
- Deleting a document (Home) or a collection's records (Data) asks with a native `window.confirm`. In
  Chrome, stub it first (`window.confirm = () => true`) or the extension freezes.
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
  interaction that matters), the printed PDF, an `INDEX.md` that maps each contract item to its files, and
  a `shoot.sh` that regenerates them from a fresh server (see `docs/showcase/new-elements/shoot.sh`).
  Keep it to the shots that prove something; loop screenshots stay in the scratchpad.
- Finished PROGRESS.md files move to `docs/progress/<YYYY-MM-DD>-<slug>.md`.
- When the goal changes how the app is used, update `README.md`: features, keyboard shortcuts, the scripts table.

## Conventions

- Commit style: see `git log`. A short title, then a bulleted body written from the user's side.
- Node ≥ 22.13 (`node:sqlite`). TypeScript strict. React 19. No new dependencies without a reason in
  **Decisions**.
- Prose in the UI and docs is plain and concrete, with no marketing voice.
