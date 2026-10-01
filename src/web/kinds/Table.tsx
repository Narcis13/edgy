// A table cell: records as rows people can search and sort. In a narrow cell
// (or on a phone) each row becomes a card.

import { useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Search, X } from 'lucide-react';
import type { Cell } from '../../core/types';
import type { CellState } from '../../core/engine';
import { formatValue, show } from '../../core/sx';
import { cx, useS } from '../editor/ctx';
import { type Column, type Rec, type Sort, ago, filterRows, marks, nextSort, records, resolveColumns, rowCount, sortRows } from './rows';
import { ownKeys, useBox, useCurrency } from './shared';
import './kinds.css';

const PAGE = 200;
const CARDS_AT = 560;

export function TableView({ cell, st }: { cell: Cell; st: CellState | undefined }) {
  const now = useS((s) => s.now);
  const currency = useCurrency();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>(null);
  const [limit, setLimit] = useState(PAGE);
  const [ref, { w }] = useBox<HTMLDivElement>();
  const label = (st?.props?.label as string | undefined) ?? cell.label;

  const rows = records(st?.value);
  const cols = resolveColumns(rows, cell.columns);
  const numeric = new Set(cols.filter((c) => isNumeric(rows, c.key)).map((c) => c.key));
  const text = (r: Rec, c: Column): string => {
    const v = r[c.key];
    if (c.key === 'at' && !c.format && typeof v === 'number' && v > 1e12) return ago(v, now);
    const format = c.format ?? (typeof v === 'number' ? cell.format : undefined);
    return format ? formatValue(v, format, currency, now) : show(v);
  };
  const found = filterRows(rows, cols, q, text);
  const sorted = sortRows(found, sort && cols.some((c) => c.key === sort.key) ? sort : null);
  const shown = sorted.slice(0, limit);
  const cards = w > 0 && w <= CARDS_AT;
  const search = (v: string) => {
    setQ(v);
    setLimit(PAGE);
  };
  const hi = (r: Rec, c: Column) => marks(text(r, c), q).map((p, i) => (p.hit ? <mark key={i}>{p.text}</mark> : p.text));
  const key = (r: Rec, i: number) => (typeof r.id === 'string' || typeof r.id === 'number' ? String(r.id) : i);

  if (st?.error) return null;
  return (
    <div className={cx('ktable', cards && 'is-cards')} ref={ref} onKeyDown={ownKeys}>
      <div className="ktable-bar">
        {label && <span className="kind-label ktable-title">{label}</span>}
        {rows.length > 0 && <span className="ktable-count">{rowCount(found.length, rows.length)}</span>}
        {rows.length > 0 && (
          <label className="ktable-search">
            <Search size={14} aria-hidden />
            <input type="search" value={q} placeholder="Search" aria-label={`Search ${label ?? 'the table'}`}
              onChange={(e) => search(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape' && q) { e.stopPropagation(); search(''); } }} />
            {q && <button type="button" className="ktable-clear" aria-label="Clear the search" onClick={() => search('')}><X size={13} /></button>}
          </label>
        )}
        {cards && rows.length > 1 && (
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

      {shown.length > 0 && !cards && (
        <div className="ktable-scroll">
          <table className="data ktable-grid">
            {label && <caption className="sr-only">{label}</caption>}
            <thead>
              <tr>
                {cols.map((c) => {
                  const dir = sort?.key === c.key ? sort.dir : null;
                  const Arrow = dir === 'asc' ? ArrowUp : dir === 'desc' ? ArrowDown : ArrowUpDown;
                  return (
                    <th key={c.key} scope="col" className={cx(numeric.has(c.key) && 'num', dir && 'is-sorted')}
                      aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}>
                      <button type="button" onClick={() => setSort(nextSort(sort, c.key))} title={`Sort by ${c.label}`}>
                        <span>{c.label}</span><Arrow size={12} aria-hidden />
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={key(r, i)}>
                  {cols.map((c) => <td key={c.key} className={cx(numeric.has(c.key) && 'num')} title={isNested(r[c.key]) ? show(r[c.key]) : undefined}>{hi(r, c)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {shown.length > 0 && cards && (
        <ul className="ktable-cards" aria-label={label ?? 'Rows'}>
          {shown.map((r, i) => (
            <li key={key(r, i)} className="ktable-card">
              <div className="ktable-card-title">{hi(r, cols[0])}</div>
              {cols.length > 1 && (
                <dl>
                  {cols.slice(1).filter((c) => r[c.key] != null && r[c.key] !== '').map((c) => (
                    <div key={c.key}>
                      <dt>{c.label}</dt>
                      <dd className={cx(numeric.has(c.key) && 'num')}>{hi(r, c)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </li>
          ))}
        </ul>
      )}

      {sorted.length > limit && (
        <div className="ktable-more">
          <span>Showing {limit} of {sorted.length}</span>
          <button type="button" className="btn ghost" onClick={() => setLimit((n) => n + PAGE)}>Show more</button>
        </div>
      )}
    </div>
  );
}

const isNested = (v: unknown) => typeof v === 'object' && v !== null;

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
