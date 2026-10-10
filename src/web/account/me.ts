// Who is signed in, for every page: asked once from /api/me, kept here, and
// told to whoever listens when it changes (a sign-in, a new name, signing out).

import { useEffect, useState } from 'react';
import { ApiError, api, onSignedOut } from '../lib/api';

export interface Me {
  id: string;
  name: string;
  color: string;
  initials: string;
  email: string | null;
  theme: 'light' | 'dark' | null;
  /** The account local mode signs in by itself. */
  local: boolean;
  hasPassword: boolean;
  createdAt: number;
}

export interface MeState {
  status: 'loading' | 'in' | 'out';
  me: Me | null;
  /** How this browser is signed in: a session cookie, or local mode (this machine). */
  via: 'session' | 'local' | 'key' | null;
  /** The server's mode: local (this machine needs no sign-in) or accounts. */
  auth: 'local' | 'accounts';
}

let state: MeState = { status: 'loading', me: null, via: null, auth: 'accounts' };
const listeners = new Set<(s: MeState) => void>();
let asking: Promise<void> | null = null;

function set(next: MeState) {
  state = next;
  for (const fn of [...listeners]) fn(state);
}

/** Ask the server who this is (again). */
export function refreshMe(): Promise<void> {
  asking = (async () => {
    try {
      // Health says whether this browser is signed in, so a signed-out page never asks for what it would be refused.
      const health = await api<{ auth?: MeState['auth']; signedIn?: boolean }>('GET', '/api/health');
      if (health.signedIn === false) {
        set({ status: 'out', me: null, via: null, auth: health.auth ?? 'accounts' });
        return;
      }
      const r = await api<{ user: Me; via: MeState['via']; auth: MeState['auth'] }>('GET', '/api/me');
      set({ status: 'in', me: r.user, via: r.via, auth: r.auth });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        const health = await api<{ auth?: MeState['auth'] }>('GET', '/api/health').catch(() => ({ auth: undefined }));
        set({ status: 'out', me: null, via: null, auth: health.auth ?? 'accounts' });
      } else set({ ...state, status: state.me ? 'in' : 'out' });
    }
  })();
  return asking;
}

/** The profile changed (a name, a colour, the theme): every page shows it. */
export function setMe(me: Me) {
  set({ ...state, me });
}

export function currentMe(): MeState {
  return state;
}

/** Who is signed in; asks the server the first time. */
export function useMe(): MeState {
  const [s, setS] = useState(state);
  useEffect(() => {
    listeners.add(setS);
    if (state.status === 'loading' && !asking) void refreshMe();
    setS(state);
    return () => void listeners.delete(setS);
  }, []);
  return s;
}

// A request answered "sign in first": the session ended (signed out elsewhere, a new password).
onSignedOut(() => {
  if (state.status !== 'out') set({ status: 'out', me: null, via: null, auth: state.auth });
});
