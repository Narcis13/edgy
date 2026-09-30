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
  const load = () => api<Collection[]>('GET', '/api/data').then((c) => {
    setCollections(c);
    if (!current && c.length) setCurrent(c[0].name);
    if (current && !c.some((x) => x.name === current)) setCurrent(c[0]?.name ?? null);
  });
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (current) void api<Row[]>('GET', `/api/data/${encodeURIComponent(current)}`).then(setRows);
    else setRows([]);
  }, [current]);

  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((k) => k !== 'id' && k !== 'at');
  const removeRow = async (id: string) => {
    await api('DELETE', `/api/data/${encodeURIComponent(current!)}/${encodeURIComponent(id)}`);
    setRows((r) => r.filter((x) => x.id !== id));
    void load();
  };
  const clear = async () => {
    if (!current || !window.confirm(`Delete every record in "${current}"?`)) return;
    await api('DELETE', `/api/data/${encodeURIComponent(current)}`);
    setRows([]);
    void load();
  };

  return (
    <Shell page="data" navigate={navigate}>
      <main className="data-page">
        <aside className="collections">
          <h1>Data</h1>
          <p className="panel-note">What buttons with <code>insert!</code> have saved. Any document can read it back with <code>(rows "name")</code>.</p>
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
