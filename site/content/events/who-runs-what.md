---
title: Which browser runs what
nav: Who runs what
---

This page says where each handler runs when two people have the same document open: in whose browser, or on the server, and so how many times.

The rule is that every handler runs once. The person who did something runs the handlers it sets off, in their own browser, and everyone else receives the result as an ordinary change. Whatever nobody did (a timer's tick, a fetch's answer, an agent's change) runs on the server.

## The table

| What happens | Where its handler runs | How often |
| --- | --- | --- |
| A person clicks, types, ticks, picks, or presses a button | That person's browser | Once |
| The document's `open` | The browser of each person who uses it in **Live** | Once for each person, each time they open it |
| The document's `close` | The browser of the person who leaves | Once for each person who leaves |
| A timer's `tick` | The server | Once for the document |
| A fetch cell's `load` and `fail` | The server | Once for each fetch |
| A change an agent made, and what it sets off | The server | Once, if anyone has the document open in **Live** |
| Anything in **Edit** or **Page**, or on paper | Nowhere | Never |

## Two people, one document

Ada and Grace both have the [Market stall](template:events) open in **Live**. This is what happens when:

- **Ada opens it.** Her browser runs `open` and adds one to the visit counter. Grace's browser runs nothing for it. When Grace opens it, her browser runs `open` too, and the counter goes up again: it counts openings.
- **Ada ticks a checkbox that has a `change` handler.** Her browser changes the checkbox, runs the handler and finds what it changed. It sends the tick and the handler's changes to the server together. Grace's browser receives them as one change from Ada. It runs no handler, because the handler already ran. Grace sees the checkbox ticked and the text changed.
- **A timer ticks.** Neither browser ticks it. The server does, runs the handler once and saves what it changed as one change. Ada and Grace both receive it, and the change shows in **Activity** under *Events*, marked *on the server*.
- **A fetch answers.** The server asked for it, once, and runs `load` once. Both of them see the same answer.
- **An agent changes a value.** The server runs the `change` handlers that follow, once, and saves what they changed as a change of its own. The browsers run nothing for it.

> [!NOTE]
> A handler writes a value, it does not add to one. `(set! count (+ count 1))` is worked out from the `count` the browser has, and saved as "count is 5". If Ada and Grace both press at the same moment, each browser works out 5 from the 4 it sees, and the count goes up by one, not two. For a number that many people change at once, save a [record](/data/collections/) for each press and count the records.

## What nobody sees

- **In Edit nothing runs.** Pressing a button selects it, a click on a cell selects it, and a checkbox you tick while designing runs no handler. Switch to **Live** to try what you built. If Ada is in **Edit** and Grace is in **Live**, Grace's actions run their handlers in Grace's browser, and Ada, in Edit, sees the changes arrive.
- **The server runs timers and fetches while anyone is in Live.** When Grace leaves **Live**, or closes the tab, and Ada is only in **Edit**, the timers stop and fetches stop refreshing. [Timers](/events/timers/) and [Fetch cells](/events/fetch/) say how.
- **A viewer runs handlers for themselves only.** Someone who may only view the document, or who opened a view link, can use it in **Live**: their clicks run handlers in their browser. What a handler changes stays in their tab, and records it would save are not saved: *You can view this document, not change it, so nothing is saved.* Their Live does not keep timers and fetches running for others either.
- **Paper runs nothing.** Printing, or the **Page** view, shows the document as it stands.

## When open and close run

`open` runs the first time a person uses the document in **Live**: when they open it in Live, or when they switch to Live from **Edit** for the first time. Going back and forth between views does not run it again, and it runs again only after the person has left and come back. `close` runs when they leave, if they are in **Live** at that moment. Closing the tab sends it on the way out, as far as the browser allows.

## What each place can reach

A handler that runs in a browser and one that runs on the server do the same things with the same actions: `set!`, `insert!`, `emit!`, `refresh!`. The differences are where they get their records and what they cannot see:

- A browser handler works from the document and the records that browser has loaded. It loads the collections the document uses before the document's `open` handler runs.
- A server handler works from the saved document, the records of the document's owner, and the fetch answers the server keeps.
- Records are saved by whoever ran the handler, and the other open browsers are told the collection changed, so a formula that reads `(rows "orders")` follows it in every browser.

See [Collections](/data/collections/) for who owns records, and [Under the hood](/internals/runner/) for the server's runner and [the session](/internals/session/) for the browser's.
