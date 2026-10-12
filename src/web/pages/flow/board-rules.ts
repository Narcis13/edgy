// The board's pure rules: where a dragged card would land, the order it gets,
// the keyboard's one-column move, the edge-scroll speed while dragging, and the
// edits to the list of columns (rename, add, move, remove). No DOM in here, so
// they can be tested; Board.tsx reads the rectangles and calls these.

import { between } from '../../../core/flow';

export const MIN_COLUMNS = 2;
export const MAX_COLUMNS = 8;
export const NEW_COLUMN = 'New column';

export interface ColumnRect {
  name: string;
  left: number;
  right: number;
}

export interface CardRect {
  top: number;
  bottom: number;
}

/** The column under a pointer's x: the one it is over, else the nearest (the gaps between columns belong to a neighbour). */
export function columnAt(rects: ColumnRect[], x: number): string | null {
  let best: string | null = null;
  let gap = Infinity;
  for (const r of rects) {
    const d = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
    if (d < gap) {
      gap = d;
      best = r.name;
    }
  }
  return best;
}

/** Where in a column a card dropped at y would go: how many of the other cards have their middle above the pointer. */
export function dropIndex(rects: CardRect[], y: number): number {
  let n = 0;
  for (const r of rects) if ((r.top + r.bottom) / 2 < y) n++;
  return n;
}

interface Placed {
  id: string;
  order: number;
}

/** The order a card gets when it is dropped at `index` among the other cards of a column (`cards` is the column in order; the dragged one may be in it). */
export function orderAt(cards: Placed[], dragId: string, index: number): number {
  const rest = cards.filter((c) => c.id !== dragId);
  const i = Math.max(0, Math.min(index, rest.length));
  return between(rest[i - 1]?.order, rest[i]?.order);
}

/** Dropped where it already was: the same column, and the same place among the others. */
export function samePlace(cards: { id: string }[], dragId: string, index: number): boolean {
  const at = cards.findIndex((c) => c.id === dragId);
  return at >= 0 && at === index;
}

/** The order that puts a card after the last one of a column (the keyboard's and the menu's move). */
export function endOrder(cards: Placed[], dragId: string): number {
  const rest = cards.filter((c) => c.id !== dragId);
  return between(rest[rest.length - 1]?.order, undefined);
}

/** The column one over from `current` (dir -1 left, 1 right), or null at the edge. */
export function neighbour(columns: string[], current: string, dir: -1 | 1): string | null {
  const i = columns.indexOf(current);
  if (i < 0) return null;
  return columns[i + dir] ?? null;
}

/** How far to scroll this tick while a card is held near an edge: 0 in the middle, up to `speed` at the edge, negative towards the start. */
export function edgeScroll(pos: number, min: number, max: number, zone: number, speed: number): number {
  if (max - min < zone * 2) return 0;
  if (pos < min + zone) return -Math.min(1, (min + zone - pos) / zone) * speed;
  if (pos > max - zone) return Math.min(1, (pos - (max - zone)) / zone) * speed;
  return 0;
}

// ───────────────────────────── editing the columns ─────────────────────────────

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The columns with one renamed, or why not: a name may not be empty, and may not be another column's. */
export function renamed(columns: string[], index: number, name: string): { columns: string[] } | { error: string } {
  const next = name.trim();
  if (!next) return { error: 'A column needs a name.' };
  if (columns.some((c, i) => i !== index && same(c, next))) return { error: 'Another column has that name.' };
  return { columns: columns.map((c, i) => (i === index ? next : c)) };
}

/** "New column", or "New column 2" and on when that is taken. */
export function freshName(columns: string[]): string {
  let n = 1;
  let name = NEW_COLUMN;
  while (columns.some((c) => same(c, name))) name = `${NEW_COLUMN} ${++n}`;
  return name;
}

/** A column added after `index` (null when the board is full). */
export function addedAfter(columns: string[], index: number): { columns: string[]; name: string } | null {
  if (columns.length >= MAX_COLUMNS) return null;
  const name = freshName(columns);
  return { columns: [...columns.slice(0, index + 1), name, ...columns.slice(index + 1)], name };
}

/** A column one place left (-1) or right (1); the same list at an edge. */
export function movedColumn(columns: string[], index: number, dir: -1 | 1): string[] {
  const to = index + dir;
  if (to < 0 || to >= columns.length) return columns;
  const next = [...columns];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

/** The columns without one (the board keeps at least two). */
export function removedColumn(columns: string[], index: number): string[] {
  return columns.length <= MIN_COLUMNS ? columns : columns.filter((_, i) => i !== index);
}
