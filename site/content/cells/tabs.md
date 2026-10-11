---
title: Tabs
---

Tabs put cells in panels behind a bar of titles and show one panel at a time.

::ref kind tabs

## When to use it

Use tabs when a document has parts that people look at one after another and not together: an overview and its details, a quote and its terms, the steps of a form. If people should be able to open several parts at once, or the parts are a list of questions and answers, use an [accordion](kind:accordion). If it is a single part that can be put away, use a [collapsible](kind:collapsible).

The title of the open tab is the tabs' [value](term:value), so a formula can react to the tab that is showing, and a button can open a tab.

## Try it

Choose a tab. The text under the tabs reads the tabs' value, and the button opens **Details** from outside. Change the quantity in **Details**, open another tab and come back: the quantity is as you left it.

```live id=view title="Tabs" height=250
["col", {"style": {"gap": 8}},
  ["tabs", {"name": "view"},
    ["panel", {"title": "Overview"}, ["text", "Quote for **Ada Lovelace**. Open **Details** for the lines."]],
    ["panel", {"title": "Details"},
      ["row",
        ["input", {"name": "qty", "type": "number", "label": "Quantity", "value": 2}],
        ["input", {"name": "price", "type": "number", "label": "Unit price", "value": 40}],
        ["formula", {"name": "total", "format": "currency"}, ["*", "$qty", "$price"]]]],
    ["panel", {"title": "Notes"}, ["input", {"type": "textarea", "label": "Notes", "value": "Deliver on Friday."}]]],
  ["row", {"size": "hug", "style": {"gap": 8}},
    ["text", {"style": {"valign": "center"}}, "Showing **{{view}}**."],
    ["button", {"size": "hug", "variant": "soft", "do": ["set!", "view", "Details"]}, "Open Details"]]]
```

The tabs are named `view`. Its value is the title of the tab that is open:

```sx in=view
view
⇒ "Overview"
(set! view "Details")
view
⇒ "Details"
(= view "Details")
⇒ true
```

A title is matched ignoring case, and a title that no tab has opens the first tab, without an error:

```sx in=view
(set! view "details")
view
⇒ "Details"
(set! view "Detials")
view
⇒ "Overview"
```

Cells in a tab that isn't showing still work: `total` follows the quantity and the price even when **Details** is closed. Only the open tab is drawn.

## Adding and designing one

1. Select a cell in **Edit** and press `/`, then choose **Tabs**. The cell moves into the first tab, **Tab 1**, and a second tab, **Tab 2**, is added beside it. An empty cell becomes two empty tabs.
2. Click the **+** at the end of the tab bar to add a tab. Double-click a tab to rename it: Enter keeps the new title and Esc drops it ([the key](key:tabs-rename)).
3. The open tab has a **⋯** menu with **Rename**, **Move left**, **Move right**, **Duplicate** and **Remove tab**.
4. Click in a tab to work on the cells in it. Splitting, merging and moving work as they do in a [column](kind:col), and the last cell removed from a tab leaves an empty cell behind.

Press Esc to go up: from a cell in a tab to the tab, **Tab: Details**, and once more to the tabs themselves ([the key](key:parent)).

::shot designer-tabs "The designer of tabs: the list of tabs, which one shows, and how formulas read it."

With the tabs selected, **Cell details** lists them:

- The round button beside each title chooses the tab that shows. Edit the title in place.
- The arrows move a tab earlier or later, the copy button duplicates the tab with its cells, and the bin removes it. The last tab can't be removed: delete the whole tabs instead.
- **Add a tab** adds one after the last.
- Below the list, the designer shows how formulas read the tabs, for example `(= view "Details")`, and the action that changes them. When the tabs have no name it offers **Name it** `view`.
- **Go to the open tab** selects that tab.

Select a tab itself (press Esc once in a cell of it; the heading then reads **Tab: Details**) to see its own designer. It has the title, whether it is showing (**Show this tab**), its place among the others, and **All tabs** to go back. See [panel](kind:panel).

Titles must be different from each other, ignoring case. A tab with no title is called **Tab 2**, or whichever number it has. A title can carry a text template, such as `Orders ({{count}})`: the tab shows the worked-out text, and the value stays the title as written.

## In notation

The body is the panels, and only panels. A tab is a [panel](kind:panel) with a `title`:

```notation id=tabs
["tabs", {"name": "view", "value": "Details"},
  ["panel", {"title": "Overview"},
    ["text", "Quote for **Ada Lovelace**."]],
  ["panel", {"title": "Details"},
    ["row",
      ["input", {"name": "qty", "type": "number", "label": "Quantity", "value": 2}],
      ["formula", {"name": "total", "format": "currency"}, ["*", "$qty", 40]]]]]
```

| Prop | What it is |
| --- | --- |
| `name` | Lets other cells read and change which tab is open. |
| `value` | The title of the open tab. Left out, the first tab is open. |
| `size` | The tabs' own room inside their row or column: a weight, `"hug"` or `"120px"`. |
| `hidden` | `true`, or an expression: the tabs are out of sight while it holds. |
| `style` | The look of the whole cell. See [Style keys](/styling/style-keys/). |
| `on` | Handlers, such as `change`. |

Written with no panels, `["tabs"]` has two, **Tab 1** and **Tab 2**. A body that isn't a panel is refused, with the message *tabs hold panels, each with a title*.

## Its value

The title of the open tab, as text. Reading it always gives the title of a tab that exists: the stored value is matched to the titles ignoring case, and when it matches none, the first tab is the open one. `(= view "Details")` tells whether **Details** is open. A tab is never read by its number.

Choosing a tab, in **Edit** or in **Live**, saves it as the tabs' value, the way ticking a list item does. It is kept in the document, and it is not a step for undo.

## Events

::ref events-of tabs

[change](event:change) runs whenever the value changes: when a person chooses a tab, and when a button or a handler does. `value` is the title of the tab now open and `was` the one before. See [Events and actions](/events/).

## Actions that change it

[set!](fn:set!) opens a tab by its title. A button does it, or a handler of another cell:

```sx
(set! view "Details")
```

For example, a wizard's **Next** button can open the next step. Nothing else changes the tabs.

## On a phone and on paper

On a phone the tabs take the full width. When the titles don't fit, the tab bar scrolls sideways, not the document, and the open tab is kept in view. Each tab is at least 42 pixels tall to tap. The arrow keys, Home and End move between tabs ([the key](key:tabs-move)).

On paper there is no tab bar: every panel prints, in order, each under its title. A printed page doesn't end between a title and the first cell under it. See [The Page view](/editor/page-view/).

## Usual mistakes

- **That button failed: `no cell called "view"`.** A button or a formula reads the tabs by name, and the tabs have none, or another name. Select them and type a name in **Name**, or press **Name it** in the designer.
- **The wrong tab opens, or the first one does.** The title in `(set! view "Details")` has to be a title the tabs have; a title with a typo opens the first tab and gives no error. Check the titles in **Cell details**.
- **The tab won't take its new title.** Titles must differ from each other, ignoring case. The designer says *There is already a tab called “Details”.*, or *A tab needs a title.* if you leave it empty. On the tab itself, a toast says *Another tab is already called “Details”.*
- **I can't remove the last tab.** The tabs keep at least one: the greyed-out bin's tooltip says *The last tab can't go; delete the whole tabs instead.* Select the tabs and press Backspace.
- **"cells in different tabs can't be merged; move them into one first".** Merging works inside one tab. Move the cells into the same tab first.
- **A formula compares the tabs with a number.** The value is a title: write `(= view "Details")`, not `(= view 2)`.
