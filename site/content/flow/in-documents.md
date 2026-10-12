---
title: Flow in documents
nav: In documents
---

Because items are records, any of your documents can read them, count them, chart them and change them, and the Data page shows them like any other collection; this page covers the fields, the template that reads them, and what sync and export do with them.

## Reading items

`(rows "flow")` gives every item as a record, oldest first. The fields an item carries:

| Field | Holds |
| --- | --- |
| `kind` | `note`, `task` or `event` |
| `text`, `body` | the first line, and the lines after it |
| `tags` | a list of words |
| `status` | the board column (tasks) |
| `done`, `doneAt` | finished, and when |
| `due` | a day, `2026-10-20` (tasks) |
| `start`, `end` | a day, or a day and time, `2026-10-20T15:00` (events) |
| `priority` | 0, 1 (high) or 2 (urgent) |
| `pinned` | true or false |
| `doc` | the id of an attached document |
| `spent`, `clock` | minutes logged, and when the clock started if it runs |
| `by` | who wrote it: `{kind, name, id, for}` |
| `updated`, `order` | the last activity, and the place within a column |
| `id`, `at` | given to every record |

So `(count-if (not (get it "done")) (where (rows "flow") "kind" "task"))` counts open tasks, `(filter (= (get it "due") (today)) (rows "flow"))` finds what is due today, and `(group (rows "flow") "status")` groups by column. Comments are in `flow-comments` (`item`, `text`, `by`) and reactions in `flow-reactions` (`item`, `kind`, `by`).

A record saved by a document with `(insert! "flow" {kind "task" text "Call Ben"})` is an item like any other: the page reads it as yours, in the first column, with the fields it lacks filled in. `(update! "flow" id {done true})` finishes a task, and the board agrees. Every open Flow page follows such a change at once.

## The Flow dashboard template

The **Flow dashboard** [template](template:flow) is a document that reads the Flow: how many tasks are open and overdue, what is due this week as a table with a **Done** button on each row, a chart of what was finished day by day, and today's events. Open it from the library's starting points. When your Flow is still empty, the template brings a few sample items so the document has something to show.

## The Data page, sync and export

The Flow collections are listed on the [Data page](/data/data-page/) with their records, where a record can be deleted like any other. They [sync](/people/sync/) with your account: an item posted on one machine is on the other within moments, a comment added on each side keeps both, and a field changed here and another there both survive, since records merge field by field. An [export](/library/export/) of a document that reads `flow` carries the items as they were at that moment.
