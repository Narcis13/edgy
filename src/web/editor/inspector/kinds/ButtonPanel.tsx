// A button: its words, what it does, how it looks, its icon, and a question
// asked before it runs.

import { SxField, TextField } from '../../fields';
import { Chips, IconChoice, Prop } from '../controls';
import type { KindProps } from './types';

export const LOOKS = [{ value: 'solid', label: 'Solid' }, { value: 'soft', label: 'Soft' }, { value: 'ghost', label: 'Quiet' }];

export function ButtonPanel({ e }: KindProps) {
  const c = e.cell;
  return (
    <>
      <Prop label="Label">
        <TextField value={c.label ?? ''} label="Label" placeholder="Save" onCommit={(v) => e.set('label', v)} />
      </Prop>
      <Prop label="What it does" hint='e.g. (set! count (+ count 1)) or (insert! "orders" {qty qty}).'>
        <SxField value={c.do} cell={c.id} prop="do" placeholder="(set! count (+ count 1))" label="What it does" onCommit={(x) => e.set('do', x)} />
      </Prop>
      <Prop label="Look">
        <Chips label="Look" value={c.variant ?? 'solid'} onChange={(v) => e.set('variant', v === 'solid' ? null : v)}
          options={LOOKS.map((l) => ({ ...l, label: <span className={`ins-btn-look is-${l.value}`}>{l.label}</span>, title: l.label }))} />
      </Prop>
      <Prop label="Icon">
        <IconChoice value={c.icon} onChange={(v) => e.set('icon', v)} />
      </Prop>
      <Prop label="Ask first" hint="People must confirm before it runs." onReset={c.confirm ? () => e.set('confirm', null) : undefined}>
        <TextField value={c.confirm ?? ''} label="Question asked first" placeholder="Send the order?" onCommit={(v) => e.set('confirm', v.trim() || null)} />
      </Prop>
    </>
  );
}
