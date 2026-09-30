import { useEffect, useState } from 'react';
import { Database, Moon, Plus, Sun, Trash2 } from 'lucide-react';
import type { Doc } from '../../core/types';
import { type DocSummary, type TemplateSummary, api, timeAgo } from '../lib/api';
import { useTheme } from '../theme';
import { Logo } from './Logo';
import { Minimap } from './Minimap';

export function Shell({ page, navigate, children }: { page: 'docs' | 'data'; navigate: (p: string) => void; children: React.ReactNode }) {
  const [theme, setTheme] = useTheme();
  const go = (path: string) => (e: React.MouseEvent) => { e.preventDefault(); navigate(path); };
  return (
    <div className="shell">
      <header className="topbar">
        <a className="brand" href="/" onClick={go('/')}><Logo /></a>
        <nav className="nav">
          <a href="/" className={page === 'docs' ? 'is-on' : ''} onClick={go('/')}>Documents</a>
          <a href="/data" className={page === 'data' ? 'is-on' : ''} onClick={go('/data')}><Database size={14} /> Data</a>
        </nav>
        <div className="grow" />
        <button className="icon-btn" title={theme === 'dark' ? 'Light theme' : 'Dark theme'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button>
      </header>
      {children}
    </div>
  );
}

export function Home({ navigate }: { navigate: (p: string) => void }) {
  const [docs, setDocs] = useState<DocSummary[] | null>(null);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => api<DocSummary[]>('GET', '/api/docs').then(setDocs).catch((e) => setError(e.message));
  useEffect(() => {
    void load();
    void api<TemplateSummary[]>('GET', '/api/templates').then(setTemplates).catch(() => undefined);
  }, []);

  const create = async (template?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const doc = await api<Doc>('POST', '/api/docs', { template, actor: { kind: 'human', name: 'You' } });
      navigate(`/d/${doc.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the document.');
      setBusy(false);
    }
  };
  const remove = async (d: DocSummary) => {
    if (!window.confirm(`Delete "${d.title}"? This cannot be undone.`)) return;
    await api('DELETE', `/api/docs/${d.id}`);
    void load();
  };

  return (
    <Shell page="docs" navigate={navigate}>
      <main className="home">
        <div className="home-head">
          <h1>Documents</h1>
          <p>Every document starts as one cell. Split it, fill it, link it, share it with an agent.</p>
        </div>
        <section className="starts" aria-label="Start a document">
          <button className="start blank" onClick={() => void create()} disabled={busy}>
            <span className="seed">
              <span className="seed-cell"><Plus size={14} /></span>
              <i className="h t" /><i className="h b" /><i className="h l" /><i className="h r" />
            </span>
            <span className="start-title">New document</span>
            <span className="start-about">One empty cell</span>
          </button>
          {templates.map((t) => (
            <button key={t.id} className="start" onClick={() => void create(t.id)} disabled={busy}>
              <Minimap notation={t.root} />
              <span className="start-title">{t.title}</span>
              <span className="start-about">{t.about}</span>
            </button>
          ))}
        </section>

        {error && <p className="home-error">{error}</p>}
        {docs && docs.length > 0 && (
          <section className="docs" aria-label="Your documents">
            {docs.map((d) => (
              <article key={d.id} className="doc-card">
                <a href={`/d/${d.id}`} onClick={(e) => { e.preventDefault(); navigate(`/d/${d.id}`); }}>
                  <Minimap root={d.root} />
                  <span className="doc-title">{d.title}</span>
                  <span className="doc-meta">Changed {timeAgo(d.updatedAt)}</span>
                </a>
                <button className="icon-btn doc-delete" title="Delete" onClick={() => void remove(d)}><Trash2 size={14} /></button>
              </article>
            ))}
          </section>
        )}
        {docs && docs.length === 0 && <p className="home-empty">Nothing here yet. Start with the empty cell above.</p>}
      </main>
    </Shell>
  );
}
