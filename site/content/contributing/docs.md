---
title: Writing the docs
nav: The docs
---

This page explains how these docs are built, the format every page is written in, and the style they follow, so a change to edgy can come with its page.

## How the site is built

The docs live in `site/`, apart from `docs/` (which holds progress records and evidence):

| Folder | What it holds |
| --- | --- |
| `site/content/` | The pages, in Markdown. The folder is the URL: `cells/table.md` is `/docs/cells/table/`. |
| `site/nav.ts` | The order of the pages: three paths (Learn, Reference, Under the hood), their sections and pages. |
| `site/build/` | The build: reading the pages, the blocks below, the lists taken from the code, the layout, search. |
| `site/client/` | What runs in the browser: search, the drawer, the theme switch, copy buttons, live examples. |
| `site/styles/docs.css` | The look. Its colours are the app's tokens, copied from `src/web/styles.css` at build time. |
| `site/diagrams/` | The diagrams, drawn as SVG in TSX with the pieces in `kit.tsx`. |
| `site/shots/`, `site/clips/` | Screenshots and clips, made by `site/scripts/shoot.mjs` from a fresh server. Never edit them by hand. |
| `site/tests/` | Coverage, doc-tests, the link check and the look test. They run in `npm test`. |

`npm run docs:build` writes `dist/docs/`: a folder per page with an `index.html`, and the shared files under `_/`. Every link is relative, so the folder works at `/docs/` in the app and at any path on a static host. `npm run docs:preview` serves it the way a static host would, at `http://127.0.0.1:4174/edgy-docs/`. `npm run build` builds the docs with the app, and the app serves them at `/docs/` (src:src/server/docs.ts). In development the server builds them once, on the first visit; restart it to see a change.

## A page

A page is a Markdown file with a short front matter:

```text
---
title: Table
nav: Table
---

A table cell shows a list of records as rows and columns you can sort, search and pick from.
```

- `title` is the page's heading. `nav` is an optional shorter name for the sidebar and for previous and next.
- The first paragraph says what the page covers, in its first sentence. That sentence becomes the page's description, the line under its name in section lists, and its search snippet. A test checks it is there.
- Headings start at `##`; the title is the only `#`. Don't skip a level.
- Add the page to `site/nav.ts` in the place a reader meets it. A test checks every page is listed once.

## Building blocks

### Links

| Write | Goes to |
| --- | --- |
| `[the table](kind:table)` | a kind's page |
| `[sum-by](fn:sum-by)` | a function's entry |
| `[click](event:click)`, `[split](op:split)`, `[edgy_read](tool:edgy_read)` | an event, op or MCP tool |
| `[route](route:GET /api/docs/:id)` | an HTTP route |
| `[pad](style:pad)`, `[currency](format:currency)`, `[accent](token:accent)`, `[undo](key:undo)`, `[Quote](template:quote)` | a style key, format, colour token, shortcut or template |
| `[cell](term:cell)` | a word in the glossary |
| `[Events](/events/)`, `[pick](/events/reference/#event-pick)` | a page, from the docs' root |
| `[ops.ts](src:src/core/ops.ts)` | a file on GitHub, on `main` |

Links to entries go wherever the entry is, so moving an entry to another page breaks nothing. The build fails on a link to an entry or page that doesn't exist.

### Entries

Everything the code lists (kinds, functions, events, ops, routes, MCP tools, style keys, formats, colour tokens, shortcuts, templates) has one entry in the docs. An entry is a named block; its heading and the facts that live in the code are generated, and you write what a reader needs to know:

```text
::: fn sum-by
Adds up an expression over every item of a list: `it` is the item.

…an example and its result…
:::
```

The types are `fn`, `event`, `op`, `route`, `tool`, `style`, `format`, `token`, `key` and `template`. A kind has a page instead: `site/content/cells/<kind>.md`. The coverage test fails when something in the code has no entry, and the build fails when an entry names something the code doesn't have.

An entry's heading is one level below the heading above it. Function entries go on their group's page (`language/functions/<group>.md`): the code studio links there.

### Generated lists

`::ref <list>` puts a table made from the code: `functions` (or `functions Math`), `kinds`, `kind <kind>` (the facts box at the top of a kind's page), `events`, `events-of <kind>`, `ops`, `routes`, `tools`, `style-keys`, `formats`, `tokens`, `fonts`, `shortcuts` (or `shortcuts editor`), `templates`, and `pages a/,b/` (a list of pages with their first sentences). Never copy one of these lists by hand.

### Expressions and their results

````text
```sx
(sum-by (get it "total") (list {total 2} {total 3}))
⇒ 5
```
````

An `sx` block is coloured the way the code studio colours it. A line starting with `⇒` gives the result of the expression above it; a block with results (or with `in=`) is a doc-test, a block with neither is only shown, and the test fails when edgy gives anything else. Write results the way the language writes values: `5`, `"text"`, `true`, `nil`, `(list 1 2)`, `{total 5}`. To show an error, write `⇒ error: ` and words from the message.

`in=<id>` runs the block against the document of a `live` or `notation` block with that id on the same page. An action (`set!`, `insert!`, …) runs the way a click runs it, handlers included, and the lines after it see what it changed:

````text
```sx in=counter
(set! count (+ count 1))
count
⇒ 1
```
````

Examples run on 11 October 2026 at 09:00 UTC, so `(today)` is `"2026-10-11"`.

### Documents

````text
```live id=counter title="A counter" height=120
["row",
  ["button", {"do": ["set!", "count", ["+", "$count", 1]]}, "Add one"],
  ["formula", {"name": "count"}, 0]]
```
````

A `live` block is a real edgy document running in the page, in Live: the reader can type, tick and press. It loads only when it comes near the screen and runs in the reader's browser only; records it saves stay in memory, and the page says so. The body is notation, or `{"root": …, "meta": {…}, "data": {"orders": [ … ]}}` to give it settings and sample records; `template=<id>` runs a template instead. `height` is a first guess in pixels; the example then takes the height it needs. When the docs are served by the app, an **Open in edgy** button makes it a document of the reader's own.

Timers don't tick and fetch cells can't reach the network in an example: those need the server. Show them with a `notation` block and a screenshot.

A `notation` block shows notation and is checked to build; an `ops` block (a JSON list of ops) with `in=<id>` is checked to apply to that document.

### Pictures

- `::shot <name> "Caption"`: a screenshot of the real app, in the reader's theme, with numbered marks and their legend under it. The names and what each shows are listed in `site/scripts/shots.mjs`; add one there and run the script, never paste a picture in.
- `::clip <name> "Caption"`: a short loop where motion is the point (splitting a cell, drawing an arrow, playing a deck). It plays while on screen, never under reduced motion.
- `::diagram <name>`: an SVG diagram from `site/diagrams/`. Draw with the pieces in `kit.tsx`: one stroke weight, real text, colours only through the theme's variables, a title and a description. A colour in a diagram means something, and the description says what.

### Callouts

```text
> [!NOTE]
> Something worth knowing that the paragraph around it doesn't say.
```

`[!TIP]` is a better way to do something; `[!WARNING]` is something that loses work or surprises people. Use them rarely: a page with a callout in every section has none.

## How the docs are written

The voice is the app's: plain, concrete, second person, short sentences.

- **Say what happens.** "The total changes as you type" beats "edgy provides real-time recalculation".
- **Use the UI's exact labels**, in bold: **Live**, **Share…**, **Cell details**. Keys as they are printed: ⌘Z (Ctrl+Z elsewhere).
- **One word for one thing**, the glossary's word. A *cell* is never a block, a widget or an element (an *element* is a shape in a diagram). A *document* is never a page or a sheet (a *page* is paper). *Records* live in *collections*.
- **Show, then explain.** An example first, its result, then why.
- **No marketing voice**: no "simply", "just", "powerful", "seamless", "easily", no exclamation marks, no emoji.
- **Short paragraphs**, about 70 characters to a line on screen, one idea each. Lists for steps and for choices; tables for facts that line up.
- **Name the source** on Under the hood pages: every page says which files it describes and links them with `src:`.
- **Usual mistakes** on a kind's page come from what people actually do wrong, with the message they see.

Every name in an example is an example name (Ada, Northwind Studio, `ana@example.test`). Never a real person's details, and never a token, key or password.

## Checks that keep the docs true

`npm test` runs `site/tests/docs.test.ts`:

- **Coverage**: every kind, function (`builtinNames` in `sx.ts`), event (`KIND_EVENTS`, `DOC_EVENTS`), op (`OP_VERBS`), API route (the app's route table), MCP tool (`TOOLS`), style key, format, colour token, shortcut (`SHORTCUTS` in `src/web/shortcuts.ts`) and template has its entry.
- **Doc-tests**: every `sx` result is what edgy gives, every `live` and `notation` block builds, every `ops` block applies.
- **Links**: every link and anchor in the site exists.
- **Look**: no gradient, backdrop blur, text shadow or SVG filter in the docs' CSS and diagrams.

When you add something to edgy, the test tells you which entry it needs. [Adding things](/contributing/checklists/) lists every other place each kind of change touches.
