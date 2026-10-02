// The code studio: a roomy editor for a cell's expression, opened over the
// document. Code and Blocks edit the same draft; the side has Ask AI, the
// functions and the cells; the foot shows what the draft gives right now.
// Its Events part edits what a cell, or the document, does when something
// happens: one draft per handler (on.change) and per custom action.

import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Blocks as BlocksIcon, BookOpen, Braces, Code2, Copy, Eye, EyeOff, FileText, PencilLine, Play, Radio, Sparkles, Trash2, Wand2, X, Zap,
} from 'lucide-react';
import type { Cell, Doc, Sx } from '../../core/types';
import { type Effect, formatValue, print, read, show, truthy } from '../../core/sx';
import { evalIn, plainValue, runAction } from '../../core/engine';
import { bindings, sampleData } from '../../core/events';
import { cx, useS, useSession } from '../editor/ctx';
import { CodeEditor, type CodeEditorHandle } from './CodeEditor';
import { Blocks, type BlocksHandle } from './Blocks';
import { AskPanel } from './AskPanel';
import { CellsPanel, FunctionsPanel } from './Panels';
import { blankCall } from './edits';
import { templateFor } from './docs';
import { insertionPoint, lex } from './lexer';
import { KIND_NAMES, cellIcon } from './info';
import { DOC, type StudioOpen, type StudioTab, closeStudio, codeProps, openEvents, openStudio, studioState, useStudio } from './store';
import {
  type EventVar, actionsOf, changedKeys, draftOps, eventRows, eventVars, handlersOf, newAction, paramsOf, sayEvent, sayTrace,
} from './handlers';
import { AddHandler, EventsRail, HandlerBar, NewAction, type Ran, RunView, isEventsKey, isHandlerKey, joinAction } from './EventsPart';
import './code.css';

// openStudio and closeStudio live in ./store, so this file exports only components (fast refresh stays happy).

function propLabel(cell: Cell | null, prop: string): string {
  if (prop.startsWith('on.')) return `The ${prop.slice(3)} handler`;
  if (prop.startsWith('actions.')) return `The action ${prop.slice(8)}`;
  if (prop === 'expr') return ({ chart: 'Data', table: 'Rows', list: 'Items', calendar: 'Events', stat: 'Value' } as Record<string, string>)[cell?.kind ?? ''] ?? 'Formula';
  return ({ do: 'Action', hidden: 'Hidden when', options: 'Options', compare: 'Compare with', trend: 'Trend' } as Record<string, string>)[prop] ?? prop;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iP(hone|ad|od)/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl+';

function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const fn = () => setOn(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, [query]);
  return on;
}

/** Opens the studio with ⌘E and shows it while open. Mounted inside the document's session. */
export function StudioHost() {
  const session = useSession();
  const open = useStudio();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'e' || studioState()) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      const s = session.state;
      const id = s.selection.at(-1);
      const cell = id ? session.cell(id) : undefined;
      if (!cell) return;
      e.preventDefault();
      const prop = codeProps(cell)[0];
      // A cell with no code of its own (a timer) may still react to events.
      if (!prop && s.doc && eventRows(s.doc, cell).length) return openEvents({ cell: cell.id });
      if (!prop) return session.toast('This cell holds no code yet. Press / to make it a formula.');
      openStudio({ cell: cell.id, prop });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [session]);
  // The studio belongs to this document; leaving it closes the studio.
  useEffect(() => () => closeStudio(), []);
  if (!open) return null;
  return <Studio key={open.n} open={open} />;
}

type Main = 'code' | 'blocks';
type Side = 'ask' | 'functions' | 'cells';

/** The drafts the studio starts from: a cell's code props and handlers, or the document's handlers and actions. */
function draftsFrom(doc: Doc | null, cell: Cell | null, extra: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (!doc) return out;
  if (cell) {
    for (const p of new Set([...codeProps(cell), ...extra.filter((k) => !isEventsKey(k))])) {
      const v = (cell as unknown as Record<string, Sx | undefined>)[p];
      out[p] = v === undefined || v === null || (p === 'hidden' && v === false) ? '' : print(v, 60);
    }
  }
  for (const [k, v] of Object.entries(handlersOf(doc, cell))) out['on.' + k] = print(v, 60);
  if (!cell) for (const a of actionsOf(doc)) out['actions.' + a.name] = print(a.fn, 60);
  return out;
}

function Studio({ open }: { open: StudioOpen }) {
  const session = useSession();
  const doc = useS((s) => s.doc);
  const computed = useS((s) => s.computed);
  const isDoc = open.cell === DOC;
  const cell = doc && !isDoc ? session.cell(open.cell) ?? null : null;
  /** The cell handlers belong to; null for the document. */
  const target = isDoc ? null : cell?.id ?? null;
  const phone = useMedia('(max-width: 699px)');

  // A draft per property, handler and action, so switching between them keeps what was typed.
  const [initial, setInitial] = useState<Record<string, string>>(() => {
    const s = session.state;
    return draftsFrom(s.doc, isDoc ? null : session.cell(open.cell) ?? null, [open.prop]);
  });
  const initialRef = useRef(initial);
  initialRef.current = initial;
  const [drafts, setDrafts] = useState<Record<string, string>>(() => ({ ...initial, ...(open.text !== undefined ? { [open.prop]: open.text } : {}) }));
  // A handler that isn't there yet opens where one is added, on that event.
  const [prop, setProp] = useState(() => (open.prop.startsWith('on.') && !(open.prop in initial) && open.text === undefined ? 'on' : open.prop));
  const [addEvent, setAddEvent] = useState<string | null>(() => (open.prop.startsWith('on.') && !(open.prop in initial) ? open.prop.slice(3) : null));
  const editable = !isEventsKey(prop) || isHandlerKey(prop);
  const draft = editable ? drafts[prop] ?? '' : '';
  const setDraftFor = (k: string, t: string) => setDrafts((d) => ({ ...d, [k]: t }));
  const setDraft = (t: string) => editable && setDraftFor(prop, t);

  const startTab: StudioTab = open.tab ?? 'code';
  const opensEvents = startTab === 'events' || isDoc;
  const [main, setMain] = useState<Main>(startTab === 'blocks' || (opensEvents && isHandlerKey(prop)) ? 'blocks' : 'code');
  // In the Events part the names an event brings matter most; elsewhere, Ask AI for a blank and the functions once there is code.
  const [side, setSide] = useState<Side>(startTab === 'ask' || startTab === 'cells' || startTab === 'functions' ? startTab : opensEvents ? (isHandlerKey(prop) ? 'cells' : 'ask') : !draft.trim() ? 'ask' : 'functions');
  const [tab, setTab] = useState<StudioTab>(opensEvents ? (isHandlerKey(prop) ? 'blocks' : 'events') : startTab);
  const [confirm, setConfirm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [ran, setRan] = useState<Ran | null>(null);
  /** Phones: the Events tab shows the list rather than adding. */
  const [list, setList] = useState(false);
  const editor = useRef<CodeEditorHandle>(null);
  const blocks = useRef<BlocksHandle>(null);
  const lastSel = useRef<[number, number]>([draft.length, draft.length]);
  const panel = useRef<HTMLDivElement>(null);

  const dirtyProps = changedKeys(drafts, initial);
  const dirty = dirtyProps.length > 0;
  const props = cell ? [...new Set([...codeProps(cell), ...(isEventsKey(open.prop) ? [] : [open.prop])])] : [];
  const rows = useMemo(() => (doc && (isDoc || cell) ? eventRows(doc, cell) : []), [doc, cell, isDoc]);
  const inEvents = isDoc || isEventsKey(prop);
  const evRow = prop.startsWith('on.') ? rows.find((r) => r.key === prop) ?? { name: prop.slice(3), key: prop, custom: true } : null;
  const who = cell ? cell.name ?? cell.id : null;
  /** The names the code being edited finds bound: an event's data, or an action's inputs. */
  const vars: EventVar[] = useMemo(() => {
    if (evRow) return eventVars(evRow, !isDoc);
    if (prop.startsWith('actions.')) {
      try {
        return paramsOf(read(drafts[prop] ?? '')).map((name) => ({ name, does: 'an input of this action' }));
      } catch {
        return [];
      }
    }
    return [];
  }, [evRow?.key, prop, isDoc, prop.startsWith('actions.') ? drafts[prop] : null]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => setConfirm(false), [drafts]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  // Take focus into the dialog (unless a field inside already has it), and leave it somewhere sensible on close.
  const [before] = useState(() => document.activeElement as HTMLElement | null);
  useEffect(() => {
    if (panel.current && !panel.current.contains(document.activeElement)) panel.current.focus({ preventScroll: true });
    return () => {
      if (before?.isConnected && before.tagName === 'BUTTON') before.focus();
      else (document.activeElement as HTMLElement | null)?.blur?.();
    };
  }, [before]);

  // On phones, fit the sheet above the on-screen keyboard.
  useLayoutEffect(() => {
    const vv = window.visualViewport;
    if (!phone || !vv || !panel.current) return;
    const fit = () => panel.current?.style.setProperty('--vvh', `${vv.height}px`);
    fit();
    vv.addEventListener('resize', fit);
    return () => vv.removeEventListener('resize', fit);
  }, [phone]);

  const codeVisible = editable && (phone ? tab === 'code' : main === 'code');
  const blocksVisible = editable && (phone ? tab === 'blocks' : main === 'blocks');
  const goCode = () => (phone ? setTab('code') : setMain('code'));
  const goBlocks = () => (phone ? setTab('blocks') : setMain('blocks'));

  /** Edit a handler or action (or a code prop): on phones that means its editor tab. */
  const choose = (k: string) => {
    setProp(k);
    setRan(null);
    if (phone && isHandlerKey(k) && tab !== 'code' && tab !== 'blocks') setTab('blocks');
  };
  const goEvents = () => {
    const first = Object.keys(drafts).find((k) => k.startsWith('on.') && (drafts[k] ?? '').trim());
    if (phone) {
      setTab('events');
      if (!isEventsKey(prop)) setProp(first ?? 'on');
      setList(isDoc || !!first);
    } else if (!isEventsKey(prop)) {
      setProp(first ?? 'on');
      if (first) setMain('blocks');
    }
  };

  /** Put code at the caret: in the editor when it is showing, else into the draft where the caret last was. */
  const insertCode = (text: string, select?: [number, number] | null) => {
    if (!editable) return setNotice('Choose a handler first, or add one.');
    if (codeVisible && editor.current) return editor.current.insert(text, select);
    if (blocksVisible && blocks.current) {
      try {
        return blocks.current.insert(read(text));
      } catch {
        /* fall through to the text */
      }
    }
    const [s, e] = lastSel.current;
    let a = Math.min(s, draft.length);
    let b = Math.min(e, draft.length);
    if (a === b) a = b = insertionPoint(draft, a);
    const pad = a > 0 && !/[\s({]$/.test(draft.slice(0, a)) ? ' ' : '';
    setDraft(draft.slice(0, a) + pad + text + draft.slice(b));
    lastSel.current = [a + pad.length + text.length, a + pad.length + text.length];
    goCode();
    setNotice('Added to the code.');
  };
  const insertFunction = (name: string) => {
    if (blocksVisible && blocks.current) return blocks.current.insert(name === '{ }' ? { key: null } : blankCall(name));
    const t = templateFor(name);
    insertCode(t.text, t.select);
  };
  const insertCell = (name: string) => {
    if (blocksVisible && blocks.current) return blocks.current.insert('$' + name);
    insertCode(name);
  };

  // ── what the draft gives ──

  const result = useMemo(() => {
    const s = session.state;
    if (!doc || (!isDoc && !cell) || !editable) return null;
    if (!draft.trim()) return { empty: true as const };
    let x: Sx;
    try {
      x = read(draft);
    } catch (e) {
      return { error: (e as Error).message, reading: true };
    }
    const world = session.world(s.now);
    const at = cell?.id ?? doc.root.id;
    if (prop === 'do' || prop.startsWith('on.')) {
      try {
        // A handler is tried with the data its event would bring, made up from what the cell holds now.
        const vars = prop.startsWith('on.')
          ? bindings(doc, { cell: target, name: prop.slice(3), data: sampleData(doc, world, cell, prop.slice(3)) }, target)
          : undefined;
        return { effects: runAction(doc, world, at, x, vars) };
      } catch (e) {
        return { error: (e as Error).message };
      }
    }
    const r = evalIn(doc, world, x, at);
    if (prop.startsWith('actions.') && r.error === undefined && typeof r.value !== 'function') return { error: 'an action must be a function, like (fn (who) (set! greeting who))' };
    return r.error !== undefined ? { error: r.error } : { value: r.value };
  }, [draft, prop, doc, computed, cell, editable]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Write every changed draft in one dispatch; with `close`, the studio closes after. */
  const commit = (close: boolean): boolean => {
    if (!doc || (!isDoc && !cell)) {
      closeStudio();
      return false;
    }
    const r = draftOps(target, drafts, dirtyProps);
    if ('error' in r) {
      setProp(r.key);
      goCode();
      setNotice(`${propLabel(cell, r.key)} is not finished: ${r.error}.`);
      return false;
    }
    if (r.ops.length && !session.dispatch(r.ops.length === 1 ? r.ops[0] : r.ops)) return false;
    if (close) closeStudio();
    else setInitial({ ...initial, ...drafts });
    return true;
  };
  const apply = () => void commit(true);

  /** The document changed under the studio (Ask AI applied ops): take it in, keeping what was being edited. */
  const resync = () => {
    const fresh = draftsFrom(session.state.doc, isDoc ? null : session.cell(open.cell) ?? null, [open.prop]);
    setDrafts((d) => {
      const out = { ...fresh };
      for (const k of changedKeys(d, initialRef.current)) out[k] = d[k];
      return out;
    });
    setInitial(fresh);
    // Show what was just written when it is one handler or action here.
    const added = Object.keys(fresh).filter((k) => isHandlerKey(k) && fresh[k] !== initialRef.current[k]);
    if (added.length && !isHandlerKey(prop)) {
      setProp(added[0]);
      goBlocks();
    }
    setNotice(added.length > 1 ? 'Applied. The handlers are in the list.' : 'Applied.');
  };

  const tryIt = () => {
    if (!prop.startsWith('on.')) return;
    if (dirty && !commit(false)) return;
    const name = prop.slice(3);
    const trace = session.test(target, name);
    setRan({ key: prop, title: sayEvent(name, who), at: Date.now(), lines: sayTrace(trace, (id) => session.cell(id)?.name ?? id) });
  };

  const removeHandler = () => {
    if (!isHandlerKey(prop)) return;
    setRan(null);
    if ((initial[prop] ?? '').trim()) return setDraftFor(prop, '');
    // Never applied: it just goes.
    setDrafts((d) => {
      const { [prop]: _gone, ...rest } = d;
      return rest;
    });
    setProp(prop.startsWith('actions.') ? 'actions' : 'on');
  };

  const createHandler = (event: string, action: Sx, label: string) => {
    const key = 'on.' + event;
    const code = joinAction(drafts[key] ?? '', action);
    setDraftFor(key, code);
    setProp(key);
    setAddEvent(null);
    setRan(null);
    goBlocks();
    setNotice(action === null ? 'Build it with the pieces, then Apply.' : `${label}: added. Click any piece to change it, then Apply.`);
  };

  const createAction = (name: string, params: string[]) => {
    const key = 'actions.' + name;
    setDraftFor(key, newAction(params));
    setProp(key);
    goBlocks();
    setNotice('Fill in what it does, then Apply.');
  };

  const format = () => {
    if (!draft.trim()) return;
    if (lex(draft).some((t) => t.kind === 'comment')) return setNotice('Formatting would drop the ; comments, so it was left as it is.');
    try {
      const pretty = print(read(draft), 60);
      if (pretty !== draft) setDraft(pretty);
    } catch (e) {
      setNotice(`Fix this first: ${(e as Error).message}.`);
    }
  };

  const requestClose = () => {
    if (dirty && !confirm) return setConfirm(true);
    closeStudio();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === 'Escape' && !e.defaultPrevented) {
      e.preventDefault();
      requestClose();
    } else if (mod && e.key === 'Enter') {
      e.preventDefault();
      apply();
    } else if (mod && e.key.toLowerCase() === 'e') {
      e.preventDefault();
    } else if (e.key === 'Tab' && panel.current) {
      // Keep Tab inside the dialog.
      const all = [...panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), input, textarea, select, [tabindex="0"]')].filter((el) => el.offsetParent !== null);
      if (!all.length) return;
      const first = all[0];
      const last = all[all.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };

  if (!doc || (!isDoc && !cell)) {
    return createPortal(
      <div className="studio-scrim" onPointerDown={() => closeStudio()}>
        <div className="studio is-gone" role="alertdialog" aria-label="Cell gone">
          <p>This cell is no longer in the document.</p>
          <button type="button" className="btn soft" onClick={() => closeStudio()}>Close</button>
        </div>
      </div>,
      document.body,
    );
  }

  const Icon = cell ? cellIcon(cell) : FileText;
  const label = `${propLabel(cell, prop)} of ${who ?? 'the document'}`;
  const codeEditor = (
    <CodeEditor
      key={prop}
      ref={editor}
      value={draft}
      onChange={setDraft}
      cell={target ?? undefined}
      label={label}
      placeholder={PLACEHOLDERS[prop.startsWith('on.') ? 'on' : prop.startsWith('actions.') ? 'actions' : prop] ?? PLACEHOLDERS.expr}
      className="studio-ed"
      autoFocus={!phone && startTab !== 'ask' && !opensEvents}
      commitKey="mod"
      signature="bar"
      messages={false}
      onCommit={apply}
      onCancel={requestClose}
      onSelect={(s) => { lastSel.current = s; }}
      locals={vars.length ? vars : undefined}
    />
  );
  const blocksView = <Blocks key={prop} ref={blocks} text={draft} onChange={setDraft} cell={target ?? undefined} onShowCode={goCode} vars={vars} />;

  // Ask AI writes what is being edited; in the Events part it can also write several handlers from one sentence.
  const askTarget = prop.startsWith('on.') ? prop : prop.startsWith('actions') ? 'action' : prop === 'on' ? 'events' : prop;
  const askView = (
    <AskPanel
      key={askTarget}
      cell={target ?? undefined} prop={askTarget} draft={draft} autoFocus={startTab === 'ask' && !phone}
      targets={prop.startsWith('on.') ? [{ value: prop, label: 'This handler' }, { value: 'events', label: 'Anything, in words' }] : undefined}
      onUse={(code) => {
        if (prop === 'actions') {
          const taken = Object.keys(drafts).filter((k) => k.startsWith('actions.')).map((k) => k.slice(8));
          let name = 'my-action';
          for (let n = 2; taken.includes(name); n++) name = `my-action${n}`;
          setDraftFor('actions.' + name, code);
          setProp('actions.' + name);
        } else if (!editable) return setNotice('Choose an event first.');
        else setDraft(code);
        lastSel.current = [code.length, code.length];
        goCode();
        setNotice('The proposal is in the code. Apply to keep it.');
      }}
      onInsert={(code) => insertCode(code)}
      onApplied={resync}
    />
  );
  const cellsView = <CellsPanel onInsert={insertCell} self={target ?? undefined} vars={vars} varsTitle={prop.startsWith('actions.') ? 'Inputs of this action' : 'From the event'} />;

  // ── the Events part ──

  const rail = (
    <EventsRail rows={rows} isDoc={isDoc} drafts={drafts} initial={initial} prop={prop}
      onPick={choose}
      onAdd={(ev) => { setAddEvent(ev ?? null); setProp('on'); setRan(null); setList(false); if (phone) setTab('events'); }}
      onNewAction={() => { setProp('actions'); setRan(null); setList(false); if (phone) setTab('events'); }} />
  );
  // On phones the list and the adding take turns; back goes to the list when there is something in it.
  const something = isDoc || Object.keys(drafts).some((k) => isHandlerKey(k) && (drafts[k] ?? '').trim());
  const back = phone && something ? () => setList(true) : undefined;
  const adding = (
    <AddHandler key={addEvent ?? ''} doc={doc} cell={cell} rows={rows} drafts={drafts} initial={initial} event={addEvent} onCreate={createHandler} onBack={back} />
  );
  const newActionView = (
    <NewAction taken={Object.keys({ ...initial, ...drafts }).filter((k) => k.startsWith('actions.') && (drafts[k] ?? initial[k] ?? '').trim()).map((k) => k.slice(8))}
      onCreate={createAction} onBack={back} />
  );
  const removed = isHandlerKey(prop) && !(drafts[prop] ?? '').trim() && !!(initial[prop] ?? '').trim();
  const handlerBar = isHandlerKey(prop) && (
    <HandlerBar
      title={prop.startsWith('on.') ? sayEvent(prop.slice(3), who) : `Action (${[prop.slice(8), ...vars.map((v) => v.name)].join(' ')})`}
      isAction={prop.startsWith('actions.')}
      canTry={!!draft.trim()}
      dirty={dirty}
      removed={removed}
      onTry={tryIt}
      onRemove={removeHandler}
      onRestore={() => setDraftFor(prop, initial[prop] ?? '')}
    />
  );
  const runView = ran && ran.key === prop && <RunView ran={ran} onClose={() => setRan(null)} />;

  const editorTabs = (
    <Tabs label="Editor" value={main} onChange={setMain} items={[
      { value: 'code', label: 'Code', icon: <Code2 size={14} /> },
      { value: 'blocks', label: 'Blocks', icon: <BlocksIcon size={14} /> },
    ]} extra={<span className="st-hint">{main === 'code' ? <>Click a {inEvents ? 'name' : 'cell’s name'} on the right to add it · <kbd>Ctrl</kbd> <kbd>Space</kbd> suggests</> : 'Click any piece to change it'}</span>} />
  );

  let desktopMain: ReactNode;
  if (inEvents) {
    desktopMain = (
      <div className="ev-split">
        {rail}
        <div className="ev-pane">
          {isHandlerKey(prop) ? (
            <>
              {handlerBar}
              {editorTabs}
              {main === 'code' ? codeEditor : <div className="st-pane">{blocksView}</div>}
              {runView}
            </>
          ) : prop === 'actions' ? <div className="st-pane">{newActionView}</div> : <div className="st-pane">{adding}</div>}
        </div>
      </div>
    );
  } else {
    desktopMain = (
      <>
        {editorTabs}
        {main === 'code' ? codeEditor : <div className="st-pane">{blocksView}</div>}
      </>
    );
  }

  let phoneMain: ReactNode = null;
  if (tab === 'events') {
    phoneMain = <div className="st-pane">{prop === 'on' && !list ? adding : prop === 'actions' && !list ? newActionView : rail}</div>;
  } else if (tab === 'code' || tab === 'blocks') {
    if (!editable) {
      phoneMain = (
        <div className="st-pane ev-pick-first">
          <p>Choose a handler in Events first, or add one.</p>
          <button type="button" className="btn soft" onClick={() => setTab('events')}><Radio size={14} /> Events</button>
        </div>
      );
    } else {
      phoneMain = (
        <>
          {handlerBar}
          {tab === 'code' ? codeEditor : <div className="st-pane">{blocksView}</div>}
          {runView}
        </>
      );
    }
  } else if (tab === 'ask') phoneMain = <div className="st-pane">{askView}</div>;
  else if (tab === 'functions') phoneMain = <FunctionsPanel onInsert={insertFunction} />;
  else if (tab === 'cells') phoneMain = cellsView;

  const evDirty = dirtyProps.some(isEventsKey);
  const phoneTabs = ([
    ...(isDoc ? [['events', 'Events', Radio]] : []),
    ['code', 'Code', Code2], ['blocks', 'Blocks', BlocksIcon],
    ...(!isDoc && rows.length ? [['events', 'Events', Radio]] : []),
    ['ask', 'Ask', Sparkles], ['functions', 'Functions', BookOpen], ['cells', isDoc || inEvents ? 'Names' : 'Cells', Braces],
  ] as [StudioTab, string, typeof Code2][]);

  return createPortal(
    <div className={cx('studio-scrim', phone && 'is-phone')} onPointerDown={(e) => { if (e.target === e.currentTarget) requestClose(); }}>
      <div ref={panel} className={cx('studio', phone && 'is-phone', inEvents && 'is-events')} role="dialog" aria-modal="true" aria-labelledby="studio-title" tabIndex={-1} onKeyDown={onKeyDown}>
        <header className="st-head">
          <span className="st-ico"><Icon size={16} strokeWidth={1.8} /></span>
          <div className="st-title">
            <h2 id="studio-title">{isDoc ? doc.meta.title || 'This document' : who}</h2>
            <small>
              {isDoc ? 'The document' : cell ? <>{KIND_NAMES[cell.kind] ?? cell.kind}{cell.name ? <> · <code>{cell.id}</code></> : cell.label ? <> · {cell.label}</> : null}</> : null}
            </small>
          </div>
          {isDoc ? (
            <span className="st-prop"><Radio size={13} /> Events and actions</span>
          ) : props.length + (rows.length ? 1 : 0) > 1 ? (
            <div className="seg st-props" role="group" aria-label="Which code to edit">
              {props.map((p) => (
                <button key={p} type="button" className={cx(p === prop && 'is-on')} aria-pressed={p === prop} onClick={() => { setProp(p); if (phone && tab === 'events') setTab('code'); }}>
                  {p === 'hidden' ? <EyeOff size={13} /> : p === 'do' ? <Zap size={13} /> : null}
                  {propLabel(cell, p)}
                  {dirtyProps.includes(p) && <i className="st-dirty" aria-label="changed" />}
                </button>
              ))}
              {!!rows.length && (
                <button type="button" className={cx('st-events-btn', inEvents && 'is-on')} aria-pressed={inEvents} onClick={goEvents}>
                  <Radio size={13} /> Events
                  {evDirty && <i className="st-dirty" aria-label="changed" />}
                </button>
              )}
            </div>
          ) : (
            <span className="st-prop">{props[0] ? propLabel(cell, props[0]) : rows.length ? 'Events' : ''}</span>
          )}
          <div className="grow" />
          <button type="button" className="icon-btn" title="Close (Esc)" aria-label="Close" onClick={requestClose}><X size={17} /></button>
        </header>

        {phone ? (
          <div className="st-body">
            <section className="st-main">{phoneMain}</section>
          </div>
        ) : (
          <div className="st-body">
            <section className="st-main">{desktopMain}</section>
            <aside className="st-side">
              <Tabs label="Help" value={side} onChange={setSide} items={[
                { value: 'ask', label: 'Ask AI', icon: <Sparkles size={14} /> },
                { value: 'functions', label: 'Functions', icon: <BookOpen size={14} /> },
                { value: 'cells', label: inEvents ? 'Names' : 'Cells', icon: <Braces size={14} /> },
              ]} />
              <div className="st-side-body">
                {side === 'ask' && askView}
                {side === 'functions' && <FunctionsPanel onInsert={insertFunction} />}
                {side === 'cells' && cellsView}
              </div>
            </aside>
          </div>
        )}

        <footer className="st-foot">
          {editable ? <Result result={result} cell={cell} prop={prop} doc={doc} params={vars.map((v) => v.name)} /> : (
            <div className="st-result"><span className="faint">{prop === 'actions' ? 'Name the action and its inputs, then build what it does.' : 'Pick when it runs and what should happen. Nothing changes until you apply.'}</span></div>
          )}
          <div className="st-actions">
            {notice && !confirm && <span className="st-notice" role="status">{notice}</span>}
            {confirm ? (
              <>
                <span className="st-confirm" role="alert">Discard your changes?</span>
                <button type="button" className="btn ghost" onClick={() => setConfirm(false)}>Keep editing</button>
                <button type="button" className="btn danger" onClick={() => closeStudio()}><Trash2 size={14} /> Discard</button>
              </>
            ) : (
              <>
                {!phone && <button type="button" className="btn ghost" onClick={requestClose}>Cancel</button>}
                <button type="button" className="btn ghost" onClick={format} disabled={!draft.trim()} title="Lay the code out neatly" aria-label="Format"><Wand2 size={14} />{!phone && ' Format'}</button>
                <button type="button" className="btn solid st-apply" onClick={apply} title={`Apply (${MOD}Enter)`}>
                  Apply{!phone && <kbd className="st-kbd">{MOD}↵</kbd>}
                </button>
              </>
            )}
          </div>
        </footer>

        {phone && (
          <nav className="st-tabbar" role="tablist" aria-label="Studio">
            {phoneTabs.map(([v, l, I]) => (
              <button key={v} type="button" role="tab" aria-selected={tab === v} className={cx(tab === v && 'is-on')}
                onClick={() => { if (v === 'events') goEvents(); else setTab(v); }}>
                <I size={18} strokeWidth={1.8} />
                <span>{l}</span>
              </button>
            ))}
          </nav>
        )}
      </div>
    </div>,
    document.body,
  );
}

const PLACEHOLDERS: Record<string, string> = {
  expr: '(* qty price)',
  do: '(set! count (+ count 1))',
  hidden: '(= total 0)',
  options: '(list "Small" "Medium" "Large")',
  compare: '(get (last (rows "months")) "total")',
  trend: '(column (rows "months") "total")',
  on: '(set! status value)',
  actions: '(fn (who) (set! greeting who))',
};

function Tabs<T extends string>({ label, value, onChange, items, extra }: {
  label: string; value: T; onChange: (v: T) => void; items: { value: T; label: string; icon: ReactNode }[]; extra?: ReactNode;
}) {
  return (
    <div className="st-tabs">
      <div role="tablist" aria-label={label} className="st-tablist">
        {items.map((it, i) => (
          <button
            key={it.value} type="button" role="tab" aria-selected={value === it.value} tabIndex={value === it.value ? 0 : -1}
            className={cx(value === it.value && 'is-on')}
            onClick={() => onChange(it.value)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
              e.preventDefault();
              const next = items[(i + (e.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length];
              onChange(next.value);
              (e.currentTarget.parentElement?.children[items.indexOf(next)] as HTMLElement | undefined)?.focus();
            }}
          >
            {it.icon}{it.label}
          </button>
        ))}
      </div>
      {extra}
    </div>
  );
}

type ResultState = { empty: true } | { error: string; reading?: boolean } | { effects: Effect[] } | { value: unknown } | null;

function Result({ result, cell, prop, doc, params }: { result: ResultState; cell: Cell | null; prop: string; doc: Doc; params: string[] }) {
  const session = useSession();
  if (!result) return <div className="st-result" />;
  const currency = typeof doc.meta.currency === 'string' ? doc.meta.currency : 'USD';
  const handler = prop.startsWith('on.');
  const action = prop.startsWith('actions.');
  let body: ReactNode;
  let tone = '';
  if ('empty' in result) {
    body = <span className="faint">{prop === 'hidden' ? 'Empty: the cell always shows.' : handler ? 'Empty: nothing happens. Build it with Blocks, write it, or ask AI.' : 'Nothing yet. Type some code, build it with Blocks, or ask AI.'}</span>;
  } else if ('error' in result) {
    tone = result.reading ? 'is-warn' : 'is-error';
    body = <span>{result.reading ? 'Not finished: ' : ''}{result.error}</span>;
  } else if ('effects' in result) {
    const name = (id: string) => session.cell(id)?.name ?? id;
    const fx = result.effects;
    // A handler's bar already says when it runs.
    const what = handler ? 'Tried with sample data, it would' : 'This is an action; it runs when the button is pressed.';
    body = (
      <div className="st-effects">
        <span className="st-effects-note"><Play size={12} /> {handler ? (fx.length ? `${what}:` : `${what} change nothing.`) : <>{what}{fx.length ? ' Right now it would:' : ' Right now it would change nothing.'}</>}</span>
        {!!fx.length && (
          <ul>
            {fx.slice(0, 6).map((e, i) => <li key={i}>{describeEffect(e, name)}</li>)}
            {fx.length > 6 && <li className="faint">and {fx.length - 6} more</li>}
          </ul>
        )}
      </div>
    );
  } else {
    const v = result.value;
    if (prop === 'hidden') {
      body = truthy(v) ? <><EyeOff size={13} /> Hidden right now</> : <><Eye size={13} /> Shown right now</>;
    } else if (action) {
      body = <><span className="cf-eq">ƒ</span> <code>({[prop.slice(8), ...params].join(' ')})</code> is an action any handler or button can call.</>;
    } else if (typeof v === 'function') {
      body = <><span className="cf-eq">ƒ</span> A function. Call it from another cell as <code>({cell?.name ?? cell?.id} …)</code></>;
    } else {
      const text = prop === 'expr' && cell?.format ? formatValue(v, cell.format, currency) : show(plainValue(v));
      body = <><span className="cf-eq">=</span> <span className="st-value" title={text}>{text === '' ? <span className="faint">nothing</span> : text}</span></>;
      if (Array.isArray(v) || (v && typeof v === 'object')) {
        body = <>{body}<button type="button" className="st-copy" title="Copy the value as JSON" aria-label="Copy the value as JSON" onClick={() => void navigator.clipboard?.writeText(JSON.stringify(plainValue(v)))}><Copy size={12} /></button></>;
      }
    }
  }
  const dry = prop === 'do' || handler;
  return (
    <div className={cx('st-result', tone)} aria-live="polite">
      <span className="st-result-label">{dry ? <PencilLine size={12} /> : null}{dry ? 'Dry run' : 'Result'}</span>
      <div className="st-result-body">{body}</div>
    </div>
  );
}

function describeEffect(e: Effect, name: (id: string) => string): ReactNode {
  const short = (v: unknown) => {
    const s = typeof v === 'string' ? JSON.stringify(v) : show(plainValue(v));
    return s.length > 40 ? s.slice(0, 39) + '…' : s;
  };
  if (e.type === 'insert') return <>Save a record to <b>“{e.collection}”</b>: <code>{short(e.record)}</code></>;
  if (e.type === 'delete') return <>Delete record <code>{e.id}</code> from <b>“{e.collection}”</b></>;
  if (e.type === 'clear') return <>Empty the <b>“{e.collection}”</b> collection</>;
  if (e.type === 'update') return <>Change record <code>{e.id}</code> in <b>“{e.collection}”</b>: <code>{short(e.fields)}</code></>;
  if (e.type === 'emit') return <>Send the event <b>“{e.name}”</b>{e.data != null && <>: <code>{short(e.data)}</code></>}</>;
  if (e.type === 'refresh') return <>Fetch <b>{name(e.cell)}</b> again</>;
  const [kind, id, path, value] = e.op;
  if (kind === 'set' && path === 'value') return <>Set <b>{name(String(id))}</b> to <code>{short(value)}</code></>;
  if (kind === 'set' && path === 'hidden') return value === true ? <>Hide <b>{name(String(id))}</b></> : <>Show <b>{name(String(id))}</b></>;
  if (kind === 'dup') return <>Copy <b>{name(String(id))}</b></>;
  if (kind === 'remove') return <>Remove <b>{name(String(id))}</b></>;
  return <code>{print(e.op as Sx, 60)}</code>;
}
