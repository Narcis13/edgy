// The document screen: header, formula bar, activity, the sheet, inspector.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity as ActivityIcon, Ellipsis, Moon, PanelRight, Printer, Redo2, Spline, Sun, Undo2 } from 'lucide-react';
import type { Cell } from '../../core/types';
import { isGroup } from '../../core/types';
import { leaves } from '../../core/tree';
import { Session } from '../session';
import { uploadPicture } from '../lib/api';
import { useTheme } from '../theme';
import { Activity } from './Activity';
import { CellView } from './CellView';
import { FormulaBar } from './FormulaBar';
import { Inspector } from './Inspector';
import { Overlay } from './Overlay';
import { SessionContext, cx, useS, useSession } from './ctx';
import { Logo } from '../pages/Logo';
import { StudioHost } from '../code/Studio';
import { Pages } from '../print/Pages';

export function Editor({ id, navigate }: { id: string; navigate: (path: string) => void }) {
  const session = useMemo(() => new Session(id), [id]);
  useEffect(() => {
    void session.open();
    (window as unknown as { edgy?: Session }).edgy = session;
    return () => session.close();
  }, [session]);
  return (
    <SessionContext.Provider value={session}>
      <Screen navigate={navigate} />
    </SessionContext.Provider>
  );
}

function Screen({ navigate }: { navigate: (path: string) => void }) {
  const session = useSession();
  const status = useS((s) => s.status);
  const mode = useS((s) => s.mode);
  const [showActivity, setShowActivity] = useState(() => window.innerWidth > 1320);
  const [showInspector, setShowInspector] = useState(() => window.innerWidth > 1000);
  const touched = useRef(false);
  useEffect(() => {
    // Until someone toggles a panel by hand, follow the window's width.
    const fit = () => {
      if (touched.current) return;
      setShowActivity(window.innerWidth > 1320);
      setShowInspector(window.innerWidth > 1000);
    };
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  const toggleActivity = (v: boolean) => { touched.current = true; setShowActivity(v); };
  const toggleInspector = (v: boolean) => { touched.current = true; setShowInspector(v); };
  useKeyboard();

  if (status === 'loading') return <div className="screen-note">Opening…</div>;
  if (status === 'missing') return <div className="screen-note">This document is gone. <button className="link-btn" onClick={() => navigate('/')}>Back to your documents</button></div>;
  if (status === 'failed') return <div className="screen-note">The server did not answer. Is <code>npm run dev</code> running?</div>;

  return (
    <div className={cx('editor', `mode-${mode}`, showActivity && 'with-activity', showInspector && 'with-inspector')}>
      <Header navigate={navigate} showActivity={showActivity} setShowActivity={toggleActivity} showInspector={showInspector} setShowInspector={toggleInspector} />
      <FormulaBar />
      {(showActivity || showInspector) && <div className="side-backdrop" onClick={() => { toggleActivity(false); toggleInspector(false); }} />}
      {showActivity && <aside className="side left"><Activity /></aside>}
      <Desk />
      {showInspector && <aside className="side right"><Inspector /></aside>}
      <Toast />
      <StudioHost />
    </div>
  );
}

function Header(props: { navigate: (p: string) => void; showActivity: boolean; setShowActivity: (v: boolean) => void; showInspector: boolean; setShowInspector: (v: boolean) => void }) {
  const session = useSession();
  const title = useS((s) => s.doc?.meta.title ?? '');
  const unsaved = useS((s) => s.unsaved);
  const online = useS((s) => s.online);
  const mode = useS((s) => s.mode);
  const links = useS((s) => s.links);
  const canUndo = useS((s) => s.canUndo);
  const canRedo = useS((s) => s.canRedo);
  const [theme, setTheme] = useTheme();
  const [t, setT] = useState(title);
  useEffect(() => setT(title), [title]);
  return (
    <header className="topbar">
      <a className="brand" href="/" onClick={(e) => { e.preventDefault(); props.navigate('/'); }} title="All documents"><Logo /></a>
      <input className="title" value={t} aria-label="Document title" onChange={(e) => setT(e.target.value)}
        onBlur={() => { const v = t.trim() || 'Untitled'; setT(v); if (v !== title) session.dispatch(['meta', 'title', v]); }}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur(); }} />
      <span className={cx('save-state', !online && 'is-off', unsaved > 0 && 'is-busy')}>{!online ? 'Offline, will retry' : unsaved ? 'Saving…' : 'Saved'}</span>
      <div className="grow" />
      <div className="tools">
        <button className={cx('icon-btn', mode !== 'edit' && 'wide-only')} title="Undo (⌘Z)" aria-label="Undo" disabled={!canUndo} onClick={() => session.undo()}><Undo2 size={16} /></button>
        <button className={cx('icon-btn', mode !== 'edit' && 'wide-only')} title="Redo (⇧⌘Z)" aria-label="Redo" disabled={!canRedo} onClick={() => session.redo()}><Redo2 size={16} /></button>
        <i className="sep" />
        <button className={cx('icon-btn wide-only', links && 'is-on')} title="Show what the selected cell reads and feeds" aria-pressed={links} onClick={() => session.setLinks(!links)}><Spline size={16} /></button>
        <button className={cx('icon-btn wide-only', props.showActivity && 'is-on')} title="Activity and messages" aria-pressed={props.showActivity} onClick={() => props.setShowActivity(!props.showActivity)}><ActivityIcon size={16} /></button>
        <button className={cx('icon-btn wide-only', props.showInspector && 'is-on')} title="Cell details" aria-pressed={props.showInspector} onClick={() => props.setShowInspector(!props.showInspector)}><PanelRight size={16} /></button>
        <i className="sep" />
        <div className="seg mode" role="group" aria-label="Mode">
          <button className={cx(mode === 'edit' && 'is-on')} aria-pressed={mode === 'edit'} onClick={() => session.setMode('edit')} title="Shape the document">Edit</button>
          <button className={cx(mode === 'live' && 'is-on')} aria-pressed={mode === 'live'} onClick={() => session.setMode('live')} title="Use it as people will">Live</button>
          <button className={cx(mode === 'page' && 'is-on')} aria-pressed={mode === 'page'} onClick={() => session.setMode('page')} title="See it as printed pages">Page</button>
        </div>
        <button className="icon-btn wide-only" title="Print (⌘P)" aria-label="Print" onClick={() => session.print()}><Printer size={16} /></button>
        <button className="icon-btn wide-only" title={theme === 'dark' ? 'Light theme' : 'Dark theme'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button>
        <More {...props} />
      </div>
    </header>
  );
}

/** On a phone the header keeps the essentials; everything else lives in this menu. */
function More(props: { showActivity: boolean; setShowActivity: (v: boolean) => void; showInspector: boolean; setShowInspector: (v: boolean) => void }) {
  const session = useSession();
  const links = useS((s) => s.links);
  const [theme, setTheme] = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [open]);
  const item = (label: string, icon: React.ReactNode, on: boolean | undefined, run: () => void) => (
    <button role="menuitem" className={cx(on && 'is-on')} onClick={() => { setOpen(false); run(); }}>{icon}{label}</button>
  );
  return (
    <div className="more" ref={ref} style={{ position: 'relative' }}>
      <button className="icon-btn more-btn" aria-label="More" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}><Ellipsis size={18} /></button>
      {open && (
        <div className="more-menu" role="menu">
          {item('Activity and messages', <ActivityIcon size={16} />, props.showActivity, () => props.setShowActivity(!props.showActivity))}
          {item('Cell details', <PanelRight size={16} />, props.showInspector, () => props.setShowInspector(!props.showInspector))}
          {item('Show links between cells', <Spline size={16} />, links, () => session.setLinks(!links))}
          {item('Print', <Printer size={16} />, false, () => session.print())}
          {item(theme === 'dark' ? 'Light theme' : 'Dark theme', theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />, false, () => setTheme(theme === 'dark' ? 'light' : 'dark'))}
        </div>
      )}
    </div>
  );
}

function Desk() {
  const session = useSession();
  const doc = useS((s) => s.doc);
  const mode = useS((s) => s.mode);
  const host = useRef<HTMLDivElement>(null);
  const [dropping, setDropping] = useState<string | null>(null);
  const wasSelected = useRef(false);
  useEffect(() => {
    // Pasting a picture into an empty or picture cell.
    const onPaste = async (e: ClipboardEvent) => {
      const s = session.state;
      const id = s.selection.at(-1);
      const cell = id ? session.cell(id) : undefined;
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
      if (!file || !cell || s.editing || (cell.kind !== 'empty' && cell.kind !== 'image') || (e.target as HTMLElement).closest('input, textarea')) return;
      e.preventDefault();
      try {
        const url = await uploadPicture(file);
        session.dispatch(cell.kind === 'image' ? ['set', cell.id, 'src', url] : ['put', cell.id, ['image', cell.style ? { style: cell.style } : {}, url]]);
      } catch (err) {
        session.toast(err instanceof Error ? err.message : 'The picture could not be uploaded.');
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [session]);
  if (!doc) return null;
  const meta = doc.meta;
  if (mode === 'page') {
    return (
      <main className="desk paged">
        <Pages />
      </main>
    );
  }

  const onPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.overlay') || target.closest('.divider')) return;
    const el = target.closest<HTMLElement>('[data-cell]');
    if (!el) {
      if (!target.closest('.sheet')) session.select(null);
      return;
    }
    const id = el.dataset.cell!;
    if (session.pick && session.state.editing !== id) {
      const cell = session.cell(id);
      e.preventDefault();
      if (cell) session.pick(cell.name ?? cell.id);
      return;
    }
    if (mode !== 'edit') return;
    wasSelected.current = session.state.selection.length === 1 && session.state.selection[0] === id && !session.state.editing;
    if (e.button === 0) session.select(id, e.shiftKey || e.metaKey);
  };
  const onClick = (e: React.MouseEvent) => {
    if (mode !== 'edit') return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-cell]');
    if (!el || !wasSelected.current) return;
    const cell = session.cell(el.dataset.cell!);
    if (cell && (cell.kind === 'text' || cell.kind === 'empty') && !(e.target as HTMLElement).closest('a')) session.edit(cell.id);
  };
  const onDoubleClick = (e: React.MouseEvent) => {
    if (mode !== 'edit') return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-cell]');
    const cell = el && session.cell(el.dataset.cell!);
    if (cell && ['text', 'empty', 'formula', 'button'].includes(cell.kind)) session.edit(cell.id);
  };
  const dropTarget = (e: React.DragEvent): Cell | null => {
    if (!e.dataTransfer.types.includes('Files')) return null;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-cell]');
    const cell = el && session.cell(el.dataset.cell!);
    return cell && (cell.kind === 'image' || cell.kind === 'empty') ? cell : null;
  };
  const onDragOver = (e: React.DragEvent) => {
    const cell = dropTarget(e);
    if (cell) {
      e.preventDefault();
      if (dropping !== cell.id) setDropping(cell.id);
    } else if (dropping) setDropping(null);
  };
  const onDrop = async (e: React.DragEvent) => {
    const cell = dropTarget(e);
    setDropping(null);
    if (!cell) return;
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file?.type.startsWith('image/')) return session.toast('Only pictures can be dropped onto a cell.');
    try {
      const url = await uploadPicture(file);
      session.dispatch(cell.kind === 'image' ? ['set', cell.id, 'src', url] : ['put', cell.id, ['image', cell.style ? { style: cell.style } : {}, url]]);
    } catch (err) {
      session.toast(err instanceof Error ? err.message : 'The picture could not be uploaded.');
    }
  };

  return (
    <main className={cx('desk', mode)} onPointerDown={onPointerDown} onClick={onClick} onDoubleClick={onDoubleClick} onDragOver={onDragOver} onDragLeave={() => setDropping(null)} onDrop={(e) => void onDrop(e)}>
      <div className="desk-inner" ref={host}>
        <div className={cx('sheet', dropping && 'is-dropping')} style={{ maxWidth: typeof meta.width === 'number' ? meta.width : 880, minHeight: typeof meta.minHeight === 'number' ? meta.minHeight : 560, '--pad': `${typeof meta.pad === 'number' ? meta.pad : 28}px` } as React.CSSProperties}>
          <CellView cell={doc.root} dir={null} />
        </div>
        <Overlay host={host} />
      </div>
    </main>
  );
}

function Toast() {
  const toast = useS((s) => s.toast);
  const [shown, setShown] = useState(toast);
  useEffect(() => {
    if (!toast) return;
    setShown(toast);
    const t = setTimeout(() => setShown(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  return shown ? <div className="toast" role="status">{shown.text}</div> : null;
}

/** Spatial navigation: the nearest leaf in a direction, judged by the cells' boxes. */
function nearest(from: HTMLElement, all: HTMLElement[], dir: 'left' | 'right' | 'up' | 'down'): HTMLElement | null {
  const a = from.getBoundingClientRect();
  const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of all) {
    if (el === from) continue;
    const b = el.getBoundingClientRect();
    const bx = b.left + b.width / 2, by = b.top + b.height / 2;
    const dx = bx - ax, dy = by - ay;
    const ok = dir === 'left' ? b.right <= a.left + 1 : dir === 'right' ? b.left >= a.right - 1 : dir === 'up' ? b.bottom <= a.top + 1 : b.top >= a.bottom - 1;
    if (!ok) continue;
    const main = dir === 'left' || dir === 'right' ? Math.abs(dx) : Math.abs(dy);
    const cross = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
    const score = main + cross * 2.5;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}

function useKeyboard() {
  const session = useSession();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = session.state;
      const t = e.target instanceof Element ? e.target : document.body;
      const typing = t.closest('input, textarea, select, [contenteditable="true"]');
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        if (e.shiftKey) session.redo();
        else session.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        return session.print();
      }
      if (typing || s.mode !== 'edit' || s.editing) return;
      const id = s.selection.at(-1);
      const cell = id ? session.cell(id) : undefined;
      if (e.key === 'Escape') {
        if (s.menu) return session.openMenu(null);
        const parent = id ? session.parent(id) : null;
        return parent ? session.select(parent.id) : session.select(null);
      }
      if (!cell) {
        if (['ArrowDown', 'ArrowRight', 'Tab'].includes(e.key) && s.doc) {
          e.preventDefault();
          session.select(leaves(s.doc.root)[0].id);
        }
        return;
      }
      if (e.altKey && e.key.startsWith('Arrow')) {
        e.preventDefault();
        if (e.key === 'ArrowRight') session.split(cell.id, 'row');
        if (e.key === 'ArrowLeft') session.split(cell.id, 'row', true);
        if (e.key === 'ArrowDown') session.split(cell.id, 'col');
        if (e.key === 'ArrowUp') session.split(cell.id, 'col', true);
        return;
      }
      if (e.key.startsWith('Arrow') && !mod) {
        e.preventDefault();
        const all = [...document.querySelectorAll<HTMLElement>('.sheet .cell.leaf')];
        const from = document.querySelector<HTMLElement>(`.sheet [data-cell="${cell.id}"]`);
        const next = from && nearest(from, all, e.key === 'ArrowLeft' ? 'left' : e.key === 'ArrowRight' ? 'right' : e.key === 'ArrowUp' ? 'up' : 'down');
        if (next) session.select(next.dataset.cell!, e.shiftKey);
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        return session.selectNext(e.shiftKey ? -1 : 1);
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (isGroup(cell)) return session.select(leaves(cell)[0].id);
        if (['text', 'empty', 'formula', 'button'].includes(cell.kind)) return session.edit(cell.id);
        if (cell.kind === 'button') return void session.run(cell.id);
        return;
      }
      if (e.key === '/' ) {
        e.preventDefault();
        return session.openMenu(isGroup(cell) ? leaves(cell)[0].id : cell.id);
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        return session.clearOrRemove();
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        return session.duplicate();
      }
      if (mod && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        return session.merge();
      }
      if (!mod && !e.altKey && e.key.length === 1 && cell.kind === 'empty') {
        e.preventDefault();
        session.edit(cell.id, e.key);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [session]);
}
