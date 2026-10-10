// Whether this machine's changes have reached the cloud: a small badge in the
// top bars. Synced, syncing (changes waiting), offline (the cloud didn't
// answer; changes wait here) or off (no cloud configured: this machine only).
// A click syncs now.

import { useEffect, useState } from 'react';
import { Cloud, CloudOff, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import './sync.css';

export interface SyncStatus {
  state: 'off' | 'synced' | 'syncing' | 'offline' | 'error';
  pending: number;
  lastSyncAt: number | null;
  error: string | null;
}

/** What the badge says, for a state. */
export function describeSync(s: SyncStatus): { label: string; title: string } {
  const waiting = s.pending === 1 ? '1 change' : `${s.pending} changes`;
  switch (s.state) {
    case 'off': return { label: 'Sync off', title: 'Sync is off: documents stay on this machine. Set TURSO_URL and TURSO_AUTH_TOKEN to sync them.' };
    case 'synced': return { label: 'Synced', title: 'Every change here is in the cloud. Click to sync now.' };
    case 'syncing': return { label: 'Syncing', title: s.pending ? `${waiting} on the way to the cloud.` : 'Syncing with the cloud.' };
    case 'error': return { label: 'Sync stopped', title: `The cloud refused something: ${s.error ?? 'see the server log'}. Changes stay here. Click to try again.` };
    case 'offline': return { label: 'Offline', title: `The cloud can't be reached${s.pending ? `; ${waiting} wait here and go when it answers` : ''}. Click to try now.` };
  }
}

let shared: SyncStatus | null = null;
const listeners = new Set<(s: SyncStatus) => void>();
let timer: ReturnType<typeof setInterval> | null = null;

async function poll(now = false): Promise<void> {
  try {
    shared = await api<SyncStatus>(now ? 'POST' : 'GET', '/api/sync');
    for (const fn of [...listeners]) fn(shared);
  } catch { /* signed out, or the server is away: keep what was shown */ }
}

/** The sync status, asked every few seconds while some badge is on screen. */
export function useSync(): [SyncStatus | null, () => void] {
  const [s, setS] = useState(shared);
  useEffect(() => {
    listeners.add(setS);
    if (!timer) {
      void poll();
      timer = setInterval(() => { if (document.visibilityState === 'visible') void poll(); }, 4000);
    }
    return () => {
      listeners.delete(setS);
      if (!listeners.size && timer) {
        clearInterval(timer);
        timer = null;
      }
    };
  }, []);
  return [s, () => void poll(true)];
}

export function SyncBadge({ compact }: { compact?: boolean }) {
  const [s, now] = useSync();
  if (!s) return null;
  const { label, title } = describeSync(s);
  const Icon = s.state === 'off' || s.state === 'offline' || s.state === 'error' ? CloudOff : s.state === 'syncing' ? RefreshCw : Cloud;
  return (
    <button type="button" className={`sync-badge is-${s.state}`} title={title} aria-label={`${label}. ${title}`} onClick={now} disabled={s.state === 'off'}>
      <Icon size={14} className={s.state === 'syncing' ? 'spin' : undefined} />
      {!compact && <span>{label}{s.state !== 'synced' && s.state !== 'off' && s.pending ? ` · ${s.pending}` : ''}</span>}
    </button>
  );
}
