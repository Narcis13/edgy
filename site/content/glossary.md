---
title: Glossary
---

This page defines the words the docs use, one meaning each, so that a word in one page means the same thing in every other.

## A–Z

### Action {#term-action}

An expression that changes something instead of working out a value: [set!](fn:set!) a cell, [insert!](fn:insert!) a record, [emit!](fn:emit!) an event. A button's `do`, a handler and a custom action are actions. Actions run only when something happens, never while a formula is worked out. See [Events and actions](/events/).

### Agent {#term-agent}

A program that works on documents the way a person does, through the same ops: an AI model connected over [MCP](/agents/mcp/), or anything that calls the [HTTP API](/agents/http/). Its changes show in **Activity** as the agent acting for its person.

### API key {#term-api-key}

A secret that lets an agent act for one person. You make one in **Profile → API keys**; it is shown once. See [API keys](/people/api-keys/).

### Cell {#term-cell}

The one building block of a document. A cell has a kind, an id and, when others read it, a name. A document is one root cell, divided into more cells by splitting. See [Cells](/cells/).

### Cell details {#term-cell-details}

The panel on the right of the editor, where you name the selected cell, design it, style it and give it handlers. It opens with the panel button in the header (**Cell details** in the More menu on a phone). See [The right-hand panel](/editor/panel/).

### Collection {#term-collection}

A named set of records that belongs to an account and outlives any one document: a button saves to it with [insert!](fn:insert!), any of its owner's documents reads it with [rows](fn:rows). See [Collections](/data/collections/).

### Container {#term-container}

A cell that holds other cells in panels and shows some of them at a time: [tabs](kind:tabs), an [accordion](kind:accordion) or a [collapsible](kind:collapsible).

### Custom action {#term-custom-action}

An action you define once for the document, with a name and parameters, and call from any other action like a built-in function: `(greet "Ann")`. See [Custom events and actions](/events/custom/).

### Custom event {#term-custom-event}

An event with a name you choose, sent by [emit!](fn:emit!) to every cell (and the document) that handles it. See [Custom events and actions](/events/custom/).

### Deck {#term-deck}

Documents grouped in an order, played one after another as slides. See [Decks](/library/decks/).

### Document {#term-document}

What you make in edgy: one tree of cells, with a title and settings, its history of ops, and the people who may open it. Never called a page (a page is paper) or a sheet.

### Edit, Live, Page {#term-view}

The three views of a document. **Edit** shapes it: select, split, merge, design. **Live** uses it the way people will: type, tick, press; handlers run. **Page** shows it as printed pages. See [Edit, Live and Page](/start/views/).

### Element {#term-element}

A shape, line, arrow or piece of text inside a [diagram](kind:diagram) cell. Elements are not cells.

### Event {#term-event}

Something that happens to a cell or the document (a click, a value changing, a timer's tick, the document opening) that a handler can react to. See the [list of events](/events/reference/).

### Expression {#term-expression}

A piece of edgy's language: `(* qty price)`. Formulas, actions, conditions and text templates are all expressions. Stored as JSON (`["*", "$qty", "$price"]`), shown and typed as above. See [The language](/language/).

### Formula {#term-formula}

A cell whose value is worked out from an expression, and follows whatever it reads. See [formula](kind:formula).

### Group {#term-group}

A [row](kind:row) or [col](kind:col): a cell that lays other cells out side by side or stacked. Splitting a cell that isn't in a group of the right direction makes one.

### Handler {#term-handler}

An action attached to an event of a cell (its `on`) or of the document: run each time that event happens, in Live.

### Kind {#term-kind}

What a cell is: text, input, formula, table, and so on. Every kind is listed on [Cells](/cells/). You choose it from the `/` menu.

### Leaf {#term-leaf}

A cell that holds no other cells: everything except a group, a container or a panel.

### Library {#term-library}

The home page: every document and deck you own or were given, with search, pins and the archive. See [Library](/library/).

### Local mode {#term-local-mode}

How edgy runs on your own machine with nothing configured: you are signed in as a local account without signing up, and agents on the same machine need no key. See [Accounts](/people/accounts/).

### Name {#term-name}

What a cell is called so others can read it: `total`, `qty`. A name starts with a letter (or `_`) and holds letters, digits, `-` and `_`. See [Names and references](/language/names/).

### Notation {#term-notation}

Cells written as JSON lists, the way agents and templates write documents: `["formula", {"name": "total"}, ["*", "$qty", "$price"]]`. See [Notation](/agents/notation/).

### Op {#term-op}

One change to a document, as a small list: `["split", "c4", "row"]`. Every change, by a person or an agent, is an op; undo applies the op that reverses it. See [Ops](/agents/ops/).

### Outline {#term-outline}

The compact text view of a document an agent reads: every cell with its kind, name, value and errors.

### Owner, editor, viewer {#term-role}

The three roles a person can have on a document. The owner made it and decides who else may open it; an editor changes it; a viewer reads and uses it in Live. See [Sharing with people](/people/sharing/).

### Page {#term-page}

A sheet of paper, as **Page** view and printing show the document. The paper size, margins and footer are the document's page setup. See [The Page view](/editor/page-view/).

### Panel cell {#term-panel}

One section of a container: a tab of [tabs](kind:tabs), a section of an [accordion](kind:accordion). See [panel](kind:panel). Not the same as the right-hand panel, which is [Cell details](#term-cell-details).

### Presence {#term-presence}

Who else has the document open, and which cell each of them has selected, shown in the header and on the cells. See [Presence](/people/presence/).

### Record {#term-record}

One entry in a collection: a set of named values such as `{client "Ada" total 1840}`, with an `id` and the time it was saved (`at`).

### Reference {#term-reference}

A cell's name used in an expression to read its value: `qty` in `(* qty price)`. A relative reference such as `(sib 1)` reads a cell by its place instead. See [Names and references](/language/names/).

### Share link {#term-share-link}

A link anyone can open, without an account, that shows one document in Live, to view or to edit. See [Share links](/library/share-links/).

### Style key {#term-style-key}

One setting of a cell's look: `bg`, `pad`, `align`… See [Style keys](/styling/style-keys/).

### Sync {#term-sync}

Keeping the local file and a cloud database in step, so the same account finds the same documents on another machine. See [Sync](/people/sync/).

### Template {#term-template}

A starting document: **Quote**, **Savings plan**, and the documents the tutorials end with. See [Templates](/library/templates/).

### Text template {#term-text-template}

An expression inside text, between double braces: `Total: {{total | currency}}`. See [Text templates](/language/templates/).

### Colour token {#term-token}

A colour named by what it means rather than how it looks (`accent`, `muted`, `bad`), so it follows the light and dark themes. See [Theme](/styling/theme/).

### Value {#term-value}

What a cell holds or works out: the number in an input, the result of a formula, the items of a list, the records of a table.
