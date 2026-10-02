// The Events part's logic, apart from React so it can be tested: the events a
// cell (or the document) can handle and the handlers on them, the names a
// handler sees, presets that write a ready action, the ops an Apply makes, and
// what a run did, in words.

import type { Cell, Doc, Json, Op, Sx } from '../../core/types';
import { BUILTIN_EVENTS, EVENT_NAME_RE, type EventDecl, type TraceEntry, customEvents, eventsOf, sayEffect } from '../../core/events';
import { isBuiltin, print, read } from '../../core/sx';
import { walk } from '../../core/tree';

// ───────────────────────────── events and handlers ─────────────────────────────

/** What a custom event carries, for every listener. */
export const CUSTOM_DATA = 'payload: what was sent with it; from: the cell that sent it';

export interface EventRow {
  name: string;
  /** The draft key and the op path: on.<name>. */
  key: string;
  decl?: EventDecl;
  /** Sent with (emit! …), not raised by the cell or the document itself. */
  custom: boolean;
  /** Handled here although this kind never raises it (left from another kind). */
  stray?: boolean;
}

/** An `on` record as a plain map, ignoring anything that isn't one. */
export function handlerMap(on: unknown): Record<string, Sx> {
  if (!on || typeof on !== 'object' || Array.isArray(on)) return {};
  return Object.fromEntries(Object.entries(on as Record<string, Sx>).filter(([, v]) => v !== null && v !== undefined));
}

/** The handlers of a cell, or of the document when `cell` is null. */
export const handlersOf = (doc: Doc, cell: Cell | null): Record<string, Sx> => handlerMap(cell ? cell.on : doc.meta.on);

/**
 * The events a cell (or the document) can handle: its own first, then the
 * custom events the document uses, then any other name it already handles.
 */
export function eventRows(doc: Doc, cell: Cell | null): EventRow[] {
  const own = eventsOf(cell);
  const out: EventRow[] = own.map((d) => ({ name: d.name, key: 'on.' + d.name, decl: d, custom: false }));
  const seen = new Set(own.map((d) => d.name));
  const add = (name: string, stray = false) => {
    if (seen.has(name)) return;
    seen.add(name);
    const custom = !BUILTIN_EVENTS.has(name);
    out.push({ name, key: 'on.' + name, custom, ...(stray && !custom ? { stray: true } : {}) });
  };
  // Custom events reach every cell, but a container or a page break offers them only once it handles something.
  if (cell === null || own.length || cell.on) for (const n of customEvents(doc)) add(n);
  for (const n of Object.keys(handlersOf(doc, cell))) add(n, true);
  return out;
}

/** In words: "When agree changes", "When the document opens", "When saved is sent". */
export function sayEvent(name: string, who: string | null): string {
  const subject = who ?? 'the document';
  const verbs: Record<string, string> = {
    change: 'changes', click: 'is clicked', dblclick: 'is double-clicked', pick: 'has rows picked', tick: 'ticks', load: 'has loaded',
    fail: 'fails to load', open: 'opens', close: 'closes',
  };
  if (!BUILTIN_EVENTS.has(name)) return `When “${name}” is sent`;
  return `When ${subject} ${verbs[name] ?? `raises ${name}`}`;
}

/** The custom actions of the document, with their parameters. */
export function actionsOf(doc: Doc): { name: string; params: string[]; fn: Sx }[] {
  const a = doc.meta.actions;
  if (!a || typeof a !== 'object' || Array.isArray(a)) return [];
  return Object.entries(a as Record<string, Sx>)
    .filter(([, fn]) => fn !== null && fn !== undefined)
    .map(([name, fn]) => ({ name, params: paramsOf(fn), fn }));
}

/** The parameter names of a (fn (a b) …). */
export function paramsOf(fn: Sx): string[] {
  if (!Array.isArray(fn) || fn[0] !== 'fn') return [];
  const p = fn[1];
  return (Array.isArray(p) ? p : p == null ? [] : [p]).map((x) => String(x).replace(/^\$/, ''));
}

// ───────────────────────────── what a handler sees ─────────────────────────────

export interface EventVar {
  name: string;
  does: string;
}

/** "value: the new value; was: the value before" → [{value, …}, {was, …}]. */
export function parseData(data: string): EventVar[] {
  const out: EventVar[] = [];
  for (const part of data.split(';')) {
    const m = /^\s*([A-Za-z][\w-]*)\s*:\s*(.*?)\s*$/.exec(part);
    if (m && m[1] !== 'nothing') out.push({ name: m[1], does: m[2] });
  }
  return out;
}

/** The names a handler for this event finds bound: its data, the target, and the whole event. */
export function eventVars(row: Pick<EventRow, 'custom' | 'decl'>, onCell: boolean): EventVar[] {
  const out = parseData(row.custom ? CUSTOM_DATA : row.decl?.data ?? '');
  if (onCell && !out.some((v) => v.name === 'target')) out.push({ name: 'target', does: 'the name of the cell it happened to' });
  out.push({ name: 'event', does: 'all of it as a record: (get event "name"), and each piece above' });
  return out;
}

// ───────────────────────────── presets ─────────────────────────────

/** What a preset needs picked before it can write its action. */
export type Need = 'cell' | 'settable' | 'number' | 'timer' | 'fetch' | 'collection' | 'event' | 'action' | null;

export interface Preset {
  id: string;
  label: string;
  detail: string;
  need: Need;
  /** The code it writes, with <cell> standing for the pick. */
  shape: string;
}

export interface PresetContext {
  /** The names the event binds. */
  vars: string[];
  /** Kinds of the document's named cells, by name. */
  kinds: Record<string, string>;
  actions: { name: string; params: string[] }[];
}

/** The presets that make sense for an event, in the order they are offered. */
export function presetsFor(ctx: PresetContext): Preset[] {
  const has = (k: string) => Object.values(ctx.kinds).includes(k);
  const value = ctx.vars.includes('value');
  const first = dataVar(ctx.vars);
  const out: Preset[] = [
    value
      ? { id: 'set-value', label: 'Set a cell to the new value', detail: 'Copy what changed into another cell', need: 'settable', shape: '(set! <cell> value)' }
      : { id: 'set', label: 'Set a cell', detail: 'Give another cell a value you choose next', need: 'settable', shape: '(set! <cell> …)' },
    { id: 'count', label: 'Count up', detail: 'Add one to a number each time', need: 'number', shape: '(set! <cell> (+ <cell> 1))' },
    { id: 'toggle', label: 'Switch a yes/no cell', detail: 'Turn a checkbox or toggle over', need: 'settable', shape: '(toggle! <cell>)' },
    { id: 'show', label: 'Show a cell', detail: 'Unhide a note, a form, a thank-you', need: 'cell', shape: '(show! <cell>)' },
    { id: 'hide', label: 'Hide a cell', detail: 'Hide it until something shows it again', need: 'cell', shape: '(hide! <cell>)' },
    { id: 'save', label: 'Save a record', detail: 'Add a record to a collection', need: 'collection', shape: `(insert! "<collection>" ${first ? `{${first} ${first}}` : '{at (now)}'})` },
    { id: 'emit', label: 'Send an event', detail: 'Let other cells react to it', need: 'event', shape: `(emit! "<name>"${value ? ' value' : ''})` },
  ];
  if (has('timer')) {
    out.push({ id: 'start', label: 'Start a timer', detail: 'Start it ticking, from now', need: 'timer', shape: '(start! <timer>)' });
    out.push({ id: 'stop', label: 'Stop a timer', detail: 'Stop it ticking', need: 'timer', shape: '(stop! <timer>)' });
  }
  if (has('fetch')) out.push({ id: 'refresh', label: 'Fetch again', detail: 'Ask a fetch cell for fresh data', need: 'fetch', shape: '(refresh! <fetch>)' });
  if (ctx.actions.length) out.push({ id: 'call', label: 'Call an action', detail: 'Run one of the document’s own actions', need: 'action', shape: '(<action> …)' });
  return out;
}

/** The event's piece of data worth saving or sending: value, else the first other one. */
function dataVar(vars: string[]): string | null {
  if (vars.includes('value')) return 'value';
  return vars.find((v) => v !== 'event' && v !== 'target') ?? null;
}

/** The action a preset writes once its pick is made. */
export function presetAction(id: string, pick: string | null, ctx: PresetContext): Sx {
  const t = pick ?? '';
  const first = dataVar(ctx.vars);
  switch (id) {
    case 'set-value': return ['set!', t, '$value'];
    case 'set': return ['set!', t, null];
    case 'count': return ['set!', t, ['+', '$' + t, 1]];
    case 'toggle': return ['toggle!', t];
    case 'show': return ['show!', t];
    case 'hide': return ['hide!', t];
    case 'save': return ['insert!', t, first ? { [first]: '$' + first } : { at: ['now'] }];
    case 'emit': return ctx.vars.includes('value') ? ['emit!', t, '$value'] : ['emit!', t];
    case 'start': return ['start!', t];
    case 'stop': return ['stop!', t];
    case 'refresh': return ['refresh!', t];
    case 'call': {
      const a = ctx.actions.find((x) => x.name === t);
      return [t, ...(a?.params ?? []).map(() => null)];
    }
    default: return null;
  }
}

/** Kinds whose value a handler can set and keep (a formula's would be worked out again). */
const SETTABLE = new Set(['data', 'input', 'list', 'table', 'tabs', 'accordion', 'collapsible', 'calendar', 'canvas', 'text']);

export interface Target {
  name: string;
  id: string;
  kind: string;
}

/** What a preset's need can be: named cells of the right kind, never the cell itself. */
export function targetsFor(doc: Doc, need: Need, self: string | null): Target[] {
  const out: Target[] = [];
  walk(doc.root, (c) => {
    if (!c.name || c.id === self) return;
    const ok = need === 'cell' ? c.kind !== 'break' && c.kind !== 'timer' && c.kind !== 'fetch' && c.kind !== 'data'
      : need === 'settable' ? SETTABLE.has(c.kind)
      : need === 'number' ? c.kind === 'data' || (c.kind === 'input' && (c.type === 'number' || c.type === 'slider' || c.type === 'rating'))
      : need === 'timer' ? c.kind === 'timer'
      : need === 'fetch' ? c.kind === 'fetch'
      : false;
    if (ok) out.push({ name: c.name, id: c.id, kind: c.kind });
  });
  return out;
}

/** Collections to save into: the ones there are, then a couple of plain new names. */
export function collectionChoices(existing: string[]): { name: string; fresh: boolean }[] {
  const out = existing.map((name) => ({ name, fresh: false }));
  for (const n of ['responses', 'log']) if (!existing.includes(n)) out.push({ name: n, fresh: true });
  return out;
}

/** Event names to send: the document's custom events, then a few new ones. */
export function eventChoices(doc: Doc): { name: string; fresh: boolean }[] {
  const used = customEvents(doc);
  const out = used.map((name) => ({ name, fresh: false }));
  for (const n of ['saved', 'done', 'updated', 'reset']) if (!used.includes(n)) out.push({ name: n, fresh: true });
  return out;
}

/** Whether a name can be a custom event: the right shape, and not one the document raises itself. */
export function eventNameProblem(name: string): string | null {
  if (!name) return 'Give the event a name.';
  if (!EVENT_NAME_RE.test(name)) return 'Start with a letter; then letters, digits, - or _.';
  if (BUILTIN_EVENTS.has(name)) return `“${name}” is an event cells raise themselves; pick it from the list instead.`;
  return null;
}

/** Whether a name can be a custom action: a plain name nothing built in already has. */
export function actionNameProblem(name: string, taken: string[]): string | null {
  if (!name) return 'Give the action a name.';
  if (!/^[A-Za-z][\w-]*!?$/.test(name)) return 'Start with a letter; then letters, digits, - or _.';
  if (isBuiltin(name)) return `“${name}” is a built-in function already.`;
  if (taken.includes(name)) return `There is an action called “${name}” already.`;
  return null;
}

/** A new action's starting code: (fn (a b) nil). */
export function newAction(params: string[]): string {
  return print(['fn', params, null] as Sx, 60);
}

/** "who, amount" → ["who", "amount"]. */
export function splitParams(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/).map((s) => s.replace(/^\$/, '')).filter((s) => /^[A-Za-z][\w-]*$/.test(s)))];
}

// ───────────────────────────── applying ─────────────────────────────

/** Draft keys that changed: a key that is new counts only once it holds something. */
export function changedKeys(drafts: Record<string, string>, initial: Record<string, string>): string[] {
  return Object.keys(drafts).filter((k) => drafts[k] !== (initial[k] ?? ''));
}

/**
 * The ops one Apply makes, for a cell (its id) or the document (null). An empty
 * draft removes what was there. Fails on the first draft that doesn't read, or
 * an action that isn't a function.
 */
export function draftOps(target: string | null, drafts: Record<string, string>, keys: string[]): { ops: Op[] } | { error: string; key: string } {
  const ops: Op[] = [];
  for (const k of keys) {
    const t = drafts[k] ?? '';
    let x: Sx;
    try {
      x = t.trim() ? read(t) : null;
    } catch (e) {
      return { key: k, error: (e as Error).message };
    }
    if (k === 'hidden' && x === false) x = null;
    if (k.startsWith('actions.') && x !== null && (!Array.isArray(x) || x[0] !== 'fn')) {
      return { key: k, error: 'an action must be a function, like (fn (who) (set! greeting who))' };
    }
    ops.push(target === null ? ['meta', k, x as Json] : ['set', target, k, x as Json]);
  }
  return { ops };
}

// ───────────────────────────── what ran ─────────────────────────────

const short = (v: unknown): string => {
  const s = typeof v === 'string' ? JSON.stringify(v) : print(v as Sx, 10_000);
  return s.length > 40 ? s.slice(0, 39) + '…' : s;
};

/** One op as a person would say it. */
export function sayOp(op: Op, name: (id: string) => string): string {
  const [kind, id, path, value] = op;
  const who = name(String(id));
  if (kind === 'set' && path === 'value') return `set ${who} to ${short(value)}`;
  if (kind === 'set' && path === 'hidden') return value === true ? `hid ${who}` : value == null || value === false ? `showed ${who}` : `set when ${who} hides`;
  if (kind === 'set') return `changed ${who}’s ${String(path)}`;
  if (kind === 'meta') return `changed the document’s ${String(id)}`;
  if (kind === 'dup') return `copied ${who}`;
  if (kind === 'remove') return `removed ${who}`;
  if (kind === 'do') return (op.slice(1) as Op[]).map((o) => sayOp(o, name)).join('; ');
  return `${kind} ${who}`;
}

export interface RunLine {
  /** "agree · change", "the document · open". */
  head: string;
  depth: number;
  did: string[];
  error?: string;
}

/** A trace in words, one line per handler that ran. */
export function sayTrace(trace: TraceEntry[], name: (id: string) => string): RunLine[] {
  return trace.map((t) => ({
    head: `${t.cell === null ? 'the document' : name(t.cell)} · ${t.name}${t.via === 'do' ? ' (its action)' : ''}`,
    depth: t.depth,
    did: [...t.ops.map((o) => sayOp(o, name)), ...t.effects.map((e) => sayEffect(e, name))],
    ...(t.error ? { error: t.error } : {}),
  }));
}
