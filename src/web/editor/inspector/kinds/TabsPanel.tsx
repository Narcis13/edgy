// Tabs: the panels behind the tab bar, which one shows, and how formulas read it.

import { PanelList } from './PanelList';
import type { KindProps } from './types';

export function TabsPanel({ e }: KindProps) {
  return <PanelList e={e} hint="The ticked tab is the one that shows. Readers switch tabs by clicking them." />;
}
