// One tab or accordion section: its title, its place among the others, and a
// way back to the tabs or accordion it sits in.

import { useEffect, useState } from 'react';
import { ArrowUpLeft, ChevronDown, ChevronUp, Copy, Eye, Trash2 } from 'lucide-react';
import { useSession } from '../../ctx';
import { Hint, Prop } from '../controls';
import { movePanel, openPanel, panelNoun, panelPlace, panelRows, renamePanel } from '../sections';
import { CellCount } from './GroupPanel';
import { TitleInput, useContainer } from './PanelList';
import type { KindProps } from './types';

export function PanelPanel({ e }: KindProps) {
  const session = useSession();
  const c = e.cell;
  const box = useContainer(c);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setError(null), [c.id]);
  if (!box) return <Hint>A panel sits in tabs or an accordion.</Hint>;
  const rows = panelRows(box);
  const i = rows.findIndex((r) => r.id === c.id);
  const me = rows[i];
  const noun = panelNoun(box);
  const tabs = box.kind === 'tabs';
  const run = (op: ReturnType<typeof movePanel>) => op && e.ops([op]);
  return (
    <>
      <Prop label="Title" aside={<span className="ins-value">{panelPlace(box, c.id)}</span>} hint={tabs ? 'Shown on the tab. Formulas compare the open tab with it.' : 'Shown on the section’s bar.'}>
        <TitleInput value={me?.title ?? ''} label="Title" onCommit={(t) => {
          const r = renamePanel(box, c.id, t);
          if (r && 'error' in r) {
            setError(r.error);
            return false;
          }
          setError(null);
          if (r) e.ops([r.op]);
          return true;
        }} />
        {error && <p className="ins-hint ins-error" role="alert">{error}</p>}
      </Prop>
      <Prop label={tabs ? 'Showing' : 'Open'} inline>
        {tabs ? (
          me?.open ? <span className="ins-faint">This tab shows</span> : (
            <button type="button" className="btn soft small" onClick={() => run(openPanel(box, me.title))}><Eye size={14} /> Show this tab</button>
          )
        ) : (
          <button type="button" className="btn soft small" aria-pressed={me?.open} onClick={() => me && run(openPanel(box, me.title, !me.open))}>
            {me?.open ? 'Close this section' : 'Open this section'}
          </button>
        )}
      </Prop>
      <Prop label="Place" inline>
        <div className="ins-line">
          <button type="button" className="icon-btn" aria-label={`Move this ${noun} earlier`} title="Move earlier" disabled={i <= 0} onClick={() => run(movePanel(box, c.id, -1))}><ChevronUp size={15} /></button>
          <button type="button" className="icon-btn" aria-label={`Move this ${noun} later`} title="Move later" disabled={i >= rows.length - 1} onClick={() => run(movePanel(box, c.id, 1))}><ChevronDown size={15} /></button>
          <button type="button" className="icon-btn" aria-label={`Duplicate this ${noun}`} title={`Duplicate this ${noun} and its cells`} onClick={() => e.ops([['dup', c.id]])}><Copy size={14} /></button>
          <button type="button" className="icon-btn ins-del" aria-label={`Remove this ${noun}`} disabled={rows.length < 2}
            title={rows.length < 2 ? `The last ${noun} can't go; delete the whole ${tabs ? 'tabs' : 'accordion'} instead` : `Remove this ${noun} and its cells`}
            onClick={() => {
              e.ops([['remove', c.id]]);
              session.select(box.id);
            }}><Trash2 size={14} /></button>
        </div>
      </Prop>
      <CellCount e={e} />
      <button type="button" className="btn ghost small ins-up" onClick={() => session.select(box.id)}>
        <ArrowUpLeft size={14} /> All {tabs ? 'tabs' : 'sections'}{box.name ? <> of <code>{box.name}</code></> : null}
      </button>
    </>
  );
}
