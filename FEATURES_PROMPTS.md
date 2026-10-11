# Feature prompts

Five briefs for `/goal-loop` (the skill is in `goal-loop/`, edgy's facts for it in `.claude/goal-loop/`). Each has the two parts the skill reads,
**Feature** and **Done means ALL of**, plus constraints and, where it matters, the choices worth settling
before the run. Anything left open is decided by the loop and written under **Decisions** in PROGRESS.md.

Run one brief per session:

```
/goal-loop Brief 4 (New elements) in FEATURES_PROMPTS.md, that brief only
```

or save a brief as its own file (for example `docs/briefs/new-elements.md`) and pass the path.

The standard gates are not repeated below; they apply to every brief (see `brief-template.md`): typecheck,
tests and the production build pass and new logic has tests; no console or network errors on any screen at
desktop and phone size; a showcase template that uses every new feature, with evidence under
`docs/showcase/<slug>/`; README and the agent guide (`/api/guide`) describe what was added.

Suggested order: **4 → 2 → 1 → 3 → 5**. The new elements are self-contained. Events build on them (a tab
changing, a shape being clicked). The home page changes storage. Accounts touch every route and the
verification scripts, and they turn brief 1's share links into per-person access. The documentation goes
last: it describes everything the others built, and its coverage test then keeps later briefs documented.
Each brief is still written to stand on its own.

| # | brief | the parts marked ultrathink |
|---|---|---|
| 1 | Home page for many documents | decks played as slides, self-contained HTML export |
| 2 | Events and actions | the event model, fetch |
| 3 | Accounts, collaboration and cloud sync | the access model, collections, sync |
| 4 | New elements | containers in the cell tree, the diagram |
| 5 | Documentation site | how the site is built, the two reading paths, live examples, keeping it true |

---

## 1. Home page for many documents

### Feature

The home page is one grid of cards with a delete button (`src/web/pages/Home.tsx`), and `GET /api/docs`
sends every document in full. Rebuild it as a library that stays usable with hundreds of documents.

- **Find.** Search across titles, descriptions and the text inside documents. Sort by last changed, created
  or title. Filter by pinned, shared, archived and decks. Grid and list views. The view and sort are remembered.
- **Describe.** A document has a description, edited from its card and from inside the document, shown on
  the card and searchable.
- **Pin.** Pinned documents sit in their own section at the top, in an order the person can change.
- **Archive and delete.** Archiving takes a document out of the main list without losing anything and can
  be undone. Deleting is permanent and asks first. Both work on one document or on a selection of several.
- **Share.** A document can be shared by link. The link opens it in Live view with no editor and no way to
  the other documents. A link is either "can view" or "can edit" and can be turned off again. Shared
  documents carry a badge on the home page.
- **Decks (ultrathink).** Select two or more documents and group them into a deck: an ordered set with its
  own title and description, shown as one card. The documents stay separate documents and can be reordered,
  added and taken out. **Play** shows the deck as slides: one document per slide, fitted to the screen, live
  (inputs and buttons work), moved through with the arrow keys, a click or a swipe, with a slide counter,
  full screen, and Esc to leave. Think about how a document that is taller or wider than the screen becomes a slide.
- **Self-contained HTML (ultrathink).** Export a document or a deck as a single `.html` file that opens
  from disk with no server and no network: layout, fonts, images and icons are inside the file; formulas,
  inputs and buttons still work; a deck still plays as slides. Records the document reads from collections
  are included as they were at the moment of export.
- **Agents.** Everything above is available over the HTTP API and the MCP tools, not only in the browser.

### Done means ALL of

- With 300 seeded documents the home page loads, scrolls and answers typing in the search box without
  visible lag at desktop and phone size, and the list request no longer carries whole documents (its size
  before and after is in the Log).
- Search finds a document by a word that appears only in its title, only in its description, and only
  inside one of its cells. Clearing the search restores the list. No result shows an empty state.
- A description typed on a card is still there after a reload and can be read and changed inside the document.
- A pinned document stays in the pinned section across reloads and whatever the sort; the pinned order can
  be changed and is kept; unpinning puts it back.
- An archived document leaves the default list, appears under the Archived filter, and comes back with its
  content and history unchanged. Delete asks first; afterwards the document's URL shows a clear "not found"
  page, not a broken editor.
- Selecting several documents offers pin, archive, delete and group, usable by keyboard and on a phone.
- A share link opened in a fresh browser profile shows the document in Live with no editing controls and no
  navigation. A "can view" link cannot change the stored document (an ops POST with its token is rejected).
  A "can edit" link's changes appear live for the owner. A link that was turned off shows a clear
  "no longer shared" page. Tokens are long and random.
- Grouping three documents creates a deck card. Reordering is kept. Play moves with → and ← and with a
  swipe on a phone; each slide fits 1440×900 and 390×844 without horizontal overflow; an input changed on
  slide 1 is still changed after going to slide 2 and back; Esc returns to where Play started. Ungrouping
  leaves the documents intact.
- The exported HTML of the showcase document, opened from `file://` with the network disabled, looks like
  its Live view (screenshots side by side), recalculates a formula when an input changes, and makes zero
  network requests. The exported deck plays every slide. The file sizes are in the Log.
- Over the API and MCP an agent can search, describe, pin, archive and restore documents, and create and
  reorder a deck. The guide describes how.
- A database created by the current version opens after the upgrade with every document, its history and
  its records in place (tested on a copy made by the old code).
- New tests cover search matching, pinned order, archive and restore, deck ordering, the share token access
  rules, the migration, and an export that contains no external URLs.

### Constraints

- No accounts in this brief. Sharing is by link token only; sharing with named people belongs to brief 3.
  Keep the access check in one place so that brief can extend it.
- A deck refers to its documents; it doesn't copy them. Deleting a deck never deletes a document.
- Every document in a deck evaluates on its own. Slides share data only through collections.
- An export holds only what its document shows and reads: no other documents, no unrelated collections, no keys.
- Schema changes migrate an existing database in place. Never run them against `data/edgy.db` while verifying.

### Decide before running

- In an exported file, should actions that save records (`insert!`, `update!`) work in memory for that
  session, with a visible "offline copy" note (recommended), or be switched off?
- The server listens on 127.0.0.1, so a share link reaches other people only once the app is hosted
  somewhere they can open. This brief covers the links and the access rules, not hosting.

---

## 2. Events and actions

### Feature

Today only buttons and table row buttons run actions (`do`), and the only thing that happens by itself is
`(now)` ticking. Make documents react to events. **Ultrathink the model**: one mechanism for everything
below, in the same language as formulas and actions, stored in the document as plain JSON, changed by ops
like everything else, and readable in notation and in the outline.

- **Document lifecycle.** The document was opened (loaded and evaluated). Closing too, if it can be made reliable.
- **Value changes.** A checkbox or a list item is ticked, an input changes, a table row is picked, a
  calendar day is chosen, a canvas is signed, any named cell's value changes. The handler sees the old and
  the new value.
- **Pointer.** Click and double-click on any cell (text, image, icon, stat, chart), on a table row and on a
  list item. The handler knows what was clicked.
- **Time.** After a delay, and every interval (say every 30 seconds). Actions can start and stop a timer.
- **Fetch (ultrathink).** Get JSON from a URL, with a visible loading state, an event when the data
  arrives and another when it fails, the data readable by formulas, and a refresh on demand or on an interval.
- **Custom events.** Any action can emit a named event with a payload; any cell, or the document, can listen for it.
- **Custom actions.** Define a named action with parameters once, in the code studio, and call it from any
  handler like a built-in one.
- **Code studio.** An Events part for the selected cell and for the document: the events it can raise, the
  handlers attached, each editable as code or as Blocks, a way to fire an event by hand to try it, and a
  trace in Activity of the events that fired and what each one changed.
- **AI.** Ask AI writes all of this from a sentence: a handler, a custom event, a custom action. "When
  every box is ticked, save the checklist to done and show the thank-you note." "Every minute fetch the
  rate and warn when it is above 5." It works on the three paths that exist today (Claude API, an agent
  over MCP, the offline composer), and the answer is checked against the document before the person sees it.

### Done means ALL of

- A document with an on-open handler runs it once per open in Live (a counter proves it) and not while
  designing in Edit, unless fired by hand from the studio.
- Ticking and unticking a checkbox each run its handler with the new value bound; the effect is confirmed
  through `GET /api/docs/<id>/read`.
- Click and double-click handlers on a text cell, an image and a table row each run and know their target.
  What a double-click does to the click handler is defined, documented and tested.
- An every-2-seconds handler has run 3 times (±1) after about 7 seconds, stops when an action stops it, and
  stops when the document is closed (no requests keep coming after navigating home). A one-off delay runs once.
- Fetch, against a fixture endpoint on the isolated server: the loading state is visible, the data arrives,
  the handler runs and a formula shows a field from the response. A 500 and an unreachable address run the
  failure handler with a message and show an error state, with no uncaught exception. No test needs the
  outside network.
- A button emits a custom event with a payload and two other cells that listen both react and read the payload.
- A custom action defined once is called from two buttons with different arguments. Calling a name that
  doesn't exist is an error shown in the cell and in the outline.
- A handler that triggers itself, directly and through a second cell, stops at a fixed depth with an error
  in the trace, and the tab stays responsive.
- One gesture by a person, with everything its handlers changed, is one undo step.
- Activity shows each event, the cell it came from and the ops it produced.
- A handler can be attached to a checkbox from the Events part using presets and Blocks only, without
  typing code (scripted clicks), on desktop, on a phone and in dark mode.
- Ask AI turns at least eight sentences, covering every event family above, into handlers that pass
  validation and do what was asked when run. Verified on the offline composer and on the Claude path with a
  mocked `fetch`; the Log says which paths were also checked live.
- The guide documents the event props, the new functions and the custom actions; an agent can attach a
  handler with ops, and the outline shows a cell's handlers.
- New tests cover dispatch and the data bound to each event, timers with a fake clock, the fetch states,
  custom events and actions, the loop guard, and the notation and ops round trip.

### Constraints

- Events fire in Live and in the studio's test button. Not in Edit, and not on paper: the Page view and the
  PDF show the document as it stands.
- Decide, and write under Decisions, what happens when two people have the same document open: which
  browser runs a timer or an on-open handler, so that a record isn't saved twice.
- Fetch: decide whether requests go from the browser or through the server. Through the server means no
  private addresses, and limits on size and time. A secret never goes into the document's JSON.
- `do` on buttons and on table rows keeps working as it is. Documents made before this change open and
  behave the same.
- A kind declares the events it can raise in one place, so kinds added later (tabs, diagram) join without
  touching the dispatcher.

---

## 3. Accounts, collaboration and cloud sync

### Feature

edgy has one user: no login, every document and collection open to whoever reaches the server, every person
called "You", and an MCP server that calls the API with no credentials. Make it multi-user. **Ultrathink
the access model and the sync design** before writing code; both touch every route and every table.

- **Sign up, sign in, sign out** with email and password. Sessions survive a server restart. On an existing
  installation the first account created becomes the owner of every existing document and collection.
- **Profile.** Display name, an avatar or initials with a colour, email, password change, theme, API keys,
  delete account.
- **Ownership and sharing.** Every document has an owner. The owner gives other accounts access as viewer
  or editor, changes it and takes it away. The home page separates "Mine" from "Shared with me". Share
  links, if brief 1 has been built, keep working and belong to the owner.
- **Collaboration.** The live ops stream that already exists carries real identities: who is in the
  document now, which cell each person has selected, and a name on every change in Activity. Two people
  editing at once don't lose each other's work.
- **Collections (ultrathink).** They are "shared by all documents" today, which would leak one person's
  records to another. Decide who can read and write a collection and how a shared document reads its owner's data.
- **API keys for MCP and HTTP.** A person creates named keys in the profile. A key is shown once, stored
  hashed, lists when it was last used, and can be revoked. The MCP server sends it (`EDGY_API_KEY` beside
  `EDGY_URL`). An agent sees and changes only what its person can, and its changes are traced as the agent
  acting for that person.
- **Cloud sync (ultrathink).** The local SQLite file stays the working store and syncs in both directions
  with a database in the cloud, so the same account finds the same documents, history and records on
  another machine. It works offline and catches up afterwards. The ops log is already an ordered,
  replayable history; consider it as the unit of sync. The cloud database is **Turso** (hosted libSQL,
  the same SQL dialect as the local file). Its credentials are in `.env` as `TURSO_URL` (`libsql://…`) and
  `TURSO_AUTH_TOKEN`; they have been checked to read and write, and the database starts empty. Once the
  sync is built, test it against this database.

### Done means ALL of

- Sign up, sign out and sign in work in the browser at desktop and phone size. A wrong password gives a
  clear message, repeated failures are slowed down, passwords are stored with a slow salted hash, and the
  session cookie is httpOnly and SameSite.
- Signed out, every page except sign-in and share links leads to sign-in, and every `/api` route except
  health answers 401 without a session or a key. A test walks the route table, so a route added later
  can't be forgotten.
- User B cannot list, read, change, delete or listen to the events of user A's document, checked over HTTP
  for every route, until A gives access. A viewer cannot post ops; an editor can. Taking access away takes
  effect at once, including on an event stream that is already open.
- A database created by the current version: the first account owns everything and nothing is lost (tested
  on a copy made by the old code).
- Two browsers signed in as two people in the same document: each sees the other present and the cell they
  have selected, an edit appears on the other side within a second, simultaneous edits to different cells
  both survive, and Activity shows both names. Screenshots of both sides are in the evidence.
- Profile: a changed name shows up in presence and Activity; a password change signs out the other
  sessions; deleting the account asks first and does what Decisions says happens to its documents.
- API keys: create one, copy it once, and use it through the MCP server to list only that person's
  documents and apply an op, traced as the agent acting for them. A revoked or missing key fails with a
  clear message on every tool. A key never appears in logs, in a document or in any response after creation.
- Collections follow the rule that was decided, and tests show B cannot read A's records through
  `/api/data`, through `(rows …)` in B's own document, or through a shared document beyond what the rule allows.
- Sync, with two isolated instances on the same account and the same cloud target: a document created on
  one appears on the other; edits travel both ways; edits made while the cloud is unreachable are delivered
  when it returns, with no lost or duplicated ops (the two op logs are compared); conflicting offline edits
  resolve the way Decisions describes; the UI shows synced, syncing or offline. Verified end to end against
  the Turso database in `.env`, with the row counts on both sides in the Log. A local stand-in is fine for
  unit tests; if the Turso credentials stop working, list the provider under Blocked with exactly what is
  needed rather than passing on the stand-in alone.
- The review before the final audit includes a security pass: authorization on every route, token and key
  handling, CSRF on writes made with the cookie. Findings are fixed, or listed with the reason they were not.
- `.claude/goal-loop/` (`project.md`, `serve.sh`, `screens`, the `cdp.mjs` recipes) is updated so
  later loops can verify signed-in screens, and the full sweep passes signed in.
- README covers accounts, sharing, API keys for agents and setting up sync.

### Constraints

- Use `node:crypto` for hashing and tokens where it does the job. Any auth or sync library is named, with
  the reason, under Decisions.
- Secrets (cloud credentials, session secret) come from the environment and are never committed. `.env`
  stays in `.gitignore`.
- No email is sent. Access is given to existing accounts or by an invitation link. Delivery by email is out
  of scope unless SMTP credentials are provided.
- Never run a migration or a sync against `data/edgy.db` while verifying.
- The Turso database is for development and verification. Each verification run works in a space of its
  own (a fresh account, or a prefix or schema of its own) and removes what it created, or says in the Log
  what it left there. The token never appears in the Log, evidence, screenshots or command output.
- Turso bills by rows read and written, counting every row a query scans. Pulls read from an indexed
  position in the log and never scan whole tables.
- Without `TURSO_URL` and `TURSO_AUTH_TOKEN`, edgy runs local-only exactly as before, and the UI says sync is off.
- Keep the one-command local start: decide whether `npm run dev` with nothing configured signs a single
  local account in automatically (recommended), and write it down.

### Decide before running

- **Cloud database (settled).** Turso, credentials in `.env` (`TURSO_URL`, `TURSO_AUTH_TOKEN`). Chosen
  because it speaks the same SQLite dialect as the local store and has the most generous free tier (100
  databases, 5 GB). Name the client used (`@libsql/client` or plain HTTP) under Decisions.
- **Sign-in.** Email and password only (the default above), or also Google or GitHub, which needs OAuth
  client credentials.
- **Collections.** Per owner (the recommended default), or shared explicitly the way documents are.

---

## 4. New elements

### Feature

Five new things a cell can be.

- **Collapsible.** A heading that folds and unfolds the content under it.
- **Accordion.** Several collapsible sections as one element, either one open at a time or any number.
- **Tabs.** Several panels behind a tab bar, one shown at a time.

  These three hold other cells, in any layout. **Ultrathink how they fit the tree**: only `row` and `col`
  hold cells today and `normalize` tidies groups, so decide whether these are new group kinds or a way of
  showing a `col` whose children carry titles, and what split, merge, move and duplicate mean inside them.
  Their state is a value: the open tab, the open sections. Other cells read it (`(= view "Details")`),
  actions set it (`(set! view "Details")`), and it is saved in the document the way a ticked list item is.

- **Diagram (ultrathink).** In the manner of Excalidraw: shapes (rectangle, ellipse, diamond), arrows and
  lines that stay attached to their shapes when those move, text on shapes, on arrows and on its own;
  select, move, resize, duplicate, delete, several at once; colours from the theme tokens; undo; mouse and
  touch. Its content is data in the document, a list of elements, so an agent can draw or change a diagram
  with ops and notation, formulas can read it, and a shape's text can carry `{{templates}}` and show live
  values. It is separate from the existing `canvas` (freehand drawing and signatures), which stays as it is.
- **Data cell (the hidden cell).** A cell that holds a value (a number, text, a list, a record) and is
  never shown to readers: it takes no space in Live, in Page view or on paper. In Edit it appears as a
  small labelled chip so it can be selected, named and edited. It is the place for the state and settings
  that control a document: the current step of a wizard, a flag that hides a section, a lookup list.
  Formulas read it by name; actions change it with `set!`.

Each of the five is a full citizen: the `/` menu, a designer in the right-hand panel, notation and outline,
a minimap glyph, the guide, Blocks and Ask AI.

### Done means ALL of

- Collapsible: a click on the heading, or Enter or Space with the keyboard, folds and unfolds it; the state
  survives a reload; it can start folded; it exposes `aria-expanded`.
- Accordion: in one-at-a-time mode opening a section closes the open one; in the other mode sections are
  independent. A section holds any cells (checked with a table and a chart inside).
- Tabs: a click or the arrow keys change the tab; the open tab is the cell's value and a formula elsewhere
  reacts to it; a button with `set!` changes it; at 390px the tab bar scrolls or collapses with no
  horizontal page overflow; formulas inside panels that are not shown still evaluate, so other cells can read them.
- Inside these containers, cells can be split, merged, moved, duplicated and removed. Tabs and sections can
  be added, renamed, reordered and removed from the designer and on the page. Undo restores each step, and
  a container with a single child survives `normalize`.
- Paper: collapsibles and accordions print unfolded and tabs print every panel in order under its title
  (or another rule, written under Decisions). No cell is cut between pages. Checked in the PDF.
- Diagram by hand: draw three shapes, connect them with arrows, label them, move a shape and the arrows
  follow; resize and delete; undo and redo every step; everything is still there after a reload; it works
  by touch at 390×844, reads well in dark mode and prints as sharp vector lines.
- Diagram as data: one ops POST builds a five-node flowchart from notation and it renders as written; a
  shape whose text is `{{total | currency}}` updates when `total` changes; a formula can count the shapes.
- Data cell: invisible and taking no space in Live, in Page view and in the PDF; a chip in Edit; a button's
  `set!` changes it and a `hidden` rule on another cell reacts; its value shows in the outline. The
  showcase has a wizard whose Next and Back buttons run on one.
- Every new kind can be chosen from the `/` menu, designed in the panel without writing code, round-trips
  through notation, has an outline line and a minimap glyph, and is described in `/api/guide`. Ask AI
  answers a sentence about each ("a button that opens the Details tab", "go to the next step").
- New tests cover the notation and ops round trip of each kind, `normalize` with containers, the tab and
  accordion state logic, the geometry that keeps arrows attached, data cell evaluation and `set!`, and
  pagination with unfolded containers.

### Constraints

- The diagram is drawn in the app's own SVG. No third-party editor is embedded unless Decisions gives the
  reason: bundle size, theme tokens, print and notation all argue for building it natively.
- Documents made before this change open unchanged.
- The `hidden` prop stays as it is. A data cell is a different thing: readers never see it, whatever its rules.
- If brief 2 (events) is already built, a tab changing, a section opening and a shape being clicked are
  events. If it isn't, leave one obvious place where they will be raised.

---

## 5. Documentation site

### Feature

edgy has a README, the agent guide (`GUIDE` in `src/core/reference.ts`, served at `/api/guide`) and short
hints inside the app. A person opening edgy for the first time has nowhere to learn it, and a developer
has nowhere to learn how it works. Build a documentation site for both: a beginner who has never seen a
cell, and a developer who wants to know what happens between a keystroke and the cloud log. It opens from
the app's header, and the same site builds into a folder of static files that can be deployed on its own.

- **How it is built (ultrathink).** One source, two outputs: the site served by the app at `/docs/`, and
  a standalone static build that works at any path on any static host. Pages are real HTML that read in
  full without JavaScript; scripts add search, the phone drawer, the theme switch, copy buttons and live
  examples. Decide how pages are authored, rendered and linked so both outputs come from one build.
- **Two reading paths (ultrathink the order and the depth).** A beginner path that starts from nothing
  and goes one step at a time to events, data and sharing; a reference for looking things up; and an
  "Under the hood" path for developers. Every page says what it covers in its first sentence and links to
  what comes before and after.
- **What it covers.**
  - *Getting started*: installing and running (`npm run dev`, local and accounts mode, sync), the
    anatomy of each screen, a first document in ten minutes, Edit, Live and Page, the keyboard.
  - *Tutorials*, each ending with a finished document the reader can open in the app as a template: a
    quote with formulas; a checklist that reacts when every box is ticked; a wizard driven by a data cell;
    an order tracker that saves to a collection; a dashboard of charts and stats; a flowchart diagram
    showing live values; a deck played as slides; sharing with a colleague; printing and exporting an
    offline copy; connecting an agent over MCP.
  - *Cells*: one page per kind, all 24 (`GROUP_KINDS` and `LEAF_KINDS` in `src/core/types.ts`). What it
    is for, how to add and design it, its props in notation, its value, the events it raises, the actions
    that change it, how it behaves on a phone and on paper, a live example, and the usual mistakes.
  - *The editor*: selecting, splitting, merging, moving and duplicating; the `/` menu; the right-hand panel
    section by section; the formula bar; the code studio, Blocks and Ask AI (all three paths); Activity;
    links between cells; the minimap; undo; the Page view and page setup.
  - *The language*: syntax and values, what counts as true, names and references, relative references,
    `{{templates}}`, formats, every error a person can see and what to do about it, and every function and
    action with its signature, an example and that example's result.
  - *Events and actions*: the model, every event and the data it binds, timers, fetch, custom events and
    actions, the loop guard, how undo groups a gesture, and which browser runs what when two people have
    the document open.
  - *Data, styling, library, people*: collections and the Data page; style keys, theme tokens and fonts;
    search, pins, archive, decks, Play, share links and export; accounts, roles, presence, API keys, sync.
  - *Agents*: the MCP server and each of its tools; the outline, notation and ops; the HTTP API, every
    route with the access it needs (`need(…)` in `src/server/app.ts`).
  - *Under the hood*: the architecture; Cell, Doc and Op as plain JSON; `applyOp`, inverse ops and undo;
    `normalize`; the engine (evaluation order, dependencies, ticking); the interpreter in `sx.ts`; notation
    round trips; the browser session (optimistic ops, rebasing on the event stream); the SSE hub; storage,
    the schema and its migrations; the runner; access, passwords, sessions and keys; the sync design; the
    export pipeline; pagination; compose (sentence → code). Each page names the source files it describes
    and links to them on GitHub.
  - *Contributing*: the repository layout, the gates and tests, and a checklist for adding a kind, a
    function, an event or a route (every place each one touches).
  - A glossary, and a troubleshooting page built from the messages a person actually sees.
- **Pictures where they explain.** Inline SVG diagrams for what is easier seen than read: the cell tree
  under split and merge, the life of an op from a keystroke to the other browsers, event dispatch, the two
  sync logs, the access model, the evaluation graph, pagination. Annotated screenshots of the real app for
  every screen and panel, in light and dark. Short clips where motion is the point: splitting a cell,
  drawing an arrow, playing a deck.
- **Live examples (ultrathink).** Where playing teaches better than a picture, an example is a real edgy
  document running in the page: change an input and the formula under it changes, press a button and its
  action runs. The offline runtime built for exports (`vite.offline.config.ts`, `src/web/offline/`)
  already runs a document with no server; consider it. When the app serves the docs, an example has an
  "Open in edgy" link that makes it a document of the reader's own.
- **Search.** Every page, function, kind, event, op, route and MCP tool, from an index built with the
  site and searched in the browser. Opened with `/` or ⌘K and usable by keyboard alone. No outside service.
- **Finding the way.** A sidebar of sections, an "On this page" list, previous and next, breadcrumbs, a
  link on every heading, a copy button on every code block, and a 404 page. On a phone the sidebar is a drawer.
- **Inside the app.** A **Docs** link in the header of the home, data and profile pages and of a document
  (in the More menu on a phone). Each kind's designer in the right-hand panel links to that kind's page,
  and the code studio's function hints link to the function's entry.
- **Keeping it true (ultrathink).** Wrong docs are worse than none, and edgy keeps changing. Lists that
  exist in code (kinds, functions, events, ops, routes, MCP tools, style keys, formats, theme tokens,
  keyboard shortcuts, templates) are generated from the code, never copied by hand. Every runnable example
  is checked by a test. Screenshots come from a script run against a fresh server, so they can be redone
  after any change. Adding a kind, function, event, op, route or tool without its docs fails a test.

### Look

The site belongs to the app. Same tokens (`src/web/styles.css`), same fonts, the `(•)` logo, the same
accent, spacing, radius, line weight and density, the same light and dark themes. It should read like a
well-set reference book, not a landing page.

- No gradients, glows, glass, blurred backdrops, text shadows, decorative animation, hero art or stock
  images. Flat surfaces and 1px lines (`--line`). Shadows only where the app uses them (menus, popovers).
- The accent marks what can be acted on or where you are: links, focus, the current page in the sidebar.
  Colour in a diagram comes from the theme tokens and chart series, and always means something.
- Code looks the way it does in the code studio: its highlighter and its function group colours.
- Diagrams are hand-built inline SVG: real text, colours through the theme's CSS variables so they switch
  with dark mode, one stroke weight, no filters, a title and description for screen readers.
- Text is set for reading: about 70 characters to a line, clear heading steps, steady vertical rhythm.
- The writing follows the project's voice: plain, concrete, second person, short sentences, the UI's exact
  labels, one word for one thing (the glossary's word). No marketing voice and no emoji.

### Done means ALL of

- `npm run docs:build` writes a folder of static files. Served by a plain static file server on another
  port under a sub-path (for example `/edgy-docs/`), with the app's server stopped, every page opens,
  links work, search works, live examples run, and no request leaves that folder. The folder's size and
  page count are in the Log.
- The app serves the same site at `/docs/`, signed in and signed out, without opening any `/api` route to
  signed-out visitors (the route-table test still passes). The Docs link is in the header of home, data,
  profile and a document at desktop size, and in the More menu at phone size (screenshots).
- Coverage: a test lists every kind, every function the interpreter knows (`builtinNames` in `sx.ts`),
  every event (`KIND_EVENTS`, `DOC_EVENTS`), every op `applyOp` accepts, every API route, every MCP tool,
  every style key, format and theme token, every keyboard shortcut (gathered into one list in code if they
  aren't yet) and every template, and fails when one has no entry in the docs. Its counts are in the Log.
  Adding an undocumented function makes it fail (shown once, then reverted).
- Doc-tests: every example marked runnable is evaluated by a test and gives the result the page states;
  every notation snippet parses; every ops example applies to the document shown with it. Counts in the Log.
- A link check over the built site finds no broken internal link or anchor. External links are listed in the Log.
- Each tutorial is done for real: a script (Claude in Chrome for drawing and dragging) follows its steps
  on a fresh server and ends with a document that matches the tutorial's last picture, side by side in the
  evidence. Each tutorial's finished document opens from its page as a template.
- Live examples, in the static build with no server: changing an input updates a formula, a button runs
  its action, a tab changes, a ticked checkbox runs its handler. Records live in memory and say so. No
  example's code loads before the example is near the screen.
- Search finds `sum-by` (a function), `accordion` (a kind), `dblclick` (an event), `undo` (an idea) and a
  phrase that appears only in a page's body. It works by keyboard alone; a word with no match shows a
  clear empty state. The index size is in the Log.
- Every page is shot at 1440×900, 820×1180 and 390×844, light and dark, and every shot is read: no
  horizontal overflow (code and tables scroll inside themselves), no clipped or overlapping text, touch
  targets of at least 40px on a phone. The sweep's CONSOLE count is 0.
- The look: the docs take the app's tokens from the same source (changing `--accent` in
  `src/web/styles.css` changes both; shown once, then reverted). A test finds no gradient,
  `backdrop-filter`, `text-shadow` or SVG filter in the built CSS and SVG. The app's home and the docs'
  home are side by side in light and dark in the evidence.
- In the app, the docs open in the theme the person chose there; deployed alone they follow the system;
  both have a toggle that is remembered.
- Accessibility: an automated check (named under Decisions) reports no serious or critical issue on any
  page. A skip link, visible focus, headings with no skipped levels, alt text on every screenshot, a title
  on every diagram; the phone drawer opens and closes by keyboard and Esc. Contrast meets WCAG AA in both themes.
- Weight: a text page with no live example, fonts aside, is under 100 KB compressed; fonts are
  self-hosted and subset; nothing loads from a third party. The measured numbers are in the Log.
- Printing a docs page gives clean paper: no sidebar, search or drawer, code wraps, diagrams print as
  vector lines. Checked in the PDF.
- One script makes every screenshot and clip in the docs from a fresh server, in light and dark; running
  it twice gives the same set (any file that changes is named in the Log).
- A reviewer agent that did not write a section checks every page in it against the code it describes.
  Each wrong claim is fixed; the Log has the number found and fixed per section.
- README and `/api/guide` point to the docs; README says how to build, preview and deploy them; and
  `.claude/goal-loop/` (`gates`, `screens`, `project.md`) covers the docs, so the coverage test, the
  doc-tests and the link check run in every later loop.

### Constraints

- No documentation framework (Docusaurus, VitePress, Astro, Starlight, Nextra and the like) unless
  Decisions gives the reason. They bring their own look, their own front-end stack and their own weight,
  and this site has to look like the app and reuse its highlighter and runtime. Build on what is here:
  Vite, React rendered to HTML at build time, the app's own pieces where they fit. Any new dependency (a
  Markdown parser, an accessibility checker for verification) is named under Decisions.
- URLs are clean, lower-case and stable (`/docs/cells/table/`). Links are relative, or go through one
  base setting, so the same build works at `/docs/` in the app and at any path on a static host.
- The docs' source lives in a folder of its own. `docs/` already holds progress records and showcase
  evidence; keep them apart.
- Live examples run in the reader's browser only and never write to a server.
- Screenshots and clips come from templates and seeded example data on an isolated server, never from
  `data/edgy.db`. Example names and `@example.test` addresses only. No token, key or secret in any page or image.
- The app's behaviour doesn't change apart from the Docs links, the links from the panel and the code
  studio, and the `/docs/` route.
- `/api/guide` stays the agents' compact reference. The docs may build on it; agents are never sent to the site.
- The showcase for this brief is the site itself plus the tutorials' templates. Evidence goes in
  `docs/showcase/docs-site/`.
- The writing is the bulk of the work. Before splitting it, settle and write down the page format, the
  building blocks (callout, figure, diagram, live example, generated reference table), a short style guide
  and the glossary. Then give the sections to writer agents with folders that don't overlap, and have each
  section checked against the code by a fresh agent (step 5 of the skill).
- Putting the site online is not part of the run. It ends with a folder ready to deploy, and the README
  says how.

### Decide before running

- **Where it is served.** At `/docs/` in the app and as a standalone static build (recommended), or standalone only.
- **How pages are written.** Markdown with a few custom blocks (live example, diagram, callout, generated
  reference), which reads well in a diff and can be edited without React (recommended), or pages written as TSX.
- **Live examples.** The real runtime, loaded per example when it comes into view (recommended), or
  static pictures only: lighter, but nothing to play with.
- **Clips.** Short muted looping videos (`.webm` with a still poster, paused under reduced motion)
  (recommended), GIFs, or stills only.
- **Source links.** To `github.com/Narcis13/edgy` on `main` (recommended), or plain paths with no links.
- **Versions.** One version describing the current `main`, with no version switcher (recommended until
  there are releases).
