// The library's small pure pieces: highlighting search words, labels, remembered choices.

import { normalize, queryWords } from '../../../core/library';

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

export type View = 'grid' | 'list';
export type Sort = 'updated' | 'created' | 'title';
/** Whose documents: mine, or the ones other people gave my account access to. */
export type Scope = 'mine' | 'shared';
export type Filter = 'all' | 'pinned' | 'shared' | 'decks' | 'archived';

export interface Part {
  text: string;
  mark: boolean;
}

/**
 * `text` cut into pieces, the ones that hold a query word marked. Search ignores
 * case and accents, so the comparison does too, but the pieces keep the original spelling.
 */
export function highlight(text: string, query: string): Part[] {
  const words = queryWords(query);
  if (!words.length || !text) return [{ text, mark: false }];
  // Each normalised character remembers where it came from in the original.
  let norm = '';
  const at: number[] = [];
  let i = 0;
  for (const ch of text) {
    const n = normalize(ch);
    for (let k = 0; k < n.length; k++) at.push(i);
    norm += n;
    i += ch.length;
  }
  at.push(text.length);
  const hits: [number, number][] = [];
  for (const w of words) {
    for (let from = norm.indexOf(w); from >= 0; from = norm.indexOf(w, from + w.length)) {
      hits.push([at[from], at[from + w.length]]);
    }
  }
  if (!hits.length) return [{ text, mark: false }];
  hits.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  // Overlapping words ("plan", "planning") make one mark.
  const merged: [number, number][] = [];
  for (const h of hits) {
    const last = merged[merged.length - 1];
    if (last && h[0] <= last[1]) last[1] = Math.max(last[1], h[1]);
    else merged.push([h[0], h[1]]);
  }
  const parts: Part[] = [];
  let pos = 0;
  for (const [a, b] of merged) {
    if (a > pos) parts.push({ text: text.slice(pos, a), mark: false });
    parts.push({ text: text.slice(a, b), mark: true });
    pos = b;
  }
  if (pos < text.length) parts.push({ text: text.slice(pos), mark: false });
  return parts;
}

/** What a new deck is called until someone names it. */
export function deckTitle(titles: string[]): string {
  if (!titles.length) return 'New deck';
  if (titles.length === 1) return titles[0];
  return `${titles[0]} and ${titles.length - 1} more`;
}

export function plural(n: number, one: string, many = one + 's'): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** How the library is shown (and whose it is), remembered between visits. The filter and the search are not. */
export interface Prefs {
  view: View;
  sort: Sort;
  scope: Scope;
}

const KEY = 'edgy.library';

export function parsePrefs(raw: string | null): Prefs {
  const prefs: Prefs = { view: 'grid', sort: 'updated', scope: 'mine' };
  try {
    const o = JSON.parse(raw ?? 'null') as Partial<Prefs> | null;
    if (o?.view === 'grid' || o?.view === 'list') prefs.view = o.view;
    if (o?.sort === 'updated' || o?.sort === 'created' || o?.sort === 'title') prefs.sort = o.sort;
    if (o?.scope === 'mine' || o?.scope === 'shared') prefs.scope = o.scope;
  } catch {
    /* a broken value is the default */
  }
  return prefs;
}

export function loadPrefs(): Prefs {
  try {
    return parsePrefs(localStorage.getItem(KEY));
  } catch {
    return parsePrefs(null);
  }
}

export function savePrefs(p: Prefs): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode */ }
}

/** Where a search hit was found, for the line under its title. */
export const WHERE = { title: 'In the title', description: 'In the description', text: 'In the text' } as const;

/** What an entry in Shared with me carries besides a document's own fields (the server adds them). */
export interface TheirDoc {
  role: 'viewer' | 'editor';
  ownerName: string;
}

/** The owner and my role when the entry came from Shared with me; null for my own. */
export function theirDoc(entry: object): TheirDoc | null {
  const e = entry as { role?: unknown; ownerName?: unknown };
  if (e.role !== 'viewer' && e.role !== 'editor') return null;
  return { role: e.role, ownerName: typeof e.ownerName === 'string' && e.ownerName ? e.ownerName : 'Someone' };
}

export const roleLabel = (role: TheirDoc['role']) => (role === 'editor' ? 'Can edit' : 'Can view');

/** "Ana's": whose a shared document is. */
export function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}’` : `${name}’s`;
}

/** The badge on my own document that others can open: people with accounts, or a link. */
export function sharedBadge(s: { view?: boolean; edit?: boolean; people?: number } | undefined): string | null {
  if (!s) return null;
  if (s.people) return `Shared with ${s.people}`;
  if (s.edit) return 'Shared · can edit';
  if (s.view) return 'Shared · can view';
  return null;
}
