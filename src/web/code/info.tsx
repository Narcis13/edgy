// What the editor knows about the open document: its named cells, their kinds
// and values, and the collections records are saved in.

import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays, CircleDashed, Columns3, List, type LucideIcon, PenLine, Rows3, SeparatorHorizontal, TrendingUp, Type,
} from 'lucide-react';
import type { Cell, Doc } from '../../core/types';
import { show } from '../../core/sx';
import { type Computed, display, plainValue } from '../../core/engine';
import { walk } from '../../core/tree';
import { api } from '../lib/api';
import { useS } from '../editor/ctx';
import { kindOption } from '../editor/KindMenu';
import type { CellInfo } from './docs';
import type { Known } from './lexer';

const OWN_ICONS: Record<string, LucideIcon> = {
  stat: TrendingUp, calendar: CalendarDays, list: List, canvas: PenLine, break: SeparatorHorizontal, text: Type, empty: CircleDashed,
};

/** The icon the kind menu uses for a cell, with fallbacks for kinds it may not list. */
export function cellIcon(cell: Cell): LucideIcon {
  if (cell.kind === 'row') return Columns3;
  if (cell.kind === 'col') return Rows3;
  const opt = kindOption(cell.kind, cell.type);
  return opt.kind === cell.kind ? opt.icon : OWN_ICONS[cell.kind] ?? CircleDashed;
}

export const KIND_NAMES: Record<string, string> = {
  row: 'Row', col: 'Column', empty: 'Empty', text: 'Text', formula: 'Formula', input: 'Input', button: 'Button', image: 'Picture',
  icon: 'Icon', chart: 'Chart', table: 'Table', list: 'List', calendar: 'Calendar', canvas: 'Drawing', stat: 'Stat', break: 'Page break',
};

const clip = (s: string, n = 40) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** A cell's current value as a short line. */
export function preview(cell: Cell, computed: Computed | null, doc: Doc): string {
  const st = computed?.cells[cell.id];
  if (!st) return '';
  if (st.error) return '⚠ ' + clip(st.error, 36);
  if (typeof st.value === 'function') return 'ƒ function';
  const text = display(cell, st, doc) || show(plainValue(st.value));
  return clip(text.replace(/\s+/g, ' '));
}

export interface DocInfo {
  doc: Doc | null;
  cells: (CellInfo & { cell: Cell })[];
  byName: Map<string, Cell>;
  /** A cell by name or id. */
  cellOf: (name: string) => Cell | undefined;
  known: Known;
}

/** Named cells with their values, and a lookup the lexer uses to colour references. */
export function useDocInfo(): DocInfo {
  const doc = useS((s) => s.doc);
  const computed = useS((s) => s.computed);
  return useMemo(() => {
    const cells: DocInfo['cells'] = [];
    const byName = new Map<string, Cell>();
    const ids = new Map<string, Cell>();
    if (doc) {
      walk(doc.root, (c) => {
        ids.set(c.id, c);
        if (!c.name) return;
        byName.set(c.name, c);
        const st = computed?.cells[c.id];
        cells.push({ name: c.name, id: c.id, isFn: typeof st?.value === 'function', preview: preview(c, computed, doc), cell: c });
      });
    }
    const fns = new Set(cells.filter((c) => c.isFn).map((c) => c.name));
    const known: Known = (name) => (fns.has(name) ? 'fn' : byName.has(name) || ids.has(name) ? 'cell' : null);
    return { doc, cells, byName, known, cellOf: (name: string) => byName.get(name) ?? ids.get(name) };
  }, [doc, computed]);
}

let collections: Promise<string[]> | null = null;

/** The collection names on the server, fetched once per page. */
export function useCollections(): string[] {
  const loaded = useS((s) => s.collections);
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    collections ??= api<{ name: string; count: number }[]>('GET', '/api/data')
      .then((list) => list.map((c) => c.name))
      .catch(() => {
        collections = null;
        return [];
      });
    void collections.then((n) => alive && setNames(n));
    return () => {
      alive = false;
    };
  }, []);
  return useMemo(() => [...new Set([...names, ...Object.keys(loaded)])].sort(), [names, loaded]);
}
