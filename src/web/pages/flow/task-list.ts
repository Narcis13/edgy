// The Tasks view's rules, kept out of the component so they can be tested:
// which tasks are shown, in which group, in which order.

import { type Bucket, type FlowItem, BUCKETS, bucketOf, dayPart } from '../../../core/flow';

export interface TaskGroup {
  bucket: Bucket;
  label: string;
  items: FlowItem[];
}

/** The day a task belongs to: its due day, or the day of its start when it only has a time. */
export const dayOfTask = (item: FlowItem): string | null => item.due ?? (item.start ? dayPart(item.start) : null);

/** Whether a query (words, any order, any case) is in a task's text, body or tags. */
export function matchesTask(item: FlowItem, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [item.text, item.body, ...item.tags, ...item.tags.map((t) => '#' + t)].join('\n').toLowerCase();
  return words.every((w) => hay.includes(w));
}

/** Soonest due first (no day last), then the higher priority, then the most recently touched. */
export function byDue(a: FlowItem, b: FlowItem): number {
  const da = dayOfTask(a);
  const db = dayOfTask(b);
  if (da !== db) return da === null ? 1 : db === null ? -1 : da < db ? -1 : 1;
  return b.priority - a.priority || b.updated - a.updated;
}

/** The most recently finished first. */
export const byDoneAt = (a: FlowItem, b: FlowItem): number => (b.doneAt ?? b.updated) - (a.doneAt ?? a.updated);

/** The tasks that match the query, in their groups, in the order the groups are shown; empty groups left out. */
export function groupTasks(items: FlowItem[], today: string, query = ''): TaskGroup[] {
  const rows = items.filter((i) => i.kind === 'task' && matchesTask(i, query));
  return BUCKETS.map((b) => ({
    bucket: b.id,
    label: b.label,
    items: rows.filter((i) => bucketOf(i, today) === b.id).sort(b.id === 'done' ? byDoneAt : byDue),
  })).filter((g) => g.items.length > 0);
}

/** How many tasks are open and how many done. */
export function countTasks(items: FlowItem[]): { open: number; done: number } {
  let open = 0;
  let done = 0;
  for (const i of items) {
    if (i.kind !== 'task') continue;
    if (i.done) done++;
    else open++;
  }
  return { open, done };
}

/**
 * What a date input's value means as a due day: a day, null for cleared, or
 * undefined while it cannot be used yet (a date input reports 0002-… on the way
 * to typing a year).
 */
export function dayValue(value: string): string | null | undefined {
  if (!value) return null;
  const m = /^(\d{4})-\d{2}-\d{2}$/.exec(value);
  return m && Number(m[1]) >= 1900 ? value : undefined;
}
