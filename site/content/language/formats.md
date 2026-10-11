---
title: Formats
---

A format says how a value is written when it is shown: `1840` as `$1,840.00`, `0.256` as `25.6%`, a date as `Oct 11, 2026`. The value does not change; only the words do.

::ref formats

## Where you choose one

- **Format** in **Cell details**, for a [formula](kind:formula), [stat](kind:stat) or [chart](kind:chart), and for the columns of a [table](kind:table). The menu offers **Automatic**, **Whole number**, **Two decimals**, **One decimal**, **Percent**, **Compact (1.2k)**, **Currency**, **US dollars**, **Euros**, **Pounds**, **Lei**, **Date**, **Time**, **Date and time** and **Time ago**.
- `format` in notation, on those cells and on a table column.
- After a bar in a [text template](/language/templates/): `{{total | currency}}`.
- The [fmt](fn:fmt) function, which gives the formatted value as text: `(fmt total "currency")`.

The menu is a short list. The notation, the template and `fmt` read more than the menu shows, as [the shapes below](#shapes-a-format-can-take) explain.

Every example below uses `fmt`, so you can see the result. All formats write in the English (US) style, with commas between thousands and a point for decimals.

```sx
(fmt 1840 "currency")
⇒ "$1,840.00"
(fmt 0.256 "percent")
⇒ "25.6%"
```

`fmt` gives text. After formatting, a number is no longer a number to calculate with:

```sx
(type (fmt 1840 "int"))
⇒ "string"
```

Format at the end, in the cell or the template that shows the value, and keep the formulas working on the number.

## Numbers

::: format auto
No format at all: how a value shows when none is chosen. `auto` is what a cell without a format uses, and what `fmt` uses when it is given nothing.

A number gets a comma between thousands and at most two decimals, or four when its size is below 1. Text is shown as it is. `true` and `false` show as `yes` and `no`. A list shows its items joined by a comma and a space. Nothing shows as nothing.

```sx
(fmt 1234.5678)
⇒ "1,234.57"
(fmt 0.123456)
⇒ "0.1235"
(fmt true)
⇒ "yes"
(fmt (list "a" 2.5))
⇒ "a, 2.5"
(fmt nil)
⇒ ""
```

Choosing **Automatic** in the menu removes the format.
:::

::: format int
A whole number: rounded to the nearest, with commas between thousands.

```sx
(fmt 1234.5 "int")
⇒ "1,235"
(fmt 0.4 "int")
⇒ "0"
(fmt -1234.5 "int")
⇒ "-1,235"
```

It rounds for show only. A formula that [round](fn:round)s changes the value itself.
:::

::: format number
Exactly two decimals, with commas between thousands. **Two decimals** in the menu.

```sx
(fmt 1234.5 "number")
⇒ "1,234.50"
(fmt 1234 "number")
⇒ "1,234.00"
```

For another number of decimals, see the [number patterns](#shapes-a-format-can-take): `0.0`, `0.000`.
:::

::: format percent
A fraction written as a percentage: 1 is 100%. Up to one decimal, and none when the value is a whole percent.

```sx
(fmt 0.256 "percent")
⇒ "25.6%"
(fmt 0.12 "percent")
⇒ "12%"
(fmt 1.5 "percent")
⇒ "150%"
```

A value of 25 is 2,500%, not 25%. Divide first when your number is already a percentage: `(fmt (/ discount 100) "percent")`.
:::

::: format compact
A short form for big numbers: thousands as `K`, millions as `M`, billions as `B`, with up to one decimal. Numbers under a thousand stay as they are.

```sx
(fmt 1500 "compact")
⇒ "1.5K"
(fmt 1234567 "compact")
⇒ "1.2M"
(fmt 999 "compact")
⇒ "999"
(fmt -2500 "compact")
⇒ "-2.5K"
```

Good for a [stat](kind:stat) or a narrow table column, where the exact amount matters less than its size.
:::

::: format currency
Money in the document's currency: the symbol, commas between thousands, two decimals. The document's currency is `USD` until you change it; see [the document currency](#the-document-currency) below.

```sx
(fmt 1234.5 "currency")
⇒ "$1,234.50"
(fmt -1234.5 "currency")
⇒ "-$1,234.50"
(fmt (list 5 10) "currency")
⇒ "$5.00, $10.00"
```

To write one amount in a fixed currency whatever the document says, give the code itself: `(fmt 1234.5 "EUR")` is [a currency code](#shapes-a-format-can-take).
:::

## Dates and times

These formats read a date written as text (`"2026-10-11"`, or with a time, `"2026-10-11T14:30:00"`) or a time in milliseconds, such as [now](fn:now) gives. A value that isn't a date is shown as it is. A date without a time counts as midnight, and the time is the one on the clock where the document is open.

::: format date
The day, with the month in words and the year.

```sx
(fmt "2026-10-11" "date")
⇒ "Oct 11, 2026"
(fmt "2026-10-11T14:30:00" "date")
⇒ "Oct 11, 2026"
(fmt "soon" "date")
⇒ "soon"
```
:::

::: format time
The time of day on a 12-hour clock, without seconds.

```sx
(fmt "2026-10-11T14:30:00" "time")
⇒ "2:30 PM"
(fmt "2026-10-11T09:05:00" "time")
⇒ "9:05 AM"
(fmt "2026-10-11" "time")
⇒ "12:00 AM"
```

A date with no time is midnight, so `time` of a bare date is `12:00 AM`. Use it on values that carry a time.
:::

::: format datetime
The month and day, then the time. The year is left out.

```sx
(fmt "2026-10-11T14:30:00" "datetime")
⇒ "Oct 11, 2:30 PM"
```

When the year matters, show two cells, or write `{{when | date}} {{when | time}}` in a text.
:::

::: format ago
How long ago something happened, in the largest unit that fits: `just now` under 45 seconds, then minutes, hours and days. After 30 days it gives the date, as [date](format:date) does. A moment in the future also reads `just now`.

```sx
(fmt (- (now) 10000) "ago")
⇒ "just now"
(fmt (- (now) 600000) "ago")
⇒ "10 min ago"
(fmt (- (now) 7200000) "ago")
⇒ "2 h ago"
(fmt (- (now) 259200000) "ago")
⇒ "3 d ago"
```

In a template or with `fmt`, a cell that uses `ago` is worked out again every second while the document is open, so the words stay true: `10 min ago` turns into `11 min ago` by itself.
:::

## Shapes a format can take

Besides the names above, a format can be one of two shapes.

### A currency code

Three letters name a currency: `USD`, `EUR`, `GBP`, `RON`. The case doesn't matter. The amount is written with that currency's symbol and two decimals, whatever the document's currency is.

```sx
(fmt 1234.5 "EUR")
⇒ "€1,234.50"
(fmt 1234.5 "gbp")
⇒ "£1,234.50"
(fmt 1234.5 "JPY")
⇒ "¥1,235"
```

A currency with no symbol of its own in English is written with its code in front of the amount, as for `RON`. Any three letters are taken as a code, so a format you invent with three letters, such as `abc`, shows `ABC` before the number.

### A number pattern

`0`, with a point and more zeros for decimals, and an optional `%`. It sets how many decimals show, and with `%` multiplies by 100 first.

| Pattern | Gives | For 1234.567 | For 0.256 |
| --- | --- | --- | --- |
| `0` | no decimals | `1,235` | `0` |
| `0.00` | two decimals | `1,234.57` | `0.26` |
| `0.0%` | a percentage, one decimal | | `25.6%` |

```sx
(fmt 1234.567 "0")
⇒ "1,235"
(fmt 1234.567 "0.00")
⇒ "1,234.57"
(fmt 5 "0.000")
⇒ "5.000"
(fmt 0.256 "0%")
⇒ "26%"
(fmt 0.256 "0.0%")
⇒ "25.6%"
(fmt 0.256 "0.00%")
⇒ "25.60%"
```

**One decimal** in the menu is the pattern `0.0`.

## The document currency

The [currency](format:currency) format writes in the document's currency. Set it in **Cell details** with no cell selected: under **Document**, in **Page**, the **Currency** field takes a three-letter code and writes it in capitals. Left empty, it is `USD`. In notation it is the document's `currency` setting:

```notation id=euro
{"root": ["col",
    ["input", {"name": "price", "type": "number", "value": 1234.5}],
    ["formula", {"name": "shown", "format": "currency"}, "$price"]],
 "meta": {"currency": "EUR"}}
```

```sx in=euro
(fmt price "currency")
⇒ "€1,234.50"
(fmt price "USD")
⇒ "$1,234.50"
```

Everything that formats in this document follows it: the formula above, the `{{ | currency}}` in a text, a stat, a chart, a table column. A code in the setting that no currency has (`EURO`) can't be used, and amounts then show as plain numbers.

## When the value doesn't fit

- Nothing shows as nothing, whatever the format.
- A number format on text that isn't a number leaves the text as it is: `(fmt "abc" "int")` gives `"abc"`. Text that is a number is formatted: `(fmt "1234" "int")` gives `"1,234"`.
- Empty text counts as 0 in a number format: `(fmt "" "currency")` gives `"$0.00"`.
- A list is formatted item by item, joined by commas.
- A format that isn't known, a word that isn't three letters or a pattern, is ignored and the value shows as with **Automatic**.

```sx
(fmt "abc" "int")
⇒ "abc"
(fmt "1234" "int")
⇒ "1,234"
(fmt 1234.5 "sparkle")
⇒ "1,234.5"
```
