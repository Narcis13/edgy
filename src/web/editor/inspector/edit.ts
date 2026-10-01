// How the inspector writes: props of the cell in view, style on every
// selected cell, several ops as one undo step.

import type { Cell, Json, Op } from '../../../core/types';
import type { DispatchOptions } from '../../session';
import { useSession } from '../ctx';

export interface Edit {
  cell: Cell;
  /** Every selected cell; style changes go to all of them. */
  ids: string[];
  set: (prop: string, value: Json, o?: DispatchOptions) => void;
  style: (patch: Record<string, Json>, o?: DispatchOptions) => void;
  ops: (ops: Op[], o?: DispatchOptions) => void;
}

export function useEdit(cell: Cell, ids: string[]): Edit {
  const session = useSession();
  const ops = (list: Op[], o?: DispatchOptions) => {
    if (list.length) session.dispatch(list, o);
  };
  return {
    cell,
    ids,
    ops,
    set: (prop, value, o) => ops([['set', cell.id, prop, value]], o),
    style: (patch, o) => ops(ids.map((id) => ['style', id, patch] as Op), { transition: false, ...o }),
  };
}

/** A style value as a number, if it is one. */
export const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** A prop as text, if it is some. */
export const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
