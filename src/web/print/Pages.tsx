// The page view: the document as it will print, page by page, and still live.
//
// The document is laid out once at the width of a page's printable area (in
// the first page). Each page is a window onto that layout, from where the last
// page ended to where this one ends; paginate() picks the cuts. Printing
// prints exactly these boxes, one per sheet, so what you see is what you get.

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Printer } from 'lucide-react';
import type { Doc } from '../../core/types';
import { CellView } from '../editor/CellView';
import { useS, useSession } from '../editor/ctx';
import { docCss } from '../editor/look';
import { type Box, MM, type PageSpec, type Slice, keepWithNext, pageSpec, paginate } from './paginate';
import { PageSetup } from './PageSetup';
import './print.css';

const sameSlices = (a: Slice[] | null, b: Slice[]) =>
  !!a && a.length === b.length && a.every((s, i) => Math.abs(s.start - b[i].start) < 0.5 && Math.abs(s.end - b[i].end) < 0.5);

/** Where an element sits inside `root`, unaffected by any scaling applied to the pages. */
function offsetIn(el: HTMLElement, root: HTMLElement): number {
  let y = 0;
  for (let e: HTMLElement | null = el; e && e !== root; e = e.offsetParent as HTMLElement | null) y += e.offsetTop;
  return y;
}

export function Pages() {
  const session = useSession();
  const doc = useS((s) => s.doc);
  const printing = useS((s) => s.printing);
  const flow = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [slices, setSlices] = useState<Slice[] | null>(null);
  const [fit, setFit] = useState(1);
  const spec = pageSpec(doc?.meta ?? { title: '' });
  const room = (spec.h - 2 * spec.margin) * MM;

  const measure = useCallback(() => {
    const root = flow.current;
    if (!root) return;
    const box = (el: HTMLElement): Box => {
      const top = offsetIn(el, root);
      return { top, bottom: top + el.offsetHeight };
    };
    const all = (sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];
    const leaves = all('.cell.leaf').map(box);
    const next = paginate({
      total: root.offsetHeight,
      room,
      leaves: [...leaves, ...keepWithNext(all('[data-keep]').map(box), leaves)],
      groups: all('.cell.group').map(box),
      forced: all('.cell.kind-break').map((el) => offsetIn(el, root)),
    });
    setSlices((prev) => (sameSlices(prev, next) ? prev : next));
  }, [room]);

  // Content changes on every edit; measuring is cheap and only re-renders when the cuts move.
  useLayoutEffect(measure);
  useEffect(() => {
    const root = flow.current;
    if (!root) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(root);
    void document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, [measure]);

  // On a narrow screen the pages shrink to fit; printing ignores this.
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const update = () => setFit(Math.min(1, Math.max(0.2, (el.clientWidth - 24) / (spec.w * MM))));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [spec.w]);

  useEffect(() => {
    if (!printing || !slices) return;
    let cancelled = false;
    void (async () => {
      await document.fonts?.ready;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (cancelled) return;
      window.print();
      session.printed();
    })();
    return () => { cancelled = true; };
  }, [printing, slices, session]);

  if (!doc) return null;
  const pages = slices ?? [{ start: 0, end: room }];
  return (
    <div className="pages-view" ref={host}>
      <style>{`@page { size: ${spec.w}mm ${spec.h}mm; margin: 0; }`}</style>
      <div className="page-bar" role="toolbar" aria-label="Page setup">
        <PageSetup compact />
        <span className="page-count">{pages.length} {pages.length === 1 ? 'page' : 'pages'}</span>
        <button className="btn solid" onClick={() => session.print()}><Printer size={15} /> Print</button>
      </div>
      <div className="pages theme-light" style={{ '--fit': fit } as React.CSSProperties}>
        {pages.map((slice, i) => (
          <Fragment key={i}>
            <Page doc={doc} spec={spec} slice={slice} n={i + 1} of={pages.length} fit={fit} flow={i === 0 ? flow : undefined} />
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function Page({ doc, spec, slice, n, of, fit, flow }: {
  doc: Doc; spec: PageSpec; slice: Slice; n: number; of: number; fit: number; flow?: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="page-slot" style={{ width: spec.w * MM * fit, height: spec.h * MM * fit }}>
      <section className="page" aria-label={`Page ${n} of ${of}`}
        style={{ width: `${spec.w}mm`, height: `${spec.h}mm`, padding: `${spec.margin}mm`, transform: fit < 1 ? `scale(${fit})` : undefined }}>
        <div className="page-window" style={{ height: slice.end - slice.start }}>
          <div className="page-flow" ref={flow} style={{ ...docCss(doc.meta), top: -slice.start }}>
            <CellView cell={doc.root} dir={null} />
          </div>
        </div>
        {spec.footer !== 'none' && (
          <footer className="page-foot" style={{ left: `${spec.margin}mm`, right: `${spec.margin}mm`, bottom: `${Math.max(4, spec.margin / 2 - 2)}mm` }}>
            <span>{spec.footer === 'title' ? doc.meta.title : ''}</span>
            <span>Page {n} of {of}</span>
          </footer>
        )}
      </section>
    </div>
  );
}
