// A row or column: which way its cells run, how many, the gap between them,
// and whether a row stacks on a phone.

import { Columns2, Minus, Plus, Rows2 } from 'lucide-react';
import type { Cell, Json } from '../../../../core/types';
import { flowOf } from '../../../../core/types';
import { toNotation } from '../../../../core/notation';
import { NumberField } from '../../fields';
import { useSession } from '../../ctx';
import { Chips, Hint, Prop, Tiles } from '../controls';
import { type Edit, num } from '../edit';
import type { KindProps } from './types';

const groupProps = (c: Cell): Record<string, Json> => {
  const p: Record<string, Json> = { id: c.id };
  if (c.name) p.name = c.name;
  if (c.size != null) p.size = c.size;
  if (c.style) p.style = c.style;
  if (c.hidden != null) p.hidden = c.hidden;
  return p;
};

const GAPS = [0, 4, 8, 16];

/**
 * How many cells a group holds: add an empty one at the end, or take away the
 * last while it is empty. A row or column keeps two; a panel or collapsible one.
 */
export function CellCount({ e }: { e: Edit }) {
  const session = useSession();
  const c = e.cell;
  const kids = c.children ?? [];
  const last = kids.at(-1);
  const dir = flowOf(c) ?? 'col';
  return (
    <Prop label="Cells" inline>
      <div className="ins-stepper">
        <button type="button" className="icon-btn" aria-label="Remove the last cell" disabled={kids.length <= (c.kind === 'row' || c.kind === 'col' ? 2 : 1) || last?.kind !== 'empty'}
          title={last?.kind !== 'empty' ? 'The last cell has something in it; delete it on the sheet' : 'Remove the last, empty cell'}
          onClick={() => last && session.dispatch(['remove', last.id])}><Minus size={15} /></button>
        <span className="ins-count" aria-live="polite">{kids.length}</span>
        <button type="button" className="icon-btn" aria-label="Add a cell at the end" title="Add an empty cell at the end"
          onClick={() => last && session.dispatch(['split', last.id, dir])}><Plus size={15} /></button>
      </div>
    </Prop>
  );
}

export function GroupPanel({ e }: KindProps) {
  const session = useSession();
  const c = e.cell;
  const kids = c.children ?? [];
  const gap = num(c.style?.gap);
  const stack = typeof c.style?.stack === 'string' ? c.style.stack : 'auto';
  return (
    <>
      <Prop label="Cells run">
        <Tiles label="Cells run" cols={2} value={c.kind} onChange={(v) => v !== c.kind && session.dispatch(['replace', c.id, [v, groupProps(c), ...kids.map((k) => toNotation(k))]])}
          options={[
            { value: 'row', label: 'Side by side', art: <Columns2 size={20} strokeWidth={1.75} /> },
            { value: 'col', label: 'Stacked', art: <Rows2 size={20} strokeWidth={1.75} /> },
          ]} />
      </Prop>
      <CellCount e={e} />
      <Prop label="Gap between cells" onReset={gap != null ? () => e.style({ gap: null }) : undefined}>
        <Chips label="Gap" cols={4} value={gap ?? 0} onChange={(v) => e.style({ gap: v || null })}
          options={GAPS.map((g) => ({ value: g, label: g ? String(g) : 'None', title: `${g}px` }))} />
        <div className="ins-line">
          <NumberField value={gap} placeholder="0" min={0} max={80} label="Gap in pixels" onCommit={(v) => e.style({ gap: v })} />
          <span className="ins-unit">px</span>
        </div>
      </Prop>
      {c.kind === 'row' && (
        <Prop label="On a phone" hint={stack === 'never' ? 'Cells stay side by side, like the lines of a table.' : stack === 'always' ? 'Cells are always one under another.' : 'Cells move under each other when the screen is narrow.'}>
          <Chips label="On a phone" value={stack} onChange={(v) => e.style({ stack: v === 'auto' ? null : v })}
            options={[{ value: 'auto', label: 'Stack' }, { value: 'never', label: 'Keep in line' }, { value: 'always', label: 'Always stack' }]} />
        </Prop>
      )}
      {kids.length > 0 && <Hint>Click a cell on the sheet to change what it holds; Esc goes back up to this {c.kind === 'row' ? 'row' : 'column'}.</Hint>}
    </>
  );
}
