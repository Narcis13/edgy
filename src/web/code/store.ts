// Which code studio is open, kept outside React so any field or button can open it.

import { useSyncExternalStore } from 'react';
import type { Cell } from '../../core/types';

export type StudioTab = 'code' | 'blocks' | 'ask' | 'functions' | 'cells';

export interface StudioOpen {
  cell: string;
  prop: string;
  /** Text to start from instead of what the cell holds (an uncommitted draft). */
  text?: string;
  tab?: StudioTab;
  /** Bumped on every open, so reopening starts fresh. */
  n: number;
}

let current: StudioOpen | null = null;
let count = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((fn) => fn());

/** The expression field being typed in, so the studio can take over its draft. */
interface ActiveField {
  cell: string;
  prop: string;
  take: () => string;
}
let active: ActiveField | null = null;

export function setActiveField(f: ActiveField | null, only?: ActiveField): void {
  if (f === null && only && active !== only) return;
  active = f;
}

/** Open the studio on a cell's property. Without text, an open field's draft is carried over. */
export function openStudio(o: { cell: string; prop: string; text?: string; tab?: StudioTab }): void {
  let text = o.text;
  if (text === undefined && active && active.cell === o.cell && active.prop === o.prop) text = active.take();
  current = { ...o, text, n: ++count };
  emit();
}

export function closeStudio(): void {
  if (!current) return;
  current = null;
  emit();
}

export const studioState = () => current;

export function useStudio(): StudioOpen | null {
  return useSyncExternalStore(
    (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    () => current,
  );
}

/** The properties of a cell that hold code, the main one first. */
export function codeProps(cell: Cell): string[] {
  switch (cell.kind) {
    case 'formula': case 'chart': case 'table': case 'calendar': return ['expr', 'hidden'];
    case 'list': return cell.expr !== undefined ? ['expr', 'hidden'] : ['hidden'];
    case 'stat': return ['expr', 'compare', 'trend', 'hidden'];
    case 'button': return ['do', 'hidden'];
    case 'input': return cell.type === 'select' ? ['options', 'hidden'] : ['hidden'];
    case 'empty': return [];
    // Containers, panels, data and diagrams hold no code of their own; they can still hide.
    default: return ['hidden'];
  }
}
