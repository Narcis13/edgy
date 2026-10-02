// The guide an agent reads before touching a document. Also the source for the
// in-app function reference.

import { FONTS } from './fonts';

export interface FnDoc {
  name: string;
  use: string;
  does: string;
  group: 'Math' | 'Logic' | 'Lists' | 'Records' | 'Text' | 'Dates' | 'Cells' | 'Actions';
}

export const FUNCTIONS: FnDoc[] = [
  { group: 'Math', name: '+ - * /', use: '(+ a b …)', does: 'Arithmetic. Empty cells count as 0.' },
  { group: 'Math', name: '% ^', use: '(% a b) (^ a b)', does: 'Remainder and power.' },
  { group: 'Math', name: 'sum avg min max', use: '(sum list …)', does: 'Over every number found, however nested. Text is skipped.' },
  { group: 'Math', name: 'round floor ceil abs sqrt', use: '(round x 2)', does: 'Rounding (optional digits) and friends.' },
  { group: 'Math', name: 'clamp', use: '(clamp x lo hi)', does: 'Keep x between lo and hi.' },
  { group: 'Math', name: 'pmt', use: '(pmt rate periods principal)', does: 'Payment per period on a loan.' },
  { group: 'Logic', name: '= != < <= > >=', use: '(> total 100)', does: 'Comparisons.' },
  { group: 'Logic', name: 'if', use: '(if test then else)', does: 'Choose between two values.' },
  { group: 'Logic', name: 'cond', use: '(cond test1 a test2 b fallback)', does: 'The first matching branch.' },
  { group: 'Logic', name: 'and or not', use: '(and a b)', does: 'Logic. Empty, 0, "" and () are false.' },
  { group: 'Logic', name: 'default', use: '(default a b)', does: 'The first value that is not empty.' },
  { group: 'Logic', name: 'let', use: '(let (x 1 y 2) (+ x y))', does: 'Name intermediate values.' },
  { group: 'Logic', name: 'fn', use: '(fn (x) (* x 2))', does: 'A function.' },
  { group: 'Lists', name: 'list range', use: '(list 1 2 3) (range 1 13)', does: 'Make lists. range stops before its end.' },
  { group: 'Lists', name: 'map filter find', use: '(map (* it 2) xs)', does: 'Transform or pick items. `it` is the item, `i` its index; a (fn …) works too.' },
  { group: 'Lists', name: 'some every count-if sum-by', use: '(sum-by (get it "total") rows)', does: 'Test or total items the same way.' },
  { group: 'Lists', name: 'reduce', use: '(reduce (+ acc it) 0 xs)', does: 'Fold a list into one value.' },
  { group: 'Lists', name: 'sort sort-by reverse', use: '(sort-by (get it "at") rows "desc")', does: 'Order a list.' },
  { group: 'Lists', name: 'len nth first last rest take drop', use: '(nth xs 0)', does: 'Size and slices. Indexes start at 0.' },
  { group: 'Lists', name: 'concat flat uniq join includes?', use: '(join xs ", ")', does: 'Combine and inspect.' },
  { group: 'Lists', name: 'column where group', use: '(column rows "total")', does: 'One field of every row; rows where a field equals a value; rows grouped by a field as {key count rows}.' },
  { group: 'Records', name: '{ }', use: '{name name total (* qty price)}', does: 'A record. In JSON: {"name": "$name"}.' },
  { group: 'Records', name: 'get keys vals assoc merge obj', use: '(get record "total")', does: 'Read and build records.' },
  { group: 'Text', name: 'str', use: '(str "Hi " name)', does: 'Join values as text.' },
  { group: 'Text', name: 'fmt', use: '(fmt x "EUR")', does: 'Format: int, number, 0.00, percent, compact, currency, USD/EUR/…, date, time, datetime, ago.' },
  { group: 'Text', name: 'upper lower trim split replace', use: '(upper s)', does: 'Text helpers.' },
  { group: 'Dates', name: 'now today', use: '(today)', does: 'The current time (ms) and date (YYYY-MM-DD). Cells using them tick.' },
  { group: 'Dates', name: 'days date+ year month day weekday', use: '(days start end)', does: 'Date arithmetic.' },
  { group: 'Cells', name: 'name', use: 'total', does: 'The value of the cell named total. A row or column gives the list of its cells\' values.' },
  { group: 'Cells', name: 'sib idx', use: '(* (sib 1) (sib 2))', does: 'The value of the nth cell in my own row or column, and my own position. Lets a row be duplicated.' },
  { group: 'Cells', name: 'a cell holding (fn …)', use: '(balance 10)', does: 'A formula cell can hold a function; call it by the cell\'s name.' },
  { group: 'Cells', name: 'rows', use: '(rows "orders")', does: 'The records saved in a collection, each with id and at.' },
  { group: 'Cells', name: 'selected', use: '(selected orders)', does: 'The rows picked in a table (one with a select prop), as records.' },
  { group: 'Actions', name: 'set! toggle!', use: '(set! count (+ count 1))', does: 'Change the value of an input, a data cell, tabs (the open title), an accordion (the open titles) or a collapsible (open or not).' },
  { group: 'Actions', name: 'insert! delete! clear!', use: '(insert! "orders" {qty qty})', does: 'Save a record to a collection, delete one by id, or empty it.' },
  { group: 'Actions', name: 'update!', use: '(update! "orders" (get row "id") {status "paid"})', does: 'Change some fields of a saved record. In a table\'s row action, row is that row\'s record.' },
  { group: 'Actions', name: 'dup! remove!', use: '(dup! (child lines -1))', does: 'Copy or remove a cell, e.g. add a row. (child group n) picks the nth cell of a row or column; -1 is the last.' },
  { group: 'Actions', name: 'do', use: '(do a b c)', does: 'Several actions in order. Reads see the document as it was before the action.' },
  { group: 'Actions', name: 'show! hide!', use: '(show! thanks)', does: 'Show or hide a cell (sets its hidden prop; show! removes a hidden rule).' },
  { group: 'Actions', name: 'emit!', use: '(emit! "saved" {total total})', does: 'Send a custom event with a payload to every cell, and the document, that has a handler for it.' },
  { group: 'Actions', name: 'start! stop!', use: '(stop! poll)', does: 'Start a timer (again, from now) or stop it.' },
  { group: 'Actions', name: 'refresh!', use: '(refresh! rate)', does: 'Fetch a fetch cell’s address again.' },
  { group: 'Actions', name: 'a custom action', use: '(greet "Ann")', does: 'Call an action the document defines (see Events), like a built-in.' },
  { group: 'Cells', name: 'status error-of', use: '(status rate)', does: 'How a fetch cell stands: "idle", "loading", "ready" or "failed"; and why it failed, or nil.' },
];

export const GUIDE = `# Edgy: documents made of cells

A document is one cell. Splitting a cell turns it into a row (side by side) or a col (stacked) of cells, and so on, so a document is a tree. Every change is an op; every formula and action is an s-expression written as a JSON array. A person may be editing the same document live, so make small, legible changes and check the result.

## Cells, as notation

A cell is written [kind, props?, ...body]:

  ["col",
    ["text", {"style": {"size": 28, "weight": 650}}, "Quote for {{client}}"],
    ["row",
      ["input", {"name": "qty", "type": "number", "value": 2, "label": "Quantity"}],
      ["input", {"name": "price", "type": "number", "value": 40, "label": "Unit price"}],
      ["formula", {"name": "total", "format": "currency"}, ["*", "$qty", "$price"]]]]

Kinds and their body:
- row, col: child cells. A bare string child is a text cell.
- tabs: panels behind a tab bar, one shown at a time: ["tabs", {"name": "view", "value": "Details"}, ["panel", {"title": "Overview"}, …cells], ["panel", {"title": "Details"}, …cells]]. Its value is the open tab's title, so other cells read it, (= view "Details"), and a button opens one, (set! view "Details"). Unset, the first tab is open. On paper every panel prints, in order, under its title.
- accordion: sections that fold, the same panels as tabs: ["accordion", {"name": "faq"}, ["panel", {"title": "Shipping"}, …], …]. Props: multiple (true lets any number be open; unset, opening one closes the other). Its value is the list of open titles, e.g. ["Shipping"]; set it with a list, one title, or [] to close all: (set! faq "Returns"). (includes? faq "Shipping") tells whether one is open. Prints unfolded.
- panel: a titled section, only directly inside tabs or an accordion. Prop: title (unique within its container; it is the key the container's value uses). Body: its cells, stacked like a col. Splitting a panel adds a panel beside it; dup copies it as a new tab; move reorders panels; the last panel can't be removed (remove the tabs instead).
- collapsible: a heading that folds the cells under it: ["collapsible", {"name": "more", "title": "More details", "value": false}, …cells]. Its value is true while open (the default) and false while folded, so (toggle! more) folds and unfolds it and (if more …) reads it. Prints unfolded.
  Inside any of these, cells split, merge, move and duplicate as in a col; the last cell of a panel leaves an empty cell behind.
- data: a value for the document's own use, never shown to readers and taking no space (in Edit it is a small chip): ["data", {"name": "step"}, 1], ["data", {"name": "regions"}, ["North", "South"]], ["data", {"name": "cfg"}, {"vat": 0.2}]. Formulas read it by name; actions change it: (set! step (+ step 1)). Use it for a wizard's current step, a flag, a lookup list. Unlike hidden, nothing ever shows it.
- diagram: shapes, text and arrows, drawn by people (in Edit) or written as data. The body is the elements: ["diagram", {"name": "flow"}, {"id": "a", "type": "rect", "text": "Order placed"}, {"id": "b", "type": "diamond", "text": "Paid?"}, {"type": "arrow", "from": "a", "to": "b", "text": "check"}]. Element fields: id (yours, or e1, e2… given for you), type (rect, ellipse, diamond, text, arrow, line), x y w h (px; leave out x and y and the boxes are laid out top to bottom along the arrows), text (may carry {{templates}}, e.g. "Total {{total | currency}}", shown live), color (a token for outline and text), fill (a token, e.g. "accent-soft"), size (font px), dash (true). Arrows and lines take from/to (element ids: the end stays attached when that shape moves) or x1 y1 / x2 y2 for a free end. Its value is the list of elements, so (count-if (!= (get it "type") "arrow") flow) counts the boxes. Change one element with the draw op instead of rewriting the list.
- text: markdown (#, ##, ###, **bold**, *italic*, \`code\`, - lists, [links](url)) with {{expr}} or {{expr | format}} templates in Lisp syntax, e.g. "Total {{(* qty price) | currency}}".
- formula: an expression. Prop: format.
- input: no body. Props: type (text, number, slider, checkbox, toggle, select, date, textarea, rating), value, label, placeholder, min, max, step, options (an expression such as ["list", "S", "M", "L"]).
- button: label, then optionally the action. Props: do (action), variant (solid, soft, ghost), icon (a Lucide name), confirm (a question asked before it runs).
- chart: an expression giving numbers, [label, value] pairs or {label, value} records. Props: type (bar, line, area, donut, meter), label, color (a token).
- table: an expression giving a list of records, or (with no expression) the rows typed into it as its value: ["table", {"value": [{"item": "Tea", "price": 3}]}]. People can search and sort it; on a phone each row becomes a card. Props:
  - label: a title.
  - columns: data, not an expression: field names, or records {"key", "label", "format", "width" (px), "align" (start, center, end), "show" (text, badge, progress, check, link, stars), "colors" ({"value": color token} for badges), "color" (a token for the whole column), "bold", "wrap", "total" (sum, avg, count, min, max)}, in the order to show.
  - group: a field; rows with the same value sit under one heading people can fold, with a count and the column totals.
  - select: "one" or "many" lets people pick rows; selected holds the picked keys (a row's id, or its position). Read them with (selected name).
  - actions: buttons on every row, [{"label": "Paid", "do": ["update!", "invoices", ["get", "$row", "id"], {"status": "Paid"}], "icon"?: "check", "variant"?: "soft", "confirm"?: "Mark it paid?"}]; do runs with row bound to the row's record.
  - borders (rows, columns, grid, outer, none), stripes (true), density (compact, normal, roomy), header (plain, filled, strong, none), search (false hides it).
- list: the items themselves as the body: ["list", {"type": "check", "name": "todo"}, "Book the venue", {"text": "Send invites", "done": true}]. Props: type (check, bullet, number), label, marker (bullets: dot, dash, arrow, star, none), density (compact, normal, roomy), progress (false hides a checklist's bar). People tick, add and edit items; a checklist's value is a list of {text, done} records, so (count-if (get it "done") todo) counts what is done. With an expr prop instead of items it shows a computed list (read only).
- calendar: an expression giving events, records with a date ("YYYY-MM-DD") and a title (optional end date, color token). Its value is the day people picked (or the value prop), so other cells can read it: (where (rows "events") "date" cal). Props: value, label, week ("mon" or "sun", the first day of the week).
- canvas: a surface people draw or sign on; its value is the list of strokes, so (empty? sig) tells whether it has been signed. Props: label (e.g. "Sign here"), paper (plain, lines, grid, dots), color (the pen's first colour, a token).
- stat: a headline number. Body: the expression. Props: label, format, compare (an expression for the earlier value; shows the change in %), trend (an expression giving numbers, drawn as a sparkline), icon, better ("down" when a fall is good news, e.g. costs).
- break: a page break when the document is printed. Put it between the cells of the top-level column.
- image: a URL. Props: fit (cover, contain), alt.
- icon: a Lucide icon name in kebab-case, e.g. "sparkles".
- timer: ticks while the document is open in Live: ["timer", {"name": "poll", "every": 30, "on": {"tick": action}}]. Props: every (seconds, or "30s", "2m", "1h") or after (one tick after that long), on. Its value is true while running; (stop! poll) stops it, (start! poll) starts it again from now. Takes no room; never printed.
- fetch: JSON from an address, fetched by the server: ["fetch", {"name": "rate", "every": 60, "on": {"load": action, "fail": action}}, "https://example.com/rate.json"]. Body: the url (http/https, or a path on this server such as /api/data/orders; may carry {{templates}}). Props: every (refresh interval, at least 5 s), headers ({"Authorization": "secret:RATES_KEY"}: the server fills in its EDGY_SECRET_RATES_KEY, so no secret is ever in the document), label. Its value is the parsed answer, so (get rate "usd") reads a field; (status rate) and (error-of rate) tell how it stands. In Live it shows one line: loading, when it last updated with a refresh button, or what failed with Retry. Fetched when the document opens in Live, every interval, and on (refresh! rate).
- empty: nothing yet.

Props on any cell:
- id: assigned for you; read it back from the outline.
- name: lets other cells refer to it. Letters, digits, - and _.
- size: within its row/col, a weight (default 1), "hug" (as small as its content), or a fixed "120px".
- hidden: true, or an expression; the cell disappears while it is true.
- on: what the cell does when an event reaches it: {"click": action, "change": action, "saved": action}. See Events.
- style: bg, fg, pad (px, or "top right bottom left" like "8 16 8 16"), gap (rows/cols), align (start, center, end, justify), valign (start, center, end), font (${FONTS.map((f) => f.id).join(', ')}), size (px), weight (100–900), italic, line (line height, e.g. 1.4), tracking (letter spacing in em, e.g. 0.05), case (upper, lower, title), decor (underline, strike), para (px between paragraphs), shadow (sm, md, lg), bcolor and bwidth (the border's color token and px), border ("all", or sides like "b", "tb", or "none"), radius, stack (rows only: "auto" wraps the cells under each other on a narrow screen, the default; "never" keeps them side by side, for table-like lines; "always"). Colors are tokens that adapt to light and dark: ink, muted, faint, paper, sunken, line, accent, accent-soft, agent, agent-soft, live, live-soft, warn, warn-soft, bad, bad-soft, or any CSS color. A style value may be an expression, e.g. {"fg": ["if", ["<", "$balance", 0], "bad", "ink"]}.

## Expressions

JSON arrays are calls: ["*", "$qty", "$price"]. A string starting with $ reads a cell by name (or id) or a variable; other strings are text. The same thing in Lisp syntax, used in templates and shown to people: (* qty price).

- A named row/col evaluates to the list of its children's values, so a col named "lines" holding rows gives a list of lists: ["sum", ["column", "$lines", 3]].
- ["sib", n] reads the nth cell of my own row/col. A line's amount can be ["*", ["sib", 1], ["sib", 2]] so the row can be duplicated.
- map/filter/find/sum-by/sort-by take an expression over $it: ["map", ["*", "$it", 2], "$xs"].
- Errors show in the cell and in the outline as "→ ! message".

Functions:
${['Math', 'Logic', 'Lists', 'Records', 'Text', 'Dates', 'Cells', 'Actions']
  .map((g) => `${g}\n` + FUNCTIONS.filter((f) => f.group === g).map((f) => `  ${f.name} — ${f.use} — ${f.does}`).join('\n'))
  .join('\n')}

## Events

A cell's on prop, and the document's on (set with ["meta", "on.open", action]), map an event name to an action: the same kind of expression as a button's do, so set!, insert!, emit! and the rest work. While it runs, the event's data is bound by name (value, was, row, …) and as the record event (event.name, event.target); a bound name hides a cell of the same name, which (ref name) still reads.

Events cells raise:
- change (any cell with a value: inputs, lists, tables, calendars, canvases, data, formulas, tabs, accordions, collapsibles, timers, fetches): value, was. It follows the value, whoever changed it: a person, a button, a handler or an agent. A list also binds item and index (the item ticked, added or edited); a formula raises it when what it reads changes.
- click, dblclick (text, image, icon, stat, chart, formula, table, list, calendar, diagram; button: click runs do, then on.click): target (the cell's name or id); a table row binds row and index, a list item item and index, a diagram shape element. When a cell handles dblclick, a single click waits 250 ms and a double-click runs only dblclick; without a dblclick handler, click runs at once.
- pick (table): rows (the picked records), value (their keys), was.
- open, close (accordion: title, value; collapsible: value).
- tick (timer): count (ticks since it started), at.
- load (fetch): data and value (the answer). fail (fetch): message, status.
The document raises open (once each time someone opens it in Live) and close (when they leave it; best effort when a tab is closed).

Custom events: (emit! "saved" {total total}) reaches every cell and the document with an on.saved handler, which see payload (what was sent) and from (the cell that emitted).

Custom actions, defined once for the document and called from any action like a built-in: ["meta", "actions.greet", ["fn", ["who"], ["set!", "hello", ["str", "Hi ", "$who"]]]], then (greet "Ann"). Calling a name that is neither built in, an action nor a cell holding a function shows an error in the cell (and in the outline) before anything runs.

Where things run: events fire only while someone uses the document in Live (never in Edit, never on paper). A person's clicks and changes run in that person's browser, and one gesture with everything its handlers changed undoes in one step. open and close run once per person who opens it. Timers, fetches and their handlers, and changes made by agents, run once on the server while anyone has it open in Live, so nothing runs twice. A handler that sets itself off stops after 8 levels with an error.

Examples:
  ["input", {"name": "agree", "type": "checkbox", "on": {"change": ["set!", "status", ["if", "$value", "Agreed", "Not yet"]]}}]
  ["list", {"name": "todo", "type": "check", "on": {"change": ["when", ["every", ["get", "$it", "done"], "$value"], ["insert!", "done", {"items": "$value"}], ["show!", "thanks"]]}}, "Book", "Pack"]
  ["table", {"name": "people", "value": […], "on": {"click": ["set!", "chosen", ["get", "$row", "name"]]}}]
  ["timer", {"name": "every-minute", "every": 60, "on": {"tick": ["refresh!", "rate"]}}]
  ["fetch", {"name": "rate", "on": {"load": ["set!", "warn", [">", ["get", "$data", "rate"], 5]], "fail": ["set!", "problem", "$message"]}}, "/api/demo/rate"]
  ["meta", "on.open", ["set!", "visits", ["+", "$visits", 1]]]

## Ops

  ["split", cell, "row"|"col", {"before"?: true, "ratio"?: 0.5, "cell"?: notation}]  divide; the new cell is empty unless given
  ["merge", a, b, …]          fuse neighbouring cells, a rectangle of a grid, or one whole row/col
  ["remove", cell]            delete; neighbours take the space
  ["dup", cell]               copy a cell (and everything in it) after itself
  ["swap", a, b]              exchange two cells
  ["move", cell, ref, "before"|"after"]
  ["put", cell, notation]     give a cell new content, keeping its id, name and size. The fastest way to build: put a whole row/col tree into one cell.
  ["set", cell, prop, value]  one property: "value", "text", "expr", "name", "size", "style.bg", "on.click", … (null removes)
  ["style", cell, {…}]        several style properties at once
  ["draw", diagram, element, …]   add elements to a diagram, or change those whose id exists (a field set to null is removed); new boxes without x/y are placed below the box an arrow comes from
  ["erase", diagram, id, …]   remove diagram elements and the arrows attached to them
  ["meta", "title"|"width"|"minHeight"|"currency"|"page"|"orientation"|"margin"|"footer"|"font"|"headFont"|"fontSize", value]
                              page: "A4" (default), "A5", "Letter", "Legal"; orientation: "portrait" or "landscape";
                              margin: millimetres (default 16); footer: "number", "title" or "none" — used by the printed pages;
                              font and headFont: the document's text and heading fonts (font ids as in style); fontSize: base px (15)
  ["meta", "on.open"|"on.<event>", action]   one of the document's handlers (null removes)
  ["meta", "actions.<name>", ["fn", [params…], body…]]   define (or with null remove) a custom action
  ["do", op, op, …]           all or nothing

cell is an id or a name. Ops in one call are applied atomically.

## Data

Documents can save records into named collections and read them back: a button with ["insert!", "orders", {"qty": "$qty", "total": "$total"}] saves; ["rows", "orders"] reads (every record gets id and at). Collections are shared by all documents.

## Working well

1. Read the document first (outline). Refer to cells by name when they have one.
2. Build in few ops: one put with a nested tree beats twenty splits.
3. Name the cells that others read. Keep inputs and the formulas that use them visibly close.
4. After applying, look at the returned values and errors, and fix what is red.
5. Use "hug" for rows that should be only as tall as their content (headers, table lines), weights for the rest.
`;
