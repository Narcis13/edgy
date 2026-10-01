// Days and months for the calendar cell. Days are 'YYYY-MM-DD' strings in
// local time, so they compare and sort as text.

export interface Day {
  iso: string;
  day: number;
  /** Inside the month being shown. */
  inMonth: boolean;
}

export interface CalEvent {
  start: string;
  end: string;
  title: string;
  color?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

export const isoOf = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** A local date from 'YYYY-MM-DD', at noon so daylight saving never tips it into another day. */
export function dateOf(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

/** Anything that names a day, as 'YYYY-MM-DD'; null if it doesn't. */
export function toDay(v: unknown): string | null {
  if (typeof v === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  if (typeof v !== 'string' && typeof v !== 'number' && !(v instanceof Date)) return null;
  if (v === '') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : isoOf(d);
}

export function addDays(iso: string, n: number): string {
  const d = dateOf(iso);
  d.setDate(d.getDate() + n);
  return isoOf(d);
}

/** The same day n months on, kept inside the target month (31 Jan + 1 → 28 Feb). */
export function addMonths(iso: string, n: number): string {
  const d = dateOf(iso);
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1, 12);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d.getDate(), last));
  return isoOf(target);
}

/** The weeks of a month (month 0–11), Monday first, padded with the neighbouring months' days. */
export function monthGrid(year: number, month: number): Day[][] {
  const first = new Date(year, month, 1, 12);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const count = Math.ceil((lead + days) / 7) * 7;
  const weeks: Day[][] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(year, month, 1 - lead + i, 12);
    if (i % 7 === 0) weeks.push([]);
    weeks.at(-1)!.push({ iso: isoOf(d), day: d.getDate(), inMonth: d.getMonth() === month });
  }
  return weeks;
}

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const monthName = (year: number, month: number): string =>
  new Date(year, month, 1, 12).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Records with a date and a title, as events in date order. Anything else is skipped. */
export function toEvents(v: unknown): CalEvent[] {
  if (!Array.isArray(v)) return [];
  const out: CalEvent[] = [];
  for (const r of v) {
    if (!isRecord(r)) continue;
    const start = toDay(r.date ?? r.start);
    if (!start) continue;
    const end = toDay(r.end);
    const title = r.title ?? r.label ?? r.name ?? '';
    out.push({
      start,
      end: end && end > start ? end : start,
      title: typeof title === 'string' ? title : String(title),
      ...(typeof r.color === 'string' && r.color ? { color: r.color } : {}),
    });
  }
  return out.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.title.localeCompare(b.title)));
}

export const eventsOn = (events: CalEvent[], iso: string): CalEvent[] => events.filter((e) => e.start <= iso && e.end >= iso);

/** Events touching a month (0–11) from a given day on. */
export function eventsFrom(events: CalEvent[], year: number, month: number, from: string): CalEvent[] {
  const lo = `${year}-${pad(month + 1)}-01`;
  const hi = `${year}-${pad(month + 1)}-31`;
  const start = from > lo ? from : lo;
  return events.filter((e) => e.end >= start && e.start <= hi);
}
