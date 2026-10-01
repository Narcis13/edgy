// Cell notation: cells written as s-expressions, the way an agent reads and
// writes them.
//
//   ["row",
//     ["text", "Quantity"],
//     ["input", {"name": "qty", "type": "number", "value": 2}],
//     ["formula", {"name": "total", "format": "currency"}, ["*", "$qty", "$price"]]]
//
// Shape: [kind, props?, ...body]. The body is the children of a row/col, the
// text of a text cell, the expression of a formula/chart/table, the label
// (and optional action) of a button, the source of an image, the name of an
// icon, the items of a list. A bare string among children is a text cell.

import { type Cell, type Json, type Kind, LEAF_KINDS, NAME_RE, RESERVED_NAMES, isGroup } from './types';
import { validSize } from './tree';

export class NotationError extends Error {}

const KINDS = new Set<string>(['row', 'col', ...LEAF_KINDS]);

const PROPS = [
  'name', 'size', 'style', 'hidden', 'text', 'expr', 'format', 'type', 'value', 'label', 'placeholder',
  'min', 'max', 'step', 'options', 'do', 'variant', 'src', 'fit', 'alt', 'icon', 'compare', 'trend', 'columns',
] as const;
export const SETTABLE = new Set<string>(PROPS);

export const STYLE_KEYS = new Set(['bg', 'fg', 'pad', 'gap', 'align', 'valign', 'font', 'size', 'weight', 'italic', 'border', 'radius', 'line', 'stack']);

const BODY: Partial<Record<Kind, keyof Cell>> = {
  text: 'text', formula: 'expr', chart: 'expr', table: 'expr', button: 'label', image: 'src', icon: 'icon',
  calendar: 'expr', stat: 'expr',
};

const isObject = (v: unknown): v is Record<string, Json> => typeof v === 'object' && v !== null && !Array.isArray(v);

export interface BuildCtx {
  gen: () => string;
  /** Ids already taken. Explicit ids are checked against it and added to it. */
  used: Set<string>;
  names: Set<string>;
}

export function checkName(name: unknown, names: Set<string>, used: Set<string>): string {
  if (typeof name !== 'string' || !NAME_RE.test(name)) {
    throw new NotationError(`"${name}" is not a usable name: start with a letter, then letters, digits, - or _`);
  }
  if (RESERVED_NAMES.has(name)) throw new NotationError(`"${name}" is reserved`);
  if (names.has(name)) throw new NotationError(`another cell is already named "${name}"`);
  if (used.has(name)) throw new NotationError(`"${name}" is the id of another cell`);
  return name;
}

export function checkStyle(style: unknown): Record<string, Json> {
  if (!isObject(style)) throw new NotationError('style must be an object like {"bg": "accent-soft"}');
  for (const k of Object.keys(style)) {
    if (!STYLE_KEYS.has(k)) throw new NotationError(`unknown style "${k}"; known: ${[...STYLE_KEYS].join(', ')}`);
  }
  return style;
}

/** Turn notation (or a raw cell object) into a cell, assigning ids where missing. */
export function build(n: Json, ctx: BuildCtx): Cell {
  if (typeof n === 'string') return { id: ctx.gen(), kind: 'text', text: n };
  let kind: string;
  let props: Record<string, Json> = {};
  let body: Json[] = [];
  if (Array.isArray(n)) {
    if (typeof n[0] !== 'string') throw new NotationError('a cell is written [kind, props?, ...body]');
    kind = n[0];
    body = n.slice(1);
    if (isObject(body[0])) props = body.shift() as Record<string, Json>;
  } else if (isObject(n) && typeof n.kind === 'string') {
    const { kind: k, children, ...rest } = n;
    kind = k as string;
    props = rest;
    body = Array.isArray(children) ? children : [];
  } else {
    throw new NotationError('a cell is written [kind, props?, ...body]');
  }
  if (!KINDS.has(kind)) throw new NotationError(`unknown kind "${kind}"; known: ${[...KINDS].join(', ')}`);

  const cell: Cell = { id: '', kind: kind as Kind };
  if (props.id != null) {
    const id = String(props.id);
    if (ctx.used.has(id)) throw new NotationError(`id ${id} is already taken`);
    ctx.used.add(id);
    cell.id = id;
  } else cell.id = ctx.gen();

  for (const [k, v] of Object.entries(props)) {
    if (k === 'id' || v == null) continue;
    if (!SETTABLE.has(k)) throw new NotationError(`unknown property "${k}" on ${kind}`);
    if (k === 'name') {
      cell.name = checkName(v, ctx.names, ctx.used);
      ctx.names.add(cell.name);
    } else if (k === 'size') {
      if (!validSize(v)) throw new NotationError(`size must be a weight, "hug" or "120px", got ${JSON.stringify(v)}`);
      if (v !== 1) cell.size = v;
    } else if (k === 'style') {
      if (Object.keys(checkStyle(v)).length) cell.style = v as Record<string, Json>;
    } else (cell as unknown as Record<string, Json>)[k] = v;
  }

  if (kind === 'row' || kind === 'col') {
    cell.children = body.map((b) => build(b, ctx));
  } else if (kind === 'list') {
    // The body is the items themselves: ["list", {"type": "check"}, "Milk", {"text": "Eggs", "done": true}]
    if (body.length && cell.value === undefined) cell.value = body.filter((b) => b != null);
    if (cell.value !== undefined && !Array.isArray(cell.value)) throw new NotationError('a list holds its items as a list');
  } else {
    const key = BODY[kind as Kind];
    if (key && body.length && body[0] != null && (cell as unknown as Record<string, Json>)[key] === undefined) {
      (cell as unknown as Record<string, Json>)[key] = body[0];
    }
    if (kind === 'button' && body.length > 1 && cell.do === undefined) cell.do = body[1];
    if (kind === 'text' && typeof (cell.text ?? '') !== 'string') throw new NotationError('text must be a string');
  }
  return cell;
}

/** Write a cell as notation. */
export function toNotation(cell: Cell, withIds = true): Json {
  const { id, kind, children, ...rest } = cell as Cell & Record<string, Json>;
  const key = BODY[kind];
  const props: Record<string, Json> = {};
  if (withIds) props.id = id;
  for (const [k, v] of Object.entries(rest)) if (k !== key && v !== undefined) props[k] = v as Json;
  let body: Json[] = [];
  if (isGroup(cell)) body = children!.map((ch) => toNotation(ch, withIds));
  else if (kind === 'list' && Array.isArray(rest.value) && rest.value.length) {
    delete props.value;
    body = rest.value as Json[];
  } else if (key && (rest as Record<string, Json>)[key] !== undefined) body = [(rest as Record<string, Json>)[key]];
  const needProps = Object.keys(props).length > 0 || (body.length > 0 && isObject(body[0]));
  return [kind, ...(needProps ? [props] : []), ...body];
}
