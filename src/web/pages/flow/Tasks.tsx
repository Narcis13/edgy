// Tasks by when they are due: Overdue, Today, Tomorrow, This week, Later, No
// date, and Done (folded). Tick to finish, click the day to change it, the
// mark to change the priority, the text to edit.

import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Search, X } from 'lucide-react';
import { type FlowItem, columnOf, dayLabel, describeQuick, parseQuick, timePart } from '../../../core/flow';
import { cx } from '../library/text';
import { ClockBadge, DocLink, DoneBox, ItemMenu, PriorityMark, Tags } from './bits';
import type { ViewProps } from './FlowPage';
import { countTasks, dayOfTask, dayValue, groupTasks } from './task-list';
import './tasks.css';

export function Tasks(props: ViewProps) {
  const { data, today, acts } = props;
  const [query, setQuery] = useState('');
  const groups = useMemo(() => groupTasks(data.items, today, query), [data.items, today, query]);
  const { open, done } = useMemo(() => countTasks(data.items), [data.items]);
  const total = open + done;

  return (
    <div className="tasks">
      <AddBox acts={acts} today={today} />

      <div className="tasks-tools">
        <p className="lib-n tasks-count" aria-live="polite">{open} open, {done} done</p>
        <label className="lib-search flow-search tasks-search">
          <Search size={15} aria-hidden="true" />
          <input type="search" value={query} placeholder="Search tasks" aria-label="Search tasks" onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { setQuery(''); (e.target as HTMLInputElement).blur(); } }} />
          {query && <button type="button" className="icon-btn" aria-label="Clear the search" title="Clear the search" onClick={() => setQuery('')}><X size={14} /></button>}
        </label>
      </div>

      {!total ? (
        <div className="lib-empty">
          <span>No tasks yet. Add one above, or write <code>todo …</code> in the timeline.</span>
        </div>
      ) : !groups.length ? (
        <p className="home-empty">Nothing matches.</p>
      ) : (
        <div className="tasks-groups">
          {groups.map((g) => {
            const rows = g.items.map((item) => <Row key={item.id} item={item} props={props} />);
            const head = <>{g.label} <span className="lib-n">{g.items.length}</span></>;
            return g.bucket === 'done' ? (
              <details key={g.bucket} className="tasks-group" data-bucket={g.bucket}>
                <summary className="tasks-head"><h2>{head}</h2></summary>
                <ul className="tasks-list">{rows}</ul>
              </details>
            ) : (
              <section key={g.bucket} className="tasks-group" data-bucket={g.bucket} aria-label={g.label}>
                <h2 className="tasks-head">{head}</h2>
                <ul className="tasks-list">{rows}</ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** The box at the top: read as quick-add, always a task. */
function AddBox({ acts, today }: { acts: ViewProps['acts']; today: string }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const quick = text.trim() ? parseQuick(text, new Date()) : null;
  const preview = quick ? describeQuick({ ...quick, kind: 'task' }, today) : '';

  const add = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setError(null);
    try {
      await acts.post({ text: t, kind: 'task' });
      setText('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The task could not be added.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="tasks-add" onSubmit={(e) => { e.preventDefault(); void add(); }}>
      <input type="text" className="text-field" value={text} placeholder="Add a task: Call Ben friday 3pm #sales" aria-label="Add a task" autoComplete="off"
        onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setText(''); }} />
      <button type="submit" className="btn solid tasks-add-btn" disabled={!text.trim() || busy}>Add</button>
      {(preview || error) && (
        <p className={cx('tasks-preview', error && 'is-error')} aria-live="polite">{error ?? preview}</p>
      )}
    </form>
  );
}

function Row({ item, props }: { item: FlowItem; props: ViewProps }) {
  const { data, today, now, acts, openItem, confirm, navigate } = props;
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const day = dayOfTask(item);
  const late = !item.done && day !== null && day < today;
  const time = timePart(item.start);
  const column = columnOf(item, data.board.columns);

  return (
    <li className={cx('tasks-row', item.done && 'is-done', menu && 'is-menu')} data-id={item.id}>
      <DoneBox item={item} onChange={(done) => void acts.patch(item.id, { done })} />
      <div className="tasks-main">
        <button type="button" className="tasks-text" onClick={() => openItem(item.id)}>{item.text || <span className="faint">(no title)</span>}</button>
        <Tags tags={item.tags} />
        {item.doc && <DocLink id={item.doc} title={data.docs[item.doc] ?? ''} navigate={navigate} />}
      </div>
      <div className="tasks-meta">
        {editing ? (
          <DueInput value={day ?? ''} onSave={(v) => { if (v !== day) void acts.patch(item.id, { due: v }); }} onClose={() => setEditing(false)} />
        ) : (
          <button type="button" className={cx('tasks-due', late && 'is-late', !day && 'is-none')} title="Change the due day" aria-label={`Due day: ${day ? dayLabel(day, today) : 'none'}. Click to change`} onClick={() => setEditing(true)}>
            <CalendarDays size={12} aria-hidden="true" />{day ? `${dayLabel(day, today)}${time ? ' ' + time : ''}` : 'No date'}
          </button>
        )}
        <PriorityMark priority={item.priority} onCycle={() => void acts.patch(item.id, { priority: ((item.priority + 1) % 3) as 0 | 1 | 2 })} />
        <span className="badge tasks-column" title="Board column">{column}</span>
        <ClockBadge item={item} now={now} />
        <ItemMenu item={item} deps={{ acts, openItem, confirm }} onOpenChange={setMenu} />
      </div>
    </li>
  );
}

/** A date field in place of the day: saves on change or on leaving, Escape puts it back. */
function DueInput({ value, onSave, onClose }: { value: string; onSave: (v: string | null) => void; onClose: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const skip = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    try { el.showPicker?.(); } catch { /* the browser may refuse; the field still works */ }
  }, []);

  const finish = (v: string) => {
    const day = dayValue(v);
    if (day !== undefined) onSave(day);
  };

  return (
    <input ref={ref} type="date" className="text-field tasks-due-input" defaultValue={value} aria-label="Due day"
      onChange={(e) => {
        if (dayValue(e.target.value) === undefined) return;
        skip.current = true;
        finish(e.target.value);
        onClose();
      }}
      onBlur={(e) => {
        if (!skip.current) finish(e.target.value);
        onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          skip.current = true;
          onClose();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          finish(e.currentTarget.value);
          skip.current = true;
          onClose();
        }
      }} />
  );
}
