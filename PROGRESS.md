# Progress pass — typecheck, 303 tests (258 before + 45: core 7, server 6, sync 1, web helpers 31), app + offline + docs build, no chunk warning (final audit, gates-m8) | pass — final sweep from a fresh build and empty data, seeded: 31 screens (the 12 Flow screens at desktop, phone and dark included), 0 problems; the docs crawl of the 7 Flow pages × 3 sizes × 2 themes with axe: 0 problems | pass — `docs/showcase/flow/seed.mjs` + `shoot.sh` regenerated from a fresh server (final audit): 38 steps, every exit 0, no CONSOLE line; `docs/showcase/flow/checks.txt`, `INDEX.md` | pass — `docs/showcase/flow/timeline.png`, `timeline-full.png`, `timeline-filter.png` (Tasks only: 10 posts; "ledger" finds the post with that comment; #sales: 3) | pass — `docs/showcase/flow/reactions.png` (like once: "Like, 1", pressed; again: gone, 0 left), `comments.png` (1 comment, the post first), `agent-post.png` (is-agent, "Claude for Ana Pop", an agent comment) | pass — `docs/showcase/flow/board-drag.png` (ghost, drop line, Doing is-over), `board-after.png` (status Doing, not done, in the column), `board-keys.png` (Shift+→: Done/true, Shift+←: Doing/false, focus kept), `board-columns.png` (Doing → Now keeps 3 cards, Review added) | pass — `docs/showcase/flow/tasks.png`, `tasks-tick.png` (Prepare the demo done, Done 3; the due day set to 2026-10-20 with the date field) | pass — `docs/showcase/flow/calendar-month.png`, `calendar-week.png`, `calendar-week-dark.png`, `calendar-click.png` (New event, the day set), `phone-calendar.png` (the agenda) | pass — `docs/showcase/flow/notes.png`, `notes-dark.png`, `notes-edit.png` (title saved on Esc, editing over); Reading list made a task lands in Inbox (checks.txt) | pass — `src/core/flow.test.ts` (46 quick-add cases); `docs/showcase/flow/composer.png` ("Event · Tomorrow 15:00–16:00 · #sales · urgent"), `composer-posted.png` (event Fri 09:00–09:30, #team), `today.png` ("1 h 07 on the clock"), `clock.png` (stopped: spent 67, "Worked 27 min on this") | pass — `docs/showcase/flow/item-editor.png` (Edit task, column Doing, the attached Launch post), `phone-item-editor.png` | pass — `docs/showcase/flow/data-flow.png` (flow 24, flow-board 1, flow-comments 7, flow-reactions 8), `dashboard.png` (open 8, overdue 1, done 2, minutes 67, no errors), `dashboard-done.png` (the Done button finishes a record: 4 done); README | pass — `src/server/sync.test.ts` "Flow travels like any record" (run again by shoot.sh: 15 pass) | pass — `src/server/flow.test.ts` (6 tests, routes in the route-table test); `docs/showcase/flow/mcp-check.mjs` through the real MCP server: 14 checks, every one ok (checks.txt) | pass — `docs/showcase/flow/live.png` (201, 22 → 23 posts, the agent's post first, is-agent), `live-record.png` (a record saved through /api/data/flow appears) | pass — `docs/showcase/flow/phone-*.png`, `*-dark.png`; the sweep's 12 Flow screens | pass — `docs/showcase/flow/board-keys.png`; 8 shortcuts in `shortcuts.ts` with their entries in `site/content/start/keyboard.md` (coverage test) | pass — `site/content/flow/` (7 pages, 8 pictures from `site/scripts/shoot.mjs`), route and tool entries, the template entry, the checklist, README; docs tests pass; crawl 0 problems |

Goal: **Flow**, a new productivity feature beside documents: notes, a kanban board, tasks, a calendar with time
blocks and a clock, all one kind of thing (an *item*) shown in five views and woven into one timeline of posts
with comments and reactions, where the person and their agents meet. Built on edgy's own patterns: items are
records in the account's collections (so they sync field by field like everything else, show on the Data page,
and any document can compute over them with `(rows "flow")`), the routes carry `need(…)`, agents get an MCP tool,
the docs site gets a section, and a template document reads the Flow.

Started 2026-10-12 on branch `main` at `be830c2`. Brief: inline (`/goal-loop Feature: … notes, kanban, tasks, calendar
and time management in a timeline with posts, comments, reactions … seamlessly integrated with edgy, same patterns,
same cloud sync … tested functionally and visually in a headless chrome without errors in console`).

**Next:** nothing — every contract item passes (final audit 2026-10-12).

## Contract (Done means)

| # | criterion | verified by | evidence | status |
|---|---|---|---|---|
| G1 | Typecheck, every test (new ones included: core parser, server routes, sync, web helpers, docs coverage) and the production build (app, offline bundle, docs) pass with no chunk warning; the test count goes up | `gates.sh` | Log | open |
| G2 | Zero console/network problems on every screen in `.claude/goal-loop/screens` (the Flow screens added: each view at 1440×900 and 390×844, light and dark) | `sweep.sh` | Log, `docs/showcase/flow/INDEX.md` | open |
| G3 | A reproducible showcase: `docs/showcase/flow/seed.mjs` fills a fresh server with a realistic fortnight (notes, tasks on every column, events, a running clock, comments and reactions by Ana and by an agent, a document attached, a dashboard document reading the Flow) and `shoot.sh` shoots every view and interaction | run `shoot.sh` from a fresh server, read every picture | `docs/showcase/flow/` | open |
| F1 | **Timeline**: a composer at the top; every item is a post with author avatar, time, kind, text, tags, when/due; posts grouped by day, newest first; filters (all, notes, tasks, events, done), a search box and tag filtering | `cdp.mjs --js` typing into the composer and filtering; screenshots | `timeline.png`, `timeline-filter.png` | open |
| F2 | **Comments and reactions** on every item: five reactions (like, dislike, love, party, idea) that toggle, with counts and the ones you gave marked; comments with avatar, author and time; an agent's comment and reaction show as the agent's | `--js` clicking a reaction twice (count up, then down), posting a comment; API-key agent comment | `reactions.png`, `comments.png` | open |
| F3 | **Board** (kanban): columns of cards; drag a card between columns and reorder within one (pointer, works with touch); keyboard move from the card's menu; add a card at the bottom of a column; rename, add, remove and reorder columns; the last column means done | `--js` pointer drag then `GET /api/flow` shows the new status; screenshots before/after | `board.png`, `board-drag.png` | open |
| F4 | **Tasks**: grouped by due (overdue, today, tomorrow, this week, later, no date, done); a checkbox completes (and the Timeline shows it done); due date, priority and tags editable; done section folded | `--js` ticking a task; screenshots | `tasks.png` | open |
| F5 | **Calendar**: a month grid with events and due tasks on their days, a week view with time blocks placed by hour, today marked; clicking a day composes an item for that day; on a phone the month becomes an agenda | screenshots month, week, phone; `--js` day click | `calendar-month.png`, `calendar-week.png`, `phone-calendar.png` | open |
| F6 | **Notes**: a grid of notes, pinned first, searchable; edit in place; turn a note into a task (it appears on the board) | `--js` editing and converting; screenshots | `notes.png` | open |
| F7 | **Time**: quick-add understands dates, times, ranges and durations ("Call Ben tomorrow 3pm-4pm #sales !!" → an event tomorrow 15:00–16:00, tag sales, urgent); a clock on any item (start, stop; only one runs; minutes kept on the item and posted as a comment); the Today strip shows today's events, what is due, what is overdue and the running clock | `src/core/flow.test.ts` (parser, ≥25 cases); `--js` start/stop; screenshot | Log, `today.png`, `clock.png` | open |
| F8 | **One item editor** opened from every view: kind, text, body, tags, due, start/end, priority, pinned, an attached document (picked from the library, opens in the editor), delete (asks first) | `--js` opening it from the board and the timeline; screenshots | `item-editor.png` | open |
| F9 | **Integration**: a Flow entry in every top bar; items are records (`flow`, `flow-comments`, `flow-reactions`, `flow-board`) that show on the Data page; a document reads them with `(rows "flow")`; a **Flow dashboard** template in `TEMPLATES` (open tasks, due this week, done per day, today's events) with sample records for an empty Flow; the README describes it | `GET /api/docs/:id/read` of the template shows computed values; Data page screenshot | `dashboard.png`, `data-flow.png`, Log | open |
| F10 | **Sync**: Flow records travel between two machines like any record: an item posted on A, commented on B, reacted on both while the cloud is down, settle identical | `src/server/sync.test.ts` new test | Log | open |
| F11 | **Agents**: HTTP routes under `/api/flow` (each with `need`, in the route-table and stranger tests) and an `edgy_flow` MCP tool (list, post, edit, comment, react, move, done, clock, board); an agent's posts and comments appear as the agent ("Claude for Ana") with agent colours | `src/server/flow.test.ts`; seed uses an API key; screenshot | Log, `agent-post.png` | open |
| F12 | **Live**: a change made over HTTP (an agent's post, a `(insert! "flow" …)` from a document) appears in an open Flow page within a second, without reload | `--js` that posts over fetch and waits, then reads the DOM | Log, `live.png` | open |
| F13 | **Phone and dark**: every view at 390×844 and in dark mode: no horizontal overflow, no clipped text, targets ≥ 40px | sweep + reading the pictures | `phone-*.png`, `dark-*.png` | open |
| F14 | **Keyboard**: shortcuts in `shortcuts.ts` and documented (compose, views, search, move a card); Esc closes dialogs and clears the search; the item editor and menus work from the keyboard | `--press`; docs coverage test | Log | open |
| F15 | **Docs**: a Flow section in the docs site (overview with the quick-add syntax, timeline, board, tasks and calendar, notes, in documents and for agents), route and tool entries, shortcut entries, the template entry, pictures from `shoot.mjs`, README and checklists updated; the docs crawl of the new pages has 0 problems | `npm test` (coverage), `site/scripts/crawl.mjs` on `/docs/flow/` | Log | open |

Status: `open` → `pass` (with evidence) or `blocked` (see Blocked).

## Milestones

1. [x] **Core**: `src/core/flow.ts` types, `normalizeItem`, `parseQuick`, day/time helpers, buckets, feed grouping, column rules, ranks; tests (F7 part, G1)
2. [x] **Server**: `src/server/flow.ts` routes mounted from `app.ts`, validation, author from the principal, the clock, deletions cascade, `GET /api/flow/events` SSE fed from `dataChanged`; `flow.test.ts`; sync test; MCP tool; guide mention (F10, F11, F12 server side)
3. [x] **Web: page, timeline, composer, comments, reactions, item editor, today strip, clock** (F1, F2, F7, F8, F12, F14)
4. [x] **Web: board, tasks, calendar, notes** (F3, F4, F5, F6)
5. [x] **Phone, dark, keyboard pass** over every view; screens added to `.claude/goal-loop/screens`; sweep clean (F13, F14, G2)
6. [x] **Template and docs**: Flow dashboard template with sample records; docs section, entries, shots, README, checklists (F9, F15)
7. [x] **Showcase**: seed, shoot, INDEX (G3)
8. [x] **Review**: a fresh reviewer over the whole diff; fixes
9. [x] **Final audit**: clean build, empty data, all gates, full sweep, every contract item checked

## Decisions

- **One thing, five views.** The brief names notes, kanban, tasks, calendar, time and a social timeline. Rather than five
  separate features, Flow has one record type, the *item*, with a kind (note, task, event) and facets (tags, due, start/end,
  priority, pinned, a document, time spent). The Timeline shows every item as a post; the Board shows tasks by column; Tasks
  by due; the Calendar by date; Notes the notes. Comments and reactions attach to any item. That is the synergy: a note becomes a
  task with one click, a task gets a time and appears in the week, finishing it shows in the timeline where someone reacts.
  *(overrule if you disagree)*
- **Items are records**, in the account's collections `flow`, `flow-comments`, `flow-reactions` and `flow-board` (names may not
  contain dots). Why: records already sync field by field with deletions, belong to an account, show on the Data page, are readable
  by `(rows "flow")` in any document and by `edgy_data`; a new table would mean new store, sync and cloud code to do the same.
  Comments and reactions are records of their own (not arrays inside the item) so two machines adding comments at once keep both.
  The item's `done` flag is the truth; the board shows done items in its last column whatever their `status`, so a document's
  `(update! "flow" id {done true})` stays consistent.
- **Named "Flow."** A plain word for the timeline (things flow), the board (a workflow) and time (flow of the day). `/flow`,
  `edgy_flow`. "Stream" was the other candidate; it already means the event stream inside edgy.
- **The author is the principal.** `by` is set by the server from the session or the API key (`{kind, name, id, color}`; an agent
  as `name` with `for` the person). Reactions and comments by agents are first-class: the feed is where a person and their agents meet.
- **Collections stay the owner's.** Flow is personal (plus the owner's agents); nothing is shared with other accounts, because
  collections can't be. A shared Flow would need shared collections, outside this brief.
- **One board**, with editable columns kept in one `flow-board` record (default Inbox · Doing · Done). Many boards would multiply every
  view's filters; tags cover grouping across the board.
- **Live updates** over a new SSE route `GET /api/flow/events` for the signed-in account, fed by the same `dataChanged` that tells open
  documents; the page refetches `GET /api/flow` (everything in one answer) when any `flow*` collection changes.
- **Drag and drop with pointer events**, not HTML5 drag, so it works with a finger and can be driven from a script.
- **Quick-add** is a small parser in core (dates, weekdays, "in 3 days", "oct 20", times, ranges, "for 45m", `#tags`, `!`/`!!`,
  a leading `todo`/`note`/`event`), with its result previewed under the composer before posting. No natural-language library.
- No new dependencies.

## Blocked

- *(none)*

## Notes

- Record `at` is creation time and never changes; the item carries its own `updated` (last activity) which the routes set.
- A route's `need` must be exactly one; `/api/flow/board` is registered before `/api/flow/:id`.
- `package.json` `test` globs: `src/web/pages/flow/*.test.ts` added for the view helpers' tests.
- `posted` (ms) is the time an item or comment was written, settable on POST only when in the past (for things brought in from elsewhere; the seed uses it). The timeline groups by `updated` (last activity) and shows `posted` in the header.
- On Windows a helper file `board.ts` beside `Board.tsx` breaks tsc (case-insensitive paths): helpers are `board-rules.ts`, `task-list.ts`, `calendar-days.ts`, `notecards.ts`.
- The docs' screenshot server lives on 12 March 2026; `seedFlow(base, ana, now, key)` takes that clock so the Flow pictures line up. Running the Flow template before the items exist seeds the template's sample items: the seed makes the dashboard last.
- Headless Windows: `CHROME="C:/Program Files/Google/Chrome/Application/chrome.exe"`; no swift, so no PDF→PNG.

## Log

- 2026-10-12: baseline at `be830c2`: typecheck pass, 258 tests pass, build pass (no chunk warning). The previous PROGRESS.md
  (docs site, finished) moved to `docs/progress/2026-10-11-docs-site.md`.
- 2026-10-12: M1 core (commit 5c96731, 7 tests), M2 server + tool + template + docs section (50c9b11, 271 tests), M3+M4 the page in five views (4192600, 302 tests). Interaction checks on the seeded isolated server (scratchpad interact.sh): reactions toggle, comment on Enter bumps the post, drag shows ghost and lands in Doing, Shift+arrows move, rename carries cards, tick finishes, due set by date field, day click opens a new event, note edited in place, agent post arrives live (SSE), composer preview and post, clock stop logs 29 min and comments, dashboard values open 8 / overdue 1 / done 2 / minutes 69, Data page lists the four collections. Sweep of every screen (existing + 12 Flow screens, desktop/phone/dark): 0 problems. Docs pictures made by site/scripts/shoot.mjs (8 Flow shots, light and dark). Gates after M3: typecheck, 302 tests, build, no chunk warning.
- 2026-10-12: M6 docs pictures, showcase, README (3137bb0). A fresh reviewer (sonnet) over the whole diff: 7 must-fix (quick-add eating words such as "chapters 3-4", "at 5 options", "sat"; a card added under the last column landing in the first; done leaving the clock running; no limits on POST and a loose `posted`; a reaction lost after a rename; the column menu able to change which column means done; the title of a document the person can't open named from a record) and a set of should-fix items, all fixed in d10f669 with a server test for each rule; left as noted: Esc in the notes editors (documented behaviour), keyboard access to empty week-grid slots (the New button is the path), order ties after many drops into one gap, a revoked API key's stream (doc streams behave the same). Final audit from a fresh build and empty data: gates pass (303 tests), sweep 31 screens 0 problems, docs crawl of the Flow pages 0 problems, showcase regenerated (38 steps, every exit 0, MCP 14/14), every picture read. Servers stopped.
