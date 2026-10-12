# Flow: evidence

Flow is the page beside the documents where notes, tasks and events live as one timeline of posts with comments
and reactions, shown in five views (Timeline, Board, Tasks, Calendar, Notes), where a person and their agents meet.
Items are records in the account's own collections, so they sync, show on the Data page and are read by documents
with `(rows "flow")`. Everything here is regenerated from a fresh server with empty data by `shoot.sh`
(`TMPDIR=/tmp/flow CHROME=/path/to/chrome docs/showcase/flow/shoot.sh`): it seeds Ana Pop's fortnight with
`seed.mjs` (Claude taking part with her API key), shoots every view, drives the interactions and writes what each
step found to `checks.txt`. `mcp-check.mjs` drives `edgy_flow` through the real MCP server.

| # | criterion | evidence |
|---|---|---|
| G2 | Zero console/network problems on every screen (`.claude/goal-loop/screens`, the Flow screens included) | the sweep in PROGRESS.md's log; every `shoot.sh` step prints its CONSOLE lines (none) |
| G3 | The showcase: a fortnight of notes, tasks, events, comments, reactions, a running clock, two documents, seeded over HTTP | `seed.mjs`, `checks.txt` |
| F1 | Timeline: composer, posts by day, filters, search, tags | `timeline.png`, `timeline-full.png`, `timeline-dark.png`, `timeline-filter.png`, `checks.txt` (Tasks only: n posts; "ledger" finds the post with that comment; #sales) |
| F2 | Reactions toggle (like once: count 1, mine; again: gone), comments post on Enter and move the post up; an agent's comment and reaction are the agent's | `reactions.png`, `comments.png`, `agent-post.png`, `checks.txt` |
| F3 | Board: a drag shows the ghost and the drop line and lands the card in Doing; Shift+arrows move it to Done (done) and back; a renamed column keeps its cards | `board.png`, `board-dark.png`, `board-drag.png`, `board-after.png`, `board-keys.png`, `board-columns.png`, `checks.txt` |
| F4 | Tasks: grouped by due; ticking finishes; the due day set with the date field | `tasks.png`, `tasks-tick.png`, `checks.txt` |
| F5 | Calendar: the month with chips, the week with time blocks and the now line, a day click opens a new event on that day; the agenda on a phone | `calendar-month.png`, `calendar-week.png`, `calendar-week-dark.png`, `calendar-click.png`, `phone-calendar.png` |
| F6 | Notes: a grid, pinned first; edited in place (Esc saves); a note made a task lands in the first column | `notes.png`, `notes-dark.png`, `notes-edit.png`, `checks.txt` |
| F7 | Quick-add understood and previewed ("Event · Tomorrow 15:00–16:00 · #sales · urgent"), then posted; the Today strip; the clock stopped with its minutes kept and commented | `composer.png`, `composer-posted.png`, `today.png`, `clock.png`, `src/core/flow.test.ts` (30 quick-add cases) |
| F8 | The item editor from a post: kind, text, body, tags, column, due, start/end, priority, pinned, document | `item-editor.png`, `phone-item-editor.png` |
| F9 | Items are records: the Data page lists `flow`, `flow-board`, `flow-comments`, `flow-reactions`; the Flow dashboard template computes over them (open, overdue, done this week, minutes, due this week, finished by day, the calendar) and its Done button changes a record the board agrees with | `data-flow.png`, `dashboard.png`, `dashboard-done.png`, `checks.txt` |
| F10 | Sync: Flow records travel between two machines, merge field by field, deletions cascade | `src/server/sync.test.ts` ("Flow travels like any record"), run by `shoot.sh` |
| F11 | Agents: `edgy_flow` over the real MCP server (list with filters, post, comment, react, move, clock, done, a refused column, delete); the HTTP routes in `src/server/flow.test.ts` | `mcp-check.mjs` output in `checks.txt` |
| F12 | Live: an agent's post over HTTP and a record saved through `/api/data/flow` both appear in the open timeline without a reload | `live.png`, `live-record.png`, `checks.txt` |
| F13 | Phone and dark: every view at 390×844 and in dark mode | `phone-*.png`, `*-dark.png` |
| F14 | Keyboard: Shift+arrows on the board (`board-keys.png`); the shortcuts documented (`site/content/start/keyboard.md`, "In Flow") | `board-keys.png`, `checks.txt` |
| F15 | Docs: `site/content/flow/` (seven pages, pictures from `site/scripts/shoot.mjs`), the route and tool entries, README | the docs site at `/docs/flow/` |
