// Picks the designer for the cell's kind.

import type { ReactNode } from 'react';
import { AccordionPanel } from './AccordionPanel';
import { BreakPanel } from './BreakPanel';
import { ButtonPanel } from './ButtonPanel';
import { CalendarPanel } from './CalendarPanel';
import { CanvasPanel } from './CanvasPanel';
import { ChartPanel } from './ChartPanel';
import { CollapsiblePanel } from './CollapsiblePanel';
import { DataPanel } from './DataPanel';
import { DiagramPanel } from './DiagramPanel';
import { EmptyPanel } from './EmptyPanel';
import { FormulaPanel } from './FormulaPanel';
import { GroupPanel } from './GroupPanel';
import { IconPanel } from './IconPanel';
import { ImagePanel } from './ImagePanel';
import { InputPanel } from './InputPanel';
import { ListPanel } from './ListPanel';
import { PanelPanel } from './PanelPanel';
import { StatPanel } from './StatPanel';
import { TablePanel } from './TablePanel';
import { TabsPanel } from './TabsPanel';
import { TextPanel } from './TextPanel';
import type { KindProps } from './types';

const PANELS: Record<string, (p: KindProps) => ReactNode> = {
  empty: EmptyPanel, text: TextPanel, formula: FormulaPanel, input: InputPanel, button: ButtonPanel, image: ImagePanel, icon: IconPanel,
  chart: ChartPanel, table: TablePanel, list: ListPanel, calendar: CalendarPanel, canvas: CanvasPanel, stat: StatPanel, break: BreakPanel,
  diagram: DiagramPanel, data: DataPanel,
  row: GroupPanel, col: GroupPanel, tabs: TabsPanel, accordion: AccordionPanel, collapsible: CollapsiblePanel, panel: PanelPanel,
};

export function Content(p: KindProps) {
  const Panel = PANELS[p.e.cell.kind];
  return Panel ? <Panel {...p} /> : null;
}
