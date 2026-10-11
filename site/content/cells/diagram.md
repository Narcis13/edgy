---
title: Diagram
---

A diagram cell holds shapes, text and arrows that you draw in the cell and that stay joined when you move them; its value is the list of its elements.

::ref kind diagram

## When to use it

Use a diagram for a flow, a process, a map of who does what: boxes with words in them, joined by arrows. Labels can carry live values, so a diagram can say how many orders wait at a step.

A diagram is for pictures of structure. For numbers drawn as shapes, use a [chart](kind:chart); for a freehand sketch or a signature, use a [drawing](kind:canvas). The [Order desk](template:elements) template has a diagram whose labels show live counts and totals.

## Try it

```live id=flow title="An order's path" height=420
["col",
  ["input", {"name": "qty", "type": "number", "label": "Boxes in the order", "value": 3, "size": "hug"}],
  ["diagram", {"name": "flow"},
    {"id": "a", "type": "rect", "text": "Order placed", "color": "accent", "fill": "accent-soft"},
    {"id": "b", "type": "diamond", "text": "Paid?"},
    {"id": "c", "type": "rect", "text": "Ship {{qty}} boxes"},
    {"type": "arrow", "from": "a", "to": "b"},
    {"type": "arrow", "from": "b", "to": "c", "text": "yes"}]]
```

Change the number of boxes and the third box says it too: a label written with `{{ }}` shows live values. In Live, press a shape and the cell raises `click` with that shape, so a diagram can double as a clickable map. The diagram's value is its list of elements:

```sx in=flow
(count-if (!= (get it "type") "arrow") flow)
⇒ 3
(map (get it "text") (filter (= (get it "type") "diamond") flow))
⇒ (list "Paid?")
```

The boxes in the notation have no position. edgy placed them for you, top to bottom along the arrows.

## Adding and designing one

1. Select a cell and press `/`, then choose **Diagram**. It starts with a *Start* box, a *Next step* box and an arrow between them.
2. Select the diagram cell. Its toolbar appears at the top of the cell, and from then on the diagram takes the pointer and the keys.
3. Pick a tool and drag on the drawing, or press a shape's letter.

::clip arrow "Drawing two boxes and an arrow from one to the other."

The toolbar has **Select and move** (V), **Rectangle** (R), **Ellipse** (O), **Diamond** (D), **Arrow** (A), **Line** (L) and **Text** (T), the colour of **Line and text colour** and **Fill colour**, **Write a label (Enter)**, **Duplicate (⌘D)**, **Delete (⌫)**, and **Undo** and **Redo**.

- Drag with a shape tool to draw it; click once to get one of the usual size. Hold Shift while dragging for a square or a circle. When the shape is drawn, the select tool is back and the new shape is picked.
- Drag with the arrow tool from one shape to another and the arrow stays attached to both: move a box and the arrow follows. A shape lights up when an arrow end is over it; an end let go over empty ground stays free.
- Pick a shape and press Enter to write its label ([shortcut](key:diagram-label)). Enter again, Esc or Tab finishes; Shift+Enter starts a new line.
- Drag a picked shape to move it, its handles to resize it, or use the arrow keys (Shift for ten steps at a time). ⌘A picks everything and Backspace deletes what is picked ([shortcuts](key:diagram-nudge)).
- Each finished gesture is one step for undo.

::shot designer-diagram "The diagram's designer: a count of what is drawn, Tidy layout, Clear, and how formulas read the elements."

In the **Content** section, **Drawn so far** says what is in the diagram, such as *3 shapes, 2 connectors*. **Tidy layout** places every shape again, top to bottom along the arrows. **Clear** removes everything. Below, the designer shows how to count the shapes with a formula once the cell is named.

## In notation

The body is the elements. **Write a props object first**, even an empty one, or the first element would be read as the props:

```notation id=steps
["diagram", {"name": "steps"},
  {"id": "a", "type": "ellipse", "text": "Start"},
  {"id": "b", "type": "rect", "text": "Check the stock"},
  {"id": "c", "type": "rect", "text": "Order more", "color": "warn", "fill": "warn-soft", "dash": true},
  {"type": "arrow", "from": "a", "to": "b"},
  {"type": "arrow", "from": "b", "to": "c", "text": "low"},
  {"type": "line", "x1": 0, "y1": 330, "x2": 300, "y2": 330}]
```

Each element is a record:

| Field | What it is |
| --- | --- |
| `id` | Yours, or `e1`, `e2`… given for you. Two elements can't share one. |
| `type` | `rect`, `ellipse`, `diamond`, `text`, `arrow` or `line`. |
| `x`, `y`, `w`, `h` | Place and size in pixels. Leave `x` and `y` out and the shapes are laid out top to bottom along the arrows. |
| `text` | The label. It may carry `{{templates}}`, shown live. |
| `color` | The colour of the outline and the text: a [colour token](term:token). |
| `fill` | A fill: a token such as `accent-soft`, or `none`. |
| `size` | The font size in pixels. |
| `dash` | `true` for a dashed outline or line. |
| `from`, `to` | For arrows and lines: the ids of the shapes they join. The ends stay attached. |
| `x1`, `y1`, `x2`, `y2` | For arrows and lines: free ends. |

An arrow or line needs a start and an end, each a shape (`from` and `to`) or a point (`x1`, `y1` and `x2`, `y2`). A shape or text is something an arrow can join; an arrow can't join another arrow. Several arrows between the same two shapes run side by side.

To add or change elements without rewriting the list, use the [draw](op:draw) op, and [erase](op:erase) to remove some:

```ops in=steps
[["draw", "steps", {"id": "d", "type": "ellipse", "text": "Done"}, {"type": "arrow", "from": "b", "to": "d", "text": "enough"}]]
```

```sx in=steps
(count-if (!= (get it "type") "arrow") steps)
⇒ 4
```

## Its value

A diagram's value is the list of its elements, as records, in the order they were made. Other cells count and read them:

```sx in=flow
(len (filter (= (get it "type") "arrow") flow))
⇒ 2
```

Text in `{{ }}` stays as written in the value: the live text is what the diagram shows, not what it holds.

## Events

::ref events-of diagram

A press on a shape in Live raises `click` with `element`, the shape or arrow as a record, or nothing for the background. `dblclick` works the same way. A handler can show what was pressed:

```notation id=map
["col",
  ["diagram", {"name": "plan", "on": {"click": ["set!", "step", ["get", "$element", "text"]]}},
    {"id": "a", "type": "rect", "text": "Design"},
    {"id": "b", "type": "rect", "text": "Build"},
    {"type": "arrow", "from": "a", "to": "b"}],
  ["data", {"name": "step"}, ""],
  ["text", "You pressed: **{{step}}**"]]
```

`change` fires when the elements change. See [Events and actions](/events/).

## Actions that change it

[set!](fn:set!) replaces the whole list; for a change to one element, use the [draw](op:draw) and [erase](op:erase) ops instead of rewriting the list. Drawing is for people in Edit.

## On a phone and on paper

A diagram that is wider than its cell shrinks down to 60%, then scrolls sideways inside the cell; the document itself never scrolls sideways. While you draw on a touch screen, the diagram stops the document from scrolling under your finger. In Page view and on paper the diagram is a picture without its toolbar, shrunk if it must be to fit the width of the page.

## Usual mistakes

- **`element 1 has an unknown field "…"`.** An element has a field that isn't in the table above. The message names it.
- **`element 2 has type "box"; known: rect, ellipse, diamond, text, arrow, line`.** Use one of the six types.
- **`arrow e3 goes to "x", which is not a shape or text in this diagram`.** An arrow names an id that isn't there, or the id of another arrow. Check the spelling of `from` and `to`.
- **The first shape disappears from the notation.** It was written straight after the cell's kind, so it was read as the props. Put a props object, even `{}`, before the elements.
- **Boxes sit on top of each other.** Elements with an `x` and a `y` keep them. Leave both out for the layout to place them, or press **Tidy layout** to throw the positions away.
- **A label shows `{{qty}}` as written.** The template has a problem, so the label is shown as typed and the cell shows the problem in a small red label. Check the names in it.
