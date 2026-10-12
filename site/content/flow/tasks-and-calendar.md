---
title: Tasks, the calendar and time
nav: Tasks and calendar
---

The Tasks view lists what is open by when it is due, the Calendar lays events and due days on a month and time blocks on a week, and the clock keeps the minutes you spend; this page covers the three together, since they are the time side of Flow.

## Tasks

Tasks are grouped by their due day: **Overdue**, **Today**, **Tomorrow**, **This week**, **Later**, **No date**, and **Done**, which is folded. Each row has a checkbox, the text, the tags, the due day, the priority mark and the board column. Tick the box to finish a task; the row moves to Done and the board's last column. Click the due day to change it (a date picker), the priority mark to cycle normal, high and urgent, and the text to open the editor.

The box at the top adds a task: it reads [quick-add](/flow/#quick-add) syntax but always makes a task, so `Call Ben friday` is due Friday and `Call Ben 3pm` is a task with a time, which also shows on the week.

::shot flow-tasks "The task list, grouped by when things are due."

## The calendar

**Month** shows every day of the month with its events (with their time) and the tasks due that day (with a small box, ticked when done), today marked. Click a day to add an item for it: the editor opens with that day set. **Week** shows seven days side by side with the hours down the side; timed events and timed tasks are blocks placed by their start and end, and whole-day events and due tasks sit in a row above the hours. The arrows move a month or a week; **Today** comes back.

On a phone, the month becomes an agenda: the days of the month that hold something, one after the other, each with its items.

::shot flow-calendar "The month: events with their time, tasks with a box, today in a circle."

::shot flow-week "The week: time blocks by the hour, the all-day row above, the line at now."

Events come from quick-add (a time makes one) or from the editor, where **Start** and **End** take a day or a day and time. An event with a start and no end lasts an hour. An event that spans days shows on each of them.

## The clock

Any item can have the clock on it: **Start the clock** in its menu (or the play button on a card). One clock runs at a time; starting another stops the first. **Stop the clock** adds the minutes to the item, shown on its post and card, and writes a comment, *Worked 25 min on this*, so the timeline keeps the record. While the clock runs, the Today strip shows the item and the time on it.
