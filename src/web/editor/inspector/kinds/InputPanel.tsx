// An input: what kind of field it is, its label, range or choices, and value.

import { useState } from 'react';
import type { Json } from '../../../../core/types';
import { NumberField, SxField, TextField } from '../../fields';
import { KIND_OPTIONS } from '../../KindMenu';
import { useSession } from '../../ctx';
import { Prop, Tiles, Toggle } from '../controls';
import type { KindProps } from './types';

const TYPES = KIND_OPTIONS.filter((o) => o.kind === 'input');

/** A select's options as plain text, when they are a plain (list "a" "b"). */
function plainOptions(x: unknown): string | null {
  if (x === undefined || x === null) return '';
  if (!Array.isArray(x) || x[0] !== 'list') return null;
  const items = x.slice(1);
  return items.every((i) => typeof i === 'string' || typeof i === 'number') ? items.join(', ') : null;
}

function coerce(v: string, type: string): Json {
  if (type === 'number' || type === 'slider' || type === 'rating') return v.trim() === '' ? null : Number(v);
  return v;
}

export function InputPanel({ e }: KindProps) {
  const session = useSession();
  const c = e.cell;
  const type = c.type ?? 'text';
  const num = (k: 'min' | 'max' | 'step') => (typeof c[k] === 'number' ? (c[k] as number) : null);
  const plain = plainOptions(c.options);
  const [formula, setFormula] = useState(plain === null);
  return (
    <>
      <Prop label="Kind of field" hint="Changing it starts the value again.">
        <Tiles label="Kind of field" value={type} onChange={(t) => t !== type && session.setKind(c.id, 'input', t)}
          options={TYPES.map((o) => ({ value: o.type!, label: o.label, hint: o.hint, art: <o.icon size={18} strokeWidth={1.75} /> }))} />
      </Prop>
      <Prop label="Label">
        <TextField value={c.label ?? ''} label="Label" placeholder="Shown above the field" onCommit={(v) => e.set('label', v || null)} />
      </Prop>
      {(type === 'number' || type === 'slider') && (
        <Prop label="Range" hint="Leave empty for no limit.">
          <div className="ins-trio">
            <label><span>Least</span><NumberField value={num('min')} placeholder="—" label="Least" onCommit={(v) => e.set('min', v)} /></label>
            <label><span>Most</span><NumberField value={num('max')} placeholder="—" label="Most" onCommit={(v) => e.set('max', v)} /></label>
            <label><span>Step</span><NumberField value={num('step')} placeholder="1" label="Step" onCommit={(v) => e.set('step', v)} /></label>
          </div>
        </Prop>
      )}
      {type === 'rating' && (
        <Prop label="Stars" inline>
          <NumberField value={num('max') ?? 5} min={1} max={10} label="Stars" onCommit={(v) => e.set('max', v)} />
        </Prop>
      )}
      {type === 'select' && (
        <Prop label="Choices" hint={formula ? 'A formula giving a list.' : 'Separate the choices with commas.'}
          aside={<button type="button" className="ins-link" onClick={() => setFormula(!formula)}>{formula ? 'Type them' : 'Use a formula'}</button>}>
          {formula || plain === null ? (
            <SxField value={c.options} cell={c.id} prop="options" placeholder='(list "Small" "Large")' label="Choices" onCommit={(x) => e.set('options', x)} />
          ) : (
            <TextField value={plain} label="Choices" placeholder="Small, Medium, Large" onCommit={(v) => {
              const items = v.split(',').map((s) => s.trim()).filter(Boolean);
              e.set('options', items.length ? ['list', ...items] : null);
            }} />
          )}
        </Prop>
      )}
      {(type === 'text' || type === 'textarea' || type === 'number') && (
        <Prop label="Placeholder" hint="Shown in the empty field.">
          <TextField value={c.placeholder ?? ''} label="Placeholder" onCommit={(v) => e.set('placeholder', v || null)} />
        </Prop>
      )}
      {type === 'checkbox' || type === 'toggle' ? (
        <Toggle on={c.value === true} onChange={(on) => e.set('value', on)}>Ticked to start with</Toggle>
      ) : (
        <Prop label="Value" hint="What it holds now; people change it.">
          <TextField value={c.value == null ? '' : String(c.value)} label="Value" mono onCommit={(v) => e.set('value', coerce(v, type))} />
        </Prop>
      )}
    </>
  );
}
