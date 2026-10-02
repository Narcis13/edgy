// A collapsible: its heading, whether it is open, and the cells under it.

import { TextField } from '../../fields';
import { isOpen } from '../../../../core/containers';
import { Chips, Prop } from '../controls';
import { CellCount } from './GroupPanel';
import { FormulaHint } from './PanelList';
import type { KindProps } from './types';

export function CollapsiblePanel({ e }: KindProps) {
  const c = e.cell;
  const open = isOpen(c);
  return (
    <>
      <Prop label="Heading" hint="Readers click it to fold and unfold what is under it.">
        <TextField value={c.title ?? ''} label="Heading" placeholder="More details" onCommit={(v) => e.set('title', v.trim() || null)} />
      </Prop>
      <Prop label="Right now" hint={open ? 'Open: its cells show.' : 'Folded: only the heading shows. Printed pages always show it open.'}>
        <Chips label="Open or folded" value={open ? 'open' : 'folded'} onChange={(v) => e.set('value', v === 'open' ? null : false)}
          options={[{ value: 'open', label: 'Open' }, { value: 'folded', label: 'Folded' }]} />
      </Prop>
      <CellCount e={e} />
      <FormulaHint e={e} what="whether it is open" example={(n) => `(if ${n} "Open" "Folded")`} change={(n) => `(toggle! ${n})`} />
    </>
  );
}
