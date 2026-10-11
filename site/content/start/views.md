---
title: Edit, Live and Page
---

A document has three views, **Edit**, **Live** and **Page**: Edit is for shaping it, Live is for using it the way people will, and Page shows it as the printed pages it would make. This page says what each one does, what it leaves alone, and where you start.

You switch with the three buttons in the editor's header. The switch changes how the same document is shown; nothing in the document changes because you switched. It does deselect the cell you had selected.

| | **Edit** | **Live** | **Page** |
| --- | --- | --- | --- |
| Select, split, merge and design cells | Yes | No | No |
| Type in inputs, tick boxes | Yes | Yes | Yes |
| [Handlers](term:handler) run | No | Yes | No |
| [Timers](kind:timer) tick and [fetches](kind:fetch) load | No | Yes | No |
| Cells whose **Show only when** hides them | Drawn faded | Not drawn | Not drawn |
| [Data](kind:data) cells and [timers](kind:timer) | Drawn | Not drawn | Not drawn |
| Page setup | In **Cell details**, under **Printing** | No (⌘P goes to Page) | In the bar above the pages |

## Edit

Edit is the view you build in. You select cells, split them, merge them, choose what they hold with the `/` menu, name them, and design them in **Cell details**. Everything the [screens page](/start/screens/#a-document-in-the-editor) describes around the document, the toolbar, the **+** on the edges, the formula bar, the lines between cells, is there only in Edit.

::shot editor-edit "Edit: a cell selected, its toolbar above it, Cell details on the right."

Edit shows a document with its workings visible:

- A cell that a **Show only when** condition would hide is drawn faded, so you can still find and select it.
- A [data](kind:data) cell, which holds a value for formulas and never shows in use, appears as a small chip. A [timer](kind:timer) appears too.
- Drag the line between two cells to change how they share the room.

You can still type into an input in Edit, and pressing a button runs its action once, the way the **Run this button** button in the toolbar does. What Edit does not do is run [handlers](term:handler): nothing reacts to the change, and no timer ticks. So you can try a button's own action while you build it, without setting off everything that listens for it.

> [!NOTE]
> Switch to **Live** to see a document react. If a button seems to do half of what you wrote, you are in Edit.

Someone who may only view a document, for example through a view-only share, has no **Edit** button.

## Live

Live is the document in use. There is no selection, no toolbar and no outlines: a person types in the inputs, ticks the boxes, presses the buttons, and the document responds.

::shot editor-live "The same document in Live: inputs, formulas and buttons ready to use, with no editing handles."

In Live:

- **Handlers run.** A cell's `change` or `click` handler, the document's [open](event:open) and [close](event:close) handlers and everything they set off happen. A button's action runs first, then its `click` handler, and together they are one step for undo.
- **Timers tick and fetches load.** The server runs them for as long as anyone has the document open in Live, and the changes they make arrive in every browser that has it open.
- **Hidden cells go.** A cell whose **Show only when** condition says to hide it is not drawn, and the cells around it close up. [Data](kind:data) cells and timers are never drawn.
- What you type is kept. Typing in an input changes the document, so it is saved and appears in **Activity**, and anyone else who has the document open sees it. A reader with only a view link is different: what they type stays in their own tab.

Try it. The quantity has a handler on its `change` event that counts how often it ran. In Edit the count would stay at `0`, however much you type.

```live id=handler title="A handler that runs in Live" height=120
["row", {"size": "hug"},
  ["data", {"name": "changes"}, 0],
  ["input", {"name": "qty", "type": "number", "label": "Quantity", "value": 1,
             "on": {"change": ["set!", "changes", ["+", "$changes", 1]]}}],
  ["text", {"style": {"valign": "center"}}, "The handler has run **{{changes}}** times."]]
```

An action in an example runs the way a click runs it, handlers included:

```sx in=handler
(set! qty 4)
(set! qty 7)
changes
⇒ 2
```

The first time a document is used in Live after it opens, its `open` handler runs once. Leaving it runs `close`. Neither runs in Edit or Page. See [Events and actions](/events/).

## Page

Page shows the document as paper. It lays the document out once at the width of a page and cuts it into pages between cells, never through one. The result is what you get when you print.

::shot editor-page "Page: printed pages with a footer, and the page setup in the bar above them."

The bar above the pages is the page setup:

- The paper: A4, A5, Letter or Legal, with its size in millimetres.
- **Portrait** or **Landscape**.
- **Margins**: **Narrow**, **Normal** or **Wide**.
- The footer: **Page numbers**, **Title and numbers** or **Nothing**.
- How many pages there are, and **Print**.

A new document is A4, portrait, with normal margins and page numbers. The choices are saved in the document, so the next person gets the same pages. They are also in **Cell details** when nothing is selected, under **Printing** (**Paper**, **Turn**, **Margins** and **Footer**), with a **See the pages** button.

A cell too tall for a page is sliced where it must be. To start a new page yourself, add a **Page break** cell where it should start; see [break](kind:break). The pages are always drawn in the light theme, whichever theme the app is in, and on a narrow screen they shrink to fit while the printed sheet stays full size. [Fetch](kind:fetch) cells are left out, as are hidden cells, [data](kind:data) cells and timers.

The pages are not frozen. Inputs and buttons still work, so you can fill a form in and print it. But as in Edit, handlers don't run, so anything that depends on one will not move.

### Printing

**Print** in the page bar, the printer in the header, **Print** in the phone's **More** menu and ⌘P ([key:print](key:print); Ctrl+P elsewhere) all do the same: switch to Page, wait for the pages to be laid out, then open your browser's print dialog. ⌘P works from every view. The dialog is the browser's own, so choose the printer there; the paper size is already set from the page setup.

See [The Page view](/editor/page-view/) for the details, and [Export](/library/export/) for a copy as one HTML file.

## Which view you start in

- **On a computer**, a document opens in **Edit**.
- **On a phone**, in a window narrower than 720 pixels, it opens in **Live**. You can still press **Edit**, but the editor is built for a larger screen.
- **A link can ask for one**: an address ending in `?view=live`, `?view=edit` or `?view=page` opens that view. The editor writes `?view=page` into the address while you are in Page, so a reload or a copied link opens the pages. Switching to Edit or Live takes it out again.
- **Someone who may only view** starts in Live, and has Live and Page only.
- **A share link** opens the document in Live and nothing else. See [Share links](/library/share-links/).

## Which view for what

- Building and fixing: **Edit**. Select the cell, change it, and move on.
- Trying: **Live**. Do what a reader would do, and watch **Activity** for what ran.
- Printing: **Page**. Check where the pages break before you print.

A common rhythm is to build a few cells in Edit, switch to Live to see them work, and come back. Undo ([key:undo](key:undo)) works in every view.

## Usual mistakes

- **A button does something, but not everything.** You are in Edit or Page, where a button's action runs but its handlers and the changes they cause do not. Switch to Live.
- **A timer never ticks.** Timers run only while someone has the document open in Live. Switch to Live and leave it there.
- **A cell is missing in Live, or in Page.** It has a **Show only when** condition that says to hide it at the moment, or it is a [data](kind:data) cell or a timer. Switch to Edit, where it is drawn faded or as a chip, select it and look at **Cell details**.
- **A fetch cell is missing in Page.** Page does not draw fetch cells. Live does.
- **I can't find Edit.** You can only view this document. Ask its owner to make you an editor; see [Sharing with people](/people/sharing/).

Next: [Keyboard](/start/keyboard/).
