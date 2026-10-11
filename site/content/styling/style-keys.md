---
title: Style keys
---

A style key is one setting of how a cell looks, such as its fill, its text size or its corners, kept in the cell's `style`; this page lists every key, the values it takes and what it does.

## A cell's style

```live id=card title="A card from a few keys" height=170
["col", {"style": {"pad": 16}},
  ["text", {"style": {"bg": "accent-soft", "fg": "accent", "pad": "14 18", "radius": 12,
                      "border": "all", "bcolor": "accent", "shadow": "md", "size": 18, "weight": 650}},
    "Northwind Studio: quote for Ada Lovelace"]]
```

The text cell has a `style` with nine keys. `bg` fills it, `fg` colours its text, `pad` and `radius` shape the box, `border`, `bcolor` and `shadow` draw its edge, and `size` and `weight` set the type. A key you leave out takes the default, and a style is only the keys you changed.

In the editor, **Cell details** has three sections that write these keys: **Text**, **Spacing and size** and **Box**. A row or column adds **Gap between cells** and, for a row, **On a phone**. Each setting has a small reset beside it that removes the key again. Cells that take no room (a [data](kind:data) cell, a [timer](kind:timer), a page [break](kind:break)) have no **Box**, and those that show no text ([image](kind:image), [canvas](kind:canvas), [diagram](kind:diagram), data, timer, [fetch](kind:fetch)) have no **Text**.

In notation, `style` is an object, and the `style` op sets several keys at once:

```notation id=heading
["text", {"style": {"size": 28, "weight": 700}}, "Quote for Ada Lovelace"]
```

```ops in=heading
[["style", "c1", {"fg": "accent", "case": "upper", "tracking": 0.06}]]
```

An unknown key is refused with the list of known ones. A value a key can't use (a size of `"big"`) is ignored: the cell looks as if the key were not there.

Colour and font keys set on a row or column are inherited by the cells inside it, unless a cell sets its own. Box keys (`bg`, `pad`, `border`, `radius`, `shadow`) belong to the cell they are set on only.

::ref style-keys

## Colours

`bg`, `fg` and `bcolor` take a colour. A colour is one of the [colour tokens](/styling/theme/), named by what they mean (`accent`, `muted`, `bad`) so that they follow the light and dark themes, or any CSS colour: `#fde68a`, `rgb(20, 30, 40)`, `tomato`. In **Cell details** the swatches are the tokens, and **Other colour…** takes the rest. Prefer a token: a colour you type is the same in light and dark.

## Conditional styles

Any style value may be an expression instead of a fixed value. It is worked out for the cell, so it reads other cells by name, and the style follows as they change.

```live id=balance title="A colour that follows a value" height=190
["col", {"style": {"gap": 8}},
  ["input", {"name": "balance", "type": "number", "label": "Balance (try a negative number)", "value": 120}],
  ["formula", {"name": "shown", "format": "currency",
               "style": {"size": 28, "weight": 700, "pad": 12, "radius": 10,
                         "fg": ["if", ["<", "$balance", 0], "bad", "live"],
                         "bg": ["if", ["<", "$balance", 0], "bad-soft", "live-soft"]}},
    "$balance"]]
```

The formula's `fg` is `(if (< balance 0) "bad" "live")`. Each time `balance` changes, the expression gives `"bad"` or `"live"`, and that token colours the text.

```sx in=balance
(if (< balance 0) "bad" "live")
⇒ "live"
(set! balance -30)
(if (< balance 0) "bad" "live")
⇒ "bad"
```

An expression is written where the value would be: in the colour field of **Cell details** (**Other colour…**, as `(if …)`), in the cell's **Notation**, or with a `set` op on `style.fg`. A control that cannot show an expression, such as **Padding**, says *Set by a formula or in other units* and leaves it alone. If the expression has an error, the cell shows it and the key is ignored until it is fixed.

## The keys

::: style bg
The fill behind the cell, a [colour](#colours). Default: none, so the document shows through.

In **Cell details**: **Box → Fill**.

```notation
["text", {"style": {"bg": "warn-soft", "fg": "warn", "pad": 10, "radius": 10}}, "Prices change on Monday."]
```
:::

::: style fg
The colour of the text, a [colour](#colours). Default: `ink`.

In **Cell details**: **Text → Colour**. `muted` and `faint` are for captions and labels; `bad` is for something wrong.
:::

::: style pad
The room between the cell's edge and what is in it. A number is pixels: `12`. Text gives four sides in the order top, right, bottom, left, written like CSS: `"8 16"` is 8 above and below and 16 left and right, `"4 0 4 16"` is each side on its own. A bare number inside the text is pixels.

Default: 10 pixels above and below and 12 at the sides for a cell with content, a little less on a narrow sheet; 0 for a row or column.

In **Cell details**: **Spacing and size → Padding**, as steps (None, S, M, L: 0, 6, 12, 24 pixels), a number, or each side on its own.

```notation
["text", {"style": {"bg": "sunken", "pad": "4 0 4 16", "border": "l", "bcolor": "accent"}}, "Notes in the margin."]
```
:::

::: style gap
The space between the cells of a row or column, in pixels. It applies to a [row](kind:row) or [col](kind:col) only; on any other cell it does nothing. Default: 0. Dividing lines in **Edit** sit in the gap.

In **Cell details**, on the row or column: **Gap between cells**, from 0 to 80.

```notation
["row", {"style": {"gap": 12}}, ["text", "One"], ["text", "Two"], ["text", "Three"]]
```
:::

::: style align
Which way the content leans across the cell: `"start"` (left), `"center"`, `"end"` (right) or `"justify"`, which spreads lines of text out to the full width. It sets the alignment of text, and it also places what is not text, such as a toggle or the figure of a [stat](kind:stat), at the left, middle or right of the cell.

In **Cell details**: **Text → Alignment**, the first group of four icons.

```live id=align title="Align" height=200
["col", {"style": {"gap": 4}},
  ["text", {"style": {"align": "start", "bg": "sunken", "pad": 8}}, "Start"],
  ["text", {"style": {"align": "center", "bg": "sunken", "pad": 8}}, "Center"],
  ["text", {"style": {"align": "end", "bg": "sunken", "pad": 8}}, "End"]]
```
:::

::: style valign
Where the content sits when the cell is taller than it needs: `"start"` (top), `"center"` (middle) or `"end"` (bottom). Default: the top.

In **Cell details**: **Text → Alignment**, the second group of three icons.

```notation
["row", {"size": "hug", "style": {"gap": 8}},
  ["text", {"style": {"valign": "center", "bg": "sunken", "pad": 8, "size": 13}}, "Centred between two taller neighbours."],
  ["text", {"size": "hug", "style": {"size": 40, "weight": 800}}, "42"]]
```
:::

::: style font
The typeface of the cell and of the headings inside it: one of the font ids listed on [Theme](/styling/theme/). An id that isn't in the list is ignored. Default: the document's own font.

In **Cell details**: **Text → Font**, a list that shows each font in its own face.

```notation
["text", {"style": {"font": "serif", "size": 22}}, "A line set in Newsreader."]
```
:::

::: style size
The size of the text, as a number of pixels from 8 to 200; a number outside is brought into that range. Default: the document's base text size, 15. It is the text size and nothing else. The cell's *own* `size` (`"hug"`, a weight, `"120px"`) is a different thing that sits next to `style`, not inside it: it decides how much room the cell takes in its row.

In **Cell details**: **Text → Size**, steps from 12 to 48 and a number field; **Text → Text style** sets a size together with weight and spacing in one choice, such as **Title**, **Caption** or **Big number**.

```notation
["text", {"style": {"size": 44, "weight": 800, "tracking": -0.03, "line": 1}}, "1,840"]
```
:::

::: style weight
How heavy the letters are, a number from 100 to 900 (400 is regular, 700 bold).

In **Cell details**: **Text → Weight**: **Light** (300), **Regular**, **Medium** (500), **Semibold** (600), **Bold** (700) and **Black** (850).
:::

::: style italic
`true` slants the text. Leave it out for upright.

In **Cell details**: **Text → Emphasis and case**, the first icon.
:::

::: style border
Which edges of the cell have a line. `"all"` draws all four, `"none"` none, and letters pick sides: `t` top, `r` right, `b` bottom, `l` left, in any combination (`"tb"` is a line above and below). The line is drawn in the colour of `bcolor` and the width of `bwidth`.

In **Cell details**: **Box → Border**: **None**, **All round** or **Some sides**, with a button each for **Above**, **Below**, **Left** and **Right**.

```live id=border title="Borders" height=190
["col", {"style": {"gap": 8}},
  ["text", {"style": {"border": "all", "pad": 10, "radius": 8}}, "all"],
  ["text", {"style": {"border": "b", "bcolor": "accent", "bwidth": 3, "pad": 10}}, "b, in the accent colour, 3 pixels wide"],
  ["text", {"style": {"border": "tb", "pad": 10}}, "tb"]]
```
:::

::: style radius
How round the corners are, a number of pixels (or CSS text such as `"50%"`). Default: square.

In **Cell details**: **Box → Corners**: square, 4, 8 or 16 pixels, or a number up to 80.
:::

::: style line
The height of a line of text, as a multiple of the text size: a number from 0.8 to 4. Default: 1.45. The text style **Title** uses 1.1.

In **Cell details**: **Text → Line height**, a slider from 1 to 2.2.
:::

::: style stack
What a row does when the screen is narrow. A [row](kind:row) only. `"auto"` (the default) lets its cells wrap under each other when the sheet is 600 pixels wide or less. `"never"` keeps them side by side at any width, for lines that act as table rows. `"always"` stacks them one above the other at any width.

In **Cell details**, on the row: **On a phone**: **Stack**, **Keep in line** or **Always stack**.

```notation
["row", {"size": "hug", "style": {"stack": "never", "border": "b"}},
  ["text", "Apples"], ["text", {"size": "hug", "style": {"align": "end"}}, "2.40"]]
```
:::

::: style tracking
The space between letters, in em (a fraction of the text size): from -0.1 to 0.5. Default: 0. The text style **Label** (small capitals) uses 0.08, and **Big number** -0.03.

In **Cell details**: **Text → Letter spacing**, a slider from -0.05 to 0.2.
:::

::: style case
Changes the capitals of the text as it is shown: `"upper"` (ALL CAPITALS), `"lower"` (all small letters) or `"title"` (each Word Capitalised). The text itself is not changed: a formula that reads it still sees what was typed.

In **Cell details**: **Text → Emphasis and case**, the four choices **–**, **AA**, **aa** and **Aa**.
:::

::: style decor
`"underline"` or `"strike"` (a line through the text). Only one at a time.

In **Cell details**: **Text → Emphasis and case**, the second and third icons.
:::

::: style para
The space between paragraphs of a text cell, in pixels: from 0 to 80. Default: a little under half a line. A paragraph is a block of text separated by a blank line.

In **Cell details**: **Text → Space between paragraphs**.

```live id=para title="Space between paragraphs" height=200
["text", {"style": {"para": 24, "bg": "sunken", "pad": 12}},
  "The first paragraph.\n\nThe second paragraph, with 24 pixels above it.\n\nThe third."]
```
:::

::: style bcolor
The colour of the border, a [colour](#colours). Default: a soft grey line that follows the theme. It has an effect only when `border` draws something.

In **Cell details**: **Box → Border colour**, shown once a border is on.
:::

::: style bwidth
How thick the border is, in pixels: from 0 to 12. Default: 1. It has an effect only when `border` draws something.

In **Cell details**: **Box → Border width**, shown once a border is on.
:::

::: style shadow
A shadow under the cell that lifts it off the page: `"sm"`, `"md"` or `"lg"`. Default: none. A shadow belongs to the cell it is set on: a row's shadow does not pass to the cells inside it.

In **Cell details**: **Box → Shadow**: **None**, **Soft**, **Medium** or **Deep**.

```live id=shadow title="Shadows" height=150
["row", {"style": {"gap": 16, "pad": 16}},
  ["text", {"style": {"shadow": "sm", "pad": 12, "radius": 10, "bg": "paper"}}, "sm"],
  ["text", {"style": {"shadow": "md", "pad": 12, "radius": 10, "bg": "paper"}}, "md"],
  ["text", {"style": {"shadow": "lg", "pad": 12, "radius": 10, "bg": "paper"}}, "lg"]]
```
:::

## Usual mistakes

- **The key does nothing.** Some keys belong to some cells: `gap` and `stack` to rows and columns, `bcolor` and `bwidth` only with a `border`, `para` to text. An unused key stays in the style and is harmless.
- **The text size didn't change.** `size` inside `style` is the text size. The `size` next to it, outside `style`, is how much room the cell takes.
- **A colour looks wrong in dark mode.** A colour you typed (`#fde68a`) is the same in both themes, while a token (`warn-soft`) changes. Use tokens for fills and text.
- **"unknown style".** The key is misspelt. The message lists the keys there are.
