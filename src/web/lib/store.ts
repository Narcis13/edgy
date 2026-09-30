import { useSyncExternalStore } from 'react';

export interface Store<T> {
  get(): T;
  set(next: T): void;
  subscribe(fn: () => void): () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const subs = new Set<() => void>();
  return {
    get: () => state,
    set: (next) => {
      if (next === state) return;
      state = next;
      for (const fn of [...subs]) fn();
    },
    subscribe: (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

/** Subscribe to one slice. The selector must return a stored reference or a primitive. */
export function useStore<T, R>(store: Store<T>, select: (s: T) => R): R {
  return useSyncExternalStore(store.subscribe, () => select(store.get()));
}
