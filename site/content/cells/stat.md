---
title: Stat
---

A stat cell shows one headline number with a label, how it moved against an earlier value, and a small line of where it has been.

::ref kind stat

## When to use it

Use a stat for the one or two numbers a reader should see first: revenue this month, tasks left, a balance. It sits at the top of a dashboard, above a [chart](kind:chart) or a [table](kind:table) that explains it.

For a number inside a line of text, use a [formula](kind:formula) or a [text template](/language/templates/). For several numbers side by side, a [chart](kind:chart) shows their shapes better than a row of stats.

## Try it

```live id=revenue title="Revenue" height=250
["col",
  ["input", {"name": "sales", "type": "number", "label": "Sales this month", "value": 12400}],
  ["stat", {"name": "revenue", "label": "Revenue", "format": "currency", "icon": "banknote", "compare": 10000,
            "trend": ["list", 8200, 9100, 10000, "$sales"]}, "$sales"]]
```

Change the sales: the number, the change and the line follow. The stat compares the number with `10000`, last month's figure, and shows the change as a percentage with the earlier figure beside it. The line is drawn through four numbers; the last one is the current sales.

```sx in=revenue
revenue
⇒ 12400
(set! sales 8000)
revenue
⇒ 8000
(/ (- sales 10000) 10000)
⇒ -0.2
```

The change is the number minus the earlier value, divided by the earlier value: here 8,000 against 10,000 is −20%, shown as `▼ 20.0%`.

## Adding and designing one

1. Select a cell and press `/`, then choose **Stat**.
2. Write the number in **Number**, in the **Content** section of **Cell details**. It is a code editor like a formula's: `(sum (column orders "total"))`.
3. Fill in the rest as far as you want it.

::shot designer-stat "The stat's designer: the number, its label and format, what it is compared with, the trend and the icon."

- **Label**: the words above the number. It can carry templates: `{{(len (selected invoices))}} picked`.
- **Show the number as**: the same formats as a [formula](kind:formula).
- **Compare with**: an expression for the earlier value. Without it there is no change line.
- **Lower is better**: for costs or bugs, where a fall is good news. The change shows green when it falls and red when it rises.
- **Trend**: an expression giving a few numbers, drawn as a small line under the number. It needs at least two.
- **Icon**: a small symbol before the label.

## In notation

The number's expression is the body:

```notation id=owed
["stat", {"name": "owed", "label": "Still owed", "format": "currency", "icon": "wallet", "better": "down",
          "compare": 26000, "trend": ["list", 31000, 28500, 26000]},
  ["-", "$billed", "$paid"]]
```

| Prop | What it is |
| --- | --- |
| `label` | The words above the number; may carry `{{templates}}`. |
| `format` | How the number is written; see [Formats](/language/formats/). |
| `compare` | An expression for the earlier value. A number or any expression. |
| `trend` | An expression giving a list of numbers, `[label, number]` pairs or records with a `value`. |
| `better` | `"down"` when a fall is good news. |
| `icon` | An icon name, such as `"wallet"` or `"banknote"`. |

## Its value

A stat's value is the number its expression gives, before formatting, so other cells can read it and compare it: `(> revenue 10000)`. The label, comparison and trend belong to the picture; only the number is the value.

With no number yet, or when the expression has a problem, the stat shows a grey dash. The problem itself shows in a small red label on the cell.

The change line is worked out only when there is something to compare with. It reads `—` when the earlier value isn't a number or is 0, and `0%` when the change is smaller than a twentieth of a percent. The earlier value is written beside the change as `vs …` when it is a number.

## Events

::ref events-of stat

A stat can be pressed in Live when it handles `click`: the [Market stall](template:events) template refreshes its exchange rate when the rate stat is clicked, with `on.click` set to `(refresh! rate)`. `change` fires when the number changes. See [Events and actions](/events/).

## Actions that change it

None. The number always comes from its expression; `set!` on a stat changes nothing you can see. Change the cells it reads.

## On a phone and on paper

A stat fits the width of its cell. In a narrow cell (under 240 pixels) the `vs …` figure is dropped, and in a very narrow one (under 180) the line is dropped and the number gets smaller. A label that doesn't fit is cut short with an ellipsis. The cell's **align** setting moves the whole stat to the left, centre or right. On paper a stat prints as it shows, line included.

## Usual mistakes

- **The change shows `—`.** The earlier value isn't a number, or is 0: a percentage of 0 means nothing. Check **Compare with**.
- **A rise shows red.** **Lower is better** is on. Turn it off for numbers where more is good.
- **There is no line.** **Trend** needs at least two numbers. A list with text in it only counts its numbers.
- **The number shows as `1240000` where `1.2M` was meant.** Choose a format in **Show the number as**: **Compact (1.2k)** writes 1.2M.
- **The stat shows a dash and a red label.** The expression has a problem, such as a name that no cell has. The label says which.
