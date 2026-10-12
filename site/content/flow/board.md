---
title: The board
nav: Board
---

The board shows your tasks as cards in columns, the way a kanban board does, so you can see what is open, pick what to do next and move cards along as work moves.

## Columns and cards

A new Flow has three columns, **Inbox**, **Doing** and **Done**. A task starts in the first column. The last column always means done: moving a card into it marks the task done (and the timeline shows it finished), moving it out marks it not done, and ticking a task anywhere puts it in the last column.

A card shows the task's text, its tags, when it is due (overdue in red), a mark for high (`!`) or urgent (`!!`), how many comments and reactions it has, and the clock when it runs. Click a card to open it in the editor.

Under each column, **Add a card** takes a line in [quick-add](/flow/#quick-add) syntax and makes a task in that column.

## Moving cards

Drag a card with the mouse or a finger to another column, or up and down inside one, and drop it where it should go. From the keyboard, focus a card (Tab) and press Shift+← or Shift+→ to move it one column over, or open its **⋯** menu and choose **Move to …**. The order within a column is kept.

## Changing the board

The **⋯** menu on a column header renames the column, adds a column after it, moves it left or right, or removes it. Removing a column sends its cards back to the first column; the last column, whatever its name, keeps meaning done. The board has two to eight columns.

Notes and events are not on the board. Make one a task (its **⋯** menu, **Make it a task**) and it appears in the first column.

## Under the hood

A card's column is the item's `status` field, with one rule on top: an item with `done` true is shown in the last column whatever its status says, so a document that sets `done` with `(update! "flow" id {done true})` agrees with the board. The columns are one record in `flow-board`. See [Flow in documents](/flow/in-documents/).
