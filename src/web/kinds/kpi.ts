// The numbers behind a stat cell: the change against an earlier value, and
// the sparkline.

export interface Change {
  /** The change as a fraction: 0.125 is 12.5%. */
  pct: number;
  dir: 'up' | 'down' | 'flat';
}

const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
};

/** How far value moved from compare; null when either is not a number or compare is 0. */
export function change(value: unknown, compare: unknown): Change | null {
  const a = num(value), b = num(compare);
  if (a === null || b === null || b === 0) return null;
  const pct = (a - b) / Math.abs(b);
  return { pct, dir: Math.abs(pct) < 0.0005 ? 'flat' : pct > 0 ? 'up' : 'down' };
}

export function changeText(c: Change | null): string {
  if (!c) return '—';
  const n = Math.abs(c.pct) * 100;
  const digits = n >= 100 ? 0 : 1;
  const text = n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits }) + '%';
  return c.dir === 'flat' ? '0%' : `${c.dir === 'up' ? '▲' : '▼'} ${text}`;
}

/** Numbers from a list of numbers, [label, n] pairs or records with a value. */
export function numbers(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const out: number[] = [];
  for (const it of v) {
    const n = Array.isArray(it) ? num(it[1]) : it && typeof it === 'object' ? num((it as Record<string, unknown>).value) : num(it);
    if (n !== null) out.push(n);
  }
  return out;
}

/** A sparkline in a w × h box: the line, and the same line closed along the bottom. */
export function spark(values: number[], w: number, h: number, pad = 2): { line: string; area: string } | null {
  if (values.length < 2) return null;
  const lo = Math.min(...values), hi = Math.max(...values);
  const span = hi - lo || 1;
  const x = (i: number) => (i / (values.length - 1)) * w;
  const y = (v: number) => (hi === lo ? h / 2 : pad + (1 - (v - lo) / span) * (h - pad * 2));
  const pts = values.map((v, i) => `${+x(i).toFixed(2)},${+y(v).toFixed(2)}`);
  return { line: pts.join(' '), area: `0,${h} ${pts.join(' ')} ${w},${h}` };
}
