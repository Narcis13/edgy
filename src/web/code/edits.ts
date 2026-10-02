// The pure side of the Blocks editor: reading an expression as blocks and
// changing it by path. Every function returns new JSON and never mutates.

import type { Cell, Sx } from '../../core/types';
import { read } from '../../core/sx';
import { panelTitles } from '../../core/containers';
import { formFor, itemsOf } from './docs';

/** What the arguments of the list functions read as, so a block reads like a sentence. */
export const ITERATORS_LABELS: Record<string, string[]> = {
  map: ['make', 'for each it in'],
  filter: ['keep where', 'from'],
  find: ['first where', 'in'],
  some: ['any where', 'in'],
  every: ['all where', 'in'],
  'count-if': ['count where', 'in'],
  'sum-by': ['add up', 'for each it in'],
  'sort-by': ['by', 'sort', 'order'],
  reduce: ['combine', 'starting at', 'over'],
};

/** Steps from the root: an index into a call, or a key of a record. */
export type Path = (number | string)[];

export type NodeKind = 'call' | 'ref' | 'text' | 'number' | 'bool' | 'nil' | 'record' | 'list';

/** Calls whose first argument names a cell rather than reading its value. */
export const PLACE_HEADS = new Set(['set!', 'toggle!', 'dup!', 'remove!', 'ref', 'child']);

export function kindOf(x: Sx | undefined): NodeKind {
  if (x === null || x === undefined) return 'nil';
  if (typeof x === 'number') return 'number';
  if (typeof x === 'boolean') return 'bool';
  if (typeof x === 'string') return x.startsWith('$') ? 'ref' : 'text';
  if (Array.isArray(x)) {
    if (x.length === 2 && x[0] === 'quote' && typeof x[1] === 'string') return 'text';
    return x.length ? 'call' : 'list';
  }
  return 'record';
}

/** The call's head when it is a plain name. */
export const headOf = (x: Sx | undefined): string | null =>
  Array.isArray(x) && typeof x[0] === 'string' && !x[0].startsWith('$') ? x[0] : null;

export function getAt(x: Sx, path: Path): Sx | undefined {
  let cur: Sx | undefined = x;
  for (const step of path) {
    if (Array.isArray(cur) && typeof step === 'number') cur = cur[step];
    else if (cur && typeof cur === 'object' && !Array.isArray(cur) && typeof step === 'string') cur = cur[step];
    else return undefined;
  }
  return cur;
}

export function setAt(x: Sx, path: Path, v: Sx): Sx {
  if (!path.length) return v;
  const [step, ...rest] = path;
  if (Array.isArray(x) && typeof step === 'number') {
    const out = [...x];
    out[step] = setAt(x[step] ?? null, rest, v);
    return out;
  }
  if (x && typeof x === 'object' && !Array.isArray(x) && typeof step === 'string') {
    return { ...x, [step]: setAt(x[step] ?? null, rest, v) };
  }
  return x;
}

/** Fixed slots that read as a sentence; removing one empties it instead of shifting the rest. */
export function fixedSlots(head: string | null): number {
  if (!head) return 0;
  if (head === 'if') return 3;
  if (head === 'when') return 2;
  if (ITERATORS_LABELS[head]) return ITERATORS_LABELS[head].length;
  if (head === 'let' || head === 'fn') return 2;
  return 0;
}

/** Remove the item at a path: a call's argument, a record's field, or the whole thing. */
export function removeAt(x: Sx, path: Path): Sx {
  if (!path.length) return null;
  const parentPath = path.slice(0, -1);
  const step = path[path.length - 1];
  const parent = getAt(x, parentPath);
  if (Array.isArray(parent) && typeof step === 'number') {
    if (step <= fixedSlots(headOf(parent)) && step > 0) return setAt(x, path, null);
    return setAt(x, parentPath, parent.filter((_, i) => i !== step));
  }
  if (parent && typeof parent === 'object' && typeof step === 'string') {
    const { [step]: _gone, ...rest } = parent as Record<string, Sx>;
    return setAt(x, parentPath, rest);
  }
  return x;
}

/** Add an argument to the call at a path (at the end unless an index is given). */
export function insertArg(x: Sx, callPath: Path, v: Sx, index?: number): Sx {
  const call = getAt(x, callPath);
  if (!Array.isArray(call)) return x;
  const out = [...call];
  out.splice(index ?? out.length, 0, v);
  return setAt(x, callPath, out);
}

/** Add a field to the record at a path, with a fresh key. */
export function addField(x: Sx, recPath: Path, key = 'key', v: Sx = null): Sx {
  const rec = getAt(x, recPath);
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return x;
  let k = key;
  for (let n = 2; k in rec; n++) k = `${key}${n}`;
  return setAt(x, recPath, { ...rec, [k]: v });
}

/** Rename a record's key, keeping the order of the fields. */
export function renameKey(x: Sx, recPath: Path, from: string, to: string): Sx {
  const rec = getAt(x, recPath);
  if (!rec || typeof rec !== 'object' || Array.isArray(rec) || !to || from === to || to in rec) return x;
  return setAt(x, recPath, Object.fromEntries(Object.entries(rec).map(([k, v]) => [k === from ? to : k, v])));
}

/**
 * A call to fill in, from the reference's example: names become empty slots,
 * literals stay as sensible defaults, and it/acc/i stay (they mean something).
 * (round x 2) → ["round", null, 2]; (if test then else) → ["if", null, null, null].
 */
export function blankCall(name: string): Sx {
  if (name === 'let') return ['let', ['x', null], '$x'];
  if (name === 'fn') return ['fn', ['x'], null];
  const form = formFor(name);
  if (!form) return [name, null];
  let parsed: Sx;
  try {
    parsed = read(form);
  } catch {
    return [name, null];
  }
  if (!Array.isArray(parsed)) return [name, null];
  const blank = (v: Sx): Sx => {
    if (typeof v === 'string' && v.startsWith('$')) return ['$it', '$acc', '$i'].includes(v) ? v : null;
    if (Array.isArray(v)) {
      const out = v.filter((a) => a !== '$…').map((a, i) => (i === 0 && typeof a === 'string' ? a : blank(a)));
      // A place, as in (set! count …), names a cell: leave it for the person to choose.
      if (PLACE_HEADS.has(String(out[0])) && typeof out[1] === 'string') out[1] = null;
      return out;
    }
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, a]) => [k, blank(a)]));
    return v;
  };
  const out = blank(parsed) as Sx[];
  out[0] = name;
  return out;
}

/** Wrap the value at a path in a call to `name`, putting it in the call's first empty slot. */
export function wrapAt(x: Sx, path: Path, name: string): Sx {
  const old = getAt(x, path) ?? null;
  const call = blankCall(name) as Sx[];
  const slot = call.findIndex((a, i) => i > 0 && a === null);
  const out = [...call];
  if (slot > 0) out[slot] = old;
  else out.splice(1, 0, old);
  return setAt(x, path, out);
}

/** Swap the function of the call at a path, keeping its arguments. */
export function swapHead(x: Sx, path: Path, name: string): Sx {
  const call = getAt(x, path);
  if (!Array.isArray(call) || !call.length) return x;
  return setAt(x, path, [name, ...call.slice(1)]);
}

/** The label that reads before an argument, so special forms read like sentences. */
export function slotLabel(head: string | null, index: number, count: number): string | null {
  if (!head) return null;
  if (head === 'if') return [null, null, 'then', 'else'][index] ?? null;
  if (head === 'when') return index === 2 ? 'then' : null;
  if (head === 'cond') {
    const last = count % 2 === 0 && index === count - 1;
    if (last) return 'otherwise';
    return index % 2 ? (index === 1 ? null : 'or if') : 'then';
  }
  if (ITERATORS_LABELS[head]) return ITERATORS_LABELS[head][index - 1] ?? null;
  if (head === 'set!') return index === 2 ? 'to' : null;
  if (head === 'insert!') return index === 1 ? 'into' : index === 2 ? 'record' : null;
  if (head === 'fmt') return index === 2 ? 'as' : null;
  return null;
}

/** A hint for an empty slot, from the reference's example: (round x 2) → "x", "2". */
export function slotHint(head: string | null, index: number): string | null {
  if (!head) return null;
  const form = formFor(head);
  if (!form) return null;
  const items = itemsOf(form);
  const hint = items[index] ?? (items.at(-1) === '…' ? items.at(-2) : undefined);
  return hint && hint !== '…' && !/^[({"]/.test(hint) ? hint : null;
}

/** Short enough to sit on one line. */
export function isShort(x: Sx, limit = 34): boolean {
  let n = 0;
  let deep = 0;
  const walk = (v: Sx, d: number) => {
    deep = Math.max(deep, d);
    if (Array.isArray(v)) v.forEach((a) => walk(a, d + 1));
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, a]) => { n += k.length + 1; walk(a, d + 1); });
    else n += String(v).length + 1;
  };
  walk(x, 0);
  return n <= limit && deep <= 2;
}

/** The local names visible at a path: it and i inside map's expression, let and fn names in their bodies. */
export function localsAt(x: Sx, path: Path): string[] {
  const out: string[] = [];
  let cur: Sx | undefined = x;
  for (const step of path) {
    const head = headOf(cur);
    if (Array.isArray(cur) && typeof step === 'number' && head) {
      if (ITERATORS_LABELS[head] && head !== 'reduce' && step === 1) out.push('it', 'i');
      if (head === 'reduce' && step === 1) out.push('acc', 'it', 'i');
      if (head === 'let' && step >= 2 && Array.isArray(cur[1])) out.push(...cur[1].filter((_, j) => j % 2 === 0).map(String));
      if (head === 'fn' && step >= 2) out.push(...(Array.isArray(cur[1]) ? cur[1] : [cur[1]]).map((p) => String(p).replace(/^\$/, '')));
    }
    cur = getAt(cur ?? null, [step]);
  }
  return [...new Set(out)];
}

/** The cell a (set! place …) changes, when the path is its value slot. */
export function setTargetAt(x: Sx, path: Path): string | null {
  if (path.at(-1) !== 2) return null;
  const call = getAt(x, path.slice(0, -1));
  return headOf(call) === 'set!' && Array.isArray(call) && typeof call[1] === 'string' ? call[1] : null;
}

export interface ValueChoice {
  label: string;
  value: Sx;
  detail: string;
}

/**
 * The values a cell takes when it takes a known few: a tab's titles, an
 * accordion's sections (or none open), a collapsible open or folded.
 */
export function valueChoices(target: Cell | undefined): ValueChoice[] {
  if (!target) return [];
  // A title starting with $ would read as a cell; quoted, it stays text.
  const text = (t: string): Sx => (t.startsWith('$') ? ['quote', t] : t);
  if (target.kind === 'tabs') return panelTitles(target).map((t) => ({ label: t, value: text(t), detail: 'Show this tab' }));
  if (target.kind === 'accordion') {
    return [
      ...panelTitles(target).map((t) => ({ label: t, value: text(t), detail: target.multiple ? 'Open only this section' : 'Open this section' })),
      ...(target.multiple ? [{ label: 'All open', value: true, detail: 'Open every section' }] : []),
      { label: 'All closed', value: ['list'], detail: 'Close every section' },
    ];
  }
  if (target.kind === 'collapsible') return [{ label: 'Open', value: true, detail: 'Unfold it' }, { label: 'Folded', value: false, detail: 'Fold it' }];
  return [];
}
