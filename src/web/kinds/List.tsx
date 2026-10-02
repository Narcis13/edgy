// A list cell: a checklist, bullets or numbers. People edit the items in
// place; a list with an expression shows what it computes, read only.

import { useEffect, useRef, useState } from 'react';
import { GripVertical, Plus, X } from 'lucide-react';
import type { Cell, Json } from '../../core/types';
import type { CellState } from '../../core/engine';
import { cx } from '../editor/ctx';
import { asItems, inserted, isDone, itemText, moved, progress, removed, toggled, withText } from './items';
import { ownKeys, useSetValue } from './shared';
import './kinds.css';

interface Edit {
  at: number;
  /** A new item, not stored until it has some text. */
  fresh: boolean;
}

interface Drag {
  from: number;
  to: number;
  dy: number;
  /** The dragged item's height: how far the others step aside. */
  h: number;
}

export function ListView({ cell, st }: { cell: Cell; st: CellState | undefined }) {
  const type = cell.type === 'check' || cell.type === 'number' ? cell.type : 'bullet';
  const label = (st?.props?.label as string | undefined) ?? cell.label;
  const computed = cell.expr !== undefined;
  const items: unknown[] = computed ? (Array.isArray(st?.value) ? st.value : []) : asItems(cell.value, type);
  const { done, total } = progress(items);
  const List = type === 'number' ? 'ol' : 'ul';
  const showProgress = type === 'check' && total > 0 && cell.progress !== false;

  return (
    <div className={cx('klist', `is-${type}`, computed && 'is-computed')} onKeyDown={ownKeys}
      data-marker={type === 'bullet' && cell.marker && cell.marker !== 'dot' ? cell.marker : undefined}
      data-density={cell.density === 'compact' || cell.density === 'roomy' ? cell.density : undefined}>
      {(label || showProgress) && (
        <div className="klist-head">
          {label && <span className="kind-label">{label}</span>}
          {showProgress && (
            <span className="klist-progress">
              <span className="klist-bar" aria-hidden><i style={{ width: `${(done / total) * 100}%` }} /></span>
              {done} of {total} done
            </span>
          )}
        </div>
      )}
      {computed
        ? <List className="klist-items" aria-label={label}>{items.map((it, i) => <Shown key={i} it={it} i={i} type={type} />)}</List>
        : <Editable cell={cell} type={type} items={items as Json[]} label={label} List={List} />}
      {computed && !items.length && <span className="hint">Nothing in this list</span>}
    </div>
  );
}

function Mark({ type, i, done, onToggle, text }: { type: string; i: number; done: boolean; onToggle?: () => void; text: string }) {
  if (type === 'check') {
    return (
      <label className="klist-check">
        <input type="checkbox" checked={done} disabled={!onToggle} onChange={onToggle} aria-label={text || `Item ${i + 1}`} />
        <span className="box" aria-hidden />
      </label>
    );
  }
  return type === 'number' ? <span className="klist-mark num" aria-hidden>{i + 1}.</span> : <span className="klist-mark dot" aria-hidden />;
}

function Shown({ it, i, type }: { it: unknown; i: number; type: string }) {
  const done = type === 'check' && isDone(it);
  return (
    <li className={cx('klist-item', done && 'is-done')}>
      <Mark type={type} i={i} done={done} text={itemText(it)} />
      <span className="klist-text">{itemText(it)}</span>
    </li>
  );
}

function Editable({ cell, type, items, label, List }: { cell: Cell; type: string; items: Json[]; label?: string; List: 'ul' | 'ol' }) {
  const setValue = useSetValue(cell);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [draft, setDraft] = useState('');
  const [drag, setDrag] = useState<Drag | null>(null);
  const current = useRef<Edit | null>(null);
  const root = useRef<HTMLUListElement & HTMLOListElement>(null);
  const focusNext = useRef<{ at: number; part: 'text' | 'grip' | 'add' } | null>(null);

  useEffect(() => {
    const f = focusNext.current;
    if (!f || !root.current) return;
    focusNext.current = null;
    const sel = f.part === 'add' ? '.klist-add' : `[data-i="${f.at}"] .klist-${f.part}`;
    root.current.parentElement?.querySelector<HTMLElement>(sel)?.focus();
  });

  const start = (e: Edit | null, text = '') => {
    current.current = e;
    setEdit(e);
    setDraft(text);
  };

  /** Save what was typed; then stop, or carry on with a new item below. */
  const finish = (e: Edit, text: string, then: 'stop' | 'next' | 'cancel') => {
    if (current.current !== e) return;
    const has = text.trim() !== '';
    let next = items;
    if (then !== 'cancel') {
      if (e.fresh) next = has ? inserted(items, e.at, text, type) : items;
      else if (!has) next = removed(items, e.at);
      else if (text !== itemText(items[e.at])) next = withText(items, e.at, text, type);
    }
    if (next !== items) setValue(next);
    if (then === 'next' && has) start({ at: e.at + 1, fresh: true });
    else {
      start(null);
      if (then !== 'stop') focusNext.current = e.fresh && e.at >= items.length ? { at: 0, part: 'add' } : { at: e.at, part: 'text' };
    }
  };

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>, mine: Edit) => {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      finish(mine, draft, 'next');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finish(mine, draft, 'cancel');
    } else if (e.key === 'Backspace' && draft === '') {
      e.preventDefault();
      const prev = mine.at - 1;
      if (!mine.fresh) setValue(removed(items, mine.at));
      if (prev >= 0) start({ at: prev, fresh: false }, itemText(items[prev]));
      else start(null);
    }
  };

  const field = (mine: Edit) => (
    <input
      className="klist-input" value={draft} aria-label={mine.fresh ? 'New item' : 'Item'} placeholder={mine.fresh ? 'New item' : ''}
      ref={(el) => {
        if (el && document.activeElement !== el) {
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        }
      }}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => onInputKey(e, mine)}
      onBlur={() => finish(mine, draft, 'stop')}
    />
  );

  // Reordering: drag the grip, or focus it and use the arrow keys.
  const onGripDown = (e: React.PointerEvent<HTMLButtonElement>, from: number) => {
    if (e.button !== 0) return;
    const list = root.current;
    if (!list) return;
    e.preventDefault();
    const el = e.currentTarget;
    const rows = [...list.querySelectorAll<HTMLElement>(':scope > .klist-item')];
    const mids = rows.map((r) => { const b = r.getBoundingClientRect(); return b.top + b.height / 2; });
    const y0 = e.clientY;
    const h = rows[from]?.offsetHeight ?? 0;
    let state: Drag = { from, to: from, dy: 0, h };
    el.setPointerCapture(e.pointerId);
    setDrag(state);
    const move = (ev: PointerEvent) => {
      const dy = ev.clientY - y0;
      const y = mids[from] + dy;
      let to = mids.filter((m, j) => j !== from && m < y).length;
      to = Math.max(0, Math.min(items.length - 1, to));
      state = { from, to, dy, h };
      setDrag(state);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      setDrag(null);
      if (state.to !== state.from) setValue(moved(items, state.from, state.to));
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  const onGripKey = (e: React.KeyboardEvent, i: number) => {
    const to = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : null;
    if (to === null) return;
    e.preventDefault();
    if (to < 0 || to >= items.length) return;
    setValue(moved(items, i, to));
    focusNext.current = { at: to, part: 'grip' };
  };
  const shift = (j: number): number => {
    if (!drag) return 0;
    if (j === drag.from) return drag.dy;
    if (drag.from < drag.to && j > drag.from && j <= drag.to) return -drag.h;
    if (drag.from > drag.to && j >= drag.to && j < drag.from) return drag.h;
    return 0;
  };

  // Items have no ids; their text (and which repeat of it) keeps each row's identity as they move.
  const seen = new Map<string, number>();
  const rows: React.ReactNode[] = items.map((it, i) => {
    const text = itemText(it);
    const n = seen.get(text) ?? 0;
    seen.set(text, n + 1);
    const done = type === 'check' && isDone(it);
    const editing = edit && !edit.fresh && edit.at === i ? edit : null;
    return (
      <li key={`${n}:${text}`} data-i={i} data-ev-index={i} className={cx('klist-item', done && 'is-done', drag?.from === i && 'is-dragging')}
        style={drag ? { transform: `translateY(${shift(i)}px)` } : undefined}>
        <Mark type={type} i={i} done={done} text={text} onToggle={() => setValue(toggled(items, i))} />
        {editing ? field(editing) : (
          <button type="button" className="klist-text" data-ev-part onClick={() => start({ at: i, fresh: false }, text)}>
            {text || <span className="hint">Empty</span>}
          </button>
        )}
        <span className="klist-tools">
          <button type="button" className="klist-grip" aria-label={`Move “${text}”; use the arrow keys`} title="Drag to reorder"
            onPointerDown={(e) => onGripDown(e, i)} onKeyDown={(e) => onGripKey(e, i)}>
            <GripVertical size={14} />
          </button>
          <button type="button" className="klist-del" aria-label={`Delete “${text}”`} title="Delete"
            onClick={() => { setValue(removed(items, i)); focusNext.current = items.length > 1 ? { at: Math.max(0, i - 1), part: 'text' } : { at: 0, part: 'add' }; }}>
            <X size={14} />
          </button>
        </span>
      </li>
    );
  });
  if (edit?.fresh) {
    rows.splice(edit.at, 0, (
      <li key="new" className="klist-item is-new">
        <Mark type={type} i={edit.at} done={false} text="" />
        {field(edit)}
      </li>
    ));
  }

  return (
    <>
      <List className={cx('klist-items', drag && 'is-sorting')} ref={root} aria-label={label}>{rows}</List>
      {!(edit?.fresh && edit.at >= items.length) && (
        <button type="button" className="klist-add" onClick={() => start({ at: items.length, fresh: true })}>
          <Plus size={14} /> Add an item
        </button>
      )}
    </>
  );
}
