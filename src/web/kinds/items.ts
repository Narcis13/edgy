// A list cell's stored items. Checklists store {text, done} records; other
// lists store plain strings.

import type { Json } from '../../core/types';
import { show } from '../../core/sx';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** What an item says: its text (or title or name), or the item written out. */
export function itemText(it: unknown): string {
  if (isRecord(it)) {
    const t = it.text ?? it.title ?? it.name ?? it.label;
    return t == null ? show(it) : typeof t === 'string' ? t : show(t);
  }
  return show(it);
}

export const isDone = (it: unknown): boolean => isRecord(it) && !!it.done && it.done !== 'false';

/** An item in the shape its list stores. */
export function asItem(it: unknown, type: string | undefined): Json {
  if (type === 'check') {
    if (isRecord(it)) return { ...(it as Record<string, Json>), text: itemText(it), done: isDone(it) };
    return { text: itemText(it), done: false };
  }
  return itemText(it);
}

/** A whole list in its stored shape, e.g. after its type changes. */
export const asItems = (items: unknown, type: string | undefined): Json[] =>
  (Array.isArray(items) ? items : []).map((it) => asItem(it, type));

export function withText(items: Json[], i: number, text: string, type: string | undefined): Json[] {
  const next = [...items];
  const it = next[i];
  next[i] = type === 'check' ? { ...(isRecord(it) ? (it as Record<string, Json>) : {}), text, done: isDone(it) } : text;
  return next;
}

export const toggled = (items: Json[], i: number): Json[] =>
  items.map((it, j) => (j === i ? { ...(isRecord(it) ? (it as Record<string, Json>) : { text: itemText(it) }), done: !isDone(it) } : it));

export function inserted(items: Json[], i: number, text: string, type: string | undefined): Json[] {
  const next = [...items];
  next.splice(Math.max(0, Math.min(i, next.length)), 0, asItem(text, type));
  return next;
}

export const removed = (items: Json[], i: number): Json[] => items.filter((_, j) => j !== i);

/** Move item `from` so it lands at index `to` of the result. */
export function moved(items: Json[], from: number, to: number): Json[] {
  const t = Math.max(0, Math.min(items.length - 1, to));
  if (from === t || from < 0 || from >= items.length) return items;
  const next = [...items];
  const [it] = next.splice(from, 1);
  next.splice(t, 0, it);
  return next;
}

export function progress(items: unknown[]): { done: number; total: number } {
  return { done: items.filter(isDone).length, total: items.length };
}
