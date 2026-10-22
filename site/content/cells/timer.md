---
title: Timer
---

A timer cell ticks every so often, or once after a while, for as long as someone has the document open in Live, and runs its tick handler each time.

::ref kind timer

## When to use it

Use a timer when something should happen on its own: refresh a number every minute, count the seconds a document has been open, show a tip a few seconds after it opens. It has no look and takes no room. It is only a clock and a handler.

A timer does nothing by itself: what happens on each tick is its `tick` [handler](term:handler). For a number that only needs to be fetched again from the web, a [fetch](kind:fetch) cell's own `every` is simpler than a timer that calls `(refresh! rate)`.

## Try it

A timer needs the server, so it doesn't tick inside this page. Here is a clock that counts seconds, written as notation:

```notation id=clock
["col",
  ["data", {"name": "seconds"}, 0],
  ["timer", {"name": "beat", "every": 1, "on": {"tick": ["set!", "seconds", "$count"]}}],
  ["text", "Open for **{{seconds}}** seconds"],
  ["row", {"size": "hug"},
    ["button", {"variant": "ghost", "do": ["stop!", "beat"]}, "Pause"],
    ["button", {"do": ["start!", "beat"]}, "Restart"]]]
```

Open in Live, this document would count: each second the timer raises `tick`, and the handler sets `seconds` to `count`, the number of ticks so far. **Pause** stops the timer and **Restart** starts it again from now, so the count begins at 1 again.

::shot designer-timer "The timer's designer: how often it ticks, whether it runs, and the note about Live."

A timer's value is whether it is running:

```sx in=clock
beat
⇒ true
(stop! beat)
beat
⇒ false
(start! beat)
beat
⇒ true
```

## Adding and designing one

1. Select a cell and press `/`, then choose **Timer**. It is named `timer` and ticks every 30 seconds.
2. In the **Content** section of **Cell details**, choose **Ticks**: **Again and again** or **Once**. Set the time in seconds under **Every** or **After**. With no time the designer says *Set a time, or the timer never ticks*.
3. Choose **Running** or **Stopped**. A stopped timer waits for `(start! name)` from a button or a handler.
4. Under **Events**, press **Add a handler** and write what the tick does. The code studio opens on the `tick` event. See [Events and actions](/events/).

In Edit a timer is a small chip with its name and plan, such as *every 30 s · running*, *once, after 6 s* or *no time set*. In Live and on paper there is nothing to see.

## In notation

There is no body. The handler goes in `on`:

```notation id=tip
["col",
  ["timer", {"name": "tip-timer", "after": 6, "on": {"tick": ["do", ["show!", "tip"], ["hide!", "waiting"]]}}],
  ["text", {"name": "waiting"}, "A tip shows up a few seconds after the document opens."],
  ["text", {"name": "tip", "hidden": true}, "Honey sells best before noon."]]
```

| Prop | What it is |
| --- | --- |
| `every` | Seconds between ticks, or `"500ms"`, `"30s"`, `"2m"`, `"1h"`. |
| `after` | A time in the same forms: one tick, then no more. If a timer has both, `every` wins. |
| `value` | `false` while stopped. Leave it out for a timer that runs. |
| `on` | The handlers: `{"tick": action}`. |

A time is longer than 0 and at most a day. Anything else is refused: *every is a time in seconds, like 30, or "500ms", "30s", "2m", "1h", at most a day*. An `every` under a second is read but ticks once a second, and an `after` under a second waits a second: a timer that starts itself again from its own `tick` can't run without a pause.

## Its value

`true` while the timer runs and `false` once stopped. It says nothing about time left or the count; the `tick` handler gets the count. Other cells can read it, for instance to show *Paused*: `(if running "" "Paused")` where `running` is the timer's name.

[start!](fn:start!) stores the time it was called as the value, so a running timer started again begins from now. [stop!](fn:stop!) sets `false`.

## Events

::ref events-of timer

`tick` binds `count`, how many times the timer has ticked since it started, and `at`, the time in milliseconds. `change` fires when the timer is started or stopped.

## Where it runs

A timer runs on the server, once, and only while at least one person has the document open in **Live**. The first person to open it in Live starts it; when the last one leaves, it stops, and it starts from the beginning the next time. If nobody has it in Live, because everyone is in Edit or Page view, it does not tick. A hundred people watching still get one tick, because it isn't theirs: its handler runs on the server and saves what it changes, which every browser then shows.

A change a tick makes is a change to the document: it is saved as a version, and Activity shows it as made by *Events*. A tick that changes nothing saves nothing.

> [!WARNING]
> A handler that changes the document on every tick adds a version every time. A counter on a one-second timer adds a version a second for as long as anyone is watching. Prefer a slow interval, or a handler that changes something only when it needs to. [Timers](/events/timers/) explains how ticks are run.

## Actions that change it

[start!](fn:start!) starts it again from now, and [stop!](fn:stop!) stops it. Both need a timer: giving them another kind of cell is an error. `set!` on a timer writes its value, where `false` stops it and anything else runs it; `start!` and `stop!` say it better.

Changing a timer's time, or starting it, schedules it again from that moment.

## On a phone and on paper

A timer is never shown in Live, on a phone or on paper, and it takes no room. A phone counts like any other viewer while its Live view is open.

## Usual mistakes

- **Nothing ticks.** The document is open in Edit or Page view, or the timer has no time (*no time set* on its chip), or it is stopped. Switch to Live and check the chip.
- **It ticks, but nothing shows.** The tick handler is empty, or it sets a cell that nothing shows. Open **Events** and read the handler.
- **It ticks more slowly than I set.** An `every` under one second becomes one second.
- **`start! needs a timer, and "x" is not one`.** The name is another kind of cell. Name the timer and use its name.
- **The count starts over.** Restarting a timer, or changing its time, begins a new count at 1, and so does the next time someone opens the document in Live.
- **A one-off timer ticked again.** It ticks once each time the document goes from nobody in Live to someone in Live, and again each time `start!` is used on it.
