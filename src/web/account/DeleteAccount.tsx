// The way out: delete the account and everything it owns, after saying exactly what goes.

import { useId, useState } from 'react';
import { api } from '../lib/api';
import { Modal } from '../pages/library/Dialogs';
import './account.css';
import { type Me, currentMe, refreshMe } from './me';
import { Section } from './Parts';

function DeleteDialog({ me, onDone, onClose }: { me: Me; onDone: () => void; onClose: () => void }) {
  const id = useId();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // An account with a password asks for it; one without asks for its name typed out.
  const needsPassword = me.hasPassword;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !text) return;
    setBusy(true);
    setError(null);
    try {
      await api('DELETE', '/api/me', needsPassword ? { password: text } : { confirm: text });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The account was not deleted.');
      setBusy(false);
    }
  };
  return (
    <Modal labelledBy={id} onClose={onClose}>
      <form className="lib-group" onSubmit={(e) => void submit(e)}>
        <h2 id={id}>Delete this account?</h2>
        <p className="dialog-about">Your documents, decks, records and keys are deleted. Your access to other people’s documents ends. Changes you made in their documents stay.</p>
        <p className="dialog-about"><b>This can’t be undone.</b></p>
        <label className="lib-field">
          <span>{needsPassword ? 'Your password' : <>Type the account name, <b>{me.name}</b>, to confirm</>}</span>
          <input
            data-autofocus
            className="text-field"
            name={needsPassword ? 'password' : 'confirm'}
            type={needsPassword ? 'password' : 'text'}
            autoComplete={needsPassword ? 'current-password' : 'off'}
            value={text}
            onChange={(e) => { setText(e.target.value); setError(null); }}
          />
        </label>
        {error && <p className="dialog-error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn danger" disabled={busy || !text}>{busy ? 'Deleting…' : 'Delete account'}</button>
        </div>
      </form>
    </Modal>
  );
}

export function DeleteAccount({ me, navigate }: { me: Me; navigate: (p: string, o?: { replace?: boolean }) => void }) {
  const [open, setOpen] = useState(false);
  const done = async () => {
      await refreshMe();
    // Local mode falls back to the local account (a fresh one); otherwise the sign-in page.
    navigate(currentMe().auth === 'local' ? '/' : '/signin', { replace: true });
  };
  return (
    <Section title="Delete account" danger about="This removes the account and everything it owns. It can’t be undone.">
      <div className="pf-actions">
        <button type="button" className="btn danger-ghost" onClick={() => setOpen(true)}>Delete account…</button>
      </div>
      {open && <DeleteDialog me={me} onDone={() => void done()} onClose={() => setOpen(false)} />}
    </Section>
  );
}
