// Small pieces every Flow view shares: who wrote something, the kind, the
// tags, when, the priority mark, the clock, and the menu every item has.

import { Calendar, Check, CircleDashed, Clock3, FileText, ListTodo, Pause, Pencil, Pin, PinOff, Play, StickyNote, Trash2, Undo2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { type FlowItem, type ItemKind, type Priority, type Who, PRIORITIES, durationLabel, minutesOn, whenLabel } from '../../../core/flow';
import { Avatar } from '../../account/Avatar';
import { type MenuItem, Menu } from '../library/Menu';
import { cx } from '../library/text';
import type { Confirm } from '../library/Dialogs';
import type { FlowActions } from './state';

export const KIND_ICON: Record<ItemKind, ReactNode> = {
  note: <StickyNote size={13} aria-hidden="true" />,
  task: <ListTodo size={13} aria-hidden="true" />,
  event: <Calendar size={13} aria-hidden="true" />,
};
export const KIND_LABEL: Record<ItemKind, string> = { note: 'Note', task: 'Task', event: 'Event' };

/** The agent colour is a token, not a person's choice. */
export const colorOf = (who: Who): string => (who.kind === 'agent' ? 'var(--agent)' : who.color ?? 'var(--accent)');

/** An avatar and a name; an agent says whom it acts for. */
export function WhoLine({ who, size = 28, at }: { who: Who; size?: number; at?: ReactNode }) {
  return (
    <div className="flow-who">
      <Avatar name={who.name} color={colorOf(who)} size={size} />
      <div className="flow-who-text">
        <span className="flow-who-name">
          <b>{who.name}</b>
          {who.kind === 'agent' && <span className="chip agent" title="An agent, with your API key">for {who.for ?? 'you'}</span>}
        </span>
        {at && <span className="flow-who-at">{at}</span>}
      </div>
    </div>
  );
}

export function KindBadge({ kind }: { kind: ItemKind }) {
  return <span className={cx('badge flow-kind', kind)}>{KIND_ICON[kind]}{KIND_LABEL[kind]}</span>;
}

export function Tags({ tags, onPick, picked }: { tags: string[]; onPick?: (tag: string) => void; picked?: string | null }) {
  if (!tags.length) return null;
  return (
    <span className="flow-tags">
      {tags.map((t) => onPick ? (
        <button key={t} type="button" className={cx('flow-tag', picked === t && 'is-on')} onClick={() => onPick(t)} aria-pressed={picked === t}>#{t}</button>
      ) : (
        <span key={t} className="flow-tag">#{t}</span>
      ))}
    </span>
  );
}

/** "Tomorrow 15:00–16:00", "Due today", "Overdue 2 days" (in red). */
export function When({ item, today }: { item: FlowItem; today: string }) {
  const label = whenLabel(item, today);
  if (!label) return null;
  const late = !item.done && label.startsWith('Overdue');
  return <span className={cx('flow-when', late && 'is-late', item.done && 'is-done')}>{item.kind === 'event' ? <Calendar size={12} aria-hidden="true" /> : <Clock3 size={12} aria-hidden="true" />}{label}</span>;
}

export function PriorityMark({ priority, onCycle }: { priority: Priority; onCycle?: () => void }) {
  const label = PRIORITIES[priority];
  const text = priority === 2 ? '!!' : priority === 1 ? '!' : '·';
  if (onCycle) {
    return <button type="button" className={cx('flow-prio', `p${priority}`)} title={`Priority: ${label} (click to change)`} aria-label={`Priority ${label}, click to change`} onClick={onCycle}>{text}</button>;
  }
  if (!priority) return null;
  return <span className={cx('flow-prio', `p${priority}`)} title={`Priority: ${label}`} aria-label={`Priority ${label}`}>{text}</span>;
}

/** The minutes on an item, ticking while the clock runs. */
export function ClockBadge({ item, now }: { item: FlowItem; now: number }) {
  const minutes = minutesOn(item, now);
  if (!minutes && !item.clock) return null;
  return (
    <span className={cx('flow-clock', !!item.clock && 'is-running')} title={item.clock ? 'The clock is running' : 'Time logged'}>
      {item.clock ? <Play size={11} aria-hidden="true" /> : <Clock3 size={11} aria-hidden="true" />}
      {durationLabel(minutes)}
    </span>
  );
}

/** A tick box that completes a task. */
export function DoneBox({ item, onChange, label }: { item: FlowItem; onChange: (done: boolean) => void; label?: string }) {
  return (
    <label className={cx('flow-done', item.done && 'is-done')} title={item.done ? 'Done; click to reopen' : 'Mark done'}>
      <input type="checkbox" checked={item.done} onChange={(e) => onChange(e.target.checked)} aria-label={label ?? (item.done ? `Reopen ${item.text}` : `Done: ${item.text}`)} />
      <span className="flow-done-box" aria-hidden="true">{item.done && <Check size={12} strokeWidth={3} />}</span>
    </label>
  );
}

/** An attached document, as a link into the editor. */
export function DocLink({ id, title, navigate }: { id: string; title: string; navigate: (p: string) => void }) {
  return (
    <a className="flow-doc" href={`/d/${id}`} onClick={(e) => { if (!e.metaKey && !e.ctrlKey) { e.preventDefault(); navigate(`/d/${id}`); } }}>
      <FileText size={13} aria-hidden="true" />{title || 'A document'}
    </a>
  );
}

export interface ItemMenuDeps {
  acts: FlowActions;
  openItem: (id: string) => void;
  confirm: (c: Confirm) => void;
  /** Extra items put first (a view's own: Move to …). */
  first?: MenuItem[];
}

/** The ⋯ menu every item has, the same in every view. */
export function itemMenu(item: FlowItem, { acts, openItem, confirm, first = [] }: ItemMenuDeps): MenuItem[] {
  const make = (kind: ItemKind): MenuItem => ({ label: `Make it ${kind === 'event' ? 'an event' : `a ${kind}`}`, icon: KIND_ICON[kind], run: () => void acts.patch(item.id, { kind }) });
  const items: MenuItem[] = [
    ...first,
    { label: 'Edit', icon: <Pencil size={15} />, run: () => openItem(item.id) },
    ...(['task', 'note', 'event'] as ItemKind[]).filter((k) => k !== item.kind).map(make),
    item.kind === 'task'
      ? { label: item.done ? 'Not done' : 'Done', icon: item.done ? <Undo2 size={15} /> : <CircleDashed size={15} />, run: () => void acts.patch(item.id, { done: !item.done }) }
      : null,
    { label: item.pinned ? 'Unpin' : 'Pin', icon: item.pinned ? <PinOff size={15} /> : <Pin size={15} />, run: () => void acts.patch(item.id, { pinned: !item.pinned }) },
    { label: item.clock ? 'Stop the clock' : 'Start the clock', icon: item.clock ? <Pause size={15} /> : <Play size={15} />, run: () => void acts.clock(item.id, !item.clock) },
    {
      label: 'Delete', icon: <Trash2 size={15} />, danger: true,
      run: () => confirm({ title: `Delete "${item.text || KIND_LABEL[item.kind].toLowerCase()}"?`, body: 'Its comments and reactions go with it. This can’t be undone.', action: 'Delete', run: () => acts.remove(item.id) }),
    },
  ].filter((x): x is MenuItem => !!x);
  return items;
}

export function ItemMenu({ item, deps, onOpenChange }: { item: FlowItem; deps: ItemMenuDeps; onOpenChange?: (open: boolean) => void }) {
  return <Menu label={item.text || KIND_LABEL[item.kind]} items={() => itemMenu(item, deps)} onOpenChange={onOpenChange} />;
}
