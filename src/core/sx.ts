// Sx: a small Lisp whose programs are JSON arrays.
//
//   ["*", "$qty", "$price"]        stored form (JSON)
//   (* qty price)                  what people type and read
//
// Rules: an array is a call, a string starting with "$" is a reference,
// every other JSON value is itself. `read` and `print` convert between the
// two spellings; `Interp` evaluates the JSON form.

import type { Json, Op, Sx } from './types';

export class SxError extends Error {
  /** Where in the source text a reading error was found, when known. */
  constructor(message: string, readonly pos?: number) {
    super(message);
  }
}

export type Effect =
  | { type: 'op'; op: Op }
  | { type: 'insert'; collection: string; record: Record<string, Json> }
  | { type: 'delete'; collection: string; id: string }
  | { type: 'clear'; collection: string };

/** What the language needs from the document it runs in. */
export interface Host {
  ref(name: string): unknown;
  sib(i: number): unknown;
  idx(): number;
  /** The id of the nth cell inside a row or column (negative counts from the end). */
  child(name: string, i: number): string;
  rows(collection: string): unknown[];
  now(): number;
  /** Resolves a cell for `set!` and friends. Only present while running an action. */
  place?(name: string): { id: string; value: unknown };
  effect?(e: Effect): void;
  currency?: string;
}

type Fn = (...args: unknown[]) => unknown;

// ───────────────────────────── reader ─────────────────────────────

type Node =
  | { t: 'sym'; v: string }
  | { t: 'str'; v: string }
  | { t: 'lit'; v: number | boolean | null }
  | { t: 'list'; v: Node[] }
  | { t: 'map'; v: Node[] };

const NUM_RE = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
const PLACE_FORMS = new Set(['set!', 'toggle!', 'dup!', 'remove!', 'ref', 'child']);

type Token = { t: string | { str: string }; pos: number };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/[\s,]/.test(ch)) { i++; continue; }
    if (ch === ';') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if ('(){}'.includes(ch)) { out.push({ t: ch, pos: i }); i++; continue; }
    if (ch === '"') {
      const start = i;
      let s = '';
      i++;
      for (;;) {
        if (i >= src.length) throw new SxError('a "string" is missing its closing quote', start);
        const c = src[i++];
        if (c === '"') break;
        if (c === '\\') {
          const e = src[i++];
          s += e === 'n' ? '\n' : e === 't' ? '\t' : e;
        } else s += c;
      }
      out.push({ t: { str: s }, pos: start });
      continue;
    }
    let j = i;
    while (j < src.length && !/[\s,(){}";]/.test(src[j])) j++;
    out.push({ t: src.slice(i, j), pos: i });
    i = j;
  }
  return out;
}

function parse(tokens: Token[], end: number): Node[] {
  let pos = 0;
  const form = (): Node => {
    const token = tokens[pos++];
    if (token === undefined) throw new SxError('the expression ends too early', end);
    const tok = token.t;
    if (typeof tok !== 'string') return { t: 'str', v: tok.str };
    if (tok === '(' || tok === '{') {
      const close = tok === '(' ? ')' : '}';
      const items: Node[] = [];
      for (;;) {
        if (pos >= tokens.length) throw new SxError(`missing ${close}`, token.pos);
        if (tokens[pos].t === close) { pos++; break; }
        items.push(form());
      }
      return { t: tok === '(' ? 'list' : 'map', v: items };
    }
    if (tok === ')' || tok === '}') throw new SxError(`unexpected ${tok}`, token.pos);
    if (tok === 'true') return { t: 'lit', v: true };
    if (tok === 'false') return { t: 'lit', v: false };
    if (tok === 'nil' || tok === 'null') return { t: 'lit', v: null };
    if (NUM_RE.test(tok)) return { t: 'lit', v: Number(tok) };
    return { t: 'sym', v: tok.startsWith('$') ? tok.slice(1) : tok };
  };
  const forms: Node[] = [];
  while (pos < tokens.length) {
    if (forms.length) throw new SxError('expected one expression; wrap several in (do …)', tokens[pos].pos);
    forms.push(form());
  }
  return forms;
}

function toJson(n: Node, head = false): Sx {
  switch (n.t) {
    case 'lit': return n.v;
    case 'str': return n.v.startsWith('$') ? ['quote', n.v] : n.v;
    case 'sym': return head ? n.v : '$' + n.v;
    case 'map': {
      if (n.v.length % 2) throw new SxError('{ } needs pairs: {key value key value}');
      const o: Record<string, Sx> = {};
      for (let i = 0; i < n.v.length; i += 2) {
        const k = n.v[i];
        if (k.t !== 'sym' && k.t !== 'str') throw new SxError('{ } keys must be words');
        o[k.v] = toJson(n.v[i + 1]);
      }
      return o;
    }
    case 'list': {
      if (!n.v.length) return [];
      const [h, ...rest] = n.v;
      const name = h.t === 'sym' ? h.v : null;
      const bare = (x: Node): Sx => (x.t === 'sym' || x.t === 'str' ? x.v : toJson(x));
      if (name === 'fn' && rest.length) {
        const p = rest[0];
        const params = p.t === 'list' ? p.v.map(bare) : [bare(p)];
        return ['fn', params, ...rest.slice(1).map((x) => toJson(x))];
      }
      if (name === 'let' && rest.length) {
        const b = rest[0];
        if (b.t !== 'list' || b.v.length % 2) throw new SxError('let needs pairs: (let (x 1 y 2) …)');
        const bindings = b.v.map((x, i) => (i % 2 ? toJson(x) : bare(x)));
        return ['let', bindings, ...rest.slice(1).map((x) => toJson(x))];
      }
      if (name && PLACE_FORMS.has(name) && rest.length) {
        return [name, bare(rest[0]), ...rest.slice(1).map((x) => toJson(x))];
      }
      return [name ?? toJson(h), ...rest.map((x) => toJson(x))];
    }
  }
}

/** Parse Lisp text into its JSON form. Empty text reads as null. */
export function read(src: string): Sx {
  const forms = parse(tokenize(src), src.length);
  return forms.length ? toJson(forms[0]) : null;
}

// ───────────────────────────── printer ─────────────────────────────

const isSymbol = (s: string) => s !== '' && !/[\s,(){}";$]/.test(s) && !NUM_RE.test(s) && !['true', 'false', 'nil', 'null'].includes(s);

function atom(x: Sx, bare = false): string | null {
  if (x === null) return 'nil';
  if (typeof x === 'boolean' || typeof x === 'number') return String(x);
  if (typeof x === 'string') {
    if (bare && isSymbol(x.replace(/^\$/, ''))) return x.replace(/^\$/, '');
    if (x.startsWith('$') && isSymbol(x.slice(1))) return x.slice(1);
    return JSON.stringify(x);
  }
  return null;
}

function printParts(x: Sx[], width: number, indent: number): string[] {
  const head = x[0];
  const name = typeof head === 'string' ? head : null;
  return x.map((item, i) => {
    if (i === 0) return atom(item, true) ?? print(item, width, indent + 1);
    if (i === 1 && name === 'fn' && Array.isArray(item)) return '(' + item.map((p) => atom(p, true) ?? '?').join(' ') + ')';
    if (i === 1 && name === 'let' && Array.isArray(item)) {
      return '(' + item.map((b, j) => (j % 2 ? print(b, width, indent + 2) : atom(b, true) ?? '?')).join(' ') + ')';
    }
    if (i === 1 && name && PLACE_FORMS.has(name) && typeof item === 'string') return atom(item, true)!;
    return print(item, width, indent + 2);
  });
}

/** Print JSON as Lisp text, wrapping long calls. */
export function print(x: Sx, width = 72, indent = 0): string {
  const a = atom(x);
  if (a !== null) return a;
  if (Array.isArray(x)) {
    if (!x.length) return '()';
    if (x[0] === 'quote' && x.length === 2 && typeof x[1] === 'string') return JSON.stringify(x[1]);
    const parts = printParts(x, width, indent);
    const flat = '(' + parts.join(' ') + ')';
    if (parts.length < 3 || (flat.length + indent <= width && !flat.includes('\n'))) return flat;
    const pad = ' '.repeat(indent + 2);
    return '(' + parts[0] + ' ' + parts[1] + '\n' + parts.slice(2).map((p) => pad + p).join('\n') + ')';
  }
  const entries = Object.entries(x as Record<string, Sx>);
  return '{' + entries.map(([k, v]) => (isSymbol(k) ? k : JSON.stringify(k)) + ' ' + print(v, width, indent + 2)).join(' ') + '}';
}

// ───────────────────────────── values ─────────────────────────────

export const truthy = (v: unknown): boolean =>
  !(v === false || v == null || v === 0 || v === '' || (Array.isArray(v) && v.length === 0));

const clean = (n: number) => (Number.isFinite(n) ? Number(n.toPrecision(12)) : n);

function describe(v: unknown): string {
  if (v === null || v === undefined) return 'nothing';
  if (typeof v === 'string') return JSON.stringify(v.length > 24 ? v.slice(0, 24) + '…' : v);
  if (Array.isArray(v)) return 'a list';
  if (typeof v === 'function') return 'a function';
  if (typeof v === 'object') return 'a record';
  return String(v);
}

export function toNum(v: unknown): number {
  if (typeof v === 'number') return v;
  if (v == null || v === '') return 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[,\s]/g, ''));
    if (!Number.isNaN(n)) return n;
  }
  throw new SxError(`expected a number, got ${describe(v)}`);
}

/** Every number found in the arguments, however deeply nested. Text is skipped. */
function numbersIn(args: unknown[], out: number[] = []): number[] {
  for (const a of args) {
    if (Array.isArray(a)) numbersIn(a, out);
    else if (typeof a === 'number') out.push(a);
    else if (typeof a === 'string' && a.trim() !== '' && !Number.isNaN(Number(a))) out.push(Number(a));
  }
  return out;
}

const toList = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null ? [] : [v]);

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((x, i) => deepEqual(x, bb[i]));
  }
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  return ka.length === kb.length && ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

function looseEq(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'string' && b !== '') return a === Number(b);
  if (typeof b === 'number' && typeof a === 'string' && a !== '') return b === Number(a);
  return deepEqual(a ?? null, b ?? null);
}

function compare(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'string' && typeof b === 'string') {
    const na = Number(a), nb = Number(b);
    if (a !== '' && b !== '' && !Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return a < b ? -1 : a > b ? 1 : 0;
  }
  return toNum(a) - toNum(b);
}

function toDate(v: unknown): Date {
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(v);
  if (typeof v === 'string' && v) {
    const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T00:00:00') : new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  throw new SxError(`expected a date, got ${describe(v)}`);
}

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ───────────────────────────── formatting ─────────────────────────────

const nfCache = new Map<string, Intl.NumberFormat>();
function nf(key: string, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  let f = nfCache.get(key);
  if (!f) nfCache.set(key, (f = new Intl.NumberFormat('en-US', opts)));
  return f;
}

function ago(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)} d ago`;
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** How a value is shown with no format chosen. */
export function show(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return String(v);
    const n = clean(v);
    return nf('auto' + (Math.abs(n) < 1 ? 4 : 2), { maximumFractionDigits: Math.abs(n) < 1 ? 4 : 2 }).format(n);
  }
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'function') return 'ƒ';
  if (Array.isArray(v)) return v.map(show).join(', ');
  return JSON.stringify(v);
}

/** Named formats: int, number, percent, compact, currency, USD/EUR/…, 0.00, date, time, datetime, ago. */
export function formatValue(v: unknown, format?: string | null, currency = 'USD', now = Date.now()): string {
  if (v == null) return '';
  if (!format || format === 'auto') return show(v);
  if (Array.isArray(v)) return v.map((x) => formatValue(x, format, currency, now)).join(', ');
  if (format === 'date' || format === 'time' || format === 'datetime' || format === 'ago') {
    let d: Date;
    try { d = toDate(v); } catch { return String(v); }
    if (format === 'ago') return ago(d.getTime(), now);
    if (format === 'date') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    if (format === 'time') return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  const n = typeof v === 'number' ? v : typeof v === 'boolean' ? NaN : Number(v);
  if (Number.isNaN(n)) return show(v);
  if (format === 'int') return nf('int', { maximumFractionDigits: 0 }).format(n);
  if (format === 'number') return nf('num', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  if (format === 'percent') return nf('pct', { style: 'percent', maximumFractionDigits: 1 }).format(n);
  if (format === 'compact') return nf('cmp', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  const code = format === 'currency' ? currency : /^[A-Za-z]{3}$/.test(format) ? format.toUpperCase() : null;
  if (code) {
    try { return nf('cur' + code, { style: 'currency', currency: code }).format(n); } catch { return show(n); }
  }
  const m = /^0(?:\.(0+))?(%?)$/.exec(format);
  if (m) {
    const d = m[1]?.length ?? 0;
    return m[2]
      ? nf('p' + d, { style: 'percent', minimumFractionDigits: d, maximumFractionDigits: d }).format(n)
      : nf('f' + d, { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
  }
  return show(v);
}

const plain = (v: unknown): string => (typeof v === 'number' ? String(clean(v)) : show(v));

// ───────────────────────────── interpreter ─────────────────────────────

class Scope {
  constructor(private vars: Record<string, unknown>, private parent?: Scope) {}
  find(name: string): { v: unknown } | undefined {
    for (let s: Scope | undefined = this; s; s = s.parent) if (Object.hasOwn(s.vars, name)) return { v: s.vars[name] };
    return undefined;
  }
}

type Builtin = (a: unknown[], I: Interp) => unknown;

const MAX_STEPS = 400_000;
const MAX_LIST = 20_000;

function needEffects(I: Interp, form: string) {
  if (!I.host.effect || !I.host.place) throw new SxError(`${form} only works in an action, such as a button`);
}

const BUILTINS: Record<string, Builtin> = {
  // arithmetic
  '+': (a) => clean(a.reduce((s: number, x) => s + toNum(x), 0)),
  '-': (a) => (a.length === 1 ? -toNum(a[0]) : clean(a.slice(1).reduce((s: number, x) => s - toNum(x), toNum(a[0])))),
  '*': (a) => clean(a.reduce((s: number, x) => s * toNum(x), 1)),
  '/': (a) =>
    clean(a.slice(1).reduce((s: number, x) => {
      const d = toNum(x);
      if (d === 0) throw new SxError('division by zero');
      return s / d;
    }, toNum(a[0]))),
  '%': (a) => {
    const d = toNum(a[1]);
    if (d === 0) throw new SxError('division by zero');
    return toNum(a[0]) % d;
  },
  '^': (a) => clean(Math.pow(toNum(a[0]), toNum(a[1]))),
  abs: (a) => Math.abs(toNum(a[0])),
  sqrt: (a) => Math.sqrt(toNum(a[0])),
  floor: (a) => Math.floor(toNum(a[0])),
  ceil: (a) => Math.ceil(toNum(a[0])),
  round: (a) => {
    const p = Math.pow(10, toNum(a[1] ?? 0));
    return Math.round((toNum(a[0]) + Number.EPSILON) * p) / p;
  },
  clamp: (a) => Math.min(Math.max(toNum(a[0]), toNum(a[1])), toNum(a[2])),
  sum: (a) => clean(numbersIn(a).reduce((s, x) => s + x, 0)),
  avg: (a) => {
    const n = numbersIn(a);
    return n.length ? clean(n.reduce((s, x) => s + x, 0) / n.length) : 0;
  },
  min: (a) => {
    const n = numbersIn(a);
    return n.length ? Math.min(...n) : 0;
  },
  max: (a) => {
    const n = numbersIn(a);
    return n.length ? Math.max(...n) : 0;
  },
  // (pmt rate periods principal): the payment on a loan
  pmt: (a) => {
    const r = toNum(a[0]), n = toNum(a[1]), pv = toNum(a[2]);
    if (n === 0) throw new SxError('pmt needs at least one period');
    return clean(r === 0 ? pv / n : (pv * r) / (1 - Math.pow(1 + r, -n)));
  },

  // comparison and logic
  '=': (a) => a.slice(1).every((x) => looseEq(a[0], x)),
  '!=': (a) => !looseEq(a[0], a[1]),
  '<': (a) => compare(a[0], a[1]) < 0,
  '<=': (a) => compare(a[0], a[1]) <= 0,
  '>': (a) => compare(a[0], a[1]) > 0,
  '>=': (a) => compare(a[0], a[1]) >= 0,
  not: (a) => !truthy(a[0]),
  default: (a) => a.find((x) => x != null && x !== '') ?? null,
  'empty?': (a) => !truthy(a[0]),

  // lists
  list: (a) => a,
  range: (a) => {
    const [start, end, step] = a.length === 1 ? [0, toNum(a[0]), 1] : [toNum(a[0]), toNum(a[1]), toNum(a[2] ?? 1)];
    if (step === 0) throw new SxError('range step cannot be 0');
    const out: number[] = [];
    for (let x = start; step > 0 ? x < end : x > end; x += step) {
      if (out.length >= MAX_LIST) throw new SxError('range is too long');
      out.push(clean(x));
    }
    return out;
  },
  len: (a) => (typeof a[0] === 'string' ? a[0].length : isRecord(a[0]) ? Object.keys(a[0]).length : toList(a[0]).length),
  count: (a) => toList(a[0]).length,
  nth: (a) => toList(a[0])[toNum(a[1])] ?? null,
  first: (a) => toList(a[0])[0] ?? null,
  last: (a) => toList(a[0]).at(-1) ?? null,
  rest: (a) => toList(a[0]).slice(1),
  take: (a) => (typeof a[0] === 'number' ? toList(a[1]).slice(0, a[0]) : toList(a[0]).slice(0, toNum(a[1]))),
  drop: (a) => (typeof a[0] === 'number' ? toList(a[1]).slice(a[0]) : toList(a[0]).slice(toNum(a[1]))),
  reverse: (a) => [...toList(a[0])].reverse(),
  sort: (a) => {
    const out = [...toList(a[0])].sort(compare);
    return a[1] === 'desc' ? out.reverse() : out;
  },
  concat: (a) => a.flatMap(toList),
  flat: (a) => a.flat(Infinity),
  uniq: (a) => toList(a[0]).filter((x, i, l) => l.findIndex((y) => deepEqual(x, y)) === i),
  join: (a) => toList(a[0]).map(plain).join(a[1] == null ? ', ' : String(a[1])),
  'includes?': (a) => (typeof a[0] === 'string' ? a[0].includes(String(a[1])) : toList(a[0]).some((x) => looseEq(x, a[1]))),
  column: (a) => toList(a[0]).map((r) => (Array.isArray(r) ? r[toNum(a[1])] ?? null : isRecord(r) ? r[String(a[1])] ?? null : null)),
  where: (a) => toList(a[0]).filter((r) => isRecord(r) && looseEq(r[String(a[1])], a[2])),
  group: (a) => {
    const groups = new Map<string, { key: unknown; count: number; rows: unknown[] }>();
    for (const r of toList(a[0])) {
      const key = isRecord(r) ? r[String(a[1])] ?? null : Array.isArray(r) ? r[toNum(a[1])] ?? null : r;
      const k = JSON.stringify(key);
      const g = groups.get(k) ?? { key, count: 0, rows: [] as unknown[] };
      g.count++;
      g.rows.push(r);
      groups.set(k, g);
    }
    return [...groups.values()];
  },

  // records
  obj: (a) => {
    const o: Record<string, unknown> = {};
    for (let i = 0; i + 1 < a.length; i += 2) o[String(a[i])] = a[i + 1];
    return o;
  },
  get: (a) => {
    const [c, k, d = null] = a;
    if (Array.isArray(c)) return c[toNum(k)] ?? d;
    if (isRecord(c)) return c[String(k)] ?? d;
    return d;
  },
  keys: (a) => (isRecord(a[0]) ? Object.keys(a[0]) : []),
  vals: (a) => (isRecord(a[0]) ? Object.values(a[0]) : []),
  assoc: (a) => ({ ...(isRecord(a[0]) ? a[0] : {}), [String(a[1])]: a[2] }),
  merge: (a) => Object.assign({}, ...a.filter(isRecord)),

  // text
  str: (a) => a.map(plain).join(''),
  upper: (a) => plain(a[0]).toUpperCase(),
  lower: (a) => plain(a[0]).toLowerCase(),
  trim: (a) => plain(a[0]).trim(),
  split: (a) => plain(a[0]).split(a[1] == null ? ',' : String(a[1])).map((s) => s.trim()),
  replace: (a) => plain(a[0]).split(String(a[1])).join(plain(a[2])),
  'starts-with?': (a) => plain(a[0]).startsWith(plain(a[1])),
  'ends-with?': (a) => plain(a[0]).endsWith(plain(a[1])),
  num: (a) => toNum(a[0]),
  fmt: (a, I) => formatValue(a[0], a[1] == null ? undefined : String(a[1]), I.host.currency, a[1] === 'ago' ? I.host.now() : 0),
  type: (a) =>
    a[0] == null ? 'nil' : Array.isArray(a[0]) ? 'list' : isRecord(a[0]) ? 'record' : typeof a[0] === 'function' ? 'fn' : typeof a[0],

  // dates
  now: (_a, I) => I.host.now(),
  today: (_a, I) => isoDay(new Date(I.host.now())),
  days: (a) => Math.round((toDate(a[1]).getTime() - toDate(a[0]).getTime()) / 86_400_000),
  'date+': (a) => {
    const d = toDate(a[0]);
    d.setDate(d.getDate() + toNum(a[1]));
    return isoDay(d);
  },
  year: (a) => toDate(a[0]).getFullYear(),
  month: (a) => toDate(a[0]).getMonth() + 1,
  day: (a) => toDate(a[0]).getDate(),
  weekday: (a) => toDate(a[0]).toLocaleDateString('en-US', { weekday: 'long' }),

  // the document
  ref: (a, I) => I.host.ref(String(a[0]).replace(/^\$/, '')),
  sib: (a, I) => I.host.sib(toNum(a[0])),
  idx: (_a, I) => I.host.idx(),
  child: (a, I) => I.host.child(String(a[0]).replace(/^\$/, ''), toNum(a[1] ?? 0)),
  rows: (a, I) => I.host.rows(String(a[0])),

  // actions
  'set!': (a, I) => {
    needEffects(I, 'set!');
    const { id } = I.host.place!(String(a[0]));
    I.host.effect!({ type: 'op', op: ['set', id, 'value', (a[1] ?? null) as Json] });
    return a[1] ?? null;
  },
  'toggle!': (a, I) => {
    needEffects(I, 'toggle!');
    const { id, value } = I.host.place!(String(a[0]));
    I.host.effect!({ type: 'op', op: ['set', id, 'value', !truthy(value)] });
    return !truthy(value);
  },
  'dup!': (a, I) => {
    needEffects(I, 'dup!');
    I.host.effect!({ type: 'op', op: ['dup', I.host.place!(String(a[0])).id] });
    return null;
  },
  'remove!': (a, I) => {
    needEffects(I, 'remove!');
    I.host.effect!({ type: 'op', op: ['remove', I.host.place!(String(a[0])).id] });
    return null;
  },
  'insert!': (a, I) => {
    needEffects(I, 'insert!');
    if (!isRecord(a[1])) throw new SxError('insert! needs a record: (insert! "orders" {qty qty})');
    I.host.effect!({ type: 'insert', collection: String(a[0]), record: a[1] as Record<string, Json> });
    return a[1];
  },
  'delete!': (a, I) => {
    needEffects(I, 'delete!');
    I.host.effect!({ type: 'delete', collection: String(a[0]), id: String(a[1]) });
    return null;
  },
  'clear!': (a, I) => {
    needEffects(I, 'clear!');
    I.host.effect!({ type: 'clear', collection: String(a[0]) });
    return null;
  },
};

const ALIASES: Record<string, string> = { mod: '%', pow: '^', 'has?': 'includes?', pluck: 'column', coalesce: 'default', concat: 'concat', average: 'avg', length: 'len' };

export const isBuiltin = (name: string) => name in BUILTINS || name in ALIASES || SPECIAL.has(name);
export const builtinNames = () => [...Object.keys(BUILTINS), ...SPECIAL].sort();

const SPECIAL = new Set(['if', 'cond', 'and', 'or', 'when', 'let', 'fn', 'do', 'quote', 'map', 'filter', 'find', 'some', 'every', 'count-if', 'sort-by', 'sum-by', 'reduce']);

export class Interp {
  private steps = 0;
  private depth = 0;
  constructor(public host: Host) {}

  run(x: Sx): unknown {
    return this.ev(x, new Scope({}));
  }

  private lookup(name: string, scope: Scope): unknown {
    const hit = scope.find(name);
    return hit ? hit.v : this.host.ref(name);
  }

  /** The function-valued argument of map/filter/…: a real function, or an expression over `it`. */
  private fnArg(x: Sx, scope: Scope, names = ['it', 'i']): Fn {
    if (Array.isArray(x) && x[0] === 'fn') return this.ev(x, scope) as Fn;
    if (typeof x === 'string') {
      if (x.startsWith('$')) {
        const v = this.ev(x, scope);
        return typeof v === 'function' ? (v as Fn) : () => v;
      }
      const b = BUILTINS[ALIASES[x] ?? x];
      if (b) return (...args) => b(args, this);
    }
    return (...args) => this.ev(x, new Scope(Object.fromEntries(names.map((n, i) => [n, args[i]])), scope));
  }

  ev(x: Sx, scope: Scope): unknown {
    if (x === null || typeof x === 'number' || typeof x === 'boolean') return x;
    if (typeof x === 'string') return x.startsWith('$') ? this.lookup(x.slice(1), scope) : x;
    if (++this.steps > MAX_STEPS) throw new SxError('this takes too long to compute');
    if (!Array.isArray(x)) {
      const o: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(x)) o[k] = this.ev(v, scope);
      return o;
    }
    if (!x.length) return [];
    if (++this.depth > 300) throw new SxError('this nests too deeply');
    try {
      return this.call(x, scope);
    } finally {
      this.depth--;
    }
  }

  private call(x: Sx[], scope: Scope): unknown {
    const head = x[0];
    if (typeof head === 'string' && !head.startsWith('$')) {
      const name = ALIASES[head] ?? head;
      switch (name) {
        case 'if':
          return truthy(this.ev(x[1], scope)) ? this.ev(x[2] ?? null, scope) : this.ev(x[3] ?? null, scope);
        case 'when':
          return truthy(this.ev(x[1], scope)) ? this.ev(x[2] ?? null, scope) : null;
        case 'cond': {
          for (let i = 1; i + 1 < x.length; i += 2) if (truthy(this.ev(x[i], scope))) return this.ev(x[i + 1], scope);
          return x.length % 2 === 0 ? this.ev(x[x.length - 1], scope) : null;
        }
        case 'and': {
          let v: unknown = true;
          for (let i = 1; i < x.length; i++) if (!truthy((v = this.ev(x[i], scope)))) return v;
          return v;
        }
        case 'or': {
          let v: unknown = false;
          for (let i = 1; i < x.length; i++) if (truthy((v = this.ev(x[i], scope)))) return v;
          return v;
        }
        case 'do': {
          let v: unknown = null;
          for (let i = 1; i < x.length; i++) v = this.ev(x[i], scope);
          return v;
        }
        case 'quote':
          return x[1] ?? null;
        case 'let': {
          const b = x[1];
          if (!Array.isArray(b)) throw new SxError('let needs pairs: (let (x 1) …)');
          let s = scope;
          for (let i = 0; i + 1 < b.length; i += 2) s = new Scope({ [String(b[i]).replace(/^\$/, '')]: this.ev(b[i + 1], s) }, s);
          let v: unknown = null;
          for (let i = 2; i < x.length; i++) v = this.ev(x[i], s);
          return v;
        }
        case 'fn': {
          const params = (Array.isArray(x[1]) ? x[1] : [x[1]]).map((p) => String(p).replace(/^\$/, ''));
          const body = x.slice(2);
          return (...args: unknown[]) => {
            const s = new Scope(Object.fromEntries(params.map((p, i) => [p, args[i] ?? null])), scope);
            let v: unknown = null;
            for (const b of body) v = this.ev(b, s);
            return v;
          };
        }
        case 'map':
        case 'filter':
        case 'find':
        case 'some':
        case 'every':
        case 'count-if':
        case 'sort-by':
        case 'sum-by': {
          const f = this.fnArg(x[1], scope);
          const l = toList(this.ev(x[2] ?? null, scope));
          if (name === 'map') return l.map((v, i) => f(v, i));
          if (name === 'filter') return l.filter((v, i) => truthy(f(v, i)));
          if (name === 'find') return l.find((v, i) => truthy(f(v, i))) ?? null;
          if (name === 'some') return l.some((v, i) => truthy(f(v, i)));
          if (name === 'every') return l.every((v, i) => truthy(f(v, i)));
          if (name === 'count-if') return l.filter((v, i) => truthy(f(v, i))).length;
          if (name === 'sum-by') return clean(l.reduce((s: number, v, i) => s + toNum(f(v, i)), 0));
          const out = l.map((v, i) => [f(v, i), v] as const).sort((p, q) => compare(p[0], q[0])).map((p) => p[1]);
          return this.ev(x[3] ?? null, scope) === 'desc' ? out.reverse() : out;
        }
        case 'reduce': {
          const f = this.fnArg(x[1], scope, ['acc', 'it', 'i']);
          return toList(this.ev(x[3] ?? null, scope)).reduce((acc, v, i) => f(acc, v, i), this.ev(x[2] ?? null, scope));
        }
      }
      const b = BUILTINS[name];
      if (b) return b(x.slice(1).map((a) => this.ev(a, scope)), this);
      // Not built in: a function held by a variable or by a cell.
      let f: unknown;
      const local = scope.find(head);
      if (local) f = local.v;
      else {
        try { f = this.host.ref(head); } catch { throw new SxError(`unknown function ${head}`); }
      }
      if (typeof f !== 'function') throw new SxError(`${head} is not a function`);
      return (f as Fn)(...x.slice(1).map((a) => this.ev(a, scope)));
    }
    const f = this.ev(head, scope);
    if (typeof f !== 'function') {
      throw new SxError(`a list must start with a function; use (list …) for plain data, got ${describe(f)}`);
    }
    return (f as Fn)(...x.slice(1).map((a) => this.ev(a, scope)));
  }
}

// ───────────────────────────── templates ─────────────────────────────

export interface TemplatePart {
  text?: string;
  raw?: string;
  expr?: Sx;
  format?: string;
  error?: string;
}

const tplCache = new Map<string, TemplatePart[]>();

/** Split "Total {{total | currency}}" into literal and expression parts. */
export function parseTemplate(text: string): TemplatePart[] {
  const hit = tplCache.get(text);
  if (hit) return hit;
  const parts: TemplatePart[] = [];
  const re = /\{\{([\s\S]+?)\}\}/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    let src = m[1];
    let format: string | undefined;
    const bar = src.lastIndexOf('|');
    if (bar > 0 && /^[\w.%\s]+$/.test(src.slice(bar + 1)) && !src.slice(bar).includes(')')) {
      format = src.slice(bar + 1).trim();
      src = src.slice(0, bar);
    }
    try {
      parts.push({ expr: read(src), format });
    } catch (e) {
      parts.push({ error: (e as Error).message, raw: m[0] });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  if (tplCache.size > 2000) tplCache.clear();
  tplCache.set(text, parts);
  return parts;
}

export const hasTemplate = (text: string) => text.includes('{{');

/** Rebuild a template after transforming each of its expressions. */
export function mapTemplate(text: string, fn: (x: Sx) => Sx): string {
  if (!hasTemplate(text)) return text;
  return parseTemplate(text)
    .map((p) => (p.text !== undefined ? p.text : p.error ? p.raw! : `{{${print(fn(p.expr!), 10_000)}${p.format ? ' | ' + p.format : ''}}}`))
    .join('');
}
