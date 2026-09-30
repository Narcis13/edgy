// The layer over the sheet: the toolbar around the selected cell, the + on
// its edges, the links to the cells it reads and feeds, and the traces left
// by other people and agents.

import { type RefObject, useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { ArrowLeftRight, ChevronDown, Copy, Play, SquareSplitHorizontal, SquareSplitVertical, TableCellsMerge, Trash2 } from 'lucide-react';
import type { Cell } from '../../core/types';
import { isGroup } from '../../core/types';
import { KIND_LABEL, cx, useS, useSession } from './ctx';
import { KindMenu, kindOption } from './KindMenu';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function measure(host: HTMLElement, ids: Iterable<string>): Record<string, Rect> {
  const base = host.getBoundingClientRect();
  const out: Record<string, Rect> = {};
  for (const id of ids) {
    const el = host.querySelector<HTMLElement>(`[data-cell="${id}"]`);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    out[id] = { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height };
  }
  return out;
}

const sameRects = (a: Record<string, Rect>, b: Record<string, Rect>) => {
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => b[k] && a[k].x === b[k].x && a[k].y === b[k].y && a[k].w === b[k].w && a[k].h === b[k].h);
};

/** A curve from one cell to another, leaving and arriving through the facing edges. */
function curve(a: Rect, b: Rect): string {
  const ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2;
  const horizontal = a.x + a.w <= b.x + 1 || b.x + b.w <= a.x + 1;
  const inset = 6;
  let p1: [number, number], p2: [number, number], c1: [number, number], c2: [number, number];
  if (horizontal) {
    const dir = bx > ax ? 1 : -1;
    p1 = [dir > 0 ? a.x + a.w - inset : a.x + inset, ay];
    p2 = [dir > 0 ? b.x + inset : b.x + b.w - inset, by];
    const k = Math.max(20, Math.abs(p2[0] - p1[0]) / 2);
    c1 = [p1[0] + dir * k, p1[1]];
    c2 = [p2[0] - dir * k, p2[1]];
  } else {
    const dir = by > ay ? 1 : -1;
    p1 = [ax, dir > 0 ? a.y + a.h - inset : a.y + inset];
    p2 = [bx, dir > 0 ? b.y + inset : b.y + b.h - inset];
    const k = Math.max(20, Math.abs(p2[1] - p1[1]) / 2);
    c1 = [p1[0], p1[1] + dir * k];
    c2 = [p2[0], p2[1] - dir * k];
  }
  return `M${p1[0]} ${p1[1]} C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${p2[0]} ${p2[1]}`;
}

export function Overlay({ host }: { host: RefObject<HTMLDivElement | null> }) {
  const session = useSession();
  const selection = useS((s) => s.selection);
  const doc = useS((s) => s.doc);
  const computed = useS((s) => s.computed);
  const links = useS((s) => s.links);
  const flashes = useS((s) => s.flashes);
  const editing = useS((s) => s.editing);
  const live = useS((s) => s.mode === 'live');
  const menu = useS((s) => s.menu);
  const [rects, setRects] = useState<Record<string, Rect>>({});
  const [, setTick] = useState(0);
  const [edge, setEdge] = useState<'l' | 'r' | 't' | 'b' | null>(null);

  const primaryId = selection.at(-1);
  const primary = primaryId ? session.cell(primaryId) : undefined;
  const reads = (primary && links && computed?.cells[primary.id]?.reads) || [];
  const feeds = (primary && links && computed?.feeds[primary.id]) || [];

  useLayoutEffect(() => {
    if (!host.current) return;
    const ids = new Set<string>([...selection, ...reads, ...feeds, ...Object.keys(flashes)]);
    const next = measure(host.current, ids);
    setRects((prev) => (sameRects(prev, next) ? prev : next));
  });
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const bump = () => setTick((t) => t + 1);
    const ro = new ResizeObserver(bump);
    ro.observe(el);
    for (const sheet of el.querySelectorAll('.sheet')) ro.observe(sheet);
    window.addEventListener('resize', bump);
    void document.fonts?.ready.then(bump);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', bump);
    };
  }, [host]);

  const closeMenu = useCallback(() => session.openMenu(null), [session]);

  if (live || !doc) return null;

  const box = selection.reduce<Rect | null>((acc, id) => {
    const r = rects[id];
    if (!r) return acc;
    if (!acc) return { ...r };
    const x = Math.min(acc.x, r.x), y = Math.min(acc.y, r.y);
    return { x, y, w: Math.max(acc.x + acc.w, r.x + r.w) - x, h: Math.max(acc.y + acc.h, r.y + r.h) - y };
  }, null);
  const one = selection.length === 1 && primary ? rects[primary.id] : undefined;
  const hostW = host.current?.clientWidth ?? 0;
  const canMerge = selection.length > 0 && session.canMerge();
  const current = primary && !isGroup(primary) ? kindOption(primary.kind, primary.type) : undefined;

  const idle = (id: string) => (!editing || editing !== id);
  const half = (r: Rect, e: typeof edge): Rect | null =>
    e === 'r' ? { ...r, x: r.x + r.w / 2, w: r.w / 2 } : e === 'l' ? { ...r, w: r.w / 2 } : e === 'b' ? { ...r, y: r.y + r.h / 2, h: r.h / 2 } : e === 't' ? { ...r, h: r.h / 2 } : null;
  const preview = one && edge ? half(one, edge) : null;

  return (
    <div className="overlay" aria-hidden={false}>
      <svg className="links">
        <defs>
          <marker id="arrow-in" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0.5 L10 5 L0 9.5 z" className="arrow-in" />
          </marker>
          <marker id="arrow-out" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0.5 L10 5 L0 9.5 z" className="arrow-out" />
          </marker>
        </defs>
        {one && reads.map((id) => rects[id] && <path key={'r' + id} d={curve(rects[id], one)} className="link in" markerEnd="url(#arrow-in)" />)}
        {one && feeds.map((id) => rects[id] && <path key={'f' + id} d={curve(one, rects[id])} className="link out" markerEnd="url(#arrow-out)" />)}
      </svg>

      {one && reads.map((id) => rects[id] && <Tag key={'rt' + id} rect={rects[id]} cell={session.cell(id)} kind="in" />)}
      {one && feeds.map((id) => rects[id] && <Tag key={'ft' + id} rect={rects[id]} cell={session.cell(id)} kind="out" />)}

      {preview && <div className="split-preview" style={{ left: preview.x, top: preview.y, width: preview.w, height: preview.h }} />}

      {one && primary && idle(primary.id) && !menu && (
        <>
          <button className="edge r" style={{ left: one.x + one.w, top: one.y + one.h / 2 }} title="Add a cell to the right (⌥→)" aria-label="Add a cell to the right"
            onPointerEnter={() => setEdge('r')} onPointerLeave={() => setEdge(null)} onClick={() => { setEdge(null); session.split(primary.id, 'row'); }}>+</button>
          <button className="edge l" style={{ left: one.x, top: one.y + one.h / 2 }} title="Add a cell to the left (⌥←)" aria-label="Add a cell to the left"
            onPointerEnter={() => setEdge('l')} onPointerLeave={() => setEdge(null)} onClick={() => { setEdge(null); session.split(primary.id, 'row', true); }}>+</button>
          <button className="edge b" style={{ left: one.x + one.w / 2, top: one.y + one.h }} title="Add a cell below (⌥↓)" aria-label="Add a cell below"
            onPointerEnter={() => setEdge('b')} onPointerLeave={() => setEdge(null)} onClick={() => { setEdge(null); session.split(primary.id, 'col'); }}>+</button>
          <button className="edge t" style={{ left: one.x + one.w / 2, top: one.y }} title="Add a cell above (⌥↑)" aria-label="Add a cell above"
            onPointerEnter={() => setEdge('t')} onPointerLeave={() => setEdge(null)} onClick={() => { setEdge(null); session.split(primary.id, 'col', true); }}>+</button>
        </>
      )}

      {box && primary && !editing && (
        <div className="toolbar" role="toolbar" aria-label="Cell tools" style={{ left: Math.max(0, Math.min(box.x, hostW - 400)), top: Math.max(4, box.y - 44) }}>
          <button title="Split into left and right (⌥→)" onClick={() => session.split(primary.id, 'row')}><SquareSplitHorizontal size={16} /></button>
          <button title="Split into top and bottom (⌥↓)" onClick={() => session.split(primary.id, 'col')}><SquareSplitVertical size={16} /></button>
          <button title={canMerge ? 'Merge into one cell (⌘M)' : 'Select neighbouring cells to merge them'} disabled={!canMerge} onClick={() => session.merge()}><TableCellsMerge size={16} /></button>
          {selection.length === 2 && <button title="Swap the two cells" onClick={() => session.swap()}><ArrowLeftRight size={16} /></button>}
          <i className="sep" />
          {isGroup(primary) ? (
            <span className="kind-name">{KIND_LABEL[primary.kind]} of {primary.children!.length}</span>
          ) : (
            <button className="kind-btn" title="Change what this cell holds (/)" aria-haspopup="dialog" onClick={() => session.openMenu(primary.id)}>
              {current && <current.icon size={15} strokeWidth={1.75} />}
              <span>{current?.label ?? KIND_LABEL[primary.kind]}</span>
              <ChevronDown size={13} />
            </button>
          )}
          {primary.kind === 'button' && primary.do != null && <button title="Run this button" onClick={() => void session.run(primary.id)}><Play size={15} /></button>}
          <i className="sep" />
          <button title="Duplicate (⌘D)" onClick={() => session.duplicate()}><Copy size={15} /></button>
          <button title={primary.kind === 'empty' || isGroup(primary) ? 'Remove (⌫)' : 'Clear (⌫)'} onClick={() => session.clearOrRemove()}><Trash2 size={15} /></button>
        </div>
      )}

      {menu && rects[menu] && (
        <div className="popover" style={{ left: Math.min(rects[menu].x, Math.max(0, hostW - 300)), top: rects[menu].y + Math.min(rects[menu].h, 40) + 6 }}>
          <KindMenu cell={menu} current={current} onClose={closeMenu} />
        </div>
      )}

      {Object.entries(flashes).map(([id, f]) => rects[id] && (
        <div key={id + f.n} className={cx('trace', f.actor.kind)} style={{ left: rects[id].x, top: rects[id].y, width: rects[id].w, height: rects[id].h }}>
          <span>{f.actor.name}</span>
        </div>
      ))}
    </div>
  );
}

function Tag({ rect, cell, kind }: { rect: Rect; cell: Cell | undefined; kind: 'in' | 'out' }) {
  if (!cell) return null;
  return (
    <div className={cx('link-box', kind)} style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
      <span>{cell.name ?? cell.id}</span>
    </div>
  );
}
