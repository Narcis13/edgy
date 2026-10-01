// A list: checklist, bullets or numbers, its marker, spacing and progress bar.

import { SxField, TextField } from '../../fields';
import { asItems } from '../../../kinds/items';
import { Chips, Hint, Prop, Toggle } from '../controls';
import type { KindProps } from './types';

const MARKERS = [
  { value: 'dot', glyph: '•', title: 'Dot' },
  { value: 'dash', glyph: '–', title: 'Dash' },
  { value: 'arrow', glyph: '→', title: 'Arrow' },
  { value: 'star', glyph: '★', title: 'Star' },
  { value: 'none', glyph: 'None', title: 'No marker' },
];

export const DENSITY = [{ value: 'compact', label: 'Compact' }, { value: 'normal', label: 'Normal' }, { value: 'roomy', label: 'Roomy' }];

export function ListPanel({ e }: KindProps) {
  const c = e.cell;
  const type = c.type === 'check' || c.type === 'number' ? c.type : 'bullet';
  return (
    <>
      <Prop label="Kind of list">
        <Chips label="Kind of list" value={type} onChange={(v) => e.ops([['set', c.id, 'type', v], ['set', c.id, 'value', asItems(c.value, v)]])}
          options={[{ value: 'check', label: 'Checklist' }, { value: 'bullet', label: 'Bullets' }, { value: 'number', label: 'Numbers' }]} />
      </Prop>
      <Prop label="Title">
        <TextField value={c.label ?? ''} label="Title" placeholder="Shown above the items" onCommit={(v) => e.set('label', v || null)} />
      </Prop>
      {type === 'bullet' && (
        <Prop label="Marker">
          <Chips label="Marker" cols={5} value={c.marker ?? 'dot'} onChange={(v) => e.set('marker', v === 'dot' ? null : v)}
            options={MARKERS.map((m) => ({ value: m.value, title: m.title, label: <span className={m.value === 'none' ? 'ins-small' : 'ins-glyph'}>{m.glyph}</span> }))} />
        </Prop>
      )}
      <Prop label="Spacing">
        <Chips label="Spacing between items" value={c.density ?? 'normal'} onChange={(v) => e.set('density', v === 'normal' ? null : v)} options={DENSITY} />
      </Prop>
      {type === 'check' && (
        <Toggle on={c.progress !== false} onChange={(on) => e.set('progress', on ? null : false)} hint="A bar showing how much is ticked.">Show progress</Toggle>
      )}
      <Prop label="Computed from" hint="Leave empty so people can edit the items." onReset={c.expr !== undefined ? () => e.set('expr', null) : undefined}>
        <SxField value={c.expr} cell={c.id} prop="expr" preview placeholder="(map (get it &quot;name&quot;) people)" label="Computed from" onCommit={(x) => e.set('expr', x)} />
      </Prop>
      {c.expr !== undefined && <Hint>The list shows what this computes, so its items can't be edited by hand. Clear it to edit them again.</Hint>}
    </>
  );
}
