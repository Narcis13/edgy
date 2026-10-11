---
title: Records
---

The record functions read a record's fields and build new records from old ones or from names worked out as the expression runs.

::ref functions Records

A record is a set of named values, such as `{name "Ada" total 1840}`. The rows of a [table](kind:table), the [records](term:record) in a [collection](term:collection) and the answer of a [fetch](kind:fetch) cell are all lists of records, so you will use these functions together with the [list functions](/language/functions/lists/).

No function here changes the record you give it. [assoc](fn:assoc) and [merge](fn:merge) give a new record.

## Writing a record

Write a record in braces, as pairs of a field name and a value:

```sx
{name "Ada" total (* 2 40)}
⇒ {name "Ada" total 80}
{"first name" "Ada"}
⇒ {"first name" "Ada"}
```

- A field name is a word, or text in quotes when it holds spaces. It is never worked out: in `{total 80}` the name is the text `total`, even if a cell called `total` exists.
- A value is an [expression](term:expression), worked out when the record is made. A bare word there reads a cell, so `{qty qty price price}` makes a record from the cells `qty` and `price`.
- The braces need pairs. `{a 1 b}` is refused with `{ } needs pairs: {key value key value}`.

In stored notation a record is a JSON object whose values are expressions: `{"total": ["*", "$qty", "$price"]}`.

## Reading a record

::: fn get
Reads one field of a record: `(get record "field")`. A third argument is what to give when the field is missing.

```sx
(get {name "Ada" city "London"} "city")
⇒ "London"
(get {name "Ada"} "city")
⇒ nil
(get {name "Ada"} "city" "unknown")
⇒ "unknown"
```

- The fallback is used when the field is missing or `nil`. A field holding `0`, `false` or `""` is a value and is returned: `(get {score 0} "score" 9)` is `0`, while `(get {score nil} "score" 9)` is `9`.
- Given a list, `get` reads a place, counting from 0: `(get (list 10 20 30) 1)` is `20`, and `(get (list 10 20 30) 5 "none")` is `"none"`.
- Given anything else, including nothing, it gives the fallback: `(get nil "a" "none")` is `"none"`. A missing record is no error, so you can read a field of a row that may not exist.
- To reach a field inside a field, read twice: `(get (get order "client") "name")`.

```sx
(get (list 10 20 30) 1)
⇒ 20
(get nil "a" "none")
⇒ "none"
(get (get {client {name "Ada"}} "client") "name")
⇒ "Ada"
```

In a table's row action the record of the row is called `row`, so `(get row "id")` is the id of the record to change; see [update!](fn:update!). On a list of records, [column](fn:column) reads one field of every record. See also [keys](fn:keys), [nth](fn:nth).
:::

::: fn keys
The field names of a record, as a list, in the order the record has them.

```sx
(keys {b 1 a 2})
⇒ (list "b" "a")
(keys {})
⇒ (list)
```

Anything that is not a record, a list included, gives an empty list. See also [vals](fn:vals), [len](fn:len), which counts the fields.
:::

::: fn vals
The values of a record, as a list, in the order of its field names.

```sx
(vals {b 1 a 2})
⇒ (list 1 2)
(sum (vals {rent 900 food 350 fun 120}))
⇒ 1370
```

Anything that is not a record gives an empty list. The second example totals a record whose fields are all numbers. See also [keys](fn:keys), [sum](fn:sum).
:::

## Building a record

::: fn obj
Makes a record from field names and values given as a flat run: `(obj name1 value1 name2 value2 …)`. Use it when a field name is itself worked out; for fixed names the braces are easier to read.

```sx
(obj "a" 1 "b" 2)
⇒ {a 1 b 2}
(let (field "paid") (obj field true))
⇒ {paid true}
(obj)
⇒ {}
```

- A name that is not text is turned into text: `(obj 1 "x")` has the field `"1"`.
- A name with no value after it is left out.

See also [assoc](fn:assoc), [merge](fn:merge).
:::

::: fn assoc
A copy of a record with one field set to a value. The field is added when the record doesn't have it and replaced when it does: `(assoc record "field" value)`.

```sx
(assoc {client "Ada"} "status" "open")
⇒ {client "Ada" status "open"}
(assoc {client "Ada" status "open"} "status" "paid")
⇒ {client "Ada" status "paid"}
(assoc nil "status" "open")
⇒ {status "open"}
```

- Given nothing, `assoc` starts from an empty record.
- With the value left out, the field is set to `nil`.
- To set several fields at once, use [merge](fn:merge).

The original record is not changed. To change a field of a *saved* record, use [update!](fn:update!).
:::

::: fn merge
One record from several. Fields of later records replace fields of earlier ones with the same name.

```sx
(merge {a 1 b 2} {b 3 c 4})
⇒ {a 1 b 3 c 4}
(merge {status "open"} {client "Ada" status "paid"})
⇒ {status "paid" client "Ada"}
(merge)
⇒ {}
```

- Arguments that are not records, such as `nil`, are skipped.
- The merge is shallow: a field that holds a record is replaced as a whole, not merged. `(merge {a {x 1}} {a {y 2}})` is `{a {y 2}}`.

Putting the defaults first and the given record last is a way to fill in fields a record may lack: `(merge {status "open"} row)`. See also [assoc](fn:assoc), [insert!](fn:insert!).
:::
