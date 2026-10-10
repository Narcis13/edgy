// The sign-in and sign-up pages: one card, one form, two modes.

import { useEffect, useId, useRef, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { Logo } from '../pages/Logo';
import './account.css';
import { refreshMe, useMe } from './me';
import { signInAddress } from './paths';

/** "Too many tries. Wait 12 seconds and try again." for a given count, so it can tick down. */
export const waitText = (n: number) => `Too many tries. Wait ${n} ${n === 1 ? 'second' : 'seconds'} and try again.`;

export function SignIn({ mode, next, navigate }: { mode: 'signin' | 'signup'; next: string; navigate: (p: string, o?: { replace?: boolean }) => void }) {
  const { me, via, auth } = useMe();
  const up = mode === 'signup';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const first = useRef<HTMLInputElement>(null);
  const pw = useRef<HTMLInputElement>(null);
  const errorId = useId();

  // The first field is ready to type in, and a switch between the two modes starts clean.
  useEffect(() => { first.current?.focus(); setError(null); setPassword(''); }, [mode]);

  // Too many tries: the button waits, counting down.
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => {
      setWait(wait - 1);
      if (wait - 1 <= 0) setError(null);
    }, 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || wait > 0) return;
    setBusy(true);
    setError(null);
    try {
      await api(
        'POST',
        up ? '/api/auth/signup' : '/api/auth/signin',
        up ? { email: email.trim(), password, ...(name.trim() ? { name: name.trim() } : {}) } : { email: email.trim(), password },
      );
      await refreshMe();
      navigate(next, { replace: true });
    } catch (err) {
      setPassword('');
      pw.current?.focus();
      if (err instanceof ApiError && err.status === 429) {
        const n = Number((/(\d+)/.exec(err.message) ?? [])[1]) || 10;
        setWait(n);
        setError(waitText(n));
      } else setError(err instanceof Error ? err.message : 'That did not work. Try again.');
      setBusy(false);
    }
  };

  // This machine is already the local account when no session is set.
  const asLocal = async () => {
    setBusy(true);
    try {
      if (via === 'session') await api('POST', '/api/auth/signout');
      await refreshMe();
    } catch { /* the page it goes to says what is wrong */ }
    navigate(next, { replace: true });
  };
  const local = auth === 'local' && me?.local ? me : null;

  return (
    <div className="auth-page">
      <main className="auth-card">
        <a className="auth-logo" href="/" onClick={(e) => { e.preventDefault(); navigate('/'); }} aria-label="edgy"><Logo size={26} /></a>
        <h1>{up ? 'Create an account' : 'Sign in'}</h1>
        <form onSubmit={(e) => void submit(e)} aria-describedby={error ? errorId : undefined}>
          {up && (
            <label className="auth-field">
              <span>Name <small>optional</small></span>
              <input ref={first} className="text-field" name="name" type="text" autoComplete="name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
          )}
          <label className="auth-field">
            <span>Email</span>
            <input
              ref={up ? undefined : first}
              className="text-field"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="auth-field">
            <span>Password {up && <small>at least 8 characters</small>}</span>
            <input
              ref={pw}
              className="text-field"
              name="password"
              type="password"
              autoComplete={up ? 'new-password' : 'current-password'}
              required
              minLength={up ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <div id={errorId} className="auth-error" role="alert">{error}</div>
          <button type="submit" className="btn solid auth-submit" disabled={busy || wait > 0}>
            {busy ? (up ? 'Creating…' : 'Signing in…') : wait > 0 ? `Wait ${wait}s` : up ? 'Create account' : 'Sign in'}
          </button>
        </form>
        <p className="auth-switch">
          {up ? 'Have an account? ' : 'New here? '}
          <a href={signInAddress(next, up ? 'signin' : 'signup')} onClick={(e) => { e.preventDefault(); navigate(signInAddress(next, up ? 'signin' : 'signup'), { replace: true }); }}>
            {up ? 'Sign in' : 'Create an account'}
          </a>
        </p>
        {local && !up && (
          <div className="auth-local">
            <button type="button" className="btn ghost auth-submit" disabled={busy} onClick={() => void asLocal()}>Continue as {local.name}</button>
            <p>This computer needs no sign-in.</p>
          </div>
        )}
      </main>
    </div>
  );
}
