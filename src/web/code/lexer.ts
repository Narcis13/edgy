// A forgiving tokenizer for colouring and helping while people type. It never
// throws: half-typed code still gets colours, a matching bracket, the call the
// caret is in and the local names that are in scope there.

import { PLACE_FORMS, isBuiltin } from '../../core/sx';

export type TokKind =
  | 'open' | 'close' | 'string' | 'number' | 'literal' | 'comment'
  | 'builtin' | 'special' | 'action' | 'fn' | 'unknown-fn'
  | 'ref' | 'local' | 'symbol' | 'key';

export interface Tok {
  kind: TokKind;
  start: number;
  end: number;
  text: string;
  /** Brackets: how deep they sit (0 is outermost). */
  depth?: number;
  /** Brackets: the index of the partner bracket, when there is one. */
  partner?: number;
  /** A string, comment or bracket that is never closed. */
  open?: boolean;
  /** A closing bracket with nothing to close. */
  stray?: boolean;
  /** The first symbol after "(". */
  head?: boolean;
}

/** What a name means in the document: a cell, a cell holding a function, or nothing. */
export type Known = (name: string) => 'cell' | 'fn' | null;

export const SPECIAL_FORMS = new Set([
  'if', 'cond', 'let', 'fn', 'do', 'when', 'and', 'or', 'quote',
  'map', 'filter', 'find', 'some', 'every', 'count-if', 'sort-by', 'sum-by', 'reduce',
]);
/** Calls whose first argument is an expression over `it` (and `i`). */
export const ITERATORS = new Set(['map', 'filter', 'find', 'some', 'every', 'count-if', 'sort-by', 'sum-by']);
const NUM_RE = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
const LITERALS = new Set(['true', 'false', 'nil', 'null']);

interface Raw {
  type: 'open' | 'close' | 'string' | 'comment' | 'atom';
  start: number;
  end: number;
  open?: boolean;
}

function scan(src: string): Raw[] {
  const out: Raw[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r' || ch === ',') { i++; continue; }
    if (ch === ';') {
      const start = i;
      while (i < src.length && src[i] !== '\n') i++;
      out.push({ type: 'comment', start, end: i });
      continue;
    }
    if (ch === '(' || ch === '{') { out.push({ type: 'open', start: i, end: i + 1 }); i++; continue; }
    if (ch === ')' || ch === '}') { out.push({ type: 'close', start: i, end: i + 1 }); i++; continue; }
    if (ch === '"') {
      const start = i++;
      let closed = false;
      while (i < src.length) {
        const c = src[i++];
        if (c === '\\') { i++; continue; }
        if (c === '"') { closed = true; break; }
      }
      i = Math.min(i, src.length);
      out.push({ type: 'string', start, end: i, ...(closed ? {} : { open: true }) });
      continue;
    }
    const start = i;
    while (i < src.length && !/[\s,(){}";]/.test(src[i])) i++;
    out.push({ type: 'atom', start, end: i });
  }
  return out;
}

interface Frame {
  /** Index of the opening token; -1 for the top level. */
  tok: number;
  pos: number;
  close: ')' | '}' | null;
  head: string | null;
  /** Items seen so far, the head included. */
  n: number;
  vars: string[];
  /** Names this frame binds for its later items (let, fn). */
  bound: string[];
  role?: 'bindings' | 'params';
}

/** The local names visible to item k of a frame. */
function varsFor(f: Frame, k: number): string[] {
  if (f.role === 'bindings') return k % 2 ? [...f.vars, ...f.bound] : f.vars;
  if (f.role === 'params') return f.vars;
  if (f.head && ITERATORS.has(f.head) && k === 1) return [...f.vars, 'it', 'i'];
  if (f.head === 'reduce' && k === 1) return [...f.vars, 'acc', 'it', 'i'];
  if ((f.head === 'let' || f.head === 'fn') && k >= 2) return [...f.vars, ...f.bound];
  return f.vars;
}

const bare = (s: string) => (s.startsWith('$') ? s.slice(1) : s);

function headKind(name: string, vars: string[], known?: Known): TokKind {
  if (vars.includes(name)) return 'local';
  if (SPECIAL_FORMS.has(name)) return 'special';
  if (name.endsWith('!')) return 'action';
  if (isBuiltin(name)) return 'builtin';
  if (known?.(name)) return 'fn';
  return 'unknown-fn';
}

interface Run {
  toks: Tok[];
  stack: Frame[];
  /** The token the stop offset falls in (a word being typed, a string, a comment). */
  at: Raw | null;
}

/** `locals`: names bound around the whole code, like an event's value in a handler. */
function run(src: string, known?: Known, stop = Infinity, locals: string[] = []): Run {
  const raws = scan(src);
  const toks: Tok[] = [];
  const stack: Frame[] = [{ tok: -1, pos: -1, close: null, head: null, n: 0, vars: locals, bound: [] }];
  let at: Raw | null = null;
  for (const r of raws) {
    if (r.start >= stop) break;
    if (stop !== Infinity) {
      if (r.type === 'atom' && r.end >= stop) { at = r; break; }
      if ((r.type === 'string' || r.type === 'comment') && (r.open || r.end > stop || (r.type === 'comment' && r.end === stop))) { at = r; break; }
    }
    const text = src.slice(r.start, r.end);
    const f = stack[stack.length - 1];
    if (r.type === 'comment') { toks.push({ kind: 'comment', start: r.start, end: r.end, text }); continue; }
    if (r.type === 'open') {
      const k = f.n++;
      const child: Frame = {
        tok: toks.length, pos: r.start, close: text === '(' ? ')' : '}', head: null, n: 0, vars: varsFor(f, k), bound: [],
      };
      if (f.close === ')' && f.head === 'let' && k === 1) child.role = 'bindings';
      if (f.close === ')' && f.head === 'fn' && k === 1) child.role = 'params';
      stack.push(child);
      toks.push({ kind: 'open', start: r.start, end: r.end, text, depth: stack.length - 2, open: true });
      continue;
    }
    if (r.type === 'close') {
      if (f.close === text) {
        stack.pop();
        const o = toks[f.tok];
        o.partner = toks.length;
        delete o.open;
        toks.push({ kind: 'close', start: r.start, end: r.end, text, depth: o.depth, partner: f.tok });
        if (f.role) stack[stack.length - 1].bound.push(...f.bound);
      } else {
        toks.push({ kind: 'close', start: r.start, end: r.end, text, depth: Math.max(0, stack.length - 2), stray: true });
      }
      continue;
    }
    const k = f.n++;
    if (r.type === 'string') {
      toks.push({ kind: 'string', start: r.start, end: r.end, text, ...(r.open ? { open: true } : {}) });
      continue;
    }
    // an atom
    let kind: TokKind;
    const name = bare(text);
    const vars = varsFor(f, k);
    const isRecord = f.close === '}';
    if (NUM_RE.test(text)) kind = 'number';
    else if (LITERALS.has(text)) kind = 'literal';
    else if (isRecord && k % 2 === 0) kind = 'key';
    else if (f.role === 'bindings' && k % 2 === 0) {
      kind = 'local';
      f.bound.push(name);
    } else if (f.role === 'params' || (f.head === 'fn' && k === 1)) {
      kind = 'local';
      f.bound.push(name);
    } else if (f.close === ')' && k === 0) {
      kind = headKind(name, vars, known);
      f.head = name;
      toks.push({ kind, start: r.start, end: r.end, text, head: true });
      continue;
    } else if (vars.includes(name)) kind = 'local';
    else if (known?.(name)) kind = 'ref';
    else if (f.head && PLACE_FORMS.has(f.head) && k === 1) kind = 'symbol';
    else if (isBuiltin(name)) kind = 'builtin';
    else kind = 'symbol';
    toks.push({ kind, start: r.start, end: r.end, text });
  }
  return { toks, stack, at };
}

/** Every token, classified, with brackets paired and their depth. */
export function lex(src: string, known?: Known, locals?: string[]): Tok[] {
  return run(src, known, Infinity, locals).toks;
}

export interface Spot {
  /** The innermost call around the offset; arg is -1 while the head itself is typed. */
  call: { head: string | null; arg: number; open: number } | null;
  /** Inside { }: whether the offset is where a key goes. */
  record: { key: boolean; open: number } | null;
  /** Local names in scope: it, i, acc, let and fn names. */
  locals: string[];
  /** The word ending at the offset (what autocomplete works on). */
  word: { start: number; end: number; text: string } | null;
  /** The string literal the offset sits in. */
  string: { start: number; text: string } | null;
  comment: boolean;
}

/** Where an offset sits: its call, the argument it is, what it can see. */
export function spotAt(src: string, offset: number, known?: Known, locals?: string[]): Spot {
  const { stack, at } = run(src, known, offset, locals);
  const f = stack[stack.length - 1];
  const spot: Spot = { call: null, record: null, locals: [], word: null, string: null, comment: false };
  if (f.close === ')') spot.call = { head: f.head, arg: f.n - 1, open: f.pos };
  if (f.close === '}') spot.record = { key: f.n % 2 === 0, open: f.pos };
  spot.locals = [...new Set(varsFor(f, f.n))];
  if (f.role === 'bindings' && f.n % 2 === 0) spot.locals = [];
  if (at?.type === 'atom') {
    let end = at.end;
    while (end < src.length && !/[\s,(){}";]/.test(src[end])) end++;
    spot.word = { start: at.start, end, text: src.slice(at.start, offset) };
  }
  if (at?.type === 'string') spot.string = { start: at.start, text: src.slice(at.start + 1, offset) };
  if (at?.type === 'comment') spot.comment = true;
  return spot;
}

/** The bracket at the caret (just before it, else just after) and its partner. */
export function matchAt(toks: Tok[], offset: number): { at: number; partner: number | null } | null {
  const isBracket = (t: Tok | undefined) => t && (t.kind === 'open' || t.kind === 'close');
  let i = toks.findIndex((t) => t.end === offset && isBracket(t));
  if (i < 0) i = toks.findIndex((t) => t.start === offset && isBracket(t));
  if (i < 0) return null;
  return { at: i, partner: toks[i].partner ?? null };
}

/** How far to indent a new line at the offset: two past the call that is still open. */
export function indentAt(src: string, offset: number): number {
  const { stack } = run(src, undefined, offset);
  const f = stack[stack.length - 1];
  if (f.tok < 0) return 0;
  const lineStart = src.lastIndexOf('\n', f.pos - 1) + 1;
  return f.pos - lineStart + (f.close === '}' ? 1 : 2);
}

/** The token under an offset, for hovering. */
export function tokenAt(toks: Tok[], offset: number): Tok | null {
  return toks.find((t) => t.start <= offset && offset < t.end) ?? null;
}

/**
 * Where inserted code should go. Right after a finished expression at the top
 * level ("(+ a b)|"), a second expression would not read, so it goes in as the
 * call's last argument instead: "(+ a b |)".
 */
export function insertionPoint(src: string, offset: number): number {
  const { stack, at } = run(src, undefined, offset);
  if (stack.length > 1 || at) return offset;
  const before = src.slice(0, offset).trimEnd();
  if (!before.endsWith(')') || src.slice(offset).trim()) return offset;
  const toks = lex(src);
  const close = toks.find((t) => t.end === before.length && t.kind === 'close' && t.partner != null);
  return close ? close.start : offset;
}
