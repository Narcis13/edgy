---
title: Names and references
nav: Names
---

This page explains how cells get names, how an expression reads a cell by name, and how a cell can read its neighbours by place instead, which is what lets a button duplicate a row.

## Naming a cell

Select a cell, open **Cell details** and type in **Name**. The hint under it says what a name is for: *Name it to use it in formulas.* In [notation](/agents/notation/) it is the `name` prop:

```notation id=money
["col",
  ["input", {"name": "qty", "type": "number", "value": 3}],
  ["input", {"name": "unit-price", "type": "number", "value": 8}],
  ["formula", {"name": "total", "format": "currency"}, ["*", "$qty", "$unit-price"]]]
```

An expression reads a cell by writing its name where a value goes:

```sx in=money
qty
⇒ 3
(* qty unit-price)
⇒ 24
total
⇒ 24
```

A cell with no name can't be read by name. Give a name to the cells other cells read, not to every cell.

## The rules for a name

- It starts with a letter or `_`, then has letters, digits, `-` and `_`. No spaces.
- Capitals matter: `Total` and `total` are different names.
- No two cells in a document share a name.
- It can't be one of the words the language keeps: `true`, `false`, `nil`, `null`, `it`, `i` and `acc`.
- It can't be the id of another cell (the `c4` shown next to a cell's kind in **Cell details**).

A name that breaks a rule is refused with a message:

| Message | Cause |
| --- | --- |
| `"1x" is not a usable name: start with a letter, then letters, digits, - or _` | A space, a leading digit or another character. |
| `"it" is reserved` | One of the kept words. |
| `another cell is already named "total"` | The name is taken. |
| `"c5" is the id of another cell` | The name is another cell's id. |

A hyphen is part of a name, not a minus. `unit-price-1` is one name, and reading it fails unless a cell has that name. Put spaces around the minus:

```sx in=money
(- unit-price 1)
⇒ 7
(- unit-price-1 1)
⇒ error: no cell called "unit-price-1"
```

## What a name gives

A name gives the cell's value: what an input holds, what a formula works out. A row or column named `lines` gives the list of its cells' values. The page of each [kind](/cells/) says what its value is.

A name that no cell has is an error:

```sx in=money
Qty
⇒ error: no cell called "Qty"
```

You can also write `$qty`, the stored spelling, and it means the same. An expression can use a cell's id in place of a name (`c3`), but ids aren't meant to be typed: they mean nothing to a reader.

## Renames are followed

Rename a cell and the expressions that read it change with it. Nothing breaks, and nothing needs fixing by hand. This covers formulas, button actions, handlers, conditions, styles, the document's own handlers and custom actions, and the `{{ }}` in text, labels, placeholders, image addresses, alt text, titles and diagram labels.

```ops id=renamed in=money
[["set", "qty", "name", "quantity"]]
```

```sx in=renamed
total
⇒ 24
(+ quantity 1)
⇒ 4
qty
⇒ error: no cell called "qty"
```

The formula now reads `(* quantity unit-price)`. Two things are left alone on purpose. A name inside [quote](fn:quote) is data, not a reference. And inside `(fn (qty) …)` or `(let (qty 1) …)`, `qty` is the function's own name, not the cell's.

## Names that are not cells

[let](fn:let) and [fn](fn:fn) give names to values for the length of one expression. [map](fn:map), [filter](fn:filter) and their relatives name the current item `it` and its position `i`; [reduce](fn:reduce) adds `acc`, the total so far. A table's row action names its record `row`, and an event handler gets the event's data by name.

When a name is both a variable and a cell, the variable wins inside its expression:

```sx in=money
(let (qty 10) (* qty 2))
⇒ 20
qty
⇒ 3
```

This is why `it`, `i` and `acc` can't be cell names.

## ref: a name worked out

[ref](fn:ref) reads a cell by a name that is text, so the name can be built:

```notation id=quarters
["col",
  ["data", {"name": "q1"}, 10],
  ["data", {"name": "q2"}, 20],
  ["input", {"name": "pick", "type": "number", "value": 2}]]
```

```sx in=quarters
(ref (str "q" pick))
⇒ 20
(ref "q1")
⇒ 10
```

`(ref q1)` and `q1` give the same value. Use `ref` only when the name is not known until the expression runs.

## Relative references: sib, idx and child

A name finds one cell, wherever it sits. That doesn't suit a row you copy: names are unique, so the copy of a cell named `qty` is named `qty2`, and a formula in the copied row that reads `qty` keeps reading the first row's cell. For repeated rows, read the neighbours by place instead:

- `(sib n)` is the value of the nth cell (counting from 0) in the same row or column as the cell the expression is in. A negative number counts from the end: `(sib -1)` is the last.
- `(idx)` is this cell's own place in its row or column, from 0.
- `(child group n)` is the cell number `n` of the row or column named `group`, as a cell to act on. It is not a value; it is what [dup!](fn:dup!) and [remove!](fn:remove!) take. `-1` is the last.

The [Quote](template:quote) template's line items work this way. Each line is a row of four cells: a description, a quantity, a price and an amount. The amount is `(* (sib 1) (sib 2))`: the cell beside it at place 1 times the one at place 2, in whichever row it sits. **Add a line** copies the last line, and the copy's amount reads its own row.

```live id=lines title="Line items that can be copied" height=300
["col",
  ["col", {"name": "lines", "size": "hug"},
    ["row", {"size": "hug", "style": {"stack": "never"}},
      ["input", {"type": "text", "value": "Brand identity", "size": 3}],
      ["input", {"type": "number", "value": 1}],
      ["input", {"type": "number", "value": 2400}],
      ["formula", {"format": "currency"}, ["*", ["sib", 1], ["sib", 2]]]],
    ["row", {"size": "hug", "style": {"stack": "never"}},
      ["input", {"type": "text", "value": "Website design, per page", "size": 3}],
      ["input", {"type": "number", "value": 6}],
      ["input", {"type": "number", "value": 380}],
      ["formula", {"format": "currency"}, ["*", ["sib", 1], ["sib", 2]]]]],
  ["row", {"size": "hug"},
    ["button", {"size": "hug", "variant": "soft", "do": ["dup!", ["child", "lines", -1]]}, "Add a line"],
    ["button", {"size": "hug", "variant": "ghost", "do": ["remove!", ["child", "lines", -1]], "hidden": ["<=", ["len", "$lines"], 1]}, "Remove the last"]],
  ["formula", {"name": "subtotal", "format": "currency"}, ["sum", ["column", "$lines", 3]]]]
```

Press **Add a line** and the subtotal grows. `lines` is the value of the column: a list with one list per row, so `(column lines 3)` is the fourth item of every row, the amounts, and `subtotal` adds them:

```sx in=lines
lines
⇒ (list (list "Brand identity" 1 2400 2400) (list "Website design, per page" 6 380 2280))
subtotal
⇒ 4680
(dup! (child lines -1))
(len lines)
⇒ 3
subtotal
⇒ 6960
```

**Remove the last** hides itself while only one line is left, with the condition `(<= (len lines) 1)`.

### idx

`idx` numbers things that can be copied. Each step below says its own place, and the numbers stay in order when a step is added:

```live id=steps title="Steps that number themselves" height=220
["col",
  ["col", {"name": "steps", "size": "hug"},
    ["text", "{{(+ (idx) 1)}}. Pack the order"],
    ["text", "{{(+ (idx) 1)}}. Print the label"],
    ["text", "{{(+ (idx) 1)}}. Hand it to the courier"]],
  ["button", {"size": "hug", "variant": "soft", "do": ["dup!", ["child", "steps", 0]]}, "Copy the first step"]]
```

`idx` is the cell's own place in its parent, so it counts steps because the text cells sit directly in the column. In a row of four cells, every cell's `(idx)` is its place in that row.

### When a relative reference fails

- `sib needs a cell that sits in a row or column`: the cell is the root, with no neighbours.
- `there is no sibling 5`: the row has no cell at that place.
- `"lines" has no cell 7`: [child](fn:child) asked for a place past the end.
- `circular reference: …`: a cell read itself, for example `(sib 3)` written in the fourth cell. Read the cells beside it, not itself.

## See also

- [The language](/language/): how expressions are written.
- [Cells functions](/language/functions/cells/): `ref`, `sib`, `idx`, `child`, `rows` and the rest.
- [Errors](/language/errors/): every message, with what to do.
