---
title: Input
---

An input is a field that people fill in: a line of text, a number, a slider, a tick, a choice, a date, a longer text or a rating.

::ref kind input

## When to use it

Use an input wherever a document needs something from a person: the quantity on a quote, a client's name, a date, a yes or no, a score. Other cells read it by its name, so a [formula](kind:formula) that says `(* qty price)` follows the numbers people type.

An input is for values that people change. For a value that only buttons and formulas change, and that readers never see, use a [data](kind:data) cell. For a value worked out from other cells, use a [formula](kind:formula).

## Try it

Every type of input is in this order form. Change any of them: the total, which is a formula, and the sentence under it, which is text, follow.

```live id=form title="Every type of input" height=600
["col", {"style": {"gap": 8}},
  ["row", {"size": "hug", "style": {"gap": 8}},
    ["input", {"name": "client", "type": "text", "label": "Client", "value": "Ada Lovelace", "placeholder": "Who is it for?", "size": 2}],
    ["input", {"name": "qty", "type": "number", "label": "Quantity", "value": 2, "min": 0, "max": 20}],
    ["input", {"name": "pack", "type": "select", "label": "Pack size", "options": ["list", "Small", "Medium", "Large"], "value": "Medium"}]],
  ["input", {"name": "discount", "type": "slider", "label": "Discount (%)", "value": 10, "min": 0, "max": 50, "step": 5}],
  ["row", {"size": "hug", "style": {"gap": 8}},
    ["input", {"name": "due", "type": "date", "label": "Due", "value": "2026-10-30"}],
    ["input", {"name": "rush", "type": "toggle", "label": "Rush order"}],
    ["input", {"name": "gift", "type": "checkbox", "label": "Gift wrap", "value": true}]],
  ["input", {"name": "rating", "type": "rating", "label": "How was the last order?", "value": 4}],
  ["input", {"name": "notes", "type": "textarea", "label": "Notes", "placeholder": "Anything we should know?"}],
  ["formula", {"name": "total", "format": "currency"}, ["*", "$qty", 40, ["-", 1, ["/", "$discount", 100]]]],
  ["text", {"name": "summary"}, "**{{client}}** orders **{{qty}}** × {{pack}}, due {{due | date}}. Discount {{discount}}%. Rush: {{(if rush \"yes\" \"no\")}}."]]
```

Each input has a name, and its value is what people have entered. The total multiplies the quantity by 40 and takes off the discount. A button, or a handler, changes an input with `set!`, and flips a toggle or a checkbox with `toggle!`:

```sx in=form
total
⇒ 72
(set! qty 5)
total
⇒ 180
rush
⇒ false
(toggle! rush)
rush
⇒ true
```

## Types of input

The type is `type` in notation, and the **Kind of field** in the designer. Each has its own entry in the `/` menu.

| `type` | In the / menu | What people do | The value |
| --- | --- | --- | --- |
| `"text"` | **Text field** | Type a line. | The text; `""` when empty. |
| `"number"` | **Number** | Type a number, or use the arrows. | A number; nothing (`nil`) when the field is empty. |
| `"slider"` | **Slider** | Drag. The number shows beside the label. | A number. |
| `"checkbox"` | **Checkbox** | Tick it. | `true` or `false`. |
| `"toggle"` | **Toggle** | Switch it. | `true` or `false`. |
| `"select"` | **Choice** | Pick one of the options. | The option, as text; `""` until one is picked. |
| `"date"` | **Date** | Pick a day. | The day as text, `"2026-10-30"`; `""` until one is picked. |
| `"textarea"` | **Long text** | Type several lines. | The text. |
| `"rating"` | **Rating** | Click a star. Clicking the star that is already chosen clears it. | A number of stars, from 0. |

An input with no `type` is a text field.

## Adding and designing one

1. Select a cell in **Edit** and press `/` ([the key](key:kind-menu)).
2. Choose the type: **Number**, **Text field**, **Slider**, **Checkbox**, **Toggle**, **Choice**, **Date**, **Long text** or **Rating**. The cell starts with a value that shows how it works: 0 for a number, 50 on a slider from 0 to 100, unticked for a checkbox and a toggle, 3 stars out of 5, and **First** among three options for a choice.
3. Name it in **Name** at the top of **Cell details**, so that other cells can read it.

::shot designer-input "The input's designer: the kind of field, its label, its range, its placeholder and its value."

**Cell details** shows:

- **Kind of field**: tiles for the nine types. Changing the type starts the value again, and keeps the name and the label.
- **Label**: shown above the field, or beside a checkbox or a toggle. It can carry a text template, such as `Discount ({{discount}}%)`; a slider whose label has a template doesn't show its number.
- **Range**, for a number and a slider: **Least**, **Most** and **Step**. Empty means no limit.
- **Stars**, for a rating: how many, from 1 to 10.
- **Choices**, for a choice: the options typed with commas, such as *Small, Medium, Large*; or **Use a formula** for a formula that gives a list, such as `(map (get it "name") (rows "people"))`. **Type them** goes back.
- **Placeholder**, for a text field, a long text and a number: the grey words in the empty field.
- **Value**, what it holds now; or **Ticked to start with** for a checkbox and a toggle.

Typing in an input in **Edit** changes its value, as the **Value** field does. The formula bar's value field does the same.

## In notation

An input has no body. Everything is in its props:

```notation id=fields
["row", {"size": "hug", "style": {"gap": 8}},
  ["input", {"name": "qty", "type": "number", "label": "Quantity", "value": 2, "min": 1, "max": 20, "step": 1}],
  ["input", {"name": "pack", "type": "select", "label": "Pack size", "options": ["list", "Small", "Medium", "Large"], "value": "Medium"}],
  ["input", {"name": "agree", "type": "checkbox", "label": "I agree to the terms"}]]
```

| Prop | What it is |
| --- | --- |
| `type` | One of the nine above. Left out, `"text"`. |
| `value` | What it holds to begin with. |
| `label` | Words with the field. A text, with `{{templates}}` if you like. |
| `placeholder` | Grey words in an empty text field, long text or number. |
| `min`, `max`, `step` | The range of a number or a slider; for a rating, `max` is the number of stars. Each can be an expression such as `"$limit"`. |
| `options` | For a choice, a list: `["list", "S", "M", "L"]`, or any expression that gives one. |
| `name` | Lets other cells read it. |
| `size` | Its room inside its row or column: a weight, `"hug"` or `"120px"`. |
| `hidden` | `true`, or an expression: the field is out of sight while it holds. |
| `style` | Its look. See [Style keys](/styling/style-keys/). |
| `on` | Handlers, such as `change`. |

## Its value

What the person has entered, in the form the table above gives: text for a text field, a long text, a choice and a date; a number for a number, a slider and a rating; `true` or `false` for a checkbox and a toggle.

Typing is a change to the document, like any other. For people who can edit the document it is saved, and others see it; for a viewer it stays in their own tab.

## Events

::ref events-of input

[change](event:change) runs whenever the value changes, whoever changes it: a person, a button, a handler or an agent. `value` is the new value and `was` the one before. A text field changes with every key. See [Events and actions](/events/).

## Actions that change it

[set!](fn:set!) sets the value. [toggle!](fn:toggle!) flips a checkbox or a toggle:

```sx
(set! qty (+ qty 1))
(set! pack "Large")
(toggle! rush)
```

An action sets any value it is given; it isn't held to the range or the options. `min` and `max` limit what people can do with the arrows and the slider, not what a button sets or what is typed into a number field.

```sx in=form
(set! qty 25)
qty
⇒ 25
(clamp qty 0 20)
⇒ 20
```

## On a phone and on paper

An input is as wide as its cell. A checkbox and a toggle are as wide as their label. In a row that wraps, an input that shares the width keeps at least 120 pixels before it moves under the others; see [row](kind:row). In a row set to **Keep in line**, as the lines of the [Quote](template:quote) template are, inputs give up some padding so that the row fits.

On paper an input prints as the field showing the value it holds.

## Usual mistakes

- **The total doesn't follow.** The formula reads the input by its name, and the input has none, or another. Name it in **Name**; a formula's text is then `(* qty price)`.
- **A slider shows its least but reads as nothing.** A slider written in notation without a `value` looks as if it were at its least, and its value is `nil`. Give it a `value`. One made from the `/` menu starts at 50.
- **A number outside the range is kept.** `min` and `max` limit the arrows and the slider, not what is typed. Use `(clamp qty 0 20)` where the number is read.
- **A formula that reads a date shows an error until a day is picked.** An empty date input is `""`, and `(days start end)` says *expected a date, got ""*. Give the input a `value`, or ask first, as below.
- **An empty number counts as 0 in sums and as nothing in `default`.** `(+ n 1)` is 1 when `n` is empty. `(default n 5)` gives 5 when it is empty.
- **A choice has no value yet.** A choice with no `value` shows *Choose…* and reads as `""`. A `value` that isn't among the options is shown as an extra option so that it is not lost.
- **Changing the type started the value again.** That is what **Kind of field** says: the value starts again, and the name and the label stay.

A date input with no day picked can be asked about before it is used:

```sx in=form
(set! due "")
(days (today) due)
⇒ error: expected a date
(if (empty? due) "no date yet" (days (today) due))
⇒ "no date yet"
```
