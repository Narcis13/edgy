// Rows for the table cell: which columns, in what order, searched and sorted.

import type { Json } from '../../core/types';
import { type Rec, isRecord, records } from '../../core/table';

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
export function sortRows(rows: Rec[], sort: Sort): Rec[] {
  if (!sort) return rows;
  const k = sort.key;
  const sign = sort.dir === 'asc' ? 1 : -1;
  return rows
    .map((r, i) => [r, i] as const)
    .sort(([a, i], [b, j]) => {
      const ea = empty(a[k]), eb = empty(b[k]);
      if (ea || eb) return ea === eb ? i - j : ea ? 1 : -1;
      return compareValues(a[k], b[k]) * sign || i - j;
    })
    .map(([r]) => r);
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
