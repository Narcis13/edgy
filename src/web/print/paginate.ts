// Cutting a laid-out document into printed pages.
//
// The document is laid out once at the width of a page's printable area. Each
// page then shows a window onto that one long layout, from `start` to `end`.
// Where a page ends is chosen so no leaf cell is cut in half: the best place is
// low on the page and between as many whole groups as possible. A page break
// cell always ends a page; a leaf taller than a page is sliced where it must be.

import type { DocMeta } from '../../core/types';

export interface Box {
  top: number;
  bottom: number;
}

export interface Layout {
  /** Height of the whole document. */
  total: number;
  /** Printable height of one page. */
  room: number;
  /** Leaf cells: never cut through these if it can be helped. */
  leaves: Box[];
  /** Groups: cutting through fewer of them reads better. */
  groups: Box[];
  /** Where page break cells sit. */
  forced: number[];
}

export interface Slice {
  start: number;
  end: number;
}

const EPS = 0.5;
const straddles = (b: Box, y: number) => b.top < y - EPS && b.bottom > y + EPS;

export function paginate({ total, room, leaves, groups, forced }: Layout): Slice[] {
  if (!(room > 10) || !(total > 0)) return [{ start: 0, end: Math.max(0, total) }];
  const whole = (y: number) => !leaves.some((b) => straddles(b, y));
  const edges = [...new Set([...leaves, ...groups].flatMap((b) => [b.top, b.bottom]).concat(forced, total))]
    .filter((y) => y >= 0 && y <= total)
    .sort((a, b) => a - b);
  const breaks = [...forced].sort((a, b) => a - b);
  const cuts = (y: number) => groups.filter((g) => straddles(g, y)).length;
  // A new page starts where the next thing does, not in the gap before it.
  const resume = (y: number) => {
    if (!whole(y)) return y;
    const next = edges.find((e) => e >= y - EPS && [...leaves, ...groups].some((b) => Math.abs(b.top - e) < EPS));
    return next ?? y;
  };

  const out: Slice[] = [];
  let start = 0;
  for (let guard = 0; start < total - EPS && guard < 1000; guard++) {
    const limit = start + room;
    const forcedHere = breaks.find((y) => y > start + EPS && y <= limit + EPS);
    let end: number;
    if (forcedHere !== undefined) end = forcedHere;
    else if (limit >= total - EPS) end = total;
    else {
      const fits = edges.filter((y) => y > start + EPS && y <= limit + EPS && whole(y));
      if (!fits.length) end = limit;
      else {
        const low = fits.filter((y) => y >= start + room * 0.6);
        const pool = low.length ? low : fits;
        end = pool.reduce((best, y) => {
          const d = cuts(y) - cuts(best);
          return d < 0 || (d === 0 && y > best) ? y : best;
        });
      }
    }
    if (end <= start + EPS) end = Math.min(total, limit);
    out.push({ start, end });
    const next = resume(end);
    // Skip a trailing page that would hold nothing but whitespace.
    if (next >= total - EPS) break;
    start = next;
  }
  return out;
}

/**
 * A heading (a tab's or section's title on paper) and the first cell under it
 * count as one box that can't be cut, so a page never ends right after a heading.
 */
export function keepWithNext(heads: Box[], leaves: Box[]): Box[] {
  return heads.map((h) => {
    const next = leaves.filter((b) => b.top >= h.bottom - EPS).reduce<Box | null>((a, b) => (!a || b.top < a.top ? b : a), null);
    return next ? { top: h.top, bottom: Math.max(h.bottom, next.bottom) } : h;
  });
}

// ── page formats ──

export const PAGE_SIZES: Record<string, [number, number]> = {
  A4: [210, 297],
  A5: [148, 210],
  Letter: [215.9, 279.4],
  Legal: [215.9, 355.6],
};

export type Footer = 'none' | 'number' | 'title';

export interface PageSpec {
  size: string;
  landscape: boolean;
  /** Page width and height in millimetres, after orientation. */
  w: number;
  h: number;
  margin: number;
  footer: Footer;
}

/** CSS pixels in a millimetre. */
export const MM = 96 / 25.4;

export function pageSpec(meta: DocMeta): PageSpec {
  const size = typeof meta.page === 'string' && PAGE_SIZES[meta.page] ? meta.page : 'A4';
  const landscape = meta.orientation === 'landscape';
  const [a, b] = PAGE_SIZES[size];
  const margin = typeof meta.margin === 'number' && meta.margin >= 0 ? Math.min(60, meta.margin) : 16;
  const footer: Footer = meta.footer === 'none' || meta.footer === 'title' ? meta.footer : 'number';
  return { size, landscape, w: landscape ? b : a, h: landscape ? a : b, margin, footer };
}
