---
title: Panel
---

A panel is one tab of [tabs](kind:tabs) or one section of an [accordion](kind:accordion): a title and the cells under it.

::ref kind panel

## When to use it

You don't add a panel by itself. A panel only ever sits directly inside tabs or an accordion, and it is what they show: each tab is a panel, and so is each section. You work with panels when you add a tab or a section, rename one, move it, copy it, or put cells in it.

The panel's title does two jobs. It is the words on the tab or on the section's bar, and it is the key that the tabs' or the accordion's [value](term:value) uses to say which panels are open. That is why titles in one container must differ.

## Try it

The first panel is named `items`, so other cells can read it. The second reads it from its own tab while **Items** is closed:

```live id=panels title="Two panels, one reading the other" height=190
["tabs", {"name": "step"},
  ["panel", {"title": "Items", "name": "items"},
    ["input", {"type": "number", "label": "Chairs", "value": 4}],
    ["input", {"type": "number", "label": "Tables", "value": 1}]],
  ["panel", {"title": "Summary"},
    ["text", {"name": "summary"}, "{{(sum items)}} things in **Items**."]]]
```

A named panel reads as the list of the values of the cells in it, the way a [column](kind:col) does:

```sx in=panels
items
⇒ (list 4 1)
(sum items)
⇒ 5
summary
⇒ "5 things in **Items**."
```

Which panel is showing is not the panel's value but the tabs': `step` is `"Items"`.

```sx in=panels
step
⇒ "Items"
```

## Adding and designing one

- **A new tab or section.** Click the **+** at the end of the tab bar, or **Add a section** under an accordion; or select a panel and split it (Alt+→, or the **+** on its edge): splitting a panel adds a panel beside it, not a cell inside it ([the key](key:split)). **Add a tab** and **Add a section** in **Cell details** do the same.
- **Cells in a panel.** A panel holds its cells stacked like a [column](kind:col). Select a cell in it and split, merge, move or duplicate it as usual. The last cell taken out leaves an empty cell behind, so a panel is never without one.
- **A copy.** Duplicate the panel from the **⋯** menu on its tab or section: the copy has the same cells and gets a free title, such as **Details 2**.
- **Selecting the panel itself.** Select a cell in it and press Esc ([the key](key:parent)). The heading of **Cell details** then reads **Tab: Overview** or **Section: Shipping**. Press Esc again for the tabs or the accordion.

::shot designer-panel "The designer of a panel: its title, whether it shows, its place among the others and the number of cells it holds."

The panel's designer has:

- **Title**, with its place, such as *Tab 2 of 3*. Enter or leaving the field keeps it; Esc puts the old title back. For a tab the hint says *Shown on the tab. Formulas compare the open tab with it.*
- **Showing** for a tab, with **Show this tab**; or **Open** for a section, with **Open this section** or **Close this section**.
- **Place**: move earlier, move later, duplicate, remove. The last panel can't be removed.
- **Cells**: how many cells the panel holds, with **+** to add an empty one.
- A button to go back up to **All tabs** or **All sections**, naming the container when it has a name.

A panel also has **Text**, **Spacing and size** (padding only: a panel's own size means nothing, since it is shown whole) and **Box**, so you can give a panel a background or a border. Renaming the panel that is open keeps it open.

## In notation

A panel is written in the body of its container, with a `title`, and its cells as its body:

```notation id=panel
["accordion", {"name": "faq", "value": ["Shipping"]},
  ["panel", {"title": "Shipping"}, ["text", "Orders leave in two working days."]],
  ["panel", {"title": "Returns", "name": "returns"}, ["text", "Send it back within 30 days."]]]
```

| Prop | What it is |
| --- | --- |
| `title` | The words on the tab or the section, and the key for what is open. Left out, it is **Tab 2**, **Section 3**: the word and the panel's place. Two panels with the same title: the second is keyed **Title 2**. |
| `name` | Lets other cells read the list of the values of its cells. |
| `style` | The look of the panel, such as `pad` or `bg`. |

A panel written with no cells gets an empty one. Panels belong in tabs or an accordion, and those accept nothing else in their body. A `size` on a panel is dropped, because a panel is shown whole.

## Its value

The list of the values of the cells in it, in order. Only a panel with a name can be read by other cells. What is open or showing is the value of the tabs or accordion around it.

## Events

::ref events-of panel

A panel raises none. Opening and closing belong to the container: see [tabs](kind:tabs) and [accordion](kind:accordion).

## Actions that change it

None changes a panel's content. To show a tab or open a section use [set!](fn:set!) on the container. [dup!](fn:dup!) and [remove!](fn:remove!) also work on a named panel: `(dup! items)` adds a copy as a new tab, and `(remove! items)` takes the tab away, unless it is the last one.

## On a phone and on paper

A panel has no look of its own on a phone: its cells stack in the width of the tabs or the accordion. On paper every panel prints, in order, under its title. The title stays with the first cell under it on the same printed page.

## Usual mistakes

- **I can't find "Panel" in the / menu.** It isn't there. Choose **Tabs** or **Accordion**, which come with two panels, and use **Add a tab** or **Add a section**.
- **A panel can't be removed.** The last one of a container stays: the designer's bin is greyed out, and its tooltip says *The last tab can't go; delete the whole tabs instead.*
- **Splitting a panel added another tab, not a cell.** That is what splitting does to a panel. To add a cell, select a cell inside the panel and split that.
- **"…can't be merged; move them into one first".** Cells in different panels can't be merged. Move the cells into the same panel.
- **Two tabs show the same title, and a button opens only the first.** The panels were written by hand in notation with the same title. The second is keyed with a number (**Details 2**), though it still shows **Details**. Rename one.
