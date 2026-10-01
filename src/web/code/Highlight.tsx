// Coloured code: the tokens from the lexer as spans, character for character,
// so the same text can sit exactly under a transparent textarea.

import type { ReactNode, Ref } from 'react';
import type { Tok } from './lexer';

export interface Marks {
  /** Bracket token indexes to light up (the one at the caret and its partner). */
  match?: number[];
  /** A reading error's offset, drawn as a wavy line. */
  error?: number | null;
  /** An empty span at this offset, to measure where a popup goes. */
  anchor?: number | null;
  anchorRef?: Ref<HTMLSpanElement>;
}

function cls(t: Tok, i: number, m: Marks): string {
  let c = 't-' + t.kind;
  if (t.kind === 'open' || t.kind === 'close') {
    c += ' d' + ((t.depth ?? 0) % 4);
    if (t.stray) c += ' is-stray';
    if (m.match?.includes(i)) c += ' is-match';
  }
  if (t.head) c += ' is-head';
  if (t.open && t.kind === 'string') c += ' is-open';
  return c;
}

/** Spans for the source. Whitespace between tokens is kept as plain text. */
export function renderCode(src: string, toks: Tok[], m: Marks = {}): ReactNode[] {
  const out: ReactNode[] = [];
  let pos = 0;
  let anchorDone = m.anchor == null;
  let errorDone = m.error == null;
  const plain = (from: number, to: number) => {
    // A gap may hold the anchor or an error position: split around them.
    let at = from;
    const cuts: { off: number; node: ReactNode }[] = [];
    if (!anchorDone && m.anchor! >= from && m.anchor! < to) {
      cuts.push({ off: m.anchor!, node: <span key={'a' + m.anchor} ref={m.anchorRef} className="cf-anchor" /> });
      anchorDone = true;
    }
    if (!errorDone && m.error! >= from && m.error! < to) {
      cuts.push({ off: m.error!, node: <span key={'e' + m.error} className="cf-err-at" /> });
      errorDone = true;
    }
    cuts.sort((a, b) => a.off - b.off);
    for (const c of cuts) {
      if (c.off > at) out.push(src.slice(at, c.off));
      out.push(c.node);
      at = c.off;
    }
    if (to > at) out.push(src.slice(at, to));
  };
  toks.forEach((t, i) => {
    if (t.start > pos) plain(pos, t.start);
    const c = cls(t, i, m) + (!errorDone && m.error! >= t.start && m.error! < t.end ? ((errorDone = true), ' cf-err') : '');
    if (!anchorDone && m.anchor! >= t.start && m.anchor! < t.end) {
      anchorDone = true;
      if (m.anchor! > t.start) out.push(<span key={i + 'a'} className={c}>{src.slice(t.start, m.anchor!)}</span>);
      out.push(<span key={i + 'm'} ref={m.anchorRef} className="cf-anchor" />);
      out.push(<span key={i} className={c} data-t={i}>{src.slice(m.anchor!, t.end)}</span>);
    } else {
      out.push(<span key={i} className={c} data-t={i}>{src.slice(t.start, t.end)}</span>);
    }
    pos = t.end;
  });
  if (pos < src.length) plain(pos, src.length);
  if (!anchorDone) out.push(<span key="anchor" ref={m.anchorRef} className="cf-anchor" />);
  if (!errorDone) out.push(<span key="err" className="cf-err-at" />);
  return out;
}
