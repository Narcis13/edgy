// A canvas cell: a surface to draw or sign on with a mouse, a pen or a
// finger. Each stroke is saved when it ends, so ⌘Z takes back one stroke.

import { useEffect, useRef, useState } from 'react';
import { Eraser, Undo2 } from 'lucide-react';
import type { Cell, Json } from '../../core/types';
import type { CellState } from '../../core/engine';
import { cx } from '../editor/ctx';
import { SPACE, type Stroke, addPoint, lowest, smoothPath, toStrokes } from './strokes';
import { ownKeys, tokenColor, useBox, useSetValue } from './shared';
import './kinds.css';

const INKS: [string, string][] = [['ink', 'Ink'], ['accent', 'Blue'], ['bad', 'Red'], ['live', 'Green']];
const PAPERS = new Set(['lines', 'grid', 'dots']);
const WIDTHS = { thin: 3.5, thick: 9 };
const MARGIN = 24;
const MIN_HEIGHT = 160;
/** Strokes never get thinner on screen than this, however narrow the cell. */
const MIN_PX = 1.6;

export function CanvasView({ cell, st }: { cell: Cell; st: CellState | undefined }) {
  const setValue = useSetValue(cell, false);
  const strokes = toStrokes(cell.value);
  const save = (next: Stroke[]) => setValue(next as unknown as Json);
  const latest = useRef(strokes);
  latest.current = strokes;
  const label = (st?.props?.label as string | undefined) ?? cell.label;
  // The pen starts in the cell's colour; a colour that isn't one of the four joins them.
  const first = typeof cell.color === 'string' && cell.color ? cell.color : 'ink';
  const inks = INKS.some(([c]) => c === first) ? INKS : [[first, first] as [string, string], ...INKS];
  const [ink, setInk] = useState<string>(first);
  // A new colour chosen for the cell becomes the pen's.
  useEffect(() => setInk(first), [first]);
  const [thick, setThick] = useState(false);
  const [drawing, setDrawing] = useState<Stroke | null>(null);
  const pointer = useRef<number | null>(null);
  const [ref, { w, h }] = useBox<HTMLDivElement>();

  // The space is 1000 units wide and as tall as the box, or taller if a stroke reaches further down.
  const scale = w > 0 ? w / SPACE : 0.3;
  const reach = strokes.length ? lowest(strokes) + MARGIN : 0;
  const minHeight = Math.max(MIN_HEIGHT, Math.ceil(reach * scale));
  const vh = w > 0 ? (h / w) * SPACE : MIN_HEIGHT / scale;
  const width = (s: Stroke) => Math.max(s.w, MIN_PX / scale);

  const at = (e: { clientX: number; clientY: number }, svg: SVGSVGElement): [number, number] => {
    const b = svg.getBoundingClientRect();
    const k = SPACE / (b.width || 1);
    return [(e.clientX - b.left) * k, (e.clientY - b.top) * k];
  };

  const onDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (pointer.current !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    const svg = e.currentTarget;
    pointer.current = e.pointerId;
    svg.setPointerCapture(e.pointerId);
    const [x, y] = at(e, svg);
    let stroke: Stroke = { c: ink, w: thick ? WIDTHS.thick : WIDTHS.thin, p: addPoint([], x, y) };
    setDrawing(stroke);
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointer.current) return;
      let p = stroke.p;
      for (const c of ev.getCoalescedEvents?.() ?? [ev]) p = addPoint(p, ...at(c, svg));
      if (p !== stroke.p) setDrawing((stroke = { ...stroke, p }));
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== pointer.current) return;
      pointer.current = null;
      svg.removeEventListener('pointermove', move);
      svg.removeEventListener('pointerup', up);
      svg.removeEventListener('pointercancel', up);
      setDrawing(null);
      if (ev.type === 'pointerup') save([...latest.current, stroke]);
    };
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);
  };

  const empty = !strokes.length && !drawing;
  return (
    <div className="kcanvas" onKeyDown={ownKeys}>
      <div className={cx('kcanvas-surface', label && 'has-line')} ref={ref} style={{ minHeight }} data-paper={PAPERS.has(cell.paper ?? '') ? cell.paper : undefined}>
        {label && (
          <div className={cx('kcanvas-line', !empty && 'is-signed')} aria-hidden>
            <span className="kcanvas-x">×</span>
            <span className="kcanvas-label">{label}</span>
          </div>
        )}
        {!label && empty && <span className="kcanvas-hint" aria-hidden>Draw here</span>}
        <svg className="kcanvas-draw" viewBox={`0 0 ${SPACE} ${vh.toFixed(1)}`} preserveAspectRatio="xMinYMin meet" onPointerDown={onDown}
          role="img" aria-label={`${label ?? 'Drawing'}: ${strokes.length ? `${strokes.length} ${strokes.length === 1 ? 'stroke' : 'strokes'}` : 'empty'}`}>
          {[...strokes, ...(drawing ? [drawing] : [])].map((s, i) => (
            <path key={i} d={smoothPath(s.p)} stroke={tokenColor(s.c, 'var(--ink)')} strokeWidth={width(s)} />
          ))}
        </svg>
      </div>
      <div className="kcanvas-tools" role="toolbar" aria-label="Pen">
        {inks.map(([c, name]) => (
          <button key={c} type="button" className={cx('kcanvas-ink', ink === c && 'is-on')} aria-pressed={ink === c} title={name} aria-label={`${name} ink`}
            onClick={() => setInk(c)}><i style={{ background: tokenColor(c, 'var(--ink)') }} /></button>
        ))}
        <i className="kcanvas-sep" />
        <button type="button" className={cx('kcanvas-size', !thick && 'is-on')} aria-pressed={!thick} title="Thin" aria-label="Thin pen" onClick={() => setThick(false)}><i className="thin" /></button>
        <button type="button" className={cx('kcanvas-size', thick && 'is-on')} aria-pressed={thick} title="Thick" aria-label="Thick pen" onClick={() => setThick(true)}><i className="thick" /></button>
        <i className="kcanvas-sep" />
        <button type="button" className="kcanvas-btn" title="Undo last stroke" aria-label="Undo last stroke" disabled={!strokes.length}
          onClick={() => save(strokes.slice(0, -1))}><Undo2 size={15} /></button>
        <button type="button" className="kcanvas-btn" title="Clear" aria-label="Clear the drawing" disabled={!strokes.length}
          onClick={() => save([])}><Eraser size={15} /></button>
      </div>
    </div>
  );
}
