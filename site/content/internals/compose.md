---
title: Compose, sentence to code
nav: Compose
---

Compose turns a sentence a person types ("qty times price", "when qty changes, set count to the new value") into code for a cell, and makes sure the code fits the document before anyone sees it. This page describes the three ways an answer is produced (the Claude API, an agent listening over MCP, and a built-in composer that needs no AI) and the checks every answer passes whichever way it came.

It describes [compose.ts](src:src/server/compose.ts) and the route that serves it in [app.ts](src:src/server/app.ts). The panel that shows it is **Ask AI** in [the code studio](/editor/ask-ai/); the agent side is [edgy_listen](tool:edgy_listen) and [edgy_answer](tool:edgy_answer).

## The request

The code studio sends [POST /api/docs/:id/compose](<route:POST /api/docs/:id/compose>), which needs the `edit` role on the document:

```ts
{ prompt: string; cell?: string; target?: string; current?: string; provider?: 'claude' | 'agent' | 'local' }
```

- `prompt` is the sentence, cut to 2000 characters.
- `cell` is the cell the code is for, by id or name; none means the document.
- `target` says what kind of code is wanted (below).
- `current` is the code already in the editor, for "make it also…" and for what `it` means.
- `provider` forces one provider first; the built-in composer is always the last resort.

The answer is a `Composed` and **nothing is applied**. The server only returns code, an explanation, and a preview; the person reads it and chooses. For an expression, the studio shows the code with **Use this** and **Insert at cursor**. For `events`, it lists what would change and offers **Apply it** (or **Apply all**), which dispatches the ops like any change.

```ts
export interface Composed {
  code: string;
  expr: Sx;
  explanation: string;
  preview?: { value?: Json; display?: string; error?: string };
  provider: Provider;
  notes?: string[];
  /** `events` only: the ops to apply, already checked against the document. */
  ops?: Op[];
  changes?: Change[];
}
```

### Targets

A target says what the sentence should become:

| Target | The answer is |
| --- | --- |
| `expr` | The expression a cell shows (its formula). |
| `do` | The action a button runs. |
| `hidden`, `style`, `options`, `compare`, `trend` | A condition, a style value, a select's choices, a number to compare against, a list of numbers. |
| `on.<event>` | The action one event of the cell (or the document) runs, such as `on.change`. |
| `action` | A custom action for the document: `(fn (who) …)`. |
| `events` | Several things at once, as **ops**: handlers, custom actions, timers, fetch intervals, a few new cells. |

`TARGETS` lists the fixed ones, and `isTarget` accepts `on.` followed by an event name. A target that is about an event the cell doesn't raise is refused before anything is composed (`eventProblem`: `qty (a input) does not raise tick; it raises change and click`).

## What the composer knows about the document

`context(doc, world, collections, ask)` is worked out once per request:

- **computed**, the evaluated document, so values can be previewed.
- **names**, a table from a *forgiving key* to a cell: the lower-cased name, id, input label or collapsible heading, with spaces, `-` and `_` removed. "Unit price", "unit-price" and `unitPrice` all find the cell named `unit_price`.
- **collections**, for each collection the person may name, the fields its latest 50 records use.
- **it**, what "it" means in the sentence: the cell itself for `style` and `hidden`, otherwise the code being edited.

For an editor who isn't the owner, the collections are only those the document reaches (see [Access](/internals/access/)).

## The three paths

`compose(ctx, prompt, providers)` tries them in order and returns the first answer that passes the checks:

```ts
const order: Provider[] = p.provider ? [p.provider, 'local'] : ['claude', 'agent', 'local'];
```

Each one that is skipped or fails adds a line to `notes` ("Claude could not answer: …", "Fell back to the built-in composer because no agent answered."), which the panel shows. If every path fails, the route answers `422` with the notes and a list of sentences the built-in composer does understand, made from the document's own names (`suggestions`).

### 1. Claude

On when the server has an `ANTHROPIC_API_KEY` and `EDGY_AI` isn't `off` (`claudeConfig`). The model is `EDGY_AI_MODEL` or the default, and `EDGY_AI_BASE_URL` can point at another host. [GET /api/ai](<route:GET /api/ai>) says which paths are on.

`systemPrompt(ctx)` builds what the model is told, from the document, so the model sees this document and no other:

- the language: every function with its signature and what it does (`FUNCTIONS` in [reference.ts](src:src/core/reference.ts));
- the document as the **outline**, one line per cell with its source and current value (see [Notation and outline](/internals/notation/));
- the collections it may read, with their fields;
- notes on how tabs, accordions, data cells and diagrams are read and changed, with *this document's* names and titles in them, only for the kinds it has;
- for the event targets, how events work: which events this cell raises, what each binds, the custom events and actions the document has;
- the task, the current code, and the rules ("use only the functions above and the names of cells in the document", whether actions are allowed, "prefer the simplest expression").

It asks for the code in a fenced block followed by a line starting `Explanation:`, and `parseReply` takes those apart. The call is a plain `fetch` to the Messages API, with a 30 second limit.

If the code doesn't pass the checks below, the model gets a second chance: its reply and `That code does not work here: <the reason>. Answer again in the same format.` are sent back, once. A second failure is a failure of this path, and compose moves on.

### 2. An agent

An agent (a person's AI assistant connected over [MCP](/agents/mcp/)) can answer instead, if it is waiting on the document. `hub.listening(docId)` is true while an agent is inside [edgy_listen](tool:edgy_listen) or for 30 seconds after.

1. The route opens a request in `Requests` (in memory) and publishes a `compose` event.
2. The agent's long poll, [GET /api/docs/:id/messages/wait](<route:GET /api/docs/:id/messages/wait>), returns it in `requests` with the prompt, the target and the current code.
3. The agent answers with [POST /api/docs/:id/compose/:rid](<route:POST /api/docs/:id/compose/:rid>), through [edgy_answer](tool:edgy_answer).
4. That route runs `accept` on the answer, with the same checks as the other paths. A failing answer gets a `422` with the reason and the agent may send another.
5. `requests.answer` resolves the waiting request, and compose finishes with `provider: 'agent'`.

The wait is 45 seconds (`AGENT_WAIT`). If nothing arrives, or the person's request is dropped (the connection closes), it counts as no answer and compose falls back to the built-in composer. Requests are not stored: a restart forgets them.

### 3. The built-in composer

`composeLocal(ctx, prompt)` needs no network and no AI. It is a set of rules for the phrasings people use, and it is what runs when nothing else is on, so the feature works on a laptop with no key.

It works in stages:

1. **Normalize.** The sentence is lower-cased; quoted text is set aside; symbols become words (`>` is "greater than", `%` is "percent"); number words become numbers ("twenty" is 20); filler such as "please", "can you", "show me" is stripped.
2. **Understand.** A class per kind of target reads what is left. `Local` handles expressions, actions, conditions, styles and options: comparisons, arithmetic with precedence ("a plus b times c"), aggregates ("the total of …", "the average of …"), conditions ("if … then … else …"), formats, and verbs for actions ("add one to count", "reset step", "toggle the details"). `Sentences` handles `on.<event>`, `action` and `events`: "when qty changes, …", "every minute, …", "after 5 seconds, …".
3. **Resolve names.** A phrase becomes a cell through `ctx.names`, trying plural and singular forms. A phrase that names nothing makes the whole attempt fail.
4. **Check.** What it built goes through `validate`, like any other answer, and is dropped if it fails.

These are real outputs for the **Quote** document, whose cells are `qty`, `price`, `total`, `add` and a data cell `count`:

```text
"the total of qty and price, plus 20 percent"  (a formula)
  (* (sum qty price) 1.2)
  Adds 20% to the total of qty and price. It updates whenever qty or price changes.
  preview 50.4 → $50.40

"add one to count"  (a button's action)
  (set! count (+ count 1))
  When clicked, it adds 1 to count.

"hide when qty is 0"  (a condition on price)
  (= qty 0)
  Hides this cell while qty is 0. It checks again whenever qty changes.

"when qty changes, set count to the new value"  (events)
  qty on change: (set! count value)
```

It is exact rather than clever. It knows `qty`, not "quantity", so "quantity times price" gets no answer and the panel offers suggestions built from the document's names (`qty times price`, `sum of qty and price`, …). A sentence it can't map to a cell fails instead of guessing.

## The checks

Every answer from every path goes through the same functions, so what the person sees has already been tested against *this* document.

`validate(ctx, code, target)` reads the answer: Lisp text, possibly in a fence, or the JSON form, using `read` from [the interpreter](/internals/interpreter/). Empty is an error. An `action` must be `(fn (params) body…)`. Then `check` walks the expression, with the scope growing as `let` and `fn` bind names, and throws on:

| Problem | The message |
| --- | --- |
| A name no cell has | `there is no cell called "prise"; did you mean price?` (names within an edit distance of 2 are suggested) |
| A function that doesn't exist | `unknown function frob`. A cell that isn't a function: `total is a cell, not a function`. |
| An action in a place that must only compute | `set! changes the document, so it only works in a button's action` |
| An action on the wrong kind of cell | `start! needs a timer, and qty is a input` |
| An event the document raises itself, sent by `emit!` | `"open" is an event the document raises itself; give your event a name of its own` |

Inside a handler (`on.<event>`), the names the event binds (`value`, `was`, `row`, `index`, `payload`, …) are known too, from `eventVars`.

If the answer passes, `finish` makes the result: `print(expr, 60)` for the code, the provider's explanation or one written by `explain(ctx, expr)` in plain words, and, for anything but an action, a **preview**: the expression run with `evalIn` against the document, with the cell's format applied. An expression that fails when run shows its error in the preview instead of a value.

### Answers made of ops

An `events` answer is a list of ops, not an expression, and ops can do anything, so `validateOps` is stricter.

1. `readOps` takes the reply apart: a fenced JSON block, a JSON list, `{ "ops": … }`, or one op, and flattens any `do`. Handlers written as Lisp text, `"(set! status value)"`, are read into JSON.
2. Each op must be one of a small set (`allowed`). It may set a handler (`on.<event>`), `every`, `after` or `hidden` on a cell, set a document handler or custom action with `meta`, and add a new `timer`, `fetch` or `data` cell with `split` or `put` into an empty cell. Anything else (`remove`, `style`, `set … value`) is refused: an answer here adds behaviour, it doesn't rearrange the document.
3. Each op is applied, one at a time, to a copy of the document. An op that doesn't apply is `… does not apply: <the reason>`.
4. Every handler and action the ops write is `check`ed in the context of the *changed* document, with its event's names bound, and `actionProblems` looks for calls to names that exist nowhere.
5. `changes` and the explanation are made by comparing the copy with the original: each new or changed handler, action, timer and fetch becomes one line with its words and its code. A fetch cell's address, and the names of any secrets in its headers, are always put in the list so an answer can't send data anywhere unseen.

If nothing changes, the answer is an error (`the ops add no handler, action or cell`).

The result is that code which reaches the person is code that could run: it names cells that exist, calls functions that exist, uses actions only where actions are allowed, and for events only touches behaviour. Whether it does what they *meant* is for them to judge, which is why the explanation and the preview come with it.
