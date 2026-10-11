// Live examples, the iframe's side: one edgy document in Live, answered from
// memory by the stand-in the exported files use (src/web/offline/standin.ts).
// Records it saves live in this page; nothing reaches a server. The page that
// holds the example sends the document and the theme, and hears the height.

import { StrictMode, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/web/fonts';
import '../../src/web/styles.css';
import './live.css';
import type { Doc, Json, Op } from '../../src/core/types';
import { newDoc } from '../../src/core/types';
import { applyOps } from '../../src/core/ops';
import { setTransport } from '../../src/web/lib/transport';
import { applyTheme } from '../../src/web/theme';
import { Session } from '../../src/web/session';
import { SessionContext } from '../../src/web/editor/ctx';
import { LiveSheet, Toast } from '../../src/web/editor/LiveView';
import { StandIn } from '../../src/web/offline/standin';

interface LiveSource { title: string; root: Json; meta?: Record<string, Json>; data?: Record<string, Record<string, Json>[]> }

const id = decodeURIComponent(location.hash.slice(1).split('&')[0]);
const tell = (m: Record<string, unknown>) => parent.postMessage({ ...m, id }, '*');

function build(src: LiveSource): Doc {
  const ops: Op[] = [...Object.entries(src.meta ?? {}).map(([k, v]): Op => ['meta', k, v]), ['put', 'c1', src.root]];
  return { ...applyOps(newDoc('example-' + id, src.title), ops).doc, v: 1 };
}

function Example({ doc }: { doc: Doc }) {
  const session = useMemo(() => new Session(doc.id, { mode: 'live', embedded: true }), [doc.id]);
  useEffect(() => {
    void session.open();
    return () => session.close();
  }, [session]);
  return (
    <SessionContext.Provider value={session}>
      <LiveSheet style={{ minHeight: 0, maxWidth: 'none', '--pad': '16px' } as React.CSSProperties} />
      <Toast />
    </SessionContext.Provider>
  );
}

let started = false;
addEventListener('message', (e) => {
  if (e.source !== parent) return;
  const m = e.data as { type?: string; source?: LiveSource; theme?: string };
  if (m.type === 'edgy-live-theme' || m.type === 'edgy-live-doc') applyTheme(m.theme === 'dark' ? 'dark' : 'light');
  if (m.type !== 'edgy-live-doc' || !m.source || started) return;
  started = true;
  const doc = build(m.source);
  const records: Record<string, ({ id: string; at: number } & Record<string, Json>)[]> = {};
  for (const [name, rows] of Object.entries(m.source.data ?? {})) records[name] = rows.map((r, i) => ({ ...r, id: `r${i + 1}`, at: 0 }));
  setTransport(new StandIn({ kind: 'doc', exportedAt: Date.now(), docs: [doc], shapes: {}, records, fetched: {} }).transport());
  createRoot(document.getElementById('root')!).render(<StrictMode><Example doc={doc} /></StrictMode>);
  const root = document.getElementById('root')!;
  new ResizeObserver(() => tell({ type: 'edgy-live-height', h: root.scrollHeight })).observe(root);
});

tell({ type: 'edgy-live-ready' });
