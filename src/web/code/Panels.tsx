// The studio's reference panels: every function, and every named cell.
// Clicking one puts it into the code (or the blocks).

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { ENTRIES, GROUP_COLOR, GROUPS } from './docs';
import { KIND_NAMES, cellIcon, useDocInfo } from './info';

function SearchBox({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="sp-search">
      <Search size={14} />
      <input value={value} placeholder={label} aria-label={label} onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape' && value) { e.stopPropagation(); onChange(''); } }}
        autoComplete="off" autoCapitalize="off" spellCheck={false} />
    </label>
  );
}

export function FunctionsPanel({ onInsert }: { onInsert: (name: string) => void }) {
  const [q, setQ] = useState('');
  const t = q.trim().toLowerCase();
  const entries = useMemo(
    () => ENTRIES.filter((e) => !t || e.label.toLowerCase().includes(t) || e.does.toLowerCase().includes(t) || e.group.toLowerCase().includes(t)),
    [t],
  );
  return (
    <div className="sp">
      <SearchBox value={q} onChange={setQ} label="Search functions" />
      <div className="sp-scroll">
        {GROUPS.map((g) => {
          const list = entries.filter((e) => e.group === g);
          if (!list.length) return null;
          return (
            <section key={g} className="sp-group" style={{ '--c': GROUP_COLOR[g] } as React.CSSProperties}>
              <h4><span className="sp-dot" />{g}</h4>
              {list.map((e) => (
                <div key={e.label} className="sp-fn">
                  <div className="sp-names">
                    {e.names.length ? e.names.map((n) => (
                      <button key={n} type="button" className="sp-name" title={`Insert ${n}`} onClick={() => onInsert(n)}>{n}</button>
                    )) : <span className="sp-name is-note">{e.label}</span>}
                  </div>
                  <code className="sp-use">{e.use}</code>
                  <p className="sp-does">{e.does}</p>
                </div>
              ))}
            </section>
          );
        })}
        {!entries.length && <p className="sp-none">No function matches “{q}”.</p>}
      </div>
    </div>
  );
}

export function CellsPanel({ onInsert, self, vars = [], varsTitle = 'From the event' }: {
  onInsert: (name: string) => void;
  self?: string;
  /** Names the code finds bound (an event's value, an action's inputs), listed before the cells. */
  vars?: { name: string; does: string }[];
  varsTitle?: string;
}) {
  const info = useDocInfo();
  const [q, setQ] = useState('');
  const t = q.trim().toLowerCase();
  const cells = info.cells.filter((c) => !t || c.name.toLowerCase().includes(t) || c.preview.toLowerCase().includes(t));
  const bound = vars.filter((v) => !t || v.name.toLowerCase().includes(t) || v.does.toLowerCase().includes(t));
  return (
    <div className="sp">
      <SearchBox value={q} onChange={setQ} label="Search cells" />
      <div className="sp-scroll">
        {!!bound.length && (
          <section className="sp-vars" aria-label={varsTitle}>
            <h4>{varsTitle}</h4>
            {bound.map((v) => (
              <button key={v.name} type="button" className="sp-cell sp-var" onClick={() => onInsert(v.name)} title={`Insert ${v.name}`}>
                <span className="sp-cell-ico is-var">x</span>
                <span className="sp-cell-main">
                  <span className="sp-cell-name">{v.name}</span>
                  <small className="sp-cell-kind">{v.does}</small>
                </span>
              </button>
            ))}
            {!!cells.length && <h4>Cells</h4>}
          </section>
        )}
        {cells.map((c) => {
          const I = cellIcon(c.cell);
          return (
            <button key={c.id} type="button" className="sp-cell" onClick={() => onInsert(c.name)} title={`Insert ${c.name}`}>
              <span className="sp-cell-ico"><I size={15} strokeWidth={1.8} /></span>
              <span className="sp-cell-main">
                <span className="sp-cell-name">{c.name}{c.id === self && <small> · this cell</small>}</span>
                <small className="sp-cell-kind">{KIND_NAMES[c.cell.kind] ?? c.cell.kind}</small>
              </span>
              <span className="sp-cell-val">{c.preview || '—'}</span>
            </button>
          );
        })}
        {!info.cells.length && (
          <p className="sp-none">No cell has a name yet. Name a cell in the inspector (for example <code>price</code>) and it shows up here.</p>
        )}
        {!!info.cells.length && !cells.length && <p className="sp-none">No cell matches “{q}”.</p>}
      </div>
    </div>
  );
}
