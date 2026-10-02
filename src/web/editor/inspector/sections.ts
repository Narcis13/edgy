// The pure side of the tabs, accordion, collapsible, data and diagram
// designers: the ops they send and the checks they make first.

import type { Cell, Json, Op } from '../../../core/types';
import { NAME_RE, RESERVED_NAMES } from '../../../core/types';
import { openSections, openTab, panelTitles, panelWord, toggleSection } from '../../../core/containers';
import { elementsOf, isBox } from '../../../core/diagram';

export interface PanelRow {
  id: string;
  /** The title that keys it: its own, or "Tab 2" when it has none. */
  title: string;
  open: boolean;
}

/** A container's panels, each with the title that keys it and whether it is open. */
export function panelRows(container: Cell): PanelRow[] {
  const titles = panelTitles(container);
  const open = container.kind === 'tabs' ? [openTab(container)] : openSections(container);
  return (container.children ?? []).map((p, i) => ({ id: p.id, title: titles[i], open: open.includes(titles[i]) }));
}

/** The word for one panel of this container, lower case: "tab" or "section". */
export const panelNoun = (container: Cell | null | undefined): string => (container?.kind === 'tabs' ? 'tab' : 'section');

/**
 * Renaming a panel: the op, or why not. Titles key what is open and matching
 * forgives case, so two titles that differ only in case would be one key.
 */
export function renamePanel(container: Cell, panelId: string, text: string): { op: Op } | { error: string } | null {
  const rows = panelRows(container);
  const me = rows.find((r) => r.id === panelId);
  if (!me) return null;
  const title = text.trim();
  if (title === me.title) return null;
  const noun = panelNoun(container);
  if (!title) return { error: `A ${noun} needs a title.` };
  if (rows.some((r) => r.id !== panelId && r.title.toLowerCase() === title.toLowerCase())) return { error: `There is already a ${noun} called “${title}”.` };
  return { op: ['set', panelId, 'title', title] };
}

/** Move a panel one place earlier (-1) or later (+1), or null at the end of the line. */
export function movePanel(container: Cell, panelId: string, delta: -1 | 1): Op | null {
  const kids = container.children ?? [];
  const i = kids.findIndex((k) => k.id === panelId);
  const other = kids[i + delta];
  if (i < 0 || !other) return null;
  return ['move', panelId, other.id, delta < 0 ? 'before' : 'after'];
}

/** A new panel after the last one; the core gives it a free title ("Tab 3"). */
export function addPanel(container: Cell): Op | null {
  const last = container.children?.at(-1);
  return last ? ['split', last.id, 'col'] : null;
}

/** Show a tab, or open (or close) an accordion's section. */
export function openPanel(container: Cell, title: string, open = true): Op | null {
  if (container.kind === 'tabs') return open ? ['set', container.id, 'value', title] : null;
  if (container.kind === 'accordion') return ['set', container.id, 'value', toggleSection(container, title, open)];
  return null;
}

/** One at a time or any number open; going back to one keeps only the first open section. */
export function accordionMode(acc: Cell, multiple: boolean): Op[] {
  if (!!acc.multiple === multiple) return [];
  const ops: Op[] = [['set', acc.id, 'multiple', multiple ? true : null]];
  if (!multiple) {
    const open = openSections({ ...acc, multiple: true });
    if (open.length > 1) ops.push(['set', acc.id, 'value', open.slice(0, 1)]);
  }
  return ops;
}

/** "Tab" or "Section" with its position: "Tab 2 of 3". */
export function panelPlace(container: Cell, panelId: string): string {
  const kids = container.children ?? [];
  return `${panelWord(container)} ${kids.findIndex((k) => k.id === panelId) + 1} of ${kids.length}`;
}

// ── names ──

/** A name not used by any cell: the base, else base2, base3… */
export function freeCellName(root: Cell, base: string): string {
  const used = new Set<string>();
  const walk = (c: Cell) => {
    if (c.name) used.add(c.name);
    c.children?.forEach(walk);
  };
  walk(root);
  const stem = NAME_RE.test(base) && !RESERVED_NAMES.has(base) ? base : 'cell';
  let n = stem;
  for (let i = 2; used.has(n); i++) n = `${stem}${i}`;
  return n;
}

/** What to call a cell of this kind when it is named for formulas. */
export const NAME_BASE: Record<string, string> = { tabs: 'view', accordion: 'faq', collapsible: 'more', data: 'data', diagram: 'flow' };

// ── data ──

export type DataType = 'number' | 'text' | 'bool' | 'list' | 'record';

export function dataType(v: Json | undefined): DataType | null {
  if (typeof v === 'number') return 'number';
  if (typeof v === 'string') return 'text';
  if (typeof v === 'boolean') return 'bool';
  if (Array.isArray(v)) return 'list';
  if (v && typeof v === 'object') return 'record';
  return null;
}

const asNumber = (s: string): number | null => {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** The value turned into another type, keeping what can be kept. */
export function convertData(v: Json | undefined, to: DataType): Json {
  const from = dataType(v);
  if (from === to) return v as Json;
  switch (to) {
    case 'number':
      return typeof v === 'string' ? asNumber(v) ?? 0 : typeof v === 'boolean' ? (v ? 1 : 0) : Array.isArray(v) ? v.length : 0;
    case 'text':
      return v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    case 'bool':
      return Array.isArray(v) ? v.length > 0 : v && typeof v === 'object' ? Object.keys(v).length > 0 : !!v && v !== '0' && v !== 'false';
    case 'list':
      return v == null || v === '' ? [] : v && typeof v === 'object' ? Object.values(v) : [v];
    case 'record':
      return Array.isArray(v) ? Object.fromEntries(v.map((x, i) => [`item${i + 1}`, x])) : v == null || v === '' ? {} : { value: v };
  }
}

/** A list of plain values can be edited one per line. */
export const plainList = (v: Json | undefined): v is (string | number | boolean)[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean');

export const listToLines = (v: (string | number | boolean)[]): string => v.map(String).join('\n');

/**
 * Lines back into a list. A line is a number only when it reads back the same
 * ("12", "0.5"), so "007" and "1e3" stay text; blank lines are dropped.
 */
export function linesToList(text: string): Json[] {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const n = Number(l);
    if (Number.isFinite(n) && String(n) === l) return n;
    if (l === 'true' || l === 'false') return l === 'true';
    return l;
  });
}

/** JSON typed by a person: the value, or a short reason it doesn't read. */
export function parseJson(text: string, want?: 'list' | 'record'): { value: Json } | { error: string } {
  let v: Json;
  try {
    v = JSON.parse(text) as Json;
  } catch (e) {
    const why = (e as Error).message.replace(/^JSON\.parse: /, '').replace(/\.?$/, '.');
    return { error: `That isn't valid JSON: ${why}` };
  }
  if (want === 'list' && !Array.isArray(v)) return { error: 'A list starts with [ and ends with ], like ["North", "South"].' };
  if (want === 'record' && (!v || typeof v !== 'object' || Array.isArray(v))) return { error: 'A record starts with { and ends with }, like {"vat": 0.2}.' };
  return { value: v };
}

/** A short example of changing a data cell, by its type. */
export function setExample(name: string, v: Json | undefined): string {
  switch (dataType(v)) {
    case 'number': return `(set! ${name} (+ ${name} 1))`;
    case 'bool': return `(set! ${name} (not ${name}))`;
    case 'list': return `(set! ${name} (concat ${name} (list "new")))`;
    case 'record': return `(set! ${name} (assoc ${name} "${Object.keys(v as object)[0] ?? 'key'}" 1))`;
    default: return `(set! ${name} "done")`;
  }
}

// ── diagram ──

/** The elements with the boxes' positions taken away, so the core lays them out again. */
export function tidyDiagram(value: Json | undefined): Json[] {
  return elementsOf(value).map((e) => {
    if (!isBox(e)) return e as unknown as Json;
    const { x: _x, y: _y, ...rest } = e;
    return rest as unknown as Json;
  });
}
