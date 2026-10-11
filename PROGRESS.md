# Progress

Goal (brief 5 in `FEATURES_PROMPTS.md`): a documentation site for edgy, for a beginner who has never seen a
cell and for a developer who wants to know what happens between a keystroke and the cloud log. One source,
two outputs: the site the app serves at `/docs/` (linked from the header of every screen, from each kind's
designer and from the code studio's function hints) and a folder of static files that deploys on its own at
any path. Getting started, ten tutorials that end in templates, a page per cell kind, the editor, the
language, events, data, styling, the library, people, agents, under the hood, contributing, a glossary and
troubleshooting. Live examples run the real runtime in the page; search runs in the browser; the lists that
exist in code are generated from it and a coverage test fails when one has no docs.

Started 2026-10-11 on branch `main` at `8d674e4`. Brief: `/goal-loop Brief 5 (Documentation site) in FEATURES_PROMPTS.md, that brief only`.

**Next:** (usage limit reached mid-run) 1) collect the tutorial replay agent's output in docs/showcase/docs-site/tutorials/ (replay.sh, side-by-sides), check and commit it with any tutorial page fixes; 2) rerun the full crawl (site/scripts/crawl.mjs … --axe --live --shots) and contact sheets (site/scripts/sheets.mjs), read every sheet; 3) the shoot.mjs second run: compare git status of site/shots and site/clips (only .webm expected to change) and log it; 4) static check with the app stopped (evidence.mjs static), app check (evidence.mjs app), the accent-change demo and the undocumented-function demo, docs/showcase/docs-site/INDEX.md + shoot.sh; 5) update .claude/goal-loop (project.md test globs, gates, screens) and the final audit.

## Contract (Done means)

| # | criterion | verified by | evidence | status |
|---|---|---|---|---|
| G1 | Typecheck, all tests (coverage, doc-tests, link check, look test included) and the production build (app, offline bundle, docs) pass with no chunk warning | `gates.sh` | Log | open |
| G2 | Zero console/network problems on every app screen touched (home, data, profile, a document at 1440×900 and 390×844 with the Docs link) and on every docs page | `sweep.sh` + `site` sweep | Log | open |
| G3 | The showcase is the site plus the tutorials' templates; evidence and `INDEX.md` in `docs/showcase/docs-site/` | read | `docs/showcase/docs-site/` | open |
| B1 | `npm run docs:build` writes a static folder; a plain static server under `/edgy-docs/` on another port, the app's server stopped: every page opens, links work, search works, live examples run, no request leaves the folder; folder size and page count in the Log | static server + cdp over every page (REQUESTS) | `static.txt` | open |
| B2 | The app serves the same site at `/docs/` signed in and signed out without opening any `/api` route to signed-out visitors (route-table test passes); Docs link in the header of home, data, profile and a document at desktop, in the More menu on a phone | cdp + tests | `app-*.png` | open |
| B3 | Coverage test: every kind, function (`builtinNames`), event (`KIND_EVENTS`, `DOC_EVENTS`), op, API route, MCP tool, style key, format, theme token, keyboard shortcut (one list in code), template has a docs entry; counts in the Log; an undocumented function makes it fail (shown once, reverted) | `site` tests | Log | open |
| B4 | Doc-tests: every runnable example evaluates to the result the page states; every notation snippet parses; every ops example applies to its document; counts in the Log | `site` tests | Log | open |
| B5 | Link check over the built site: no broken internal link or anchor; external links listed in the Log | link-check test | Log | open |
| B6 | Each tutorial done for real by a script on a fresh server, ending in a document matching the tutorial's last picture (side by side); each tutorial's finished document opens from its page as a template | tutorial scripts | `tutorials/*.png` | open |
| B7 | Live examples in the static build, no server: an input updates a formula, a button runs its action, a tab changes, a ticked checkbox runs its handler; records live in memory and say so; no example code loads before the example nears the screen | cdp on the static build (requests before/after scroll) | `live-*.png`, `live.txt` | open |
| B8 | Search finds `sum-by`, `accordion`, `dblclick`, `undo` and a body-only phrase; works by keyboard alone; a word with no match shows a clear empty state; index size in the Log | cdp `--press` | `search-*.png` | open |
| B9 | Every page at 1440×900, 820×1180, 390×844, light and dark, every shot read: no horizontal overflow (code and tables scroll inside), no clipped/overlapping text, touch targets ≥ 40px on a phone; CONSOLE 0 | docs sweep + overflow/target checks in JS | Log, `pages/` samples | open |
| B10 | The look: tokens from `src/web/styles.css` (changing `--accent` changes both, shown once, reverted); a test finds no gradient, `backdrop-filter`, `text-shadow` or SVG filter in built CSS/SVG; app home and docs home side by side, light and dark | test + build + shots | `look-*.png` | open |
| B11 | Theme: in the app the docs open in the person's theme; deployed alone they follow the system; both have a remembered toggle | cdp | `theme-*.png` | open |
| B12 | Accessibility: an automated check (axe-core) reports no serious or critical issue on any page; skip link, visible focus, no skipped heading levels, alt on every screenshot, title on every diagram, drawer opens/closes by keyboard and Esc, AA contrast in both themes | axe over every page, both themes + cdp `--press` | `a11y.txt`, `drawer-*.png` | open |
| B13 | Weight: a text page with no live example, fonts aside, under 100 KB compressed; fonts self-hosted and subset; nothing from a third party; numbers in the Log | measure from the build | Log | open |
| B14 | Printing a docs page: no sidebar, search or drawer; code wraps; diagrams print as vector lines | cdp pdf + read the PDF | `print-*.pdf` | open |
| B15 | One script makes every screenshot and clip in the docs from a fresh server, light and dark; running it twice gives the same set (changed files named in the Log) | run twice, hash compare | Log | open |
| B16 | A reviewer agent that did not write a section checks every page in it against the code; each wrong claim fixed; found/fixed per section in the Log | reviewer agents | Log | open |
| B17 | README and `/api/guide` point to the docs; README says how to build, preview and deploy them; `.claude/goal-loop/` (`gates`, `screens`, `project.md`) covers the docs | read + gates | README, guide, `.claude/goal-loop/` | open |
| C1 | Content: getting started, ten tutorials, 24 kind pages, the editor, the language (every function and action with signature, example and result), events, data/styling/library/people, agents (every MCP tool, every route with its access), under the hood (each page names and links its source files), contributing, glossary, troubleshooting; beginner path and reference with first-sentence summaries and previous/next | coverage test + build + reading | the site | open |
| C2 | Finding the way: sidebar, On this page, previous/next, breadcrumbs, heading links, copy buttons, 404 page; sidebar is a drawer on a phone; `/` or ⌘K opens search | cdp | `nav-*.png` | open |
| C3 | Inside the app: each kind's designer links to its page; the code studio's function hints link to the function's entry | cdp | `app-designer.png`, `app-hint.png` | open |
| C4 | Diagrams (inline SVG, theme variables, titled): cell tree under split/merge, life of an op, event dispatch, two sync logs, access model, evaluation graph, pagination; annotated screenshots of every screen and panel in light and dark; clips (webm, poster, paused under reduced motion) for splitting a cell, drawing an arrow, playing a deck | build + reading the pages | the site | open |

Status: `open` → `pass` (with evidence) or `blocked` (see Blocked).

## Milestones

1. [x] **Engine**: `site/` folder; `npm run docs:build` (Vite for the client and the live runtime, then Markdown → HTML with the layout rendered by React at build time, relative links); the page format and every building block; tokens taken from `src/web/styles.css`; theme; drawer; copy buttons; heading links; prev/next; breadcrumbs; 404; print CSS; a few sample pages (B1 part, B10, B11, B13, B14, C2)
2. [ ] **Keeping it true**: lists from code (an exported op list, the MCP tool table, one shortcut list, a format list); `::ref` tables; entry containers; coverage test, doc-tests, link check, look test, all in `npm test` (B3, B4, B5, B10)
3. [x] **In the app**: `/docs/` served by the server (dev builds on first visit), Vite proxy, Docs links in Shell, the editor header and More menu, the panel's kind link, the code studio's function link (B2, C3)
4. [ ] **Live examples + search**: the iframe runtime from the offline pieces, lazy by IntersectionObserver, records in memory, Open in edgy; search index and dialog (B7, B8)
5. [x] **Writing**: style guide, glossary and sample pages first, then writer agents by section (disjoint folders); diagrams (C1, C4)
6. [ ] **Pictures**: `site/scripts/shoot.mjs` (screens and panels in light and dark, annotations, clips), run twice; tutorial templates and replay scripts (B6, B15, C4)
7. [ ] **Verification tooling**: `site/scripts/crawl.mjs` (every page × 3 viewports × 2 themes: console, overflow, clipped text, targets, axe), static sub-path server with the app stopped (B1, B9, B12)
8. [x] **Review**: a fresh reviewer per section against the code; fixes; the whole diff reviewed (B16)
9. [ ] **README, guide, goal-loop files; final audit** (B17, everything)

## Decisions

*(the four ultrathink parts were weighed before code; overrule anything here)*

### How it is built

- **One build, two places.** `npm run docs:build` (`tsx site/build/build.ts`) writes `dist/docs/`: one
  `index.html` per page in a folder per URL (`cells/table/index.html`), every link relative (`../../cells/table/`),
  assets under `_/`. Relative links mean the same folder works at `/docs/` in the app and at any path on a
  static host, with no base setting. `npm run build` runs it after the app, so `npm start` serves it.
  Options weighed: a Vite SSG plugin (couples the pages to Vite's HTML pipeline and its dev server, hard to
  make every link relative), a docs framework (ruled out by the brief: its own look and weight), a build
  script that calls Vite only for the browser code and renders pages itself (chosen: plain, testable in Node,
  the same modules feed the tests).
- **Pages are Markdown** in `site/content/` (the folder is the URL), parsed with **marked** (new dev
  dependency: small, no dependencies of its own, build time only) plus a handful of block extensions. The
  layout (header, sidebar, On this page, breadcrumbs, previous/next) is React rendered with
  `renderToStaticMarkup` at build time, so a page reads in full without JavaScript. The order of pages and
  sections lives in one file, `site/nav.ts`.
- **Browser code is small and optional.** `site/client/docs.ts` adds search, the drawer, the theme switch,
  copy buttons and live examples; without it every page still reads, and the search button is a link to the
  A–Z index.
- **Tokens come from the app.** The build reads the `:root` blocks of `src/web/styles.css` and
  `src/web/code/code.css` (the syntax colours) and puts them in the docs' CSS, so changing `--accent` there
  changes both. The docs' own CSS (`site/styles/docs.css`) uses only those tokens.
- **One font file.** Recursive (the app's UI and code face) as the fontsource Latin subset with the weight
  and MONO axes only (`recursive-latin-mono-normal.woff2`, 72 KB), copied into `_/`: text with MONO 0, code
  with MONO 1, as in the app.
- **The 404 page** can be served at any depth, where relative links can't know their root. It carries its
  CSS inline and a short script that finds the docs' root by probing for `_/pages.json` up the path, then
  sets `<base>`; without JavaScript it still reads.
- **In the app**: the server answers `/docs/*` from `<dist>/docs` for anyone (it isn't `/api`, so the
  route-table test is untouched), redirects `/docs/x` to `/docs/x/`, and answers unknown pages with the 404
  page. In development (`npm run dev`) the server builds the site on the first visit, the way it builds the
  offline bundle on the first export, and Vite proxies `/docs`.

### The two reading paths

- **Learn** (in order, each page says where it sits): Install and run → The screens → Your first document
  → Edit, Live and Page → The keyboard → ten tutorials, ordered so each adds one idea: formulas (quote),
  events (checklist), a data cell (wizard), collections (order tracker), charts and stats (dashboard), the
  diagram (flowchart), decks (deck), people (sharing), paper and offline (print and export), agents (MCP).
- **Reference** (looked up, not read in order): Cells (an overview, then one page per kind grouped by what
  they do), The editor, The language (one page per function group), Events and actions, Data, Styling,
  Library, People, Agents, Glossary, Troubleshooting, A–Z.
- **Under the hood** (in order, for developers): architecture, then the model, ops, normalize, the engine,
  the interpreter, notation, the browser session, the event stream, storage, the runner, access, sync,
  export, pagination, compose; then Contributing.
- Previous/next follows `site/nav.ts` inside a path, never across paths.

### Live examples

- **A live example is a real edgy document in an iframe** (`_/live.html`), built from notation written in
  the page. The iframe page boots the offline runtime's pieces (`Session`, `LiveSheet`, the `StandIn`
  transport) for one document. Options weighed: mounting React straight into the docs page (the app's
  global CSS — `body { overflow: hidden }`, `#root` heights — and its one global transport would leak into
  the page), Shadow DOM (the tokens live on `:root`, so every rule would need rewriting), an iframe (chosen:
  complete isolation, one runtime file cached for every example, theme and height passed by `postMessage`).
- The iframe is created only when the example comes within a screen of the viewport (IntersectionObserver),
  so no example code loads before that. Without JavaScript the example shows its notation.
- Records live in the iframe's memory; a note under each example that saves records says so. Timers don't
  tick and fetch cells have no network there (they need the server), and the pages that show them say so.
- **Open in edgy** appears only when the docs are served by the app (`/api/health` answers from the same
  origin): it posts the example's notation to `POST /api/docs` and opens the new document; signed out, it
  goes to sign-in first. Tutorials open their template (`{"template": "tutorial-…"}`).

### Keeping it true

- **Entries are named blocks.** `::: fn sum-by`, `::: event dblclick`, `::: op split`, `::: route GET /api/docs/:id`,
  `::: tool edgy_read`, `::: style pad`, `::: format currency`, `::: token accent`, `::: key undo`,
  `::: template quote`, and a page per kind (`cells/<kind>.md`). The heading and the facts that live in code
  (signature and group, the access a route needs, a tool's parameters, an event's data, a shortcut's keys)
  are rendered from the code; the prose is written by hand.
- **`::ref <list>`** renders a table generated from the code (every function, event, route…) linking to the
  entries. Nothing listed in code is copied by hand.
- **Tests** (`site/tests/`, in `npm test`): coverage (every item in each code list has its entry, and no
  entry names something that doesn't exist), doc-tests (every ```` ```sx ```` block with `⇒` results is
  evaluated — with `in=<example>` it runs against that example's document through `react`, the way the
  browser runs a click; every notation and live block builds; every ```` ```ops ```` block applies), the link
  check over a fresh build, and the look test (no gradient, `backdrop-filter`, `text-shadow` or SVG filter).
- **New exports, no behaviour change**: `OP_VERBS` in `ops.ts` (and its error message uses it), the MCP tools
  defined in `src/mcp/tools.ts` (`server.ts` only connects), `SHORTCUTS` in `src/web/shortcuts.ts` (every
  shortcut the handlers implement; README's table comes from the same list), `FORMATS` in `sx.ts`.
- **Screenshots and clips** are made by `site/scripts/shoot.mjs` from a fresh server (templates and seeded
  `@example.test` accounts) into `site/shots/` (WebP, light and dark) and `site/clips/` (WebM and a poster,
  encoded with ffmpeg). The numbered marks on annotated screenshots are measured from the real elements by
  the same script, so they move with the UI.

### Other choices

- **Theme**: the docs use the app's own key, `localStorage['edgy.theme']`, with an inline script in the head
  so there is no flash. In the app the docs open in the person's theme and the docs' toggle changes the app's
  too (one preference); deployed alone nothing is stored until the toggle is used, so they follow the system.
- **Accessibility check**: axe-core (new dev dependency, verification only), injected into each page by the
  crawl script, both themes. Touch targets: every control and navigation link is at least 40px tall on a
  phone; links inside running prose are exempt, as in WCAG 2.5.8.
- **Clips**: WebM, muted, looping, with a poster; they play only when on screen and never under reduced motion.
- **Source links**: `https://github.com/Narcis13/edgy/blob/main/<path>`. One version, describing `main`.
- **Docs links in the app** open the docs in a new tab, so a document being edited stays where it is.

## Blocked

- *(none)*

## Notes

- Git Bash rewrites arguments that look like paths: `/edgy-docs/` becomes `C:/Program Files/Git/edgy-docs/`. Run the static server with `MSYS_NO_PATHCONV=1` from Git Bash (npm scripts are fine).
- Some files are CRLF in the working tree (autocrlf). Scripted edits must normalise `
` first, or use the Edit tool.
- Shell state does not persist: export `TMPDIR` (the scratchpad) and `CHROME` in every command that needs them.
- Never write fix scripts as Bash heredocs with backslashes: the escapes get eaten. Use the Write tool for scripts, or the Edit tool.
- No git identity is configured on this machine: commit with `git -c user.name="Narcis Brindusescu" -c user.email="narcis75@gmail.com" commit …` (the repo's author).
- `site/tests/docs.test.ts` (coverage, doc-tests, links, look) is not in `npm test` yet: it fails until every page in site/nav.ts is written. It joins the glob at the end of milestone 5.
- The app's own CSS (gradients for dot and line patterns, the studio's backdrop blur) is in the live runtime's stylesheet, which only the example iframes load; the look test checks the docs' CSS and diagrams.

## Log

- 2026-10-11: baseline at `8d674e4`: gates pass (typecheck, 248 tests, app + offline build, no chunk warning). Brief 3's PROGRESS.md moved to `docs/progress/2026-10-10-accounts.md`.
- 2026-10-11: milestones 1 and 3: `site/` (build, Markdown blocks, catalog from code, layout, search, live runtime in an iframe, tests), `/docs/` served by the server (signed out too; 301 without the slash; 404 page), Docs links (Shell, editor header, More menu), the panel links each kind's page, the code studio's Functions list links each function. New exports: OP_VERBS, FORMATS, SHORTCUTS, MCP TOOLS (src/mcp/tools.ts). Catalog counts: kind 24, fn 111, event 9, op 15, route 64, tool 14, style 21, format 10, token 16, key 59, template 8. Live example verified in the browser pane on a static server under /edgy-docs/ (typing 4 → $50.00). Gates pass, 248 tests.
- 2026-10-11: milestone 5: 13 writer agents wrote 118 pages (site/WRITERS.md); every page checked with site/scripts/check.ts. Docs tests: coverage complete (kind 24, fn 111, event 9, op 15, route 64, tool 14, style 21, format 10, token 16, key 59, template 18); doc-tests 276 expression blocks with 681 stated results, 175 documents, 29 ops blocks, all pass; links fail only on screenshots not made yet. Fixes from the writers' reports: duplicate shortcut id (diagram-label), library-describe, table-edit and type wording, ::ref pages with commas, doc-test records leaking between blocks, the kind facts box now lists the / menu entries from KIND_OPTIONS, tutorial templates in the template tests, edgy_create's template list. Static checks (docs/showcase/docs-site/evidence.mjs static): live code loads only near the screen; input→formula, button, tab, checkbox handler; search for sum-by, accordion, dblclick, undo, a body-only phrase and an empty state, by keyboard; theme; drawer by keyboard. Print forced light tokens (was dark text on white). Weight: heaviest text page agents/http 32 KB gzipped; search index 291 KB gzipped, loaded on first search.
- 2026-10-11: milestone 8 (review): a fresh reviewer per section (site/REVIEWERS.md) checked every page against the code; wrong or misleading claims found / fixed: Getting started + tutorials + templates 16 pages 22/22; cells 25 pages 33/33; editor + keyboard 13 pages 16/16; language 15 pages 21/21; events, data, styling 11 pages 12/12; library + people 9 pages 14/14; agents 5 pages 28/28; under the hood 16 pages 17/17; contributing, troubleshooting, glossary, home, A–Z 8 pages 18/18. Total 118 pages, 181 found, 181 fixed. Also from the reviews: a missing shortcut (table-resize), the op-life diagram's reset label, a test that the app's links into the docs land.
- 2026-10-11: shots and clips committed (2b6bf12); docs tests in npm test (257 tests pass); full crawl: 0 problems besides missing clips (now made) and callout-label contrast (fixed); in-app evidence all PASS (Docs links in home/data/profile/document and the phone More menu, panel and code-studio links, signed-out /docs/ with no /api requests, theme from the app); contact sheets found route links written with a space left as raw text (77 links): fixed in the renderer, and a test now fails on any link left as text.
