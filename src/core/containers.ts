// Tabs, accordions and collapsibles: what is open is the cell's value, keyed
// by the panels' titles so formulas read it as text: (= view "Details").

import type { Cell, Json } from './types';
import { truthy } from './sx';

/** What an untitled panel is called, by the kind of container it sits in. */
export const panelWord = (container: Cell): string => (container.kind === 'tabs' ? 'Tab' : 'Section');

/**
 * The titles that key a container's panels, in order. A missing title becomes
 * "Tab 2"; a repeated one gets a number, so every panel has its own key.
 */
export function panelTitles(container: Cell): string[] {
  const seen = new Set<string>();
  return (container.children ?? []).map((p, i) => {
    const base = (typeof p.title === 'string' ? p.title.trim() : '') || `${panelWord(container)} ${i + 1}`;
    let t = base;
    for (let n = 2; seen.has(t); n++) t = `${base} ${n}`;
    seen.add(t);
    return t;
  });
}

/** A title not yet used in the container: "Details", else "Details 2", … */
export function freeTitle(container: Cell, base?: string): string {
  const taken = new Set(panelTitles(container));
  const stem = base?.trim() || `${panelWord(container)} ${(container.children?.length ?? 0) + 1}`;
  let t = stem;
  for (let n = 2; taken.has(t); n++) t = `${stem.replace(/ \d+$/, '')} ${n}`;
  return t;
}

/** Match a wanted title to a real one: exactly, else ignoring case. */
function match(titles: string[], want: unknown): string | undefined {
  if (typeof want !== 'string') return undefined;
  return titles.find((t) => t === want) ?? titles.find((t) => t.toLowerCase() === want.trim().toLowerCase());
}

/** The open tab: the stored title when it names a panel, else the first panel. */
export function openTab(tabs: Cell): string | null {
  const titles = panelTitles(tabs);
  return match(titles, tabs.value) ?? titles[0] ?? null;
}

/**
 * The open sections of an accordion, in panel order. The stored value may be a
 * list of titles, one title, or true (all open); one-at-a-time keeps the first.
 */
export function openSections(acc: Cell): string[] {
  const titles = panelTitles(acc);
  const v = acc.value;
  const want = v === true ? titles : Array.isArray(v) ? v : v == null || v === false ? [] : [v];
  const open = new Set(want.map((w) => match(titles, w)).filter((t): t is string => !!t));
  const list = titles.filter((t) => open.has(t));
  return acc.multiple ? list : list.slice(0, 1);
}

/** Whether a collapsible is unfolded. Unset means open, so new content can be seen and edited. */
export const isOpen = (c: Cell): boolean => c.value === undefined || c.value === null || truthy(c.value);

/** The accordion's value after a section is opened or closed by a person. */
export function toggleSection(acc: Cell, title: string, open?: boolean): Json {
  const now = openSections(acc);
  const want = open ?? !now.includes(title);
  if (!acc.multiple) return want ? [title] : [];
  const titles = panelTitles(acc);
  const next = new Set(now);
  if (want) next.add(title);
  else next.delete(title);
  return titles.filter((t) => next.has(t));
}

/** The value a container holds, as formulas read it. */
export function containerValue(c: Cell): unknown {
  if (c.kind === 'tabs') return openTab(c);
  if (c.kind === 'accordion') return openSections(c);
  return isOpen(c);
}

/** After a panel is renamed, the container's value follows it, so the same panel stays open. */
export function renamedValue(container: Cell, from: string, to: string): Json | undefined {
  const v = container.value;
  if (container.kind === 'tabs') return typeof v === 'string' && v === from ? to : undefined;
  if (Array.isArray(v) && v.includes(from)) return v.map((x) => (x === from ? to : x));
  if (v === from) return to;
  return undefined;
}

/** The panels of a container that are showing: the open tab, the open sections, or all of them on paper. */
export function shownPanels(c: Cell, paper = false): Cell[] {
  const kids = c.children ?? [];
  if (paper || c.kind === 'panel' || c.kind === 'row' || c.kind === 'col') return kids;
  if (c.kind === 'collapsible') return isOpen(c) ? kids : [];
  const titles = panelTitles(c);
  const open = c.kind === 'tabs' ? [openTab(c)] : openSections(c);
  return kids.filter((_, i) => open.includes(titles[i]));
}

/** The leaves people can see: not those behind a closed tab or a folded section. */
export function shownLeaves(cell: Cell, out: Cell[] = []): Cell[] {
  if (!cell.children) out.push(cell);
  else for (const ch of shownPanels(cell)) shownLeaves(ch, out);
  return out;
}
