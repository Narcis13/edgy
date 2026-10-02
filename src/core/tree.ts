// Reading and rewriting the cell tree. Cells are never mutated: a change
// copies the path from the root to the changed cell and shares the rest.

import { type Cell, type Size, flowOf, isGroup } from './types';

export function walk(cell: Cell, fn: (c: Cell, parent: Cell | null, index: number) => void, parent: Cell | null = null, index = 0): void {
  fn(cell, parent, index);
  cell.children?.forEach((ch, i) => walk(ch, fn, cell, i));
}

export function leaves(cell: Cell, out: Cell[] = []): Cell[] {
  if (isGroup(cell)) cell.children!.forEach((ch) => leaves(ch, out));
  else out.push(cell);
  return out;
}

export interface Index {
  byId: Map<string, Cell>;
  byName: Map<string, Cell>;
  parent: Map<string, Cell | null>;
  pos: Map<string, number>;
}

const indexCache = new WeakMap<Cell, Index>();

export function indexTree(root: Cell): Index {
  let idx = indexCache.get(root);
  if (idx) return idx;
  idx = { byId: new Map(), byName: new Map(), parent: new Map(), pos: new Map() };
  walk(root, (c, parent, i) => {
    idx!.byId.set(c.id, c);
    if (c.name) idx!.byName.set(c.name, c);
    idx!.parent.set(c.id, parent);
    idx!.pos.set(c.id, i);
  });
  indexCache.set(root, idx);
  return idx;
}

/** Find a cell by id, or by the name people gave it. */
export function resolve(root: Cell, ref: string): Cell | undefined {
  const idx = indexTree(root);
  const key = ref.startsWith('$') ? ref.slice(1) : ref;
  return idx.byName.get(key) ?? idx.byId.get(key);
}

/** The cells from the root down to `id`, inclusive. */
export function pathTo(root: Cell, id: string): Cell[] | null {
  const idx = indexTree(root);
  let c = idx.byId.get(id);
  if (!c) return null;
  const path: Cell[] = [];
  for (; c; c = idx.parent.get(c.id) ?? undefined) path.unshift(c);
  return path;
}

/** Replace the cell `id` with whatever `fn` returns: a cell, several siblings, or nothing. */
export function rewrite(node: Cell, id: string, fn: (c: Cell) => Cell | Cell[] | null): Cell | Cell[] | null {
  if (node.id === id) return fn(node);
  if (!node.children) return node;
  let changed = false;
  const out: Cell[] = [];
  for (const ch of node.children) {
    const r = rewrite(ch, id, fn);
    if (r !== ch) changed = true;
    if (r == null) continue;
    if (Array.isArray(r)) out.push(...r);
    else out.push(r);
  }
  return changed ? { ...node, children: out } : node;
}

/** The weight of a cell that shares free space, or null when it hugs or is fixed. */
export const weight = (c: Cell): number | null => (c.size == null ? 1 : typeof c.size === 'number' ? c.size : null);

export const round4 = (n: number) => Math.round(n * 10000) / 10000;

export function withSize(c: Cell, size: Size | undefined): Cell {
  const { size: _old, ...rest } = c;
  return size == null || size === 1 ? (rest as Cell) : ({ ...rest, size } as Cell);
}

export function validSize(s: unknown): s is Size {
  return (typeof s === 'number' && s > 0 && Number.isFinite(s)) || s === 'hug' || (typeof s === 'string' && /^\d+(\.\d+)?px$/.test(s));
}

/**
 * A row or col nobody has named or styled is only structure, so it can be
 * dissolved. Tabs, accordions, collapsibles and panels never are: they are
 * what the person made, even with a single cell inside.
 */
export const isPlain = (c: Cell) => (c.kind === 'row' || c.kind === 'col') && !c.name && !c.style && c.hidden == null;

/**
 * Keep the tree tidy: a row or col with no children becomes an empty cell, a
 * plain one with a single child is replaced by it, and a plain group inside a
 * group that lays out the same way (a col in a col, panel or collapsible)
 * dissolves into it.
 */
export function normalize(node: Cell): Cell {
  if (!isGroup(node)) return node;
  // Panels are shown whole, one at a time or folded, so a size means nothing on them.
  const kids = node.children!.map((ch) => (ch.kind === 'panel' && ch.size !== undefined ? withSize(normalize(ch), undefined) : normalize(ch)));
  let changed = kids.some((k, i) => k !== node.children![i]);
  const flow = flowOf(node);
  const flat: Cell[] = [];
  for (const k of kids) {
    if (flow && k.kind === flow && isPlain(k)) {
      changed = true;
      const outer = k.size ?? 1;
      const total = k.children!.reduce((s, c) => s + (weight(c) ?? 0), 0) || 1;
      for (const c of k.children!) {
        const w = weight(c);
        if (w == null) flat.push(c);
        else if (typeof outer === 'number') flat.push(withSize(c, round4((outer * w) / total)));
        else flat.push(withSize(c, 'hug'));
      }
    } else flat.push(k);
  }
  if (!flat.length && (node.kind === 'row' || node.kind === 'col')) {
    const empty: Cell = { id: node.id, kind: 'empty' };
    if (node.name) empty.name = node.name;
    return withSize(empty, node.size);
  }
  if (flat.length === 1 && isPlain(node)) return withSize(flat[0], node.size);
  return changed ? { ...node, children: flat } : node;
}

export const isEmptyLeaf = (c: Cell) => c.kind === 'empty';

/** Copy a subtree with fresh ids and names that stay unique. */
export function cloneTree(cell: Cell, gen: () => string, names: Set<string>): Cell {
  const copy: Cell = { ...cell, id: gen() };
  if (copy.name) {
    const base = copy.name.replace(/\d+$/, '') || copy.name;
    let n = 2;
    while (names.has(base + n)) n++;
    copy.name = base + n;
    names.add(copy.name);
  }
  if (cell.children) copy.children = cell.children.map((ch) => cloneTree(ch, gen, names));
  return copy;
}
