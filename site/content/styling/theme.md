---
title: Theme
---

The theme is the set of colours and fonts every document is drawn with: the colour tokens, which change between light and dark, the fonts that come with edgy, and the document's own choice of text and heading font.

## Colour tokens

A colour token is a colour named by what it is for rather than how it looks. Write `accent` in a [style key](/styling/style-keys/) and the cell gets edgy's main colour: a deep blue in the light theme, a lighter one in the dark, so the text on it stays readable in both.

```live id=tokens title="Tokens, light and dark" height=210
["col", {"style": {"gap": 8}},
  ["row", {"style": {"gap": 8}},
    ["text", {"style": {"bg": "accent-soft", "fg": "accent", "pad": 10, "radius": 8, "weight": 600}}, "accent"],
    ["text", {"style": {"bg": "live-soft", "fg": "live", "pad": 10, "radius": 8, "weight": 600}}, "live"],
    ["text", {"style": {"bg": "warn-soft", "fg": "warn", "pad": 10, "radius": 8, "weight": 600}}, "warn"],
    ["text", {"style": {"bg": "bad-soft", "fg": "bad", "pad": 10, "radius": 8, "weight": 600}}, "bad"],
    ["text", {"style": {"bg": "agent-soft", "fg": "agent", "pad": 10, "radius": 8, "weight": 600}}, "agent"]],
  ["text", {"style": {"fg": "muted"}}, "muted: second-line text."],
  ["text", {"style": {"fg": "faint"}}, "faint: hints and things switched off."]]
```

Switch the docs between light and dark with the theme button in the header: the fills and text above change together, because they are tokens. A colour typed as `#fde68a` would not.

::ref tokens

The tokens come in two kinds. Most are a pair: a strong colour for text, lines and icons, and a *soft* partner, a pale tint of it, for the fill behind them. The rest set the page: `ink`, `muted` and `faint` are text, `paper`, `sunken` and `line` are surfaces.

::: token ink
The colour of text. It is the default `fg`, so it is what everything is written in unless you say otherwise. Near black in the light theme and near white in the dark one.
:::

::: token muted
Second-rank text: captions, labels, notes under a figure. Softer than `ink`, but still easy to read. Called *Grey* in the colour pickers.
:::

::: token faint
The quietest text: hints, placeholders, anything switched off. Not for text people must read. Called *Light grey* in the pickers.
:::

::: token paper
The colour of the sheet itself: white in the light theme, a dark violet in the dark one. Use it as a `bg` to put a card on a tinted area, or to lift a shadowed cell off a `sunken` one.
:::

::: token sunken
A slightly recessed fill, a little darker than `paper` in the light theme and lighter in the dark. It marks a region without a border: a column of notes, a row of summary figures. Called *Shade* in the pickers.
:::

::: token line
A hairline: a faint, see-through grey for the thin rules between things. It is the one token the pickers leave out, but it works anywhere a colour does, for instance as a `bcolor`. A border with no `bcolor` is drawn in a firmer line colour than this one.
:::

::: token accent
The main colour of edgy: buttons, selections, links, the thing to press or look at first. Blue.
:::

::: token accent-soft
The pale tint of `accent`: a background that says "this is selected or active" without shouting. Text on it is usually `accent` itself.
:::

::: token agent
The pink edgy uses for agents and for Ask AI. Called *Pink* in the pickers.
:::

::: token agent-soft
The pale tint of `agent`, the fill behind agent-coloured labels and badges.
:::

::: token live
Good, running, done. Green, for a total that is on target, a task ticked off, a saved confirmation. Called *Green* in the pickers.
:::

::: token live-soft
The pale tint of `live`: the fill for a "saved" or "all set" note.
:::

::: token warn
Take care. Amber, for a figure near its limit or something to check before going on. Called *Amber* in the pickers.
:::

::: token warn-soft
The pale tint of `warn`: the fill for a caution that deserves a box of its own.
:::

::: token bad
Wrong or negative. Red, for an overdraft, an overdue task, an error someone must see. Called *Red* in the pickers.
:::

::: token bad-soft
The pale tint of `bad`: the fill for an error message or a figure below zero.
:::

### Where a token can be used

Wherever the picker offers colours: `bg`, `fg` and `bcolor` in a [style](/styling/style-keys/); the `color` and `fill` of a diagram shape; the colours a table gives to the values of a badge column. Of edgy's own colours these are the only ones a document can name; the rest, for its panels and menus, are not available to it.

### How they follow the theme

Each token is a variable of the page, `--accent`, `--ink` and so on, with one value for light and one for dark. A cell that uses a token holds only its name. When the theme changes, the variable changes and every cell using it is drawn again, with nothing in the document touched.

The theme is yours, not the document's: two people with the same document open can look at it in different themes. You choose it with the sun or moon button in the header, or under **Theme** in your profile, where **Same as the system** follows your computer. A choice in the profile goes with you to every browser you sign in on.

Printed pages are always drawn with the light values, whatever you see on screen, so a document with a dark theme prints on white paper.

## Fonts

The fonts below come with edgy and are stored with it, not fetched from the internet, so a document looks the same offline, in an exported file and on paper.

::ref fonts

A cell uses one with `font` in its style; the document sets a default for all of them. A font is named by its id: `"serif"`, `"jetbrains"`, `"caveat"`. An id that isn't in the list is ignored.

### The document's fonts

With no cell selected, **Cell details** shows the document itself. Its **Typography** section has three settings:

- **Text font**: the font of everything, unless a cell has its own. Default: *Recursive*.
- **Heading font**: the font of headings, which are the lines written with `#`, `##` or `###` in a text cell. Default: *Same as the text*.
- **Base text size**: the size that text starts from, in pixels. Default: 15.

They are the `font`, `headFont` and `fontSize` settings of the document, and they are set with `meta` ops:

```notation id=letter
["col", {"style": {"gap": 6}},
  ["text", "# Quote for Ada Lovelace"],
  ["text", "Northwind Studio thanks you for asking. The work below takes **three weeks**."]]
```

```ops in=letter id=letter2
[["meta", "font", "lora"], ["meta", "headFont", "fraunces"], ["meta", "fontSize", 17]]
```

Here is the same document, set that way:

```live id=fonts title="Lora text, Fraunces headings, 17 pixels" height=170
{"root": ["col", {"style": {"gap": 6}},
    ["text", "# Quote for Ada Lovelace"],
    ["text", "Northwind Studio thanks you for asking. The work below takes **three weeks**."]],
 "meta": {"font": "lora", "headFont": "fraunces", "fontSize": 17}}
```

A cell's own `font` wins over the document's for that cell, and for the headings inside it. The base size accepts 8 to 40 pixels, though the panel offers 10 to 24; a `size` in a cell's style is the text size for that cell alone.

The [Studio billing](template:tables) template sets Inter for text and Fraunces for headings.
