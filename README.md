# (•) edgy

Active documents grown from a single cell, for people and agents to work on together.

A document starts as one cell. Press the **+** on any edge to divide it into two — side by side or stacked — and keep going: the layout is a tree of cells, so any grid, form, invoice or dashboard is reachable by splitting and merging. A cell holds text, an input, a formula, a picture, an icon, a button, a chart, a table, a list or checklist, a calendar, a drawing or signature, a diagram, a headline stat, a hidden value, or a page break; tabs, accordions and collapsibles hold other cells. Cells have names; formulas read other cells by name and the links are drawn on the page; buttons run actions that change cells or save records; every change is a small s-expression that a person's click and an agent's tool call both produce.

```
(split c4 row)                        divide a cell
(set qty value 3)                     change a property
(put c7 (col "Total" (formula (* qty price))))   fill a cell with a whole layout
```

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173. The API listens on http://127.0.0.1:8787 and keeps everything in `data/edgy.db` (SQLite, JSON columns). On the first run a short tour document is created for you.

Other scripts:

| script | what it does |
| --- | --- |
| `npm test` | the core language, ops and server, with Node's test runner |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` then `npm start` | one production process serving the app and the API on 8787 |
| `npm run mcp` | the MCP server for agents (started by Claude Code from `.mcp.json`) |
| `docs/showcase/data-tables/shoot.sh` | rebuilds the data-table showcase screenshots and PDF from a fresh server |
| `docs/showcase/library/shoot.sh` | rebuilds the library showcase (search, pins, decks, Play, sharing, exports) from a fresh server |
| `node scripts/seed-library.mjs <url> 300` | fills a running edgy with 300 documents, to see the library at scale |

Requires Node 22.13 or newer (it uses `node:sqlite`).

## Writing code without knowing the language

Every place that takes an expression is a code editor: colours, matching brackets, autocomplete for functions and for the document's own cells (with their current values), the signature of the function you are in, and errors underlined where they are. Press **⌘E** (or the expand button) for the **code studio**: the same expression as **Blocks** you can click together, a searchable list of functions, the cells you can use, and the live result. The **Ask AI** tab turns a sentence into code in the context of the document — "what is left of the budget, never below zero" becomes `(max 0 (- budget total))`, checked against the document before you see it. It answers with Claude when `ANTHROPIC_API_KEY` is set (model `EDGY_AI_MODEL`, default `claude-sonnet-5-5`), with an agent connected over MCP when one is listening (`edgy_listen` shows the request, `edgy_answer` replies), and otherwise with a built-in composer that understands everyday phrasings offline.

## Data tables

A table shows records: rows typed into the table itself, saved records (`(rows "invoices")`), or anything a formula gives. Beyond search and sort it can:

- **group** rows by a field, under headings people fold, with a count and subtotals;
- let people **pick** one or many rows (`select`); other cells read them with `(selected invoices)`;
- carry **buttons on every row** (`actions`): each runs with `row` bound to that row's record, e.g. `(update! "invoices" (get row "id") {status "Paid"})`, and can ask first;
- format each column: heading, number format, alignment, width (drag a header's edge), bold, wrapping, colour, and **show as** text, a coloured badge, a progress bar, a check, a link or stars;
- add a **totals** row (sum, average, count, smallest, largest);
- take a look: lines (rows, columns, grid, outer, none), stripes, density, header style; hide the search box.

Rows typed into a table are edited in place in Edit view: double-click a cell, Enter or Tab to move on. On a phone each row becomes a card; on paper the toolbar, pick boxes and buttons are left out.

## Tabs, sections, diagrams and hidden data

- **Tabs** show one panel at a time behind a tab bar; an **accordion** folds sections, one open at a time or any number; a **collapsible** is a heading that folds the cells under it. Each panel holds any cells in any layout, and inside it cells split, merge, move and duplicate as anywhere else. What is open is the cell's value: `(= view "Details")` reads it, a button opens a tab with `(set! view "Details")`, and it is saved with the document. While designing, add, rename (double-click), reorder and remove tabs and sections on the page or in the panel. On paper every tab and section prints, unfolded, under its title.
- A **diagram** holds shapes (rectangle, ellipse, diamond), text, arrows and lines, drawn in Edit with the mouse or a finger: arrows stay joined to their shapes when those move, and labels can show live values (`Total {{total | currency}}`). Its content is a list of elements in the document, so an agent can write a whole flowchart without positions (it is laid out along the arrows) and change single elements with the `draw` and `erase` ops, and formulas can read it: `(count-if (= (get it "type") "arrow") flow)`. It prints as sharp vector lines.
- A **data** cell holds a value — a number, text, a list, a record — that readers never see and that takes no room, in Live, on the pages or on paper. While designing it is a small chip. It is the place for a document's own state and settings: a wizard's step, a flag, a lookup list. Formulas read it by name; buttons change it: `(set! step (+ step 1))`.

The **Order desk** template uses all five: a flowchart with live numbers, tabs opened from buttons, a three-step order form run on a hidden step counter, folding questions with a table and a chart inside, and notes that start folded.

## Your documents: a library

The home page keeps up with hundreds of documents. **Search** finds words in titles, descriptions and the text inside documents (every word must appear; case and accents don't matter) and says where it matched. **Sort** by last changed, created or title; **filter** to Pinned, Shared, Decks or Archived; switch between a grid and a list. The view and the sort are remembered.

- **Describe** a document from its card or from the Document panel inside it; the description shows on the card and is searchable. It is part of the document (`["meta", "description", "…"]`), with its history.
- **Pin** what you use most: pinned documents sit in their own section on top, in the order you give them (drag them, or Move up and down in the card's menu).
- **Archive** takes a document out of the list without losing anything; the Archived filter shows it and Restore brings it back as it was. **Delete** is permanent and asks first. Select several cards (their checkboxes: click, tap, or Tab to one and press Space) to pin, archive, delete or group them at once; Esc clears the selection.
- **Share** a document by link from its editor (Share) or its card: a **can view** link and a **can edit** link, each turned on or off. A link opens the document in Live and nothing else: no editor, no way to other documents. With a view link people can try the inputs but nothing is saved; with an edit link their changes are saved and appear for you as they happen. A link turned off says so. edgy listens on 127.0.0.1, so a link reaches other people once edgy is hosted where they can open it.
- **Decks**: select two or more documents and **Group** them. A deck is an ordered set with its own title and description, shown as one card; its documents stay separate documents. On the deck's page reorder them, add more or take some out, and **Ungroup** to put them back in the list. **Play** shows the deck as slides, one live document per slide (inputs and buttons work; each evaluates on its own): → and ← (or a click beside the slide, or a swipe) move between them, ↓ ↑ and Space scroll a slide taller than the screen, F is full screen and Esc goes back to where you started. A slide is laid out at the document's width (or the screen's, so a phone gets the phone layout) and scaled to fill the screen, down to a readable size; a longer one scrolls.
- **Export** a document or a deck as **one .html file** (the download button in the editor, a card's menu, or a deck's page). It opens from disk with no server and no network: fonts, pictures and icons are inside, formulas, inputs and buttons work, a deck plays as slides, and the records it reads are included as they were at the moment of export. What you change in the file, saved records included, stays in that page until you close it; a note says it is an offline copy. The file holds only that document (or deck), the records it reads and the font files its text needs; fetch addresses and keys are left out.

## Events: documents that react

Any cell can say what happens when something happens to it, in its **on**: an event's name and an action, written in the same language as a button's. The document has its own (`open`, `close`) and can define **custom actions** once and call them anywhere.

- **The document opening and closing**: `open` runs once each time someone opens it in Live (a visit counter: `(set! visits (+ visits 1))`); `close` when they leave it.
- **Values changing**: `change` on any cell with a value — a ticked checkbox or list item, an input, a picked calendar day, a signed canvas, a data cell, a formula whose inputs moved — with `value` and `was` bound (a list also binds the `item` and its `index`); `pick` on a table binds the picked `rows`; accordions and collapsibles raise `open` and `close`. It follows the value whoever changed it: a person, a button, another handler or an agent.
- **Clicks**: `click` and `dblclick` on text, images, icons, stats, charts, table rows (`row`), list items (`item`) and diagram shapes (`element`). A cell that handles double-click waits a quarter of a second after one click to see whether a second follows, and then runs only `dblclick`; without one, `click` runs at once.
- **Time**: a **timer** cell ticks `every` so often, or once `after` a delay, while the document is open in Live; `(stop! poll)` and `(start! poll)` stop and restart it.
- **Fetching**: a **fetch** cell gets JSON from an address — the server fetches it, so secrets stay on the server (`"Authorization": "secret:RATES_KEY"` is filled from `EDGY_SECRET_RATES_KEY`) and private addresses are refused — when the document opens, every so often, and on `(refresh! rate)`. Its value is the answer, so `(get rate "usd")` reads a field; it raises `load` and `fail` (with a `message`); `(status rate)` is `"loading"`, `"ready"` or `"failed"`. Readers see one line: loading, when it last updated, or what failed with Retry. `/api/demo/rate`, `/api/demo/fail` and `/api/demo/slow` answer locally for trying it.
- **Custom events**: `(emit! "order-placed" {total total})` reaches every cell, and the document, with an `order-placed` handler; they read the `payload`.
- **Custom actions**: `["meta", "actions.add", ["fn", ["item", "qty"], …]]` once, then `(add "Apples" 1)` from any button or handler. Calling a name that exists nowhere shows as an error in the cell before anything runs.

A person's clicks and changes run in their own browser, and one gesture with everything its handlers changed is one undo step. Timers, fetches and the handlers they set off — and changes made by agents — run once, on the server, while anyone has the document open in Live, so nothing runs twice when two people are looking. Nothing fires while designing (Edit) or on paper. A handler that keeps setting itself off stops after eight levels with an error. Activity lists each event, the cell it came from and what it changed.

In the code studio the **Events** part lists what a cell (or the document) can raise and the handlers attached, each editable as code or Blocks, with presets for the common ones, a button to fire an event by hand to try it, and Ask AI: "when every box is ticked, save the checklist and show the thank-you note".

The **Market stall** template uses all of it: a live exchange rate that warns above 5 and refreshes when tapped, a basket filled by double-clicking produce or pressing buttons that call one custom action, an order that sends an event two cells listen for, a set-up checklist that announces when it is done, and timers that turn the offer and show a tip.

## Designing a cell

The panel on the right shows what the selected cell is and everything it can do, in sections: **Content** first — a designer made for that kind of cell (a table's data, columns, rows, row buttons and look; a canvas's paper and pen; a list's markers; a chart's type and colour; an empty cell's choice of what to hold) — then **Text**, **Spacing and size**, **Box**, and the cell's rules and notation. Presets come first (text styles such as Title, Heading, Label or Quote; table looks such as Striped or Grid; ready-made row buttons), so most things take a click and no code.

Fonts: Recursive, Inter, Manrope and Space Grotesk; Newsreader, Lora and Source Serif; Fraunces and Playfair Display; Recursive Mono and JetBrains Mono; Caveat. All are served by the app itself. A document can set its text font, heading font and base size; a cell can set its own font, size, weight, letter spacing, line height, paragraph spacing, case, underline or strike, padding per side, border colour and width, corners and shadow.

## Phones and paper

The sheet is as wide as the document asks or as the screen allows. On a narrow screen the cells of a row wrap under each other (`"style": {"stack": "never"}` keeps table-like lines side by side), tables become searchable cards, calendars switch to an agenda and the editor's panels become drawers.

**Page** view shows the document as printed pages: A4, A5, Letter or Legal, portrait or landscape, with margins and a footer. The document is laid out once at the page's width and cut into pages between cells, never through one; a `break` cell starts a new page. ⌘P prints exactly those pages. Open a document with `?view=page` to land on them.

## Working with an agent

The project ships an MCP server (`src/mcp/server.ts`) and a `.mcp.json`, so Claude Code opened in this folder gets these tools once the dev server is running:

| tool | purpose |
| --- | --- |
| `edgy_guide` | the notation, the language, the ops — read once |
| `edgy_docs`, `edgy_create` | list or search the library (pinned first; filters and sorts), start a document (blank, from notation, or from a template) |
| `edgy_organize` | describe, pin, unpin, archive, restore documents, and set the order of the pinned |
| `edgy_deck` | create a deck, reorder it, add or take out documents, describe it, ungroup it |
| `edgy_share`, `edgy_export` | turn a view or edit link on or off; save a document or deck as one offline .html file |
| `edgy_read` | an outline of every cell with its id, name, source and current value, plus errors |
| `edgy_apply` | change a document with ops, atomically; returns the new outline |
| `edgy_eval` | try an expression against a document without changing it |
| `edgy_data` | the collections documents save records into |
| `edgy_say`, `edgy_listen` | leave a message in the document's Activity panel, or wait for one (and for code requests from Ask AI) |
| `edgy_answer` | answer a code request from Ask AI; the answer is checked before the person sees it |

Every change an agent makes lands in the open browser immediately, with the agent's name traced on the cells it touched and its ops in the Activity feed. A person can write to the agent from the same panel; `edgy_listen` blocks until they do, so an agent can sit in a document and take requests.

The HTTP API is the same thing without MCP. Anything that speaks JSON can drive a document:

```bash
curl -X POST localhost:8787/api/docs/DOC/ops -H 'content-type: application/json' \
  -d '{"actor":{"kind":"agent","name":"Bash"},"ops":[["set","qty","value",5]]}'
```

`GET /api/guide` returns the full reference. `GET /api/docs/:id/read` returns the outline and values.

## How it is built

```
src/core      the model, shared by everything, no dependencies
  types.ts      Cell, Doc, Op — plain JSON
  sx.ts         the expression language: reader, printer, interpreter, formats
  ops.ts        apply(doc, op) → {doc, normalized op, inverse op}
  engine.ts     evaluate a document: values, resolved styles, links between cells
  notation.ts   cells as s-expressions: ["row", {props}, ...children]
  outline.ts    the compact text view an agent reads
  events.ts     which events each kind raises, and react(): running the handlers a change or an event sets off
  templates.ts  the starting points, in notation
src/server    Hono on Node: the API, SQLite storage, live events over SSE, compose (sentence → code)
  runner.ts     timers, fetch cells and the handlers they set off, run once per document while someone is in Live
src/mcp       the MCP server; each tool calls the HTTP API
src/web       React + Vite: the editor, the home page, the data browser
  code/         the code editor, code studio, Blocks and Ask AI
  kinds/        list, calendar, canvas, stat, break and table cells
  editor/inspector/  the panel on the right: a designer per kind, text, spacing and box
  print/        page setup, the page view and pagination
```

Some decisions worth knowing:

- **Everything is a cell.** A document is one root cell; `row` and `col` cells hold other cells. Splitting a leaf makes it a group; merging collapses a run of siblings, or a rectangle of a grid, into one cell. A `normalize` pass keeps the tree tidy (no empty groups, no group of one, no group nested in a same-direction group).
- **Ops are the only way to change a document.** `applyOp` is pure and returns the op with every generated id filled in, so replaying the log is deterministic, and the inverse op, so undo is just another dispatch. The browser applies ops optimistically, sends them, and rebases whatever is still in flight on top of what the server confirms over the event stream.
- **Formulas are JSON arrays.** `["*", "$qty", "$price"]` is stored; `(* qty price)` is what people see and type; `{{total | currency}}` inside text is a template. Everything dynamic — a formula, a button's action, a conditional style, a hidden-when rule — is the same language. Relative references (`(sib 1)`) let a row be duplicated by a button. A cell can hold a function and other cells can call it.
- **Data leaves the document on purpose.** `(insert! "orders" {…})` saves a record into a named collection on the server, `(update! "orders" id {…})` changes one; `(rows "orders")` reads them back from any document. Collections are the memory that outlives a document. A template can bring sample records for collections that are still empty.
- **Agents and people share one surface.** The outline an agent reads, the notation it writes and the ops it sends are the same structures the editor uses; the Activity panel shows both sides' changes as the same s-expressions.

## The language, briefly

```
(+ a b) (- a b) (* a b) (/ a b) (round x 2) (sum xs) (avg xs) (min xs) (max xs) (pmt rate n pv)
(= a b) (< a b) (if c then else) (cond c1 v1 c2 v2 else) (and a b) (or a b) (not a) (default a b)
(let (x 1 y 2) body) (fn (x) body)
(list 1 2 3) (range 1 13) (map (* it 2) xs) (filter (> it 3) xs) (sum-by (get it "total") rows)
(sort-by (get it "at") rows "desc") (take 5 xs) (column rows "total") (where rows "status" "paid") (group rows "topic")
{name name total (* qty price)}  (get record "total")
(str "Hi " name) (fmt x "EUR") (upper s) (split s ",")
(now) (today) (days a b) (date+ d 30)
(sib 1) (idx) (child lines -1) (rows "orders") (selected invoices)
(set! qty 5) (set! view "Details") (toggle! done) (insert! "orders" {…}) (update! "orders" id {…}) (delete! "orders" id) (dup! (child lines -1)) (remove! (child lines -1)) (do a b)
(show! note) (hide! note) (emit! "saved" {total total}) (start! poll) (stop! poll) (refresh! rate) (status rate) (error-of rate) (greet "Ann")
```

Formats: `int`, `number`, `0.00`, `percent`, `compact`, `currency`, `USD`/`EUR`/…, `date`, `time`, `datetime`, `ago`.

Style keys: `bg fg pad gap align valign font size weight italic line tracking case decor para border bcolor bwidth radius shadow stack`.

Style tokens that follow the theme: `ink`, `muted`, `faint`, `paper`, `sunken`, `line`, `accent`, `accent-soft`, `agent`, `agent-soft`, `live`, `live-soft`, `warn`, `warn-soft`, `bad`, `bad-soft`.

## Keyboard

| keys | |
| --- | --- |
| arrows | move between cells; Shift extends |
| ⌥ + arrow | split in that direction |
| Enter | edit the cell; Esc finishes, or selects the parent |
| `/` | choose what the cell holds |
| ⌫ | clear the cell, then remove it |
| ⌘M | merge the selection |
| ⌘D | duplicate |
| ⌘Z, ⇧⌘Z | undo, redo |
| ⌘E | open the code studio for the selected cell |
| ⌘P | print the document as pages |
| Tab | next cell |

While a formula is being edited, clicking another cell inserts its name.

Playing a deck: → ← next and previous slide, ↓ ↑ Space PgDn PgUp scroll a long slide, Home and End the first and last, F full screen, Esc leave.
