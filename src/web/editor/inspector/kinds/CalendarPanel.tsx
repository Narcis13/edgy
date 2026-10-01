// A calendar: its events, title, the picked day and the first day of the week.

import { SxField, TextField } from '../../fields';
import { Chips, Prop, stop } from '../controls';
import type { KindProps } from './types';

export function CalendarPanel({ e }: KindProps) {
  const c = e.cell;
  const day = typeof c.value === 'string' ? c.value : '';
  return (
    <>
      <Prop label="Events" hint='Records with a date and a title, e.g. (rows "events").'>
        <SxField value={c.expr} cell={c.id} prop="expr" preview placeholder='(rows "events")' onCommit={(x) => e.set('expr', x)} />
      </Prop>
      <Prop label="Title">
        <TextField value={c.label ?? ''} label="Title" placeholder="Shown above the month" onCommit={(v) => e.set('label', v || null)} />
      </Prop>
      <Prop label="Picked day" hint="Other cells read it by the calendar's name." onReset={day ? () => e.set('value', null) : undefined}>
        <input type="date" className="text-field" aria-label="Picked day" value={day} onKeyDown={stop} onChange={(ev) => e.set('value', ev.target.value || null)} />
      </Prop>
      <Prop label="Weeks start on">
        <Chips label="Weeks start on" value={c.week === 'sun' ? 'sun' : 'mon'} onChange={(v) => e.set('week', v === 'mon' ? null : v)}
          options={[{ value: 'mon', label: 'Monday' }, { value: 'sun', label: 'Sunday' }]} />
      </Prop>
    </>
  );
}
