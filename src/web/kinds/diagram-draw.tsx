// Drawing a diagram's elements as SVG, the same on screen, on the page and
// in print. Colours are theme tokens, so dark mode and paper both work; text
// is SVG text, so it prints as sharp as the lines.

import type { Box, DiagramEl } from '../../core/diagram';
import { LINE_HEIGHT, boxOf, connectorEnds, fontOf, isConnector, labelBox, textLines } from '../../core/diagram';
import { tokenColor } from './shared';

/** What part of the drawing area shows, and how many screen pixels a unit takes. */
export interface Frame { x: number; y: number; scale: number; pw: number; ph: number }

const PAD = 24;
const MIN_SCALE = 0.6;
/** Room to draw in while editing: a minimum height, and space under the lowest shape. */
const EDIT_HEIGHT = 320;
const ROOM = 120;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * The frame for a drawing in a cell `width` pixels wide. It never scales up,
 * and down only so far (past that the cell scrolls sideways), except on paper,
 * which can't scroll, so there it shrinks to `fit`. While editing it starts at
 * the origin and leaves room to draw; otherwise it hugs the drawing.
 */
export function frameFor(ext: Box | null, width: number, edit: boolean, fit = false): Frame | null {
  const cw = width > 0 ? width : 640;
  if (!edit) {
    if (!ext) return null;
    const w = ext.w + PAD * 2;
    const scale = clamp(cw / w, fit ? 0.05 : MIN_SCALE, 1);
    return { x: ext.x - PAD, y: ext.y - PAD, scale, pw: Math.ceil(w * scale), ph: Math.ceil((ext.h + PAD * 2) * scale) };
  }
  const x = Math.min(0, (ext?.x ?? 0) - PAD);
  const y = Math.min(0, (ext?.y ?? 0) - PAD);
  const right = ext ? ext.x + ext.w + PAD : 0;
  const scale = right > x ? clamp(cw / (right - x), MIN_SCALE, 1) : 1;
  const pw = Math.max(Math.floor(cw), Math.ceil((right - x) * scale));
  const ph = Math.ceil(Math.max(((ext ? ext.y + ext.h + ROOM : 0) - y) * scale, EDIT_HEIGHT));
  return { x, y, scale, pw, ph };
}

export const viewBox = (f: Frame): string => `${f.x} ${f.y} ${f.pw / f.scale} ${f.ph / f.scale}`;

export const strokeOf = (e: DiagramEl): string => tokenColor(e.color, 'var(--ink)');

/** Shapes are filled with the paper unless told otherwise, so what passes behind them doesn't show through. */
export function fillOf(e: DiagramEl): string {
  if (e.fill === 'none') return 'none';
  if (e.fill) return tokenColor(e.fill, 'var(--paper)');
  return e.type === 'text' ? 'none' : 'var(--paper)';
}

const DASH = '6 5';
const WIDTH = 1.6;

interface Paint { className?: string; fill?: string; stroke?: string; strokeWidth?: number; strokeDasharray?: string }

/** The outline of a box element, padded by `pad` (for highlights). */
export function Outline({ e, b, pad = 0, ...props }: { e: DiagramEl; b: Box; pad?: number } & Paint) {
  const x = b.x - pad, y = b.y - pad, w = b.w + pad * 2, h = b.h + pad * 2;
  if (e.type === 'ellipse') return <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} {...props} />;
  if (e.type === 'diamond') return <polygon points={`${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}`} {...props} />;
  return <rect x={x} y={y} width={w} height={h} rx={e.type === 'rect' ? Math.min(8, w / 4, h / 4) : 4} {...props} />;
}

/** Lines of text centred on `cy`, either centred on `x` or starting at it. */
function Lines({ lines, x, cy, size, fill, start }: { lines: string[]; x: number; cy: number; size: number; fill: string; start?: boolean }) {
  const lh = size * LINE_HEIGHT;
  const top = cy - ((lines.length - 1) * lh) / 2;
  return (
    <text x={x} fontSize={size} fill={fill} textAnchor={start ? 'start' : 'middle'} dominantBaseline="central">
      {lines.map((l, i) => <tspan key={i} x={x} y={top + i * lh}>{l || ' '}</tspan>)}
    </text>
  );
}

function BoxEl({ e, text }: { e: DiagramEl; text: string }) {
  const b = boxOf(e);
  const stroke = strokeOf(e);
  const fill = fillOf(e);
  const lines = textLines(e, text);
  const size = fontOf(e);
  if (e.type === 'text') {
    return (
      <g className="kd-el kd-text" data-el={e.id}>
        {/* A transparent box, so the whole text is something to press on. */}
        <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={4} fill={fill === 'none' ? 'transparent' : fill} />
        {lines.length > 0 && <Lines lines={lines} x={b.x + 6} cy={b.y + 4 + (lines.length * size * LINE_HEIGHT) / 2} size={size} fill={stroke} start />}
      </g>
    );
  }
  return (
    <g className="kd-el kd-shape" data-el={e.id}>
      <Outline e={e} b={b} fill={fill === 'none' ? 'transparent' : fill} stroke={stroke} strokeWidth={WIDTH} strokeDasharray={e.dash ? DASH : undefined} />
      {lines.length > 0 && <Lines lines={lines} x={b.x + b.w / 2} cy={b.y + b.h / 2} size={size} fill={stroke} />}
    </g>
  );
}

/** An open arrowhead at (x2, y2), pointing away from (x1, y1). */
export function arrowHead(x1: number, y1: number, x2: number, y2: number, size = 11): string {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const wing = (t: number) => `${(x2 - size * Math.cos(a + t)).toFixed(1)},${(y2 - size * Math.sin(a + t)).toFixed(1)}`;
  return `M${wing(0.45)} L${x2},${y2} L${wing(-0.45)}`;
}

function Connector({ e, byId }: { e: DiagramEl; byId: Map<string, DiagramEl> }) {
  const ends = connectorEnds(e, byId);
  if (!ends) return null;
  const { x1, y1, x2, y2 } = ends;
  const stroke = strokeOf(e);
  return (
    <g className="kd-el kd-link" data-el={e.id} stroke={stroke} strokeWidth={WIDTH} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <line x1={x1} y1={y1} x2={x2} y2={y2} strokeDasharray={e.dash ? DASH : undefined} />
      {e.type === 'arrow' && Math.hypot(x2 - x1, y2 - y1) > 4 && <path d={arrowHead(x1, y1, x2, y2)} />}
    </g>
  );
}

function Label({ e, byId, text }: { e: DiagramEl; byId: Map<string, DiagramEl>; text: string }) {
  const b = labelBox(e, byId, text);
  if (!b) return null;
  return (
    <g className="kd-el kd-label" data-el={e.id}>
      <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={4} fill="var(--paper)" />
      <Lines lines={textLines(e, text)} x={b.x + b.w / 2} cy={b.y + b.h / 2} size={fontOf(e)} fill={strokeOf(e)} />
    </g>
  );
}

/**
 * Every element: arrows and lines first, so shapes sit over them; then the
 * shapes and text; then the arrows' labels on top. `texts` are labels as
 * shown (live values); the element in `hide` is being written and shows none.
 */
export function Elements({ els, texts, hide }: { els: DiagramEl[]; texts: Record<string, string>; hide?: string | null }) {
  const byId = new Map(els.map((e) => [e.id, e]));
  const shown = (e: DiagramEl) => (e.id === hide ? '' : texts[e.id] ?? e.text ?? '');
  return (
    <>
      {els.filter(isConnector).map((e) => <Connector key={e.id} e={e} byId={byId} />)}
      {els.filter((e) => !isConnector(e)).map((e) => <BoxEl key={e.id} e={e} text={shown(e)} />)}
      {els.filter((e) => isConnector(e) && shown(e)).map((e) => <Label key={'l' + e.id} e={e} byId={byId} text={shown(e)} />)}
    </>
  );
}
