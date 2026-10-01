// The table designer: where the rows come from, the columns, grouping and
// picking, buttons on every row, and the table's look.

import { useEffect, useState } from 'react';
import { Ban, Columns3, Grid3x3, Plus, Rows3, Square } from 'lucide-react';
import { indexTree } from '../../../../core/tree';
import { pickRows } from '../../../../core/table';
import { type Rec, detectKeys, records } from '../../../kinds/rows';
import { api } from '../../../lib/api';
import { SxField, TextField } from '../../fields';
import { cx, useS, useSession } from '../../ctx';
import { Chips, FormatSelect, Hint, Prop, Sub, Tiles, Toggle, stop } from '../controls';
import type { Edit } from '../edit';
import { LOOK_DEFAULTS, TABLE_LOOKS, lookOps, lookValue, matchLook } from '../presets';
import { type Source, addColumnOps, addRowOps, collectionOf, freeName, hasField, pickingOps, tableSource, toSavedOps, toTypedOps } from '../tableOps';
import { TableActions } from './TableActions';
import { TableColumns } from './TableColumns';
import { DENSITY } from './ListPanel';
import type { KindProps } from './types';

export function TablePanel({ e, st }: KindProps) {
  const rows = records(st?.value);
  const source = tableSource(e.cell);
  const keys = detectKeys(rows);
  return (
    <div className="ins-table">
      <Sub>Data</Sub>
      <TableData e={e} rows={rows} source={source} />
      <Sub>Columns</Sub>
      <TableColumns e={e} rows={rows} typed={source === 'typed'} />
      {rows.length > 0 && (
        <Prop label="Numbers in every column" onReset={e.cell.format ? () => e.set('format', null) : undefined}>
          <FormatSelect value={e.cell.format} label="Number format for every column" onChange={(v) => e.set('format', v)} />
        </Prop>
      )}
      <Sub>Rows</Sub>
      <TableRows e={e} keys={keys} rows={rows} />
      <Sub>Row buttons</Sub>
      <TableActions e={e} rows={rows} keys={keys} collection={collectionOf(e.cell)} />
      <Sub>Look</Sub>
      <TableLook e={e} />
    </div>
  );
}

// ── data ──

function TableData({ e, rows, source }: { e: Edit; rows: Rec[]; source: Source }) {
  const c = e.cell;
  const [pending, setPending] = useState<Source | null>(null);
  const shown = pending ?? source;
  const [col, setCol] = useState<string | null>(null);
  const session = useSession();
  const addColumn = () => {
    const name = (col ?? '').trim();
    if (!name) return;
    if (hasField(c, name)) return session.toast(`There is already a column called “${name}”.`);
    e.ops(addColumnOps(c, name));
    setCol(null);
  };
  const choose = (s: Source) => {
    if (s === source) return setPending(null);
    if (s === 'typed') {
      e.ops(toTypedOps(c, rows));
      setPending(null);
    } else setPending(s);
  };
  const n = Array.isArray(c.value) ? c.value.length : 0;
  return (
    <>
      <Prop label="Rows come from">
        <Chips label="Rows come from" value={shown} onChange={choose}
          options={[{ value: 'typed', label: 'Typed here' }, { value: 'saved', label: 'Saved records' }, { value: 'formula', label: 'Formula' }]} />
      </Prop>
      {shown === 'typed' && (
        <>
          <Hint>{n ? `${n} ${n === 1 ? 'row' : 'rows'}. Double-click a cell in the table to change it.` : 'No rows yet. Add a column, then rows.'}</Hint>
          <div className="ins-line">
            <button type="button" className="btn soft small" onClick={() => e.ops(addRowOps(c))}><Plus size={14} /> Add a row</button>
            <button type="button" className="btn soft small" aria-expanded={col !== null} onClick={() => setCol(col === null ? '' : null)}><Plus size={14} /> Add a column</button>
          </div>
          {col !== null && (
            <div className="ins-line">
              <input className="text-field" autoFocus value={col} placeholder="Column name, e.g. price" aria-label="New column name"
                onChange={(ev) => setCol(ev.target.value)}
                onKeyDown={(ev) => {
                  ev.stopPropagation();
                  if (ev.key === 'Enter' && col.trim()) addColumn();
                  if (ev.key === 'Escape') setCol(null);
                }} />
              <button type="button" className="btn solid small" disabled={!col.trim()} onClick={addColumn}>Add</button>
            </div>
          )}
        </>
      )}
      {shown === 'saved' && (
        <Prop label="Collection" hint="Records saved by buttons in any document.">
          <CollectionPick current={collectionOf(c)} onPick={(name) => { e.ops(toSavedOps(c, name)); setPending(null); }} />
        </Prop>
      )}
      {shown === 'formula' && (
        <Prop label="Formula" hint="Any formula giving a list of records.">
          <SxField value={c.expr} cell={c.id} prop="expr" preview placeholder='(where (rows "orders") "paid" true)' onCommit={(x) => { e.set('expr', x); setPending(null); }} />
        </Prop>
      )}
    </>
  );
}

function CollectionPick({ current, onPick }: { current: string | null; onPick: (name: string) => void }) {
  const [list, setList] = useState<{ name: string; count: number }[] | null>(null);
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    let live = true;
    api<{ name: string; count: number }[]>('GET', '/api/data').then((l) => live && setList(l)).catch(() => live && setList([]));
    return () => { live = false; };
  }, []);
  const names = list ?? [];
  return (
    <>
      <select className="text-field" aria-label="Collection" value={adding ? '__new' : current ?? ''} onKeyDown={stop}
        onChange={(ev) => {
          const v = ev.target.value;
          if (v === '__new') setAdding(true);
          else if (v) { setAdding(false); onPick(v); }
        }}>
        <option value="" disabled>{list === null ? 'Loading…' : names.length ? 'Choose a collection…' : 'No collections yet'}</option>
        {names.map((c) => <option key={c.name} value={c.name}>{c.name} · {c.count} {c.count === 1 ? 'record' : 'records'}</option>)}
        {current && !names.some((c) => c.name === current) && <option value={current}>{current}</option>}
        <option value="__new">New collection…</option>
      </select>
      {adding && <TextField value="" label="New collection name" placeholder="orders" mono onCommit={(v) => { if (v.trim()) { setAdding(false); onPick(v.trim()); } }} />}
    </>
  );
}

// ── rows ──

function TableRows({ e, keys, rows }: { e: Edit; keys: string[]; rows: Rec[] }) {
  const c = e.cell;
  const root = useS((s) => s.doc?.root);
  const picking = c.select === 'one' || c.select === 'many' ? c.select : 'off';
  // Only picks of rows that are still there count, as in the table itself.
  const picked = pickRows(rows, c.selected).length;
  const nameIt = () => {
    if (!root) return;
    const idx = indexTree(root);
    e.set('name', freeName('table', new Set([...idx.byName.keys(), ...idx.byId.keys()])));
  };
  return (
    <>
      <Prop label="Group by" hint="Rows with the same value sit under one heading.">
        <select className="text-field" aria-label="Group by" value={c.group ?? ''} onKeyDown={stop} onChange={(ev) => e.set('group', ev.target.value || null)}>
          <option value="">No grouping</option>
          {keys.map((k) => <option key={k} value={k}>{k}</option>)}
          {c.group && !keys.includes(c.group) && <option value={c.group}>{c.group}</option>}
        </select>
      </Prop>
      <Prop label="Picking rows" hint={picking === 'off' ? 'Let people pick rows for other cells to use.' : undefined}>
        <Chips label="Picking rows" value={picking} onChange={(v) => e.ops(pickingOps(c, v))}
          options={[{ value: 'off', label: 'Off' }, { value: 'one', label: 'One' }, { value: 'many', label: 'Many' }]} />
      </Prop>
      {picking !== 'off' && (c.name ? (
        <Hint>Other cells read the picked rows with <code>(selected {c.name})</code>.</Hint>
      ) : (
        <div className="ins-line">
          <Hint>Name the table so other cells can read what is picked.</Hint>
          <button type="button" className="btn soft small" onClick={nameIt}>Name this table</button>
        </div>
      ))}
      {picked > 0 && (
        <div className="ins-line">
          <span className="ins-count">{picked} picked</span>
          <button type="button" className="ins-link" onClick={() => e.set('selected', null)}>Clear</button>
        </div>
      )}
    </>
  );
}

// ── look ──

/** A small table drawn with the look's lines, header and stripes. */
function MiniTable({ props }: { props: Record<string, unknown> }) {
  return (
    <span className={cx('ins-mini', `b-${props.borders}`, `h-${props.header}`, props.stripes === true && 'is-striped', `d-${props.density}`)}>
      {[0, 1, 2, 3].map((r) => <span key={r} className="ins-mini-row">{[0, 1, 2].map((k) => <span key={k} />)}</span>)}
    </span>
  );
}

const BORDERS = [
  { value: 'rows', label: <Rows3 size={15} />, title: 'Between rows' },
  { value: 'columns', label: <Columns3 size={15} />, title: 'Between columns' },
  { value: 'grid', label: <Grid3x3 size={15} />, title: 'Grid' },
  { value: 'outer', label: <Square size={15} />, title: 'Only around' },
  { value: 'none', label: <Ban size={15} />, title: 'No lines' },
];

function TableLook({ e }: { e: Edit }) {
  const c = e.cell;
  const look = matchLook(c);
  const setLook = (k: string, v: unknown) => e.set(k, v === LOOK_DEFAULTS[k] ? null : (v as string));
  return (
    <>
      <Prop label="Quick looks">
        <Tiles label="Quick looks" value={look?.id} onChange={(id) => e.ops(lookOps(c, TABLE_LOOKS.find((l) => l.id === id)!))}
          options={TABLE_LOOKS.map((l) => ({ value: l.id, label: l.label, art: <MiniTable props={l.props} /> }))} />
      </Prop>
      <Prop label="Lines" aside={<span className="ins-value">{BORDERS.find((b) => b.value === lookValue(c, 'borders'))?.title}</span>}>
        <Chips label="Lines" value={lookValue(c, 'borders') as string} onChange={(v) => setLook('borders', v)} options={BORDERS} />
      </Prop>
      <Prop label="Header row">
        <Chips label="Header row" value={lookValue(c, 'header') as string} onChange={(v) => setLook('header', v)}
          options={[{ value: 'plain', label: 'Plain' }, { value: 'filled', label: 'Filled' }, { value: 'strong', label: 'Strong' }, { value: 'none', label: 'None' }]} />
      </Prop>
      <Prop label="Row spacing">
        <Chips label="Row spacing" value={lookValue(c, 'density') as string} onChange={(v) => setLook('density', v)} options={DENSITY} />
      </Prop>
      <div className="ins-pair">
        <Toggle on={c.stripes === true} onChange={(on) => e.set('stripes', on ? true : null)}>Stripes</Toggle>
        <Toggle on={c.search !== false} onChange={(on) => e.set('search', on ? null : false)}>Search box</Toggle>
      </div>
      <Prop label="Title">
        <TextField value={c.label ?? ''} label="Title" placeholder="Shown above the table" onCommit={(v) => e.set('label', v || null)} />
      </Prop>
    </>
  );
}
