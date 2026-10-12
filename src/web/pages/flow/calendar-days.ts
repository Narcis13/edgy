// The calendar's pure parts: which items sit on a day, how a week splits into
// the all-day row and the hour blocks, which days an agenda lists, the titles.

import { type FlowItem, dayPart, timePart } from '../../../core/flow';
import { monthName } from '../../kinds/month';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const parts = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m: m - 1, d, wd: new Date(y, m - 1, d, 12).getDay() };
};

/** "Monday 12 October": for a label that a screen reader speaks. */
export function longDate(iso: string): string {
  const p = parts(iso);
  return `${WEEKDAYS[p.wd]} ${p.d} ${MONTHS[p.m]}`;
}

/** "October 2026". */
export function monthTitle(iso: string): string {
  const p = parts(iso);
  return monthName(p.y, p.m);
}

/** "12 – 18 October 2026", "28 Sep – 4 Oct 2026", "29 Dec 2026 – 4 Jan 2027". */
export function weekTitle(days: string[]): string {
  const a = parts(days[0]);
  const b = parts(days[days.length - 1]);
  if (a.y !== b.y) return `${a.d} ${MONTHS[a.m].slice(0, 3)} ${a.y} – ${b.d} ${MONTHS[b.m].slice(0, 3)} ${b.y}`;
  if (a.m !== b.m) return `${a.d} ${MONTHS[a.m].slice(0, 3)} – ${b.d} ${MONTHS[b.m].slice(0, 3)} ${b.y}`;
  return `${a.d} – ${b.d} ${MONTHS[b.m]} ${b.y}`;
}

/** Every day of a month (month 0–11), as 'YYYY-MM-DD'. */
export function monthDays(year: number, month: number): string[] {
  const count = new Date(year, month + 1, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return Array.from({ length: count }, (_, i) => `${year}-${pad(month + 1)}-${pad(i + 1)}`);
}

/** The first and last day an item covers on the calendar; null for a note or an item with no day. */
export function spanOf(item: FlowItem): [string, string] | null {
  if (item.kind === 'note') return null;
  if (item.kind === 'event') {
    const from = item.start ?? item.due;
    if (!from) return null;
    const first = dayPart(from);
    const last = item.end ? dayPart(item.end) : first;
    return [first, last > first ? last : first];
  }
  const day = item.due ?? (item.start ? dayPart(item.start) : null);
  return day ? [day, day] : null;
}

/** Is the item on that day: an event on each day from its start to its end, a task on its due day. */
export function onDay(item: FlowItem, day: string): boolean {
  const span = spanOf(item);
  return !!span && span[0] <= day && day <= span[1];
}

/** The time an item starts on that day ('HH:MM'); null for a whole day, or for a later day of a long event. */
export function timeOn(item: FlowItem, day: string): string | null {
  if (item.kind === 'note' || !item.start || dayPart(item.start) !== day) return null;
  return timePart(item.start);
}

/** Whole-day events first, then what has a time (by time), then tasks with no time (open before done). */
export function sortOnDay(items: FlowItem[], day: string): FlowItem[] {
  const rank = (i: FlowItem) => (timeOn(i, day) ? 1 : i.kind === 'event' ? 0 : 2);
  return [...items].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r) return r;
    if (rank(a) === 1) {
      const t = timeOn(a, day)!.localeCompare(timeOn(b, day)!);
      if (t) return t;
    }
    return Number(a.done) - Number(b.done) || a.text.localeCompare(b.text) || a.id.localeCompare(b.id);
  });
}

export const itemsOn = (items: FlowItem[], day: string): FlowItem[] => sortOnDay(items.filter((i) => onDay(i, day)), day);

/** An open task whose day is before today. */
export function isLate(item: FlowItem, today: string): boolean {
  const span = item.kind === 'task' && !item.done ? spanOf(item) : null;
  return !!span && span[1] < today;
}

export interface AgendaDay {
  day: string;
  items: FlowItem[];
}

/** The days an agenda lists: the ones that hold something, and today even when it is empty. */
export function agendaDays(items: FlowItem[], days: string[], today: string): AgendaDay[] {
  return days
    .map((day) => ({ day, items: itemsOn(items, day) }))
    .filter((d) => d.items.length > 0 || d.day === today);
}

export interface WeekDay {
  day: string;
  /** Whole-day events (and the later days of a long one) and tasks due that day. */
  allday: FlowItem[];
  /** Events and tasks that start at a time on this day: the blocks. */
  timed: FlowItem[];
}

/** A week split into the row above the hours and the blocks in them. */
export function weekCells(items: FlowItem[], days: string[]): WeekDay[] {
  const timedStart = (i: FlowItem) => (i.kind !== 'note' && i.start && timePart(i.start) ? dayPart(i.start) : null);
  return days.map((day) => {
    const timed = items.filter((i) => timedStart(i) === day);
    const allday = sortOnDay(
      items.filter((i) => {
        if (!onDay(i, day) || timedStart(i) === day) return false;
        // A timed task is a block on its start day, so it isn't also in the row on its due day.
        const at = timedStart(i);
        return !(i.kind === 'task' && at && days.includes(at));
      }),
      day,
    );
    return { day, allday, timed };
  });
}

/** The hour (0–23) of a click `y` pixels below the top of a day column that starts at `fromHour`. */
export function hourAt(y: number, fromHour: number, pxPerMin: number): number {
  return Math.max(0, Math.min(23, fromHour + Math.floor(y / pxPerMin / 60)));
}

/** The editor's start and end for a new event in the hour that begins at `hour` on `day`. */
export function hourSlot(day: string, hour: number): { start: string; end: string } {
  const h = (n: number) => String(n).padStart(2, '0');
  return { start: `${day}T${h(hour)}:00`, end: hour >= 23 ? `${day}T23:59` : `${day}T${h(hour + 1)}:00` };
}
