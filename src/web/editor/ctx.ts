import { createContext, useContext } from 'react';
import type { Session, SessionState } from '../session';
import { useStore } from '../lib/store';

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error('no open document');
  return s;
}

/** One slice of the open document's state. Return stored references or primitives. */
export function useS<R>(select: (s: SessionState) => R): R {
  return useStore(useSession().store, select);
}

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

export const KIND_LABEL: Record<string, string> = {
  row: 'Row', col: 'Column', empty: 'Empty', text: 'Text', formula: 'Formula', input: 'Input', button: 'Button',
  image: 'Picture', icon: 'Icon', chart: 'Chart', table: 'Table', list: 'List', calendar: 'Calendar', canvas: 'Drawing', stat: 'Stat',
  break: 'Page break', tabs: 'Tabs', accordion: 'Accordion', collapsible: 'Collapsible', panel: 'Panel', diagram: 'Diagram', data: 'Data',
};
