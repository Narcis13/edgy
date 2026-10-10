// API keys: what an agent (the MCP server, a script) signs in with. A new key is shown once.

import { useEffect, useRef, useState } from 'react';
import { Check, Copy, KeyRound } from 'lucide-react';
import { api, timeAgo } from '../lib/api';
import { type Confirm, ConfirmDialog } from '../pages/library/Dialogs';
import './account.css';
import { Section } from './Parts';

interface Key {
  id: string;
  name: string;
  prefix: string;
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
}

function Fresh({ made, onDone }: { made: Key & { key: string }; onDone: () => void }) {
  const field = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState<'yes' | 'select' | null>(null);
  useEffect(() => { field.current?.focus(); field.current?.select(); }, []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(made.key);
      setCopied('yes');
    } catch {
      // No clipboard here (an insecure page, a refused permission): select it so Ctrl+C does it.
      field.current?.focus();
      field.current?.select();
      setCopied('select');
    }
  };
  return (
    <div className="pf-fresh" role="group" aria-label={`New key ${made.name}`}>
      <p><b>{made.name}</b> is ready. Copy it now: it won’t be shown again.</p>
      <div className="pf-copy">
        <input ref={field} className="text-field mono" readOnly value={made.key} aria-label="The new key" onFocus={(e) => e.target.select()} />
        <button type="button" className="btn soft" onClick={() => void copy()}>
          {copied === 'yes' ? <Check size={15} /> : <Copy size={15} />} {copied === 'yes' ? 'Copied' : 'Copy'}
        </button>
      </div>
      {copied === 'select' && <p className="pf-hint" role="status">Your browser would not copy it. It is selected: press Ctrl+C (Cmd+C on a Mac).</p>}
      <p className="pf-hint">To give it to the MCP server, set these two next to each other in its settings:</p>
      <pre className="pf-env">{`EDGY_URL=${window.location.origin}\nEDGY_API_KEY=${made.key}`}</pre>
      <button type="button" className="btn ghost" onClick={onDone}>I have copied it</button>
    </div>
  );
}

export function Keys() {
  const [keys, setKeys] = useState<Key[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<(Key & { key: string }) | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const load = () => api<Key[]>('GET', '/api/me/keys').then((k) => setKeys(k)).catch((e) => setError(e instanceof Error ? e.message : 'The keys could not be loaded.'));
  useEffect(() => { void load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const k = await api<Key & { key: string }>('POST', '/api/me/keys', { name: name.trim() || 'Agent' });
      setMade(k);
      setName('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The key was not made.');
    }
    setBusy(false);
  };

  const revoke = (k: Key) => setConfirm({
    title: `Revoke “${k.name}”?`,
    body: 'Whatever uses this key stops working at once. This can’t be undone; make a new key to replace it.',
    action: 'Revoke',
    run: async () => {
      try {
        await api('DELETE', `/api/me/keys/${k.id}`);
        if (made?.id === k.id) setMade(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'The key was not revoked.');
      }
      await load();
    },
  });

  return (
    <Section title="API keys" about="An agent (the MCP server, a script) uses a key to act for you. It sees and changes only what you can.">
      <form className="pf-form pf-inline" onSubmit={(e) => void create(e)}>
        <label className="pf-field">
          <span>Name</span>
          <input className="text-field" name="key-name" maxLength={60} placeholder="Claude on my laptop" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button type="submit" className="btn solid" disabled={busy}>{busy ? 'Creating…' : 'Create key'}</button>
      </form>
      {error && <p className="pf-status is-error" role="alert">{error}</p>}
      {made && <Fresh made={made} onDone={() => setMade(null)} />}
      {keys && keys.length > 0 && (
        <ul className="pf-keys" aria-label="Your keys">
          {keys.map((k) => (
            <li key={k.id} className={k.revokedAt != null ? 'is-revoked' : ''}>
              <KeyRound size={16} aria-hidden />
              <div className="pf-key-main">
                <b>{k.name}</b>
                <code>{k.prefix}…</code>
                <span className="pf-key-when">
                  Created {timeAgo(k.createdAt)} · {k.lastUsedAt != null ? `used ${timeAgo(k.lastUsedAt)}` : 'never used'}
                </span>
              </div>
              {k.revokedAt != null
                ? <span className="badge">Revoked {timeAgo(k.revokedAt)}</span>
                : <button type="button" className="btn ghost small pf-revoke" onClick={() => revoke(k)} aria-label={`Revoke ${k.name}`}>Revoke</button>}
            </li>
          ))}
        </ul>
      )}
      {keys && !keys.length && <p className="pf-hint">No keys yet.</p>}
      {confirm && <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />}
    </Section>
  );
}
