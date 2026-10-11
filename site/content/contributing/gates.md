---
title: Gates and tests
---

This page lists the checks a change to edgy has to pass, the commands that run them, how to run one test on its own, and how to look at a change in a real browser before you call it done.

There are three gates. All three must pass before a change is finished.

| Gate | Command | What it catches |
| --- | --- | --- |
| Types | `npm run typecheck` | A wrong type anywhere in `src`, `site` or `vite.config.ts`. |
| Tests | `npm test` | A behaviour that changed. |
| Build | `npm run build` | Something that works in development but not in the bundle. |

## Types

```text
npm run typecheck
```

This runs `tsc --noEmit`. The project is strict TypeScript, and there is no linter or formatter: the type check is the style gate.

## Tests

```text
npm test
```

The tests use Node's own runner (`node:test` with `node:assert`), run through tsx so they can be written in TypeScript. A test sits next to the file it tests and is named `<thing>.test.ts`. The model for a new one is [core.test.ts](src:src/core/core.test.ts).

The `test` script in [package.json](src:package.json) does not look for tests everywhere. It lists the folders to run, one glob each:

```text
src/core/*.test.ts            src/web/editor/*.test.ts
src/server/*.test.ts          src/web/editor/inspector/*.test.ts
src/web/print/*.test.ts       src/web/play/*.test.ts
src/web/kinds/*.test.ts       src/web/pages/library/*.test.ts
src/web/code/*.test.ts        src/web/account/*.test.ts
```

> [!WARNING]
> A test file in a folder that has no glob does not run, and nothing says so. When you add a test in a new folder, add its glob to the `test` script, then check that the number of tests the run prints went up. `src/web/editor/*.test.ts` does not reach `inspector/`, which is why that folder has a glob of its own.

### Running one file, or one test

Run the file by name, with the same command the script uses:

```text
npx tsx --disable-warning=ExperimentalWarning --test src/core/events.test.ts
```

Add `--test-name-pattern` to run the tests whose name contains some words:

```text
npx tsx --disable-warning=ExperimentalWarning --test --test-name-pattern="each kind declares" src/core/events.test.ts
```

Test names are plain sentences saying what is true, such as *every op can be undone*, so a failure reads as a sentence too.

### What the tests cover

| Folder | What its tests check |
| --- | --- |
| `src/core/` | The language, the ops and their inverses, notation, the engine, events, the library's search and arrangement. |
| `src/server/` | The API end to end through the app's own `request` (no port opened): accounts, access, sync against a local stand-in for the cloud, the runner with a fake clock, export, Ask AI with `fetch` replaced. |
| `src/web/` | The pure parts of the app: pagination, the editor's helpers, the code editor's lexer and edits, the table, the calendar and the stat. The components themselves are looked at in a browser, see below. |

## Build

```text
npm run build
```

This runs three builds, one after the other:

1. `vite build` writes the app to `dist/`.
2. `vite build -c vite.offline.config.ts` writes the offline bundle to `dist/offline/`: one script, one stylesheet and the fonts, which an export wraps around a document.
3. `npm run docs:build` writes these docs to `dist/docs/`.

`npm start` then serves all of it from one process. The build must finish without errors. A Vite warning that chunks are larger than expected is a finding too: lazy-load the heavy part the way [App.tsx](src:src/web/App.tsx) loads the editor.

## The docs' tests

The docs have their own tests in [docs.test.ts](src:site/tests/docs.test.ts). They check, in order:

- **Build.** Every page builds without a problem, is listed once in `site/nav.ts`, and opens with a sentence saying what it covers.
- **Coverage.** Everything the code lists has its entry: every kind, function, event, op, API route, MCP tool, style key, format, colour token, shortcut and template. The test names each one that is missing, and each entry that names something the code no longer has.
- **Doc-tests.** Every `sx` result on a page is what edgy gives, every `live` and `notation` block builds, every `ops` block applies.
- **Links.** Every link and anchor between pages exists.
- **Look.** No gradient, backdrop blur, text shadow or SVG filter in the docs' styles and diagrams, and the docs use the app's colour tokens.

They are not among the globs above, so run them by name:

```text
npx tsx --disable-warning=ExperimentalWarning --test site/tests/docs.test.ts
```

While you write a page, check only that page and its neighbours:

```text
npx tsx site/scripts/check.ts contributing/ troubleshooting
```

It prints the problems on the pages whose address starts with each word you give, and runs their examples. A link to a page or entry that is planned but not written yet is counted as pending, not as a problem. The command ends with the number of problems, which must be 0.

When a change adds something the docs list, [Adding things](/contributing/checklists/) names every place it touches, the docs entry included.

## The route table

[accounts.test.ts](src:src/server/accounts.test.ts) holds two tests that walk every `/api` route of the real app:

- **The route table.** Each route must say what it needs, with `need(…)` before its handler, and only the routes in `PUBLIC` in [access.ts](src:src/server/access.ts) may need nothing. A route without it fails with *must say what it needs (need(…) before its handler)*. Then every route that is not public is called with no one signed in, and must answer 401 with *sign in first*.
- **A stranger.** A second person calls every route that names a document, a deck or a collection reached through a document, and must be refused with 404, as if the document did not exist.

The docs read the same table to list the routes, so a new route needs an entry too. See [a route](/contributing/checklists/#a-route).

## Verifying in a real browser

Passing tests do not show that a screen looks right. edgy keeps a small loop for that in `.claude/goal-loop/`, built on the scripts in `goal-loop/scripts/`:

```text
S=goal-loop/scripts
P=.claude/goal-loop
$S/gates.sh                              # typecheck, test and build, one PASS or FAIL line each
$P/serve.sh fresh 8791 "$TMPDIR/data"    # build, empty data, a production server on one port
export CDP_COOKIE="$($P/serve.sh session 8791)"
$S/sweep.sh http://127.0.0.1:8791 "$TMPDIR/sweep" <document-id>
$P/serve.sh stop 8791
```

Run them from Git Bash on Windows. The pieces:

- **`gates`** lists the three gates as commands for `gates.sh`. The build gate writes into the log folder, so it never touches `dist/` or a server that is running. It prints the test counts, and marks a Vite chunk warning as a finding.
- **`serve.sh`** builds the app, the offline bundle and the docs, and starts a production server on its own port with its own data. It runs in accounts mode, so you sign in; `serve.sh session` signs up a test account and prints the cookie. Sync is off. Use port 8791, or 8792 and up for a second server. Never use `data/edgy.db`, and never stop a dev server someone has open on 5173 or 8787. It is a production build with no hot reload: run `fresh` again after every code change.
- **`screens`** lists what `sweep.sh` shoots: the sign-in pages signed out, the library, **Data** and profile, and for each document you name **Edit**, **Live** and **Page** at 1440 by 900, **Live** and **Page** on a 390 by 844 phone, and the printed PDF. It reports the problems it finds on each screen and exits non-zero if there are any. Add a line there when your change adds a screen.
- **`cdp.mjs`** shoots one screen or one interaction, with a script run in the page. It exits with 3 when the page logged a console error or warning, threw, or made a request that failed or answered 400 or more. A change is not done until that is zero. On Windows set `CHROME` to the path of `chrome.exe` first.

Timers and fetch cells run on the server only while a browser has the document open in **Live**, so open it with `?view=live` when a screenshot has to show them ticking. The rest of the loop's facts (URLs, the HTTP calls that create documents, viewports to cover, print checks) are in `.claude/goal-loop/project.md`.
