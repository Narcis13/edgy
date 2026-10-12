// The Flow page: one set of items (notes, tasks, events) in five views, with
// the editor dialog, the confirm dialog and the keyboard shared by all of them.

import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { type FlowItem, isoDay } from '../../../core/flow';
import { type Confirm, ConfirmDialog } from '../library/Dialogs';
import { cx } from '../library/text';
import { Shell } from '../Home';
import { type Fields, type Loaded, type View, type FlowActions, VIEWS, addressOf, useFlow, useMedia, useNow, viewOf } from './state';
import { Composer } from './Composer';
import { Timeline } from './Timeline';
import { ItemDialog } from './ItemDialog';
import './flow.css';

// The other views load when first opened; the timeline opens at once.
const Board = lazy(() => import('./Board').then((m) => ({ default: m.Board })));
const Tasks = lazy(() => import('./Tasks').then((m) => ({ default: m.Tasks })));
const Calendar = lazy(() => import('./Calendar').then((m) => ({ default: m.Calendar })));
const Notes = lazy(() => import('./Notes').then((m) => ({ default: m.Notes })));

/** What every view gets. */
export interface ViewProps {
  data: Loaded;
  today: string;
  now: number;
  acts: FlowActions;
  /** Open an item in the editor dialog. */
  openItem: (id: string) => void;
  /** Open the editor for a new item, with some fields set (a day picked on the calendar). */
  compose: (preset: Fields & { text?: string }) => void;
  confirm: (c: Confirm) => void;
  navigate: (p: string) => void;
  phone: boolean;
}

export function FlowPage({ navigate }: { navigate: (p: string) => void }) {
  const { data, error, reload, acts } = useFlow();
  const now = useNow();
  const today = isoDay(new Date(now));
  const phone = useMedia('(max-width: 720px)');
  const view = viewOf(window.location.search);
  const setView = useCallback((v: View) => navigate(addressOf(v)), [navigate]);
  const [editing, setEditing] = useState<{ id: string | null; preset?: Fields & { text?: string } } | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const pane = useRef<HTMLElement>(null);

  const openItem = useCallback((id: string) => setEditing({ id }), []);
  const compose = useCallback((preset: Fields & { text?: string } = {}) => setEditing({ id: null, preset }), []);

  // The keys: 1–5 switch views, n writes, / searches. Never while typing or inside a dialog or menu.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || t?.closest('input, textarea, select, [contenteditable="true"], dialog, [role="menu"]')) return;
      if (e.key >= '1' && e.key <= '5') {
        e.preventDefault();
        setView(VIEWS[Number(e.key) - 1].id);
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        if (view === 'timeline' && composer.current) composer.current.focus();
        else compose();
      } else if (e.key === '/') {
        const s = pane.current?.querySelector<HTMLInputElement>('.flow-search input');
        if (s) {
          e.preventDefault();
          s.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [view, setView, compose]);

  const item: FlowItem | null = editing?.id ? data?.items.find((i) => i.id === editing.id) ?? null : null;
  const props: ViewProps | null = data ? { data, today, now, acts, openItem, compose, confirm: setConfirm, navigate, phone } : null;

  return (
    <Shell page="flow" navigate={navigate}>
      <main ref={pane} className={cx('home flow', `is-${view}`)}>
        <header className="flow-head">
          <h1>Flow</h1>
          <nav className="flow-views" aria-label="Views">
            {VIEWS.map((v, i) => (
              <a key={v.id} href={addressOf(v.id)} className={cx('flow-view', view === v.id && 'is-on')} aria-current={view === v.id ? 'page' : undefined} title={`${v.label} (${i + 1})`}
                onClick={(e) => { e.preventDefault(); setView(v.id); }}>
                {v.label}
              </a>
            ))}
          </nav>
          <button type="button" className="btn solid flow-new" onClick={() => compose()} title="New item (n)"><Plus size={15} aria-hidden="true" /> New</button>
        </header>
        {error && <p className="home-error">{error} <button type="button" className="link-btn" onClick={() => void reload()}>Try again</button></p>}
        {!data && !error && <p className="lib-loading" aria-live="polite">Loading…</p>}
        {props && view === 'timeline' && <Timeline {...props} composer={composer} />}
        {props && view !== 'timeline' && (
          <Suspense fallback={<p className="lib-loading">Opening…</p>}>
            {view === 'board' && <Board {...props} />}
            {view === 'tasks' && <Tasks {...props} />}
            {view === 'calendar' && <Calendar {...props} />}
            {view === 'notes' && <Notes {...props} />}
          </Suspense>
        )}
        {editing && data && (editing.id === null || item) && (
          <ItemDialog item={item} preset={editing.preset} data={data} acts={acts} confirm={setConfirm} navigate={navigate} onClose={() => setEditing(null)} />
        )}
        {confirm && <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />}
      </main>
    </Shell>
  );
}
