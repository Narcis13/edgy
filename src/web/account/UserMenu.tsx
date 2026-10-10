// The signed-in person's avatar in a top bar, and their menu: profile, sign out.

import { useEffect, useRef, useState } from 'react';
import { LogIn, LogOut, UserRound } from 'lucide-react';
import { api } from '../lib/api';
import { Avatar } from './Avatar';
import './account.css';
import { currentMe, refreshMe, useMe } from './me';

/** End the session here, then show where that leaves this browser: the sign-in page, or in local mode the library. */
export async function signOut(navigate: (p: string, o?: { replace?: boolean }) => void): Promise<void> {
  try { await api('POST', '/api/auth/signout'); } catch { /* already out */ }
  await refreshMe();
  navigate(currentMe().auth === 'local' ? '/' : '/signin', { replace: true });
}

export function UserMenu({ navigate }: { navigate: (p: string) => void }) {
  const { me, via, auth } = useMe();
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>('button')?.focus();
    const away = (e: PointerEvent) => {
      if (!list.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setOpen(false);
      btn.current?.focus();
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!me) return null;
  // In local mode with no session this machine is the local account: nothing to sign out of.
  const here = auth === 'local' && via === 'local';
  const go = (path: string) => () => { setOpen(false); navigate(path); };
  const leave = () => {
    setOpen(false);
    void signOut(navigate);
  };
  const onListKey = (e: React.KeyboardEvent) => {
    const all = [...(list.current?.querySelectorAll<HTMLElement>('button') ?? [])];
    const i = all.indexOf(document.activeElement as HTMLElement);
    const to = (n: number) => { e.preventDefault(); all[(n + all.length) % all.length]?.focus(); };
    if (e.key === 'ArrowDown') to(i + 1);
    else if (e.key === 'ArrowUp') to(i - 1);
    else if (e.key === 'Tab') setOpen(false);
  };

  return (
    <div className="um">
      <button
        ref={btn}
        type="button"
        className="um-btn"
        aria-label={`Account: ${me.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={me.name}
        onClick={() => setOpen(!open)}
      >
        <Avatar name={me.name} color={me.color} size={28} title={me.name} />
      </button>
      {open && (
        <div ref={list} className="um-list" role="menu" aria-label="Account" onKeyDown={onListKey}>
          <div className="um-who">
            <Avatar name={me.name} color={me.color} size={36} title={me.name} />
            <div>
              <b>{me.name}</b>
              <span>{me.local && !me.email ? 'Local account, no sign-in needed' : me.email ?? 'No email yet'}</span>
            </div>
          </div>
          <button type="button" role="menuitem" onClick={go('/profile')}><UserRound size={15} /> Profile</button>
          {here ? (
            <button type="button" role="menuitem" onClick={go('/signin')}><LogIn size={15} /> Sign in as someone else</button>
          ) : (
            <button type="button" role="menuitem" onClick={leave}><LogOut size={15} /> Sign out</button>
          )}
        </div>
      )}
    </div>
  );
}
