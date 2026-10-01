// A page break: where printing starts a new page. People shaping the
// document see a dashed line; anyone using it sees nothing.

import { Scissors } from 'lucide-react';
import { useS } from '../editor/ctx';
import './kinds.css';

export function BreakView() {
  const editing = useS((s) => s.mode === 'edit');
  if (!editing) return null;
  return (
    <div className="kbreak" role="separator" aria-label="Page break">
      <span><Scissors size={12} strokeWidth={1.75} aria-hidden /> Page break</span>
    </div>
  );
}
