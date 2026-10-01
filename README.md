# (•) edgy

Active documents grown from a single cell, for people and agents to work on together.

A document starts as one cell. Press the **+** on any edge to divide it into two — side by side or stacked — and keep going: the layout is a tree of cells, so any grid, form, invoice or dashboard is reachable by splitting and merging. A cell holds text, an input, a formula, a picture, an icon, a button, a chart, a table, a list or checklist, a calendar, a drawing or signature, a headline stat, or a page break. Cells have names; formulas read other cells by name and the links are drawn on the page; buttons run actions that change cells or save records; every change is a small s-expression that a person's click and an agent's tool call both produce.

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

Requires Node 22.13 or newer (it uses `node:sqlite`).

## Writing code without knowing the language

Every place that takes an expression is a code editor: colours, matching brackets, autocomplete for functions and for the document's own cells (with their current values), the signature of the function you are in, and errors underlined where they are. Press **⌘E** (or the expand button) for the **code studio**: the same expression as **Blocks** you can click together, a searchable list of functions, the cells you can use, and the live result. The **Ask AI** tab turns a sentence into code in the context of the document — "what is left of the budget, never below zero" becomes `(max 0 (- budget total))`, checked against the document before you see it. It answers with Claude when `ANTHROPIC_API_KEY` is set (model `EDGY_AI_MODEL`, default `claude-sonnet-5-5`), with an agent connected over MCP when one is listening (`edgy_listen` shows the request, `edgy_answer` replies), and otherwise with a built-in composer that understands everyday phrasings offline.

## Phones and paper

The sheet is as wide as the document asks or as the screen allows. On a narrow screen the cells of a row wrap under each other (`"style": {"stack": "never"}` keeps table-like lines side by side), tables become searchable cards, calendars switch to an agenda and the editor's panels become drawers.

**Page** view shows the document as printed pages: A4, A5, Letter or Legal, portrait or landscape, with margins and a footer. The document is laid out once at the page's width and cut into pages between cells, never through one; a `break` cell starts a new page. ⌘P prints exactly those pages. Open a document with `?view=page` to land on them.

## Working with an agent

The project ships an MCP server (`src/mcp/server.ts`) and a `.mcp.json`, so Claude Code opened in this folder gets these tools once the dev server is running:

| tool | purpose |
| --- | --- |
| `edgy_guide` | the notation, the language, the ops — read once |
| `edgy_docs`, `edgy_create` | list documents, start one (blank, from notation, or from a template) |
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
  templates.ts  the starting points, in notation
src/server    Hono on Node: the API, SQLite storage, live events over SSE, compose (sentence → code)
src/mcp       the MCP server; each tool calls the HTTP API
src/web       React + Vite: the editor, the home page, the data browser
  code/         the code editor, code studio, Blocks and Ask AI
  kinds/        list, calendar, canvas, stat, break and table cells
  print/        page setup, the page view and pagination
```

Some decisions worth knowing:

- **Everything is a cell.** A document is one root cell; `row` and `col` cells hold other cells. Splitting a leaf makes it a group; merging collapses a run of siblings, or a rectangle of a grid, into one cell. A `normalize` pass keeps the tree tidy (no empty groups, no group of one, no group nested in a same-direction group).
- **Ops are the only way to change a document.** `applyOp` is pure and returns the op with every generated id filled in, so replaying the log is deterministic, and the inverse op, so undo is just another dispatch. The browser applies ops optimistically, sends them, and rebases whatever is still in flight on top of what the server confirms over the event stream.
- **Formulas are JSON arrays.** `["*", "$qty", "$price"]` is stored; `(* qty price)` is what people see and type; `{{total | currency}}` inside text is a template. Everything dynamic — a formula, a button's action, a conditional style, a hidden-when rule — is the same language. Relative references (`(sib 1)`) let a row be duplicated by a button. A cell can hold a function and other cells can call it.
- **Data leaves the document on purpose.** `(insert! "orders" {…})` saves a record into a named collection on the server; `(rows "orders")` reads it back from any document. Collections are the memory that outlives a document.
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
(sib 1) (idx) (child lines -1) (rows "orders")
(set! qty 5) (toggle! done) (insert! "orders" {…}) (dup! (child lines -1)) (remove! (child lines -1)) (do a b)
```

Formats: `int`, `number`, `0.00`, `percent`, `compact`, `currency`, `USD`/`EUR`/…, `date`, `time`, `datetime`, `ago`.

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
