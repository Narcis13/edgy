---
title: Cells
---

The cell functions read the document itself: another cell's value, the cells beside this one, the records saved in a collection, the rows picked in a table and how a fetch cell stands.

::ref functions Cells

To read a cell you only write its [name](term:name): `total` in `(* total 2)` is the value of the cell called `total`. A named row or column reads as the list of its cells' values. See [Names and references](/language/names/). The functions here are for the cases a name cannot cover.

None of them changes anything; the functions that do are on [Actions](/language/functions/actions/).

## Reading a cell

The examples in this section use a small invoice. Each line is a row: an item, a quantity, a price and an amount worked out from the two cells before it.

```live id=invoice title="An invoice with two lines" height=230
["col",
  ["col", {"name": "lines"},
    ["row",
      ["text", "Tea"],
      ["input", {"type": "number", "value": 2}],
      ["input", {"type": "number", "value": 3}],
      ["formula", {"format": "currency"}, ["*", ["sib", 1], ["sib", 2]]]],
    ["row",
      ["text", "Cable"],
      ["input", {"type": "number", "value": 1}],
      ["input", {"type": "number", "value": 12}],
      ["formula", {"format": "currency"}, ["*", ["sib", 1], ["sib", 2]]]]],
  ["formula", {"name": "total", "format": "currency"}, ["sum", ["column", "$lines", 3]]]]
```

The column `lines` reads as a list of lists, one for each row, and `total` adds up the fourth cell of each (place 3, counting from 0):

```sx in=invoice
lines
⇒ (list (list "Tea" 2 3 6) (list "Cable" 1 12 12))
total
⇒ 18
```

::: fn ref
The value of a cell, by its name or its id.

```sx in=invoice
(ref total)
⇒ 18
(ref (str "to" "tal"))
⇒ 18
```

Writing the name does the same: `total` and `(ref total)` are one value. `ref` earns its place in two cases.

**A name that something else hides.** Names made by [let](fn:let), by [fn](fn:fn) and by an [event](term:event) (`value`, `row`, `item`, …) come before cells of the same name. `ref` always reads the cell:

```sx in=invoice
(let (total 5) total)
⇒ 5
(let (total 5) (ref total))
⇒ 18
```

**A name worked out as the expression runs.** A bare word after `ref` is the name itself, not a variable: `(let (n "total") (ref n))` looks for a cell called `n`. Put a call there and its result is the name, as in `(ref (str "to" "tal"))` above, or `(ref (str "line" n))` for a numbered cell. [child](fn:child) gives ids you can pass to `ref` too.

A name that no cell has is an error, `no cell called "nope"`. A cell that is itself in error passes its error on to whoever reads it. See also [rows](fn:rows).
:::

## Cells beside and inside

::: fn sib
The value of the nth cell in the row or column that holds this cell: `(sib 0)` is the first, `(sib 1)` the second, and a negative place counts from the end, so `(sib -1)` is the last. The cell asking is counted too, at its own place.

The amounts in the invoice are `(* (sib 1) (sib 2))`: "the second cell times the third, in my own row". Read by name from outside, the amounts are the last place of each line:

```sx in=invoice
(column lines 3)
⇒ (list 6 12)
```

Because `sib` is relative to the cell that asks, the same formula works in every copy of a row. Duplicate a line with [dup!](fn:dup!) and its amount follows its own quantity and price, not the first line's. A formula that read `qty` by name could only ever read one cell.

- Counting starts at 0. A place the row doesn't have is an error, `there is no sibling 5`.
- A cell reading its own place asks for itself and gets `circular reference`.
- A cell that sits directly in no row or column, such as a document's only cell, is an error: `sib needs a cell that sits in a row or column`.
- In an action, the cell is the one the action belongs to, so a [button](kind:button)'s `(sib 0)` is the first cell of the row the button sits in.

An example below the page can't ask from inside a cell, which is why the results above are read from outside, through `lines`. See also [idx](fn:idx), [child](fn:child).
:::

::: fn idx
The place of this cell in its row or column, counting from 0.

```live id=slots title="Each cell knows its place" height=100
["row", {"name": "slots"},
  ["formula", ["idx"]],
  ["formula", ["idx"]],
  ["formula", ["idx"]]]
```

```sx in=slots
slots
⇒ (list 0 1 2)
```

`idx` takes no arguments and gives the place of the cell asking, so the same formula written three times shows three different numbers. It is the same number that `(sib n)` takes to name this cell. A cell with no row or column around it is at place 0. In an action, it is the place of the cell the action belongs to. See also [sib](fn:sib).
:::

::: fn child
The id of the nth cell inside a row, a column or any other cell that holds cells: `(child lines 0)` is the first line, `(child lines -1)` the last. A negative place counts from the end. The group is named, not worked out; to name it with a call, nest the calls, as the last example below does.

What comes back is an id, a short text such as `c17` that you don't write yourself. You pass it to something that takes a cell: [ref](fn:ref) reads it, and the actions [set!](fn:set!), [dup!](fn:dup!) and [remove!](fn:remove!) change it.

```sx in=invoice
(ref (child lines 0))
⇒ (list "Tea" 2 3 6)
(ref (child lines -1))
⇒ (list "Cable" 1 12 12)
(ref (child (child lines 0) 3))
⇒ 6
```

The last example nests: the fourth cell of the first line, which is its amount.

- Places start at 0. A place the group doesn't have is an error, `"lines" has no cell 9`, and so is a group that holds no cells.

`(dup! (child lines -1))` is how a button adds a line, and `(remove! (child lines -1))` how another takes the last one away; see [Actions](/language/functions/actions/). See also [sib](fn:sib).
:::

## Saved records

::: fn rows
The records saved in a [collection](term:collection), oldest first. Each record has its fields, an `id` and `at`, the time it was saved in milliseconds. A collection that has nothing saved gives an empty list.

```live id=orderlist title="Orders read from a collection" height=330
{"root": ["col",
    ["row", {"size": "hug"},
      ["stat", {"label": "Orders"}, ["len", ["rows", "orders"]]],
      ["stat", {"label": "In all", "format": "currency"}, ["sum-by", ["get", "$it", "total"], ["rows", "orders"]]]],
    ["table", {"name": "saved", "label": "Saved orders", "columns": ["client", "total", "status"]}, ["rows", "orders"]]],
  "data": {"orders": [
    {"client": "Northwind Studio", "total": 1200, "status": "Open"},
    {"client": "Ada Lovelace", "total": 1840, "status": "Paid"},
    {"client": "Bo Fischer", "total": 460, "status": "Open"}]}}
```

```sx in=orderlist
(len (rows "orders"))
⇒ 3
(sum-by (get it "total") (rows "orders"))
⇒ 3500
(map (get it "client") (where (rows "orders") "status" "Open"))
⇒ (list "Northwind Studio" "Bo Fischer")
```

The argument is the collection's name as text, so it is in quotes. Any cell that reads `rows` is worked out again whenever a record is saved, changed or deleted, so a table or a total follows the data without any button. The records belong to the account of the document's owner and outlive the document; see [Collections](/data/collections/).

[insert!](fn:insert!) saves a record, [update!](fn:update!) changes one, [delete!](fn:delete!) removes one and [clear!](fn:clear!) removes them all. Records come back with their `id`, so `(get record "id")` is what you pass to the last three. In the example above the records come with the document as sample data; in your own documents the collection starts empty. See also [where](fn:where), [sum-by](fn:sum-by), [sort-by](fn:sort-by).
:::

## Picked rows

::: fn selected
The rows people have picked in a [table](kind:table), as a list of records, in the table's order. Name the table, as you do with [status](fn:status): `(selected people)`.

```live id=picks title="Pick some people" height=260
["col",
  ["table", {"name": "people", "select": "many", "selected": [1], "label": "People",
             "value": [
               {"name": "Ada Lovelace", "city": "London"},
               {"name": "Bo Fischer", "city": "Oslo"},
               {"name": "Cy Turing", "city": "Leeds"}]}],
  ["text", "Picked: **{{(len (selected people))}}** of {{(len people)}}"]]
```

The table starts with its second row picked. Tick another row and the text follows.

```sx in=picks
(len (selected people))
⇒ 1
(selected people)
⇒ (list {name "Bo Fischer" city "Oslo"})
(map (get it "city") (selected people))
⇒ (list "Oslo")
```

- Only a table can be picked from. Its `select` setting, `"one"` or `"many"`, is what lets people tick rows. With nothing picked the list is empty.
- Picks are remembered by each row's key: its `id` when the row has one (saved records always do) and its place in the table otherwise. A table over [rows](fn:rows) therefore keeps the same records picked when others are added or the rows are sorted.
- Naming a cell that is not a table is an error: `"qty" is not a table, so nothing in it can be picked`.

The [pick](event:pick) event fires when the picks change, and binds the picked rows as `rows`. See also [rows](fn:rows), [sum-by](fn:sum-by).
:::

## Fetch cells

A [fetch](kind:fetch) cell asks an address for JSON while the document is open in Live. The cell's own value is the answer. The two functions below tell you how the asking is going, so a document can say "loading" or "failed" instead of showing nothing. Fetch cells need the server, so this example is shown as notation and, in this page, nothing has been asked yet:

```notation id=ratecard
["col",
  ["fetch", {"name": "rate", "every": 60}, "https://example.test/rate.json"],
  ["text", "Rate: {{(if (= (status rate) \"ready\") (get rate \"usd\") (status rate))}}"],
  ["button", {"do": ["refresh!", "rate"]}, "Fetch again"]]
```

::: fn status
How a fetch cell stands, as one of four words. Name the cell, as you do with [selected](fn:selected): `(status rate)`.

| Status | Meaning |
| --- | --- |
| `"idle"` | Nothing has been asked yet, as when the document is not open in Live. |
| `"loading"` | A request is on its way. |
| `"ready"` | An answer arrived. The cell's value is that answer. |
| `"failed"` | The last request failed. |

```sx in=ratecard
(status rate)
⇒ "idle"
```

The words are compared as text, so `(= (status rate) "failed")` is the test for a failure. A cell that is not a fetch cell is an error, `"qty" is not a fetch cell`. See also [error-of](fn:error-of), [refresh!](fn:refresh!), [fetch](kind:fetch).
:::

::: fn error-of
Why the last request of a fetch cell failed, as text, or nothing when there is no failure to report. Name the cell: `(error-of rate)`.

```sx in=ratecard
(error-of rate)
⇒ nil
```

Check [status](fn:status) first and read the reason only when it says `"failed"`: `(if (= (status rate) "failed") (error-of rate) "")`. The text is the same as the `message` that the [fail](event:fail) event binds. When a request fails after an earlier one worked, the cell keeps the earlier answer as its value, so a document can go on showing the last good number next to the message. See also [status](fn:status), [Fetch cells and events](/events/fetch/).
:::
