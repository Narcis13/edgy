// Notes as a grid of cards, pinned first: write one at the top, click a card to
// edit it where it is, search the words, pick a tag.

import { type KeyboardEvent, type MouseEvent, type RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Pin, Plus, Search, X } from 'lucide-react';
import { type FlowItem, tagOf, tagsOf } from '../../../core/flow';
import { timeAgo } from '../../lib/api';
import { cx, plural } from '../library/text';
import { DocLink, ItemMenu, Tags, When } from './bits';
import type { ViewProps } from './FlowPage';
import { type FlowActions, quiet } from './state';
import { editFields, newNoteText, notesOf, oneLine } from './notecards';
import './notes.css';

/** Keeps a textarea as tall as its lines. */
function useGrow(ref: RefObject<HTMLTextAreaElement | null>, value: string, on = true) {
  useLayoutEffect(() => {
    const t = ref.current;
    if (!on || !t) return;
    t.style.height = 'auto';
    if (t.scrollHeight) t.style.height = `${t.scrollHeight + t.offsetHeight - t.clientHeight}px`;
  }, [ref, value, on]);
}

const saveKey = (e: KeyboardEvent) => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing;

export function Notes(props: ViewProps) {
  const { data, acts } = props;
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const notes = useMemo(() => data.items.filter((i) => i.kind === 'note'), [data.items]);
  const tags = useMemo(() => tagsOf(notes), [notes]);
  // A tag nobody has any more (the last note with it changed) is no longer a filter.
  const tag = picked && tags.some((t) => t.tag === picked) ? picked : null;
  const shown = useMemo(() => notesOf(data.items, query, tag), [data.items, query, tag]);
  const pickTag = (t: string) => setPicked((cur) => (cur === t ? null : t));
  const row = tags.slice(0, 24);
  if (tag && !row.some((t) => t.tag === tag)) row.push(tags.find((t) => t.tag === tag)!);

  return (
    <div className="notes">
      <NewNote acts={acts} />

      {notes.length > 0 && (
        <>
          <div className="notes-tools">
            <label className="lib-search flow-search notes-search">
              <Search size={15} aria-hidden="true" />
              <input type="search" value={query} placeholder="Search notes" aria-label="Search notes" onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape' && query) { e.preventDefault(); setQuery(''); } }} />
              {query && <button type="button" className="icon-btn" aria-label="Clear the search" title="Clear the search" onClick={() => setQuery('')}><X size={14} /></button>}
            </label>
            <span className="lib-n notes-count" aria-live="polite">{plural(shown.length, 'note')}</span>
          </div>
          {row.length > 0 && (
            <div className="flow-tagrow notes-tags" role="group" aria-label="Tags">
              {row.map((x) => (
                <button key={x.tag} type="button" className={cx('flow-tag', tag === x.tag && 'is-on')} aria-pressed={tag === x.tag} onClick={() => pickTag(x.tag)}>
                  #{x.tag} <span className="lib-n">{x.count}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {!notes.length ? (
        <div className="lib-empty"><p>No notes yet. Write one above, or post a thought in the timeline.</p></div>
      ) : !shown.length ? (
        <p className="home-empty">Nothing matches.</p>
      ) : (
        <div className="notes-grid" aria-label="Notes">
          {shown.map((n) => <NoteCard key={n.id} item={n} props={props} tag={tag} pickTag={pickTag} />)}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────── a new note ─────────────────────────────

function NewNote({ acts }: { acts: FlowActions }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  useGrow(bodyRef, body, open);
  useEffect(() => { if (open) titleRef.current?.focus(); }, [open]);

  const text = newNoteText(title, body);
  const close = () => {
    setOpen(false);
    setTitle('');
    setBody('');
    setError(null);
  };
  const save = async () => {
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      // The title is kept as typed (a day in it is just words); only its #tags are read.
      const tags = [...title.matchAll(/(?:^|\s)#([\p{L}\p{N}_-]+)/gu)].map((m) => tagOf(m[1])).filter(Boolean);
      const bare = title.replace(/(?:^|\s)#[\p{L}\p{N}_-]+/gu, ' ').replace(/\s{2,}/g, ' ').trim();
      await acts.post({ text: bare + (body.trim() ? '\n' + body.trim() : ''), kind: 'note', plain: true, tags });
      close();
    } catch {
      setError('The note could not be saved. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="notes-new is-closed">
        <button type="button" className="text-field notes-new-open" onClick={() => setOpen(true)}><Plus size={15} aria-hidden="true" /> New note…</button>
      </div>
    );
  }
  return (
    <div className="notes-new is-open"
      onKeyDown={(e) => {
        if (saveKey(e)) { e.preventDefault(); void save(); }
        else if (e.key === 'Escape' && !busy) { e.preventDefault(); e.stopPropagation(); close(); }
      }}>
      <input ref={titleRef} type="text" className="text-field notes-new-title" value={title} placeholder="Title, with #tags" aria-label="Title" maxLength={300}
        onChange={(e) => setTitle(oneLine(e.target.value))}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.nativeEvent.isComposing) { e.preventDefault(); bodyRef.current?.focus(); } }} />
      <textarea ref={bodyRef} className="text-field notes-new-body" rows={3} value={body} placeholder="Write…" aria-label="Note" onChange={(e) => setBody(e.target.value)} />
      {error && <p className="notes-error" role="alert">{error}</p>}
      <div className="notes-new-actions">
        <button type="button" className="btn solid small" disabled={!text || busy} onClick={() => void save()}>Save</button>
        <button type="button" className="btn ghost small" disabled={busy} onClick={close}>Cancel</button>
        <span className="notes-hint">Ctrl+Enter saves</span>
      </div>
    </div>
  );
}

// ───────────────────────────── a card ─────────────────────────────

function NoteCard({ item, props, tag, pickTag }: { item: FlowItem; props: ViewProps; tag: string | null; pickTag: (t: string) => void }) {
  const { data, today, now, acts, openItem, confirm, navigate } = props;
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const card = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  // Esc, Ctrl+Enter and the blur that follows them must finish only once.
  const done = useRef(false);
  const focusOn = useRef<'title' | 'body'>('title');
  useGrow(titleRef, title, editing);
  useGrow(bodyRef, body, editing);

  useEffect(() => {
    if (!editing) return;
    const t = focusOn.current === 'body' ? bodyRef.current : titleRef.current;
    if (!t) return;
    t.focus();
    t.setSelectionRange(t.value.length, t.value.length);
  }, [editing]);

  const start = (on: 'title' | 'body') => {
    done.current = false;
    focusOn.current = on;
    setTitle(item.text);
    setBody(item.body);
    setEditing(true);
  };
  const finish = (refocus: boolean) => {
    if (done.current) return;
    done.current = true;
    const fields = editFields(item, title, body);
    if (fields) quiet(acts.patch(item.id, fields));
    if (refocus) card.current?.focus();
    setEditing(false);
  };

  const onClick = (e: MouseEvent) => {
    if (editing) return;
    const t = e.target as HTMLElement;
    if (t.closest('button, a, [role=menu], .lc-menu, input, textarea')) return;
    // Dragging across the words to copy them is not a click to edit.
    if (window.getSelection()?.toString()) return;
    start(t.closest('.note-body') ? 'body' : 'title');
  };

  const when = item.due || item.start;
  return (
    <article
      ref={card}
      data-id={item.id}
      tabIndex={0}
      aria-label={item.text || 'Untitled note'}
      className={cx('note-card', item.pinned && 'is-pinned', editing && 'is-editing', menu && 'is-menu')}
      onClick={onClick}
      onKeyDown={(e) => { if (!editing && e.target === e.currentTarget && e.key === 'Enter') { e.preventDefault(); start('title'); } }}
      // Pressing on the card's own padding must not take the focus out of the fields.
      onMouseDown={(e) => { if (editing && !(e.target as HTMLElement).closest('button, a, input, textarea, [role=menu]')) e.preventDefault(); }}
      onBlur={(e) => {
        if (!editing) return;
        const next = e.relatedTarget as Node | null;
        if (next && card.current?.contains(next)) return;
        finish(false);
      }}
    >
      {editing ? (
        <div className="note-edit">
          <textarea ref={titleRef} className="text-field note-edit-title" rows={1} value={title} placeholder="Title" aria-label="Title" maxLength={300}
            onChange={(e) => setTitle(oneLine(e.target.value))}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(true); }
              else if (saveKey(e)) { e.preventDefault(); finish(true); }
              else if (e.key === 'Enter') { e.preventDefault(); bodyRef.current?.focus(); }
            }} />
          <textarea ref={bodyRef} className="text-field note-edit-body" rows={3} value={body} placeholder="Write…" aria-label="Note" onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(true); }
              else if (saveKey(e)) { e.preventDefault(); finish(true); }
            }} />
          <small className="notes-hint">Esc or clicking outside saves</small>
        </div>
      ) : (
        <>
          <h3 className="note-title">{item.text || <span className="faint">(no title)</span>}</h3>
          {item.body && <p className="note-body">{item.body}</p>}
        </>
      )}

      {(item.tags.length > 0 || when || item.doc) && (
        <div className="note-meta">
          <When item={item} today={today} />
          <Tags tags={item.tags} onPick={editing ? undefined : pickTag} picked={tag} />
          {item.doc && <DocLink id={item.doc} title={data.docs[item.doc] ?? ''} navigate={navigate} />}
        </div>
      )}
      <div className="note-foot">
        {item.pinned && <span className="note-pin" role="img" aria-label="Pinned" title="Pinned"><Pin size={13} /></span>}
        <time dateTime={new Date(item.updated).toISOString()} title={new Date(item.updated).toLocaleString()}>changed {timeAgo(item.updated, now)}</time>
      </div>

      <ItemMenu item={item} deps={{ acts, openItem, confirm }} onOpenChange={setMenu} />
    </article>
  );
}
