---
title: Text templates
nav: Templates
---

A text template puts the value of an expression inside ordinary words: write the expression between double braces, and the words show what it gives.

```live id=hello title="A template in a text cell" height=200
["col",
  ["row", {"size": "hug"},
    ["input", {"name": "qty", "type": "number", "label": "Quantity", "value": 3}],
    ["input", {"name": "price", "type": "number", "label": "Unit price", "value": 19.5}]],
  ["formula", {"name": "total"}, ["*", "$qty", "$price"]],
  ["text", "You are buying **{{qty}}** at {{price | currency}} each: {{total | currency}} in all."]]
```

Change a number and the sentence follows. The text cell holds `You are buying **{{qty}}** at {{price | currency}} each: {{total | currency}} in all.` Three of its parts are templates: a name, and two names with a [format](/language/formats/) after a bar.

## The shape of a template

```text
{{expression}}
{{expression | format}}
```

- The expression is any [expression](/language/): a name, a call, a record lookup. `{{qty}}`, `{{(* qty price)}}` and `{{(upper client)}}` all work. Spaces inside the braces don't matter.
- After a bar, a format says how the value is written: `{{total | currency}}`, `{{rate | 0.0%}}`. Formats are on [their own page](/language/formats/).
- The value is written the way the cell would show it with no format, unless you give one: numbers with a thousands separator and at most two decimals (four when the number is below 1), `yes` and `no` for true and false, a list as its items joined by commas, nothing as nothing.

A template is worked out in the cell it is written in, so [sib](fn:sib), [idx](fn:idx) and every name work there as they do in a formula. It can't change anything: an action such as `set!` in a template is an error.

```notation id=invoice
{"root": ["col",
    ["input", {"name": "client", "type": "text", "value": "Ada Lovelace"}],
    ["input", {"name": "qty", "type": "number", "value": 3}],
    ["input", {"name": "price", "type": "number", "value": 19.5}],
    ["input", {"name": "due", "type": "date", "value": "2026-10-30"}],
    ["formula", {"name": "total"}, ["*", "$qty", "$price"]],
    ["text", {"name": "hello"}, "Hello {{client}}!"],
    ["text", {"name": "bill"}, "Total: {{total | currency}}"],
    ["text", {"name": "when"}, "Due {{due | date}}, in {{(days (today) due)}} days."],
    ["text", {"name": "size"}, "{{(if (> qty 2) \"A big order\" \"A small order\")}}"],
    ["text", {"name": "broken"}, "Total: {{(* qty price}}"]],
  "meta": {"currency": "EUR"}}
```

A text cell's value is the words it shows, so you can read it by name and see what the template gave:

```sx in=invoice
hello
⇒ "Hello Ada Lovelace!"
bill
⇒ "Total: €58.50"
when
⇒ "Due Oct 30, 2026, in 19 days."
size
⇒ "A big order"
```

The euro sign comes from the document's currency setting, as [currency](format:currency) explains.

## Where a template works

A template works in text, and in these props of a cell:

| Where | What it makes |
| --- | --- |
| The body of a [text](kind:text) cell | The words shown. The result is then read as Markdown, so `**{{qty}}**` is bold. |
| `label` and `placeholder` | An input's label, a chart's label, the text hinting at what to type. |
| `src` and `alt` | The address and description of an [image](kind:image). |
| `title` | The heading of a tab, section or collapsible. |
| `url` | The address a [fetch](kind:fetch) cell asks for. |
| A diagram element's `text` | The words in a shape, which update as the values change. |

Everywhere else you write an expression without braces: a formula's body, a button's action, a style value, a condition.

A fetch address is where a template is most useful. This one asks for the rate of whichever currency is chosen:

```notation
["col",
  ["input", {"name": "code", "type": "select", "options": ["list", "eur", "gbp"], "value": "eur"}],
  ["fetch", {"name": "rate", "every": 60}, "https://example.test/rates/{{code}}.json"]]
```

A fetch cell has no network inside these docs; it fetches in Live, on a server. See [Fetch](kind:fetch).

A diagram's labels read the document too:

```notation
["col",
  ["input", {"name": "total", "type": "number", "value": 1840}],
  ["diagram", {"name": "flow"},
    {"id": "a", "type": "rect", "text": "Order placed"},
    {"id": "b", "type": "rect", "text": "Total {{total | currency}}"},
    {"type": "arrow", "from": "a", "to": "b"}]]
```

## How the bar is read

A template is split at its **last** bar, and only when what follows looks like a format: letters, digits, `.`, `%`, `_` and spaces, with no `)`. Otherwise the whole thing is the expression. So a bar inside text or a call is safe:

```notation id=bars
["col",
  ["input", {"name": "n", "type": "number", "value": 0.256}],
  ["text", {"name": "a"}, "{{n | 0.0%}}"],
  ["text", {"name": "b"}, "{{(str \"a|b\")}}"]]
```

```sx in=bars
a
⇒ "25.6%"
b
⇒ "a|b"
```

Three things to know:

- A format name edgy doesn't know shows the value as if there were no format. `{{n | sparkle}}` gives `0.256`.
- Any three letters are read as a currency code. `{{n | abc}}` gives `ABC 0.26`. Don't use a three-letter word as a made-up format.
- `{{` with no `}}` after it is plain text, and so is `{{}}`.

## When a template fails

If an expression in a template can't be read or worked out, the text cell shows its own text in red, and hovering shows the message. The cell's value is that error, and a cell that reads it shows the error with the text cell's name in front.

```sx in=invoice
broken
⇒ error: missing )
```

The messages are the same as in a formula: `missing )` for a bracket left open, `no cell called "nobody"` for a name that isn't a cell, and so on. [Errors](/language/errors/) lists them.

## Renames and templates

When you rename a cell, the templates that read it are rewritten with the new name. See [Names and references](/language/names/#renames-are-followed) for what is covered.

## See also

- [Formats](/language/formats/): every format, with examples.
- [Text](kind:text): the cell that shows words and templates.
- [Errors](/language/errors/).
