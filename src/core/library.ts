// The library: what a document's card shows, what search reads in it, and how
// the home page arranges documents and decks. Pure functions; the server keeps
// the state and calls these.

import type { Cell, Doc } from './types';
import { isOpen, openSections, openTab, panelTitles } from './containers';

// ───────────────────────────── text ─────────────────────────────

/** Props that are code, layout or addresses, not words a reader sees. */
const NOT_TEXT = new Set([
  'id', 'kind', 'name', 'style', 'size', 'format', 'type', 'variant', 'fit', 'icon', 'src', 'url', 'headers', 'select',
  'borders', 'density', 'header', 'paper', 'color', 'marker', 'week', 'better', 'hidden', 'every', 'after', 'selected',
  'group', 'on', 'do', 'key', 'show', 'colors', 'align', 'width', 'total', 'fill', 'dash', 'from', 'to',
  'compare', 'trend', 'min', 'max', 'step', 'search', 'stripes', 'progress', 'multiple', 'confirm', 'date', 'end',
  'children', 'bold', 'wrap', 'x', 'y', 'w', 'h', 'points', 'stroke', 'shape', 'font', 'done',
]);

/** Markdown marks and {{templates}} out, the words left. */
export function plainText(s: string): string {
  return s
    .replace(/\{\{[^}]*\}\}/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/[*_`~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strings inside a value or an expression that read as words: not names ($x), not function names, not dates or numbers. */
function words(x: unknown, out: string[], data = false): void {
  if (typeof x === 'string') {
    if (x.startsWith('$') || /^[\d\s.:,+-]*$/.test(x) || /^\d{4}-\d\d-\d\d/.test(x)) return;
    const t = plainText(x);
    if (t) out.push(t);
  } else if (Array.isArray(x)) {
    // An expression's head is a function name; a list of plain values has none.
    const isCall = !data && typeof x[0] === 'string' && /^[a-z][\w!?*+<>=/-]*$|^[-+*/%^<>=!]+$/.test(x[0]) && x.length > 1;
    (isCall ? x.slice(1) : x).forEach((v) => words(v, out));
  } else if (x && typeof x === 'object') {
    for (const [k, v] of Object.entries(x)) if (!NOT_TEXT.has(k)) words(v, out);
  }
}

function cellText(c: Cell, out: string[]): void {
  for (const [k, v] of Object.entries(c)) {
    if (k === 'children') continue;
    // A table's columns are records; only their labels are read.
    if (k === 'columns' && Array.isArray(v)) {
      for (const col of v) if (col && typeof col === 'object' && !Array.isArray(col) && typeof col.label === 'string') out.push(col.label);
      continue;
    }
    if (k === 'actions' && Array.isArray(v)) {
      for (const a of v) if (a && typeof a === 'object' && !Array.isArray(a) && typeof a.label === 'string') out.push(a.label);
      continue;
    }
    // A value is data (list items, rows), never a call.
    if (!NOT_TEXT.has(k)) words(v, out, k === 'value');
  }
  // Diagram elements and list items written as children are records, not cells.
  c.children?.forEach((ch) => (ch && typeof ch === 'object' && 'kind' in ch && 'id' in ch ? cellText(ch, out) : words(ch, out)));
}

/** Everything a reader sees in a document's cells, as plain text (at most `limit` characters). */
export function docText(doc: Doc, limit = 20_000): string {
  const out: string[] = [];
  cellText(doc.root, out);
  const seen = new Set<string>();
  let text = '';
  for (const s of out) {
    if (seen.has(s)) continue;
    seen.add(s);
    text += (text ? ' · ' : '') + s;
    if (text.length >= limit) return text.slice(0, limit);
  }
  return text;
}

export const describe = (doc: Doc): string => (typeof doc.meta.description === 'string' ? doc.meta.description : '');

// ───────────────────────────── search ─────────────────────────────

/** Lower case, without accents, one space between words: how search compares text. */
export function normalize(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** The query's words, normalised. */
export function queryWords(q: string): string[] {
  return normalize(q).split(/\s+/).map((w) => w.replace(/^["']+|["']+$/g, '')).filter(Boolean).slice(0, 8);
}

export type Field = 'title' | 'description' | 'text';

export interface Match {
  /** Where the first word was found: the title wins over the description, which wins over the text. */
  field: Field;
  /** Around the match, in the original spelling. */
  snippet: string;
}

export interface Searchable {
  title: string;
  description: string;
  text: string;
}

/** Each character's normalised form, so a match in normalised text maps back to the original. */
function located(s: string): { norm: string; at: number[] } {
  let norm = '';
  const at: number[] = [];
  let i = 0;
  for (const ch of s) {
    const n = normalize(ch);
    for (let k = 0; k < n.length; k++) at.push(i);
    norm += n;
    i += ch.length;
  }
  at.push(s.length);
  return { norm, at };
}

function snippet(s: string, word: string, width = 90): string {
  const { norm, at } = located(s);
  const hit = norm.indexOf(word);
  if (hit < 0 || s.length <= width) return s.length <= width ? s : s.slice(0, width).trimEnd() + '…';
  const from = at[hit];
  let start = Math.max(0, from - Math.floor(width / 3));
  if (start > 0) {
    const space = s.lastIndexOf(' ', start + 12);
    if (space > start - 12 && space < from) start = space + 1;
  }
  const end = Math.min(s.length, start + width);
  return (start > 0 ? '…' : '') + s.slice(start, end).trim() + (end < s.length ? '…' : '');
}

/** Whether every word appears in the title, the description or the text, and where. */
export function match(words: string[], doc: Searchable): Match | null {
  if (!words.length) return null;
  const fields: [Field, string][] = [['title', doc.title], ['description', doc.description], ['text', doc.text]];
  const norm = fields.map(([, s]) => normalize(s));
  const all = norm.join('\n');
  if (!words.every((w) => all.includes(w))) return null;
  // The field that holds the most words is where it matched; ties go to the earlier field.
  let best = 0;
  let bestCount = -1;
  norm.forEach((s, i) => {
    const n = words.filter((w) => s.includes(w)).length;
    if (n > bestCount) { best = i; bestCount = n; }
  });
  const [field, text] = fields[best];
  const word = words.find((w) => norm[best].includes(w))!;
  return { field, snippet: field === 'title' ? text : snippet(text, word) };
}

// ───────────────────────────── the card's picture ─────────────────────────────

/**
 * A document's shape for its card, never its content: `k` the kind, `s` the
 * size, `c` the children, `o` which children are open (tabs, accordions) or
 * whether it is open (collapsibles). Small on purpose: a list of hundreds
 * carries one each.
 */
export interface Shape {
  k: string;
  s?: number | 'hug';
  o?: number[] | boolean;
  c?: Shape[];
}

export function shapeOf(cell: Cell, budget = { nodes: 32, depth: 4 }, depth = 0): Shape {
  budget.nodes--;
  const s: Shape = { k: cell.kind };
  if (typeof cell.size === 'number' || cell.size === 'hug') s.s = cell.size;
  if (cell.kind === 'tabs') {
    const open = openTab(cell);
    s.o = [Math.max(0, panelTitles(cell).indexOf(open ?? ''))];
  } else if (cell.kind === 'accordion') {
    const titles = panelTitles(cell);
    s.o = openSections(cell).map((t) => titles.indexOf(t)).filter((i) => i >= 0);
  } else if (cell.kind === 'collapsible') s.o = isOpen(cell);
  const kids = cell.children?.filter((c) => c && typeof c === 'object' && 'kind' in c) ?? [];
  if (kids.length) {
    s.c = [];
    for (const [i, ch] of kids.entries()) {
      // Out of room: what is left reads as one block of text.
      if (budget.nodes <= 0 || depth >= budget.depth) { s.c.push({ k: 'text' }); break; }
      // What is folded away has no picture.
      const shut = (Array.isArray(s.o) && !s.o.includes(i)) || s.o === false;
      s.c.push(shut ? { k: ch.kind } : shapeOf(ch, budget, depth + 1));
    }
  }
  return s;
}

// ───────────────────────────── arranging ─────────────────────────────

export type Sort = 'updated' | 'created' | 'title';
export type Filter = 'all' | 'pinned' | 'shared' | 'decks' | 'archived';
export const SORTS: Sort[] = ['updated', 'created', 'title'];
export const FILTERS: Filter[] = ['all', 'pinned', 'shared', 'decks', 'archived'];

/** A card on the home page: a document or a deck. */
export interface Entry {
  type: 'doc' | 'deck';
  id: string;
  title: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  /** Position among the pinned (1 first), or null. */
  pinned: number | null;
  archivedAt: number | null;
  /** doc: the deck it belongs to. */
  deck?: string | null;
  /** doc: which share links are on. */
  shared?: { view: boolean; edit: boolean };
  match?: Match;
}

export interface Arranged<E extends Entry> {
  pinned: E[];
  rest: E[];
  total: number;
}

const RANK: Record<Field, number> = { title: 0, description: 1, text: 2 };

/**
 * What the home page shows: the entries that pass the filter (and match, when
 * searching), pinned ones first in their own order, the rest in the chosen
 * sort. Without a search, documents inside a deck are inside its card; a
 * search finds them on their own. Archived entries show only under Archived.
 */
export function arrange<E extends Entry>(entries: E[], o: { filter?: Filter; sort?: Sort; searching?: boolean } = {}): Arranged<E> {
  const filter = o.filter ?? 'all';
  const keep = entries.filter((e) => {
    if (filter === 'archived') return e.archivedAt != null;
    if (e.archivedAt != null) return false;
    if (filter === 'decks') return e.type === 'deck';
    if (!o.searching && e.type === 'doc' && e.deck) return false;
    if (filter === 'pinned') return e.pinned != null;
    if (filter === 'shared') return e.type === 'doc' && !!(e.shared?.view || e.shared?.edit);
    return true;
  });
  const sort = o.sort ?? 'updated';
  const bySort = (a: E, b: E) =>
    sort === 'title' ? a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true }) || b.updatedAt - a.updatedAt
      : sort === 'created' ? b.createdAt - a.createdAt
      : b.updatedAt - a.updatedAt;
  const order = (a: E, b: E) => (o.searching && a.match && b.match ? RANK[a.match.field] - RANK[b.match.field] : 0) || bySort(a, b);
  // Archived entries have no pin; under Archived there is no pinned section.
  const pinned = filter === 'archived' ? [] : keep.filter((e) => e.pinned != null).sort((a, b) => a.pinned! - b.pinned! || order(a, b));
  const rest = keep.filter((e) => !pinned.includes(e)).sort(order);
  return { pinned, rest, total: pinned.length + rest.length };
}

/** Move `id` among the pinned ids to `to` (0 first); the new order. */
export function movePinned(ids: string[], id: string, to: number): string[] {
  const rest = ids.filter((x) => x !== id);
  if (rest.length === ids.length) return ids;
  rest.splice(Math.max(0, Math.min(rest.length, to)), 0, id);
  return rest;
}
