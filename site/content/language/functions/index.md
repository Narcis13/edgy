---
title: Functions
---

This page lists every function in the language, A to Z, and explains how to read the entries on the group pages that describe them.

## Every function

::ref functions

Each name links to its entry. The colour chip names the group, and the group pages are:

- [Math](/language/functions/math/): arithmetic, rounding, totals and loan payments.
- [Logic](/language/functions/logic/): comparisons, choosing, names for values, and functions of your own.
- [Lists](/language/functions/lists/): making, ordering, filtering and totalling lists.
- [Records](/language/functions/records/): reading and building records.
- [Text](/language/functions/text/): joining, changing and formatting text.
- [Dates](/language/functions/dates/): today, differences between dates and parts of a date.
- [Cells](/language/functions/cells/): reading cells, neighbours, collections and fetch cells.
- [Actions](/language/functions/actions/): changing cells, saving records and sending events.

The [code studio](/editor/code-studio/) lists the same functions, in the same colours, and inserts one with its arguments ready to fill in.

## Reading an entry

Every entry on the group pages has the same parts:

1. **The name**, as a heading, and under it **the written form** with the group chip: `(round x 2)`. Words in the written form stand for what you put there. `…` means more of the same may follow.
2. **What it does**, in a sentence or two, and what each argument is.
3. **An example** with its result after `⇒`, then more for the cases that surprise people: empty cells, text that looks like a number, nothing.
4. **See also**, when another function does a nearby job.

The examples on these pages are run every time the docs are built, so the results are what edgy gives. They run on 11 October 2026, 09:00 UTC, which is why `(today)` is `"2026-10-11"` in them.

## Conventions

- **A call is `(name arguments…)`.** The function is the first item. See [The language](/language/).
- **Arguments are worked out first**, innermost call first, except where an entry says otherwise. [if](fn:if), [and](fn:and), [or](fn:or), [cond](fn:cond) and [when](fn:when) only work out the arguments they need, and [map](fn:map) and the other functions that take an expression over `it` work theirs out once per item.
- **Empty cells count as 0** in arithmetic, and as nothing elsewhere. [What counts as true](/language/truth/) has the rules.
- **Text that looks like a number is a number** where a number is needed: `(+ 1 "2")` is 3. Text that doesn't is an error, with a few functions that skip it instead; each entry says which.
- **Results are values.** Anything you see after `⇒` is a value of the language: a number, text, `true`, `false`, `nil`, `(list …)`, a record `{k v}`.
- **A name ending in `!` is an action.** It changes something, so it works only in a button's action or a handler, never in a formula. See [Actions](/language/functions/actions/). A name ending in `?` asks a question and gives `true` or `false`.

## Other spellings

A few functions answer to a second name. The second name works everywhere the first does and is not listed above.

| Also written | Is |
| --- | --- |
| `mod` | [%](fn:%) |
| `pow` | [^](fn:^) |
| `average` | [avg](fn:avg) |
| `coalesce` | [default](fn:default) |
| `length` | [len](fn:len) |
| `has?` | [includes?](fn:includes?) |
| `pluck` | [column](fn:column) |

## Functions of your own

[fn](fn:fn) makes a function and [let](fn:let) names it. A formula cell can hold a function; call it by the cell's name. A document can also define [custom actions](/events/custom/), which are called like the built-in ones. They don't appear in this list, since they belong to a document.
