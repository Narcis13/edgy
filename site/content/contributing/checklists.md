---
title: Adding things
---

This page lists, for each thing you can add to edgy, every place the change touches, so you meet the place you missed here and not in review.

Each list was made by searching the code for an example that already exists and reading every hit. Do the same when your change is not on this page: search for the thing most like yours, for instance `grep -rn "calendar" src site`, and walk every result.

For everything the docs list (kinds, functions, events, ops, routes, MCP tools, style keys, formats, colour tokens, shortcuts, templates), the last step of each list is its docs entry. You do not have to remember it: the docs' coverage test fails and names what is missing, for example:

```text
kind calendar: no page site/content/cells/calendar.md
fn pmt: no "::: fn pmt" entry
```

An entry goes next to the other entries of its type, so open the page that holds them and copy one. The format of an entry is in [Writing the docs](/contributing/docs/#entries). Run the test as [Gates and tests](/contributing/gates/#the-docs-tests) says.

## A kind

The example is [calendar](kind:calendar), a leaf kind with a value (the day picked), a code prop (its events), a plain prop (`week`) and events. A kind that holds other cells (a group kind) goes in `GROUP_KINDS` instead and touches more: also read [containers.ts](src:src/core/containers.ts) and the `tabs` entries.

### The model and the language

- [types.ts](src:src/core/types.ts): add the name to `LEAF_KINDS`. Add each prop the kind has to `Cell`, with a comment saying what it means (`week`).
- [notation.ts](src:src/core/notation.ts): if the body of the cell in notation is one of its props, say which in `BODY` (a calendar's body is its events, `expr`). Add each new prop to `PROPS`; that is what lets notation carry it and the `set` op change it.
- [ops.ts](src:src/core/ops.ts): nothing for a calendar, whose props are plain. Add a check in `set` when a value needs one, as `size`, `text`, `title` and `url` have.
- [engine.ts](src:src/core/engine.ts): in `compute`, what the kind's value is (the day picked). Where the cell's other props are worked out, add those that are expressions (a calendar's events).
- [outline.ts](src:src/core/outline.ts): the line an agent reads for the kind (`events … picked …`).
- [events.ts](src:src/core/events.ts): its entry in `KIND_EVENTS`. See [an event](#an-event).
- [library.ts](src:src/core/library.ts): add each prop that holds code, layout or an address, and not words, to `NOT_TEXT`, so search in the library does not read it (`week`).
- [reference.ts](src:src/core/reference.ts): a line for the kind in the guide's *Cells, as notation*, and its events in the guide's *Events*. Agents read nothing else about it.

### The web app

- [CellView.tsx](src:src/web/editor/CellView.tsx): import the renderer and add a `case` for the kind in `Leaf`. Add the kind to `PRESSABLE` if a click on it should raise `click`.
- [kinds/Calendar.tsx](src:src/web/kinds/Calendar.tsx): the renderer. Keep what can be tested without a browser in its own file, as [month.ts](src:src/web/kinds/month.ts) does. Its styles go in [kinds.css](src:src/web/kinds/kinds.css).
- [styles.css](src:src/web/styles.css): if the kind needs room, add it to the `:is(.kind-table, .kind-chart, …)` rule in the phone layout, so it takes a line of its own sooner.
- [print.css](src:src/web/print/print.css): hide the controls for changing it from the printed page (`.kcal-nav`, `.kcal-today`), if it has any.
- [KindMenu.tsx](src:src/web/editor/KindMenu.tsx): an entry in `KIND_OPTIONS`, with its label, a hint, an icon and, for a preset, the `type` or `props` it starts with. This is the `/` menu.
- [session.ts](src:src/web/session.ts): in `setKind`, what a cell becomes when someone chooses the kind: what it keeps from the cell before (`label`, `value`) and what it starts with (one event for today).
- [FormulaBar.tsx](src:src/web/editor/FormulaBar.tsx): an example in `PLACEHOLDER` for a kind that holds code, and the `case` that shows its source.
- [code/store.ts](src:src/web/code/store.ts): in `codeProps`, which of its props are code. [code/Studio.tsx](src:src/web/code/Studio.tsx): the name the studio gives its main code (`Events`). [code/handlers.ts](src:src/web/code/handlers.ts): add the kind to `SETTABLE` if a handler can set its value.
- [Minimap.tsx](src:src/web/pages/Minimap.tsx) draws every kind as `mm-leaf <kind>`: give it a glyph in [styles.css](src:src/web/styles.css) (`.mm-leaf.calendar`), or it shows as a plain bordered block on library cards and in the minimap.

### Cell details

- [kinds/CalendarPanel.tsx](src:src/web/editor/inspector/kinds/CalendarPanel.tsx): the designer, one panel per kind.
- [kinds/Content.tsx](src:src/web/editor/inspector/kinds/Content.tsx): list the panel in `PANELS`. [kinds/EmptyPanel.tsx](src:src/web/editor/inspector/kinds/EmptyPanel.tsx): put the kind in one of the groups of the empty cell's picker.
- [about.ts](src:src/web/editor/inspector/about.ts): `KIND_ABOUT`, one sentence on what the cell is for. It shows in the panel and in the docs page's facts box.
- [ctx.ts](src:src/web/editor/ctx.ts): `KIND_LABEL`, the name people see. [code/info.tsx](src:src/web/code/info.tsx): `KIND_NAMES`, and an icon in `OWN_ICONS` for a kind the `/` menu has no icon for.
- [CellPanel.tsx](src:src/web/editor/inspector/CellPanel.tsx): add the kind to `NO_TEXT` or `NO_BOX` if it has no text or box settings to design.
- [shortcuts.ts](src:src/web/shortcuts.ts): its keys, if it has any. See [a shortcut](#a-shortcut).

### Tests

- [core.test.ts](src:src/core/core.test.ts): build the kind in notation, and check its value, what it reads and its line in the outline. The calendar's is *calendar, canvas, stat and break*.
- [events.test.ts](src:src/core/events.test.ts): a handler for each event it raises. The test *each kind declares its events in one place* already checks that the kind raises something and, if it raises a change event, that it says how (`watch`); it does not run a handler.
- [kinds.test.ts](src:src/web/kinds/kinds.test.ts): its pure helpers. If your test is in a folder `npm test` does not list, add the glob (see [Gates and tests](/contributing/gates/#tests)).

### The docs

- `site/content/cells/calendar.md`: the page. Copy the structure of [Button](kind:button): `::ref kind calendar` for the facts box, `::ref events-of calendar` for the events, a `live` example, the designer, the notation, usual mistakes.
- [nav.ts](src:site/nav.ts): add the page to the *Cells* section, under the group it belongs to.
- [shots.mjs](src:site/scripts/shots.mjs): add the kind to `KIND_DESIGNERS`, which gives it a `designer-calendar` screenshot to use with `::shot`. Make the pictures with `site/scripts/shoot.mjs`.
- The entries of what it brings: a shortcut, an event, a style key.
- [README.md](src:README.md): the sentence near the top that lists what a cell can hold.

## A function

The example is [pmt](fn:pmt).

- [sx.ts](src:src/core/sx.ts): a plain function is a property of `BUILTINS`, written `(args) => value`. A form that must not evaluate every argument first (`if`, `map`, `let`) is handled in the interpreter and named in `SPECIAL`. An action checks that it runs in one with `needEffects`. `ALIASES` gives a second name. The docs and the coverage test read `builtinNames()`.
- [reference.ts](src:src/core/reference.ts): a line in `FUNCTIONS` with its group, its name (names that share an explanation share a line, separated by spaces), `use`, an example call, and `does`. The guide agents read and the list in the code studio are made from it.
- [code/docs.ts](src:src/web/code/docs.ts): `EXTRA` for a name the reference does not list on a line of its own, and `USES` for the call shown and inserted for names that share a line.
- [code/lexer.ts](src:src/web/code/lexer.ts): `SPECIAL_FORMS`, and `ITERATORS` if its first argument is an expression over `it`. [code/edits.ts](src:src/web/code/edits.ts): the words **Blocks** shows for an iterator.
- [compose.ts](src:src/server/compose.ts): only if **Ask AI** should write calls to it; the composer has its own tables, so search it for a function like yours.
- [core.test.ts](src:src/core/core.test.ts): assert what a call gives, with `run('…')`. [code.test.ts](src:src/web/code/code.test.ts) checks signatures and inserted templates for names that share a line.
- The docs: a `::: fn pmt` entry on its group's page, `site/content/language/functions/<group>.md` (the group in lower case). The code studio links there, so it cannot go on another page. A name made of symbols gets a word in its anchor: `+` is `fn-plus`.

## An event

The example is [pick](event:pick), raised by a table.

- [events.ts](src:src/core/events.ts): add it to `raises` in the kind's entry of `KIND_EVENTS`, or to `DOC_EVENTS` for the document's own. It has a `name`, a `from` (a gesture, a change of value, the document's life, or the runner), and `data`, the sentence the docs and the studio show for what a handler finds bound. A name in `KIND_EVENTS` or `DOC_EVENTS` is taken: custom events cannot use it.
- Then say where it is raised, which depends on `from`:
  - **A change of value.** Add a `watch` to the kind: what is compared before and after (`read`), and the events the difference raises (`fire`). `react` runs it after every op, whoever made it. A test insists that a kind which raises a change-event says how.
  - **A gesture.** `click` and `dblclick` are raised for every cell by `usePointer` in [CellView.tsx](src:src/web/editor/CellView.tsx), through `session.pointer`. A kind that knows which part was hit says so with `markPart`, as [kinds/Diagram.tsx](src:src/web/kinds/Diagram.tsx) does for a shape. For a new gesture, `session.pointer` shows the way: it works out the data and calls `session.fire({ cell, name, data })`, which runs the handlers. They run only in **Live**.
  - **The runner.** Timers and fetches raise `tick`, `load` and `fail` in [runner.ts](src:src/server/runner.ts), by applying an event for the cell.
  - **The document.** `open` and `close` are raised by [session.ts](src:src/web/session.ts).
- `sampleData` in [events.ts](src:src/core/events.ts): the sample the studio's test button binds for it.
- [handlers.ts](src:src/web/code/handlers.ts): `sayEvent`, the words for it in the **Events** section ("is clicked"). [compose.ts](src:src/server/compose.ts): `EVENT_VARS` and `EVENT_PHRASE`, so **Ask AI** knows what it binds.
- [reference.ts](src:src/core/reference.ts): the guide's *Events* section.
- [events.test.ts](src:src/core/events.test.ts): that a handler for it runs with its data bound.
- The docs: a `::: event pick` entry; the kind's page shows it through `::ref events-of`. Mention where it is raised if that is not obvious.

## A route

The example is [GET /api/docs/:id](route:GET /api/docs/:id).

- [app.ts](src:src/server/app.ts): `app.get('/api/…', need(…), handler)`. **`need(…)` comes before the handler**, and the route-table test fails without it. Choose what it needs, from the table below.
- Records: take the account a collection belongs to from `checked.dataOwner` (the `dataOwner(c)` helper beside the data routes). Never call `store.rows` with a name from the request alone: that is how one account would read another's records.
- Errors: return `c.json({ error: '…' }, status)`. The message reaches people in a toast and agents in a tool result, so write it as a sentence for both. An `OpError` or `SxError` thrown in the handler is answered as 422.
- [access.ts](src:src/server/access.ts): only for a new kind of need.
- [lib/api.ts](src:src/web/lib/api.ts): the type of its answer, if the app calls it.
- Tests: [accounts.test.ts](src:src/server/accounts.test.ts) already walks the new route (the route-table test, and the stranger test for routes that name a document, a deck or a collection). Add a test of what the route does to [server.test.ts](src:src/server/server.test.ts), or to accounts.test.ts when the point is who may call it.
- If agents should use it: an [MCP tool](#an-mcp-tool), the matching section of the guide in [reference.ts](src:src/core/reference.ts), and [README.md](src:README.md).
- The docs: a `::: route GET /api/docs/:id` entry in [the HTTP API page](/agents/http/). The sentence about who may call it is made from the route table.

What a route can need:

| Need | Who may call |
| --- | --- |
| `'public'` | Anyone. Only the routes in `PUBLIC` in [access.ts](src:src/server/access.ts) may say so. |
| `'in'` | Anyone signed in, or a guest with a share link. |
| `'user'` | A person: signed in, an agent with their key, or local mode. |
| `'person'` | The person themselves, signed in. Not an agent with their key. |
| `{ doc: 'view' \| 'edit' \| 'owner' }` | A role on the `:id` document. Add `link: 'view'` or `link: 'edit'` to let a guest with that link do it too. |
| `{ deck: 'owner' }` | The owner of the `:id` deck. |
| `{ data: 'read' \| 'write' }` | A collection, the person's own or through `?doc=`. The same `link` option applies. |
| `{ guest: true }` | A guest who opened a share link. |


## An MCP tool

The example is [edgy_deck](tool:edgy_deck).

- [tools.ts](src:src/mcp/tools.ts): `tool('edgy_name', { description, inputSchema }, safely(async (args) => …))`. Registering it adds it to `TOOLS`, which the docs read. The description is what an agent reads to choose the tool: say what it does, when to use it and what an argument can be. Give each parameter a `.describe(…)`. Accept a document by id or title with `docId`. Call the HTTP API with `api(…)`, so the new route comes first; return `text(…)`. `safely` turns a thrown error into the tool's error answer.
- [reference.ts](src:src/core/reference.ts): the guide names only the library tools (`edgy_docs`, `edgy_organize`, `edgy_deck`, `edgy_share`, `edgy_export`), in its *Library* section. Name a tool there if it belongs to the library; the other tools are known to agents by their descriptions alone. [README.md](src:README.md): the table of tools.
- The docs: a `::: tool edgy_deck` entry in [MCP](/agents/mcp/). Its parameters are made from the schema.

## A style key

The example is [tracking](style:tracking).

- [notation.ts](src:src/core/notation.ts): add it to `STYLE_KEYS`. A key outside it is refused with *unknown style*.
- [look.ts](src:src/web/editor/look.ts): in `cssOf`, how the key becomes CSS. [look.test.ts](src:src/web/editor/look.test.ts): a check of it.
- The control for it in [TextSection.tsx](src:src/web/editor/inspector/TextSection.tsx) or [BoxSections.tsx](src:src/web/editor/inspector/BoxSections.tsx), and in [presets.ts](src:src/web/editor/inspector/presets.ts) if a preset sets it.
- [reference.ts](src:src/core/reference.ts): the guide's `style:` line. [README.md](src:README.md): the list of style keys.
- The docs: a `::: style tracking` entry in [Style keys](/styling/style-keys/).

## A format

The example is [compact](format:compact).

- [sx.ts](src:src/core/sx.ts): add the name to `FORMATS` and the branch in `formatValue` that does it. Charts, tables, stats and text templates all go through `formatValue`.
- [controls.tsx](src:src/web/editor/inspector/controls.tsx): `FORMATS`, the pairs of value and label the format picker shows.
- [reference.ts](src:src/core/reference.ts): the line of `fmt`, which lists the formats. [compose.ts](src:src/server/compose.ts): the phrases in its `FORMATS`, if people can ask for it in words.
- [core.test.ts](src:src/core/core.test.ts): the *formats* test.
- The docs: a `::: format compact` entry in [Formats](/language/formats/).

## A colour token

The example is [warn-soft](token:warn-soft).

- [look.ts](src:src/web/editor/look.ts): add it to `COLOR_TOKENS`. The colour pickers list this array.
- [styles.css](src:src/web/styles.css): define `--name` twice, in the block that starts `:root,` (light, and the printed pages) and in `:root[data-theme='dark']`. A token without both looks right in one theme and wrong in the other.
- [compose.ts](src:src/server/compose.ts): its colour word in `TOKEN_WORDS`, so **Ask AI** can use it.
- [reference.ts](src:src/core/reference.ts): the guide's `style:` line. [README.md](src:README.md): the list of tokens.
- The docs copy the colours from `styles.css` at build time, so there is nothing to paste. Add a `::: token warn-soft` entry in [Theme](/styling/theme/).

## A shortcut

The example is [undo](key:undo).

- [shortcuts.ts](src:src/web/shortcuts.ts): add `{ id, keys, where, does }` to `SHORTCUTS`. Write keys the Mac way, with `Mod` for ⌘ or Ctrl. The `id` is stable: docs link to it. A shortcut for a new place also needs that place in `ShortcutPlace` and `SHORTCUT_PLACES`.
- The list wires nothing. The handler is a separate change where the key is pressed: `useKeyboard` in [Editor.tsx](src:src/web/editor/Editor.tsx), the key handlers in [Studio.tsx](src:src/web/code/Studio.tsx), [CodeEditor.tsx](src:src/web/code/CodeEditor.tsx) and [Play.tsx](src:src/web/play/Play.tsx), or the component of the kind.
- [README.md](src:README.md): the **Keyboard** table is written by hand.
- The docs: a `::: key undo` entry in [Keyboard](/start/keyboard/).

## A template

The example is [Quote](template:quote).

- [templates.ts](src:src/core/templates.ts): a `Template` with an `id`, `title` and `about`; `meta` for settings, handlers and custom actions; `root`, in notation; and `data`, sample records saved into each collection that is still empty. Add it to `TEMPLATES`: that is the list `GET /api/templates` returns and the library offers. `tour` is the first-run document and sits outside the list. The documents tutorials end with go in [tutorials.ts](src:src/core/tutorials.ts) and open as `tutorial-<name>`.
- Tests: [core.test.ts](src:src/core/core.test.ts) and [server.test.ts](src:src/server/server.test.ts) build every template, the tour and every tutorial document, and fail on any cell with an error; `server.test.ts` also fails on a handler that names something missing. There is nothing to add; run them.
- The docs: a `::: template quote` entry in [Templates](/library/templates/). The tour and each tutorial document have one there too.

## An op

The example is [merge](op:merge).

- [ops.ts](src:src/core/ops.ts): add the verb to `OP_VERBS`, a `case` in the dispatcher, and the function. It must return the op with the ids it generated filled in and the inverse op that undoes it. Throw `OpError` with a sentence when it cannot apply.
- [session.ts](src:src/web/session.ts): add the verb to `STRUCTURAL` if it moves or adds cells, so the move is animated.
- [core.test.ts](src:src/core/core.test.ts): the test that *every op can be undone*.
- [reference.ts](src:src/core/reference.ts): the guide's *Ops*.
- The docs: a `::: op merge` entry in [Ops](/agents/ops/).

## A change to Flow

Flow is one kind of thing, the item, in five views; the example to search for is `kind === 'task'`.

- [flow.ts](src:src/core/flow.ts): the shape of an item, a comment, a reaction and the board, `normalizeItem` (a record missing fields still reads as a whole item: a document's `insert!` or the Data page may have written it), the quick-add parser, and the rules every view shares (`columnOf`, `moveTo`, `bucketOf`, `feedOf`, `todayOf`). A new field goes here first, with its default in `normalizeItem` and a case in [flow.test.ts](src:src/core/flow.test.ts).
- [server/flow.ts](src:src/server/flow.ts): `cleanFields` says which fields a request may set and how they are checked; `settle` keeps `done` and the column agreeing; every route is scoped to the asking account and ends with `changed(owner, …)`, which tells open documents and the Flow streams. [flow.test.ts](src:src/server/flow.test.ts) covers the routes, [sync.test.ts](src:src/server/sync.test.ts) that Flow records travel.
- The web: `src/web/pages/flow/`: `state.ts` (the data, the optimistic actions, the stream), `bits.tsx` (what every view shares: who, tags, when, the priority mark, the clock, the item's ⋯ menu), one file per view and its CSS, `ItemDialog.tsx` (every field, for all views). A field shown in one view usually belongs in `bits.tsx` so the others show it the same way.
- [tools.ts](src:src/mcp/tools.ts): `edgy_flow`, and the *Flow* section of the guide in [reference.ts](src:src/core/reference.ts).
- The docs: the pages under [Flow](/flow/), the route entries in [the HTTP API](/agents/http/#flow), the tool entry in [MCP](/agents/mcp/), the shortcuts under *In Flow* in [Keyboard](/start/keyboard/), the [Flow dashboard](template:flow) template; the pictures come from `site/scripts/shoot.mjs` (`flow-*`), whose server is seeded by `docs/showcase/flow/seed.mjs`.
- Evidence: `docs/showcase/flow/shoot.sh` regenerates every screenshot and check; `.claude/goal-loop/screens` lists the Flow screens the sweep opens.
