---
title: Date functions
nav: Dates
---

The date functions give the current date and time, count the days between two dates, move a date forward or back, and take a date apart into its year, month, day and weekday.

::ref functions Dates

The examples on this page run on Sunday 11 October 2026, at 09:00 UTC.

## What a date is

A date is written as text, `"2026-10-11"`, which is also how a date [input](kind:input) holds it. It can carry a time, `"2026-10-11T14:30:00"`. A time in milliseconds, such as [now](fn:now) gives, works wherever a date does. A date with no time is midnight at the start of that day, on the clock where the document is open.

A value that can't be read as a date is an error. Nothing and empty text are not dates:

```notation id=cells
["col",
  ["input", {"name": "due", "type": "date", "value": "2026-10-30"}],
  ["input", {"name": "empty-date", "type": "date"}]]
```

```sx in=cells
(days (today) due)
⇒ 19
(days (today) empty-date)
⇒ error: expected a date, got ""
```

Guard a date that may be missing: `(if due (days (today) due) nil)`, or give it a stand-in with `(default due (today))`.

## The present

::: fn now
The current time, as a number of milliseconds since 1 January 1970 (UTC).

```sx
(now)
⇒ 1791709200000
(type (now))
⇒ "number"
```

A cell that uses `now` is worked out again every second while the document is open, so it stays right by itself. Take two readings and subtract for a duration in milliseconds. To write a past moment in words, use the `ago` format: `(fmt (- (now) 600000) "ago")` is `"10 min ago"`. See [Formats](/language/formats/).
:::

::: fn today
Today's date as text, `"YYYY-MM-DD"`, on the clock where the document is open.

```sx
(today)
⇒ "2026-10-11"
(type (today))
⇒ "string"
```

Cells that use it are kept current, and change when the date does. Because it is text in the same shape a date input holds, it compares with one: `(< due (today))` asks whether a due date has passed. See [<](fn:<).
:::

## Between dates

::: fn days
The number of days from the first date to the second. It is negative when the second is earlier. If the dates carry times, the result is rounded to the nearest whole day.

```sx
(days "2026-10-01" "2026-10-11")
⇒ 10
(days "2026-10-11" "2026-10-01")
⇒ -10
(days (today) "2026-12-25")
⇒ 75
(days "2026-03-01" "2026-04-01")
⇒ 31
(days "2026-10-11" (today))
⇒ 0
```

Clocks that change for summer time don't throw it off. For a countdown with a sentence, combine it with [cond](fn:cond):

```sx
(cond (< (days (today) "2026-10-20") 0) "past"
      (= (days (today) "2026-10-20") 0) "today"
      "coming")
⇒ "coming"
```

A date that can't be read is an error: `(days "soon" (today))` gives `expected a date, got "soon"`.
:::

::: fn date+
A date a number of days later, as text: `(date+ date days)`. A negative number goes back. It always gives a date with no time, and handles the ends of months and years.

```sx
(date+ "2026-10-11" 30)
⇒ "2026-11-10"
(date+ "2026-10-31" 1)
⇒ "2026-11-01"
(date+ "2026-12-31" 1)
⇒ "2027-01-01"
(date+ "2026-03-01" -1)
⇒ "2026-02-28"
(date+ (today) 7)
⇒ "2026-10-18"
```

The [Quote](template:quote) template works out "valid until" with `(date+ date valid)`: the quote's date and the number of days it is valid for. The pair `days` and `date+` undo each other: `(days a (date+ a 45))` is 45.
:::

## Parts of a date

::: fn year
The year of a date, as a number.

```sx
(year "2026-10-11")
⇒ 2026
(year (now))
⇒ 2026
```
:::

::: fn month
The month of a date, from 1 (January) to 12 (December).

```sx
(month "2026-10-11")
⇒ 10
(month (today))
⇒ 10
```

For the name of the month, show the date with the [date](format:date) format.
:::

::: fn day
The day of the month, from 1 to 31.

```sx
(day "2026-10-11")
⇒ 11
(day "2026-01-05")
⇒ 5
```

Build a short date by joining parts: `(str (day d) "/" (month d))` is `"11/10"`.
:::

::: fn weekday
The name of the day of the week, in English.

```sx
(weekday "2026-10-11")
⇒ "Sunday"
(weekday "2026-10-12")
⇒ "Monday"
(weekday (date+ (today) 6))
⇒ "Saturday"
```

It gives a name, so test it with [=](fn:=): `(= (weekday date) "Sunday")`. Capitals matter.
:::
