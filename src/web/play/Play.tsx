// A deck, played: one document per slide, each live on its own (its own
// session, evaluated on its own; slides share data only through collections).
// → ← (or a click beside the slide, or a swipe) move between slides; ↓ ↑
// Space scroll a slide taller than the screen; F full screen; Esc leaves.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize, Minimize, X } from 'lucide-react';
import type { Deck, DocSummary } from '../lib/api';
import { api } from '../lib/api';
import { Session } from '../session';
import { SessionContext, cx, useS } from '../editor/ctx';
import { LiveSheet, Toast } from '../editor/LiveView';
import { Notice } from '../pages/Notice';
import { type Fit, fitSlide } from './fit';
import { requestFull } from './start';
import './play.css';

const typing = (t: EventTarget | null) => t instanceof Element && !!t.closest('input, textarea, select, [contenteditable="true"]');

/** Each slide's session lives as long as Play does; only the one on screen listens to the server. */
class Slides {
  private sessions = new Map<string, Session>();
  private shown: Session | null = null;
  show(id: string): Session {
    let s = this.sessions.get(id);
    if (this.shown && this.shown !== s) this.shown.pause();
    if (!s) {
      s = new Session(id, { mode: 'live', embedded: true });
      this.sessions.set(id, s);
      void s.open();
    } else s.resume();
    this.shown = s;
    (window as unknown as { edgy?: Session }).edgy = s;
    return s;
  }
  /** Play is over: every document that opened closes (its close handler runs). */
  close(): void {
    for (const s of this.sessions.values()) s.close();
    this.sessions.clear();
    this.shown = null;
  }
}

export function Play({ id, onLeave }: { id: string; onLeave: () => void }) {
  const [deck, setDeck] = useState<(Deck & { items: DocSummary[] }) | null | 'missing'>(null);
  useEffect(() => {
    api<Deck & { items: DocSummary[] }>('GET', `/api/decks/${id}`).then(setDeck).catch(() => setDeck('missing'));
  }, [id]);
  if (deck === null) return <div className="screen-note">Opening…</div>;
  if (deck === 'missing') return <Notice kind="missing" title="No deck here" action={<button className="btn solid" onClick={onLeave}>Back</button>}>It may have been ungrouped.</Notice>;
  const items = deck.items.filter((d) => d.archivedAt == null);
  if (!items.length) return <Notice kind="missing" title="Nothing to play" action={<button className="btn solid" onClick={onLeave}>Back</button>}>This deck has no documents yet.</Notice>;
  return <Player title={deck.title} items={items} onLeave={onLeave} />;
}

function startAt(n: number): number {
  const m = /^#(\d+)$/.exec(window.location.hash);
  return m ? Math.min(n - 1, Math.max(0, Number(m[1]) - 1)) : 0;
}

function Player({ title, items, onLeave }: { title: string; items: DocSummary[]; onLeave: () => void }) {
  const slides = useMemo(() => new Slides(), []);
  const [at, setAt] = useState(() => startAt(items.length));
  const [full, setFull] = useState(() => !!document.fullscreenElement);
  const ownExit = useRef(false);
  const frame = useRef<HTMLDivElement>(null);
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => setSession(slides.show(items[at].id)), [slides, items, at]);
  useEffect(() => () => slides.close(), [slides]);
  useEffect(() => {
    try {
      window.history.replaceState(window.history.state, '', `#${at + 1}`);
    } catch { /* a file opened from disk may not allow it */ }
  }, [at]);

  const go = useCallback((delta: number) => setAt((i) => Math.min(items.length - 1, Math.max(0, i + delta))), [items.length]);
  const leave = useCallback(() => {
    if (document.fullscreenElement) {
      ownExit.current = true;
      void document.exitFullscreen().catch(() => undefined);
    }
    onLeave();
  }, [onLeave]);
  const toggleFull = useCallback(() => {
    if (document.fullscreenElement) {
      ownExit.current = true;
      void document.exitFullscreen().catch(() => undefined);
    } else requestFull();
  }, []);

  useEffect(() => {
    // In full screen the browser keeps Esc for itself and only leaves full screen; that is leaving Play too.
    const onFull = () => {
      const now = !!document.fullscreenElement;
      setFull(now);
      if (!now && !ownExit.current) onLeave();
      ownExit.current = false;
    };
    document.addEventListener('fullscreenchange', onFull);
    return () => document.removeEventListener('fullscreenchange', onFull);
  }, [onLeave]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (typing(e.target)) {
        if (e.key === 'Escape') (e.target as HTMLElement).blur();
        return;
      }
      const pane = frame.current;
      const step = pane ? pane.clientHeight * 0.85 : 400;
      if (e.key === 'ArrowRight' || e.key === 'PageDown' && !scrollable(pane, 1)) go(1);
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp' && !scrollable(pane, -1)) go(-1);
      else if (e.key === 'ArrowDown' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) {
        if (!scrollable(pane, 1)) { if (e.key === ' ') go(1); else return; }
        else pane!.scrollBy({ top: e.key === 'ArrowDown' ? 80 : step, behavior: 'smooth' });
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) {
        if (!scrollable(pane, -1)) return;
        pane!.scrollBy({ top: e.key === 'ArrowUp' ? -80 : -step, behavior: 'smooth' });
      } else if (e.key === 'Home') setAt(0);
      else if (e.key === 'End') setAt(items.length - 1);
      else if (e.key === 'Escape') leave();
      else if (e.key === 'f' || e.key === 'F') toggleFull();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, leave, toggleFull, items.length]);

  // A swipe on a touch screen: across, quick, and not on something that drags or scrolls sideways itself.
  const swipe = useRef<{ x: number; y: number; t: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    swipe.current = e.pointerType !== 'mouse' && !holdsSideways(e.target as Element, frame.current) ? { x: e.clientX, y: e.clientY, t: Date.now() } : null;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - s.t < 800) go(dx < 0 ? 1 : -1);
  };
  // A click beside the slide (not on it): the left half goes back, the right half on.
  const onClick = (e: React.MouseEvent) => {
    const t = e.target as Element;
    if (!t.closest('.slide-room') || t.closest('.slide-box')) return;
    go(e.clientX < window.innerWidth / 2 ? -1 : 1);
  };

  return (
    <div className="play" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => { swipe.current = null; }} onClick={onClick}>
      {session && (
        <SessionContext.Provider value={session}>
          <Slide key={session.id} frame={frame} />
          <Toast />
        </SessionContext.Provider>
      )}
      <nav className="play-bar" aria-label="Slides">
        <button className="icon-btn" aria-label="Previous slide" title="Previous (←)" disabled={at === 0} onClick={() => go(-1)}><ChevronLeft size={18} /></button>
        <span className="play-count" aria-live="polite"><b>{at + 1}</b> / {items.length}</span>
        <button className="icon-btn" aria-label="Next slide" title="Next (→)" disabled={at === items.length - 1} onClick={() => go(1)}><ChevronRight size={18} /></button>
        <span className="play-title" title={`${title}: ${items[at].title}`}><span className="play-deck">{title} · </span>{items[at].title}</span>
        <button className="icon-btn" aria-label={full ? 'Leave full screen' : 'Full screen'} title={full ? 'Leave full screen (F)' : 'Full screen (F)'} aria-pressed={full} onClick={toggleFull}>
          {full ? <Minimize size={16} /> : <Maximize size={16} />}
        </button>
        <button className="icon-btn" aria-label="Leave" title="Leave (Esc)" onClick={leave}><X size={18} /></button>
      </nav>
    </div>
  );
}

/** Whether the pane can scroll further in this direction. */
function scrollable(pane: HTMLElement | null, dir: 1 | -1): boolean {
  if (!pane) return false;
  return dir > 0 ? pane.scrollTop + pane.clientHeight < pane.scrollHeight - 2 : pane.scrollTop > 2;
}

/** Things a finger drags sideways on purpose: sliders, drawings, diagrams, a table that scrolls across. */
function holdsSideways(t: Element | null, stop: Element | null): boolean {
  for (let el = t; el && el !== stop; el = el.parentElement) {
    if (el.matches('input[type=range], canvas, svg, .kdiagram, [data-no-swipe]')) return true;
    if (el instanceof HTMLElement && el.scrollWidth > el.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(el).overflowX)) return true;
  }
  return false;
}

/** One document, fitted to the room the slide has (see fit.ts). */
function Slide({ frame }: { frame: React.RefObject<HTMLDivElement | null> }) {
  const status = useS((s) => s.status);
  const meta = useS((s) => s.doc?.meta);
  const sheet = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState<{ w: number; h: number } | null>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);
  const [more, setMore] = useState(false);

  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    const measure = () => {
      const cs = getComputedStyle(el);
      const w = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const h = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      setRoom((r) => (r && r.w === w && r.h === h ? r : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [frame, status]);

  useLayoutEffect(() => {
    const el = sheet.current?.querySelector<HTMLElement>('.sheet');
    if (!el) return;
    // The sheet's height doesn't change with its scale (a transform), so measuring it never loops.
    const measure = () => setHeight(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [status, room]);

  const design = typeof meta?.width === 'number' ? meta.width : 880;
  const fit: Fit | null = room ? fitSlide(room, design, height) : null;

  useEffect(() => {
    const el = frame.current;
    if (!el || !fit?.scrolls) return void setMore(false);
    const onScroll = () => setMore(el.scrollTop + el.clientHeight < el.scrollHeight - 8);
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [frame, fit?.scrolls, height]);

  return (
    <div ref={frame} className={cx('slide-room', fit?.scrolls && 'scrolls')} tabIndex={-1}>
      {status === 'ready' && fit ? (
        <div className="slide-box" style={{ width: fit.width * fit.scale, height: height ? height * fit.scale : undefined }}>
          <div ref={sheet} className="slide-sheet" style={{ width: fit.width, transform: `scale(${fit.scale})` }}>
            <LiveSheet style={{ maxWidth: 'none', width: fit.width, minHeight: 0 }} />
          </div>
        </div>
      ) : status === 'missing' ? (
        <p className="slide-note">This document is gone.</p>
      ) : status === 'failed' ? (
        <p className="slide-note">The server did not answer.</p>
      ) : (
        <p className="slide-note">Opening…</p>
      )}
      {more && <span className="slide-more" aria-hidden>More below ↓</span>}
    </div>
  );
}
