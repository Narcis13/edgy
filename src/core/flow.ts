// Flow: one kind of thing, the item (a note, a task or an event), shown as a
// timeline of posts, a board of cards, a list of tasks, a calendar and a grid
// of notes. Comments and reactions attach to any item. Items, comments,
// reactions and the board are records in the account's collections (`flow`,
// `flow-comments`, `flow-reactions`, `flow-board`): they sync like any record,
// show on the Data page, and any document reads them with (rows "flow").
//
// This file is the shape of those records and the pure rules every view and
// the server share: reading a record that may be missing fields, the quick-add
// syntax ("Call Ben tomorrow 3pm-4pm #sales !!"), which column a card is in,
// which bucket a task falls in, how the feed is grouped, and the clock.

import type { Json } from './types';

export const FLOW = { items: 'flow', comments: 'flow-comments', reactions: 'flow-reactions', board: 'flow-board' } as const;
export const FLOW_COLLECTIONS: string[] = Object.values(FLOW);

export type ItemKind = 'note' | 'task' | 'event';
export type Priority = 0 | 1 | 2;
export type ReactionKind = 'like' | 'dislike' | 'love' | 'party' | 'idea';

export const KINDS: ItemKind[] = ['note', 'task', 'event'];
export const REACTIONS: { kind: ReactionKind; label: string }[] = [
  { kind: 'like', label: 'Like' },
  { kind: 'dislike', label: 'Dislike' },
  { kind: 'love', label: 'Love' },
  { kind: 'party', label: 'Celebrate' },
  { kind: 'idea', label: 'Idea' },
];
export const DEFAULT_COLUMNS = ['Inbox', 'Doing', 'Done'];
export const PRIORITIES = ['normal', 'high', 'urgent'] as const;

/** Who wrote something: a person, or an agent acting for one. */
export interface Who {
  kind: 'human' | 'agent';
  name: string;
  id?: string;
  for?: string;
  color?: string;
}

export interface FlowItem {
  id: string;
  /** When the record was saved (set by the store). */
  at: number;
  kind: ItemKind;
  /** The first line: what the post says, a card's title, a note's heading. */
  text: string;
  /** The lines after it. */
  body: string;
  tags: string[];
  /** The board column (tasks). */
  status: string;
  done: boolean;
  doneAt: number | null;
  /** 'YYYY-MM-DD' (tasks). */
  due: string | null;
  /** 'YYYY-MM-DD' for a whole day, 'YYYY-MM-DDTHH:MM' (local) for a time. */
  start: string | null;
  end: string | null;
  priority: Priority;
  pinned: boolean;
  /** An attached document's id. */
  doc: string | null;
  /** Minutes logged by the clock. */
  spent: number;
  /** When the clock was started, while it runs. */
  clock: number | null;
  by: Who;
  /** The last activity: edited, moved, done, commented on, reacted to. */
  updated: number;
  /** The place within a board column. */
  order: number;
}

export interface FlowComment {
  id: string;
  at: number;
  item: string;
  text: string;
  by: Who;
}

export interface FlowReaction {
  id: string;
  at: number;
  item: string;
  kind: ReactionKind;
  by: Who;
}

export interface FlowBoard {
  id?: string;
  columns: string[];
}

export interface FlowState {
  items: FlowItem[];
  comments: FlowComment[];
  reactions: FlowReaction[];
  board: FlowBoard;
  /** The attached documents' titles, by id. */
  docs: Record<string, string>;
}

type Raw = Record<string, unknown>;

const str = (v: unknown, or = ''): string => (typeof v === 'string' ? v : v == null ? or : String(v));
const num = (v: unknown, or = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : or);
const bool = (v: unknown): boolean => v === true || v === 'true' || v === 1;

/** A tag as it is kept: lower case, letters, digits, - and _ only. */
export const tagOf = (s: string): string => s.toLowerCase().replace(/^#/, '').replace(/[^\p{L}\p{N}_-]/gu, '').slice(0, 40);

function who(v: unknown, or: Who): Who {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return or;
  const r = v as Raw;
  const w: Who = { kind: r.kind === 'agent' ? 'agent' : 'human', name: str(r.name, or.name) };
  if (typeof r.id === 'string') w.id = r.id;
  if (typeof r.for === 'string') w.for = r.for;
  if (typeof r.color === 'string') w.color = r.color;
  return w;
}

const dayRe = /^\d{4}-\d{2}-\d{2}$/;
const stampRe = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const dayOrNull = (v: unknown): string | null => (typeof v === 'string' && dayRe.test(v) ? v : null);
const stampOrNull = (v: unknown): string | null => (typeof v === 'string' && (dayRe.test(v) || stampRe.test(v)) ? v : null);

/** A record as the views see it: every field present, whoever wrote it (a document's insert!, an agent, the Data page). */
export function normalizeItem(raw: Raw, owner: Who): FlowItem {
  const at = num(raw.at, Date.now());
  const kind: ItemKind = raw.kind === 'task' || raw.kind === 'event' ? raw.kind : 'note';
  const text = str(raw.text ?? raw.title ?? raw.name).trim();
  const tags = Array.isArray(raw.tags) ? [...new Set(raw.tags.map((t) => tagOf(str(t))).filter(Boolean))] : [];
  const p = num(raw.priority);
  return {
    id: str(raw.id),
    at,
    kind,
    text,
    body: str(raw.body).trim(),
    tags,
    status: str(raw.status),
    done: bool(raw.done),
    doneAt: raw.doneAt == null ? null : num(raw.doneAt, at),
    due: dayOrNull(raw.due),
    start: stampOrNull(raw.start),
    end: stampOrNull(raw.end),
    priority: p >= 2 ? 2 : p >= 1 ? 1 : 0,
    pinned: bool(raw.pinned),
    doc: typeof raw.doc === 'string' && raw.doc ? raw.doc : null,
    spent: Math.max(0, Math.round(num(raw.spent))),
    clock: raw.clock == null ? null : num(raw.clock, 0) || null,
    by: who(raw.by, owner),
    updated: num(raw.updated, at),
    order: num(raw.order, at),
  };
}

export function normalizeComment(raw: Raw, owner: Who): FlowComment {
  return { id: str(raw.id), at: num(raw.at, Date.now()), item: str(raw.item), text: str(raw.text).trim(), by: who(raw.by, owner) };
}

export function normalizeReaction(raw: Raw, owner: Who): FlowReaction | null {
  const kind = REACTIONS.find((r) => r.kind === raw.kind)?.kind;
  if (!kind || typeof raw.item !== 'string') return null;
  return { id: str(raw.id), at: num(raw.at, Date.now()), item: raw.item, kind, by: who(raw.by, owner) };
}

export function normalizeBoard(raw: Raw | null | undefined): FlowBoard {
  const columns = raw && Array.isArray(raw.columns) ? raw.columns.map((c) => str(c).trim()).filter(Boolean) : [];
  return { ...(raw && typeof raw.id === 'string' ? { id: raw.id } : {}), columns: columns.length ? [...new Set(columns)] : [...DEFAULT_COLUMNS] };
}

/** The same person or agent: by account id when both have one, else by name. */
export const sameWho = (a: Who, b: Who): boolean => a.kind === b.kind && (a.id && b.id ? a.id === b.id && a.name === b.name : a.name === b.name);

// ───────────────────────────── days and times ─────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');

export const isoDay = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** A local date from 'YYYY-MM-DD', at noon so daylight saving never tips it into another day. */
export function dateOf(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function addDays(iso: string, n: number): string {
  const d = dateOf(iso);
  d.setDate(d.getDate() + n);
  return isoDay(d);
}

/** Days from a to b (b − a), whole days. */
export const daysBetween = (a: string, b: string): number => Math.round((dateOf(b).getTime() - dateOf(a).getTime()) / 86_400_000);

/** The day of a stamp or a day. */
export const dayPart = (stamp: string): string => stamp.slice(0, 10);
/** 'HH:MM' of a stamp, or null for a whole day. */
export const timePart = (stamp: string | null): string | null => (stamp && stamp.length > 10 ? stamp.slice(11, 16) : null);
export const stampOf = (day: string, time: string | null): string => (time ? `${day}T${time}` : day);
export const minutesOf = (time: string): number => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
export const timeOfMinutes = (m: number): string => `${pad(Math.floor(((m % 1440) + 1440) % 1440 / 60))}:${pad(((m % 60) + 60) % 60)}`;

/** The seven days of the week that holds the day, Monday first. */
export function weekOf(iso: string): string[] {
  const d = dateOf(iso);
  const monday = addDays(iso, -((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "Today", "Tomorrow", "Yesterday", "Fri 17 Oct", or with the year when it is another one. */
export function dayLabel(iso: string, today: string, long = false): string {
  const diff = daysBetween(today, iso);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  const d = dateOf(iso);
  const wd = WEEKDAYS[d.getDay()];
  const mo = MONTHS[d.getMonth()];
  const year = d.getFullYear() === dateOf(today).getFullYear() ? '' : ` ${d.getFullYear()}`;
  return long ? `${wd} ${d.getDate()} ${mo}${year}` : `${wd.slice(0, 3)} ${d.getDate()} ${mo.slice(0, 3)}${year}`;
}

/** "15:00", "15:00–16:30", "all day". */
export function timeLabel(start: string | null, end: string | null): string {
  const a = timePart(start);
  if (!a) return 'all day';
  const b = timePart(end);
  return b && b !== a ? `${a}–${b}` : a;
}

/** What an item's time says, for a card or a post: "Tomorrow 15:00–16:00", "Due today", "Overdue 2 days", "". */
export function whenLabel(item: FlowItem, today: string): string {
  if (item.kind === 'event' || item.start) {
    const start = item.start ?? item.due;
    if (!start) return '';
    const day = dayPart(start);
    const endDay = item.end ? dayPart(item.end) : day;
    const days = endDay !== day ? `${dayLabel(day, today)} – ${dayLabel(endDay, today)}` : dayLabel(day, today);
    return `${days}${timePart(start) ? ' ' + timeLabel(start, item.end) : ''}`;
  }
  if (!item.due) return '';
  if (item.done) return `Was due ${dayLabel(item.due, today).toLowerCase()}`;
  const diff = daysBetween(today, item.due);
  if (diff < 0) return `Overdue ${-diff} ${-diff === 1 ? 'day' : 'days'}`;
  return `Due ${dayLabel(item.due, today).toLowerCase()}`;
}

export type Bucket = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'none' | 'done';
export const BUCKETS: { id: Bucket; label: string }[] = [
  { id: 'overdue', label: 'Overdue' },
  { id: 'today', label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'week', label: 'This week' },
  { id: 'later', label: 'Later' },
  { id: 'none', label: 'No date' },
  { id: 'done', label: 'Done' },
];

/** Which group of the task list an item is in. */
export function bucketOf(item: FlowItem, today: string): Bucket {
  if (item.done) return 'done';
  const day = item.due ?? (item.start ? dayPart(item.start) : null);
  if (!day) return 'none';
  const diff = daysBetween(today, day);
  // An event that started before today and has not ended yet is today's.
  if (diff < 0) return item.kind === 'event' && item.end && dayPart(item.end) >= today ? 'today' : 'overdue';
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff < 7) return 'week';
  return 'later';
}

/** The day an item belongs to on the calendar: an event's start, a task's due day. */
export const calendarDay = (item: FlowItem): string | null => (item.start ? dayPart(item.start) : item.due);

// ───────────────────────────── the board ─────────────────────────────

/** The column a card is in: done means the last column, whatever `status` says; an unknown status means the first. */
export function columnOf(item: FlowItem, columns: string[]): string {
  if (item.done) return columns[columns.length - 1];
  return columns.includes(item.status) && item.status !== columns[columns.length - 1] ? item.status : columns[0];
}

/** What moving a card into a column changes. */
export function moveTo(column: string, columns: string[]): { status: string; done: boolean } {
  const last = columns[columns.length - 1];
  return column === last ? { status: last, done: true } : { status: columns.includes(column) ? column : columns[0], done: false };
}

/** A place between two neighbours' orders (either may be missing). */
export function between(before: number | undefined, after: number | undefined): number {
  if (before === undefined && after === undefined) return Date.now();
  if (before === undefined) return after! - 1000;
  if (after === undefined) return before + 1000;
  return (before + after) / 2;
}

/** The cards of a column, in order. */
export const cardsIn = (items: FlowItem[], column: string, columns: string[]): FlowItem[] =>
  items.filter((i) => i.kind === 'task' && columnOf(i, columns) === column).sort((a, b) => a.order - b.order || a.at - b.at);

// ───────────────────────────── the feed ─────────────────────────────

export interface ReactionCount {
  kind: ReactionKind;
  count: number;
  /** Given by the person looking. */
  mine: boolean;
  names: string[];
}

export function reactionCounts(reactions: FlowReaction[], me: Who | null): ReactionCount[] {
  return REACTIONS.map(({ kind }) => {
    const of = reactions.filter((r) => r.kind === kind);
    return { kind, count: of.length, mine: !!me && of.some((r) => sameWho(r.by, me)), names: of.map((r) => r.by.name) };
  }).filter((c) => c.count > 0);
}

export interface Post {
  item: FlowItem;
  comments: FlowComment[];
  reactions: FlowReaction[];
}

export interface FeedDay {
  day: string;
  label: string;
  posts: Post[];
}

export type Filter = 'all' | 'note' | 'task' | 'event' | 'done';

/** Whether a query (words, any order) is in an item's text, body, tags or comments. */
export function matches(post: Post, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [post.item.text, post.item.body, ...post.item.tags.map((t) => '#' + t), ...post.comments.map((c) => c.text)].join('\n').toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}

export function postsOf(state: Pick<FlowState, 'items' | 'comments' | 'reactions'>): Post[] {
  const comments = new Map<string, FlowComment[]>();
  for (const c of state.comments) comments.set(c.item, [...(comments.get(c.item) ?? []), c]);
  const reactions = new Map<string, FlowReaction[]>();
  for (const r of state.reactions) reactions.set(r.item, [...(reactions.get(r.item) ?? []), r]);
  return state.items.map((item) => ({ item, comments: (comments.get(item.id) ?? []).sort((a, b) => a.at - b.at), reactions: reactions.get(item.id) ?? [] }));
}

/** The timeline: posts by their last activity, newest first, under one heading per day. */
export function feedOf(posts: Post[], today: string, filter: Filter = 'all', query = '', tag: string | null = null): FeedDay[] {
  const keep = posts.filter((p) => {
    const i = p.item;
    if (filter === 'done' ? !i.done : filter !== 'all' && i.kind !== filter) return false;
    if (tag && !i.tags.includes(tag)) return false;
    return matches(p, query);
  });
  keep.sort((a, b) => b.item.updated - a.item.updated || b.item.at - a.item.at);
  const days: FeedDay[] = [];
  for (const p of keep) {
    const day = isoDay(new Date(p.item.updated));
    const last = days[days.length - 1];
    if (last && last.day === day) last.posts.push(p);
    else days.push({ day, label: dayLabel(day, today, true), posts: [p] });
  }
  return days;
}

/** The tags in use, most used first. */
export function tagsOf(items: FlowItem[]): { tag: string; count: number }[] {
  const n = new Map<string, number>();
  for (const i of items) for (const t of i.tags) n.set(t, (n.get(t) ?? 0) + 1);
  return [...n].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

// ───────────────────────────── the clock ─────────────────────────────

/** Minutes on an item: logged, plus the clock running now. */
export const minutesOn = (item: FlowItem, now: number): number => item.spent + (item.clock ? Math.max(0, Math.floor((now - item.clock) / 60_000)) : 0);

/** "25 min", "1 h 05", "3 h". */
export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${pad(m)}` : `${h} h`;
}

// ───────────────────────────── today ─────────────────────────────

export interface TodayView {
  events: FlowItem[];
  due: FlowItem[];
  overdue: FlowItem[];
  running: FlowItem | null;
  doneToday: number;
}

export function todayOf(items: FlowItem[], today: string): TodayView {
  const onDay = (i: FlowItem) => i.start && dayPart(i.start) <= today && dayPart(i.end ?? i.start) >= today;
  const events = items.filter((i) => !i.done && onDay(i)).sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''));
  const due = items.filter((i) => !i.done && i.kind === 'task' && !i.start && bucketOf(i, today) === 'today');
  const overdue = items.filter((i) => !i.done && i.kind === 'task' && bucketOf(i, today) === 'overdue');
  const running = items.find((i) => i.clock) ?? null;
  const doneToday = items.filter((i) => i.done && i.doneAt && isoDay(new Date(i.doneAt)) === today).length;
  return { events, due, overdue, running, doneToday };
}

// ───────────────────────────── quick-add ─────────────────────────────

export interface Quick {
  kind: ItemKind;
  text: string;
  body: string;
  tags: string[];
  priority: Priority;
  due: string | null;
  start: string | null;
  end: string | null;
}

const MONTH_NAMES: Record<string, number> = {};
MONTHS.forEach((m, i) => {
  MONTH_NAMES[m.toLowerCase()] = i;
  MONTH_NAMES[m.toLowerCase().slice(0, 3)] = i;
});
MONTH_NAMES.sept = 8;
const DAY_NAMES: Record<string, number> = {};
WEEKDAYS.forEach((d, i) => {
  DAY_NAMES[d.toLowerCase()] = i;
  DAY_NAMES[d.toLowerCase().slice(0, 3)] = i;
});
DAY_NAMES.tues = 2;
DAY_NAMES.thur = 4;
DAY_NAMES.thurs = 4;

const MONTH_RE = '(?:january|february|march|april|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sept|sep|oct|nov|dec)';
const DAY_RE = '(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues|tue|wed|thurs|thur|thu|fri|sat|sun)';
const HOUR = '(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?';

/** A time of day from a match: hours, minutes, am/pm. "3" alone means 15:00 when it is 1–6 and nothing says am. */
function clock(h: string, m: string | undefined, ampm: string | undefined, bare: boolean): string | null {
  let hour = Number(h);
  const min = Number(m ?? '0');
  if (hour > 24 || min > 59) return null;
  if (ampm === 'pm' && hour < 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;
  if (!ampm && bare && hour >= 1 && hour <= 6) hour += 12;
  if (hour === 24) hour = 0;
  return `${pad(hour)}:${pad(min)}`;
}

function nextWeekday(today: string, wd: number): string {
  const d = dateOf(today).getDay();
  const ahead = (wd - d + 7) % 7 || 7;
  return addDays(today, ahead);
}

function monthDay(today: string, month: number, day: number, year?: number): string | null {
  if (day < 1 || day > 31) return null;
  const y = year ?? dateOf(today).getFullYear();
  const d = new Date(y, month, day, 12);
  if (d.getMonth() !== month) return null;
  let iso = isoDay(d);
  // A day already past this year, with no year given, means next year.
  if (year === undefined && iso < today) iso = isoDay(new Date(y + 1, month, day, 12));
  return iso;
}

/**
 * The quick-add syntax, on one line (a second and further lines are the body):
 *   todo … / note … / event …     the kind (otherwise: a time makes an event, a day makes a task, else a note)
 *   #tag                          tags
 *   ! or !!                       high or urgent
 *   today, tomorrow, friday, next week, in 3 days, oct 20, 20 oct, 2026-10-20
 *   3pm, 15:00, at 3, noon, 3-4pm, 15:00-16:30, for 45m / 1h / 1.5h
 */
export function parseQuick(input: string, now: Date = new Date()): Quick {
  const today = isoDay(now);
  const lines = input.replace(/\r/g, '').split('\n');
  let text = lines[0] ?? '';
  const body = lines.slice(1).join('\n').trim();
  let kind: ItemKind | null = null;
  const tags: string[] = [];
  let priority: Priority = 0;
  let day: string | null = null;
  let from: string | null = null;
  let to: string | null = null;
  let minutes: number | null = null;
  let dayNamed = false;

  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void): void => {
    const m = re.exec(text);
    if (!m) return;
    fn(m);
    text = text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length);
  };

  // The kind, said first.
  take(/^\s*(?:\/|)(todo|task|note|event)\b:?\s*/i, (m) => {
    const k = m[1].toLowerCase();
    kind = k === 'todo' || k === 'task' ? 'task' : k === 'note' ? 'note' : 'event';
  });
  // Tags, anywhere.
  text = text.replace(/(^|\s)#([\p{L}\p{N}_-]+)/gu, (_, sp: string, t: string) => {
    const tag = tagOf(t);
    if (tag && !tags.includes(tag)) tags.push(tag);
    return sp;
  });
  // Priority: a bang or two on its own or at the end of a word.
  take(/(?:^|\s)(!{1,2})(?=\s|$)|(!{1,2})$/, (m) => {
    priority = (m[1] ?? m[2]).length >= 2 ? 2 : 1;
  });
  // A full date first, so its digits never read as a time.
  take(/\b(\d{4})-(\d{2})-(\d{2})\b/, (m) => {
    day = monthDay(today, Number(m[2]) - 1, Number(m[3]), Number(m[1]));
    dayNamed = !!day;
  });
  // Duration: "for 45m", "for 1h", "for 1.5 hours", "for 90 min".
  take(/\bfor\s+(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\b/i, (m) => {
    const n = Number(m[1]);
    minutes = Math.round(/^h/.test(m[2].toLowerCase()) ? n * 60 : n);
  });
  // A range of times: 3-4pm, 3pm-4pm, 15:00-16:30, from 3 to 4pm.
  take(new RegExp(`(?:\\b(?:at|from)\\s+)?(?<![\\d:-])\\b${HOUR}\\s*(?:-|–|to)\\s*${HOUR}\\b(?![\\d:-])`, 'i'), (m) => {
    const ampm2 = m[6]?.toLowerCase();
    const ampm1 = m[3]?.toLowerCase() ?? ampm2;
    const a = clock(m[1], m[2], ampm1, !m[2]);
    const b = clock(m[4], m[5], ampm2, !m[5]);
    if (a && b) {
      from = a;
      to = b;
      if (to <= from && !ampm2 && !m[5]) to = timeOfMinutes(minutesOf(b) + 12 * 60);
    }
  });
  if (!from) {
    take(/\b(noon|midday|midnight|tonight)\b/i, (m) => {
      const w = m[1].toLowerCase();
      from = w === 'midnight' ? '00:00' : w === 'tonight' ? '20:00' : '12:00';
      if (w === 'tonight') day ??= today;
    });
  }
  if (!from) {
    // One time: 3pm, 3:30pm, 15:00, at 3, @3pm.
    take(new RegExp(`(?:\\b(?:at)\\s+|@\\s*)${HOUR}\\b|(?<![\\d:-])\\b(\\d{1,2}):(\\d{2})\\s*(am|pm)?\\b(?![\\d:-])|(?<![\\d:-])\\b(\\d{1,2})\\s*(am|pm)\\b`, 'i'), (m) => {
      if (m[1]) from = clock(m[1], m[2], m[3]?.toLowerCase(), !m[2]);
      else if (m[4]) from = clock(m[4], m[5], m[6]?.toLowerCase(), false);
      else from = clock(m[7], undefined, m[8]?.toLowerCase(), false);
    });
  }
  // The day.
  take(/\b(today|tomorrow|tmrw|yesterday)\b/i, (m) => {
    const w = m[1].toLowerCase();
    day = w === 'today' ? today : w === 'yesterday' ? addDays(today, -1) : addDays(today, 1);
    dayNamed = true;
  });
  if (!dayNamed) take(/\bnext\s+(week|month)\b/i, (m) => {
    day = m[1].toLowerCase() === 'week' ? nextWeekday(today, 1) : addDays(today, 30);
    dayNamed = true;
  });
  if (!dayNamed) take(/\bin\s+(\d+|a|an)\s+(day|days|week|weeks|month|months)\b/i, (m) => {
    const n = /^\d/.test(m[1]) ? Number(m[1]) : 1;
    const u = m[2].toLowerCase();
    day = addDays(today, u.startsWith('day') ? n : u.startsWith('week') ? n * 7 : n * 30);
    dayNamed = true;
  });
  if (!dayNamed) take(new RegExp(`\\b(?:on\\s+)?(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'i'), (m) => {
    const mo = MONTH_NAMES[m[1].toLowerCase()] ?? MONTH_NAMES[m[1].toLowerCase().slice(0, 3)];
    if (mo !== undefined) day = monthDay(today, mo, Number(m[2]), m[3] ? Number(m[3]) : undefined);
    dayNamed = !!day;
  });
  if (!dayNamed) take(new RegExp(`\\b(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_RE})\\.?(?:,?\\s+(\\d{4}))?\\b`, 'i'), (m) => {
    const mo = MONTH_NAMES[m[2].toLowerCase()] ?? MONTH_NAMES[m[2].toLowerCase().slice(0, 3)];
    if (mo !== undefined) day = monthDay(today, mo, Number(m[1]), m[3] ? Number(m[3]) : undefined);
    dayNamed = !!day;
  });
  if (!dayNamed) take(new RegExp(`\\b(?:(?:on|next|this)\\s+)?(${DAY_RE})\\b`, 'i'), (m) => {
    const wd = DAY_NAMES[m[1].toLowerCase()] ?? DAY_NAMES[m[1].toLowerCase().slice(0, 3)];
    if (wd !== undefined) {
      day = nextWeekday(today, wd);
      dayNamed = true;
    }
  });

  // What is left is the text: stray "at", "on", commas and doubled spaces go.
  text = text.replace(/\s+(at|on|from)\s*$/i, '').replace(/\s*,\s*$/, '').replace(/\s{2,}/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();

  // Assignments inside take() are invisible to TypeScript's narrowing: read the results once.
  const got = { kind, day, from, to, minutes, priority } as { kind: ItemKind | null; day: string | null; from: string | null; to: string | null; minutes: number | null; priority: Priority };
  const k: ItemKind = got.kind ?? (got.from ? 'event' : got.day ? 'task' : 'note');
  let start: string | null = null;
  let end: string | null = null;
  let due: string | null = null;
  if (got.from) {
    const d = got.day ?? today;
    start = stampOf(d, got.from);
    const endTime = got.to ?? (got.minutes != null ? timeOfMinutes(minutesOf(got.from) + got.minutes) : k === 'event' ? timeOfMinutes(minutesOf(got.from) + 60) : null);
    if (endTime) end = stampOf(endTime < got.from ? addDays(d, 1) : d, endTime);
    if (k === 'task') due = d;
  } else if (got.day) {
    if (k === 'event') {
      start = got.day;
      end = got.day;
    } else due = got.day;
  } else if (k === 'event') {
    start = today;
    end = today;
  }
  return { kind: k, text, body, tags, priority: got.priority, due, start, end };
}

/** What quick-add understood, as a line under the composer: "Event · Tomorrow 15:00–16:00 · #sales · urgent". */
export function describeQuick(q: Quick, today: string): string {
  const parts: string[] = [q.kind === 'task' ? 'Task' : q.kind === 'event' ? 'Event' : 'Note'];
  const item = { ...q, id: '', at: 0, status: '', done: false, doneAt: null, pinned: false, doc: null, spent: 0, clock: null, by: { kind: 'human', name: '' }, updated: 0, order: 0 } as FlowItem;
  const when = whenLabel(item, today);
  if (when) parts.push(when);
  for (const t of q.tags) parts.push('#' + t);
  if (q.priority) parts.push(PRIORITIES[q.priority]);
  return parts.join(' · ');
}

/** The fields a new item gets from quick-add, as a record. */
export function recordOf(q: Quick, by: Who, now: number, firstColumn: string): Record<string, Json> {
  return {
    kind: q.kind, text: q.text, body: q.body, tags: q.tags, status: q.kind === 'task' ? firstColumn : '', done: false, doneAt: null,
    due: q.due, start: q.start, end: q.end, priority: q.priority, pinned: false, doc: null, spent: 0, clock: null,
    by: by as unknown as Json, updated: now, order: now,
  };
}
