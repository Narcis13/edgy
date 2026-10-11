---
title: Fetch cells and their events
nav: Fetch cells
---

A fetch cell gets JSON from an address, keeps the answer as its value, and raises `load` when the answer arrives or `fail` when it cannot.

The server makes the request, not the browser, and only while someone has the document open in **Live**. Nothing is fetched in a page like this one, so the examples are shown as notation. The cell itself has its own page, [fetch](kind:fetch); this page is about what it raises and where the request goes.

## A rate that warns

```notation id=rate
["col",
  ["data", {"name": "warn"}, false],
  ["data", {"name": "problem"}, ""],
  ["fetch", {"name": "rate", "label": "Exchange rate", "every": 30,
             "on": {"load": ["do", ["set!", "warn", [">", ["get", "$data", "rate"], 5]], ["set!", "problem", ""]],
                    "fail": ["set!", "problem", "$message"]}},
    "/api/demo/rate"],
  ["formula", {"name": "lei", "format": "0.00"}, ["default", ["get", "$rate", "rate"], 0]],
  ["text", {"hidden": ["not", "$warn"], "style": {"bg": "warn-soft", "fg": "warn", "pad": 10, "radius": 10}},
    "The rate is above 5 lei."],
  ["text", {"hidden": ["empty?", "$problem"], "style": {"bg": "bad-soft", "fg": "bad", "pad": 10, "radius": 10}},
    "The rate did not update: {{problem}}"]]
```

The fetch cell `rate` reads the demo answer `{base "EUR" quote "RON" rate 4.82 at …}`. Its value is that answer, so `(get rate "rate")` reads one field of it. When the answer arrives, `load` sets `warn` from it; when the request fails, `fail` puts the reason in `problem`. Readers see one line from the cell, such as *Exchange rate · updated 9:00:12 AM*, with a button to fetch again.

Before anything has been fetched the cell has no answer, and nothing is wrong yet:

```sx in=rate
(status rate)
⇒ "idle"
```

```sx in=rate
(error-of rate)
⇒ nil
```

```sx in=rate
(default (get rate "rate") 0)
⇒ 0
```

## When it is fetched

The server fetches a fetch cell:

- when the document is opened in **Live**, unless an answer for the same address is already there and fresh, which means younger than the cell's `every`, or than a minute when it has none;
- again every `every`, when the cell has one. A number is seconds, or write `"30s"`, `"2m"`, `"1h"`. Anything under 5 seconds counts as 5;
- when its address changes (an address can carry `{{templates}}`, so it follows the cells it reads), once that change is saved;
- on `(refresh! rate)` from a button or a handler, or when someone presses the cell's refresh button or **Retry**.

There is one request at a time for a cell, however many people look at it, and one answer, which every browser and agent sees. A request that is already on its way is shared: ask again and you get the same one.

Only a fetch in **Live** runs `load` and `fail`. Pressing **Fetch now** in the cell's settings while you design the document gets an answer and runs no handler.

## What a fetch raises

| Event | When | Data |
| --- | --- | --- |
| [load](event:load) | The answer arrived. | `data` and `value`: the answer. |
| [fail](event:fail) | The request failed. | `message`: why. `status`: the HTTP status, or `nil`. |
| [change](event:change) | The answer is different from the last one. | `value` and `was`. |

If the new answer differs from the last, the cells that read the fetch, and the fetch itself, raise `change` first, and then `load` runs. A failed fetch keeps the last good answer as the cell's value, so the page still has something to show; the line under the cell turns to *Couldn't load Exchange rate*, with the reason and **Retry**.

Two functions tell a formula how a request stands, naming the cell like [selected](fn:selected) does:

| Write | Gives |
| --- | --- |
| `(status rate)` | `"idle"` (nothing asked yet), `"loading"`, `"ready"` or `"failed"`. |
| `(error-of rate)` | The message of the last failure, or `nil`. |

Use them to show a spinner or a note without a handler: `(= (status rate) "loading")` in a cell's `hidden`.

## Where a request can go

The address is the cell's body. It is one of:

- an `http` or `https` address;
- a path on this server that answers JSON: `/api/data/<collection>`, which gives the records the document reaches, or `/api/demo/…`, the demo answers below.

The server refuses what could do harm. It reads JSON only, with a `GET`, waits at most 10 seconds, accepts an answer up to 1 MB and follows up to 3 redirects. It never connects to a private, loopback or link-local address, and checks the address again on every redirect. A refused or failed request ends in `fail` with a message such as:

- *the server answered 500: the demo service is down*
- *the answer is not JSON*
- *no answer within 10 s*
- *localhost is a private or local address, which fetch cells may not reach*
- *a path on this server can be /api/data/<collection> or /api/demo/…*

A viewer, or someone with a view link, sees what the cell answered but not where it fetched from: addresses and headers are kept from them.

### Secrets

An API usually wants a key. A key written in a document would travel with every copy of it, so the document holds only a name. In `headers`, a value of the form `secret:NAME` is replaced by the server with its setting `EDGY_SECRET_NAME`:

```notation
["fetch", {"name": "prices", "every": "10m",
           "headers": {"Authorization": "secret:RATES_KEY"}},
  "https://api.example.test/prices.json"]
```

With the server started with `EDGY_SECRET_RATES_KEY=…`, the request carries `authorization` with that value. Three things have to hold, or the fetch fails with a message that says which:

1. The server has the setting: *the secret RATES_KEY is not set on this server (EDGY_SECRET_RATES_KEY)*.
2. The document belongs to the account that owns the server, the first account made on it.
3. The cell's address is on the same site (scheme, host and port) its owner left it on; another path on that site is fine. Someone with edit access who points the cell at a different site sends no secret: *the secret RATES_KEY goes only where the server's owner sent it from this cell; ask them to open and change the document*.

Other header values are sent as they are. A header goes only to the site named in the cell, never to a different site that a redirect leads to.

## The demo answers

These answer from the server itself, with no network, so a fetch cell can be tried anywhere. Anyone signed in (or with a link) can call them.

| Path | Answer |
| --- | --- |
| [/api/demo/rate](route:GET /api/demo/rate) | `{base "EUR" quote "RON" rate 4.82 at "…"}`. The rate steps through five values each time it is asked; `?rate=5.5` fixes it. |
| [/api/demo/slow](route:GET /api/demo/slow) | `{ok true waited 1500 at "…"}` after 1.5 seconds; `?ms=` sets the wait, up to 5000. |
| [/api/demo/fail](route:GET /api/demo/fail) | An error, status 500: *the demo service is down*. Use it to try `fail`. |
| [/api/demo/weather](route:GET /api/demo/weather) | `{city "Cluj" temp 17 sky "clear" wind 9}`; `?city=` changes the city. |

The [Market stall](template:events) template reads `/api/demo/rate` every 30 seconds and shows a warning when the rate goes above 5.

## Usual mistakes

- **Nothing was fetched.** The cell is fetched only while someone has the document open in **Live**, and only when it has an address. In **Edit** it waits; the chip says *not fetched yet*.
- **`load` did not run when I pressed Fetch now.** That button, in **Cell details**, is for looking while you design. Press the cell's own refresh button in **Live**, or use `(refresh! rate)`, to run the handlers.
- **A formula shows nothing before the first answer.** The value is `nil` until then. Give it a fallback with [default](fn:default), or test `(status rate)`.
- **A viewer cannot fetch again.** Fetching again needs the right to change the document. A viewer sees the answer the server last got.
