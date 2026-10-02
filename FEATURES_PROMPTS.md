# Feature prompts

Four briefs for `/goal-loop` (the skill is in `goal-loop/`, edgy's facts for it in `.claude/goal-loop/`). Each has the two parts the skill reads,
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

Suggested order: **4 → 2 → 1 → 3**. The new elements are self-contained. Events build on them (a tab
changing, a shape being clicked). The home page changes storage. Accounts go last because they touch every
route and the verification scripts, and they turn brief 1's share links into per-person access. Each brief
is still written to stand on its own.

| # | brief | the parts marked ultrathink |
|---|---|---|
| 1 | Home page for many documents | decks played as slides, self-contained HTML export |
| 2 | Events and actions | the event model, fetch |
| 3 | Accounts, collaboration and cloud sync | the access model, collections, sync |
| 4 | New elements | containers in the cell tree, the diagram |

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
  replayable history; consider it as the unit of sync.

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
  resolve the way Decisions describes; the UI shows synced, syncing or offline. Verified against the real
  provider when credentials are present; otherwise against a local stand-in, with the provider listed under
  Blocked and exactly what is needed.
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
- Keep the one-command local start: decide whether `npm run dev` with nothing configured signs a single
  local account in automatically (recommended), and write it down.

### Decide before running

- **Cloud database.** A hosted libSQL database is the closest to the current SQLite schema; Postgres
  (Supabase, Neon) is the other candidate. Put the credentials in `.env` before the run. Without them the
  sync is built and verified against the local stand-in only.
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
