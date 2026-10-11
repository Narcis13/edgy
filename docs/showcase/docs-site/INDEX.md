# Docs site evidence (brief 5)

The showcase for this brief is the site itself (`site/`, built by `npm run docs:build`) and the ten
tutorial documents (`src/core/tutorials.ts`). Everything here is made by scripts from a fresh state:

| script | what it makes |
| --- | --- |
| `bash docs/showcase/docs-site/shoot.sh` | `build.txt`, `static.txt`, the `live-*`, `search-*`, `theme-*`, `drawer-*`, `print-*`, `app-*` and `look-*` files, `live.txt`, `search.txt`, `theme.txt`, `drawer.txt`, `print.txt`, `app.txt` |
| `bash docs/showcase/docs-site/shoot.sh --pictures` | also the docs' own screenshots and clips (`site/shots/`, `site/clips/`, via `site/scripts/shoot.mjs`) |
| `bash docs/showcase/docs-site/tutorials/replay.sh` | `tutorials/<name>-replayed.png`, `-template.png`, `-side-by-side.png`, `tutorials/replay.txt` |
| `npm test` | coverage, doc-tests, links, look (`site/tests/docs.test.ts`); counts printed in the run |

## Contract → evidence

| # | criterion | evidence |
| --- | --- | --- |
| B1 | Static build under a sub-path, no edgy server: every page opens, links work, search works, live examples run, no request leaves the folder; size and page count | `build.txt` (pages, size, link check of the built folder, external links), `static.txt` (every page × 3 sizes × 2 themes, requests outside the folder counted as problems, live examples started), `search.txt`, `live.txt` |
| B2 | The app serves `/docs/` signed in and out with no `/api` route opened; Docs link in every header and the phone's More menu | `app.txt`, `app-docs-signed-out.png`, `app-docs-signed-in.png`, `app-header-home.png`, `app-header-data.png`, `app-header-profile.png`, `app-header-document.png`, `app-more-menu.png`; the route-table test in `src/server/accounts.test.ts` |
| B3 | Coverage of every list in code; an undocumented function fails it | `npm test` output (`coverage: kind 24, fn 111, …`), `demo-undocumented.txt` |
| B4 | Doc-tests | `npm test` output (`doc-tests: … stated results …`) |
| B5 | Link check, external links listed | `npm test` (links), `build.txt` |
| B6 | Each tutorial done for real, side by side with its template; each opens as a template | `tutorials/replay.txt`, `tutorials/*-side-by-side.png`; the `::: template tutorial-*` entries in `site/content/library/templates.md` (Open in edgy) |
| B7 | Live examples without a server; nothing loads before an example is near | `live.txt`, `live-input.png`, `live-button.png`, `live-tabs.png`, `live-checkbox.png` |
| B8 | Search: `sum-by`, `accordion`, `dblclick`, `undo`, a body-only phrase, an empty state, by keyboard; index size | `search.txt`, `search-*.png` |
| B9 | Every page at 1440×900, 820×1180, 390×844, light and dark, read | `static.txt` (0 problems: overflow, clipped text, 40px targets, headings, alt text, console); contact sheets read page by page (PROGRESS.md Log) |
| B10 | Tokens from `src/web/styles.css`; no gradient, blur, text shadow or SVG filter; app and docs homes side by side | `demo-accent.txt`, `demo-accent-changed.png`, `npm test` (look), `look-light.png`, `look-dark.png` |
| B11 | Theme: the app's choice in the app, the system's alone, a remembered toggle | `theme.txt`, `theme-system-dark.png`, `theme-toggled-light.png`, `app.txt`, `theme-from-app-dark.png` |
| B12 | Accessibility: axe finds nothing serious or critical; drawer by keyboard and Esc | `static.txt` (axe on every page, desktop and phone, both themes), `drawer.txt`, `drawer-open.png`, `drawer-closed.png` |
| B13 | Weight under 100 KB per text page, fonts self-hosted and subset | `build.txt` (weight) |
| B14 | Clean paper | `print.txt`, `print-cells-table.pdf`, `print-internals-session.pdf` |
| B15 | One script for every picture; two runs give the same set | `site/scripts/shoot.mjs`; PROGRESS.md Log (only the six clip videos change between runs) |
| B16 | Every section reviewed against the code | PROGRESS.md Log (181 wrong claims found and fixed across 118 pages); the briefs the writers and reviewers worked from: `writers-brief.md`, `reviewers-brief.md` |
| C3 | The panel and the code studio link into the docs | `app.txt`, `app-designer.png`, `app-hint.png` |
