---
title: Contributing
---

This page is a map of the edgy repository: what lives in each folder, which rules the code follows, and where to read next when you want to change something.

To run edgy on your machine first, see [Install and run](/start/install/). To understand the design before you touch it, read [Under the hood](/internals/).

## The layout

```text
src/core      the model and the language: no dependencies, no browser, no server
src/server    the HTTP API, storage, live events, timers and fetches, sync
src/mcp       the MCP server agents connect to
src/web       the React app
site/         these docs
docs/         records of finished work, and the evidence for it
scripts/      small tools for development
.claude/goal-loop/, goal-loop/   the verification loop
```

Three layers depend on each other in one direction only. `src/core` imports nothing from the others. `src/server` and `src/web` import `src/core`, and never each other. `src/mcp` talks to the server over HTTP and imports nothing from it. That is why the same code can run in the server, in your browser and inside an exported file.

### src/core

The model and the language. Plain TypeScript on plain JSON, so everything can be saved, sent and replayed.

| File | What it holds |
| --- | --- |
| [types.ts](src:src/core/types.ts) | The model in one place: `Cell`, `Doc`, `Op`, and the list of kinds. |
| [tree.ts](src:src/core/tree.ts) | Reading and rewriting the cell tree. Cells are never changed in place: a change copies the path from the root and shares the rest. |
| [ops.ts](src:src/core/ops.ts) | The ops, each applied by a pure function that also returns its inverse. See [Ops](/internals/ops/). |
| [notation.ts](src:src/core/notation.ts) | Cells written as JSON lists, and the checks on names, styles and handlers. See [Notation](/agents/notation/). |
| [sx.ts](src:src/core/sx.ts) | The expression language: reader, printer, interpreter, the built-in functions and the formats. |
| [engine.ts](src:src/core/engine.ts) | Works out every cell's value, style and visibility, and which cells each one reads. |
| [events.ts](src:src/core/events.ts) | Which events each kind raises, and `react`, which runs the handlers a change sets off. |
| [outline.ts](src:src/core/outline.ts) | The compact text view of a document that an agent reads. |
| [reference.ts](src:src/core/reference.ts) | The guide agents read before editing, and the source of the function reference in the code studio. |
| [templates.ts](src:src/core/templates.ts), [tutorials.ts](src:src/core/tutorials.ts) | The starting documents, and the documents the tutorials end with. |
| [library.ts](src:src/core/library.ts) | What a document's card shows, what search reads, how the library is arranged. |
| [table.ts](src:src/core/table.ts), [containers.ts](src:src/core/containers.ts), [diagram.ts](src:src/core/diagram.ts), [duration.ts](src:src/core/duration.ts) | What one kind needs that the engine and the renderer share. |
| [fonts.ts](src:src/core/fonts.ts), [offline.ts](src:src/core/offline.ts) | The typefaces, and what an exported file carries. |

### src/server

A Hono app on Node. Every route is in [app.ts](src:src/server/app.ts).

| File | What it holds |
| --- | --- |
| [index.ts](src:src/server/index.ts) | Start-up: port, host, mode, the data folder, sync, the built app. |
| [access.ts](src:src/server/access.ts) | Who may do what. Every route declares what it needs. See [Access](/internals/access/). |
| [auth.ts](src:src/server/auth.ts) | Passwords, sessions and API keys, and slowing down repeated failures. |
| [store.ts](src:src/server/store.ts) | One SQLite file, every payload a JSON column. See [Storage](/internals/storage/). |
| [hub.ts](src:src/server/hub.ts) | Fan-out of live events to everyone watching a document. |
| [runner.ts](src:src/server/runner.ts) | Timers, fetch cells and the handlers they set off, while someone has the document open in Live. See [The runner](/internals/runner/). |
| [sync.ts](src:src/server/sync.ts), [cloud.ts](src:src/server/cloud.ts) | The local file and the cloud log. See [Sync](/internals/sync/). |
| [compose.ts](src:src/server/compose.ts) | **Ask AI**: a sentence to code, checked against the document. |
| [export.ts](src:src/server/export.ts) | A document or a deck as one `.html` file. See [Export](/internals/export/). |
| [docs.ts](src:src/server/docs.ts) | Serves these docs at `/docs/`. |

### src/mcp

[tools.ts](src:src/mcp/tools.ts) registers the tools in a list, `TOOLS`, that the docs read; [server.ts](src:src/mcp/server.ts) connects them over standard input and output. Every tool calls the HTTP API with the person's API key, so a person watching a document sees each change land. See [MCP](/agents/mcp/).

### src/web

The React app. The files at the top are shared by everything:

| File | What it holds |
| --- | --- |
| [main.tsx](src:src/web/main.tsx), [App.tsx](src:src/web/App.tsx) | The entry, and the page for each address, with the gate that asks who is signed in. |
| [session.ts](src:src/web/session.ts) | One open document: the copy people edit, the ops on their way to the server, the stream from everyone else, undo, selection. See [The session](/internals/session/). |
| [shortcuts.ts](src:src/web/shortcuts.ts) | Every keyboard shortcut, in one list. |
| [styles.css](src:src/web/styles.css) | The colour tokens for both themes, and the styles everything shares. |
| [docsLinks.ts](src:src/web/docsLinks.ts) | Where the app links into these docs. |

| Folder | What it holds |
| --- | --- |
| `editor/` | The editor: the document on screen (`CellView`), the `/` menu (`KindMenu`), the formula bar, **Activity**, Live. |
| `editor/inspector/` | **Cell details**: a designer per kind, and the text, spacing and box sections. |
| `kinds/` | The renderers of the richer kinds: list, table, calendar, canvas, stat, diagram, containers, timer and fetch. |
| `code/` | The code editor, the code studio, **Blocks** and **Ask AI**. |
| `print/` | Page setup, the **Page** view and pagination. |
| `pages/` | The library (home page, with `pages/library/`), the **Data** page and the minimap. |
| `account/`, `share/`, `sync/` | Sign-in and the profile, the **Share** dialog and share-link page, the sync badge. |
| `decks/`, `play/` | A deck's page, and Play. |
| `lib/` | How the app reaches the server (`api.ts`, `transport.ts`) and a small store. |
| `offline/` | The app as it runs inside an exported file. |

### The rest

- `site/` holds these docs: the pages, the build, the tests. See [Writing the docs](/contributing/docs/).
- `docs/progress/` keeps the working notes of each finished piece of work, by date. `docs/showcase/` keeps the evidence that came with it: screenshots, PDFs and the scripts that remake them from a fresh server.
- `scripts/` holds `dev.mjs`, which `npm run dev` runs to start the API and the web app together, and `seed-library.mjs`, which fills a running edgy with many documents.
- `.claude/goal-loop/` holds edgy's facts for the verification loop: `project.md`, `gates`, `screens` and `serve.sh`. `goal-loop/` is the loop itself, a skill that works in any repository; `.claude/skills/goal-loop` links to it. See [Gates and tests](/contributing/gates/#verifying-in-a-real-browser).
- At the root: `package.json`, `vite.config.ts` for the app, `vite.offline.config.ts` for the offline bundle exports are made from, `index.html`, `public/`, `README.md`, and `.mcp.json`, which starts the MCP server for Claude Code. `PROGRESS.md` is the loop's working memory and `FEATURES_PROMPTS.md` holds the briefs it was given.

## Conventions

- **TypeScript, strict.** `tsconfig.json` sets `strict` and covers `src`, `site` and `vite.config.ts`. The type check is the style gate: `package.json` has no linter or formatter.
- **React 19**, function components. The state of an open document lives in [session.ts](src:src/web/session.ts) and components read slices of it with `useS`; there is no state library.
- **Everything is JSON.** A document, an op, a cell's notation and a stored expression are plain data. Nothing in the model is a class instance or a function, so it can be saved, sent and replayed.
- **Changes are ops.** Code that changes a document builds an op and applies it; it does not edit the tree.
- **No new dependencies without a reason.** The app has a short list of them, and `src/core` has none. When you add one, write the reason under **Decisions** in `PROGRESS.md`, as the docs did for `marked`: small, no dependencies of its own, used at build time only.
- **Tests sit next to the code** as `*.test.ts`, written with Node's test runner. See [Gates and tests](/contributing/gates/).
- **Plain prose**, in the UI, the docs and the comments: concrete, no marketing words. Most files open with a comment saying what the file is for.
- **Commits** have a short title and a bulleted body written from the user's side: what a person can now do.
- **Node 22.13 or newer**, because storage uses `node:sqlite`.

## Where to read next

::ref pages contributing/gates/,contributing/checklists/,contributing/docs/
