// The calendar: a month of days with their events and due tasks, and a week with
// time blocks. On a phone the month (and the week) is an agenda instead.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { type FlowItem, addDays, dateOf, dayLabel, timeLabel, weekOf } from '../../../core/flow';
import { WEEKDAYS, addMonths, monthGrid } from '../../kinds/month';
import { cx, plural } from '../library/text';
import { DoneBox } from './bits';
import { type AgendaDay, agendaDays, hourAt, hourSlot, isLate, itemsOn, longDate, monthDays, monthTitle, timeOn, weekCells, weekTitle } from './calendar-days';
import type { ViewProps } from './FlowPage';
import { hourRange, layoutBlocks } from './state';
import './calendar.css';

type Mode = 'month' | 'week';

/** Pixels per minute in the week: an hour is 84 px. */
const PX_PER_MIN = 1.4;
/** A day cell shows this many items before "+n more". */
const CHIPS = 4;

const pad = (n: number) => String(n).padStart(2, '0');

export function Calendar(props: ViewProps) {
  const { today, phone, compose } = props;
  const [mode, setMode] = useState<Mode>('month');
  // The day the month or the week is built around; in the month grid it is also the day keyboard focus is on.
  const [cursor, setCursor] = useState(today);
  // A day opened in the agenda under the month grid.
  const [picked, setPicked] = useState<string | null>(null);

  const week = useMemo(() => weekOf(cursor), [cursor]);
  const title = mode === 'month' ? monthTitle(cursor) : weekTitle(week);
  const step = (n: number) => {
    setPicked(null);
    setCursor((c) => (mode === 'month' ? addMonths(c, n) : addDays(c, 7 * n)));
  };
  const unit = mode === 'month' ? 'month' : 'week';

  return (
    <div className="cal">
      <div className="cal-toolbar">
        <div className="cal-nav">
          <button type="button" className="icon-btn" aria-label={`Previous ${unit}`} title={`Previous ${unit}`} onClick={() => step(-1)}><ChevronLeft size={16} aria-hidden="true" /></button>
          <button type="button" className="icon-btn" aria-label={`Next ${unit}`} title={`Next ${unit}`} onClick={() => step(1)}><ChevronRight size={16} aria-hidden="true" /></button>
        </div>
        <button type="button" className="btn ghost small" onClick={() => { setPicked(null); setCursor(today); }} title="Back to today">Today</button>
        <h2 className="cal-title" aria-live="polite">{title}</h2>
        <div className="seg" role="group" aria-label="Calendar view">
          {(['month', 'week'] as Mode[]).map((m) => (
            <button key={m} type="button" className={cx(mode === m && 'is-on')} aria-pressed={mode === m} onClick={() => { setPicked(null); setMode(m); }}>
              {m === 'month' ? 'Month' : 'Week'}
            </button>
          ))}
        </div>
      </div>

      {phone ? (
        <PhoneAgenda {...props} days={mode === 'month' ? monthDays(Number(cursor.slice(0, 4)), Number(cursor.slice(5, 7)) - 1) : week} title={title} onAdd={(day) => compose({ kind: 'event', start: day, end: day })} />
      ) : mode === 'month' ? (
        <Month {...props} cursor={cursor} setCursor={setCursor} picked={picked} setPicked={setPicked} />
      ) : (
        <Week {...props} days={week} />
      )}
    </div>
  );
}

// ───────────────────────────── the month ─────────────────────────────

function Month(props: ViewProps & { cursor: string; setCursor: (iso: string) => void; picked: string | null; setPicked: (iso: string | null) => void }) {
  const { data, today, compose, cursor, setCursor, picked, setPicked } = props;
  const year = Number(cursor.slice(0, 4));
  const month0 = Number(cursor.slice(5, 7)) - 1;
  const weeks = useMemo(() => monthGrid(year, month0), [year, month0]);
  const byDay = useMemo(() => new Map(weeks.flat().map((d) => [d.iso, itemsOn(data.items, d.iso)])), [weeks, data.items]);
  const grid = useRef<HTMLDivElement>(null);
  const agenda = useRef<HTMLElement>(null);
  const moving = useRef(false);

  // After an arrow key, the focus follows the cursor (also into another month).
  useEffect(() => {
    if (!moving.current) return;
    moving.current = false;
    grid.current?.querySelector<HTMLElement>(`.cal-day[data-day="${cursor}"]`)?.focus();
  }, [cursor]);
  useEffect(() => {
    if (picked) agenda.current?.scrollIntoView?.({ block: 'nearest' });
  }, [picked]);

  const go = (iso: string) => {
    moving.current = true;
    setPicked(null);
    setCursor(iso);
  };
  const onKey = (e: React.KeyboardEvent) => {
    // Only the day itself: Enter on a chip inside it opens that item.
    const cell = e.target as HTMLElement;
    if (!cell.classList.contains('cal-day') || e.metaKey || e.ctrlKey || e.altKey) return;
    const day = cell.dataset.day!;
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in step) go(addDays(day, step[e.key]));
    else if (e.key === 'PageUp' || e.key === 'PageDown') go(addMonths(day, e.key === 'PageUp' ? -1 : 1));
    else if (e.key === 'Home' || e.key === 'End') {
      const wd = (dateOf(day).getDay() + 6) % 7;
      go(addDays(day, e.key === 'Home' ? -wd : 6 - wd));
    } else if (e.key === 'Enter') compose({ kind: 'event', start: day, end: day });
    else if (e.key === ' ') setPicked(day);
    else return;
    e.preventDefault();
  };

  const focusDay = weeks.flat().some((d) => d.iso === cursor) ? cursor : `${cursor.slice(0, 7)}-01`;
  const open = picked ? { day: picked, items: byDay.get(picked) ?? itemsOn(data.items, picked) } : null;

  return (
    <>
      <div className="cal-month" role="grid" aria-label={monthTitle(cursor)} ref={grid} onKeyDown={onKey}>
        <div className="cal-wd" role="row">
          {WEEKDAYS.map((d) => <span key={d} role="columnheader" aria-label={d} className="cal-wdname">{d.slice(0, 3)}</span>)}
        </div>
        {weeks.map((w) => (
          <div className="cal-row" role="row" key={w[0].iso}>
            {w.map((d) => {
              const items = byDay.get(d.iso) ?? [];
              const tab = d.iso === focusDay ? 0 : -1;
              const shown = items.length > CHIPS ? items.slice(0, CHIPS) : items;
              return (
                <div key={d.iso} role="gridcell" data-day={d.iso} tabIndex={tab} aria-selected={d.iso === picked}
                  aria-label={`${longDate(d.iso)}${d.iso === today ? ', today' : ''}${items.length ? `, ${plural(items.length, 'item')}` : ''}`}
                  className={cx('cal-day', !d.inMonth && 'is-out', d.iso === today && 'is-today', d.iso === picked && 'is-picked')}
                  onClick={() => compose({ kind: 'event', start: d.iso, end: d.iso })}
                  onFocus={(e) => { if (e.target === e.currentTarget && d.inMonth && d.iso !== cursor) setCursor(d.iso); }}>
                  <span className="cal-num" aria-hidden="true">{d.day}</span>
                  <div className="cal-chips">
                    {shown.map((item) => <Chip key={item.id} item={item} day={d.iso} today={today} tab={tab} openItem={props.openItem} />)}
                    {items.length > CHIPS && (
                      <button type="button" className="cal-more" tabIndex={tab} aria-label={`Show all ${plural(items.length, 'item')} on ${longDate(d.iso)}`}
                        onClick={(e) => { e.stopPropagation(); setPicked(d.iso); }}>
                        +{items.length - CHIPS} more
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {open && (
        <section className="cal-agenda" ref={agenda} aria-label={`Items on ${longDate(open.day)}`}>
          <AgendaBlock {...props} entry={open} onAdd={(day) => compose({ kind: 'event', start: day, end: day })} onClose={() => setPicked(null)} />
        </section>
      )}
    </>
  );
}

/** One item in a day cell or in the all-day row: a time or a box, and the text. */
function Chip({ item, day, today, tab, openItem }: { item: FlowItem; day: string; today: string; tab: number; openItem: (id: string) => void }) {
  const time = timeOn(item, day);
  const task = item.kind === 'task';
  const late = isLate(item, today);
  const cont = item.kind === 'event' && !timeOn(item, day) && !!item.start && item.start.slice(0, 10) !== day;
  const text = item.text || 'Untitled';
  const label = `${task ? (item.done ? 'Done task' : 'Task') : 'Event'}: ${text}${time ? `, ${time}` : ''}${late ? ', overdue' : ''}`;
  return (
    <button type="button" data-id={item.id} tabIndex={tab} title={label} aria-label={label}
      className={cx('cal-chip', item.kind, item.done && 'is-done', late && 'is-late', cont && 'is-cont')}
      onClick={(e) => { e.stopPropagation(); openItem(item.id); }}>
      {task ? <span className="cal-box" aria-hidden="true">{item.done && <Check size={11} strokeWidth={3.5} />}</span> : time && <span className="cal-chip-time">{time}</span>}
      <span className="cal-chip-text">{text}</span>
    </button>
  );
}

// ───────────────────────────── the week ─────────────────────────────

function Week(props: ViewProps & { days: string[] }) {
  const { data, today, now, days, compose, openItem } = props;
  const cells = useMemo(() => weekCells(data.items, days), [data.items, days]);
  const blocks = useMemo(() => cells.map((c) => layoutBlocks(c.timed, c.day)), [cells]);
  const [from, to] = hourRange(blocks.flat());
  const byId = useMemo(() => new Map(data.items.map((i) => [i.id, i])), [data.items]);
  const scroller = useRef<HTMLDivElement>(null);

  // The grid opens at eight in the morning, or at its first hour if that is later.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = Math.max(0, (8 - from) * 60 * PX_PER_MIN);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hours = Array.from({ length: to - from }, (_, i) => from + i);
  const height = (to - from) * 60 * PX_PER_MIN;
  const clock = new Date(now);
  const nowMin = clock.getHours() * 60 + clock.getMinutes();
  const clickDay = (e: React.MouseEvent<HTMLDivElement>, day: string) => {
    if (e.target !== e.currentTarget) return;
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    compose({ kind: 'event', ...hourSlot(day, hourAt(y, from, PX_PER_MIN)) });
  };

  return (
    <div className="cal-week" style={{ '--hour': `${60 * PX_PER_MIN}px` } as React.CSSProperties}>
      <div className="cal-scroll" ref={scroller}>
        <div className="cal-sticky">
          <div className="cal-whead">
            <span />
            {days.map((d) => (
              <div key={d} data-day={d} className={cx('cal-wday', d === today && 'is-today')} aria-label={`${longDate(d)}${d === today ? ', today' : ''}`}>
                <span className="cal-wdname" aria-hidden="true">{WEEKDAYS[(dateOf(d).getDay() + 6) % 7].slice(0, 3)}</span>
                <span className="cal-num" aria-hidden="true">{Number(d.slice(8))}</span>
              </div>
            ))}
          </div>
          <div className="cal-allday" aria-label="Whole-day items">
            <span className="cal-gutter-label">all day</span>
            {cells.map((c) => (
              <div key={c.day} data-day={c.day} className="cal-allday-cell" onClick={(e) => { if (e.target === e.currentTarget) compose({ kind: 'event', start: c.day, end: c.day }); }}>
                {c.allday.map((item) => <Chip key={item.id} item={item} day={c.day} today={today} tab={0} openItem={openItem} />)}
              </div>
            ))}
          </div>
        </div>
        <div className="cal-hours" style={{ height }}>
          <div className="cal-gutter" aria-hidden="true">
            {hours.map((h) => <span key={h} style={{ top: (h - from) * 60 * PX_PER_MIN }}>{pad(h)}:00</span>)}
          </div>
          {cells.map((c, i) => (
            <div key={c.day} data-day={c.day} className={cx('cal-col', c.day === today && 'is-today')} onClick={(e) => clickDay(e, c.day)}>
              {blocks[i].map((b) => {
                const item = byId.get(b.id);
                return item ? <Block key={b.id} item={item} top={(b.top - from * 60) * PX_PER_MIN} height={b.height * PX_PER_MIN} col={b.col} cols={b.cols} minutes={b.height} openItem={openItem} /> : null;
              })}
              {c.day === today && nowMin >= from * 60 && nowMin <= to * 60 && <div className="cal-now" style={{ top: (nowMin - from * 60) * PX_PER_MIN }} aria-hidden="true" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Block({ item, top, height, col, cols, minutes, openItem }: { item: FlowItem; top: number; height: number; col: number; cols: number; minutes: number; openItem: (id: string) => void }) {
  const task = item.kind === 'task';
  const when = timeLabel(item.start, item.end);
  const label = `${task ? (item.done ? 'Done task' : 'Task') : 'Event'}: ${item.text || 'Untitled'}, ${when}`;
  return (
    <button type="button" data-id={item.id} title={label} aria-label={label}
      className={cx('cal-block', item.kind, item.done && 'is-done', minutes < 30 && 'is-short')}
      style={{ top, height: height - 1, left: `${(col / cols) * 100}%`, width: `calc(${100 / cols}% - 2px)` }}
      onClick={(e) => { e.stopPropagation(); openItem(item.id); }}>
      {minutes >= 30 && (
        <>
          <span className="cal-block-text">{task && <span className="cal-box" aria-hidden="true">{item.done && <Check size={11} strokeWidth={3.5} />}</span>}{item.text || 'Untitled'}</span>
          <span className="cal-block-time">{when}</span>
        </>
      )}
    </button>
  );
}

// ───────────────────────────── the agenda ─────────────────────────────

/** The phone: the month, or the week, as the days that hold something one after the other. */
function PhoneAgenda(props: ViewProps & { days: string[]; title: string; onAdd: (day: string) => void }) {
  const { data, today, days, title, onAdd } = props;
  const list = useMemo(() => agendaDays(data.items, days, today), [data.items, days, today]);
  return (
    <section className="cal-agenda is-phone" aria-label={`${title}, by day`}>
      {list.length ? list.map((entry) => <AgendaBlock key={entry.day} {...props} entry={entry} onAdd={onAdd} />) : <p className="cal-none">Nothing in {title}.</p>}
    </section>
  );
}

/** One day: its heading and its items as rows. */
function AgendaBlock({ entry, today, acts, openItem, onAdd, onClose }: ViewProps & { entry: AgendaDay; onAdd: (day: string) => void; onClose?: () => void }) {
  const { day, items } = entry;
  const name = dayLabel(day, today, true);
  const label = day === today && !items.length ? 'Today, nothing yet' : name;
  const relative = name === 'Today' || name === 'Tomorrow' || name === 'Yesterday';
  return (
    <div className="cal-agenda-day" data-day={day}>
      <div className="cal-agenda-head">
        <h3>{label}</h3>
        {relative && <span className="lib-n">{longDate(day)}</span>}
        {items.length > 0 && <span className="lib-n">{plural(items.length, 'item')}</span>}
        <button type="button" className="icon-btn cal-add" aria-label={`Add an item on ${longDate(day)}`} title="Add an item" onClick={() => onAdd(day)}><Plus size={15} aria-hidden="true" /></button>
        {onClose && <button type="button" className="icon-btn cal-close" aria-label="Close the day" title="Close" onClick={onClose}><X size={15} aria-hidden="true" /></button>}
      </div>
      {items.length ? (
        <ul className="cal-list">
          {items.map((item) => (
            <li key={item.id} data-id={item.id} className={cx('cal-item', item.kind, item.done && 'is-done', isLate(item, today) && 'is-late')}>
              <span className="cal-item-time">{timeOn(item, day) ? timeLabel(item.start, item.end) : 'all day'}</span>
              {item.kind === 'task' && <DoneBox item={item} onChange={(done) => void acts.patch(item.id, { done })} />}
              <button type="button" className="cal-item-text" onClick={() => openItem(item.id)}>{item.text || 'Untitled'}</button>
            </li>
          ))}
        </ul>
      ) : day !== today ? <p className="cal-none">Nothing on this day.</p> : null}
    </div>
  );
}
