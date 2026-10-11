---
title: Text
---

A text cell shows words: headings, paragraphs and lists written in a small subset of Markdown, with live values from other cells in them.

::ref kind text

## When to use it

Use text for anything people read: a title, a paragraph, a list of terms, a sentence that includes a total. The words can follow the document: put `{{total}}` in them and they show the value of the cell named `total`, and change when it changes.

For a number that should be the whole point of a cell, with a format and nothing else, a [formula](kind:formula) or a [stat](kind:stat) fits better. For words people type themselves, use an [input](kind:input).

## Try it

Change the client or the hours. The heading and the list follow, because they are text with templates:

```live id=quote-text title="Text that follows the cells" height=270
["col", {"style": {"gap": 8}},
  ["row", {"size": "hug", "style": {"gap": 8}},
    ["input", {"name": "client", "type": "text", "label": "Client", "value": "Ada Lovelace", "size": 2}],
    ["input", {"name": "hours", "type": "number", "label": "Hours", "value": 3}]],
  ["text", {"name": "headline"}, "## Quote for {{client}}"],
  ["text", {"name": "lines"}, "- **{{hours}}** hours at {{40 | currency}}\n- Total: **{{(* hours 40) | currency}}**"]]
```

The first line of each text is Markdown: `##` makes a heading, `- ` a list, `**` bold. `{{client}}` and `{{hours}}` are cells; `{{(* hours 40) | currency}}` is an expression followed by a [format](/language/formats/). See [Text templates](/language/templates/).

A text cell's value is its text with the templates worked out. The Markdown marks are still in it:

```sx in=quote-text
headline
⇒ "## Quote for Ada Lovelace"
(set! client "Grace Hopper")
headline
⇒ "## Quote for Grace Hopper"
(set! hours 4)
lines
⇒ "- **4** hours at $40.00\n- Total: **$160.00**"
```

## Adding and designing one

- **By typing.** Select an empty cell and type: the first letter starts a text cell. Select a text cell and click it again, press Enter or double-click to edit its words. Esc or ⌘Enter finishes ([the key](key:cell-done)); Tab finishes and selects the next cell ([the key](key:cell-next)). Your words are saved as you type.
- **From the menu.** Select a cell and press `/`, then choose **Text** ([the key](key:kind-menu)).
- **In Cell details.** **Text** under **Content** is a larger field for the same words.
- **In the formula bar.** It shows the text of the selected cell, with *Text, with {{templates}}* as its hint, and you can edit it there.

::shot designer-text "The text cell's designer: the words, with a reminder of what Markdown and templates do, and the Text section below it."

The **Text** section of **Cell details** opens by default for a text cell. **Text style** offers ready-made looks: **Title**, **Heading**, **Subheading**, **Body**, **Small**, **Caption**, **Label**, **Quote** and **Big number**. Below it are **Font**, **Size**, **Weight**, **Emphasis and case**, **Colour**, **Alignment**, **Line height**, **Letter spacing** and **Space between paragraphs**. They apply to the whole cell. To change a few words only, use Markdown.

### What text supports

| Write | You get |
| --- | --- |
| `# Title`, `## Heading`, `### Subheading` | Three sizes of heading. There must be a space after the `#`s. |
| `**bold**`, `*italic*`, `` `code` `` | Bold, italic and code. |
| `- item` or `* item` | A bulleted list. |
| `1. item` | A numbered list. |
| `[words](https://example.test)` | A link that opens in a new tab. Links can start with `http:`, `https:`, `mailto:`, `/` or `#`. |
| `{{name}}`, `{{(* qty price) \| currency}}` | The value of an expression, optionally in a format. |

A blank line starts a new paragraph. A new line without a blank line breaks the line inside the paragraph. Nothing else is Markdown: tables, pictures, quotes, code blocks, headings deeper than three levels and nested lists are shown as typed.

## In notation

The text is the body. Write a bare string as a child of a row or column and it becomes a text cell:

```notation id=heading
["col",
  ["text", {"style": {"size": 28, "weight": 650}}, "Quote for {{client}}"],
  ["text", "Prepared by **Northwind Studio**.\nValid for 30 days."],
  "A bare string is a text cell too."]
```

| Prop | What it is |
| --- | --- |
| `text` | The words, when not given as the body. |
| `name` | Lets other cells read the text with its templates worked out. |
| `size` | Its room inside its row or column: a weight, `"hug"` or `"120px"`. |
| `hidden` | `true`, or an expression: the cell is out of sight while it holds. |
| `style` | Its look: `size` (the letters), `weight`, `fg`, `align`, `font`, and more. See [Style keys](/styling/style-keys/). |
| `on` | Handlers, such as `click`. |

## Its value

The text, as a string, with every `{{…}}` replaced by what it works out to. A template that fails makes the cell show an error and gives it no value.

## Events

::ref events-of text

In **Live**, a text cell with a `click` or `dblclick` handler can be pressed: it takes a place in the tab order and answers Enter and Space like a button. A heading with `on.click` can open a tab or move a wizard to its next step. See [Events and actions](/events/).

## Actions that change it

None. A text cell shows what it is told to show. To change the words readers see, keep them in an [input](kind:input) or a [data](kind:data) cell and put it in the text with a template: `Hello {{name}}`. [show!](fn:show!) and [hide!](fn:hide!) hide the cell and bring it back.

## On a phone and on paper

Text wraps to the width it has, on a phone as anywhere. Next to other cells in a row, it follows the wrapping rules in [row](kind:row); in a row set to **Keep in line**, text keeps its words whole and gives up some padding.

On paper text prints as it looks, in dark ink on white even when the app is in the dark theme. A printed page ends between cells and does not cut a text cell if it can be avoided; a cell taller than a page is cut where it must be.

## Usual mistakes

- **My `{name}` shows as typed.** Templates need two braces: `{{name}}`.
- **The cell is red and shows its text as I typed it.** A template fails: hover over the cell to see why, such as `no cell called "total"` for a cell that doesn't exist, or `missing )` for a bracket that was never closed. The other words are fine; fix the template.
- **My heading is not a heading.** The `#` needs a space after it: `# Title`, not `#Title`. There are three levels, so `####` is shown as typed.
- **My two lines run together, or my paragraphs are too close.** A new line already breaks the line, and a blank line starts a paragraph. Change the space between paragraphs under **Space between paragraphs** in the **Text** section.
- **My link is not a link.** Only addresses that start with `http:`, `https:`, `mailto:`, `/` or `#` become links. For another address, only the words are shown.
- **It says *Empty text*.** The cell has no words, or its templates give none. The faint note shows in **Live** and on paper too. Clear the cell (Backspace in **Edit**) if you want it empty, or give it a `hidden` condition.
- **I can't change the words in Live.** **Live** is for using the document. Change text in **Edit**.
- **`(set! headline "…")` changes nothing.** Text isn't something an action sets. Keep the words in an input or a data cell, and use a template.
