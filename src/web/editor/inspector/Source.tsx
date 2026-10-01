// The cell as an agent sees it. Edit it to replace the cell wholesale.

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { Cell, Json, Op } from '../../../core/types';
import { toNotation } from '../../../core/notation';
import { cx, useSession } from '../ctx';

export function Source({ cell }: { cell: Cell }) {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const source = JSON.stringify(toNotation(cell), null, 2);
  return (
    <div className="source">
      <button className="disclosure" aria-expanded={open} onClick={() => { setOpen(!open); setText(source); setError(null); }}>
        <ChevronRight size={14} className={cx(open && 'is-open')} /> Notation
      </button>
      {open && (
        <>
          <textarea className="text-field mono" rows={Math.min(18, source.split('\n').length + 1)} value={text} spellCheck={false}
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.stopPropagation()} aria-label="Cell notation" />
          {error && <p className="field-error">{error}</p>}
          <div className="source-actions">
            <button className="btn soft" onClick={() => {
              try {
                const n = JSON.parse(text) as Json;
                const op: Op = ['replace', cell.id, n];
                if (session.dispatch(op)) setError(null);
              } catch (e) { setError(e instanceof Error ? e.message : 'Not valid JSON'); }
            }}>Replace cell</button>
            <button className="btn ghost" onClick={() => void navigator.clipboard?.writeText(source)}>Copy</button>
          </div>
        </>
      )}
    </div>
  );
}
