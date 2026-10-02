// In-page dialogs: confirming a delete or an ungroup, naming a new deck.
// A real <dialog> opened with showModal: focus stays inside, Escape closes it,
// and nothing freezes the page the way window.confirm does.

import { useEffect, useId, useRef, useState } from 'react';
import { cx } from './text';

function Modal({ labelledBy, onClose, children, className }: { labelledBy: string; onClose: () => void; children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal();
    d.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    return () => d.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={cx('dialog', className)}
      aria-labelledby={labelledBy}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      // A click on the backdrop lands on the dialog itself, outside its inner box.
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
    >
      <div className="dialog-body">{children}</div>
    </dialog>
  );
}

export interface Confirm {
  title: string;
  body: string;
  action: string;
  run: () => Promise<void> | void;
}

export function ConfirmDialog({ confirm, onClose }: { confirm: Confirm; onClose: () => void }) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await confirm.run(); } finally { onClose(); }
  };
  return (
    <Modal labelledBy={id} onClose={onClose}>
      <h2 id={id}>{confirm.title}</h2>
      <p className="dialog-about">{confirm.body}</p>
      <div className="dialog-actions">
        <button type="button" className="btn ghost" data-autofocus onClick={onClose}>Cancel</button>
        <button type="button" className="btn danger" disabled={busy} onClick={() => void go()}>{confirm.action}</button>
      </div>
    </Modal>
  );
}

export function GroupDialog({ count, title: initial, onGroup, onClose }: {
  count: number;
  title: string;
  onGroup: (title: string, description: string) => Promise<void>;
  onClose: () => void;
}) {
  const id = useId();
  const [title, setTitle] = useState(initial);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => { titleRef.current?.select(); }, []);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await onGroup(title.trim() || initial, description.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The deck could not be made.');
      setBusy(false);
    }
  };
  return (
    <Modal labelledBy={id} onClose={onClose}>
      <form className="lib-group" onSubmit={(e) => void submit(e)}>
        <h2 id={id}>Group {count} documents into a deck</h2>
        <p className="dialog-about">A deck keeps documents together in this order and plays them one after another. The documents stay as they are.</p>
        <label className="lib-field">
          <span>Title</span>
          <input ref={titleRef} data-autofocus className="text-field" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="lib-field">
          <span>Description <small>optional</small></span>
          <textarea className="text-field" rows={3} value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} />
        </label>
        {error && <p className="dialog-error">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn solid" disabled={busy}>Group</button>
        </div>
      </form>
    </Modal>
  );
}
