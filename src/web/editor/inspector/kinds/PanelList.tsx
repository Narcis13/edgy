// The panels of tabs or an accordion as a list: rename in place, reorder,
// copy, remove, and pick which are open. Shared by both designers.

import { type ReactNode, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Copy, Plus, Trash2 } from 'lucide-react';
import type { Cell } from '../../../../core/types';
import { cx, useS, useSession } from '../../ctx';
import { stop } from '../controls';
import type { Edit } from '../edit';
import { type PanelRow, addPanel, freeCellName, movePanel, NAME_BASE, openPanel, panelNoun, panelRows, renamePanel } from '../sections';

export function PanelList({ e, hint, children }: { e: Edit; hint: string; children?: ReactNode }) {
  const session = useSession();
  const c = e.cell;
  const rows = panelRows(c);
  const noun = panelNoun(c);
  const tabs = c.kind === 'tabs';
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setError(null), [c.id]);

  const rename = (row: PanelRow, text: string): boolean => {
    const r = renamePanel(c, row.id, text);
    if (!r) return true;
    if ('error' in r) {
      setError(r.error);
      return false;
    }
    setError(null);
    e.ops([r.op]);
    return true;
  };
  const run = (op: ReturnType<typeof movePanel>) => op && e.ops([op]);

  return (
    <>
      <span className="ins-label">{tabs ? 'Tabs' : 'Sections'}</span>
      <ul className="ins-cols ins-panels" aria-label={tabs ? 'Tabs' : 'Sections'}>
        {rows.map((row, i) => (
          <li key={row.id} className={cx('ins-col', row.open && 'is-current')}>
            <div className="ins-col-row">
              {tabs ? (
                <input type="radio" name={`open-${c.id}`} checked={row.open} aria-label={`Show ${row.title}`} title="The tab that shows" onKeyDown={stop}
                  onChange={() => run(openPanel(c, row.title))} />
              ) : (
                <input type="checkbox" checked={row.open} aria-label={`${row.title} open`} title={row.open ? 'Open; untick to close it' : 'Closed; tick to open it'} onKeyDown={stop}
                  onChange={() => run(openPanel(c, row.title, !row.open))} />
              )}
              <TitleInput value={row.title} label={`Title of ${noun} ${i + 1}`} onCommit={(t) => rename(row, t)} />
              <button type="button" className="icon-btn" aria-label={`Move ${row.title} up`} title="Move earlier" disabled={i === 0} onClick={() => run(movePanel(c, row.id, -1))}><ChevronUp size={14} /></button>
              <button type="button" className="icon-btn" aria-label={`Move ${row.title} down`} title="Move later" disabled={i === rows.length - 1} onClick={() => run(movePanel(c, row.id, 1))}><ChevronDown size={14} /></button>
              <button type="button" className="icon-btn" aria-label={`Duplicate ${row.title}`} title={`Duplicate this ${noun} and its cells`} onClick={() => e.ops([['dup', row.id]])}><Copy size={13} /></button>
              <button type="button" className="icon-btn ins-del" aria-label={`Remove ${row.title}`} disabled={rows.length < 2}
                title={rows.length < 2 ? `The last ${noun} can't go; delete the whole ${tabs ? 'tabs' : 'accordion'} instead` : `Remove this ${noun} and its cells`}
                onClick={() => e.ops([['remove', row.id]])}><Trash2 size={13} /></button>
            </div>
          </li>
        ))}
      </ul>
      {error ? <p className="ins-hint ins-error" role="alert">{error}</p> : <p className="ins-hint">{hint}</p>}
      <button type="button" className="btn soft small ins-add-btn" onClick={() => run(addPanel(c))}>
        <Plus size={14} /> Add a {noun}
      </button>
      {children}
      <FormulaHint e={e} example={(n) => (tabs ? `(= ${n} "${rows[1]?.title ?? rows[0]?.title ?? 'Details'}")` : `(includes? ${n} "${rows[0]?.title ?? 'Shipping'}")`)}
        what={tabs ? 'the open tab’s title' : 'the list of open sections'}
        change={(n) => `(set! ${n} "${rows.at(-1)?.title ?? ''}")`} />
      <button type="button" className="ins-link" onClick={() => session.select(c.children?.find((k) => rows.find((r) => r.id === k.id)?.open)?.id ?? rows[0].id)}>
        {tabs ? 'Go to the open tab' : 'Go to the first open section'}
      </button>
    </>
  );
}

/** A title edited in place: saves on Enter or leaving, Escape puts it back, a refused title stays to be fixed. */
export function TitleInput({ value, label, onCommit, placeholder }: { value: string; label: string; onCommit: (t: string) => boolean; placeholder?: string }) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  const [bad, setBad] = useState(false);
  useEffect(() => {
    if (!focused) {
      setText(value);
      setBad(false);
    }
  }, [value, focused]);
  const save = () => {
    const ok = onCommit(text);
    setBad(!ok);
    if (!ok) setText(value);
  };
  return (
    <input className={cx('text-field ins-title-input', bad && 'is-invalid')} value={text} aria-label={label} placeholder={placeholder} aria-invalid={bad}
      onFocus={() => setFocused(true)}
      onChange={(ev) => setText(ev.target.value)}
      onBlur={() => {
        setFocused(false);
        save();
      }}
      onKeyDown={(ev) => {
        ev.stopPropagation();
        if (ev.key === 'Enter') ev.currentTarget.blur();
        if (ev.key === 'Escape') {
          setText(value);
          setBad(false);
          ev.currentTarget.blur();
        }
      }} />
  );
}

/**
 * How formulas read the cell, with its real name; without a name, a button to
 * give it one (formulas only see named cells).
 */
export function FormulaHint({ e, example, what, change }: { e: Edit; example: (name: string) => string; what: string; change?: (name: string) => string }) {
  const root = useS((s) => s.doc?.root);
  const c = e.cell;
  if (!c.name) {
    const name = root ? freeCellName(root, NAME_BASE[c.kind] ?? 'cell') : 'cell';
    return (
      <div className="ins-formula-hint">
        <p className="ins-hint">Name it to use {what} in formulas and buttons.</p>
        <button type="button" className="btn ghost small" onClick={() => e.set('name', name)}>Name it <code>{name}</code></button>
      </div>
    );
  }
  return (
    <div className="ins-formula-hint">
      <p className="ins-hint">Formulas read {what} as <code>{c.name}</code>, e.g. <code>{example(c.name)}</code>.</p>
      {change && <p className="ins-hint">A button changes it: <code>{change(c.name)}</code>.</p>}
    </div>
  );
}

/** The container a panel sits in, for the panel's designer. */
export function useContainer(cell: Cell): Cell | null {
  const session = useSession();
  useS((s) => s.doc);
  return session.parent(cell.id);
}
