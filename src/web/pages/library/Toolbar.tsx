// Search, filters, sort and view. The search box keeps what is typed to itself
// and passes the words on 120 ms after the last key, so typing never redraws the cards.

import { memo, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { LayoutGrid, List, Plus, Search, X } from 'lucide-react';
import { type Filter, type Sort, type View, cx } from './text';

export interface SearchHandle {
  clear: () => void;
  focus: () => void;
}

function SearchBox({ onQuery, busy, ref }: { onQuery: (q: string) => void; busy: boolean; ref: React.Ref<SearchHandle> }) {
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const clear = () => { setText(''); onQuery(''); };
  useImperativeHandle(ref, () => ({ clear, focus: () => input.current?.focus() }));
  useEffect(() => {
    const t = setTimeout(() => onQuery(text.trim()), 120);
    return () => clearTimeout(t);
  }, [text, onQuery]);
  return (
    <div className={cx('lib-search', busy && 'is-busy')}>
      <Search size={15} aria-hidden />
      <input
        ref={input}
        type="search"
        aria-label="Search documents"
        placeholder="Search titles, descriptions and text"
        value={text}
        maxLength={200}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && text) { e.preventDefault(); e.stopPropagation(); clear(); }
        }}
      />
      {text && <button type="button" className="icon-btn" aria-label="Clear search" onClick={() => { clear(); input.current?.focus(); }}><X size={15} /></button>}
    </div>
  );
}

const FILTERS: [Filter, string][] = [['all', 'All'], ['pinned', 'Pinned'], ['shared', 'Shared'], ['decks', 'Decks'], ['archived', 'Archived']];
const SORTS: [Sort, string][] = [['updated', 'Last changed'], ['created', 'Created'], ['title', 'Title']];

export const Toolbar = memo(function Toolbar({ filter, sort, view, busy, creating, onQuery, onFilter, onSort, onView, onNew, searchRef }: {
  filter: Filter;
  sort: Sort;
  view: View;
  busy: boolean;
  creating: boolean;
  onQuery: (q: string) => void;
  onFilter: (f: Filter) => void;
  onSort: (s: Sort) => void;
  onView: (v: View) => void;
  onNew: () => void;
  searchRef: React.Ref<SearchHandle>;
}) {
  return (
    <div className="lib-toolbar">
      <div className="lib-head">
        <h1>Documents</h1>
        <button type="button" className="btn solid lib-new" onClick={onNew} disabled={creating}><Plus size={16} /> New document</button>
      </div>
      <div className="lib-tools">
        <SearchBox ref={searchRef} onQuery={onQuery} busy={busy} />
        <div className="lib-filters" role="group" aria-label="Show">
          {FILTERS.map(([f, label]) => (
            <button key={f} type="button" className={cx('lib-chip', filter === f && 'is-on')} aria-pressed={filter === f} onClick={() => onFilter(f)}>{label}</button>
          ))}
        </div>
        <div className="lib-arrange">
          <label className="lib-sort">
            <span className="sr-only">Sort by</span>
            <select className="text-field" value={sort} onChange={(e) => onSort(e.target.value as Sort)}>
              {SORTS.map(([s, label]) => <option key={s} value={s}>{label}</option>)}
            </select>
          </label>
          <div className="seg lib-view" role="group" aria-label="View">
            <button type="button" className={cx(view === 'grid' && 'is-on')} aria-pressed={view === 'grid'} aria-label="Grid" title="Grid" onClick={() => onView('grid')}><LayoutGrid size={15} /></button>
            <button type="button" className={cx(view === 'list' && 'is-on')} aria-pressed={view === 'list'} aria-label="List" title="List" onClick={() => onView('list')}><List size={15} /></button>
          </div>
        </div>
      </div>
    </div>
  );
});
