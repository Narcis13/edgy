// The strip under the header: the selected cell's name and its source, the
// way a spreadsheet shows a cell's formula.

import { Maximize2, Sparkles } from 'lucide-react';
import type { Json } from '../../core/types';
import { isGroup } from '../../core/types';
import { show } from '../../core/sx';
import { display, plainValue } from '../../core/engine';
import { openStudio } from '../code/store';
import { SxField, TextField } from './fields';
import { KIND_LABEL, cx, useS, useSession } from './ctx';
import { kindOption } from './KindMenu';

const PLACEHOLDER: Record<string, string> = {
  formula: '(* qty price)', chart: '(list 3 5 2)', table: '(rows "orders")', stat: '(sum (column (rows "orders") "total"))',
  calendar: '(rows "events")', list: '(map (get it "name") (rows "people"))',
};

export function FormulaBar() {
  const session = useSession();
  const id = useS((s) => s.selection.at(-1));
  const doc = useS((s) => s.doc);
  const st = useS((s) => (id ? s.computed?.cells[id] : undefined));
  const cell = id ? session.cell(id) : undefined;
  const set = (path: string, value: Json) => cell && session.dispatch(['set', cell.id, path, value]);

  if (!doc) return null;
  if (!cell) {
    return (
      <div className="fbar is-empty">
        <span className="fbar-name">{doc.meta.title}</span>
        <span className="fbar-hint">Select a cell. Its formula or text shows here.</span>
      </div>
    );
  }
  const opt = isGroup(cell) ? undefined : kindOption(cell.kind, cell.type);
  let source: React.ReactNode;
  let result: React.ReactNode = null;
  /** The property the code buttons open, when the cell holds code. */
  let code: string | null = null;
  const error = st?.error ? <span className="fbar-result is-error" title={st.error}>{st.error}</span> : null;
  switch (cell.kind) {
    case 'formula':
    case 'chart':
    case 'table':
    case 'stat':
    case 'calendar':
      code = 'expr';
      source = <SxField key={cell.id} value={cell.expr} cell={cell.id} prop="expr" placeholder={PLACEHOLDER[cell.kind]} className="bar" width={110} onCommit={(x) => set('expr', x)} />;
      result = error ?? (cell.kind === 'formula' || cell.kind === 'stat'
        ? <span className="fbar-result">= {display(cell, st, doc) || show(plainValue(st?.value)) || '—'}</span>
        : null);
      break;
    case 'list':
      if (cell.expr !== undefined) {
        code = 'expr';
        source = <SxField key={cell.id} value={cell.expr} cell={cell.id} prop="expr" placeholder={PLACEHOLDER.list} className="bar" width={110} onCommit={(x) => set('expr', x)} />;
        result = error;
      } else source = <span className="fbar-hint">Items are edited in the cell.</span>;
      break;
    case 'text':
      source = <TextField key={cell.id} value={cell.text ?? ''} multiline placeholder="Text, with {{templates}}" onCommit={(v) => set('text', v)} label="Text" />;
      break;
    case 'input':
      if (cell.type === 'select') code = 'options';
      source = <TextField key={cell.id} value={cell.value == null ? '' : String(cell.value)} mono placeholder="value" label="Value"
        onCommit={(v) => set('value', cell.type === 'number' || cell.type === 'slider' || cell.type === 'rating' ? (v.trim() === '' ? null : Number(v)) : cell.type === 'checkbox' || cell.type === 'toggle' ? ['true', 'yes', '1', 'on'].includes(v.trim().toLowerCase()) : v)} />;
      result = error;
      break;
    case 'button':
      code = 'do';
      source = <SxField key={cell.id} value={cell.do} cell={cell.id} prop="do" label="Action" placeholder="(set! count (+ count 1))" className="bar" width={110} onCommit={(x) => set('do', x)} />;
      break;
    case 'image':
      source = <TextField key={cell.id} value={cell.src ?? ''} placeholder="https://…" onCommit={(v) => set('src', v || null)} label="Picture link" />;
      break;
    case 'icon':
      source = <TextField key={cell.id} value={cell.icon ?? ''} mono placeholder="sparkles" onCommit={(v) => set('icon', v.trim() || null)} label="Icon name" />;
      break;
    case 'canvas':
      source = <span className="fbar-hint">Draw in the cell.</span>;
      break;
    case 'break':
      source = <span className="fbar-hint">A page break: the next cell starts a new printed page.</span>;
      break;
    case 'empty':
      source = <span className="fbar-hint">Type into the cell, or press / to choose what it holds.</span>;
      break;
    default:
      source = <span className="fbar-hint">{KIND_LABEL[cell.kind] ?? cell.kind} of {cell.children?.length} cells. Select one inside to edit it.</span>;
  }
  // Keep the field's focus (and its draft) while pressing these; the studio takes the draft over.
  const keep = (e: React.PointerEvent) => e.preventDefault();
  return (
    <div className={cx('fbar', st?.error && 'has-error')}>
      <span className="fbar-name" title={cell.id}>
        {opt && <opt.icon size={14} strokeWidth={1.75} />}
        {cell.name ? <b>{cell.name}</b> : <span className="faint">{cell.id}</span>}
      </span>
      <div className="fbar-source">{source}</div>
      {result}
      {code && (
        <div className="fbar-code" role="group" aria-label="Code tools">
          <button type="button" className="icon-btn" title="Open in the code studio (⌘E)" aria-label="Open in the code studio"
            onPointerDown={keep} onClick={() => openStudio({ cell: cell.id, prop: code })}>
            <Maximize2 size={15} />
          </button>
          <button type="button" className="icon-btn fbar-ask" title="Ask AI to write it" aria-label="Ask AI to write it"
            onPointerDown={keep} onClick={() => openStudio({ cell: cell.id, prop: code, tab: 'ask' })}>
            <Sparkles size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
