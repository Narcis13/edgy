// The Notes view's pure parts: which notes show and in what order, what a new
// note posts, and what an edit changes. No React here, so they can be tested.

import type { FlowItem } from '../../../core/flow';
import type { Fields } from './state';

/** Whether every word of the query (any order, any case) is in the note's title, body or tags. */
export function matchesNote(item: FlowItem, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [item.text, item.body, ...item.tags.map((t) => '#' + t)].join('\n').toLowerCase();
  return words.every((w) => hay.includes(w));
}

/** The notes to show: only notes, narrowed by tag and words, pinned first, then the most recently changed. */
export function notesOf(items: FlowItem[], query = '', tag: string | null = null): FlowItem[] {
  return items
    .filter((i) => i.kind === 'note' && (!tag || i.tags.includes(tag)) && matchesNote(i, query))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated - a.updated || b.at - a.at);
}

/** A title is one line: pasted line breaks become spaces. */
export const oneLine = (s: string): string => s.replace(/\s*[\r\n]+\s*/g, ' ');

/** A body as it is kept: no blank lines before it, no spaces after it. */
export const tidyBody = (s: string): string => s.replace(/^(?:[ \t]*\r?\n)+/, '').replace(/\s+$/, '');

/** What to post for a new note (the quick-add text: title, then the body lines), or null when nothing is typed. */
export function newNoteText(title: string, body: string): string | null {
  const t = oneLine(title).trim();
  const b = tidyBody(body);
  if (!t && !b) return null;
  return t ? (b ? `${t}\n${b}` : t) : b;
}

/** What an in-place edit changes, or null when nothing did. An emptied title keeps the old one. */
export function editFields(item: FlowItem, title: string, body: string): Fields | null {
  const text = oneLine(title).trim() || item.text;
  const next = tidyBody(body);
  const fields: Fields = {};
  if (text !== item.text) fields.text = text;
  if (next !== item.body) fields.body = next;
  return Object.keys(fields).length ? fields : null;
}
