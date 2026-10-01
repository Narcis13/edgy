// A code editor for the document's Lisp: a transparent textarea over the same
// text, coloured. Brackets close themselves and light up in pairs; names
// complete as you type; the call you are in shows its arguments; reading
// errors get a wavy line once you pause.

import {
  type ReactNode, type Ref, useEffect, useId, useImperativeHandle, useMemo, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Database, Sigma } from 'lucide-react';
import type { Cell } from '../../core/types';
import { print, read, show, SxError } from '../../core/sx';
import { evalIn, plainValue } from '../../core/engine';
import { cx, useSession } from '../editor/ctx';
import { type Completion, type Item, GROUP_COLOR, acceptText, argToShow, complete, docFor, signature } from './docs';
import { type Tok, indentAt, insertionPoint, lex, matchAt, spotAt, tokenAt } from './lexer';
import { renderCode } from './Highlight';
import { cellIcon, useCollections, useDocInfo } from './info';
import { canHover, place, useRect } from './float';
import './code.css';

export interface CodeEditorHandle {
  focus(): void;
  /** Replace the selection with text; optionally select part of what was inserted (offsets within it). */
  insert(text: string, select?: [number, number] | null): void;
  selection(): [number, number];
}

export interface CodeEditorProps {
  value: string;
  onChange: (text: string) => void;
  /** The cell the code belongs to: previews run in it, and it is left out of completions. */
  cell?: string;
  label?: string;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  /** 'enter': Enter commits and Shift+Enter breaks the line. 'mod': only Cmd/Ctrl+Enter commits. */
  commitKey?: 'enter' | 'mod';
  onCommit?: () => void;
  onCancel?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  /** Cmd/Ctrl+E: open the roomy editor. */
  onExpand?: () => void;
  onSelect?: (sel: [number, number]) => void;
  /** Where the help for the current call goes: floating over the page, a bar under the code, or nowhere. */
  signature?: 'float' | 'bar' | 'none';
  /** Show reading errors and the live result under the code. */
  messages?: boolean;
  /** An error from outside, such as a failed commit. Shown at once. */
  error?: string | null;
  preview?: boolean;
  /** Small buttons in the corner of the box. */
  actions?: ReactNode;
  ref?: Ref<CodeEditorHandle>;
}

const OPENERS: Record<string, string> = { '(': ')', '{': '}' };
const HOVERABLE = new Set<Tok['kind']>(['builtin', 'special', 'action', 'fn', 'ref', 'local']);

/** A user function's parameters, when a cell holds (fn (a b) …). */
function userParams(cell: Cell | undefined): string[] | null {
  const x = cell?.expr;
  if (!Array.isArray(x) || x[0] !== 'fn') return null;
  return (Array.isArray(x[1]) ? x[1] : [x[1]]).map((p) => String(p).replace(/^\$/, ''));
}

export function CodeEditor(props: CodeEditorProps) {
  const {
    value, onChange, cell, label, placeholder, className, autoFocus, commitKey = 'mod', onCommit, onCancel, onExpand,
    signature: sigMode = 'float', messages = true, error, preview, actions, ref,
  } = props;
  const session = useSession();
  const info = useDocInfo();
  const collections = useCollections();
  const ta = useRef<HTMLTextAreaElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const pre = useRef<HTMLPreElement>(null);
  const popDown = useRef(false);
  const quiet = useRef(false);
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const [sel, setSel] = useState<[number, number]>([value.length, value.length]);
  const [comp, setComp] = useState<Completion | null>(null);
  const [active, setActive] = useState(0);
  const [settled, setSettled] = useState(true);
  const [hover, setHover] = useState<{ tok: number; rect: DOMRect } | null>(null);

  const toks = useMemo(() => lex(value, info.known), [value, info.known]);
  const parseError = useMemo(() => {
    try {
      read(value);
      return null;
    } catch (e) {
      return { message: (e as Error).message, pos: e instanceof SxError ? e.pos ?? null : null };
    }
  }, [value]);

  // Errors wait until typing pauses, so half-typed code is not scolded.
  useEffect(() => {
    setSettled(false);
    const t = setTimeout(() => setSettled(true), 900);
    return () => clearTimeout(t);
  }, [value]);

  useEffect(() => {
    const el = ta.current;
    if (!autoFocus || !el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    // A second mount (strict mode) finds it focused already, with no focus event.
    if (document.activeElement === el) setFocused(true);
  }, [autoFocus]);

  const caret = sel[0];
  const match = focused && sel[0] === sel[1] ? matchAt(toks, caret) : null;
  const showError = parseError && (error || settled || !focused);

  // ── editing ──

  const syncSel = () => {
    const el = ta.current;
    if (!el) return;
    const s: [number, number] = [el.selectionStart, el.selectionEnd];
    setSel((p) => (p[0] === s[0] && p[1] === s[1] ? p : s));
    props.onSelect?.(s);
  };

  /** Replace a range, keeping the browser's undo history where it can. */
  const replace = (start: number, end: number, text: string, caretAt?: number, caretEnd?: number) => {
    const el = ta.current;
    if (!el) return;
    quiet.current = true;
    el.focus();
    el.setSelectionRange(start, end);
    const ok = text ? document.execCommand('insertText', false, text) : start === end || document.execCommand('delete');
    if (!ok || el.value.slice(start, start + text.length) !== text) {
      el.setRangeText(text, start, end, 'end');
      onChange(el.value);
    }
    quiet.current = false;
    const a = caretAt ?? start + text.length;
    el.setSelectionRange(a, caretEnd ?? a);
    syncSel();
  };

  const refresh = (text: string, at: number, force = false) => {
    const c = complete(text, at, info.cells, collections, cell, force, info.known);
    setComp(c);
    setActive(0);
  };

  const accept = (item: Item) => {
    const c = comp;
    if (!c) return;
    const { text, caret: off } = acceptText(item, c, value[c.to] ?? '');
    setComp(null);
    replace(c.from, c.to, text, c.from + off);
  };

  useImperativeHandle(ref, () => ({
    focus: () => ta.current?.focus(),
    selection: () => (ta.current ? [ta.current.selectionStart, ta.current.selectionEnd] : sel),
    insert: (text, select) => {
      const el = ta.current;
      if (!el) return;
      let [s, e] = [el.selectionStart, el.selectionEnd];
      if (s === e) s = e = insertionPoint(el.value, s);
      const before = el.value.slice(0, s);
      const pad = before && !/[\s({]$/.test(before) && !/^[)}\s]/.test(text) ? ' ' : '';
      replace(s, e, pad + text, select ? s + pad.length + select[0] : undefined, select ? s + pad.length + select[1] : undefined);
    },
  }));

  // While focused, clicking a cell in the document inserts its name.
  const pick = useRef<(name: string) => void>(() => undefined);
  pick.current = (name: string) => {
    const el = ta.current;
    if (!el) return;
    let [s, e] = [el.selectionStart, el.selectionEnd];
    if (s === e) s = e = insertionPoint(el.value, s);
    const before = el.value.slice(0, s);
    const pad = before && !/[\s({]$/.test(before) ? ' ' : '';
    replace(s, e, pad + name);
  };
  const picker = useMemo(() => (name: string) => pick.current(name), []);
  useEffect(() => {
    if (!focused) return;
    session.pick = picker;
    return () => {
      if (session.pick === picker) session.pick = null;
    };
  }, [session, picker, focused]);

  const indentLines = (out: boolean) => {
    const el = ta.current!;
    const [s, e] = [el.selectionStart, el.selectionEnd];
    const from = value.lastIndexOf('\n', s - 1) + 1;
    const nl = value.indexOf('\n', Math.max(s, e - 1));
    const to = nl < 0 ? value.length : nl;
    const lines = value.slice(from, to).split('\n');
    const changed = lines.map((l) => (out ? l.replace(/^ {1,2}/, '') : '  ' + l));
    const delta0 = changed[0].length - lines[0].length;
    const total = changed.join('\n').length - (to - from);
    replace(from, to, changed.join('\n'), Math.max(from, s + delta0), Math.max(from, e + total));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation();
    setHover(null);
    const el = e.currentTarget;
    const [s, en] = [el.selectionStart, el.selectionEnd];
    const mod = e.metaKey || e.ctrlKey;
    const before = value[s - 1] ?? '';
    const after = value[en] ?? '';
    if (comp) {
      const n = comp.items.length;
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % n); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + n) % n); return; }
      if (e.key === 'PageDown') { e.preventDefault(); setActive((a) => Math.min(n - 1, a + 6)); return; }
      if (e.key === 'PageUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 6)); return; }
      if ((e.key === 'Enter' && !mod && !e.shiftKey) || (e.key === 'Tab' && !e.shiftKey)) { e.preventDefault(); accept(comp.items[active]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setComp(null); return; }
    }
    if (mod && e.key.toLowerCase() === 'e' && onExpand) { e.preventDefault(); onExpand(); return; }
    if (e.ctrlKey && (e.key === ' ' || e.code === 'Space')) { e.preventDefault(); refresh(value, s, true); return; }
    if (e.key === 'Enter' && (mod || (commitKey === 'enter' && !e.shiftKey))) {
      if (onCommit) { e.preventDefault(); onCommit(); }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const indent = indentAt(value, s);
      // Between a pair of brackets, open them up onto their own lines.
      if (s === en && (before === '(' || before === '{') && after === OPENERS[before]) {
        const outer = indentAt(value, s - 1);
        replace(s, en, '\n' + ' '.repeat(indent) + '\n' + ' '.repeat(outer), s + 1 + indent);
      } else replace(s, en, '\n' + ' '.repeat(indent));
      return;
    }
    if (e.key === 'Escape') {
      if (onCancel) { e.preventDefault(); onCancel(); }
      return;
    }
    if (e.key === 'Tab' && !mod && !e.altKey) {
      e.preventDefault();
      if (e.shiftKey || s !== en) indentLines(e.shiftKey);
      else replace(s, en, '  ');
      return;
    }
    if (mod || e.altKey) return;
    if (e.key === '(' || e.key === '{') {
      const close = OPENERS[e.key];
      if (s !== en) {
        e.preventDefault();
        replace(s, en, e.key + value.slice(s, en) + close, s + 1, en + 1);
      } else if (!after || /[\s)}]/.test(after)) {
        e.preventDefault();
        replace(s, en, e.key + close, s + 1);
      }
      return;
    }
    if ((e.key === ')' || e.key === '}') && s === en && after === e.key) {
      e.preventDefault();
      el.setSelectionRange(s + 1, s + 1);
      syncSel();
      setComp(null);
      return;
    }
    if (e.key === '"') {
      const t = tokenAt(toks, s);
      if (s === en && after === '"' && t?.kind === 'string' && t.end === s + 1 && !t.open) {
        e.preventDefault();
        el.setSelectionRange(s + 1, s + 1);
        syncSel();
        setComp(null);
      } else if (s !== en) {
        e.preventDefault();
        replace(s, en, '"' + value.slice(s, en) + '"', s + 1, en + 1);
      } else if (!spotAt(value, s).string && (!after || /[\s)}]/.test(after)) && !/[\w"\\]/.test(before)) {
        e.preventDefault();
        replace(s, en, '""', s + 1);
        const next = value.slice(0, s) + '""' + value.slice(en);
        refresh(next, s + 1);
      }
      return;
    }
    if (e.key === 'Backspace' && s === en && s > 0 && ['()', '{}', '""'].includes(before + after)) {
      e.preventDefault();
      replace(s - 1, s + 1, '', s - 1);
      setComp(null);
    }
  };

  const onInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    onChange(text);
    const at = e.target.selectionStart;
    setSel([at, e.target.selectionEnd]);
    if (quiet.current) return;
    const type = (e.nativeEvent as InputEvent).inputType ?? '';
    if (type.startsWith('insert') && type !== 'insertLineBreak' && type !== 'insertFromPaste') refresh(text, at);
    else if (type.startsWith('delete') && comp) refresh(text, at);
    else setComp(null);
  };

  // Close the list when the caret leaves the word it completes.
  useEffect(() => {
    if (comp && (sel[0] !== sel[1] || sel[0] < comp.from || sel[0] > comp.to + 1)) setComp(null);
  }, [sel, comp]);

  useEffect(() => {
    if (comp) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, comp, listId]);

  // ── hovering names (only with a mouse) ──

  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onMouseMove = (e: React.MouseEvent) => {
    if (!canHover() || !pre.current) return;
    const { clientX: x, clientY: y } = e;
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => {
      for (const span of pre.current?.querySelectorAll<HTMLElement>('[data-t]') ?? []) {
        for (const r of span.getClientRects()) {
          if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
            const i = Number(span.dataset.t);
            if (HOVERABLE.has(toks[i]?.kind)) setHover({ tok: i, rect: r });
            else setHover(null);
            return;
          }
        }
      }
      setHover(null);
    }, 280);
  };
  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  // ── what to show around the code ──

  const spot = focused && sigMode !== 'none' ? spotAt(value, caret, info.known) : null;
  const sig = useMemo(() => {
    const call = spot?.call;
    if (!call?.head) return null;
    const head = call.head;
    const own = info.byName.get(head);
    if (own && !docFor(head)) {
      const params = userParams(own);
      return { head, args: params ?? ['…'], does: `A function held by the cell ${head}.`, color: 'var(--live)', arg: call.arg };
    }
    const s = signature(head);
    if (!s) return null;
    return { head, args: s.args, does: s.does, color: GROUP_COLOR[s.group], arg: argToShow(s, call.arg) };
  }, [spot?.call?.head, spot?.call?.arg, info.byName]); // eslint-disable-line react-hooks/exhaustive-deps

  const result = useMemo(() => {
    if (!preview || !focused || !value.trim() || parseError) return null;
    const s = session.state;
    if (!s.doc) return null;
    const r = evalIn(s.doc, { rows: (n) => s.collections[n] ?? [], now: s.now }, read(value), cell);
    return r.error ? { error: r.error } : { value: show(plainValue(r.value)) };
  }, [preview, focused, value, parseError, cell, session, info]); // eslint-disable-line react-hooks/exhaustive-deps

  const marks = { match: match ? [match.at, ...(match.partner != null ? [match.partner] : [])] : [], error: showError ? parseError.pos ?? value.length : null, anchor: comp ? comp.from : null, anchorRef: anchor };
  const nodes = renderCode(value, toks, marks);
  const message = error ?? (showError ? parseError.message : null);

  const boxRect = useRect(focused && sigMode === 'float' && !!sig && !comp, () => box.current, [sig?.head, value.split('\n').length]);
  const anchorRect = useRect(!!comp, () => anchor.current, [comp, value]);

  const sigLine = sig && <SigLine {...sig} />;

  return (
    <div className={cx('code-field', className, focused && 'is-focused', (error || (message && !focused)) && 'has-error')}>
      <div className="cf-box" ref={box}>
        <div className="cf-scroll">
          <div className="cf-stack">
            <pre className="cf-hl" ref={pre} aria-hidden="true">{nodes}{value.endsWith('\n') || !value ? ' ' : ''}</pre>
            <textarea
              ref={ta}
              className="cf-input"
              rows={1}
              value={value}
              aria-label={label ?? 'Formula'}
              aria-autocomplete="list"
              aria-expanded={!!comp}
              aria-controls={comp ? listId : undefined}
              aria-activedescendant={comp ? `${listId}-${active}` : undefined}
              aria-invalid={!!message || undefined}
              placeholder={placeholder}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              enterKeyHint={commitKey === 'enter' ? 'done' : 'enter'}
              onChange={onInput}
              onSelect={syncSel}
              onKeyDown={onKeyDown}
              onKeyUp={syncSel}
              onMouseMove={onMouseMove}
              onMouseLeave={() => { clearTimeout(hoverTimer.current); setHover(null); }}
              onScroll={() => setHover(null)}
              onFocus={() => {
                setFocused(true);
                syncSel();
                props.onFocus?.();
              }}
              onBlur={() => {
                if (popDown.current) {
                  popDown.current = false;
                  ta.current?.focus();
                  return;
                }
                setFocused(false);
                setComp(null);
                props.onBlur?.();
              }}
            />
          </div>
        </div>
        {actions && <div className="cf-actions">{actions}</div>}
      </div>
      {sigMode === 'bar' && (
        <div className="cf-sig is-bar" aria-live="polite">
          {sigLine ?? (canHover()
            ? <span className="cf-sig-idle">Type <kbd>(</kbd> and a name to call a function · <kbd>Ctrl</kbd> <kbd>Space</kbd> lists what you can use</span>
            : <span className="cf-sig-idle">Type ( and a name to call a function, or pick one from Functions</span>)}
        </div>
      )}
      {messages && message && <p className="cf-msg is-error" role="alert">{message}</p>}
      {messages && !message && result && (
        <p className={cx('cf-msg', result.error && 'is-error')}>{result.error ? result.error : <><span className="cf-eq">=</span> {result.value}</>}</p>
      )}
      {boxRect && sigMode === 'float' && sig && !comp && createPortal(
        <div className="cf-float cf-sig" style={sigStyle(boxRect)} aria-hidden="true">{sigLine}</div>,
        document.body,
      )}
      {comp && anchorRect && createPortal(
        <Popup
          id={listId} comp={comp} active={active} rect={anchorRect} info={info}
          onDown={() => { popDown.current = true; }}
          onUp={() => setTimeout(() => { popDown.current = false; }, 400)}
          onHover={setActive}
          onPick={(item) => { popDown.current = false; accept(item); }}
        />,
        document.body,
      )}
      {hover && !comp && createPortal(<HoverCard tok={toks[hover.tok]} rect={hover.rect} info={info} />, document.body)}
    </div>
  );
}

function sigStyle(r: DOMRect): React.CSSProperties {
  const w = Math.max(260, Math.min(520, r.width));
  const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
  return r.top > 64 ? { left, width: w, bottom: window.innerHeight - r.top + 6 } : { left, width: w, top: r.bottom + 6 };
}

/** "(round x 2)" with the argument being typed in bold, and what the function does. */
export function SigLine({ head, args, does, color, arg }: { head: string; args: string[]; does: string; color: string; arg: number }) {
  return (
    <>
      <code className="cf-sig-use">
        (<b style={{ color }}>{head}</b>
        {args.map((a, i) => (
          <span key={i}> <span className={cx('cf-arg', i === arg && 'is-on')}>{a}</span></span>
        ))})
      </code>
      <span className="cf-sig-does">{does}</span>
    </>
  );
}

function Popup({ id, comp, active, rect, info, onDown, onUp, onHover, onPick }: {
  id: string; comp: Completion; active: number; rect: DOMRect; info: ReturnType<typeof useDocInfo>;
  onDown: () => void; onUp: () => void; onHover: (i: number) => void; onPick: (item: Item) => void;
}) {
  const w = Math.min(340, window.innerWidth - 16);
  const pos = place(rect, w, 300);
  const cur = comp.items[active];
  const doc = cur && (cur.kind === 'builtin' || cur.kind === 'special' || cur.kind === 'action') ? cur.doc : null;
  return (
    <div
      className="cf-pop"
      style={{ left: pos.left - 6, top: pos.top, bottom: pos.bottom, width: w, maxHeight: Math.min(320, pos.maxHeight) }}
      onPointerDown={(e) => { e.preventDefault(); onDown(); }}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onMouseDown={(e) => e.preventDefault()}
    >
      <ul role="listbox" id={id} aria-label="Suggestions">
        {comp.items.map((item, i) => (
          <li
            key={item.kind + item.label}
            id={`${id}-${i}`}
            role="option"
            aria-selected={i === active}
            className={cx('cf-opt', `k-${item.kind}`, i === active && 'is-active')}
            onPointerEnter={(e) => e.pointerType === 'mouse' && onHover(i)}
            onClick={() => onPick(item)}
          >
            <ItemIcon item={item} info={info} />
            <span className="cf-opt-label">{item.label}</span>
            {item.detail && <small className="cf-opt-detail">{item.detail}</small>}
          </li>
        ))}
      </ul>
      {doc && <div className="cf-pop-doc">{doc}</div>}
    </div>
  );
}

function ItemIcon({ item, info }: { item: Item; info: ReturnType<typeof useDocInfo> }) {
  if (item.kind === 'cell' || item.kind === 'fn-cell') {
    const c = info.byName.get(item.label);
    const I = c ? cellIcon(c) : Sigma;
    return <span className="cf-ico is-cell"><I size={13} strokeWidth={1.9} /></span>;
  }
  if (item.kind === 'collection') return <span className="cf-ico is-cell"><Database size={13} strokeWidth={1.9} /></span>;
  if (item.kind === 'local') return <span className="cf-ico is-local">x</span>;
  return <span className="cf-ico is-fn" style={{ color: item.group ? GROUP_COLOR[item.group] : undefined }}>ƒ</span>;
}

/** What a name means, shown while the mouse rests on it. */
function HoverCard({ tok, rect, info }: { tok: Tok | undefined; rect: DOMRect; info: ReturnType<typeof useDocInfo> }) {
  if (!tok) return null;
  const name = tok.text.replace(/^\$/, '');
  const pos = place(rect, 320, 120, 6);
  const style = { left: pos.left, top: pos.top, bottom: pos.bottom };
  let body: ReactNode = null;
  if (tok.kind === 'ref' || tok.kind === 'fn') {
    const c = info.cellOf(name);
    const ci = info.cells.find((x) => x.name === name || x.id === name);
    if (!c) return null;
    const I = cellIcon(c);
    const params = userParams(c);
    body = (
      <>
        <div className="cf-card-head"><I size={14} strokeWidth={1.8} /><b>{c.name ?? c.id}</b><small>{c.kind === 'formula' && params ? 'function' : c.kind}</small></div>
        {params ? <code className="cf-card-code">({[name, ...params].join(' ')})</code> : null}
        <div className="cf-card-value">{ci?.preview || (c.expr !== undefined ? print(c.expr, 40) : '—')}</div>
      </>
    );
  } else if (tok.kind === 'local') {
    const what: Record<string, string> = { it: 'The item being looked at.', i: 'The position of the item, from 0.', acc: 'The total so far.' };
    body = <><div className="cf-card-head"><b>{name}</b><small>local name</small></div><div className="cf-card-does">{what[name] ?? 'A name given inside this expression.'}</div></>;
  } else {
    const s = signature(name);
    const d = docFor(name);
    if (!d) return null;
    body = (
      <>
        <div className="cf-card-head"><span className="cf-dot" style={{ background: GROUP_COLOR[d.group] }} /><b>{name}</b><small>{d.group}</small></div>
        {s && <code className="cf-card-code">({[name, ...s.args].join(' ')})</code>}
        <div className="cf-card-does">{d.does}</div>
      </>
    );
  }
  return <div className="cf-float cf-card" style={style} role="tooltip">{body}</div>;
}
