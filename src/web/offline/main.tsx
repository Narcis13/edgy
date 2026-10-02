// The app inside an exported .html file: the document in Live (or a deck,
// played), answered from memory by a stand-in for the server. The fonts it
// needs, its pictures, records and fetch answers are all in the file.

import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Moon, Play as PlayIcon, Sun, WifiOff } from 'lucide-react';
import '../fonts';
import '../styles.css';
import './offline.css';
import { type ExportPayload, PAYLOAD_ID } from '../../core/offline';
import { setTransport } from '../lib/transport';
import { applyTheme, currentTheme, useTheme } from '../theme';
import { Session } from '../session';
import { SessionContext } from '../editor/ctx';
import { LiveDesk, Toast } from '../editor/LiveView';
import { Minimap } from '../pages/Minimap';
import { Play } from '../play/Play';
import { requestFull } from '../play/start';
import { StandIn } from './standin';

const payload = JSON.parse(document.getElementById(PAYLOAD_ID)!.textContent!) as ExportPayload;
setTransport(new StandIn(payload).transport());
applyTheme(currentTheme());

const day = (ts: number) => new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** What every page of the file says once: this is a copy, and nothing in it is saved. */
function OfflineBar({ title }: { title: string }) {
  const [theme, setTheme] = useTheme();
  return (
    <header className="topbar offline-bar">
      <span className="shared-title">{title}</span>
      <span className="offline-badge" title="Nothing you change here is saved anywhere; closing the page forgets it.">
        <WifiOff size={13} /> Offline copy
      </span>
      <span className="offline-when">exported {day(payload.exportedAt)} · changes stay in this page</span>
      <div className="grow" />
      <button className="icon-btn" aria-label={theme === 'dark' ? 'Light theme' : 'Dark theme'} title={theme === 'dark' ? 'Light theme' : 'Dark theme'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>
    </header>
  );
}

function OfflineDoc() {
  const doc = payload.docs[0];
  const session = useMemo(() => new Session(doc.id, { mode: 'live', embedded: true }), []);
  useEffect(() => {
    void session.open();
    (window as unknown as { edgy?: Session }).edgy = session;
    document.title = doc.meta.title;
    return () => session.close();
  }, [session]);
  return (
    <SessionContext.Provider value={session}>
      <div className="shared-page">
        <OfflineBar title={doc.meta.title} />
        <LiveDesk />
        <Toast />
      </div>
    </SessionContext.Provider>
  );
}

/** A deck: its slides listed, and Play. Leaving Play comes back here. */
function OfflineDeck() {
  const deck = payload.deck!;
  const [playing, setPlaying] = useState(false);
  useEffect(() => void (document.title = deck.title), [deck.title]);
  const docs = deck.docs.map((id) => payload.docs.find((d) => d.id === id)).filter((d) => !!d);
  const play = () => {
    requestFull();
    setPlaying(true);
  };
  if (playing) return <Play id={deck.id} onLeave={() => setPlaying(false)} />;
  return (
    <div className="shared-page">
      <OfflineBar title={deck.title} />
      <main className="home offline-deck">
        <h1>{deck.title}</h1>
        {deck.description && <p className="offline-desc">{deck.description}</p>}
        <button className="btn solid offline-play" autoFocus onClick={play}><PlayIcon size={16} /> Play</button>
        <ol className="offline-slides">
          {docs.map((d, i) => (
            <li key={d.id}>
              <Minimap shape={payload.shapes[d.id]} />
              <span><b>{i + 1}.</b> {d.meta.title}</span>
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {payload.kind === 'deck' ? <OfflineDeck /> : <OfflineDoc />}
  </StrictMode>,
);
