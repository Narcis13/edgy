// The right-hand panel: everything about the selected cell.

import { useState } from 'react';
import {
  AlignCenter, AlignLeft, AlignRight, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart, ChevronRight, Upload,
} from 'lucide-react';
import type { Cell, Json, Op } from '../../core/types';
import { isGroup } from '../../core/types';
import { print, read, show } from '../../core/sx';
import { toNotation } from '../../core/notation';
import { plainValue } from '../../core/engine';
import { uploadPicture } from '../lib/api';
import { COLOR_TOKENS } from './look';
import { CELL_ICONS, ICON_NAMES } from './icons';
import { NumberField, Row, Seg, SxField, TextField } from './fields';
import { KIND_LABEL, cx, useS, useSession } from './ctx';
import { kindOption } from './KindMenu';

const FORMATS = [
  ['auto', 'Auto'], ['int', 'Whole number'], ['number', 'Two decimals'], ['0.0', 'One decimal'], ['percent', 'Percent'],
  ['compact', 'Compact'], ['currency', 'Currency'], ['USD', 'US dollars'], ['EUR', 'Euros'], ['GBP', 'Pounds'], ['RON', 'Lei'],
  ['date', 'Date'], ['time', 'Time'], ['datetime', 'Date and time'], ['ago', 'Time ago'],
];

export function Inspector() {
  const session = useSession();
  const selection = useS((s) => s.selection);
  const doc = useS((s) => s.doc);
  const id = selection.at(-1);
  const cell = id ? session.cell(id) : undefined;
  if (!doc) return null;
  if (!cell) return <DocPanel />;
  return <CellPanel key={cell.id} cell={cell} count={selection.length} />;
}

function DocPanel() {
  const session = useSession();
  const meta = useS((s) => s.doc!.meta);
  const set = (k: string, v: Json) => session.dispatch(['meta', k, v]);
  return (
    <div className="panel-body">
      <h2 className="panel-title">Document</h2>
      <p className="panel-note">Select a cell to see what it holds. This is the sheet itself.</p>
      <Row label="Title"><TextField value={meta.title} onCommit={(v) => set('title', v.trim() || 'Untitled')} /></Row>
      <Row label="Width"><NumberField value={typeof meta.width === 'number' ? meta.width : null} placeholder="880" min={320} max={2400} step={20} onCommit={(v) => set('width', v)} /></Row>
      <Row label="Least height"><NumberField value={typeof meta.minHeight === 'number' ? meta.minHeight : null} placeholder="560" min={0} step={40} onCommit={(v) => set('minHeight', v)} /></Row>
      <Row label="Margin"><NumberField value={typeof meta.pad === 'number' ? meta.pad : null} placeholder="28" min={0} max={200} onCommit={(v) => set('pad', v)} /></Row>
      <Row label="Currency"><TextField value={typeof meta.currency === 'string' ? meta.currency : ''} placeholder="USD" onCommit={(v) => set('currency', v.trim().toUpperCase() || null)} /></Row>
    </div>
  );
}

function CellPanel({ cell, count }: { cell: Cell; count: number }) {
  const session = useSession();
  const st = useS((s) => s.computed?.cells[cell.id]);
  const feeds = useS((s) => s.computed?.feeds[cell.id]);
  const parent = session.parent(cell.id);
  const set = (path: string, value: Json) => session.dispatch(['set', cell.id, path, value]);
  const style = (k: string, v: Json) => session.dispatch(['style', cell.id, { [k]: v }]);
  const opt = !isGroup(cell) ? kindOption(cell.kind, cell.type) : undefined;
  const crumbs: Cell[] = [];
  for (let p = parent; p; p = session.parent(p.id)) crumbs.unshift(p);

  return (
    <div className="panel-body">
      <div className="crumbs">
        {crumbs.map((c) => (
          <button key={c.id} onClick={() => session.select(c.id)}>{c.name ?? KIND_LABEL[c.kind]}<ChevronRight size={12} /></button>
        ))}
        <span>{cell.name ?? cell.id}</span>
      </div>
      <h2 className="panel-title">
        {opt ? <opt.icon size={16} strokeWidth={1.75} /> : null}
        {count > 1 ? `${count} cells` : opt?.label ?? `${KIND_LABEL[cell.kind]} of ${cell.children?.length ?? 0}`}
        <code className="id">{cell.id}</code>
      </h2>

      <Row label="Name">
        <TextField value={cell.name ?? ''} placeholder="name it to refer to it" mono onCommit={(v) => set('name', v.trim() || null)} />
      </Row>

      {isGroup(cell) && (
        <Row label="Direction">
          <Seg label="Direction" value={cell.kind} onChange={(v) => session.dispatch(['replace', cell.id, [v, groupProps(cell), ...cell.children!.map((c) => toNotation(c))]])}
            options={[{ value: 'row', label: 'Side by side' }, { value: 'col', label: 'Stacked' }]} />
        </Row>
      )}

      {cell.kind === 'formula' && (
        <>
          <Row label="Formula" stack><SxField value={cell.expr} cell={cell.id} preview placeholder="(* qty price)" onCommit={(x) => set('expr', x)} /></Row>
          <Row label="Format">
            <select className="text-field" value={cell.format ?? 'auto'} onChange={(e) => set('format', e.target.value === 'auto' ? null : e.target.value)}>
              {FORMATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Row>
        </>
      )}

      {cell.kind === 'input' && <InputProps cell={cell} set={set} />}

      {cell.kind === 'button' && (
        <>
          <Row label="Label"><TextField value={cell.label ?? ''} onCommit={(v) => set('label', v)} /></Row>
          <Row label="Does" stack><SxField value={cell.do} cell={cell.id} placeholder="(set! count (+ count 1))" onCommit={(x) => set('do', x)} /></Row>
          <Row label="Look">
            <Seg label="Look" value={cell.variant ?? 'solid'} onChange={(v) => set('variant', v === 'solid' ? null : v)}
              options={[{ value: 'solid', label: 'Solid' }, { value: 'soft', label: 'Soft' }, { value: 'ghost', label: 'Quiet' }]} />
          </Row>
        </>
      )}

      {cell.kind === 'image' && <ImageProps cell={cell} set={set} />}

      {cell.kind === 'icon' && <IconProps cell={cell} set={set} />}

      {(cell.kind === 'chart' || cell.kind === 'table') && (
        <>
          <Row label="Data" stack><SxField value={cell.expr} cell={cell.id} preview placeholder={cell.kind === 'chart' ? '(list 3 5 2)' : '(rows "orders")'} onCommit={(x) => set('expr', x)} /></Row>
          {cell.kind === 'chart' && (
            <>
              <Row label="Type">
                <select className="text-field" value={cell.type ?? 'bar'} onChange={(e) => set('type', e.target.value)}>
                  {['bar', 'line', 'area', 'donut', 'meter'].map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Row>
              <Row label="Title"><TextField value={cell.label ?? ''} onCommit={(v) => set('label', v || null)} /></Row>
              {cell.type === 'meter' && <Row label="Maximum"><NumberField value={typeof cell.max === 'number' ? cell.max : null} placeholder="1" onCommit={(v) => set('max', v)} /></Row>}
            </>
          )}
        </>
      )}

      {cell.kind === 'text' && (
        <Row label="Text" stack><TextField value={cell.text ?? ''} multiline onCommit={(v) => set('text', v)} label="Text" /></Row>
      )}

      <h3 className="panel-h">Size</h3>
      <Row label={parent?.kind === 'row' ? 'Width' : 'Height'}>
        <SizeControl cell={cell} set={set} />
      </Row>
      {isGroup(cell) && <Row label="Gap"><NumberField value={typeof cell.style?.gap === 'number' ? cell.style.gap : null} placeholder="0" min={0} max={80} onCommit={(v) => style('gap', v)} /></Row>}
      <Row label="Padding"><NumberField value={typeof cell.style?.pad === 'number' ? cell.style.pad : null} placeholder={isGroup(cell) ? '0' : '12'} min={0} max={120} onCommit={(v) => style('pad', v)} /></Row>

      <h3 className="panel-h">Look</h3>
      <Row label="Fill"><ColorPick value={cell.style?.bg} onChange={(v) => style('bg', v)} /></Row>
      <Row label="Text"><ColorPick value={cell.style?.fg} onChange={(v) => style('fg', v)} /></Row>
      <Row label="Font">
        <Seg label="Font" value={(cell.style?.font as string) ?? 'sans'} onChange={(v) => style('font', v === 'sans' ? null : v)}
          options={[{ value: 'sans', label: 'Sans' }, { value: 'serif', label: <span className="serif">Serif</span> }, { value: 'mono', label: <span className="mono">Mono</span> }]} />
      </Row>
      <Row label="Size"><NumberField value={typeof cell.style?.size === 'number' ? cell.style.size : null} placeholder="15" min={8} max={200} onCommit={(v) => style('size', v)} /></Row>
      <Row label="Weight">
        <Seg label="Weight" value={String(cell.style?.weight ?? '')} onChange={(v) => style('weight', v ? Number(v) : null)}
          options={[{ value: '', label: 'Normal' }, { value: '600', label: <b>Bold</b> }, { value: '750', label: <b style={{ fontWeight: 800 }}>Heavy</b> }]} />
      </Row>
      <Row label="Align">
        <Seg label="Horizontal alignment" value={(cell.style?.align as string) ?? 'start'} onChange={(v) => style('align', v === 'start' ? null : v)}
          options={[{ value: 'start', label: <AlignLeft size={15} />, title: 'Left' }, { value: 'center', label: <AlignCenter size={15} />, title: 'Center' }, { value: 'end', label: <AlignRight size={15} />, title: 'Right' }]} />
        <Seg label="Vertical alignment" value={(cell.style?.valign as string) ?? 'start'} onChange={(v) => style('valign', v === 'start' ? null : v)}
          options={[{ value: 'start', label: <AlignVerticalJustifyStart size={15} />, title: 'Top' }, { value: 'center', label: <AlignVerticalJustifyCenter size={15} />, title: 'Middle' }, { value: 'end', label: <AlignVerticalJustifyEnd size={15} />, title: 'Bottom' }]} />
      </Row>
      <Row label="Border">
        <Seg label="Border" value={(cell.style?.border as string) ?? 'none'} onChange={(v) => style('border', v === 'none' ? null : v)}
          options={[{ value: 'none', label: 'None' }, { value: 'all', label: 'All' }, { value: 'b', label: 'Below' }, { value: 't', label: 'Above' }]} />
      </Row>
      <Row label="Corners"><NumberField value={typeof cell.style?.radius === 'number' ? cell.style.radius : null} placeholder="0" min={0} max={80} onCommit={(v) => style('radius', v)} /></Row>

      <h3 className="panel-h">Show only when</h3>
      <Row label="Hidden if" stack>
        <SxField value={typeof cell.hidden === 'boolean' ? (cell.hidden ? true : undefined) : cell.hidden} cell={cell.id} placeholder="(= total 0)" onCommit={(x) => set('hidden', x === false ? null : x)} />
      </Row>

      {(st?.reads?.length || feeds?.length) ? (
        <>
          <h3 className="panel-h">Links</h3>
          {!!st?.reads?.length && <LinkList label="Reads" ids={st.reads} />}
          {!!feeds?.length && <LinkList label="Feeds" ids={feeds} />}
        </>
      ) : null}

      {!isGroup(cell) && (
        <>
          <h3 className="panel-h">Value</h3>
          <p className={cx('value-preview', st?.error && 'is-error')}>{st?.error ? st.error : show(plainValue(st?.value)) || '—'}</p>
        </>
      )}

      <Source cell={cell} />
    </div>
  );
}

const groupProps = (c: Cell): Record<string, Json> => {
  const p: Record<string, Json> = { id: c.id };
  if (c.name) p.name = c.name;
  if (c.size != null) p.size = c.size;
  if (c.style) p.style = c.style;
  if (c.hidden != null) p.hidden = c.hidden;
  return p;
};

function SizeControl({ cell, set }: { cell: Cell; set: (p: string, v: Json) => void }) {
  const size = cell.size ?? 1;
  const mode = size === 'hug' ? 'hug' : typeof size === 'string' ? 'fixed' : 'fill';
  return (
    <>
      <Seg label="Size" value={mode} onChange={(m) => set('size', m === 'hug' ? 'hug' : m === 'fixed' ? '160px' : null)}
        options={[{ value: 'fill', label: 'Fill', title: 'Share the space by weight' }, { value: 'hug', label: 'Hug', title: 'As small as its content' }, { value: 'fixed', label: 'Fixed', title: 'A number of pixels' }]} />
      {mode === 'fill' && <NumberField value={typeof size === 'number' ? size : 1} min={0.1} step={0.5} label="Weight" onCommit={(v) => set('size', v && v > 0 ? v : null)} />}
      {mode === 'fixed' && <NumberField value={parseInt(size as string, 10)} min={8} step={8} label="Pixels" onCommit={(v) => v && set('size', `${Math.round(v)}px`)} />}
    </>
  );
}

function ColorPick({ value, onChange }: { value: unknown; onChange: (v: Json) => void }) {
  const current = typeof value === 'string' ? value : value == null ? '' : print(value as Json);
  return (
    <div className="colors">
      <button type="button" className={cx('swatch none', !value && 'is-on')} title="None" onClick={() => onChange(null)} />
      {COLOR_TOKENS.filter((t) => t !== 'line').map((t) => (
        <button key={t} type="button" className={cx('swatch', value === t && 'is-on')} style={{ background: `var(--${t})` }} title={t} onClick={() => onChange(t)} />
      ))}
      <TextField value={current} placeholder="#hex or (if …)" label="Custom color or expression" mono onCommit={(raw) => {
        const v = raw.trim();
        if (!v) return onChange(null);
        if (v.startsWith('(')) {
          try { onChange(read(v)); } catch { /* keep the previous value */ }
        } else onChange(v);
      }} />
    </div>
  );
}

function InputProps({ cell, set }: { cell: Cell; set: (p: string, v: Json) => void }) {
  const type = cell.type ?? 'text';
  const num = (k: 'min' | 'max' | 'step') => (typeof cell[k] === 'number' ? (cell[k] as number) : null);
  return (
    <>
      <Row label="Label"><TextField value={cell.label ?? ''} placeholder="Shown above the field" onCommit={(v) => set('label', v || null)} /></Row>
      {(type === 'number' || type === 'slider') && (
        <Row label="Range">
          <NumberField value={num('min')} placeholder="min" label="Minimum" onCommit={(v) => set('min', v)} />
          <NumberField value={num('max')} placeholder="max" label="Maximum" onCommit={(v) => set('max', v)} />
          <NumberField value={num('step')} placeholder="step" label="Step" onCommit={(v) => set('step', v)} />
        </Row>
      )}
      {type === 'rating' && <Row label="Stars"><NumberField value={num('max') ?? 5} min={1} max={10} onCommit={(v) => set('max', v)} /></Row>}
      {type === 'select' && (
        <Row label="Options" stack>
          <SxField value={cell.options} cell={cell.id} placeholder='(list "Small" "Large")' onCommit={(x) => set('options', x)} />
        </Row>
      )}
      {(type === 'text' || type === 'textarea' || type === 'number') && (
        <Row label="Placeholder"><TextField value={cell.placeholder ?? ''} onCommit={(v) => set('placeholder', v || null)} /></Row>
      )}
      <Row label="Value"><TextField value={cell.value == null ? '' : String(cell.value)} mono onCommit={(v) => set('value', coerce(v, type))} /></Row>
    </>
  );
}

function coerce(v: string, type: string): Json {
  if (type === 'number' || type === 'slider' || type === 'rating') return v.trim() === '' ? null : Number(v);
  if (type === 'checkbox' || type === 'toggle') return ['true', 'yes', '1', 'on'].includes(v.trim().toLowerCase());
  return v;
}

function ImageProps({ cell, set }: { cell: Cell; set: (p: string, v: Json) => void }) {
  const session = useSession();
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Row label="Link"><TextField value={cell.src ?? ''} placeholder="https://… or {{url}}" onCommit={(v) => set('src', v || null)} /></Row>
      <Row label="Upload">
        <label className={cx('btn soft file', busy && 'is-busy')}>
          <Upload size={14} /> {busy ? 'Uploading…' : 'Choose a file'}
          <input type="file" accept="image/*" onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setBusy(true);
            try { set('src', await uploadPicture(f)); } catch (err) { session.toast(err instanceof Error ? err.message : 'Upload failed.'); } finally { setBusy(false); }
          }} />
        </label>
      </Row>
      <Row label="Fit">
        <Seg label="Fit" value={cell.fit ?? 'cover'} onChange={(v) => set('fit', v === 'cover' ? null : v)} options={[{ value: 'cover', label: 'Cover' }, { value: 'contain', label: 'Contain' }]} />
      </Row>
      <Row label="Alt text"><TextField value={cell.alt ?? ''} placeholder="Describe the picture" onCommit={(v) => set('alt', v || null)} /></Row>
    </>
  );
}

function IconProps({ cell, set }: { cell: Cell; set: (p: string, v: Json) => void }) {
  const [q, setQ] = useState('');
  const names = ICON_NAMES.filter((n) => !q || n.includes(q.toLowerCase()));
  return (
    <>
      <Row label="Icon"><input className="text-field" value={q} placeholder="Search icons" aria-label="Search icons" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></Row>
      <div className="icon-grid" role="listbox" aria-label="Icons">
        {names.map((n) => {
          const I = CELL_ICONS[n];
          return <button key={n} type="button" role="option" aria-selected={cell.icon === n} className={cx(cell.icon === n && 'is-on')} title={n} onClick={() => set('icon', n)}><I size={18} strokeWidth={1.75} /></button>;
        })}
      </div>
    </>
  );
}

function LinkList({ label, ids }: { label: string; ids: string[] }) {
  const session = useSession();
  return (
    <div className="link-list">
      <span className="prop-label">{label}</span>
      <div>
        {ids.map((id) => {
          const c = session.cell(id);
          return c ? <button key={id} className="chip" onClick={() => session.select(id)}>{c.name ?? id}</button> : null;
        })}
      </div>
    </div>
  );
}

/** The cell as an agent sees it. Edit it to replace the cell wholesale. */
function Source({ cell }: { cell: Cell }) {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const source = JSON.stringify(toNotation(cell), null, 2);
  return (
    <div className="source">
      <button className="disclosure" aria-expanded={open} onClick={() => { setOpen(!open); setText(source); setError(null); }}>
        <ChevronRight size={14} className={cx(open && 'is-open')} /> Notation
      </button>
      {open && (
        <>
          <textarea className="text-field mono" rows={Math.min(18, source.split('\n').length + 1)} value={text} spellCheck={false}
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.stopPropagation()} aria-label="Cell notation" />
          {error && <p className="field-error">{error}</p>}
          <div className="source-actions">
            <button className="btn soft" onClick={() => {
              try {
                const n = JSON.parse(text) as Json;
                const op: Op = ['replace', cell.id, n];
                if (session.dispatch(op)) setError(null);
              } catch (e) { setError(e instanceof Error ? e.message : 'Not valid JSON'); }
            }}>Replace cell</button>
            <button className="btn ghost" onClick={() => void navigator.clipboard?.writeText(source)}>Copy</button>
          </div>
        </>
      )}
    </div>
  );
}
