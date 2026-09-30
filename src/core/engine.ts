// The living part: work out every cell's value, resolved style and visibility,
// and remember which cells each one reads so links can be drawn.

import type { Cell, Doc, Sx } from './types';
import { isGroup } from './types';
import { type Index, indexTree, walk } from './tree';
import { type Effect, type Host, Interp, SxError, deepEqual, formatValue, hasTemplate, parseTemplate, truthy } from './sx';

export interface CellState {
  value: unknown;
  error?: string;
  style?: Record<string, unknown>;
  hidden?: boolean;
  /** Resolved label, placeholder, src, alt, options, min, max, step. */
  props?: Record<string, unknown>;
  /** Ids of the cells this one reads. */
  reads?: string[];
}

export interface Computed {
  cells: Record<string, CellState>;
  /** For each cell, the cells that read it. */
  feeds: Record<string, string[]>;
  usesNow: boolean;
  collections: string[];
}

/** Everything outside the document a formula can see. */
export interface World {
  rows(collection: string): unknown[];
  now: number;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const isExpr = (v: unknown): v is Sx => Array.isArray(v) || (typeof v === 'string' && v.startsWith('$'));

class Evaluator {
  readonly idx: Index;
  private memo = new Map<string, { v: unknown } | { e: string }>();
  private computing: string[] = [];
  private context: Cell[] = [];
  readonly reads = new Map<string, Set<string>>();
  readonly collections = new Set<string>();
  usesNow = false;
  effects: Effect[] | null = null;
  private host: Host;

  constructor(private doc: Doc, private world: World) {
    this.idx = indexTree(doc.root);
    const self = this;
    this.host = {
      currency: typeof doc.meta.currency === 'string' ? doc.meta.currency : 'USD',
      ref: (name) => self.read(self.find(name)),
      sib: (i) => {
        const me = self.current();
        const kids = self.idx.parent.get(me.id)?.children;
        if (!kids) throw new SxError('sib needs a cell that sits in a row or column');
        const target = kids[i < 0 ? kids.length + i : i];
        if (!target) throw new SxError(`there is no sibling ${i}`);
        return self.read(target);
      },
      idx: () => self.idx.pos.get(self.current().id) ?? 0,
      child: (name, i) => {
        const kids = self.find(name).children ?? [];
        const target = kids[i < 0 ? kids.length + i : i];
        if (!target) throw new SxError(`"${name}" has no cell ${i}`);
        return target.id;
      },
      rows: (name) => {
        self.collections.add(name);
        return self.world.rows(name);
      },
      now: () => {
        self.usesNow = true;
        return self.world.now;
      },
      place: (name) => {
        const cell = self.find(name);
        let value: unknown = null;
        try { value = self.valueOf(cell); } catch { /* an unreadable target can still be set */ }
        return { id: cell.id, value };
      },
      effect: (e) => {
        if (!self.effects) throw new SxError('this only works in an action, such as a button');
        self.effects.push(e);
      },
    };
  }

  private current(): Cell {
    const c = this.context.at(-1);
    if (!c) throw new SxError('no cell in context');
    return c;
  }

  private find(name: string): Cell {
    const cell = this.idx.byName.get(name) ?? this.idx.byId.get(name);
    if (!cell) throw new SxError(`no cell called "${name}"`);
    return cell;
  }

  private read(cell: Cell): unknown {
    const me = this.context.at(-1);
    if (me && me.id !== cell.id) {
      let set = this.reads.get(me.id);
      if (!set) this.reads.set(me.id, (set = new Set()));
      set.add(cell.id);
    }
    try {
      return this.valueOf(cell);
    } catch (e) {
      const m = message(e);
      throw new SxError(m.startsWith('circular') || m.includes(': ') ? m : `${cell.name ?? cell.id}: ${m}`);
    }
  }

  /** Evaluate an expression as if written in `cell`. */
  evalIn(cell: Cell, x: Sx): unknown {
    this.context.push(cell);
    try {
      const I = new Interp(this.effects ? this.host : { ...this.host, effect: undefined, place: undefined });
      return I.run(x);
    } finally {
      this.context.pop();
    }
  }

  template(cell: Cell, text: string): string {
    if (!hasTemplate(text)) return text;
    return parseTemplate(text)
      .map((p) => {
        if (p.text !== undefined) return p.text;
        if (p.error) throw new SxError(p.error);
        if (p.format === 'ago') this.usesNow = true;
        return formatValue(this.evalIn(cell, p.expr!), p.format, this.host.currency, this.world.now);
      })
      .join('');
  }

  valueOf(cell: Cell): unknown {
    const hit = this.memo.get(cell.id);
    if (hit) {
      if ('e' in hit) throw new SxError(hit.e);
      return hit.v;
    }
    if (this.computing.includes(cell.id)) {
      const loop = [...this.computing.slice(this.computing.indexOf(cell.id)), cell.id];
      throw new SxError('circular reference: ' + loop.map((id) => this.idx.byId.get(id)?.name ?? id).join(' → '));
    }
    this.computing.push(cell.id);
    try {
      const v = this.compute(cell);
      this.memo.set(cell.id, { v });
      return v;
    } catch (e) {
      this.memo.set(cell.id, { e: message(e) });
      throw e;
    } finally {
      this.computing.pop();
    }
  }

  private compute(cell: Cell): unknown {
    if (isGroup(cell)) return cell.children!.map((ch) => this.valueOf(ch));
    switch (cell.kind) {
      case 'text': return this.template(cell, cell.text ?? '');
      case 'formula':
      case 'chart':
      case 'table': return cell.expr === undefined ? null : this.evalIn(cell, cell.expr);
      case 'input': {
        const v = cell.value ?? null;
        const t = cell.type ?? 'text';
        if (t === 'number' || t === 'slider' || t === 'rating') return v === null || v === '' ? null : Number(v);
        if (t === 'checkbox' || t === 'toggle') return truthy(v);
        return v ?? '';
      }
      case 'image': return cell.src ? this.template(cell, cell.src) : null;
      case 'icon': return cell.icon ?? null;
      case 'button': return cell.label ?? null;
      default: return null;
    }
  }

  state(cell: Cell): CellState {
    const st: CellState = { value: null };
    const guard = (fn: () => void) => {
      try { fn(); } catch (e) { st.error ??= message(e); }
    };
    guard(() => { st.value = this.valueOf(cell); });
    if (cell.style) {
      const style: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(cell.style)) {
        if (isExpr(v)) guard(() => { style[k] = this.evalIn(cell, v); });
        else style[k] = v;
      }
      st.style = style;
    }
    if (cell.hidden != null && cell.hidden !== false) {
      if (isExpr(cell.hidden)) guard(() => { st.hidden = truthy(this.evalIn(cell, cell.hidden!)); });
      else st.hidden = truthy(cell.hidden);
    }
    const props: Record<string, unknown> = {};
    for (const k of ['label', 'placeholder', 'src', 'alt'] as const) {
      const v = cell[k];
      if (typeof v === 'string' && hasTemplate(v)) guard(() => { props[k] = this.template(cell, v); });
    }
    for (const k of ['options', 'min', 'max', 'step'] as const) {
      const v = cell[k];
      if (isExpr(v)) guard(() => { props[k] = this.evalIn(cell, v); });
    }
    if (Object.keys(props).length) st.props = props;
    const reads = this.reads.get(cell.id);
    if (reads?.size) st.reads = [...reads];
    return st;
  }
}

/** Evaluate the whole document. Pass the previous result to keep unchanged cells identical. */
export function evaluate(doc: Doc, world: World, prev?: Computed): Computed {
  const E = new Evaluator(doc, world);
  const cells: Record<string, CellState> = {};
  walk(doc.root, (cell) => { cells[cell.id] = E.state(cell); });
  const feeds: Record<string, string[]> = {};
  for (const [id, st] of Object.entries(cells)) {
    for (const r of st.reads ?? []) (feeds[r] ??= []).push(id);
    const before = prev?.cells[id];
    if (before && deepEqual(before, st)) cells[id] = before;
  }
  return { cells, feeds, usesNow: E.usesNow, collections: [...E.collections].sort() };
}

/** Run a button's action and collect what it wants done. Reads see the document as it was. */
export function runAction(doc: Doc, world: World, cellId: string, action: Sx): Effect[] {
  const E = new Evaluator(doc, world);
  const cell = E.idx.byId.get(cellId);
  if (!cell) throw new SxError(`no cell ${cellId}`);
  E.effects = [];
  E.evalIn(cell, action);
  return E.effects;
}

/** Evaluate one expression against the document, for previews and the agent's REPL. */
export function evalIn(doc: Doc, world: World, expr: Sx, cellId?: string): { value?: unknown; error?: string } {
  const E = new Evaluator(doc, world);
  const cell = (cellId && E.idx.byId.get(cellId)) || doc.root;
  try {
    return { value: E.evalIn(cell, expr) };
  } catch (e) {
    return { error: message(e) };
  }
}

/** What a cell shows for its value. */
export function display(cell: Cell, st: CellState | undefined, doc: Doc, now = Date.now()): string {
  if (!st) return '';
  if (st.error) return '';
  return formatValue(st.value, cell.format, typeof doc.meta.currency === 'string' ? doc.meta.currency : 'USD', now);
}

/** Values safe to send as JSON: functions and other oddities become text. */
export function plainValue(v: unknown): unknown {
  if (typeof v === 'function') return 'ƒ';
  if (Array.isArray(v)) return v.map(plainValue);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plainValue(x)]));
  if (typeof v === 'number' && !Number.isFinite(v)) return String(v);
  return v ?? null;
}
