// Rendering the tree of cells, and what each kind of leaf looks like.

import { Fragment, memo, useEffect, useRef, useState } from 'react';
import { CircleHelp, ImagePlus, Star } from 'lucide-react';
import type { Cell, Dir, Json, Op } from '../../core/types';
import { flowOf, isContainer, isGroup } from '../../core/types';
import type { CellState } from '../../core/engine';
import { display } from '../../core/engine';
import { read, show } from '../../core/sx';
import { round4, weight } from '../../core/tree';
import { uploadPicture } from '../lib/api';
import { Chart } from './Chart';
import { BreakView } from '../kinds/Break';
import { CalendarView } from '../kinds/Calendar';
import { CanvasView } from '../kinds/Canvas';
import { DiagramView } from '../kinds/Diagram';
import { ContainerView, DataChip } from '../kinds/Containers';
import { ListView } from '../kinds/List';
import { FetchView, TimerChip } from '../kinds/Background';
import { StatView } from '../kinds/Stat';
import { TableView } from '../kinds/Table';
import { CELL_ICONS } from './icons';
import { SxField } from './fields';
import { Markdown } from './Markdown';
import { COLOR_TOKENS, color, cssOf, flexOf } from './look';
import { cx, useS, useSession } from './ctx';
import { clickGate, partOf } from './pointer';

interface Props {
  cell: Cell;
  dir: Dir | null;
}

export const CellView = memo(function CellView({ cell, dir }: Props) {
  const st = useS((s) => s.computed?.cells[cell.id]);
  const selected = useS((s) => s.selection.includes(cell.id));
  const editing = useS((s) => s.editing === cell.id);
  const live = useS((s) => s.mode !== 'edit');
  const flash = useS((s) => s.flashes[cell.id]);
  const docId = useSession().id;
  const pointer = usePointer(cell);
  const paper = useS((s) => s.mode === 'page');

  if (st?.hidden && live) return null;
  // A data cell or a timer is for formulas and actions: readers never see it, and it takes no room.
  if (unseen(cell, live) || (cell.kind === 'fetch' && paper)) return null;
  const style = { ...(dir ? flexOf(cell.size) : {}), ...cssOf(st?.style), viewTransitionName: `c-${docId}-${cell.id}` };
  const classes = cx(
    'cell', isGroup(cell) ? 'group' : 'leaf', `kind-${cell.kind}`,
    selected && 'is-selected', st?.hidden && 'is-hidden', flash && 'is-flash', editing && 'is-editing', !!st?.error && 'has-error',
    !!pointer.onClick && 'has-click',
  );

  const sizing = dir ? (cell.size === 'hug' ? 'hug' : typeof cell.size === 'string' ? 'fixed' : 'fill') : undefined;
  if (isContainer(cell)) return <ContainerView cell={cell} st={st} className={classes} style={style} sizing={sizing} />;
  if (isGroup(cell)) {
    return (
      <div className={classes} data-cell={cell.id} data-size={sizing} data-stack={cell.kind === 'row' ? stackOf(cell) : undefined} style={style}>
        <Kids cell={cell} />
      </div>
    );
  }
  return (
    <div className={classes} data-cell={cell.id} data-size={sizing} style={style} {...pointer}>
      {cell.kind === 'data' ? <DataChip cell={cell} st={st} /> : <Leaf cell={cell} st={st} editing={editing} live={live} />}
      {st?.error && cell.kind !== 'text' && <span className="cell-error" title={st.error}>{st.error}</span>}
    </div>
  );
});

/** Cells readers never see in Live or on paper: data and timers; a fetch shows a line in Live only. */
function unseen(cell: Cell, live: boolean): boolean {
  if (!live) return false;
  return cell.kind === 'data' || cell.kind === 'timer';
}

/** Kinds whose whole cell can be pressed like a button when it handles click. */
const PRESSABLE = new Set(['text', 'image', 'icon', 'stat', 'chart', 'formula']);

/** In Live, a cell with a click or dblclick handler runs it when clicked (a button's click runs with its do). */
function usePointer(cell: Cell): React.HTMLAttributes<HTMLDivElement> {
  const session = useSession();
  const live = useS((s) => s.mode === 'live');
  const on = cell.on && typeof cell.on === 'object' ? (cell.on as Record<string, unknown>) : null;
  const click = on?.click != null;
  const double = on?.dblclick != null;
  if (!live || (!click && !double) || cell.kind === 'button') return {};
  const press = (where: ReturnType<typeof partOf>, detail: number, key: string) =>
    clickGate.press(key, detail, double, () => click && session.pointer(cell.id, 'click', where), () => session.pointer(cell.id, 'dblclick', where));
  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const where = partOf(e, e.currentTarget);
    press(where, e.detail || 1, cell.id + (where.index !== undefined ? ':' + where.index : ''));
  };
  if (!PRESSABLE.has(cell.kind)) return { onClick };
  return {
    onClick,
    role: 'button',
    tabIndex: 0,
    onKeyDown: (e) => {
      if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      if (click) session.pointer(cell.id, 'click');
      else session.pointer(cell.id, 'dblclick');
    },
  };
}

/** A group's cells with the edges between them; cells readers can't see leave no edge behind. */
export function Kids({ cell }: { cell: Cell }) {
  const live = useS((s) => s.mode !== 'edit');
  const visible = useS((s) =>
    live && cell.children ? cell.children.map((c) => (s.computed?.cells[c.id]?.hidden || unseen(c, true) || (c.kind === 'fetch' && s.mode === 'page') ? '0' : '1')).join('') : '',
  );
  return (
    <>
      {cell.children!.map((ch, i) => {
        if (live && visible[i] === '0') return null;
        const prev = live ? visible.lastIndexOf('1', i - 1) >= 0 : i > 0;
        return (
          <Fragment key={ch.id}>
            {prev && <Divider group={cell} index={i} />}
            <CellView cell={ch} dir={flowOf(cell)} />
          </Fragment>
        );
      })}
    </>
  );
}

/** How a row behaves on a narrow screen: wrap its cells under each other, or keep them side by side. */
const stackOf = (cell: Cell): string => {
  const v = cell.style?.stack;
  return v === 'never' || v === 'always' ? v : 'auto';
};

function Leaf({ cell, st, editing, live }: { cell: Cell; st: CellState | undefined; editing: boolean; live: boolean }) {
  switch (cell.kind) {
    case 'text':
    case 'empty':
      return editing ? <TextEditor cell={cell} /> : cell.kind === 'text' ? <TextView cell={cell} st={st} /> : <EmptyView live={live} />;
    case 'formula':
      return <FormulaView cell={cell} st={st} editing={editing} />;
    case 'input':
      return <InputView cell={cell} st={st} />;
    case 'button':
      return <ButtonView cell={cell} st={st} editing={editing} />;
    case 'image':
      return <ImageView cell={cell} st={st} live={live} />;
    case 'icon': {
      const Icon = (cell.icon && CELL_ICONS[cell.icon]) || CircleHelp;
      return <Icon className="cell-icon" strokeWidth={1.75} aria-label={cell.icon} />;
    }
    case 'chart':
      return <ChartView cell={cell} st={st} />;
    case 'table':
      return <TableView cell={cell} st={st} />;
    case 'list':
      return <ListView cell={cell} st={st} />;
    case 'calendar':
      return <CalendarView cell={cell} st={st} />;
    case 'canvas':
      return <CanvasView cell={cell} st={st} />;
    case 'stat':
      return <StatView cell={cell} st={st} />;
    case 'break':
      return <BreakView />;
    case 'diagram':
      return <DiagramView cell={cell} st={st} />;
    case 'timer':
      return <TimerChip cell={cell} />;
    case 'fetch':
      return <FetchView cell={cell} st={st} />;
    default:
      return null;
  }
}

// ── text ──

function TextView({ cell, st }: { cell: Cell; st: CellState | undefined }) {
  if (st?.error) return <span className="cell-error" title={st.error}>{cell.text}</span>;
  const text = typeof st?.value === 'string' ? st.value : cell.text ?? '';
  return text ? <Markdown text={text} /> : <span className="hint">Empty text</span>;
}

function EmptyView({ live }: { live: boolean }) {
  return live ? null : <span className="hint">Type, or press / to choose</span>;
}

/** In-place editing for text, and for an empty cell becoming text (or a formula, with =). */
function TextEditor({ cell }: { cell: Cell }) {
  const session = useSession();
  const seed = useS((s) => s.seed);
  const [text, setText] = useState(cell.text ?? '');
  const ref = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(text);
  latest.current = text;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (seed !== null) setText(seed);
    el.focus();
    const end = (seed ?? cell.text ?? '').length;
    el.setSelectionRange(end, end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.style.height = '0';
      el.style.height = el.scrollHeight + 'px';
    }
  }, [text]);

  const save = (value: string, final: boolean) => {
    if (cell.kind === 'text') {
      if (value !== cell.text) session.dispatch(['set', cell.id, 'text', value], { key: cell.id + ':text' });
      return;
    }
    if (!final || !value.trim()) return;
    const keep: Record<string, Json> = cell.style ? { style: cell.style } : {};
    if (value.startsWith('=')) {
      try {
        session.dispatch(['put', cell.id, ['formula', keep, read(value.slice(1))]]);
        return;
      } catch {
        // Not a formula after all; keep it as text.
      }
    }
    session.dispatch(['put', cell.id, ['text', keep, value]]);
  };

  const finish = () => {
    if (timer.current) clearTimeout(timer.current);
    save(latest.current, true);
    if (session.state.editing === cell.id) session.edit(null);
  };

  return (
    <textarea
      ref={ref}
      className="text-editor"
      value={text}
      rows={1}
      placeholder={cell.kind === 'empty' ? 'Write, or start with = for a formula' : ''}
      spellCheck
      onChange={(e) => {
        setText(e.target.value);
        if (cell.kind !== 'text') return;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => save(e.target.value, false), 400);
      }}
      onBlur={finish}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === 'Tab') {
          e.preventDefault();
          e.currentTarget.blur();
          session.selectNext(e.shiftKey ? -1 : 1);
        } else if (e.key === 'Enter' && cell.kind === 'empty' && !e.shiftKey && text.startsWith('=')) {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}

// ── formula ──

function FormulaView({ cell, st, editing }: { cell: Cell; st: CellState | undefined; editing: boolean }) {
  const session = useSession();
  const doc = useS((s) => s.doc);
  if (editing) {
    return (
      <SxField
        value={cell.expr}
        cell={cell.id}
        prop="expr"
        autoFocus
        preview
        className="inline"
        placeholder="(* qty price)"
        onCommit={(x) => session.dispatch(['set', cell.id, 'expr', x])}
        onDone={() => session.edit(null)}
      />
    );
  }
  if (st?.error) return null;
  if (typeof st?.value === 'function') return <span className="value fn" title="This cell holds a function">ƒ</span>;
  if (cell.expr === undefined) return <span className="hint">Empty formula</span>;
  const text = doc ? display(cell, st, doc) : '';
  return <span className="value">{text === '' ? <span className="hint">nothing</span> : text}</span>;
}

// ── input ──

function InputView({ cell, st }: { cell: Cell; st: CellState | undefined }) {
  const session = useSession();
  const type = cell.type ?? 'text';
  const props = st?.props ?? {};
  const label = (props.label as string | undefined) ?? cell.label;
  const placeholder = (props.placeholder as string | undefined) ?? cell.placeholder;
  const num = (k: 'min' | 'max' | 'step', d?: number) => {
    const v = props[k] ?? cell[k];
    return typeof v === 'number' ? v : d;
  };
  const set = (value: Json) => session.dispatch(['set', cell.id, 'value', value], { key: cell.id + ':value', transition: false });
  const value = cell.value ?? null;
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const id = `in-${cell.id}`;

  let control: React.ReactNode;
  switch (type) {
    case 'number':
      control = (
        <input id={id} type="number" className="control" value={value == null ? '' : String(value)} min={num('min')} max={num('max')} step={num('step') ?? 'any'}
          placeholder={placeholder} onChange={(e) => set(e.target.value === '' ? null : Number(e.target.value))} onKeyDown={stop} />
      );
      break;
    case 'slider': {
      const min = num('min', 0)!, max = num('max', 100)!;
      const n = typeof value === 'number' ? value : min;
      return (
        <div className="input slider">
          <label htmlFor={id} className="in-label">{label ?? ''}{!cell.label?.includes('{{') && <output>{show(n)}</output>}</label>
          <input id={id} type="range" className="range" value={n} min={min} max={max} step={num('step', 1)} style={{ '--pct': `${((n - min) / (max - min || 1)) * 100}%` } as React.CSSProperties}
            onChange={(e) => set(Number(e.target.value))} onKeyDown={stop} />
        </div>
      );
    }
    case 'checkbox':
    case 'toggle':
      return (
        <label className={cx('input', type)}>
          <input type="checkbox" checked={!!value} onChange={(e) => set(e.target.checked)} onKeyDown={stop} />
          <span className={type === 'toggle' ? 'switch' : 'box'} aria-hidden />
          <span className="in-label">{label ?? ''}</span>
        </label>
      );
    case 'select': {
      const options = (Array.isArray(props.options) ? props.options : []).map((o) => String(o));
      control = (
        <select id={id} className="control" value={value == null ? '' : String(value)} onChange={(e) => set(e.target.value)} onKeyDown={stop}>
          {!options.includes(String(value ?? '')) && <option value={String(value ?? '')}>{value == null || value === '' ? 'Choose…' : String(value)}</option>}
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
      break;
    }
    case 'date':
      control = <input id={id} type="date" className="control" value={typeof value === 'string' ? value : ''} onChange={(e) => set(e.target.value)} onKeyDown={stop} />;
      break;
    case 'textarea':
      control = (
        <textarea id={id} className="control" rows={3} value={value == null ? '' : String(value)} placeholder={placeholder}
          onChange={(e) => set(e.target.value)} onKeyDown={stop} />
      );
      break;
    case 'rating': {
      const max = Math.min(10, num('max', 5)!);
      const n = typeof value === 'number' ? value : 0;
      return (
        <div className="input rating" role="radiogroup" aria-label={label}>
          {label && <span className="in-label">{label}</span>}
          <div className="stars">
            {Array.from({ length: max }, (_, i) => (
              <button key={i} type="button" role="radio" aria-checked={n === i + 1} aria-label={`${i + 1} of ${max}`}
                className={cx(i < n && 'is-on')} onClick={() => set(n === i + 1 ? 0 : i + 1)}>
                <Star size={22} strokeWidth={1.5} />
              </button>
            ))}
          </div>
        </div>
      );
    }
    default:
      control = (
        <input id={id} type="text" className="control" value={value == null ? '' : String(value)} placeholder={placeholder}
          onChange={(e) => set(e.target.value)} onKeyDown={stop} />
      );
  }
  return (
    <div className={cx('input', type)}>
      {label && <label htmlFor={id} className="in-label">{label}</label>}
      {control}
    </div>
  );
}

// ── button ──

function ButtonView({ cell, st, editing }: { cell: Cell; st: CellState | undefined; editing: boolean }) {
  const session = useSession();
  const label = (st?.props?.label as string | undefined) ?? cell.label ?? '';
  const [text, setText] = useState(label);
  const [asking, setAsking] = useState(false);
  if (editing) {
    return (
      <input
        className="control btn-edit" value={text} autoFocus aria-label="Button label"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text !== cell.label) session.dispatch(['set', cell.id, 'label', text]);
          session.edit(null);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
        }}
      />
    );
  }
  const Icon = cell.icon ? CELL_ICONS[cell.icon] : undefined;
  if (asking) {
    // Asked first: the question and two answers take the button's place until one is chosen.
    return (
      <div className="btn-confirm" role="group" aria-label={cell.confirm}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setAsking(false); } }}>
        <span className="btn-confirm-q">{cell.confirm}</span>
        <button type="button" className="btn solid small" autoFocus onClick={() => { setAsking(false); void session.run(cell.id); }}>Yes</button>
        <button type="button" className="btn ghost small" onClick={() => setAsking(false)}>No</button>
      </div>
    );
  }
  return (
    <button type="button" className={cx('btn', cell.variant ?? 'solid', cell.do == null && 'is-idle', Icon && 'has-icon')} title={cell.do == null ? 'This button does nothing yet' : undefined}
      onClick={() => (cell.confirm && cell.do != null ? setAsking(true) : void session.run(cell.id))}>
      {Icon && <Icon size={16} strokeWidth={2} aria-hidden />}
      {label || (Icon ? null : <span className="hint">Button</span>)}
      {!label && Icon && <span className="sr-only">{cell.icon}</span>}
    </button>
  );
}

// ── picture ──

function ImageView({ cell, st, live }: { cell: Cell; st: CellState | undefined; live: boolean }) {
  const session = useSession();
  const src = typeof st?.value === 'string' ? st.value : '';
  const pick = async (file: File | undefined) => {
    if (!file) return;
    try {
      const url = await uploadPicture(file);
      session.dispatch(['set', cell.id, 'src', url]);
    } catch (e) {
      session.toast(e instanceof Error ? e.message : 'The picture could not be uploaded.');
    }
  };
  if (!src) {
    if (live) return null;
    return (
      <label className="drop">
        <ImagePlus size={20} strokeWidth={1.5} />
        <span>Choose a picture, drop one here, or paste a link in the bar above</span>
        <input type="file" accept="image/*" onChange={(e) => void pick(e.target.files?.[0])} />
      </label>
    );
  }
  return <img src={src} alt={(st?.props?.alt as string | undefined) ?? cell.alt ?? ''} style={{ objectFit: (cell.fit as 'cover' | 'contain') ?? 'cover' }} draggable={false} />;
}

// ── chart ──

function ChartView({ cell, st }: { cell: Cell; st: CellState | undefined }) {
  const currency = useS((s) => (typeof s.doc?.meta.currency === 'string' ? s.doc.meta.currency : 'USD'));
  const max = st?.props?.max ?? cell.max;
  const chart = (
    <Chart type={cell.type ?? 'bar'} value={st?.value} label={(st?.props?.label as string | undefined) ?? cell.label}
      max={typeof max === 'number' ? max : undefined} format={cell.format} currency={currency} />
  );
  const tint = color(cell.color);
  if (!tint) return chart;
  // The series takes the cell's colour; a token's soft shade backs a meter.
  const soft = COLOR_TOKENS.includes(`${cell.color}-soft` as (typeof COLOR_TOKENS)[number]) ? `var(--${cell.color}-soft)` : `color-mix(in oklab, ${tint} 18%, transparent)`;
  return <div className="chart-tint" style={{ '--chart-color': tint, '--chart-soft': soft } as React.CSSProperties}>{chart}</div>;
}

// ── the edge between two cells ──

function Divider({ group, index }: { group: Cell; index: number }) {
  const session = useSession();
  const live = useS((s) => s.mode !== 'edit');
  const a = group.children![index - 1];
  const b = group.children![index];

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (live || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    const prev = el.previousElementSibling as HTMLElement | null;
    const next = el.nextElementSibling as HTMLElement | null;
    if (!prev || !next) return;
    const horizontal = flowOf(group) === 'row';
    const start = horizontal ? e.clientX : e.clientY;
    const pa = horizontal ? prev.offsetWidth : prev.offsetHeight;
    const pb = horizontal ? next.offsetWidth : next.offsetHeight;
    const wa = weight(a), wb = weight(b);
    const min = 24;
    let result: Op[] | null = null;
    el.setPointerCapture(e.pointerId);
    el.classList.add('is-dragging');
    document.body.classList.add(horizontal ? 'resize-x' : 'resize-y');
    const move = (ev: PointerEvent) => {
      const d = (horizontal ? ev.clientX : ev.clientY) - start;
      if (wa != null && wb != null) {
        const dd = Math.max(min - pa, Math.min(pb - min, d));
        const total = wa + wb;
        const na = round4((total * (pa + dd)) / (pa + pb || 1));
        const nb = round4(total - na);
        prev.style.flex = `${na} 1 0px`;
        next.style.flex = `${nb} 1 0px`;
        result = [['set', a.id, 'size', na], ['set', b.id, 'size', nb]];
      } else if (wa == null) {
        const na = Math.max(min, Math.round(pa + d));
        prev.style.flex = `0 0 ${na}px`;
        result = [['set', a.id, 'size', `${na}px`]];
      } else {
        const nb = Math.max(min, Math.round(pb - d));
        next.style.flex = `0 0 ${nb}px`;
        result = [['set', b.id, 'size', `${nb}px`]];
      }
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.classList.remove('is-dragging');
      document.body.classList.remove('resize-x', 'resize-y');
      if (result) session.dispatch(result, { transition: false, key: `resize:${a.id}:${b.id}` });
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up, { once: true });
    el.addEventListener('pointercancel', up, { once: true });
  };

  const even = () => {
    const wa = weight(a), wb = weight(b);
    if (wa != null && wb != null) {
      const half = round4((wa + wb) / 2);
      session.dispatch([['set', a.id, 'size', half], ['set', b.id, 'size', half]], { transition: false });
    }
  };

  return <div className={cx('divider', flowOf(group) ?? 'col')} onPointerDown={onDown} onDoubleClick={even} title={live ? undefined : 'Drag to resize; double-click to even out'} />;
}
