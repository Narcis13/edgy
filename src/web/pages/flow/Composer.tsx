// The box at the top of the timeline: anything typed is read as quick-add and
// what was understood shows before it is posted.

import { type RefObject, useEffect, useState } from 'react';
import { FileText, Send, X } from 'lucide-react';
import { type ItemKind, describeQuick, parseQuick } from '../../../core/flow';
import { api } from '../../lib/api';
import { cx } from '../library/text';
import { KIND_ICON, KIND_LABEL } from './bits';
import type { FlowActions } from './state';

interface DocChoice {
  id: string;
  title: string;
}

/** Your documents, for attaching one; read when asked for, and kept until the next picker opens (`fresh`). */
let docsOnce: Promise<DocChoice[]> | null = null;
export function myDocs(fresh = false): Promise<DocChoice[]> {
  if (fresh) docsOnce = null;
  docsOnce ??= api<{ id: string; title: string; archivedAt?: number | null }[]>('GET', '/api/docs')
    .then((d) => d.filter((x) => x.archivedAt == null).map((x) => ({ id: x.id, title: x.title || 'Untitled' })))
    .catch(() => {
      docsOnce = null;
      return [];
    });
  return docsOnce;
}

export function Composer({ acts, today, inputRef }: { acts: FlowActions; today: string; inputRef: RefObject<HTMLTextAreaElement | null> }) {
  const [text, setText] = useState('');
  const [kind, setKind] = useState<ItemKind | null>(null);
  const [doc, setDoc] = useState<DocChoice | null>(null);
  const [docs, setDocs] = useState<DocChoice[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (picking && !docs) void myDocs(true).then(setDocs);
  }, [picking, docs]);

  const quick = text.trim() ? parseQuick(text, new Date()) : null;
  const preview = quick ? describeQuick(kind ? { ...quick, kind } : quick, today) : '';

  const post = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await acts.post({ text, ...(kind ? { kind } : {}), ...(doc ? { doc: doc.id } : {}) });
      setText('');
      setKind(null);
      setDoc(null);
      setPicking(false);
      inputRef.current?.focus();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'It could not be posted.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="flow-composer" onSubmit={(e) => { e.preventDefault(); void post(); }}>
      <textarea
        ref={inputRef}
        className="text-field flow-composer-text"
        value={text}
        rows={text.includes('\n') ? Math.min(8, text.split('\n').length + 1) : 2}
        placeholder="What's on your mind? Try: Call Ben tomorrow 3pm-4pm #sales"
        aria-label="New post: the first line is read for a day, a time, #tags and !; more lines are the body"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void post(); } }}
      />
      <div className="flow-composer-row">
        <p className={cx('flow-preview', !preview && 'is-empty')} aria-live="polite">{preview || 'A day, a time, #tags and ! are read from the first line. Ctrl+Enter (⌘Enter on a Mac) posts.'}</p>
        <div className="seg flow-kinds" role="group" aria-label="Kind">
          <button type="button" className={cx(!kind && 'is-on')} onClick={() => setKind(null)} aria-pressed={!kind}>Auto</button>
          {(['note', 'task', 'event'] as ItemKind[]).map((k) => (
            <button key={k} type="button" className={cx(kind === k && 'is-on')} onClick={() => setKind(kind === k ? null : k)} aria-pressed={kind === k}>{KIND_ICON[k]}{KIND_LABEL[k]}</button>
          ))}
        </div>
        {doc ? (
          <span className="flow-attached"><FileText size={13} aria-hidden="true" />{doc.title}<button type="button" className="icon-btn" aria-label="Remove the attached document" onClick={() => setDoc(null)}><X size={13} /></button></span>
        ) : picking ? (
          <select className="text-field flow-pick-doc" aria-label="Attach a document" autoFocus defaultValue="" onChange={(e) => { const d = docs?.find((x) => x.id === e.target.value); if (d) setDoc(d); setPicking(false); }}>
            <option value="" disabled>{docs ? (docs.length ? 'Attach a document…' : 'No documents yet') : 'Loading…'}</option>
            {docs?.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
          </select>
        ) : (
          <button type="button" className="btn ghost small" onClick={() => setPicking(true)}><FileText size={13} aria-hidden="true" /> Attach a document</button>
        )}
        <button type="submit" className="btn solid flow-post" disabled={!text.trim() || busy}><Send size={14} aria-hidden="true" /> Post</button>
      </div>
      {error && <p className="dialog-error">{error}</p>}
    </form>
  );
}
