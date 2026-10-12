// The item editor: every field of one item, for a new one or one that exists.

import { useEffect, useId, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { type FlowItem, type ItemKind, type Priority, PRIORITIES, dayPart, stampOf, tagOf, timePart } from '../../../core/flow';
import { type Confirm, Modal } from '../library/Dialogs';
import { cx } from '../library/text';
import { KIND_ICON, KIND_LABEL } from './bits';
import { myDocs } from './Composer';
import type { Fields, FlowActions, Loaded } from './state';

interface Draft {
  kind: ItemKind;
  text: string;
  body: string;
  tags: string;
  status: string;
  done: boolean;
  due: string;
  startDay: string;
  startTime: string;
  endDay: string;
  endTime: string;
  priority: Priority;
  pinned: boolean;
  doc: string;
}

function draftOf(item: FlowItem | null, preset: (Fields & { text?: string }) | undefined, firstColumn: string): Draft {
  const p = { ...(item ?? {}), ...(preset ?? {}) } as Partial<FlowItem>;
  return {
    kind: p.kind ?? 'note',
    text: p.text ?? '',
    body: p.body ?? '',
    tags: (p.tags ?? []).map((t) => '#' + t).join(' '),
    status: p.status || firstColumn,
    done: p.done ?? false,
    due: p.due ?? '',
    startDay: p.start ? dayPart(p.start) : '',
    startTime: timePart(p.start ?? null) ?? '',
    endDay: p.end ? dayPart(p.end) : '',
    endTime: timePart(p.end ?? null) ?? '',
    priority: p.priority ?? 0,
    pinned: p.pinned ?? false,
    doc: p.doc ?? '',
  };
}

/** The fields a draft gives, the way the API takes them. */
export function fieldsOf(d: Draft): Fields {
  const start = d.startDay ? stampOf(d.startDay, d.startTime || null) : null;
  const endDay = d.endDay || (d.endTime ? d.startDay : '');
  const end = endDay ? stampOf(endDay, d.endTime || null) : null;
  return {
    kind: d.kind,
    text: d.text.trim(),
    body: d.body.trim(),
    tags: [...new Set(d.tags.split(/[\s,]+/).map(tagOf).filter(Boolean))],
    status: d.kind === 'task' ? d.status : '',
    done: d.kind === 'task' ? d.done : false,
    due: d.due || null,
    start,
    end: start && end && end < start ? start : end,
    priority: d.priority,
    pinned: d.pinned,
    doc: d.doc || null,
  };
}

export function ItemDialog({ item, preset, data, acts, confirm, navigate, onClose }: {
  item: FlowItem | null;
  preset?: Fields & { text?: string };
  data: Loaded;
  acts: FlowActions;
  confirm: (c: Confirm) => void;
  navigate: (p: string) => void;
  onClose: () => void;
}) {
  const id = useId();
  const cols = data.board.columns;
  const [d, setD] = useState<Draft>(() => draftOf(item, preset, cols[0]));
  const [docs, setDocs] = useState<{ id: string; title: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  useEffect(() => { void myDocs().then(setDocs); }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const f = fieldsOf(d);
    if (!f.text && !f.body) {
      setError('Give it a few words.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (item) {
        const changed: Fields = {};
        for (const [k, v] of Object.entries(f) as [keyof Fields, unknown][]) {
          if (JSON.stringify(v) !== JSON.stringify((item as unknown as Record<string, unknown>)[k])) (changed as Record<string, unknown>)[k] = v;
        }
        if (Object.keys(changed).length) await acts.patch(item.id, changed);
      } else {
        await acts.post({ ...f, text: f.text || f.body!.split('\n')[0], plain: true });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'It could not be saved.');
      setBusy(false);
    }
  };

  const remove = () => {
    if (!item) return;
    onClose();
    confirm({ title: `Delete "${item.text || KIND_LABEL[item.kind].toLowerCase()}"?`, body: 'Its comments and reactions go with it. This can’t be undone.', action: 'Delete', run: () => acts.remove(item.id) });
  };

  return (
    <Modal labelledBy={id} onClose={onClose} className="flow-dialog">
      <form className="flow-form" onSubmit={(e) => void save(e)}>
        <h2 id={id}>{item ? 'Edit' : 'New'} {KIND_LABEL[d.kind].toLowerCase()}</h2>
        <div className="seg flow-kinds" role="group" aria-label="Kind">
          {(['note', 'task', 'event'] as ItemKind[]).map((k) => (
            <button key={k} type="button" className={cx(d.kind === k && 'is-on')} aria-pressed={d.kind === k} onClick={() => set('kind', k)}>{KIND_ICON[k]}{KIND_LABEL[k]}</button>
          ))}
        </div>
        <label className="lib-field">
          <span>{d.kind === 'note' ? 'Title' : 'What'}</span>
          <input data-autofocus className="text-field" value={d.text} maxLength={2000} onChange={(e) => set('text', e.target.value)} placeholder={d.kind === 'event' ? 'Call Ben' : d.kind === 'task' ? 'Write the report' : 'An idea'} />
        </label>
        <label className="lib-field">
          <span>More <small>(optional)</small></span>
          <textarea className="text-field" rows={d.body.split('\n').length > 2 ? Math.min(10, d.body.split('\n').length + 1) : 3} value={d.body} onChange={(e) => set('body', e.target.value)} />
        </label>
        <label className="lib-field">
          <span>Tags <small>words, with or without #</small></span>
          <input className="text-field" value={d.tags} onChange={(e) => set('tags', e.target.value)} placeholder="#sales #q4" />
        </label>
        {d.kind === 'task' && (
          <div className="flow-form-row">
            <label className="lib-field">
              <span>Column</span>
              <select className="text-field" value={d.done ? cols[cols.length - 1] : d.status} onChange={(e) => { const v = e.target.value; set('status', v); set('done', v === cols[cols.length - 1]); }}>
                {cols.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="lib-field">
              <span>Due</span>
              <input type="date" className="text-field" value={d.due} onChange={(e) => set('due', e.target.value)} />
            </label>
          </div>
        )}
        <div className="flow-form-row">
          <label className="lib-field">
            <span>{d.kind === 'event' ? 'Start' : 'Start'} <small>{d.kind === 'event' ? 'a day, and a time' : 'a time block, optional'}</small></span>
            <span className="flow-form-when">
              <input type="date" className="text-field" value={d.startDay} onChange={(e) => set('startDay', e.target.value)} aria-label="Start day" />
              <input type="time" className="text-field" value={d.startTime} onChange={(e) => set('startTime', e.target.value)} aria-label="Start time" disabled={!d.startDay} />
            </span>
          </label>
          <label className="lib-field">
            <span>End <small>optional</small></span>
            <span className="flow-form-when">
              <input type="date" className="text-field" value={d.endDay} min={d.startDay || undefined} onChange={(e) => set('endDay', e.target.value)} aria-label="End day" disabled={!d.startDay} />
              <input type="time" className="text-field" value={d.endTime} onChange={(e) => set('endTime', e.target.value)} aria-label="End time" disabled={!d.startDay} />
            </span>
          </label>
        </div>
        <div className="flow-form-row">
          <div className="lib-field">
            <span>Priority</span>
            <div className="seg" role="group" aria-label="Priority">
              {PRIORITIES.map((p, i) => <button key={p} type="button" className={cx(d.priority === i && 'is-on')} aria-pressed={d.priority === i} onClick={() => set('priority', i as Priority)}>{p}</button>)}
            </div>
          </div>
          <label className="lib-field flow-form-check">
            <span>Pinned</span>
            <input type="checkbox" checked={d.pinned} onChange={(e) => set('pinned', e.target.checked)} />
          </label>
        </div>
        <label className="lib-field">
          <span>Document <small>attach one of yours</small></span>
          <span className="flow-form-when">
            <select className="text-field" value={d.doc} onChange={(e) => set('doc', e.target.value)}>
              <option value="">None</option>
              {d.doc && !docs?.some((x) => x.id === d.doc) && <option value={d.doc}>{data.docs[d.doc] || d.doc}</option>}
              {docs?.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
            </select>
            {d.doc && <button type="button" className="btn ghost small" onClick={() => navigate(`/d/${d.doc}`)}>Open</button>}
          </span>
        </label>
        {error && <p className="dialog-error">{error}</p>}
        <div className="dialog-actions flow-form-actions">
          {item && <button type="button" className="btn danger-ghost flow-form-delete" onClick={remove}><Trash2 size={14} aria-hidden="true" /> Delete</button>}
          <span className="grow" />
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn solid" disabled={busy}>{item ? 'Save' : 'Add'}</button>
        </div>
      </form>
    </Modal>
  );
}
