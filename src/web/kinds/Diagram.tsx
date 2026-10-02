// A diagram: shapes, text and arrows drawn in the app's own SVG. Its value is
// the list of elements (core/diagram.ts). In Edit, once the cell is selected,
// the diagram takes the pointer and the keys: draw, pick, move, resize,
// connect and write labels. Each finished gesture is one change, so ⌘Z takes
// back one step. In Live a press on an element raises "click"; on the page it
// is a picture.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Cell, Json } from '../../core/types';
import type { CellState } from '../../core/engine';
import type { Box, DiagramEl, Pt } from '../../core/diagram';
import {
  DEFAULT_SIZE, FONT, LABEL_WIDTH, LINE_HEIGHT, boxAt, boxBetween, boxOf, connectorEnds, describeDiagram, duplicateElements, elementsOf,
  elementsWithin, eraseElements, extent, fitText, fontOf, insideBox, isConnector, moveElements, newId, pickAt, resizeBox, textRoom,
} from '../../core/diagram';
import { cx, useS, useSession } from '../editor/ctx';
import { markPart } from '../editor/pointer';
import { useBox } from './shared';
import { Elements, type Frame, Outline, frameFor, strokeOf, viewBox } from './diagram-draw';
import { DiagramTools, TOOLS, type Swatch, type Tool } from './diagram-tools';
import './diagram.css';

const NO_TEXTS: Record<string, string> = {};

export function DiagramView({ cell, st }: { cell: Cell; st: CellState | undefined }) {
  const mode = useS((s) => s.mode);
  const active = useS((s) => s.mode === 'edit' && s.selection.length === 1 && s.selection[0] === cell.id);
  const els = useMemo(() => elementsOf(cell.value), [cell.value]);
  const texts = (st?.props?.texts as Record<string, string> | undefined) ?? NO_TEXTS;
  if (mode === 'edit') return <DiagramEditor cell={cell} stored={els} texts={texts} active={active} />;
  return <DiagramPicture cell={cell} els={els} texts={texts} live={mode === 'live'} paper={mode === 'page'} />;
}

/** A pointer's place in the drawing's own units, whatever the scale and scroll. */
function toUser(svg: SVGSVGElement, e: { clientX: number; clientY: number }): Pt {
  const m = svg.getScreenCTM();
  if (!m) return { x: 0, y: 0 };
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
  return { x: p.x, y: p.y };
}

function describe(els: DiagramEl[], texts: Record<string, string>): string {
  const words = els.map((e) => texts[e.id] ?? e.text).filter(Boolean);
  return `Diagram: ${describeDiagram(els)}${words.length ? '. ' + words.join(', ') : ''}`;
}

// ───────────────────────────── to look at ─────────────────────────────

function DiagramPicture({ cell, els, texts, live, paper }: { cell: Cell; els: DiagramEl[]; texts: Record<string, string>; live: boolean; paper: boolean }) {
  const session = useSession();
  const [ref, { w }] = useBox<HTMLDivElement>();
  const frame = frameFor(extent(els, texts), w, false, paper);
  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!frame) return;
    const hit = pickAt(els, toUser(e.currentTarget, e), 8 / frame.scale);
    // The cell's click handler (in CellView) learns which shape it was.
    markPart(e, { element: hit ? { ...hit } : null });
    if (hit) session.raise(cell.id, 'click', { element: { ...hit } });
  };
  return (
    <div className={cx('kdiagram', live && 'is-live')} ref={ref}>
      {frame && (
        <div className="kdiagram-scroll">
          <svg className="kdiagram-svg" style={{ width: frame.pw, height: frame.ph }} viewBox={viewBox(frame)} role="img" aria-label={describe(els, texts)}
            onClick={live ? onClick : undefined}>
            <Elements els={els} texts={texts} />
          </svg>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────── to edit ─────────────────────────────

/** A label being written: of an element, or of new text not in the diagram yet. */
interface Writing { id: string; text: string; fresh?: DiagramEl }

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const handlePoint = (b: Box, h: string): Pt => ({
  x: b.x + (h.includes('w') ? 0 : h.includes('e') ? b.w : b.w / 2),
  y: b.y + (h.includes('n') ? 0 : h.includes('s') ? b.h : b.h / 2),
});
const CURSORS: Record<string, string> = { n: 'ns', s: 'ns', e: 'ew', w: 'ew', nw: 'nwse', se: 'nwse', ne: 'nesw', sw: 'nesw' };
const round = Math.round;
const coarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

/** An element with one field set, or taken away when the value is null. */
function withField(e: DiagramEl, key: keyof DiagramEl, value: unknown): DiagramEl {
  const next = { ...e } as Record<string, unknown>;
  if (value == null || value === '') delete next[key];
  else next[key] = value;
  return next as unknown as DiagramEl;
}

function DiagramEditor({ cell, stored, texts, active }: { cell: Cell; stored: DiagramEl[]; texts: Record<string, string>; active: boolean }) {
  const session = useSession();
  const canUndo = useS((s) => s.canUndo);
  const canRedo = useS((s) => s.canRedo);
  const [ref, { w }] = useBox<HTMLDivElement>();
  const [tool, setTool] = useState<Tool>('select');
  const [picked, setPicked] = useState<string[]>([]);
  const [stroke, setStroke] = useState('ink');
  const [fill, setFill] = useState<string | null>(null);
  const [swatch, setSwatch] = useState<Swatch>(null);
  // During a gesture: the elements as they would be, a marquee, the shape an arrow end would join, and a frame that holds still.
  const [draft, setDraft] = useState<DiagramEl[] | null>(null);
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [frozen, setFrozen] = useState<Frame | null>(null);
  const [writing, setWriting] = useState<Writing | null>(null);
  const [fat, setFat] = useState(coarse);
  const writingRef = useRef(writing);
  writingRef.current = writing;
  const busy = useRef(false);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);

  const els = draft ?? stored;
  const byId = useMemo(() => new Map(els.map((e) => [e.id, e])), [els]);
  const sel = picked.filter((id) => byId.has(id));
  const one = sel.length === 1 ? byId.get(sel[0]) : undefined;
  const frame = frozen ?? frameFor(extent(els, texts), w, true)!;
  /** Screen pixels in the drawing's units. */
  const reach = (px: number) => px / frame.scale;

  // Leaving the diagram drops what was picked and the tool in hand.
  useEffect(() => {
    if (active) return;
    setPicked([]);
    setTool('select');
    setSwatch(null);
    lastTap.current = null;
  }, [active]);

  const commit = (next: DiagramEl[], key?: string) => {
    if (JSON.stringify(next) === JSON.stringify(stored)) return;
    session.dispatch(['set', cell.id, 'value', next as unknown as Json], { transition: false, ...(key ? { key } : {}) });
  };

  /** The colours new elements are drawn in; ink and the paper are the defaults and aren't written down. */
  const style = (connector: boolean): Partial<DiagramEl> => ({
    ...(stroke !== 'ink' ? { color: stroke } : {}),
    ...(!connector && fill ? { fill } : {}),
  });

  const handles = (): { name: string; at: Pt }[] => {
    if (!one || writing) return [];
    if (isConnector(one)) {
      const ends = connectorEnds(one, byId);
      return ends ? [{ name: 'from', at: { x: ends.x1, y: ends.y1 } }, { name: 'to', at: { x: ends.x2, y: ends.y2 } }] : [];
    }
    const b = boxOf(one);
    return HANDLES.map((name) => ({ name, at: handlePoint(b, name) }));
  };
  const handleAt = (p: Pt, r: number): string | null => {
    let best: string | null = null;
    let bestD = r;
    for (const h of handles()) {
      const d = Math.hypot(p.x - h.at.x, p.y - h.at.y);
      if (d <= bestD) { best = h.name; bestD = d; }
    }
    return best;
  };

  // ── gestures ──

  /** Follow one pointer from press to release; the frame holds still meanwhile. */
  const track = (e: React.PointerEvent<SVGSVGElement>, onMove: (q: Pt, ev: PointerEvent) => void, onEnd: (q: Pt | null, moved: boolean, ev: PointerEvent) => void) => {
    const svg = e.currentTarget;
    const id = e.pointerId;
    const sx = e.clientX, sy = e.clientY;
    let moved = false;
    busy.current = true;
    try { svg.setPointerCapture(id); } catch { /* a pointer that is already gone */ }
    setFrozen(frame);
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
      moved = true;
      onMove(toUser(svg, ev), ev);
    };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      busy.current = false;
      svg.removeEventListener('pointermove', move);
      svg.removeEventListener('pointerup', end);
      svg.removeEventListener('pointercancel', end);
      setFrozen(null);
      onEnd(ev.type === 'pointerup' ? toUser(svg, ev) : null, moved, ev);
    };
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
  };
  const tapped = (e: React.PointerEvent) => { lastTap.current = { t: performance.now(), x: e.clientX, y: e.clientY }; };

  const drawBox = (e: React.PointerEvent<SVGSVGElement>, p: Pt, type: 'rect' | 'ellipse' | 'diamond') => {
    const id = newId(stored);
    const make = (q: Pt, even: boolean): DiagramEl => {
      let b = boxBetween(p, q);
      if (even) {
        const s = Math.max(b.w, b.h);
        b = { x: q.x < p.x ? p.x - s : p.x, y: q.y < p.y ? p.y - s : p.y, w: s, h: s };
      }
      return { id, type, x: round(b.x), y: round(b.y), w: Math.max(16, round(b.w)), h: Math.max(16, round(b.h)), ...style(false) };
    };
    track(e, (q, ev) => setDraft([...stored, make(q, ev.shiftKey)]), (q, moved, ev) => {
      setDraft(null);
      if (!q) return;
      // A press without a drag puts down a shape of the usual size.
      const [dw, dh] = DEFAULT_SIZE[type];
      const small = !moved || (Math.abs(q.x - p.x) < reach(12) && Math.abs(q.y - p.y) < reach(12));
      const el = small ? { id, type, x: round(p.x - dw / 2), y: round(p.y - dh / 2), w: dw, h: dh, ...style(false) } : make(q, ev.shiftKey);
      commit([...stored, el]);
      setPicked([id]);
      setTool('select');
    });
  };

  const drawLink = (e: React.PointerEvent<SVGSVGElement>, p: Pt, type: 'arrow' | 'line', tol: number) => {
    const id = newId(stored);
    const from = boxAt(stored, p, tol);
    const make = (q: Pt): [DiagramEl, DiagramEl | null] => {
      const to = boxAt(stored, q, tol, from?.id);
      const el: DiagramEl = {
        id, type, ...(from ? { from: from.id } : { x1: round(p.x), y1: round(p.y) }), ...(to ? { to: to.id } : { x2: round(q.x), y2: round(q.y) }), ...style(true),
      };
      return [el, to];
    };
    if (from) setTarget(from.id);
    track(e, (q) => {
      const [el, to] = make(q);
      setTarget(to?.id ?? null);
      setDraft([...stored, el]);
    }, (q, moved) => {
      setDraft(null);
      setTarget(null);
      if (!q || !moved) return;
      const [el, to] = make(q);
      // Too short, or ending back inside the shape it left: a slip, not an arrow.
      if (!to && (Math.hypot(q.x - p.x, q.y - p.y) < reach(12) || (from && insideBox(from, q)))) return;
      commit([...stored, el]);
      setPicked([id]);
      setTool('select');
    });
  };

  const moveFrom = (e: React.PointerEvent<SVGSVGElement>, p: Pt, hit: DiagramEl) => {
    const shift = e.shiftKey;
    let ids = sel;
    if (shift) ids = sel.includes(hit.id) ? sel.filter((x) => x !== hit.id) : [...sel, hit.id];
    else if (!sel.includes(hit.id)) ids = [hit.id];
    setPicked(ids);
    // Shift-pressing a picked element takes it out; that press moves nothing.
    const moving = ids.includes(hit.id) ? ids : [];
    const at = (q: Pt) => moveElements(stored, moving, round(q.x - p.x), round(q.y - p.y));
    track(e, (q) => { if (moving.length) setDraft(at(q)); }, (q, moved) => {
      setDraft(null);
      if (!q) return;
      if (moved && moving.length) return commit(at(q));
      if (moved) return;
      tapped(e);
      // A click on one of several picked keeps just that one.
      if (!shift && ids.length > 1) setPicked([hit.id]);
    });
  };

  const marqueeFrom = (e: React.PointerEvent<SVGSVGElement>, p: Pt) => {
    const before = e.shiftKey ? sel : [];
    if (!e.shiftKey) setPicked([]);
    track(e, (q) => {
      const b = boxBetween(p, q);
      setMarquee(b);
      setPicked([...new Set([...before, ...elementsWithin(stored, b)])]);
    }, (_q, moved) => {
      setMarquee(null);
      if (!moved) tapped(e);
    });
  };

  const resizeFrom = (e: React.PointerEvent<SVGSVGElement>, p: Pt, el: DiagramEl, handle: string) => {
    const b = boxOf(el);
    const at = (q: Pt) => stored.map((x) => (x.id === el.id ? fitText({ ...x, ...resizeBox(b, handle, q.x - p.x, q.y - p.y) }) : x));
    track(e, (q) => setDraft(at(q)), (q, moved) => {
      setDraft(null);
      if (q && moved) commit(at(q));
    });
  };

  const dragEnd = (e: React.PointerEvent<SVGSVGElement>, el: DiagramEl, end: 'from' | 'to', tol: number) => {
    const other = end === 'from' ? el.to : el.from;
    const [k, kx, ky] = end === 'from' ? (['from', 'x1', 'y1'] as const) : (['to', 'x2', 'y2'] as const);
    const at = (q: Pt): [DiagramEl[], string | null] => {
      const t = boxAt(stored, q, tol, other);
      const next: DiagramEl = { ...el };
      if (t) { next[k] = t.id; delete next[kx]; delete next[ky]; }
      else { delete next[k]; next[kx] = round(q.x); next[ky] = round(q.y); }
      return [stored.map((x) => (x.id === el.id ? next : x)), t?.id ?? null];
    };
    track(e, (q) => {
      const [next, t] = at(q);
      setTarget(t);
      setDraft(next);
    }, (q, moved) => {
      setDraft(null);
      setTarget(null);
      if (q && moved) commit(at(q)[0]);
    });
  };

  // ── labels ──

  const write = (el: DiagramEl) => {
    setSwatch(null);
    setWriting({ id: el.id, text: el.text ?? '' });
  };
  const newText = (p: Pt) => {
    const id = newId(stored);
    setPicked([]);
    setWriting({ id, text: '', fresh: { id, type: 'text', x: round(p.x - 6), y: round(p.y - (FONT.text * LINE_HEIGHT) / 2 - 4), ...style(true) } });
  };
  const finishWriting = (refocus = false) => {
    const wr = writingRef.current;
    if (!wr) return;
    writingRef.current = null;
    setWriting(null);
    // Finished from the keyboard: the keys go back to the diagram.
    if (refocus) ref.current?.focus({ preventScroll: true });
    const text = wr.text.replace(/\s+$/, '');
    if (wr.fresh) {
      if (text.trim()) {
        commit([...stored, fitText({ ...wr.fresh, text })]);
        setPicked([wr.fresh.id]);
      }
      return;
    }
    const el = stored.find((x) => x.id === wr.id);
    if (!el || text === (el.text ?? '')) return;
    // Free text with nothing left in it goes away.
    if (el.type === 'text' && !text.trim()) return commit(eraseElements(stored, [el.id]));
    commit(stored.map((x) => (x.id === el.id ? fitText(withField(x, 'text', text)) : x)));
  };

  // ── the press ──

  const onDown = (e: React.PointerEvent<SVGSVGElement>) => {
    // The first press on the diagram selects the cell; the sheet sees it.
    if (!active) return;
    e.stopPropagation();
    if (busy.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    ref.current?.focus({ preventScroll: true });
    setSwatch(null);
    const touch = e.pointerType !== 'mouse';
    if (touch !== fat) setFat(touch);
    // A press away from a label being written finishes it, and does nothing else.
    if (writingRef.current) return finishWriting();
    const p = toUser(e.currentTarget, e);
    const tol = reach(touch ? 14 : 7);
    const tap = lastTap.current;
    lastTap.current = null;
    const double = !!tap && performance.now() - tap.t < 450 && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < (touch ? 24 : 8);
    if (double && (tool === 'select' || tool === 'text')) {
      const hit = pickAt(stored, p, tol);
      if (!hit) return newText(p);
      setPicked([hit.id]);
      return write(hit);
    }
    if (tool === 'text') {
      newText(p);
      return setTool('select');
    }
    if (tool === 'rect' || tool === 'ellipse' || tool === 'diamond') return drawBox(e, p, tool);
    if (tool === 'arrow' || tool === 'line') return drawLink(e, p, tool, tol);
    const h = one && handleAt(p, reach(touch ? 18 : 8));
    if (one && h) return isConnector(one) ? dragEnd(e, one, h as 'from' | 'to', tol) : resizeFrom(e, p, one, h);
    const hit = pickAt(stored, p, tol);
    if (hit) return moveFrom(e, p, hit);
    marqueeFrom(e, p);
  };

  // ── buttons and keys ──

  const remove = () => {
    if (!sel.length) return;
    commit(eraseElements(stored, sel));
    setPicked([]);
  };
  const duplicate = () => {
    if (!sel.length) return;
    const r = duplicateElements(stored, sel);
    commit(r.els);
    setPicked(r.made);
  };
  const paint = (key: 'color' | 'fill', token: string | null) => {
    if (key === 'color') setStroke(token ?? 'ink');
    else setFill(token);
    if (!sel.length) return;
    const value = key === 'color' && token === 'ink' ? null : token;
    commit(stored.map((e) => (sel.includes(e.id) && !(key === 'fill' && isConnector(e)) ? withField(e, key, value) : e)));
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!active) return;
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key;
    // Undo, redo and moving on with Tab are the sheet's.
    if ((mod && ['z', 'y'].includes(k.toLowerCase())) || k === 'Tab') return;
    if (k === 'Escape') {
      if (swatch) setSwatch(null);
      else if (tool !== 'select') setTool('select');
      else if (sel.length) setPicked([]);
      // Nothing left to let go of here: the sheet lets go of the cell.
      else return;
      return e.stopPropagation();
    }
    if (e.target instanceof HTMLButtonElement && (k === 'Enter' || k === ' ')) return e.stopPropagation();
    // With nothing picked, arrows move between cells as usual.
    if (k.startsWith('Arrow') && !sel.length) return;
    e.stopPropagation();
    if (k === 'Backspace' || k === 'Delete') {
      e.preventDefault();
      remove();
    } else if (mod && k.toLowerCase() === 'd') {
      e.preventDefault();
      duplicate();
    } else if (mod && k.toLowerCase() === 'a') {
      e.preventDefault();
      setPicked(stored.map((x) => x.id));
    } else if (k.startsWith('Arrow') && !mod) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = k === 'ArrowLeft' ? -step : k === 'ArrowRight' ? step : 0;
      const dy = k === 'ArrowUp' ? -step : k === 'ArrowDown' ? step : 0;
      // A run of nudges is one step to undo.
      commit(moveElements(stored, sel, dx, dy), `${cell.id}:nudge`);
    } else if (k === 'Enter') {
      e.preventDefault();
      if (one) write(one);
    } else if (!mod && !e.altKey) {
      const t = TOOLS.find((x) => x.key === k.toLowerCase());
      if (t) setTool(t.tool);
    }
  };

  // ── what shows ──

  const handleSize = reach(fat ? 11 : 8);
  // A picked arrow glows under the drawing, so its label stays readable; the rest sits on top.
  const under = active && (
    <g className="kd-chrome">
      {sel.map((id) => {
        const e = byId.get(id)!;
        const ends = isConnector(e) && connectorEnds(e, byId);
        return ends && <line key={id} className="kd-picked" x1={ends.x1} y1={ends.y1} x2={ends.x2} y2={ends.y2} strokeWidth={reach(6)} />;
      })}
    </g>
  );
  const over = active && (
    <g className="kd-chrome">
      {target && byId.get(target) && <Outline e={byId.get(target)!} b={boxOf(byId.get(target)!)} pad={reach(5)} className="kd-target" strokeWidth={reach(2.5)} />}
      {sel.map((id) => {
        const e = byId.get(id)!;
        if (isConnector(e)) return null;
        const b = boxOf(e);
        const pad = reach(4);
        return <rect key={id} className="kd-picked" x={b.x - pad} y={b.y - pad} width={b.w + pad * 2} height={b.h + pad * 2} rx={reach(3)} strokeWidth={reach(1.25)}
          strokeDasharray={sel.length > 1 ? `${reach(4)} ${reach(3)}` : undefined} />;
      })}
      {!draft && handles().map((h) => (one && isConnector(one)
        ? <circle key={h.name} className="kd-handle" cx={h.at.x} cy={h.at.y} r={handleSize / 2 + reach(1)} strokeWidth={reach(1.5)} />
        : <rect key={h.name} className="kd-handle" x={h.at.x - handleSize / 2} y={h.at.y - handleSize / 2} width={handleSize} height={handleSize} rx={reach(2)}
          strokeWidth={reach(1.5)} style={{ cursor: `${CURSORS[h.name]}-resize` }} />))}
      {marquee && <rect className="kd-marquee" x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} strokeWidth={reach(1)} />}
    </g>
  );
  const writingEl = writing ? writing.fresh ?? byId.get(writing.id) : undefined;
  const shown = active ? els : stored;

  return (
    <div ref={ref} className={cx('kdiagram', 'is-edit', active && 'is-active')} tabIndex={-1} onKeyDown={onKey}
      onPointerDown={active ? (e) => e.stopPropagation() : undefined}>
      {active && (
        <DiagramTools tool={tool} setTool={(t) => { setTool(t); setSwatch(null); }} stroke={one ? one.color ?? 'ink' : stroke} fill={one ? one.fill ?? null : fill}
          paint={paint} swatch={swatch} setSwatch={setSwatch} picked={sel.length} canLabel={!!one} label={() => one && write(one)}
          duplicate={duplicate} remove={remove} canUndo={canUndo} canRedo={canRedo} undo={() => session.undo()} redo={() => session.redo()} />
      )}
      <div className="kdiagram-scroll">
        <div className="kdiagram-stage" data-tool={active ? tool : undefined} style={{ width: frame.pw, height: frame.ph }}>
          <svg className="kdiagram-svg" viewBox={viewBox(frame)} onPointerDown={onDown} role="img" aria-label={describe(shown, texts)}>
            {under}
            <Elements els={shown} texts={texts} hide={writing?.id} />
            {over}
          </svg>
          {!stored.length && !draft && !writing && (
            <span className="kdiagram-hint" aria-hidden>{active ? 'Pick a shape above, then drag to draw it' : 'An empty diagram: select it to draw'}</span>
          )}
          {writingEl && writing && (
            <Writer el={writingEl} text={writing.text} frame={frame} byId={byId}
              onChange={(text) => setWriting({ ...writing, text })} onDone={finishWriting} />
          )}
        </div>
      </div>
    </div>
  );
}

/** The field a label is written in, laid over the element so the words stay where they will show. */
function Writer({ el, text, frame, byId, onChange, onDone }: {
  el: DiagramEl; text: string; frame: Frame; byId: Map<string, DiagramEl>; onChange: (t: string) => void; onDone: (refocus?: boolean) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const s = frame.scale;
  const size = fontOf(el);
  const X = (x: number) => (x - frame.x) * s;
  const Y = (y: number) => (y - frame.y) * s;
  // Where the text goes: its left edge and width, and the line its middle sits on (or its top, for free text).
  let left: number, width: number, mid: number | null = null, top = 0;
  const free = el.type === 'text';
  if (isConnector(el)) {
    const ends = connectorEnds(el, byId);
    const cx = ends ? (ends.x1 + ends.x2) / 2 : 0;
    width = LABEL_WIDTH + 12;
    left = cx - width / 2;
    mid = ends ? (ends.y1 + ends.y2) / 2 : 0;
  } else if (free) {
    const b = boxOf({ ...el, text });
    left = b.x + 6;
    width = Math.max(b.w - 12, 48);
    top = b.y + 4;
  } else {
    const b = boxOf(el);
    width = textRoom(el, b);
    left = b.x + (b.w - width) / 2;
    mid = b.y + b.h / 2;
  }

  useEffect(() => {
    const t = ref.current;
    if (!t) return;
    t.focus({ preventScroll: true });
    t.setSelectionRange(t.value.length, t.value.length);
  }, []);
  // As tall as its lines, and centred on the shape's middle.
  useLayoutEffect(() => {
    const t = ref.current;
    if (!t) return;
    t.style.height = '0px';
    const h = t.scrollHeight;
    t.style.height = `${h}px`;
    t.style.top = `${mid == null ? Y(top) : Y(mid) - h / 2}px`;
  });

  return (
    <textarea ref={ref} className={cx('kdiagram-writer', isConnector(el) && 'is-label', free && 'is-free')} value={text} rows={1}
      aria-label={free ? 'Text' : 'Label'} spellCheck wrap={free && !el.w ? 'off' : 'soft'}
      style={{ left: X(left), width: width * s, fontSize: size * s, color: strokeOf(el) }}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => onDone()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
          e.preventDefault();
          onDone(true);
        }
      }} />
  );
}
