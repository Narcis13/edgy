// The library's small pure pieces: highlighting search words, labels, remembered choices.

import { normalize, queryWords } from '../../../core/library';

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

export type View = 'grid' | 'list';
export type Sort = 'updated' | 'created' | 'title';
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

/** How the library is shown, remembered between visits. The filter and the search are not. */
export interface Prefs {
  view: View;
  sort: Sort;
}

const KEY = 'edgy.library';

export function parsePrefs(raw: string | null): Prefs {
  const prefs: Prefs = { view: 'grid', sort: 'updated' };
  try {
    const o = JSON.parse(raw ?? 'null') as Partial<Prefs> | null;
    if (o?.view === 'grid' || o?.view === 'list') prefs.view = o.view;
    if (o?.sort === 'updated' || o?.sort === 'created' || o?.sort === 'title') prefs.sort = o.sort;
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
