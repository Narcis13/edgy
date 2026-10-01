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
  { group: 'Actions', name: 'set! toggle!', use: '(set! count (+ count 1))', does: 'Change an input\'s value.' },
  { group: 'Actions', name: 'insert! delete! clear!', use: '(insert! "orders" {qty qty})', does: 'Save a record to a collection, delete one by id, or empty it.' },
  { group: 'Actions', name: 'update!', use: '(update! "orders" (get row "id") {status "paid"})', does: 'Change some fields of a saved record. In a table\'s row action, row is that row\'s record.' },
  { group: 'Actions', name: 'dup! remove!', use: '(dup! (child lines -1))', does: 'Copy or remove a cell, e.g. add a row. (child group n) picks the nth cell of a row or column; -1 is the last.' },
  { group: 'Actions', name: 'do', use: '(do a b c)', does: 'Several actions in order. Reads see the document as it was before the action.' },
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
- empty: nothing yet.

Props on any cell:
- id: assigned for you; read it back from the outline.
- name: lets other cells refer to it. Letters, digits, - and _.
- size: within its row/col, a weight (default 1), "hug" (as small as its content), or a fixed "120px".
- hidden: true, or an expression; the cell disappears while it is true.
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

## Ops

  ["split", cell, "row"|"col", {"before"?: true, "ratio"?: 0.5, "cell"?: notation}]  divide; the new cell is empty unless given
  ["merge", a, b, …]          fuse neighbouring cells, a rectangle of a grid, or one whole row/col
  ["remove", cell]            delete; neighbours take the space
  ["dup", cell]               copy a cell (and everything in it) after itself
  ["swap", a, b]              exchange two cells
  ["move", cell, ref, "before"|"after"]
  ["put", cell, notation]     give a cell new content, keeping its id, name and size. The fastest way to build: put a whole row/col tree into one cell.
  ["set", cell, prop, value]  one property: "value", "text", "expr", "name", "size", "style.bg", … (null removes)
  ["style", cell, {…}]        several style properties at once
  ["meta", "title"|"width"|"minHeight"|"currency"|"page"|"orientation"|"margin"|"footer"|"font"|"headFont"|"fontSize", value]
                              page: "A4" (default), "A5", "Letter", "Legal"; orientation: "portrait" or "landscape";
                              margin: millimetres (default 16); footer: "number", "title" or "none" — used by the printed pages;
                              font and headFont: the document's text and heading fonts (font ids as in style); fontSize: base px (15)
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
