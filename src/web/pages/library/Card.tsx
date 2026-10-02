// One entry of the library: a document or a deck, as a card (grid) or a row (list).
// Memoised: a reload, a selection or a search redraws only the cards that changed.

import { memo, useEffect, useRef, useState } from 'react';
import {
  Archive, ArchiveRestore, ArrowDown, ArrowUp, Download, ExternalLink, Layers, Pin, PinOff, Play, Share2, SquarePen, Trash2, Ungroup,
} from 'lucide-react';
import type { Shape } from '../../../core/library';
import { type LibraryEntry, timeAgo } from '../../lib/api';
import { Minimap } from '../Minimap';
import { Menu, type MenuItem } from './Menu';
import { type Sort, WHERE, cx, highlight, plural } from './text';

/** What a card can ask the library to do. One stable object, so it never breaks the memo. */
export interface Actions {
  navigate: (path: string) => void;
  select: (id: string, on: boolean) => void;
  describe: (e: LibraryEntry, text: string) => Promise<void>;
  pin: (e: LibraryEntry, on: boolean) => void;
  move: (id: string, by: -1 | 1) => void;
  share: (e: LibraryEntry) => void;
  archive: (e: LibraryEntry, on: boolean) => void;
  remove: (e: LibraryEntry) => void;
  ungroup: (e: LibraryEntry) => void;
  play: (id: string) => void;
  dragStart: (id: string) => void;
  dragging: () => string | null;
  drop: (target: string) => void;
}

export interface CardProps {
  entry: LibraryEntry;
  sort: Sort;
  query: string;
  selected: boolean;
  fresh: boolean;
  /** In the pinned section: its place and how many there are, for Move up / Move down. */
  pinIndex: number;
  pinCount: number;
  /** Pinned cards can be dragged into a new order (not while searching: only some pins show). */
  canReorder: boolean;
  acts: Actions;
}

function Marked({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  return <>{highlight(text, query).map((p, i) => (p.mark ? <mark key={i}>{p.text}</mark> : p.text))}</>;
}

function Stack({ covers }: { covers: { id: string; shape: Shape }[] }) {
  const shown = covers.slice(0, 3);
  return (
    <div className="lc-stack" data-n={shown.length}>
      {/* The first document is on top: drawn last. */}
      {shown.map((c, i) => (
        <div key={c.id} className="lc-sheet" style={{ '--i': i, zIndex: 3 - i } as React.CSSProperties}>
          <Minimap shape={c.shape} />
        </div>
      ))}
      {!shown.length && <div className="lc-sheet is-empty" style={{ '--i': 0 } as React.CSSProperties}><div className="minimap" /></div>}
    </div>
  );
}

function DescriptionEditor({ initial, onDone }: { initial: string; onDone: (text: string | null) => void }) {
  const [text, setText] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  // Enter, Escape and the blur that follows them must finish only once.
  const done = useRef(false);
  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    onDone(save ? text : null);
  };
  useEffect(() => {
    const t = ref.current!;
    t.focus();
    t.setSelectionRange(t.value.length, t.value.length);
  }, []);
  return (
    <div className="lc-describe">
      <textarea
        ref={ref}
        className="text-field"
        aria-label="Description"
        placeholder="What is this document for?"
        rows={3}
        maxLength={2000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); finish(true); }
          else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
        }}
        onBlur={() => finish(true)}
      />
      <small aria-hidden>Enter saves · Shift+Enter new line · Esc cancels</small>
    </div>
  );
}

function sharedLabel(s: { view: boolean; edit: boolean }): string | null {
  if (s.edit) return 'Shared · can edit';
  if (s.view) return 'Shared · can view';
  return null;
}

export const Card = memo(function Card({ entry: e, sort, query, selected, fresh, pinIndex, pinCount, canReorder, acts }: CardProps) {
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // What was just typed, shown until the reload brings it back from the server.
  const [typed, setTyped] = useState<string | null>(null);
  useEffect(() => setTyped(null), [e.description]);

  const deck = e.type === 'deck';
  const href = deck ? `/deck/${e.id}` : `/d/${e.id}`;
  const archived = e.archivedAt != null;
  const pinned = e.pinned != null && pinIndex >= 0;
  const description = typed ?? e.description;
  const match = query ? e.match : undefined;
  const shared = e.type === 'doc' ? sharedLabel(e.shared) : null;

  // A plain click opens it here; a middle click or Ctrl+click is the browser's (a new tab).
  const open = (ev: React.MouseEvent) => {
    if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    ev.preventDefault();
    acts.navigate(href);
  };
  const saveDescription = (text: string | null) => {
    setEditing(false);
    if (text === null || text.trim() === e.description.trim()) return;
    setTyped(text.trim());
    acts.describe(e, text.trim()).catch(() => setTyped(null));
  };

  const items = (): MenuItem[] => {
    const list: MenuItem[] = [{ label: 'Open', icon: <ExternalLink size={15} />, run: () => acts.navigate(href) }];
    if (deck) list.push({ label: 'Play', icon: <Play size={15} />, run: () => acts.play(e.id) });
    list.push({ label: e.description ? 'Edit description' : 'Add a description', icon: <SquarePen size={15} />, run: () => setEditing(true) });
    if (!archived) {
      list.push(e.pinned != null
        ? { label: 'Unpin', icon: <PinOff size={15} />, run: () => acts.pin(e, false) }
        : { label: 'Pin', icon: <Pin size={15} />, run: () => acts.pin(e, true) });
    }
    if (pinned && canReorder) {
      list.push({ label: 'Move up', icon: <ArrowUp size={15} />, run: () => acts.move(e.id, -1), disabled: pinIndex === 0 });
      list.push({ label: 'Move down', icon: <ArrowDown size={15} />, run: () => acts.move(e.id, 1), disabled: pinIndex === pinCount - 1 });
    }
    if (!deck) list.push({ label: 'Share…', icon: <Share2 size={15} />, run: () => acts.share(e) });
    list.push({ label: 'Export as HTML', icon: <Download size={15} />, href: `/api/${deck ? 'decks' : 'docs'}/${e.id}/export`, download: true });
    list.push(archived
      ? { label: 'Restore', icon: <ArchiveRestore size={15} />, run: () => acts.archive(e, false) }
      : { label: 'Archive', icon: <Archive size={15} />, run: () => acts.archive(e, true) });
    list.push(deck
      ? { label: 'Ungroup', icon: <Ungroup size={15} />, run: () => acts.ungroup(e), danger: true }
      : { label: 'Delete', icon: <Trash2 size={15} />, run: () => acts.remove(e), danger: true });
    return list;
  };

  const drag = pinned && canReorder;
  const time = sort === 'created' ? `Created ${timeAgo(e.createdAt)}` : `Changed ${timeAgo(e.updatedAt)}`;

  return (
    <article
      className={cx('lc', deck && 'is-deck', selected && 'is-selected', fresh && 'is-fresh', menuOpen && 'is-menu', editing && 'is-editing', archived && 'is-archived')}
      data-id={e.id}
      draggable={drag || undefined}
      onDragStart={drag ? (ev) => {
        ev.dataTransfer.effectAllowed = 'move';
        ev.dataTransfer.setData('text/x-edgy-pin', e.id);
        acts.dragStart(e.id);
      } : undefined}
      onDragOver={drag ? (ev) => {
        const from = acts.dragging();
        if (!from || from === e.id) return;
        ev.preventDefault();
        ev.dataTransfer.dropEffect = 'move';
        ev.currentTarget.classList.add('is-over');
      } : undefined}
      onDragLeave={drag ? (ev) => ev.currentTarget.classList.remove('is-over') : undefined}
      onDrop={drag ? (ev) => {
        ev.preventDefault();
        ev.currentTarget.classList.remove('is-over');
        acts.drop(e.id);
      } : undefined}
    >
      {/* The label is the tap target: bigger than the box. */}
      <label className="lc-pick">
        <input type="checkbox" className="lc-check" checked={selected} aria-label={`Select ${e.title}`} onChange={(ev) => acts.select(e.id, ev.target.checked)} />
      </label>
      <div className="lc-pic">{e.type === 'deck' ? <Stack covers={e.covers} /> : <Minimap shape={e.shape} />}</div>
      <div className="lc-body">
        <h3 className="lc-title">
          <a className="lc-link" href={href} onClick={open} draggable={drag ? false : undefined}>
            {match?.field === 'title' ? <Marked text={e.title} query={query} /> : e.title}
          </a>
        </h3>
        {editing ? (
          <DescriptionEditor initial={e.description} onDone={saveDescription} />
        ) : match?.field === 'description' ? null : description ? (
          <p className="lc-desc">{description}</p>
        ) : (
          <button type="button" className="lc-add" onClick={() => setEditing(true)}>Add a description</button>
        )}
        {/* A hit in the description shows there, marked, in place of the description. */}
        {match && match.field !== 'title' && (
          <p className="lc-match"><span>{WHERE[match.field]}:</span> <Marked text={match.snippet} query={query} /></p>
        )}
        <div className="lc-meta">
          {deck && <span className="lc-kind"><Layers size={12} /> Deck · {plural(e.count, 'document')}</span>}
          <span className="lc-time">{time}</span>
          {e.pinned != null && <span className="badge pin"><Pin size={11} /> Pinned</span>}
          {shared && <span className="badge shared">{shared}</span>}
          {archived && <span className="badge">Archived</span>}
          {e.type === 'doc' && e.deckTitle && query && <span className="badge deck">In {e.deckTitle}</span>}
        </div>
      </div>
      {e.type === 'deck' && (
        <button type="button" className="btn small soft lc-play" onClick={() => acts.play(e.id)} aria-label={`Play ${e.title}`}>
          <Play size={13} /><span>Play</span>
        </button>
      )}
      <Menu label={e.title} items={items} onOpenChange={setMenuOpen} />
    </article>
  );
});

