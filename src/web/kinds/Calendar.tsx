// A calendar cell: a month of days with events on them. Picking a day sets
// the cell's value, so other cells can read it.

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Cell } from '../../core/types';
import type { CellState } from '../../core/engine';
import { cx } from '../editor/ctx';
import {
  type CalEvent, addDays, addMonths, dateOf, eventsFrom, eventsOn, isoOf, monthGrid, monthName, toDay, toEvents, weekdays,
} from './month';
import { ownKeys, tokenColor, useSetValue } from './shared';
import './kinds.css';

const longDay = (iso: string) => dateOf(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const shortDay = (iso: string) => dateOf(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

export function CalendarView({ cell, st }: { cell: Cell; st: CellState | undefined }) {
  const setValue = useSetValue(cell);
  const picked = toDay(st?.value ?? cell.value);
  const today = isoOf(new Date());
  const events = toEvents(st?.props?.events);
  const label = (st?.props?.label as string | undefined) ?? cell.label;
  // The month on show and the day keyboard focus is on are this view's own.
  const [focus, setFocus] = useState(picked ?? today);
  const [month, setMonth] = useState(() => (picked ?? today).slice(0, 7));
  const grid = useRef<HTMLDivElement>(null);
  const moving = useRef(false);

  useEffect(() => {
    // Someone (or something) picked a day in another month: go there.
    if (picked && picked.slice(0, 7) !== month) {
      setMonth(picked.slice(0, 7));
      setFocus(picked);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked]);
  useEffect(() => {
    if (!moving.current) return;
    moving.current = false;
    grid.current?.querySelector<HTMLElement>(`[data-day="${focus}"]`)?.focus();
  }, [focus, month]);

  const [y, m] = month.split('-').map(Number);
  const sunday = cell.week === 'sun';
  const weeks = monthGrid(y, m - 1, sunday);
  const go = (iso: string, keyboard = false) => {
    moving.current = keyboard;
    setFocus(iso);
    if (iso.slice(0, 7) !== month) setMonth(iso.slice(0, 7));
  };
  const page = (n: number) => {
    const first = addMonths(`${month}-01`, n);
    setMonth(first.slice(0, 7));
    setFocus(focus.slice(0, 7) === month ? addMonths(focus, n) : first);
  };
  const pick = (iso: string) => {
    go(iso);
    setValue(iso === picked ? null : iso);
  };
  const onKey = (e: React.KeyboardEvent) => {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in step) go(addDays(focus, step[e.key]), true);
    else if (e.key === 'PageUp' || e.key === 'PageDown') go(addMonths(focus, e.key === 'PageUp' ? -1 : 1), true);
    else if (e.key === 'Home' || e.key === 'End') {
      const wd = sunday ? dateOf(focus).getDay() : (dateOf(focus).getDay() + 6) % 7;
      go(addDays(focus, e.key === 'Home' ? -wd : 6 - wd), true);
    } else return;
    e.preventDefault();
  };

  const visibleFocus = weeks.some((w) => w.some((d) => d.iso === focus)) ? focus : `${month}-01`;
  const agenda = picked && picked.slice(0, 7) === month ? eventsOn(events, picked) : eventsFrom(events, y, m - 1, today.slice(0, 7) === month ? today : `${month}-01`).slice(0, 6);

  return (
    <div className="kcal" onKeyDown={ownKeys}>
      {label && <div className="kind-label">{label}</div>}
      <div className="kcal-head">
        <h3 className="kcal-month" aria-live="polite">{monthName(y, m - 1)}</h3>
        <button type="button" className="kcal-today" onClick={() => { go(today); }} disabled={month === today.slice(0, 7) && focus === today}>Today</button>
        <button type="button" className="kcal-nav" aria-label="Previous month" onClick={() => page(-1)}><ChevronLeft size={16} /></button>
        <button type="button" className="kcal-nav" aria-label="Next month" onClick={() => page(1)}><ChevronRight size={16} /></button>
      </div>
      <div className="kcal-grid" role="grid" aria-label={monthName(y, m - 1)} ref={grid} onKeyDown={onKey}>
        <div className="kcal-row kcal-wd" role="row">
          {weekdays(sunday).map((d) => <span key={d} role="columnheader" aria-label={d} className="kcal-wdname">{d[0]}</span>)}
        </div>
        {weeks.map((w) => (
          <div className="kcal-row" role="row" key={w[0].iso}>
            {w.map((d) => {
              const on = eventsOn(events, d.iso);
              return (
                <div role="gridcell" key={d.iso} aria-selected={d.iso === picked}
                  className={cx('kcal-day', !d.inMonth && 'is-out', d.iso === today && 'is-today', d.iso === picked && 'is-picked')}>
                  <button type="button" data-day={d.iso} tabIndex={d.iso === visibleFocus ? 0 : -1}
                    aria-label={`${longDay(d.iso)}${d.iso === today ? ', today' : ''}${on.length ? `, ${on.length} ${on.length === 1 ? 'event' : 'events'}` : ''}`}
                    aria-pressed={d.iso === picked} onClick={() => pick(d.iso)} onFocus={() => d.iso !== focus && setFocus(d.iso)}>
                    <span className="kcal-num">{d.day}</span>
                    {on.length > 0 && (
                      <span className="kcal-dots" aria-hidden>
                        {on.slice(0, 3).map((e, i) => <i key={i} style={{ background: tokenColor(e.color) }} />)}
                      </span>
                    )}
                    {on.length > 0 && (
                      <span className="kcal-chips" aria-hidden>
                        {on.slice(0, on.length > 3 ? 2 : 3).map((e, i) => <Chip key={i} e={e} day={d.iso} />)}
                        {on.length > 3 && <span className="kcal-more">+{on.length - 2} more</span>}
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <Agenda events={agenda} picked={picked && picked.slice(0, 7) === month ? picked : null} onPick={pick} />
    </div>
  );
}

function Chip({ e, day }: { e: CalEvent; day: string }) {
  const c = tokenColor(e.color);
  const span = e.start !== e.end;
  return (
    <span className={cx('kcal-chip', span && e.start !== day && 'is-cont', span && e.end !== day && 'is-runs')} style={{ '--c': c } as React.CSSProperties} title={e.title}>
      {e.title || 'Untitled'}
    </span>
  );
}

/** Under a narrow calendar: the picked day's events, or what's coming this month. */
function Agenda({ events, picked, onPick }: { events: CalEvent[]; picked: string | null; onPick: (iso: string) => void }) {
  return (
    <div className="kcal-agenda" aria-live="polite">
      <div className="kcal-agenda-h">{picked ? longDay(picked) : 'Coming up'}</div>
      {events.length ? (
        <ul>
          {events.map((e, i) => (
            <li key={i}>
              <i style={{ background: tokenColor(e.color) }} aria-hidden />
              <span className="kcal-agenda-t">{e.title || 'Untitled'}</span>
              {!picked && <button type="button" className="kcal-agenda-d" onClick={() => onPick(e.start)}>{shortDay(e.start)}{e.end !== e.start ? ` – ${shortDay(e.end)}` : ''}</button>}
              {picked && e.end !== e.start && <span className="kcal-agenda-d">until {shortDay(e.end)}</span>}
            </li>
          ))}
        </ul>
      ) : <p className="kcal-agenda-none">{picked ? 'Nothing on this day' : 'Nothing else this month'}</p>}
    </div>
  );
}
