// Buttons on every row of a table. Presets write the action for people who
// don't know the formula language; Custom leaves it to them.

import { useState } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, Copy, PencilLine, Plus, Trash2, Wand2, X } from 'lucide-react';
import type { Json } from '../../../../core/types';
import { walk } from '../../../../core/tree';
import { type Rec, actionName } from '../../../kinds/rows';
import { SxField, TextField } from '../../fields';
import { cx, useS } from '../../ctx';
import { CELL_ICONS } from '../../icons';
import { Chips, Hint, IconChoice, Prop, Sub, stop } from '../controls';
import type { Edit } from '../edit';
import { changeFieldDo, copyDo, deleteDo, moved } from '../tableOps';
import { LOOKS } from './ButtonPanel';

type Action = Record<string, Json>;
type Preset = 'change' | 'delete' | 'copy' | 'custom';

const PRESETS: { value: Preset; label: string; hint: string; icon: typeof Copy }[] = [
  { value: 'change', label: 'Change a field', hint: 'e.g. mark an order Done', icon: PencilLine },
  { value: 'delete', label: 'Delete the record', hint: 'Asks first', icon: Trash2 },
  { value: 'copy', label: 'Copy into a cell', hint: 'Fill an input from the row', icon: Copy },
  { value: 'custom', label: 'Custom', hint: 'Write the action yourself', icon: Wand2 },
];

const asActions = (v: unknown): Action[] =>
  Array.isArray(v) ? v.filter((a): a is Action => !!a && typeof a === 'object' && !Array.isArray(a)) : [];

export function TableActions({ e, rows, keys, collection }: { e: Edit; rows: Rec[]; keys: string[]; collection: string | null }) {
  const c = e.cell;
  const list = asActions(c.actions);
  const [open, setOpen] = useState<number | null>(null);
  const [adding, setAdding] = useState<Preset | null>(null);
  const write = (next: Action[]) => e.set('actions', next.length ? next : null);
  const update = (i: number, patch: Action) => write(list.map((a, j) => {
    if (j !== i) return a;
    const out: Action = { ...a };
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') delete out[k];
      else out[k] = v;
    }
    return out;
  }));
  const add = (a: Action) => {
    write([...list, a]);
    setOpen(list.length);
    setAdding(null);
  };

  return (
    <>
      {list.length ? (
        <ul className="ins-actions" aria-label="Row buttons">
          {list.map((a, i) => {
            const I = typeof a.icon === 'string' ? CELL_ICONS[a.icon] : undefined;
            const expanded = open === i;
            return (
              <li key={i} className={cx('ins-action', expanded && 'is-open')}>
                <div className="ins-col-row">
                  <button type="button" className="ins-col-name" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : i)}>
                    {expanded ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />}
                    {I && <I size={14} aria-hidden />}
                    <span>{actionName({ label: typeof a.label === 'string' ? a.label : '', icon: typeof a.icon === 'string' ? a.icon : undefined })}</span>
                    {a.do == null && <small className="ins-tag is-warn">does nothing yet</small>}
                  </button>
                  <button type="button" className="icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => { write(moved(list, i, -1)); setOpen(null); }}><ChevronUp size={14} /></button>
                  <button type="button" className="icon-btn" aria-label="Move down" disabled={i === list.length - 1} onClick={() => { write(moved(list, i, 1)); setOpen(null); }}><ChevronDown size={14} /></button>
                  <button type="button" className="icon-btn" aria-label={`Remove ${typeof a.label === 'string' ? a.label : 'this button'}`} onClick={() => { write(list.filter((_, j) => j !== i)); setOpen(null); }}><X size={14} /></button>
                </div>
                {expanded && (
                  <div className="ins-col-editor">
                    <Prop label="Label">
                      <TextField value={typeof a.label === 'string' ? a.label : ''} label="Label" placeholder="Done" onCommit={(v) => update(i, { label: v.trim() || null })} />
                    </Prop>
                    <Prop label="Icon">
                      <IconChoice value={typeof a.icon === 'string' ? a.icon : undefined} onChange={(v) => update(i, { icon: v })} />
                    </Prop>
                    <Prop label="Look">
                      <Chips label="Look" value={typeof a.variant === 'string' ? a.variant : 'solid'} onChange={(v) => update(i, { variant: v === 'solid' ? null : v })} options={LOOKS} />
                    </Prop>
                    <Prop label="Ask first" hint="People must confirm before it runs.">
                      <TextField value={typeof a.confirm === 'string' ? a.confirm : ''} label="Question asked first" placeholder="Are you sure?" onCommit={(v) => update(i, { confirm: v.trim() || null })} />
                    </Prop>
                    <Prop label="What it does" hint="row is the clicked row's record.">
                      <SxField value={a.do} cell={c.id} label="What it does" placeholder='(update! "orders" (get row "id") {status "Done"})' onCommit={(x) => update(i, { do: x })} />
                    </Prop>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : <Hint>No buttons yet. They show at the end of every row.</Hint>}

      <Sub>Add a button</Sub>
      <div className="ins-presets-grid" role="group" aria-label="Add a button">
        {PRESETS.map((p) => (
          <button key={p.value} type="button" className={cx('ins-kind', adding === p.value && 'is-on')} aria-pressed={adding === p.value} onClick={() => setAdding(adding === p.value ? null : p.value)}>
            <p.icon size={16} strokeWidth={1.75} aria-hidden />
            <span className="ins-kind-label">{p.label}</span>
            <span className="ins-kind-hint">{p.hint}</span>
          </button>
        ))}
      </div>
      {adding && <AddForm key={adding} preset={adding} keys={keys} rows={rows} collection={collection} onAdd={add} onCancel={() => setAdding(null)} />}
    </>
  );
}

function Draft({ value, onChange, label, placeholder }: { value: string; onChange: (v: string) => void; label: string; placeholder?: string }) {
  return <input className="text-field" value={value} aria-label={label} placeholder={placeholder} onChange={(ev) => onChange(ev.target.value)} onKeyDown={stop} />;
}

function FieldSelect({ value, keys, onChange, label }: { value: string; keys: string[]; onChange: (v: string) => void; label: string }) {
  return (
    <select className="text-field" aria-label={label} value={value} onKeyDown={stop} onChange={(ev) => onChange(ev.target.value)}>
      {keys.map((k) => <option key={k} value={k}>{k}</option>)}
    </select>
  );
}

/** The input cells others can be filled into, by name. */
function useInputNames(): string[] {
  const root = useS((s) => s.doc?.root);
  const out: string[] = [];
  if (root) walk(root, (c) => { if (c.kind === 'input' && c.name) out.push(c.name); });
  return out;
}

function AddForm({ preset, keys, rows, collection, onAdd, onCancel }: {
  preset: Preset; keys: string[]; rows: Rec[]; collection: string | null; onAdd: (a: Action) => void; onCancel: () => void;
}) {
  const inputs = useInputNames();
  const [field, setField] = useState(keys.find((k) => k === 'status') ?? keys[0] ?? '');
  const [value, setValue] = useState('');
  const [target, setTarget] = useState(inputs[0] ?? '');
  const needsSaved = (preset === 'change' || preset === 'delete') && !collection;
  const actions = (ok: boolean, a: () => Action) => (
    <div className="ins-line">
      <button type="button" className="btn solid small" disabled={!ok} onClick={() => onAdd(a())}><Plus size={14} /> Add the button</button>
      <button type="button" className="btn ghost small" onClick={onCancel}>Cancel</button>
    </div>
  );

  if (needsSaved) {
    return (
      <div className="ins-add">
        <Hint>This works on saved records: under Data, pick Saved records. Typed rows are changed by double-clicking them in the table.</Hint>
      </div>
    );
  }
  if (preset === 'change') {
    const example = rows.find((r) => r[field] != null && r[field] !== '')?.[field];
    return (
      <div className="ins-add">
        <Prop label="Field to change"><FieldSelect value={field} keys={keys} label="Field to change" onChange={setField} /></Prop>
        <Prop label="New value" hint={example != null ? `Now, for example: ${String(example)}` : undefined}>
          <Draft value={value} onChange={setValue} label="New value" placeholder="Done" />
        </Prop>
        {actions(!!field && value.trim() !== '', () => ({ label: value.trim(), icon: 'check', variant: 'soft', do: changeFieldDo(collection!, field, value) }))}
      </div>
    );
  }
  if (preset === 'delete') {
    return (
      <div className="ins-add">
        <Hint>Removes the row's record from “{collection}”, after asking “Delete this row?”.</Hint>
        {actions(true, () => ({ label: 'Delete', icon: 'trash-2', variant: 'ghost', confirm: 'Delete this row?', do: deleteDo(collection!) }))}
      </div>
    );
  }
  if (preset === 'copy') {
    if (!inputs.length) return <div className="ins-add"><Hint>Add an input cell and give it a name first; the button fills it with the row's value.</Hint></div>;
    return (
      <div className="ins-add">
        <Prop label="Copy this field"><FieldSelect value={field} keys={keys} label="Field to copy" onChange={setField} /></Prop>
        <Prop label="Into the cell"><FieldSelect value={target} keys={inputs} label="Input cell to fill" onChange={setTarget} /></Prop>
        {actions(!!field && !!target, () => ({ label: 'Use', icon: 'copy', variant: 'soft', do: copyDo(target, field) }))}
      </div>
    );
  }
  return (
    <div className="ins-add">
      <Hint>Adds a button; then write what it does in the formula language.</Hint>
      {actions(true, () => ({ label: 'Button', variant: 'soft' }))}
    </div>
  );
}
