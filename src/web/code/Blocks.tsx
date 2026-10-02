// Blocks: the same expression as nested pieces to click, for people who would
// rather not type brackets. A call is a coloured pill and its slots; cells are
// chips; numbers and text are edited in place. Every change is valid code.

import { type Ref, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  Braces, Calculator, Check, CircleSlash, Code2, FunctionSquare, Hash, Parentheses, Plus, Quote, Shapes, ToggleLeft, X,
} from 'lucide-react';
import type { Sx } from '../../core/types';
import { print, read } from '../../core/sx';
import { cx } from '../editor/ctx';
import {
  type Path, PLACE_HEADS, addField, blankCall, fixedSlots, getAt, headOf, insertArg, isShort, kindOf, localsAt, removeAt,
  renameKey, setAt, setTargetAt, slotHint, slotLabel, swapHead, valueChoices, wrapAt, ITERATORS_LABELS,
} from './edits';
import { ENTRIES, GROUP_COLOR, GROUPS, docFor, formFor } from './docs';
import { cellIcon, useDocInfo, type DocInfo } from './info';
import { type PickItem, PickMenu } from './PickMenu';

export interface BlocksHandle {
  /** Put a value where the person is working: the chosen empty slot, the chosen call, or the end of the whole. */
  insert(x: Sx): void;
}

type Menu =
  | { kind: 'choose'; el: HTMLElement; title: string; path: Path; add: boolean }
  | { kind: 'cell'; el: HTMLElement; title: string; at: Path; onCell: (name: string) => void }
  | { kind: 'fn'; el: HTMLElement; title: string; onFn: (name: string) => void };

interface Ctx {
  root: Sx;
  info: DocInfo;
  self?: string;
  set: (path: Path, v: Sx) => void;
  /** Change the whole expression, from its latest version. */
  update: (fn: (root: Sx) => Sx) => void;
  remove: (path: Path) => void;
  open: (m: Menu | null) => void;
  selected: string | null;
  select: (path: Path) => void;
  editing: string | null;
  setEditing: (k: string | null) => void;
}

const key = (p: Path) => p.join('/');
const HEAD_LABEL: Record<string, string> = { '*': '×', '/': '÷', '>=': '≥', '<=': '≤', '!=': '≠', '-': '−' };
const HEAD_WORD: Record<string, string> = { '*': 'times', '/': 'divided by', '+': 'plus', '-': 'minus', '>': 'is more than', '<': 'is less than', '=': 'equals' };

export function Blocks({ text, onChange, cell, onShowCode, ref }: {
  text: string;
  onChange: (text: string) => void;
  cell?: string;
  onShowCode?: () => void;
  ref?: Ref<BlocksHandle>;
}) {
  const info = useDocInfo();
  const parsed = useMemo((): { x: Sx } | { error: string } => {
    try {
      return { x: read(text) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [text]);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const root = 'x' in parsed ? parsed.x : null;
  const rootRef = useRef(root);
  rootRef.current = root;

  const commit = (x: Sx) => onChange(x === null ? '' : print(x, 60));
  const ctx: Ctx = {
    root, info, self: cell,
    set: (path, v) => commit(setAt(rootRef.current, path, v)),
    update: (fn) => commit(fn(rootRef.current)),
    remove: (path) => {
      commit(removeAt(rootRef.current, path));
      setSelected(null);
    },
    open: setMenu,
    selected,
    select: (p) => setSelected(key(p)),
    editing,
    setEditing,
  };

  useImperativeHandle(ref, () => ({
    insert: (x) => {
      const r = rootRef.current;
      const path = selected ? selected.split('/').map((s) => (/^\d+$/.test(s) ? Number(s) : s)) : [];
      const at = getAt(r, path);
      if (r === null) return commit(x);
      if (at === null) return commit(setAt(r, path, x));
      // Into a call: its first empty slot, else a new last argument.
      const into = kindOf(at) === 'call' ? path : kindOf(r) === 'call' && !path.length ? [] : null;
      if (into) {
        const call = getAt(r, into) as Sx[];
        const hole = call.findIndex((a, i) => i > 0 && a === null);
        if (hole > 0) return commit(setAt(r, [...into, hole], x));
        if (!fixedSlots(headOf(call))) return commit(insertArg(r, into, x));
      }
      // Onto a single value: a function wraps it, (round price 2); anything else takes its place.
      const target = path.length ? path : [];
      const old = getAt(r, target) ?? null;
      const hole = Array.isArray(x) ? x.findIndex((a, i) => i > 0 && a === null) : -1;
      if (hole > 0) {
        const wrapped = [...(x as Sx[])];
        wrapped[hole] = old;
        return commit(setAt(r, target, wrapped));
      }
      commit(setAt(r, target, x));
    },
  }));

  // A value chosen from a menu goes in; numbers and text open for typing at once.
  const put = (path: Path, add: boolean, v: Sx, edit = false) => {
    const r = rootRef.current;
    let at = path;
    if (add) {
      const call = getAt(r, path);
      at = [...path, Array.isArray(call) ? call.length : 1];
      commit(insertArg(r, path, v));
    } else commit(setAt(r, path, v));
    setSelected(key(at));
    if (edit) setEditing(key(at));
    setMenu(null);
  };

  if ('error' in parsed) {
    return (
      <div className="blocks is-broken">
        <div className="bk-broken">
          <Code2 size={20} />
          <p><b>This code can’t be shown as blocks yet.</b> {parsed.error.charAt(0).toUpperCase() + parsed.error.slice(1)}.</p>
          {onShowCode && <button type="button" className="btn soft" onClick={onShowCode}>Fix it in Code</button>}
        </div>
      </div>
    );
  }

  return (
    <div className="blocks" onClick={(e) => { if (e.target === e.currentTarget) setSelected(null); }}>
      {root === null ? (
        <Start onPick={(kind, el) => {
          if (kind === 'number') put([], false, 0, true);
          else if (kind === 'text') put([], false, '', true);
          else if (kind === 'cell') setMenu({ kind: 'cell', el, title: 'Start with a cell', at: [], onCell: (n) => put([], false, '$' + n) });
          else setMenu({ kind: 'fn', el, title: 'Start with a function', onFn: (n) => put([], false, blankCall(n)) });
        }} />
      ) : (
        <div className="bk-root">
          <Slot ctx={ctx} x={root} path={[]} label={null} hint={null} />
        </div>
      )}
      {root !== null && <p className="bk-tip">Click a piece to change it. <span className="bk-tip-more">Use <b>+</b> to add, <Parentheses size={12} /> to wrap a piece in a function, and <X size={12} /> to remove it.</span></p>}
      {menu && <BlockMenu menu={menu} ctx={ctx} put={put} close={() => setMenu(null)} />}
    </div>
  );
}

function Start({ onPick }: { onPick: (kind: 'cell' | 'number' | 'text' | 'fn', el: HTMLElement) => void }) {
  return (
    <div className="bk-start">
      <Shapes size={26} strokeWidth={1.5} />
      <h3>Start with a cell, a number, or a function</h3>
      <p>Build the expression piece by piece. Everything you make here is also written out in the Code tab.</p>
      <div className="bk-start-grid">
        <button type="button" onClick={(e) => onPick('cell', e.currentTarget)}><span className="bk-start-ico is-cell"><Braces size={18} /></span><b>A cell</b><small>Use another cell’s value</small></button>
        <button type="button" onClick={(e) => onPick('number', e.currentTarget)}><span className="bk-start-ico is-num"><Hash size={18} /></span><b>A number</b><small>Like 100 or 0.2</small></button>
        <button type="button" onClick={(e) => onPick('text', e.currentTarget)}><span className="bk-start-ico is-text"><Quote size={18} /></span><b>Some text</b><small>Words in quotes</small></button>
        <button type="button" onClick={(e) => onPick('fn', e.currentTarget)}><span className="bk-start-ico is-fn"><FunctionSquare size={18} /></span><b>A function</b><small>Add, compare, choose, count…</small></button>
      </div>
    </div>
  );
}

/** One place in the expression: its reading label, the piece, and tools to wrap or remove it. */
function Slot({ ctx, x, path, label, hint, place }: { ctx: Ctx; x: Sx; path: Path; label: string | null; hint: string | null; place?: boolean }) {
  const k = key(path);
  const filled = x !== null;
  return (
    <div
      className={cx('bk-slot', ctx.selected === k && 'is-selected', !filled && 'is-empty')}
      onClick={(e) => {
        e.stopPropagation();
        ctx.select(path);
      }}
    >
      {label && <span className="bk-label">{label}</span>}
      <Node ctx={ctx} x={x} path={path} hint={hint} place={place} />
      {filled && (
        <span className="bk-tools">
          <button type="button" className="bk-tool" title="Wrap in a function" aria-label="Wrap in a function"
            onClick={(e) => {
              e.stopPropagation();
              ctx.open({ kind: 'fn', el: e.currentTarget, title: 'Wrap in…', onFn: (n) => ctx.update((r) => wrapAt(r, path, n)) });
            }}>
            <Parentheses size={13} />
          </button>
          <button type="button" className="bk-tool is-x" title={path.length ? 'Remove' : 'Clear everything'} aria-label={path.length ? 'Remove' : 'Clear everything'}
            onClick={(e) => { e.stopPropagation(); ctx.remove(path); }}>
            <X size={13} />
          </button>
        </span>
      )}
    </div>
  );
}

function Node({ ctx, x, path, hint, place }: { ctx: Ctx; x: Sx; path: Path; hint: string | null; place?: boolean }) {
  if (place && typeof x === 'string') return <RefChip ctx={ctx} name={x} path={path} place />;
  switch (kindOf(x)) {
    case 'nil': return <EmptySlot ctx={ctx} path={path} hint={hint} place={place} />;
    case 'number': return <NumberChip ctx={ctx} value={x as number} path={path} />;
    case 'bool': return (
      <button type="button" className={cx('bk-chip bk-bool', x === true && 'is-on')} aria-pressed={x === true}
        title="Click to switch" onClick={(e) => { e.stopPropagation(); ctx.set(path, !x); }}>
        {x ? <Check size={13} /> : <CircleSlash size={13} />} {x ? 'true' : 'false'}
      </button>
    );
    case 'text': return <TextChip ctx={ctx} value={Array.isArray(x) ? String(x[1]) : (x as string)} path={path} />;
    case 'ref': return <RefChip ctx={ctx} name={(x as string).slice(1)} path={path} />;
    case 'list': return <span className="bk-chip bk-muted">empty list</span>;
    case 'record': return <RecordBlock ctx={ctx} x={x as Record<string, Sx>} path={path} />;
    default: return <CallBlock ctx={ctx} x={x as Sx[]} path={path} />;
  }
}

function CallBlock({ ctx, x, path }: { ctx: Ctx; x: Sx[]; path: Path }) {
  const head = headOf(x);
  if (head === 'let') return <LetBlock ctx={ctx} x={x} path={path} />;
  if (head === 'fn') return <FnBlock ctx={ctx} x={x} path={path} />;
  const d = head ? docFor(head) : undefined;
  const own = head && !d ? ctx.info.byName.get(head) : undefined;
  const color = d ? GROUP_COLOR[d.group] : own ? 'var(--live)' : 'var(--muted)';
  const args = x.slice(1);
  const fixed = fixedSlots(head);
  const canAdd = !fixed || args.length < fixed || head === 'cond';
  const inline = isShort(x);
  const word = head ? HEAD_WORD[head] : undefined;
  return (
    <div className={cx('bk-call', inline ? 'is-inline' : 'is-stacked')} style={{ '--c': color } as React.CSSProperties}>
      {head ? (
        <button type="button" className="bk-head" title={d ? `${d.use} — ${d.does} Click to choose another function.` : 'Click to choose another function'}
          onClick={(e) => {
            e.stopPropagation();
            ctx.open({ kind: 'fn', el: e.currentTarget, title: 'Change the function', onFn: (n) => ctx.update((r) => swapHead(r, path, n)) });
          }}>
          {HEAD_LABEL[head] ?? head}
          {word && <span className="bk-head-word">{word}</span>}
        </button>
      ) : (
        <Slot ctx={ctx} x={x[0]} path={[...path, 0]} label="call" hint={null} />
      )}
      <div className="bk-args">
        {args.map((a, i) => (
          <Slot key={i} ctx={ctx} x={a} path={[...path, i + 1]} label={slotLabel(head, i + 1, x.length)} hint={hintFor(head, i + 1, x.length)}
            place={!!head && PLACE_HEADS.has(head) && i === 0} />
        ))}
        {canAdd && (
          <button type="button" className="bk-add" title="Add a part" aria-label={`Add a part to ${head ?? 'this call'}`}
            onClick={(e) => { e.stopPropagation(); ctx.open({ kind: 'choose', el: e.currentTarget, title: 'Add', path, add: true }); }}>
            <Plus size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

/** An empty slot's hint; "value" where the label already says it ("then [value]", not "then [then]"). */
function hintFor(head: string | null, i: number, n: number): string | null {
  const hint = slotHint(head, i);
  const label = slotLabel(head, i, n);
  return label && (hint === label || !hint) ? 'value' : hint;
}

function LetBlock({ ctx, x, path }: { ctx: Ctx; x: Sx[]; path: Path }) {
  const binds = Array.isArray(x[1]) ? x[1] : [];
  const pairs: [string, Sx][] = [];
  for (let i = 0; i < binds.length; i += 2) pairs.push([String(binds[i] ?? ''), binds[i + 1] ?? null]);
  const setBinds = (b: Sx[]) => ctx.set([...path, 1], b);
  return (
    <div className="bk-call is-stacked" style={{ '--c': GROUP_COLOR.Logic } as React.CSSProperties}>
      <span className="bk-head is-static">let</span>
      <div className="bk-args">
        {pairs.map(([name, v], j) => (
          <div key={j} className="bk-bind">
            <NameInput value={name} label="Name" onCommit={(n) => { const b = [...binds]; b[j * 2] = n; setBinds(b); }} />
            <span className="bk-label">=</span>
            <Slot ctx={ctx} x={v} path={[...path, 1, j * 2 + 1]} label={null} hint="value" />
            <button type="button" className="bk-tool is-x is-shown" aria-label={`Remove ${name}`} onClick={(e) => { e.stopPropagation(); setBinds(binds.filter((_, i) => i !== j * 2 && i !== j * 2 + 1)); }}><X size={13} /></button>
          </div>
        ))}
        <button type="button" className="bk-add is-wide" onClick={(e) => {
          e.stopPropagation();
          const names = new Set(pairs.map((p) => p[0]));
          let n = 'x';
          for (const c of 'xyzabcdefgh') if (!names.has(c)) { n = c; break; }
          setBinds([...binds, n, null]);
        }}><Plus size={14} /> name</button>
        {x.slice(2).map((b, i) => (
          <Slot key={'b' + i} ctx={ctx} x={b} path={[...path, i + 2]} label={i ? 'then' : 'gives'} hint="result" />
        ))}
        {x.length < 3 && <Slot ctx={ctx} x={null} path={[...path, 2]} label="gives" hint="result" />}
      </div>
    </div>
  );
}

function FnBlock({ ctx, x, path }: { ctx: Ctx; x: Sx[]; path: Path }) {
  const params = (Array.isArray(x[1]) ? x[1] : x[1] == null ? [] : [x[1]]).map((p) => String(p).replace(/^\$/, ''));
  const setParams = (p: string[]) => ctx.set([...path, 1], p);
  return (
    <div className="bk-call is-stacked" style={{ '--c': GROUP_COLOR.Logic } as React.CSSProperties}>
      <span className="bk-head is-static">function of</span>
      <div className="bk-args">
        <div className="bk-bind">
          {params.map((p, i) => (
            <NameInput key={i} value={p} label="Input name" onCommit={(n) => setParams(n ? params.map((q, j) => (j === i ? n : q)) : params.filter((_, j) => j !== i))} />
          ))}
          <button type="button" className="bk-add" aria-label="Add an input" onClick={(e) => { e.stopPropagation(); setParams([...params, 'abcdxyz'.split('').find((c) => !params.includes(c)) ?? 'v']); }}><Plus size={14} /></button>
        </div>
        <Slot ctx={ctx} x={x[2] ?? null} path={[...path, 2]} label="gives" hint="result" />
      </div>
    </div>
  );
}

function RecordBlock({ ctx, x, path }: { ctx: Ctx; x: Record<string, Sx>; path: Path }) {
  return (
    <div className="bk-call is-stacked" style={{ '--c': GROUP_COLOR.Records } as React.CSSProperties}>
      <span className="bk-head is-static">record</span>
      <div className="bk-args">
        {Object.entries(x).map(([k, v]) => (
          <div key={k} className="bk-bind">
            <NameInput value={k} label="Field name" onCommit={(n) => n && ctx.update((r) => renameKey(r, path, k, n))} />
            <Slot ctx={ctx} x={v} path={[...path, k]} label={null} hint="value" />
          </div>
        ))}
        <button type="button" className="bk-add is-wide" onClick={(e) => { e.stopPropagation(); ctx.update((r) => addField(r, path, 'field')); }}><Plus size={14} /> field</button>
      </div>
    </div>
  );
}

function NameInput({ value, label, onCommit }: { value: string; label: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input
      className="bk-name" value={v} aria-label={label} size={Math.max(2, v.length)} spellCheck={false} autoCapitalize="off"
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setV(e.target.value.replace(/[^A-Za-z0-9_-]/g, ''))}
      onBlur={() => v !== value && onCommit(v)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') { setV(value); e.currentTarget.blur(); }
      }}
    />
  );
}

function EmptySlot({ ctx, path, hint, place }: { ctx: Ctx; path: Path; hint: string | null; place?: boolean }) {
  return (
    <button type="button" className="bk-empty" aria-label={hint ? `Fill in ${hint}` : 'Fill in this part'}
      onClick={(e) => {
        e.stopPropagation();
        ctx.select(path);
        if (place) ctx.open({ kind: 'cell', el: e.currentTarget, title: 'Which cell?', at: path, onCell: (n) => ctx.set(path, n) });
        else ctx.open({ kind: 'choose', el: e.currentTarget, title: hint ? `Fill in “${hint}”` : 'Fill in', path, add: false });
      }}>
      {hint ?? 'choose'}
    </button>
  );
}

function RefChip({ ctx, name, path, place }: { ctx: Ctx; name: string; path: Path; place?: boolean }) {
  const c = ctx.info.cellOf(name);
  const local = !c && localsAt(ctx.root, path).includes(name);
  const ci = c && ctx.info.cells.find((x) => x.id === c.id);
  const I = c ? cellIcon(c) : null;
  return (
    <button type="button" className={cx('bk-chip bk-ref', local && 'is-local', !c && !local && 'is-unknown')}
      title={c ? `${c.name ?? c.id}: ${ci?.preview ?? ''}. Click to choose another cell.` : local ? 'A name given in this expression' : `There is no cell called ${name}`}
      onClick={(e) => {
        e.stopPropagation();
        ctx.select(path);
        ctx.open({ kind: 'cell', el: e.currentTarget, title: 'Choose a cell', at: path, onCell: (n) => ctx.set(path, place ? n : '$' + n) });
      }}>
      {I ? <I size={13} strokeWidth={1.9} /> : <span className="bk-x">{local ? 'x' : '?'}</span>}
      <span className="bk-ref-name">{name}</span>
      {ci?.preview && !place && <small className="bk-ref-val">{ci.preview}</small>}
    </button>
  );
}

function NumberChip({ ctx, value, path }: { ctx: Ctx; value: number; path: Path }) {
  const k = key(path);
  const [text, setText] = useState(String(value));
  const editing = ctx.editing === k;
  useEffect(() => setText(String(value)), [value, editing]);
  if (!editing) {
    return (
      <button type="button" className="bk-chip bk-num" title="Click to change the number" onClick={(e) => { e.stopPropagation(); ctx.select(path); ctx.setEditing(k); }}>
        {String(value)}
      </button>
    );
  }
  const n = Number(text.replace(',', '.'));
  const valid = text.trim() !== '' && Number.isFinite(n);
  const done = (save: boolean) => {
    if (save && valid && n !== value) ctx.set(path, n);
    ctx.setEditing(null);
  };
  return (
    <input
      className={cx('bk-input bk-num', !valid && 'is-invalid')} autoFocus inputMode="decimal" value={text} aria-label="Number"
      aria-invalid={!valid} title={valid ? undefined : 'Not a number'} size={Math.max(2, text.length + 1)}
      onFocus={(e) => e.currentTarget.select()}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => done(true)}
      onKeyDown={(e) => {
        e.stopPropagation();
        // Enter on something that is not a number keeps the field open, marked, rather than losing the edit.
        if (e.key === 'Enter' && valid) done(true);
        if (e.key === 'Escape') done(false);
      }}
    />
  );
}

function TextChip({ ctx, value, path }: { ctx: Ctx; value: string; path: Path }) {
  const k = key(path);
  const [text, setText] = useState(value);
  const editing = ctx.editing === k;
  useEffect(() => setText(value), [value, editing]);
  if (!editing) {
    return (
      <button type="button" className="bk-chip bk-text" title="Click to change the text" onClick={(e) => { e.stopPropagation(); ctx.select(path); ctx.setEditing(k); }}>
        “{value || <span className="bk-faint">empty</span>}”
      </button>
    );
  }
  const done = (save: boolean) => {
    if (save && text !== value) ctx.set(path, text.startsWith('$') ? ['quote', text] : text);
    ctx.setEditing(null);
  };
  return (
    <input
      className="bk-input bk-text" autoFocus value={text} aria-label="Text" size={Math.max(4, text.length + 1)} placeholder="text"
      onFocus={(e) => e.currentTarget.select()}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => done(true)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') done(true);
        if (e.key === 'Escape') done(false);
      }}
    />
  );
}

// ── menus ──

function functionItems(onFn: (name: string) => void): PickItem[] {
  const out: PickItem[] = [];
  for (const g of GROUPS) {
    for (const e of ENTRIES.filter((x) => x.group === g)) {
      for (const n of e.names) {
        if (n === '{ }') continue;
        const form = formFor(n);
        out.push({
          key: n, text: n + ' ' + e.does, group: g, onPick: () => onFn(n),
          icon: <span className="pm-dot" style={{ background: GROUP_COLOR[g] }} />,
          label: <><code>{n}</code>{form && <span className="pm-form">{form}</span>}</>,
          detail: e.does,
        });
      }
    }
  }
  return out;
}

function cellItems(info: DocInfo, onCell: (name: string) => void, locals: string[] = [], self?: string): PickItem[] {
  const out: PickItem[] = locals.map((n) => ({
    key: 'local:' + n, text: n, group: 'Names here', onPick: () => onCell(n),
    icon: <span className="pm-local">x</span>, label: <code>{n}</code>,
    detail: n === 'it' ? 'the item' : n === 'i' ? 'its position' : n === 'acc' ? 'the total so far' : 'a name given here',
  }));
  for (const c of info.cells) {
    if (c.id === self) continue;
    const I = cellIcon(c.cell);
    out.push({ key: c.id, text: c.name, group: 'Cells', onPick: () => onCell(c.name), icon: <I size={14} strokeWidth={1.8} />, label: <code>{c.name}</code>, detail: c.preview || '—' });
  }
  return out;
}

function BlockMenu({ menu, ctx, put, close }: { menu: Menu; ctx: Ctx; put: (path: Path, add: boolean, v: Sx, edit?: boolean) => void; close: () => void }) {
  const [sub, setSub] = useState<Menu | null>(null);
  const m = sub ?? menu;
  if (m.kind === 'cell') {
    const items = cellItems(ctx.info, (n) => { m.onCell(n); close(); }, localsAt(ctx.root, m.at), ctx.self);
    return (
      <PickMenu key="cell" anchor={m.el} title={m.title} items={items} onClose={close} search placeholder="Search cells"
        footer={!items.length ? <p className="pm-note">No named cells yet. Give a cell a name in the inspector to use it here.</p> : undefined} />
    );
  }
  if (m.kind === 'fn') return <PickMenu key="fn" anchor={m.el} title={m.title} items={functionItems((n) => { m.onFn(n); close(); })} onClose={close} search placeholder="Search functions" />;
  const { path, add } = m;
  const call = getAt(ctx.root, path);
  const len = Array.isArray(call) ? call.length : 1;
  // Setting tabs, an accordion or a collapsible: offer the values it takes.
  const target = add ? null : setTargetAt(ctx.root, path);
  const choices = valueChoices(target ? ctx.info.cellOf(target) : undefined).map((ch, i): PickItem => ({
    key: 'v' + i, text: ch.label + ' ' + ch.detail, group: `Values of ${target}`, onPick: () => put(path, add, ch.value),
    icon: typeof ch.value === 'string' ? <Quote size={15} /> : <ToggleLeft size={15} />, label: ch.label, detail: ch.detail,
  }));
  const other = choices.length ? 'Or' : undefined;
  const items: PickItem[] = [
    ...choices,
    { key: 'cell', text: 'cell', group: other, icon: <Braces size={15} />, label: 'A cell…', detail: 'Another cell’s value', onPick: () => setSub({ kind: 'cell', el: m.el, title: 'Choose a cell', at: add ? [...path, len] : path, onCell: (n) => put(path, add, '$' + n) }) },
    { key: 'number', text: 'number', group: other, icon: <Calculator size={15} />, label: 'A number', onPick: () => put(path, add, 0, true) },
    { key: 'text', text: 'text', group: other, icon: <Quote size={15} />, label: 'Some text', onPick: () => put(path, add, '', true) },
    { key: 'fn', text: 'function', group: other, icon: <FunctionSquare size={15} />, label: 'A function…', detail: 'Add, compare, choose, count…', onPick: () => setSub({ kind: 'fn', el: m.el, title: 'Choose a function', onFn: (n) => put(path, add, blankCall(n)) }) },
    { key: 'bool', text: 'true false yes no', group: other, icon: <ToggleLeft size={15} />, label: 'Yes or no', detail: 'true or false', onPick: () => put(path, add, true) },
    ...(add ? [{ key: 'nil', text: 'nothing', icon: <CircleSlash size={15} />, label: 'Nothing', detail: 'An empty value (nil)', onPick: () => put(path, add, null) }] : []),
    ...(!add && getAt(ctx.root, path) === null && ITERATORS_LABELS[String(headOf(getAt(ctx.root, path.slice(0, -1))))] && path.at(-1) === 1
      ? [{ key: 'it', text: 'it item', icon: <span className="pm-local">x</span>, label: <code>it</code>, detail: 'The item itself', onPick: () => put(path, add, '$it') }]
      : []),
  ];
  return <PickMenu key="choose" anchor={m.el} title={m.title} items={items} onClose={close} search={false} />;
}
