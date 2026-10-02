// How a document becomes a slide.
//
// It is laid out at its own width (the width it was designed at), or at the
// screen's when the screen is narrower, so a phone gets the phone layout and
// nothing is ever wider than the screen. Then it is scaled: up to fill a big
// screen (at most MAX_UP), down to fit the height while it stays readable (at
// least MIN_DOWN, or MIN_DOWN_PHONE on a phone). A document that would need more shrinking than that keeps
// a readable size and scrolls inside its slide.

export const MAX_UP = 1.5;
export const MIN_DOWN = 0.62;
/** On a phone text is small already: shrink less, scroll sooner. */
export const MIN_DOWN_PHONE = 0.8;

export interface Fit {
  /** The width the document is laid out at, in CSS pixels before scaling. */
  width: number;
  scale: number;
  /** Taller than the slide even at MIN_DOWN: it scrolls. */
  scrolls: boolean;
}

/**
 * `frame`: the room the slide has (after its margins); `design`: the
 * document's own width; `height`: its height when laid out at `width`
 * (unknown on the first pass: lay out, measure, call again).
 */
export function fitSlide(frame: { w: number; h: number }, design: number, height?: number): Fit {
  const least = frame.w < 600 ? MIN_DOWN_PHONE : MIN_DOWN;
  const width = Math.max(200, Math.min(design, frame.w));
  if (!height) return { width, scale: 1, scrolls: false };
  const byWidth = frame.w / width;
  const byHeight = frame.h / height;
  const fits = Math.min(byWidth, byHeight);
  if (fits >= 1) return { width, scale: Math.min(MAX_UP, fits), scrolls: false };
  if (byHeight >= least) return { width, scale: Math.min(byWidth, byHeight), scrolls: false };
  return { width, scale: Math.min(1, byWidth), scrolls: true };
}
