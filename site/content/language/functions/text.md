---
title: Text functions
nav: Text
---

The text functions join values into words, write numbers and dates in a chosen format, change the case and spacing of text, and cut it up and test it.

::ref functions Text

Text in the language is written in double quotes. A function that wants text turns other values into text first, the way [str](fn:str) does, so `(upper 42)` is `"42"` and `(upper nil)` is `""`. Matching is exact: capitals matter, and nothing here understands patterns.

## Joining and showing

::: fn str
Joins its arguments into one piece of text. Numbers are written plainly, with no commas between thousands. `true` and `false` are written `yes` and `no`, nothing is written as nothing, a list as its items with a comma between, and a record as JSON.

```sx
(str "Hi " "Ada" "!")
⇒ "Hi Ada!"
(str "Total: " 42)
⇒ "Total: 42"
(str 1234.5678)
⇒ "1234.5678"
(str "Is it: " true)
⇒ "Is it: yes"
(str "Items: " (list 1 2 3))
⇒ "Items: 1, 2, 3"
(str)
⇒ ""
```

Numbers touch when you join them with nothing between: `(str 0.1 0.2)` is `"0.10.2"`. Put the words you want between them, as in `(str 0.1 " and " 0.2)`.

For money, percentages and dates, format first: `(str "Total: " (fmt total "currency"))`. Inside a sentence, a [text template](/language/templates/) does the same job with less to type: `Total: {{total | currency}}`.
:::

::: fn fmt
Writes a value in a format: `(fmt value format)`. The result is text. With no format it is how the value shows by default.

```sx
(fmt 1234.5)
⇒ "1,234.5"
(fmt 1234.5 "currency")
⇒ "$1,234.50"
(fmt 0.256 "percent")
⇒ "25.6%"
(fmt "2026-10-11" "date")
⇒ "Oct 11, 2026"
(fmt 5 "0.00")
⇒ "5.00"
```

Every format is on [Formats](/language/formats/): `int`, `number`, `percent`, `compact`, `currency`, `date`, `time`, `datetime`, `ago`, a currency code such as `EUR`, and number patterns such as `0.00`. The `currency` format uses the document's currency. A list is formatted item by item.

The result is text, so it can't be calculated with: format at the end. See also [str](fn:str).
:::

::: fn num
Turns text into a number. Commas and spaces in the text are ignored. Empty text and nothing are 0.

```sx
(num "42")
⇒ 42
(num "1,200.50")
⇒ 1200.5
(num " 7 ")
⇒ 7
(num "")
⇒ 0
(num "abc")
⇒ error: expected a number, got "abc"
```

Most functions that need a number do this themselves, so `(+ 1 "2")` is 3 without `num`. Use it to be explicit, or on a piece cut out of text:

```sx
(num (first (split "2026-10-11" "-")))
⇒ 2026
```

Text that is not a number is an error, not 0.
:::

## Changing text

::: fn upper
Writes text in capital letters.

```sx
(upper "ada lovelace")
⇒ "ADA LOVELACE"
(upper 42)
⇒ "42"
(upper nil)
⇒ ""
```
:::

::: fn lower
Writes text in lower-case letters.

```sx
(lower "Ada LOVELACE")
⇒ "ada lovelace"
```

Use it to compare without caring about capitals: `(= (lower answer) "yes")`.
:::

::: fn trim
Removes spaces, tabs and line breaks from both ends of text. Spaces in the middle stay.

```sx
(trim "  hi  ")
⇒ "hi"
(trim "a  b")
⇒ "a  b"
(trim nil)
⇒ ""
```
:::

::: fn replace
Replaces every occurrence of one piece of text with another: `(replace text old new)`. It matches exactly and literally, so `.` is a full stop, not "any letter". Leave out the new text and the old text is removed. An empty old text changes nothing.

```sx
(replace "a.b.c" "." "-")
⇒ "a-b-c"
(replace "hello" "l" "")
⇒ "heo"
(replace "abc" "b")
⇒ "ac"
(replace "Ada ada" "ada" "X")
⇒ "Ada X"
(replace "x" "" "-")
⇒ "x"
```

The last two show the exactness: the capital `Ada` is left alone, and there is nothing to find in `""`. To ignore capitals, lower-case both: `(replace (lower s) "ada" "X")`.
:::

## Cutting and testing

::: fn split
Cuts text into a list at every occurrence of a separator: `(split text separator)`. Without a separator it cuts at commas. Each piece has its spaces trimmed. An empty separator cuts into letters.

```sx
(split "a, b ,c")
⇒ (list "a" "b" "c")
(split "2026-10-11" "-")
⇒ (list "2026" "10" "11")
(split "abc" "")
⇒ (list "a" "b" "c")
(split "" ",")
⇒ (list "")
```

Two separators in a row leave an empty piece between them: `(split "a  b" " ")` is `(list "a" "" "b")`. Text with nothing in it still gives a list of one empty piece, so `(len (split s))` is never 0.

Pairs well with [len](fn:len), [map](fn:map) and [join](fn:join):

```sx
(join (map (upper it) (split "a,b")) "-")
⇒ "A-B"
```
:::

::: fn starts-with?
True when text begins with another piece of text. Case matters. An empty beginning always matches.

```sx
(starts-with? "edgy" "ed")
⇒ true
(starts-with? "edgy" "Ed")
⇒ false
(starts-with? "edgy" "")
⇒ true
```

To keep the names that begin with `A`:

```sx
(filter (starts-with? it "A") (list "Ada" "Bob" "Alan"))
⇒ (list "Ada" "Alan")
```
:::

::: fn ends-with?
True when text ends with another piece of text. Case matters. Numbers are compared as the text they would be written as.

```sx
(ends-with? "report.pdf" ".pdf")
⇒ true
(ends-with? "report.pdf" ".PDF")
⇒ false
(ends-with? 1990 "90")
⇒ true
```
:::
