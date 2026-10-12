// The Flow page's data: everything the account has, loaded once, kept fresh by
// the account's event stream (and by coming back to the tab), and changed
// through actions that show their effect at once and settle on the server's
// answer. Pure helpers the views share (which view the address names, the
// week's time blocks laid out side by side) live here too, so they can be tested.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type FlowBoard, type FlowComment, type FlowItem, type FlowReaction, type FlowState, type ItemKind, type Priority, type ReactionKind, type Who,
  dayPart, minutesOf, sameWho, timePart,
} from '../../../core/flow';
import { api } from '../../lib/api';
import { listen } from '../../lib/transport';

export type View = 'timeline' | 'board' | 'tasks' | 'calendar' | 'notes';
export const VIEWS: { id: View; label: string }[] = [
  { id: 'timeline', label: 'Timeline' },
  { id: 'board', label: 'Board' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'notes', label: 'Notes' },
];

/** The view the address names: /flow?view=board; anything else is the timeline. */
export function viewOf(search: string): View {
  const v = new URLSearchParams(search).get('view');
  return VIEWS.some((x) => x.id === v) ? (v as View) : 'timeline';
}

export const addressOf = (view: View): string => (view === 'timeline' ? '/flow' : `/flow?view=${view}`);

export interface Loaded extends FlowState {
  me: Who;
}

/** The fields a new item may be given beside its text (text is read as quick-add unless plain). */
export interface PostBody {
  text: string;
  kind?: ItemKind;
  body?: string;
  tags?: string[];
  status?: string;
  due?: string | null;
  start?: string | null;
  end?: string | null;
  priority?: Priority;
  pinned?: boolean;
  doc?: string | null;
  order?: number;
  plain?: boolean;
}

export type Fields = Partial<Pick<FlowItem, 'kind' | 'text' | 'body' | 'tags' | 'status' | 'done' | 'due' | 'start' | 'end' | 'priority' | 'pinned' | 'doc' | 'order'>>;

export interface FlowActions {
  post(body: PostBody): Promise<FlowItem>;
  /** Shown at once; the server's answer replaces it. */
  patch(id: string, fields: Fields): Promise<FlowItem>;
  remove(id: string): Promise<void>;
  comment(id: string, text: string): Promise<FlowComment>;
  uncomment(commentId: string): Promise<void>;
  /** Toggles, shown at once. */
  react(id: string, kind: ReactionKind): Promise<void>;
  clock(id: string, running: boolean): Promise<void>;
  /** Set the columns; with `rename`, the cards of that column follow its new name. */
  board(columns: string[], rename?: { from: string; to: string }): Promise<void>;
}

const uid = () => Math.random().toString(36).slice(2, 10);

/** An action whose failure the actions already answer by loading again: nothing left unhandled. */
export const quiet = (p: Promise<unknown>): void => {
  p.catch(() => undefined);
};

export function useFlow(): { data: Loaded | null; error: string | null; reload: () => Promise<void>; acts: FlowActions } {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const live = useRef<Loaded | null>(null);
  live.current = data;

  const reload = useCallback(async () => {
    const n = ++seq.current;
    try {
      const got = await api<Loaded>('GET', '/api/flow');
      if (n !== seq.current) return;
      setData(got);
      setError(null);
    } catch (e) {
      if (n !== seq.current) return;
      setError(e instanceof Error ? e.message : 'The Flow could not be loaded.');
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  // The account's stream: any Flow collection changed, by anyone, anywhere. Load again, a moment after the last word.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const es = listen('/api/flow/events');
    const soon = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void reload(), 150);
    };
    es.addEventListener('data', soon);
    // Connected (again, after the server came back): what was missed meanwhile.
    es.addEventListener('hello', soon);
    const onFocus = () => void reload();
    const onVisible = () => { if (document.visibilityState === 'visible') void reload(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      es.close();
      if (timer) clearTimeout(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [reload]);

  const acts = useMemo<FlowActions>(() => {
    const update = (fn: (d: Loaded) => Loaded) => setData((d) => (d ? fn(d) : d));
    const swap = (item: FlowItem) => update((d) => ({ ...d, items: d.items.some((i) => i.id === item.id) ? d.items.map((i) => (i.id === item.id ? item : i)) : [...d.items, item] }));
    const failed = async (e: unknown) => {
      await reload();
      throw e;
    };
    return {
      async post(body) {
        try {
          const item = await api<FlowItem>('POST', '/api/flow', body);
          swap(item);
          return item;
        } catch (e) { return failed(e); }
      },
      async patch(id, fields) {
        const now = Date.now();
        update((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...fields, updated: now } : i)) }));
        try {
          const item = await api<FlowItem>('PATCH', `/api/flow/${encodeURIComponent(id)}`, fields);
          swap(item);
          return item;
        } catch (e) { return failed(e); }
      },
      async remove(id) {
        update((d) => ({ ...d, items: d.items.filter((i) => i.id !== id), comments: d.comments.filter((c) => c.item !== id), reactions: d.reactions.filter((r) => r.item !== id) }));
        try {
          await api('DELETE', `/api/flow/${encodeURIComponent(id)}`);
        } catch (e) { return failed(e); }
      },
      async comment(id, text) {
        try {
          const c = await api<FlowComment>('POST', `/api/flow/${encodeURIComponent(id)}/comments`, { text });
          // The stream may have brought it already.
          update((d) => ({ ...d, comments: d.comments.some((x) => x.id === c.id) ? d.comments : [...d.comments, c], items: d.items.map((i) => (i.id === id ? { ...i, updated: Math.max(i.updated, c.posted) } : i)) }));
          return c;
        } catch (e) { return failed(e); }
      },
      async uncomment(commentId) {
        update((d) => ({ ...d, comments: d.comments.filter((c) => c.id !== commentId) }));
        try {
          await api('DELETE', `/api/flow/comments/${encodeURIComponent(commentId)}`);
        } catch (e) { return failed(e); }
      },
      async react(id, kind) {
        const me = live.current?.me;
        update((d) => {
          const mine = d.reactions.filter((r) => r.item === id && r.kind === kind && me && sameWho(r.by, me));
          const reactions = mine.length ? d.reactions.filter((r) => !mine.includes(r)) : [...d.reactions, { id: 'tmp' + uid(), at: Date.now(), item: id, kind, by: me ?? { kind: 'human', name: '' } }];
          return { ...d, reactions };
        });
        try {
          const r = await api<{ on: boolean; reactions: FlowReaction[] }>('POST', `/api/flow/${encodeURIComponent(id)}/react`, { kind });
          update((d) => ({ ...d, reactions: [...d.reactions.filter((x) => x.item !== id), ...r.reactions] }));
        } catch (e) { return failed(e); }
      },
      async clock(id, running) {
        try {
          await api<FlowItem>('POST', `/api/flow/${encodeURIComponent(id)}/clock`, { running });
          // Another clock may have stopped, with a comment: read everything again.
          await reload();
        } catch (e) { return failed(e); }
      },
      async board(columns, rename) {
        try {
          const b = await api<FlowBoard>('PUT', '/api/flow/board', { columns, ...(rename ? { rename } : {}) });
          update((d) => ({ ...d, board: b }));
          await reload();
        } catch (e) { return failed(e); }
      },
    };
  }, [reload]);

  return { data, error, reload, acts };
}

/** The time, ticking every so often (for "3 min ago" and the clock). */
export function useNow(every = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(t);
  }, [every]);
  return now;
}

export function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const fn = () => setOn(m.matches);
    fn();
    m.addEventListener('change', fn);
    return () => m.removeEventListener('change', fn);
  }, [query]);
  return on;
}

// ───────────────────────────── the week's blocks ─────────────────────────────

export interface Block {
  id: string;
  /** Minutes from midnight. */
  top: number;
  /** Minutes long (at least 20, so a short one can be read). */
  height: number;
  /** Which of `cols` side-by-side lanes it takes. */
  col: number;
  cols: number;
}

/** Timed items on one day as blocks; the ones that overlap share the width. */
export function layoutBlocks(items: FlowItem[], day: string): Block[] {
  const timed = items
    .filter((i) => i.start && timePart(i.start) && dayPart(i.start) === day)
    .map((i) => {
      const top = minutesOf(timePart(i.start)!);
      const endOnDay = i.end && dayPart(i.end) === day ? timePart(i.end) : null;
      const end = endOnDay ? minutesOf(endOnDay) : i.end && dayPart(i.end) > day ? 24 * 60 : top + 60;
      return { id: i.id, top, height: Math.max(20, end - top), col: 0, cols: 1 };
    })
    .sort((a, b) => a.top - b.top || b.height - a.height);
  // Clusters of blocks that touch each other, each laid out in lanes.
  let cluster: Block[] = [];
  let clusterEnd = -1;
  const lanes: number[] = [];
  const close = () => {
    const n = Math.max(1, ...cluster.map((b) => b.col + 1));
    for (const b of cluster) b.cols = n;
    cluster = [];
    lanes.length = 0;
  };
  for (const b of timed) {
    if (cluster.length && b.top >= clusterEnd) close();
    let col = lanes.findIndex((end) => end <= b.top);
    if (col < 0) col = lanes.length;
    lanes[col] = b.top + b.height;
    b.col = col;
    cluster.push(b);
    clusterEnd = Math.max(clusterEnd, b.top + b.height);
  }
  if (cluster.length) close();
  return timed;
}

/** The hour range a day's blocks need, within 0–24: 7 to 20 at least. */
export function hourRange(blocks: Block[]): [number, number] {
  let from = 7;
  let to = 20;
  for (const b of blocks) {
    from = Math.min(from, Math.floor(b.top / 60));
    to = Math.max(to, Math.ceil((b.top + b.height) / 60));
  }
  return [Math.max(0, from), Math.min(24, to)];
}
