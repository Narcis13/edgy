// The function reference, shaped for the editor: a doc per name, a signature
// with its arguments, a template to insert, and the colour of each group.

import { type FnDoc, FUNCTIONS } from '../../core/reference';
import { builtinNames, isBuiltin } from '../../core/sx';
import { type Known, spotAt } from './lexer';

export type Group = FnDoc['group'];
export const GROUPS: Group[] = ['Math', 'Logic', 'Lists', 'Records', 'Text', 'Dates', 'Cells', 'Actions'];

/** Colours by group, as CSS that follows the theme. */
export const GROUP_COLOR: Record<Group, string> = {
  Math: 'var(--series-1)', Logic: 'var(--series-4)', Lists: 'var(--series-3)', Records: 'var(--series-7)',
  Text: 'var(--series-2)', Dates: 'var(--series-5)', Cells: 'var(--live)', Actions: 'var(--series-8)',
};

const BY_NAME = new Map<string, FnDoc>();
for (const f of FUNCTIONS) for (const n of f.name.split(' ')) if (!BY_NAME.has(n)) BY_NAME.set(n, f);
/** Names the reference does not list on their own line. */
const EXTRA: Record<string, FnDoc> = {
  'empty?': { group: 'Logic', name: 'empty?', use: '(empty? x)', does: 'True when x is nothing, "", 0 or an empty list.' },
  count: { group: 'Lists', name: 'count', use: '(count xs)', does: 'How many items a list has.' },
  num: { group: 'Text', name: 'num', use: '(num s)', does: 'Text to a number.' },
  type: { group: 'Logic', name: 'type', use: '(type x)', does: 'What kind of value x is: number, string, list, record, fn or nil.' },
  'starts-with?': { group: 'Text', name: 'starts-with? ends-with?', use: '(starts-with? s "a")', does: 'Whether text starts (or ends) with other text.' },
  'ends-with?': { group: 'Text', name: 'starts-with? ends-with?', use: '(ends-with? s "z")', does: 'Whether text starts (or ends) with other text.' },
  ref: { group: 'Cells', name: 'ref', use: '(ref total)', does: 'The value of a cell, by name or id.' },
  child: { group: 'Cells', name: 'child', use: '(child lines -1)', does: 'The nth cell of a row or column; -1 is the last.' },
  when: { group: 'Logic', name: 'when', use: '(when test then)', does: 'A value only when the test holds, else nothing.' },
  quote: { group: 'Logic', name: 'quote', use: '(quote x)', does: 'x itself, not evaluated.' },
};

export function docFor(name: string): FnDoc | undefined {
  return BY_NAME.get(name) ?? EXTRA[name];
}

/** The top-level forms in a `use` string: "(list 1 2 3) (range 1 13)" gives two. */
export function formsOf(use: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  let inStr = false;
  for (let i = 0; i < use.length; i++) {
    const c = use[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    if (c === '(' || c === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === ')' || c === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        out.push(use.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return out.length ? out : [use];
}

/** Split a form's inside into its items: "(round x 2)" → ["round", "x", "2"]. */
export function itemsOf(form: string): string[] {
  const inner = /^[({]/.test(form) ? form.slice(1, -1) : form;
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  let inStr = false;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (inStr) {
      cur += c;
      if (c === '\\') cur += inner[++i] ?? '';
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    if (c === '(' || c === '{') depth++;
    if (c === ')' || c === '}') depth--;
    if (depth === 0 && /\s/.test(c)) {
      if (cur) out.push(cur);
      cur = '';
    } else cur += c;
  }
  if (cur) out.push(cur);
  return out;
}

/** Examples for names that share a line in the reference but not its shape. */
const USES: Record<string, string> = {
  'toggle!': '(toggle! done)', not: '(not a)', idx: '(idx)', 'delete!': '(delete! "orders" id)', 'clear!': '(clear! "orders")',
  'remove!': '(remove! (child lines -1))', abs: '(abs x)', sqrt: '(sqrt x)', floor: '(floor x)', ceil: '(ceil x)',
  filter: '(filter (> it 3) xs)', find: '(find (> it 3) xs)', some: '(some (> it 3) xs)', every: '(every (> it 3) xs)',
  'count-if': '(count-if (> it 3) xs)', sort: '(sort xs "desc")', reverse: '(reverse xs)', len: '(len xs)', first: '(first xs)',
  last: '(last xs)', rest: '(rest xs)', take: '(take xs 5)', drop: '(drop xs 1)', concat: '(concat xs ys)', flat: '(flat xs)',
  uniq: '(uniq xs)', 'includes?': '(includes? xs x)', where: '(where rows "status" "paid")', group: '(group rows "topic")',
  keys: '(keys record)', vals: '(vals record)', assoc: '(assoc record "key" value)', merge: '(merge a b)', obj: '(obj "key" value)',
  lower: '(lower s)', trim: '(trim s)', split: '(split s ",")', replace: '(replace s "old" "new")', year: '(year date)',
  month: '(month date)', day: '(day date)', weekday: '(weekday date)', 'date+': '(date+ date 30)', now: '(now)',
  avg: '(avg list …)', min: '(min list …)', max: '(max list …)',
};

/** The example call for one name: "(round x 2)", or null for names that are not calls. */
export function formFor(name: string): string | null {
  if (USES[name]) return USES[name];
  const d = docFor(name);
  if (!d || !d.use.startsWith('(')) return null;
  const forms = formsOf(d.use);
  const direct = forms.find((f) => itemsOf(f)[0] === name);
  if (direct) return direct;
  for (const f of forms) for (const it of itemsOf(f)) if (it.startsWith('(') && itemsOf(it)[0] === name) return it;
  const [head, ...args] = itemsOf(forms[0]);
  return d.name.split(' ').includes(head) ? `(${[name, ...args].join(' ')})` : `(${name})`;
}

export interface Signature {
  head: string;
  args: string[];
  does: string;
  group: Group;
}

/** A function's arguments as the reference spells them. */
export function signature(name: string): Signature | null {
  const d = docFor(name);
  const form = formFor(name);
  if (!d || !form) return null;
  const [, ...args] = itemsOf(form);
  return { head: name, args, does: d.does, group: d.group };
}

/** Which argument to emphasise; the last one when it is "…" and the call has gone past it. */
export function argToShow(sig: Signature, arg: number): number {
  if (arg < 0) return -1;
  if (arg < sig.args.length) return sig.args.at(-1) === '…' && arg >= sig.args.length - 1 ? sig.args.length - 1 : arg;
  return sig.args.at(-1) === '…' ? sig.args.length - 1 : -1;
}

/**
 * Text to insert for a function, with the span of its first placeholder so it
 * can be selected and typed over: "(round x 2)" selects "x".
 */
export function templateFor(name: string): { text: string; select: [number, number] | null } {
  const sig = signature(name);
  if (!sig) return { text: name === '{ }' ? '{key value}' : `(${name} )`, select: name === '{ }' ? [1, 4] : null };
  const args = sig.args.filter((a) => a !== '…');
  const text = `(${[name, ...args].join(' ')})`;
  if (!args.length) return { text, select: null };
  const at = name.length + 2;
  return { text, select: [at, at + args[0].length] };
}

/** How many arguments a function's template shows. */
export const arity = (name: string): number => signature(name)?.args.filter((a) => a !== '…').length ?? 1;

export interface FnEntry {
  group: Group;
  /** The names that can be inserted (empty for notes such as "a cell holding (fn …)"). */
  names: string[];
  label: string;
  use: string;
  does: string;
}

/** The reference as the Functions panel lists it. */
export const ENTRIES: FnEntry[] = FUNCTIONS.map((f) => ({
  group: f.group,
  names: f.name === '{ }' ? ['{ }'] : f.name.split(' ').filter((n) => isBuiltin(n)),
  label: f.name,
  use: f.use,
  does: f.does,
}));

// ── completions ──

export type ItemKind = 'local' | 'cell' | 'fn-cell' | 'builtin' | 'special' | 'action' | 'collection';

export interface Item {
  label: string;
  kind: ItemKind;
  /** A short line under or beside the label: a signature or a value. */
  detail?: string;
  doc?: string;
  group?: Group;
  /** Cells: the id, so the panel can show its kind. */
  id?: string;
}

export interface CellInfo {
  name: string;
  id: string;
  isFn: boolean;
  preview: string;
}

export interface Completion {
  from: number;
  to: number;
  items: Item[];
  /** The word sits right after "(", so a function needs no brackets of its own. */
  afterParen: boolean;
  inString: boolean;
}

const COLLECTION_HEADS = new Set(['rows', 'insert!', 'delete!', 'clear!']);
const ORDER: Record<ItemKind, number> = { local: 0, cell: 1, 'fn-cell': 1, special: 2, builtin: 2, action: 2, collection: 0 };
const HEAD_ORDER: Record<ItemKind, number> = { local: 0, 'fn-cell': 1, special: 2, builtin: 2, action: 2, cell: 3, collection: 0 };

function fnItem(name: string): Item {
  const d = docFor(name);
  const kind: ItemKind = /^[a-z]/.test(name) && name.endsWith('!') ? 'action' : ['if', 'cond', 'let', 'fn', 'do', 'when', 'and', 'or', 'quote', 'map', 'filter', 'find', 'some', 'every', 'count-if', 'sort-by', 'sum-by', 'reduce'].includes(name) ? 'special' : 'builtin';
  const sig = signature(name);
  return { label: name, kind, detail: sig ? `(${[name, ...sig.args].join(' ')})` : d?.use, doc: d?.does, group: d?.group };
}

let FN_ITEMS: Item[] | null = null;
const fnItems = () => (FN_ITEMS ??= builtinNames().filter((n) => /^[a-z]/.test(n)).map(fnItem));

/**
 * What can be typed at the offset. Without `force`, only while a word is being
 * typed (or a collection name inside (rows "…")).
 */
export function complete(
  src: string, offset: number, cells: CellInfo[], collections: string[], self?: string, force = false, known?: Known,
  /** Names bound around the code (an event's value), with what each holds. */
  locals: { name: string; does: string }[] = [],
): Completion | null {
  const spot = spotAt(src, offset, known, locals.map((l) => l.name));
  if (spot.comment) return null;
  if (spot.string) {
    const call = spot.call;
    if (!call || !call.head || !COLLECTION_HEADS.has(call.head) || call.arg !== 0) return null;
    const q = spot.string.text.toLowerCase();
    const items = collections.filter((c) => c.toLowerCase().includes(q)).map((c): Item => ({ label: c, kind: 'collection', detail: 'collection' }));
    return items.length ? { from: spot.string.start + 1, to: offset, items, afterParen: false, inString: true } : null;
  }
  if (spot.record?.key) return null;
  const word = spot.word;
  if (!word && !force) return null;
  const typed = word ? word.text.replace(/^\$/, '') : '';
  if (word && (/^[-+]?\d/.test(typed) || /^[-+.]$/.test(typed))) return null;
  if (!typed && !force) return null;
  const from = word ? word.start : offset;
  const afterParen = src[from - 1] === '(';
  const atHead = afterParen && (spot.call?.arg ?? 0) <= 0;
  const q = typed.toLowerCase();
  const pool: Item[] = [
    ...spot.locals.map((n): Item => ({ label: n, kind: 'local', detail: n === 'it' ? 'the item' : n === 'i' ? 'its index' : n === 'acc' ? 'the total so far' : locals.find((l) => l.name === n)?.does ?? 'local name' })),
    ...cells.filter((c) => c.id !== self).map((c): Item => ({ label: c.name, kind: c.isFn ? 'fn-cell' : 'cell', detail: c.preview, id: c.id })),
    ...fnItems(),
  ];
  const seen = new Set<string>();
  const ranked: { item: Item; score: number }[] = [];
  for (const item of pool) {
    if (seen.has(item.label)) continue;
    const l = item.label.toLowerCase();
    const rank = !q ? 0 : l.startsWith(q) ? 0 : l.includes(q) ? 1 : -1;
    if (rank < 0) continue;
    seen.add(item.label);
    ranked.push({ item, score: rank * 10 + (atHead ? HEAD_ORDER : ORDER)[item.kind] });
  }
  ranked.sort((a, b) => a.score - b.score || a.item.label.length - b.item.label.length || a.item.label.localeCompare(b.item.label));
  const items = ranked.slice(0, 60).map((r) => r.item);
  // Nothing left to complete once the only match is exactly what was typed.
  if (!items.length || (!force && items.length === 1 && items[0].label === typed)) return null;
  return { from, to: word ? word.end : offset, items, afterParen, inString: false };
}

/** The text an accepted item puts in place of the word, and where the caret goes in it. */
export function acceptText(item: Item, c: Completion, next = ''): { text: string; caret: number } {
  const isFn = item.kind === 'builtin' || item.kind === 'special' || item.kind === 'action' || item.kind === 'fn-cell';
  if (!isFn || c.inString) return { text: item.label, caret: item.label.length };
  const n = item.kind === 'fn-cell' ? 1 : arity(item.label);
  if (c.afterParen) {
    const space = n && next !== ' ' ? ' ' : '';
    return { text: item.label + space, caret: item.label.length + (n ? 1 : 0) };
  }
  const text = n ? `(${item.label} )` : `(${item.label})`;
  return { text, caret: n ? text.length - 1 : text.length };
}
