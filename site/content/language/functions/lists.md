---
title: Lists
---

The list functions make lists, measure and cut them, go through them item by item, put them in order and combine them.

::ref functions Lists

A list is an ordered run of [values](term:value): `(list 1 2 3)`, the rows a [table](kind:table) shows, the records [rows](fn:rows) gives, or a named [row](kind:row) or [col](kind:col), which reads as the list of its cells' values. Records are written with `{ }`; see [Records](/language/functions/records/).

No function on this page changes the list you give it. Each one gives a new value, so `(reverse xs)` leaves `xs` as it was.

## Lists and things that are not lists

Every list function accepts a value that is not a list:

- Nothing (`nil`) counts as an empty list: `(map (* it 2) nil)` is `(list)`.
- Any other single value counts as a list of one item: `(map (* it 2) 5)` is `(list 10)`, and `(first "Ada")` is `"Ada"`, not `"A"`.

```sx
(map (* it 2) nil)
⇒ (list)
(map (* it 2) 5)
⇒ (list 10)
(first "Ada")
⇒ "Ada"
```

Three functions look inside a single value instead: [len](fn:len) counts the characters of text and the fields of a record, [includes?](fn:includes?) looks for text inside text, and [join](fn:join) turns items into text.

## Expressions over it, i and acc

Nine functions take an expression as their first argument and work it out once for each item: [map](fn:map), [filter](fn:filter), [find](fn:find), [some](fn:some), [every](fn:every), [count-if](fn:count-if), [sum-by](fn:sum-by), [sort-by](fn:sort-by) and [reduce](fn:reduce). While the expression runs, two names are set for you:

| Name | Holds |
| --- | --- |
| `it` | the item being worked on |
| `i` | its place in the list, counting from 0 |
| `acc` | only in `reduce`: what has been collected so far |

```sx
(map (* it 2) (list 5 6 7))
⇒ (list 10 12 14)
(map (+ it i) (list 10 10 10))
⇒ (list 10 11 12)
(reduce (+ acc it) 0 (list 5 6 7))
⇒ 18
```

The list comes second, after the expression: `(map expression list)`. Functions that don't work an expression per item put the list first: `(nth xs 0)`, `(sort xs)`.

You can also pass a function you write with [fn](fn:fn) instead of an expression. It receives the item, then the index; for `reduce` it receives what has been collected, the item, then the index. You choose the names:

```sx
(map (fn (x n) (+ x n)) (list 10 10 10))
⇒ (list 10 11 12)
(reduce (fn (total x) (+ total x)) 0 (list 5 6 7))
⇒ 18
```

A [formula](kind:formula) cell can hold a function, and then you pass the cell's name:

```notation id=double
["col",
  ["formula", {"name": "double"}, ["fn", ["x"], ["*", "$x", 2]]],
  ["input", {"name": "qty", "type": "number", "value": 3}]]
```

```sx in=double
(map double (list 1 2 3))
⇒ (list 2 4 6)
```

Two things to know:

- **The expression has to be a call.** A bare word is not worked out per item: `(map it xs)` fails with `no cell called "it"`, and `(map qty xs)` gives the value of the cell `qty` once for every item. Write `(map (+ it 0) xs)` or a [fn](fn:fn).
- **Inside another expression over `it`, `it` means the inner item.** To keep the outer one, name it first with [let](fn:let):

```sx
(map (let (line it) (sum-by (* line it) (list 1 2))) (list 10 20))
⇒ (list 30 60)
```

An expression that is true or false is judged by [what counts as true](/language/truth/): `0`, `""`, `nil` and an empty list are false.

## Making lists

::: fn list
Makes a list of its arguments, in order.

```sx
(list 1 2 3)
⇒ (list 1 2 3)
(list "Ada" (list "Bo" "Cy"))
⇒ (list "Ada" (list "Bo" "Cy"))
(list)
⇒ (list)
```

Each argument is an expression, so `(list qty (* qty price))` holds two values worked out from cells. A list is data, not a call: `(1 2 3)` is an error, because a list that starts with something other than a function has nothing to run.

```sx
(1 2 3)
⇒ error: a list must start with a function
```

See also [range](fn:range), [concat](fn:concat).
:::

::: fn range
Makes a list of numbers. `(range end)` counts from 0; `(range start end)` from `start`; `(range start end step)` in steps of `step`. The end itself is left out.

```sx
(range 4)
⇒ (list 0 1 2 3)
(range 1 13)
⇒ (list 1 2 3 4 5 6 7 8 9 10 11 12)
(range 10 0 -3)
⇒ (list 10 7 4 1)
(range 0 1 0.25)
⇒ (list 0 0.25 0.5 0.75)
```

- A step that points away from the end gives an empty list: `(range 5 1)` is `(list)`.
- A step of `0` is an error, `range step cannot be 0`.
- A range longer than 20,000 numbers is an error, `range is too long`.
- With a decimal step, rounding can let the last number reach the end: `(range 0 1 0.1)` ends with `1`.

Use it to number things: `(map (* it 10) (range 1 6))`. See also [map](fn:map).
:::

## Size and pieces

::: fn len
How long a value is: the items of a list, the characters of a text, the fields of a record. Nothing has length 0.

```sx
(len (list 4 5 6))
⇒ 3
(len "Ada")
⇒ 3
(len {name "Ada" city "London"})
⇒ 2
(len nil)
⇒ 0
```

Any other single value counts as one item. `length` is another spelling of the same function. See also [count](fn:count).
:::

::: fn count
How many items a list has.

```sx
(count (list 4 5 6))
⇒ 3
(count nil)
⇒ 0
```

`count` treats text and records as a single item, so `(count "Ada")` is `1`; use [len](fn:len) to count characters or fields. To count the items that pass a test, use [count-if](fn:count-if).
:::

::: fn nth
The item at a place in the list. Places start at 0. A place the list doesn't have gives nothing.

```sx
(nth (list "a" "b" "c") 0)
⇒ "a"
(nth (list "a" "b" "c") 2)
⇒ "c"
(nth (list "a" "b" "c") 3)
⇒ nil
```

Unlike [child](fn:child) and [sib](fn:sib), a negative place does not count from the end: `(nth xs -1)` is `nil`. Use [last](fn:last) for the end. [get](fn:get) also reads a place, and lets you name what to give when there is none: `(get xs 5 "none")`.
:::

::: fn first
The first item, or nothing for an empty list.

```sx
(first (list "a" "b" "c"))
⇒ "a"
(first (list))
⇒ nil
```

See also [last](fn:last), [rest](fn:rest), [nth](fn:nth).
:::

::: fn last
The last item, or nothing for an empty list.

```sx
(last (list "a" "b" "c"))
⇒ "c"
(last (list))
⇒ nil
```

See also [first](fn:first), [nth](fn:nth).
:::

::: fn rest
Everything but the first item.

```sx
(rest (list "a" "b" "c"))
⇒ (list "b" "c")
(rest (list "a"))
⇒ (list)
(rest (list))
⇒ (list)
```

See also [first](fn:first), [drop](fn:drop).
:::

::: fn take
The first few items. Give the count and the list, in either order.

```sx
(take 2 (list "a" "b" "c"))
⇒ (list "a" "b")
(take (list "a" "b" "c") 2)
⇒ (list "a" "b")
(take 10 (list "a" "b" "c"))
⇒ (list "a" "b" "c")
```

Asking for more items than the list has gives the whole list. To take the best few, put the list in order first: `(take 3 (sort-by (get it "total") rows "desc"))`. See also [drop](fn:drop), [sort-by](fn:sort-by).
:::

::: fn drop
All but the first few items. Give the count and the list, in either order.

```sx
(drop 1 (list "a" "b" "c"))
⇒ (list "b" "c")
(drop (list "a" "b" "c") 2)
⇒ (list "c")
(drop 5 (list "a" "b" "c"))
⇒ (list)
```

See also [take](fn:take), [rest](fn:rest).
:::

## Going through a list

::: fn map
Works an expression out for every item and gives the results as a new list, in the same order. The list has as many items as before.

```sx
(map (* it 2) (list 1 2 3))
⇒ (list 2 4 6)
(map (get it "name") (list {name "Ada"} {name "Bo"}))
⇒ (list "Ada" "Bo")
(map (* (get it "qty") (get it "price")) (list {qty 2 price 40} {qty 1 price 15}))
⇒ (list 80 15)
```

Arguments: `(map expression list)`; the expression sees `it` and `i`, as [explained above](#expressions-over-it-i-and-acc). To keep only some items, use [filter](fn:filter); to reduce the list to one value, use [reduce](fn:reduce) or [sum-by](fn:sum-by). To take one field of every record, [column](fn:column) is shorter.
:::

::: fn filter
Keeps the items for which an expression is true, in their order.

```sx
(filter (> it 1) (list 1 2 3))
⇒ (list 2 3)
(filter (= (% i 2) 0) (list "a" "b" "c" "d"))
⇒ (list "a" "c")
(filter (get it "done") (list {task "Book" done true} {task "Pack" done false}))
⇒ (list {task "Book" done true})
```

Arguments: `(filter expression list)`. "True" follows [the usual rules](/language/truth/), so `0`, `""`, `nil` and an empty list drop an item. To keep the items whose field has a given value, [where](fn:where) is shorter. See also [find](fn:find), [count-if](fn:count-if).
:::

::: fn find
The first item for which an expression is true, or nothing when none is.

```sx
(find (> it 1) (list 1 2 3))
⇒ 2
(find (> it 5) (list 1 2 3))
⇒ nil
(find (= (get it "name") "Bo") (list {name "Ada" city "London"} {name "Bo" city "Oslo"}))
⇒ {name "Bo" city "Oslo"}
```

Arguments: `(find expression list)`. The item itself comes back, so an item that is `0` or `""` is found like any other. Only a `nil` item looks the same as "not found"; to ask whether anything passes, use [some](fn:some). See also [filter](fn:filter), [first](fn:first).
:::

::: fn some
True when an expression is true for at least one item. An empty list gives `false`.

```sx
(some (> it 2) (list 1 2 3))
⇒ true
(some (> it 5) (list 1 2 3))
⇒ false
(some (> it 5) (list))
⇒ false
```

Arguments: `(some expression list)`. It stops looking at the first item that passes. See also [every](fn:every), [includes?](fn:includes?).
:::

::: fn every
True when an expression is true for every item. An empty list gives `true`, because no item fails.

```sx
(every (> it 0) (list 1 2 3))
⇒ true
(every (> it 1) (list 1 2 3))
⇒ false
(every (> it 1) (list))
⇒ true
```

Arguments: `(every expression list)`. A checklist's `value` is a list of `{text done}` records, so `(every (get it "done") todo)` tells whether everything is ticked. See also [some](fn:some), [count-if](fn:count-if).
:::

::: fn count-if
How many items an expression is true for.

```sx
(count-if (> it 1) (list 1 2 3))
⇒ 2
(count-if (get it "done") (list {done true} {done false} {done true}))
⇒ 2
(count-if (> it 1) nil)
⇒ 0
```

Arguments: `(count-if expression list)`. It gives the same number as `(len (filter expression list))` without building the shorter list. See also [count](fn:count), [sum-by](fn:sum-by).
:::

::: fn sum-by
Adds up an expression over every item. Text that looks like a number is read as one, and nothing counts as 0.

```sx
(sum-by (get it "total") (list {total 120} {total 80.5}))
⇒ 200.5
(sum-by (* (get it "qty") (get it "price")) (list {qty 2 price 40} {qty 1 price 15}))
⇒ 95
(sum-by (get it "total") (list {total "3"} {total nil} {total 2}))
⇒ 5
(sum-by (get it "total") (list))
⇒ 0
```

Arguments: `(sum-by expression list)`. Text that is not a number is an error, `expected a number, got "x"`; [sum](fn:sum), which skips text, is the one to use when a list may hold labels among its numbers. See also [map](fn:map), [reduce](fn:reduce).
:::

::: fn reduce
Folds a list into one value. Give the expression, the value to start from, then the list. For each item the expression is worked out with `acc` (what has been collected so far) and `it` (the item), and its result becomes the new `acc`.

```sx
(reduce (+ acc it) 0 (list 1 2 3))
⇒ 6
(reduce (str acc it) "" (list "a" "b" "c"))
⇒ "abc"
(reduce (if (> it acc) it acc) 0 (list 3 9 4))
⇒ 9
(reduce (+ acc i) 0 (list 5 5 5))
⇒ 3
```

Arguments: `(reduce expression start list)`. The last example adds up the places `i` (0, 1 and 2).

Mind the order: with the start value left out, `(reduce (+ acc it) xs)` reads `xs` as the start and finds no list, so it gives `xs` back unchanged and raises no error.

```sx
(reduce (+ acc it) (list 1 2 3))
⇒ (list 1 2 3)
```

For plain totals, [sum](fn:sum) and [sum-by](fn:sum-by) are shorter. With a function from [fn](fn:fn), the parameters are the collected value, the item and the place.
:::

## Putting in order

::: fn sort
The items in ascending order. Add `"desc"` as the second argument for descending.

```sx
(sort (list 3 1 2))
⇒ (list 1 2 3)
(sort (list 3 1 2) "desc")
⇒ (list 3 2 1)
(sort (list "pear" "apple" "fig"))
⇒ (list "apple" "fig" "pear")
```

How two items compare:

- Numbers compare as numbers, and so does text that looks like a number: `(sort (list "10" "9" "100"))` is `(list "9" "10" "100")`.
- Other text compares letter by letter, with capital letters before small ones: `(sort (list "b" "B" "a"))` is `(list "B" "a" "b")`.
- Nothing sorts before everything else: `(sort (list 3 nil 1))` is `(list nil 1 3)`.
- A text that is not a number next to a number is an error, `expected a number, got "x"`.

Only the text `"desc"` reverses; any other second argument leaves the order ascending. To order records by a field, use [sort-by](fn:sort-by). See also [reverse](fn:reverse).
:::

::: fn sort-by
Puts the items in order by an expression worked out for each: `(sort-by expression list)`, or `(sort-by expression list "desc")` for the other way round.

```sx
(sort-by (get it "n") (list {n 3} {n 1} {n 2}))
⇒ (list {n 1} {n 2} {n 3})
(sort-by (get it "n") (list {n 3} {n 1} {n 2}) "desc")
⇒ (list {n 3} {n 2} {n 1})
(sort-by (len it) (list "ccc" "a" "bb"))
⇒ (list "a" "bb" "ccc")
```

Values compare as they do in [sort](fn:sort). Items with the same value keep their order; with `"desc"` the whole list is turned round afterwards, so items that tie come out in reverse order. See also [take](fn:take), [group](fn:group).
:::

::: fn reverse
The items in the opposite order.

```sx
(reverse (list 1 2 3))
⇒ (list 3 2 1)
(reverse (list))
⇒ (list)
```

The list you give is not changed. See also [sort](fn:sort).
:::

## Combining and testing

::: fn concat
Joins lists end to end. Arguments that are not lists are added as single items; `nil` adds no item.

```sx
(concat (list 1 2) (list 3))
⇒ (list 1 2 3)
(concat (list 1 2) 3 nil (list 4))
⇒ (list 1 2 3 4)
(concat (list 1) (list (list 2)))
⇒ (list 1 (list 2))
```

Only one level is joined: a list inside a list stays a list. Use [flat](fn:flat) to open those up. See also [list](fn:list).
:::

::: fn flat
Opens up lists inside lists, at every depth, and gives one flat list.

```sx
(flat (list 1 (list 2 (list 3 4))))
⇒ (list 1 2 3 4)
(flat (list 1 (list 2)) (list 3 (list (list 4))))
⇒ (list 1 2 3 4)
```

With several arguments, all of them are flattened into the same list. A named row of rows reads as a list of lists, so `(flat lines)` gives all of their values in one list. See also [concat](fn:concat).
:::

::: fn uniq
Removes repeated items, keeping the first of each.

```sx
(uniq (list 1 2 1 3 2))
⇒ (list 1 2 3)
(uniq (list {a 1} {a 1} {a 2}))
⇒ (list {a 1} {a 2})
(uniq (list 1 "1"))
⇒ (list 1 "1")
```

Items are the same when they have the same value all the way down, so two equal records count as one. Unlike [includes?](fn:includes?), a number and the same number as text are different items here. To count how often each value occurs, use [group](fn:group).
:::

::: fn join
Turns the items into one text, with a separator between them. The separator is `", "` unless you give another.

```sx
(join (list 1 2 3))
⇒ "1, 2, 3"
(join (list "Ada" "Bo" "Cy") " and ")
⇒ "Ada and Bo and Cy"
(join (list "a" "b") "")
⇒ "ab"
```

Items are written the way [str](fn:str) writes them: numbers plainly, with no commas between thousands, a missing item as empty text and `true` as `yes`. To change each item first, [map](fn:map) it: `(join (map (upper it) names) ", ")`. See also [str](fn:str), [split](fn:split).
:::

::: fn includes?
True when a list has an item equal to a value. On text, true when it contains the other text.

```sx
(includes? (list 1 2 3) 2)
⇒ true
(includes? (list "S" "M" "L") "XL")
⇒ false
(includes? "Northwind Studio" "wind")
⇒ true
```

Equality is the same as in [=](fn:=): the number `2` matches the text `"2"`, and records match when all their fields do. `has?` is another spelling. An [accordion](kind:accordion)'s value is the list of open titles, so `(includes? faq "Shipping")` tells whether that section is open. See also [some](fn:some), [uniq](fn:uniq).
:::

## Lists of records

::: fn column
One field of every record, as a list. A record without that field gives nothing in its place.

```sx
(column (list {name "Ada" total 120} {name "Bo" total 80}) "total")
⇒ (list 120 80)
(column (list {a 1} {a 2} {b 3}) "a")
⇒ (list 1 2 nil)
```

When the rows are lists, give a place instead of a field name:

```sx
(column (list (list "Tea" 6) (list "Cable" 12)) 1)
⇒ (list 6 12)
```

An item that is neither a record nor a list gives nothing. `pluck` is another spelling. See also [get](fn:get), [map](fn:map), [sum](fn:sum).
:::

::: fn where
The records whose field equals a value, in their order: `(where rows "field" value)`.

```sx
(where (list {client "Ada" status "paid"} {client "Bo" status "open"} {client "Cy" status "paid"}) "status" "paid")
⇒ (list {client "Ada" status "paid"} {client "Cy" status "paid"})
(where (list {n 1} {n 2}) "n" "2")
⇒ (list {n 2})
```

Equality is loose, as in [=](fn:=): the text `"2"` matches the number `2`. Items that are not records are dropped. With the value left out, `where` finds the records that have no such field, or have it as `nil`. For a test other than equality, use [filter](fn:filter). See also [group](fn:group), [rows](fn:rows).
:::

::: fn group
Groups records by a field. The result has one record for each different value, in the order the values first appear, each written `{key count rows}`: the value, how many records have it, and those records.

```sx
(group (list {client "Ada" status "open"} {client "Bo" status "paid"} {client "Cy" status "open"}) "status")
⇒ (list {key "open" count 2 rows (list {client "Ada" status "open"} {client "Cy" status "open"})} {key "paid" count 1 rows (list {client "Bo" status "paid"})})
```

Read the pieces with [get](fn:get) and [map](fn:map):

```sx
(map (str (get it "key") ": " (get it "count")) (group (list {s "open"} {s "paid"} {s "open"}) "s"))
⇒ (list "open: 2" "paid: 1")
```

Give a place instead of a field name when the rows are lists. Items that are neither records nor lists are grouped by their own value. A [table](kind:table) with a `group` setting does this on screen; the function is for working with the groups. See also [where](fn:where), [uniq](fn:uniq).
:::
