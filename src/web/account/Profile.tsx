// Your profile: who you are, your password, your theme, your API keys, and the way out.
// Each section saves on its own and says so.

import { useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { api } from '../lib/api';
import { Shell } from '../pages/Home';
import './account.css';
import { Avatar } from './Avatar';
import { DeleteAccount } from './DeleteAccount';
import { Keys } from './Keys';
import { type Me, refreshMe, setMe, useMe } from './me';
import { Section, Status, useFlash } from './Parts';
import { saveTheme } from './profileTheme';

export const COLORS: [string, string][] = [
  ['#2563eb', 'Blue'], ['#7c3aed', 'Violet'], ['#db2777', 'Pink'], ['#dc2626', 'Red'], ['#ea580c', 'Orange'],
  ['#ca8a04', 'Gold'], ['#16a34a', 'Green'], ['#0d9488', 'Teal'], ['#0891b2', 'Cyan'], ['#4f46e5', 'Indigo'],
];

function You({ me }: { me: Me }) {
  const [name, setName] = useState(me.name);
  const [color, setColor] = useState(me.color);
  const [email, setEmail] = useState(me.email ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, flash] = useFlash();
  const swatches = COLORS.some(([c]) => c === color.toLowerCase()) ? COLORS : [[color, 'Current colour'] as [string, string], ...COLORS];
  const changed = name.trim() !== me.name || color.toLowerCase() !== me.color.toLowerCase() || email.trim().toLowerCase() !== (me.email ?? '');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !changed) return;
    setBusy(true);
    setError(null);
    const body: Record<string, string> = {};
    if (name.trim() !== me.name) body.name = name.trim();
    if (color.toLowerCase() !== me.color.toLowerCase()) body.color = color;
    if (email.trim().toLowerCase() !== (me.email ?? '')) body.email = email.trim();
    try {
      const r = await api<{ user: Me }>('PATCH', '/api/me', body);
      setMe(r.user);
      setName(r.user.name);
      setEmail(r.user.email ?? '');
      flash('Saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That was not saved.');
    }
    setBusy(false);
  };

  return (
    <Section title="You">
      <form className="pf-form" onSubmit={(e) => void save(e)} onChange={() => setError(null)}>
        <div className="pf-you">
          <Avatar name={name.trim() || me.name} color={color} size={64} title="Your avatar" />
          <label className="pf-field">
            <span>Display name</span>
            <input className="text-field" name="name" autoComplete="name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        </div>
        <fieldset className="pf-field">
          <legend>Colour</legend>
          <div className="pf-swatches">
            {swatches.map(([c, label]) => (
              <label key={c} className="pf-swatch" title={label}>
                <input type="radio" name="color" value={c} checked={c.toLowerCase() === color.toLowerCase()} onChange={() => setColor(c)} aria-label={label} />
                <span style={{ background: c }} aria-hidden />
              </label>
            ))}
          </div>
        </fieldset>
        <label className="pf-field">
          <span>Email</span>
          <input className="text-field" name="email" type="email" autoComplete="email" inputMode="email" value={email} placeholder={me.email ? undefined : 'Not set'} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <div className="pf-actions">
          <button type="submit" className="btn solid" disabled={busy || !changed}>{busy ? 'Saving…' : 'Save'}</button>
          <Status ok={ok} error={error} />
        </div>
      </form>
    </Section>
  );
}

function Password({ me }: { me: Me }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, flash] = useFlash();

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (next !== again) { setError('The two new passwords differ.'); return; }
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ ok: boolean; signedOut: number }>('POST', '/api/me/password', me.hasPassword ? { current, password: next } : { password: next });
      setCurrent(''); setNext(''); setAgain('');
      flash(r.signedOut > 0 ? `Password changed. ${r.signedOut === 1 ? '1 other session was' : `${r.signedOut} other sessions were`} signed out.` : 'Password changed.');
      await refreshMe();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The password was not changed.');
    }
    setBusy(false);
  };

  return (
    <Section title="Password" about="Changing it signs you out everywhere else. This browser stays signed in.">
      <form className="pf-form" onSubmit={(e) => void save(e)} onChange={() => setError(null)}>
        {/* Password managers want to know whose password this is. */}
        <input type="text" name="username" autoComplete="username" value={me.email ?? ''} readOnly hidden />
        {me.hasPassword && (
          <label className="pf-field">
            <span>Current password</span>
            <input className="text-field" name="current" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
          </label>
        )}
        <label className="pf-field">
          <span>New password <small>at least 8 characters</small></span>
          <input className="text-field" name="new" type="password" autoComplete="new-password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} />
        </label>
        <label className="pf-field">
          <span>New password again</span>
          <input className="text-field" name="again" type="password" autoComplete="new-password" required value={again} onChange={(e) => setAgain(e.target.value)} />
        </label>
        <div className="pf-actions">
          <button type="submit" className="btn solid" disabled={busy}>{busy ? 'Saving…' : me.hasPassword ? 'Change password' : 'Set password'}</button>
          <Status ok={ok} error={error} />
        </div>
      </form>
    </Section>
  );
}

const THEMES: ['light' | 'dark' | null, string, React.ReactNode][] = [
  ['light', 'Light', <Sun size={15} key="l" />],
  ['dark', 'Dark', <Moon size={15} key="d" />],
  [null, 'Same as the system', <Monitor size={15} key="s" />],
];

function ThemeChoice({ me }: { me: Me }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, flash] = useFlash();
  const choose = async (t: 'light' | 'dark' | null) => {
    if (busy || t === me.theme) return;
    setBusy(true);
    setError(null);
    try {
      await saveTheme(t);
      flash('Saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The theme was not saved.');
    }
    setBusy(false);
  };
  return (
    <Section title="Theme" about="Kept with your profile, so every browser you sign in on looks the same.">
      <fieldset className="pf-themes">
        <legend className="sr-only">Theme</legend>
        {THEMES.map(([t, label, icon]) => (
          <label key={label} className={'pf-theme' + (t === me.theme ? ' is-on' : '')}>
            <input type="radio" name="theme" checked={t === me.theme} disabled={busy} onChange={() => void choose(t)} />
            {icon}<span>{label}</span>
          </label>
        ))}
      </fieldset>
      <div className="pf-actions"><Status ok={ok} error={error} /></div>
    </Section>
  );
}

export function Profile({ navigate }: { navigate: (p: string) => void }) {
  const { me } = useMe();
  return (
    <Shell page={null} navigate={navigate}>
      <main className="profile">
        <h1>Profile</h1>
        {me ? (
          <>
            {/* Keyed by account: another account starts with its own fields. */}
            <You key={me.id} me={me} />
            <Password key={`p${me.id}`} me={me} />
            <ThemeChoice me={me} />
            <Keys />
            <DeleteAccount me={me} navigate={navigate} />
          </>
        ) : <p className="lib-loading">Loading…</p>}
      </main>
    </Shell>
  );
}
