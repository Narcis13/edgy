---
title: List
---

A list cell holds items that people add, edit, reorder and, in a checklist, tick off; its value is the items, so other cells can count and read them.

::ref kind list

## When to use it

Use a list for things people keep in order: a checklist to tick through, steps to follow, things to bring. A list is for a handful of short items. For records with several fields, searching and sorting, use a [table](kind:table).

A list can also show a computed list, such as the names of everyone in a collection, read only. See **Computed from** below.

## Try it

```live id=launch title="A checklist" height=240
["col",
  ["list", {"name": "todo", "type": "check", "label": "Before the launch"},
    "Book the venue", {"text": "Send invites", "done": true}, "Order name badges"],
  ["row", {"size": "hug"}, ["text", "Still to do:"], ["formula", {"name": "left"}, ["count-if", ["not", ["get", "$it", "done"]], "$todo"]]]]
```

Tick an item and the count below it drops. Click an item's words to change them; press Enter to keep it and start the next one. **Add an item** adds one at the end. Drag the grip at the end of a line to reorder, or focus it and use the arrow keys.

A checklist's value is a list of records with the words in `text` and a yes or no in `done`:

```sx in=launch
todo
⇒ (list {text "Book the venue" done false} {text "Send invites" done true} {text "Order name badges" done false})
left
⇒ 2
(set! todo (concat todo (list {text "Pack the van" done false})))
left
⇒ 3
```

## Adding and designing one

1. Select a cell and press `/`, then choose **Checklist**, **Bulleted list** or **Numbered list**.
2. Press **Add an item** and type. Enter keeps the item and starts the next; Esc stops without keeping a change; Backspace in an empty item removes it and goes to the one before ([shortcuts](key:list-next)).
3. Name the cell in **Name**, at the top of **Cell details**, so formulas can read it.

::shot designer-list "The list's designer: its kind, title, marker, spacing, progress bar and the formula it can be computed from."

In the **Content** section:

- **Kind of list**: **Checklist**, **Bullets** or **Numbers**. Changing the kind keeps the items and rewrites them to fit: a checklist's are records, the others' are plain text.
- **Title**: shown above the items.
- **Marker** (bullets only): a dot, a dash, an arrow, a star or **None**.
- **Spacing**: **Compact**, **Normal** or **Roomy**.
- **Show progress** (checklists only): the bar and *3 of 5 done* above the items.
- **Computed from**: an expression giving a list. Leave it empty so people can edit the items. With one, the list shows what it computes and the items can't be edited by hand; clear it to edit them again.

An item can also be removed with the **×** at its end, or by clearing its words.

## In notation

The items are the body: plain words, or records with `text` (and `done` in a checklist).

```notation id=bring
["row",
  ["list", {"name": "packing", "type": "check", "label": "Pack", "progress": false},
    "Laptop and charger", {"text": "Passport", "done": true}],
  ["list", {"type": "bullet", "marker": "arrow", "density": "compact", "label": "Bring"},
    "Comfortable shoes", "A rain jacket"],
  ["list", {"type": "number", "label": "Steps"}, "Open the doors", "Switch on the card reader"],
  ["list", {"label": "Everyone going", "expr": ["map", ["get", "$it", "name"], ["rows", "people"]]}]]
```

The last list has an `expr` prop instead of items, so it is computed and read only. An expression written as the body would be read as an item.

| Prop | What it is |
| --- | --- |
| `type` | `"check"`, `"bullet"` (the default) or `"number"`. |
| `label` | The title. |
| `marker` | For bullets: `"dot"` (default), `"dash"`, `"arrow"`, `"star"` or `"none"`. |
| `density` | `"compact"`, `"normal"` (default) or `"roomy"`. |
| `progress` | `false` hides a checklist's bar. |
| `expr` | An expression giving the items. The list is then computed and read only. |
| `value` | The items, when not given as the body. |

## Its value

What the list gives depends on its kind:

- A **checklist** gives a list of `{text, done}` records, whatever shape the items were written in, so `(count-if (get it "done") todo)` counts what is done and `(every (get it "done") todo)` tells whether all are.
- **Bullets** and **numbers** give their items as text: a record with a `text` becomes its text.
- A **computed** list gives whatever its expression gives.

```sx
(count-if (get it "done") todo)
(every (get it "done") todo)
```

## Events

::ref events-of list

`change` fires whenever the items are different, whoever changed them: a person ticking, a button, a handler or an agent. Its data names the first item that differs: `item` and its `index`. That is how a list reacts when the last item is ticked:

```notation id=finish
["col",
  ["list", {"name": "setup", "type": "check",
            "on": {"change": ["when", ["every", ["get", "$it", "done"], "$value"], ["show!", "ready"]]}},
    "Unfold the table", "Put up the price board"],
  ["text", {"name": "ready", "hidden": true}, "All set: the stall is open."]]
```

A click on an item's words raises `click` with that `item`, besides starting to edit it. See [Events and actions](/events/).

## Actions that change it

[set!](fn:set!) replaces all the items, as in the example above: build the new list from the old one with [concat](fn:concat), [filter](fn:filter) or [map](fn:map). A computed list can't be set; change what it reads.

## On a phone and on paper

On a touch screen, such as a phone, the grips and the **×** are always visible and larger to touch; with a mouse they appear when you point at a line. In a very narrow cell (under about 260 pixels) the grip is dropped, and reordering waits for a wider cell. On paper a list prints its items, ticks and progress bar, without **Add an item**, the grips or the **×**.

## Usual mistakes

- **An item can't be edited.** The list has a **Computed from** formula, so it shows what that gives. Clear it to type items.
- **`done` is missing from a bullet list's items.** Only checklists give records. Switch **Kind of list** to **Checklist**, or count with the items' words.
- **Setting the list to a list of words loses the ticks.** `(set! todo (list "A" "B"))` on a checklist gives items that aren't done. Build the new value from the old one: `(concat todo (list {text "C" done false}))`.
- **An item I cleared has gone.** Emptying an existing item's words removes it. Press Esc instead to keep what was there.
- **The progress bar is missing.** It shows only for a checklist with at least one item, and **Show progress** must be on.
