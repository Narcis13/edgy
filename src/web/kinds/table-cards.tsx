// The table cell on a narrow width: each row a card, under group headings
// that fold, with the totals after the last card.

import { ChevronRight, X } from 'lucide-react';
import { color } from '../editor/look';
import { cx } from '../editor/ctx';
import { type Column, type Row, pickState } from './rows';
import { CellInput, type Model, PickBox, RowActions, Value } from './table-bits';

export function Cards({ m, label }: { m: Model; label?: string }) {
  const { cols, select, actions, editable } = m;
  let n = 0;

  const value = (row: Row, c: Column) => {
    const at = m.editAt;
    if (editable && at && at.i === row.i && at.key === c.key) return <CellInput at={at} initial={m.initial(at)} label={c.label} commit={m.commit} />;
    const v = row.rec[c.key];
    const text = m.text(row.rec, c);
    if (editable && (v == null || v === '')) return <span className="hint">Empty</span>;
    return <Value v={v} c={c} text={text} q={m.q} />;
  };
  const edit = (row: Row, c: Column) =>
    editable ? (e: React.MouseEvent) => { e.stopPropagation(); m.startEdit({ i: row.i, key: c.key }); } : undefined;
  const style = (c: Column) => ({ ...(c.color ? { color: color(c.color) } : {}) });

  const card = (row: Row) => {
    n += 1;
    const on = m.picked.has(row.key);
    const first = cols[0];
    const name = first ? m.text(row.rec, first) : '';
    const rest = cols.slice(1).filter((c) => editable || (row.rec[c.key] != null && row.rec[c.key] !== ''));
    return (
      <li key={row.i} className={cx('ktable-card', on && 'is-picked', m.live && select && 'is-pickable')} onClick={(e) => m.rowClick(row, e)}>
        <div className="ktable-card-head">
          {select && <PickBox mode={select} on={on} label={`Pick ${name || `row ${n}`}`} onToggle={() => m.pick(row)} />}
          {first && (
            <div className="ktable-card-title" style={style(first)} onDoubleClick={edit(row, first)}>
              {value(row, first)}
            </div>
          )}
          {editable && (
            <button type="button" className="ktable-del" aria-label={`Delete row ${n}`} title="Delete this row"
              onClick={(e) => { e.stopPropagation(); m.removeRow(row); }}>
              <X size={16} aria-hidden />
            </button>
          )}
        </div>
        {rest.length > 0 && (
          <dl>
            {rest.map((c) => (
              <div key={c.key}>
                <dt>{c.label}</dt>
                <dd className={cx(m.numeric.has(c.key) && 'num', c.bold && 'is-bold')} style={style(c)} onDoubleClick={edit(row, c)}>{value(row, c)}</dd>
              </div>
            ))}
          </dl>
        )}
        {actions.length > 0 && (
          <div className="ktable-card-foot"><RowActions actions={actions} name={name} run={(a) => m.run(a, row)} /></div>
        )}
      </li>
    );
  };

  const sums = (rows: Row[], word: string) => (
    <dl className="ktable-csum" aria-label={word}>
      <div className="ktable-csum-word"><dt>{word}</dt><dd /></div>
      {m.totals.map((c) => (
        <div key={c.key}><dt>{c.label}</dt><dd className="num">{m.total(c, rows)}</dd></div>
      ))}
    </dl>
  );

  return (
    <div className="ktable-cardlist">
      {m.blocks.map((b, k) => {
        const g = b.group;
        const state = g ? pickState(m.picked, g.rows.map((r) => r.key)) : 'none';
        return (
          <section key={g ? 'g:' + g.value : k} className={cx('ktable-cgroup', g && 'is-group')}>
            {g && (
              <div className="ktable-cghead">
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
            )}
            {b.rows.length > 0 && <ul className="ktable-cards" aria-label={g ? g.label : label ?? 'Rows'}>{b.rows.map(card)}</ul>}
            {g && b.open && m.totals.length > 0 && sums(g.rows, 'Subtotal')}
          </section>
        );
      })}
      {m.totals.length > 0 && sums(m.found, 'Total')}
    </div>
  );
}
