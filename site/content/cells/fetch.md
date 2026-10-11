---
title: Fetch
---

A fetch cell gets JSON from a web address, fetched by the server and kept fresh, and formulas read the answer by the cell's name.

::ref kind fetch

## When to use it

Use a fetch cell for numbers or facts that live somewhere else: an exchange rate, the weather, a feed, the records you saved in a collection. The cell takes one line in Live, where readers see when it last updated, and everything else in the document reads its answer like any other value.

For numbers someone types, use an [input](kind:input); for numbers saved by the document itself, a [table](kind:table) over `(rows "name")` is simpler than a fetch of `/api/data/name`.

## Try it

A fetch cell needs the server's network, so it can't load inside this page. Here is the exchange rate of the [Market stall](template:events) template, written as notation:

```notation id=rate
["col",
  ["fetch", {"name": "rate", "label": "Exchange rate", "every": 60,
             "on": {"load": ["set!", "warn", [">", ["get", "$data", "rate"], 5]], "fail": ["set!", "problem", "$message"]}},
    "/api/demo/rate"],
  ["data", {"name": "warn"}, false],
  ["data", {"name": "problem"}, ""],
  ["stat", {"label": "EUR → RON", "format": "0.00", "icon": "banknote", "on": {"click": ["refresh!", "rate"]}},
    ["default", ["get", "$rate", "rate"], 0]],
  ["text", {"hidden": ["not", "$warn"], "style": {"fg": "warn"}}, "The rate is above 5 lei."],
  ["text", {"hidden": ["empty?", "$problem"], "style": {"fg": "bad"}}, "The rate did not update: {{problem}}"]]
```

When someone opens this in Live, the server gets `/api/demo/rate`, which answers with a record like `{"base": "EUR", "quote": "RON", "rate": 4.82, …}`, and again every 60 seconds. The stat shows the `rate` field. The **load** handler sets `warn` when the rate is above 5; the **fail** handler keeps the reason. Pressing the stat fetches again at once.

::shot designer-fetch "The fetch's designer: the address, how often it is fetched again, the label, and how the last fetch went."

Before the first answer a fetch cell's value is nothing and its status is `"idle"`, so a formula reads it with a fallback:

```sx in=rate
rate
⇒ nil
(status rate)
⇒ "idle"
(error-of rate)
⇒ nil
(default (get rate "rate") 0)
⇒ 0
```

## Adding and designing one

1. Select a cell and press `/`, then choose **Fetch**. It is named `rate`, labelled *Exchange rate*, and points at `/api/demo/rate` so it shows something at once.
2. In the **Content** section of **Cell details**, set the **Address**. It is JSON over http or https, or a path on this server such as `/api/data/orders`. It may carry templates: `/api/demo/weather?city={{city}}` fetches again when the `city` cell changes.
3. Set **Fetch again every**, in seconds, or leave it empty to fetch only when the document opens. Five is the least.
4. Set the **Label**: the name readers see on the cell's line in Live.
5. Press **Fetch now** to try it while designing. The line under the fields says *Not fetched yet*, *Fetching…*, *Loaded at 9:00:12 AM* with the fields of the answer, or *Failed:* and the reason. Fetching now while designing runs no `load` or `fail` handler.

In Edit a fetch cell is a small chip: its name, address, interval and state, and a button to fetch now.

Under the designer, a hint shows how to read the answer once it has one: *Formulas read the answer by name: `(get rate "rate")`*.

## In notation

The address is the body:

```notation id=feed
["fetch", {"name": "prices", "label": "Prices", "every": "5m",
           "headers": {"Authorization": "secret:PRICES_KEY"}},
  "https://api.example.test/prices.json"]
```

| Prop | What it is |
| --- | --- |
| *body* or `url` | The address: `http` or `https`, or a path on this server. May carry `{{templates}}`. |
| `every` | How often to fetch again: seconds, or `"30s"`, `"5m"`, `"1h"`. The server never refreshes faster than every 5 seconds. Unset, only when the document opens or on `(refresh! name)`. |
| `headers` | Request headers, text to text. A value written `"secret:NAME"` is filled in by the server. |
| `label` | What the line in Live calls it; without one, its name. |
| `on` | `load` and `fail` handlers. |

### Secrets

A header such as `"Authorization": "secret:PRICES_KEY"` is filled in by the server from its environment variable `EDGY_SECRET_PRICES_KEY`, so the key itself is never in the document. A secret goes only from documents that belong to the server's owner, and only to the site (the address without its path) the owner left in that cell: if an editor points the cell at another site, nothing is sent. Any other header value is stored in the document as written, so never type a real key there.

## What the server does

The server fetches, never the reader's browser, so everyone with the document open sees the same answer, and the address never sees a reader. It makes a plain `GET` and asks for JSON.

- **When.** When the first person opens the document in Live, unless a fresh answer for the same address is already there; then every `every`; on `(refresh! name)` and the refresh buttons; and when the address changes.
- **What it may reach.** `http` and `https` addresses, and on this server `/api/data/<collection>` (records the document may read) and `/api/demo/…`. It refuses private and local addresses.
- **How much.** An answer within 10 seconds, no larger than 1 MB, after at most 3 redirects. A redirect to another site doesn't take the headers along.
- **Where the answer lives.** In the server's memory, not in the document. After the server restarts, the next person in Live fetches it again.

If a fetch fails, the cell keeps the last answer it had. Its [status](fn:status) becomes `"failed"` and [error-of](fn:error-of) says why.

## Its value

The parsed answer: a record, a list, a number or text, whatever the JSON was. Nothing before the first answer. Read a field with [get](fn:get), and give a fallback with [default](fn:default) so the first moments work:

```sx
(default (get rate "rate") 0)
```

[status](fn:status) says how the cell stands: `"idle"` (not fetched yet), `"loading"`, `"ready"` or `"failed"`; [error-of](fn:error-of) gives the reason or nothing.

## Events

::ref events-of fetch

`load` runs after every successful fetch, with the `data`; `fail` runs after a failed one, with the `message` and the HTTP `status` if there was one. `change` fires when the answer is different from the one before, and cells that read the answer follow. Handlers run on the server, once, and only while someone is in Live. See [Events and actions](/events/) and [Fetch cells](/events/fetch/).

## Actions that change it

[refresh!](fn:refresh!) fetches the cell's address again, now, and runs `load` or `fail`:

```notation id=again
["col",
  ["fetch", {"name": "weather"}, "/api/demo/weather?city=Cluj"],
  ["button", {"do": ["refresh!", "weather"]}, "Check again"]]
```

Nothing sets a fetch cell's answer directly. Change the address to change the answer.

## On a phone and on paper

In Live the cell is one line: *Exchange rate · updated 9:00:12 AM* with a refresh button, *Loading Exchange rate…*, or *Couldn’t load Exchange rate: …* with **Retry**. On a phone its buttons are larger to tap. It is never printed.

## Usual mistakes

- **The value is nothing for a moment.** The first answer takes a moment. Use `(default (get rate "rate") 0)` so nothing breaks before it arrives.
- **`a path on this server can be /api/data/<collection> or /api/demo/…`.** Only those paths on the server can be read, and only collections the document is allowed to read.
- **`… is a private or local address, which fetch cells may not reach`.** The server won't fetch from itself or from a private network.
- **`the answer is not JSON`, `no answer within 10 s`, `the server answered 404`.** The address answered with something else or too slowly. The reason is in the cell's line and in `(error-of name)`.
- **`the secret PRICES_KEY is not set on this server (EDGY_SECRET_PRICES_KEY)`.** The server's owner has to set the variable and restart the server.
- **`the secret PRICES_KEY goes only where the server's owner sent it from this cell`.** Someone else changed the cell, or its address. Ask the owner to open the document and change something in the cell.
- **Pressing Fetch now ran no handler.** While designing, it only looks. In Live a refresh runs `load` or `fail`.
