// Ops: every change to a document, by a person or an agent, is one of these
// s-expressions applied by a pure function.
//
//   ["split", cell, "row"|"col", {before?, ratio?, cell?}]   divide a cell
//   ["merge", a, b, …]                                       fuse neighbours (or a whole group)
//   ["remove", cell]                                         delete; neighbours take the space
//   ["dup", cell]                                            copy after itself
//   ["swap", a, b]                                           exchange two cells
//   ["move", cell, ref, "before"|"after"]                    re-place next to another cell
//   ["put", cell, notation]                                  new content, same identity
//   ["replace", cell, notation]                              swap the whole subtree
//   ["set", cell, "path.to.prop", value]                     one property (null removes it)
//   ["style", cell, {bg: …}]                                 several style properties
//   ["meta", key, value]                                     document settings
//   ["do", op, op, …]                                        all or nothing
//
// `cell` is an id or a name. Applying returns the op with every new id filled
// in (so replaying it is deterministic) and the op that undoes it.

import { type Cell, type Doc, type Json, type Op, type Sx, isGroup } from './types';
import {
  cloneTree, indexTree, isPlain, leaves, normalize, pathTo, resolve, rewrite, round4, validSize, weight, withSize,
} from './tree';
import { type BuildCtx, NotationError, SETTABLE, build, checkName, checkStyle, toNotation } from './notation';
import { mapTemplate } from './sx';

export class OpError extends Error {}

export interface Applied {
  doc: Doc;
  op: Op;
  inverse: Op;
  touched: string[];
}

interface Work {
  root: Cell;
  ctx: BuildCtx;
  next: () => number;
}

interface Result {
  root: Cell;
  op: Op;
  touched: string[];
  inverse?: Op;
  /** Without an exact inverse: undo by restoring the nearest surviving ancestor among these (deepest first). */
  anchors?: Cell[];
}

const isObject = (v: unknown): v is Record<string, Json> => typeof v === 'object' && v !== null && !Array.isArray(v);

function must(root: Cell, ref: Json, what = 'cell'): Cell {
  if (typeof ref !== 'string') throw new OpError(`expected a ${what} id or name, got ${JSON.stringify(ref)}`);
  const c = resolve(root, ref);
  if (!c) throw new OpError(`no cell called "${ref}"`);
  return c;
}

const parentOf = (root: Cell, id: string) => indexTree(root).parent.get(id) ?? null;
const ancestors = (root: Cell, id: string) => (pathTo(root, id) ?? []).slice(0, -1).reverse();

function swapRoot(r: Cell | Cell[] | null): Cell {
  if (r == null || Array.isArray(r)) throw new OpError('that would leave the document without a root');
  return r;
}

const sumSize = (cells: Cell[]) => {
  const w = cells.map(weight).filter((x): x is number => x != null);
  return w.length ? round4(w.reduce((a, b) => a + b, 0)) : cells[0].size;
};

// ───────────────────────────── structure ─────────────────────────────

function split(w: Work, op: Op): Result {
  const target = must(w.root, op[1]);
  const dir = op[2];
  if (dir !== 'row' && dir !== 'col') throw new OpError('split direction is "row" (side by side) or "col" (stacked)');
  const opts = isObject(op[3]) ? op[3] : {};
  const before = opts.before === true;
  const ratio = typeof opts.ratio === 'number' ? Math.min(0.95, Math.max(0.05, opts.ratio)) : 0.5;

  let fresh: Cell;
  if (opts.cell != null) fresh = build(opts.cell, w.ctx);
  else if (opts.id != null) fresh = build(['empty', { id: opts.id }], w.ctx);
  else fresh = { id: w.ctx.gen(), kind: 'empty' };

  const parent = parentOf(w.root, target.id);
  const out: Record<string, Json> = { ...(before ? { before: true } : {}), ...(ratio !== 0.5 ? { ratio } : {}), cell: toNotation(fresh) };
  let root: Cell;
  if (parent && parent.kind === dir) {
    const tw = weight(target);
    const [a, b] = before ? [1 - ratio, ratio] : [ratio, 1 - ratio];
    const kept = tw == null ? target : withSize(target, round4(tw * a));
    const added = tw == null ? withSize(fresh, target.size) : withSize(fresh, round4(tw * b));
    root = swapRoot(rewrite(w.root, parent.id, (p) => ({
      ...p,
      children: p.children!.flatMap((ch) => (ch.id === target.id ? (before ? [added, kept] : [kept, added]) : [ch])),
    })));
  } else {
    let gid: string;
    if (opts.group != null) {
      gid = String(opts.group);
      if (w.ctx.used.has(gid)) throw new OpError(`id ${gid} is already taken`);
      w.ctx.used.add(gid);
    } else gid = w.ctx.gen();
    out.group = gid;
    const first = withSize(before ? fresh : target, round4(ratio * 2));
    const second = withSize(before ? target : fresh, round4((1 - ratio) * 2));
    const group = withSize({ id: gid, kind: dir, children: [first, second] }, target.size);
    root = swapRoot(rewrite(w.root, target.id, () => group));
  }
  return { root, op: ['split', target.id, dir, out], touched: [target.id, fresh.id], anchors: ancestors(w.root, target.id) };
}

/** What the fused cell holds: the first cell with content, or all the text joined. */
function fuse(cells: Cell[]): Cell {
  const full = cells.filter((c) => c.kind !== 'empty');
  if (!full.length) return withSize(cells[0], undefined);
  const base = withSize(full[0], undefined);
  if (full.length > 1 && full.every((c) => c.kind === 'text')) return { ...base, text: full.map((c) => c.text ?? '').join('\n\n') };
  return base;
}

function merge(w: Work, op: Op): Result {
  const refs = (Array.isArray(op[1]) ? op[1] : op.slice(1)) as Json[];
  const cells = refs.map((r) => must(w.root, r));
  const picked = cells.flatMap((c) => leaves(c));
  const sel = new Set(picked.map((c) => c.id));
  if (sel.size < 2) throw new OpError('merge needs at least two cells');

  const paths = cells.map((c) => pathTo(w.root, c.id)!);
  let depth = 0;
  while (paths.every((p) => p[depth] && p[depth] === paths[0][depth])) depth++;
  let lca = paths[0][depth - 1];
  if (!isGroup(lca)) lca = paths[0][depth - 2];

  const inOrder = leaves(w.root).filter((c) => sel.has(c.id));
  const merged = fuse(inOrder);
  const cover = (c: Cell) => {
    const ls = leaves(c);
    const n = ls.filter((l) => sel.has(l.id)).length;
    return n === 0 ? 'none' : n === ls.length ? 'full' : 'part';
  };
  const kids = lca.children!;
  const state = kids.map(cover);
  const first = state.findIndex((s) => s !== 'none');
  const last = state.findLastIndex((s) => s !== 'none');
  if (state.slice(first, last + 1).includes('none')) throw new OpError('those cells are not next to each other');

  let next: Cell;
  if (!state.includes('part')) {
    next = first === 0 && last === kids.length - 1
      ? withSize(merged, lca.size)
      : { ...lca, children: [...kids.slice(0, first), withSize(merged, sumSize(kids.slice(first, last + 1))), ...kids.slice(last + 1)] };
  } else {
    // The selection crosses several rows of a grid: rebuild that band so the
    // merged block spans them.
    const band = kids.slice(first, last + 1);
    const cross = lca.kind === 'row' ? 'col' : 'row';
    const n = band[0].children?.length ?? 0;
    const fractions = (g: Cell) => {
      const ws = g.children!.map(weight);
      const total = ws.reduce((a: number, b) => a + (b ?? 0), 0);
      return ws.map((x) => (x == null ? NaN : x / total));
    };
    const ref = band[0].children ? fractions(band[0]) : [];
    const aligned = band.every(
      (g) => g.kind === cross && isPlain(g) && g.children!.length === n && fractions(g).every((f, j) => Math.abs(f - ref[j]) < 0.02),
    );
    if (!aligned) throw new OpError("those cells don't form a rectangle");
    const colState = ref.map((_, j) => {
      const states = band.map((g) => cover(g.children![j]));
      if (states.every((s) => s === 'full')) return 'full';
      if (states.every((s) => s === 'none')) return 'none';
      throw new OpError("those cells don't form a rectangle");
    });
    const c0 = colState.indexOf('full');
    const c1 = colState.lastIndexOf('full');
    if (colState.slice(c0, c1 + 1).includes('none')) throw new OpError("those cells don't form a rectangle");
    const columns: Cell[] = [];
    for (let j = 0; j < n; j++) {
      if (j === c0) columns.push(withSize(merged, sumSize(band[0].children!.slice(c0, c1 + 1))));
      if (j >= c0 && j <= c1) continue;
      columns.push(withSize(
        { id: w.ctx.gen(), kind: lca.kind, children: band.map((g) => withSize(g.children![j], g.size)) },
        band[0].children![j].size,
      ));
    }
    const bandCell = withSize({ id: band[0].id, kind: cross, children: columns }, sumSize(band));
    next = { ...lca, children: [...kids.slice(0, first), bandCell, ...kids.slice(last + 1)] };
  }
  const root = swapRoot(rewrite(w.root, lca.id, () => next));
  return { root, op: ['merge', ...inOrder.map((c) => c.id)], touched: [merged.id], anchors: [lca, ...ancestors(w.root, lca.id)] };
}

/** Take a cell out of its parent, handing its share of space to a neighbour. */
function detach(root: Cell, target: Cell): Cell {
  const parent = parentOf(root, target.id);
  if (!parent) return { id: target.id, kind: 'empty' };
  const kids = parent.children!;
  const i = kids.indexOf(target);
  const tw = weight(target);
  const heir = tw == null ? -1 : i > 0 && weight(kids[i - 1]) != null ? i - 1 : i + 1 < kids.length && weight(kids[i + 1]) != null ? i + 1 : -1;
  const next = kids.flatMap((ch, j) => (j === i ? [] : j === heir ? [withSize(ch, round4(weight(ch)! + tw!))] : [ch]));
  return swapRoot(rewrite(root, parent.id, (p) => ({ ...p, children: next })));
}

function remove(w: Work, op: Op): Result {
  const target = must(w.root, op[1]);
  const parent = parentOf(w.root, target.id);
  return { root: detach(w.root, target), op: ['remove', target.id], touched: parent ? [parent.id] : [target.id], anchors: ancestors(w.root, target.id) };
}

function dup(w: Work, op: Op): Result {
  const target = must(w.root, op[1]);
  const opts = isObject(op[2]) ? op[2] : {};
  const ids = Array.isArray(opts.ids) ? [...opts.ids].map(String) : null;
  const gen = () => {
    if (!ids) return w.ctx.gen();
    const id = ids.shift();
    if (!id || w.ctx.used.has(id)) throw new OpError(`id ${id} is already taken`);
    w.ctx.used.add(id);
    return id;
  };
  const made: string[] = [];
  const copy = cloneTree(target, () => { const id = gen(); made.push(id); return id; }, w.ctx.names);
  const parent = parentOf(w.root, target.id);
  let root: Cell;
  const out: Record<string, Json> = { ids: made };
  if (parent) {
    root = swapRoot(rewrite(w.root, target.id, (c) => [c, copy]));
  } else {
    const gid = opts.group != null ? String(opts.group) : w.ctx.gen();
    out.group = gid;
    root = { id: gid, kind: 'col', children: [withSize(target, undefined), withSize(copy, undefined)] };
  }
  return { root, op: ['dup', target.id, out], touched: [copy.id], anchors: ancestors(w.root, target.id) };
}

function swap(w: Work, op: Op): Result {
  const a = must(w.root, op[1]);
  const b = must(w.root, op[2]);
  if (a === b) throw new OpError('swap needs two different cells');
  if (pathTo(w.root, a.id)!.includes(b) || pathTo(w.root, b.id)!.includes(a)) throw new OpError("a cell can't swap with one inside it");
  const hole: Cell = { id: '\u0000', kind: 'empty' };
  let root = swapRoot(rewrite(w.root, a.id, () => hole));
  root = swapRoot(rewrite(root, b.id, () => withSize(a, b.size)));
  root = swapRoot(rewrite(root, hole.id, () => withSize(b, a.size)));
  return { root, op: ['swap', a.id, b.id], touched: [a.id, b.id], inverse: ['swap', a.id, b.id] };
}

function move(w: Work, op: Op): Result {
  const target = must(w.root, op[1]);
  const ref = must(w.root, op[2]);
  const where = op[3] ?? 'after';
  if (where !== 'before' && where !== 'after') throw new OpError('move places a cell "before" or "after" another');
  if (pathTo(w.root, ref.id)!.includes(target)) throw new OpError("a cell can't move next to something inside it");
  if (!parentOf(w.root, ref.id)) throw new OpError('nothing can sit beside the root; split it instead');
  const pa = pathTo(w.root, target.id)!;
  const pb = pathTo(w.root, ref.id)!;
  let d = 0;
  while (pa[d] && pa[d] === pb[d]) d++;
  let root = detach(w.root, target);
  const stillRef = resolve(root, ref.id)!;
  const moved = withSize(target, weight(stillRef) == null ? stillRef.size : weight(target) == null ? undefined : target.size);
  root = swapRoot(rewrite(root, ref.id, (c) => (where === 'before' ? [moved, c] : [c, moved])));
  return { root, op: ['move', target.id, ref.id, where], touched: [target.id], anchors: pa.slice(0, d).reverse() };
}

// ───────────────────────────── content ─────────────────────────────

/** Ids and names in use outside the subtree that is about to be replaced. */
function outside(w: Work, target: Cell): void {
  const gone = new Set<string>();
  const goneNames = new Set<string>();
  (function visit(c: Cell) {
    gone.add(c.id);
    if (c.name) goneNames.add(c.name);
    c.children?.forEach(visit);
  })(target);
  for (const id of gone) w.ctx.used.delete(id);
  for (const n of goneNames) w.ctx.names.delete(n);
}

function put(w: Work, op: Op, exact: boolean): Result {
  const target = must(w.root, op[1]);
  if (op[2] == null) throw new OpError(`${op[0]} needs the new cell: ["${op[0]}", cell, [kind, props?, ...body]]`);
  outside(w, target);
  let fresh = build(op[2], exact ? w.ctx : { ...w.ctx, gen: pendingId });
  if (!exact) {
    // Same cell, new content: keep the identity unless the notation overrides it.
    if (fresh.id === PENDING) fresh = { ...fresh, id: target.id };
    w.ctx.used.add(fresh.id);
    fresh = fillIds(fresh, w.ctx);
    if (fresh.size === undefined && target.size !== undefined) fresh = withSize(fresh, target.size);
    if (fresh.name === undefined && target.name && !w.ctx.names.has(target.name)) fresh = { ...fresh, name: target.name };
  }
  const root = swapRoot(rewrite(w.root, target.id, () => fresh));
  return {
    root,
    op: ['replace', target.id, toNotation(fresh)],
    touched: [fresh.id],
    anchors: ancestors(w.root, target.id),
    inverse: ['replace', fresh.id, toNotation(target)],
  };
}

const PENDING = '\u0001';
const pendingId = () => PENDING;
function fillIds(c: Cell, ctx: BuildCtx): Cell {
  const id = c.id === PENDING ? ctx.gen() : c.id;
  const children = c.children?.map((ch) => fillIds(ch, ctx));
  return id === c.id && !children ? c : { ...c, id, ...(children ? { children } : {}) };
}

const PLACE_FORMS = new Set(['set!', 'toggle!', 'dup!', 'remove!', 'ref', 'child']);

function renameSx(x: Sx, from: string, to: string): Sx {
  if (typeof x === 'string') return x === '$' + from ? '$' + to : x;
  if (Array.isArray(x)) {
    if (x[0] === 'quote') return x;
    let changed = false;
    const out = x.map((item, i) => {
      const isPlace = i === 1 && typeof x[0] === 'string' && PLACE_FORMS.has(x[0]) && typeof item === 'string';
      const r = isPlace ? ((item as string).replace(/^\$/, '') === from ? to : item) : renameSx(item, from, to);
      if (r !== item) changed = true;
      return r;
    });
    return changed ? out : x;
  }
  if (isObject(x)) {
    let changed = false;
    const out: Record<string, Sx> = {};
    for (const [k, v] of Object.entries(x)) {
      out[k] = renameSx(v, from, to);
      if (out[k] !== v) changed = true;
    }
    return changed ? out : x;
  }
  return x;
}

const SX_PROPS = ['expr', 'do', 'hidden', 'options', 'min', 'max', 'step', 'style', 'compare', 'trend'] as const;
const TEXT_PROPS = ['text', 'label', 'placeholder', 'src', 'alt'] as const;

/** Point every reference to `from` at `to`, in formulas, actions, styles and templates. */
export function renameRefs(node: Cell, from: string, to: string): Cell {
  let next = node;
  const setProp = (k: string, v: unknown) => {
    if (next === node) next = { ...node };
    (next as unknown as Record<string, unknown>)[k] = v;
  };
  for (const k of SX_PROPS) {
    const v = node[k];
    if (v === undefined) continue;
    const r = renameSx(v as Sx, from, to);
    if (r !== v) setProp(k, r);
  }
  for (const k of TEXT_PROPS) {
    const v = node[k];
    if (typeof v !== 'string' || !v.includes('{{')) continue;
    const r = mapTemplate(v, (x) => renameSx(x, from, to));
    if (r !== v) setProp(k, r);
  }
  if (node.children) {
    const kids = node.children.map((ch) => renameRefs(ch, from, to));
    if (kids.some((k, i) => k !== node.children![i])) setProp('children', kids);
  }
  return next;
}

function setPath(cell: Cell, path: string[], value: Json): Cell {
  const next = { ...cell } as unknown as Record<string, Json>;
  if (path.length === 1) {
    if (value === null) delete next[path[0]];
    else next[path[0]] = value;
    return next as unknown as Cell;
  }
  const [head, key] = path;
  const inner = { ...(isObject(next[head]) ? (next[head] as Record<string, Json>) : {}) };
  if (value === null) delete inner[key];
  else inner[key] = value;
  if (Object.keys(inner).length) next[head] = inner;
  else delete next[head];
  return next as unknown as Cell;
}

function set(w: Work, op: Op): Result {
  const target = must(w.root, op[1]);
  if (typeof op[2] !== 'string') throw new OpError('set needs a property: ["set", cell, "value", 3]');
  const path = op[2].split('.');
  const value = (op[3] ?? null) as Json;
  if (!SETTABLE.has(path[0])) throw new OpError(`"${path[0]}" can't be set; settable: ${[...SETTABLE].join(', ')}. Use put to change the kind.`);
  if (path.length > 2 || (path.length === 2 && path[0] !== 'style')) throw new OpError('only style has nested properties, like "style.bg"');
  const old = path.length === 1
    ? ((target as unknown as Record<string, Json>)[path[0]] ?? null)
    : (target.style?.[path[1]] ?? null);

  let root = w.root;
  if (path[0] === 'name') {
    if (value !== null) {
      if (target.name) w.ctx.names.delete(target.name);
      checkName(value, w.ctx.names, new Set([...w.ctx.used].filter((id) => id !== target.id)));
    }
    const from = target.name ?? target.id;
    const to = (value as string | null) ?? target.id;
    root = renameRefs(root, from, to);
  } else if (path[0] === 'size') {
    if (value !== null && !validSize(value)) throw new OpError('size is a weight like 2, "hug", or a fixed "120px"');
  } else if (path[0] === 'style') {
    if (path.length === 1 && value !== null) checkStyle(value);
    if (path.length === 2) checkStyle({ [path[1]]: value });
  } else if (path[0] === 'text' && value !== null && typeof value !== 'string') {
    throw new OpError('text must be a string');
  }
  const stored = path[0] === 'size' && value === 1 ? null : value;
  root = swapRoot(rewrite(root, target.id, (c) => setPath(c, path, stored)));
  return { root, op: ['set', target.id, op[2], value], touched: [target.id], inverse: ['set', target.id, op[2], old] };
}

function style(w: Work, op: Op): Result {
  const target = must(w.root, op[1]);
  if (!isObject(op[2])) throw new OpError('style needs an object: ["style", cell, {"bg": "accent-soft"}]');
  const patch = checkStyle(op[2]);
  const before: Record<string, Json> = {};
  const next: Record<string, Json> = { ...(target.style ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    before[k] = target.style?.[k] ?? null;
    if (v === null) delete next[k];
    else next[k] = v;
  }
  const root = swapRoot(rewrite(w.root, target.id, (c) => {
    const { style: _s, ...rest } = c;
    return Object.keys(next).length ? { ...rest, style: next } : (rest as Cell);
  }));
  return { root, op: ['style', target.id, patch], touched: [target.id], inverse: ['style', target.id, before] };
}

// ───────────────────────────── apply ─────────────────────────────

function run(w: Work, op: Op): Result {
  switch (op[0]) {
    case 'split': return split(w, op);
    case 'merge': return merge(w, op);
    case 'remove': return remove(w, op);
    case 'dup': return dup(w, op);
    case 'swap': return swap(w, op);
    case 'move': return move(w, op);
    case 'put': return put(w, op, false);
    case 'replace': return put(w, op, true);
    case 'set': return set(w, op);
    case 'name': return set(w, ['set', op[1], 'name', op[2] ?? null]);
    case 'style': return style(w, op);
    default:
      throw new OpError(`unknown op "${op[0]}"; known: split, merge, remove, dup, swap, move, put, replace, set, style, meta, do`);
  }
}

function undoVia(pre: Cell, post: Cell, anchors: Cell[]): Op {
  const idx = indexTree(post);
  for (const a of anchors) if (idx.byId.has(a.id)) return ['replace', a.id, toNotation(a)];
  return ['replace', post.id, toNotation(pre)];
}

function workOn(doc: Doc): Work {
  const idx = indexTree(doc.root);
  const used = new Set(idx.byId.keys());
  let n = doc.nextId;
  const gen = () => {
    let id: string;
    do id = 'c' + n++; while (used.has(id));
    used.add(id);
    return id;
  };
  return { root: doc.root, ctx: { gen, used, names: new Set(idx.byName.keys()) }, next: () => n };
}

/** Apply one op. Throws OpError and leaves the document untouched when it can't. */
export function applyOp(doc: Doc, op: Op): Applied {
  if (!Array.isArray(op) || typeof op[0] !== 'string') throw new OpError('an op is written ["verb", …args]');
  try {
    if (op[0] === 'do') {
      let cur = doc;
      const done: Op[] = [];
      const undo: Op[] = [];
      const touched: string[] = [];
      for (const sub of op.slice(1)) {
        const r = applyOp(cur, sub as Op);
        cur = r.doc;
        done.push(r.op);
        undo.unshift(r.inverse);
        touched.push(...r.touched);
      }
      return { doc: cur, op: ['do', ...done], inverse: ['do', ...undo], touched: [...new Set(touched)] };
    }
    if (op[0] === 'meta') {
      const key = op[1];
      if (typeof key !== 'string') throw new OpError('meta needs a key: ["meta", "title", "Budget"]');
      const value = (op[2] ?? null) as Json;
      const old = (doc.meta[key] ?? null) as Json;
      const meta = { ...doc.meta };
      if (value === null) delete meta[key];
      else meta[key] = value;
      if (typeof meta.title !== 'string') meta.title = 'Untitled';
      return { doc: { ...doc, meta }, op: ['meta', key, value], inverse: ['meta', key, old], touched: [] };
    }
    const w = workOn(doc);
    const r = run(w, op);
    const root = normalize(r.root);
    const live = indexTree(root).byId;
    return {
      doc: { ...doc, root, nextId: w.next() },
      op: r.op,
      inverse: r.inverse && (r.inverse[0] !== 'replace' || live.has(r.inverse[1] as string)) ? r.inverse : undoVia(doc.root, root, r.anchors ?? []),
      touched: r.touched.filter((id) => live.has(id)),
    };
  } catch (e) {
    if (e instanceof NotationError) throw new OpError(e.message);
    throw e;
  }
}

export function applyOps(doc: Doc, ops: Op[]): Applied {
  return applyOp(doc, ops.length === 1 ? ops[0] : ['do', ...ops]);
}
