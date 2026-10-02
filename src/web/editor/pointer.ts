// Clicks and double-clicks on cells in Live, turned into events.
//
// The rule: a cell that handles dblclick waits a moment after a single click
// to see whether a second follows; a double-click then runs only dblclick. A
// cell without a dblclick handler runs click at once, on every click.

/** How long a single click waits for a second one, when the cell also handles dblclick. */
export const DOUBLE_WAIT = 250;

type Timers = { set: (fn: () => void, ms: number) => unknown; clear: (h: unknown) => void };

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export class ClickGate {
  private pending = new Map<string, unknown>();
  constructor(private timers: Timers = realTimers, readonly wait = DOUBLE_WAIT) {}

  /**
   * A click arrived on `key` (a cell, or a cell's row). `detail` counts the
   * clicks in a row, as the browser does: 1, then 2 for the second of a double.
   */
  press(key: string, detail: number, hasDouble: boolean, click: () => void, double: () => void): void {
    if (!hasDouble) return click();
    const waiting = this.pending.get(key);
    if (waiting !== undefined) {
      this.timers.clear(waiting);
      this.pending.delete(key);
    }
    if (detail >= 2) {
      if (detail === 2) double();
      return;
    }
    this.pending.set(key, this.timers.set(() => {
      this.pending.delete(key);
      click();
    }, this.wait));
  }
}

export const clickGate = new ClickGate();

const PART = Symbol('edgy.part');

/** A kind that knows what part of it was clicked (a diagram's shape) says so on the event, before it reaches the cell. */
export function markPart(e: { nativeEvent: Event }, part: Record<string, unknown>): void {
  (e.nativeEvent as unknown as Record<symbol, unknown>)[PART] = part;
}

/**
 * What was clicked inside a cell: a part marked by its kind, or the position
 * of a table row or list item (`data-ev-index`).
 */
export function partOf(e: { nativeEvent: Event; target: EventTarget | null }, cellEl: Element): { index?: number; part?: Record<string, unknown> } {
  const marked = (e.nativeEvent as unknown as Record<symbol, unknown>)[PART] as Record<string, unknown> | undefined;
  if (marked) return { part: marked };
  const t = e.target instanceof Element ? e.target.closest('[data-ev-index]') : null;
  if (t && cellEl.contains(t)) {
    const i = Number(t.getAttribute('data-ev-index'));
    if (Number.isInteger(i)) return { index: i };
  }
  return {};
}
