// Records that documents have saved, by collection.

import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { show } from '../../core/sx';
import { type Row, api, timeAgo } from '../lib/api';
import { Shell } from './Home';

interface Collection {
  name: string;
  count: number;
  updatedAt: number;
}

export function DataPage({ navigate }: { navigate: (p: string) => void }) {
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const failed = (e: unknown) => setProblem(e instanceof Error ? e.message : 'The server could not answer just now. Try again in a moment.');
  const load = () => api<Collection[]>('GET', '/api/data').then((c) => {
    setCollections(c);
    if (!current && c.length) setCurrent(c[0].name);
    if (current && !c.some((x) => x.name === current)) setCurrent(c[0]?.name ?? null);
  }).catch(failed);
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!current) return setRows([]);
    // Clicking through collections quickly: only the one picked last fills the table.
    let mine = true;
    api<Row[]>('GET', `/api/data/${encodeURIComponent(current)}`).then((r) => { if (mine) setRows(r); }, (e) => { if (mine) failed(e); });
    return () => { mine = false; };
  }, [current]);

  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((k) => k !== 'id' && k !== 'at');
  const removeRow = async (id: string) => {
    try {
      await api('DELETE', `/api/data/${encodeURIComponent(current!)}/${encodeURIComponent(id)}`);
      setRows((r) => r.filter((x) => x.id !== id));
      void load();
    } catch (e) {
      failed(e);
    }
  };
  const clear = async () => {
    if (!current || !window.confirm(`Delete every record in "${current}"?`)) return;
    try {
      await api('DELETE', `/api/data/${encodeURIComponent(current)}`);
      setRows([]);
      void load();
    } catch (e) {
      failed(e);
    }
  };

  return (
    <Shell page="data" navigate={navigate}>
      <main className="data-page">
        <aside className="collections">
          <h1>Data</h1>
          <p className="panel-note">What buttons with <code>insert!</code> have saved. Any document can read it back with <code>(rows "name")</code>.</p>
          {problem && <p className="data-problem" role="alert">{problem}</p>}
          {collections && !collections.length && <p className="home-empty">No records yet. Try the feedback form template.</p>}
          <ul>
            {collections?.map((c) => (
              <li key={c.name}>
                <button className={c.name === current ? 'is-on' : ''} onClick={() => setCurrent(c.name)}>
                  <span>{c.name}</span><small>{c.count}</small>
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <section className="records">
          {current && (
            <>
              <div className="records-head">
                <h2>{current}</h2>
                <span className="panel-note">{rows.length} record{rows.length === 1 ? '' : 's'}</span>
                <div className="grow" />
                <button className="btn ghost" onClick={() => void clear()} disabled={!rows.length}>Delete all</button>
              </div>
              <div className="table-wrap">
                <table className="data">
                  <thead><tr><th>when</th>{cols.map((c) => <th key={c}>{c}</th>)}<th /></tr></thead>
                  <tbody>
                    {[...rows].reverse().map((r) => (
                      <tr key={r.id}>
                        <td className="faint">{timeAgo(r.at)}</td>
                        {cols.map((c) => <td key={c} className={typeof r[c] === 'number' ? 'num' : ''}>{show(r[c])}</td>)}
                        <td><button className="icon-btn" title="Delete this record" onClick={() => void removeRow(r.id)}><Trash2 size={13} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </main>
    </Shell>
  );
}
