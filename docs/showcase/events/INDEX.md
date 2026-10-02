# Events: evidence

Regenerate everything here from a fresh server with empty data:

```bash
TMPDIR=/tmp/ev CHROME="/path/to/chrome" docs/showcase/events/shoot.sh
```

It starts edgy on port 8796, creates the **Market stall** template (`events` in `src/core/templates.ts`) and the small documents in this folder (`lab.json`, `timer.json`, `consent.json`, `ask.json`), drives them headless and writes what every run printed to [events.txt](events.txt).

| # | criterion | evidence |
|---|---|---|
| D1 | `open` runs once per open in Live, not in Edit | events.txt "D1": opens 0 after Edit, 3 after three Live opens; fired by hand from the studio: `events-part*.png` (Try it) |
| D2 | Ticking and unticking a checkbox run its handler with the new value; read back with `/read` | events.txt "D2…": afterTick `Agreed`/1, afterUntick `Not yet`/2, values from `/read`; list item, table pick, calendar, formula bindings in `src/core/events.test.ts` |
| D3 | Click and double-click on a text cell, an image and a table row know their target; the double-click rule | events.txt: clicker 1 click + 1 double (the double ran only dblclick), image `pic`, row click `Bo`, row double `Ann` with lastClick unchanged; rule tested in `src/web/editor/pointer.test.ts`, documented in `guide.txt` |
| D4 | Every 2 s: 3 ticks in ~7 s; stopped by an action; stopped by going Home; a one-off delay runs once | events.txt "D4": 3 at 7 s, still 3 after Home with no request but the check's own; lab: ticks unchanged after Stop, `once` 1; `src/server/runner.test.ts` with a fake clock |
| D5 | Fetch: loading visible, data and `load`, a field in a formula; a 500 and an unreachable address run `fail` and show an error | [fetch-loading.png](fetch-loading.png), [fetch-error.png](fetch-error.png), events.txt "D5"; the stall's rate in [desktop.png](desktop.png); `runner.test.ts` (no network) |
| D6 | A button emits an event with a payload; two cells listen and read it | events.txt: `emitted [42, "from shout"]`; the stall's order counter and thank-you note in [stall-run.png](stall-run.png) |
| D7 | A custom action called from two buttons with other arguments; a missing name errors in the cell and outline | events.txt: `Hi Ann.`, `Hi Bo!`, outline `→ ! its action: no action or function called "grete"`; [action-error.png](action-error.png) |
| D8 | A handler setting itself off stops at a fixed depth with an error in the trace; the tab stays responsive | events.txt: `stopped: events went 8 deep (loop → spin → spun …)`, then a click still works (`stillResponsive`); [activity.png](activity.png) |
| D9 | One gesture with everything its handlers changed is one undo step | events.txt: `afterUndo [true, "Agreed", 1]` (the untick and its handler's two changes undone together) |
| D10 | Activity shows each event, its cell and its ops | [activity.png](activity.png), [stall-run.png](stall-run.png) |
| D11 | A handler attached to a checkbox with presets and Blocks only, desktop, phone, dark | [events-part.png](events-part.png), [events-part-phone.png](events-part-phone.png), [events-part-dark.png](events-part-dark.png); steps and `/read` in events.txt "D11"; script `d11.js` |
| D12 | Ask AI: a sentence per family into handlers that validate and run | events.txt "D12" (offline composer, 11 sentences applied as an agent); applied and fired on offline and mocked Claude in `src/server/compose.test.ts` |
| D13 | Guide, an agent's ops, handlers in the outline | [guide.txt](guide.txt); events.txt "D13" |
| G3 | The Market stall, every family together, on every size and on paper | [desktop.png](desktop.png), [desktop-dark.png](desktop-dark.png), [tablet.png](tablet.png), [phone.png](phone.png), [edit.png](edit.png), [page.png](page.png), [market-stall.pdf](market-stall.pdf), [stall-run.png](stall-run.png) |

"An address that does not exist" (`https://unreachable.invalid/…`) fails with "could not be found" on a resolver that answers NXDOMAIN; on the machine these were taken on the resolver answers anyway, so it fails after the 10 s limit instead. Either way `fail` runs with the message.
