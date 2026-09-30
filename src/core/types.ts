// The whole model in one place. Everything here is plain JSON.

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/** An s-expression written as JSON: `["*", "$qty", "$price"]`. */
export type Sx = Json;

export type Dir = 'row' | 'col';
export const LEAF_KINDS = ['empty', 'text', 'formula', 'input', 'button', 'image', 'icon', 'chart', 'table'] as const;
export type LeafKind = (typeof LEAF_KINDS)[number];
export type Kind = Dir | LeafKind;

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
}

export interface DocMeta {
  title: string;
  width?: number;
  minHeight?: number;
  currency?: string;
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

export const isGroup = (c: Cell): boolean => c.kind === 'row' || c.kind === 'col';

export const NAME_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;
export const RESERVED_NAMES = new Set(['true', 'false', 'nil', 'null', 'it', 'i', 'acc']);

export function newDoc(id: string, title = 'Untitled'): Doc {
  return { id, v: 0, nextId: 2, meta: { title }, root: { id: 'c1', kind: 'empty' } };
}
