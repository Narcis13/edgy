// The right-hand panel: everything about the selected cell, or the document
// when nothing is selected. The parts live in ./inspector.

import type { KeyboardEvent } from 'react';
import { useS, useSession } from './ctx';
import { CellPanel } from './inspector/CellPanel';
import { DocPanel } from './inspector/DocPanel';
import './inspector/inspector.css';

/** Keys pressed in the panel stay in it (Tab moves between controls, not cells); shortcuts with ⌘/Ctrl still work. */
const keep = (e: KeyboardEvent) => {
  if (!e.metaKey && !e.ctrlKey) e.stopPropagation();
};

export function Inspector() {
  const session = useSession();
  const selection = useS((s) => s.selection);
  const doc = useS((s) => s.doc);
  const id = selection.at(-1);
  const cell = id ? session.cell(id) : undefined;
  if (!doc) return null;
  return (
    <div className="panel-body ins" onKeyDown={keep}>
      {cell ? <CellPanel key={cell.id} cell={cell} ids={selection} /> : <DocPanel />}
    </div>
  );
}
