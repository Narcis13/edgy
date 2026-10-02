// Natural language to code. A person describes what a cell should compute or
// do; one of three providers writes the expression and it is checked against
// the document before anyone sees it:
//
//   claude   the Anthropic API, when ANTHROPIC_API_KEY is set
//   agent    a live agent listening on the document (edgy_listen / edgy_answer)
//   local    a built-in composer that knows common beginner phrasings
//
// Most targets are one expression. Three are about events: `on.<event>` (one
// handler), `action` (a custom action's (fn …)) and `events` (a whole sentence,
// answered with ops: handlers, custom events and actions, timers, fetch intervals).

import type { Cell, Doc, Json, Op, Sx } from '../core/types';
import { NAME_RE, isGroup } from '../core/types';
import { type Computed, type World, actionProblems, customAction, evalIn, evaluate, plainValue } from '../core/engine';
import { panelTitles } from '../core/containers';
import { BUILTIN_EVENTS, EVENT_NAME_RE, customEvents, durationMs, eventsOf } from '../core/events';
import { FUNCTIONS } from '../core/reference';
import { toNotation } from '../core/notation';
import { applyOps } from '../core/ops';
import { outline } from '../core/outline';
import { SxError, deepEqual, formatValue, isBuiltin, print, read } from '../core/sx';
import { type Index, indexTree, resolve, walk } from '../core/tree';

export const TARGETS = ['expr', 'do', 'hidden', 'style', 'options', 'compare', 'trend', 'action', 'events'] as const;
/** A target above, or `on.<event>`: one handler of the cell (or of the document). */
export type Target = (typeof TARGETS)[number] | `on.${string}`;
export type Provider = 'claude' | 'agent' | 'local';

export const isTarget = (t: unknown): t is Target =>
  typeof t === 'string' && ((TARGETS as readonly string[]).includes(t) || (t.startsWith('on.') && EVENT_NAME_RE.test(t.slice(3))));
/** The event an `on.<event>` target is for, or null. */
export const eventOf = (t: Target): string | null => (t.startsWith('on.') ? t.slice(3) : null);
/** Targets whose code is an action: actions are allowed and nothing is previewed. */
const acts = (t: Target) => t === 'do' || t === 'action' || t === 'events' || t.startsWith('on.');

/** One thing an `events` answer writes: a handler, an action or a cell, in plain words and Lisp. */
export interface Change {
  cell: string | null;
  label: string;
  code: string;
}

export interface Ask {
  prompt: string;
  cell?: string;
  target: Target;
  current: string;
}

/** What a provider hands back before it is checked. */
export interface Answer {
  /** The expression; null for an `events` answer, which is ops. */
  expr: Sx;
  explanation?: string;
  ops?: Op[];
  changes?: Change[];
}

export interface Composed {
  code: string;
  expr: Sx;
  explanation: string;
  preview?: { value?: Json; display?: string; error?: string };
  provider: Provider;
  notes?: string[];
  /** `events` only: the ops to apply, already checked against the document. */
  ops?: Op[];
  changes?: Change[];
}

export class ComposeError extends Error {
  constructor(message: string, readonly suggestions?: string[]) {
    super(message);
  }
}

/** A compose request waiting for an agent, as the agent sees it. */
export interface AgentRequest {
  id: string;
  prompt: string;
  cell?: string;
  cellName?: string;
  target: Target;
  current?: string;
  ts: number;
}

// ───────────────────────────── context ─────────────────────────────

/** Everything a provider needs to know about the document, worked out once per request. */
export interface Ctx {
  doc: Doc;
  world: World;
  computed: Computed;
  idx: Index;
  cell?: Cell;
  target: Target;
  current: string;
  /** What "it" means in a prompt: the cell itself, or the code being edited. */
  it?: Sx;
  /** Cells by a forgiving key: name, id, input label or collapsible heading, lowercased without spaces, - or _. */
  names: Map<string, Cell>;
  /** Collection name → the fields its records use. */
  collections: Map<string, string[]>;
}

const canon = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, '');
const ref = (c: Cell): string => '$' + (c.name ?? c.id);
const lit = (s: string): Sx => (s.startsWith('$') ? ['quote', s] : s);
/** A row or col: the groups that hold lines of a form; tabs, sections and panels are not lines. */
const isLines = (c: Cell): boolean => c.kind === 'row' || c.kind === 'col';
const num = (s: string): number | null => (/^-?\d+(?:\.\d+)?$/.test(s) ? Number(s) : null);
const tidy = (n: number) => Number(n.toPrecision(12));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const listed = (xs: string[], and = 'and') => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${and} ${xs.at(-1)}`);

export function context(doc: Doc, world: World, collections: string[], ask: Partial<Ask> = {}): Ctx {
  const computed = evaluate(doc, world);
  const idx = indexTree(doc.root);
  const cell = ask.cell ? idx.byId.get(ask.cell) ?? idx.byName.get(ask.cell) : undefined;
  const names = new Map<string, Cell>();
  walk(doc.root, (c) => { if (c.name) names.set(canon(c.name), c); });
  walk(doc.root, (c) => {
    if (!names.has(canon(c.id))) names.set(canon(c.id), c);
    if (c.kind === 'input' && c.label && !c.label.includes('{{') && !names.has(canon(c.label))) names.set(canon(c.label), c);
    // "toggle more details" means the collapsible headed "More details". Panel titles are not
    // names: they are values of their tabs or accordion, found by Local.panel.
    if (c.kind === 'collapsible' && c.title && !c.title.includes('{{') && !names.has(canon(c.title))) names.set(canon(c.title), c);
  });
  const cols = new Map<string, string[]>();
  for (const name of new Set([...collections, ...computed.collections])) {
    const rows = world.rows(name).slice(-50);
    const fields = new Set<string>();
    for (const r of rows) if (r && typeof r === 'object' && !Array.isArray(r)) Object.keys(r).forEach((k) => fields.add(k));
    fields.delete('id');
    fields.delete('at');
    cols.set(name, [...fields]);
  }
  const target = ask.target ?? 'expr';
  const current = ask.current ?? '';
  let it: Sx | undefined;
  if (cell && (target === 'style' || target === 'hidden')) it = ref(cell);
  else if (current.trim()) {
    try { it = read(current) ?? undefined; } catch { /* half-typed code is no context */ }
  }
  return { doc, world, computed, idx, cell, target, current, it, names, collections: cols };
}

// ───────────────────────────── checking ─────────────────────────────

const ACTIONS = new Set(['set!', 'toggle!', 'insert!', 'update!', 'delete!', 'clear!', 'dup!', 'remove!', 'emit!', 'show!', 'hide!', 'start!', 'stop!', 'refresh!']);
const PLACES = new Set(['set!', 'toggle!', 'dup!', 'remove!', 'ref', 'child', 'show!', 'hide!', 'start!', 'stop!', 'refresh!']);
/** Actions that only work on one kind of cell. */
const PLACE_KIND: Record<string, string> = { 'start!': 'timer', 'stop!': 'timer', 'refresh!': 'fetch' };
const FREE = new Set(['it', 'i', 'acc']);

/** What each built-in event binds while a cell's handler runs; `event` and `target` always. */
const EVENT_VARS: Record<string, string[]> = {
  change: ['value', 'was', 'item', 'index'],
  click: ['row', 'index', 'item', 'element'],
  dblclick: ['row', 'index', 'item', 'element'],
  pick: ['rows', 'value', 'was'],
  open: ['title', 'value'],
  close: ['title', 'value'],
  tick: ['count', 'at'],
  load: ['data', 'value'],
  fail: ['message', 'status'],
};

/** The names a handler for this event finds bound, on a cell or (null) on the document. */
export function eventVars(cell: Cell | null, event: string): string[] {
  const base = ['event', 'target'];
  if (!BUILTIN_EVENTS.has(event)) return [...base, 'payload', 'from'];
  // The document's open and close carry no data.
  return cell ? [...base, ...(EVENT_VARS[event] ?? [])] : base;
}

/** Why a cell (or the document, null) can't hold a handler for this event, or null when it can. */
export function eventProblem(cell: Cell | null, event: string): string | null {
  if (!EVENT_NAME_RE.test(event)) return `"${event}" is not an event name`;
  if (!BUILTIN_EVENTS.has(event)) return null;
  const raised = eventsOf(cell).map((e) => e.name);
  if (raised.includes(event)) return null;
  const who = cell ? `${cell.name ?? cell.id} (a ${cell.kind})` : 'the document';
  return `${who} does not raise ${event}` + (raised.length ? `; it raises ${listed(raised)}` : '');
}

function distance(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return d[b.length];
}

function noCell(ctx: Ctx, name: string, bound: Iterable<string> = []): string {
  const near = [...new Set([...ctx.idx.byName.keys(), ...bound])].filter((n) => distance(n.toLowerCase(), name.toLowerCase()) <= 2);
  return `there is no cell called "${name}"` + (near.length ? `; did you mean ${listed(near, 'or')}?` : '');
}

/**
 * Throw if the expression uses a function or a name the document does not have, or an action where none is allowed.
 * A handler (target on.<event>) sees its event's data names; `cell` is the cell holding it (null: the document),
 * by default the one being composed for.
 */
export function check(ctx: Ctx, x: Sx, target: Target, cell?: Cell | null): void {
  const known = (n: string) => ctx.idx.byName.has(n) || ctx.idx.byId.has(n);
  const place = (p: Sx, scope: Set<string>, head: string) => {
    if (typeof p !== 'string') return visit(p, scope);
    const n = p.replace(/^\$/, '');
    if (!known(n) && !scope.has(n)) throw new SxError(noCell(ctx, n, scope));
    const kind = PLACE_KIND[head];
    const c = ctx.idx.byName.get(n) ?? ctx.idx.byId.get(n);
    if (kind && c && c.kind !== kind) throw new SxError(`${head} needs a ${kind}, and ${n} is a ${c.kind}`);
  };
  const visit = (x: Sx, scope: Set<string>): void => {
    if (typeof x === 'string') {
      const n = x.slice(1);
      if (x.startsWith('$') && !scope.has(n) && !FREE.has(n) && !known(n)) throw new SxError(noCell(ctx, n, scope));
      return;
    }
    if (x === null || typeof x !== 'object') return;
    if (!Array.isArray(x)) return Object.values(x).forEach((v) => visit(v, scope));
    if (!x.length) return;
    const [head, ...args] = x;
    if (typeof head !== 'string' || head.startsWith('$')) {
      visit(head, scope);
      return args.forEach((a) => visit(a, scope));
    }
    if (head === 'quote') return;
    if (head === 'let' || head === 'fn') {
      const inner = new Set(scope);
      const b = args[0];
      if (head === 'let') {
        if (!Array.isArray(b) || b.length % 2) throw new SxError('let needs pairs: (let (x 1 y 2) …)');
        for (let i = 0; i < b.length; i += 2) {
          visit(b[i + 1], inner);
          inner.add(String(b[i]).replace(/^\$/, ''));
        }
      } else for (const p of Array.isArray(b) ? b : [b]) inner.add(String(p).replace(/^\$/, ''));
      return args.slice(1).forEach((a) => visit(a, inner));
    }
    if (ACTIONS.has(head) && !acts(target)) throw new SxError(`${head} changes the document, so it only works in a button's action`);
    if (head === 'emit!' && typeof args[0] === 'string' && BUILTIN_EVENTS.has(args[0])) {
      throw new SxError(`"${args[0]}" is an event the document raises itself; give your event a name of its own`);
    }
    if (PLACES.has(head)) {
      if (args.length) place(args[0], scope, head);
      return args.slice(1).forEach((a) => visit(a, scope));
    }
    if (!isBuiltin(head) && !scope.has(head) && customAction(ctx.doc, head) === undefined) {
      const cell = ctx.idx.byName.get(head) ?? ctx.idx.byId.get(head);
      if (!cell) throw new SxError(`unknown function ${head}`);
      const holds = typeof ctx.computed.cells[cell.id]?.value === 'function' || (Array.isArray(cell.expr) && cell.expr[0] === 'fn');
      if (!holds) throw new SxError(`${head} is a cell, not a function`);
    }
    args.forEach((a) => visit(a, scope));
  };
  const event = eventOf(target);
  visit(x, new Set(event ? eventVars(cell === undefined ? ctx.cell ?? null : cell, event) : []));
}

/** Read an answer (Lisp text, possibly fenced, or the JSON form) and check it. */
export function validate(ctx: Ctx, code: unknown, target: Target): Sx {
  if (target === 'events') throw new SxError('an events answer is a list of ops; read it with validateOps');
  let expr: Sx;
  if (typeof code === 'string') {
    const fenced = /```[\w-]*\s*\n?([\s\S]*?)```/.exec(code);
    expr = read((fenced ? fenced[1] : code).trim());
  } else expr = (code ?? null) as Sx;
  if (expr === null || (typeof expr === 'string' && !expr.trim())) throw new SxError('the answer is empty');
  if (target === 'action' && !(Array.isArray(expr) && expr[0] === 'fn' && expr.length >= 3)) {
    throw new SxError('an action is written as a function: (fn (who) (set! hello who)), its inputs and then what it does');
  }
  const event = eventOf(target);
  if (event) {
    const problem = eventProblem(ctx.cell ?? null, event);
    if (problem) throw new SxError(problem);
  }
  check(ctx, expr, target);
  return expr;
}

/** Check any answer for the context's target: one expression, or for `events` a list of ops. */
export function accept(ctx: Ctx, code: unknown): Answer {
  if (ctx.target !== 'events') return { expr: validate(ctx, code, ctx.target) };
  const v = validateOps(ctx, code);
  return { expr: null, ops: v.ops, changes: v.changes, explanation: v.explanation };
}

/** Pretty code, a plain explanation and, for anything but an action, the value it gives in the cell. */
export function finish(ctx: Ctx, a: Answer, provider: Provider, notes: string[] = []): Composed {
  if (a.ops) {
    const changes = a.changes ?? [];
    return {
      code: changes.map((c) => c.code).filter(Boolean).join('\n'),
      expr: null,
      explanation: a.explanation?.trim() || 'Changes how the document reacts.',
      provider,
      ...(notes.length ? { notes } : {}),
      ops: a.ops,
      changes,
    };
  }
  const expr = a.expr;
  const out: Composed = { code: print(expr, 60), expr, explanation: a.explanation?.trim() || explain(ctx, expr), provider };
  if (!acts(ctx.target)) {
    const r = evalIn(ctx.doc, ctx.world, expr, ctx.cell?.id);
    const currency = typeof ctx.doc.meta.currency === 'string' ? ctx.doc.meta.currency : 'USD';
    out.preview = r.error
      ? { error: r.error }
      : {
          value: plainValue(r.value) as Json,
          display: formatValue(r.value, ctx.target === 'expr' ? ctx.cell?.format : undefined, currency, ctx.world.now),
        };
  }
  if (notes.length) out.notes = notes;
  return out;
}

// ───────────────────────────── explanations ─────────────────────────────

const AGG_WORDS: Record<string, string> = { sum: 'the total of', avg: 'the average of', max: 'the largest of', min: 'the smallest of' };
const CMP_WORDS: Record<string, string> = { '>': 'is more than', '<': 'is less than', '>=': 'is at least', '<=': 'is at most', '=': 'is', '!=': 'is not' };
const TOKEN_WORDS: Record<string, string> = {
  bad: 'red', live: 'green', warn: 'orange', accent: 'blue', agent: 'pink', muted: 'grey', ink: 'the usual ink colour', paper: 'white',
  'bad-soft': 'light red', 'live-soft': 'light green', 'warn-soft': 'light orange', 'accent-soft': 'light blue', 'agent-soft': 'light pink', sunken: 'grey',
};

const nth = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

/** Rows as English: "the records saved in orders". */
function src(y: Sx): string {
  if (Array.isArray(y) && y[0] === 'rows') return `the records saved in ${y[1]}`;
  if (Array.isArray(y) && y[0] === 'where') return `the records in ${String((y[1] as Sx[])[1])} whose ${y[2]} is ${say(y[3])}`;
  if (Array.isArray(y) && y[0] === 'filter' && Array.isArray(y[2]) && y[2][0] === 'rows') return `the records in ${y[2][1]} whose ${cond(y[1]).replace(/^the (.+?) of it /, '$1 ')}`;
  if (Array.isArray(y) && y[0] === 'filter') return `the items of ${say(y[2])} for which ${cond(y[1])}`;
  if (typeof y === 'string' && y.startsWith('$')) return `the items in ${y.slice(1)}`;
  return say(y);
}

/** A short English noun phrase for an expression. */
function say(x: Sx): string {
  if (x === null) return 'nothing';
  if (typeof x === 'number' || typeof x === 'boolean') return String(x);
  if (typeof x === 'string') return x.startsWith('$') ? x.slice(1) : JSON.stringify(x);
  if (!Array.isArray(x)) return 'a record';
  const [h, ...a] = x;
  const inner = (y: Sx) => (Array.isArray(y) && ['+', '-', '*', '/'].includes(y[0] as string) ? `(${say(y)})` : say(y));
  switch (h) {
    case '+': return a.map(inner).join(' plus ');
    case '-': return a.length === 1 ? `minus ${inner(a[0])}` : a.map(inner).join(' minus ');
    case '*': return a.map(inner).join(' times ');
    case '/': return a.map(inner).join(' divided by ');
    case '%': return `the remainder of ${inner(a[0])} divided by ${inner(a[1])}`;
    case '^': return a[1] === 2 ? `${inner(a[0])} squared` : `${inner(a[0])} to the power of ${say(a[1])}`;
    case 'sqrt': return `the square root of ${say(a[0])}`;
    case 'abs': return `${say(a[0])} without its minus sign`;
    case 'round': return a.length > 1 ? `${say(a[0])} rounded to ${say(a[1])} decimals` : `${say(a[0])} rounded`;
    case 'floor': return `${say(a[0])} rounded down`;
    case 'ceil': return `${say(a[0])} rounded up`;
    case 'sum': case 'avg': case 'max': case 'min': return `${AGG_WORDS[h]} ${a.length > 1 ? listed(a.map(say)) : say(a[0])}`;
    case 'column':
      if (typeof a[1] === 'number') return `the ${nth(a[1] + 1)} column of ${say(a[0])}`;
      return `the ${a[1]} of ${src(a[0]).replace(/^the records/, 'every record')}`;
    case 'rows': case 'where': case 'filter': return src(x);
    case 'len': return `the number of ${src(a[0]).replace(/^the /, '')}`;
    case 'take':
      if (Array.isArray(a[1]) && a[1][0] === 'reverse') return `the ${say(a[0])} most recent of ${src(a[1][1])}`;
      if (Array.isArray(a[1]) && a[1][0] === 'sort-by') return `the top ${say(a[0])} of ${src(a[1][2])} by ${say(a[1][1]).replace(/^the (.+?) of it$/, '$1')}`;
      return `the first ${say(a[0])} of ${src(a[1])}`;
    case 'reverse': return Array.isArray(a[0]) && a[0][0] === 'rows' ? `${src(a[0])}, newest first` : `${src(a[0])} in reverse order`;
    case 'uniq': return `${src(a[0])} without repeats`;
    case 'sort': return `${src(a[0])} in order${a[1] === 'desc' ? ', largest first' : ''}`;
    case 'first': return `the first of ${src(a[0])}`;
    case 'last': return `the last of ${src(a[0])}`;
    case 'today': return "today's date";
    case 'now': return 'the current time';
    case 'days': return `the number of days from ${say(a[0])} to ${say(a[1])}`;
    case 'date+': return typeof a[1] === 'number' && a[1] < 0 ? `${-a[1]} days before ${say(a[0])}` : `${say(a[1])} days after ${say(a[0])}`;
    case 'str': return a.map(say).join(' followed by ');
    case 'fmt': return `${say(a[0])} shown as ${a[1]}`;
    case 'upper': return `${say(a[0])} in capitals`;
    case 'lower': return `${say(a[0])} in small letters`;
    case 'range': return `the numbers from ${say(a[0])} to ${typeof a[1] === 'number' ? a[1] - 1 : say(a[1])}`;
    case 'list': return listed(a.map(say));
    case 'if': return `${say(a[1])} when ${cond(a[0])}, otherwise ${say(a[2] ?? null)}`;
    case 'get': return `the ${say(a[1]).replace(/"/g, '')} of ${say(a[0])}`;
    case 'ref': return String(a[0]).replace(/^\$/, '');
    case 'count-if': {
      const types = elementTypes(a[0]);
      const what = !types ? null : types.join() === SHAPE_TYPES.join() ? 'shapes' : types.length === 1 && types[0] !== 'text' ? `${types[0]}s` : `${listed(types, 'or')} elements`;
      if (what) return `the number of ${what} in ${say(a[1])}`;
      return `the number of items in ${say(a[1])} for which ${cond(a[0])}`;
    }
    default: return print(x, 1000);
  }
}

const SHAPE_TYPES = ['rect', 'ellipse', 'diamond'];

/** The element types a diagram count picks: (= (get it "type") "arrow") or (includes? (list …) (get it "type")). */
function elementTypes(test: Sx): string[] | null {
  if (!Array.isArray(test)) return null;
  const isType = (y: Sx) => Array.isArray(y) && y[0] === 'get' && y[1] === '$it' && y[2] === 'type';
  if (test[0] === '=' && isType(test[1]) && typeof test[2] === 'string') return [test[2]];
  if (test[0] === 'includes?' && isType(test[2]) && Array.isArray(test[1]) && test[1][0] === 'list') return test[1].slice(1).map(String);
  return null;
}

/** A condition as English: "total is more than 100". */
function cond(x: Sx): string {
  if (!Array.isArray(x)) return typeof x === 'string' && x.startsWith('$') ? `${x.slice(1)} is on` : say(x);
  const [h, ...a] = x;
  if (typeof h === 'string' && CMP_WORDS[h]) return `${say(a[0])} ${CMP_WORDS[h]} ${say(a[1])}`;
  if (h === 'and' || h === 'or') return a.map(cond).join(` ${h} `);
  if (h === 'not' && Array.isArray(a[0]) && a[0][0] === 'includes?') return `${say(a[0][1])} does not include ${say(a[0][2])}`;
  if (h === 'not') return Array.isArray(a[0]) ? `not (${cond(a[0])})` : `${say(a[0])} is off`;
  if (h === 'empty?') return `${say(a[0])} is empty`;
  if (h === 'includes?') return `${say(a[0])} includes ${say(a[1])}`;
  if (h === 'every' && Array.isArray(a[0]) && a[0][0] === 'get' && a[0][1] === '$it' && a[0][2] === 'done') return 'every box is ticked';
  if (h === 'every' || h === 'some') return `${h === 'every' ? 'every' : 'some'} item of ${say(a[1])} passes ${say(a[0])}`;
  return say(x);
}

/** "It updates whenever qty or price changes." */
function updates(x: Sx): string {
  const names = new Set<string>();
  const colls = new Set<string>();
  let clock = false;
  const visit = (y: Sx) => {
    if (typeof y === 'string') {
      if (y.startsWith('$') && !FREE.has(y.slice(1))) names.add(y.slice(1));
    } else if (Array.isArray(y)) {
      if (y[0] === 'rows' && typeof y[1] === 'string') colls.add(y[1]);
      if (y[0] === 'today' || y[0] === 'now') clock = true;
      if (y[0] === 'quote') return;
      y.forEach(visit);
    } else if (y && typeof y === 'object') Object.values(y).forEach(visit);
  };
  visit(x);
  const parts: string[] = [];
  const n = [...names];
  if (n.length === 1) parts.push(`whenever ${n[0]} changes`);
  else if (n.length === 2) parts.push(`whenever ${n[0]} or ${n[1]} changes`);
  else if (n.length) parts.push(`whenever any of ${listed(n, 'or')} changes`);
  if (colls.size) parts.push(`when records are saved to ${listed([...colls])}`);
  if (clock) parts.push('as the clock moves on');
  return parts.length ? ` It updates ${parts.join(', and ')}.` : '';
}

function sentence(x: Sx): string {
  if (typeof x === 'string' && x.startsWith('$')) return `Shows the value of ${x.slice(1)}.`;
  if (!Array.isArray(x)) return `Always shows ${say(x)}.`;
  const [h, ...a] = x;
  const two = a.length === 2;
  switch (h) {
    case '*':
      if (two && typeof a[1] === 'number') {
        const k = a[1];
        if (k === 2) return `Doubles ${say(a[0])}.`;
        if (k > 1 && k < 2) return `Adds ${tidy((k - 1) * 100)}% to ${say(a[0])}.`;
        if (k > 0 && k < 1) return `Works out ${tidy(k * 100)}% of ${say(a[0])}.`;
      }
      return two ? `Multiplies ${say(a[0])} by ${say(a[1])}.` : `Multiplies ${listed(a.map(say))}.`;
    case '+': return two && typeof a[1] === 'number' ? `Adds ${a[1]} to ${Array.isArray(a[0]) ? `(${say(a[0])})` : say(a[0])}.` : `Adds ${listed(a.map(say))}.`;
    case '-': return two ? `Subtracts ${say(a[1])} from ${say(a[0])}.` : `Works out ${say(x)}.`;
    case '/': return two && a[1] === 2 ? `Halves ${say(a[0])}.` : two ? `Divides ${say(a[0])} by ${say(a[1])}.` : `Works out ${say(x)}.`;
    case 'sum': return `Adds up ${say(x).replace(/^the total of /, '')}.`;
    case 'avg': case 'max': case 'min': return `Finds ${say(x)}.`;
    case 'len': return `Counts ${src(a[0])}.`;
    case 'if': return `Shows ${say(a[1])} when ${cond(a[0])}, otherwise ${say(a[2] ?? null)}.`;
    case 'str': return `Joins ${listed(a.map(say))} into one piece of text.`;
    case 'fmt': return `Shows ${say(a[0])} formatted as ${a[1]}.`;
    case 'round': case 'floor': case 'ceil': return `Shows ${say(x)}.`;
    case 'range': return `Makes a list of ${say(x)}.`;
    case 'list': return `Makes a list of ${say(x)}.`;
    case 'count-if': return `Counts ${say(x).replace(/^the number of /, 'the ')}.`;
    case 'today': return "Shows today's date.";
    case 'now': return 'Shows the current time.';
    case 'days': return `Counts ${say(x).replace(/^the number of /, 'the ')}.`;
    case '^': return a[1] === 2 ? `Squares ${say(a[0])}.` : `Works out ${say(x)}.`;
    case 'first': case 'last': case 'sqrt': case 'abs': return `Shows ${say(x)}.`;
    case 'date+': return `Gives the date ${say(x)}.`;
    case 'weekday': return `Gives the day of the week of ${say(a[0])}.`;
    case 'year': case 'month': case 'day': return `Gives the ${h} of ${say(a[0])}.`;
    case 'rows': case 'where': case 'filter': case 'take': case 'column': return `Lists ${say(x)}.`;
    case 'group': return `Groups ${say(a[0])} by ${a[1]}.`;
    case 'sort-by': return `Sorts ${say(a[1])} by ${say(a[0]).replace(/^the "?(.+?)"? of it$/, '$1')}${a[2] === 'desc' ? ', largest first' : ''}.`;
    case 'upper': case 'lower': return `Shows ${say(x)}.`;
    case 'reverse': case 'uniq': case 'sort': return `Lists ${say(x)}.`;
    default:
      if (typeof h === 'string' && !isBuiltin(h)) return `Applies ${h} to ${listed(a.map(say))}.`;
      return `Works out ${say(x)}.`;
  }
}

/** What a set! does to tabs, an accordion or a collapsible, in their own words; null for anything else. */
function opening(cell: Cell | undefined, p: string, v: Sx): string | null {
  const title = (y: Sx): string | null => {
    if (typeof y === 'string') return y;
    if (!Array.isArray(y)) return null;
    if (y[0] === 'uniq') return title(y[1]);
    if (y[0] === 'concat' && Array.isArray(y[2]) && y[2][0] === 'list' && y[2].length === 2) return title(y[2][1]);
    if (y[0] === 'filter' && Array.isArray(y[1]) && y[1][0] === '!=') return title(y[1][2]);
    return null;
  };
  const head = Array.isArray(v) ? v[0] : null;
  if (cell?.kind === 'tabs' && typeof v === 'string') return `opens the ${v} tab of ${p}`;
  // (cond (= view "Overview") "Details" … view): the next tab when it starts from the first.
  if (cell?.kind === 'tabs' && head === 'cond' && Array.isArray(v) && Array.isArray(v[1])) return `opens the ${v[1][2] === panelTitles(cell)[0] ? 'next' : 'previous'} tab of ${p}`;
  if (cell?.kind === 'collapsible' && typeof v === 'boolean') return `${v ? 'unfolds' : 'folds'} ${p}`;
  if (cell?.kind !== 'accordion') return null;
  if (Array.isArray(v) && head === 'list') return v.length === 1 ? `closes every section of ${p}` : `opens ${listed(v.slice(1).map(String))} in ${p}`;
  if (Array.isArray(v) && head === 'if' && Array.isArray(v[1]) && v[1][0] === 'includes?' && typeof v[1][2] === 'string') return `opens or closes the ${v[1][2]} section of ${p}`;
  const t = title(v);
  if (t === null) return null;
  return head === 'filter' ? `closes the ${t} section of ${p}` : `opens the ${t} section of ${p}`;
}

function action(x: Sx, ctx?: Ctx): string {
  if (!Array.isArray(x)) return `does ${say(x)}`;
  const [h, ...a] = x;
  const place = (p: Sx) => (Array.isArray(p) && p[0] === 'child'
    ? `the ${p[2] === -1 ? 'last' : p[2] === 0 ? 'first' : nth(Number(p[2]) + 1)} line of ${p[1]}`
    : String(p).replace(/^\$/, ''));
  const cell = (p: string) => ctx?.idx.byName.get(p) ?? ctx?.idx.byId.get(p);
  const kind = (p: string) => cell(p)?.kind;
  switch (h) {
    case 'set!': {
      const p = place(a[0]);
      const v = a[1];
      const opens = opening(cell(p), p, v ?? null);
      if (opens) return opens;
      if (Array.isArray(v) && v[1] === '$' + p && (v[0] === '+' || v[0] === '-') && v.length === 3) {
        return v[0] === '+' ? `adds ${say(v[2])} to ${p}` : `takes ${say(v[2])} away from ${p}`;
      }
      if (v === '') return `clears ${p}`;
      if (v === true || v === false) return `${v ? 'ticks' : 'unticks'} ${p}`;
      if (v === '$value') return `sets ${p} to the new value`;
      if (Array.isArray(v) && typeof v[0] === 'string' && CMP_WORDS[v[0]]) return `sets ${p} to true when ${cond(v)}, false otherwise`;
      return `sets ${p} to ${say(v ?? null)}`;
    }
    case 'toggle!': return kind(place(a[0])) === 'collapsible' ? `folds or unfolds ${place(a[0])}` : `switches ${place(a[0])} on or off`;
    case 'insert!': {
      const keys = a[1] && typeof a[1] === 'object' && !Array.isArray(a[1]) ? Object.keys(a[1]) : [];
      return `saves ${keys.length ? listed(keys) : 'a record'} as a new record in ${a[0]}`;
    }
    case 'clear!': return `deletes every record in ${a[0]}`;
    case 'delete!': return `deletes a record from ${a[0]}`;
    case 'dup!': return `adds a copy of ${place(a[0])}`;
    case 'remove!': return `removes ${place(a[0])}`;
    case 'do': return listed(a.map((y) => action(y, ctx)), 'then');
    case 'show!': return `shows ${place(a[0])}`;
    case 'hide!': return `hides ${place(a[0])}`;
    case 'start!': return `starts ${place(a[0])}`;
    case 'stop!': return `stops ${place(a[0])}`;
    case 'refresh!': return `fetches ${place(a[0])} again`;
    case 'emit!': {
      const keys = a[1] && typeof a[1] === 'object' && !Array.isArray(a[1]) ? Object.keys(a[1]) : [];
      return `sends the ${a[0]} event` + (keys.length ? ` with ${listed(keys)}` : a[1] !== undefined ? ` with ${say(a[1])}` : '');
    }
    case 'when': return `checks whether ${cond(a[0])} and if so ${action(a.length > 2 ? ['do', ...a.slice(1)] : a[1] ?? null, ctx)}`;
    default:
      if (typeof h === 'string' && ctx && customAction(ctx.doc, h)) return `runs the ${h} action` + (a.length ? ` with ${listed(a.map(say))}` : '');
      return `works out ${say(x)}`;
  }
}

/** "When agree changes", "Every minute (new timer every-minute)": a handler in plain words. */
function handlerLabel(cell: Cell | null, event: string, isNew = false): string {
  if (!cell) {
    if (event === 'open') return 'When the document opens';
    if (event === 'close') return 'When the document closes';
    return `When ${event} happens (heard by the document)`;
  }
  const n = cell.name ?? cell.id;
  const made = isNew ? ` (new ${cell.kind} ${n})` : '';
  if (cell.kind === 'timer' && event === 'tick') return (timing(cell) ?? `When ${n} ticks`) + made;
  const phrase = EVENT_PHRASE[event];
  const every = cell.kind === 'fetch' && durationMs(cell.every) ? `, fetched every ${sayEvery(durationMs(cell.every)! / 1000)}` : '';
  return (phrase ? `When ${n} ${phrase}` : `When ${event} happens (heard by ${n})`) + made + every;
}

const EVENT_PHRASE: Record<string, string> = {
  change: 'changes', click: 'is clicked', dblclick: 'is double-clicked', pick: 'has rows picked', open: 'opens', close: 'closes',
  tick: 'ticks', load: 'loads', fail: 'fails to load',
};

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
/** 5 → "5 seconds", 120 → "2 minutes". */
function sayFor(s: number): string {
  if (s >= 3600 && s % 3600 === 0) return plural(s / 3600, 'hour');
  if (s >= 60 && s % 60 === 0) return plural(s / 60, 'minute');
  return plural(tidy(s), 'second');
}
/** 60 → "minute", 300 → "5 minutes": what follows "every". */
const sayEvery = (s: number) => sayFor(s).replace(/^1 /, '');

/** "Every minute", "After 5 seconds", from a timer's props. */
function timing(cell: Cell): string | null {
  const every = durationMs(cell.every);
  if (every) return `Every ${sayEvery(every / 1000)}`;
  const after = durationMs(cell.after);
  return after ? `After ${sayFor(after / 1000)}` : null;
}

/** "Action greet (who)". */
const actionLabel = (name: string, fn: Sx) => {
  const params = Array.isArray(fn) && Array.isArray(fn[1]) ? fn[1].map((p) => String(p).replace(/^\$/, '')) : [];
  return `Action ${name}${params.length ? ` (${params.join(' ')})` : ''}`;
};

/** What a custom action does: "takes who and sets hello to …". */
function fnWords(x: Sx, ctx?: Ctx): string {
  if (!Array.isArray(x) || x[0] !== 'fn') return action(x, ctx);
  const params = (Array.isArray(x[1]) ? x[1] : [x[1]]).map((p) => String(p).replace(/^\$/, ''));
  const body = x.length > 3 ? ['do', ...x.slice(2)] : x[2] ?? null;
  return (params.length ? `takes ${listed(params)} and ` : '') + action(body, ctx);
}

const tokenWord = (t: Sx) => (typeof t === 'string' ? TOKEN_WORDS[t] ?? t : t === null ? 'unchanged' : say(t));

/** One or two plain sentences for a beginner. */
export function explain(ctx: Ctx, x: Sx): string {
  const event = eventOf(ctx.target);
  if (event) return `${handlerLabel(ctx.cell ?? null, event)}, it ${action(x, ctx)}.`;
  switch (ctx.target) {
    case 'action': return `This action ${fnWords(x, ctx)}.`;
    case 'do': return `When clicked, it ${action(x, ctx)}.`;
    case 'hidden': return `Hides this cell while ${cond(x)}.` + updates(x).replace('It updates', 'It checks again');
    case 'style':
      if (Array.isArray(x) && x[0] === 'if') return `Turns it ${tokenWord(x[2])} while ${cond(x[1])}, otherwise ${tokenWord(x[3] ?? null)}.`;
      return `Uses ${tokenWord(x)}.`;
    case 'options':
      if (Array.isArray(x) && x[0] === 'list') return `Offers the choices ${listed(x.slice(1).map((v) => (typeof v === 'string' ? v : say(v))))}.`;
      return `Offers ${say(x)} as the choices.` + updates(x);
    default: return sentence(x) + updates(x);
  }
}

// ───────────────────────────── the built-in composer ─────────────────────────────

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30,
  forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000, dozen: 12,
};

/** Lowercase, words for symbols, numbers for number words, quoted text set aside as qqNqq. */
function normalize(prompt: string, ctx: Ctx): { s: string; quotes: string[] } {
  const quotes: string[] = [];
  let s = ' ' + prompt.replace(/[“”„]/g, '"').replace(/[‘’]/g, "'") + ' ';
  s = s.replace(/"([^"]*)"/g, (_, q: string) => ` qq${quotes.push(q) - 1}qq `);
  s = s.toLowerCase();
  s = s.replace(/\b(is|are|does|do|was)n't\b/g, '$1 not').replace(/'s\b/g, '').replace(/['`]/g, '');
  s = s.replace(/(\d),(\d{3})\b/g, '$1$2').replace(/(\d)\s*%/g, '$1 percent ').replace(/%/g, ' percent ');
  s = s.replace(/>=|≥|=>/g, ' at least ').replace(/<=|≤|=</g, ' at most ').replace(/!=|≠|<>/g, ' is not ').replace(/==?/g, ' equals ')
    .replace(/>/g, ' greater than ').replace(/</g, ' less than ').replace(/[*×·]/g, ' times ').replace(/÷/g, ' divided by ')
    .replace(/\^\s*2\b/g, ' squared ').replace(/\^/g, ' to the power of ').replace(/\+/g, ' plus ').replace(/\s-\s/g, ' minus ')
    .replace(/&/g, ' and ').replace(/[€$£]/g, ' ');
  if (ctx.target !== 'options') s = s.replace(/\s*\/\s*/g, ' divided by ');
  s = s.replace(/[?!;:()[\]{}]/g, ' ').replace(/\.(?!\d)/g, ' ').replace(/,/g, ' , ');
  s = s.replace(/\b[a-z]+\b/g, (w) => (w in NUMBER_WORDS ? String(NUMBER_WORDS[w]) : w));
  s = s.replace(/\b([2-9]0) ([1-9])\b/g, (_, a: string, b: string) => String(Number(a) + Number(b)))
    .replace(/\b(\d+) (100|1000)\b/g, (_, a: string, b: string) => String(Number(a) * Number(b)))
    .replace(/\ba (100|1000|12)\b/g, '$1');
  if (!ctx.names.has('x')) s = s.replace(/\s+x\s+/g, ' times ');
  return { s: s.replace(/\s+/g, ' ').replace(/ ,/g, ',').trim(), quotes };
}

const FILLER = /^(?:please|can you|could you|i want|i need|i would like|id like|show me|show|display|calculate|compute|work out|figure out|what is|whats|give me|get|return|it should be|should be|this should be|make it|make this|the result of|equals)\s+/;
const ARTICLES = /^(?:the|a|an|my|our|your|its|this|that|these|those|all|every|each|current|value of|values of|amount of)\s+/;

function stripArticles(ph: string): string {
  let s = ph.trim();
  for (let prev = ''; prev !== s;) {
    prev = s;
    s = s.replace(ARTICLES, '').replace(/\s+(?:cell|field|value|input|box)$/, '').trim();
  }
  return s;
}

const ADD: [string, string][] = [[' plus ', '+'], [' added to ', '+'], [' minus ', '-'], [' less ', '-'], [' take away ', '-']];
const MUL: [string, string][] = [
  [' times ', '*'], [' multiplied by ', '*'], [' divided by ', '/'], [' divide by ', '/'], [' over ', '/'], [' per ', '/'], [' mod ', '%'], [' modulo ', '%'],
];
const AND: [string, string][] = [[' and ', '+']];

const COMPARE: [string, string][] = [
  ['is greater than or equal to', '>='], ['greater than or equal to', '>='], ['is at least', '>='], ['at least', '>='], ['is no less than', '>='], ['no less than', '>='],
  ['is less than or equal to', '<='], ['less than or equal to', '<='], ['is at most', '<='], ['at most', '<='], ['is no more than', '<='], ['no more than', '<='],
  ['is not equal to', '!='], ['does not equal', '!='], ['not equal to', '!='], ['is different from', '!='], ['is not', '!='], ['are not', '!='],
  ['is greater than', '>'], ['greater than', '>'], ['is more than', '>'], ['more than', '>'], ['is bigger than', '>'], ['bigger than', '>'],
  ['is larger than', '>'], ['larger than', '>'], ['is higher than', '>'], ['higher than', '>'], ['is over', '>'], ['over', '>'], ['is above', '>'],
  ['above', '>'], ['exceeds', '>'], ['is after', '>'],
  ['is less than', '<'], ['less than', '<'], ['is smaller than', '<'], ['smaller than', '<'], ['is lower than', '<'], ['lower than', '<'],
  ['is fewer than', '<'], ['fewer than', '<'], ['is under', '<'], ['under', '<'], ['is below', '<'], ['below', '<'], ['is before', '<'],
  ['is equal to', '='], ['equal to', '='], ['equals', '='], ['is', '='], ['are', '='],
];

const AGG: Record<string, string> = {
  sum: 'sum', total: 'sum', 'add up': 'sum', 'add together': 'sum', average: 'avg', avg: 'avg', mean: 'avg', maximum: 'max', max: 'max',
  biggest: 'max', largest: 'max', highest: 'max', greatest: 'max', minimum: 'min', min: 'min', smallest: 'min', lowest: 'min', least: 'min',
};
const AGG_RE = new RegExp(`^(?:the\\s+)?(${Object.keys(AGG).join('|')})\\s+(?:of\\s+|in\\s+)?(?:all\\s+)?(?:the\\s+)?(.+)$`);

const FORMATS: [RegExp, string][] = [
  [/^(?:currency|money)$/, 'currency'], [/^(?:dollars?|usd)$/, 'USD'], [/^(?:euros?|eur)$/, 'EUR'], [/^(?:pounds?|gbp|sterling)$/, 'GBP'],
  [/^(?:yen|jpy)$/, 'JPY'], [/^(?:percent|percentage|a percentage)$/, 'percent'], [/^(?:date and time|datetime)$/, 'datetime'], [/^date$/, 'date'],
  [/^time ago|^ago$|^relative time$/, 'ago'], [/^time$/, 'time'], [/^(?:whole numbers?|integers?|int|no decimals)$/, 'int'], [/^(?:compact|short numbers?)$/, 'compact'],
];

const COLOURS: Record<string, string> = {
  red: 'bad', green: 'live', orange: 'warn', yellow: 'warn', amber: 'warn', blue: 'accent', pink: 'agent', purple: 'agent', violet: 'agent',
  magenta: 'agent', grey: 'muted', gray: 'muted', black: 'ink', white: 'paper',
};
const SOFT: Record<string, string> = { bad: 'bad-soft', live: 'live-soft', warn: 'warn-soft', accent: 'accent-soft', agent: 'agent-soft', muted: 'sunken', ink: 'ink', paper: 'paper' };
const COLOUR = `(${Object.keys(COLOURS).join('|')})`;

const VERBS = 'add|increase|raise|increment|bump|decrease|lower|decrement|reduce|subtract|take|set|change|make|update|reset|clear|empty|zero|toggle|flip|switch|check|uncheck|tick|untick|save|store|record|log|insert|put|append|remove|delete|drop|duplicate|copy|double|halve|mark|open|close|show|hide|fold|unfold|expand|collapse|go|move|jump|skip|advance';
const VERB_SET = new Set(VERBS.split('|'));

/** "opens the Details tab" reads as "open the Details tab", so "a button that opens …" works. */
function present(clause: string): string {
  const w = /^[a-z]+/.exec(clause)?.[0];
  if (!w || VERB_SET.has(w)) return clause;
  const base = [w.replace(/es$/, ''), w.replace(/s$/, '')].find((b) => b !== w && VERB_SET.has(b));
  return base ? base + clause.slice(w.length) : clause;
}

/** Diagram element words and the types they count; null counts every element. */
const ELEMENT_WORDS: [RegExp, string[] | null][] = [
  [/^(?:shapes?|nodes?)$/, SHAPE_TYPES],
  [/^box(?:es)?$/, [...SHAPE_TYPES, 'text']],
  [/^arrows?$/, ['arrow']],
  [/^(?:connectors?|connections?|links?|edges?)$/, ['arrow', 'line']],
  [/^(?:rects?|rectangles?|squares?)$/, ['rect']],
  [/^(?:ellipses?|circles?|ovals?)$/, ['ellipse']],
  [/^(?:diamonds?|decisions?)$/, ['diamond']],
  [/^(?:texts?|labels?|notes?)$/, ['text']],
  // Words that name other things too: only with the diagram named ("lines in flow").
  [/^lines?$/, ['line']],
  [/^(?:elements?|items?|things?)$/, null],
];

/** Counters that start at 1, so "reset step" means the first step, not step 0. */
const ORDINAL = /(?:step|page|stage|slide|screen|question|round|level|lesson|chapter)s?$/;

type Rule = [RegExp, (g: string[]) => Sx | null];

class Local {
  quotes: string[] = [];
  /** Words that name something a handler or an action finds bound ("the new value", "its rate"), tried before cells. */
  word?: (ph: string) => Sx | null;
  constructor(readonly ctx: Ctx) {}

  run(prompt: string): Sx | null {
    const { s, quotes } = normalize(prompt, this.ctx);
    this.quotes = quotes;
    if (!s) return null;
    switch (this.ctx.target) {
      case 'do': return this.actions(s);
      case 'hidden': return this.hidden(s);
      case 'style': return this.style(s);
      case 'options': return this.options(s);
      default: {
        let e = s;
        for (let prev = ''; prev !== e;) { prev = e; e = e.replace(FILLER, ''); }
        e = e.replace(/\s+(?:please|for me)$/, '');
        return this.ifThen(e) ?? this.term(e, true);
      }
    }
  }

  // ── what words point at ──

  cell(ph: string): Cell | undefined {
    if (!/^[a-z0-9][\w\s-]*$/.test(ph) || ph.split(' ').length > 4) return undefined;
    for (const f of this.forms(ph)) {
      const c = this.ctx.names.get(f);
      if (c) return c;
    }
    return undefined;
  }

  forms(ph: string): string[] {
    const k = canon(ph);
    const out = [k];
    if (k.endsWith('ies')) out.push(k.slice(0, -3) + 'y');
    if (k.endsWith('es')) out.push(k.slice(0, -2));
    if (k.endsWith('s')) out.push(k.slice(0, -1));
    out.push(k + 's', k + 'es');
    return out;
  }

  coll(ph: string): string | undefined {
    const s = stripArticles(ph).replace(/^(?:saved\s+|stored\s+)/, '').replace(/\s+(?:collection|records|list|table)$/, '');
    for (const f of this.forms(s)) for (const name of this.ctx.collections.keys()) if (canon(name) === f) return name;
    return undefined;
  }

  field(coll: string, ph: string): string | null {
    const s = stripArticles(ph);
    const fields = this.ctx.collections.get(coll) ?? [];
    for (const f of this.forms(s)) for (const name of fields) if (canon(name) === f) return name;
    return !fields.length && /^[a-z][\w-]*$/.test(s) ? s : null;
  }

  /** A numeric field to total when the person names only the collection. */
  numericField(coll: string): string | null {
    const rows = this.ctx.world.rows(coll).slice(-50) as Record<string, unknown>[];
    const fields = (this.ctx.collections.get(coll) ?? []).filter((f) => rows.some((r) => typeof r?.[f] === 'number'));
    return ['total', 'amount', 'price', 'value', 'count', 'qty', 'quantity'].find((f) => fields.includes(f)) ?? fields[0] ?? null;
  }

  group(ph: string): Cell | undefined {
    const c = this.cell(stripArticles(ph));
    return c && isLines(c) ? c : undefined;
  }

  /** The first named group made of rows, e.g. invoice lines. */
  lines(): Cell | undefined {
    let found: Cell | undefined;
    walk(this.ctx.doc.root, (c) => { if (!found && c.name && isLines(c) && c.children!.some(isLines)) found = c; });
    return found;
  }

  /** Quoted text put back as written: "qq0qq tab" → "Details tab". */
  unq(ph: string): string {
    return ph.replace(/qq(\d+)qq/g, (_, i: string) => this.quotes[Number(i)] ?? '');
  }

  /**
   * Cells of these kinds, the ones holding the cell being edited first (nearest
   * first), then in document order: a Next button inside a tabs cell means that tabs.
   */
  near(...kinds: string[]): Cell[] {
    const up: Cell[] = [];
    for (let p = this.ctx.cell && this.ctx.idx.parent.get(this.ctx.cell.id); p; p = this.ctx.idx.parent.get(p.id)) if (kinds.includes(p.kind)) up.push(p);
    const all: Cell[] = [];
    walk(this.ctx.doc.root, (c) => { if (kinds.includes(c.kind)) all.push(c); });
    return [...new Set([...up, ...all])];
  }

  /** The real title of one of a container's panels, matched forgivingly. */
  titleIn(box: Cell, ph: string): string | undefined {
    const want = this.forms(stripArticles(this.unq(ph).toLowerCase()).replace(/\s+(?:tab|section|panel)$/, ''));
    return panelTitles(box).find((t) => want.includes(canon(t)));
  }

  /**
   * A panel named by its title: "the Details tab", "Shipping", "Shipping in faq".
   * Without a container named, the tabs or accordion around the cell being edited
   * wins, then the first in the document; "tab" prefers tabs, "section" accordions.
   */
  panel(ph: string, kinds = ['tabs', 'accordion']): { box: Cell; title: string } | null {
    let s = stripArticles(this.unq(ph).toLowerCase());
    let boxes = this.near(...kinds);
    const inside = /^(.+?)\s+(?:in|of|on|from|inside)\s+(.+)$/.exec(s);
    if (inside) {
      const c = this.cell(stripArticles(inside[2]).replace(/\s+(?:tabs|accordion)$/, ''));
      if (c && kinds.includes(c.kind)) { boxes = [c]; s = inside[1]; }
    }
    const word = /\s+(tabs?|sections?|panels?|panes?|pages?|parts?)$/.exec(s) ?? /^(tabs?|sections?)\s+/.exec(s);
    if (word) {
      s = s.replace(word[0], '').trim();
      const first = word[1].startsWith('tab') ? 'tabs' : word[1].startsWith('section') ? 'accordion' : null;
      if (first) boxes = [...boxes.filter((b) => b.kind === first), ...boxes.filter((b) => b.kind !== first)];
    }
    if (!s) return null;
    for (const box of boxes) {
      const title = this.titleIn(box, s);
      if (title) return { box, title };
    }
    return null;
  }

  /** A collapsible by name or heading, or by a word of its heading: "the details" finds "More details". */
  fold(ph: string): Cell | undefined {
    const s = stripArticles(this.unq(ph).toLowerCase()).replace(/\s+(?:section|part|panel|area|bit|block)$/, '');
    const all = this.near('collapsible');
    const keys = (c: Cell) => [c.name, c.title].filter((k): k is string => !!k).map(canon);
    const forms = this.forms(s).filter(Boolean);
    const exact = all.find((c) => keys(c).some((k) => forms.includes(k)));
    if (exact) return exact;
    if (canon(s).length >= 3) {
      const part = all.find((c) => keys(c).some((k) => k.includes(canon(s))));
      if (part) return part;
    }
    return all.length === 1 && /^(?:it|this|that|everything)$/.test(s) ? all[0] : undefined;
  }

  /** An accordion named in the phrase, else the one around the cell being edited, else the first. */
  accordion(ph?: string, multiple?: boolean): Cell | undefined {
    const all = this.near('accordion').filter((c) => !multiple || c.multiple);
    if (!ph) return all[0];
    const c = this.cell(stripArticles(ph).replace(/\s+accordion$/, ''));
    return c && all.includes(c) ? c : undefined;
  }

  /** A cell an action can set: an input or a data cell. */
  settable(ph: string): Cell | undefined {
    const c = this.cell(stripArticles(ph));
    return c && (c.kind === 'input' || c.kind === 'data') ? c : undefined;
  }

  /** A settable cell holding a number, such as a wizard's step. */
  counter(ph: string): Cell | undefined {
    const c = this.settable(ph);
    if (!c) return undefined;
    const numeric = typeof this.ctx.computed.cells[c.id]?.value === 'number' || (c.kind === 'input' && ['number', 'slider', 'rating'].includes(c.type ?? ''));
    return numeric ? c : undefined;
  }

  /** Whether a panel or a collapsible is open, as a condition. Bare phrases only match panels, so names keep their meaning. */
  isOpen(ph: string, bare = false): Sx | null {
    if (bare && this.cell(stripArticles(ph))) return null;
    const p = this.panel(ph);
    if (p) return p.box.kind === 'tabs' ? ['=', ref(p.box), lit(p.title)] : ['includes?', ref(p.box), lit(p.title)];
    if (bare) return null;
    const c = this.fold(ph);
    return c ? ref(c) : null;
  }

  /** Which column of a group of rows holds a field: by a header, a cell name, or the last numeric column. */
  column(g: Cell, field?: string): number | null {
    const rows = g.children!.filter(isLines);
    if (field) {
      const want = new Set(this.forms(stripArticles(field)));
      const siblings = this.ctx.idx.parent.get(g.id)?.children ?? [];
      const header = siblings[siblings.indexOf(g) - 1];
      for (const r of header && isGroup(header) ? [header, ...rows] : rows) {
        const i = r.children!.findIndex((ch) => (ch.kind === 'text' && want.has(canon(ch.text ?? ''))) || (ch.name && want.has(canon(ch.name.replace(/\d+$/, '')))));
        if (i >= 0) return i;
      }
    }
    let last = -1;
    for (const r of rows) {
      const v = this.ctx.computed.cells[r.id]?.value;
      if (Array.isArray(v)) v.forEach((x, i) => { if (typeof x === 'number' && i > last) last = i; });
    }
    return last >= 0 ? last : null;
  }

  value(ph: string): Sx {
    const w = this.word?.(ph.trim());
    if (w != null) return w;
    const s = ph.replace(/^(?:say|show|display|return|print|output|write|it is|its|the text|the word)\s+/, '').trim();
    const q = /^qq(\d+)qq$/.exec(s);
    if (q) return lit(this.quotes[Number(q[1])] ?? '');
    const t = this.term(s);
    return t !== null ? t : lit(s.replace(/qq(\d+)qq/g, (_, i: string) => this.quotes[Number(i)] ?? ''));
  }

  /** A single word or number on the right of a comparison. */
  token(ph: string): Sx | null {
    const t = this.term(ph);
    if (t !== null) return t;
    const s = stripArticles(ph);
    return /^[\w-]+$/.test(s) && !/^(?:is|are|was|be|the|a|an|and|or|not|of|to|in|on|between|than|then|if|when)$/.test(s) ? s : null;
  }

  // ── expressions ──

  term(ph: string, and = false): Sx | null {
    ph = ph.trim().replace(/^,+|,+$/g, '').trim();
    if (!ph || ph.length > 160) return null;
    const a = this.atom(ph);
    if (a !== null) return a;
    return this.percent(ph, true) ?? this.binary(ph, ADD) ?? this.binary(ph, MUL) ?? this.percent(ph, false) ?? this.special(ph)
      ?? (and ? this.binary(ph, AND) : null) ?? this.stripped(ph, and);
  }

  private stripped(ph: string, and: boolean): Sx | null {
    const s = stripArticles(ph);
    return s && s !== ph ? this.term(s, and) : null;
  }

  atom(ph: string): Sx | null {
    const w = this.word?.(ph);
    if (w != null) return w;
    const n = num(ph);
    if (n !== null) return n;
    const q = /^qq(\d+)qq$/.exec(ph);
    if (q) return lit(this.quotes[Number(q[1])] ?? '');
    if (/^(?:it|this|that|itself|the current (?:value|formula|result|code))$/.test(ph)) return this.ctx.it ?? null;
    if (/^(?:today|today date|the date today|date today|the current date|current date|todays date)$/.test(ph)) return ['today'];
    if (/^(?:now|right now|the time now|time now|the current time|current time)$/.test(ph)) return ['now'];
    const c = this.cell(ph);
    if (c) return ref(c);
    if (!/\s/.test(stripArticles(ph)) || /^(?:all|the|every)\s/.test(ph)) {
      const k = this.coll(ph);
      if (k) return ['rows', k];
    }
    return null;
  }

  private on(ph: string, f: (x: Sx) => Sx | null): Sx | null {
    const x = this.term(ph);
    return x === null ? null : f(x);
  }

  private on2(a: string, b: string, f: (x: Sx, y: Sx) => Sx | null): Sx | null {
    const x = this.term(a);
    if (x === null) return null;
    const y = this.term(b);
    return y === null ? null : f(x, y);
  }

  private apply(ph: string, rules: Rule[]): Sx | null {
    for (const [re, f] of rules) {
      const m = re.exec(ph);
      if (!m) continue;
      const r = f(m.slice(1).filter((v) => v !== undefined));
      if (r !== null) return r;
    }
    return null;
  }

  /** Percentages: "price with 19% vat" binds before plus/minus, "20% of total" after them. */
  private percent(ph: string, scaled: boolean): Sx | null {
    const scale = (base: string, pct: string, sign: 1 | -1): Sx | null => {
      const n = num(pct);
      if (n !== null) return this.on(base, (b) => ['*', b, tidy(1 + (sign * n) / 100)]);
      return this.on2(base, pct, (b, p) => ['*', b, [sign > 0 ? '+' : '-', 1, ['/', p, 100]]]);
    };
    if (scaled) return this.apply(ph, [
      [/^(.+?)\s+(?:minus|less|without|after|with|take away)\s+(?:a\s+)?(\S+)\s+percent\s+(?:off|discount|discounted|reduction|taken off|deducted)$/, ([b, p]) => scale(b, p, -1)],
      [/^(.+?)\s+(?:minus|less|without|take away)\s+(?:a\s+)?(\S+)\s+percent(?:\s+\w+)?$/, ([b, p]) => scale(b, p, -1)],
      [/^(.+?)\s+(?:plus|with|including|incl|inc|add|adding|and)\s+(?:a\s+)?(\S+)\s+percent(?:\s+(?:vat|tax|tip|markup|interest|fee|fees|surcharge|more|extra|added|on top))?$/, ([b, p]) => scale(b, p, 1)],
    ]);
    return this.apply(ph, [
      [/^(\S+)\s+percent\s+of\s+(.+)$/, ([p, b]) => {
        const n = num(p);
        return n !== null ? this.on(b, (x) => ['*', x, tidy(n / 100)]) : this.on2(b, p, (x, y) => ['*', x, ['/', y, 100]]);
      }],
      [/^(\S+)\s+percent$/, ([p]) => {
        const n = num(p);
        return n !== null ? tidy(n / 100) : this.on(p, (y) => ['/', y, 100]);
      }],
    ]);
  }

  /** Split at an operator word, trying the rightmost first so chains read left to right. */
  private binary(ph: string, ops: [string, string][]): Sx | null {
    const padded = ` ${ph} `;
    const hits: { at: number; w: string; op: string }[] = [];
    for (const [w, op] of ops) for (let i = padded.indexOf(w); i >= 0; i = padded.indexOf(w, i + 1)) hits.push({ at: i, w, op });
    hits.sort((p, q) => q.at - p.at);
    for (const h of hits) {
      const left = padded.slice(0, h.at).trim();
      const right = padded.slice(h.at + h.w.length).trim();
      if (!left || !right) continue;
      const l = this.term(left);
      if (l === null) continue;
      const r = this.term(right);
      if (r === null || isRows(l) || isRows(r)) continue;
      if ((h.op === '+' || h.op === '*') && Array.isArray(l) && l[0] === h.op && l.length > 2) return [...l, r];
      return [h.op, l, r];
    }
    return null;
  }

  private special(ph: string): Sx | null {
    return this.call(ph) ?? this.dates(ph) ?? this.math(ph) ?? this.text(ph) ?? this.format(ph) ?? this.lists(ph)
      ?? this.diagram(ph) ?? this.count(ph) ?? this.aggregate(ph) ?? this.records(ph);
  }

  /** Counting a diagram's elements: "how many shapes", "count the arrows in the flow". */
  private diagram(ph: string): Sx | null {
    const m = /^(?:count(?:\s+up)?|how\s+many|(?:the\s+)?(?:total\s+)?(?:number|count|amount)\s+of)\s+(?:the\s+|all\s+(?:the\s+)?)?([a-z]+)(?:\s+(?:in|on|of|inside|within)\s+(.+?))?(?:\s+(?:are there|there are|are drawn|does it have))?$/.exec(ph);
    const rule = m && ELEMENT_WORDS.find(([re]) => re.test(m[1]));
    if (!m || !rule) return null;
    let d: Cell | undefined;
    if (m[2]) {
      d = this.cell(stripArticles(m[2]).replace(/\s+diagram$/, ''));
      if (d?.kind !== 'diagram') return null;
    } else if (rule[1] && !/^lines?$/.test(m[1])) d = this.near('diagram')[0];
    if (!d) return null;
    const types = rule[1];
    if (!types) return ['len', ref(d)];
    const test: Sx = types.length === 1 ? ['=', ['get', '$it', 'type'], types[0]] : ['includes?', ['list', ...types], ['get', '$it', 'type']];
    return ['count-if', test, ref(d)];
  }

  /** A cell holding a function, applied: "tax of price" → (tax price). */
  private call(ph: string): Sx | null {
    const m = /^(?:apply\s+)?(?:the\s+)?([\w-]+)\s+(?:of|for|on|to|applied to)\s+(.+)$/.exec(ph) ?? /^apply\s+([\w-]+)\s+to\s+(.+)$/.exec(ph);
    const c = m && this.cell(m[1]);
    if (!m || !c?.name || typeof this.ctx.computed.cells[c.id]?.value !== 'function') return null;
    const args = this.items(m[2]);
    return args ? [c.name, ...args] : null;
  }

  private dates(ph: string): Sx | null {
    const span = (n: string, unit: string, sign: 1 | -1): number | null => {
      const k = n === 'a' || n === 'one' ? 1 : num(n);
      return k === null ? null : sign * k * (unit.startsWith('week') ? 7 : 1);
    };
    const shift = (d: string, n: string, unit: string, sign: 1 | -1) => {
      const k = span(n, unit, sign);
      return k === null ? null : this.on(d, (x) => ['date+', x, k]);
    };
    return this.apply(ph, [
      [/^(?:the\s+)?(?:number\s+of\s+)?days\s+(?:between|from)\s+(.+?)\s+(?:and|to|until|till)\s+(.+)$/, ([a, b]) => this.on2(a, b, (x, y) => ['days', x, y])],
      [/^(?:the\s+)?(?:number\s+of\s+)?days\s+(?:left\s+|remaining\s+)?(?:until|till|before|to)\s+(.+)$/, ([a]) => this.on(a, (x) => ['days', ['today'], x])],
      [/^(?:the\s+)?(?:number\s+of\s+)?days\s+since\s+(.+)$/, ([a]) => this.on(a, (x) => ['days', x, ['today']])],
      [/^(.+?)\s+(?:plus|and|add)\s+(\S+)\s+(days?|weeks?)$/, ([d, n, u]) => shift(d, n, u, 1)],
      [/^(.+?)\s+minus\s+(\S+)\s+(days?|weeks?)$/, ([d, n, u]) => shift(d, n, u, -1)],
      [/^(\S+)\s+(days?|weeks?)\s+(?:after|from|later than)\s+(.+)$/, ([n, u, d]) => shift(d, n, u, 1)],
      [/^(\S+)\s+(days?|weeks?)\s+(?:before|earlier than|prior to)\s+(.+)$/, ([n, u, d]) => shift(d, n, u, -1)],
      [/^in\s+(\S+)\s+(days?|weeks?)$/, ([n, u]) => { const k = span(n, u, 1); return k === null ? null : ['date+', ['today'], k]; }],
      [/^(?:the\s+)?(?:weekday|day\s+of\s+(?:the\s+)?week)\s+(?:of|for|on)\s+(.+)$/, ([a]) => this.on(a, (x) => ['weekday', x])],
      [/^what\s+day\s+(?:of\s+the\s+week\s+)?(?:is\s+)?(.+)$/, ([a]) => this.on(a, (x) => ['weekday', x])],
      [/^(?:the\s+)?(year|month)\s+(?:of|in|from)\s+(.+)$/, ([f, a]) => this.on(a, (x) => [f, x])],
      [/^(?:the\s+)?day\s+(?:of\s+the\s+month\s+)?(?:of|in|from)\s+(.+)$/, ([a]) => this.on(a, (x) => ['day', x])],
    ]);
  }

  private math(ph: string): Sx | null {
    const places = '(?:decimals?|decimal places?|places?|digits?|dp)';
    return this.apply(ph, [
      [/^half(?:\s+of)?\s+(.+)$/, ([a]) => this.on(a, (x) => ['/', x, 2])],
      [/^(?:a\s+)?third\s+of\s+(.+)$/, ([a]) => this.on(a, (x) => ['/', x, 3])],
      [/^(?:a\s+)?quarter\s+of\s+(.+)$/, ([a]) => this.on(a, (x) => ['/', x, 4])],
      [/^(?:double|twice)\s+(.+)$|^(.+?)\s+doubled$/, ([a]) => this.on(a, (x) => ['*', x, 2])],
      [/^triple\s+(.+)$|^(.+?)\s+tripled$/, ([a]) => this.on(a, (x) => ['*', x, 3])],
      [/^(.+?)\s+squared$|^(?:the\s+)?square\s+of\s+(.+)$/, ([a]) => this.on(a, (x) => ['^', x, 2])],
      [/^(.+?)\s+cubed$|^(?:the\s+)?cube\s+of\s+(.+)$/, ([a]) => this.on(a, (x) => ['^', x, 3])],
      [/^(.+?)\s+to\s+the\s+power\s+(?:of\s+)?(.+)$/, ([a, b]) => this.on2(a, b, (x, y) => ['^', x, y])],
      [/^(?:the\s+)?(?:square\s+)?root\s+of\s+(.+)$|^sqrt\s+(?:of\s+)?(.+)$/, ([a]) => this.on(a, (x) => ['sqrt', x])],
      [/^(?:the\s+)?absolute(?:\s+value)?\s+(?:of\s+)?(.+)$|^abs\s+(?:of\s+)?(.+)$/, ([a]) => this.on(a, (x) => ['abs', x])],
      [/^(?:the\s+)?(?:remainder|modulo|mod)\s+(?:of\s+)?(.+?)\s+(?:divided\s+by|by|over)\s+(.+)$/, ([a, b]) => this.on2(a, b, (x, y) => ['%', x, y])],
      [/^(?:the\s+)?difference\s+between\s+(.+?)\s+and\s+(.+)$/, ([a, b]) => this.on2(a, b, (x, y) => ['-', x, y])],
      [/^(?:the\s+)?product\s+of\s+(.+?)\s+and\s+(.+)$/, ([a, b]) => this.on2(a, b, (x, y) => ['*', x, y])],
      [/^(?:the\s+)?ratio\s+of\s+(.+?)\s+to\s+(.+)$/, ([a, b]) => this.on2(a, b, (x, y) => ['/', x, y])],
      [/^subtract\s+(.+?)\s+from\s+(.+)$/, ([a, b]) => this.on2(b, a, (x, y) => ['-', x, y])],
      [/^(?:negative|minus)\s+(.+)$/, ([a]) => this.on(a, (x) => ['-', x])],
      [new RegExp(`^round(?:ed)?\\s+(.+?)\\s+to\\s+(\\d+)\\s+${places}$|^(.+?)\\s+rounded\\s+to\\s+(\\d+)\\s+${places}$`), ([a, n]) => this.on(a, (x) => ['round', x, Number(n)])],
      [/^round\s+(.+?)\s+(up|down)$|^(.+?)\s+rounded\s+(up|down)$/, ([a, d]) => this.on(a, (x) => [d === 'up' ? 'ceil' : 'floor', x])],
      [/^round\s+(up|down)\s+(.+)$/, ([d, a]) => this.on(a, (x) => [d === 'up' ? 'ceil' : 'floor', x])],
      [/^round\s+(.+?)(?:\s+to\s+(?:the\s+)?nearest\s+(?:whole\s+number|integer|unit|1))?$|^(.+?)\s+rounded(?:\s+to\s+(?:a\s+)?whole\s+number)?$/, ([a]) => this.on(a, (x) => ['round', x])],
    ]);
  }

  private text(ph: string): Sx | null {
    const caps = '(?:upper\\s*case|uppercase|capitals|capital letters|caps|all caps|block letters)';
    const small = '(?:lower\\s*case|lowercase|small letters)';
    return this.apply(ph, [
      [/^(?:say\s+|greet(?:ing)?\s+)?(hello|hi|hey|welcome|dear|good morning|good afternoon|good evening|thanks|thank you|goodbye|bye)\s*(?:,\s*)?(?:and\s+|plus\s+|to\s+|then\s+|followed by\s+)?(.+)$/, ([g, a]) => this.on(a, (x) => ['str', cap(g) + ' ', x])],
      [/^greet\s+(.+)$/, ([a]) => this.on(a, (x) => ['str', 'Hello ', x])],
      [new RegExp(`^(?:the\\s+)?${caps}(?:\\s+version)?\\s+(?:of\\s+)?(.+)$|^(.+?)\\s+in\\s+${caps}$|^(?:make\\s+)?(.+?)\\s+${caps}$|^shout\\s+(.+)$`), ([a]) => this.on(a, (x) => ['upper', x])],
      [new RegExp(`^(?:the\\s+)?${small}(?:\\s+version)?\\s+(?:of\\s+)?(.+)$|^(.+?)\\s+in\\s+${small}$|^(?:make\\s+)?(.+?)\\s+${small}$`), ([a]) => this.on(a, (x) => ['lower', x])],
      [/^trim(?:med)?\s+(.+)$|^(.+?)\s+trimmed$|^(.+?)\s+without\s+(?:extra\s+)?spaces$/, ([a]) => this.on(a, (x) => ['trim', x])],
      [/^(?:join|combine|concatenate|put together)\s+(.+?)\s+(?:and|with)\s+(.+)$|^(.+?)\s+followed\s+by\s+(.+)$/, ([a, b]) => this.on2(a, b, (x, y) => (
        typeof x === 'string' && !x.startsWith('$') || typeof y === 'string' && !y.startsWith('$') ? ['str', x, y] : ['str', x, ' ', y]))],
    ]);
  }

  private format(ph: string): Sx | null {
    const m = /^(.+?)\s+(?:as|in|formatted as|shown as|displayed as|written as|with)\s+(?:a\s+|an\s+)?(.+)$/.exec(ph);
    if (!m) return null;
    const dec = /^(\d+)\s+decimals?(?:\s+places?)?$/.exec(m[2]);
    const fmt = dec ? (Number(dec[1]) ? '0.' + '0'.repeat(Number(dec[1])) : 'int') : FORMATS.find(([re]) => re.test(m[2]))?.[1];
    return fmt ? this.on(m[1], (x) => ['fmt', x, fmt]) : null;
  }

  private lists(ph: string): Sx | null {
    const range = /^(?:a\s+)?(?:list\s+of\s+)?(?:the\s+|all\s+(?:the\s+)?)?(?:numbers|integers|whole numbers|values|count|counting)?\s*(?:from\s+)?(-?[\d.]+)\s+(?:to|through|thru|until|up to)\s+(-?[\d.]+)(?:\s+(?:by|step|in steps of|every)\s+([\d.]+))?$/.exec(ph);
    if (range) {
      const [a, b, step] = [Number(range[1]), Number(range[2]), range[3] ? Number(range[3]) : null];
      return step ? ['range', a, tidy(b + 1), step] : ['range', a, tidy(b + 1)];
    }
    const desc = /\s+(?:desc(?:ending)?|largest first|biggest first|highest first|newest first|reversed)$/;
    return this.apply(ph, [
      [/^(?:a\s+)?list\s+of\s+(.+)$/, ([a]) => {
        const items = this.items(a);
        return items && items.length > 1 ? ['list', ...items] : null;
      }],
      [/^(?:the\s+)?(first|last)\s+(?:item|element|value|entry|one|thing|record|row)?\s*(?:of|in|from)\s+(.+)$/, ([w, a]) => this.from(a, (x) => [w, x])],
      [/^(?:the\s+)?(?:latest|newest|most recent)\s+(.+)$/, ([a]) => {
        const c = this.coll(a);
        return c ? ['last', ['rows', c]] : null;
      }],
      [/^(?:sort(?:ed)?|order(?:ed)?)\s+(.+)$|^(.+?)\s+(?:sorted|in order|ordered)(?:\s+desc(?:ending)?|\s+largest first|\s+biggest first|\s+highest first)?$/, ([a]) => this.from(a, (x) => (desc.test(ph) ? ['sort', x, 'desc'] : ['sort', x]))],
      [/^(?:reverse|reversed)\s+(.+)$|^(.+?)\s+(?:reversed|backwards)$/, ([a]) => this.from(a, (x) => ['reverse', x])],
      [/^(?:unique|distinct)\s+(.+)$|^(.+?)\s+without\s+duplicates$/, ([a]) => this.from(a, (x) => ['uniq', x])],
      [/^(.+?)\s+joined(?:\s+(?:with|by)\s+commas)?$/, ([a]) => this.from(a, (x) => ['join', x, ', '])],
    ]);
  }

  private from(ph: string, f: (x: Sx) => Sx): Sx | null {
    const src = this.source(ph);
    return src === null ? null : f(src);
  }

  /** A comma/and separated list of terms, or null when any item does not resolve. */
  items(ph: string): Sx[] | null {
    const parts = ph.split(/\s*,\s*(?:and\s+)?|\s+and\s+|\s+or\s+/).map((p) => p.trim()).filter(Boolean);
    let out = parts.map((p) => this.term(p));
    if (parts.length === 1 && out[0] === null) {
      const words = ph.split(' ');
      out = words.map((w) => this.term(w));
    }
    return out.every((x) => x !== null) ? (out as Sx[]) : null;
  }

  /** Something with rows: a collection (maybe filtered), a group, or a cell holding a list. */
  source(ph: string): Sx | null {
    const s = stripArticles(ph);
    const m = /^(.+?)\s+(?:where|with|whose|that have|that has|which have|which has|having)\s+(.+)$/.exec(s);
    if (m) {
      const c = this.coll(m[1]);
      if (c) {
        const w = this.where(c, m[2]);
        if (w) return w;
      }
    }
    const cell = this.cell(s);
    if (cell) return ref(cell);
    const c = this.coll(s);
    if (c) return ['rows', c];
    const t = this.term(s);
    return t;
  }

  where(coll: string, ph: string): Sx | null {
    const src: Sx = ['rows', coll];
    for (const [w, op] of COMPARE) {
      for (const [left, right] of splits(ph, w)) {
        const f = this.field(coll, left);
        const v = f && this.token(right);
        if (!f || v === null || v === '') continue;
        return op === '=' ? ['where', src, f, v] : ['filter', [op, ['get', '$it', f], v], src];
      }
    }
    const two = /^(\S+)\s+(\S+)$/.exec(ph);
    if (two) {
      const f = this.field(coll, two[1]);
      const v = this.token(two[2]);
      if (f && v !== null) return ['where', src, f, v];
    }
    return null;
  }

  private count(ph: string): Sx | null {
    const m = /^(?:the\s+)?(?:number|count|amount|total number)\s+of\s+(.+)$|^how\s+many\s+(.+?)(?:\s+(?:are there|there are|do we have|have been saved|are saved|saved|have i saved))?$|^count\s+(?:of\s+)?(.+)$|^(.+?)\s+count$|^(?:the\s+)?(?:length|size)\s+of\s+(.+)$/.exec(ph);
    if (!m) return null;
    let rest = m.slice(1).find((v) => v !== undefined)!;
    rest = rest.replace(/^(?:items|things|entries|elements|values|records|rows|letters|characters|chars)\s+(?:in|of|from)\s+/, '');
    const src = this.source(rest);
    return src === null ? null : ['len', src];
  }

  private aggregate(ph: string): Sx | null {
    const m = AGG_RE.exec(ph);
    if (!m) return null;
    const fn = AGG[m[1]];
    const rest = m[2];
    const col = /^(.+?)\s+column\s+(\d+)$/.exec(rest) ?? /^column\s+(\d+)\s+(?:of|in|from)\s+(.+)$/.exec(rest);
    if (col) {
      const [name, n] = /^column/.test(rest) ? [col[2], col[1]] : [col[1], col[2]];
      const g = this.group(name);
      if (g) return [fn, ['column', ref(g), Number(n)]];
    }
    for (const [left, right] of splits(rest, 'in', 'of', 'from', 'across', 'for')) {
      const where = /^(.+?)\s+(?:where|with|whose)\s+/.exec(right);
      const c = this.coll(where ? where[1] : right);
      if (c) {
        const f = this.field(c, left);
        const src = this.source(right);
        if (f && src !== null) return [fn, ['column', src, f]];
      }
      const g = this.group(right);
      if (g) {
        const i = this.column(g, left);
        if (i !== null) return [fn, ['column', ref(g), i]];
      }
    }
    const single = stripArticles(rest);
    const g = this.group(single);
    if (g) {
      if (!g.children!.some(isLines)) return [fn, ref(g)];
      const i = this.column(g);
      return i === null ? null : [fn, ['column', ref(g), i]];
    }
    const src = this.source(single);
    if (Array.isArray(src) && (src[0] === 'rows' || src[0] === 'where' || src[0] === 'filter')) {
      const c = src[0] === 'rows' ? src[1] : src[0] === 'where' ? (src[1] as Sx[])[1] : (src[2] as Sx[])[1];
      const f = this.numericField(String(c));
      return f ? [fn, ['column', src, f]] : null;
    }
    const items = this.items(rest);
    if (items && items.length > 1) return [fn, ...items];
    if (items && items.length === 1) {
      const c = typeof items[0] === 'string' ? this.ctx.idx.byName.get(items[0].slice(1)) ?? this.ctx.idx.byId.get(items[0].slice(1)) : undefined;
      if (c && Array.isArray(this.ctx.computed.cells[c.id]?.value)) return [fn, items[0]];
    }
    return null;
  }

  private records(ph: string): Sx | null {
    const desc = (w?: string) => !!w && /desc|largest|biggest|highest|newest|most/.test(w);
    return this.apply(ph, [
      [/^(?:the\s+)?(?:latest|last|newest|most recent|recent)\s+(\d+)\s+(.+)$|^(\d+)\s+(?:latest|newest|most recent|recent|last)\s+(.+)$/, ([n, a]) => this.from(a, (x) => ['take', Number(n), ['reverse', x]])],
      [/^(?:the\s+)?(?:first|oldest|earliest)\s+(\d+)\s+(.+)$/, ([n, a]) => this.from(a, (x) => ['take', Number(n), x])],
      [/^(?:the\s+)?(?:top|best|biggest|largest|highest)\s+(\d+)\s+(.+?)\s+by\s+(.+)$/, ([n, a, f]) => this.byField(a, f, (src, k) => ['take', Number(n), ['sort-by', ['get', '$it', k], src, 'desc']])],
      [/^(.+?)\s+(?:sorted|ordered|sort|order)\s+by\s+(.+?)(\s+(?:desc(?:ending)?|asc(?:ending)?|highest first|largest first|biggest first|newest first|lowest first|smallest first))?$/, ([a, f, d]) => this.byField(a, f, (src, k) => (desc(d) ? ['sort-by', ['get', '$it', k], src, 'desc'] : ['sort-by', ['get', '$it', k], src]))],
      [/^(.+?)\s+(?:grouped by|by|per)\s+(.+)$/, ([a, f]) => this.byField(a, f, (src, k) => ['group', src, k])],
      [/^(?:a\s+)?(?:list\s+of\s+)?(?:the\s+|all\s+(?:the\s+)?)?(.+?)\s+(?:of|in|from|for)\s+(?:every|each|all)?\s*(?:the\s+)?(.+)$/, ([f, a]) => this.byField(a, f, (src, k) => ['column', src, k])],
      [/^(.+?)\s+(?:where|with|whose|that have|which have|having)\s+(.+)$/, ([a, w]) => {
        const c = this.coll(a);
        return c ? this.where(c, w) : null;
      }],
    ]);
  }

  private byField(ph: string, field: string, f: (src: Sx, k: string) => Sx): Sx | null {
    const src = this.source(ph);
    if (!Array.isArray(src)) return null;
    const c = src[0] === 'rows' ? src[1] : src[0] === 'where' ? (src[1] as Sx[])[1] : src[0] === 'filter' ? (src[2] as Sx[])[1] : null;
    if (typeof c !== 'string') return null;
    const k = this.field(c, field);
    return k ? f(src, k) : null;
  }

  // ── conditions ──

  condition(ph: string, self?: string): Sx | null {
    ph = stripArticles(ph.trim());
    if (!ph) return null;
    const one = (p: string) => {
      const st = this.state(p);
      return st !== null ? { x: st, subject: undefined } : this.compare(p);
    };
    for (const [w, op] of [[' or ', 'or'], [' and ', 'and']] as const) {
      if (!ph.includes(w)) continue;
      const parts = ph.split(w);
      const out: Sx[] = [];
      let subject: string | undefined;
      for (const p of parts) {
        let c = one(p);
        if (c === null && subject) c = this.compare(`${subject} ${p}`) ?? this.compare(`${subject} is ${p}`);
        if (c === null) break;
        out.push(c.x);
        subject = c.subject ?? subject;
      }
      if (out.length === parts.length) return [op, ...out];
    }
    const neg = /^not\s+(.+)$/.exec(ph);
    if (neg) {
      const c = this.condition(neg[1], self);
      return c === null ? null : ['not', c];
    }
    const st = this.state(ph);
    if (st !== null) return st;
    const c = this.compare(ph);
    if (c) return c.x;
    const bare = this.term(ph);
    if (bare !== null) return bare;
    if (self) return this.compare(/^(?:is|are)\s/.test(ph) ? `${self} ${ph}` : `${self} is ${ph}`)?.x ?? null;
    return null;
  }

  /**
   * Conditions on what is open, tried before comparisons so "more is open" is not
   * (= more "open"): "the Details tab is open", "more is folded", "on the Details
   * tab", "view is Details" (keeping the title's case), "on step 2".
   */
  private state(ph: string): Sx | null {
    ph = stripArticles(ph.trim());
    const on = /^(?:on|in|at|inside|within)\s+(.+)$/.exec(ph);
    if (on) return this.state(on[1]);
    const m = /^(.+?)\s+(?:is\s+|are\s+)?(not\s+)?(open|opened|shown|showing|selected|active|visible|expanded|unfolded|closed|folded|collapsed|shut)$/.exec(ph);
    if (m) {
      const x = this.isOpen(m[1]);
      if (x !== null) return /^(?:closed|folded|collapsed|shut)$/.test(m[3]) === !m[2] ? negate(x) : x;
    }
    const eq = /^(.+?)\s+(?:is|equals)\s+(.+)$/.exec(ph);
    const tabs = eq && this.cell(stripArticles(eq[1]));
    if (eq && tabs?.kind === 'tabs') {
      const t = this.titleIn(tabs, eq[2]);
      if (t) return ['=', ref(tabs), t];
    }
    const nth = /^(.+?)\s+(-?\d+)$/.exec(ph);
    const counter = nth && this.counter(nth[1]);
    if (counter) return ['=', ref(counter), Number(nth![2])];
    return this.isOpen(ph, true);
  }

  private compare(ph: string): { x: Sx; subject?: string } | null {
    ph = ph.trim();
    const adj = /^(.+?)\s+(?:is\s+|are\s+)?(not\s+)?(empty|blank|negative|positive|below zero|above zero|checked|ticked|done|on|off|true|false|yes|no|set|filled in|unchecked|unticked)$/.exec(ph);
    if (adj && !this.cell(adj[3])) {
      const l = this.term(adj[1]);
      if (l !== null) {
        const w = adj[3];
        const x: Sx = w === 'empty' || w === 'blank' ? ['empty?', l]
          : w === 'negative' || w === 'below zero' ? ['<', l, 0]
          : w === 'positive' || w === 'above zero' ? ['>', l, 0]
          : ['off', 'false', 'no', 'unchecked', 'unticked'].includes(w) ? ['not', l]
          : w === 'set' || w === 'filled in' ? ['not', ['empty?', l]] : l;
        return { x: adj[2] ? (Array.isArray(x) && x[0] === 'not' ? x[1] : ['not', x]) : x, subject: adj[1] };
      }
    }
    const between = /^(.+?)\s+(?:is\s+|are\s+)?between\s+(.+?)\s+and\s+(.+)$/.exec(ph);
    if (between) {
      const [x, lo, hi] = [this.term(between[1]), this.token(between[2]), this.token(between[3])];
      if (x !== null && lo !== null && hi !== null) return { x: ['and', ['>=', x, lo], ['<=', x, hi]], subject: between[1] };
    }
    for (const [w, op] of COMPARE) {
      for (const [left, right] of splits(ph, w)) {
        const l = this.term(left);
        if (l === null) continue;
        const r = this.token(right);
        if (r === null) continue;
        return { x: [op, l, r], subject: left };
      }
    }
    return null;
  }

  ifThen(s: string): Sx | null {
    const blank = (v: Sx): Sx => (typeof v === 'number' ? 0 : '');
    let m = /^(?:if|when|whenever)\s+(.+?)\s*,?\s+(?:else|otherwise|or else|if not)\s*,?\s+(.+)$/.exec(s);
    if (m) {
      const ct = this.condThen(m[1]);
      if (ct) return ['if', ct[0], ct[1], this.value(m[2])];
    }
    m = /^(.+?)\s+if\s+(.+?)\s*,?\s+(?:else|otherwise)\s+(.+)$/.exec(s);
    if (m) {
      const c = this.condition(m[2]);
      if (c !== null) return ['if', c, this.value(m[1]), this.value(m[3])];
    }
    m = /^(?:if|when)\s+(.+)$/.exec(s);
    if (m) {
      const ct = this.condThen(m[1]);
      if (ct) return ['if', ct[0], ct[1], blank(ct[1])];
    }
    m = /^whether\s+(?:or\s+not\s+)?(.+)$/.exec(s);
    if (m) {
      const c = this.condition(m[1]);
      if (c !== null) return ['if', c, 'yes', 'no'];
    }
    return null;
  }

  private condThen(ph: string): [Sx, Sx] | null {
    const sep = /^(.+?)\s*,?\s+(?:then|say|show|display|return|print|write|it is|its|output)\s+(.+)$/.exec(ph) ?? /^(.+?)\s*,\s*(.+)$/.exec(ph);
    if (sep) {
      const c = this.condition(sep[1]);
      if (c !== null) return [c, this.value(sep[2])];
    }
    const words = ph.split(' ');
    for (let k = words.length - 1; k >= 1; k--) {
      const c = this.condition(words.slice(0, k).join(' '));
      if (c !== null) return [c, this.value(words.slice(k).join(' '))];
    }
    return null;
  }

  // ── targets other than a formula ──

  hidden(s: string): Sx | null {
    let neg = false;
    const hide = /^(?:hide|hidden|disappear)\b/.test(s);
    s = s.replace(/^(?:hide|hidden|disappear)(?:\s+(?:this|it|me|the cell|this cell))?\s*/, '');
    // "show only on the Details tab", "visible on step 2": the cell is hidden the rest of the time.
    const show = /^(?:show|visible|display|appear)(?:\s+(?:this|it|me|the cell|this cell))?\s+(?:only\s+)?(?:when|if|while|whenever|on|in|at|for)\s+(.+)$/.exec(s);
    // A bare "only when …" also means show only then; "hide only when …" keeps its word.
    const only = !hide && /^only\s+(?:when|if|while|whenever|on|in|at|for)\s+(.+)$/.exec(s);
    if (show) { neg = true; s = show[1]; } else if (only) { neg = true; s = only[1]; }
    const unless = /^(?:unless|until|except when)\s+(.+)$/.exec(s);
    if (unless) { neg = !neg; s = unless[1]; }
    s = s.replace(/^(?:when|if|while|whenever|as long as|only when|only if)\s+/, '');
    const self = this.ctx.cell ? this.ctx.cell.name ?? this.ctx.cell.id : undefined;
    const c = this.condition(s, self);
    if (c === null) return null;
    return neg ? negate(c) : c;
  }

  style(s: string): Sx | null {
    const bg = /\b(?:background|highlight|highlighted|fill|shade|shaded)\b/.test(s);
    s = s.replace(/\b(?:the\s+)?(?:background|text|font|colou?r)\b/g, ' ').replace(new RegExp(`\\b(?:in|with)\\s+(?=${COLOUR}\\b)`, 'g'), '')
      .replace(/\s+/g, ' ').trim();
    const tok = (w: string): Sx => {
      const t = COLOURS[w];
      return bg ? SOFT[t] ?? t : t;
    };
    const fallback: Sx = bg ? null : 'ink';
    const self = this.ctx.cell ? this.ctx.cell.name ?? this.ctx.cell.id : undefined;
    const lead = '(?:make\\s+(?:it|this)\\s+|turn\\s+(?:it\\s+)?|show\\s+(?:it\\s+)?|colou?r\\s+(?:it\\s+)?|be\\s+|it\\s+is\\s+|its\\s+|highlight\\s+(?:it\\s+)?)?';
    let m = new RegExp(`^${lead}${COLOUR}\\s+(?:when|if|while|whenever)\\s+(.+?)(?:\\s*,?\\s+(?:otherwise|else)\\s+${COLOUR})?$`).exec(s);
    if (m) {
      const c = this.condition(m[2], self);
      return c === null ? null : ['if', c, tok(m[1]), m[3] ? tok(m[3]) : fallback];
    }
    m = new RegExp(`^(?:when|if|while|whenever)\\s+(.+?)\\s*,?\\s+(?:then\\s+)?${lead}${COLOUR}(?:\\s*,?\\s+(?:otherwise|else)\\s+${COLOUR})?$`).exec(s);
    if (m) {
      const c = this.condition(m[1], self);
      return c === null ? null : ['if', c, tok(m[2]), m[3] ? tok(m[3]) : fallback];
    }
    m = new RegExp(`^${lead}${COLOUR}$`).exec(s);
    return m ? tok(m[1]) : null;
  }

  options(s: string): Sx | null {
    s = s.replace(/^(?:the\s+)?(?:options|choices|values|items)\s*(?:are|of|:)?\s*/, '').replace(/^(?:either|one of)\s+/, '').trim();
    const r = this.lists(s.replace(/\//g, ' to '));
    if (Array.isArray(r) && r[0] === 'range') return r;
    const m = /^(?:the\s+|all\s+(?:the\s+)?|every\s+)?(.+?)\s+(?:of|from|in)\s+(?:the\s+)?(?:saved\s+)?(.+)$/.exec(s);
    if (m) {
      const c = this.coll(m[2]);
      const f = c && this.field(c, m[1]);
      if (c && f) return ['uniq', ['column', ['rows', c], f]];
    }
    const cell = this.cell(stripArticles(s));
    if (cell && Array.isArray(this.ctx.computed.cells[cell.id]?.value)) return ref(cell);
    const parts = s.split(/\s*,\s*(?:and\s+|or\s+)?|\s+(?:and|or)\s+|\s*\/\s*|\s*\|\s*/).map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) return null;
    return ['list', ...parts.map((p): Sx => {
      const q = /^qq(\d+)qq$/.exec(p);
      if (q) return lit(this.quotes[Number(q[1])] ?? '');
      const n = num(p);
      return n !== null ? n : lit(cap(p));
    })];
  }

  // ── actions ──

  actions(s: string): Sx | null {
    s = s.replace(/^(?:when\s+(?:clicked|pressed|tapped)|on\s+click|it\s+should|this\s+should|the\s+button\s+should|please|(?:a|the|this)\s+button\s+(?:that|which|to)|(?:that|which|it)(?=\s+[a-z]+s\b))\s*,?\s*/, '');
    // "next" starts a new step only after a comma, so "go to the next step" stays whole.
    const clauses = s.split(/\s*(?:(?:,\s*)?\b(?:and then|then|after that|afterwards)\b|,\s*next\b)\s*,?\s*/)
      .flatMap((p) => p.split(new RegExp(`\\s*(?:,|\\band\\b)\\s+(?=(?:${VERBS})\\b)`)))
      .map((p) => p.trim()).filter(Boolean);
    const out: Sx[] = [];
    for (const c of clauses) {
      const a = this.act(present(c));
      if (a === null) return null;
      out.push(a);
    }
    return out.length === 1 ? out[0] : out.length ? ['do', ...out] : null;
  }

  /** Open (or close) a panel or a collapsible: "the Details tab", "Shipping", "more". */
  private open(ph: string, want: boolean, kinds = want ? ['tabs', 'accordion'] : ['accordion']): Sx | null {
    const p = this.panel(ph, kinds);
    if (p) {
      const name = p.box.name ?? p.box.id;
      const r = ref(p.box);
      if (!want) return ['set!', name, ['filter', ['!=', '$it', lit(p.title)], r]];
      // One title is accepted and means just that one open; any-number mode keeps the others.
      return p.box.kind === 'accordion' && p.box.multiple ? ['set!', name, ['uniq', ['concat', r, ['list', lit(p.title)]]]] : ['set!', name, lit(p.title)];
    }
    const c = this.fold(ph);
    if (c) return ['set!', c.name ?? c.id, want];
    const acc = want ? undefined : this.accordion(ph);
    return acc ? ['set!', acc.name ?? acc.id, ['list']] : null;
  }

  /** Step a counter, or tabs, forwards or back: "next step", "previous tab". */
  private step(noun: string, dir: 1 | -1, by: number, limit?: number): Sx | null {
    const n = this.counter(noun);
    if (n) {
      const next: Sx = [dir > 0 ? '+' : '-', ref(n), by];
      return ['set!', n.name ?? n.id, limit === undefined ? next : [dir > 0 ? 'min' : 'max', next, limit]];
    }
    const s = stripArticles(noun);
    const named = /^(?:tab|tabs|page)\s+(?:in|of|on)\s+(.+)$/.exec(s) ?? /^(.+?)\s+tab$/.exec(s);
    const tabs = named ? this.cell(stripArticles(named[1])) : /^(?:tab|page)$/.test(s) ? this.near('tabs')[0] : undefined;
    if (tabs?.kind !== 'tabs' || by !== 1) return null;
    // The title after the open one; on the last tab it stays put.
    const titles = dir > 0 ? panelTitles(tabs) : panelTitles(tabs).reverse();
    if (titles.length < 2) return null;
    const r = ref(tabs);
    return ['set!', tabs.name ?? tabs.id, ['cond', ...titles.slice(0, -1).flatMap((t, i): Sx[] => [['=', r, lit(t)], lit(titles[i + 1])]), r]];
  }

  /** A record to save or send: "everything", or "client and total as amount". */
  record(ph: string): Record<string, Sx> | null {
    if (/^(?:everything|all|all fields|all the fields|all inputs|all the inputs|every field|the form|this form|it|this|the values|all values)$/.test(ph)) {
      const rec: Record<string, Sx> = {};
      walk(this.ctx.doc.root, (cell) => {
        if (!cell.name || isGroup(cell) || (cell.kind !== 'input' && cell.kind !== 'formula')) return;
        if (typeof this.ctx.computed.cells[cell.id]?.value === 'function') return;
        rec[cell.name] = ref(cell);
      });
      return Object.keys(rec).length ? rec : null;
    }
    const parts = ph.split(/\s*,\s*(?:and\s+)?|\s+and\s+/).map((p) => p.trim()).filter(Boolean);
    const rec: Record<string, Sx> = {};
    for (const p of parts) {
      const alias = /^(.+?)\s+as\s+([a-z][\w-]*)$/.exec(p);
      const cell = this.cell(stripArticles(alias ? alias[1] : p));
      if (cell) { rec[alias ? alias[2] : cell.name ?? cell.id] = ref(cell); continue; }
      const t = alias ? this.term(alias[1]) : null;
      if (t === null) return null;
      rec[alias![2]] = t;
    }
    return Object.keys(rec).length ? rec : null;
  }

  act(c: string): Sx | null {
    const line = (g: string | undefined, which: string | undefined): Sx | null => {
      const group = g ? this.group(g) : this.lines();
      if (!group) return null;
      const i = which === 'first' || which === 'top' ? 0 : -1;
      return ['child', group.name ?? group.id, i];
    };
    const bump = (cell: Cell, by: Sx, sign: '+' | '-'): Sx => ['set!', cell.name ?? cell.id, [sign, ref(cell), by]];
    const blank = (cell: Cell): Sx => {
      if (cell.kind === 'data') {
        // A data cell has no type or default, so its current value says what blank is.
        const v = this.ctx.computed.cells[cell.id]?.value;
        if (typeof v === 'number') return ORDINAL.test(canon(cell.name ?? '')) ? 1 : 0;
        return typeof v === 'boolean' ? false : Array.isArray(v) ? ['list'] : v && typeof v === 'object' ? {} : typeof v === 'string' ? '' : null;
      }
      const t = cell.type ?? 'text';
      return t === 'number' || t === 'slider' || t === 'rating' ? 0 : t === 'checkbox' || t === 'toggle' ? false : '';
    };
    const by = (w: string | undefined): number | null => (w === undefined || w === 'a' || w === 'an' ? 1 : num(w));
    const collName = (ph: string): string | null => {
      const s = stripArticles(ph).replace(/^(?:saved\s+)?/, '').replace(/\s+(?:collection|list|table|records)$/, '');
      if (this.cell(s)) return null;
      return this.coll(s) ?? (/^[a-z][\w-]*$/.test(s) ? s : null);
    };
    const record = (ph: string) => this.record(ph);

    const limit = '(?:\\s*,?\\s*(?:but\\s+)?(?:not\\s+(?:past|beyond|above|below|under)|up\\s+to|down\\s+to|at\\s+most|at\\s+least|no\\s+(?:further|more|less|lower|higher)\\s+than)\\s+(-?\\d+))?';
    return this.apply(c, [
      // counters and tabs, step by step: "go to the next step", "previous tab", "go back a step"
      [new RegExp(`^(?:(?:go|move|jump|skip|advance|continue|proceed|switch|step)\\s+(?:back\\s+|on\\s+|ahead\\s+)?(?:to\\s+)?)?(?:the\\s+)?(next|following|previous|prev|prior)\\s+(.+?)${limit}$`), ([w, x, n]) => (
        this.step(x, /^(?:next|following)$/.test(w) ? 1 : -1, 1, n === undefined ? undefined : Number(n)))],
      [new RegExp(`^(?:(?:go|move|jump|skip|step)\\s+)?(back|backward|backwards|forward|forwards|ahead)\\s+(?:(a|an|\\d+)\\s+)?(.+?)${limit}$`), ([w, ...rest]) => {
        // apply drops the groups that did not match, so work out which of count, noun and limit are here.
        const [k, x, n] = rest.length === 3 ? rest : rest.length === 1 ? [undefined, rest[0]] : num(rest[1]) !== null ? [undefined, ...rest] : rest;
        const step = by(k);
        return step === null || x === undefined ? null : this.step(x, w.startsWith('back') ? -1 : 1, step, n === undefined ? undefined : Number(n));
      }],
      [/^(.+?)\s+(back|backward|backwards|forward|forwards|ahead)$/, ([x, w]) => this.step(x, w.startsWith('back') ? -1 : 1, 1)],
      [/^(?:go|jump|skip|move|switch)\s+(?:back\s+)?to\s+(?:the\s+)?(.+?)\s+(-?\d+)$/, ([x, n]) => {
        const cell = this.counter(x);
        return cell ? ['set!', cell.name ?? cell.id, Number(n)] : null;
      }],
      // what is open: tabs, accordion sections, collapsibles
      [/^(?:close|collapse|fold|shut|hide)\s+(?:up\s+)?(?:all|every|each|everything)(?:\s+(?:of\s+)?(?:the\s+)?(?:sections?|panels?|parts?))?(?:\s+(?:in|of)\s+(.+))?$/, ([x]) => {
        const acc = this.accordion(x);
        return acc ? ['set!', acc.name ?? acc.id, ['list']] : null;
      }],
      [/^(?:open|expand|unfold|show)\s+(?:all|every|each|everything)(?:\s+(?:of\s+)?(?:the\s+)?(?:sections?|panels?|parts?))?(?:\s+(?:in|of)\s+(.+))?$/, ([x]) => {
        const acc = this.accordion(x, true);
        return acc ? ['set!', acc.name ?? acc.id, ['list', ...panelTitles(acc).map(lit)]] : null;
      }],
      // Tabs are opened, not expanded: "expand the details" means a section or a collapsible.
      [/^(?:expand|unfold)\s+(.+)$/, ([x]) => this.open(x, true, ['accordion'])],
      [/^(?:open|show|view|display|select|pick|choose|activate|reveal|bring\s+up|go\s+(?:back\s+)?to|switch\s+to|jump\s+to|move\s+to|take\s+me\s+to)\s+(.+)$/, ([x]) => this.open(x, true)],
      [/^(?:close|hide|fold|collapse|shut|fold\s+up|minimi[sz]e)\s+(.+)$/, ([x]) => this.open(x, false)],
      // lines in a group of rows
      [/^(?:add|insert|append|create)\s+(?:a|an|another|1|new|a new)\s+(?:line|row|item|entry)(?:\s+(?:to|in|into|at the end of)\s+(.+))?$|^new\s+(?:line|row|item|entry)$/, ([g]) => {
        const p = line(g, 'last');
        return p ? ['dup!', p] : null;
      }],
      [/^(?:duplicate|copy|repeat)\s+(?:the\s+)?(last|first|final|top|bottom)\s+(?:line|row|item|entry)(?:\s+(?:of|in|from)\s+(.+))?$/, ([w, g]) => {
        const p = line(g, w);
        return p ? ['dup!', p] : null;
      }],
      [/^(?:remove|delete|drop)\s+(?:the\s+)?(last|first|final|top|bottom)\s+(?:line|row|item|entry)(?:\s+(?:of|in|from)\s+(.+))?$/, ([w, g]) => {
        const p = line(g, w);
        return p ? ['remove!', p] : null;
      }],
      // numbers
      [/^(?:add|plus|put)\s+(.+?)\s+(?:to|onto|on)\s+(.+)$/, ([v, x]) => {
        const cell = this.settable(x);
        const by = cell ? this.term(v) : null;
        return cell && by !== null ? bump(cell, by, '+') : null;
      }],
      [/^(?:increase|raise|increment|bump|grow|up)\s+(.+?)(?:\s+by\s+(.+))?$/, ([x, v]) => {
        const cell = this.settable(x);
        const by = v === undefined ? 1 : this.term(v);
        return cell && by !== null ? bump(cell, by, '+') : null;
      }],
      [/^(?:decrease|lower|decrement|reduce|shrink|drop)\s+(.+?)(?:\s+by\s+(.+))?$/, ([x, v]) => {
        const cell = this.settable(x);
        const by = v === undefined ? 1 : this.term(v);
        return cell && by !== null ? bump(cell, by, '-') : null;
      }],
      [/^(?:subtract|take|remove|deduct)\s+(.+?)\s+(?:from|off)\s+(.+)$/, ([v, x]) => {
        const cell = this.settable(x);
        const by = cell ? this.term(v) : null;
        return cell && by !== null ? bump(cell, by, '-') : null;
      }],
      [/^double\s+(.+)$/, ([x]) => { const cell = this.settable(x); return cell ? ['set!', cell.name ?? cell.id, ['*', ref(cell), 2]] : null; }],
      [/^halve\s+(.+)$/, ([x]) => { const cell = this.settable(x); return cell ? ['set!', cell.name ?? cell.id, ['/', ref(cell), 2]] : null; }],
      // records
      [/^(?:save|store|record|log|insert|add|put|append|write|send|copy)\s+(.+?)\s+(?:to|into|in|as)\s+(?:a\s+new\s+record\s+in\s+)?(.+)$/, ([what, where]) => {
        const name = collName(where);
        const rec = name ? record(stripArticles(what) || what) : null;
        return name && rec ? ['insert!', name, rec] : null;
      }],
      [/^(?:save|store|record|log)(?:\s+(?:this|the|a|it))?(?:\s+([a-z][\w-]*))?$/, ([w]) => {
        const name = w ? this.coll(w) ?? (this.cell(w) ? null : w.endsWith('s') ? w : w + 's') : null;
        const rec = record('everything');
        return name && rec ? ['insert!', name, rec] : null;
      }],
      [/^(?:delete|remove|drop|clear|empty|wipe|erase)\s+(?:all|every|each)\s+(?:of\s+)?(?:the\s+)?(?:saved\s+)?(?:(?:records|rows|entries)\s+(?:in|from|of)\s+)?(.+)$/, ([w]) => {
        const k = this.coll(w);
        return k ? ['clear!', k] : null;
      }],
      // inputs, data cells and containers
      [/^(?:set|change|make|update|put|turn)\s+(.+?)\s+(?:to|equal to|equals|as|into)\s+(.+)$|^(.+?)\s+(?:becomes|equals)\s+(.+)$/, ([x, v]) => {
        const box = this.cell(stripArticles(x));
        if (box?.kind === 'tabs' || box?.kind === 'accordion') {
          const t = this.titleIn(box, v);
          return t ? ['set!', box.name ?? box.id, lit(t)] : null;
        }
        if (box?.kind === 'collapsible' && /^(?:open|closed|folded|unfolded|true|false)$/.test(v)) return ['set!', box.name ?? box.id, /^(?:open|unfolded|true)$/.test(v)];
        const cell = this.settable(x);
        if (!cell) return null;
        const t = cell.type ?? 'text';
        const bool = t === 'checkbox' || t === 'toggle' || (cell.kind === 'data' && typeof this.ctx.computed.cells[cell.id]?.value === 'boolean');
        if (bool && /^(?:on|off|true|false|yes|no|checked|unchecked|ticked|unticked|done)$/.test(v)) {
          return ['set!', cell.name ?? cell.id, /^(?:on|true|yes|checked|ticked|done)$/.test(v)];
        }
        return ['set!', cell.name ?? cell.id, this.value(v)];
      }],
      [/^(?:reset|clear|empty|blank|zero|wipe|erase)\s+(?:out\s+)?(.+)$/, ([x]) => {
        const cell = this.settable(x);
        if (cell) return ['set!', cell.name ?? cell.id, blank(cell)];
        // Tabs go back to the first tab, an accordion closes.
        const box = this.cell(stripArticles(x));
        if (box?.kind === 'tabs') return ['set!', box.name ?? box.id, lit(panelTitles(box)[0])];
        if (box?.kind === 'accordion') return ['set!', box.name ?? box.id, ['list']];
        const k = this.coll(x);
        return k ? ['clear!', k] : null;
      }],
      [/^(?:toggle|flip|switch)\s+(.+?)(?:\s+(?:on or off|over|around|open or closed|open or shut))?$/, ([x]) => {
        const cell = this.settable(x) ?? this.fold(x);
        if (cell) return ['toggle!', cell.name ?? cell.id];
        const p = this.panel(x, ['accordion']);
        if (!p) return null;
        const [name, r, t] = [p.box.name ?? p.box.id, ref(p.box), p.title];
        const opened: Sx = p.box.multiple ? ['concat', r, ['list', lit(t)]] : lit(t);
        return ['set!', name, ['if', ['includes?', r, t], ['filter', ['!=', '$it', t], r], opened]];
      }],
      [/^(?:check|tick|turn on|switch on|enable)\s+(.+)$|^mark\s+(.+?)\s+(?:as\s+)?(?:done|complete|finished|checked)$/, ([x]) => { const cell = this.settable(x); return cell ? ['set!', cell.name ?? cell.id, true] : null; }],
      [/^(?:uncheck|untick|turn off|switch off|disable)\s+(.+)$/, ([x]) => { const cell = this.settable(x); return cell ? ['set!', cell.name ?? cell.id, false] : null; }],
      // whole cells
      [/^(?:duplicate|copy)\s+(.+)$/, ([x]) => { const cell = this.cell(stripArticles(x)); return cell ? ['dup!', cell.name ?? cell.id] : null; }],
      [/^(?:remove|delete)\s+(.+)$/, ([x]) => {
        const cell = this.cell(stripArticles(x));
        if (cell) return ['remove!', cell.name ?? cell.id];
        const k = this.coll(x);
        return k ? ['clear!', k] : null;
      }],
    ]);
  }
}

const OPPOSITE: Record<string, string> = { '>': '<=', '<=': '>', '<': '>=', '>=': '<', '=': '!=', '!=': '=' };

/** The opposite condition, written plainly: (> a b) becomes (<= a b), (not x) becomes x. */
function negate(c: Sx): Sx {
  if (Array.isArray(c) && c[0] === 'not') return c[1];
  if (Array.isArray(c) && typeof c[0] === 'string' && OPPOSITE[c[0]] && c.length === 3) return [OPPOSITE[c[0]], c[1], c[2]];
  return ['not', c];
}

const isRows = (x: Sx) => Array.isArray(x) && ['rows', 'where', 'filter', 'take', 'sort-by', 'group'].includes(x[0] as string);

/** Every way to cut `s` around one of the words, rightmost first. */
function splits(s: string, ...words: string[]): [string, string][] {
  const out: [number, string, string][] = [];
  const padded = ` ${s} `;
  for (const w of words) {
    const needle = ` ${w} `;
    for (let i = padded.indexOf(needle); i >= 0; i = padded.indexOf(needle, i + 1)) {
      const l = padded.slice(0, i).trim();
      const r = padded.slice(i + needle.length).trim();
      if (l && r) out.push([i, l, r]);
    }
  }
  return out.sort((a, b) => b[0] - a[0]).map(([, l, r]) => [l, r]);
}

/** The built-in composer: an expression (or for `events`, ops) for the prompt, or null when no phrasing matched. */
export function composeLocal(ctx: Ctx, prompt: string): Answer | null {
  if (ctx.target === 'events') {
    let ops: Op[] | null = null;
    try { ops = new Sentences(ctx).run(prompt); } catch { ops = null; }
    if (!ops) return null;
    try { return accept(ctx, ops); } catch { return null; }
  }
  let expr: Sx | null = null;
  try {
    const event = eventOf(ctx.target);
    expr = event ? new Sentences(ctx).handler(prompt, event) : ctx.target === 'action' ? new Sentences(ctx).action(prompt) : new Local(ctx).run(prompt);
  } catch { expr = null; }
  if (expr === null) return null;
  try { validate(ctx, expr, ctx.target); } catch { return null; }
  return { expr, explanation: explain(ctx, expr) };
}

// ───────────────────────────── events: handlers, actions and timers from a sentence ─────────────────────────────

/** Event words as people write them, and the event each means. "on"/"off": ticked or unticked. */
const PHRASES: [string, string, ('on' | 'off')?][] = [
  ['is double[ -]?clicked|gets double[ -]?clicked|is double[ -]?tapped|double[ -]?clicked', 'dblclick'],
  ['is clicked|is pressed|is tapped|is pushed|gets clicked|gets pressed|clicked|pressed|tapped', 'click'],
  ['fails to load|fails to fetch|fails|does not load|cannot load|can not load|errors|goes wrong', 'fail'],
  ['loads|is loaded|has loaded|arrives|is fetched|comes in|comes back|is refreshed', 'load'],
  ['is ticked|is checked|are ticked|are checked|is done|are done|is complete|are complete|is turned on|is switched on|gets ticked|gets checked', 'change', 'on'],
  ['is unticked|is unchecked|is turned off|is switched off|gets unticked|gets unchecked', 'change', 'off'],
  ['changes|is changed|has changed|changed|is edited|is updated|updates|is set', 'change'],
  ['is picked|is selected|is chosen|gets picked|gets selected|picked|selected|chosen', 'pick'],
  ['opens|is opened|opened|is started', 'open'],
  ['closes|is closed|closed|is left|is folded', 'close'],
  ['ticks|goes off', 'tick'],
  ['happens|is sent|is emitted|is fired|fires|is announced|is raised|occurs|is heard|comes', 'custom'],
];
const PHRASE_RES = PHRASES.map(([src, event, flag]) => [new RegExp(`^(?:${src})$`), event, flag] as const);
const HEAD = new RegExp(`^(?:when|whenever|once|as soon as|each time|every time)\\s+(?:(.+?)\\s+)?(${PHRASES.map((p) => p[0]).join('|')})(?=$|[\\s,])\\s*,?\\s*(?:then\\s+)?(.*)$`);
const ON = /^on\s+(double[ -]?clicks?|dblclick|clicks?|taps?|change|changes|open|opening|close|closing|load|loading|fail|failure|tick|pick|[a-z][\w-]*)\s*,?\s*(.+)$/;
const ON_WORDS: Record<string, string> = { tap: 'click', taps: 'click', clicks: 'click', changes: 'change', opening: 'open', closing: 'close', loading: 'load', failure: 'fail' };
const UNITS = '(seconds?|secs?|minutes?|mins?|hours?|hrs?)';
const unitSeconds = (u: string) => (u.startsWith('h') ? 3600 : u.startsWith('m') ? 60 : 1);
/** Verbs that start a new clause: "save it to done and show the note". */
const EVENT_VERBS = `${VERBS}|fetch|refresh|reload|warn|alert|flag|send|emit|broadcast|announce|fire|raise|call|run|trigger|start|stop|pause|restart|reveal|unhide|set`;
const EVENT_VERB_SET = new Set(EVENT_VERBS.split('|'));
/** A marker on names a handler finds bound, so a cell of the same name can be told apart afterwards. */
const BOUND = '$\u0001';

/** "sends saved" reads as "send saved". */
function presentE(clause: string): string {
  const w = /^[a-z]+/.exec(clause)?.[0];
  if (!w || EVENT_VERB_SET.has(w)) return clause;
  const base = [w.replace(/es$/, ''), w.replace(/s$/, '')].find((b) => b !== w && EVENT_VERB_SET.has(b));
  return base ? base + clause.slice(w.length) : clause;
}

function clauses(s: string): string[] {
  return s.split(/\s*(?:,\s*)?\b(?:and then|then|after that|afterwards)\b\s*,?\s*/)
    .flatMap((p) => p.split(new RegExp(`\\s*(?:,\\s*(?:and\\s+)?|\\band\\s+)(?=(?:${EVENT_VERBS})(?:e?s)?\\b)`)))
    .map((p) => p.trim()).filter(Boolean);
}

/** Marked bound names back to plain ones; a cell named like a bound name is read with (ref name). */
function unmark(x: Sx, bound: Set<string>): Sx {
  if (typeof x === 'string') {
    if (x.startsWith(BOUND)) return '$' + x.slice(BOUND.length);
    return x.startsWith('$') && bound.has(x.slice(1)) ? ['ref', x.slice(1)] : x;
  }
  if (Array.isArray(x)) return x[0] === 'quote' ? x : x.map((y) => unmark(y, bound));
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, unmark(v, bound)]));
  return x;
}

/**
 * The built-in composer for events. It reads one sentence at a time and turns
 * each into ops on a working copy of the document, so a later sentence sees
 * what an earlier one made (a timer, an action, a data cell).
 */
class Sentences {
  doc: Doc;
  ops: Op[] = [];
  quotes: string[] = [];
  /** The handlers this prompt attaches, by "cell event", so two sentences for one event run both. */
  private attached = new Map<string, Sx>();

  constructor(readonly base: Ctx) {
    this.doc = base.doc;
  }

  private ctxFor(cell: Cell | null, target: Target): Ctx {
    return context(this.doc, this.base.world, [...this.base.collections.keys()], { target, cell: cell?.id });
  }

  /** A phrase reader for a handler on `cell` for `event` (or for an action, event ''), with what it finds bound. */
  private local(cell: Cell | null, event: string, params: string[] = []): Local {
    const l = new Local(this.ctxFor(cell, event ? `on.${event}` : 'do'));
    l.quotes = this.quotes;
    l.word = this.words(l, cell, event, params);
    return l;
  }

  private bound(cell: Cell | null, event: string, params: string[]): Set<string> {
    // A timer's tick is composed before the timer exists.
    const holder = cell ?? (event === 'tick' ? ({ id: '', kind: 'timer' } as Cell) : null);
    return new Set([...(event ? eventVars(holder, event) : []), ...params]);
  }

  private push(...ops: Op[]): void {
    this.doc = applyOps(this.doc, ops).doc;
    this.ops.push(...ops);
  }

  private read(prompt: string): string {
    const { s, quotes } = normalize(prompt, this.base);
    this.quotes = quotes;
    return s.replace(/^(?:please|can you|could you|i want|i would like|id like|make it so that|make sure that|make sure|so that)\s+/, '').replace(/\s+please$/, '');
  }

  // ── the three targets ──

  /** `events`: every sentence of the prompt, as ops; null when one is not understood. */
  run(prompt: string): Op[] | null {
    const parts = prompt.split(/(?<=[.;!?])\s+|\n+/).map((p) => p.trim()).filter(Boolean);
    for (const p of parts) if (!this.sentence(this.read(p))) return null;
    return this.ops.length ? this.ops : null;
  }

  /** `on.<event>`: the action, from "add 1 to clicks" or a whole sentence about that event. */
  handler(prompt: string, event: string): Sx | null {
    const cell = this.base.cell ?? null;
    const s = this.read(prompt);
    if (/^(?:when|whenever|once|each time|every time|on|after|every|each)\s/.test(s) && this.sentence(s)) {
      const key = `${cell ? cell.id : ''} ${event}`;
      return this.attached.size === 1 && this.attached.has(key) ? this.attached.get(key)! : null;
    }
    return this.body(cell, event, s);
  }

  /** `action`: (fn (params…) body…), from "takes who and sets hello to who" or "make an action called … that …". */
  action(prompt: string): Sx | null {
    const s = this.read(prompt);
    const named = this.defining(s);
    if (named) return named.fn;
    return this.fn(s.replace(/^(?:an?\s+)?(?:custom\s+)?action\s+(?:that|which|to)\s+/, '').replace(/^(?:it\s+)?(?:should\s+)?/, ''));
  }

  // ── sentences ──

  private sentence(s: string): boolean {
    if (!s) return false;
    const def = this.defining(s);
    if (def) {
      this.push(['meta', `actions.${def.name}`, def.fn as Json]);
      return true;
    }
    let m = new RegExp(`^(?:every|each|once\\s+(?:a|an|every))\\s+(?:(\\S+)\\s+)?${UNITS}\\b\\s*,?\\s*(?:then\\s+)?(.+)$`).exec(s);
    if (m) return this.every(m[1], m[2], m[3]);
    m = new RegExp(`^(?:after|in|wait)\\s+(\\S+)\\s+${UNITS}\\b\\s*,?\\s*(?:then\\s+)?(.+)$`).exec(s);
    if (m) return this.after(m[1], m[2], m[3]);
    m = HEAD.exec(s);
    if (m) {
      const [, subj, phrase, rest] = m;
      const p = PHRASE_RES.find(([re]) => re.test(phrase));
      const who = p && this.subject(subj, p[1], p[2]);
      return !!who && !!rest && this.attach(who.cell, who.event, rest, who.cond);
    }
    m = ON.exec(s);
    if (m) {
      const w = m[1].replace(/^double[ -]?clicks?$/, 'dblclick');
      const event = ON_WORDS[w] ?? (w === 'click' ? 'click' : w);
      const who = this.subject(undefined, BUILTIN_EVENTS.has(event) ? event : 'custom', undefined, event);
      return !!who && this.attach(who.cell, who.event, m[2]);
    }
    return false;
  }

  /** How many seconds "5 minutes" or "a minute" is. */
  private seconds(n: string | undefined, unit: string): number | null {
    const k = n === undefined || n === 'a' || n === 'an' || n === 'one' ? 1 : num(n);
    return k === null || k <= 0 ? null : tidy(k * unitSeconds(unit));
  }

  /** "Every minute fetch the rate and warn …": the fetch refreshes that often; otherwise a new timer runs the actions. */
  private every(n: string | undefined, unit: string, rest: string): boolean {
    const secs = this.seconds(n, unit);
    if (secs === null) return false;
    const [first, ...more] = clauses(rest);
    const f = /^(?:fetch|refresh|reload|update|re-?fetch|get|check)\s+(.+?)(?:\s+again|\s+now)?$/.exec(presentE(first ?? ''));
    const fetch = f ? this.kindCell(f[1], 'fetch') : undefined;
    if (fetch && secs >= 5) {
      const name = fetch.name ?? fetch.id;
      const load = more.length ? this.body(fetch, 'load', more.join(' and ')) : null;
      if (more.length && load === null) return false;
      this.push(['set', name, 'every', secs]);
      return load === null || this.put(fetch, 'load', load);
    }
    const tick = this.body(null, 'tick', rest);
    if (tick === null) return false;
    const name = this.free(`every-${sayEvery(secs).replace(/\s+/g, '-')}`);
    this.add(['timer', { name, every: secs, on: { tick: tick as Json } }]);
    return true;
  }

  /** "After 5 seconds show the welcome note": a new timer that ticks once. */
  private after(n: string, unit: string, rest: string): boolean {
    const secs = this.seconds(n, unit);
    const tick = secs === null ? null : this.body(null, 'tick', rest);
    if (tick === null) return false;
    const name = this.free(`after-${sayFor(secs!).replace(/\s+/g, '-')}`);
    this.add(['timer', { name, after: secs, on: { tick: tick as Json } }]);
    return true;
  }

  /** "an action called reset that sets qty to 0 and clears note" → its name and (fn () …). */
  private defining(s: string): { name: string; fn: Sx } | null {
    const m = /^(?:make|create|define|add|write|set up|give me)\s+(?:me\s+)?(?:a\s+new\s+|a\s+|an\s+|the\s+)?(?:custom\s+)?action\s+(?:called|named)\s+(qq\d+qq|[a-z][\w-]*)\s*,?\s*(.*)$/.exec(s)
      ?? /^(?:an?\s+)?(?:custom\s+)?action\s+(?:called|named)\s+(qq\d+qq|[a-z][\w-]*)\s*,?\s*(.*)$/.exec(s);
    if (!m) return null;
    const name = this.unq(m[1]);
    if (!NAME_RE.test(name) || isBuiltin(name)) return null;
    const fn = this.fn(m[2].replace(/^(?:that|which|to|so that it|so it|and it|it)\s+/, ''));
    return fn ? { name, fn } : null;
  }

  /** "takes who and sets hello to who" → (fn (who) (set! hello who)). */
  private fn(s: string): Sx | null {
    let params: string[] = [];
    const m = /^(?:takes|accepts|gets|receives|with|taking|given|has)\s+(?:an?\s+|the\s+)?(?:parameters?\s+|inputs?\s+|arguments?\s+)?([a-z][\w-]*(?:\s*(?:,\s*(?:and\s+)?|\s+and\s+)[a-z][\w-]*)*)\s*(?:,\s*(?:and\s+)?(?:then\s+)?|\s+and\s+(?:then\s+)?|\s+then\s+)(.+)$/.exec(s);
    if (m) {
      params = m[1].split(/\s*,\s*(?:and\s+)?|\s+and\s+/).filter(Boolean);
      if (params.some((p) => !NAME_RE.test(p) || isBuiltin(p))) return null;
      s = m[2];
    } else {
      // "adds an amount to qty": the amount is what the caller passes.
      const given = /\b(?:an?|some|any|the given)\s+(amount|number|value|name|text|quantity|message|label|title|person|price)\b/.exec(s);
      if (given) {
        params = [given[1]];
        s = s.replace(given[0], given[1]);
      }
    }
    const body = this.body(null, '', s, params);
    if (body === null) return null;
    return ['fn', params, ...(Array.isArray(body) && body[0] === 'do' ? body.slice(1) : [body])];
  }

  /**
   * Who a "when …" sentence is about: a cell, the document (null), or a custom
   * event (heard by the cell being composed for, else the document).
   */
  private subject(subj: string | undefined, event: string, flag?: 'on' | 'off', custom?: string): { cell: Cell | null; event: string; cond?: Sx } | null {
    const own = this.base.cell ? indexTree(this.doc.root).byId.get(this.base.cell.id) ?? null : null;
    const l = this.local(own, '');
    const s = subj === undefined ? '' : stripArticles(this.unq(subj).toLowerCase());
    if (event === 'custom') {
      const name = custom ?? (subj ? this.unq(subj).replace(/^(?:the\s+)?(?:event\s+)?/i, '').replace(/\s+event$/i, '') : '');
      return EVENT_NAME_RE.test(name) && !BUILTIN_EVENTS.has(name) ? { cell: own, event: name } : null;
    }
    let cell: Cell | null | undefined;
    let cond: Sx | undefined;
    const self = !subj || /^(?:it|this|this cell|this one|me|that|here|the cell)$/.test(subj);
    const isDoc = !!subj && /^(?:the\s+|this\s+)?(?:document|doc|page|file|app)$/.test(subj);
    if (isDoc || (self && !own && (event === 'open' || event === 'close' || event === 'load'))) {
      // "When the document loads" means when it opens.
      const e = event === 'load' ? 'open' : event;
      return e === 'open' || e === 'close' ? { cell: null, event: e } : null;
    }
    if (self) cell = own;
    else if (flag === 'on' && /^(?:every|each|all|all of)\s+(?:the\s+)?(?:box(?:es)?|items?|tasks?|things?|checkbox(?:es)?|ones?|todos?|steps?)$|^everything$|^all$/.test(subj!.replace(/^the\s+/, ''))) {
      cell = own?.kind === 'list' && own.type === 'check' ? own : l.near('list').find((c) => c.type === 'check');
      cond = ['every', ['get', '$it', 'done'], BOUND + 'value'];
      flag = undefined;
    } else if (/^(?:a|an|any|one|the)?\s*row(?:\s+(?:in|of|from)\s+(.+))?$/.test(s)) {
      const named = /\s(?:in|of|from)\s+(.+)$/.exec(s)?.[1];
      cell = named ? l.cell(stripArticles(named).replace(/\s+table$/, '')) : own?.kind === 'table' ? own : l.near('table')[0];
    } else if (/^button$/.test(s)) cell = own?.kind === 'button' ? own : l.near('button')[0];
    else cell = this.findCell(l, subj!);
    if (!cell) return null;
    if (flag && cell.kind === 'input' && ['checkbox', 'toggle'].includes(cell.type ?? '')) cond = flag === 'on' ? BOUND + 'value' : ['not', BOUND + 'value'];
    return eventProblem(cell, event) ? null : { cell, event, cond };
  }

  /** The handler for "<rest>" on a cell's event, attached; false when the words are not understood. */
  private attach(cell: Cell | null, event: string, rest: string, cond?: Sx): boolean {
    const action = this.body(cell, event, rest, [], cond);
    return action !== null && this.put(cell, event, action);
  }

  private put(cell: Cell | null, event: string, action: Sx): boolean {
    const key = `${cell ? cell.id : ''} ${event}`;
    const before = this.attached.get(key);
    const both: Sx = before === undefined ? action : ['do', ...(Array.isArray(before) && before[0] === 'do' ? before.slice(1) : [before]), action];
    this.attached.set(key, both);
    this.push(cell ? ['set', cell.name ?? cell.id, `on.${event}`, both as Json] : ['meta', `on.${event}`, both as Json]);
    return true;
  }

  // ── what a handler does ──

  /** The actions of "save it to done and show the note", for a handler on `cell` (or the document) for `event`. */
  private body(cell: Cell | null, event: string, s: string, params: string[] = [], cond?: Sx): Sx | null {
    const l = this.local(cell, event, params);
    const x = this.actions(l, cell, event, s.trim());
    if (x === null) return null;
    const c = cond === undefined ? x : ['when', cond, x];
    return unmark(c, this.bound(cell, event, params));
  }

  private actions(l: Local, own: Cell | null, event: string, s: string): Sx | null {
    s = s.replace(/^(?:then|it should|it will|please|we|i want to)\s+/, '').replace(/[\s,]+$/, '');
    const lead = /^(?:if|when|whenever|only if|only when)\s+(.+?)\s*(?:,|\bthen\b)\s*(.+)$/.exec(s);
    if (lead) {
      const c = l.condition(lead[1]);
      const b = c === null ? null : this.actions(l, own, event, lead[2]);
      if (b !== null) return ['when', c, b];
    }
    const out: Sx[] = [];
    for (const c of clauses(s)) {
      const a = this.clause(l, own, event, presentE(c));
      if (a === null) return null;
      out.push(a);
    }
    return out.length === 1 ? out[0] : out.length ? ['do', ...out] : null;
  }

  private clause(l: Local, own: Cell | null, event: string, c: string): Sx | null {
    // "warn when it is above 5": a flag that follows the condition.
    let m = /^(?:warn|alert|flag|raise\s+(?:a|an|the)\s+(?:warning|alarm|alert|flag))(?:\s+(?:me|us|people|everyone|the user|the reader))?\s+(?:when|if|whenever|once)\s+(.+)$/.exec(c);
    if (m) {
      const cond = l.condition(m[1]);
      return cond === null ? null : ['set!', this.warnCell(l), cond];
    }
    // "add 1 to clicks only when it is on": an action that waits for a condition.
    m = /^(.+?)\s+(?:but\s+)?(?:only\s+)?(?:if|when|whenever|once)\s+(.+)$/.exec(c);
    if (m) {
      const a = this.verb(l, own, event, m[1]);
      const cond = a === null ? null : l.condition(m[2]);
      if (a !== null && cond !== null) return ['when', cond, a];
    }
    return this.verb(l, own, event, c);
  }

  private verb(l: Local, own: Cell | null, event: string, c: string): Sx | null {
    let m = /^(show|reveal|display|unhide|hide)\s+(.+)$/.exec(c);
    if (m) {
      const t = this.findCell(l, m[2]);
      if (t && t.kind !== 'panel') return [m[1] === 'hide' ? 'hide!' : 'show!', t.name ?? t.id];
    }
    const call = this.call(l, c, true);
    if (call) return call;
    m = /^(?:send|emit|broadcast|announce|fire|raise|signal|trigger)\s+(?:out\s+)?(?:an?\s+|the\s+)?(?:event\s+)?(qq\d+qq|[a-z][\w-]*)(?:\s+event)?(?:\s+(?:with|carrying|containing)\s+(.+))?$/.exec(c);
    if (m) {
      const name = this.unq(m[1]);
      if (EVENT_NAME_RE.test(name) && !BUILTIN_EVENTS.has(name)) {
        if (!m[2]) return ['emit!', name];
        const payload = l.record(stripArticles(m[2]) || m[2]) ?? l.term(m[2]);
        return payload === null ? null : ['emit!', name, payload];
      }
    }
    m = /^(?:fetch|refresh|reload|re-?fetch|update)\s+(.+?)(?:\s+again|\s+now)?$/.exec(c);
    const fetch = m && this.kindCell(m[1], 'fetch');
    if (fetch) return ['refresh!', fetch.name ?? fetch.id];
    m = /^(start|restart|resume|stop|pause|cancel|end)\s+(.+)$/.exec(c);
    const timer = m && this.kindCell(m[2], 'timer');
    if (m && timer) return [/^(?:start|restart|resume)$/.test(m[1]) ? 'start!' : 'stop!', timer.name ?? timer.id];
    // A timer's or a fetch's own handler: "stop", "fetch again".
    m = /^(start|restart|resume|stop|pause|cancel|end|refresh|reload|fetch again|try again|retry)(?:\s+(?:it|itself|this))?$/.exec(c);
    if (m && own?.kind === 'timer' && !/^(?:refresh|reload|fetch again|try again|retry)$/.test(m[1])) return [/^(?:start|restart|resume)$/.test(m[1]) ? 'start!' : 'stop!', own.name ?? own.id];
    if (m && own?.kind === 'fetch' && /^(?:refresh|reload|fetch again|try again|retry)$/.test(m[1])) return ['refresh!', own.name ?? own.id];
    // "copy the new value into note", "put the message into note": one cell takes a value.
    m = /^(?:copy|put|write|store|save|place)\s+(.+?)\s+(?:into|in|to|onto)\s+(.+)$/.exec(c);
    const into = m && l.settable(m[2]);
    const what = into ? l.word?.(m![1]) ?? l.term(m![1]) : null;
    if (into && what !== null) return ['set!', into.name ?? into.id, what];
    // "save the checklist to done": what changed, as a new record (which carries the time it was saved).
    m = /^(?:save|store|record|log|copy|keep|archive|add|put|write)\s+(.+?)\s+(?:to|into|in)\s+(.+?)(?:\s+with\s+the\s+(?:time|date))?$/.exec(c);
    if (m && own && event === 'change' && this.refersTo(l, own, m[1])) {
      const coll = this.collection(l, m[2]);
      if (coll) return ['insert!', coll, { [own.kind === 'list' ? 'items' : 'value']: BOUND + 'value' }];
    }
    return l.act(c) ?? this.call(l, c, false);
  }

  /** A call to one of the document's actions: "call reset", "run greet with "Ann"", or (bare) "reset". */
  private call(l: Local, c: string, explicit: boolean): Sx | null {
    const m = explicit
      ? /^(?:call|run|perform|invoke|use|do|trigger|apply)\s+(?:the\s+)?(?:action\s+)?(qq\d+qq|[a-z][\w-]*)(?:\s+action)?(?:\s+(?:with|on|for|using|passing)\s+(.+))?$/.exec(c)
      : /^([a-z][\w-]*)(?:\s+(.+))?$/.exec(c);
    if (!m) return null;
    const name = Object.keys(this.doc.meta.actions ?? {}).find((k) => canon(k) === canon(this.unq(m[1])));
    if (!name) return null;
    const args = m[2] ? m[2].split(/\s*,\s*(?:and\s+)?|\s+and\s+/).filter(Boolean).map((a) => l.value(a)) : [];
    return [name, ...args];
  }

  /** Whether words mean the cell itself: "it", "the checklist", its name. */
  private refersTo(l: Local, own: Cell, ph: string): boolean {
    if (/^(?:it|this|them|these|its value|the value|the values|the new values?|new value|the list|the checklist|the items|the boxes|the tasks|everything|the answers?)$/.test(ph)) return true;
    return l.cell(stripArticles(ph)) === own;
  }

  private collection(l: Local, ph: string): string | null {
    const s = stripArticles(this.unq(ph)).replace(/^(?:saved\s+)?/, '').replace(/\s+(?:collection|list|table|records)$/, '');
    return l.coll(s) ?? (/^[a-z][\w-]*$/i.test(s) ? s : null);
  }

  /** A cell of one kind, by name, or the only one: "the rate", "the timer". */
  private kindCell(ph: string, kind: string): Cell | undefined {
    const l = this.local(null, '');
    const s = stripArticles(this.unq(ph).toLowerCase()).replace(new RegExp(`\\s+(?:${kind}|feed|request|data)$`), '');
    const c = l.cell(s);
    if (c) return c.kind === kind ? c : undefined;
    const all = l.near(kind);
    return all.length === 1 && (s === kind || /^(?:it|this)$/.test(s)) ? all[0] : undefined;
  }

  /** A cell by name, label or what it says: "the thank-you note" finds the hidden text "Thank you…". */
  private findCell(l: Local, ph: string): Cell | undefined {
    const s0 = stripArticles(this.unq(ph).toLowerCase());
    const s = s0.replace(/\s+(?:note|message|text|cell|box|banner|panel|line|block|card|notice|paragraph|label|image|picture|button|checkbox|check box|toggle|switch|list|checklist|table|fetch|timer|field|input)$/, '');
    const direct = l.cell(s) ?? l.cell(s0);
    if (direct) return direct;
    const key = canon(s);
    if (key.length < 3) return undefined;
    const found: Cell[] = [];
    walk(this.doc.root, (c) => {
      if (isGroup(c) && c.kind !== 'collapsible') return;
      if (canon([c.name, c.text, c.title, c.label, c.alt].filter(Boolean).join(' ')).includes(key)) found.push(c);
    });
    // A hidden cell is the likelier one to show.
    return found.find((c) => c.hidden === true) ?? found[0];
  }

  /** A flag to set: a data cell or checkbox called warn, warning or alert, else a new data cell. */
  private warnCell(l: Local): string {
    for (const n of ['warn', 'warning', 'alert', 'alarm', 'flag']) {
      const c = l.settable(n);
      if (c) return c.name ?? c.id;
    }
    const name = this.free('warning');
    this.add(['data', { name }, false]);
    return name;
  }

  /**
   * Words for what a handler finds bound, marked so they stay variables even
   * where a cell has the same name.
   */
  private words(l: Local, cell: Cell | null, event: string, params: string[]): (ph: string) => Sx | null {
    const v = (n: string) => BOUND + n;
    const get = (src: Sx, f: string): Sx => ['get', src, f];
    return (raw) => {
      const ph = raw.trim().toLowerCase();
      if (params.includes(ph)) return v(ph);
      if (!event) return null;
      if (/^(?:the\s+)?event$/.test(ph)) return v('event');
      if (!BUILTIN_EVENTS.has(event)) {
        if (/^(?:the\s+)?payload$|^what was sent$/.test(ph)) return v('payload');
        if (/^(?:the\s+)?sender$|^who sent it$/.test(ph)) return v('from');
        const f = /^(?:its|the payload|the sent)\s+([a-z][\w-]*)$/.exec(ph);
        return f ? get(v('payload'), f[1]) : null;
      }
      const kind = cell?.kind;
      switch (event) {
        case 'change': {
          if (/^(?:it|the new value|new value|its new value|its value|the value|value|what it is now|the new one|the new state)$/.test(ph)) return v('value');
          if (/^(?:the\s+|its\s+)?(?:old|previous|earlier|former)\s+(?:value|one|state)$|^what it was$/.test(ph)) return v('was');
          if (kind === 'list') {
            if (/^(?:the\s+)?(?:ticked\s+|changed\s+|new\s+|edited\s+)?item$/.test(ph)) return v('item');
            if (/^(?:its|the item|the ticked item)\s+text$/.test(ph)) return get(v('item'), 'text');
          }
          return null;
        }
        case 'click':
        case 'dblclick': {
          if (/^(?:the\s+)?target$/.test(ph)) return v('target');
          if (kind === 'table') {
            if (/^(?:the\s+)?(?:clicked\s+)?row$/.test(ph)) return v('row');
            const f = /^(?:its|the row|the clicked row)\s+([a-z][\w-]*)$/.exec(ph);
            if (f) return get(v('row'), f[1]);
          }
          if (kind === 'list') {
            if (/^(?:the\s+)?(?:clicked\s+)?item$/.test(ph)) return v('item');
            if (/^(?:its|the item)\s+text$/.test(ph)) return get(v('item'), 'text');
          }
          if (kind === 'diagram') {
            if (/^(?:the\s+)?(?:clicked\s+)?(?:shape|element)$/.test(ph)) return v('element');
            const f = /^(?:its|the shape|the element)\s+([a-z][\w-]*)$/.exec(ph);
            if (f) return get(v('element'), f[1]);
          }
          return null;
        }
        case 'pick': {
          if (/^(?:the\s+)?(?:picked\s+|selected\s+|chosen\s+)?rows$/.test(ph)) return v('rows');
          if (/^(?:the\s+)?(?:picked\s+|selected\s+|chosen\s+)?row$/.test(ph)) return ['first', v('rows')];
          const f = /^(?:its|the row|the picked row|the selected row|the chosen row)\s+([a-z][\w-]*)$/.exec(ph);
          return f ? get(['first', v('rows')], f[1]) : null;
        }
        case 'load': {
          if (/^(?:the\s+)?(?:data|answer|result|response|reply)$/.test(ph)) return v('data');
          if (ph === 'it') {
            const main = cell ? this.mainField(l, cell) : null;
            return main ? get(v('data'), main) : v('data');
          }
          const f = /^(?:its|the data|the answer)\s+(qq\d+qq|[a-z][\w-]*)$|^(?:the\s+)?(qq\d+qq|[a-z][\w-]*)\s+field$|^(?:the\s+)?(?:field\s+)?(qq\d+qq|[a-z][\w-]*)\s+(?:field\s+)?(?:of|in|from)\s+(?:the\s+)?(?:data|answer)$/.exec(ph);
          return f ? get(v('data'), this.unq(f[1] ?? f[2] ?? f[3])) : null;
        }
        case 'fail':
          if (/^(?:the\s+)?(?:error|error message|message|problem|reason)$|^what went wrong$/.test(ph)) return v('message');
          return /^(?:the\s+)?(?:http\s+)?status(?:\s+code)?$/.test(ph) ? v('status') : null;
        case 'tick':
          return /^(?:the\s+)?(?:tick count|number of ticks|ticks so far)$/.test(ph) ? v('count') : null;
        case 'open':
        case 'close':
          return /^(?:the\s+)?(?:section|section title|title)$/.test(ph) ? v('title') : null;
      }
      return null;
    };
  }

  /** The field "it" means in a fetch's answer: one named like the cell, else its only number. */
  private mainField(l: Local, fetch: Cell): string | null {
    const v = l.ctx.computed.cells[fetch.id]?.value;
    const name = fetch.name ?? '';
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const keys = Object.keys(v);
      const same = keys.find((k) => canon(k) === canon(name));
      if (same) return same;
      const nums = keys.filter((k) => typeof (v as Record<string, unknown>)[k] === 'number');
      if (nums.length === 1) return nums[0];
    }
    // Not fetched yet: a fetch called rate most likely answers with a rate.
    return /^[a-z][\w-]*$/i.test(name) ? name : null;
  }

  // ── new cells ──

  /** A name no cell has yet: warning, warning-2, … */
  private free(base: string): string {
    const idx = indexTree(this.doc.root);
    let n = base;
    for (let i = 2; idx.byName.has(n) || idx.byId.has(n) || isBuiltin(n); i++) n = `${base}-${i}`;
    return n;
  }

  /** Add a cell at the end of the document (timers and data cells take no room). */
  private add(notation: Json): void {
    const root = this.doc.root;
    const last = root.kind === 'col' ? root.children?.at(-1) : undefined;
    this.push(['split', last ? last.id : root.id, 'col', { cell: notation }]);
  }

  private unq(ph: string): string {
    return ph.replace(/qq(\d+)qq/g, (_, i: string) => this.quotes[Number(i)] ?? '');
  }
}

// ───────────────────────────── checking an events answer ─────────────────────────────

/** The props an events answer may set on a cell: handlers, a timer's or a fetch's timing, hidden. */
const EDITS = /^(?:on\.[A-Za-z][\w-]*|every|after|hidden)$/;
/** The cells an events answer may add. */
const NEW_KINDS = new Set(['timer', 'fetch', 'data']);

/** Ops from a reply: a ```json block, a JSON array, {ops: […]}, or one op on its own; "do" is flattened. */
export function readOps(code: unknown): Op[] {
  let v: unknown = code;
  if (typeof v === 'string') {
    const fenced = /```[\w-]*\s*\n?([\s\S]*?)```/.exec(v);
    const src = (fenced ? fenced[1] : v).trim();
    const at = src.search(/[[{]/);
    try { v = JSON.parse(at > 0 ? src.slice(at) : src); } catch { throw new SxError('the answer is not a JSON list of ops'); }
  }
  if (v && typeof v === 'object' && !Array.isArray(v) && Array.isArray((v as { ops?: unknown }).ops)) v = (v as { ops: unknown[] }).ops;
  if (!Array.isArray(v)) throw new SxError('the answer is not a list of ops');
  if (typeof v[0] === 'string') v = [v];
  const out: Op[] = [];
  const add = (op: unknown): void => {
    if (!Array.isArray(op) || typeof op[0] !== 'string') throw new SxError(`${JSON.stringify(op)?.slice(0, 80)} is not an op`);
    if (op[0] === 'do') return op.slice(1).forEach(add);
    out.push(lispIn(op as Op));
  };
  (v as unknown[]).forEach(add);
  if (!out.length) throw new SxError('the answer has no ops');
  return out;
}

const lisp = (v: Json): Json => (typeof v === 'string' && v.trim().startsWith('(') ? (read(v) as Json) : v);

/** A new cell's handlers written as Lisp text, read: ["timer", {"on": {"tick": "(…)"}}]. */
function lispOn(n: Json): Json {
  if (!Array.isArray(n) || !n[1] || typeof n[1] !== 'object' || Array.isArray(n[1])) return n;
  const props = n[1] as Record<string, Json>;
  const on = props.on;
  if (!on || typeof on !== 'object' || Array.isArray(on)) return n;
  return [n[0], { ...props, on: Object.fromEntries(Object.entries(on).map(([k, v]) => [k, lisp(v)])) }, ...n.slice(2)];
}

/** Handlers and actions written as Lisp text inside an op, read into their JSON form. */
function lispIn(op: Op): Op {
  const out = [...op] as Op;
  if (op[0] === 'set' && typeof op[2] === 'string' && op[2].startsWith('on.')) out[3] = lisp(op[3]);
  else if (op[0] === 'meta') out[2] = lisp(op[2]);
  else if (op[0] === 'put') out[2] = lispOn(op[2]);
  else if (op[0] === 'split' && op[3] && typeof op[3] === 'object' && !Array.isArray(op[3])) {
    const opts = op[3] as Record<string, Json>;
    if (opts.cell !== undefined) out[3] = { ...opts, cell: lispOn(opts.cell) };
  }
  return out;
}

/** Ask AI only adds behaviour: handlers, actions, timing, and timer, fetch or data cells. */
function allowed(doc: Doc, op: Op): void {
  const kindOf = (n: Json | undefined) => (Array.isArray(n) ? n[0] : n);
  switch (op[0]) {
    case 'set':
      if (typeof op[2] !== 'string' || !EDITS.test(op[2])) throw new SxError(`an answer here changes handlers, actions and timing, not "${op[2]}"`);
      return;
    case 'meta':
      if (typeof op[1] !== 'string' || !/^(?:on|actions)\.[A-Za-z][\w-]*$/.test(op[1])) throw new SxError(`an answer here sets the document's on.<event> or actions.<name>, not "${op[1]}"`);
      return;
    case 'split': {
      const opts = op[3] as Record<string, Json> | undefined;
      const k = kindOf(opts && typeof opts === 'object' && !Array.isArray(opts) ? opts.cell : undefined);
      if (typeof k !== 'string' || !NEW_KINDS.has(k)) throw new SxError('a split here adds a timer, a fetch or a data cell: ["split", cell, "col", {"cell": ["timer", {…}]}]');
      return;
    }
    case 'put': {
      const target = typeof op[1] === 'string' ? resolve(doc.root, op[1]) : undefined;
      const k = kindOf(op[2]);
      if (target?.kind !== 'empty') throw new SxError('put only fills an empty cell here; add new cells with split');
      if (typeof k !== 'string' || !NEW_KINDS.has(k)) throw new SxError('a put here adds a timer, a fetch or a data cell');
      return;
    }
    default:
      throw new SxError(`an answer here adds handlers, actions, timers, fetches and data cells; "${op[0]}" is not one of those ops`);
  }
}

const handlersOf = (on: unknown): Record<string, Sx> =>
  (on && typeof on === 'object' && !Array.isArray(on) ? Object.fromEntries(Object.entries(on as Record<string, Sx>).filter(([, a]) => a != null)) : {});

/**
 * Check an `events` answer against the document: the ops apply, every handler
 * and action they write passes `check` (with its event's names bound) and calls
 * nothing unknown. Gives the ops, what each wrote, and a plain explanation.
 */
export function validateOps(ctx: Ctx, code: unknown): { ops: Op[]; changes: Change[]; explanation: string } {
  const ops = readOps(code);
  let doc = ctx.doc;
  for (const op of ops) {
    allowed(doc, op);
    try {
      doc = applyOps(doc, [op]).doc;
    } catch (e) {
      throw new SxError(`${JSON.stringify(op).slice(0, 80)} does not apply: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const after = context(doc, ctx.world, [...ctx.collections.keys()], { target: 'events', cell: ctx.cell?.id });
  const before = ctx.idx.byId;
  const changes: Change[] = [];
  const says: string[] = [];
  const touched = new Map<Cell | null, string[]>();
  const note = (cell: Cell | null, where: string) => touched.set(cell, [...(touched.get(cell) ?? []), where]);
  const handler = (cell: Cell | null, event: string, a: Sx, isNew: boolean) => {
    const problem = eventProblem(cell, event);
    if (problem) throw new SxError(problem);
    try {
      if (!Array.isArray(a) || !a.length) throw new SxError(`a handler is an action such as (set! status value), not ${JSON.stringify(a)}`);
      check(after, a, `on.${event}`, cell);
    } catch (e) {
      throw new SxError(`on ${event}${cell ? ` of ${cell.name ?? cell.id}` : ' of the document'}: ${e instanceof Error ? e.message : String(e)}`);
    }
    const label = handlerLabel(cell, event, isNew);
    changes.push({ cell: cell ? cell.name ?? cell.id : null, label, code: print(a, 60) });
    says.push(`${label}, it ${action(a, after)}.`);
    note(cell, `on ${event}`);
  };
  walk(after.doc.root, (c) => {
    const old = before.get(c.id);
    const isNew = !old || old.kind !== c.kind;
    const was = handlersOf(isNew ? undefined : old!.on);
    const on = Object.entries(handlersOf(c.on)).filter(([k, a]) => !deepEqual(was[k], a));
    const timed = !isNew && (!deepEqual(c.every ?? null, old!.every ?? null) || !deepEqual(c.after ?? null, old!.after ?? null));
    // Where a fetch reads and what it sends are shown before anything is applied: an answer must not hide an address or a secret's name.
    if (c.kind === 'fetch' && (isNew || c.url !== old!.url || !deepEqual(c.headers ?? null, old!.headers ?? null))) {
      const n = c.name ?? c.id;
      const sends = c.headers && typeof c.headers === 'object' ? ` with headers ${JSON.stringify(c.headers)}` : '';
      changes.push({ cell: n, label: `${isNew ? 'New fetch' : 'Fetch'} ${n} reads ${c.url ?? 'nothing yet'}${sends}`, code: print(toNotation(c, false), 60) });
      says.push(`${n} fetches ${c.url ?? 'nothing yet'}${sends}.`);
    }
    for (const [event, a] of on) handler(c, event, a, isNew);
    if (on.length || !(isNew || timed)) return;
    const n = c.name ?? c.id;
    const t = c.kind === 'timer' ? timing(c) : durationMs(c.every) ? `every ${sayEvery(durationMs(c.every)! / 1000)}` : null;
    const label = isNew ? `New ${c.kind}${c.kind === 'data' ? ' cell' : ''} ${n}${t ? ` (${t.toLowerCase()})` : ''}` : `${n} fetches ${t ?? 'when asked'}`;
    changes.push({ cell: n, label, code: c.kind === 'data' ? print((c.value ?? null) as Sx) : '' });
    says.push(`${label}.`);
  });
  const wasOn = handlersOf(ctx.doc.meta.on);
  for (const [event, a] of Object.entries(handlersOf(doc.meta.on))) if (!deepEqual(wasOn[event], a)) handler(null, event, a, false);
  const wasActs = handlersOf(ctx.doc.meta.actions);
  for (const [name, fn] of Object.entries(handlersOf(doc.meta.actions))) {
    if (deepEqual(wasActs[name], fn)) continue;
    try {
      if (!(Array.isArray(fn) && fn[0] === 'fn' && fn.length >= 3)) throw new SxError('write it as (fn (inputs…) what it does)');
      check(after, fn, 'action', null);
    } catch (e) {
      throw new SxError(`action ${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
    const label = actionLabel(name, fn);
    changes.push({ cell: null, label, code: print(fn, 60) });
    says.push(`${label} ${fnWords(fn, after)}.`);
    note(null, `action ${name}`);
  }
  // The engine's own check for calls to names that exist nowhere, on what changed.
  for (const [cell, wheres] of touched) {
    const bad = actionProblems(doc, cell).find((p) => wheres.some((w) => p.startsWith(`${w}:`)));
    if (bad) throw new SxError(`${cell ? `${cell.name ?? cell.id} ` : ''}${bad}`);
  }
  if (!changes.length) throw new SxError('the ops add no handler, action or cell');
  return { ops, changes, explanation: says.join(' ') };
}

/** Phrasings the built-in composer understands, made from the document's own names. */
export function suggestions(ctx: Ctx): string[] {
  const named: Cell[] = [];
  walk(ctx.doc.root, (c) => { if (c.name) named.push(c); });
  const value = (c: Cell) => ctx.computed.cells[c.id]?.value;
  const nums = named.filter((c) => !isGroup(c) && typeof value(c) === 'number').map((c) => c.name!);
  const inputs = named.filter((c) => c.kind === 'input' && ['number', 'slider', 'rating'].includes(c.type ?? '')).map((c) => c.name!);
  const bools = named.filter((c) => c.kind === 'input' && ['checkbox', 'toggle'].includes(c.type ?? '')).map((c) => c.name!);
  const dates = named.filter((c) => c.kind === 'input' && c.type === 'date').map((c) => c.name!);
  const groups = named.filter((c) => isLines(c) && c.children!.some(isLines)).map((c) => c.name!);
  const colls = [...ctx.collections.keys()];
  const [a = 'qty', b = 'price'] = nums;
  const pick = (xs: (string | false | undefined)[]) => xs.filter((x): x is string => !!x).slice(0, 4);
  // Tabs, accordions, collapsibles, counters and diagrams get a phrasing of their own, ahead of the rest.
  const of = (kind: string) => named.find((c) => c.kind === kind);
  const title = (box: Cell | undefined) => {
    const t = box ? panelTitles(box)[1] ?? panelTitles(box)[0] : undefined;
    return t === undefined ? undefined : /^[a-z0-9 ]+$/i.test(t) ? t : JSON.stringify(t);
  };
  const [tabs, acc, fold, diagram] = [of('tabs'), of('accordion'), of('collapsible'), of('diagram')];
  const counter = named.find((c) => c.kind === 'data' && typeof value(c) === 'number');
  const event = eventOf(ctx.target);
  if (event || ctx.target === 'events' || ctx.target === 'action') return eventSuggestions(ctx, named, event);
  switch (ctx.target) {
    case 'do': return pick([
      tabs && title(tabs) && `open the ${title(tabs)} tab`,
      counter && `go to the next ${counter.name}`,
      !tabs && acc && title(acc) && `open the ${title(acc)} section`,
      !counter && fold && `toggle ${fold.name}`,
      `add 1 to ${inputs[0] ?? a}`,
      `save ${a} and ${b} to ${colls[0] ?? 'records'}`,
      bools[0] && `toggle ${bools[0]}`,
      groups[0] && `add a line to ${groups[0]}`,
      `reset ${inputs[0] ?? a}`,
    ]);
    case 'hidden': return pick([
      tabs && title(tabs) && `show only on the ${title(tabs)} tab`,
      !tabs && fold && `show when ${fold.name} is open`,
      `when ${a} is 0`, `when ${a} is under 10`, bools[0] && `unless ${bools[0]}`, `when ${b} is empty`,
    ]);
    case 'style': return pick(['red when negative', `green when over 100, otherwise grey`, `orange when ${a} is 0`]);
    case 'options': return pick(['small, medium and large', 'numbers 1 to 5', colls[0] && ctx.collections.get(colls[0])?.[0] && `${ctx.collections.get(colls[0])![0]} of ${colls[0]}`]);
    default: return pick([
      diagram && `how many shapes in ${diagram.name}`,
      `${a} times ${b}`,
      `sum of ${a} and ${b}`,
      `if ${a} is over 100 then "big" else "small"`,
      groups[0] ? `sum of the ${groups[0]} column 3` : colls[0] ? `number of ${colls[0]}` : dates[1] ? `days between ${dates[0]} and ${dates[1]}` : `${a} as currency`,
    ]);
  }
}

/** Sentences about events the built-in composer understands, with the document's own names. */
function eventSuggestions(ctx: Ctx, named: Cell[], event: string | null): string[] {
  const value = (c: Cell) => ctx.computed.cells[c.id]?.value;
  const own = ctx.cell;
  const settable = named.filter((c) => (c.kind === 'data' || c.kind === 'input') && c !== own);
  const num = settable.find((c) => typeof value(c) === 'number')?.name;
  const text = settable.find((c) => typeof value(c) === 'string' && (c.kind === 'data' || (c.type ?? 'text') === 'text'))?.name;
  const hidden = named.find((c) => c.hidden === true && c !== own)?.name;
  const fetch = named.find((c) => c.kind === 'fetch')?.name;
  const pick = (xs: (string | false | undefined | null)[]) => xs.filter((x): x is string => !!x).slice(0, 5);
  if (ctx.target === 'action') return pick([num && `sets ${num} to 0`, text && `clears ${text}`, hidden && `shows ${hidden}`, num && `takes n and adds n to ${num}`]);
  if (event) return pick([
    num && `add 1 to ${num}`,
    event === 'change' && text && `set ${text} to the new value`,
    hidden && `show ${hidden}`,
    event === 'fail' && text && `set ${text} to the error`,
    num && `reset ${num}`,
  ]);
  const field = own?.kind === 'table' && Array.isArray(value(own)) ? Object.keys((value(own) as Record<string, unknown>[])[0] ?? {}).find((k) => k !== 'id') : undefined;
  const ownName = own && (own.name ?? own.id);
  return pick([
    own?.kind === 'list' && own.type === 'check' && hidden && `when every box is ticked, show ${hidden}`,
    own?.kind === 'input' && text && `when ${ownName} changes, set ${text} to the new value`,
    own?.kind === 'table' && text && field && `when a row is picked, set ${text} to its ${field}`,
    own?.kind === 'fetch' && hidden && `when ${ownName} fails to load, show ${hidden}`,
    own && own.kind !== 'fetch' && own.kind !== 'data' && own.kind !== 'timer' && num && `when this is clicked, add 1 to ${num}`,
    num && `when the document opens, add 1 to ${num}`,
    hidden && `after 5 seconds show ${hidden}`,
    fetch && `every minute refresh ${fetch}`,
    num && `make an action called reset that sets ${num} to 0`,
  ]);
}

// ───────────────────────────── Claude ─────────────────────────────

const DEFAULT_BASE = 'https://api.anthropic.com';
/** Models that accept server-side fallback in its "default" form on the Claude API. */
const FALLBACK_MODELS = new Set(['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1']);

export interface ClaudeConfig {
  key: string;
  model: string;
  base: string;
}

export function claudeConfig(env: NodeJS.ProcessEnv = process.env): ClaudeConfig | null {
  if (!env.ANTHROPIC_API_KEY || env.EDGY_AI === 'off') return null;
  return {
    key: env.ANTHROPIC_API_KEY,
    model: env.EDGY_AI_MODEL || 'claude-sonnet-5-5',
    base: (env.EDGY_AI_BASE_URL || DEFAULT_BASE).replace(/\/$/, ''),
  };
}

const TARGET_TASK: Record<(typeof TARGETS)[number], string> = {
  action: 'a custom action for the document: (fn (inputs…) actions…), which any button or handler then calls by its name like a built-in',
  events: 'the ops that make it react as the person describes: handlers on its events (or the document\'s), custom events, custom actions, new timers, and how often a fetch refreshes',
  expr: 'the expression this cell shows (its formula)',
  do: 'the action this button runs when clicked. Use set!, toggle!, insert!, delete!, clear!, dup! and remove!; wrap several in (do …)',
  hidden: 'a condition: the cell is hidden while it is true',
  style: 'a style value: an expression giving a colour token (ink, muted, faint, paper, sunken, line, accent, live, warn, bad, agent, or one of their -soft variants)',
  options: 'the choices of this select input: an expression giving a list, e.g. (list "S" "M" "L")',
  compare: 'a number this cell\'s value is compared against, e.g. last period\'s figure',
  trend: 'a list of numbers showing how this value moved over time, oldest first',
};

/**
 * What the document's tabs, accordions, collapsibles, data cells and diagrams
 * hold and how code reads and changes them, with their own names and titles.
 * Only the kinds the document has; the outline already lists them.
 */
function kindNotes(ctx: Ctx): string[] {
  const first: Partial<Record<string, Cell>> = {};
  walk(ctx.doc.root, (c) => { first[c.kind] ??= c; });
  const id = (c: Cell) => c.name ?? c.id;
  const q = (s: string) => JSON.stringify(s);
  const out: string[] = [];
  const { tabs, accordion: acc, collapsible: fold, data, diagram } = first;
  if (tabs) {
    const [n, ts] = [id(tabs), panelTitles(tabs)];
    const t = ts[1] ?? ts[0] ?? 'Details';
    out.push(`- tabs (${n}): its value is the open tab's title. Read it with (= ${n} ${q(t)}); a button opens a tab with (set! ${n} ${q(t)}). To show a cell only on that tab, hide it while (!= ${n} ${q(t)}).`);
  }
  if (acc) {
    const [n, ts] = [id(acc), panelTitles(acc)];
    const t = ts[0] ?? 'Shipping';
    out.push(`- accordion (${n}): its value is the list of open section titles; (includes? ${n} ${q(t)}) tells whether one is open. ` + (acc.multiple
      ? `${n} lets any number be open: open one more with (set! ${n} (uniq (concat ${n} (list ${q(t)}))))`
      : `${n} opens one section at a time: (set! ${n} ${q(t)}) opens just that one`)
      + `; close one with (set! ${n} (filter (!= it ${q(t)}) ${n})); close all with (set! ${n} (list)).`);
  }
  if (fold) {
    const n = id(fold);
    out.push(`- collapsible (${n}): its value is true while open, false while folded. Read it as ${n}; (set! ${n} false) folds it, (set! ${n} true) unfolds it, (toggle! ${n}) switches.`);
  }
  if (data) {
    const n = id(data);
    out.push(`- data (${n}): a value the document keeps for itself, never shown. Read it by name; a button changes it, e.g. (set! ${n} ${typeof data.value === 'number' ? `(+ ${n} 1)` : '…'}).`);
  }
  if (diagram) {
    const n = id(diagram);
    out.push(`- diagram (${n}): its value is the list of its elements, records {id, type, text, …} where type is rect, ellipse, diamond, text, arrow or line. Count shapes with (count-if (includes? (list "rect" "ellipse" "diamond") (get it "type")) ${n}); arrows with (count-if (= (get it "type") "arrow") ${n}).`);
  }
  if (tabs || acc) out.push('- Panel titles are exact text: write them as the outline shows them, in the same case.');
  return out;
}

/** How events work, told with this document's cells, events and actions. Only for the event targets. */
function eventNotes(ctx: Ctx): string[] {
  const c = ctx.cell ?? null;
  const name = (x: Cell) => x.name ?? x.id;
  const event = eventOf(ctx.target);
  const out = [
    '- A cell\'s on prop, and the document\'s, map an event name to an action: the same kind of code as a button\'s action (set!, insert!, emit!, show!, …; several in (do …)). While a handler runs, the event\'s data is bound by name, and a bound name hides a cell of the same name ((ref name) still reads the cell).',
    `- ${c ? `${name(c)} (a ${c.kind})` : 'The document'} raises: ${eventsOf(c).map((e) => `${e.name} (${e.data})`).join('; ') || 'nothing of its own'}.`,
  ];
  if (event) out.push(`- In this handler these names are bound: ${eventVars(c, event).join(', ')}.`);
  if (c) out.push('- The document raises open (once each time someone opens it in Live) and close.');
  const custom = customEvents(ctx.doc);
  out.push(`- Custom events: (emit! "saved" {total total}) sends one to every cell, and the document, with an on.saved handler; that handler sees payload (what was sent) and from (who sent it). ${custom.length ? `This document uses: ${custom.join(', ')}.` : 'This document uses none yet.'}`);
  const defined = Object.entries(handlersOf(ctx.doc.meta.actions)).map(([n, fn]) => `${n}${Array.isArray(fn) && Array.isArray(fn[1]) && fn[1].length ? ` (${fn[1].join(' ')})` : ' ()'}`);
  out.push(`- Custom actions are called like built-ins, (greet "Ann"). ${defined.length ? `This document defines: ${defined.join(', ')}.` : 'This document defines none yet.'}`);
  out.push('- Timers tick while the document is open in Live: every 60 is each minute, after 5 is once after five seconds; tick binds count and at; (start! t) and (stop! t). A fetch cell holds the JSON its address answers; (refresh! f) fetches again; its every sets how often; load binds data and value, fail binds message and status. (show! c) and (hide! c) show or hide a cell.');
  return out;
}

/** Where a new cell goes in an events answer: after the last top-level cell. */
function endOf(doc: Doc): string {
  const last = doc.root.kind === 'col' ? doc.root.children?.at(-1) : undefined;
  return (last ?? doc.root).id;
}

/** The system prompt: the language, the document and the task. */
export function systemPrompt(ctx: Ctx): string {
  const fns = (['Math', 'Logic', 'Lists', 'Records', 'Text', 'Dates', 'Cells', 'Actions'] as const)
    .map((g) => FUNCTIONS.filter((f) => f.group === g).map((f) => `  ${f.use} — ${f.does}`).join('\n'))
    .join('\n');
  const colls = [...ctx.collections].map(([n, f]) => `  "${n}"${f.length ? ` with fields ${f.join(', ')}` : ''}`).join('\n');
  const c = ctx.cell;
  const where = c ? `cell ${c.id}${c.name ? ` named ${c.name}` : ''} (a ${c.kind}${c.type ? ` of type ${c.type}` : ''})` : 'the document';
  const notes = kindNotes(ctx);
  const event = eventOf(ctx.target);
  const evented = !!event || ctx.target === 'action' || ctx.target === 'events';
  const task = event
    ? `the action ${where} runs on its ${event} event`
    : `${TARGET_TASK[ctx.target as (typeof TARGETS)[number]]}, for ${where}`;
  const end = endOf(ctx.doc);
  const answer = ctx.target === 'events'
    ? [
        '- Ops you may use: ["set", "<cell>", "on.<event>", action] gives a cell (by name or id) a handler; ["meta", "on.<event>", action] gives the document one (open, close, or a custom event); '
          + '["meta", "actions.<name>", ["fn", ["who"], action, …]] defines a custom action; ["set", "<fetch>", "every", 60] makes a fetch refresh every minute; '
          + `["split", "${end}", "col", {"cell": ["timer", {"name": "every-minute", "every": 60, "on": {"tick": action}}]}] adds a timer at the end of the document, and a data cell (["data", {"name": "warning"}, false]) or a fetch (["fetch", {"name": "rate"}, "/api/demo/rate"]) is added the same way.`,
        '- In ops, code is JSON: ["set!", "status", "$value"] is (set! status value): "$name" reads a cell or a bound name, other strings are text. A handler may also be given as Lisp text, "(set! status value)".',
        '- Answer with ONLY a ```json block holding the array of ops, followed by one line starting with "Explanation:" that tells a beginner, in one or two plain sentences, what will happen and when.',
      ]
    : ['- Answer with ONLY the expression in Lisp syntax inside a ```lisp block, followed by one line starting with "Explanation:" that tells a beginner, in one or two plain sentences, what it does and which cells it reads.'];
  return [
    'You write code for one cell of an Edgy document. Edgy formulas are a small Lisp: (* qty price), (if (> total 100) "big" "small"). A bare word reads the cell with that name (or id); text goes in "double quotes"; {key value} is a record.',
    '',
    'Functions:',
    fns,
    '',
    'The document, one line per cell: id, kind, name, source, → current value:',
    outline(ctx.doc, ctx.computed),
    ...(colls ? ['', 'Collections that can be read with (rows "name"):', colls] : []),
    ...(notes.length ? ['', 'What these cells hold, and how code reads and changes them:', ...notes] : []),
    ...(evented ? ['', 'Events:', ...eventNotes(ctx)] : []),
    '',
    `Task: write ${task}.`,
    `Current code: ${ctx.current.trim() || '(none)'}`,
    '',
    'Rules:',
    `- Use only the functions above, the names of cells in the document,${evented ? ' the custom actions it defines, the names an event binds,' : ''} let/fn variables, and it, i, acc inside map/filter/reduce.`,
    ctx.target === 'do'
      ? '- This is an action, so set!, toggle!, insert!, delete!, clear!, dup!, remove! and do are allowed.'
      : evented
        ? '- This is an action, so set!, toggle!, insert!, update!, delete!, clear!, dup!, remove!, emit!, show!, hide!, start!, stop!, refresh!, the document\'s custom actions and do are allowed.'
        : '- Do not use set!, toggle!, insert!, delete!, clear!, dup! or remove!: they only work in buttons.',
    `- Prefer the simplest ${evented ? 'code' : 'expression'} that does what the person asked.`,
    ...answer,
  ].join('\n');
}

interface Block { type: string; text?: string }

async function messages(cfg: ClaudeConfig, system: string, msgs: { role: 'user' | 'assistant'; content: unknown }[], maxTokens = 600): Promise<Block[]> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30_000);
  const fallback = cfg.base === DEFAULT_BASE && FALLBACK_MODELS.has(cfg.model);
  try {
    const res = await fetch(`${cfg.base}/v1/messages`, {
      method: 'POST',
      signal: ctl.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': cfg.key,
        'anthropic-version': '2023-06-01',
        ...(fallback ? { 'anthropic-beta': 'server-side-fallback-2026-07-01' } : {}),
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: maxTokens,
        system,
        messages: msgs,
        // A short answer needs no extended thinking; this is the lowest setting on Sonnet 5.5.
        ...(cfg.model === 'claude-sonnet-5-5' ? { thinking: { type: 'between_tools' } } : {}),
        ...(fallback ? { fallbacks: 'default' } : {}),
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { content?: Block[]; stop_reason?: string; error?: { message?: string } };
    if (!res.ok) throw new Error(data.error?.message ?? `the API answered ${res.status}`);
    if (data.stop_reason === 'refusal') throw new Error('Claude declined this request');
    return data.content ?? [];
  } catch (e) {
    if (ctl.signal.aborted) throw new Error('Claude took longer than 30 seconds');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Pull the code and the explanation out of a reply. */
export function parseReply(text: string): { code: string; explanation?: string } {
  const fenced = /```[\w-]*\s*\n?([\s\S]*?)```/.exec(text);
  const why = /^\s*Explanation:\s*([\s\S]+)$/im.exec(text);
  const code = fenced ? fenced[1] : text.slice(0, why ? why.index : undefined);
  return { code: code.trim(), explanation: why?.[1].trim().replace(/\s+/g, ' ') };
}

/** Ask Claude; on code that does not fit the document, tell it why and ask once more. */
export async function composeClaude(ctx: Ctx, prompt: string, cfg: ClaudeConfig): Promise<Answer> {
  const system = systemPrompt(ctx);
  const msgs: { role: 'user' | 'assistant'; content: unknown }[] = [{ role: 'user', content: prompt }];
  // A set of ops is longer than one expression.
  const ops = ctx.target === 'events';
  let last = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const content = await messages(cfg, system, msgs, ops ? 2000 : 600);
    const text = content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n');
    const { code, explanation } = parseReply(text);
    try {
      const a = accept(ctx, code);
      return explanation ? { ...a, explanation } : a;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
      msgs.push({ role: 'assistant', content }, { role: 'user', content: `${ops ? 'Those ops do' : 'That code does'} not work here: ${last}. Answer again in the same format.` });
    }
  }
  throw new Error(`its code did not fit the document (${last})`);
}

// ───────────────────────────── agents ─────────────────────────────

interface Pending {
  doc: string;
  request: AgentRequest;
  delivered: boolean;
  settle: (a: Answer | null) => void;
}

/** Compose requests waiting for an agent's answer, in memory until answered or timed out. */
export class Requests {
  private pending = new Map<string, Pending>();
  private n = 0;

  open(doc: string, req: Omit<AgentRequest, 'id' | 'ts'>, ms: number, signal?: AbortSignal): { request: AgentRequest; answer: Promise<Answer | null> } {
    const request: AgentRequest = { id: 'r' + ++this.n, ...req, ts: Date.now() };
    const answer = new Promise<Answer | null>((resolve) => {
      const settle = (a: Answer | null) => {
        clearTimeout(timer);
        this.pending.delete(request.id);
        resolve(a);
      };
      const timer = setTimeout(() => settle(null), ms);
      signal?.addEventListener('abort', () => settle(null), { once: true });
      this.pending.set(request.id, { doc, request, delivered: false, settle });
    });
    return { request, answer };
  }

  /** The requests on a document no listener has seen yet; they are marked as seen. */
  take(doc: string): AgentRequest[] {
    const out: AgentRequest[] = [];
    for (const p of this.pending.values()) {
      if (p.doc !== doc || p.delivered) continue;
      p.delivered = true;
      out.push(p.request);
    }
    return out;
  }

  get(doc: string, id: string): AgentRequest | undefined {
    const p = this.pending.get(id);
    return p && p.doc === doc ? p.request : undefined;
  }

  answer(id: string, a: Answer): boolean {
    const p = this.pending.get(id);
    if (!p) return false;
    p.settle(a);
    return true;
  }
}

// ───────────────────────────── choosing a provider ─────────────────────────────

export interface Providers {
  /** Force one provider (the built-in composer is still the last resort). */
  provider?: Provider;
  claude: ClaudeConfig | null;
  /** Ask the listening agent, or null when no agent is listening on this document. */
  agent: (() => Promise<Answer | null>) | null;
}

/** Try Claude, then a listening agent, then the built-in composer. */
export async function compose(ctx: Ctx, prompt: string, p: Providers): Promise<Composed> {
  const notes: string[] = [];
  const order: Provider[] = p.provider ? [p.provider, 'local'] : ['claude', 'agent', 'local'];
  for (const provider of [...new Set(order)]) {
    if (provider === 'claude') {
      if (!p.claude) {
        if (p.provider === 'claude') notes.push('Claude is not set up on this server (no ANTHROPIC_API_KEY), so the built-in composer answered.');
        continue;
      }
      try {
        return finish(ctx, await composeClaude(ctx, prompt, p.claude), 'claude', notes);
      } catch (e) {
        notes.push(`Claude could not answer: ${e instanceof Error ? e.message : String(e)}.`);
      }
    } else if (provider === 'agent') {
      if (!p.agent) {
        if (p.provider === 'agent') notes.push('No agent is listening on this document, so the built-in composer answered.');
        continue;
      }
      const a = await p.agent();
      if (a) return finish(ctx, a, 'agent', notes);
      notes.push('Fell back to the built-in composer because no agent answered.');
    } else {
      const a = composeLocal(ctx, prompt);
      if (a) return finish(ctx, a, 'local', notes);
    }
  }
  throw new ComposeError(
    notes.length ? `${notes.join(' ')} The built-in composer did not understand that either.` : 'I could not turn that into code. Try one of these phrasings.',
    suggestions(ctx),
  );
}
