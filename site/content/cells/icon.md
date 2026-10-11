---
title: Icon
---

An icon cell shows one small symbol, such as a star, a tick or an anchor, drawn in the colour and size of the text around it.

::ref kind icon

## When to use it

Use an icon to mark something: a status beside a name, a logo-sized symbol in a header, a bullet that means more than a dot. It is drawn as lines in the text colour, so it follows the theme and the cell's colour. For a photo or a logo file, use a [picture](kind:image). For an icon on a button, use the button's own **Icon** setting: see [button](kind:button).

## Try it

Switch **Paid** on. One icon hides and the other shows, because each has a `hidden` condition that reads the toggle:

```live id=status title="Icons that follow a toggle" height=100
["row", {"size": "hug", "style": {"gap": 12}},
  ["input", {"name": "paid", "type": "toggle", "label": "Paid", "size": "hug"}],
  ["icon", {"size": "hug", "hidden": "$paid", "style": {"fg": "warn", "size": 28}}, "hourglass"],
  ["icon", {"name": "tick", "size": "hug", "hidden": ["not", "$paid"], "style": {"fg": "live", "size": 28}}, "circle-check"],
  ["text", {"style": {"valign": "center"}}, "{{(if paid \"Paid\" \"Waiting for payment\")}}"]]
```

The colour is the style `fg`, and the size of the symbol is the style `size`, in pixels. The symbol is 1.7 times the cell's text size wide.

An icon is worth its name:

```sx in=status
tick
⇒ "circle-check"
```

## Adding and designing one

1. Select a cell in **Edit**, press `/` and choose **Icon** ([the key](key:kind-menu)). It starts as **sparkles**.
2. Pick another in **Cell details**: a grid of symbols with a **Search icons** field above it. Type part of a name, such as `cart`, and the grid narrows.
3. Or type the name in the formula bar, which shows **Icon name** for an icon cell.

::shot designer-icon "The icon's designer: a searchable grid of symbols."

An icon has no other settings of its own. **Cell details** says *Its colour and size are under Text*: open **Text** and choose **Colour** and **Size**. The alignment buttons there place the symbol in its cell.

## In notation

The body is the icon's name:

```notation id=header-icons
["row", {"size": "hug", "style": {"gap": 12}},
  ["icon", {"size": "hug", "style": {"fg": "accent", "size": 30}}, "anchor"],
  ["text", {"style": {"size": 22, "weight": 700, "valign": "center"}}, "Northwind Studio"]]
```

| Prop | What it is |
| --- | --- |
| `icon` | The name, when not given as the body: lower case with hyphens, such as `"circle-check"`. |
| `name` | Lets other cells read the icon's name. |
| `size` | Its room inside its row or column: a weight, `"hug"` or `"120px"`. |
| `hidden` | `true`, or an expression: the cell is out of sight while it holds. |
| `style` | Its look: `fg` for the colour, `size` for the size, `align` for where it sits. See [Style keys](/styling/style-keys/). |
| `on` | Handlers, such as `click`. |

## Its value

The icon's name, as text. It never changes while the document is in use.

## Events

::ref events-of icon

In **Live**, an icon with a `click` handler can be pressed: it takes a place in the tab order and answers Enter and Space like a button. See [Events and actions](/events/).

## Actions that change it

None change which symbol it is. An action sets the value of a cell that holds one, and an icon's value is its name, which stays as it is written:

```sx in=status
(set! tick "circle-x")
tick
⇒ "circle-check"
```

To switch between symbols while the document is in use, put two icons side by side and show one of them, as the example does. [show!](fn:show!) and [hide!](fn:hide!) set the `hidden` rule of a cell from an action.

## On a phone and on paper

On a phone an icon keeps its size. In a row that wraps it follows the rules in [row](kind:row), so give it **Hug** to keep it from taking a share of the width. On paper it prints as lines in its colour.

## Usual mistakes

- **A circle with a question mark shows.** The name is not one edgy has: it may be misspelled, or from another set. Names are lower case with hyphens. Pick the symbol from the grid in **Cell details**; the name in the formula bar then comes out right.
- **The icon is too small, or the wrong colour.** The size and colour are the text's. Change **Size** and **Colour** in the **Text** section.
- **`(set! tick "circle-x")` changes nothing.** The name is not a value an action can set. Use two icons and show one of them.
- **The icon takes half the row.** It shares the width like any cell. Set its **Width** to **Hug**.
