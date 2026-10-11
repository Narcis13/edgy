---
title: Accordion
---

An accordion stacks sections that fold open and shut: each section is a panel under a title bar that people click.

::ref kind accordion

## When to use it

Use an accordion for parts that people skim and open one at a time: questions and answers, the terms of a quote, a settings page, the steps of a guide. All the titles stay in view, so people see what is there before they open anything. When the parts are alternatives to look at one after another, [tabs](kind:tabs) fit better. For a single part that folds away, use a [collapsible](kind:collapsible).

The titles of the sections that are open are the accordion's [value](term:value): a list of titles. A formula can react to them, and a button can open or close sections.

## Try it

Open a section. By default opening one closes the other. The text and the handler read the accordion: the handler runs when a section opens and keeps its title in a [data](kind:data) cell.

```live id=faq title="An accordion with a handler" height=250
["col", {"style": {"gap": 8}},
  ["accordion", {"name": "faq", "value": ["Shipping"], "on": {"open": ["set!", "last", "$title"]}},
    ["panel", {"title": "Shipping"}, ["text", "Orders leave in two working days."]],
    ["panel", {"title": "Returns"}, ["text", "Send it back within 30 days."]],
    ["panel", {"title": "Payment"}, ["text", "We take cards and bank transfer."]]],
  ["data", {"name": "last"}, "(none yet)"],
  ["text", {"name": "note", "style": {"fg": "muted"}}, "Opened last: **{{last}}**. Open now: {{(join faq \", \")}}"]]
```

The accordion is named `faq`. Its value is the list of open titles, so one title being open is a list of one:

```sx in=faq
faq
⇒ (list "Shipping")
(includes? faq "Shipping")
⇒ true
```

Opening a section, from a button or from a handler, is `set!`. The `open` handler of the accordion runs and keeps the title:

```sx in=faq
(set! faq "Returns")
faq
⇒ (list "Returns")
last
⇒ "Returns"
note
⇒ "Opened last: **Returns**. Open now: Returns"
```

Setting a list of two titles on an accordion that opens one at a time keeps the one that comes first among the sections, and a title that no section has closes them all, without an error:

```sx in=faq
(set! faq (list "Payment" "Returns"))
faq
⇒ (list "Returns")
(set! faq "Retruns")
faq
⇒ (list)
```

## Adding and designing one

1. Select a cell in **Edit** and press `/`, then choose **Accordion**. The cell moves into the first section, **Section 1**, which starts open, and a second section, **Section 2**, is added after it.
2. Click **Add a section** under the last section to add one. Double-click a title to rename it: Enter keeps the new title and Esc drops it ([the key](key:tabs-rename)).
3. Each section has a **⋯** menu with **Rename**, **Move up**, **Move down**, **Duplicate** and **Remove section**.
4. Click a section's bar to open it, and work on the cells in it. They are split, merged and moved as they are in a [column](kind:col).

::shot designer-accordion "The designer of an accordion: its sections and which are open, whether one or any number can be, and how formulas read it."

With the accordion selected, **Cell details** lists the sections:

- The tick box beside each title says whether that section is open. Edit the title in place.
- The arrows move a section earlier or later, the copy button duplicates the section with its cells, and the bin removes it. The last section can't be removed: delete the whole accordion instead.
- **Add a section** adds one after the last.
- **Open at a time**: **One**, where opening a section closes the one that was open, or **Any number**. Going back to **One** keeps only the first open section.
- Below the list, the designer shows how formulas read the accordion, for example `(includes? faq "Shipping")`, and the action that changes it. When the accordion has no name it offers **Name it** `faq`.
- **Go to the first open section** selects it.

Select a section itself (press Esc once in a cell of it; the heading then reads **Section: Shipping**) to see its own designer, with the title, **Open this section** or **Close this section**, and its place. See [panel](kind:panel).

## In notation

The body is the panels, and only panels:

```notation id=accordion
["accordion", {"name": "faq", "multiple": true, "value": ["Shipping", "Returns"]},
  ["panel", {"title": "Shipping"}, ["text", "Orders leave in two working days."]],
  ["panel", {"title": "Returns"}, ["text", "Send it back within 30 days."]],
  ["panel", {"title": "Payment"}, ["text", "We take cards and bank transfer."]]]
```

| Prop | What it is |
| --- | --- |
| `name` | Lets other cells read and change which sections are open. |
| `value` | The titles of the open sections: a list, or one title. Left out, all sections are closed. |
| `multiple` | `true` lets any number of sections be open. Left out, one section opens at a time. |
| `size` | The accordion's own room inside its row or column: a weight, `"hug"` or `"120px"`. |
| `hidden` | `true`, or an expression: the accordion is out of sight while it holds. |
| `style` | The look of the whole cell. See [Style keys](/styling/style-keys/). |
| `on` | Handlers: `open`, `close` and `change`. |

Written with no panels, `["accordion"]` has two, **Section 1** and **Section 2**, both closed.

## Its value

The list of the titles of the open sections, in the order of the sections: `(list "Shipping")`, or `(list)` when all are closed. It is a list even when only one is open, so test it with `(includes? faq "Shipping")`, and count the open sections with `(len faq)`. A title that no section has is dropped. When the accordion opens one section at a time, only the first of several titles is kept.

Opening or closing a section, in **Edit** or in **Live**, saves it as the accordion's value, the way ticking a list item does. It is kept in the document, and it is not a step for undo.

## Events

::ref events-of accordion

[open](event:open) and [close](event:close) run once for each section opened or closed, with its `title`. [change](event:change) runs once for the whole change. They follow the value, so they run whoever changes it: a person, a button or another handler. See [Events and actions](/events/).

## Actions that change it

[set!](fn:set!) opens and closes sections by title. Give it one title, a list of titles, or an empty list to close all:

```sx
(set! faq "Returns")
(set! faq (list "Shipping" "Returns"))
(set! faq (list))
```

The second only keeps both open when the accordion has **Any number** chosen.

## On a phone and on paper

On a phone the accordion takes the full width. Each section's bar is at least 44 pixels tall, to tap.

On paper every section prints unfolded, in order, each under its title, whether it is open or not. A printed page doesn't end between a title and the first cell under it. See [The Page view](/editor/page-view/).

## Usual mistakes

- **`(= faq "Shipping")` is never true.** The value is a list of titles. Use `(includes? faq "Shipping")`.
- **Nothing is open.** An accordion written in notation without a `value` has every section closed. Add `"value": ["Shipping"]`. One made from the `/` menu opens its first section.
- **I opened two sections and one closed.** The accordion opens one at a time. Choose **Any number** under **Open at a time**, or write `"multiple": true`.
- **A section never opens from the button.** The title in `(set! faq "Returns")` has to be a title the accordion has, and the accordion needs a name. A title with a typo closes all the sections and gives no error. The missing name gives *That button failed:* `no cell called "faq"`.
- **I can't remove the last section.** The accordion keeps at least one: the greyed-out bin's tooltip says *The last section can't go; delete the whole accordion instead.* Select the accordion and press Backspace.
- **The section won't take its new title.** Titles must differ from each other, ignoring case. The designer says *There is already a section called “Returns”.*
