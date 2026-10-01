// A table cell: records as rows people can search, sort, group, pick and act
// on. Typed rows change in place in Edit mode. In a narrow cell (or on a
// phone) each row becomes a card; on the printed page every row shows.

import { useRef, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import type { Cell, Json, Op, Sx } from '../../core/types';
import type { CellState } from '../../core/engine';
import { TOTALS, isRecord, typedRows } from '../../core/table';
import { formatValue, show } from '../../core/sx';
import { cx, useS, useSession } from '../editor/ctx';
import {
  type At, type Column, type Group, type Rec, type Sort,
  addField, addRow, aggregate, ago, cardsAt, coerce, deleteRow, findRows, groupRows, indexRows, livePicks, moveEdit,
  orderRows, patchColumn, pickMany, progressFraction, rawText, resolveColumns, rowActions, rowCount, setCell, togglePick,
} from './rows';
import { AddColumn, type Block, type Model, type Then } from './table-bits';
import { Grid } from './table-grid';
import { Cards } from './table-cards';
import { ownKeys, useBox, useCurrency } from './shared';
import './kinds.css';
import './table.css';

const PAGE = 200;
const pick = <T extends string>(v: unknown, all: readonly T[], d: T): T => (all.includes(v as T) ? (v as T) : d);

export function TableView({ cell, st }: { cell: Cell; st: CellState | undefined }) {
  const session = useSession();
  const now = useS((s) => s.now);
  const mode = useS((s) => s.mode);
  const currency = useCurrency();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>(null);
  const [limit, setLimit] = useState(PAGE);
  const [folded, setFolded] = useState<Set<string>>(() => new Set());
  const [drag, setDrag] = useState<{ key: string; w: number } | null>(null);
  const [editAt, setEditAt] = useState<At | null>(null);
  const editing = useRef<At | null>(null);
  const [ref, { w }] = useBox<HTMLDivElement>();

  const page = mode === 'page';
  const label = (st?.props?.label as string | undefined) ?? cell.label;
  const rows = indexRows(st?.value);
  const recs = rows.map((r) => r.rec);
  const cols = resolveColumns(recs, cell.columns);
  const numeric = new Set(cols.filter((c) => isNumeric(recs, c.key)).map((c) => c.key));
  const typed = typedRows(cell);
  const editable = mode === 'edit' && typed !== null;
  const select = page ? null : cell.select === 'one' || cell.select === 'many' ? cell.select : null;
  const actions = page ? [] : rowActions(cell.actions);
  const header = pick(cell.header, ['plain', 'filled', 'strong', 'none'] as const, 'plain');
  const searchable = cell.search !== false && !page;
  const query = searchable ? q : '';
  const cards = w > 0 && w <= cardsAt(cols.length, !!select, actions.length);
  const group = typeof cell.group === 'string' && cell.group ? cell.group : null;

  const text = (r: Rec, c: Column): string => {
    const v = r[c.key];
    if (c.key === 'at' && !c.format && typeof v === 'number' && v > 1e12) return ago(v, now);
    const format = c.format ?? (typeof v === 'number' ? cell.format : undefined);
    return format ? formatValue(v, format, currency, now) : show(v);
  };
  const found = findRows(rows, cols, query, text);
  const sorted = orderRows(found, sort && cols.some((c) => c.key === sort.key) ? sort : null);
  const groups: (Group | null)[] = group ? groupRows(sorted, group) : [null];

  // What is drawn: open groups' rows, up to the "show more" limit.
  const blocks: Block[] = [];
  let budget = page ? Infinity : limit;
  let openRows = 0;
  for (const g of groups) {
    const open = page || !g || !folded.has(g.value);
    const list = g ? g.rows : sorted;
    if (open) openRows += list.length;
    if (budget <= 0) continue;
    const take = open ? list.slice(0, budget) : [];
    budget -= take.length;
    blocks.push({ group: g, open, rows: take });
  }
  const order = blocks.flatMap((b) => b.rows.map((r) => r.i));

  const picked = livePicks(cell.selected, rows);
  // Picks are read from the document as it is now, so quick clicks in a row each count.
  const nowPicked = () => livePicks(session.cell(cell.id)?.selected, rows);
  const savePicks = (keys: (string | number)[]) =>
    session.dispatch(['set', cell.id, 'selected', keys.length ? keys : null], { transition: false });
  const totals = cols.filter((c) => (TOTALS as readonly string[]).includes(c.total ?? ''));

  const search = (v: string) => {
    setQ(v);
    setLimit(PAGE);
  };
  const fold = (g: Group) => setFolded((f) => {
    const next = new Set(f);
    if (!next.delete(g.value)) next.add(g.value);
    return next;
  });
  const allGroups = group ? (groups as Group[]) : [];
  const allFolded = allGroups.length > 0 && allGroups.every((g) => folded.has(g.value));

  // Typed rows, changed in place.
  const setRows = (next: Json[], extra: Op[] = []) =>
    session.dispatch([['set', cell.id, 'value', next], ...extra], { key: cell.id + ':value', transition: false });
  const startEdit = (at: At | null) => {
    editing.current = at;
    setEditAt(at);
  };
  const valueAt = (at: At): unknown => {
    const r = typed?.[at.i];
    return isRecord(r) ? r[at.key] : undefined;
  };
  const commit = (at: At, input: string, then: Then) => {
    if (editing.current !== at || !typed) return;
    const old = valueAt(at);
    if (then !== 'cancel' && input !== rawText(old)) {
      const others = typed.flatMap((r, j) => (j !== at.i && isRecord(r) ? [r[at.key]] : []));
      const v = coerce(input, others, cols.find((c) => c.key === at.key)?.show);
      if (v !== (old ?? '')) setRows(setCell(typed, at.i, at.key, v));
    }
    const move = then === 'down' || then === 'next' || then === 'prev' ? then : null;
    startEdit(move ? moveEdit(order, cols.map((c) => c.key), at, move) : null);
  };
  const addColumn = (name: string): boolean => {
    const key = name.trim();
    if (!key || !typed) return false;
    if (cols.some((c) => c.key === key) || typed.some((r) => isRecord(r) && key in r)) {
      session.toast(`There is already a column called “${key}”.`);
      return false;
    }
    const keep = Array.isArray(cell.columns) && cell.columns.length ? [['set', cell.id, 'columns', [...(cell.columns as Json[]), key]] as Op] : [];
    setRows(addField(typed, key), keep);
    if (!typed.length) startEdit({ i: 0, key });
    return true;
  };
  const addOne = () => {
    if (!typed || !cols.length) return;
    setRows(addRow(typed, cols.map((c) => c.key)));
    search('');
    setLimit((l) => Math.max(l, typed.length + 1));
    if (group) setFolded((f) => { const next = new Set(f); next.delete(''); return next; });
    startEdit({ i: typed.length, key: cols[0].key });
  };

  const m: Model = {
    cell, cols, numeric, q: query, page, live: mode === 'live', select, picked,
    pick: (row) => savePicks(togglePick([...nowPicked()], row.key, select ?? 'many')),
    pickAll: (list, on) => savePicks(pickMany([...nowPicked()], list.map((r) => r.key), on)),
    actions,
    run: (a, row) => session.run(cell.id, { do: a.do as Sx, vars: { row: row.rec, it: row.rec } }),
    text, found: sorted, blocks, grouped: !!group, fold, totals,
    total: (c, list) => totalText(c, list.map((r) => r.rec), cell.format, currency, now),
    stripes: cell.stripes === true,
    editable, editAt: editable ? editAt : null, startEdit, commit,
    initial: (at) => rawText(valueAt(at)),
    removeRow: (row) => { if (typed) setRows(deleteRow(typed, row.i)); },
    addColumn,
    rowClick: (row, e) => {
      if (mode !== 'live' || !select) return;
      if ((e.target as HTMLElement).closest('button, a, input, select, textarea, label, .ktable-ask')) return;
      m.pick(row);
    },
  };

  const resize = page || cards || header === 'none' ? null : (c: Column, px: number | null, final: boolean) => {
    if (!final) return setDrag(px === null ? null : { key: c.key, w: px });
    session.dispatch(['set', cell.id, 'columns', patchColumn(recs, cell.columns, c.key, { width: px })], { transition: false, key: cell.id + ':columns' });
    setDrag(null);
  };
  const widthOf = (c: Column) => (drag?.key === c.key ? drag.w : c.width);

  if (st?.error) return null;
  return (
    <div
      className={cx('ktable', cards && 'is-cards', editable && 'is-editable', page && 'is-page')} ref={ref} onKeyDown={ownKeys}
      data-borders={pick(cell.borders, ['rows', 'columns', 'grid', 'outer', 'none'] as const, 'rows')}
      data-header={header} data-density={pick(cell.density, ['compact', 'normal', 'roomy'] as const, 'normal')}>
      <div className="ktable-bar">
        {label && <span className="kind-label ktable-title">{label}</span>}
        {rows.length > 0 && <span className="ktable-count">{rowCount(found.length, rows.length)}</span>}
        {picked.size > 0 && select && (
          <span className="ktable-picked">
            {picked.size} picked · <button type="button" className="link-btn" onClick={() => savePicks([])}>Clear</button>
          </span>
        )}
        {group && !page && rows.length > 0 && (
          <button type="button" className="btn ghost ktable-foldall" onClick={() => setFolded(allFolded ? new Set() : new Set(allGroups.map((g) => g.value)))}>
            {allFolded ? 'Expand all' : 'Collapse all'}
          </button>
        )}
        {searchable && rows.length > 0 && (
          <label className="ktable-search">
            <Search size={14} aria-hidden />
            <input type="search" value={q} placeholder="Search" aria-label={`Search ${label ?? 'the table'}`}
              onChange={(e) => search(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape' && q) { e.stopPropagation(); search(''); } }} />
            {q && <button type="button" className="ktable-clear" aria-label="Clear the search" onClick={() => search('')}><X size={13} /></button>}
          </label>
        )}
        {cards && !page && rows.length > 1 && (
          <select className="ktable-sort" aria-label="Sort by" value={sort ? `${sort.dir}:${sort.key}` : ''}
            onChange={(e) => {
              const v = e.target.value;
              setSort(v ? { dir: v.slice(0, v.indexOf(':')) as 'asc' | 'desc', key: v.slice(v.indexOf(':') + 1) } : null);
            }}>
            <option value="">Original order</option>
            {cols.map((c) => [
              <option key={'a' + c.key} value={`asc:${c.key}`}>{c.label} {numeric.has(c.key) ? '1 → 9' : 'A → Z'}</option>,
              <option key={'d' + c.key} value={`desc:${c.key}`}>{c.label} {numeric.has(c.key) ? '9 → 1' : 'Z → A'}</option>,
            ])}
          </select>
        )}
      </div>

      {!rows.length && <p className="ktable-note">No rows yet</p>}
      {rows.length > 0 && !found.length && (
        <p className="ktable-note">
          Nothing matches “{q.trim()}” <button type="button" className="link-btn" onClick={() => search('')}>Clear</button>
        </p>
      )}

      {found.length > 0 && (cards
        ? <Cards m={m} label={label} />
        : <Grid m={m} label={label} sort={sort} setSort={setSort} header={header} widthOf={widthOf} resize={resize} />)}

      {!page && openRows > limit && (
        <div className="ktable-more">
          <span>Showing {limit} of {openRows}</span>
          <button type="button" className="btn ghost" onClick={() => setLimit((n) => n + PAGE)}>Show more</button>
        </div>
      )}

      {editable && (
        <div className="ktable-foot">
          {cols.length > 0
            ? <button type="button" className="btn ghost ktable-addrow" onClick={addOne}><Plus size={14} aria-hidden /> Add a row</button>
            : <AddColumn add={addColumn} wide />}
          {cards && cols.length > 0 && <AddColumn add={addColumn} wide />}
          <span className="ktable-hint">Double-click a cell to change it</span>
        </div>
      )}
    </div>
  );
}

/** A column's total as text: counts as whole numbers, the rest in the column's format. */
function totalText(c: Column, recs: Rec[], cellFormat: string | undefined, currency: string, now: number): string {
  const n = aggregate(recs, c.key, c.total ?? '');
  if (n === null) return '';
  if (c.total === 'count') return show(n);
  if (c.show === 'progress' && !c.format) return `${Math.round((progressFraction(n) ?? 0) * 100)}%`;
  const format = c.format ?? cellFormat;
  return format ? formatValue(n, format, currency, now) : show(n);
}

/** A column whose filled values are all numbers. */
function isNumeric(rows: Rec[], key: string): boolean {
  let any = false;
  for (const r of rows.slice(0, 50)) {
    const v = r[key];
    if (v == null || v === '') continue;
    if (typeof v !== 'number') return false;
    any = true;
  }
  return any && key !== 'at';
}

