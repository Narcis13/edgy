---
title: The timeline
nav: Timeline
---

The timeline is Flow's first view: a composer at the top, a strip of what today holds, and every item as a post under one heading per day, each with its comments and reactions.

## Posting

The box at the top takes anything: a thought, a task, an appointment. The first line is read with [quick-add](/flow/#quick-add) (a day, a time, `#tags`, `!`), and the line under the box says what was understood: *Event · Tomorrow 15:00–16:00 · #sales · urgent*. **Post** (or Ctrl+Enter) saves it. The buttons beside the box choose the kind by hand when the syntax didn't, and **Attach a document** links one of your documents to the post, where it shows as a card that opens it.

Press `n` anywhere on the page to jump to the composer.

::shot flow-editor "The item editor, opened from a post: every field of the item."

## Today

Under the composer, **Today** says what the day holds: the events, in order, with their times; the tasks due today; how many are overdue; how many you finished today; and the clock, if one is running, with the time on it. Each entry opens its item. On a quiet day the strip says so.

## Posts

Every item is a post. A post shows who wrote it with their avatar (an agent with the agent colour and *for you* beside its name), how long ago, its kind, its text and body, its tags, when it is due or happening, the document attached, and the minutes worked on it. A task shows a checkbox; ticking it marks it done and moves it to the board's last column. The **⋯** menu on a post has **Edit** (the full editor), **Make it a task**, **a note** or **an event**, **Pin**, **Start the clock** or **Stop the clock**, **Done** or **Not done**, and **Delete**, which asks first and takes the comments and reactions along.

Posts are ordered by their last activity, newest first: posting, editing, moving on the board, finishing, or getting a comment all bring a post to the top. A reaction does not move it. The heading above each group is the day: *Today*, *Yesterday*, then *Saturday 10 October*.

## Reactions

Under a post are five reactions: like, dislike, love, celebrate and idea. Click one to give it, again to take it back; the count beside it says how many gave it, and yours is marked. Hover the count to see who. An agent reacts with your key and counts as itself, so a post can have your like and your agent's.

## Comments

Under the reactions are the comments, oldest first, each with its author and time, and a box to write one: Enter sends it, Shift+Enter makes a new line. The clock writes a comment of its own when it stops (*Worked 25 min on this*). A comment counts as activity: the post moves to the top of the timeline.

## Finding posts

The chips above the feed show **All**, **Notes**, **Tasks**, **Events** or **Done** (done items are left out of the other four). The search box finds posts by words in their text, body, tags and comments, in any order; `/` jumps to it and Esc clears it. Click a tag on any post, or in the row of tags under the chips, to see only posts with that tag; click it again to see all.

## Live

The timeline follows changes as they happen: an agent's post, a comment from another machine through sync, a record a document saved with `(insert! "flow" …)`, all appear without reloading. See [GET /api/flow/events](route:GET /api/flow/events).
