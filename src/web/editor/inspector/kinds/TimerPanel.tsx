// A timer: how often it ticks (or once, after a while), and whether it runs.
// What it does on each tick is a handler, set in the Events section below.

import type { Json, Op } from '../../../../core/types';
import { durationMs } from '../../../../core/duration';
import { NumberField } from '../../fields';
import { Chips, Hint, Prop, Toggle } from '../controls';
import type { KindProps } from './types';

export function TimerPanel({ e }: KindProps) {
  const c = e.cell;
  const every = durationMs(c.every);
  const after = durationMs(c.after);
  const mode: 'every' | 'after' = after && !every ? 'after' : 'every';
  const ms = mode === 'every' ? every : after;
  const secs = ms ? Math.round(ms / 100) / 10 : null;
  const running = c.value !== false;
  const name = c.name ?? c.id;
  const setMode = (m: 'every' | 'after') => {
    if (m === mode) return;
    // The time carries over; only one of every and after is kept.
    e.ops([['set', c.id, m, (secs ?? 30) as Json], ['set', c.id, m === 'every' ? 'after' : 'every', null]] as Op[]);
  };
  return (
    <>
      <Prop label="Ticks">
        <Chips label="Ticks" value={mode} onChange={setMode} options={[{ value: 'every', label: 'Again and again' }, { value: 'after', label: 'Once' }]} />
      </Prop>
      <Prop label={mode === 'every' ? 'Every' : 'After'} inline>
        <NumberField value={secs} min={1} step={1} placeholder="30" label={mode === 'every' ? 'Seconds between ticks' : 'Seconds before it ticks'}
          onCommit={(v) => e.set(mode, v && v > 0 ? v : null)} />
        <span className="ins-unit">seconds</span>
      </Prop>
      {!ms && <Hint>Set a time, or the timer never ticks.</Hint>}
      <Toggle on={running} onChange={(on) => e.set('value', on ? null : false)}
        hint={<>Stopped, it waits for <code>(start! {name})</code> from a button or a handler; <code>(stop! {name})</code> stops it.</>}>
        {running ? 'Running' : 'Stopped'}
      </Toggle>
      <Hint>It ticks only while someone has the document open in Live, and runs its tick handler each time. Readers never see it.</Hint>
    </>
  );
}
