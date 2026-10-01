// What the table designer writes: where the rows come from, typed rows and
// fields, and the expressions behind the row-button presets. Pure, so tested.

import type { Cell, Json, Op, Sx } from '../../../core/types';
import { addKey, detectKeys, dropColumn, dropKey, type Rec, renameColumn, renameKey, resolveColumns } from '../../kinds/rows';

export type Source = 'typed' | 'saved' | 'formula';

/** Where a table's rows come from: typed into it, a saved collection, or any other expression. */
export function tableSource(cell: Cell): Source {
  if (cell.expr === undefined) return 'typed';
  return collectionOf(cell) !== null ? 'saved' : 'formula';
}

/** The collection a table reads with (rows "name"), if that is all its expression does. */
export function collectionOf(cell: Cell): string | null {
  const x = cell.expr;
  return Array.isArray(x) && x.length === 2 && x[0] === 'rows' && typeof x[1] === 'string' ? x[1] : null;
}

const typed = (cell: Cell): Json[] => (Array.isArray(cell.value) ? (cell.value as Json[]) : []);

/**
 * Switch to typed rows: the rows it shows now become its own, and the
 * expression goes. When the source shows nothing, rows typed before are kept.
 */
export function toTypedOps(cell: Cell, rows: Rec[]): Op[] {
  const value: Json = rows.length ? (rows as Json[]) : typed(cell);
  return [['set', cell.id, 'value', value], ['set', cell.id, 'expr', null]];
}

/** Read a saved collection. Typed rows stay in the value, so switching back finds them. */
export const toSavedOps = (cell: Cell, name: string): Op[] => [['set', cell.id, 'expr', ['rows', name.trim()]]];

/** A new typed row with every field, empty. */
export function addRowOps(cell: Cell): Op[] {
  const rows = typed(cell);
  const keys = detectKeys(rows as Rec[]);
  const row: Record<string, Json> = Object.fromEntries((keys.length ? keys : ['item']).map((k) => [k, '']));
  return [['set', cell.id, 'value', [...rows, row]]];
}

/** Whether a field of that name is already in the typed rows or the listed columns. */
export function hasField(cell: Cell, key: string): boolean {
  const inRows = typed(cell).some((r) => !!r && typeof r === 'object' && !Array.isArray(r) && key in r);
  const inColumns = Array.isArray(cell.columns) && cell.columns.some((s) => s === key || (!!s && typeof s === 'object' && !Array.isArray(s) && s.key === key));
  return inRows || inColumns;
}

/** A new field on every typed row (a first row when there are none); listed columns get it too. Nothing when the name is taken. */
export function addColumnOps(cell: Cell, name: string): Op[] {
  const key = name.trim();
  if (!key || hasField(cell, key)) return [];
  const rows = typed(cell);
  const ops: Op[] = [['set', cell.id, 'value', rows.length ? addKey(rows, key) : [{ [key]: '' }]]];
  if (Array.isArray(cell.columns) && cell.columns.length) ops.push(['set', cell.id, 'columns', [...(cell.columns as Json[]), key]]);
  return ops;
}

/** Rename a typed field; its column settings follow it. Nothing when the new name is taken, so no values are lost. */
export function renameFieldOps(cell: Cell, from: string, to: string): Op[] {
  const key = to.trim();
  if (!key || key === from || hasField(cell, key)) return [];
  const ops: Op[] = [['set', cell.id, 'value', renameKey(typed(cell), from, key)]];
  if (Array.isArray(cell.columns)) ops.push(['set', cell.id, 'columns', renameColumn(cell.columns, from, key)]);
  if (cell.group === from) ops.push(['set', cell.id, 'group', key]);
  return ops;
}

/** Delete a typed field from every row, and its column. */
export function deleteFieldOps(cell: Cell, key: string): Op[] {
  const ops: Op[] = [['set', cell.id, 'value', dropKey(typed(cell), key)]];
  if (Array.isArray(cell.columns)) ops.push(['set', cell.id, 'columns', dropColumn(cell.columns, key)]);
  if (cell.group === key) ops.push(['set', cell.id, 'group', null]);
  return ops;
}

/** Listed columns the rows don't have (after the source changed, say). Nothing while there are no rows. */
export function missingColumns(rows: Rec[], columns: unknown): string[] {
  if (!rows.length || !Array.isArray(columns)) return [];
  const keys = new Set(rows.slice(0, 50).flatMap((r) => Object.keys(r)));
  return resolveColumns(rows, columns).map((c) => c.key).filter((k) => !keys.has(k));
}

/** The `columns` prop without the given keys; null when nothing is left. */
export function withoutColumns(columns: unknown, keys: string[]): Json {
  let out: Json = Array.isArray(columns) ? (columns as Json[]) : null;
  for (const k of keys) out = dropColumn(out, k);
  return out;
}

/** Let people pick one row, many, or none ("off" also forgets what was picked). */
export function pickingOps(cell: Cell, mode: string): Op[] {
  if (mode === 'one' || mode === 'many') return cell.select === mode ? [] : [['set', cell.id, 'select', mode]];
  const ops: Op[] = [];
  if (cell.select !== undefined) ops.push(['set', cell.id, 'select', null]);
  if (cell.selected !== undefined) ops.push(['set', cell.id, 'selected', null]);
  return ops;
}

/** Typed text as the value it most likely means: numbers and true/false as themselves. */
export function literal(raw: string): Json {
  const t = raw.trim();
  if (t === 'true' || t === 'false') return t === 'true';
  if (t !== '' && /^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return raw;
}

const rowId: Sx = ['get', '$row', 'id'];

/** A row button that changes one field of the clicked record. */
export const changeFieldDo = (collection: string, field: string, raw: string): Sx => ['update!', collection, rowId, { [field]: literal(raw) }];

/** A row button that deletes the clicked record. */
export const deleteDo = (collection: string): Sx => ['delete!', collection, rowId];

/** A row button that copies a field of the clicked row into an input cell. */
export const copyDo = (input: string, field: string): Sx => ['set!', input, ['get', '$row', field]];

/** The first of base1, base2, … that no cell uses as a name or id. */
export function freeName(base: string, taken: Set<string>): string {
  for (let i = 1; ; i++) if (!taken.has(base + i)) return base + i;
}

/** A list with item i moved by delta (−1 up, 1 down); unchanged at the ends. */
export function moved<T>(list: T[], i: number, delta: number): T[] {
  const j = i + delta;
  if (j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** Up to `max` distinct non-empty values of a field, as text, in order of appearance. */
export function distinctValues(rows: Rec[], key: string, max = 12): string[] {
  const out: string[] = [];
  for (const r of rows) {
    const v = r[key];
    if (v == null || v === '' || typeof v === 'object') continue;
    const s = String(v);
    if (!out.includes(s)) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}
