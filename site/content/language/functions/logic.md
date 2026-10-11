---
title: Logic functions
nav: Logic
---

The logic functions compare values, combine and choose between them, ask what a value is, and give names to values and functions inside an expression.

::ref functions Logic

What counts as true or false is the same everywhere in the language, and is explained on [What counts as true](/language/truth/). The examples that read cells use this document: a number that is filled in, a number left empty, and a text left empty.

```notation id=cells
["col",
  ["input", {"name": "qty", "type": "number", "value": 4}],
  ["input", {"name": "blank", "type": "number"}],
  ["input", {"name": "note", "type": "text"}],
  ["formula", {"name": "tax"}, ["fn", ["x"], ["*", "$x", 0.2]]]]
```

## Comparing

`=` and `!=` ask whether two values are the same. `<`, `<=`, `>` and `>=` ask which comes first. All of them give `true` or `false`.

::: fn =
True when its arguments are all the same as the first. Numbers equal text that spells them. Text must match exactly, capitals included. Lists and records are the same when they hold the same things. Nothing is the same only as nothing.

```sx
(= 1 1)
⇒ true
(= 1 "1")
⇒ true
(= "a" "A")
⇒ false
(= (list 1 2) (list 1 2))
⇒ true
(= {a 1} {a 1})
⇒ true
(= "a" "a" "a")
⇒ true
(= 1 1 2)
⇒ false
```

An empty cell is not 0, and an empty text is not nothing, so ask the right question for the cell you have:

```sx in=cells
(= blank 0)
⇒ false
(= blank nil)
⇒ true
(= note "")
⇒ true
(empty? blank)
⇒ true
```

`true` is not 1: `(= true 1)` is `false`. See also [empty?](fn:empty?), which is the safest way to ask whether something was filled in.
:::

::: fn !=
True when its two arguments are not the same, by the rules of [=](fn:=). Only the first two arguments are compared.

```sx
(!= 1 2)
⇒ true
(!= "1" 1)
⇒ false
(!= nil nil)
⇒ false
```

Often used as a condition: a button hides itself with `(!= status "open")`.
:::

::: fn <
True when the first argument comes before the second.

Numbers compare by size. Two pieces of text that both look like numbers compare as numbers, so `"9"` comes before `"10"`. Other text compares in alphabetical order, with capital letters before lower-case ones. Dates written like `"2026-10-11"` therefore compare correctly. Nothing comes before everything else. A number against text that isn't a number is an error.

```sx
(< 1 2)
⇒ true
(< "9" "10")
⇒ true
(< "apple" "banana")
⇒ true
(< "Zebra" "apple")
⇒ true
(< "2026-10-11" "2026-10-12")
⇒ true
(< nil 1)
⇒ true
(< "a" 1)
⇒ error: expected a number, got "a"
```

The same rules hold for [<=](fn:<=), [>](fn:>) and [>=](fn:>=).
:::

::: fn <=
True when the first argument comes before the second or is equal to it. See [<](fn:<) for how values compare.

```sx
(<= 2 2)
⇒ true
(<= 3 2)
⇒ false
(<= nil nil)
⇒ true
```

A button can hide when there is nothing left to remove: `(<= (len lines) 1)`.
:::

::: fn >
True when the first argument comes after the second. See [<](fn:<) for how values compare.

```sx
(> 3 2)
⇒ true
(> "2026-10-12" "2026-10-11")
⇒ true
(> nil 0)
⇒ false
```

An empty cell is never greater than anything, so `(> blank 0)` is `false`.
:::

::: fn >=
True when the first argument comes after the second or is equal to it. See [<](fn:<) for how values compare.

```sx
(>= 2 3)
⇒ false
(>= 3 3)
⇒ true
(>= 100 "100")
⇒ true
```
:::

## Combining

::: fn and
Gives the first argument that is false, or the last argument if none is. It stops there, so arguments after the deciding one are never worked out. With no arguments, `true`.

```sx
(and 1 2 3)
⇒ 3
(and 1 0 3)
⇒ 0
(and (> 3 2) "ok")
⇒ "ok"
(and "" (/ 1 0))
⇒ ""
```

The last line does not divide by zero, because `""` is already false. Use `and` for "all of these": `(and agree (> qty 0))` as the condition of a button.
:::

::: fn or
Gives the first argument that is true, or the last argument if none is. It stops there. With no arguments, `false`.

```sx
(or 0 "" "Ada")
⇒ "Ada"
(or nil false)
⇒ false
(or 5 (/ 1 0))
⇒ 5
```

For a value that may be missing, [default](fn:default) is usually what you mean: it keeps 0 and `false`, which `or` skips.
:::

::: fn not
`true` when its argument counts as false, `false` otherwise.

```sx
(not true)
⇒ false
(not 0)
⇒ true
(not "no")
⇒ false
(not (list))
⇒ true
```

`"no"` is text with something in it, so it is true, and `not` of it is `false`.
:::

## Choosing

::: fn if
`(if test then else)`: gives `then` when the test is true and `else` when it is false. Only the chosen one is worked out. Leave out `else` and a false test gives nothing.

```sx
(if (> 3 2) "big" "small")
⇒ "big"
(if 0 "yes" "no")
⇒ "no"
(if nil "yes")
⇒ nil
(if false (/ 1 0) "safe")
⇒ "safe"
```

For more than two ways, use [cond](fn:cond). In an action, [when](fn:when) runs several things at once.
:::

::: fn cond
Works down pairs of a test and a value, and gives the value of the first test that is true. A lone last argument is the fallback when no test holds. With no fallback and no true test, nothing.

```sx
(cond (< 5 3) "low" (< 5 10) "mid" "high")
⇒ "mid"
(cond (> 5 10) "high" "not high")
⇒ "not high"
(cond (= 1 2) "a" (= 1 3) "b")
⇒ nil
```

A table of bands reads better with `cond` than with `if` inside `if`: `(cond (< score 50) "fail" (< score 80) "pass" "distinction")`.
:::

::: fn when
`(when test body…)`: when the test is true, works out each body in order and gives the last one; otherwise gives nothing. It is [if](fn:if) with no else and room for several steps, which is what an action often needs.

```sx
(when true "a" "b")
⇒ "b"
(when false "a")
⇒ nil
(when 1 1 2 3)
⇒ 3
```

In a button: `(when agree (insert! "orders" {qty qty}) (show! thanks))` saves a record and shows a message, only when the box is ticked.
:::

::: fn default
Gives the first argument that is neither nothing nor empty text. If there isn't one, nothing. Also written `coalesce`. Unlike [or](fn:or), it counts 0 and `false` as values.

```sx
(default nil "x")
⇒ "x"
(default "" "x")
⇒ "x"
(default nil "" 7)
⇒ 7
(default 0 5)
⇒ 0
(default false 3)
⇒ false
```

Use it for a stand-in: a cell that may be empty, shown with something else.

```sx in=cells
(default blank 10)
⇒ 10
(default qty 10)
⇒ 4
```

In a text, `Hello {{(default client "friend")}}`.
:::

## Asking

::: fn empty?
`true` when a value counts as false: nothing, `""`, 0, `false` or an empty list. It gives the same answer as [not](fn:not) and reads better when you mean "was this filled in".

```sx
(empty? "")
⇒ true
(empty? 0)
⇒ true
(empty? (list))
⇒ true
(empty? "0")
⇒ false
(empty? (list nil))
⇒ false
```

Text with anything in it, even a space, is not empty. A list with an item is not empty, even if the item is nothing. A record is never empty.
:::

::: fn type
Says what kind of value it is given, as text: `"number"`, `"string"`, `"boolean"`, `"list"`, `"record"`, `"fn"` or `"nil"`.

```sx
(type 1)
⇒ "number"
(type "a")
⇒ "string"
(type true)
⇒ "boolean"
(type (list 1))
⇒ "list"
(type {a 1})
⇒ "record"
(type (fn (x) x))
⇒ "fn"
(type nil)
⇒ "nil"
```

Text that looks like a number is still `"string"`: `(type "2")`. Convert it with [num](fn:num) when you need to.
:::

## Names and functions

::: fn let
`(let (name value …) body…)`: gives names to values for the length of the body, and gives the last body. Names are bound in order, so a later value can use an earlier name.

```sx
(let (x 2 y 3) (* x y))
⇒ 6
(let (a 2 b (* a 10)) (+ a b))
⇒ 22
(let (x 1) (let (x 2) x))
⇒ 2
```

Use it to name a part you use twice, or to make a long expression readable:

```sx
(let (price 40 qty 3 subtotal (* price qty))
  (+ subtotal (* subtotal 0.2)))
⇒ 144
```

A name from `let` hides a cell with the same name inside the body, and nowhere else:

```sx in=cells
(let (qty 10) (* qty 2))
⇒ 20
qty
⇒ 4
```

The names and values must pair up: `(let (x 1 y) …)` fails with `let needs pairs: (let (x 1 y 2) …)`.
:::

::: fn fn
`(fn (parameters…) body…)`: makes a function. When it is called, each parameter is the matching argument, or nothing if there isn't one, and the result is the last body.

```sx
((fn (x) (* x 2)) 4)
⇒ 8
((fn (a b) (+ a (default b 10))) 1)
⇒ 11
```

A function is a value. Name it with [let](fn:let) and call it by that name, or hand it to a function that wants one:

```sx
(let (double (fn (x) (* x 2)))
  (double 21))
⇒ 42
(map (fn (x) (* x x)) (list 1 2 3))
⇒ (list 1 4 9)
```

A function sees the names around where it was written:

```sx
(let (rate 10)
  (map (fn (x) (+ x rate)) (list 1 2)))
⇒ (list 11 12)
```

A [formula](kind:formula) cell can hold a function, and then you call it by the cell's name. The cell `tax` in the document above holds `(fn (x) (* x 0.2))`:

```sx in=cells
(tax 50)
⇒ 10
```

[map](fn:map), [filter](fn:filter) and the others also take a plain expression over `it` in place of a function. [reduce](fn:reduce) calls its function with the total so far, the item and its place; the others with the item and its place.
:::

::: fn quote
Gives its argument as it is, without working it out. This is how a list that looks like a call stays a list, and how text that begins with `$` stays text.

```sx
(quote (+ 1 2))
⇒ (list "+" 1 2)
(quote (1 2 3))
⇒ (list 1 2 3)
```

You rarely write `quote` yourself. The reader adds it where it is needed: `"$5"` is stored as `["quote", "$5"]`, so a price in dollars is text and not a cell.

```sx
"$5"
⇒ "$5"
(str "Cost: " "$5")
⇒ "Cost: $5"
```

See [How an expression is stored](/language/#how-an-expression-is-stored).
:::
