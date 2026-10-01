// A formula cell: the expression and how its result is written.

import { SxField } from '../../fields';
import { FormatSelect, Prop } from '../controls';
import type { KindProps } from './types';

export function FormulaPanel({ e }: KindProps) {
  const c = e.cell;
  return (
    <>
      <Prop label="Formula" hint="Click a cell on the sheet while typing to use its value.">
        <SxField value={c.expr} cell={c.id} prop="expr" preview placeholder="(* qty price)" onCommit={(x) => e.set('expr', x)} />
      </Prop>
      <Prop label="Show the result as" onReset={c.format ? () => e.set('format', null) : undefined}>
        <FormatSelect value={c.format} onChange={(v) => e.set('format', v)} />
      </Prop>
    </>
  );
}
