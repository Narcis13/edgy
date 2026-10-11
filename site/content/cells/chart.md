---
title: Chart
---

A chart cell draws numbers as bars, a line, a filled line, the parts of a whole, or one number against a maximum, and redraws whenever the numbers change.

::ref kind chart

## When to use it

Use a chart when the shape of the numbers matters more than each figure: sales by month, where the money goes, how far along something is. Give it a list the document already has; it never holds numbers of its own.

For one headline figure with its change, use a [stat](kind:stat). For the exact numbers and everything else about each record, use a [table](kind:table); a chart and a table often read the same expression.

## Try it

```live id=sales title="Sales" height=380
["col",
  ["input", {"name": "done", "type": "slider", "label": "Launch progress", "min": 0, "max": 100, "value": 65}],
  ["chart", {"name": "sales", "type": "bar", "label": "Sales by month", "format": "currency"},
    ["list", ["list", "Jul", 4200], ["list", "Aug", 5100], ["list", "Sep", 4700], ["list", "Oct", 6300]]],
  ["chart", {"type": "meter", "label": "Launch"}, "$done"]]
```

Move the slider: the meter follows. Point at a bar to see its figure and name. The bar chart is given a list of `[name, number]` pairs; its value is that list, so other cells can add it up:

```sx in=sales
(sum sales)
⇒ 20300
(max (column sales 1))
⇒ 6300
```

## Adding and designing one

1. Select a cell and press `/`, then choose **Bar chart**, **Line chart**, **Area chart**, **Donut** or **Meter**. A new chart starts with five numbers so you can see it.
2. Replace them in **Numbers**, in the **Content** section of **Cell details**. For a meter this is one number, such as a total; otherwise a list of numbers, or of name and number pairs.
3. Choose the **Kind of chart** and fill in the rest.

::shot designer-chart "The chart's designer: its numbers, kind, title, colour and number format."

- **Kind of chart**: **Bars** (compare amounts), **Line** (change over a sequence), **Area** (a filled line), **Donut** (parts of a whole) or **Meter** (one number against a maximum). Switching kind keeps the numbers.
- **Title**: shown above the chart.
- **Colour**: the colour of the bars, the line or the meter; **Automatic** uses the first colour of the theme. A donut always uses the theme's series of colours.
- **Show numbers as**: the format of the figures in the tooltip, in the middle of a donut and in a meter. The scale along the side always shortens big numbers (`12k`).
- **Maximum** (meters): a number or the name of a cell. The meter is full there.

## What it can draw

The numbers can be written three ways:

| Written as | Example | The labels are |
| --- | --- | --- |
| A list of numbers | `(list 3 5 4)` | 1, 2, 3… |
| `[name, number]` pairs | `(list (list "Jul" 4200) (list "Aug" 5100))` | the names |
| Records | `(list {label "Jul" value 4200})` | `label` (or `name`, `key`), and the number is `value` |

A record without a `value` uses its first number, so the result of [group](fn:group) on a text field, records with a `key` and a `count`, draws as it comes: one bar per key. Items that aren't numbers are skipped.

The five kinds:

- **Bars** and **Line** and **Area** share a scale that always includes 0, and a few round marks on the side. Hover or touch shows the figure and the name.
- A **Donut** draws the parts that are above 0. With more than eight, the first seven are shown and the rest are added up as *Other*. The legend gives each part's share, and the hole shows the total, or the part you point at.
- A **Meter** takes one number. Without a **Maximum** it is full at 100, or at 1 for a number of 1 or less, which it writes as a percentage. With one it reads *65 of 100*, or with a format, only the formatted number. It never draws past full or below empty.

## In notation

The expression giving the numbers is the body:

```notation id=kinds
["row",
  ["chart", {"type": "donut", "label": "Orders by status"}, ["group", ["rows", "orders"], "status"]],
  ["chart", {"type": "line", "label": "Balance", "format": "currency"}, ["list", 120, 180, 150, 240]],
  ["chart", {"type": "area", "label": "Visits", "color": "agent"}, ["list", 3, 5, 4, 8]],
  ["chart", {"type": "meter", "label": "Of the budget", "max": "$budget", "format": "currency"}, "$spent"]]
```

| Prop | What it is |
| --- | --- |
| *body* or `expr` | The numbers: an expression. |
| `type` | `"bar"` (default), `"line"`, `"area"`, `"donut"` or `"meter"`. |
| `label` | The title above the chart. |
| `color` | A [colour token](term:token) for the series. |
| `format` | How figures are written; see [Formats](/language/formats/). |
| `max` | A meter's maximum: a number or an expression. |

## Its value

A chart's value is what its expression gives, before it is drawn: the list of numbers, pairs or records, or the one number for a meter. Other cells read it by name, as in `(sum sales)` above.

When the expression gives no numbers at all, the chart says *Nothing to draw yet. A chart needs a list of numbers.* A problem in the expression shows in a small red label on the cell.

## Events

::ref events-of chart

A chart can be pressed in Live when it handles `click`. `change` fires when the numbers it draws change, whoever changed them. See [Events and actions](/events/).

## Actions that change it

None. A chart always draws its expression; `set!` on a chart changes nothing you can see. Change the cells the expression reads, or the expression itself in Edit.

## On a phone and on paper

A chart takes the width of its cell; the figures on the side and the names under the bars thin out in a narrow cell so they don't collide. A donut puts its legend underneath when its cell is under about 380 pixels wide. Every chart also carries its numbers as a hidden table for screen readers. On paper a chart prints as drawn, without a tooltip.

## Usual mistakes

- ***Nothing to draw yet*.** The expression gave no numbers: an empty list, text, or a list of records without a number in them. Check the result under **Numbers**.
- **A meter reads 100% when it shouldn't.** The number is 1 or less, so the meter's scale is 0 to 1 and it shows a percentage; or it is above **Maximum**. Give the meter the maximum you mean.
- **A donut is missing a part.** Only parts above 0 are drawn, and more than eight are folded into *Other*.
- **Some bars are missing.** A pair needs the number in second place: `(list "Jul" 4200)`. A pair the other way round is skipped.
- **The scale shows `12k` but I wanted the full figure.** The scale shortens numbers from 10,000 up. The exact figure is in the tooltip, written as **Show numbers as** says.
