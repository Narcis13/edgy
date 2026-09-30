// Fan-out of live events to everyone watching a document.

import type { Actor, Op } from '../core/types';
import type { Message } from './store';

export type DocEvent =
  | { type: 'hello'; v: number }
  | { type: 'ops'; v: number; ts: number; actor: Actor; ops: Op[]; touched: string[]; client?: string; batch?: string }
  | { type: 'message'; message: Message }
  | { type: 'presence'; actor: Actor; state: 'reading' | 'editing' | 'listening' | 'idle'; ts: number }
  | { type: 'data'; collection: string }
  | { type: 'deleted' };

type Listener = (e: DocEvent) => void;

export class Hub {
  private rooms = new Map<string, Set<Listener>>();

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
