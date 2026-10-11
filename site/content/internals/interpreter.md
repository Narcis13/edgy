---
title: The interpreter
---

The interpreter is a small Lisp whose programs are JSON arrays, and every formula, button action, condition and handler in edgy is written in it. This page describes the reader that turns typed text into JSON, the printer that turns it back, the `Interp` that evaluates it, its special forms, its limits, the `Host` that connects it to a document, and the effects an action produces.

It describes [sx.ts](src:src/core/sx.ts). The document-facing half, which builds the `Host`, is [engine.ts](src:src/core/engine.ts) (see [The engine](/internals/engine/)); what runs an action and follows its effects is [events.ts](src:src/core/events.ts). For the language as a user writes it, see [The language](/language/).

## Two spellings

An [expression](term:expression) has a stored form and a typed form:

```text
["*", "$qty", "$price"]        stored form (JSON)
(* qty price)                  what people type and read
```

The rules for the stored form are three:

- A JSON **array** is a call: the first item names what to call, the rest are its arguments.
- A **string starting with `$`** is a reference: `"$qty"` reads the cell named `qty`, or a variable of that name.
- **Every other** value is itself: numbers, booleans, `null`, plain strings, and objects (whose values are evaluated).

That is the whole syntax. It is why a formula can sit in a cell's JSON as an ordinary value, why an op can carry one, and why the same code is used by people, agents and templates.

## The reader

`read(src)` turns typed text into the stored form. It has two stages, `tokenize` and `parse`, and a conversion, `toJson`.

`tokenize` skips whitespace and commas (they are the same as a space), skips `;` comments to the end of the line, and splits out `(`, `)`, `{`, `}`, strings and bare atoms. A string runs between double quotes; `\n` and `\t` are escapes, and a backslash before any other character gives that character. An unfinished string is an error that points at the opening quote.

`parse` builds a tree of nodes and wants exactly one form. A second form is `expected one expression; wrap several in (do …)`. Atoms read as `true`, `false`, `nil` or `null`, a number if they match the number pattern, and a symbol otherwise.

`toJson` then makes the stored form. Most of it is mechanical, but these six rules turn what you type into what the interpreter needs:

| You type | You get | Why |
| --- | --- | --- |
| `qty` as an argument | `"$qty"` | A symbol in argument position is a reference. |
| `*` first in a list | `"*"` | In head position it is a name, not a reference. |
| `(set! count 1)` | `["set!", "count", 1]` | The first argument of a place form names a cell rather than reading it. The forms that do this are the set `PLACE_FORMS`: `set!`, `toggle!`, `ref`, `start!` and the other forms that act on or look up one named cell. |
| `(fn (who) …)` and `(let (x 2) …)` | `["fn", ["who"], …]`, `["let", ["x", 2], …]` | Parameters and `let` names are bare words: they define variables. |
| `{total 5}` | `{"total": 5}` | A braced list of pairs is a record. |
| `"$5"` | `["quote", "$5"]` | A string that starts with `$` would be read as a reference, so it is wrapped. |

More pairs, as the reader gives them:

```text
(set! count (+ count 1))          ["set!", "count", ["+", "$count", 1]]
(fn (who) (set! hello who))       ["fn", ["who"], ["set!", "hello", "$who"]]
(let (x 2 y 3) (* x y))           ["let", ["x", 2, "y", 3], ["*", "$x", "$y"]]
(insert! "orders" {qty qty})      ["insert!", "orders", {"qty": "$qty"}]
```

Errors from the reader are `SxError`s with a `pos`, the offset in the text where the problem was found, so the editor can underline it. A missing `)` reports `missing )` at the `(` that was never closed.

## The printer

`print(x, width = 72)` is the other direction. It writes the stored form as typed text: `"$qty"` as `qty`, a place form's first argument bare, a record as `{total 5}`. A call that doesn't fit in `width` columns is broken after its first argument and indented:

```text
(if (> (+ subtotal shipping tax) 1000)
  (str "Big order for " client)
  (str "Small order for " client))
```

`read` and `print` are inverses on any valid expression, which is what lets the formula bar, the code studio, the outline and the Activity panel all show code the way people write it. Plain strings are printed in quotes and references bare, so a string and a cell of the same name stay apart.

## Values

The interpreter has no types beyond JSON's, and it is forgiving about them:

- **Truth.** `false`, `null`, `0`, `""` and an empty list are false. Everything else is true, including an empty record.
- **Numbers.** `toNum` accepts a number, a boolean, an empty value (as 0), or a string that reads as a number after commas and spaces are removed. Anything else is `expected a number, got …`. Results go through `clean`, which rounds to 12 significant digits so `(+ 0.1 0.2)` is `0.3`.
- **Equality.** `=` compares a number and a numeric string as numbers, and anything else structurally, treating `null` as the same as missing.

```sx
(if 0 "yes" "no")
⇒ "no"
(if (list) "yes" "no")
⇒ "no"
(if {} "yes" "no")
⇒ "yes"
(= 1 "1")
⇒ true
(+ 0.1 0.2)
⇒ 0.3
```

## Interp

```ts
export class Interp {
  constructor(public host: Host)
  run(x: Sx, vars?: Record<string, unknown>): unknown
}
```

An `Interp` is made for one evaluation and holds its step counter and depth. `run` evaluates an expression with some names bound (a row action's `row`, a handler's `value`); `ev(x, scope)` is the recursive step.

### Names and scopes

A `Scope` is a table of variables and a parent. `let`, `fn` and the helpers `map`, `filter` and `reduce` make new scopes; `find` walks outwards. When `ev` meets `"$name"`, `lookup` asks the scope first and only then the host (`host.ref(name)`, which reads the cell). A variable therefore shadows a cell of the same name, and the same name can mean different things in different places, as `it` does:

```sx
(let (x 1) (let (x 2) x))
⇒ 2
(map (* it 2) (list 1 2 3))
⇒ (list 2 4 6)
((fn (a b) (+ a b)) 1 2)
⇒ 3
```

### How a call is resolved

`call` looks at the head of a list. If it is a plain string, it goes through these steps in order:

1. **Aliases.** A few names stand for others: `mod`, `pow`, `has?`, `pluck`, `coalesce`, `average`, `length`.
2. **Special forms.** These control whether and how their arguments are evaluated, so they are written in `call` itself.
3. **Built-ins.** The rest of the functions are in a table (`BUILTINS`). Their arguments are all evaluated first, then the function runs on the values.
4. **Anything else** is looked up as a *name*: a variable holding a function, then a custom action of the document (`host.action(name)`), then a cell that holds a function (`host.ref`). If none of those is a function you get `unknown function …` or `… is not a function`.

If the head is not a plain string (a nested call, or a `$ref`), it is evaluated and must give a function, or you get `a list must start with a function; use (list …) for plain data`.

A custom action is evaluated in an empty scope of its own, on purpose: its `set!` and `emit!` then act in whatever runs it and not in whatever defined it. See [custom events and actions](/events/custom/).

### Special forms

The special forms are the set `SPECIAL`. They fall into four groups:

| Group | Forms | What is different about them |
| --- | --- | --- |
| Branching | `if`, `when`, `cond`, `and`, `or` | Only the arguments that are needed are evaluated. `and` and `or` return the deciding value, not `true` or `false`. |
| Sequence and binding | `do`, `let`, `fn`, `quote` | `do` runs its parts in order and gives the last. `let` binds one name at a time, so a later binding can use an earlier one. `fn` makes a closure over the scope it is written in. `quote` returns its argument unevaluated. |
| Over a list | `map`, `filter`, `find`, `some`, `every`, `count-if`, `sort-by`, `sum-by`, `reduce` | The first argument is a function of each item: see below. |
| Naming a cell | `selected`, `status`, `error-of` | Their argument names a cell (a table, a fetch cell) rather than reading its value. |

The functions that take a function (`fnArg`) accept three things in that position: a real `fn`, a variable holding one, or, most often, an expression over `it` and `i`:

```sx
(sort-by (get it "n") (list {n 3} {n 1}))
⇒ (list {n 1} {n 3})
(reduce (+ acc it) 0 (list 1 2 3))
⇒ 6
```

Inside `reduce` the running total is `acc`, the item `it` and its position `i`. The names `it`, `i` and `acc` are reserved, with `true`, `false`, `nil` and `null`, so a cell can't be called one (`RESERVED_NAMES`; see [the model](/internals/model/)).

The full list of functions, with what each does, is generated from the code on [Functions](/language/functions/).

## Limits

An expression runs in the browser while someone types it, so nothing it does can be allowed to run away.

| Limit | Where | What you see |
| --- | --- | --- |
| `MAX_STEPS = 400_000` | Every array or object evaluated counts one step. | `this takes too long to compute` |
| 300 levels | The nesting of calls. | `this nests too deeply` |
| `MAX_LIST = 20_000` | The length of a list `range` makes. | `range is too long` |

```sx
(count (map (count (map (+ it 1) (range 700))) (range 700)))
⇒ error: takes too long
(range 30000)
⇒ error: range is too long
```

Those are the guards against an accident. The step counter belongs to one `Interp`, so it restarts for each expression. The language has no `while`: the only repetition is over a list, or a custom action that calls itself, which the depth limit stops (`this nests too deeply`). It has no access to anything the host doesn't give it.

## The Host

The interpreter knows nothing about documents. It sees the world through the `Host` it is given:

```ts
export interface Host {
  ref(name: string): unknown;
  sib(i: number): unknown;
  idx(): number;
  /** The id of the nth cell inside a row or column (negative counts from the end). */
  child(name: string, i: number): string;
  rows(collection: string): unknown[];
  /** The picked rows of a table cell. */
  selected?(name: string): unknown[];
  now(): number;
  /** Resolves a cell for `set!` and friends. Only present while running an action. */
  place?(name: string): { id: string; value: unknown; kind?: string };
  /** A custom action defined on the document: its (fn (params…) body…). */
  action?(name: string): Sx | undefined;
  /** How a fetch cell's request stands. */
  fetchState?(name: string): FetchState;
  effect?(e: Effect): void;
  currency?: string;
}
```

The first group reads: a named cell's value, a sibling by position, the current cell's position, the records of a collection, the clock. The `Evaluator` in `engine.ts` implements all of them, and records which cells were read as it does (that is how the engine learns the dependencies). The second group only exists while an action runs: `place` finds the cell a `set!` names, and `effect` is where the action's changes are put. With neither, `set!` throws `set! only works in an action, such as a button`. This one check is what keeps formulas from changing anything.

A different host is a different world. The docs use the engine's host with a fixed clock, and the browser, the server and the runner each hand the engine a different [World](/internals/engine/). A test can give the interpreter a host of six small methods (`ref`, `sib`, `idx`, `child`, `rows`, `now`) and run it alone.

## Effects

An action does not change the document while it runs. It describes what should happen, as a list of effects, and whoever ran it carries them out.

```ts
export type Effect =
  | { type: 'op'; op: Op }
  | { type: 'insert'; collection: string; record: Record<string, Json> }
  | { type: 'delete'; collection: string; id: string }
  | { type: 'update'; collection: string; id: string; fields: Record<string, Json> }
  | { type: 'clear'; collection: string }
  /** A custom event, sent to every cell (and the document) with a handler for it. */
  | { type: 'emit'; name: string; data: Json }
  /** Fetch a fetch cell's address again. */
  | { type: 'refresh'; cell: string };
```

Most actions turn into an `op`. `(set! count 3)` becomes `["set", "<id of count>", "value", 3]`. So do `toggle!`, `dup!`, `remove!`, `show!` (which clears `hidden`), `hide!` (which sets it), `start!` (which sets a timer's value to the time it started) and `stop!` (which sets it to `false`). Because actions and ops are the same thing underneath, a change a handler makes is a change a person could have made, with the same checks, the same undo and the same line in Activity.

The others cannot be ops because they leave the document. `insert!`, `update!`, `delete!` and `clear!` change records in a collection; `refresh!` asks the server to fetch again; `emit!` sends a [custom event](term:custom-event), which `react()` queues for the handlers that listen for it.

```notation id=counter title="A counter in a data cell"
["row",
  ["data", {"name": "count"}, 0],
  ["button", {"do": ["set!", "count", ["+", "$count", 1]]}, "Add one"]]
```

```sx in=counter
(set! count (+ count 1))
(set! count (+ count 1))
count
⇒ 2
```

Each line is run the way a click runs it: the effects are collected, the `op` effects are applied with `applyOps`, and the next line sees the result. In the app the same thing happens in `react()` in [events.ts](src:src/core/events.ts), which also queues the events the change sets off. See [Events and actions](/events/) for what a person sees of this.

## Templates and the static check

Two more pieces of `sx.ts` work on expressions without running them.

`parseTemplate` splits a text such as `Total: {{total | currency}}` into parts: literal text, and expressions with an optional format after a `|`. It reads each `{{…}}` with `read`, so a template is checked as the text is parsed, and a part that can't be read becomes an `error` part instead of failing the whole text. Results are kept in a cache of up to 2000 texts. `mapTemplate` rewrites each expression and puts the text back together; renaming a cell uses it.

`unknownCalls(x, known)` walks an expression and returns the names it calls that are neither built in, bound by `let` or `fn`, nor known to the caller. The engine uses it for `actionProblems`, so `on click: no action or function called "greet"` shows before anything runs.
