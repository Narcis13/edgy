---
title: Custom events and actions
nav: Custom events and actions
---

A custom event is an event with a name you choose, sent with `emit!` so that any cell can react to it, and a custom action is a function you write once for the document and call by name from any handler or button.

Together they keep a document from repeating itself. Placing an order, say, needs to save a record, clear the basket, count the order and thank the customer. Instead of one long button, the button sends `order-placed`, and each cell that cares has its own small handler for it.

## Sending an event

```live id=placed title="One event, two listeners" height=240
["col", {"style": {"gap": 8}},
  ["data", {"name": "orders", "on": {"order-placed": ["set!", "orders", ["+", "$orders", 1]]}}, 0],
  ["data", {"name": "last"}, 0],
  ["button", {"do": ["emit!", "order-placed", {"total": 42}]}, "Place an order"],
  ["text", "Orders today: **{{orders}}**"],
  ["text", {"name": "thanks", "hidden": true, "style": {"bg": "live-soft", "fg": "live", "pad": 10, "radius": 10},
            "on": {"order-placed": ["do", ["set!", "last", ["get", "$payload", "total"]], ["show!", "thanks"]]}},
    "Thank you, Ada. An order of {{last}} euros is noted."]]
```

The button runs `(emit! "order-placed" {total 42})`. Two cells have a handler under `order-placed`: the data cell `orders` adds one to itself, and the text `thanks` stores the total it was sent and shows itself. The button knows nothing about either of them.

```sx in=placed
(emit! "order-placed" {total 42})
orders
⇒ 1
last
⇒ 42
```

Press the button again and `orders` goes to 2.

## How a custom event travels

`(emit! name payload)` takes the name of the event, in quotes, and optionally a value to send along. The name starts with a letter, then letters, digits, `-` or `_`: `order-placed`, `saved`, `step2`.

- **Everything listening hears it.** Unlike a built-in event, which reaches only the cell that raised it, a custom event reaches every cell that has a handler for its name, in the order the cells are in the document, and then the document's own handler.
- **It runs after the sender is done.** `emit!` doesn't call the handlers on the spot. It puts the event in line; the handler that sent it finishes first, and the listeners run next, each seeing the document as the one before left it.
- **It counts as a step deeper.** An event sent from a handler is one level further down than the handler's own event, and the limit of eight levels applies. See [Loops and undo](/events/loops-and-undo/).

A handler of a custom event finds these names:

| Name | What it holds |
| --- | --- |
| `payload` | The value sent, such as `{total 42}`. `nil` when the event was sent without one. |
| `from` | The name of the cell whose action sent it (its id when it has no name). `nil` when the document's own handler sent it. |
| `target` | Always `nil`: no one cell raised it. |
| `event` | A record with `name`, `payload`, `from`, and `listener`, the name of the cell whose handler is running (left out in the document's own handler). |

A built-in event's name can't be sent. The cell raises those itself, and sending one would confuse its handlers:

```sx
(emit! "change" 1)
⇒ error: is an event the document raises itself
```

```sx
(emit! "order placed" 1)
⇒ error: emit! needs the name of an event
```

The error appears in **Activity** against the handler that tried, and as a message on screen. Nothing is sent.

## Writing one in the editor

1. Select a cell, find **Events** in **Cell details** and press **Add a handler**. The first step, **When**, lists the cell's own events and the custom events the document already uses.
2. To listen for a new event, choose **Another event…** and type its name, `order-placed` for instance.
3. To send one, choose **Send an event** as the second step, **What should happen**, and name it.

Custom events the document sends or handles are listed under **Custom events** in the studio's Events part.

## Custom actions

A custom action is a name for a few actions. It is defined in the document's `meta`, under `actions`, as a function:

```live id=greet title="A custom action" height=170
{"root": ["col", {"style": {"gap": 8}},
    ["data", {"name": "hello"}, "Nobody greeted yet"],
    ["row", {"size": "hug"},
      ["button", {"variant": "soft", "do": ["greet", "Ada"]}, "Greet Ada"],
      ["button", {"variant": "soft", "do": ["greet", "Grace"]}, "Greet Grace"]],
    ["text", "**{{hello}}**"]],
 "meta": {"actions": {"greet": ["fn", ["who"], ["set!", "hello", ["str", "Hello, ", "$who"]]]}}}
```

```sx in=greet
(greet "Grace")
hello
⇒ "Hello, Grace"
```

Both buttons call `greet`, each with another name. In sx the definition reads `(fn (who) (set! hello (str "Hello, " who)))`.

To define one, select nothing so **Cell details** shows the document, find **Events and actions** and press **New action**: you give it a name and the names of its inputs. In notation, or over the [HTTP API](/agents/http/), set it with a `meta` op:

```notation id=shop
["col",
  ["data", {"name": "cart"}, []],
  ["button", {"do": ["add", "Apples", 2]}, "Two kilos of apples"],
  ["text", "In the basket: {{(len cart)}} line(s)"]]
```

```ops in=shop id=shop2
[["meta", "actions.add", ["fn", ["item", "qty"], ["set!", "cart", ["concat", "$cart", ["list", {"item": "$item", "qty": "$qty"}]]]]]]
```

```sx in=shop2
(add "Apples" 2)
(add "Honey" 1)
(len cart)
⇒ 2
```

### How an action behaves

- **Called like a built-in.** `(greet "Ann")` is written the way `(set! …)` or `(sum …)` is, in any action: a button's `do`, a handler, another custom action. Arguments fill the inputs in order. An input left out is `nil`; an extra argument is ignored.
- **It gives back its last expression.** It can work out a value as well as change cells: with `(fn (x) (* x 2))` as `double`, a formula can read `(double 4)` and get 8. Only an action called from a handler or a button can change cells.
- **Its changes belong to whoever calls it.** A `set!` or `emit!` inside it acts in the handler or button that called it, so it is part of the same step for undo.
- **It sees its inputs and the cells.** It does not see the names the caller has bound. A handler on `change` can call `(note value)`, but the body of `note` cannot read `value` unless it is passed in:

A custom action written as `(fn (x) (set! seen value))` would report *no cell called "value"* when run. Pass what the action needs: `(note value)`, where `note` takes `x`.

- **A name nothing else has.** It starts with a letter, then letters, digits, `-` or `_`, and may end with `!`. It cannot be the name of a built-in function (a message in the editor says so) or of another action.
- **It must be a function.** An action written as anything but `(fn (…) …)` is reported as *write it as (fn (…) …)*.

Calling a name that is not built in, not an action and not a cell that holds a function shows an error in the cell, before anything runs: *no action or function called "greet"*.

The [Market stall](template:events) template uses both: the produce table calls `(add item qty)` when a row is double-clicked, and **Place the order** sends `order-placed`, which an order counter and the thank-you note both hear.
