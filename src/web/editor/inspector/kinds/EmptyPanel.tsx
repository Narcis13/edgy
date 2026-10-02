// An empty cell: big, labelled choices of what it can hold.

import { type KindOption, KIND_OPTIONS } from '../../KindMenu';
import { useSession } from '../../ctx';
import type { KindProps } from './types';

const GROUPS: { title: string; pick: (o: KindOption) => boolean }[] = [
  { title: 'Words and numbers', pick: (o) => ['text', 'formula', 'stat'].includes(o.kind) },
  { title: 'Things people fill in', pick: (o) => o.kind === 'input' },
  { title: 'Lists, tables and dates', pick: (o) => ['table', 'list', 'calendar'].includes(o.kind) },
  { title: 'Charts', pick: (o) => o.kind === 'chart' },
  { title: 'Pictures and actions', pick: (o) => ['button', 'image', 'icon', 'canvas', 'diagram'].includes(o.kind) },
  { title: 'Sections and hidden values', pick: (o) => ['tabs', 'accordion', 'collapsible', 'data'].includes(o.kind) },
  { title: 'Printing', pick: (o) => o.kind === 'break' },
];

export function EmptyPanel({ e }: KindProps) {
  const session = useSession();
  return (
    <div className="ins-kinds">
      <p className="ins-ask">What should this cell hold?</p>
      {GROUPS.map((g) => (
        <div key={g.title} className="ins-kind-group" role="group" aria-label={g.title}>
          <h4 className="ins-sub">{g.title}</h4>
          <div className="ins-kind-grid">
            {KIND_OPTIONS.filter((o) => o.kind !== 'empty' && g.pick(o)).map((o) => (
              <button key={o.label} type="button" className="ins-kind" onClick={() => session.setKind(e.cell.id, o.kind, o.type, o.props)}>
                <o.icon size={18} strokeWidth={1.75} aria-hidden />
                <span className="ins-kind-label">{o.label}</span>
                <span className="ins-kind-hint">{o.hint}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className="ins-hint">Or type on the sheet to start with text, or press / for this list.</p>
    </div>
  );
}
