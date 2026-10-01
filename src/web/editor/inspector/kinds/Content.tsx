// Picks the designer for the cell's kind.

import type { ReactNode } from 'react';
import { isGroup } from '../../../../core/types';
import { BreakPanel } from './BreakPanel';
import { ButtonPanel } from './ButtonPanel';
import { CalendarPanel } from './CalendarPanel';
import { CanvasPanel } from './CanvasPanel';
import { ChartPanel } from './ChartPanel';
import { EmptyPanel } from './EmptyPanel';
import { FormulaPanel } from './FormulaPanel';
import { GroupPanel } from './GroupPanel';
import { IconPanel } from './IconPanel';
import { ImagePanel } from './ImagePanel';
import { InputPanel } from './InputPanel';
import { ListPanel } from './ListPanel';
import { StatPanel } from './StatPanel';
import { TablePanel } from './TablePanel';
import { TextPanel } from './TextPanel';
import type { KindProps } from './types';

const PANELS: Record<string, (p: KindProps) => ReactNode> = {
  empty: EmptyPanel, text: TextPanel, formula: FormulaPanel, input: InputPanel, button: ButtonPanel, image: ImagePanel, icon: IconPanel,
  chart: ChartPanel, table: TablePanel, list: ListPanel, calendar: CalendarPanel, canvas: CanvasPanel, stat: StatPanel, break: BreakPanel,
};

export function Content(p: KindProps) {
  if (isGroup(p.e.cell)) return <GroupPanel {...p} />;
  const Panel = PANELS[p.e.cell.kind];
  return Panel ? <Panel {...p} /> : null;
}
