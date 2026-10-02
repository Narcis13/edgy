// A diagram: what it holds, laying it out again, clearing it. Drawing itself
// happens in the cell.

import { elementsOf, isBox, describeDiagram } from '../../../../core/diagram';
import { Hint, Prop } from '../controls';
import { tidyDiagram } from '../sections';
import { FormulaHint } from './PanelList';
import type { KindProps } from './types';

export function DiagramPanel({ e }: KindProps) {
  const c = e.cell;
  const els = elementsOf(c.value);
  const boxes = els.filter(isBox).length;
  return (
    <>
      <Prop label="Drawn so far" inline>
        <span className="ins-count">{els.length ? describeDiagram(els) : 'Nothing yet'}</span>
      </Prop>
      <Hint>Draw in the cell: add shapes and text, drag them about, and join them with arrows that stay attached.</Hint>
      <div className="ins-line">
        <button type="button" className="btn soft small" disabled={boxes < 2} title="Place every shape again, top to bottom along the arrows"
          onClick={() => e.set('value', tidyDiagram(c.value))}>Tidy layout</button>
        <button type="button" className="btn ghost small ins-danger" disabled={!els.length} onClick={() => e.set('value', null)}>Clear</button>
      </div>
      <FormulaHint e={e} what="its shapes and arrows, as a list" example={(n) => `(count-if (!= (get it "type") "arrow") ${n})`} />
    </>
  );
}
