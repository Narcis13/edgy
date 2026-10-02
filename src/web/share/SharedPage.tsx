// What a share link opens: the document in Live, and nothing else. No editor,
// no way to other documents. With a "view" link what the person types stays
// in their tab; with an "edit" link it is saved like any change.

import { useEffect, useMemo, useState } from 'react';
import { Eye, Moon, Pencil, Sun } from 'lucide-react';
import { Session } from '../session';
import { ApiError, api } from '../lib/api';
import { setShareToken } from '../lib/transport';
import { useTheme } from '../theme';
import { SessionContext, useS } from '../editor/ctx';
import { LiveDesk, Toast } from '../editor/LiveView';
import { Notice } from '../pages/Notice';

type Opened = { id: string; title: string; access: 'view' | 'edit' } | { refused: 'unknown' | 'revoked' | 'failed' };

export function SharedPage({ token }: { token: string }) {
  const [opened, setOpened] = useState<Opened | null>(null);
  useEffect(() => {
    setShareToken(token);
    api<{ id: string; title: string; access: 'view' | 'edit' } | { refused: 'unknown' | 'revoked' }>('GET', '/api/shared')
      .then(setOpened)
      .catch((e) => setOpened({ refused: e instanceof ApiError ? (e.reason === 'revoked' ? 'revoked' : e.status === 404 || e.status === 403 ? 'unknown' : 'failed') : 'failed' }));
    return () => setShareToken(null);
  }, [token]);
  if (!opened) return <div className="screen-note">Opening…</div>;
  if ('refused' in opened) return <Refused why={opened.refused} />;
  return <Shared id={opened.id} access={opened.access} />;
}

function Refused({ why }: { why: 'unknown' | 'revoked' | 'failed' }) {
  if (why === 'revoked') {
    return <Notice kind="unshared" title="No longer shared">The person who shared this document has turned the link off. Ask them for a new one if you still need it.</Notice>;
  }
  if (why === 'unknown') return <Notice kind="missing" title="This link doesn't open anything">The document may have been deleted, or the link was copied only in part.</Notice>;
  return <Notice kind="failed" title="The server did not answer">Try again in a moment.</Notice>;
}

function Shared({ id, access }: { id: string; access: 'view' | 'edit' }) {
  const session = useMemo(() => new Session(id, { mode: 'live', guest: access }), [id, access]);
  useEffect(() => {
    void session.open();
    (window as unknown as { edgy?: Session }).edgy = session;
    return () => session.close();
  }, [session]);
  return (
    <SessionContext.Provider value={session}>
      <Screen access={access} />
    </SessionContext.Provider>
  );
}

function Screen({ access }: { access: 'view' | 'edit' }) {
  const status = useS((s) => s.status);
  const title = useS((s) => s.doc?.meta.title ?? '');
  const online = useS((s) => s.online);
  const [theme, setTheme] = useTheme();
  useEffect(() => {
    if (title) document.title = `${title} · edgy`;
  }, [title]);
  if (status === 'loading') return <div className="screen-note">Opening…</div>;
  if (status === 'unshared') return <Refused why="revoked" />;
  if (status === 'missing') return <Refused why="unknown" />;
  if (status === 'failed') return <Refused why="failed" />;
  return (
    <div className="shared-page">
      <header className="topbar shared-bar">
        <span className="shared-title">{title}</span>
        <span className={`shared-badge ${access}`} title={access === 'view' ? 'What you change here is not saved' : 'What you change is saved for everyone'}>
          {access === 'view' ? <><Eye size={13} /> View only</> : <><Pencil size={13} /> Can edit</>}
        </span>
        {!online && <span className="save-state is-off">Offline, will retry</span>}
        <div className="grow" />
        <button className="icon-btn" title={theme === 'dark' ? 'Light theme' : 'Dark theme'} aria-label={theme === 'dark' ? 'Light theme' : 'Dark theme'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </header>
      {access === 'view' && <p className="shared-note">You can try the inputs and buttons; nothing you change here is saved.</p>}
      <LiveDesk />
      <Toast />
    </div>
  );
}
