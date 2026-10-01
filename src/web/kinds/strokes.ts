// Strokes on a canvas cell. Points live in a space 1000 units wide, with y in
// the same units, so a drawing scales with the cell and never stretches.

export interface Stroke {
  /** A colour token. */
  c: string;
  /** Width in the same units. */
  w: number;
  /** x0, y0, x1, y1, … */
  p: number[];
}

export const SPACE = 1000;

const r1 = (n: number) => Math.round(n * 10) / 10;

export function isStroke(v: unknown): v is Stroke {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const s = v as Record<string, unknown>;
  return Array.isArray(s.p) && s.p.length >= 2 && s.p.every((n) => typeof n === 'number' && Number.isFinite(n));
}

export const toStrokes = (v: unknown): Stroke[] => (Array.isArray(v) ? v.filter(isStroke) : []);

/** A smooth path: quadratic curves through the midpoints, each point a control point. */
export function smoothPath(p: number[]): string {
  const n = Math.floor(p.length / 2);
  if (n === 0) return '';
  const f = (x: number) => String(r1(x));
  // A dot: a tiny segment that the round cap turns into a circle.
  if (n === 1) return `M${f(p[0])} ${f(p[1])}l0.01 0`;
  if (n === 2) return `M${f(p[0])} ${f(p[1])}L${f(p[2])} ${f(p[3])}`;
  let d = `M${f(p[0])} ${f(p[1])}`;
  for (let i = 1; i < n - 1; i++) {
    const x = p[i * 2], y = p[i * 2 + 1];
    const mx = (x + p[i * 2 + 2]) / 2, my = (y + p[i * 2 + 3]) / 2;
    d += `Q${f(x)} ${f(y)} ${f(mx)} ${f(my)}`;
  }
  return d + `L${f(p[n * 2 - 2])} ${f(p[n * 2 - 1])}`;
}

/** Add a point unless it is too close to the last one to matter. */
export function addPoint(p: number[], x: number, y: number, min = 1.5): number[] {
  const n = p.length;
  if (n >= 2 && Math.hypot(x - p[n - 2], y - p[n - 1]) < min) return p;
  return [...p, r1(x), r1(y)];
}

/** The lowest point any stroke reaches, counting its width. */
export const lowest = (strokes: Stroke[]): number =>
  strokes.reduce((m, s) => {
    let y = 0;
    for (let i = 1; i < s.p.length; i += 2) y = Math.max(y, s.p[i]);
    return Math.max(m, y + s.w / 2);
  }, 0);

/** The height of the drawing space for a box of a given aspect (height / width), never cutting a stroke off. */
export const spaceHeight = (aspect: number, strokes: Stroke[], margin = 24): number =>
  Math.max(aspect * SPACE, strokes.length ? lowest(strokes) + margin : 0);
