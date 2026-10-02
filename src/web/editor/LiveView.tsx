// A document in use, without the editor around it: what a share link, a slide
// in a deck and an exported file show. The open session comes from context.

import { useEffect, useState } from 'react';
import type { DocMeta } from '../../core/types';
import { CellView } from './CellView';
import { useS } from './ctx';
import { docCss } from './look';

/** The sheet's own box: as wide as the document asks (or the screen allows), its margin and type. */
export function sheetStyle(meta: DocMeta): React.CSSProperties {
  return {
    ...docCss(meta),
    maxWidth: typeof meta.width === 'number' ? meta.width : 880,
    minHeight: typeof meta.minHeight === 'number' ? meta.minHeight : 560,
    '--pad': `${typeof meta.pad === 'number' ? meta.pad : 28}px`,
  } as React.CSSProperties;
}

/** The document's sheet, live. `style` adds to (or overrides) the sheet's own box. */
export function LiveSheet({ style }: { style?: React.CSSProperties }) {
  const doc = useS((s) => s.doc);
  if (!doc) return null;
  return (
    <div className="sheet" style={{ ...sheetStyle(doc.meta), ...style }}>
      <CellView cell={doc.root} dir={null} />
    </div>
  );
}

/** The sheet on its desk, scrolling, as Live shows it. */
export function LiveDesk() {
  return (
    <main className="desk live">
      <div className="desk-inner">
        <LiveSheet />
      </div>
    </main>
  );
}

/** What just happened, for a few seconds. */
export function Toast() {
  const toast = useS((s) => s.toast);
  const [shown, setShown] = useState(toast);
  useEffect(() => {
    if (!toast) return;
    setShown(toast);
    const t = setTimeout(() => setShown(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  return shown ? <div className="toast" role="status">{shown.text}</div> : null;
}
