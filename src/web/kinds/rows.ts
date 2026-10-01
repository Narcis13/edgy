// Rows for the table cell: which columns, in what order, searched, sorted,
// grouped and totalled; and the small changes people make to typed rows.

import type { Json } from '../../core/types';
import { type Rec, isRecord, records, rowKey, selectedKeys } from '../../core/table';
import { show } from '../../core/sx';

export { type Rec, records };

/** A column as the table draws it: the `columns` prop's record with defaults filled in. */
export interface Column {
  key: string;
  label: string;
  format?: string;
  /** Pixels; unset, the column takes what its content needs. */
  width?: number;
  align?: 'start' | 'center' | 'end';
  /** text, badge, progress, check, link, stars. */
  show?: string;
  /** A badge's colour for each value: {"Paid": "live"}. */
  colors?: Record<string, string>;
  /** A colour token for the whole column. */
  color?: string;
  bold?: boolean;
  wrap?: boolean;
  /** sum, avg, count, min, max: shown in the totals row and under each group. */
  total?: string;
}

export type Sort = { key: string; dir: 'asc' | 'desc' } | null;

/** The fields the first rows have, in the order they appear; id is left out. */
export const detectKeys = (rows: Rec[]): string[] => [...new Set(rows.slice(0, 50).flatMap((r) => Object.keys(r)))].filter((k) => k !== 'id');

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

function columnOf(spec: unknown): Column | null {
  if (typeof spec === 'string' && spec) return { key: spec, label: spec };
  if (!isRecord(spec) || typeof spec.key !== 'string' || !spec.key) return null;
  const c: Column = { key: spec.key, label: str(spec.label) ?? spec.key };
  if (str(spec.format)) c.format = spec.format as string;
  if (typeof spec.width === 'number' && spec.width > 0) c.width = Math.round(spec.width);
  if (spec.align === 'start' || spec.align === 'center' || spec.align === 'end') c.align = spec.align;
  if (str(spec.show)) c.show = spec.show as string;
  if (isRecord(spec.colors)) c.colors = Object.fromEntries(Object.entries(spec.colors).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
  if (str(spec.color)) c.color = spec.color as string;
  if (spec.bold === true) c.bold = true;
  if (spec.wrap === true) c.wrap = true;
  if (str(spec.total)) c.total = spec.total as string;
  return c;
}

/** The `columns` prop when it names any, otherwise every field the rows have. */
export function resolveColumns(rows: Rec[], columns: unknown): Column[] {
  if (Array.isArray(columns)) {
    const seen = new Set<string>();
    const out = columns.map(columnOf).filter((c): c is Column => !!c && !seen.has(c.key) && !!seen.add(c.key));
    if (out.length) return out;
  }
  return detectKeys(rows).map((key) => ({ key, label: key }));
}

/** Rows where any shown column's text contains the query, ignoring case. */
export function filterRows(rows: Rec[], cols: Column[], q: string, text: (r: Rec, c: Column) => string): Rec[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((r) => cols.some((c) => text(r, c).toLowerCase().includes(needle)));
}

const empty = (v: unknown) => v == null || v === '';

/** Numbers as numbers, text as text with numbers inside it in order; empty values last either way. */
export function compareValues(a: unknown, b: unknown): number {
  if (empty(a) || empty(b)) return empty(a) && empty(b) ? 0 : empty(a) ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  const sa = typeof a === 'string' ? a : JSON.stringify(a);
  const sb = typeof b === 'string' ? b : JSON.stringify(b);
  return sa.localeCompare(sb, undefined, { numeric: true, sensitivity: 'base' });
}

/** A sorted copy; empty values stay at the end in both directions. */
export const sortRows = (rows: Rec[], sort: Sort): Rec[] => sortBy(rows, sort, (r) => r);

function sortBy<T>(items: T[], sort: Sort, rec: (t: T) => Rec): T[] {
  if (!sort) return items;
  const k = sort.key;
  const sign = sort.dir === 'asc' ? 1 : -1;
  return items
    .map((t, i) => [rec(t), t, i] as const)
    .sort(([a, , i], [b, , j]) => {
      const ea = empty(a[k]), eb = empty(b[k]);
      if (ea || eb) return ea === eb ? i - j : ea ? 1 : -1;
      return compareValues(a[k], b[k]) * sign || i - j;
    })
    .map(([, t]) => t);
}

/** Clicking a header: ascending, then descending, then back to the original order. */
export function nextSort(sort: Sort, key: string): Sort {
  if (sort?.key !== key) return { key, dir: 'asc' };
  return sort.dir === 'asc' ? { key, dir: 'desc' } : null;
}

/** Text split around every match of the query, for highlighting. */
export function marks(text: string, q: string): { text: string; hit: boolean }[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [{ text, hit: false }];
  const out: { text: string; hit: boolean }[] = [];
  const low = text.toLowerCase();
  let at = 0;
  for (let i = low.indexOf(needle); i >= 0; i = low.indexOf(needle, at)) {
    if (i > at) out.push({ text: text.slice(at, i), hit: false });
    out.push({ text: text.slice(i, i + needle.length), hit: true });
    at = i + needle.length;
  }
  if (at < text.length) out.push({ text: text.slice(at), hit: false });
  return out;
}

export function ago(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export const rowCount = (shown: number, total: number): string =>
  shown === total ? `${total} ${total === 1 ? 'row' : 'rows'}` : `${shown} of ${total} ${total === 1 ? 'row' : 'rows'}`;

// ── choosing columns in the inspector ──

export interface ColumnChoice {
  key: string;
  shown: boolean;
  /** As written in the `columns` prop, so labels and formats survive reordering. */
  spec: Json;
}

/** Every column people can choose from: the shown ones in order, then the rest. */
export function columnChoices(rows: Rec[], columns: unknown): ColumnChoice[] {
  const specs = Array.isArray(columns) ? (columns as Json[]) : [];
  const shown = resolveColumns(rows, columns);
  const choices: ColumnChoice[] = shown.map((c) => ({
    key: c.key,
    shown: true,
    spec: specs.find((s) => (isRecord(s) ? s.key === c.key : s === c.key)) ?? c.key,
  }));
  for (const k of detectKeys(rows)) if (!choices.some((c) => c.key === k)) choices.push({ key: k, shown: false, spec: k });
  return choices;
}

/** The `columns` prop for a set of choices; null when it says no more than the default. */
export function columnsProp(rows: Rec[], choices: ColumnChoice[]): Json {
  const shown = choices.filter((c) => c.shown);
  const keys = detectKeys(rows);
  const plain = shown.every((c) => typeof c.spec === 'string');
  if (plain && shown.length === keys.length && shown.every((c, i) => c.key === keys[i])) return null;
  return shown.map((c) => c.spec);
}

/**
 * The `columns` prop after changing one column's settings (null removes a
 * setting). Columns written as plain names become records only when they
 * need to, and the prop is first filled in from the rows when it was unset.
 */
export function patchColumn(rows: Rec[], columns: unknown, key: string, patch: Record<string, Json>): Json {
  const specs: Json[] = Array.isArray(columns) && columns.some((c) => columnOf(c)) ? (columns as Json[]) : detectKeys(rows);
  let found = false;
  const out = specs.map((s) => {
    const k = typeof s === 'string' ? s : isRecord(s) ? s.key : undefined;
    if (k !== key) return s;
    found = true;
    const rec: Record<string, Json> = typeof s === 'string' ? { key: s } : { ...(s as Record<string, Json>) };
    for (const [f, v] of Object.entries(patch)) {
      if (v === null || v === '' || v === false) delete rec[f];
      else rec[f] = v;
    }
    return Object.keys(rec).length === 1 ? key : rec;
  });
  if (!found) {
    const rec: Record<string, Json> = { key };
    for (const [f, v] of Object.entries(patch)) if (v !== null && v !== '' && v !== false) rec[f] = v;
    out.push(Object.keys(rec).length === 1 ? key : rec);
  }
  return out;
}

// ── changing typed rows (a table's value) ──

const asRecords = (rows: Json[]): Record<string, Json>[] =>
  rows.map((r) => (r && typeof r === 'object' && !Array.isArray(r) ? (r as Record<string, Json>) : {}));

/** Every typed row with `from` renamed to `to`, keeping the field's place. */
export function renameKey(rows: Json[], from: string, to: string): Json[] {
  if (!to || from === to) return rows;
  return asRecords(rows).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k === from ? to : k, v])));
}

/** Every typed row without the field. */
export const dropKey = (rows: Json[], key: string): Json[] =>
  asRecords(rows).map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== key)));

/** Every typed row with a new, empty field (or the value given). */
export const addKey = (rows: Json[], key: string, value: Json = ''): Json[] =>
  asRecords(rows).map((r) => (key in r ? r : { ...r, [key]: value }));

/** The `columns` prop after a field was renamed: its settings follow it. Null stays null. */
export function renameColumn(columns: unknown, from: string, to: string): Json {
  if (!Array.isArray(columns)) return null;
  return (columns as Json[]).map((s) => (s === from ? to : isRecord(s) && s.key === from ? { ...(s as Record<string, Json>), key: to } : s));
}

/** The `columns` prop without a field. Null stays null. */
export function dropColumn(columns: unknown, key: string): Json {
  if (!Array.isArray(columns)) return null;
  const out = (columns as Json[]).filter((s) => s !== key && !(isRecord(s) && s.key === key));
  return out.length ? out : null;
}

// ── rows that remember where they came from ──

/** A row as the table draws it: the record, its place in the data, and its key. */
export interface Row {
  rec: Rec;
  /** The position in the table's value, before any search or sort. */
  i: number;
  key: string | number;
}

/** Every record in a value with its original position and key; anything else is skipped. */
export function indexRows(value: unknown): Row[] {
  if (!Array.isArray(value)) return [];
  const out: Row[] = [];
  value.forEach((r, i) => {
    if (isRecord(r)) out.push({ rec: r, i, key: rowKey(r, i) });
  });
  return out;
}

export const findRows = (rows: Row[], cols: Column[], q: string, text: (r: Rec, c: Column) => string): Row[] => {
  const needle = q.trim().toLowerCase();
  return needle ? rows.filter((row) => cols.some((c) => text(row.rec, c).toLowerCase().includes(needle))) : rows;
};

export const orderRows = (rows: Row[], sort: Sort): Row[] => sortBy(rows, sort, (row) => row.rec);

// ── groups ──

export interface Group {
  /** The value as text; '' for rows without one. */
  value: string;
  label: string;
  rows: Row[];
}

const groupValue = (v: unknown): string => (empty(v) ? '' : typeof v === 'string' ? v : show(v));

/** Rows under the values of a field, in the order each value first appears. */
export function groupRows(rows: Row[], field: string): Group[] {
  const groups = new Map<string, Group>();
  for (const row of rows) {
    const value = groupValue(row.rec[field]);
    let g = groups.get(value);
    if (!g) groups.set(value, (g = { value, label: value || '(none)', rows: [] }));
    g.rows.push(row);
  }
  return [...groups.values()];
}

// ── totals ──

/** A number, or text that is only a number; anything else is null. */
export function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && NUMBER_RE.test(v.trim())) return Number(v.trim());
  return null;
}
const NUMBER_RE = /^-?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i;

/** sum, avg, min or max of a field's numbers (blanks and text skipped), or count of its filled values. */
export function aggregate(rows: Rec[], key: string, kind: string): number | null {
  const vals = rows.map((r) => r[key]);
  if (kind === 'count') return vals.filter((v) => !empty(v) && v !== false).length;
  const nums = vals.map(toNumber).filter((n): n is number => n !== null);
  const tidy = (n: number) => Number(n.toPrecision(12));
  if (kind === 'sum') return tidy(nums.reduce((a, b) => a + b, 0));
  if (!nums.length) return null;
  if (kind === 'avg') return tidy(nums.reduce((a, b) => a + b, 0) / nums.length);
  if (kind === 'min') return nums.reduce((a, b) => (b < a ? b : a));
  if (kind === 'max') return nums.reduce((a, b) => (b > a ? b : a));
  return null;
}

// ── how values show ──

/** A progress value as a fraction: 0..1 as given, larger numbers as percents. */
export function progressFraction(v: unknown): number | null {
  const n = toNumber(v);
  if (n === null) return null;
  return Math.max(0, Math.min(1, n > 1 ? n / 100 : n));
}

const SOFT = new Set(['accent', 'agent', 'live', 'warn', 'bad']);
const NEUTRAL = { bg: 'var(--sunken)', fg: 'var(--muted)' };

/** A badge's colours for a value: the token's soft shade behind its strong one; neutral when unmapped. */
export function badgeColors(colors: Record<string, string> | undefined, value: unknown): { bg: string; fg: string } {
  const text = groupValue(value);
  if (!colors || !text) return NEUTRAL;
  const token = colors[text] ?? Object.entries(colors).find(([k]) => k.toLowerCase() === text.toLowerCase())?.[1];
  if (!token) return NEUTRAL;
  const base = token.endsWith('-soft') ? token.slice(0, -5) : token;
  if (SOFT.has(base)) return { bg: `var(--${base}-soft)`, fg: `var(--${base})` };
  return NEUTRAL;
}

/** Whether a check column's value counts as yes. */
export const isYes = (v: unknown): boolean =>
  typeof v === 'string' ? !['', 'false', 'no', '0', 'n'].includes(v.trim().toLowerCase()) : !!v;

/** A safe address for a link column, or null. */
export function linkHref(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (/^(https?:\/\/|mailto:)/i.test(s)) return s;
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(s)) return 'https://' + s;
  if (/^[^@\s]+@[^@\s]+\.\w+$/.test(s)) return 'mailto:' + s;
  return null;
}

/** A link as people read it: without https:// and a trailing slash. */
export const linkText = (s: string): string => s.replace(/^https?:\/\//i, '').replace(/^mailto:/i, '').replace(/\/$/, '');

/** Stars out of five, or null when the value isn't a number. */
export function starCount(v: unknown): number | null {
  const n = toNumber(v);
  return n === null ? null : Math.max(0, Math.min(5, Math.round(n)));
}

/** Where a column's values sit: as set, else numbers at the end and checks in the middle. */
export function alignOf(c: Column, numeric: boolean): 'start' | 'center' | 'end' {
  if (c.align) return c.align;
  if (c.show === 'check') return 'center';
  return numeric && (!c.show || c.show === 'text') ? 'end' : 'start';
}

export const MIN_WIDTH = 48;

/** A column width people dragged to, kept within sense. */
export const clampWidth = (w: number): number => Math.max(MIN_WIDTH, Math.min(2000, Math.round(w)));

// ── picking rows ──

type Key = string | number;

/** The picked keys after picking or unpicking one row; with "one", picking replaces. */
export function togglePick(selected: unknown, key: Key, mode: string): Key[] {
  const keys = selectedKeys(selected);
  const on = keys.includes(key);
  if (mode === 'one') return on ? [] : [key];
  return on ? keys.filter((k) => k !== key) : [...keys, key];
}

/** The picked keys after picking (or unpicking) all of `keys` at once. */
export function pickMany(selected: unknown, keys: Key[], on: boolean): Key[] {
  const now = selectedKeys(selected);
  if (!on) return now.filter((k) => !keys.includes(k));
  return [...now, ...keys.filter((k) => !now.includes(k))];
}

/** Whether all, some or none of these keys are picked. */
export function pickState(picked: Set<Key>, keys: Key[]): 'all' | 'some' | 'none' {
  const n = keys.filter((k) => picked.has(k)).length;
  return n === 0 ? 'none' : n === keys.length ? 'all' : 'some';
}

/** The picked keys that still name a row; the rest are ignored. */
export const livePicks = (selected: unknown, rows: Row[]): Set<Key> => {
  const have = new Set(rows.map((r) => r.key));
  return new Set(selectedKeys(selected).filter((k) => have.has(k)));
};

// ── row actions ──

export interface RowAction {
  label: string;
  do: Json;
  icon?: string;
  variant: 'solid' | 'soft' | 'ghost';
  confirm?: string;
}

/** The `actions` prop as buttons; entries without something to do are skipped. */
export function rowActions(v: unknown): RowAction[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isRecord).filter((a) => a.do != null).map((a) => ({
    label: typeof a.label === 'string' ? a.label : '',
    do: a.do as Json,
    ...(str(a.icon) ? { icon: a.icon as string } : {}),
    variant: a.variant === 'solid' || a.variant === 'soft' ? a.variant : 'ghost',
    ...(str(a.confirm) ? { confirm: a.confirm as string } : {}),
  }));
}

const ICON_WORDS: Record<string, string> = {
  'trash-2': 'Delete', pencil: 'Edit', 'pen-line': 'Edit', check: 'Done', 'circle-check': 'Done', x: 'Remove', 'circle-x': 'Remove',
  minus: 'Remove', plus: 'Add', copy: 'Copy', 'external-link': 'Open', send: 'Send', download: 'Download', 'share-2': 'Share',
  'undo-2': 'Undo', eye: 'View', mail: 'Email',
};

/** What an action is called, also when it shows only an icon. */
export function actionName(a: Pick<RowAction, 'label' | 'icon'>): string {
  if (a.label) return a.label;
  if (!a.icon) return 'Run';
  const words = ICON_WORDS[a.icon] ?? a.icon.replace(/-\d+$/, '').replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// ── editing typed rows in place ──

/** A value as people type it again: plain, without the formatting it shows with. */
export const rawText = (v: unknown): string =>
  v == null ? '' : typeof v === 'string' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v);

/**
 * What typed text becomes: a number when the column's other values are
 * numbers, true/false in a check column, otherwise the text itself.
 */
export function coerce(text: string, others: unknown[], showAs?: string): Json {
  const t = text.trim();
  if (t === '') return '';
  const filled = others.filter((v) => !empty(v));
  if ((showAs === 'check' || (filled.length && filled.every((v) => typeof v === 'boolean'))) && /^(true|false)$/i.test(t)) return t.toLowerCase() === 'true';
  // A number, unless the column holds text; a first value with leading zeros ("007", a postcode) stays text.
  if (NUMBER_RE.test(t) && filled.every((v) => typeof v === 'number') && (filled.length || !/^[-+]?0\d/.test(t))) return Number(t);
  return text;
}

/** Typed rows with one field of the row at original position `i` changed. */
export const setCell = (rows: Json[], i: number, key: string, value: Json): Json[] =>
  rows.map((r, j) => (j !== i ? r : { ...(isRecord(r) ? (r as Record<string, Json>) : {}), [key]: value }));

/** Typed rows with a new row at the end, every column empty. */
export const addRow = (rows: Json[], keys: string[]): Json[] => [...rows, Object.fromEntries(keys.map((k) => [k, '']))];

/** Typed rows without the row at original position `i`. */
export const deleteRow = (rows: Json[], i: number): Json[] => rows.filter((_, j) => j !== i);

/** Typed rows with a new field: every row gets it empty; with no rows yet, one row starts it. */
export const addField = (rows: Json[], key: string): Json[] => (rows.length ? addKey(rows, key) : [{ [key]: '' }]);

export interface At {
  i: number;
  key: string;
}

/**
 * The next cell to edit, through the rows as shown: down (Enter), or on to the
 * next or previous column, wrapping into the next or previous row (Tab).
 */
export function moveEdit(order: number[], keys: string[], at: At, how: 'down' | 'next' | 'prev'): At | null {
  const r = order.indexOf(at.i);
  const c = keys.indexOf(at.key);
  if (r < 0 || c < 0) return null;
  if (how === 'down') return r + 1 < order.length ? { i: order[r + 1], key: at.key } : null;
  const flat = r * keys.length + c + (how === 'next' ? 1 : -1);
  if (flat < 0 || flat >= order.length * keys.length) return null;
  return { i: order[Math.floor(flat / keys.length)], key: keys[flat % keys.length] };
}

/**
 * The width at or below which rows become cards: a small table keeps its grid
 * in a narrow cell, a wide one gives way sooner. Never above 560px.
 */
export const cardsAt = (columns: number, picking: boolean, actions: number): number =>
  Math.min(560, Math.round(110 * columns + (picking ? 40 : 0) + 44 * actions));

/** A column whose filled values (among the first rows) are all numbers. */
export function numericColumn(rows: Rec[], key: string): boolean {
  let any = false;
  for (const r of rows.slice(0, 50)) {
    const v = r[key];
    if (v == null || v === '') continue;
    if (typeof v !== 'number') return false;
    any = true;
  }
  return any && key !== 'at';
}

/**
 * The picks after the typed row at position `i` was deleted: rows known by
 * their position move up one, so picks keep pointing at the same rows.
 * Rows known by an id are untouched.
 */
export function picksAfterDelete(selected: unknown, deleted: Rec, i: number): Json {
  const keys = selectedKeys(selected);
  if (rowKey(deleted, i) !== i) return keys.length ? keys : null;
  const next = keys.filter((k) => k !== i).map((k) => (typeof k === 'number' && k > i ? k - 1 : k));
  return next.length ? next : null;
}
