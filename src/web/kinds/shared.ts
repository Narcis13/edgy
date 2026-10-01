// Small pieces the cell kinds share.

import { useLayoutEffect, useRef, useState } from 'react';
import type { Cell, Json } from '../../core/types';
import { color } from '../editor/look';
import { useS, useSession } from '../editor/ctx';

/**
 * Keys pressed on a control inside a cell belong to that control, not to the
 * sheet's shortcuts (Enter would edit, ⌫ would clear the cell). Escape and
 * undo still reach the sheet.
 */
export function ownKeys(e: React.KeyboardEvent): void {
  const undo = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z';
  if (e.key !== 'Escape' && !undo) e.stopPropagation();
}

/** Change the cell's value, the way people do by using it. Quick changes undo together unless `merge` is false. */
export function useSetValue(cell: Cell, merge = true): (v: Json) => void {
  const session = useSession();
  return (v) => void session.dispatch(['set', cell.id, 'value', v], { ...(merge ? { key: cell.id + ':value' } : {}), transition: false });
}

export const useCurrency = (): string => useS((s) => (typeof s.doc?.meta.currency === 'string' ? s.doc.meta.currency : 'USD'));

/** A colour token (accent, live, warn, bad, agent…) or a CSS colour; accent when neither. */
export const tokenColor = (v: unknown, fallback = 'var(--accent)'): string => color(v) ?? fallback;

/** An element's inner size, kept up to date. */
export function useBox<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setBox((b) => (b.w === el.clientWidth && b.h === el.clientHeight ? b : { w: el.clientWidth, h: el.clientHeight }));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, box] as const;
}
