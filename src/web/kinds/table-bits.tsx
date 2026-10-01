// The small parts of a table cell that both the grid and the cards use:
// how a value shows, the pick control, row actions, the in-place editor
// and the handle that resizes a column.

import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Star } from 'lucide-react';
import type { Cell } from '../../core/types';
import { CELL_ICONS } from '../editor/icons';
import { cx } from '../editor/ctx';
import {
  type At, type Column, type Group, type Rec, type Row, type RowAction,
  MIN_WIDTH, actionName, badgeColors, clampWidth, isYes, linkHref, linkText, marks, progressFraction, starCount,
} from './rows';

type Key = string | number;
export type Then = 'stop' | 'down' | 'next' | 'prev' | 'cancel';

/** What the grid and the cards need from the table. */
export interface Model {
  cell: Cell;
  cols: Column[];
  numeric: Set<string>;
  q: string;
  page: boolean;
  live: boolean;
  /** "one" or "many" when rows can be picked here and now. */
  select: 'one' | 'many' | null;
  picked: Set<Key>;
  pick(row: Row): void;
  pickAll(rows: Row[], on: boolean): void;
  actions: RowAction[];
  run(a: RowAction, row: Row): Promise<void>;
  text(r: Rec, c: Column): string;
  /** Every row that passes the search, in order. */
  found: Row[];
  blocks: Block[];
  grouped: boolean;
  fold(g: Group): void;
  totals: Column[];
  total(c: Column, rows: Row[]): string;
  stripes: boolean;
  /** Typed rows in Edit mode: double-click to change, add and delete rows and columns. */
  editable: boolean;
  editAt: At | null;
  startEdit(at: At): void;
  commit(at: At, text: string, then: Then): void;
  initial(at: At): string;
  removeRow(row: Row): void;
  addColumn(name: string): boolean;
  rowClick(row: Row, e: React.MouseEvent): void;
}

/** A run of rows: a group (open or folded), or every row when the table isn't grouped. */
export interface Block {
  group: Group | null;
  open: boolean;
  /** The rows drawn, within the "show more" limit. */
  rows: Row[];
}

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

export function Hi({ text, q }: { text: string; q: string }) {
  return <>{marks(text, q).map((p, i) => (p.hit ? <mark key={i}>{p.text}</mark> : p.text))}</>;
}

/** A value the way its column shows it. */
export function Value({ v, c, text, q }: { v: unknown; c: Column; text: string; q: string }) {
  switch (c.show) {
    case 'badge': {
      if (!text) return null;
      const { bg, fg } = badgeColors(c.colors, v);
      return <span className="ktable-badge" style={{ background: bg, color: fg }}><Hi text={text} q={q} /></span>;
    }
    case 'progress': {
      const f = progressFraction(v);
      if (f === null) return <Hi text={text} q={q} />;
      return (
        <span className="ktable-prog">
          <span className="ktable-prog-bar" aria-hidden><i style={{ width: `${f * 100}%` }} /></span>
          <span className="ktable-prog-pct">{Math.round(f * 100)}%</span>
        </span>
      );
    }
    case 'check':
      return isYes(v)
        ? <span className="ktable-yes"><Check size="1.15em" strokeWidth={2.5} aria-hidden /><span className="sr-only">Yes</span></span>
        : <span className="ktable-no"><span aria-hidden>–</span><span className="sr-only">No</span></span>;
    case 'link': {
      const href = linkHref(v);
      if (!href) return <Hi text={text} q={q} />;
      return <a className="ktable-link" href={href} target="_blank" rel="noopener noreferrer" onClick={stop}><Hi text={linkText(text)} q={q} /></a>;
    }
    case 'stars': {
      const n = starCount(v);
      if (n === null) return <Hi text={text} q={q} />;
      return (
        <span className="ktable-stars" role="img" aria-label={`${n} of 5 stars`}>
          {[0, 1, 2, 3, 4].map((i) => <Star key={i} size="1em" className={cx(i < n && 'is-on')} aria-hidden />)}
        </span>
      );
    }
    default:
      return <Hi text={text} q={q} />;
  }
}

/** A checkbox (many) or a round pick (one); `mixed` shows that some, not all, are picked. */
export function PickBox({ mode, on, mixed, label, onToggle }: { mode: 'one' | 'many'; on: boolean; mixed?: boolean; label: string; onToggle: () => void }) {
  return (
    <label className="ktable-pickbox" onClick={stop} onDoubleClick={stop}>
      <input
        type={mode === 'one' ? 'radio' : 'checkbox'} checked={on} aria-label={label}
        ref={(el) => { if (el) el.indeterminate = !!mixed; }}
        onChange={mode === 'many' ? onToggle : () => {}}
        onClick={mode === 'one' ? onToggle : undefined}
      />
    </label>
  );
}

/** A row's buttons. One with a question asks it in place before it runs. */
export function RowActions({ actions, name, run }: { actions: RowAction[]; name: string; run: (a: RowAction) => Promise<void> }) {
  const [asking, setAsking] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const back = useRef<number | null>(null);
  const yes = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (asking !== null) yes.current?.focus();
    else if (back.current !== null) {
      buttons.current[back.current]?.focus();
      back.current = null;
    }
  }, [asking]);

  const go = async (k: number) => {
    setAsking(null);
    setBusy(k);
    try {
      await run(actions[k]);
    } finally {
      setBusy(null);
    }
  };
  const no = (k: number) => {
    back.current = k;
    setAsking(null);
  };

  const a = asking !== null ? actions[asking] : null;
  return (
    <div className="ktable-acting" onDoubleClick={stop}>
      {/* While asking, the buttons keep their room so the columns don't move. */}
      <div className={cx('ktable-btns', a && 'is-hidden')} aria-hidden={a ? true : undefined}>
        {actions.map((act, k) => {
          const Icon = act.icon ? CELL_ICONS[act.icon] : undefined;
          const label = actionName(act);
          return (
            <button
              key={k} type="button" ref={(el) => { buttons.current[k] = el; }}
              className={cx('btn', act.variant, 'ktable-act', !act.label && Icon && 'is-icon')}
              aria-label={`${label}: ${name || 'this row'}`} title={act.label ? undefined : label}
              disabled={busy !== null || !!a} aria-busy={busy === k}
              onClick={(e) => {
                e.stopPropagation();
                if (act.confirm) setAsking(k);
                else void go(k);
              }}>
              {busy === k ? <Loader2 size="1.1em" className="ktable-spin" aria-hidden /> : Icon && <Icon size="1.1em" aria-hidden />}
              {act.label && <span>{act.label}</span>}
            </button>
          );
        })}
      </div>
      {a && asking !== null && (
        <div className="ktable-ask" role="group" aria-label={a.confirm} onClick={stop}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); no(asking); } }}>
          <span className="ktable-ask-q">{a.confirm}</span>
          <button type="button" className="btn solid" ref={yes} onClick={() => void go(asking)}>Yes</button>
          <button type="button" className="btn ghost" onClick={() => no(asking)}>No</button>
        </div>
      )}
    </div>
  );
}

/** Changing one typed value in place. Enter, Tab and Escape say what happens next. */
export function CellInput({ at, initial, label, commit }: { at: At; initial: string; label: string; commit: (at: At, text: string, then: Then) => void }) {
  const [draft, setDraft] = useState(initial);
  return (
    <input
      className="ktable-input" value={draft} aria-label={label}
      ref={(el) => {
        if (el && document.activeElement !== el) {
          el.focus();
          el.select();
        }
      }}
      onChange={(e) => setDraft(e.target.value)}
      onClick={stop} onDoubleClick={stop} onPointerDown={stop}
      onBlur={() => commit(at, draft, 'stop')}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Enter') {
          e.preventDefault();
          commit(at, draft, 'down');
        } else if (e.key === 'Tab') {
          e.preventDefault();
          commit(at, draft, e.shiftKey ? 'prev' : 'next');
        } else if (e.key === 'Escape') {
          e.preventDefault();
          commit(at, draft, 'cancel');
        }
      }}
    />
  );
}

/** Naming a new column; a plus button until it's open. */
export function AddColumn({ add, wide }: { add: (name: string) => boolean; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  // Set once Enter has added the column, so the blur that follows doesn't add it again.
  const added = useRef(false);
  const close = () => {
    setOpen(false);
    setName('');
  };
  if (!open) {
    return (
      <button type="button" className={cx('ktable-addcol', wide && 'btn ghost')} aria-label="Add a column" title="Add a column" onClick={() => setOpen(true)}>
        <span aria-hidden>+</span>{wide && ' Add a column'}
      </button>
    );
  }
  return (
    <input
      className="ktable-input ktable-colname" value={name} placeholder="Column name" aria-label="New column name" autoFocus
      onChange={(e) => setName(e.target.value)} onClick={stop} onDoubleClick={stop}
      onBlur={() => {
        if (name.trim() && !added.current) add(name);
        added.current = false;
        close();
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
          e.preventDefault();
          if (add(name)) {
            added.current = true;
            close();
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          close();
        }
      }}
    />
  );
}

/**
 * The edge of a header cell people drag to resize its column, or focus and
 * move with the arrow keys; a double-click lets the column size to its content.
 */
export function ResizeHandle({ label, width, live, done }: {
  label: string;
  width: number | undefined;
  live: (w: number) => void;
  done: (w: number | null) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const measured = (el: HTMLElement) => el.parentElement?.getBoundingClientRect().width ?? MIN_WIDTH;

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget;
    const start = measured(el);
    const x0 = e.clientX;
    let w: number | null = null;
    // Capture keeps the drag going outside the handle; a pointer that is already gone can't be captured.
    try { el.setPointerCapture(e.pointerId); } catch { /* the moves still reach the handle */ }
    setDragging(true);
    document.body.classList.add('resize-x');
    const move = (ev: PointerEvent) => {
      w = clampWidth(start + ev.clientX - x0);
      live(w);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      document.body.classList.remove('resize-x');
      setDragging(false);
      if (w !== null) done(w);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  return (
    <div
      className={cx('ktable-resize', dragging && 'is-dragging')} role="separator" aria-orientation="vertical" tabIndex={0}
      aria-label={`Resize the ${label} column`} aria-valuenow={width} aria-valuemin={MIN_WIDTH} aria-valuemax={2000}
      title="Drag to resize; double-click to fit"
      onPointerDown={onDown} onClick={stop}
      onDoubleClick={(e) => { e.stopPropagation(); done(null); }}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        e.stopPropagation();
        const base = width ?? measured(e.currentTarget);
        done(clampWidth(base + (e.key === 'ArrowRight' ? 16 : -16)));
      }}
    />
  );
}
