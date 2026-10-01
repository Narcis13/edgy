// A stat: the number, its label and format, what it is compared with, its trend.

import { SxField, TextField } from '../../fields';
import { FormatSelect, IconChoice, Prop, Toggle } from '../controls';
import type { KindProps } from './types';

export function StatPanel({ e }: KindProps) {
  const c = e.cell;
  return (
    <>
      <Prop label="Number" hint="A formula, e.g. (sum (column orders &quot;total&quot;)).">
        <SxField value={c.expr} cell={c.id} prop="expr" preview placeholder='(sum (column orders "total"))' onCommit={(x) => e.set('expr', x)} />
      </Prop>
      <Prop label="Label">
        <TextField value={c.label ?? ''} label="Label" placeholder="Revenue" onCommit={(v) => e.set('label', v || null)} />
      </Prop>
      <Prop label="Show the number as" onReset={c.format ? () => e.set('format', null) : undefined}>
        <FormatSelect value={c.format} onChange={(v) => e.set('format', v)} />
      </Prop>
      <Prop label="Compare with" hint="An earlier value; the change shows in %." onReset={c.compare !== undefined ? () => e.set('compare', null) : undefined}>
        <SxField value={c.compare} cell={c.id} prop="compare" preview placeholder="last_month" onCommit={(x) => e.set('compare', x)} />
      </Prop>
      <Toggle on={c.better === 'down'} onChange={(on) => e.set('better', on ? 'down' : null)} hint="For costs or bugs: a fall shows green.">Lower is better</Toggle>
      <Prop label="Trend" hint="A few numbers drawn as a small line." onReset={c.trend !== undefined ? () => e.set('trend', null) : undefined}>
        <SxField value={c.trend} cell={c.id} prop="trend" preview placeholder="(list 3 5 4 8)" onCommit={(x) => e.set('trend', x)} />
      </Prop>
      <Prop label="Icon">
        <IconChoice value={c.icon} onChange={(v) => e.set('icon', v)} />
      </Prop>
    </>
  );
}
