# New elements: evidence

The **Order desk** template (`src/core/templates.ts`, id `elements`) uses all five new kinds: a flowchart
diagram with live numbers, tabs opened from buttons, a three-step phone-order form whose Next and Back run on
a hidden `step` data cell, an accordion of questions holding a table and a chart, and a collapsible that starts
folded. Everything here is regenerated from a fresh server with empty data by `shoot.sh`
(`TMPDIR=/tmp/ne docs/showcase/new-elements/shoot.sh`), which also prints the values it checked.

| # | criterion | evidence |
|---|---|---|
| G3 | Showcase on desktop, tablet, phone, dark, print | `desktop.png`, `tablet.png`, `phone.png`, `desktop-dark.png`, `new-elements.pdf`, `printed.png` |
| D1 | Collapsible: Enter and Space (real key presses) fold and unfold; the state survives a reload; it starts folded; `aria-expanded` reads false → true (Enter) → true after reload → false (Space) | `collapsible.png`, `shoot.sh` output |
| D2 | Accordion one at a time: opening Returns closed Delivery (`Delivery=false Returns=true Paying=false`); Delivery holds a table, Returns a chart. Any-number mode: unit test `accordion: one at a time or any number` | `accordion.png`, `src/core/containers.test.ts` |
| D3 | Tabs: "See the orders" (`set!`) opened Orders and hid itself (a `hidden` rule reading `view`); ArrowRight moved to Phone order with focus; `GET /read` gives `view` = "Phone order"; at 390px a five-tab bar scrolls inside itself (576 > 346 px) with the page 390 wide and the open tab scrolled into view; formulas in closed panels evaluate (unit test) | `tabs.png`, `tabs-phone.png` |
| D4 | Split, merge, move, dup and remove inside panels, each with its inverse checked; a single-child container survives `normalize`; tabs added, renamed, reordered and removed on the page (tab menu) and in the designer, each undone | `containers-edit.png`, `panels.png`, `src/core/containers.test.ts` |
| D5 | Paper: every tab printed under its title, accordion and collapsible unfolded, data cells absent, no cell cut, a heading never left at a page foot (`keepWithNext`) | `new-elements.pdf`, `printed.png`, `src/web/print/paginate.test.ts` |
| D6 | Diagram by hand (mouse, 1440) and by touch (390×844): three shapes, two attached arrows, a label, move (arrows follow), resize, delete (its arrow goes too); nine undos back to empty and nine redos; reload shows it; dark mode | `diagram-hand.png`, `diagram-touch.png`, `diagram-dark.png`, `draw.js` |
| D7 | One ops POST (`flowchart-ops.json`) builds a five-node flowchart without coordinates; a label `{{total \| currency}}` reads $2,450.50 after `total` changed; a formula counts 5 shapes | `diagram-data.png`, `shoot.sh` output |
| D8 | Data cells: 0 drawn in Live and Page (and none on paper); chips in Edit; Next/Back change `step` 1 → 2 → 3 → 2 and the step sections' `hidden` rules follow; the outline reads `data step (never shown) = 2` | `data-chip.png`, `wizard.png` |
| D9 | The `/` menu lists Diagram, Tabs, Accordion, Collapsible, Data (hidden); a designer for each; minimap glyphs | `menu.png`, `panels.png`, `minimap.png` |
| D10 | Ask AI, offline composer through the running API: a sentence for each kind | `ask-ai.txt`, `src/server/compose.test.ts` (offline and mocked Claude) |
| D12 | Events raised through `session.raise`: `click` (diagram shape), `change` (tab), `close`/`open` (section, collapsible) | `shoot.sh` output |
