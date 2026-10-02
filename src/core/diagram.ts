// A diagram cell's content: a list of elements, plain JSON an agent can write.
//
//   {"id": "a", "type": "rect", "text": "Order placed", "x": 40, "y": 40}
//   {"id": "b", "type": "diamond", "text": "Paid?"}                 placed for you
//   {"type": "arrow", "from": "a", "to": "b", "text": "next"}       stays attached to a and b
//   {"type": "line", "x1": 0, "y1": 200, "x2": 300, "y2": 200}      free ends
//
// Shapes (rect, ellipse, diamond) and text are boxes; arrows and lines are
// connectors whose ends either sit on a box (from/to) or at a point. Colours
// are theme tokens. Everything here is pure, so the editor, the engine, the
// ops and the tests share the same geometry.

import type { Json } from './types';

export const SHAPES = ['rect', 'ellipse', 'diamond'] as const;
export const CONNECTORS = ['arrow', 'line'] as const;
export const ELEMENT_TYPES = [...SHAPES, 'text', ...CONNECTORS] as const;
export type ElementType = (typeof ELEMENT_TYPES)[number];

export interface DiagramEl {
  id: string;
  type: ElementType;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  /** A label; may carry {{templates}} that show live values. */
  text?: string;
  /** Stroke and text colour, a theme token such as "accent". */
  color?: string;
  /** Fill colour, a token such as "accent-soft". */
  fill?: string;
  /** Font size in px. */
  size?: number;
  dash?: boolean;
  from?: string;
  to?: string;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}

export interface Box { x: number; y: number; w: number; h: number }
export interface Pt { x: number; y: number }
export interface Ends { x1: number; y1: number; x2: number; y2: number }

export class DiagramError extends Error {}

const TYPES = new Set<string>(ELEMENT_TYPES);
const FIELDS = new Set(['id', 'type', 'x', 'y', 'w', 'h', 'text', 'color', 'fill', 'size', 'dash', 'from', 'to', 'x1', 'y1', 'x2', 'y2']);
const NUMS = ['x', 'y', 'w', 'h', 'size', 'x1', 'y1', 'x2', 'y2'] as const;

export const isConnector = (e: DiagramEl): boolean => e.type === 'arrow' || e.type === 'line';
export const isShape = (e: DiagramEl): boolean => e.type === 'rect' || e.type === 'ellipse' || e.type === 'diamond';
export const isBox = (e: DiagramEl): boolean => !isConnector(e);

export const DEFAULT_SIZE: Record<string, [number, number]> = { rect: [160, 64], ellipse: [160, 72], diamond: [176, 96] };
export const FONT = { shape: 15, text: 16, label: 13 };
export const LINE_HEIGHT = 1.3;
const CHAR = 0.56;
const GAP_X = 48;
const GAP_Y = 72;
const ORIGIN = 40;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const r1 = (n: number) => Math.round(n * 10) / 10;

/** The elements of a diagram value, skipping anything that isn't one. */
export function elementsOf(value: unknown): DiagramEl[] {
  return Array.isArray(value) ? (value.filter((e) => isObj(e) && typeof e.id === 'string' && TYPES.has(e.type as string)) as unknown as DiagramEl[]) : [];
}

export const fontOf = (e: DiagramEl): number => (num(e.size) && e.size > 0 ? e.size : isConnector(e) ? FONT.label : e.type === 'text' ? FONT.text : FONT.shape);

// ───────────────────────────── text ─────────────────────────────

/** Break text into lines that fit a width, on spaces where it can. */
export function wrapText(text: string, width: number, size: number): string[] {
  const max = Math.max(1, Math.floor(width / (size * CHAR)));
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      let w = word;
      while (w.length > max) {
        if (line) { out.push(line); line = ''; }
        out.push(w.slice(0, max));
        w = w.slice(max);
      }
      if (!line) line = w;
      else if (line.length + 1 + w.length <= max) line += ' ' + w;
      else { out.push(line); line = w; }
    }
    out.push(line);
  }
  return out;
}

/** The size a free text element needs for its words. */
export function measureText(text: string, size: number): { w: number; h: number } {
  const lines = (text || ' ').split('\n');
  const longest = Math.max(...lines.map((l) => l.length), 1);
  return { w: Math.ceil(longest * size * CHAR + 12), h: Math.ceil(lines.length * size * LINE_HEIGHT + 8) };
}

// ───────────────────────────── geometry ─────────────────────────────

/** The box an element takes up (a connector's is the rectangle around its ends). */
export function boxOf(e: DiagramEl, els?: Map<string, DiagramEl>): Box {
  if (isConnector(e)) {
    const ends = els ? connectorEnds(e, els) : null;
    const p = ends ?? { x1: e.x1 ?? 0, y1: e.y1 ?? 0, x2: e.x2 ?? 0, y2: e.y2 ?? 0 };
    return { x: Math.min(p.x1, p.x2), y: Math.min(p.y1, p.y2), w: Math.abs(p.x2 - p.x1), h: Math.abs(p.y2 - p.y1) };
  }
  const [dw, dh] = e.type === 'text' ? Object.values(measureText(e.text ?? '', fontOf(e))) : DEFAULT_SIZE[e.type];
  return { x: e.x ?? 0, y: e.y ?? 0, w: num(e.w) && e.w > 0 ? e.w : dw, h: num(e.h) && e.h > 0 ? e.h : dh };
}

export const centre = (b: Box): Pt => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/**
 * Where a ray from the centre of a shape towards a point leaves the shape,
 * pushed out by `gap` so an arrowhead doesn't sit on the outline.
 */
export function anchorPoint(type: ElementType, b: Box, toward: Pt, gap = 0): Pt {
  const c = centre(b);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  const hw = Math.max(b.w / 2, 0.5);
  const hh = Math.max(b.h / 2, 0.5);
  if (dx === 0 && dy === 0) return c;
  let t: number;
  if (type === 'ellipse') t = 1 / Math.sqrt((dx / hw) ** 2 + (dy / hh) ** 2);
  else if (type === 'diamond') t = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
  else t = Math.min(dx === 0 ? Infinity : hw / Math.abs(dx), dy === 0 ? Infinity : hh / Math.abs(dy));
  const len = Math.hypot(dx, dy);
  const k = t + gap / len;
  return { x: c.x + dx * k, y: c.y + dy * k };
}

/**
 * The two ends of an arrow or line. An end attached to a box sits where the
 * line between the two ends crosses that box's outline, so it follows the box
 * wherever it moves; a free end sits at its own point.
 */
export function connectorEnds(e: DiagramEl, els: Map<string, DiagramEl>, gap = 4): Ends | null {
  const a = e.from ? els.get(e.from) : undefined;
  const b = e.to ? els.get(e.to) : undefined;
  const boxA = a && !isConnector(a) ? boxOf(a) : null;
  const boxB = b && !isConnector(b) ? boxOf(b) : null;
  const pA: Pt | null = boxA ? centre(boxA) : num(e.x1) && num(e.y1) ? { x: e.x1, y: e.y1 } : null;
  const pB: Pt | null = boxB ? centre(boxB) : num(e.x2) && num(e.y2) ? { x: e.x2, y: e.y2 } : null;
  if (!pA || !pB) return null;
  const off = boxA && boxB ? parallelOffset(e, els.values()) : 0;
  if (off) {
    // One of several joining the same two boxes: run beside the others, not on top of them.
    const [p, q] = e.from! < e.to! ? [pA, pB] : [pB, pA];
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    if (len) {
      const n = { x: (-(q.y - p.y) / len) * off, y: ((q.x - p.x) / len) * off };
      const sA = { x: pA.x + n.x, y: pA.y + n.y };
      const sB = { x: pB.x + n.x, y: pB.y + n.y };
      const s = exitPoint(a!, sA, sB, gap);
      const t = exitPoint(b!, sB, sA, gap);
      return { x1: r1(s.x), y1: r1(s.y), x2: r1(t.x), y2: r1(t.y) };
    }
  }
  const s = boxA ? anchorPoint(a!.type, boxA, pB, gap) : pA;
  const t = boxB ? anchorPoint(b!.type, boxB, pA, gap) : pB;
  return { x1: r1(s.x), y1: r1(s.y), x2: r1(t.x), y2: r1(t.y) };
}

/** How far apart connectors joining the same two boxes run. */
export const PARALLEL_GAP = 28;

/**
 * How far a connector is pushed sideways so it doesn't sit on another that
 * joins the same two boxes (either way round): 0 when it is the only one.
 * The order in the list decides who goes which side, so it stays put. The
 * side is measured from the box with the smaller id, so a→b and b→a part.
 */
const pairsOf = new WeakMap<object, Map<string, string[]>>();
const pairKey = (x: DiagramEl) => (x.from! < x.to! ? x.from + '\u0000' + x.to : x.to + '\u0000' + x.from);

export function parallelOffset(e: DiagramEl, els: Iterable<DiagramEl>): number {
  if (!isConnector(e) || !e.from || !e.to || e.from === e.to) return 0;
  // Grouped once per list (or map) of elements: drawing asks this for every connector, many times a frame.
  let pairs = pairsOf.get(els);
  if (!pairs) {
    pairs = new Map();
    for (const x of els) {
      if (!isConnector(x) || !x.from || !x.to) continue;
      const k = pairKey(x);
      const list = pairs.get(k);
      if (list) list.push(x.id);
      else pairs.set(k, [x.id]);
    }
    pairsOf.set(els, pairs);
  }
  const same = pairs.get(pairKey(e)) ?? [];
  if (same.length < 2) return 0;
  return (same.indexOf(e.id) - (same.length - 1) / 2) * PARALLEL_GAP;
}

/**
 * Where a line from `start` (inside a box) towards `toward` leaves the box,
 * pushed out by `gap`. When the start isn't inside or the target is, it falls
 * back to the line from the box's centre.
 */
function exitPoint(e: DiagramEl, start: Pt, toward: Pt, gap: number): Pt {
  if (!insideBox(e, start) || insideBox(e, toward)) return anchorPoint(e.type, boxOf(e), toward, gap);
  const len = Math.hypot(toward.x - start.x, toward.y - start.y);
  const ux = (toward.x - start.x) / len;
  const uy = (toward.y - start.y) / len;
  let lo = 0, hi = len;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (insideBox(e, { x: start.x + ux * mid, y: start.y + uy * mid })) lo = mid;
    else hi = mid;
  }
  return { x: start.x + ux * (lo + gap), y: start.y + uy * (lo + gap) };
}

/** Whether a point is on a box element (inside it). */
export function insideBox(e: DiagramEl, p: Pt, pad = 0): boolean {
  const b = boxOf(e);
  const c = centre(b);
  const hw = b.w / 2 + pad;
  const hh = b.h / 2 + pad;
  const dx = Math.abs(p.x - c.x);
  const dy = Math.abs(p.y - c.y);
  if (e.type === 'ellipse') return (dx / hw) ** 2 + (dy / hh) ** 2 <= 1;
  if (e.type === 'diamond') return dx / hw + dy / hh <= 1;
  return dx <= hw && dy <= hh;
}

export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** The topmost element under a point, or null. Connectors are found within `tolerance`. */
export function hitTest(els: DiagramEl[], p: Pt, tolerance = 6): DiagramEl | null {
  const byId = new Map(els.map((e) => [e.id, e]));
  for (let i = els.length - 1; i >= 0; i--) {
    const e = els[i];
    if (isConnector(e)) {
      const ends = connectorEnds(e, byId);
      if (ends && distToSegment(p, { x: ends.x1, y: ends.y1 }, { x: ends.x2, y: ends.y2 }) <= tolerance) return e;
    } else if (insideBox(e, p)) return e;
  }
  return null;
}

/** The box around every element, or null for an empty diagram. */
export function bounds(els: DiagramEl[]): Box | null {
  const byId = new Map(els.map((e) => [e.id, e]));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const e of els) {
    const b = boxOf(e, byId);
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
  }
  return Number.isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

const overlaps = (a: Box, b: Box, gap = 16) =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

// ───────────────────────────── layout ─────────────────────────────

/** Lay boxes out top to bottom in layers that follow the arrows, centred on each other. */
function layered(boxes: DiagramEl[], edges: [string, string][], top: number, left: number): Map<string, Box> {
  const ids = boxes.map((b) => b.id);
  const layer = new Map(ids.map((id) => [id, 0]));
  const adj = new Map(ids.map((id) => [id, [] as string[]]));
  const incoming = new Set<string>();
  for (const [u, v] of edges) {
    if (u === v || !layer.has(u) || !layer.has(v)) continue;
    adj.get(u)!.push(v);
    incoming.add(v);
  }
  // Walk from the starts; an arrow back to a box still being walked closes a loop and doesn't push it down.
  const state = new Map<string, number>();
  const back = new Set<string>();
  const done: string[] = [];
  const visit = (u: string) => {
    state.set(u, 1);
    for (const v of adj.get(u)!) {
      if (state.get(v) === 1) back.add(u + '\u0000' + v);
      else if (!state.has(v)) visit(v);
    }
    state.set(u, 2);
    done.push(u);
  };
  for (const id of ids) if (!incoming.has(id) && !state.has(id)) visit(id);
  for (const id of ids) if (!state.has(id)) visit(id);
  for (const u of done.reverse()) {
    for (const v of adj.get(u)!) if (!back.has(u + '\u0000' + v)) layer.set(v, Math.max(layer.get(v)!, layer.get(u)! + 1));
  }
  const rows: DiagramEl[][] = [];
  for (const b of boxes) (rows[layer.get(b.id)!] ??= []).push(b);
  const sized = (e: DiagramEl) => boxOf({ ...e, x: 0, y: 0 });
  const full = Array.from(rows, (r) => r ?? []).filter((r) => r.length);
  const widths = full.map((r) => r.reduce((s, e) => s + sized(e).w, 0) + GAP_X * (r.length - 1));
  const widest = Math.max(...widths, 0);
  const out = new Map<string, Box>();
  let y = top;
  full.forEach((r, i) => {
    let x = left + (widest - widths[i]) / 2;
    const tall = Math.max(...r.map((e) => sized(e).h));
    for (const e of r) {
      const s = sized(e);
      out.set(e.id, { x: Math.round(x), y: Math.round(y + (tall - s.h) / 2), w: s.w, h: s.h });
      x += s.w + GAP_X;
    }
    y += tall + GAP_Y;
  });
  return out;
}

/**
 * Give every box without a position one: below the box an arrow comes from,
 * above the one it goes to, or (for boxes with no placed neighbour) in layers
 * under everything else. Boxes that have a position keep it.
 */
export function layoutDiagram(els: DiagramEl[]): DiagramEl[] {
  const unplaced = els.filter((e) => isBox(e) && !(num(e.x) && num(e.y)));
  if (!unplaced.length) return els;
  const edges: [string, string][] = els.filter((e) => isConnector(e) && e.from && e.to).map((e) => [e.from!, e.to!]);
  const placed = new Map<string, Box>();
  for (const e of els) if (isBox(e) && num(e.x) && num(e.y)) placed.set(e.id, boxOf(e));

  const pos = new Map<string, Box>();
  if (placed.size) {
    let todo = unplaced;
    for (let progress = true; progress && todo.length;) {
      progress = false;
      const rest: DiagramEl[] = [];
      for (const e of todo) {
        const s = boxOf({ ...e, x: 0, y: 0 });
        const pred = edges.find(([u, v]) => v === e.id && placed.has(u));
        const succ = edges.find(([u, v]) => u === e.id && placed.has(v));
        let at: Box | null = null;
        if (pred) {
          const p = placed.get(pred[0])!;
          at = { x: Math.round(p.x + p.w / 2 - s.w / 2), y: p.y + p.h + GAP_Y, w: s.w, h: s.h };
        } else if (succ) {
          const q = placed.get(succ[1])!;
          at = { x: Math.round(q.x + q.w / 2 - s.w / 2), y: q.y - GAP_Y - s.h, w: s.w, h: s.h };
        }
        if (!at) { rest.push(e); continue; }
        for (let guard = 0; guard < 200 && [...placed.values()].some((b) => overlaps(b, at!)); guard++) at.x += s.w + GAP_X;
        placed.set(e.id, at);
        pos.set(e.id, at);
        progress = true;
      }
      todo = rest;
    }
    if (todo.length) {
      const all = bounds(els.filter((e) => placed.has(e.id)).map((e) => ({ ...e, ...placed.get(e.id)! })));
      for (const [id, b] of layered(todo, edges, (all ? all.y + all.h : ORIGIN) + GAP_Y, all ? all.x : ORIGIN)) pos.set(id, b);
    }
  } else {
    for (const [id, b] of layered(unplaced, edges, ORIGIN, ORIGIN)) pos.set(id, b);
  }
  return els.map((e) => {
    const b = pos.get(e.id);
    return b ? { ...e, x: b.x, y: b.y, w: b.w, h: b.h } : e;
  });
}

// ───────────────────────────── checking and changing ─────────────────────────────

/**
 * Check a diagram's elements, give each an id, and place the boxes that have
 * no position. Throws DiagramError with a message an agent can act on.
 */
export function prepareDiagram(value: Json): DiagramEl[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new DiagramError('a diagram holds a list of elements, like {"type": "rect", "text": "Start"}');
  const used = new Set<string>();
  for (const raw of value) if (isObj(raw) && typeof raw.id === 'string') used.add(raw.id);
  let n = 1;
  const fresh = () => {
    while (used.has('e' + n)) n++;
    used.add('e' + n);
    return 'e' + n;
  };
  const seen = new Set<string>();
  const els = value.map((raw, i): DiagramEl => {
    if (!isObj(raw)) throw new DiagramError(`element ${i + 1} is not a record; write {"type": "rect", "text": "Start"}`);
    if (!TYPES.has(raw.type as string)) {
      throw new DiagramError(`element ${i + 1} has type ${JSON.stringify(raw.type ?? null)}; known: ${ELEMENT_TYPES.join(', ')}`);
    }
    for (const k of Object.keys(raw)) if (!FIELDS.has(k)) throw new DiagramError(`element ${i + 1} has an unknown field "${k}"; known: ${[...FIELDS].join(', ')}`);
    for (const k of NUMS) if (raw[k] != null && !num(raw[k])) throw new DiagramError(`element ${i + 1}: ${k} must be a number`);
    const id = raw.id == null ? fresh() : String(raw.id);
    if (seen.has(id)) throw new DiagramError(`two elements share the id "${id}"`);
    seen.add(id);
    const e = { ...raw, id } as DiagramEl;
    if (e.text != null && typeof e.text !== 'string') e.text = String(e.text);
    return e;
  });
  const ids = new Set(els.map((e) => e.id));
  for (const e of els) {
    if (!isConnector(e)) continue;
    for (const end of ['from', 'to'] as const) {
      const ref = e[end];
      if (ref != null && (!ids.has(ref) || isConnector(els.find((x) => x.id === ref)!))) {
        throw new DiagramError(`${e.type} ${e.id} goes ${end} "${ref}", which is not a shape or text in this diagram`);
      }
    }
    if (!e.from && !(num(e.x1) && num(e.y1))) throw new DiagramError(`${e.type} ${e.id} needs "from" (an element id) or x1 and y1`);
    if (!e.to && !(num(e.x2) && num(e.y2))) throw new DiagramError(`${e.type} ${e.id} needs "to" (an element id) or x2 and y2`);
  }
  return layoutDiagram(els);
}

/**
 * Add elements, or change the ones whose id is already there (fields set to
 * null are removed). New elements without a position are placed for you.
 */
export function upsertElements(current: DiagramEl[], patch: Json[]): DiagramEl[] {
  const out = current.map((e) => ({ ...e }) as Record<string, Json>);
  const at = new Map(out.map((e, i) => [e.id as string, i]));
  for (const p of patch) {
    if (!isObj(p)) throw new DiagramError('each element to draw is a record, like {"type": "rect", "text": "Start"}');
    const i = typeof p.id === 'string' ? at.get(p.id) : undefined;
    if (i === undefined) {
      const add: Record<string, Json> = {};
      for (const [k, v] of Object.entries(p)) if (v != null) add[k] = v as Json;
      out.push(add);
      continue;
    }
    const next = { ...out[i] };
    for (const [k, v] of Object.entries(p)) {
      if (v === null) delete next[k];
      else next[k] = v as Json;
    }
    // A box whose position was taken away (x: null) is placed again.
    out[i] = next;
  }
  return prepareDiagram(out as Json[]);
}

/** Remove elements, and the arrows and lines attached to them. */
export function eraseElements(els: DiagramEl[], ids: Iterable<string>): DiagramEl[] {
  const gone = new Set(ids);
  return els.filter((e) => !gone.has(e.id) && !(isConnector(e) && ((e.from && gone.has(e.from)) || (e.to && gone.has(e.to)))));
}

/** Move elements by an offset. Attached connector ends follow their boxes by themselves. */
export function moveElements(els: DiagramEl[], ids: Iterable<string>, dx: number, dy: number): DiagramEl[] {
  const sel = new Set(ids);
  const round = (n: number) => Math.round(n);
  return els.map((e) => {
    if (!sel.has(e.id)) return e;
    if (!isConnector(e)) return { ...e, x: round(boxOf(e).x + dx), y: round(boxOf(e).y + dy) };
    const next = { ...e };
    if (!e.from && num(e.x1) && num(e.y1)) { next.x1 = round(e.x1 + dx); next.y1 = round(e.y1 + dy); }
    if (!e.to && num(e.x2) && num(e.y2)) { next.x2 = round(e.x2 + dx); next.y2 = round(e.y2 + dy); }
    return next;
  });
}

/** Copy elements beside themselves. Connectors between copied boxes join the copies. */
export function duplicateElements(els: DiagramEl[], ids: Iterable<string>, offset = 24): { els: DiagramEl[]; made: string[] } {
  const sel = new Set(ids);
  const used = new Set(els.map((e) => e.id));
  let n = 1;
  const fresh = () => {
    while (used.has('e' + n)) n++;
    used.add('e' + n);
    return 'e' + n;
  };
  const map = new Map<string, string>();
  for (const e of els) if (sel.has(e.id)) map.set(e.id, fresh());
  const copies = els.filter((e) => sel.has(e.id)).map((e) => {
    const c: DiagramEl = { ...e, id: map.get(e.id)! };
    if (!isConnector(e)) return { ...c, x: boxOf(e).x + offset, y: boxOf(e).y + offset };
    const ends = connectorEnds(e, new Map(els.map((x) => [x.id, x])));
    for (const [end, p, q] of [['from', 'x1', 'y1'], ['to', 'x2', 'y2']] as const) {
      const ref = e[end];
      if (ref && map.has(ref)) c[end] = map.get(ref);
      else {
        delete c[end];
        const px = ends ? (end === 'from' ? ends.x1 : ends.x2) : (e[p] ?? 0);
        const py = ends ? (end === 'from' ? ends.y1 : ends.y2) : (e[q] ?? 0);
        c[p] = Math.round(px + offset);
        c[q] = Math.round(py + offset);
      }
    }
    return c;
  });
  return { els: [...els, ...copies], made: copies.map((c) => c.id) };
}

/** Resize a box by dragging one of its handles ("n", "se", …); the opposite edge stays put. */
export function resizeBox(b: Box, handle: string, dx: number, dy: number, min = 16): Box {
  let { x, y, w, h } = b;
  if (handle.includes('e')) w = Math.max(min, w + dx);
  if (handle.includes('s')) h = Math.max(min, h + dy);
  if (handle.includes('w')) { const nw = Math.max(min, w - dx); x += w - nw; w = nw; }
  if (handle.includes('n')) { const nh = Math.max(min, h - dy); y += h - nh; h = nh; }
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

// ───────────────────────────── for the editor ─────────────────────────────

/** How wide a connector's label may grow before it wraps. */
export const LABEL_WIDTH = 160;

/** An id no element has yet: e1, e2, … */
export function newId(els: DiagramEl[]): string {
  const used = new Set(els.map((e) => e.id));
  let n = 1;
  while (used.has('e' + n)) n++;
  return 'e' + n;
}

/** The box between two opposite corners, whichever way it was dragged. */
export const boxBetween = (a: Pt, b: Pt): Box => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) });

/** The topmost shape or text under a point (or within `pad` of it); `skip` leaves one out. */
export function boxAt(els: DiagramEl[], p: Pt, pad = 0, skip?: string): DiagramEl | null {
  for (let i = els.length - 1; i >= 0; i--) {
    const e = els[i];
    if (isBox(e) && e.id !== skip && insideBox(e, p, pad)) return e;
  }
  return null;
}

/**
 * What a click picks. Shapes and text are drawn over arrows and lines, so
 * they come first; then the connector nearest the point within `tolerance`.
 */
export function pickAt(els: DiagramEl[], p: Pt, tolerance = 6): DiagramEl | null {
  const box = boxAt(els, p);
  if (box) return box;
  const byId = new Map(els.map((e) => [e.id, e]));
  let best: DiagramEl | null = null;
  let bestD = tolerance;
  for (const e of els) {
    if (!isConnector(e)) continue;
    const ends = connectorEnds(e, byId);
    const d = ends ? distToSegment(p, { x: ends.x1, y: ends.y1 }, { x: ends.x2, y: ends.y2 }) : Infinity;
    if (d <= bestD) { best = e; bestD = d; }
  }
  return best;
}

/** The ids of the elements lying wholly inside a box, as a marquee picks them. */
export function elementsWithin(els: DiagramEl[], box: Box): string[] {
  const byId = new Map(els.map((e) => [e.id, e]));
  return els.filter((e) => {
    const b = boxOf(e, byId);
    return b.x >= box.x && b.y >= box.y && b.x + b.w <= box.x + box.w && b.y + b.h <= box.y + box.h;
  }).map((e) => e.id);
}

/** How wide a box's text may run: a diamond and an ellipse have less room than their boxes. */
export function textRoom(e: DiagramEl, b: Box): number {
  if (e.type === 'diamond') return b.w * 0.56;
  if (e.type === 'ellipse') return b.w * 0.74;
  if (e.type === 'text') return b.w - 12;
  return b.w - 16;
}

/**
 * The lines an element's text is drawn on. Text in a shape wraps to fit it;
 * free text keeps its own lines unless it was given a width; a label wraps at
 * LABEL_WIDTH.
 */
export function textLines(e: DiagramEl, text: string): string[] {
  if (!text) return [];
  const size = fontOf(e);
  if (isConnector(e)) return wrapText(text, LABEL_WIDTH, size);
  if (e.type === 'text' && !(num(e.w) && e.w > 0)) return text.split('\n');
  return wrapText(text, textRoom(e, boxOf(e)), size);
}

/** Free text given a width grows or shrinks in height to hold its wrapped lines; without one it measures itself. */
export function fitText(e: DiagramEl): DiagramEl {
  if (e.type !== 'text' || !(num(e.w) && e.w > 0)) return e;
  const lines = Math.max(1, textLines(e, e.text ?? '').length);
  return { ...e, h: Math.ceil(lines * fontOf(e) * LINE_HEIGHT + 8) };
}

/** The box a connector's label takes, centred on the connector's middle. */
export function labelBox(e: DiagramEl, els: Map<string, DiagramEl>, text: string): Box | null {
  const ends = text ? connectorEnds(e, els) : null;
  if (!ends) return null;
  const size = fontOf(e);
  const lines = textLines(e, text);
  const w = Math.ceil(Math.max(...lines.map((l) => l.length), 1) * size * CHAR + 10);
  const h = Math.ceil(lines.length * size * LINE_HEIGHT + 4);
  let cx = (ends.x1 + ends.x2) / 2, cy = (ends.y1 + ends.y2) / 2;
  const off = parallelOffset(e, els.values());
  const len = Math.hypot(ends.x2 - ends.x1, ends.y2 - ends.y1);
  if (off && len) {
    // Beside another connector the label moves out to its own side, clear of the line, so the two don't cover each other.
    const flip = e.from! < e.to! ? 1 : -1;
    const nx = (-(ends.y2 - ends.y1) / len) * flip, ny = ((ends.x2 - ends.x1) / len) * flip;
    const push = Math.sign(off) * (Math.abs(nx) * w / 2 + Math.abs(ny) * h / 2 + 2);
    cx += nx * push;
    cy += ny * push;
  }
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** The box around everything drawn, connector labels included; `texts` are labels as shown. */
export function extent(els: DiagramEl[], texts: Record<string, string> = {}): Box | null {
  const all = bounds(els);
  if (!all) return null;
  const byId = new Map(els.map((e) => [e.id, e]));
  let x0 = all.x, y0 = all.y, x1 = all.x + all.w, y1 = all.y + all.h;
  for (const e of els) {
    const b = isConnector(e) ? labelBox(e, byId, texts[e.id] ?? e.text ?? '') : null;
    if (!b) continue;
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Counts for the outline: "5 shapes, 4 arrows". */
export function describeDiagram(els: DiagramEl[]): string {
  const shapes = els.filter(isShape).length;
  const texts = els.filter((e) => e.type === 'text').length;
  const links = els.filter(isConnector).length;
  const n = (k: number, one: string) => `${k} ${one}${k === 1 ? '' : 's'}`;
  return [n(shapes, 'shape'), n(links, 'connector'), ...(texts ? [n(texts, 'text')] : [])].join(', ');
}
