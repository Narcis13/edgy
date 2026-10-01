// Page size, orientation, margins and footer: what the printed pages look like.

import { RectangleHorizontal, RectangleVertical } from 'lucide-react';
import type { Json } from '../../core/types';
import { Row, Seg } from '../editor/fields';
import { useS, useSession } from '../editor/ctx';
import { PAGE_SIZES, pageSpec } from './paginate';

const MARGINS = [{ value: '10', label: 'Narrow' }, { value: '16', label: 'Normal' }, { value: '25', label: 'Wide' }];
const FOOTERS = [['number', 'Page numbers'], ['title', 'Title and numbers'], ['none', 'Nothing']];

export function PageSetup({ compact }: { compact?: boolean }) {
  const session = useSession();
  const meta = useS((s) => s.doc!.meta);
  const spec = pageSpec(meta);
  const set = (k: string, v: Json) => session.dispatch(['meta', k, v], { transition: false });
  const margin = MARGINS.some((m) => Number(m.value) === spec.margin) ? String(spec.margin) : '';

  const size = (
    <select className="text-field" aria-label="Page size" value={spec.size} onChange={(e) => set('page', e.target.value === 'A4' ? null : e.target.value)}>
      {Object.entries(PAGE_SIZES).map(([k, [w, h]]) => <option key={k} value={k}>{k} · {w} × {h} mm</option>)}
    </select>
  );
  const orientation = (
    <Seg label="Orientation" value={spec.landscape ? 'landscape' : 'portrait'} onChange={(v) => set('orientation', v === 'portrait' ? null : v)}
      options={[
        { value: 'portrait', label: <><RectangleVertical size={14} /> Portrait</>, title: 'Portrait' },
        { value: 'landscape', label: <><RectangleHorizontal size={14} /> Landscape</>, title: 'Landscape' },
      ]} />
  );
  const margins = (
    <Seg label="Margins" value={margin} onChange={(v) => set('margin', Number(v) === 16 ? null : Number(v))} options={MARGINS} />
  );
  const footer = (
    <select className="text-field" aria-label="Page footer" value={spec.footer} onChange={(e) => set('footer', e.target.value === 'number' ? null : e.target.value)}>
      {FOOTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );

  if (compact) return <div className="page-setup">{size}{orientation}{margins}{footer}</div>;
  return (
    <>
      <Row label="Paper">{size}</Row>
      <Row label="Turn">{orientation}</Row>
      <Row label="Margins">{margins}</Row>
      <Row label="Footer">{footer}</Row>
    </>
  );
}
