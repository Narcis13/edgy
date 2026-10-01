// A text cell: what it says, and how to mark it up.

import { TextField } from '../../fields';
import { Prop } from '../controls';
import type { KindProps } from './types';

export function TextPanel({ e }: KindProps) {
  return (
    <Prop label="Text" hint={<><b>**bold**</b>, <i>*italic*</i>, # headings, - lists; <code>{'{{name}}'}</code> shows a cell's value.</>}>
      <TextField value={e.cell.text ?? ''} multiline label="Text" placeholder="Type here, or double-click the cell" onCommit={(v) => e.set('text', v)} />
    </Prop>
  );
}
