---
title: Timers
---

A timer is a cell that ticks on its own, once every so often or once after a wait, and runs a handler each time: that is how a document refreshes a fetch, counts up, or shows something a few seconds after it opens.

Timers run on the server, while someone has the document open in **Live**. They do not tick in the page you are reading, so the examples here are shown as notation, not run.

## A clock you can pause

```notation id=clock
["col",
  ["data", {"name": "seconds"}, 0],
  ["timer", {"name": "clock", "every": 1,
             "on": {"tick": ["set!", "seconds", ["+", "$seconds", 1]]}}],
  ["text", "Open for **{{seconds}}** seconds."],
  ["row", {"size": "hug"},
    ["button", {"variant": "soft", "do": ["stop!", "clock"]}, "Pause"],
    ["button", {"variant": "soft", "do": ["start!", "clock"]}, "Resume"]]]
```

The timer `clock` ticks every second. Each tick runs its `tick` handler, which adds one to `seconds`. **Pause** stops the timer with [stop!](fn:stop!) and **Resume** starts it again with [start!](fn:start!). The timer is never drawn: readers see the text and the buttons.

A timer's value says whether it runs. It is `true` while running and `false` once stopped, so other cells can read it by name:

```sx in=clock
(stop! clock)
clock
⇒ false
```

```sx in=clock
(start! clock)
clock
⇒ true
```

## Setting one up

Choose **Timer** from the `/` menu. In **Cell details** a timer has:

- **Ticks**: **Again and again** or **Once**.
- **Every** (or **After**, for **Once**): the time in seconds.
- **Running** or **Stopped**: whether it ticks now. A timer that is stopped waits for `(start! name)` from a button or a handler.

In notation the same settings are props:

| Prop | What it is |
| --- | --- |
| `every` | Time between ticks. A number of seconds, or text with a unit: `"500ms"`, `"30s"`, `"2m"`, `"1h"`. |
| `after` | Time to wait before one single tick, written the same way. Ignored when `every` is set. |
| `value` | `false` keeps the timer stopped. Left out, the timer runs. |
| `on` | The handlers. A timer raises [tick](event:tick) and [change](event:change). |

A timer with neither `every` nor `after`, or with a time of zero or more than 24 hours, never ticks; **Cell details** says *Set a time, or the timer never ticks*. The fastest a timer repeats is once a second: `"every": 0.2` ticks every second.

```notation
["timer", {"name": "tip-timer", "after": 6,
           "on": {"tick": ["do", ["show!", "tip"], ["hide!", "tip-wait"]]}}]
```

A timer set `after` ticks once and is then done. It ticks again only when its time is changed, when it is started again with `start!`, or when the document is opened in Live afresh.

## What a tick hands to its handler

A `tick` handler finds two names: `count`, how many times the timer has ticked since it started, and `at`, the moment of the tick in milliseconds. Use `count` to do something every third tick, or to stop after ten:

```notation
["timer", {"name": "reminder", "every": "30s",
           "on": {"tick": ["when", [">=", "$count", 10], ["stop!", "reminder"]]}}]
```

`start!` on a timer that is running starts it over: the wait begins again and `count` goes back to 0.

## Where and when it ticks

The server keeps the clock, once for each document, however many people have it open. It begins when the first person uses the document in **Live** and stops when the last one leaves Live, switches to **Edit** or **Page**, or closes the tab. A person who may only view the document, or who has a view-only link, does not count: their Live does not keep timers running.

On each tick the server runs the handler, saves what it changed as one change to the document, and tells every browser. The tick is listed in **Activity** under *Events*, marked *on the server*, with what it changed; and the change is nobody's step for undo. See [Which browser runs what](/events/who-runs-what/).

> [!NOTE]
> A handler that changes something saves a new version of the document on every tick. A timer that counts every second adds a line to the history every second for as long as someone is in Live. Give the timer a longer time when a fast one is not needed.

In **Edit** and on paper a timer is only a small chip, if it shows at all. The [Market stall](template:events) template has two: one that turns an offer every 30 seconds, and one that shows a tip six seconds after the stall opens.

## Usual mistakes

- **Nothing ticks.** Timers run only while someone has the document open in **Live**. In **Edit** they wait. Also check that the timer has an `every` or an `after`, and is not **Stopped**.
- **Resume starts the count again.** `(start! name)` doesn't carry on where the timer stopped: the wait and `count` begin again from now. Keep a number you want to last in a [data](kind:data) cell, as the clock above does.
- **Two people, one stream of ticks.** The server runs each timer once for the document, however many people have it open. Two people do not see twice as many ticks.
- **`count` starts again.** `count` counts since the timer started on the server. It starts again when the timer's settings change, when it is started again, and when nobody had the document open in Live in between.
