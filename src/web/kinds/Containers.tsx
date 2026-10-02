// Tabs, accordions and collapsibles on the page, and the chip a data cell
// shows while the document is being designed.
//
// What is open is the container's value. Choosing a tab or opening a section
// saves it in the document (like ticking a list item) without making an undo
// step: it is moving around, not changing the document. On paper everything
// unfolds: every panel prints, in order, under its title.

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Ellipsis, Plus, Variable } from 'lucide-react';
import type { Cell, Op } from '../../core/types';
import type { CellState } from '../../core/engine';
import { freeTitle, isOpen, openSections, openTab, panelTitles, panelWord, toggleSection } from '../../core/containers';
import { show } from '../../core/sx';
import { CellView, Kids } from '../editor/CellView';
import { cx, useS, useSession } from '../editor/ctx';
import { ownKeys } from './shared';
import './containers.css';

interface ViewProps {
  cell: Cell;
  st: CellState | undefined;
  className: string;
  style: React.CSSProperties;
  sizing: string | undefined;
}

export function ContainerView(p: ViewProps) {
  if (p.cell.kind === 'tabs') return <TabsView {...p} />;
  if (p.cell.kind === 'accordion') return <AccordionView {...p} />;
  return <FoldView {...p} />;
}

/** Save what is open: kept in the document, but not an undo step. */
function useOpen(cell: Cell) {
  const session = useSession();
  return (value: Op[3]) => session.dispatch(['set', cell.id, 'value', value], { undo: false, transition: false });
}

/** A title as shown: with its {{templates}} worked out. */
function useShownTitle(cell: Cell, fallback: string): string {
  const shown = useS((s) => s.computed?.cells[cell.id]?.props?.title);
  return typeof shown === 'string' ? shown : cell.title?.trim() || fallback;
}

// ───────────────────────────── tabs ─────────────────────────────

function TabsView({ cell, className, style, sizing }: ViewProps) {
  const session = useSession();
  const mode = useS((s) => s.mode);
  const save = useOpen(cell);
  const bar = useRef<HTMLDivElement>(null);
  const panels = cell.children ?? [];
  const titles = panelTitles(cell);
  const active = Math.max(0, titles.indexOf(openTab(cell) ?? ''));
  const edit = mode === 'edit';
  // On a narrow screen the bar scrolls; keep the open tab in sight (without scrolling the page).
  useEffect(() => {
    const el = bar.current;
    const tab = el?.querySelectorAll<HTMLElement>('.ktab')[active];
    if (!el || !tab) return;
    if (tab.offsetLeft < el.scrollLeft) el.scrollLeft = tab.offsetLeft - 8;
    else if (tab.offsetLeft + tab.offsetWidth > el.scrollLeft + el.clientWidth) el.scrollLeft = tab.offsetLeft + tab.offsetWidth - el.clientWidth + 8;
  }, [active, mode]);

  if (mode === 'page') {
    return (
      <div className={cx(className, 'on-paper')} data-cell={cell.id} data-size={sizing} style={style}>
        {panels.map((p, i) => <PaperPanel key={p.id} panel={p} title={titles[i]} />)}
      </div>
    );
  }

  const choose = (i: number, focus = false) => {
    if (focus) requestAnimationFrame(() => bar.current?.querySelectorAll<HTMLElement>('[role="tab"]')[i]?.focus());
    if (i === active) return;
    save(titles[i]);
    session.raise(cell.id, 'change', { value: titles[i], was: titles[active] });
  };
  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).getAttribute('role') !== 'tab') return;
    const n = panels.length;
    const to = { ArrowRight: active + 1, ArrowLeft: active - 1, Home: 0, End: n - 1 }[e.key];
    if (to === undefined) return ownKeys(e);
    e.preventDefault();
    e.stopPropagation();
    choose((to + n) % n, true);
  };
  const add = () => {
    const last = panels.at(-1);
    if (!last) return;
    const title = freeTitle(cell);
    session.dispatch([['split', last.id, 'col', { cell: ['panel', { title }, ['empty']] }], ['set', cell.id, 'value', title]]);
  };

  return (
    <div className={className} data-cell={cell.id} data-size={sizing} style={style}>
      <div className="ktabs-bar" ref={bar} role="tablist" aria-label={cell.name ?? 'Tabs'} onKeyDown={onKey}>
        {panels.map((p, i) => (
          <Tab key={p.id} container={cell} panel={p} title={titles[i]} index={i} active={i === active} edit={edit} onChoose={() => choose(i)} />
        ))}
        {edit && <button type="button" className="ktabs-add" title="Add a tab" aria-label="Add a tab" onClick={add}><Plus size={15} /></button>}
      </div>
      {panels[active] && (
        <div className="ktabs-panel" role="tabpanel" id={`tp-${cell.id}`} aria-labelledby={`tab-${panels[active].id}`}>
          <CellView cell={panels[active]} dir={null} />
        </div>
      )}
    </div>
  );
}

function Tab({ container, panel, title, index, active, edit, onChoose }: {
  container: Cell; panel: Cell; title: string; index: number; active: boolean; edit: boolean; onChoose: () => void;
}) {
  const shown = useShownTitle(panel, title);
  const [renaming, setRenaming] = useState(false);
  return (
    <span className={cx('ktab', active && 'is-active')}>
      {renaming ? (
        <TitleInput container={container} target={panel} index={index} initial={panel.title ?? title} onDone={() => setRenaming(false)} />
      ) : (
        <button type="button" role="tab" id={`tab-${panel.id}`} aria-selected={active} aria-controls={`tp-${container.id}`} tabIndex={active ? 0 : -1}
          onClick={onChoose} onDoubleClick={edit ? () => setRenaming(true) : undefined} title={edit ? 'Double-click to rename' : undefined}>
          {shown}
        </button>
      )}
      {edit && active && !renaming && <PanelMenu container={container} panel={panel} index={index} onRename={() => setRenaming(true)} />}
    </span>
  );
}

// ───────────────────────────── accordion ─────────────────────────────

function AccordionView({ cell, className, style, sizing }: ViewProps) {
  const session = useSession();
  const mode = useS((s) => s.mode);
  const save = useOpen(cell);
  const panels = cell.children ?? [];
  const titles = panelTitles(cell);
  const open = openSections(cell);
  const edit = mode === 'edit';

  if (mode === 'page') {
    return (
      <div className={cx(className, 'on-paper')} data-cell={cell.id} data-size={sizing} style={style}>
        {panels.map((p, i) => <PaperPanel key={p.id} panel={p} title={titles[i]} />)}
      </div>
    );
  }

  const toggle = (title: string) => {
    const opening = !open.includes(title);
    save(toggleSection(cell, title));
    session.raise(cell.id, opening ? 'open' : 'close', { title, value: toggleSection(cell, title) });
  };
  const add = () => {
    const last = panels.at(-1);
    if (!last) return;
    const title = freeTitle(cell);
    session.dispatch([['split', last.id, 'col', { cell: ['panel', { title }, ['empty']] }], ['set', cell.id, 'value', toggleSection(cell, title, true)]]);
  };

  return (
    <div className={className} data-cell={cell.id} data-size={sizing} style={style}>
      {panels.map((p, i) => (
        <Section key={p.id} container={cell} panel={p} title={titles[i]} index={i} open={open.includes(titles[i])} edit={edit} onToggle={() => toggle(titles[i])} />
      ))}
      {edit && (
        <button type="button" className="kacc-add" onClick={add}><Plus size={14} /> Add a section</button>
      )}
    </div>
  );
}

function Section({ container, panel, title, index, open, edit, onToggle }: {
  container: Cell; panel: Cell; title: string; index: number; open: boolean; edit: boolean; onToggle: () => void;
}) {
  const shown = useShownTitle(panel, title);
  const [renaming, setRenaming] = useState(false);
  return (
    <section className={cx('kacc-section', open && 'is-open')}>
      <div className="kacc-head">
        {renaming ? (
          <TitleInput container={container} target={panel} index={index} initial={panel.title ?? title} onDone={() => setRenaming(false)} />
        ) : (
          <button type="button" className="kfold-btn" id={`ah-${panel.id}`} aria-expanded={open} aria-controls={`ar-${panel.id}`}
            onClick={onToggle} onKeyDown={ownKeys} onDoubleClick={edit ? () => setRenaming(true) : undefined}>
            {open ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
            <span>{shown}</span>
          </button>
        )}
        {edit && !renaming && <PanelMenu container={container} panel={panel} index={index} onRename={() => setRenaming(true)} />}
      </div>
      {open && (
        <div className="kacc-body" role="region" id={`ar-${panel.id}`} aria-labelledby={`ah-${panel.id}`}>
          <CellView cell={panel} dir={null} />
        </div>
      )}
    </section>
  );
}

// ───────────────────────────── collapsible ─────────────────────────────

function FoldView({ cell, className, style, sizing }: ViewProps) {
  const session = useSession();
  const mode = useS((s) => s.mode);
  const save = useOpen(cell);
  const title = useShownTitle(cell, 'Details');
  const [renaming, setRenaming] = useState(false);
  const paper = mode === 'page';
  const open = paper || isOpen(cell);
  const toggle = () => {
    save(!open);
    session.raise(cell.id, open ? 'close' : 'open', { value: !open });
  };

  return (
    <div className={cx(className, open && 'is-open', paper && 'on-paper')} data-cell={cell.id} data-size={sizing} style={style}>
      <div className="kfold-head" data-keep={paper || undefined}>
        {paper ? (
          <span className="kfold-title">{title}</span>
        ) : renaming ? (
          <TitleInput target={cell} initial={cell.title ?? title} onDone={() => setRenaming(false)} />
        ) : (
          <button type="button" className="kfold-btn" id={`fh-${cell.id}`} aria-expanded={open} aria-controls={`fb-${cell.id}`}
            onClick={toggle} onKeyDown={ownKeys} onDoubleClick={mode === 'edit' ? () => setRenaming(true) : undefined}>
            {open ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
            <span>{title}</span>
          </button>
        )}
      </div>
      {open && (
        <div className="kfold-body" id={`fb-${cell.id}`} role={paper ? undefined : 'region'} aria-labelledby={paper ? undefined : `fh-${cell.id}`}>
          <Kids cell={cell} />
        </div>
      )}
    </div>
  );
}

// ───────────────────────────── shared ─────────────────────────────

/** On paper: a panel under its title, which keeps with the first cell after it. */
function PaperPanel({ panel, title }: { panel: Cell; title: string }) {
  const shown = useShownTitle(panel, title);
  return (
    <section className="kpaper-panel">
      <div className="kpaper-title" data-keep>{shown}</div>
      <CellView cell={panel} dir={null} />
    </section>
  );
}

/** Rename a tab, a section or a collapsible's heading in place. */
function TitleInput({ container, target, index, initial, onDone }: {
  container?: Cell; target: Cell; index?: number; initial: string; onDone: () => void;
}) {
  const session = useSession();
  const [text, setText] = useState(initial);
  const done = useRef(false);
  const finish = (keep: boolean) => {
    if (done.current) return;
    done.current = true;
    const v = text.trim();
    if (keep && v && v !== initial) {
      const taken = container ? panelTitles(container).filter((_, i) => i !== index) : [];
      if (taken.includes(v)) session.toast(`Another ${panelWord(container!).toLowerCase()} is already called “${v}”.`);
      else session.dispatch(['set', target.id, 'title', v]);
    }
    onDone();
  };
  return (
    <input className="ktitle-input" value={text} autoFocus aria-label="Title" size={Math.max(6, text.length + 1)}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(true);
        if (e.key === 'Escape') finish(false);
      }} />
  );
}

/** What can be done to a panel from the page: rename, move, copy, remove. */
function PanelMenu({ container, panel, index, onRename }: { container: Cell; panel: Cell; index: number; onRename: () => void }) {
  const session = useSession();
  // The menu is placed on the screen, not inside the tab bar, which scrolls and would clip it.
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const open = at !== null;
  const setOpen = (on: boolean) => {
    const r = box.current?.getBoundingClientRect();
    setAt(on && r ? { left: Math.max(8, Math.min(r.right - 160, window.innerWidth - 168)), top: r.bottom + 4 } : null);
  };
  const box = useRef<HTMLSpanElement>(null);
  const panels = container.children ?? [];
  const word = panelWord(container).toLowerCase();
  const tabs = container.kind === 'tabs';
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!box.current?.contains(e.target as Node)) setAt(null); };
    document.addEventListener('pointerdown', away);
    window.addEventListener('scroll', away, true);
    return () => {
      document.removeEventListener('pointerdown', away);
      window.removeEventListener('scroll', away, true);
    };
  }, [open]);
  const run = (op: Op) => {
    setOpen(false);
    session.dispatch(op);
  };
  const items: { label: string; disabled?: boolean; act: () => void }[] = [
    { label: 'Rename', act: () => { setOpen(false); onRename(); } },
    { label: tabs ? 'Move left' : 'Move up', disabled: index === 0, act: () => run(['move', panel.id, panels[index - 1].id, 'before']) },
    { label: tabs ? 'Move right' : 'Move down', disabled: index === panels.length - 1, act: () => run(['move', panel.id, panels[index + 1].id, 'after']) },
    { label: 'Duplicate', act: () => run(['dup', panel.id]) },
    { label: `Remove ${word}`, disabled: panels.length < 2, act: () => run(['remove', panel.id]) },
  ];
  return (
    <span className="kpanel-menu" ref={box}>
      <button type="button" className="kpanel-more" title={`More for this ${word}`} aria-label={`More for this ${word}`} aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen(!open)} onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); ownKeys(e); }}>
        <Ellipsis size={15} />
      </button>
      {open && (
        <span className="kpanel-list" role="menu" style={at} onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); ownKeys(e); }}>
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" disabled={it.disabled} onClick={it.act}>{it.label}</button>
          ))}
        </span>
      )}
    </span>
  );
}

// ───────────────────────────── data ─────────────────────────────

/** While designing, a data cell is a small chip with its name and value, so it can be found and chosen. */
export function DataChip({ cell, st }: { cell: Cell; st: CellState | undefined }) {
  const v = st && !st.error ? st.value : cell.value ?? null;
  const text = v !== null && typeof v === 'object' ? JSON.stringify(v) : typeof v === 'string' ? `“${v}”` : show(v) || 'nothing';
  return (
    <span className="kdata-chip" title="Data: formulas and buttons use it; readers never see it">
      <Variable size={13} strokeWidth={2} aria-hidden />
      <b>{cell.name ?? cell.id}</b>
      <span className="kdata-val">{text.length > 48 ? text.slice(0, 47) + '…' : text}</span>
    </span>
  );
}
