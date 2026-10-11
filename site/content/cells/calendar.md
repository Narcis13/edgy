---
title: Calendar
---

A calendar cell shows a month with events on its days; the day a person picks is its value, so other cells can show what is on that day.

::ref kind calendar

## When to use it

Use a calendar to show dates in context: appointments, deadlines, a trip's days, when invoices fall due. Pick a day and a [text](kind:text), a [table](kind:table) or a [list](kind:list) beside it can show what is on that day.

To type a single date, use an [input](kind:input) of the *date* kind. A calendar shows events that exist elsewhere, in a list or in saved records; it has no place to type new events into the month itself.

## Try it

```live id=studio title="A studio calendar" height=420
["col",
  ["data", {"name": "events"}, [
    {"date": "2026-10-14", "title": "Kickoff with Northwind Studio", "color": "accent"},
    {"date": "2026-10-19", "end": "2026-10-23", "title": "Workshop week", "color": "live"},
    {"date": "2026-10-30", "title": "Invoice due", "color": "bad"}]],
  ["calendar", {"name": "day", "label": "Studio calendar", "value": "2026-10-14"}, "$events"],
  ["text", "Picked: **{{day}}**"]]
```

Press a day to pick it; press it again to let go. **Today** jumps back to today, and the arrows move a month. The arrow keys move a day or a week, **Page Up** and **Page Down** a month ([shortcuts](key:calendar-day)). Under a narrow calendar, an agenda lists what is on the picked day, or what is coming up this month when no day is picked. In a wide cell each day is a box with its events written in.

The calendar's value is the picked day as text, `YYYY-MM-DD`, or nothing:

```sx in=studio
day
⇒ "2026-10-14"
(map (get it "title") (where events "date" day))
⇒ (list "Kickoff with Northwind Studio")
(set! day "2026-10-30")
(map (get it "title") (where events "date" day))
⇒ (list "Invoice due")
(set! day nil)
(count-if (= (get it "color") "bad") events)
⇒ 1
```

## Adding and designing one

1. Select a cell and press `/`, then choose **Calendar**. A new calendar has one event, *Today*, on today's date.
2. Give it the events in **Events** and name the cell in **Name** at the top of **Cell details**, so other cells can read the picked day.

::shot designer-calendar "The calendar's designer: its events, title, the picked day and the first day of the week."

In the **Content** section:

- **Events**: an expression giving records with a date and a title, such as `(rows "events")`. See the next section for the fields.
- **Title**: shown above the month.
- **Picked day**: a date field. Other cells read it by the calendar's name; **Default**, beside it, lets go of it.
- **Weeks start on**: **Monday** (the default) or **Sunday**.

## In notation

The expression giving the events is the body:

```notation id=trip
["calendar", {"name": "trip", "label": "October", "week": "sun", "value": "2026-10-19"},
  ["list",
    {"date": "2026-10-19", "end": "2026-10-23", "title": "Workshop week", "color": "live"},
    {"date": "2026-10-30", "title": "Invoice due", "color": "bad"}]]
```

| Prop | What it is |
| --- | --- |
| *body* or `expr` | An expression giving the events. |
| `value` | The picked day, `"YYYY-MM-DD"`. |
| `label` | The title above the month. |
| `week` | `"mon"` (default) or `"sun"`, the first day of the week. |

Each event is a record. Its fields:

| Field | What it is |
| --- | --- |
| `date` (or `start`) | The day, `"YYYY-MM-DD"`. A record without a day is left out. |
| `title` (or `label`, `name`) | What to write on the day. |
| `end` | The last day, for an event that runs over several days. It must be later than `date`. |
| `color` | A [colour token](term:token) for the event's dot or chip: `accent`, `live`, `warn`, `bad`… |

Events are drawn in date order. Saved records work the same way, as long as they have a `date` and a `title`: the expression `(rows "events")` is all it takes.

## Its value

The picked day as text, `"2026-10-14"`, or nothing when no day is picked. The events are not part of the value; read them from the cell they come from. An empty or non-text value is nothing.

Picking a day is a change to the document, like typing in an input: it is saved, shows in Activity, undoes with ⌘Z, and everyone with the document open sees the same day picked.

To show a month's list beside the calendar, read the picked day:

```sx
(where (rows "events") "date" day)
```

## Events

::ref events-of calendar

`change` fires when the picked day changes, whoever changed it: a person, a button or a handler. It binds `value`, the new day or nothing, and `was`. A click on a day is the way to pick it and not a click on the cell, so use `change` to react. See [Events and actions](/events/).

## Actions that change it

[set!](fn:set!) picks a day, or lets go of it with `nil`:

```sx in=studio
(set! day "2026-10-19")
day
⇒ "2026-10-19"
```

A button can step to the next event or to today: `(set! day (today))`. The calendar moves to the month of the day set.

## On a phone and on paper

A calendar fits its cell. Under 560 pixels wide the days are small circles with up to three dots for their events and an agenda underneath; from 560 up each day is a box with its events written out, and *+N more* when it has more than three. On paper the month prints as shown, without **Today** and the arrows.

## Usual mistakes

- **An event doesn't show.** The record has no `date` (or `start`), or the date isn't `YYYY-MM-DD`. Events without a day are left out; check the expression in **Events**.
- **A multi-day event shows on one day.** `end` must be a later day than `date`; an earlier or equal `end` makes a one-day event.
- **Events don't update after a button saves one.** A calendar reads its events by expression. Give it `(rows "events")` so it follows the collection; a list typed into the expression is fixed.
- **The calendar opens on an old month.** It opens on the month of the picked day, so a day picked long ago keeps it there. Use **Default** beside **Picked day** to let go of it, and the calendar opens on today's month.
- **Weeks start on the wrong day.** Set **Weeks start on**: the default is Monday, not Sunday.
