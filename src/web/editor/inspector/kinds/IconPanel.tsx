// An icon cell: which symbol. Its colour and size are in Text.

import { Hint, IconPicker } from '../controls';
import type { KindProps } from './types';

export function IconPanel({ e }: KindProps) {
  return (
    <>
      <IconPicker value={e.cell.icon} allowNone={false} onChange={(v) => v && e.set('icon', v)} />
      <Hint>Its colour and size are under Text.</Hint>
    </>
  );
}
