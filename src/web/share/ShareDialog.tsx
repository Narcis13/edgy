// Share a document: with people who have an account (they open it from their
// own list, as editors or viewers), and by link: a "can view" link and a "can
// edit" link, each on or off. Turning a link off is for good; turning it on
// again makes a new link.

import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Check, Copy, Eye, Link2, Pencil, UserPlus, Users } from 'lucide-react';
import { type ShareLink, api } from '../lib/api';
import { Avatar } from '../account/Avatar';
import { currentMe } from '../account/me';
import type { Member, Role } from '../editor/people';
import './people.css';

const KINDS = [
  { access: 'view', icon: Eye, label: 'Can view', about: 'They can try inputs and buttons; nothing they do is saved.' },
  { access: 'edit', icon: Pencil, label: 'Can edit', about: 'What they change is saved and shows up for you as it happens.' },
] as const;

const ROLES = [
  { role: 'viewer', label: 'Can view' },
  { role: 'editor', label: 'Can edit' },
] as const;

interface People {
  people: Member[];
  role: Role;
}

export function ShareDialog({ id, title, onClose, onChange }: { id: string; title: string; onClose: () => void; onChange?: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [links, setLinks] = useState<ShareLink[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // null until the server has said; `role` is the signed-in person's own on this document.
  const [people, setPeople] = useState<Member[] | null>(null);
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    let gone = false;
    void (async () => {
      let mine: Role = 'owner';
      try {
        const r = await api<People>('GET', `/api/docs/${id}/people`);
        if (gone) return;
        setPeople(r.people);
        mine = r.role;
      } catch {
        // No list of people (an older server): the links still work.
      }
      if (gone) return;
      setRole(mine);
      // Links are the owner's to make.
      if (mine !== 'owner') return;
      api<ShareLink[]>('GET', `/api/docs/${id}/shares`).then((l) => !gone && setLinks(l)).catch((e) => !gone && setError(e.message));
    })();
    return () => {
      gone = true;
    };
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

  const owner = role === 'owner';
  return (
    <dialog ref={ref} className="dialog share-dialog" aria-labelledby="share-title" onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
      <div className="dialog-body">
        <h2 id="share-title"><Link2 size={18} /> {role && !owner ? `Who can open “${title}”` : `Share “${title}”`}</h2>
        {people && role && <People id={id} people={people} role={role} set={(p) => { setPeople(p); onChange?.(); }} />}
        {owner && (
          <>
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
          </>
        )}
        {error && <p className="dialog-error">{error}</p>}
        {owner && <p className="dialog-note">edgy runs on this computer, so a link opens for others once edgy is hosted where they can reach it.</p>}
        <div className="dialog-actions">
          <button className="btn solid" onClick={() => ref.current?.close()}>Done</button>
        </div>
      </div>
    </dialog>
  );
}

/** The owner first, then everyone who was given access. The owner changes roles and adds people; anyone else reads the list and may leave. */
function People({ id, people, role, set }: { id: string; people: Member[]; role: Role; set: (p: Member[]) => void }) {
  const [email, setEmail] = useState('');
  const [newRole, setNewRole] = useState<'viewer' | 'editor'>('editor');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const meId = currentMe().me?.id;
  const owner = role === 'owner';
  const ordered = [...people.filter((p) => p.role === 'owner'), ...people.filter((p) => p.role !== 'owner')];

  const run = async (key: string, call: () => Promise<{ people: Member[] }>): Promise<boolean> => {
    setBusy(key);
    setError(null);
    try {
      set((await call()).people);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.');
      return false;
    } finally {
      setBusy(null);
    }
  };
  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    if (await run('add', () => api('POST', `/api/docs/${id}/people`, { email: email.trim(), role: newRole }))) setEmail('');
  };
  const leave = async () => {
    if (!meId) return;
    setBusy('leave');
    setError(null);
    try {
      await api('DELETE', `/api/docs/${id}/people/${encodeURIComponent(meId)}`);
      // The document is no longer theirs to ask about: go to the list rather than update this one.
      window.location.assign('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.');
      setBusy(null);
    }
  };

  return (
    <section className="people" aria-label="People">
      <div className="people-head"><Users size={15} /> People</div>
      <ul className="people-list">
        {ordered.map((p) => (
          <li key={p.id} className="person">
            <Avatar name={p.name} color={p.color} size={30} />
            <span className="person-name">
              <b>{p.name}{p.id === meId && ' (you)'}</b>
              {p.email && <small>{p.email}</small>}
            </span>
            {p.role === 'owner' ? <span className="person-role">Owner</span>
              : owner ? (
                <span className="person-actions">
                  <select className="text-field" value={p.role} aria-label={`${p.name}'s access`} disabled={busy === p.id}
                    onChange={(e) => void run(p.id, () => api('PATCH', `/api/docs/${id}/people/${encodeURIComponent(p.id)}`, { role: e.target.value }))}>
                    {ROLES.map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}
                  </select>
                  <button type="button" className="btn ghost small" disabled={busy === p.id}
                    onClick={() => void run(p.id, () => api('DELETE', `/api/docs/${id}/people/${encodeURIComponent(p.id)}`))}>Remove</button>
                </span>
              ) : <span className="person-role">{p.role === 'editor' ? 'Can edit' : 'Can view'}</span>}
          </li>
        ))}
      </ul>
      {owner ? (
        <form className="people-add" onSubmit={(e) => void add(e)}>
          <label className="people-add-label" htmlFor="people-email"><UserPlus size={13} /> Add people</label>
          <input id="people-email" type="email" className="text-field" placeholder="Email of their account" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
          <select className="text-field" value={newRole} aria-label="Access to give" onChange={(e) => setNewRole(e.target.value as 'viewer' | 'editor')}>
            {ROLES.map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}
          </select>
          <button type="submit" className="btn solid small" disabled={!email.trim() || busy === 'add'}>Add</button>
        </form>
      ) : meId && (
        <button type="button" className="btn ghost small people-leave" disabled={busy === 'leave'} onClick={() => void leave()}>Leave this document</button>
      )}
      {error && <p className="dialog-error" role="alert">{error}</p>}
    </section>
  );
}
