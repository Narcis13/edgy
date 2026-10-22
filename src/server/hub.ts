// Fan-out of live events to everyone watching a document.

import type { Actor, Op } from '../core/types';
import type { TraceEntry } from '../core/events';
import type { FetchState } from '../core/sx';
import type { AgentRequest } from './compose';
import type { Message } from './store';

export type DocEvent =
  | { type: 'hello'; v: number }
  | { type: 'ops'; v: number; ts: number; actor: Actor; ops: Op[]; touched: string[]; client?: string; batch?: string }
  | { type: 'message'; message: Message }
  | { type: 'presence'; actor: Actor; state: 'reading' | 'editing' | 'listening' | 'idle'; ts: number }
  | { type: 'data'; collection: string }
  | { type: 'compose'; request: AgentRequest }
  /** Handlers the server ran (timers, fetches, agents' changes) and what they did. */
  | { type: 'trace'; trace: TraceEntry[] }
  /** A fetch cell started loading, got its answer or failed. */
  | { type: 'fetch'; cell: string; state: FetchState }
  | { type: 'deleted' }
  /** A share link was turned off; whoever opened the document with it is told. */
  | { type: 'unshared'; token: string }
  /** Who has the document open now, and the cell each has selected. */
  | { type: 'people'; people: Present[] }
  /** This stream's access changed (a new role), or ended (revoked: it closes after this). */
  | { type: 'access'; role: string }
  | { type: 'revoked'; why: 'access' | 'signedout' | 'deleted' }
  /** The document was replaced (sync rewrote its history): load it again. */
  | { type: 'reset'; v: number };

/** Someone with the document open: one entry per person, however many tabs. */
export interface Present {
  id: string;
  name: string;
  color: string;
  kind: 'human' | 'agent';
  /** The cell they have selected in Edit, or null. */
  selected: string | null;
  mode: string;
  /** Their browser session ids (so a tab can tell itself apart from the person's other tabs). */
  clients: string[];
}

type Listener = (e: DocEvent) => void;

/** How long an agent counts as present after it last listened. */
const LISTEN_GRACE = 30_000;

export class Hub {
  private rooms = new Map<string, Set<Listener>>();
  private ears = new Map<string, { waiting: number; at: number }>();

  subscribe(docId: string, fn: Listener): () => void {
    let room = this.rooms.get(docId);
    if (!room) this.rooms.set(docId, (room = new Set()));
    room.add(fn);
    return () => {
      room!.delete(fn);
      // Called twice (a wait that ended and was then aborted), it must not take away a newer room for the same document.
      if (!room!.size && this.rooms.get(docId) === room) this.rooms.delete(docId);
    };
  }

  publish(docId: string, e: DocEvent): void {
    for (const fn of [...(this.rooms.get(docId) ?? [])]) {
      // One listener that throws (a stream gone bad) must not stop the others hearing it, nor reach a timer that would end the process.
      try {
        fn(e);
      } catch (err) {
        console.error('edgy: a listener failed on', e.type, err);
      }
    }
  }

  /** The documents someone is watching now. */
  roomIds(): string[] {
    return [...this.rooms.keys()];
  }

  /** An agent acting for this account is waiting on this document; call the returned function when it stops. */
  listen(docId: string, account: string | null): () => void {
    const key = `${docId}\n${account ?? ''}`;
    const e = this.ears.get(key) ?? { waiting: 0, at: 0 };
    this.ears.set(key, e);
    e.waiting++;
    e.at = Date.now();
    return () => {
      e.waiting--;
      e.at = Date.now();
      // Documents no agent has listened on for a while are forgotten, so the list doesn't grow with every document ever listened on.
      for (const [id, x] of this.ears) if (x.waiting <= 0 && e.at - x.at > LISTEN_GRACE) this.ears.delete(id);
    };
  }

  /**
   * Whether an agent acting for this account is listening on this document (or on any) now or did in the last half
   * minute (an agent loops on edgy_listen). Someone else's agent on the same document doesn't count: it won't be asked.
   */
  listening(docId: string | undefined, account: string | null): boolean {
    const near = (e: { waiting: number; at: number }) => e.waiting > 0 || Date.now() - e.at < LISTEN_GRACE;
    if (docId) {
      const e = this.ears.get(`${docId}\n${account ?? ''}`);
      return !!e && near(e);
    }
    return [...this.ears].some(([k, e]) => k.endsWith(`\n${account ?? ''}`) && near(e));
  }

  /** Resolve with the first matching event, or null after the timeout. */
  waitFor(docId: string, match: (e: DocEvent) => boolean, ms: number, signal?: AbortSignal): Promise<DocEvent | null> {
    return new Promise((resolve) => {
      const done = (e: DocEvent | null) => {
        clearTimeout(timer);
        off();
        resolve(e);
      };
      const off = this.subscribe(docId, (e) => { if (match(e)) done(e); });
      const timer = setTimeout(() => done(null), ms);
      signal?.addEventListener('abort', () => done(null), { once: true });
    });
  }
}
