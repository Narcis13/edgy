// Durations as people write them, for timers and fetch refreshes.

/** Seconds as a number, or "500ms", "30s", "2m", "1h": milliseconds, or null when it isn't one. */
export function durationMs(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v * 1000 : null;
  if (typeof v !== 'string') return null;
  const m = /^\s*(\d+(?:\.\d+)?)\s*(ms|s|sec|secs|seconds?|m|min|mins|minutes?|h|hours?)?\s*$/i.exec(v);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = (m[2] ?? 's').toLowerCase();
  const ms = unit === 'ms' ? n : unit.startsWith('h') ? n * 3_600_000 : unit.startsWith('m') ? n * 60_000 : n * 1000;
  return ms > 0 ? ms : null;
}

/** "30 s", "2 min", for people. */
export function sayDuration(ms: number): string {
  if (ms % 3_600_000 === 0) return `${ms / 3_600_000} h`;
  if (ms % 60_000 === 0) return `${ms / 60_000} min`;
  if (ms % 1000 === 0) return `${ms / 1000} s`;
  return `${ms} ms`;
}

/** What an event may be called: a letter, then letters, digits, - or _. */
export const EVENT_NAME_RE = /^[A-Za-z][\w-]*$/;
