// Share a document by link: a "can view" link and a "can edit" link, each on
// or off. Turning one off is for good; turning it on again makes a new link.

import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Eye, Link2, Pencil } from 'lucide-react';
import { type ShareLink, api } from '../lib/api';

const KINDS = [
  { access: 'view', icon: Eye, label: 'Can view', about: 'They can try inputs and buttons; nothing they do is saved.' },
  { access: 'edit', icon: Pencil, label: 'Can edit', about: 'What they change is saved and shows up for you as it happens.' },
] as const;

export function ShareDialog({ id, title, onClose, onChange }: { id: string; title: string; onClose: () => void; onChange?: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [links, setLinks] = useState<ShareLink[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    void api<ShareLink[]>('GET', `/api/docs/${id}/shares`).then(setLinks).catch((e) => setError(e.message));
  }, [id]);

  const turn = async (access: 'view' | 'edit', on: boolean) => {
    setBusy(access);
    setError(null);
    try {
      const link = links?.find((l) => l.access === access);
      if (on) await api('POST', `/api/docs/${id}/shares`, { access });
      else if (link) await api('DELETE', `/api/shares/${link.token}`);
      setLinks(await api<ShareLink[]>('GET', `/api/docs/${id}/shares`));
      onChange?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.');
    } finally {
      setBusy(null);
    }
  };
  const copy = async (link: ShareLink) => {
    try {
      await navigator.clipboard.writeText(link.url);
    } catch {
      // No clipboard (an insecure page): select the text so it can be copied by hand.
      document.querySelector<HTMLInputElement>(`#share-${link.access}`)?.select();
    }
    setCopied(link.access);
    setTimeout(() => setCopied(null), 1600);
  };

  return (
    <dialog ref={ref} className="dialog share-dialog" aria-labelledby="share-title" onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
      <div className="dialog-body">
        <h2 id="share-title"><Link2 size={18} /> Share “{title}”</h2>
        <p className="dialog-about">Whoever has a link sees this document in Live: no editor, and no way to your other documents.</p>
        {KINDS.map((k) => {
          const link = links?.find((l) => l.access === k.access);
          const Icon = k.icon;
          return (
            <section key={k.access} className="share-row" aria-label={k.label}>
              <div className="share-head">
                <span className="share-kind"><Icon size={15} /> {k.label}</span>
                <button className={link ? 'btn ghost small' : 'btn soft small'} disabled={!links || busy === k.access} onClick={() => void turn(k.access, !link)}>
                  {link ? 'Turn off' : 'Make a link'}
                </button>
              </div>
              <p className="share-about">{k.about}</p>
              {link && (
                <div className="share-link">
                  <input id={`share-${k.access}`} readOnly value={link.url} aria-label={`${k.label} link`} onFocus={(e) => e.currentTarget.select()} />
                  <button className="btn solid small" onClick={() => void copy(link)}>{copied === k.access ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}</button>
                </div>
              )}
            </section>
          );
        })}
        {error && <p className="dialog-error">{error}</p>}
        <p className="dialog-note">edgy runs on this computer, so a link opens for others once edgy is hosted where they can reach it.</p>
        <div className="dialog-actions">
          <button className="btn solid" onClick={() => ref.current?.close()}>Done</button>
        </div>
      </div>
    </dialog>
  );
}
