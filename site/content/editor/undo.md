---
title: Undo and redo
---

Undo takes back your last change to the document and redo puts it back; this page says what counts as one change, how undo behaves when other people are editing too, and what it can't take back.

Press ⌘Z to undo and ⇧⌘Z to redo (Ctrl+Z and Ctrl+Shift+Z elsewhere), or use the **Undo** and **Redo** buttons in the header. A button is greyed out when there is nothing to undo or redo. See [undo](key:undo) and [redo](key:redo).

Undo works in **Edit**, in **Live** and in **Page**. It does not work while the cursor is in a text field: there ⌘Z undoes your typing in that field, the way it does anywhere in the browser. Click outside the field first to undo the change as a whole.

## What one step is

One step is one gesture, with everything it set off:

- A split, a merge, a duplicate, a remove, a swap, a change of kind from the [/ menu](/editor/slash-menu/): each is one step.
- A change of a setting in [Cell details](/editor/panel/) is one step, even when it changes several properties, such as a text style that sets a size, a weight and a line height.
- **Apply** in the [code studio](/editor/code-studio/) is one step for everything you changed there, and so is **Apply it** or **Apply all** in [Ask AI](/editor/ask-ai/).
- In **Live**, pressing a button is one step, and so is changing an input. The step holds the change itself, the cell's [handlers](term:handler), and the handlers that those changes set off in turn. One ⌘Z puts back everything the click did to the document. See [Loops and undo](/events/loops-and-undo/).
- Typing, dragging a slider, resizing a cell by its edge and nudging a shape with the arrow keys are many changes, but changes to the same thing made less than about a second and a half apart join into one step. Stop for a moment and the next change is a new step.

Some changes are made but are not a step of their own: opening a tab or a section, and what a document's [open](event:open) handler does when it opens. A handler that follows a tab change still joins the step it belongs to.

## What undo does

Undo does not rewind the document. It makes a new change that puts things back, in the same way as any other change: it is sent to the server, listed in [Activity](/editor/activity/) under your name, and seen at once by everyone else. It does not set off [handlers](term:handler), because the change it undoes already includes what they did.

Redo works the same way, one step at a time, in the order you undid them. Any new change clears the redo list.

Your history holds the last 200 steps. It lives in the open tab, so it is gone when you reload the page or close the tab. It is also cleared when the whole document is replaced under you, for example when it is restored to an earlier version.

## When other people edit too

Your undo history has only your own changes. Someone else's change never enters it, and their ⌘Z never reaches yours.

How well a step undoes while others work in the same document depends on what the step was:

- **A property.** Typing in a cell, setting an input's value, a style, a name, a handler: undo puts that one property back to what it was before your change. If somebody changed the same property after you, undo overwrites their change with the older value. Other properties and other cells are not touched.
- **Changing what a cell holds.** Undo puts back that cell as it was, whole.
- **A change of layout.** A split, merge, remove, duplicate or move can't be reversed by an exact opposite, because the cells around have moved. Undo restores the group around the cells, as it was at the moment before your change. If someone else changed a cell inside that group since, undo puts that cell back to how it was before their change too.

If an undo can't be made at all, because the cell it needs has been removed in the meantime, a note says why and nothing changes. That step is dropped from your history: it is not kept for redo.

> [!WARNING]
> Undoing a split, merge or remove in a part of the document where somebody else is working can undo their changes too. When several people are editing the same group of cells, undo your layout changes before they start, or tell them.

## What can't be undone

Undo puts back the document. It has no hold on anything outside it:

- **Records saved to a collection.** A button that saves with [insert!](fn:insert!), or changes records with [update!](fn:update!), [delete!](fn:delete!) or [clear!](fn:clear!), does it once. Undoing the button press puts back what it changed in the document, but the record stays in the collection. Remove it on the [Data page](/data/data-page/). See [Collections](/data/collections/).
- **Pictures** you uploaded. The cell goes back, the file stays on the server.
- **Fetches and timers.** Whatever a [fetch](kind:fetch) already brought and a [timer](kind:timer) already did stays done. Both run on the server and their changes are no one's step to undo.
- **Messages** you sent in Activity, **sharing** (links, people), archiving and deleting a document.
- **Other people's changes**, as above.

A good habit before pressing a button that saves a record: give it **Ask first**. See [button](kind:button).
