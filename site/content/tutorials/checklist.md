---
title: A checklist that reacts
nav: Checklist
---

You build a checklist that shows a message and saves a record the moment every box is ticked, and learn what an event, a handler and an action are. It takes about twenty minutes. Read [A quote that adds itself up](/tutorials/quote/) first for the keys used to split cells and choose what they hold.

You will use the [list](kind:list) and [text](kind:text) cells, a [change](event:change) handler on the list, and three functions: [every](fn:every), [show!](fn:show!) and [insert!](fn:insert!).

## Start the document

1. On the home page, press **New document**. In the title at the top, type `Workshop checklist` and press Enter.
2. Click the empty cell and type `# Workshop checklist`. Press Esc.
3. Press [⌥↓](key:split) (Alt+↓ elsewhere) to add a cell below. Press `/`, type `Checklist` and press Enter. The cell shows three sample items and a bar saying *1 of 3 done*.

## Your own items

4. In **Cell details**, set **Name** to `steps` and **Title** to `Before the workshop starts`. Press Enter after each.
5. Click the text of the first item, select it all (⌘A, or Ctrl+A) and type `Book the room`. Press Tab to keep it. Do the same for the second item (`Print the handouts`) and the third (`Test the projector`).
6. Click the box of the first item to untick it. Nothing should be ticked.
7. Press **Add an item**, type `Send the reminder` and press Enter. Press Esc to drop the empty item the Enter opened.

Inside a list, Enter keeps an item and starts the next, Esc drops what you are typing, and the grip at the right of an item moves it.

## Two cells for the result

8. Click the title of the list (*Before the workshop starts*) to select the list, then press ⌥↓. Type `All done: the room is ready.` and press Esc.
9. In **Cell details**, set **Name** to `ready`. Open **Show only when** and choose **Never**. The message stays on the sheet in Edit, dimmed; in Live it is gone.
10. Click the message on the sheet, so the keys go back to the sheet, and press ⌥↓. Type the sentence below and press Esc.

```text
Checklists finished so far: {{(len (rows "checklists"))}}.
```

`(rows "checklists")` is the list of records saved in a collection called `checklists`. There are none yet, so the sentence says 0. You are about to make one.

## The handler

An [event](term:event) is something that happens to a cell. A list raises [change](event:change) whenever its items change: a box ticked, an item added or edited. A [handler](term:handler) is an [action](term:action) attached to an event; it runs each time the event happens, in Live.

11. Click the title of the list again. In **Cell details**, open **Events** (click its heading) and press **Add a handler**. The code studio opens on the events of `steps`.
12. Under **When**, click **change**. Under **What should happen**, click **Start from nothing**.
13. Click the **Code** tab, click in the editor and type the handler below on one line. The editor closes each bracket for you, and typing the closing one steps over it.

```sx
(if (every (get it "done") value) (do (show! ready) (insert! "checklists" {items (len value) day (today)})) (hide! ready))
```

14. Press **Apply**. The studio closes and the **Events** section of **Cell details** lists the handler: *When it changes*, with the code beside it.

Read the handler from the inside out. `value` is the list's items after the change: each one a record such as `{text "Book the room" done false}`. `(get it "done")` asks one item whether it is done, and [every](fn:every) asks it of all of them. When they all are, `(show! ready)` shows the message and `(insert! "checklists" {...})` saves a record with the number of items and today's date. When they are not, `(hide! ready)` hides the message again.

> [!NOTE]
> `show!` and `hide!` are changes to the document like any other: the message stays shown after you close the document, and Undo reverses them. When a message should only follow a value, skip the handler and give the cell a **Hide it when** condition, as the [wizard](/tutorials/wizard/) does.

## Use it

15. Switch to **Live**. Tick the four boxes. When the last one is ticked the message appears and the sentence below it says *Checklists finished so far: 1*. Untick one: the message goes. Tick it again: a second record is saved.
16. Open the home page and choose **Data** in its header. The `checklists` collection holds one record per time the list was completed. See [the Data page](/data/data-page/).

## The finished document

::shot tutorial-checklist "The finished checklist in Live, with every box ticked and the message showing."

Here it is, running. Records saved in this page stay in memory.

```live id=checklist template=tutorial-checklist height=360
```

You can open it as a template: the [Workshop checklist](template:tutorial-checklist) entry on [Templates](/library/templates/) has an **Open in edgy** button.

Setting the list's items the way a click on the last box does runs the handler:

```sx in=checklist
(len (rows "checklists"))
⇒ 0
(set! steps (list {text "Book the room" done true} {text "Test the projector" done true}))
(len (rows "checklists"))
⇒ 1
```

## What you learned

- A cell raises [events](/events/reference/): a list raises `change` with the new items in `value`. A handler is an action in the cell's `on`, and it runs in Live.
- Add one in **Cell details** > **Events** > **Add a handler**: choose when, choose a preset or **Start from nothing**, write the action, **Apply**. See [Events and actions](/events/) and [the code studio](/editor/code-studio/).
- [every](fn:every) tests all the items of a list; `it` is the item being tested. See [Lists](/language/functions/lists/).
- [show!](fn:show!), [hide!](fn:hide!) and [insert!](fn:insert!) are actions: they change something, so they work only in a handler or a button. See [Actions](/language/functions/actions/).
- Records saved with `insert!` outlive the document and are read back with [rows](fn:rows). See [Collections](/data/collections/).

Next, make a form that goes through steps: [Wizard](/tutorials/wizard/).
