---
title: The language
---

The language is the small set of rules edgy uses to write formulas, actions, conditions, styles and text templates: one notation for everything that is worked out or done in a document.

## Try it

```live id=quote title="Two inputs and a formula" height=190
["col",
  ["row", {"size": "hug"},
    ["input", {"name": "qty", "type": "number", "label": "Quantity", "value": 3}],
    ["input", {"name": "price", "type": "number", "label": "Unit price", "value": 40}]],
  ["formula", {"name": "total", "format": "currency"}, ["*", "$qty", "$price"]],
  ["text", "{{qty}} at {{price | currency}} is **{{total | currency}}**"]]
```

Change a number and the total follows. The formula holds one expression, `(* qty price)`: multiply what the cell named `qty` holds by what the cell named `price` holds. The text below it holds three more, each between double braces.

You can run expressions against this document. Each line is one expression, and the `⇒` line is what edgy gives:

```sx in=quote
(* qty price)
⇒ 120
(set! qty 5)
total
⇒ 200
(str "Total: " (fmt total "currency"))
⇒ "Total: $200.00"
```

The second expression is an [action](term:action): it changes `qty`, the way a button would, and the lines after it see the change.

## Calls

A list in parentheses is a call. The first item is the function; the others are what it works on:

```sx
(+ 1 2)
⇒ 3
(upper "ada")
⇒ "ADA"
(* 4 (+ 1 2))
⇒ 12
```

Calls nest, and the innermost is worked out first: `(+ 1 2)` gives 3, then `(* 4 3)` gives 12. Spaces, line breaks and commas all separate items, so `(+ 1, 2, 3)` is `(+ 1 2 3)`. A `;` starts a comment that runs to the end of the line.

```sx
(+ 1, 2, 3) ; commas count as spaces
⇒ 6
```

Every function has an entry on a page of its group: [Math](/language/functions/math/), [Logic](/language/functions/logic/), [Lists](/language/functions/lists/), [Records](/language/functions/records/), [Text](/language/functions/text/), [Dates](/language/functions/dates/), [Cells](/language/functions/cells/) and [Actions](/language/functions/actions/). The [function list](/language/functions/) has them all, A to Z.

## Names read cells

A word that is not the first item of a list is a name. It stands for the value of the cell with that name:

```sx in=quote
qty
⇒ 3
(+ qty 1)
⇒ 4
```

You name a cell in **Cell details**; the rules, and what happens when you rename one, are on [Names and references](/language/names/).

## Values

Every expression gives a value. These are the kinds there are:

| Kind | Written | Notes |
| --- | --- | --- |
| Number | `42`, `-3.5`, `.5`, `1e3` | |
| Text | `"Ada"` | `\n` is a new line, `\t` a tab; `\"` is a quote mark. |
| Yes or no | `true`, `false` | |
| Nothing | `nil` | `null` reads the same. An empty cell gives nothing. |
| List | `(list 1 2 3)` | Items can be any value, lists included. |
| Record | `{client "Ada" total 1840}` | Pairs of a key and a value. |
| Function | `(fn (x) (* x 2))` | Made by [fn](fn:fn). |

Text is always in double quotes; without them a word is a name. Text that looks like a number still works as one in arithmetic: `(+ 1 "2")` is 3.

```sx
(len "a\nb")
⇒ 3
(list 1 "two" true nil (list 3))
⇒ (list 1 "two" true nil (list 3))
```

### Lists are not written as bare parentheses

`(1 2 3)` is a call whose function is `1`, so it fails. Use [list](fn:list) for plain data:

```sx
(1 2 3)
⇒ error: a list must start with a function
(list 1 2 3)
⇒ (list 1 2 3)
```

### Records

A record is written in braces, as pairs: a key, then a value. The keys are words, or text when they hold spaces. The values are expressions, worked out when the record is made:

```sx
{a (+ 1 2) b "x"}
⇒ {a 3 b "x"}
(get {client "Ada" total 1840} "total")
⇒ 1840
```

Records are what a [collection](term:collection) saves and what a [table](kind:table) shows. The [Records](/language/functions/records/) page has the functions that read and build them.

## Functions are values too

[fn](fn:fn) makes a function and [let](fn:let) gives a value a name for the rest of an expression:

```sx
(let (double (fn (x) (* x 2)))
  (map double (list 1 2 3)))
⇒ (list 2 4 6)
```

Where a function is expected, as in [map](fn:map) and [filter](fn:filter), you can also write an expression over `it`, the item, and `i`, its position:

```sx
(map (* it 2) (list 1 2 3))
⇒ (list 2 4 6)
```

A formula cell can hold a function; call it by the cell's name. A document can also define [custom actions](/events/custom/) and call them like built-in functions.

## How an expression is stored

An expression is stored as JSON, so documents, ops and agents all carry it the same way, and shown as the parentheses above. The two spellings convert exactly:

| You read and type | Stored |
| --- | --- |
| `(* qty price)` | `["*", "$qty", "$price"]` |
| `"Ada"` | `"Ada"` |
| `"$5"` | `["quote", "$5"]` |
| `{total (* qty price)}` | `{"total": ["*", "$qty", "$price"]}` |
| `true`, `nil` | `true`, `null` |
| `(fn (x) (* x 2))` | `["fn", ["x"], ["*", "$x", 2]]` |
| `(let (x 1) x)` | `["let", ["x", 1], "$x"]` |
| `(set! count (+ count 1))` | `["set!", "count", ["+", "$count", 1]]` |

Three rules cover it:

- A JSON list is a call.
- A JSON string that starts with `$` is a name.
- Any other JSON value is itself.

Two things follow. Text that starts with a dollar sign is stored as `["quote", "$5"]` so it is not read as a name; [quote](fn:quote) is what keeps it as text. And the functions that take a cell as their first argument ([set!](fn:set!), [toggle!](fn:toggle!), [ref](fn:ref) and the like) store it without the `$`, because they name the cell instead of reading its value; so do the parameters of `fn` and `let`.

A formula in [notation](/agents/notation/) carries its expression like this:

```notation
["formula", {"name": "total", "format": "currency"}, ["*", "$qty", "$price"]]
```

The editor reads what you type into the stored form, and prints the stored form back as parentheses, wrapped to fit. **Activity** shows changes the same way. An empty field reads as nothing. Two expressions in one field are an error, `expected one expression; wrap several in (do …)`: join actions with [do](fn:do).

## Where expressions appear

| Where | What the expression is |
| --- | --- |
| A [formula](kind:formula), [chart](kind:chart), [stat](kind:stat), [calendar](kind:calendar), [table](kind:table) or [list](kind:list) | The value the cell shows. `(* qty price)` |
| A [button](kind:button)'s **What it does**, and a table's row actions | An action, run when someone presses it. `(set! qty 0)` |
| A handler: what a cell or the document does when an [event](/events/) reaches it | An action, run in Live. |
| **Show only when → Hide it when** | A condition: the cell is hidden while it is true. `(= total 0)` |
| A style value, such as `fg` | A value used instead of a fixed one. `(if (< balance 0) "bad" "ink")` |
| An input's `options`, `min`, `max`, `step`; a stat's `compare` and `trend` | The value the prop takes. |
| Text between `{{` and `}}` | A value shown inside the words around it. See [Text templates](/language/templates/). |

Values, conditions and styles are worked out all the time and may not change anything. An action such as [set!](fn:set!) belongs only where an action is expected; in a formula it shows `set! only works in an action, such as a button`. Actions run when something happens, never while a value is being worked out.

::shot formula-bar "The formula bar shows the selected cell's expression with its colours."

The formula bar, the **What it does** field and the [code studio](/editor/code-studio/) all colour what you type, suggest functions and cells as you go, and underline mistakes once you pause.

## Formulas follow what they read

After every change edgy works out every cell again. A formula that reads another cell waits for it, so the order follows the reads, not the page. Nothing in the document needs to say what depends on what.

::diagram eval-graph

A cell that reads itself, directly or through others, has no order. It shows `circular reference: …` with the cells in the loop. [Errors](/language/errors/) lists everything a cell can show.

## Limits

A single expression stops with an error if it takes more than 400,000 steps (`this takes too long to compute`), nests more than 300 calls deep (`this nests too deeply`), or builds a list of more than 20,000 items with [range](fn:range) (`range is too long`).

## Where to next

- [What counts as true](/language/truth/) and how empty cells behave.
- [Names and references](/language/names/): naming cells and reading them by place.
- [Text templates](/language/templates/) and [formats](/language/formats/): numbers, money and dates in words.
- [Errors](/language/errors/): what each message means.
- [Functions](/language/functions/): every function, in groups.
