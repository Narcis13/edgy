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
  | { type: 'unshared'; token: string };

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
      if (!room!.size) this.rooms.delete(docId);
    };
  }

  publish(docId: string, e: DocEvent): void {
    for (const fn of [...(this.rooms.get(docId) ?? [])]) fn(e);
  }

  /** Data belongs to no single document, so everyone hears about it. */
  publishAll(e: DocEvent): void {
    for (const id of [...this.rooms.keys()]) this.publish(id, e);
  }

  /** An agent is waiting on this document; call the returned function when it stops. */
  listen(docId: string): () => void {
    const e = this.ears.get(docId) ?? { waiting: 0, at: 0 };
    this.ears.set(docId, e);
    e.waiting++;
    e.at = Date.now();
    return () => {
      e.waiting--;
      e.at = Date.now();
    };
  }

  /** Whether an agent is listening on this document (or on any) now or did in the last half minute (an agent loops on edgy_listen). */
  listening(docId?: string): boolean {
    const near = (e: { waiting: number; at: number }) => e.waiting > 0 || Date.now() - e.at < LISTEN_GRACE;
    if (docId) {
      const e = this.ears.get(docId);
      return !!e && near(e);
    }
    return [...this.ears.values()].some(near);
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
