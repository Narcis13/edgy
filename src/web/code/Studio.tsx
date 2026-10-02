// The code studio: a roomy editor for a cell's expression, opened over the
// document. Code and Blocks edit the same draft; the side has Ask AI, the
// functions and the cells; the foot shows what the draft gives right now.

import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Blocks as BlocksIcon, BookOpen, Braces, Code2, Copy, Eye, EyeOff, PencilLine, Play, Sparkles, Trash2, Wand2, X, Zap,
} from 'lucide-react';
import type { Cell, Json, Op, Sx } from '../../core/types';
import { type Effect, formatValue, print, read, show, truthy } from '../../core/sx';
import { evalIn, plainValue, runAction } from '../../core/engine';
import { cx, useS, useSession } from '../editor/ctx';
import { CodeEditor, type CodeEditorHandle } from './CodeEditor';
import { Blocks, type BlocksHandle } from './Blocks';
import { AskPanel } from './AskPanel';
import { CellsPanel, FunctionsPanel } from './Panels';
import { blankCall } from './edits';
import { templateFor } from './docs';
import { insertionPoint, lex } from './lexer';
import { KIND_NAMES, cellIcon } from './info';
import { type StudioOpen, type StudioTab, closeStudio, codeProps, openStudio, studioState, useStudio } from './store';
import './code.css';

// openStudio and closeStudio live in ./store, so this file exports only components (fast refresh stays happy).

function propLabel(cell: Cell, prop: string): string {
  if (prop === 'expr') return ({ chart: 'Data', table: 'Rows', list: 'Items', calendar: 'Events', stat: 'Value' } as Record<string, string>)[cell.kind] ?? 'Formula';
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

function Studio({ open }: { open: StudioOpen }) {
  const session = useSession();
  const doc = useS((s) => s.doc);
  const computed = useS((s) => s.computed);
  const cell = doc ? session.cell(open.cell) : undefined;
  const phone = useMedia('(max-width: 699px)');

  // A draft per property, so switching between them keeps what was typed.
  const [initial] = useState<Record<string, string>>(() => {
    const c = session.cell(open.cell);
    const out: Record<string, string> = {};
    if (!c) return out;
    for (const p of new Set([...codeProps(c), open.prop])) {
      const v = (c as unknown as Record<string, Sx | undefined>)[p];
      out[p] = v === undefined || v === null || (p === 'hidden' && v === false) ? '' : print(v, 60);
    }
    return out;
  });
  const [drafts, setDrafts] = useState<Record<string, string>>(() => ({ ...initial, ...(open.text !== undefined ? { [open.prop]: open.text } : {}) }));
  const [prop, setProp] = useState(open.prop);
  const draft = drafts[prop] ?? '';
  const setDraft = (t: string) => setDrafts((d) => ({ ...d, [prop]: t }));

  const startTab: StudioTab = open.tab ?? 'code';
  const [main, setMain] = useState<Main>(startTab === 'blocks' ? 'blocks' : 'code');
  const [side, setSide] = useState<Side>(startTab === 'ask' || startTab === 'cells' || startTab === 'functions' ? startTab : !draft.trim() ? 'ask' : 'functions');
  const [tab, setTab] = useState<StudioTab>(startTab);
  const [confirm, setConfirm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const editor = useRef<CodeEditorHandle>(null);
  const blocks = useRef<BlocksHandle>(null);
  const lastSel = useRef<[number, number]>([draft.length, draft.length]);
  const panel = useRef<HTMLDivElement>(null);

  const dirtyProps = Object.keys(drafts).filter((p) => drafts[p] !== initial[p]);
  const dirty = dirtyProps.length > 0;
  const props = cell ? [...new Set([...codeProps(cell), open.prop])] : [open.prop];

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

  const showMain = phone ? tab === 'code' || tab === 'blocks' : true;
  const codeVisible = phone ? tab === 'code' : main === 'code';
  const blocksVisible = phone ? tab === 'blocks' : main === 'blocks';
  const goCode = () => (phone ? setTab('code') : setMain('code'));

  /** Put code at the caret: in the editor when it is showing, else into the draft where the caret last was. */
  const insertCode = (text: string, select?: [number, number] | null) => {
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
    if (!doc || !cell) return null;
    if (!draft.trim()) return { empty: true as const };
    let x: Sx;
    try {
      x = read(draft);
    } catch (e) {
      return { error: (e as Error).message, reading: true };
    }
    const world = { rows: (n: string) => s.collections[n] ?? [], now: s.now };
    if (prop === 'do') {
      try {
        return { effects: runAction(doc, world, cell.id, x) };
      } catch (e) {
        return { error: (e as Error).message };
      }
    }
    const r = evalIn(doc, world, x, cell.id);
    return r.error !== undefined ? { error: r.error } : { value: r.value };
  }, [draft, prop, doc, computed, cell]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = () => {
    if (!cell) return closeStudio();
    const ops: Op[] = [];
    for (const p of dirtyProps) {
      const t = drafts[p];
      let x: Sx;
      try {
        x = t.trim() ? read(t) : null;
      } catch (e) {
        setProp(p);
        goCode();
        setNotice(`${propLabel(cell, p)} is not finished: ${(e as Error).message}.`);
        return;
      }
      if (p === 'hidden' && x === false) x = null;
      ops.push(['set', cell.id, p, x as Json]);
    }
    if (ops.length && !session.dispatch(ops.length === 1 ? ops[0] : ops)) return;
    closeStudio();
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

  if (!cell) {
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

  const Icon = cellIcon(cell);
  const codeEditor = (
    <CodeEditor
      ref={editor}
      value={draft}
      onChange={setDraft}
      cell={cell.id}
      label={`${propLabel(cell, prop)} of ${cell.name ?? cell.id}`}
      placeholder={PLACEHOLDERS[prop] ?? PLACEHOLDERS.expr}
      className="studio-ed"
      autoFocus={!phone && startTab !== 'ask'}
      commitKey="mod"
      signature="bar"
      messages={false}
      onCommit={apply}
      onCancel={requestClose}
      onSelect={(s) => { lastSel.current = s; }}
    />
  );
  const blocksView = <Blocks ref={blocks} text={draft} onChange={setDraft} cell={cell.id} onShowCode={goCode} />;
  const askView = (
    <AskPanel
      cell={cell.id} prop={prop} draft={draft} autoFocus={startTab === 'ask' && !phone}
      onUse={(code) => { setDraft(code); lastSel.current = [code.length, code.length]; goCode(); setNotice('The proposal is in the code. Apply to keep it.'); }}
      onInsert={(code) => insertCode(code)}
    />
  );

  return createPortal(
    <div className={cx('studio-scrim', phone && 'is-phone')} onPointerDown={(e) => { if (e.target === e.currentTarget) requestClose(); }}>
      <div ref={panel} className={cx('studio', phone && 'is-phone')} role="dialog" aria-modal="true" aria-labelledby="studio-title" tabIndex={-1} onKeyDown={onKeyDown}>
        <header className="st-head">
          <span className="st-ico"><Icon size={16} strokeWidth={1.8} /></span>
          <div className="st-title">
            <h2 id="studio-title">{cell.name ?? cell.id}</h2>
            <small>{KIND_NAMES[cell.kind] ?? cell.kind}{cell.name ? <> · <code>{cell.id}</code></> : cell.label ? <> · {cell.label}</> : null}</small>
          </div>
          {props.length > 1 ? (
            <div className="seg st-props" role="group" aria-label="Which code to edit">
              {props.map((p) => (
                <button key={p} type="button" className={cx(p === prop && 'is-on')} aria-pressed={p === prop} onClick={() => setProp(p)}>
                  {p === 'hidden' ? <EyeOff size={13} /> : p === 'do' ? <Zap size={13} /> : null}
                  {propLabel(cell, p)}
                  {dirtyProps.includes(p) && <i className="st-dirty" aria-label="changed" />}
                </button>
              ))}
            </div>
          ) : (
            <span className="st-prop">{propLabel(cell, prop)}</span>
          )}
          <div className="grow" />
          <button type="button" className="icon-btn" title="Close (Esc)" aria-label="Close" onClick={requestClose}><X size={17} /></button>
        </header>

        {phone ? (
          <div className="st-body">
            <section className="st-main">
              {tab === 'code' && codeEditor}
              {tab === 'blocks' && <div className="st-pane">{blocksView}</div>}
              {tab === 'ask' && <div className="st-pane">{askView}</div>}
              {tab === 'functions' && <FunctionsPanel onInsert={insertFunction} />}
              {tab === 'cells' && <CellsPanel onInsert={insertCell} self={cell.id} />}
            </section>
          </div>
        ) : (
          <div className="st-body">
            <section className="st-main">
              <Tabs label="Editor" value={main} onChange={setMain} items={[
                { value: 'code', label: 'Code', icon: <Code2 size={14} /> },
                { value: 'blocks', label: 'Blocks', icon: <BlocksIcon size={14} /> },
              ]} extra={<span className="st-hint">{main === 'code' ? <>Click a cell’s name on the right to add it · <kbd>Ctrl</kbd> <kbd>Space</kbd> suggests</> : 'Click any piece to change it'}</span>} />
              {showMain && (main === 'code' ? codeEditor : <div className="st-pane">{blocksView}</div>)}
            </section>
            <aside className="st-side">
              <Tabs label="Help" value={side} onChange={setSide} items={[
                { value: 'ask', label: 'Ask AI', icon: <Sparkles size={14} /> },
                { value: 'functions', label: 'Functions', icon: <BookOpen size={14} /> },
                { value: 'cells', label: 'Cells', icon: <Braces size={14} /> },
              ]} />
              <div className="st-side-body">
                {side === 'ask' && askView}
                {side === 'functions' && <FunctionsPanel onInsert={insertFunction} />}
                {side === 'cells' && <CellsPanel onInsert={insertCell} self={cell.id} />}
              </div>
            </aside>
          </div>
        )}

        <footer className="st-foot">
          <Result result={result} cell={cell} prop={prop} doc={doc!} />
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
                <button type="button" className="btn ghost" onClick={format} disabled={!draft.trim()} title="Lay the code out neatly"><Wand2 size={14} />{!phone && ' Format'}</button>
                <button type="button" className="btn solid" onClick={apply} title={`Apply (${MOD}Enter)`}>
                  Apply{!phone && <kbd className="st-kbd">{MOD}↵</kbd>}
                </button>
              </>
            )}
          </div>
        </footer>

        {phone && (
          <nav className="st-tabbar" role="tablist" aria-label="Studio">
            {([
              ['code', 'Code', Code2], ['blocks', 'Blocks', BlocksIcon], ['ask', 'Ask', Sparkles], ['functions', 'Functions', BookOpen], ['cells', 'Cells', Braces],
            ] as const).map(([v, l, I]) => (
              <button key={v} type="button" role="tab" aria-selected={tab === v} className={cx(tab === v && 'is-on')} onClick={() => setTab(v)}>
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

function Result({ result, cell, prop, doc }: { result: ResultState; cell: Cell; prop: string; doc: NonNullable<ReturnType<typeof useSession>['state']['doc']> }) {
  const session = useSession();
  if (!result) return <div className="st-result" />;
  const currency = typeof doc.meta.currency === 'string' ? doc.meta.currency : 'USD';
  let body: ReactNode;
  let tone = '';
  if ('empty' in result) {
    body = <span className="faint">{prop === 'hidden' ? 'Empty: the cell always shows.' : 'Nothing yet. Type some code, build it with Blocks, or ask AI.'}</span>;
  } else if ('error' in result) {
    tone = result.reading ? 'is-warn' : 'is-error';
    body = <span>{result.reading ? 'Not finished: ' : ''}{result.error}</span>;
  } else if ('effects' in result) {
    const name = (id: string) => session.cell(id)?.name ?? id;
    const fx = result.effects;
    body = (
      <div className="st-effects">
        <span className="st-effects-note"><Play size={12} /> This is an action; it runs when the button is pressed.{fx.length ? ' Right now it would:' : ' Right now it would change nothing.'}</span>
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
    } else if (typeof v === 'function') {
      body = <><span className="cf-eq">ƒ</span> A function. Call it from another cell as <code>({cell.name ?? cell.id} …)</code></>;
    } else {
      const text = prop === 'expr' && cell.format ? formatValue(v, cell.format, currency) : show(plainValue(v));
      body = <><span className="cf-eq">=</span> <span className="st-value" title={text}>{text === '' ? <span className="faint">nothing</span> : text}</span></>;
      if (Array.isArray(v) || (v && typeof v === 'object')) {
        body = <>{body}<button type="button" className="st-copy" title="Copy the value as JSON" aria-label="Copy the value as JSON" onClick={() => void navigator.clipboard?.writeText(JSON.stringify(plainValue(v)))}><Copy size={12} /></button></>;
      }
    }
  }
  return (
    <div className={cx('st-result', tone)} aria-live="polite">
      <span className="st-result-label">{prop === 'do' ? <PencilLine size={12} /> : null}{prop === 'do' ? 'Dry run' : 'Result'}</span>
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
  if (kind === 'dup') return <>Copy <b>{name(String(id))}</b></>;
  if (kind === 'remove') return <>Remove <b>{name(String(id))}</b></>;
  return <code>{print(e.op as Json, 60)}</code>;
}
