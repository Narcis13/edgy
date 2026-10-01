// Padding and borders as the inspector edits them: four sides, read from and
// written back to the style values the document holds.

/** Top, right, bottom, left. */
export type Sides = [number, number, number, number];

export const SIDE_NAMES = ['Top', 'Right', 'Bottom', 'Left'] as const;

/**
 * A `pad` value as four sides: a number is the same on every side, a string
 * reads like CSS ("8 16" is 8 above and below, 16 left and right). Anything
 * else (an expression, a unit we don't know) gives null.
 */
export function parsePad(v: unknown): Sides | null {
  if (typeof v === 'number' && Number.isFinite(v)) return [v, v, v, v];
  if (typeof v !== 'string') return null;
  const parts = v.trim().split(/\s+/).map((p) => p.replace(/px$/, ''));
  if (!parts.length || parts.length > 4 || !parts.every((p) => /^-?\d+(\.\d+)?$/.test(p))) return null;
  const n = parts.map(Number);
  const [t, r = t, b = t, l = r] = n;
  return [t, r, b, l];
}

/** Four sides as a `pad` value: one number when they are all the same, else "top right bottom left". */
export function formatPad(s: Sides): number | string {
  return s.every((x) => x === s[0]) ? s[0] : s.join(' ');
}

export type Side = 't' | 'r' | 'b' | 'l';
export const SIDES: Side[] = ['t', 'r', 'b', 'l'];

/** A `border` value as the sides it draws. */
export function borderSides(v: unknown): Side[] {
  if (v === 'all') return [...SIDES];
  if (typeof v !== 'string' || v === 'none') return [];
  return SIDES.filter((s) => v.includes(s));
}

/** The sides as a `border` value: "all", letters like "tb", or null for none. */
export function borderValue(sides: Side[]): string | null {
  const on = SIDES.filter((s) => sides.includes(s));
  if (!on.length) return null;
  return on.length === 4 ? 'all' : on.join('');
}
