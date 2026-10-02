# Progress

Goal: documents react to events. One mechanism, in the same language as formulas and actions, stored as
plain JSON, changed by ops, readable in notation and the outline: the document opening (and closing),
values changing (by a person, a handler or an agent), clicks and double-clicks on cells, rows and items,
timers (after a delay, every interval, started and stopped by actions), fetching JSON from a URL (loading,
loaded, failed, refreshed), custom events with a payload, and custom actions with parameters. The code
studio gets an Events part (for a cell and for the document) with presets, Blocks, a fire-by-hand button
and a trace in Activity; Ask AI writes handlers, events and actions from a sentence on all three paths.

Started 2026-10-02 on branch `main` at `5c8de68`. Brief: given inline to `/goal-loop` (events brief).

**Next:** M6 showcase evidence: write `docs/showcase/events/shoot.sh` (fresh server 8796: Market stall at desktop/phone/tablet/dark/page, fetch loading + error states, lab run, timer run, D11 via d11.js, Ask AI run, guide excerpt), INDEX.md. Then M7 final audit (fresh reviewer agent first).

## Contract (Done means)

| # | criterion | verified by | evidence | status |
|---|---|---|---|---|
| G1 | Typecheck, all tests and the production build pass, no chunk warning | `gates.sh` | Log | open |
| G2 | Zero console/network problems on every screen at 1440×900 and 390×844, plus 820×1180 and dark for the new UI | `sweep.sh` + `cdp.mjs --dark` | Log | open |
| G3 | A showcase template using every event family together in a realistic document, verified on desktop, phone and print | sweep + reading the images | `docs/showcase/events/` | open |
| D1 | On-open: a document whose `open` handler counts opens runs it once per open in Live (3 opens → 3), not when opened in Edit, and once when fired by hand from the studio | `cdp.mjs` opens in live/edit + `GET /read` | `events.txt` (shoot.sh output), Log | open |
| D2 | Ticking and unticking a checkbox each run its `change` handler with `value`/`was` bound; the effect is read back with `GET /api/docs/<id>/read`. A list tick binds `item` and `index`; a table pick binds `rows`; a calendar day, an input, a canvas and a formula's computed value raise `change` with old and new | scripted clicks + `/read`; unit tests for each binding | `events.txt`, `events.test.ts` | open |
| D3 | Click and double-click handlers on a text cell, an image and a table row each run and know their target (`target`, `row`, `item`). Rule: with a `dblclick` handler, a single click waits 250 ms and a double-click runs only `dblclick`; without one, `click` runs at once. Documented in the guide and tested | scripted pointer events + `/read`; unit test of the click gate with a fake clock | `events.txt`, tests, guide | open |
| D4 | A timer `every 2` has ticked 3 (±1) times after ~7 s in Live; `(stop! t)` from a button stops it; navigating home stops it (no ops and no requests after); an `after` timer runs once | `cdp.mjs` timed run + `/read` + log versions before/after; runner tests with a fake clock | `events.txt`, `runner.test.ts` | open |
| D5 | Fetch via the server against a fixture endpoint on the isolated server: the loading state is visible (screenshot), the data arrives, the `load` handler runs and a formula shows a field; a 500 and an unreachable address run `fail` with a message and show an error state; no uncaught exception; no test touches the outside network | `cdp.mjs` screenshots + `/read`; fetch tests with an injected fetch/lookup | `fetch-loading.png`, `fetch-error.png`, tests | open |
| D6 | A button emits a custom event with a payload; two other cells listening both react and read the payload | scripted click + `/read`; unit test | `events.txt`, tests | open |
| D7 | A custom action defined once is called from two buttons with different arguments; calling a missing name is an error shown in the cell and in the outline | scripted clicks + `/read` (values and outline error) | `events.txt`, `action-error.png` | open |
| D8 | A handler that triggers itself, directly and through a second cell, stops at a fixed depth with an error in the trace; the tab stays responsive (a later click still works) | unit test + scripted run in the browser | tests, `events.txt` | open |
| D9 | One gesture with everything its handlers changed is one undo step | scripted tick then `edgy.undo()` restores both cells; unit-level check of the undo stack | `events.txt` | open |
| D10 | Activity shows each event, the cell it came from and the ops it produced (browser-run and server-run) | screenshot of Activity after a run | `activity.png` | open |
| D11 | A handler is attached to a checkbox from the Events part with presets and Blocks only (scripted clicks, no typing), on desktop, on a phone and in dark mode | `cdp.mjs --js` clicks at 1440×900, 390×844 `--mobile`, `--dark` | `events-part.png`, `events-part-phone.png`, `events-part-dark.png` | open |
| D12 | Ask AI turns ≥ 8 sentences covering lifecycle, value change, pointer, time, fetch, custom event, custom action into handlers that pass validation and do what was asked when run; offline composer and Claude path (mocked fetch) in tests; the Log says which paths were also checked live | `compose.test.ts` (apply + fire + check), one run through the studio | tests, `ask-ai.png`, Log | open |
| D13 | Guide documents the event props, the new functions and custom actions; an agent attaches a handler with ops; the outline shows a cell's handlers and the document's | `curl /api/guide`, ops POST, `/read` outline | `guide.txt`, Log | open |
| D14 | New tests cover dispatch and the data bound to each event, timers with a fake clock, fetch states, custom events and actions, the loop guard, notation and ops round trips | `npm test` count goes up | Log | open |
| D15 | Constraints: no events in Edit or on paper (Page view, PDF); `do` on buttons and rows unchanged; documents made before open and behave the same; a kind declares its events in one place (`core/events.ts`) and the dispatcher never names a kind | existing tests + sweep of old templates + code reading | Log | open |

Status: `open` → `pass` (with evidence) or `blocked` (see Blocked).

## Milestones

1. [x] **Core model**: types, notation, ops (`on.*` on cells, `meta` paths `on.*` and `actions.*`), language, engine (timer, fetch), dispatcher + loop guard, outline, guide, tests (D2–D8 core, D13 part, D14, D15)
2. [x] **Server**: Live viewers per document, the runner (timers, fetch proxy with limits, server-run handlers, agent-caused changes), endpoints, demo fixtures, trace over SSE, tests with a fake clock (D4, D5, D14)
3. [x] **Browser**: gestures through the dispatcher (one undo step), pointer events and the click gate, open/close, fetch state, timer/fetch cells in Edit/Live/Page, Activity trace (D1–D10)
4. [x] **Studio and designer**: Events part for a cell and the document, presets + Blocks, fire by hand, custom actions; inspector section, `/` menu, minimap, icons (D11)
5. [x] **Ask AI**: an `events` target on the offline composer, Claude (mocked) and the agent path (D12)
6. [x] **Showcase**: template + evidence in `docs/showcase/events/` (G3)
7. [ ] **Final audit**: review, clean build, empty data, all gates, full sweep, every contract item checked

## Decisions

- **One model: `on`, a record from event name to an action.** Any cell has `on: {"click": action, "change": action, "saved": action}`; the document has `meta.on` (open, close, and custom events). An action is the same s-expression a button's `do` holds, run the same way, with the event's data bound as variables. Changed by ops like any prop: `["set", cell, "on.change", action]`, `["meta", "on.open", action]` (null removes). Rejected: a separate handler list (`[{event, do}]`) — it can't be addressed by a path, and a second handler for the same event on one cell is better written as `(do a b)`.
- **What a handler sees**: `event` (a record: `name`, `target` — the cell's name or id — and the data) and each data field by name: `value`, `was`, `item`, `index`, `row`, `rows`, `element`, `count`, `data`, `message`, `payload`… A field shadows a cell of the same name inside the handler; `(ref name)` still reaches the cell.
- **Events come from four sources, declared per kind in `core/events.ts`**: gestures the UI raises (`click`, `dblclick`), values that changed (worked out by comparing values before and after a change, so a change made by a button, a handler or an agent raises it as well as a person's tick: `change` on any cell with a value; `pick` on tables from `selected`; `open`/`close` on accordions and collapsibles), the document's lifecycle (`open`, `close`), and the runner (`tick` on timers, `load`/`fail` on fetch cells). Custom events from `(emit! "name" payload)` go to every cell and the document that has a handler for that name. The dispatcher reads only the declarations, never a kind's name.
- **Timers and fetches are cells**: `["timer", {"name": "poll", "every": 30, "on": {"tick": …}}]` and `["fetch", {"name": "rate", "every": 60}, "/api/demo/rate"]`. They have names formulas read (a timer: running or not; a fetch: the parsed JSON), sit in the outline, take no room in Live (a fetch shows a one-line status: loading, updated, failed with Retry), and print nothing. Durations are seconds or "30s", "2m", "1h". `(start! poll)` sets its value to the time it started (so starting again restarts it), `(stop! poll)` sets false; `(refresh! rate)` fetches again.
- **Who runs what (two people, one document)**: a person's gestures run in that person's browser, and the ops their handlers make are sent like any edit — other browsers receive the ops, never the event, so nothing runs twice. `open`/`close` run in each person's browser, once per open (that person's open). Timers, fetches and their `load`/`fail` handlers, and changes made by agents, run **on the server, once**, while at least one person has the document open in Live (browsers tell the server their mode). So no browser runs a timer, a background tab can't slow one down, and a record is never saved twice. With nobody in Live nothing runs in the background.
- **Fetch goes through the server**: `GET` only, http/https, no private, loopback or link-local addresses (checked after DNS and on every redirect), 10 s, 1 MB, JSON only. A URL starting with `/` is answered by the app itself, in process (its own API and the `/api/demo/*` fixtures), so tests and the showcase never touch the network. Secrets: a header value `"secret:NAME"` is replaced by the server's `EDGY_SECRET_NAME`; the document holds only the name. The last answer per fetch cell is kept in the server's memory (not in the document) and sent to every browser, so all readers and agents (`/read`) see the same data; every fetch runs once however many people are looking.
- **Custom actions** live in `meta.actions` as functions: `["meta", "actions.greet", ["fn", ["who"], ["set!", "hello", ["str", "Hi ", "$who"]]]]`, called like a built-in, `(greet "Ann")`, from any handler or button. A call to a name that is neither built in, an action nor a cell holding a function is reported in the cell (and the outline) before anything runs.
- **Pointer**: `click` and `dblclick` on any cell in Live, with `row`/`index` for a table row, `item`/`index` for a list item, `element` for a diagram shape. With a `dblclick` handler, a click waits 250 ms; a double-click runs only `dblclick`. Without one, `click` runs at once. A button's `do` stays its click action; an `on.click` on a button runs after it, in the same gesture.
- **Undo**: a person's gesture and every change its handlers make are applied in one dispatch, so one undo step. Undo and redo never fire events. `open`, `close` and server-run changes are not undo steps (nobody did them).
- **Loop guard**: a cascade stops at depth 8 or after 64 handler runs, whichever comes first, with an error in the trace naming the chain; what already ran is kept. It is synchronous and bounded, so the tab stays responsive.
- **Where events don't fire**: Edit and Page (paper) never fire; the studio's fire-by-hand button runs one handler in any mode, with sample data, as a real change (undoable).
- **`show!` / `hide!`** set a cell's `hidden` prop (removing an expression that was there), so "show the thank-you note" needs no extra data cell.
- **Ask AI for events answers with ops**, not one expression (a sentence may attach two handlers, set a fetch interval or define an action). The ops are applied to a copy of the document and every handler is checked before the person sees the answer.

## Blocked

- *(none)*

## Notes

- Baseline found no `node_modules` problem this time; gates take ~5 s.
- No git identity is configured on this machine: commit with `git -c user.name="Narcis Brindusescu" -c user.email="narcis75@gmail.com" commit …` (the name the history uses).
- Bash heredocs containing escaped backticks fail in this harness; write patch scripts with the Write tool (a new file name each time). Scratchpad `p.cjs` does CRLF-safe exact replacements; most source files are CRLF. Never pass a `$'`-containing replacement string to String.replace (use a function).
- `react` can be given `before` (an earlier World) so values moved by something outside the document (a fetch answer) raise change.
- Server tests drive time with a FakeClock passed through `createApp(..., { clock, get, env })`; `runner.settled()` awaits fetches.

## Log

- 2026-10-02: baseline: 132 tests pass, typecheck clean, build passes.
- 2026-10-02: M1 core: `on` on cells and `meta.on`/`meta.actions` (ops with paths, renames follow), timer and fetch kinds, emit!/start!/stop!/refresh!/show!/hide!, status/error-of, custom action calls, unknown calls reported in the cell and outline, `react` dispatcher (watchers declared per kind, emit broadcast, a cell's own do as depth 0, loop guard 8/64), outline lines, guide Events section. 132 → 144 tests.
- 2026-10-02: M2 server: `Runner` (viewers per document, timers on an injectable clock, fetch through the server with SSRF/size/time limits and `secret:` headers, server-run handlers saved as actor "Events", agent changes react while someone is in Live, trace and fetch states over SSE), `/api/demo/*` fixtures. 144 → 152 tests.
- 2026-10-02: M3 browser: session runs Live gestures through `react` (one dispatch, one undo step), buttons and row actions via `run`, pointer events with a click gate (`editor/pointer.ts`, 250 ms only when dblclick is handled), open/close (pagehide + keepalive), fetch states and server traces over SSE, mode told to the server; timer/fetch chips in Edit, a fetch line in Live, nothing on paper; Activity lists events with their cell and ops. Checked headless on 8791 (lab doc): open runs once in Live and not in Edit; checkbox tick/untick; click vs dblclick on text; image click; table row click/dblclick; emit to two listeners; custom action with two argument sets; missing action error; loop guard and still responsive; stop!; timer 3 ticks in 7 s and nothing after going Home. Sweep of 6 templates + lab: 0 problems. 152 → 155 tests.
- 2026-10-02: M5 Ask AI (agent): targets `on.<event>`, `action` and `events` (ops + changes, applied to a copy and checked: ops apply, handlers checked with event names bound, no unknown calls) on offline, Claude (mocked fetch) and agent paths; 13 sentences across every family applied and fired in tests. Lead fixed `(when c a b)` running only `a` (it now runs every body, like do) and made the core template test apply meta. Showcase template `events` (Market stall), README Events section. 168 tests. Live Claude not checked (no key).
- 2026-10-02: M4 studio (agent): Events part for a cell and the document (`@doc`): events with their handlers, add from presets with cells picked from lists, Blocks/Code, remove, Try it (session.test) with what ran, custom actions; Ask AI with "This handler" / "Anything, in words"; inspector Events sections, Timer and Fetch panels, / menu, minimap; event names offered as variables. D11 run (clicks only) passed at 1440×900, 390×844 mobile and dark; lead read the three screenshots. Lead added timer/fetch to the formula bar and kind labels. 168 tests.
- 2026-10-02: M6 showcase: `docs/showcase/events/shoot.sh` on a fresh server (8796) regenerates every screenshot, the PDF, `events.txt` and `guide.txt`; every run exit 0; all images read. Fixed the stall layout (fetch line under the title, order buttons), plural, shell-mangled `·`.
