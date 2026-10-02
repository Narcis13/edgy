// The table cell as a grid: a header people sort by and resize, rows in
// groups that fold, picks, row actions, subtotals and totals.

import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, X } from 'lucide-react';
import { show } from '../../core/sx';
import { color } from '../editor/look';
import { cx } from '../editor/ctx';
import { type Column, type Row, type Sort, alignOf, nextSort, pickState } from './rows';
import { AddColumn, type Block, CellInput, type Model, PickBox, ResizeHandle, RowActions, Value } from './table-bits';

interface Props {
  m: Model;
  label?: string;
  sort: Sort;
  setSort: (s: Sort) => void;
  header: string;
  /** A column's width while it is dragged, else as saved. */
  widthOf: (c: Column) => number | undefined;
  resize: ((c: Column, w: number | null, final: boolean) => void) | null;
}

export function Grid({ m, label, sort, setSort, header, widthOf, resize }: Props) {
  const { cols, select, actions, editable } = m;
  const span = cols.length + (select ? 1 : 0) + (actions.length ? 1 : 0) + (editable ? 1 : 0);
  const all = m.found;
  const align = (c: Column) => `is-${alignOf(c, m.numeric.has(c.key))}`;
  let n = 0;

  const extra = (kind: 'head' | 'foot') => (
    <>
      {actions.length > 0 && (kind === 'head' ? <th className="ktable-acts" scope="col"><span className="sr-only">Actions</span></th> : <td className="ktable-acts" />)}
      {editable && (kind === 'head' ? <th className="ktable-edit" scope="col"><AddColumn add={m.addColumn} /></th> : <td className="ktable-edit" />)}
    </>
  );

  const cellOf = (row: Row, c: Column) => {
    const v = row.rec[c.key];
    const text = m.text(row.rec, c);
    const at = m.editAt;
    if (editable && at && at.i === row.i && at.key === c.key) {
      return <td key={c.key} className={cx('is-editing', align(c))}><CellInput at={at} initial={m.initial(at)} label={c.label} commit={m.commit} /></td>;
    }
    const w = widthOf(c);
    const clip = !c.wrap;
    return (
      <td
        key={c.key} className={cx(align(c), c.bold && 'is-bold')} style={c.color ? { color: color(c.color) } : undefined}
        onDoubleClick={editable ? (e) => { e.stopPropagation(); m.startEdit({ i: row.i, key: c.key }); } : undefined}>
        <div className={cx('ktable-v', clip ? 'is-clip' : 'is-wrap')} style={w ? { maxWidth: `calc(${w}px - 2 * var(--kt-px))` } : undefined}
          title={clip && text && (!c.show || c.show === 'text' || c.show === 'link') ? text : typeof v === 'object' && v !== null ? show(v) : undefined}>
          <Value v={v} c={c} text={text} q={m.q} />
        </div>
      </td>
    );
  };

  const rowOf = (row: Row, k: number) => {
    n += 1;
    const on = m.picked.has(row.key);
    const name = cols[0] ? m.text(row.rec, cols[0]) : '';
    return (
      <tr key={row.i} data-ev-index={row.i} className={cx(on && 'is-picked', m.stripes && k % 2 === 1 && 'is-alt', m.live && select && 'is-pickable')}
        onClick={(e) => m.rowClick(row, e)}>
        {select && <td className="ktable-pick"><PickBox mode={select} on={on} label={`Pick ${name || `row ${n}`}`} onToggle={() => m.pick(row)} /></td>}
        {cols.map((c) => cellOf(row, c))}
        {actions.length > 0 && <td className="ktable-acts"><RowActions actions={actions} name={name} run={(a) => m.run(a, row)} /></td>}
        {editable && (
          <td className="ktable-edit">
            <button type="button" className="ktable-del" aria-label={`Delete row ${n}`} title="Delete this row"
              onClick={(e) => { e.stopPropagation(); m.removeRow(row); }} onDoubleClick={(e) => e.stopPropagation()}>
              <X size={14} aria-hidden />
            </button>
          </td>
        )}
      </tr>
    );
  };

  const sums = (rows: Row[], word: string, cls: string) => (
    <tr className={cls}>
      {select && <td className="ktable-pick" />}
      {cols.map((c, k) => (
        <td key={c.key} className={cx(align(c), k === 0 && !c.total && 'is-word')}>
          {c.total ? m.total(c, rows) : k === 0 ? word : ''}
        </td>
      ))}
      {extra('foot')}
    </tr>
  );

  const groupHead = (b: Block) => {
    const g = b.group!;
    const state = pickState(m.picked, g.rows.map((r) => r.key));
    return (
      <tr className="ktable-ghead">
        <th colSpan={span} scope="rowgroup">
          <div className="ktable-ghead-in">
            {select === 'many' && (
              <PickBox mode="many" on={state === 'all'} mixed={state === 'some'} label={`Pick every row in ${g.label}`}
                onToggle={() => m.pickAll(g.rows, state !== 'all')} />
            )}
            {m.page ? <span className="ktable-gname">{g.label}</span> : (
              <button type="button" className="ktable-gtoggle" aria-expanded={b.open} onClick={() => m.fold(g)}>
                <ChevronRight size="1.1em" aria-hidden className="ktable-chev" />
                <span className="ktable-gname">{g.label}</span>
              </button>
            )}
            <span className="ktable-gcount">{g.rows.length}</span>
          </div>
        </th>
      </tr>
    );
  };

  const headState = pickState(m.picked, all.map((r) => r.key));
  return (
    <div className="ktable-scroll">
      <table className="data ktable-grid">
        {label && <caption className="sr-only">{label}</caption>}
        <colgroup>
          {select && <col className="ktable-col-pick" />}
          {cols.map((c) => {
            const w = widthOf(c);
            return <col key={c.key} style={w ? { width: w } : undefined} />;
          })}
          {actions.length > 0 && <col />}
          {editable && <col className="ktable-col-edit" />}
        </colgroup>
        {header !== 'none' && (
          <thead>
            <tr>
              {select && (
                <th className="ktable-pick" scope="col">
                  {select === 'many'
                    ? <PickBox mode="many" on={headState === 'all' && all.length > 0} mixed={headState === 'some'} label="Pick every row shown" onToggle={() => m.pickAll(all, headState !== 'all')} />
                    : <span className="sr-only">Picked</span>}
                </th>
              )}
              {cols.map((c) => {
                const dir = sort?.key === c.key ? sort.dir : null;
                const Arrow = dir === 'asc' ? ArrowUp : dir === 'desc' ? ArrowDown : ArrowUpDown;
                const w = widthOf(c);
                const cap = w ? { maxWidth: `${w}px` } : undefined;
                return (
                  <th key={c.key} scope="col" className={cx(align(c), dir && 'is-sorted')}
                    aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}>
                    {m.page ? <span className="ktable-th" style={cap}>{c.label}</span> : (
                      <button type="button" className="ktable-th" style={cap} onClick={() => setSort(nextSort(sort, c.key))} title={`Sort by ${c.label}`}>
                        <span>{c.label}</span><Arrow size="1em" aria-hidden />
                      </button>
                    )}
                    {resize && (
                      <ResizeHandle label={c.label} width={w}
                        live={(px) => resize(c, px, false)} done={(px) => resize(c, px, true)} />
                    )}
                  </th>
                );
              })}
              {extra('head')}
            </tr>
          </thead>
        )}
        {m.blocks.map((b, k) => (
          <tbody key={b.group ? 'g:' + b.group.value : k}>
            {b.group && groupHead(b)}
            {b.rows.map(rowOf)}
            {b.group && b.open && m.totals.length > 0 && sums(b.group.rows, 'Subtotal', 'ktable-sub')}
          </tbody>
        ))}
        {m.totals.length > 0 && <tfoot>{sums(all, 'Total', 'ktable-total')}</tfoot>}
      </table>
    </div>
  );
}
