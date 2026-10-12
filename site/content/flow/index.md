---
title: Flow
---

Flow is the page beside your documents where notes, tasks, events and the time you spend on them live as one timeline of posts with comments and reactions, where you and your agents meet; this page covers the idea, the five views, what an item is, and the quick-add syntax every view uses.

Open it with **Flow** in the top bar. The address is `/flow`.

## One thing, five views

Flow has one kind of thing, the **item**. An item is a **note**, a **task** or an **event**, and may carry tags, a due day, a start and an end, a priority, a pin, an attached document and the minutes you worked on it. The five views show the same items in different ways:

| View | Shows | For |
| --- | --- | --- |
| [Timeline](/flow/timeline/) | Every item as a post, by its last activity, under one heading per day, with comments and reactions | Catching up, thinking out loud, talking with your agents |
| [Board](/flow/board/) | Tasks as cards in columns (Inbox, Doing, Done to start with) | Working through what is open |
| [Tasks](/flow/tasks-and-calendar/) | Tasks grouped by when they are due: overdue, today, tomorrow, this week, later, no date, done | Deciding what to do next |
| [Calendar](/flow/tasks-and-calendar/#the-calendar) | Events and due days on a month, and time blocks on a week | Planning the day and the week |
| [Notes](/flow/notes/) | Notes as a grid, pinned first | Keeping what you want to find again |

The views are tabs at the top of the page; `1` to `5` switch between them from the keyboard. A note becomes a task with one click and appears on the board; a task given a time appears in the week; finishing it shows in the timeline, where someone reacts. Nothing is copied between views: it is the same item.

## Items are records

Every item, comment and reaction is a [record](/data/collections/) in your own collections: `flow` holds the items, `flow-comments` the comments, `flow-reactions` the reactions and `flow-board` the board's columns. That is why they [sync](/people/sync/) between your machines like everything else, show on the [Data page](/data/data-page/), and can be read by any of your documents with `(rows "flow")`; see [Flow in documents](/flow/in-documents/). An agent with your API key works with the same items through [edgy_flow](/flow/agents/).

Flow is yours: it belongs to your account, like your collections, and it is not shared with other people. Your agents take part in it with your key.

## Quick-add

Wherever you type a new item, the first line is read for a kind, a day, a time, tags and a priority, and what is left is the item's text. The lines after the first are its body. What was understood shows under the box before you post.

| Write | Gets |
| --- | --- |
| `todo …`, `task …` | a task |
| `note …` | a note |
| `event …` | an event |
| `#sales` | the tag `sales` (letters, digits, `-` and `_`) |
| `!` or `!!` | high or urgent |
| `today`, `tomorrow`, `friday`, `next week`, `in 3 days`, `oct 20`, `20 oct`, `2026-10-20` | a day |
| `3pm`, `15:00`, `at 3`, `noon`, `tonight` | a time |
| `3-4pm`, `15:00-16:30`, `from 3 to 4pm` | a start and an end |
| `for 45m`, `for 2h` | an end, that long after the start |

Without a kind in front, a **time** makes an event, a **day** alone makes a task due that day, and anything else is a note. `at 3` and the hours 1 to 6 with no `am` or `pm` are taken as the afternoon. A weekday names the next one, not today. An event with a start and no end lasts an hour.

| You type | You get |
| --- | --- |
| `Call Ben tomorrow 3pm-4pm #sales !!` | An event, tomorrow 15:00–16:00, tagged *sales*, urgent, titled *Call Ben* |
| `Buy milk friday` | A task due Friday |
| `Idea: use records for flow` | A note |
| `todo Write the report` | A task with no date, in the first column |
| `Deep work 14:00 for 2h` | An event today 14:00–16:00 |

The item editor (open any item and choose **Edit**) sets every field by hand, in case the syntax read something you didn't mean.

## Under the hood

The rules the views share, the quick-add parser among them, are pure functions in [flow.ts](src:src/core/flow.ts); the routes are in [server/flow.ts](src:src/server/flow.ts), the page in `src/web/pages/flow/`. The server sets who wrote each item from who is asking: you, or an agent with your key.
