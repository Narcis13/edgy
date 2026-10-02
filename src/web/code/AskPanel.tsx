// Ask AI: describe what the code should do in words; the server (Claude, the
// person's own agent, or a built-in composer) answers with checked code.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Check, Cpu, CornerDownLeft, Loader2, RotateCcw, Sparkles, TextCursorInput, Wand2 } from 'lucide-react';
import type { Op } from '../../core/types';
import { ApiError, api } from '../lib/api';
import { cx, useSession } from '../editor/ctx';
import { renderCode } from './Highlight';
import { type Known, lex } from './lexer';
import { useDocInfo } from './info';

interface Providers {
  providers: { claude: boolean; agent: boolean; local: boolean };
  model: string | null;
}

interface Answer {
  code: string;
  expr: unknown;
  explanation?: string;
  preview?: { value?: unknown; display?: string; error?: string };
  provider?: string;
  notes?: string | string[];
  /** An events answer: the ops to apply, and each change in words with its code. */
  ops?: Op[];
  changes?: { cell: string | null; label: string; code: string }[];
}

type State =
  | { s: 'idle' }
  | { s: 'busy'; prompt: string }
  | { s: 'done'; prompt: string; answer: Answer; applied?: boolean }
  | { s: 'failed'; prompt: string; error: string; suggestions: string[] };

const PROVIDER_NAME: Record<string, string> = { claude: 'Claude', agent: 'Your agent', local: 'Built-in' };

/** Example requests for the property being written, using the document's real names. */
function examples(prop: string, names: { numbers: string[]; any: string[] }, self?: string): string[] {
  const [a = 'price', b = 'qty'] = names.numbers.length >= 2 ? names.numbers : [...names.numbers, ...names.any.filter((n) => !names.numbers.includes(n))];
  const any = names.any[0] ?? a;
  if (prop.startsWith('on.')) {
    const ev = prop.slice(3);
    if (ev === 'change') return [`Copy the new value into ${any}`, 'Save the new value to "log" with the time', `Show ${any} when it is true`];
    if (ev === 'click' || ev === 'dblclick') return [`Add one to ${a}`, `Hide ${any}`, 'Send "picked" with the target'];
    if (ev === 'tick') return [`Add one to ${a}`, `Stop when ${a} is over 10`];
    if (ev === 'load') return [`Put the field "rate" of data into ${any}`];
    if (ev === 'fail') return [`Put the message into ${any}`];
    if (ev === 'open') return [`Add one to ${a}`, `Set ${any} to today`];
    return [`Set ${any} to the payload`, `Add one to ${a}`];
  }
  switch (prop) {
    case 'events': return self
      ? [`When ${self} changes, copy it into ${any}`, `When ${self} is clicked, add one to ${a}`]
      : [`When the document opens, add one to ${a}`, `Every 30 seconds, add one to ${a}`];
    case 'action': return [`Add an amount to ${a}`, 'Save who and when to "log"'];
    case 'do': return [`Add one to ${a}`, `Save ${a} and ${b} to "orders"`, `Set ${a} to 0`];
    case 'hidden': return [`When ${any} is empty`, `When ${a} is 0`, `When ${a} is over 100`];
    case 'options': return ['Small, medium and large', `The names from the "people" collection`];
    case 'compare': return [`${a} last month`, `The average of ${a}`];
    case 'trend': return [`The last 7 values of ${a}`, `Totals by month from "orders"`];
    default: return [`Sum of ${a} and ${b}`, `If ${a} is over 100 then "big" else "small"`, `${a} times ${b}, rounded to 2 decimals`];
  }
}

export function AskPanel({ cell, prop, draft, onUse, onInsert, autoFocus, targets, onApplied }: {
  /** The cell the code is for; left out for the document's own handlers and actions. */
  cell?: string;
  /** What to write: a prop ("expr", "do", "on.change"), "events" (handlers and actions from one sentence) or "action". */
  prop: string;
  draft: string;
  autoFocus?: boolean;
  onUse: (code: string) => void;
  onInsert: (code: string) => void;
  /** Other things it can write, offered as a switch over the box. */
  targets?: { value: string; label: string }[];
  /** An events answer's ops were applied. */
  onApplied?: () => void;
}) {
  const session = useSession();
  const info = useDocInfo();
  const [prompt, setPrompt] = useState('');
  const [state, setState] = useState<State>({ s: 'idle' });
  const [target, setTarget] = useState(prop);
  useEffect(() => setTarget(prop), [prop]);
  const [ai, setAi] = useState<Providers | null>(null);
  const alive = useRef(true);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    alive.current = true;
    api<Providers>('GET', `/api/ai?doc=${encodeURIComponent(session.id)}`).then((r) => alive.current && setAi(r)).catch(() => undefined);
    return () => {
      alive.current = false;
    };
  }, [session.id]);

  useEffect(() => {
    if (autoFocus) box.current?.focus();
  }, [autoFocus]);

  const provider = ai ? (ai.providers.agent ? 'agent' : ai.providers.claude ? 'claude' : 'local') : null;
  const names = useMemo(() => {
    const own = info.cells.filter((c) => c.id !== cell && !c.isFn);
    const numeric = (c: (typeof own)[number]) => c.preview !== '' && /^[-−]?[\d$€£¥,.\s]+%?$/.test(c.preview.replace(/[A-Z]{3}\s?/, ''));
    // Computed numbers read best in examples, then numbers people type.
    const numbers = [...own.filter((c) => numeric(c) && c.cell.kind !== 'input'), ...own.filter((c) => numeric(c) && c.cell.kind === 'input')].map((c) => c.name);
    return { numbers, any: own.map((c) => c.name) };
  }, [info.cells, cell]);
  const self = cell !== undefined ? info.cellOf(cell)?.name : undefined;
  const chips = examples(target, names, self);

  const ask = async (text = prompt) => {
    const p = text.trim();
    if (!p || state.s === 'busy') return;
    setState({ s: 'busy', prompt: p });
    try {
      const answer = await compose(session.id, { prompt: p, ...(cell !== undefined ? { cell } : {}), target, current: target === 'events' ? '' : draft });
      if (alive.current) setState({ s: 'done', prompt: p, answer });
    } catch (e) {
      if (!alive.current) return;
      const status = e instanceof ApiError ? e.status : 0;
      const error = status === 404 ? 'Asking AI isn’t available on this server yet.'
        : status >= 500 || !status ? 'The server could not answer just now. Try again in a moment.'
        : sentence((e as Error).message);
      setState({ s: 'failed', prompt: p, error, suggestions: e instanceof ComposeFailed ? e.suggestions : [] });
    }
  };

  const busy = state.s === 'busy';
  const answer = state.s === 'done' ? state.answer : null;
  const notes = answer?.notes ? (Array.isArray(answer.notes) ? answer.notes : [answer.notes]) : [];
  const ProviderIcon = provider === 'agent' ? Bot : provider === 'claude' ? Sparkles : Cpu;
  const applyOps = () => {
    if (state.s !== 'done' || !answer?.ops?.length) return;
    if (!session.dispatch(answer.ops)) return;
    setState({ ...state, applied: true });
    onApplied?.();
  };

  return (
    <div className="ask">
      {targets && targets.length > 1 && (
        <div className="seg ask-targets" role="group" aria-label="What to write">
          {targets.map((t) => (
            <button key={t.value} type="button" className={cx(t.value === target && 'is-on')} aria-pressed={t.value === target}
              onClick={() => { setTarget(t.value); if (state.s !== 'busy') setState({ s: 'idle' }); }}>{t.label}</button>
          ))}
        </div>
      )}
      <div className="ask-head">
        <label htmlFor="ask-prompt">{target === 'events' ? 'Describe what should happen, and when' : 'Describe what this should do'}</label>
        {provider && (
          <span className={cx('ask-badge', `is-${provider}`)} title={provider === 'claude' && ai?.model ? `Answered by ${ai.model}` : provider === 'agent' ? 'An agent is listening in this document and will answer' : 'Answered by Edgy’s built-in composer, without AI'}>
            <ProviderIcon size={12} /> {PROVIDER_NAME[provider]}
          </span>
        )}
      </div>
      <div className="ask-box">
        <textarea
          id="ask-prompt"
          ref={box}
          rows={3}
          value={prompt}
          placeholder={chips[0] ? `For example: ${chips[0]}` : 'In your own words'}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void ask();
            }
          }}
        />
        <button type="button" className="btn solid ask-go" disabled={!prompt.trim() || busy} onClick={() => void ask()}>
          {busy ? <Loader2 size={15} className="spin" /> : <Wand2 size={15} />} {busy ? 'Writing…' : 'Write it'}
        </button>
      </div>
      <div className="ask-chips" aria-label="Examples">
        {chips.map((c) => (
          <button key={c} type="button" className="chip" onClick={() => { setPrompt(c); box.current?.focus(); }}>{c}</button>
        ))}
      </div>

      <div className="ask-out" aria-live="polite">
        {busy && (
          <div className="ask-wait">
            <Loader2 size={16} className="spin" />
            <span>{provider === 'agent' ? 'Waiting for your agent… it can take up to a minute.' : provider === 'claude' ? 'Claude is writing…' : 'Working it out…'}</span>
          </div>
        )}
        {state.s === 'failed' && (
          <div className="ask-error">
            <p>{state.error}</p>
            {!!state.suggestions.length && (
              <>
                {!/try/i.test(state.error) && <p className="ask-sub">Try one of these:</p>}
                <div className="ask-chips">
                  {state.suggestions.map((s) => (
                    <button key={s} type="button" className="chip" onClick={() => { setPrompt(s); void ask(s); }}>{s}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        {answer && answer.ops && answer.changes && (
          <div className="ask-answer">
            <div className="ask-answer-head">
              <span>Proposed {answer.changes.length === 1 ? 'change' : `changes (${answer.changes.length})`}</span>
              {answer.provider && <small>by {PROVIDER_NAME[answer.provider] ?? answer.provider}</small>}
            </div>
            <ul className="ask-changes">
              {answer.changes.map((ch, i) => (
                <li key={i}>
                  <span className="ask-change-label">{ch.label}</span>
                  <CodeView code={ch.code} known={info.known} />
                </li>
              ))}
            </ul>
            {answer.explanation && <p className="ask-explain">{answer.explanation}</p>}
            {notes.map((n, i) => <p key={i} className="ask-note">{n}</p>)}
            <div className="ask-actions">
              {state.s === 'done' && state.applied ? (
                <span className="ask-applied" role="status"><Check size={14} /> Applied. Undo puts it back as it was.</span>
              ) : (
                <button type="button" className="btn solid" onClick={applyOps} disabled={!answer.ops.length}><CornerDownLeft size={14} /> Apply {answer.changes.length === 1 ? 'it' : 'all'}</button>
              )}
              <button type="button" className="btn ghost" onClick={() => void ask(state.s === 'done' ? state.prompt : prompt)}><RotateCcw size={14} /> Try again</button>
            </div>
          </div>
        )}
        {answer && !(answer.ops && answer.changes) && (
          <div className="ask-answer">
            <div className="ask-answer-head">
              <span>Proposed {target === 'do' || target.startsWith('on.') ? 'action' : target === 'action' ? 'function' : 'code'}</span>
              {answer.provider && <small>by {PROVIDER_NAME[answer.provider] ?? answer.provider}</small>}
            </div>
            <CodeView code={answer.code} known={info.known} />
            {answer.preview && (answer.preview.error
              ? <p className="ask-preview is-error">{answer.preview.error}</p>
              : (answer.preview.display !== undefined || answer.preview.value !== undefined) && (
                <p className="ask-preview"><span className="cf-eq">=</span> {answer.preview.display ?? JSON.stringify(answer.preview.value)}</p>
              ))}
            {answer.explanation && <p className="ask-explain">{answer.explanation}</p>}
            {notes.map((n, i) => <p key={i} className="ask-note">{n}</p>)}
            <div className="ask-actions">
              <button type="button" className="btn solid" onClick={() => onUse(answer.code)}><CornerDownLeft size={14} /> Use this</button>
              <button type="button" className="btn soft" onClick={() => onInsert(answer.code)}><TextCursorInput size={14} /> Insert at cursor</button>
              <button type="button" className="btn ghost" onClick={() => void ask(state.s === 'done' ? state.prompt : prompt)}><RotateCcw size={14} /> Try again</button>
            </div>
          </div>
        )}
        {state.s === 'idle' && (
          <p className="ask-hint">Say it the way you would to a colleague. Use the names of cells, like <code>{names.any[0] ?? 'total'}</code>. You’ll see the code before anything changes.</p>
        )}
      </div>
    </div>
  );
}

class ComposeFailed extends ApiError {
  constructor(message: string, status: number, readonly suggestions: string[]) {
    super(message, status);
  }
}

/** Like the api helper, but keeps the suggestions a 422 answer carries. */
async function compose(doc: string, body: { prompt: string; cell?: string; target: string; current: string }): Promise<Answer> {
  const res = await fetch(`/api/docs/${encodeURIComponent(doc)}/compose`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as (Answer & { error?: string; suggestions?: string[] }) | null;
  if (!res.ok || !json) {
    const suggestions = Array.isArray(json?.suggestions) ? json!.suggestions.filter((x) => typeof x === 'string') : [];
    throw new ComposeFailed(json?.error ?? `The server answered ${res.status}.`, res.status, suggestions);
  }
  return json;
}

function sentence(s: string): string {
  const t = s.trim();
  return t.charAt(0).toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) ? '' : '.');
}

/** Read-only highlighted code, for answers and examples. */
function CodeView({ code, known, className }: { code: string; known?: Known; className?: string }) {
  const nodes = useMemo(() => renderCode(code, lex(code, known)), [code, known]);
  return <pre className={'code-view' + (className ? ' ' + className : '')}>{nodes}</pre>;
}
