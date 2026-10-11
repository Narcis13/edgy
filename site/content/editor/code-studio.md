---
title: The code studio
nav: Code studio
---

The code studio is a roomy place to write the code of one cell, opened over the editor with ⌘E, where you can type it, build it from **Blocks**, or ask for it in words with **Ask AI**, and see what it gives before you keep it.

::shot code-studio "The code studio on a formula: the code in a large editor, the result in the foot, and Ask AI, Functions and Cells at the side."

## Opening it

- Select a cell that holds code and press ⌘E ([studio](key:studio)). Which code opens first depends on the kind: a formula's expression, a button's action, a table's rows.
- Press the expand button next to any code field: in the [formula bar](/editor/formula-bar/), in [Cell details](/editor/panel/), or inside a code field itself (⌘E, [expand](key:expand)). Whatever you had typed in the field comes with you.
- Press the sparkle button in the formula bar to open it on **Ask AI**.
- Press **Add a handler** or a handler line under **Events** in Cell details to open it on that cell's [events](/events/).

A cell with no code of its own, such as an empty cell, gets a message instead (*This cell holds no code yet. Press / to make it a formula.*). A cell that holds no code but reacts to events, such as a timer, opens on its events.

## Which code you are editing

The header names the cell and its kind. When a cell has several pieces of code, buttons in the header switch between them, and each keeps what you typed in it while you switch:

| Piece | On |
| --- | --- |
| **Formula**, **Data**, **Rows**, **Items**, **Events** | A formula; a chart; a table; a computed list; a calendar |
| **Value**, **Compare with**, **Trend** | A [stat](kind:stat) |
| **Action** | A [button](kind:button) |
| **Options** | A [select input](kind:input) |
| **Hidden when** | Almost every cell: the condition that hides it while it is true |
| The **Events** button | Any cell that raises [events](/events/): it opens that cell's handlers |

## Code

The **Code** tab is a text editor for the language.

```sx
(round (* qty price) 2)
```

It does the small things a code editor should:

- **Colours.** Functions, special forms such as `if` and `map`, actions such as `set!`, cell names, local names such as `it`, text, numbers, `true`, `false` and `nil`, and `;` comments each have their own colour. A function name edgy doesn't know is underlined with red dots.
- **Brackets.** Each level of brackets has its own colour, in a cycle of four. Put the cursor beside a bracket and it and its partner light up. A closing bracket with nothing to close is red. Typing `(`, `{` or `"` types the closing one as well ([pairs](key:pairs)); typing the closing one steps over it, and Backspace between an empty pair removes both.
- **Suggestions.** As you type a name, a list offers the functions, the cells, the collections (inside `(rows "…")`) and the local names that fit. ↑ and ↓ move through it ([complete-move](key:complete-move)), Enter or Tab take the highlighted one ([complete-accept](key:complete-accept)), and Esc closes it ([complete-close](key:complete-close)). Ctrl+Space asks for the list on demand ([complete](key:complete)). For a function, the list also explains the highlighted entry.
- **The signature line.** Inside a call, a line shows the function written out, `(round x 2)`, with the argument you are on in bold, and a sentence on what the function does. In the studio it sits in a bar under the code; in a small field it floats above it.
- **Errors.** Code that can't be read gets a wavy underline where it goes wrong, after you pause for a moment, so half-typed code isn't scolded. The foot of the studio says *Not finished:* and why.
- **Hover cards.** Rest the mouse on a function, a cell name or a local name for a moment. A function's card shows its group, how it is written and what it does. A cell's card shows its kind and its value right now. A local name's card says what it is: `it` is the item being looked at, `i` its position, `acc` the total so far.
- **Indenting.** Tab indents the selected lines and Shift+Tab takes the indent back ([indent](key:indent)). In the studio, Enter starts a new line with the indent of the one above; between a pair of brackets it opens them onto their own lines.

**Format** lays the code out neatly. It leaves code with `;` comments alone, because formatting would drop them, and says so.

## Blocks

**Blocks** shows the same code as pieces you click, for when you'd rather not type brackets.

::shot blocks "The Blocks tab: the same expression as nested pieces. Each function is a coloured pill with its parts, and cells are chips that show their values."

- A function call is a coloured pill with its parts beside it, labelled so it reads like a sentence (an `if` has *then* and *else*). The colour is the function's group, the same colour the **Functions** list uses.
- A cell is a chip with its icon and its value right now. A name that no cell has is marked with a question mark.
- Click a piece to change it. Click a function's name to choose another function; click a cell chip to choose another cell; click a number or text to type over it; click a *yes or no* to switch it.
- An empty slot asks *Fill in…* and offers a cell, a number, some text, a function, or yes or no.
- **+** adds a part to a call. The parentheses button wraps a piece in a function: wrap `price` in `round` to get a `round` call with `price` in its first slot. The cross removes a piece.
- With nothing yet, Blocks starts with four choices: a cell, a number, some text or a function.

Blocks and **Code** edit one draft. Everything you build is written in the **Code** tab, and every change in Blocks is code that can be read. If the code can't be read, Blocks says so and offers **Fix it in Code**.

## The side

The side of the studio has three tabs.

**Ask AI** writes the code from a sentence. See [Ask AI](/editor/ask-ai/).

**Functions** lists every function by group, with a search box that looks at the name, the description and the group. Press a function's name to put it into the code at the cursor, as a call with its parts to fill in, or as a block in **Blocks**. Each entry has a **Docs** link to its entry in these docs, for example [sum-by](fn:sum-by), which opens in a new tab.

**Cells** lists the cells that have a name, with their kind and their value right now; press one to put its name in the code. A cell without a name isn't listed: name it in [Cell details](/editor/panel/). When you edit a handler or an action, the list begins with the names the event brings, such as `value` or `row`, under **From the event**; the tab is called **Names** there.

On a phone the studio has one pane at a time and a bar of tabs along the bottom: **Code**, **Blocks**, **Events** where there are some, **Ask**, **Functions** and **Cells**.

## What it gives

The foot of the studio works out the code as it stands, before you keep it.

- For an expression, it shows **Result**: `=` and the value. A list or a record has a button to copy it as JSON. If the code is a function, it says so.
- For an action (a button's, a handler's), it shows **Dry run**: what the code *would* do, as a list such as *Set total to 12* or *Save a record to "orders"*. Nothing happens; it only reads the document.
- For **Hidden when**, it says *Hidden right now* or *Shown right now*.

## Keeping it

**Apply** (⌘Enter, [studio-apply](key:studio-apply)) writes everything you changed, in every piece, as one change and closes the studio. One ⌘Z undoes it. If a piece can't be read, the studio stays open on that piece and says which one.

Esc, **Cancel** and a click outside close the studio without keeping anything ([studio-close](key:studio-close)). When you have changes, it first asks *Discard your changes?* with **Keep editing** and **Discard**. In a code field, Esc closes the suggestions first.

## Events

For a cell that raises events, and for the document, the studio has an **Events** part. A list at the left shows each event with the code on it. **Add a handler** chooses an event and a ready-made starting action (such as set a value, count, toggle, show, hide, save a record, send an event, start or stop a timer, refresh a fetch, call an action) that you can then change in **Code** or **Blocks**. **Try it** runs the handler once with sample data so you can watch what it does; its changes are real, and ⌘Z undoes them. For the document, it also lists the [custom actions](term:custom-action) and has **New action**. See [Events and actions](/events/).

The code is in [Studio.tsx](src:src/web/code/Studio.tsx), [CodeEditor.tsx](src:src/web/code/CodeEditor.tsx), [Blocks.tsx](src:src/web/code/Blocks.tsx) and [Panels.tsx](src:src/web/code/Panels.tsx).
