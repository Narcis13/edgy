// The library as the server arranges it, for one search, filter and sort.

import { useCallback, useEffect, useRef, useState } from 'react';
import { type Library, type LibraryEntry, api } from '../../lib/api';
import type { Filter, Scope, Sort } from './text';

/**
 * Entries that did not change keep their old object, so a memoised card only
 * redraws when its own entry did (a reload after one change touches one card).
 */
function reuse(prev: Library | null, next: Library): Library {
  if (!prev) return next;
  const old = new Map<string, { e: LibraryEntry; json: string }>();
  for (const e of [...prev.pinned, ...prev.rest]) old.set(e.id, { e, json: '' });
  const same = (e: LibraryEntry): LibraryEntry => {
    const o = old.get(e.id);
    if (!o || o.e.updatedAt !== e.updatedAt) return e;
    if (!o.json) o.json = JSON.stringify(o.e);
    return o.json === JSON.stringify(e) ? o.e : e;
  };
  return { ...next, pinned: next.pinned.map(same), rest: next.rest.map(same) };
}

export function useLibrary(q: string, filter: Filter, sort: Sort, scope: Scope) {
  const [data, setData] = useState<Library | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /** How many documents others have shared with me, for the tab. */
  const [sharedCount, setSharedCount] = useState<number | null>(null);
  const args = useRef({ q, filter, sort, scope });
  args.current = { q, filter, sort, scope };
  // Only the latest request may land: a slow answer to an older search must not replace a newer one.
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const n = ++seq.current;
    const { q, filter, sort, scope } = args.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ filter: scope === 'shared' ? 'all' : filter, sort, scope });
      if (q) params.set('q', q);
      const lib = await api<Library>('GET', `/api/library?${params}`);
      if (n !== seq.current || scope !== args.current.scope) return;
      if (scope === 'shared') setSharedCount(lib.total);
      setData((prev) => reuse(prev, lib));
      setError(null);
    } catch (e) {
      if (n === seq.current) setError(e instanceof Error ? e.message : 'The library could not be loaded.');
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, []);

  // Another tab is another list: show nothing of the old one while the new one comes.
  useEffect(() => { setData(null); }, [scope]);
  useEffect(() => { void reload(); }, [q, filter, sort, scope, reload]);

  // The other tab's count, so Shared with me says how many are waiting there.
  useEffect(() => {
    if (scope !== 'mine') return;
    void api<Library>('GET', '/api/library?scope=shared').then((l) => setSharedCount(l.total)).catch(() => undefined);
  }, [scope, data]);

  // Back from another tab or window: something may have changed there.
  useEffect(() => {
    const onFocus = () => void reload();
    const onVisible = () => { if (document.visibilityState === 'visible') void reload(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [reload]);

  return { data, setData, error, loading, reload, sharedCount };
}
