// What a table cell holds, shared by the engine and the renderer: its rows,
// how a row is told apart from the others, and which rows are picked.

import type { Cell, Json } from './types';

export type Rec = Record<string, unknown>;

export const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The records in a value; anything else in the list is skipped. */
export const records = (v: unknown): Rec[] => (Array.isArray(v) ? v.filter(isRecord) : []);

/**
 * How a row is known: its `id` when it has one (saved records always do),
 * otherwise its position in the data. Picks and edits are stored by key.
 */
export function rowKey(r: Rec, i: number): string | number {
  const id = r.id;
  return typeof id === 'string' || (typeof id === 'number' && Number.isFinite(id)) ? id : i;
}

/** A table's `selected` prop as a list of keys. */
export const selectedKeys = (v: unknown): (string | number)[] =>
  Array.isArray(v) ? v.filter((k): k is string | number => typeof k === 'string' || typeof k === 'number') : [];

/** The rows whose keys are picked, in the table's order. */
export function pickRows(value: unknown, selected: unknown): Rec[] {
  const keys = new Set(selectedKeys(selected));
  if (!keys.size) return [];
  const all = Array.isArray(value) ? value : [];
  const out: Rec[] = [];
  all.forEach((r, i) => {
    if (isRecord(r) && keys.has(rowKey(r, i))) out.push(r);
  });
  return out;
}

/** Rows typed into the table itself (its value), when it isn't computed. */
export const typedRows = (cell: Cell): Json[] | null =>
  cell.expr === undefined ? (Array.isArray(cell.value) ? (cell.value as Json[]) : []) : null;

export const COLUMN_SHOWS = ['text', 'badge', 'progress', 'check', 'link', 'stars'] as const;
export const TOTALS = ['sum', 'avg', 'count', 'min', 'max'] as const;
export const BORDERS = ['rows', 'columns', 'grid', 'outer', 'none'] as const;
export const HEADERS = ['plain', 'filled', 'strong', 'none'] as const;
export const DENSITIES = ['compact', 'normal', 'roomy'] as const;
