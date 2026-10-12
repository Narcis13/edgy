// The board: the tasks as cards in columns. A card moves by dragging (a mouse,
// a pen, a finger), by Shift+←/→ on the focused card, or by "Move to …" in its
// menu; the columns are renamed, added, moved and removed from their ⋯ menu.
// Which column a card is in, and what moving it changes, are the model's rules
// (columnOf, moveTo); where a drop lands is worked out in board.ts.

import { type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, GripVertical, MessageCircle, Pencil, Plus, ThumbsUp, Trash2 } from 'lucide-react';
import { type FlowItem, cardsIn, columnOf, moveTo } from '../../../core/flow';
import { type MenuItem, Menu } from '../library/Menu';
import { cx } from '../library/text';
import { ClockBadge, DoneBox, ItemMenu, PriorityMark, Tags, When } from './bits';
import type { ViewProps } from './FlowPage';
import {
  MAX_COLUMNS, MIN_COLUMNS, addedAfter, columnAt, dropIndex, edgeScroll, endOrder, movedColumn, neighbour, orderAt, removedColumn, renamed, samePlace,
} from './board-rules';
import './board.css';

/** A drag in progress: which card, where the pointer is, and where the card would land. */
interface Drag {
  id: string;
  text: string;
  priority: FlowItem['priority'];
  x: number;
  y: number;
  offX: number;
  offY: number;
  width: number;
  column: string;
  index: number;
}

interface Session {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
  cleanup: () => void;
}

/** Counts of comments and reactions on each item. */
type Counts = Map<string, { comments: number; reactions: number }>;

interface Ctx {
  props: ViewProps;
  columns: string[];
  counts: Counts;
  drag: Drag | null;
  /** True just after a drag ended, so the click that follows it opens nothing. */
  suppress: { current: boolean };
  begin: (e: ReactPointerEvent<HTMLElement>, item: FlowItem, column: string) => void;
  moveToColumn: (item: FlowItem, to: string, keepFocus?: boolean) => void;
}

/** An action whose failure the actions already report by loading again: no unhandled rejection. */
const quiet = (p: Promise<unknown>): void => {
  p.catch(() => undefined);
};

/** The nearest ancestor that scrolls up and down (the page's pane), for edge-scrolling while a card is held. */
function scroller(el: HTMLElement): Element {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return document.scrollingElement ?? document.documentElement;
}

export function Board(props: ViewProps) {
  const { data, acts, confirm } = props;
  const columns = data.board.columns;
  const boardRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const session = useRef<Session | null>(null);
  const suppress = useRef(false);
  const focusId = useRef<string | null>(null);
  // The drag's handlers live as long as the drag, so they read the board from here, not from their closure.
  const live = useRef({ props, columns });
  live.current = { props, columns };

  const counts = useMemo<Counts>(() => {
    const m: Counts = new Map();
    const at = (id: string) => {
      let c = m.get(id);
      if (!c) m.set(id, (c = { comments: 0, reactions: 0 }));
      return c;
    };
    for (const c of data.comments) at(c.item).comments++;
    for (const r of data.reactions) at(r.item).reactions++;
    return m;
  }, [data.comments, data.reactions]);

  const lists = useMemo(() => columns.map((name) => cardsIn(data.items, name, columns)), [data.items, columns]);
  const total = lists.reduce((n, l) => n + l.length, 0);

  // After a keyboard move the card is in another column, so it is a new element: give it the focus again.
  useEffect(() => {
    const id = focusId.current;
    if (!id) return;
    focusId.current = null;
    boardRef.current?.querySelector<HTMLElement>(`.board-card[data-id="${CSS.escape(id)}"]`)?.focus();
  }, [data.items]);

  useEffect(() => () => session.current?.cleanup(), []);

  /** Where a card dropped at (x, y) would land: the column under x, and the place among its other cards under y. */
  const targetAt = (x: number, y: number, dragId: string): { column: string; index: number } | null => {
    const board = boardRef.current;
    if (!board) return null;
    const cols = [...board.querySelectorAll<HTMLElement>('.board-col')];
    const rects = cols.map((c) => {
      const r = c.getBoundingClientRect();
      return { name: c.dataset.column ?? '', left: r.left, right: r.right };
    });
    const column = columnAt(rects, x);
    const el = cols.find((c) => c.dataset.column === column);
    if (column === null || !el) return null;
    const cards = [...el.querySelectorAll<HTMLElement>('.board-card')]
      .filter((c) => c.dataset.id !== dragId)
      .map((c) => {
        const r = c.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom };
      });
    return { column, index: dropIndex(cards, y) };
  };

  const moveToColumn = (item: FlowItem, to: string, keepFocus = false) => {
    const { props: p, columns: cols } = live.current;
    const order = endOrder(cardsIn(p.data.items, to, cols), item.id);
    if (keepFocus) focusId.current = item.id;
    quiet(p.acts.patch(item.id, { ...moveTo(to, cols), order }));
  };

  const begin = (e: ReactPointerEvent<HTMLElement>, item: FlowItem, column: string) => {
    if (session.current || e.button !== 0) return;
    const target = e.target as HTMLElement;
    // A finger on a phone drags by the grip, so the rest of the card still scrolls the board.
    const gripOnly = live.current.props.phone || !window.matchMedia('(pointer: fine)').matches;
    if (e.pointerType === 'touch' && gripOnly && !target.closest('.board-grip')) return;
    // The buttons, boxes, links and menus in a card are for clicking; the title is a button too, but it is also where a card is grabbed.
    if (target.closest('input, a, label, [role="menu"], .lc-menu')) return;
    const button = target.closest('button');
    if (button && !button.classList.contains('board-card-text')) return;

    const card = e.currentTarget;
    const box = card.getBoundingClientRect();
    const s: Session = { id: item.id, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, active: false, cleanup: () => undefined };
    session.current = s;
    let timer: ReturnType<typeof setInterval> | null = null;

    const show = () => {
      const t = targetAt(s.x, s.y, s.id);
      setDrag({
        id: s.id, text: item.text, priority: item.priority, x: s.x, y: s.y, offX: s.startX - box.left, offY: s.startY - box.top, width: box.width,
        column: t?.column ?? column, index: t?.index ?? 0,
      });
    };
    // Held near an edge, the board (and the page) scrolls, so a far column or a far card can be reached.
    const tick = () => {
      const board = boardRef.current;
      if (!board) return;
      const r = board.getBoundingClientRect();
      const dx = edgeScroll(s.x, Math.max(r.left, 0), Math.min(r.right, window.innerWidth), 56, 22);
      const dy = edgeScroll(s.y, 0, window.innerHeight, 64, 22);
      if (dx) board.scrollLeft += dx;
      if (dy) scroller(board).scrollTop += dy;
      if (dx || dy) show();
    };
    const end = (dropped: boolean) => {
      const wasActive = s.active;
      s.cleanup();
      session.current = null;
      setDrag(null);
      if (wasActive) {
        suppress.current = true;
        setTimeout(() => { suppress.current = false; }, 50);
      }
      if (!wasActive || !dropped) return;
      const t = targetAt(s.x, s.y, s.id);
      const { props: p, columns: cols } = live.current;
      const now = p.data.items.find((i) => i.id === s.id);
      if (!t || !now) return;
      const cards = cardsIn(p.data.items, t.column, cols);
      if (t.column === columnOf(now, cols) && samePlace(cards, s.id, t.index)) return;
      quiet(p.acts.patch(s.id, { ...moveTo(t.column, cols), order: orderAt(cards, s.id, t.index) }));
    };

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== s.pointerId) return;
      s.x = ev.clientX;
      s.y = ev.clientY;
      if (!s.active) {
        if (Math.hypot(s.x - s.startX, s.y - s.startY) < 4) return;
        s.active = true;
        try { card.setPointerCapture(s.pointerId); } catch { /* the pointer is already gone */ }
        timer = setInterval(tick, 30);
      }
      show();
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== s.pointerId) return;
      s.x = ev.clientX;
      s.y = ev.clientY;
      end(true);
    };
    const cancel = (ev: PointerEvent) => {
      if (ev.pointerId === s.pointerId) end(false);
    };
    const key = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      ev.preventDefault();
      end(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key);
    s.cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key);
      if (timer) clearInterval(timer);
      try { if (card.hasPointerCapture(s.pointerId)) card.releasePointerCapture(s.pointerId); } catch { /* gone with the card */ }
    };
  };

  // ── the columns ──

  const saveColumns = (next: string[]) => quiet(acts.board(next));

  /** Renames a column; null when done, or what is wrong with the name. A card's column is its status, so the cards follow the new name. */
  const rename = (index: number, name: string): string | null => {
    const old = columns[index];
    const r = renamed(columns, index, name);
    if ('error' in r) return r.error;
    const next = r.columns[index];
    if (next === old) return null;
    quiet(acts.board(r.columns, { from: old, to: next }));
    return null;
  };

  const addAfter = (index: number) => {
    const added = addedAfter(columns, index);
    if (!added) return;
    setRenaming(added.name);
    saveColumns(added.columns);
  };

  const remove = (index: number) => {
    const name = columns[index];
    confirm({ title: `Remove "${name}"?`, body: 'Its cards go back to the first column.', action: 'Remove', run: () => acts.board(removedColumn(columns, index)) });
  };

  const ctx: Ctx = { props, columns, counts, drag, suppress, begin, moveToColumn };

  return (
    <>
      {total === 0 && (
        <div className="lib-empty board-none">
          <b>No tasks yet.</b>
          <span>Write one under “{columns[0]}”, like <code>Send the quote friday #sales</code>. Notes and events are not on the board; make one a task from its ⋯ menu.</span>
        </div>
      )}
      <div ref={boardRef} className={cx('board', drag && 'is-dragging')} role="group" aria-label="Board">
        {columns.map((name, i) => (
          <Column
            key={name}
            ctx={ctx}
            name={name}
            index={i}
            cards={lists[i]}
            renaming={renaming === name}
            onRenameStart={() => setRenaming(name)}
            onRename={(v) => {
              const err = rename(i, v);
              if (!err) setRenaming(null);
              return err;
            }}
            onRenameCancel={() => setRenaming(null)}
            menu={(): MenuItem[] => [
              { label: 'Rename', icon: <Pencil size={15} />, run: () => setRenaming(name) },
              // The last column means done, so nothing may put another column after it or take it away.
              { label: 'Add a column after', icon: <Plus size={15} />, disabled: columns.length >= MAX_COLUMNS || i === columns.length - 1, run: () => addAfter(i) },
              { label: 'Move left', icon: <ArrowLeft size={15} />, disabled: i === 0 || i === columns.length - 1, run: () => saveColumns(movedColumn(columns, i, -1)) },
              { label: 'Move right', icon: <ArrowRight size={15} />, disabled: i >= columns.length - 2, run: () => saveColumns(movedColumn(columns, i, 1)) },
              { label: 'Remove', icon: <Trash2 size={15} />, danger: true, disabled: columns.length <= MIN_COLUMNS || i === columns.length - 1, run: () => remove(i) },
            ]}
          />
        ))}
        {columns.length < MAX_COLUMNS && (
          // A new column goes before the last one: the last always means done, so after it would make "Done" a middle column's name for finished work.
          <button type="button" className="board-new-col" onClick={() => addAfter(columns.length - 2)} title={`Add a column before ${columns[columns.length - 1]}`}>
            <Plus size={15} aria-hidden="true" /> Add a column
          </button>
        )}
      </div>
      {drag && (
        <div className="board-ghost" aria-hidden="true" style={{ left: drag.x - drag.offX, top: drag.y - drag.offY, width: drag.width }}>
          {drag.priority > 0 && <PriorityMark priority={drag.priority} />}
          <span>{drag.text || '(no title)'}</span>
        </div>
      )}
    </>
  );
}

interface ColumnProps {
  ctx: Ctx;
  name: string;
  index: number;
  cards: FlowItem[];
  renaming: boolean;
  onRenameStart: () => void;
  onRename: (name: string) => string | null;
  onRenameCancel: () => void;
  menu: () => MenuItem[];
}

function Column({ ctx, name, index, cards, renaming, onRenameStart, onRename, onRenameCancel, menu }: ColumnProps) {
  const { drag, columns } = ctx;
  const done = index === columns.length - 1;
  const over = drag?.column === name;
  const dropAt = over ? drag.index : -1;

  // The drop line goes before the nth of the other cards (the held one does not count), or at the end.
  const list: ReactNode[] = [];
  let seen = 0;
  const line = <div key="drop" className="board-drop" aria-hidden="true" />;
  for (const c of cards) {
    if (c.id !== drag?.id) {
      if (seen === dropAt) list.push(line);
      seen++;
    }
    list.push(<Card key={c.id} item={c} column={name} ctx={ctx} />);
  }
  if (dropAt >= 0 && seen === dropAt) list.push(line);

  return (
    <section className={cx('board-col', done && 'is-done', over && 'is-over')} data-column={name} aria-label={`${name}, ${cards.length} ${cards.length === 1 ? 'card' : 'cards'}`}>
      <header className="board-col-head">
        {done && <CheckCircle2 size={15} aria-hidden="true" className="board-col-tick" />}
        {renaming ? (
          <RenameInput name={name} onSave={onRename} onCancel={onRenameCancel} />
        ) : (
          <h2 className="board-col-name" title={name} onDoubleClick={onRenameStart}>{name}</h2>
        )}
        <span className="lib-n">{cards.length}</span>
        <Menu label={`${name} column`} items={menu} />
      </header>
      <div className="board-cards">
        {list}
        {cards.length === 0 && <p className="board-empty">Nothing here</p>}
      </div>
      <AddCard column={name} ctx={ctx} />
    </section>
  );
}

function RenameInput({ name, onSave, onCancel }: { name: string; onSave: (name: string) => string | null; onCancel: () => void }) {
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const closed = useRef(false);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  // Enter saves, and a name that will not do stays open with the reason; leaving the box saves a good name and drops a bad one.
  const commit = (leaving: boolean) => {
    if (closed.current) return;
    const err = onSave(value);
    if (!err) {
      closed.current = true;
    } else if (leaving) {
      closed.current = true;
      onCancel();
    } else {
      setError(err);
    }
  };
  return (
    <div className="board-rename">
      <input
        ref={input}
        className="text-field"
        value={value}
        maxLength={40}
        aria-label={`Name of the ${name} column`}
        aria-invalid={error ? true : undefined}
        onChange={(e) => { setValue(e.target.value); setError(null); }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Enter') { e.preventDefault(); commit(false); }
          else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closed.current = true; onCancel(); }
        }}
        onBlur={() => commit(true)}
      />
      {error && <p className="board-rename-error" role="alert">{error}</p>}
    </div>
  );
}

function AddCard({ column, ctx }: { column: string; ctx: Ctx }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  if (!open) {
    return (
      <button type="button" className="board-add" onClick={() => setOpen(true)}>
        <Plus size={14} aria-hidden="true" /> Add a card
      </button>
    );
  }
  const add = () => {
    const line = text.trim();
    if (!line) return;
    setText('');
    // The line is quick-add: a day in it becomes the due day. It stays open for the next card.
    quiet(ctx.props.acts.post({ text: line, kind: 'task', status: column }));
  };
  return (
    <div className="board-add is-open">
      <input
        className="text-field"
        autoFocus
        value={text}
        placeholder="Write a task, e.g. Call Ben friday"
        aria-label={`Add a card to ${column}`}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Enter') { e.preventDefault(); add(); }
          else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setText(''); setOpen(false); }
        }}
        onBlur={() => { if (!text.trim()) setOpen(false); }}
      />
    </div>
  );
}

function Card({ item, column, ctx }: { item: FlowItem; column: string; ctx: Ctx }) {
  const { props, columns, counts, drag, suppress } = ctx;
  const { today, now, acts, openItem, confirm } = props;
  const [menu, setMenu] = useState(false);
  const n = counts.get(item.id);
  const done = columns[columns.length - 1] === column;
  const first: MenuItem[] = columns
    .filter((c) => c !== column)
    .map((c) => ({ label: `Move to ${c}`, icon: <ArrowRight size={15} />, run: () => ctx.moveToColumn(item, c) }));
  const hasMeta = item.priority > 0 || item.due || item.start || item.tags.length > 0 || n?.comments || n?.reactions || item.spent || item.clock;

  const onKeyDown = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      openItem(item.id);
    } else if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      const to = neighbour(columns, column, e.key === 'ArrowLeft' ? -1 : 1);
      if (to) ctx.moveToColumn(item, to, true);
    }
  };

  return (
    <article
      className={cx('board-card', done && 'is-done', menu && 'is-menu', drag?.id === item.id && 'is-lifted')}
      data-id={item.id}
      tabIndex={0}
      aria-label={`${item.text || 'Untitled task'}, in ${column}`}
      aria-keyshortcuts="Shift+ArrowLeft Shift+ArrowRight"
      onPointerDown={(e) => ctx.begin(e, item, column)}
      onKeyDown={onKeyDown}
    >
      <div className="board-card-top">
        <span className="board-grip" aria-hidden="true"><GripVertical size={16} /></span>
        <DoneBox item={item} onChange={(d) => quiet(acts.patch(item.id, { done: d }))} />
        <button type="button" className="board-card-text" onClick={() => { if (!suppress.current) openItem(item.id); }}>
          {item.text || <span className="board-untitled">(no title)</span>}
        </button>
        <ItemMenu item={item} deps={{ acts, openItem, confirm, first }} onOpenChange={setMenu} />
      </div>
      {hasMeta && (
        <div className="board-card-meta">
          <PriorityMark priority={item.priority} />
          <When item={item} today={today} />
          <Tags tags={item.tags} />
          {!!n?.comments && <span className="board-count" title={`${n.comments} ${n.comments === 1 ? 'comment' : 'comments'}`}><MessageCircle size={13} aria-hidden="true" />{n.comments}<span className="sr-only"> {n.comments === 1 ? 'comment' : 'comments'}</span></span>}
          {!!n?.reactions && <span className="board-count" title={`${n.reactions} ${n.reactions === 1 ? 'reaction' : 'reactions'}`}><ThumbsUp size={13} aria-hidden="true" />{n.reactions}<span className="sr-only"> {n.reactions === 1 ? 'reaction' : 'reactions'}</span></span>}
          <ClockBadge item={item} now={now} />
        </div>
      )}
    </article>
  );
}
