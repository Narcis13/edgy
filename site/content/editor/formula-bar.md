---
title: The formula bar
---

The formula bar is the strip under the header that shows the selected cell's name and its source, the way a spreadsheet shows a cell's formula, and lets you change that source without opening anything else.

::shot formula-bar "The formula bar over a selected formula cell: the cell's name, its expression in colour, the result, and the buttons that open the code studio and Ask AI."

## What it shows

On the left is the cell's **name**, in bold, with the icon of its kind. A cell with no name shows its id, in grey. Point at it to see the id of a named cell.

Next to it is the cell's **source**: the one thing that makes the cell what it is. What that is depends on the kind:

| Kind | The bar shows | You can change |
| --- | --- | --- |
| [formula](kind:formula), [chart](kind:chart), [table](kind:table), [stat](kind:stat), [calendar](kind:calendar) | The expression, in colour | The expression |
| [list](kind:list) | The expression, if the list is computed; otherwise a note that items are edited in the cell | The expression |
| [text](kind:text) | The text, with its `{{templates}}` | The text |
| [input](kind:input) | The value | The value; a number field takes a number, a checkbox or toggle takes `true`, `yes`, `1` or `on` |
| [button](kind:button) | The action it runs, as code | The action |
| [image](kind:image) | The picture's link | The link |
| [icon](kind:icon) | The icon's name | The name |
| [data](kind:data) | The value, as JSON or plain text | The value |
| [fetch](kind:fetch) | The address | The address |
| [collapsible](kind:collapsible), [panel](kind:panel) | The heading or the title | The heading or the title |
| [timer](kind:timer), [tabs](kind:tabs), [accordion](kind:accordion), [diagram](kind:diagram), [canvas](kind:canvas), [row](kind:row), [col](kind:col), [break](kind:break), [empty](kind:empty) | A sentence about the cell, such as *Ticks every 30 seconds* or *Select one inside to edit it* | Nothing: use the cell, or [Cell details](/editor/panel/) |

With nothing selected, the bar shows the document's title and *Select a cell. Its formula or text shows here.*

For a formula or a stat, the bar also shows the result after an equals sign. If the cell has an error, the error shows there instead, in red.

## Changing the source

Click in the bar and type. The kinds that hold code use a code field; the rest use a plain one.

A **code field** colours the expression as you type, closes brackets, suggests names, and shows the arguments of the function you are in. The details are on [The code studio](/editor/code-studio/). In the bar:

- Enter applies the change; Shift+Enter starts a new line.
- Esc drops what you typed and puts the old source back.
- Leaving the field, by clicking elsewhere, also applies it.
- If the code can't be read, Enter shows why under the field and keeps it open; the cell is not changed. Leaving the field instead puts the old source back.
- While the field has focus, click another cell in the document to type its name into the code.
- The two buttons at the right end of the bar open the [code studio](/editor/code-studio/) on this code: the expand button (⌘E) and the sparkle button, **Ask AI to write it**, which opens the studio on [Ask AI](/editor/ask-ai/). Whatever you had typed comes with you.

```notation id=bar
["row",
  ["input", {"name": "qty", "type": "number", "value": 3}],
  ["input", {"name": "price", "type": "number", "value": 4}],
  ["formula", {"name": "total"}, ["*", "$qty", "$price"]]]
```

Select `total` here and the bar shows this expression. Typed, it reads the way the code studio colours it:

```sx in=bar
(* qty price)
⇒ 12
```

A **plain field** (text, value, link, heading) applies when you leave it or press Enter. In a text cell the field is taller and Enter starts a new line; Esc or ⌘Enter leaves it. Either way, Esc keeps what you typed: the plain fields apply when they lose focus.

Every change you apply in the bar is one step for [undo](/editor/undo/). Nothing changes in the cell while you type: the change is made when you apply it.

## The same fields elsewhere

The fields in the bar are the fields in [Cell details](/editor/panel/) and the ones you type into in the cells themselves. A formula cell opened for editing in the document is a code field with a live result under it. A number box in Cell details applies each valid number as you type. A name or a title applies when you leave the box.

## On a phone

The bar is hidden in Live and in Page, because there is nothing to edit there. In Edit it stays.

The code is in [FormulaBar.tsx](src:src/web/editor/FormulaBar.tsx) and [fields.tsx](src:src/web/editor/fields.tsx).
