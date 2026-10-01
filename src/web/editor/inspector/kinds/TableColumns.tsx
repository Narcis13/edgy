// A table's columns: which show and in what order, and for each its heading,
// how values are drawn, format, alignment, width, colour and total.

import { useState } from 'react';
import { AlignCenter, AlignLeft, AlignRight, ChevronDown, ChevronRight, ChevronUp, Trash2 } from 'lucide-react';
import type { Json } from '../../../../core/types';
import { type Column, type ColumnChoice, type Rec, columnChoices, columnsProp, patchColumn, resolveColumns } from '../../../kinds/rows';
import { NumberField, TextField } from '../../fields';
import { cx } from '../../ctx';
import { Chips, FormatSelect, Hint, Prop, STRONG_TOKENS, Swatches, Toggle, colorName, stop } from '../controls';
import type { Edit } from '../edit';
import { deleteFieldOps, distinctValues, missingColumns, renameFieldOps, withoutColumns } from '../tableOps';

const SHOWS = [
  { value: 'text', label: 'Text', art: <span className="ins-col-art">Abc</span> },
  { value: 'badge', label: 'Badge', art: <span className="ins-col-art is-badge">Paid</span> },
  { value: 'progress', label: 'Progress', art: <span className="ins-col-art is-bar"><span /></span> },
  { value: 'check', label: 'Tick', art: <span className="ins-col-art">✓</span> },
  { value: 'link', label: 'Link', art: <span className="ins-col-art is-link">link</span> },
  { value: 'stars', label: 'Stars', art: <span className="ins-col-art">★★★</span> },
];

const TOTALS: [string, string][] = [['', 'No total'], ['sum', 'Sum'], ['avg', 'Average'], ['count', 'Count'], ['min', 'Smallest'], ['max', 'Largest']];

export function TableColumns({ e, rows, typed }: { e: Edit; rows: Rec[]; typed: boolean }) {
  const c = e.cell;
  const choices = columnChoices(rows, c.columns);
  const [open, setOpen] = useState<string | null>(null);
  const write = (next: ColumnChoice[]) => e.set('columns', columnsProp(rows, next));
  const swap = (i: number, j: number) => {
    const next = [...choices];
    [next[i], next[j]] = [next[j], next[i]];
    write(next);
  };
  const shown = choices.filter((x) => x.shown).length;
  const cols = resolveColumns(rows, c.columns);
  const missing = missingColumns(rows, c.columns);

  if (!choices.length) return <Hint>The columns show up once the table has rows.</Hint>;
  return (
    <>
      {missing.length > 0 && (
        <div className="ins-warn">
          <Hint>Not in the data, so they show empty: {missing.join(', ')}.</Hint>
          <button type="button" className="btn soft small" onClick={() => e.set('columns', withoutColumns(c.columns, missing))}>Remove them</button>
        </div>
      )}
      <ul className="ins-cols" aria-label="Columns">
        {choices.map((ch, i) => {
          const col = cols.find((x) => x.key === ch.key);
          const expanded = open === ch.key && ch.shown;
          return (
            <li key={ch.key} className={cx('ins-col', !ch.shown && 'is-off', expanded && 'is-open')}>
              <div className="ins-col-row">
                <input type="checkbox" checked={ch.shown} disabled={ch.shown && shown === 1} aria-label={`Show ${ch.key}`} onKeyDown={stop}
                  onChange={() => write(choices.map((x, j) => (j === i ? { ...x, shown: !x.shown } : x)))} />
                <button type="button" className="ins-col-name" aria-expanded={expanded} disabled={!ch.shown}
                  title={ch.shown ? 'Change this column' : 'Tick it to show it'} onClick={() => setOpen(expanded ? null : ch.key)}>
                  {expanded ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />}
                  <span>{col?.label ?? ch.key}</span>
                  {col && col.label !== ch.key && <small>{ch.key}</small>}
                  {col?.show && col.show !== 'text' && <small className="ins-tag">{SHOWS.find((s) => s.value === col.show)?.label ?? col.show}</small>}
                </button>
                <button type="button" className="icon-btn" aria-label={`Move ${ch.key} up`} disabled={i === 0 || !ch.shown} onClick={() => swap(i, i - 1)}><ChevronUp size={14} /></button>
                <button type="button" className="icon-btn" aria-label={`Move ${ch.key} down`} disabled={!ch.shown || !choices[i + 1]?.shown} onClick={() => swap(i, i + 1)}><ChevronDown size={14} /></button>
              </div>
              {expanded && col && <ColumnEditor e={e} rows={rows} col={col} typed={typed} onRenamed={setOpen} />}
            </li>
          );
        })}
      </ul>
      {c.columns != null && <button type="button" className="ins-link" onClick={() => e.set('columns', null)}>Show every column, as it comes</button>}
    </>
  );
}

function ColumnEditor({ e, rows, col, typed, onRenamed }: { e: Edit; rows: Rec[]; col: Column; typed: boolean; onRenamed: (key: string | null) => void }) {
  const c = e.cell;
  const key = col.key;
  const patch = (p: Record<string, Json>) => e.set('columns', patchColumn(rows, c.columns, key, p));
  const show = col.show ?? 'text';
  const values = show === 'badge' ? distinctValues(rows, key) : [];
  return (
    <div className="ins-col-editor">
      <Prop label="Heading" onReset={col.label !== key ? () => patch({ label: null }) : undefined}>
        <TextField value={col.label !== key ? col.label : ''} placeholder={key} label="Heading" onCommit={(v) => patch({ label: v.trim() && v.trim() !== key ? v.trim() : null })} />
      </Prop>
      {typed && (
        <Prop label="Field name" hint="What formulas call it. Renaming changes every row.">
          <TextField value={key} label="Field name" mono onCommit={(v) => {
            const to = v.trim();
            if (!to || to === key) return;
            e.ops(renameFieldOps(c, key, to));
            onRenamed(to);
          }} />
        </Prop>
      )}
      <Prop label="Show as">
        <Chips label="Show values as" cols={3} value={show} onChange={(v) => patch({ show: v === 'text' ? null : v })}
          options={SHOWS.map((s) => ({ value: s.value, title: s.label, label: <>{s.art}<span>{s.label}</span></> }))} />
      </Prop>
      {show === 'badge' && (
        <Prop label="Badge colours" hint={values.length ? 'One colour per value.' : 'Colours can be set once the column has values.'}>
          <div className="ins-badges">
            {values.map((v) => (
              <div key={v} className="ins-badge-row">
                <span className="ins-badge" style={col.colors?.[v] ? { background: `var(--${col.colors[v]}-soft, var(--sunken))`, color: `var(--${col.colors[v]})` } : undefined}>{v}</span>
                <Swatches value={col.colors?.[v]} label={`Colour for ${v}`} tokens={STRONG_TOKENS.filter((t) => t !== 'ink')} noneLabel="Grey"
                  onChange={(t) => {
                    const next: Record<string, Json> = { ...(col.colors ?? {}) };
                    if (t) next[v] = t;
                    else delete next[v];
                    patch({ colors: Object.keys(next).length ? next : null });
                  }} />
              </div>
            ))}
          </div>
        </Prop>
      )}
      <Prop label="Numbers as" onReset={col.format ? () => patch({ format: null }) : undefined}>
        <FormatSelect value={col.format} label="Number format for this column" onChange={(v) => patch({ format: v })} />
      </Prop>
      <div className="ins-pair">
        <Prop label="Align">
          <Chips label="Align" value={col.align ?? 'start'} onChange={(v) => patch({ align: v === 'start' ? null : v })}
            options={[
              { value: 'start', label: <AlignLeft size={15} />, title: 'Left' },
              { value: 'center', label: <AlignCenter size={15} />, title: 'Centre' },
              { value: 'end', label: <AlignRight size={15} />, title: 'Right' },
            ]} />
        </Prop>
        <Prop label="Width" aside={col.width ? <button type="button" className="ins-reset" onClick={() => patch({ width: null })}>Auto</button> : <span className="ins-value">Auto</span>}>
          <div className="ins-line">
            <NumberField value={col.width ?? null} placeholder="Auto" min={30} max={800} step={10} label="Column width in pixels" onCommit={(v) => patch({ width: v && v > 0 ? Math.round(v) : null })} />
            <span className="ins-unit">px</span>
          </div>
        </Prop>
      </div>
      <div className="ins-pair">
        <Toggle on={!!col.bold} onChange={(on) => patch({ bold: on })}>Bold</Toggle>
        <Toggle on={!!col.wrap} onChange={(on) => patch({ wrap: on })}>Wrap long text</Toggle>
      </div>
      <Prop label="Colour" aside={col.color ? <span className="ins-value">{colorName(col.color)}</span> : undefined} onReset={col.color ? () => patch({ color: null }) : undefined}>
        <Swatches value={col.color} label="Column colour" tokens={STRONG_TOKENS} onChange={(t) => patch({ color: t })} />
      </Prop>
      <Prop label="Total" hint="Shown under the table and each group.">
        <select className="text-field" aria-label="Total" value={col.total ?? ''} onKeyDown={stop} onChange={(ev) => patch({ total: ev.target.value || null })}>
          {TOTALS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Prop>
      {typed && (
        <button type="button" className="btn ghost small ins-danger" onClick={() => { e.ops(deleteFieldOps(c, key)); onRenamed(null); }}>
          <Trash2 size={14} /> Delete this column and its values
        </button>
      )}
    </div>
  );
}
