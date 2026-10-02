// The home page's library: every document and deck, found by search, narrowed by
// a filter, pinned ones first. Built to stay quick with hundreds of documents:
// the server searches and sorts, the page draws 60 cards at a time, and each
// card redraws only when its own entry changes.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Doc } from '../../../core/types';
import { movePinned } from '../../../core/library';
import { type Deck, type LibraryEntry, type TemplateSummary, api } from '../../lib/api';
import { startPlay } from '../../play/start';
import { ShareDialog } from '../../share/ShareDialog';
import { Minimap } from '../Minimap';
import { type Actions, Card } from './Card';
import { type Confirm, ConfirmDialog, GroupDialog } from './Dialogs';
import { SelectionBar } from './SelectionBar';
import { type SearchHandle, Toolbar } from './Toolbar';
import { type Filter, type Prefs, type Sort, type View, cx, deckTitle, loadPrefs, plural, savePrefs } from './text';
import { useLibrary } from './useLibrary';

/** Cards drawn at first, and added each time the end of the list comes near. */
const PAGE = 60;
const HUMAN = { kind: 'human', name: 'You' } as const;

interface Toast {
  text: string;
  undo?: () => void;
  at: number;
}

const bulk = (action: 'pin' | 'unpin' | 'archive' | 'restore' | 'delete', ids: string[]) =>
  api<{ done: string[]; skipped: string[] }>('POST', '/api/library/bulk', { action, ids });

const quoted = (t: string) => `“${t}”`;

const SECTION: Record<Filter, string> = { all: 'Documents', pinned: 'Pinned', shared: 'Shared', decks: 'Decks', archived: 'Archived' };

function Empty({ filter, query, onClear }: { filter: Filter; query: string; onClear: () => void }) {
  if (query) {
    return (
      <div className="lib-empty">
        <p><b>Nothing matches {quoted(query)}{filter !== 'all' ? ` in ${SECTION[filter]}` : ''}.</b></p>
        <p>Search looks in titles, descriptions and the words inside documents. Every word has to appear somewhere in the same document.</p>
        <button type="button" className="btn ghost" onClick={onClear}>Clear search</button>
      </div>
    );
  }
  const text: Record<Filter, [string, string]> = {
    all: ['No documents yet.', 'Start one with New document, or from a template above.'],
    pinned: ['Nothing pinned.', 'Pin the documents you open most: choose Pin in a card’s ⋯ menu, or select several and choose Pin.'],
    shared: ['Nothing shared.', 'To share a document by link, choose Share… in its card’s ⋯ menu.'],
    decks: ['No decks yet.', 'A deck keeps documents together and plays them in order. Tick the boxes on two or more documents, then choose Group into a deck.'],
    archived: ['Nothing archived.', 'Archived documents wait here, out of the way, until you restore them.'],
  };
  const [head, about] = text[filter];
  return (
    <div className="lib-empty">
      <p><b>{head}</b></p>
      <p>{about}</p>
    </div>
  );
}

export function Library({ navigate }: { navigate: (p: string) => void }) {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const { data, setData, error, loading, reload } = useLibrary(query, filter, prefs.sort);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [limit, setLimit] = useState(PAGE);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [grouping, setGrouping] = useState(false);
  const [share, setShare] = useState<{ id: string; title: string } | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const pane = useRef<HTMLElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const search = useRef<SearchHandle>(null);
  const dragId = useRef<string | null>(null);

  useEffect(() => { void api<TemplateSummary[]>('GET', '/api/templates').then(setTemplates).catch(() => undefined); }, []);
  useEffect(() => savePrefs(prefs), [prefs]);
  useEffect(() => setLimit(PAGE), [query, filter, prefs.sort]);

  // What is on screen is what the last answer was for, so the cards, their highlights and the headings agree.
  const shown = { query: data?.query ?? '', filter: (data?.filter ?? filter) as Filter, sort: (data?.sort ?? prefs.sort) as Sort };
  const pinned = data?.pinned ?? [];
  const rest = data?.rest ?? [];
  const all = useMemo(() => [...pinned, ...rest], [pinned, rest]);
  const chosen = useMemo(() => all.filter((e) => selected.has(e.id)), [all, selected]);

  // A selected entry that is no longer listed (deleted, filtered away) is no longer selected.
  useEffect(() => {
    if (!data) return;
    const ids = new Set([...data.pinned, ...data.rest].map((e) => e.id));
    setSelected((s) => {
      const keep = [...s].filter((id) => ids.has(id));
      return keep.length === s.size ? s : new Set(keep);
    });
  }, [data]);

  // More cards when the end of the list comes within a screen or so of the bottom.
  const more = rest.length > limit;
  useEffect(() => {
    const el = sentinel.current;
    if (!more || !el) return;
    const io = new IntersectionObserver((seen) => {
      if (seen.some((s) => s.isIntersecting)) setLimit((n) => n + PAGE);
    }, { root: pane.current, rootMargin: '0px 0px 900px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [more, limit]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.undo ? 8000 : 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Escape clears the selection, unless it belongs to a field, a menu or a dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if ((e.target as HTMLElement).closest?.('dialog, [role="menu"], textarea, input[type="search"], input[type="text"], select')) return;
      setSelected((s) => (s.size ? new Set() : s));
    };
    const onDragEnd = () => { dragId.current = null; };
    document.addEventListener('keydown', onKey);
    document.addEventListener('dragend', onDragEnd);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('dragend', onDragEnd);
    };
  }, []);

  // A deck just made: bring it into view and let it glow for a moment.
  useEffect(() => {
    if (!fresh) return;
    const at = rest.findIndex((e) => e.id === fresh);
    if (at >= limit) setLimit(at + PAGE);
    requestAnimationFrame(() => pane.current?.querySelector(`[data-id="${fresh}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    const t = setTimeout(() => setFresh(null), 2600);
    return () => clearTimeout(t);
  }, [fresh]); // eslint-disable-line react-hooks/exhaustive-deps

  const notify = useCallback((text: string, undo?: () => void) => setToast({ text, undo, at: Date.now() }), []);

  // The latest state, for the actions below, which stay one object for the life of the page.
  const live = useRef({ data, notify, reload });
  live.current = { data, notify, reload };

  /** Do it, say what went wrong if it did, and show the library as it now is. */
  const attempt = useCallback(async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      live.current.notify(e instanceof Error ? e.message : 'That did not work.');
    } finally {
      await live.current.reload();
    }
  }, []);

  const archive = useCallback((entries: { id: string; title: string }[], on: boolean) => {
    const ids = entries.map((e) => e.id);
    const what = entries.length === 1 ? quoted(entries[0].title) : String(entries.length);
    void attempt(async () => {
      await bulk(on ? 'archive' : 'restore', ids);
      setSelected(new Set());
      live.current.notify(`${on ? 'Archived' : 'Restored'} ${what}`, () => void attempt(() => bulk(on ? 'restore' : 'archive', ids)));
    });
  }, [attempt]);

  const reorder = useCallback((next: string[]) => {
    const d = live.current.data;
    if (!d) return;
    const byId = new Map(d.pinned.map((e) => [e.id, e]));
    // Moved at once; the server's answer follows.
    setData({ ...d, pinned: next.map((id) => byId.get(id)!).filter(Boolean) });
    void attempt(() => api('POST', '/api/library/pins', { ids: next }));
  }, [attempt, setData]);

  const acts = useMemo<Actions>(() => ({
    navigate,
    select: (id, on) => setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    }),
    describe: async (e, text) => {
      try {
        if (e.type === 'deck') await api<Deck>('PATCH', `/api/decks/${e.id}`, { description: text });
        else await api('PATCH', `/api/docs/${e.id}`, { description: text, actor: HUMAN });
      } catch (err) {
        live.current.notify(err instanceof Error ? err.message : 'The description was not saved.');
        throw err;
      } finally {
        void live.current.reload();
      }
    },
    pin: (e, on) => void attempt(async () => {
      await bulk(on ? 'pin' : 'unpin', [e.id]);
      live.current.notify(`${on ? 'Pinned' : 'Unpinned'} ${quoted(e.title)}`);
    }),
    move: (id, by) => {
      const ids = live.current.data?.pinned.map((e) => e.id) ?? [];
      const at = ids.indexOf(id);
      if (at < 0 || at + by < 0 || at + by >= ids.length) return;
      reorder(movePinned(ids, id, at + by));
    },
    share: (e) => setShare({ id: e.id, title: e.title }),
    archive: (e, on) => archive([e], on),
    remove: (e) => setConfirm({
      title: `Delete ${quoted(e.title)}?`,
      body: 'This can’t be undone. Its history goes too.',
      action: 'Delete',
      run: () => attempt(() => bulk('delete', [e.id])),
    }),
    ungroup: (e) => setConfirm({
      title: `Ungroup ${quoted(e.title)}?`,
      body: 'The documents stay, each on its own; only the deck goes.',
      action: 'Ungroup',
      run: () => attempt(() => api('DELETE', `/api/decks/${e.id}`)),
    }),
    play: (id) => startPlay(navigate, id),
    dragStart: (id) => { dragId.current = id; },
    dragging: () => dragId.current,
    drop: (target) => {
      const from = dragId.current;
      dragId.current = null;
      const ids = live.current.data?.pinned.map((e) => e.id) ?? [];
      if (!from || from === target || !ids.includes(from)) return;
      reorder(movePinned(ids, from, ids.indexOf(target)));
    },
  }), [navigate, attempt, archive, reorder]);

  const create = useCallback(async (template?: string) => {
    setCreating(true);
    try {
      const doc = await api<Doc>('POST', '/api/docs', { template, actor: HUMAN });
      navigate(`/d/${doc.id}`);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not create the document.');
      setCreating(false);
    }
  }, [navigate, notify]);
  const onNew = useCallback(() => void create(), [create]);
  const onSort = useCallback((sort: Sort) => setPrefs((p) => ({ ...p, sort })), []);
  const onView = useCallback((view: View) => setPrefs((p) => ({ ...p, view })), []);
  const clearSearch = useCallback(() => search.current?.clear(), []);

  // ── the selection's actions ──
  const deleteChosen = () => {
    const docs = chosen.filter((e) => e.type === 'doc');
    const decks = chosen.filter((e) => e.type === 'deck');
    const ids = chosen.map((e) => e.id);
    const run = () => attempt(async () => { await bulk('delete', ids); setSelected(new Set()); });
    if (!docs.length) {
      setConfirm({ title: `Ungroup ${decks.length === 1 ? quoted(decks[0].title) : plural(decks.length, 'deck')}?`, body: 'The documents stay, each on its own; only the decks go.', action: 'Ungroup', run });
      return;
    }
    const title = docs.length === 1 && !decks.length ? `Delete ${quoted(docs[0].title)}?`
      : `Delete ${plural(docs.length, 'document')}${decks.length ? ` and ungroup ${plural(decks.length, 'deck')}` : ''}?`;
    const body = `This can’t be undone. ${docs.length === 1 ? 'Its' : 'Their'} history goes too.${decks.length ? ' The documents inside the decks stay.' : ''}`;
    setConfirm({ title, body, action: 'Delete', run });
  };
  const pinChosen = (on: boolean) => {
    const ids = chosen.map((e) => e.id);
    void attempt(async () => {
      const r = await bulk(on ? 'pin' : 'unpin', ids);
      notify(`${on ? 'Pinned' : 'Unpinned'} ${r.done.length}${r.skipped.length ? `; ${r.skipped.length} could not be` : ''}`);
    });
  };
  const group = async (title: string, description: string) => {
    // In the order they are on screen.
    const docs = chosen.filter((e) => e.type === 'doc').map((e) => e.id);
    const deck = await api<Deck>('POST', '/api/decks', { title, description, docs });
    setSelected(new Set());
    await reload();
    setFresh(deck.id);
    notify(`Grouped ${plural(docs.length, 'document')} into ${quoted(deck.title)}`);
  };

  const searching = shown.query !== '';
  const canReorder = !searching;
  const visible = rest.slice(0, limit);
  const listClass = cx('lib-cards', prefs.view === 'list' ? 'is-list' : 'is-grid');
  const card = (e: LibraryEntry, pinIndex: number) => (
    <Card
      key={e.id}
      entry={e}
      sort={shown.sort}
      query={shown.query}
      selected={selected.has(e.id)}
      fresh={fresh === e.id}
      pinIndex={pinIndex}
      pinCount={pinIndex >= 0 ? pinned.length : 0}
      canReorder={canReorder}
      acts={acts}
    />
  );

  return (
    <main ref={pane} className={cx('home lib', selected.size > 0 && 'has-selection', `view-${prefs.view}`)}>
      <Toolbar
        filter={filter}
        sort={prefs.sort}
        view={prefs.view}
        busy={loading}
        creating={creating}
        onQuery={setQuery}
        onFilter={setFilter}
        onSort={onSort}
        onView={onView}
        onNew={onNew}
        searchRef={search}
      />

      {!searching && shown.filter === 'all' && !query && filter === 'all' && templates.length > 0 && (
        <section className="lib-starts" aria-label="Start from a template">
          {templates.map((t) => (
            <button key={t.id} type="button" className="lib-start" onClick={() => void create(t.id)} disabled={creating} title={t.about}>
              <Minimap notation={t.root} />
              <span className="lib-start-title">{t.title}</span>
            </button>
          ))}
        </section>
      )}

      {error && (
        <p className="home-error">
          {error} <button type="button" className="link-btn" onClick={() => void reload()}>Try again</button>
        </p>
      )}
      {!data && !error && <p className="lib-loading">Loading documents…</p>}

      {data && (
        <div className="lib-results" aria-busy={loading}>
          {pinned.length > 0 && shown.filter !== 'pinned' && (
            <section className="lib-section is-pinned" aria-labelledby="lib-pinned">
              <h2 id="lib-pinned">Pinned <span className="lib-n">{pinned.length}</span></h2>
              <div className={listClass}>{pinned.map((e, i) => card(e, i))}</div>
            </section>
          )}
          {shown.filter === 'pinned' && pinned.length > 0 && (
            <section className="lib-section is-pinned" aria-labelledby="lib-pinned">
              <h2 id="lib-pinned">{searching ? `${plural(data.total, 'result')} for ${quoted(shown.query)}` : <>Pinned <span className="lib-n">{pinned.length}</span></>}</h2>
              <div className={listClass}>{pinned.map((e, i) => card(e, i))}</div>
            </section>
          )}
          {(rest.length > 0 || data.total === 0 || (searching && shown.filter !== 'pinned')) && (
            <section className="lib-section" aria-labelledby="lib-rest">
              <h2 id="lib-rest" aria-live="polite">
                {searching ? `${plural(data.total, 'result')} for ${quoted(shown.query)}` : <>{SECTION[shown.filter]} {rest.length > 0 && <span className="lib-n">{rest.length}</span>}</>}
              </h2>
              {data.total === 0 && <Empty filter={shown.filter} query={shown.query} onClear={clearSearch} />}
              {visible.length > 0 && <div className={listClass}>{visible.map((e) => card(e, -1))}</div>}
              {more && <div ref={sentinel} className="lib-more">Showing {visible.length} of {rest.length}…</div>}
            </section>
          )}
        </div>
      )}

      {chosen.length > 0 && (
        <SelectionBar
          chosen={chosen}
          archived={shown.filter === 'archived'}
          onPin={pinChosen}
          onArchive={(on) => archive(chosen, on)}
          onDelete={deleteChosen}
          onGroup={() => setGrouping(true)}
          onClear={() => setSelected(new Set())}
        />
      )}

      <div className={cx('lib-toasts', chosen.length > 0 && 'is-raised')} aria-live="polite">
        {toast && (
          <div className="lib-toast" key={toast.at}>
            <span>{toast.text}</span>
            {toast.undo && <button type="button" className="lib-undo" onClick={() => { toast.undo!(); setToast(null); }}>Undo</button>}
          </div>
        )}
      </div>

      {confirm && <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />}
      {grouping && (
        <GroupDialog
          count={chosen.filter((e) => e.type === 'doc').length}
          title={deckTitle(chosen.filter((e) => e.type === 'doc').map((e) => e.title))}
          onGroup={group}
          onClose={() => setGrouping(false)}
        />
      )}
      {share && <ShareDialog id={share.id} title={share.title} onClose={() => setShare(null)} onChange={() => void reload()} />}
    </main>
  );
}
