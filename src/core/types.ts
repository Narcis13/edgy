// The whole model in one place. Everything here is plain JSON.

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/** An s-expression written as JSON: `["*", "$qty", "$price"]`. */
export type Sx = Json;

export type Dir = 'row' | 'col';
/**
 * Cells that hold cells. A row or col lays its children side by side or
 * stacked; tabs and an accordion hold panels (titled sections, one shown at a
 * time or folded); a collapsible is a stack under a heading that folds.
 */
export const GROUP_KINDS = ['row', 'col', 'tabs', 'accordion', 'collapsible', 'panel'] as const;
export type GroupKind = (typeof GROUP_KINDS)[number];
export const LEAF_KINDS = [
  'empty', 'text', 'formula', 'input', 'button', 'image', 'icon', 'chart', 'table', 'list', 'calendar', 'canvas', 'stat', 'break',
  'diagram', 'data',
] as const;
export type LeafKind = (typeof LEAF_KINDS)[number];
export type Kind = GroupKind | LeafKind;

/** A weight (shares free space), "hug" (as small as the content) or a fixed "120px". */
export type Size = number | string;

/**
 * A cell. A document is one root cell; splitting turns a cell into a `row` or
 * `col` of cells. In any property, a JSON array is an expression and a string
 * may carry `{{templates}}`.
 */
export interface Cell {
  id: string;
  kind: Kind;
  name?: string;
  size?: Size;
  style?: Record<string, Sx>;
  hidden?: Sx;
  children?: Cell[];

  text?: string;
  expr?: Sx;
  format?: string;
  type?: string;
  value?: Json;
  label?: string;
  placeholder?: string;
  min?: Sx;
  max?: Sx;
  step?: Sx;
  options?: Sx;
  do?: Sx;
  variant?: string;
  src?: string;
  fit?: string;
  alt?: string;
  icon?: string;
  /** stat: the earlier value the current one is compared with. */
  compare?: Sx;
  /** stat: a list of numbers drawn as a sparkline. */
  trend?: Sx;
  /**
   * table: which columns to show, in order, as names or records
   * {key, label, format, width, align, show, colors, color, bold, wrap, total}.
   */
  columns?: Json;
  /** table: the keys of the picked rows (a row's id, or its position). */
  selected?: Json;
  /** table: "one" or "many" rows can be picked; unset, none. */
  select?: string;
  /** table: the field whose values group the rows. */
  group?: string;
  /** table: buttons on every row, {label, do, icon?, variant?, confirm?}; `do` runs with `row` bound. */
  actions?: Json;
  /** table: lines between cells: "rows" (default), "columns", "grid", "outer", "none". */
  borders?: string;
  /** table: shade every other row. */
  stripes?: boolean;
  /** table, list: "compact", "normal" (default) or "roomy". */
  density?: string;
  /** table: the header row: "plain" (default), "filled", "strong" or "none". */
  header?: string;
  /** table: false hides the search box. */
  search?: boolean;
  /** canvas: the surface: "plain" (default), "lines", "grid" or "dots". */
  paper?: string;
  /** canvas: the colour the pen starts with; chart: the colour of the series. */
  color?: string;
  /** list: the bullet: "dot" (default), "dash", "arrow", "star" or "none". */
  marker?: string;
  /** list: false hides a checklist's progress bar. */
  progress?: boolean;
  /** calendar: the first day of the week, "mon" (default) or "sun". */
  week?: string;
  /** stat: "down" when a fall is good news (costs, bugs). */
  better?: string;
  /** button, row action: a question asked before it runs. */
  confirm?: string;
  /** panel: the tab or section heading; collapsible: its heading. Keys the container's value. */
  title?: string;
  /** accordion: true lets any number of sections be open; unset, one at a time. */
  multiple?: boolean;
}

export interface DocMeta {
  title: string;
  width?: number;
  minHeight?: number;
  currency?: string;
  /** Print surface: "A4", "A5", "Letter" or "Legal". */
  page?: string;
  /** "portrait" or "landscape". */
  orientation?: string;
  /** Page margin in millimetres. */
  margin?: number;
  /** What each printed page shows at its foot: "none", "number" or "title". */
  footer?: string;
  [k: string]: Json | undefined;
}

export interface Doc {
  id: string;
  v: number;
  nextId: number;
  meta: DocMeta;
  root: Cell;
}

/** An update, also an s-expression: `["split", "c1", "row"]`. */
export type Op = [string, ...Json[]];

export interface Actor {
  kind: 'human' | 'agent';
  name: string;
  id?: string;
}

const GROUPS = new Set<string>(GROUP_KINDS);
export const isGroup = (c: Cell): boolean => GROUPS.has(c.kind);
/** Tabs and accordions: their children are panels, and only panels. */
export const holdsPanels = (c: Cell | null | undefined): boolean => c?.kind === 'tabs' || c?.kind === 'accordion';
/** The tabs, accordion and collapsible: groups whose state (what is open) is their value. */
export const isContainer = (c: Cell | null | undefined): boolean => holdsPanels(c) || c?.kind === 'collapsible';
/** How a group lays out its children: side by side, stacked, or (tabs, accordion) as panels. */
export const flowOf = (c: Cell): Dir | null =>
  c.kind === 'row' ? 'row' : c.kind === 'col' || c.kind === 'panel' || c.kind === 'collapsible' ? 'col' : null;

export const NAME_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;
export const RESERVED_NAMES = new Set(['true', 'false', 'nil', 'null', 'it', 'i', 'acc']);

export function newDoc(id: string, title = 'Untitled'): Doc {
  return { id, v: 0, nextId: 2, meta: { title }, root: { id: 'c1', kind: 'empty' } };
}
