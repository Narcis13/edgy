---
title: What counts as true
nav: Truth
---

This page explains what edgy counts as true and false in a condition, how [if](fn:if), [and](fn:and), [or](fn:or) and [not](fn:not) use that, and what an empty cell is worth in arithmetic.

## False is a short list

Anywhere a condition is expected (a [hidden](/language/#where-expressions-appear) rule, the test of [if](fn:if), an argument of [and](fn:and)), five values count as false:

| Value | Written |
| --- | --- |
| No | `false` |
| Nothing | `nil` |
| Zero | `0` |
| Empty text | `""` |
| An empty list | `(list)` |

Everything else counts as true. That includes values that look empty or negative at a glance:

```sx
(if "0" "true" "false")
⇒ "true"
(if "no" "true" "false")
⇒ "true"
(if -1 "true" "false")
⇒ "true"
(if (list 0) "true" "false")
⇒ "true"
(if {} "true" "false")
⇒ "true"
```

Text is true when it has anything in it, even `"0"` or `"no"`; a list is true when it has any item, even `0`; a record is always true, even an empty one. To ask a different question, compare: `(= x "no")`.

The five false values:

```sx
(if false "true" "false")
⇒ "false"
(if nil "true" "false")
⇒ "false"
(if 0 "true" "false")
⇒ "false"
(if "" "true" "false")
⇒ "false"
(if (list) "true" "false")
⇒ "false"
```

This is why the cells people fill in work as conditions directly. A text [input](kind:input) is `""` until someone types, and a checkbox is `false` until ticked:

```notation id=form
["col",
  ["input", {"name": "note", "type": "text"}],
  ["input", {"name": "agree", "type": "checkbox"}],
  ["input", {"name": "a", "type": "number", "value": 4}],
  ["input", {"name": "b", "type": "number"}]]
```

```sx in=form
(if note "has a note" "no note")
⇒ "no note"
(if agree "agreed" "not yet")
⇒ "not yet"
```

## Choosing: if, cond and when

[if](fn:if) takes a test, a value for true and a value for false. Only the branch that is chosen is worked out, so the other may even fail:

```sx
(if (> 3 2) "big" "small")
⇒ "big"
(if false (/ 1 0) "safe")
⇒ "safe"
```

Leave out the last value and a false test gives nothing. [cond](fn:cond) walks through test and value pairs and takes the first test that holds, with an optional last value for when none does. [when](fn:when) is `if` for actions: it runs everything inside it when the test holds. Their entries are on the [Logic](/language/functions/logic/) page.

## and, or and not

[not](fn:not) turns a value into `true` or `false`, the opposite of how it counts:

```sx
(not 0)
⇒ true
(not "x")
⇒ false
```

[and](fn:and) and [or](fn:or) do not always give `true` or `false`. They give one of the values they were given, and stop as soon as they know: `and` gives the first false value, or the last value if all are true; `or` gives the first true value, or the last value if none is.

```sx
(and 1 2 3)
⇒ 3
(and 1 0 3)
⇒ 0
(or "" nil "Ada")
⇒ "Ada"
(or 0 "")
⇒ ""
```

Because they stop early, the values after the deciding one are never worked out. `(and (> n 0) (/ 100 n))` does not divide by zero when `n` is 0.

```sx in=form
(and a (/ 100 a))
⇒ 25
(and b (/ 100 b))
⇒ nil
```

## Choosing a fallback: default

[default](fn:default) gives the first value that is neither nothing nor `""`. It is not the same test as `or`: 0 and `false` are real values to `default`, but false to `or`.

```sx
(default "" "unknown")
⇒ "unknown"
(default 0 5)
⇒ 0
(or 0 5)
⇒ 5
```

Use `default` for a value that may not have been filled in, and `or` when you mean "anything true". In text, `{{(default client "your client")}}` shows a name or a stand-in.

## Is it empty: empty?

[empty?](fn:empty?) is true exactly when the value counts as false, so `(empty? x)` and `(not x)` are the same test. It reads better for cells:

```sx in=form
(empty? note)
⇒ true
(empty? b)
⇒ true
(empty? a)
⇒ false
```

## Empty cells count as 0 in arithmetic

In arithmetic, nothing and `""` are 0, and `true` and `false` are 1 and 0. A number input that nobody filled in does not break a total:

```sx in=form
(+ a b)
⇒ 4
(* a b)
⇒ 0
```

`b` is still nothing, not 0. Comparisons see the difference: `=` asks whether two values are the same, and nothing is not the same as 0. The ordering operators put nothing before every number.

```sx in=form
b
⇒ nil
(= b 0)
⇒ false
(< b 1)
⇒ true
(> b 0)
⇒ false
```

To treat an empty cell as 0 in a comparison, ask for it by name: `(or b 0)` or `(default b 0)` gives 0 when `b` is empty. To ask whether it was filled in, use `(empty? b)`.

Text that looks like a number is a number in arithmetic: `(+ 1 "2")` is 3. Text that doesn't is an error, not 0: `(+ 1 "abc")` shows `expected a number, got "abc"`. The functions [sum](fn:sum), [avg](fn:avg), [min](fn:min) and [max](fn:max) are the exception: they skip text that isn't a number. See [Math](/language/functions/math/).

## See also

- [Logic functions](/language/functions/logic/): comparisons, `if`, `cond`, `let`, `fn`.
- [Errors](/language/errors/): the messages a wrong comparison or sum can give.
