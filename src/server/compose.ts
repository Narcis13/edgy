// Natural language to code. A person describes what a cell should compute or
// do; one of three providers writes the expression and it is checked against
// the document before anyone sees it:
//
//   claude   the Anthropic API, when ANTHROPIC_API_KEY is set
//   agent    a live agent listening on the document (edgy_listen / edgy_answer)
//   local    a built-in composer that knows common beginner phrasings

import type { Cell, Doc, Json, Sx } from '../core/types';
import { isGroup } from '../core/types';
import { type Computed, type World, evalIn, evaluate, plainValue } from '../core/engine';
import { panelTitles } from '../core/containers';
import { FUNCTIONS } from '../core/reference';
import { outline } from '../core/outline';
import { SxError, formatValue, isBuiltin, print, read } from '../core/sx';
import { type Index, indexTree, walk } from '../core/tree';

export const TARGETS = ['expr', 'do', 'hidden', 'style', 'options', 'compare', 'trend'] as const;
export type Target = (typeof TARGETS)[number];
export type Provider = 'claude' | 'agent' | 'local';

export interface Ask {
  prompt: string;
  cell?: string;
  target: Target;
  current: string;
}

/** What a provider hands back before it is checked. */
export interface Answer {
  expr: Sx;
  explanation?: string;
}

export interface Composed {
  code: string;
  expr: Sx;
  explanation: string;
  preview?: { value?: Json; display?: string; error?: string };
  provider: Provider;
  notes?: string[];
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

const ACTIONS = new Set(['set!', 'toggle!', 'insert!', 'delete!', 'clear!', 'dup!', 'remove!']);
const PLACES = new Set(['set!', 'toggle!', 'dup!', 'remove!', 'ref', 'child']);
const FREE = new Set(['it', 'i', 'acc']);

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

function noCell(ctx: Ctx, name: string): string {
  const near = [...ctx.idx.byName.keys()].filter((n) => distance(n.toLowerCase(), name.toLowerCase()) <= 2);
  return `there is no cell called "${name}"` + (near.length ? `; did you mean ${listed(near, 'or')}?` : '');
}

/** Throw if the expression uses a function or a name the document does not have, or an action where none is allowed. */
export function check(ctx: Ctx, x: Sx, target: Target): void {
  const known = (n: string) => ctx.idx.byName.has(n) || ctx.idx.byId.has(n);
  const place = (p: Sx, scope: Set<string>) => {
    if (typeof p !== 'string') return visit(p, scope);
    const n = p.replace(/^\$/, '');
    if (!known(n) && !scope.has(n)) throw new SxError(noCell(ctx, n));
  };
  const visit = (x: Sx, scope: Set<string>): void => {
    if (typeof x === 'string') {
      const n = x.slice(1);
      if (x.startsWith('$') && !scope.has(n) && !FREE.has(n) && !known(n)) throw new SxError(noCell(ctx, n));
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
    if (ACTIONS.has(head) && target !== 'do') throw new SxError(`${head} changes the document, so it only works in a button's action`);
    if (PLACES.has(head)) {
      if (args.length) place(args[0], scope);
      return args.slice(1).forEach((a) => visit(a, scope));
    }
    if (!isBuiltin(head) && !scope.has(head)) {
      const cell = ctx.idx.byName.get(head) ?? ctx.idx.byId.get(head);
      if (!cell) throw new SxError(`unknown function ${head}`);
      const holds = typeof ctx.computed.cells[cell.id]?.value === 'function' || (Array.isArray(cell.expr) && cell.expr[0] === 'fn');
      if (!holds) throw new SxError(`${head} is a cell, not a function`);
    }
    args.forEach((a) => visit(a, scope));
  };
  visit(x, new Set());
}

/** Read an answer (Lisp text, possibly fenced, or the JSON form) and check it. */
export function validate(ctx: Ctx, code: unknown, target: Target): Sx {
  let expr: Sx;
  if (typeof code === 'string') {
    const fenced = /```[\w-]*\s*\n?([\s\S]*?)```/.exec(code);
    expr = read((fenced ? fenced[1] : code).trim());
  } else expr = (code ?? null) as Sx;
  if (expr === null || (typeof expr === 'string' && !expr.trim())) throw new SxError('the answer is empty');
  check(ctx, expr, target);
  return expr;
}

/** Pretty code, a plain explanation and, for anything but an action, the value it gives in the cell. */
export function finish(ctx: Ctx, expr: Sx, provider: Provider, explanation?: string, notes: string[] = []): Composed {
  const out: Composed = { code: print(expr, 60), expr, explanation: explanation?.trim() || explain(ctx, expr), provider };
  if (ctx.target !== 'do') {
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
    default: return `works out ${say(x)}`;
  }
}

const tokenWord = (t: Sx) => (typeof t === 'string' ? TOKEN_WORDS[t] ?? t : t === null ? 'unchanged' : say(t));

/** One or two plain sentences for a beginner. */
export function explain(ctx: Ctx, x: Sx): string {
  switch (ctx.target) {
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

  private act(c: string): Sx | null {
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
    const record = (ph: string): Sx | null => {
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
    };

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

/** The built-in composer: an expression for the prompt, or null when no phrasing matched. */
export function composeLocal(ctx: Ctx, prompt: string): Answer | null {
  let expr: Sx | null = null;
  try { expr = new Local(ctx).run(prompt); } catch { expr = null; }
  if (expr === null) return null;
  try { check(ctx, expr, ctx.target); } catch { return null; }
  return { expr, explanation: explain(ctx, expr) };
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

const TARGET_TASK: Record<Target, string> = {
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

/** The system prompt: the language, the document and the task. */
export function systemPrompt(ctx: Ctx): string {
  const fns = (['Math', 'Logic', 'Lists', 'Records', 'Text', 'Dates', 'Cells', 'Actions'] as const)
    .map((g) => FUNCTIONS.filter((f) => f.group === g).map((f) => `  ${f.use} — ${f.does}`).join('\n'))
    .join('\n');
  const colls = [...ctx.collections].map(([n, f]) => `  "${n}"${f.length ? ` with fields ${f.join(', ')}` : ''}`).join('\n');
  const c = ctx.cell;
  const where = c ? `cell ${c.id}${c.name ? ` named ${c.name}` : ''} (a ${c.kind}${c.type ? ` of type ${c.type}` : ''})` : 'the document';
  const notes = kindNotes(ctx);
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
    '',
    `Task: write ${TARGET_TASK[ctx.target]}, for ${where}.`,
    `Current code: ${ctx.current.trim() || '(none)'}`,
    '',
    'Rules:',
    '- Use only the functions above, the names of cells in the document, let/fn variables, and it, i, acc inside map/filter/reduce.',
    ctx.target === 'do'
      ? '- This is an action, so set!, toggle!, insert!, delete!, clear!, dup!, remove! and do are allowed.'
      : '- Do not use set!, toggle!, insert!, delete!, clear!, dup! or remove!: they only work in buttons.',
    '- Prefer the simplest expression that does what the person asked.',
    '- Answer with ONLY the expression in Lisp syntax inside a ```lisp block, followed by one line starting with "Explanation:" that tells a beginner, in one or two plain sentences, what it does and which cells it reads.',
  ].join('\n');
}

interface Block { type: string; text?: string }

async function messages(cfg: ClaudeConfig, system: string, msgs: { role: 'user' | 'assistant'; content: unknown }[]): Promise<Block[]> {
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
        max_tokens: 600,
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
  let last = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const content = await messages(cfg, system, msgs);
    const text = content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n');
    const { code, explanation } = parseReply(text);
    try {
      return { expr: validate(ctx, code, ctx.target), explanation };
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
      msgs.push({ role: 'assistant', content }, { role: 'user', content: `That code does not work here: ${last}. Answer again in the same format.` });
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
        const a = await composeClaude(ctx, prompt, p.claude);
        return finish(ctx, a.expr, 'claude', a.explanation, notes);
      } catch (e) {
        notes.push(`Claude could not answer: ${e instanceof Error ? e.message : String(e)}.`);
      }
    } else if (provider === 'agent') {
      if (!p.agent) {
        if (p.provider === 'agent') notes.push('No agent is listening on this document, so the built-in composer answered.');
        continue;
      }
      const a = await p.agent();
      if (a) return finish(ctx, a.expr, 'agent', a.explanation, notes);
      notes.push('Fell back to the built-in composer because no agent answered.');
    } else {
      const a = composeLocal(ctx, prompt);
      if (a) return finish(ctx, a.expr, 'local', a.explanation, notes);
    }
  }
  throw new ComposeError(
    notes.length ? `${notes.join(' ')} The built-in composer did not understand that either.` : 'I could not turn that into code. Try one of these phrasings.',
    suggestions(ctx),
  );
}
