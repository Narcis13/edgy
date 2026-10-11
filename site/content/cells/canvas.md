---
title: Canvas
---

A canvas cell, called **Drawing** in the / menu, is a surface to draw or sign on with a mouse, a pen or a finger; its value is the strokes, so other cells can tell whether anything has been drawn.

::ref kind canvas

## When to use it

Use a canvas where a person needs to sketch or sign: an approval line at the foot of a quote, a rough floor plan, an annotation. A signature is a canvas with words under a line.

A canvas holds freehand strokes. For shapes that stay joined and carry labels, use a [diagram](kind:diagram).

## Try it

```live id=sign title="A signature" height=300
["col",
  ["canvas", {"name": "sig", "label": "Sign here"}],
  ["formula", {"name": "state"}, ["if", ["empty?", "$sig"], "Not signed yet", "Signed"]],
  ["button", {"variant": "ghost", "do": ["set!", "sig", ["list"]]}, "Start over"]]
```

Draw with the mouse or a finger. The line says *Sign here* until the first stroke; the text below changes the moment you lift the pen. The pen tools appear when you point at the drawing: four inks, a thin and a thick pen, **Undo last stroke** and **Clear the drawing**. **Start over** is a button that sets the value to an empty list.

The value is a list of strokes. Each is a record with the colour `c`, the width `w` and the points `p`, as `x0 y0 x1 y1 …` in a space 1000 units wide:

```sx in=sign
(empty? sig)
⇒ true
(set! sig (list {c "ink" w 3.5 p (list 40 80 300 120 520 60)}))
(empty? sig)
⇒ false
state
⇒ "Signed"
(len sig)
⇒ 1
```

## Adding and designing one

1. Select a cell and press `/`, then choose **Drawing**, or **Signature** for a signature line.
2. Name it in **Name**, at the top of **Cell details**, if other cells will read it.
3. Set the paper and the pen in the **Content** section.

::shot designer-canvas "The drawing's designer: the signature line, the paper, the pen colour and how much is drawn."

- **Signature line**: a line with a cross at its start and words under it, *Sign here* unless you change **Words under the line**. The words fade once there is a stroke.
- **Paper**: **Plain**, **Lines**, **Grid** or **Dots**.
- **Pen colour**: the colour the pen starts with; **Ink** is the default. People can choose another of the four inks while drawing.
- **Drawn so far**: how many strokes there are, with **Clear**.

## In notation

There is no body: the strokes are the `value`, and a new canvas has none.

```notation id=approval
["canvas", {"name": "approval", "label": "Approved by", "paper": "lines", "color": "accent"}]
```

| Prop | What it is |
| --- | --- |
| `label` | Words under a signature line. Setting it makes the canvas a signature line. |
| `paper` | `"plain"` (default), `"lines"`, `"grid"` or `"dots"`. |
| `color` | The colour the pen starts with: a [colour token](term:token). |
| `value` | The strokes, a list of `{"c", "w", "p"}`. |

## Its value

The strokes, as a list of records `{c, w, p}`, empty when nothing has been drawn. Each stroke is saved when the pen is lifted, so the document grows by the points of what is drawn; the points are rounded and close ones are dropped.

To know whether a canvas has been signed:

```sx
(not (empty? sig))
```

The value is saved in the document and shared like an input's: everyone who opens it sees the drawing.

## Events

::ref events-of canvas

`change` fires after every stroke, and after **Undo last stroke**, **Clear** and any `set!`. It binds `value`, the strokes now, and `was`. A handler can react to a signature being made: `(not (empty? value))`. See [Events and actions](/events/).

```notation id=thanks
["col",
  ["canvas", {"name": "sig", "label": "Sign here", "on": {"change": ["if", ["empty?", "$value"], ["hide!", "thanks"], ["show!", "thanks"]]}}],
  ["text", {"name": "thanks", "hidden": true}, "Thank you. Your signature is saved."]]
```

## Actions that change it

[set!](fn:set!) replaces the strokes: `(set! sig (list))` clears the drawing, as the **Start over** button above does. Taking back a stroke is **Undo last stroke** on the surface, or ⌘Z.

## On a phone and on paper

On a touch screen the pen tools stay visible and larger, and a finger on the surface draws instead of scrolling the document, so leave room around a canvas to scroll past it. In a narrow cell the tools sit under the surface instead of over the drawing. The surface is at least 160 pixels high and grows if a stroke reaches further down. A drawing is scaled to the cell's width, so strokes keep their shape when the cell is wide or narrow. On paper the strokes and the signature line print; the pen tools do not.

## Usual mistakes

- **The document won't scroll under my finger on a phone.** A touch on the surface draws. Scroll by touching beside or above the canvas, or make the cell narrower than the screen.
- **Everyone draws on the same surface.** The strokes are part of the document, so everyone who can use it in Live sees and adds to one drawing. A canvas is not a private signature box for each visitor.
- **The signature went when I started over.** **Clear the drawing** and `(set! sig (list))` remove all strokes, and a signature line goes back to *Sign here*. Add **Ask first** to a button that does it.
- **`(empty? sig)` is true after signing.** The formula reads another cell, or the name doesn't match. Check the name in **Name**.
- **The pen is not the colour I chose.** The inks on the surface are only for the person drawing and are not saved. The pen starts in **Pen colour** when the document opens.
