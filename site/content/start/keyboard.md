---
title: The keyboard
---

This page lists every keyboard shortcut in edgy, grouped by where it works, and says when you'd use each one.

On a Mac, ⌘ is the Command key and ⌥ is Option. On Windows and Linux, read ⌘ as Ctrl and ⌥ as Alt. ⇧ is Shift. A few keys, such as Ctrl+Space in a code field, are Ctrl on every system.

Keys only work where they are listed. Most of the editor's keys need Edit, with a cell selected and nothing being typed. Inside a field the keys belong to the field, and nothing reaches the cells behind it. A list, a table or a calendar keeps the keys it uses and passes only Esc and ⌘Z to the editor.

## All the keys

::ref shortcuts

## In Edit, with a cell selected

::: key move
Moves the selection from cell to cell without the mouse. It goes to the nearest cell in that direction on the screen, so it crosses from one group into another. Hold Shift to add that cell to the selection instead of moving to it; Shift with an arrow onto a cell that is already selected takes it out again. When nothing is selected, ↓, → or Tab selects the first cell.
:::

::: key split
Splits the selected cell and puts a new empty cell on the side the arrow points to: ⌥→ to the right, ⌥← to the left, ⌥↓ below, ⌥↑ above. The new cell is selected, ready for text or `/`. It is the keyboard way of pressing the **+** on an edge. See [Working with cells](/editor/cells/#splitting).
:::

::: key next-cell
Moves through the cells in reading order: left to right, top to bottom. It wraps round at the ends, and it skips cells you can't see, such as those behind a tab that isn't showing. Use it to walk a form from field to field.
:::

::: key edit
Starts typing in the selected cell, if it is a text, empty or formula cell, or edits a button's label. On a group, Enter selects the first cell inside it, which is how you go down into a row from the keyboard. On any other kind it does nothing: use the cell's own controls or [Cell details](/editor/panel/).
:::

::: key type
In an empty cell, typing any character that prints, a letter, a digit or a symbol, starts a text cell with that character as its first. Start with `=` to make a formula instead. You never need to ask for text first. `/` is the exception: it opens the menu.
:::

::: key parent
Goes up one level. If the `/` menu is open, Esc closes it. Otherwise it selects the group around the selected cell, and again the group around that, and at the top it selects nothing. Select a row this way when you want to merge it, remove it or resize it as a whole.
:::

::: key kind-menu
Opens the menu of what a cell can hold. Type to search, ↑ and ↓ to move, Enter to choose, Esc to close. On a group, `/` opens the menu for the first cell inside. See [The / menu](/editor/slash-menu/).
:::

::: key clear
On a cell with something in it, empties the cell but keeps its place and size. On an empty cell, removes it and gives its room to a neighbour. On a selected group, removes the whole group. ⌘Z brings it back. See [Clearing and removing](/editor/cells/#clearing-and-removing).
:::

::: key duplicate
Copies the selected cell and everything in it, and puts the copy right after it. A cell with a name gets a free one with a number on the end (`qty` becomes `qty2`). With several cells selected, it copies the one you selected last.
:::

::: key merge
Merges the selected cells into one: neighbours, a rectangle of a grid, or a whole row or column that you selected. When the selection can't be merged, a note says why. See [Merging](/editor/cells/#merging).
:::

::: key undo
Takes back your last change. It works in Edit, Live and Page, as long as the cursor isn't in a text field (there it undoes your typing in the field). In Live one press takes back a click and everything its handlers did. See [Undo and redo](/editor/undo/).
:::

::: key redo
Puts back what you undid. A new change after an undo clears what could have been redone. On Windows and Linux it is Ctrl+Shift+Z; Ctrl+Y is not a shortcut in edgy.
:::

::: key print
Opens the Page view and then the browser's print dialog, from any view and even while you are typing. It replaces the browser's own ⌘P. See [The Page view](/editor/page-view/#opening-it-and-printing).
:::

::: key studio
Opens the [code studio](/editor/code-studio/) on the selected cell's code: a formula's expression, a button's action, a table's rows. A cell with no code of its own that reacts to events, a timer for instance, opens on its events. On a cell with neither, for example an empty one, edgy says there is no code yet. The shortcut does nothing while the studio is open or while you are typing in a field.
:::

## While typing in a cell

These apply to the text box that opens in a text cell or an empty cell.

::: key cell-done
Finishes typing and leaves the cell selected. What you typed in a text cell has been saved as you went; in an empty cell, finishing makes it a text cell. Use it to stop typing without moving on.
:::

::: key cell-next
Finishes typing and selects the next cell, or the previous one with Shift. Use it to fill in a column of text cells one after another.
:::

::: key cell-formula
In an empty cell whose text starts with `=`, Enter finishes and turns the cell into a formula: type `=(* qty price)` and press Enter. Everywhere else in a cell Enter starts a new line, and Shift+Enter always does. If what follows the `=` isn't an expression edgy can read, the cell stays text.
:::

## In a code field

A code field is any box that holds code: the formula bar, a formula's box in [Cell details](/editor/panel/), a cell opened for editing, the code editor in the [code studio](/editor/code-studio/). Where a field takes a single line, such as the formula bar, Enter also applies the code; Shift+Enter starts a new line.

::: key complete
Shows the suggestions for the word at the cursor even when you haven't typed enough for them to appear on their own. It is Ctrl, not ⌘, on a Mac.
:::

::: key complete-move
Moves through the suggestions. ↑ and ↓ go one at a time and wrap round at the ends; Page Up and Page Down jump six.
:::

::: key complete-accept
Takes the highlighted suggestion and puts it in the code. A function arrives with its brackets, and the cursor is left where its first argument goes.
:::

::: key complete-close
Closes the suggestions and leaves what you typed. A second Esc then leaves the field and drops the change (or, in the code studio, closes the studio after asking).
:::

::: key code-apply
Applies the code. In the code studio it also closes the studio. In the formula bar and in Cell details plain Enter applies as well, and Shift+Enter starts a new line; in the studio Enter starts a new line, so ⌘Enter is how you apply.
:::

::: key indent
Indents the selected lines by two spaces, or with Shift takes the indent off. With nothing selected, Tab puts in two spaces and Shift+Tab takes them off the current line. Tab doesn't leave the field.
:::

::: key pairs
Typing `(`, `{` or `"` types its partner too and puts the cursor between them. Typing the partner steps over it instead of doubling it. Backspace between an empty pair removes both. With text selected, typing a bracket wraps the selection in a pair.
:::

::: key expand
Opens the code you are typing in the [code studio](/editor/code-studio/), draft and all. It works in the fields that can open it, those with the expand button.
:::

## In the code studio

::: key studio-apply
Writes everything you changed, in every piece of code in the studio, as one change and closes it. If a piece can't be read, the studio stays open and says which.
:::

::: key studio-close
Closes the studio. If you have changes it first asks *Discard your changes?*, and a second Esc then closes it and discards them; **Keep editing** stays. If suggestions are showing, the first Esc closes those.
:::

## In a diagram you are editing

The diagram keys work after you press inside a diagram that is selected: the first press selects the cell, and the next one gives the diagram the keyboard. Undo and Tab pass through to the editor, and so does Esc once there is nothing left to let go of. See [diagram](kind:diagram).

::: key diagram-select
Switches to the tool that picks and moves elements, the one you start in and return to.
:::

::: key diagram-rect
Switches to the rectangle tool: press and drag on the diagram to draw one.
:::

::: key diagram-ellipse
Switches to the ellipse tool.
:::

::: key diagram-diamond
Switches to the diamond tool, for decisions in a flow.
:::

::: key diagram-arrow
Switches to the arrow tool: drag from one shape to another and the arrow stays joined to both.
:::

::: key diagram-line
Switches to the line tool.
:::

::: key diagram-text
`T` switches to the text tool: click where the words should go and type.
:::

::: key diagram-label
With one element picked, Enter lets you write or change its text. Enter again, Esc or Tab finishes it, and Shift+Enter starts a new line.
:::

::: key diagram-nudge
Moves the picked elements one unit with an arrow, or ten with Shift, for fine placement. A run of nudges is one step for undo. With nothing picked, the arrows move between cells as usual.
:::

::: key diagram-delete
Deletes the picked elements, and any arrow that was joined to a deleted shape.
:::

::: key diagram-duplicate
Duplicates the picked elements. It is the diagram's own ⌘D: the cell is not duplicated.
:::

::: key diagram-all
Picks every element at once, to move them together or to delete them all.
:::

::: key diagram-escape
Steps back out, one level a press: it closes the open colours, then returns to the select tool, then lets go of what is picked. When there is nothing left to let go of, the next Esc selects the group around the diagram, as it does for any cell.
:::

## In a list

These work while you edit an item of a [list](kind:list) that holds its own items. A list worked out by a formula has no items to edit.

::: key list-next
Keeps what you typed and opens a new item below, so you can enter a whole list without leaving the keyboard. On an empty new item it ends the editing, and an existing item that you emptied is removed.
:::

::: key list-cancel
Stops editing and drops the change; the item keeps its old words. If you were adding a new item, it isn't added.
:::

::: key list-remove
Backspace in an item with nothing in it removes the item and moves to the end of the one before. Use it to undo an Enter that opened one item too many.
:::

::: key list-reorder
Moves an item up or down. Press Tab until the item's grip handle has focus, then use ↑ and ↓. The item keeps the focus, so you can keep moving it.
:::

## In a calendar

These work once a day in a [calendar](kind:calendar) has the focus; press a day, or Tab into the grid.

::: key calendar-day
Moves the focus a day left or right, or a week up or down, crossing into the next or the previous month at the edges.
:::

::: key calendar-month
Moves a month back or forward.
:::

::: key calendar-week
Goes to the first or the last day of the week the focus is in. The week starts on Monday unless the calendar is set to start on Sunday.
:::

## In tabs

::: key tabs-move
With a tab focused, moves to the tab before or after it, wrapping round at the ends, or to the first or the last, and shows that tab. See [tabs](kind:tabs).
:::

::: key tabs-rename
While you rename a tab or a section (**Rename** in its **⋯** menu), Enter keeps the new title and Esc drops it. A title another tab already has is refused.
:::

## In a table

::: key table-search
In a [table](kind:table)'s search box, Esc empties the search and shows every row again. With nothing in the box, Esc is left for the editor.
:::

::: key table-edit
While you change a value in a table of typed rows in Edit: Enter keeps it and moves down to the same column of the next row, Tab keeps it and moves to the next cell (Shift+Tab to the one before), and Esc drops the change. Together they let you fill a table in without the mouse.
:::

## Playing a deck

These are for [Play](/library/decks/), a deck shown as slides. They don't work while you type in a field inside a slide, and a control that uses a key itself (Space on a button, ← and → on tabs) keeps it.

::: key play-next
Goes to the next slide. Page Down first scrolls a slide that is taller than the screen, and goes on only when it is at the bottom.
:::

::: key play-previous
Goes back one slide. Page Up first scrolls a tall slide back up.
:::

::: key play-scroll
Scrolls a slide that is taller than the screen: ↓ and ↑ a little at a time, Space and Shift+Space most of a screen. When the slide is at its bottom, Space goes to the next slide, so one key plays through a deck.
:::

::: key play-ends
Jumps to the first or the last slide.
:::

::: key play-full
Switches full screen on or off.
:::

::: key play-leave
Leaves the deck and goes back. In full screen the browser keeps Esc to leave full screen, and that leaves the deck too.
:::

## In the library

::: key library-search
In the library's search box, Esc empties the search and shows every document again. Anywhere else in the library, Esc clears the cards you selected.
:::

::: key library-describe
On a card, **Edit description** (or **Add a description**) opens a box for the words under the title: Enter keeps them, Shift+Enter starts a new line and Esc drops the change. Clicking away keeps them too. A document's title is renamed in the editor, in the header.
:::
