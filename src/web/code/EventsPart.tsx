// The studio's Events part: what a cell (or the document) reacts to. A rail
// lists its events with the handler on each and, for the document, its custom
// actions; adding a handler is choosing an event and a preset, picking any
// cell it needs from a list; a handler can be tried by hand and what it did is
// shown right there.

import { useMemo, useState } from 'react';
import {
  BellPlus, CirclePlay, CloudDownload, Eye, EyeOff, FunctionSquare, Hash, Pencil, Play, Plus, RotateCcw, Save, Send, SquareFunction,
  Timer, TimerOff, ToggleLeft, Trash2, Undo2, X, Zap,
} from 'lucide-react';
import type { Cell, Doc, Sx } from '../../core/types';
import { print, read } from '../../core/sx';
import { cx, useSession } from '../editor/ctx';
import { cellIcon, useCollections, useDocInfo } from './info';
import { type PickItem, PickMenu } from './PickMenu';
import {
  type EventRow, type Preset, type PresetContext, type RunLine, actionNameProblem, collectionChoices, eventChoices, eventNameProblem, eventVars,
  presetAction, presetsFor, sayEvent, splitParams, targetsFor,
} from './handlers';

const PRESET_ICONS: Record<string, typeof Zap> = {
  'set-value': Pencil, set: Pencil, count: Hash, toggle: ToggleLeft, show: Eye, hide: EyeOff, save: Save, emit: Send,
  start: Timer, stop: TimerOff, refresh: CloudDownload, call: SquareFunction,
};

/** One line of code for a rail row. */
const oneLine = (t: string) => t.replace(/\s+/g, ' ').trim();

/** Whether a studio key is in the Events part. */
export const isEventsKey = (k: string) => k === 'on' || k === 'actions' || k.startsWith('on.') || k.startsWith('actions.');
/** Whether a key names something with code to edit: a handler or an action. */
export const isHandlerKey = (k: string) => (k.startsWith('on.') && k.length > 3) || (k.startsWith('actions.') && k.length > 8);

// ───────────────────────────── the rail ─────────────────────────────

export function EventsRail({ rows, isDoc, drafts, initial, prop, onPick, onAdd, onNewAction }: {
  rows: EventRow[];
  isDoc: boolean;
  drafts: Record<string, string>;
  initial: Record<string, string>;
  prop: string;
  onPick: (key: string) => void;
  onAdd: (event?: string) => void;
  onNewAction: () => void;
}) {
  const own = rows.filter((r) => !r.custom);
  const custom = rows.filter((r) => r.custom);
  const actions = [...new Set(Object.keys({ ...initial, ...drafts }).filter((k) => k.startsWith('actions.')))]
    .filter((k) => (drafts[k] ?? initial[k] ?? '').trim() || (initial[k] ?? '').trim())
    .sort();
  const row = (r: EventRow) => {
    const text = drafts[r.key] ?? initial[r.key] ?? '';
    const has = !!text.trim();
    const removed = !has && !!(initial[r.key] ?? '').trim();
    const dirty = (drafts[r.key] ?? '') !== (initial[r.key] ?? '') && r.key in drafts;
    return (
      <li key={r.key}>
        <button type="button" data-event={r.name} className={cx('ev-row', prop === r.key && 'is-on', !has && 'is-empty')} aria-current={prop === r.key ? 'true' : undefined}
          onClick={() => (has || removed ? onPick(r.key) : onAdd(r.name))} title={r.decl?.data ?? (r.custom ? 'Sent with (emit! …)' : undefined)}>
          <span className="ev-row-top">
            <span className="ev-row-name">{r.name}</span>
            {dirty && <i className="st-dirty" aria-label="changed" />}
            {!has && !removed && <Plus size={13} className="ev-row-plus" aria-hidden />}
          </span>
          <small className={cx('ev-row-code', has && 'is-code')}>{has ? oneLine(text) : removed ? 'removed when you apply' : r.stray ? 'not raised by this kind' : 'nothing yet'}</small>
        </button>
      </li>
    );
  };
  return (
    <nav className="ev-rail" aria-label="Events">
      <h4>{isDoc ? 'The document' : 'Events'}</h4>
      {own.length ? <ul>{own.map(row)}</ul> : <p className="ev-none">{isDoc ? '' : 'This kind raises no events of its own.'}</p>}
      {!!custom.length && (
        <>
          <h4>Custom events</h4>
          <ul>{custom.map(row)}</ul>
        </>
      )}
      <button type="button" className="ev-add-btn" onClick={() => onAdd()} aria-current={prop === 'on' ? 'true' : undefined}><BellPlus size={14} /> Add a handler</button>
      {isDoc && (
        <>
          <h4>Actions</h4>
          {actions.length ? (
            <ul>
              {actions.map((k) => {
                const text = drafts[k] ?? initial[k] ?? '';
                const has = !!text.trim();
                let params: string[] = [];
                try {
                  const x = read(text) as Sx;
                  params = Array.isArray(x) && Array.isArray(x[1]) ? x[1].map(String) : [];
                } catch { /* half typed */ }
                return (
                  <li key={k}>
                    <button type="button" data-action={k.slice(8)} className={cx('ev-row', prop === k && 'is-on')} aria-current={prop === k ? 'true' : undefined} onClick={() => onPick(k)}>
                      <span className="ev-row-top">
                        <span className="ev-row-name">({[k.slice(8), ...params].join(' ')})</span>
                        {(drafts[k] ?? '') !== (initial[k] ?? '') && k in drafts && <i className="st-dirty" aria-label="changed" />}
                      </span>
                      <small className="ev-row-code">{has ? 'a custom action' : 'removed when you apply'}</small>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : <p className="ev-none">None yet. An action is a function any handler or button can call by name.</p>}
          <button type="button" className="ev-add-btn" onClick={onNewAction} aria-current={prop === 'actions' ? 'true' : undefined}><FunctionSquare size={14} /> New action</button>
        </>
      )}
    </nav>
  );
}

// ───────────────────────────── adding a handler ─────────────────────────────

type Pick = { preset: Preset; el: HTMLElement };

export function AddHandler({ doc, cell, rows, drafts, initial, event: start, onCreate, onBack }: {
  doc: Doc;
  cell: Cell | null;
  rows: EventRow[];
  drafts: Record<string, string>;
  initial: Record<string, string>;
  /** The event to start on, when one was clicked. */
  event: string | null;
  onCreate: (event: string, action: Sx, label: string) => void;
  /** On phones: back to the list. */
  onBack?: () => void;
}) {
  const session = useSession();
  const info = useDocInfo();
  const collections = useCollections();
  const has = (r: EventRow) => !!(drafts[r.key] ?? initial[r.key] ?? '').trim();
  const [event, setEvent] = useState<string | null>(() => start ?? rows.find((r) => !has(r) && !r.stray)?.name ?? rows[0]?.name ?? null);
  const [typing, setTyping] = useState<string | null>(null);
  const [pick, setPick] = useState<Pick | null>(null);
  const row = rows.find((r) => r.name === event) ?? (event ? { name: event, key: 'on.' + event, custom: true } : null);
  const vars = useMemo(() => (row ? eventVars(row, cell !== null) : []), [row, cell]);
  const ctx: PresetContext = useMemo(() => ({
    vars: vars.map((v) => v.name),
    kinds: Object.fromEntries(info.cells.map((c) => [c.name, c.cell.kind])),
    actions: info.actions,
  }), [vars, info]);
  const presets = presetsFor(ctx);
  const typedProblem = typing !== null ? eventNameProblem(typing.trim()) : null;
  const who = cell ? cell.name ?? cell.id : null;

  const choose = (p: Preset, el: HTMLElement) => {
    if (!event) return;
    if (p.need === null) return onCreate(event, presetAction(p.id, null, ctx), p.label);
    setPick({ preset: p, el });
  };
  const done = (p: Preset, value: string) => {
    setPick(null);
    if (event) onCreate(event, presetAction(p.id, value, ctx), p.label);
  };

  let menu = null;
  if (pick) {
    const p = pick.preset;
    let items: PickItem[] = [];
    let empty = '';
    if (p.need === 'collection') {
      items = collectionChoices(collections).map((c) => ({
        key: c.name, text: c.name, label: <code>{c.name}</code>, detail: c.fresh ? 'A new collection, made on the first save' : 'Records are saved here',
        icon: <Save size={14} />, group: c.fresh ? 'New' : 'Collections', onPick: () => done(p, c.name),
      }));
    } else if (p.need === 'event') {
      items = eventChoices(doc).map((c) => ({
        key: c.name, text: c.name, label: <code>{c.name}</code>, detail: c.fresh ? 'A new event' : 'Already used in this document',
        icon: <Send size={14} />, group: c.fresh ? 'New' : 'In this document', onPick: () => done(p, c.name),
      }));
    } else if (p.need === 'action') {
      items = info.actions.map((a) => ({
        key: a.name, text: a.name, label: <code>({[a.name, ...a.params].join(' ')})</code>, detail: a.params.length ? `Fill in ${a.params.join(', ')} next` : 'Takes nothing',
        icon: <SquareFunction size={14} />, onPick: () => done(p, a.name),
      }));
      empty = 'No actions yet. Define one in the document’s Events part.';
    } else {
      items = targetsFor(doc, p.need, cell?.id ?? null).map((t) => {
        const c = session.cell(t.id);
        const I = c ? cellIcon(c) : Zap;
        const preview = info.cells.find((x) => x.id === t.id)?.preview;
        return { key: t.id, text: t.name, label: <code>{t.name}</code>, detail: preview || '—', icon: <I size={14} strokeWidth={1.8} />, onPick: () => done(p, t.name) };
      });
      empty = p.need === 'timer' ? 'No timer here yet. Pick Timer from the / menu on an empty cell.'
        : p.need === 'fetch' ? 'No fetch cell here yet. Pick Fetch from the / menu on an empty cell.'
        : p.need === 'number' ? 'No number to count with yet. Name a Number input or a Data cell in the inspector.'
        : 'No cell to use yet. Give a cell a name in the inspector and it shows up here.';
    }
    menu = (
      <PickMenu anchor={pick.el} title={p.need === 'collection' ? 'Save into' : p.need === 'event' ? 'Which event?' : p.need === 'action' ? 'Which action?' : 'Which cell?'}
        items={items} onClose={() => setPick(null)} search={items.length > 8}
        footer={!items.length ? <p className="pm-note">{empty}</p> : undefined} />
    );
  }

  return (
    <div className="ev-add">
      {onBack && <button type="button" className="btn ghost small ev-back" onClick={onBack}><Undo2 size={13} /> All events</button>}
      <h3 className="ev-step"><span>1</span> When</h3>
      <div className="ev-events" role="group" aria-label="When it runs">
        {rows.map((r) => (
          <button key={r.key} type="button" data-event={r.name} className={cx('ev-chip', event === r.name && typing === null && 'is-on')} aria-pressed={event === r.name && typing === null}
            onClick={() => { setEvent(r.name); setTyping(null); }}>
            {r.name}{has(r) && <small> · has one</small>}
          </button>
        ))}
        {typing === null ? (
          <button type="button" className="ev-chip is-other" onClick={() => setTyping('')}><Plus size={13} /> Another event…</button>
        ) : (
          <span className="ev-typed">
            <input autoFocus value={typing} placeholder="saved" aria-label="Event name" spellCheck={false} autoCapitalize="off"
              aria-invalid={!!typing.trim() && !!typedProblem}
              onChange={(e) => { setTyping(e.target.value); if (!eventNameProblem(e.target.value.trim())) setEvent(e.target.value.trim()); }}
              onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') setTyping(null); }} />
            <button type="button" className="icon-btn" aria-label="Cancel" onClick={() => setTyping(null)}><X size={14} /></button>
          </span>
        )}
      </div>
      {typing !== null && typing.trim() && typedProblem && <p className="ev-warn">{typedProblem}</p>}
      {row && (typing === null || !typedProblem) && (
        <p className="ev-about">
          <b>{sayEvent(row.name, who)}</b>
          {vars.length > 1 && <> · it knows {vars.filter((v) => v.name !== 'event').map((v, i, a) => <span key={v.name}><code>{v.name}</code>{i < a.length - 1 ? ', ' : ''}</span>)}</>}
        </p>
      )}
      <h3 className="ev-step"><span>2</span> What should happen</h3>
      <div className="ev-presets">
        {presets.map((p) => {
          const I = PRESET_ICONS[p.id] ?? Zap;
          return (
            <button key={p.id} type="button" data-preset={p.id} className="ev-preset" disabled={!event || (typing !== null && !!typedProblem)}
              onClick={(e) => choose(p, e.currentTarget)}>
              <span className="ev-preset-ico"><I size={16} /></span>
              <span className="ev-preset-text">
                <b>{p.label}</b>
                <small>{p.detail}</small>
              </span>
              <code className="ev-preset-shape">{p.shape}</code>
            </button>
          );
        })}
        <button type="button" data-preset="empty" className="ev-preset is-plain" disabled={!event || (typing !== null && !!typedProblem)}
          onClick={() => event && onCreate(event, null, 'An empty handler')}>
          <span className="ev-preset-ico"><Plus size={16} /></span>
          <span className="ev-preset-text"><b>Start from nothing</b><small>Build it with Blocks or write the code</small></span>
        </button>
      </div>
      <p className="ev-foot">Everything a preset writes can be changed afterwards by clicking its pieces. Or say it in words with Ask AI.</p>
      {menu}
    </div>
  );
}

/** A preset's action joined to what a handler already does: (do old new). */
export function joinAction(old: string, add: Sx): string {
  if (add === null) return old;
  let x: Sx = null;
  try {
    x = old.trim() ? read(old) : null;
  } catch {
    return old.trimEnd() + '\n' + print(add, 60);
  }
  if (x === null) return print(add, 60);
  const both: Sx = Array.isArray(x) && x[0] === 'do' ? [...x, add] : ['do', x, add];
  return print(both, 60);
}

// ───────────────────────────── a new action ─────────────────────────────

export function NewAction({ taken, onCreate, onBack }: { taken: string[]; onCreate: (name: string, params: string[]) => void; onBack?: () => void }) {
  const [name, setName] = useState(() => {
    for (let n = 1; ; n++) if (!taken.includes(n === 1 ? 'my-action' : `my-action${n}`)) return n === 1 ? 'my-action' : `my-action${n}`;
  });
  const [params, setParams] = useState('');
  const problem = actionNameProblem(name.trim(), taken);
  const create = () => !problem && onCreate(name.trim(), splitParams(params));
  return (
    <div className="ev-add ev-new-action">
      {onBack && <button type="button" className="btn ghost small ev-back" onClick={onBack}><Undo2 size={13} /> All events</button>}
      <h3 className="ev-step"><FunctionSquare size={15} /> A new action</h3>
      <p className="ev-about">A custom action is a function the whole document can call by name, from any handler or button: <code>(greet "Ann")</code>.</p>
      <label className="ev-field">
        <span>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} spellCheck={false} autoCapitalize="off" aria-invalid={!!problem}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') create(); }} />
      </label>
      <label className="ev-field">
        <span>Inputs <small>(optional, separated by commas)</small></span>
        <input value={params} placeholder="who, amount" onChange={(e) => setParams(e.target.value)} spellCheck={false} autoCapitalize="off"
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') create(); }} />
      </label>
      {problem && name.trim() && <p className="ev-warn">{problem}</p>}
      <div>
        <button type="button" className="btn solid" disabled={!!problem} onClick={create}><Plus size={14} /> Create {name.trim() ? <code>({[name.trim(), ...splitParams(params)].join(' ')})</code> : null}</button>
      </div>
    </div>
  );
}

// ───────────────────────────── one handler ─────────────────────────────

export function HandlerBar({ title, isAction, canTry, dirty, removed, onTry, onRemove, onRestore }: {
  title: string;
  isAction: boolean;
  canTry: boolean;
  dirty: boolean;
  removed: boolean;
  onTry: () => void;
  onRemove: () => void;
  onRestore: () => void;
}) {
  return (
    <>
      <div className="ev-bar">
        <span className="ev-bar-ico">{isAction ? <SquareFunction size={15} /> : <Zap size={15} />}</span>
        <b className="ev-bar-title">{title}</b>
        <div className="grow" />
        {!isAction && (
          <button type="button" className="btn soft ev-try" onClick={onTry} disabled={!canTry}
            title={dirty ? 'Apply your changes, then run this handler once with sample data' : 'Run this handler once with sample data. Its changes are real; undo puts them back.'}>
            <Play size={14} /> {dirty ? <><span className="ev-wide">Apply and try</span><span className="ev-narrow">Try</span></> : 'Try it'}
          </button>
        )}
        {!removed && (
          <button type="button" className="btn ghost ev-remove" onClick={onRemove} title={isAction ? 'Remove this action' : 'Remove this handler'} aria-label={isAction ? 'Remove this action' : 'Remove this handler'}>
            <Trash2 size={14} />
          </button>
        )}
      </div>
      {removed && (
        <p className="ev-removed" role="status">
          {isAction ? 'This action goes' : 'This handler goes'} when you apply.
          <button type="button" className="btn ghost small" onClick={onRestore}><RotateCcw size={13} /> Put it back</button>
        </p>
      )}
    </>
  );
}

export interface Ran {
  key: string;
  title: string;
  lines: RunLine[];
  at: number;
}

export function RunView({ ran, onClose }: { ran: Ran; onClose: () => void }) {
  const time = new Date(ran.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  const failed = ran.lines.some((l) => l.error);
  return (
    <div className={cx('ev-run', failed && 'is-bad')} role="status" aria-live="polite">
      <div className="ev-run-head">
        <CirclePlay size={14} />
        <b>Tried at {time}</b>
        <div className="grow" />
        <button type="button" className="icon-btn" aria-label="Close what ran" onClick={onClose}><X size={14} /></button>
      </div>
      {ran.lines.length ? (
        <ul>
          {ran.lines.map((l, i) => (
            <li key={i} style={{ '--d': Math.min(l.depth, 4) } as React.CSSProperties}>
              <span className="ev-run-who">{l.head}</span>
              <span className="ev-run-did">{l.did.length ? l.did.join('; ') : 'changed nothing'}</span>
              {l.error && <span className="ev-run-err">{l.error}</span>}
            </li>
          ))}
        </ul>
      ) : <p className="ev-run-none">Nothing ran: nothing handles it yet.</p>}
      <p className="ev-run-foot">Its changes are real; undo puts them back. Every run is also listed in Activity.</p>
    </div>
  );
}
