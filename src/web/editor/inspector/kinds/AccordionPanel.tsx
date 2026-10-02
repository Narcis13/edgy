// An accordion: its sections, which are open, and whether one or several can be.

import { Chips, Prop } from '../controls';
import { accordionMode } from '../sections';
import { PanelList } from './PanelList';
import type { KindProps } from './types';

export function AccordionPanel({ e }: KindProps) {
  const c = e.cell;
  const many = !!c.multiple;
  return (
    <PanelList e={e} hint="Ticked sections are open. Readers open and close them by clicking their titles.">
      <Prop label="Open at a time" hint={many ? 'Readers can open as many sections as they like.' : 'Opening a section closes the one that was open.'}>
        <Chips label="Open at a time" value={many ? 'many' : 'one'} onChange={(v) => e.ops(accordionMode(c, v === 'many'))}
          options={[{ value: 'one', label: 'One' }, { value: 'many', label: 'Any number' }]} />
      </Prop>
    </PanelList>
  );
}
