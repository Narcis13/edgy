---
title: A flowchart with live numbers
nav: Flowchart
---

You draw a flowchart of how an order moves, join its shapes with arrows that stay attached, and put live numbers inside the shapes' labels. It takes about twenty minutes. Read [A form in steps](/tutorials/wizard/) first if you have not yet named a cell and read it from another.

You will use a [diagram](kind:diagram) cell and its drawing tools, and [text templates](/language/templates/) inside labels.

A diagram draws in Edit and is a picture in Live. Its value is the list of its elements (shapes, text and arrows), so other cells can read it. An [element](term:element) is not a cell.

## The number to show

1. On the home page, press **New document**. Click the title at the top, select all (⌘A, or Ctrl+A), type `Order flowchart` and press Enter.
2. Click the empty cell and press `/`. Type `Number` and press Enter. Set **Name** to `waiting`, **Label** to `Orders waiting` and **Value** to `3`.

## The diagram cell

3. Press [⌥↓](key:split) (Alt+↓ elsewhere), then `/`, type `Diagram` and press Enter. The cell holds a sample of two boxes joined by an arrow. Set **Name** to `flow`.
4. In **Cell details**, press **Clear**. The drawing is empty, and the cell says *Pick a shape above, then drag to draw it*.

When a diagram cell is selected, a toolbar appears over it with the tools: **Select and move**, **Rectangle**, **Ellipse**, **Diamond**, **Arrow**, **Line** and **Text**, then the colours, a label button, duplicate, delete, undo and redo. Each tool has a key, such as [A](key:diagram-arrow) for the arrow.

## Draw the shapes

A click with a shape tool puts down a shape of the usual size, centred where you clicked. After it, the shape is picked and the tool goes back to **Select and move**. Positions below are measured from the top left corner of the drawing area; they only need to leave room between the shapes.

5. Press **Ellipse**, then click 110 pixels across and 50 down. Press Enter, type `Order placed` and press Enter.
6. Press **Diamond**, then click at 360 across and 50 down. Press Enter, type `Paid?` and press Enter.
7. Press **Rectangle**, then click at 610 across and 50 down. Press Enter, type the label below and press Enter.

```text
Pick and pack: {{waiting}} waiting
```

The label shows *Pick and pack: 3 waiting*. The words between double braces are a text template, worked out like the one in a text cell, and they follow the cell named `waiting`.

8. Press **Rectangle**, then click at 360 across and 170 down. Press Enter, type `Send a reminder` and press Enter.
9. Press **Rectangle**, then click at 610 across and 170 down. Press Enter, type the label below and press Enter.

```text
Ship {{(* waiting 24) | currency}} of goods
```

A template can hold a whole expression and a format, as a text cell's can.

## Join them with arrows

An arrow starts on the shape where you press and ends on the shape where you let go. Its ends stay on the shapes: move a shape later and the arrow follows.

10. Press **Arrow**. Drag from inside *Order placed* to inside *Paid?*. The arrow is drawn and picked.
11. Press **Arrow** again and drag from *Paid?* to *Pick and pack*. Press Enter, type `yes` and press Enter. The label sits on the arrow.
12. Press **Arrow** and drag from *Paid?* to *Send a reminder*. Label it `no`.
13. Press **Arrow** and drag from *Pick and pack* to *Ship*.

::clip arrow "Drawing two boxes and an arrow from one to the other."

## Lay it out

14. In **Cell details**, press **Tidy layout**. Every shape is placed again, top to bottom along the arrows. A shape you place by hand keeps its place until you tidy again.

## Use it

15. Switch to **Live**. Change **Orders waiting** to `5`: *Pick and pack: 5 waiting* and the amount in *Ship* change with it. A click on a shape raises a [click](event:click) event whose `element` is that shape as a record, so a handler on the diagram can tell which one was pressed; see [diagram](kind:diagram).

## The finished document

::shot tutorial-flowchart "The finished flowchart in Live, with the number that two of its labels show."

Here it is, running. Change the number above the drawing.

```live id=flowchart template=tutorial-flowchart height=420
```

You can open it as a template: the [Order flowchart](template:tutorial-flowchart) entry on [Templates](/library/templates/) has an **Open in edgy** button. Its shapes have no places written down, so they lay themselves out along the arrows, as they do after **Tidy layout**.

```sx in=flowchart
(count-if (!= (get it "type") "arrow") flow)
⇒ 5
(count-if (= (get it "type") "arrow") flow)
⇒ 4
```

## What you learned

- Select a diagram cell to get its tools. A click puts down a shape; a drag with **Arrow** joins two. Enter writes the label of the picked element. See [diagram](kind:diagram).
- Arrows stay attached to their shapes, and **Tidy layout** places the shapes along them.
- A label can hold `{{templates}}` that show live values. See [Text templates](/language/templates/).
- The diagram's value is a list of elements, so a formula can count them, as above. See [Lists](/language/functions/lists/).
- The shapes' colours are [colour tokens](/styling/theme/): **Line and text colour** and **Fill colour** in the toolbar set them.

Next, play several documents as slides: [Deck](/tutorials/deck/).
