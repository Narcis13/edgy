// A document's shape at a glance: its cells as tiny blocks.

import type { Cell, Json } from '../../core/types';
import { build } from '../../core/notation';
import { flexOf } from '../editor/look';

function fromNotation(n: Json): Cell | null {
  try {
    let i = 0;
    return build(n, { gen: () => `m${i++}`, used: new Set(), names: new Set() });
  } catch {
    return null;
  }
}

function Block({ cell, dir }: { cell: Cell; dir: 'row' | 'col' | null }) {
  const style = dir ? flexOf(cell.size === 'hug' ? 'hug' : typeof cell.size === 'string' ? undefined : cell.size) : undefined;
  if (cell.children) {
    return (
      <div className={`mm-group ${cell.kind}`} style={style}>
        {cell.children.map((c) => <Block key={c.id} cell={c} dir={cell.kind as 'row' | 'col'} />)}
      </div>
    );
  }
  return <div className={`mm-leaf ${cell.kind}`} style={style} />;
}

export function Minimap({ root, notation }: { root?: Cell; notation?: Json }) {
  const cell = root ?? (notation !== undefined ? fromNotation(notation) : null);
  if (!cell) return <div className="minimap" />;
  return (
    <div className="minimap" aria-hidden>
      <Block cell={cell} dir={null} />
    </div>
  );
}
