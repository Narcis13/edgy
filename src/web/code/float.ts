// Popups that float over everything: where an element sits on screen, kept up to date.

import { useLayoutEffect, useState } from 'react';

/** The element's box while `on`, refreshed on scroll and resize. */
export function useRect(on: boolean, get: () => Element | null | undefined, deps: unknown[]): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    if (!on) {
      setRect(null);
      return;
    }
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const el = get();
        setRect(el ? el.getBoundingClientRect() : null);
      });
    };
    const el = get();
    setRect(el ? el.getBoundingClientRect() : null);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, ...deps]);
  return rect;
}

/** Place a box of the given size next to an anchor: below it if it fits, else above; never off screen. */
export function place(anchor: DOMRect, w: number, h: number, gap = 4): { left: number; top?: number; bottom?: number; maxHeight: number } {
  const vw = window.innerWidth;
  const vh = window.visualViewport?.height ?? window.innerHeight;
  const left = Math.max(8, Math.min(anchor.left, vw - w - 8));
  const below = vh - anchor.bottom - gap - 8;
  const above = anchor.top - gap - 8;
  if (below >= Math.min(h, 160) || below >= above) return { left, top: anchor.bottom + gap, maxHeight: Math.max(80, below) };
  return { left, bottom: window.innerHeight - anchor.top + gap, maxHeight: Math.max(80, above) };
}

export const canHover = () => typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
