// Events: what makes a document react. A cell (or the document) holds
// handlers in `on`, event name → an action; when the event happens the action
// runs like a button's `do`, with the event's data bound as variables.
//
//   ["input", {"name": "agree", "type": "checkbox",
//              "on": {"change": ["set!", "status", ["if", "$value", "Agreed", "Not yet"]]}}]
//
// Each kind declares here, in one place, the events it raises and how the ones
// that follow from a change are worked out. The dispatcher (`react`) reads
// only these declarations, so a kind added later joins by adding a line.

import type { Cell, Doc, Op, Sx } from './types';
import { isGroup } from './types';
import { type Computed, type World, evaluate, runAction } from './engine';
import { type Effect, deepEqual } from './sx';
import { applyOps } from './ops';
import { indexTree, walk } from './tree';
import { pickRows } from './table';
import { EVENT_NAME_RE } from './duration';

export { EVENT_NAME_RE, durationMs, sayDuration } from './duration';

export interface EventDecl {
  name: string;
  /** What a handler finds bound, in words. */
  data: string;
  /** Who raises it: a person's gesture, a change of value, the document's life, the runner (timers, fetches). */
  from: 'pointer' | 'change' | 'lifecycle' | 'runner';
}

/** An event worked out by comparing a cell before and after a change. */
export interface Watch {
  /** What is compared; by default the cell's value. */
  read?: (cell: Cell, value: unknown) => unknown;
  /** The events the difference raises, with their data. */
  fire: (was: unknown, now: unknown, cell: Cell, value: unknown) => { name: string; data: Record<string, unknown> }[];
}

export interface KindEvents {
  raises: EventDecl[];
  watch?: Watch[];
}

// ───────────────────────────── declarations ─────────────────────────────

const CLICK: EventDecl = { name: 'click', from: 'pointer', data: 'target: the cell clicked' };
const DBLCLICK: EventDecl = { name: 'dblclick', from: 'pointer', data: 'target: the cell double-clicked' };
const CHANGE: EventDecl = { name: 'change', from: 'change', data: 'value: the new value; was: the value before' };

/** `change` whenever the value differs, by whoever changed it. */
const valueChange: Watch = { fire: (was, now) => [{ name: 'change', data: { value: now, was } }] };

/** The first item that differs between two lists, as {index, item}. */
function changedItem(was: unknown, now: unknown): Record<string, unknown> {
  const a = Array.isArray(was) ? was : [];
  const b = Array.isArray(now) ? now : [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (!deepEqual(a[i], b[i])) return { index: i, item: b[i] ?? a[i] ?? null };
  }
  return { index: null, item: null };
}

const plain = (...extra: EventDecl[]): KindEvents => ({ raises: [CLICK, DBLCLICK, CHANGE, ...extra], watch: [valueChange] });

export const KIND_EVENTS: Record<string, KindEvents> = {
  text: plain(),
  formula: plain(),
  stat: plain(),
  chart: plain(),
  image: plain(),
  icon: plain(),
  input: { raises: [CHANGE, CLICK], watch: [valueChange] },
  button: { raises: [{ ...CLICK, data: 'target: the button (its do runs first)' }] },
  list: {
    raises: [
      { ...CLICK, data: 'item: the item clicked; index: its position (from 0)' },
      { ...DBLCLICK, data: 'item: the item double-clicked; index: its position' },
      { ...CHANGE, data: 'value: the items; was: the items before; item: the item ticked, added or edited; index: its position' },
    ],
    watch: [{ fire: (was, now) => [{ name: 'change', data: { value: now, was, ...changedItem(was, now) } }] }],
  },
  table: {
    raises: [
      { ...CLICK, data: 'row: the row clicked, as a record; index: its key' },
      { ...DBLCLICK, data: 'row: the row double-clicked; index: its key' },
      { name: 'pick', from: 'change', data: 'rows: the picked rows, as records; value: their keys; was: the keys before' },
      CHANGE,
    ],
    watch: [
      valueChange,
      {
        read: (cell) => cell.selected ?? null,
        fire: (was, now, cell, value) => [{ name: 'pick', data: { value: now ?? [], was: was ?? [], rows: pickRows(value, cell.selected) } }],
      },
    ],
  },
  calendar: { raises: [{ ...CHANGE, data: 'value: the day picked ("YYYY-MM-DD", or nil); was: the day before' }, CLICK], watch: [valueChange] },
  canvas: { raises: [{ ...CHANGE, data: 'value: the strokes; was: the strokes before (signed: (not (empty? value)))' }], watch: [valueChange] },
  tabs: { raises: [{ ...CHANGE, data: 'value: the open tab\'s title; was: the one open before' }], watch: [valueChange] },
  accordion: {
    raises: [
      { name: 'open', from: 'change', data: 'title: the section opened; value: the open titles' },
      { name: 'close', from: 'change', data: 'title: the section closed; value: the open titles' },
      { ...CHANGE, data: 'value: the open titles; was: the titles open before' },
    ],
    watch: [
      valueChange,
      {
        fire: (was, now) => {
          const a = Array.isArray(was) ? was : [];
          const b = Array.isArray(now) ? now : [];
          return [
            ...b.filter((t) => !a.includes(t)).map((title) => ({ name: 'open', data: { title, value: now } })),
            ...a.filter((t) => !b.includes(t)).map((title) => ({ name: 'close', data: { title, value: now } })),
          ];
        },
      },
    ],
  },
  collapsible: {
    raises: [
      { name: 'open', from: 'change', data: 'value: true' },
      { name: 'close', from: 'change', data: 'value: false' },
      CHANGE,
    ],
    watch: [valueChange, { fire: (_was, now) => [{ name: now ? 'open' : 'close', data: { value: now } }] }],
  },
  diagram: {
    raises: [
      { ...CLICK, data: 'element: the shape clicked, as a record (nil for the background)' },
      { ...DBLCLICK, data: 'element: the shape double-clicked' },
      CHANGE,
    ],
    watch: [valueChange],
  },
  data: { raises: [CHANGE], watch: [valueChange] },
  timer: {
    raises: [
      { name: 'tick', from: 'runner', data: 'count: how many times it has ticked since it started; at: the time (ms)' },
      { ...CHANGE, data: 'value: true while running, false once stopped' },
    ],
    watch: [valueChange],
  },
  fetch: {
    raises: [
      { name: 'load', from: 'runner', data: 'data: the answer, parsed; value: the same' },
      { name: 'fail', from: 'runner', data: 'message: what went wrong; status: the HTTP status, if there was one' },
      { ...CHANGE, data: 'value: the new answer; was: the one before' },
    ],
    watch: [valueChange],
  },
};

/** The document's own events. Custom events reach it too. */
export const DOC_EVENTS: EventDecl[] = [
  { name: 'open', from: 'lifecycle', data: 'nothing: it runs once each time someone opens the document in Live' },
  { name: 'close', from: 'lifecycle', data: 'nothing: it runs when that person leaves the document (best effort if the tab is closed)' },
];

/** The events a cell can raise, or the document's when `cell` is null. */
export function eventsOf(cell: Cell | null): EventDecl[] {
  if (!cell) return DOC_EVENTS;
  return KIND_EVENTS[cell.kind]?.raises ?? (isGroup(cell) || cell.kind === 'empty' || cell.kind === 'break' ? [] : [CLICK, CHANGE]);
}

/** Names that something built in raises; a custom event can't take one. */
export const BUILTIN_EVENTS = new Set([...Object.values(KIND_EVENTS).flatMap((k) => k.raises.map((e) => e.name)), ...DOC_EVENTS.map((e) => e.name)]);

/** The custom event names a document uses: emitted somewhere or listened for. */
export function customEvents(doc: Doc): string[] {
  const names = new Set<string>();
  const scan = (x: Sx): void => {
    if (Array.isArray(x)) {
      if (x[0] === 'emit!' && typeof x[1] === 'string' && EVENT_NAME_RE.test(x[1])) names.add(x[1]);
      x.forEach(scan);
    } else if (x && typeof x === 'object') Object.values(x).forEach(scan);
  };
  const handlers = (on: unknown) => {
    if (!on || typeof on !== 'object') return;
    for (const [k, v] of Object.entries(on as Record<string, Sx>)) {
      if (!BUILTIN_EVENTS.has(k)) names.add(k);
      scan(v);
    }
  };
  walk(doc.root, (c) => {
    handlers(c.on);
    if (c.do !== undefined) scan(c.do);
    if (c.actions !== undefined) scan(c.actions);
  });
  handlers(doc.meta.on);
  if (doc.meta.actions) scan(doc.meta.actions as Sx);
  return [...names].sort();
}

// ───────────────────────────── dispatching ─────────────────────────────

/** An event on its way: to a cell, or to the document when `cell` is null. */
export interface Fired {
  cell: string | null;
  name: string;
  data?: Record<string, unknown>;
}

/** One handler that ran: what it reacted to and what it changed. */
export interface TraceEntry {
  /** The cell whose handler ran (null: the document's). */
  cell: string | null;
  name: string;
  /** 0 for the event itself, 1 for one its handler caused, … */
  depth: number;
  /** The ops it made, as applied. */
  ops: Op[];
  /** What else it asked for: records saved, events emitted, fetches. */
  effects: Effect[];
  error?: string;
  at: number;
  /** Set when what ran was the cell's own action (a button's do, a row action), not a handler. */
  via?: 'do';
}

export interface Reaction {
  /** The document after every handler. */
  doc: Doc;
  /** The ops the handlers made, in order, as applied (replaying them on the starting document gives `doc`). */
  ops: Op[];
  /** Records, fetches: what the caller has to carry out. Emitted events are already handled. */
  effects: Effect[];
  trace: TraceEntry[];
}

/** How deep one event's consequences may go, and how many handlers one gesture may run. */
export const MAX_DEPTH = 8;
export const MAX_RUNS = 64;

interface Queued {
  ev: Fired;
  /** Run this action instead of the event's listeners: a button's do, a row action. */
  direct?: { action: Sx; vars?: Record<string, unknown> };
  depth: number;
  /** The cells the cascade went through, for the loop guard's message. */
  path: string[];
}

const label = (doc: Doc, id: string | null) => (id === null ? 'document' : indexTree(doc.root).byId.get(id)?.name ?? id ?? '?');

/** The handlers an event reaches: the cell's own; a custom event reaches every cell and the document. */
function listeners(doc: Doc, ev: Fired): { cell: string | null; action: Sx }[] {
  const out: { cell: string | null; action: Sx }[] = [];
  const own = (on: unknown): Sx | undefined => {
    if (!on || typeof on !== 'object' || Array.isArray(on)) return undefined;
    const a = (on as Record<string, Sx>)[ev.name];
    return a === undefined || a === null ? undefined : a;
  };
  if (ev.cell !== null) {
    const cell = indexTree(doc.root).byId.get(ev.cell);
    const a = cell && own(cell.on);
    if (a !== undefined) out.push({ cell: ev.cell, action: a });
    return out;
  }
  if (BUILTIN_EVENTS.has(ev.name)) {
    const a = own(doc.meta.on);
    if (a !== undefined) out.push({ cell: null, action: a });
    return out;
  }
  walk(doc.root, (c) => {
    const a = own(c.on);
    if (a !== undefined) out.push({ cell: c.id, action: a });
  });
  const a = own(doc.meta.on);
  if (a !== undefined) out.push({ cell: null, action: a });
  return out;
}

/** The variables a handler sees: `event`, and each piece of data by name. */
export function bindings(doc: Doc, ev: Fired, listener: string | null): Record<string, unknown> {
  const data = ev.data ?? {};
  const source = ev.cell === null ? null : label(doc, ev.cell);
  return { ...data, target: source, event: { name: ev.name, target: source, ...(listener !== ev.cell ? { listener: label(doc, listener) } : {}), ...data } };
}

/** Whether any cell in the document handles one of the events changes can raise. */
function watched(doc: Doc): boolean {
  let any = false;
  walk(doc.root, (c) => {
    if (any || !c.on || typeof c.on !== 'object') return;
    const decl = KIND_EVENTS[c.kind];
    if (decl?.watch && decl.raises.some((e) => e.from === 'change' && (c.on as Record<string, unknown>)[e.name] != null)) any = true;
  });
  return any;
}

/** The events that follow from the document going from `before` to `after`. */
function changes(before: Doc, after: Doc, value: (d: Doc) => Computed): Fired[] {
  if (!watched(after)) return [];
  const a = value(before);
  const b = value(after);
  const was = indexTree(before.root).byId;
  const out: Fired[] = [];
  walk(after.root, (c) => {
    const decl = KIND_EVENTS[c.kind];
    const old = was.get(c.id);
    if (!decl?.watch || !old || old.kind !== c.kind || !c.on || typeof c.on !== 'object') return;
    const on = c.on as Record<string, unknown>;
    if (!decl.raises.some((e) => e.from === 'change' && on[e.name] != null)) return;
    const v0 = a.cells[old.id]?.value;
    const v1 = b.cells[c.id]?.value;
    for (const w of decl.watch) {
      const x0 = w.read ? w.read(old, v0) : v0;
      const x1 = w.read ? w.read(c, v1) : v1;
      if (deepEqual(x0 ?? null, x1 ?? null)) continue;
      for (const e of w.fire(x0 ?? null, x1 ?? null, c, v1)) if (on[e.name] != null) out.push({ cell: c.id, name: e.name, data: e.data });
    }
  });
  return out;
}

/**
 * Run what a change or an event sets off. Start from `doc` and either ops a
 * person just made (`ops`: they are applied first and their consequences
 * followed) or events (`events`), or both. Every handler sees the document as
 * the handlers before it left it. Stops at MAX_DEPTH or MAX_RUNS with an error
 * in the trace, keeping what already ran.
 */
export interface Start {
  /** Ops a person just made: applied first, then what they change is followed. */
  ops?: Op[];
  /** A cell's own action to run first, as the gesture: a button's do (with `name` "click"), a row action with `row` in vars. */
  run?: { cell: string; name: string; action: Sx; vars?: Record<string, unknown> };
  events?: Fired[];
}

export function react(doc: Doc, world: World, start: Start, now = world.now): Reaction {
  const cache = new Map<Doc, Computed>();
  const value = (d: Doc) => {
    let c = cache.get(d);
    if (!c) cache.set(d, (c = evaluate(d, world)));
    return c;
  };
  let cur = doc;
  const queue: Queued[] = [];
  if (start.ops?.length) {
    cur = applyOps(doc, start.ops).doc;
    for (const ev of changes(doc, cur, value)) queue.push({ ev, depth: 0, path: [label(cur, ev.cell)] });
  }
  if (start.run) {
    const { cell, name, action, vars } = start.run;
    queue.push({ ev: { cell, name }, direct: { action, vars }, depth: 0, path: [label(cur, cell)] });
  }
  for (const ev of start.events ?? []) queue.push({ ev, depth: 0, path: [label(cur, ev.cell)] });

  const ops: Op[] = [];
  const effects: Effect[] = [];
  const trace: TraceEntry[] = [];
  let runs = 0;
  while (queue.length) {
    const { ev, direct, depth, path } = queue.shift()!;
    for (const l of direct ? [{ cell: ev.cell, action: direct.action }] : listeners(cur, ev)) {
      if (depth >= MAX_DEPTH || runs >= MAX_RUNS) {
        trace.push({
          cell: l.cell, name: ev.name, depth, ops: [], effects: [], at: now,
          error: depth >= MAX_DEPTH
            ? `stopped: events went ${MAX_DEPTH} deep (${[...path, label(cur, l.cell)].join(' → ')}); a handler is probably setting off itself`
            : `stopped after ${MAX_RUNS} handlers ran for one event`,
        });
        return { doc: cur, ops, effects, trace };
      }
      runs++;
      const entry: TraceEntry = { cell: l.cell, name: ev.name, depth, ops: [], effects: [], at: now, ...(direct ? { via: 'do' as const } : {}) };
      trace.push(entry);
      let fx: Effect[];
      try {
        // A cell's own action sees only what it always saw (a row action's row), so old documents behave the same.
        fx = runAction(cur, world, l.cell ?? cur.root.id, l.action, direct ? direct.vars : bindings(cur, ev, l.cell));
      } catch (e) {
        entry.error = e instanceof Error ? e.message : String(e);
        continue;
      }
      const made = fx.filter((e): e is Extract<Effect, { type: 'op' }> => e.type === 'op').map((e) => e.op);
      const before = cur;
      if (made.length) {
        try {
          const r = applyOps(cur, made);
          cur = r.doc;
          entry.ops = made.length === 1 ? [r.op] : (r.op.slice(1) as Op[]);
          ops.push(...entry.ops);
        } catch (e) {
          entry.error = e instanceof Error ? e.message : String(e);
          continue;
        }
      }
      const here = label(cur, l.cell);
      const next = path.at(-1) === here ? path : [...path, here];
      for (const e of fx) {
        if (e.type === 'op') continue;
        entry.effects.push(e);
        if (e.type === 'emit') {
          if (BUILTIN_EVENTS.has(e.name)) {
            entry.error = `"${e.name}" is an event the document raises itself; give your event a name of its own`;
            continue;
          }
          const from = l.cell === null ? null : label(cur, l.cell);
          queue.push({ ev: { cell: null, name: e.name, data: { payload: e.data as unknown, from } }, depth: depth + 1, path: next });
        } else effects.push(e);
      }
      if (cur !== before) for (const c of changes(before, cur, value)) queue.push({ ev: c, depth: depth + 1, path: next });
    }
  }
  return { doc: cur, ops, effects, trace };
}

/** Sample data for firing an event by hand, so a handler can be tried. */
export function sampleData(doc: Doc, world: World, cell: Cell | null, name: string): Record<string, unknown> {
  if (!cell) return {};
  const v = evaluate(doc, world).cells[cell.id]?.value ?? null;
  switch (name) {
    case 'change': {
      const extra = cell.kind === 'list' && Array.isArray(v) && v.length ? { item: v[0], index: 0 } : {};
      return { value: v, was: v, ...extra };
    }
    case 'click':
    case 'dblclick':
      if (cell.kind === 'table') {
        const rows = Array.isArray(v) ? v : [];
        return { row: rows[0] ?? null, index: rows.length ? 0 : null };
      }
      if (cell.kind === 'list') return { item: Array.isArray(v) ? v[0] ?? null : null, index: 0 };
      if (cell.kind === 'diagram') return { element: Array.isArray(v) ? v.find((e) => (e as { type?: string }).type !== 'arrow') ?? null : null };
      return {};
    case 'pick': return { value: cell.selected ?? [], was: [], rows: pickRows(v, cell.selected) };
    case 'tick': return { count: 1, at: world.now };
    case 'load': return { data: v, value: v };
    case 'fail': return { message: 'a test failure', status: 500 };
    case 'open':
    case 'close':
      if (cell.kind === 'accordion') return { title: Array.isArray(v) ? v[0] ?? null : null, value: v };
      return { value: name === 'open' };
    default: return { payload: null, from: null };
  }
}

/** Effects other than ops, as words for a trace line. */
export function sayEffect(e: Effect, name: (id: string) => string = (id) => id): string {
  switch (e.type) {
    case 'insert': return `saved a record to "${e.collection}"`;
    case 'update': return `changed record ${e.id} in "${e.collection}"`;
    case 'delete': return `deleted record ${e.id} from "${e.collection}"`;
    case 'clear': return `emptied "${e.collection}"`;
    case 'emit': return `emitted "${e.name}"`;
    case 'refresh': return `asked ${name(e.cell)} to fetch again`;
    case 'op': return String(e.op[0]);
  }
}

/** A cell's event as the web raised it before handlers existed; kept for what still reads `session.raised`. */
export interface Raised {
  cell: string;
  name: string;
  data: Record<string, unknown>;
}
