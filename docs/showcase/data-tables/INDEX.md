# Data tables and typography: evidence

The showcase is the template **Studio billing** (`tables` in `src/core/templates.ts`). It brings ten sample
invoices into the `studio-invoices` collection the first time it is used. Two small documents sit beside it:
`looks.json` (every table look) and `typography.json` (fonts, text styles and the new options of each kind).

Regenerate everything here from a fresh server with empty data:

```bash
TMPDIR=/tmp/eg docs/showcase/data-tables/shoot.sh
```

| # | criterion | files |
|---|---|---|
| D1 | Grouped rows, folded, with counts and subtotals | `groups.png` (Paid and Sent folded), `desktop.png`, `phone.png` (groups in cards) |
| D2 | Picking rows; `(selected invoices)` feeds the "picked" stat and summary | `select.png` (3 picked → €10,450.00) |
| D3 | Resizing a column by dragging its header edge, saved in the document | `resize.png` (Activity shows `width 217` written by the drag) |
| D4 | Lines, stripes, density, header styles | `looks.png`, `looks-dark.png` |
| D5 | Row buttons: Paid (`update!`), Email (`set!` drafts a reminder), Delete (asks first) | `actions.png` (Annual report moved to Paid; reminder filled; "Delete this invoice? Yes / No") |
| D6 | Column formats: badges, progress, ticks, stars, links, alignment, colour, totals | `desktop.png`, `typed.png`, `desktop-dark.png` |
| D7 | Rows typed into the table, edited in place in Edit view | `typed.png` (Menu boards progress typed to 0.45; Hours cell open for editing) |
| D8 | A designer per kind in the panel; the table designer | `panel-table.png`, `panel-kinds.png` (canvas, list, calendar, chart, stat, button) |
| D9 | Kind options: canvas paper and pen, list markers and density, Sunday-first calendar, chart colour, stat "lower is better", button icon and confirmation | `typography.png`, `panel-kinds.png` |
| D10 | Nine more self-hosted fonts, text styles, document fonts | `typography.png`, `panel-text.png`, `desktop.png` (Inter text, Fraunces headings) |
| D11 | Letter spacing, case, underline/strike, paragraph spacing, padding per side, border colour/width, shadow | `typography.png`, `panel-text.png` |
| D12 | The panel on a phone, in dark mode; tablet layout | `panel-phone.png`, `tablet.png`, `desktop-dark.png` |
| D14 | Paper: whole tables with groups and totals, no toolbar, pick boxes or buttons | `data-tables.pdf` (5 A4 pages), `printed.png` |
