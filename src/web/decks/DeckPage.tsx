// A deck: its title and description, its documents in order (move, add, take
// out), Play, export, and ungrouping, which keeps every document.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Download, GripVertical, Pin, PinOff, Play as PlayIcon, Plus, Search, Ungroup, X } from 'lucide-react';
import { type Deck, type DocSummary, type Library, type LibraryEntry, api } from '../lib/api';
import { Shell } from '../pages/Home';
import { Minimap } from '../pages/Minimap';
import { Notice } from '../pages/Notice';
import { startPlay } from '../play/start';
import { cx } from '../editor/ctx';
import './decks.css';

type Full = Deck & { items: DocSummary[] };

export function DeckPage({ id, navigate }: { id: string; navigate: (p: string) => void }) {
  const [deck, setDeck] = useState<Full | null | 'missing'>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [ungrouping, setUngrouping] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const load = useCallback(() => api<Full>('GET', `/api/decks/${id}`).then(setDeck).catch(() => setDeck('missing')), [id]);
  useEffect(() => void load(), [load]);
  if (deck === null) return <Shell page="docs" navigate={navigate}><div className="screen-note">Opening…</div></Shell>;
  if (deck === 'missing') {
    return (
      <Shell page="docs" navigate={navigate}>
        <Notice kind="missing" title="No deck here" action={<a className="btn solid" href="/" onClick={(e) => { e.preventDefault(); navigate('/'); }}>Back to your documents</a>}>
          It may have been ungrouped; its documents are in your list.
        </Notice>
      </Shell>
    );
  }

  const save = async (body: Record<string, unknown>) => {
    setError(null);
    try {
      await api('PATCH', `/api/decks/${id}`, body);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not save.');
    }
  };
  const order = deck.items.map((d) => d.id);
  const move = (doc: string, to: number) => {
    const next = order.filter((x) => x !== doc);
    next.splice(Math.max(0, Math.min(next.length, to)), 0, doc);
    // Show the new order at once; the server's answer follows.
    setDeck({ ...deck, docs: next, items: next.map((x) => deck.items.find((d) => d.id === x)!) });
    void save({ docs: next });
  };
  const ungroup = async () => {
    await api('DELETE', `/api/decks/${id}`);
    navigate('/');
  };
  const go = (path: string) => (e: React.MouseEvent) => { e.preventDefault(); navigate(path); };

  return (
    <Shell page="docs" navigate={navigate}>
      <main className="home deck-page">
        <a className="back-link" href="/" onClick={go('/')}><ArrowLeft size={14} /> Documents</a>
        <header className="deck-head">
          <div className="deck-fields">
            <Field className="deck-title-input" label="Deck title" value={deck.title} onSave={(v) => save({ title: v })} />
            <Field className="deck-desc-input" label="Description" multiline placeholder="What this deck is for" value={deck.description} onSave={(v) => save({ description: v })} />
            <p className="deck-count">{deck.items.length} {deck.items.length === 1 ? 'document' : 'documents'}, one per slide</p>
          </div>
          <div className="deck-actions">
            <button className="btn solid" disabled={!deck.items.some((d) => d.archivedAt == null)} onClick={() => startPlay(navigate, id, `/deck/${id}`)}><PlayIcon size={15} /> Play</button>
            <a className="btn ghost" href={`/api/decks/${id}/export`} download><Download size={15} /> Export as HTML</a>
            <button className="btn ghost" aria-pressed={deck.pinned != null} onClick={() => void save({ pinned: deck.pinned == null })}>
              {deck.pinned != null ? <><PinOff size={15} /> Unpin</> : <><Pin size={15} /> Pin</>}
            </button>
            <button className="btn ghost" onClick={() => setUngrouping(true)}><Ungroup size={15} /> Ungroup</button>
          </div>
        </header>
        {error && <p className="home-error" role="alert">{error}</p>}

        <ol className="deck-slides" aria-label="Slides, in order">
          {deck.items.map((d, i) => (
            <li key={d.id} className={cx('deck-slide', dragging === d.id && 'is-dragging', d.archivedAt != null && 'is-archived')}
              draggable onDragStart={(e) => { setDragging(d.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', d.id); }}
              onDragEnd={() => setDragging(null)}
              onDragOver={(e) => { if (dragging && dragging !== d.id) e.preventDefault(); }}
              onDrop={(e) => { e.preventDefault(); if (dragging) move(dragging, i); setDragging(null); }}>
              <span className="deck-grip" aria-hidden><GripVertical size={16} /></span>
              <span className="deck-n">{i + 1}</span>
              <a className="deck-doc" href={`/d/${d.id}`} onClick={go(`/d/${d.id}`)}>
                <Minimap shape={d.shape} />
                <span className="deck-doc-text">
                  <span className="deck-doc-title">{d.title}</span>
                  {d.description && <span className="deck-doc-desc">{d.description}</span>}
                  {d.archivedAt != null && <span className="badge">Archived, skipped in Play</span>}
                </span>
              </a>
              <span className="deck-slide-tools">
                <button className="icon-btn" aria-label={`Move “${d.title}” up`} title="Move up" disabled={i === 0} onClick={() => move(d.id, i - 1)}><ArrowUp size={16} /></button>
                <button className="icon-btn" aria-label={`Move “${d.title}” down`} title="Move down" disabled={i === deck.items.length - 1} onClick={() => move(d.id, i + 1)}><ArrowDown size={16} /></button>
                <button className="icon-btn" aria-label={`Take “${d.title}” out of the deck`} title="Take out of the deck (the document stays)" onClick={() => void save({ docs: order.filter((x) => x !== d.id) })}><X size={16} /></button>
              </span>
            </li>
          ))}
        </ol>
        {!deck.items.length && <p className="home-empty">No documents in this deck. Add some to play it.</p>}
        <button className="btn soft deck-add" onClick={() => setAdding(true)}><Plus size={15} /> Add documents</button>

        {adding && <AddDocs deck={deck} onClose={() => setAdding(false)} onAdd={(ids) => { setAdding(false); void save({ docs: [...order, ...ids] }); }} />}
        {ungrouping && (
          <Confirm title={`Ungroup “${deck.title}”?`} yes="Ungroup" onYes={() => void ungroup()} onClose={() => setUngrouping(false)}>
            The deck goes away. Its {deck.items.length} documents stay, back in your list as they are.
          </Confirm>
        )}
      </main>
    </Shell>
  );
}

/** Text that saves when you leave it or press Enter (Shift+Enter: a new line in the description). */
function Field({ value, onSave, label, multiline, placeholder, className }: { value: string; onSave: (v: string) => void; label: string; multiline?: boolean; placeholder?: string; className?: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const done = () => { if (text.trim() !== value) onSave(text.trim()); };
  const keys = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === 'Escape') { setText(value); e.currentTarget.blur(); }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur(); }
  };
  return multiline
    ? <textarea className={className} aria-label={label} placeholder={placeholder} rows={2} value={text} onChange={(e) => setText(e.target.value)} onBlur={done} onKeyDown={keys} />
    : <input className={className} aria-label={label} placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} onBlur={done} onKeyDown={keys} />;
}

/** Ask before something that can't be taken back. */
export function Confirm({ title, yes, onYes, onClose, children, danger }: { title: string; yes: string; onYes: () => void; onClose: () => void; children: React.ReactNode; danger?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (ref.current && !ref.current.open) ref.current.showModal(); }, []);
  return (
    <dialog ref={ref} className="dialog" aria-labelledby="confirm-title" onClose={onClose}>
      <div className="dialog-body">
        <h2 id="confirm-title">{title}</h2>
        <p className="dialog-about">{children}</p>
        <div className="dialog-actions">
          <button className="btn ghost" autoFocus onClick={() => ref.current?.close()}>Cancel</button>
          <button className={cx('btn', danger ? 'danger' : 'solid')} onClick={() => { onYes(); ref.current?.close(); }}>{yes}</button>
        </div>
      </div>
    </dialog>
  );
}

/** Pick documents to add, found by search; one already in another deck moves here. */
function AddDocs({ deck, onClose, onAdd }: { deck: Full; onClose: () => void; onAdd: (ids: string[]) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<LibraryEntry[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => { if (ref.current && !ref.current.open) ref.current.showModal(); }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      // With words, search finds documents inside decks too; without, the list shows only those outside one.
      void api<Library>('GET', `/api/library?q=${encodeURIComponent(q)}`).then((lib) =>
        setFound([...lib.pinned, ...lib.rest].filter((e) => e.type === 'doc' && !deck.docs.includes(e.id))));
    }, 120);
    return () => clearTimeout(t);
  }, [q, deck.docs]);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <dialog ref={ref} className="dialog add-docs" aria-labelledby="add-title" onClose={onClose}>
      <div className="dialog-body">
        <h2 id="add-title">Add documents to “{deck.title}”</h2>
        <label className="add-search"><Search size={15} /><input type="search" autoFocus placeholder="Find documents" aria-label="Find documents" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <ul className="add-list">
          {found.map((e) => (
            <li key={e.id}>
              <label>
                <input type="checkbox" checked={picked.includes(e.id)} onChange={() => toggle(e.id)} />
                <span className="add-title">{e.title}</span>
                {e.type === 'doc' && e.deckTitle && <span className="badge">moves from {e.deckTitle}</span>}
              </label>
            </li>
          ))}
          {!found.length && <li className="add-none">{q ? `Nothing matches “${q}”.` : 'Every document is already in a deck.'}</li>}
        </ul>
        <div className="dialog-actions">
          <button className="btn ghost" onClick={() => ref.current?.close()}>Cancel</button>
          <button className="btn solid" disabled={!picked.length} onClick={() => onAdd(picked)}>Add {picked.length || ''}</button>
        </div>
      </div>
    </dialog>
  );
}
