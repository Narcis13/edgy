// The left-hand panel: who is here, what changed, and a line to the agent.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, FlaskConical, Send, Sparkles, Zap } from 'lucide-react';
import type { Actor, Op } from '../../core/types';
import { print } from '../../core/sx';
import { sayEffect } from '../../core/events';
import type { TraceItem } from '../session';
import { timeAgo } from '../lib/api';
import { cx, useS, useSession } from './ctx';

interface Block {
  key: string;
  actor: Actor;
  ts: number;
  ops?: { text: string; n: number; touched?: string }[];
  message?: { text: string; cell?: string };
  /** Handlers that ran: the event, the cell it came from, and what each one changed. */
  events?: TraceItem[];
}

const short = (op: Op): string => {
  if ((op[0] === 'put' || op[0] === 'replace') && Array.isArray(op[2])) op = [op[0], op[1], [`${op[2][0]} …`]] as Op;
  if (op[0] === 'split' && op[3] && typeof op[3] === 'object') {
    const { cell: _c, ...rest } = op[3] as Record<string, unknown>;
    op = Object.keys(rest).length ? ([op[0], op[1], op[2], rest] as Op) : ([op[0], op[1], op[2]] as Op);
  }
  const parts = op.map((x, i) => (i === 0 ? String(x) : typeof x === 'string' && /^[\w-]+$/.test(x) ? x : Array.isArray(x) && x[0] === 'do' ? short(x as Op) : print(x, 10_000)));
  let s = ('(' + parts.join(' ') + ')').replace(/\s+/g, ' ');
  if (s.length > 90) s = s.slice(0, 88) + '…)';
  return s;
};

const EVENTS: Actor = { kind: 'agent', name: 'Events' };

function blocks(log: { v: number; ts: number; actor: Actor; ops: Op[] }[], messages: { id: number; ts: number; actor: Actor; text: string; cell?: string }[], trace: TraceItem[]): Block[] {
  type Item = { t: 'op'; ts: number; actor: Actor; op: Op; v: number } | { t: 'msg'; ts: number; actor: Actor; text: string; cell?: string; id: number } | { t: 'ev'; ts: number; item: TraceItem };
  const items: Item[] = [];
  for (const e of log) for (const op of e.ops) items.push({ t: 'op', ts: e.ts, actor: e.actor, op, v: e.v });
  for (const m of messages) items.push({ t: 'msg', ts: m.ts, actor: m.actor, text: m.text, cell: m.cell, id: m.id });
  // An event is listed just before the changes it made.
  for (const item of trace) items.push({ t: 'ev', ts: item.at - 1, item });
  items.sort((a, b) => a.ts - b.ts);
  const out: Block[] = [];
  for (const it of items) {
    if (it.t === 'ev') {
      const last = out.at(-1);
      if (last?.events && it.ts - last.ts < 2000) {
        last.events.push(it.item);
        last.ts = it.ts;
      } else out.push({ key: 'e' + it.item.n, actor: EVENTS, ts: it.ts, events: [it.item] });
      continue;
    }
    // Changes the server's handlers made are already listed under the event that made them.
    const last0 = out.at(-1);
    if (it.t === 'op' && it.actor.kind === EVENTS.kind && it.actor.name === EVENTS.name && last0?.events && it.ts - last0.ts < 2000) continue;
    if (it.t === 'msg') {
      out.push({ key: 'm' + it.id, actor: it.actor, ts: it.ts, message: { text: it.text, cell: it.cell } });
      continue;
    }
    const last = out.at(-1);
    const same = last?.ops && last.actor.name === last.actor.name && last.actor.kind === it.actor.kind && last.actor.name === it.actor.name && it.ts - last.ts < 8000;
    const text = short(it.op);
    const target = it.op[0] === 'set' ? `${it.op[1]}.${it.op[2]}` : undefined;
    if (same && last) {
      const prev = last.ops!.at(-1);
      if (prev && target && prev.touched === target) {
        prev.text = text;
        prev.n++;
      } else last.ops!.push({ text, n: 1, touched: target });
      last.ts = it.ts;
    } else out.push({ key: `o${it.v}-${out.length}`, actor: it.actor, ts: it.ts, ops: [{ text, n: 1, touched: target }] });
  }
  return out.slice(-120);
}

export function Activity() {
  const session = useSession();
  const log = useS((s) => s.log);
  const messages = useS((s) => s.messages);
  const presence = useS((s) => s.presence);
  const trace = useS((s) => s.trace);
  const doc = useS((s) => s.doc);
  const now = useS((s) => s.now);
  const [text, setText] = useState('');
  const [help, setHelp] = useState(false);
  const feed = useMemo(() => blocks(log, messages, trace), [log, messages, trace]);
  const label = (id: string | null) => (id === null ? 'document' : (doc && session.cell(id)?.name) || id);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [feed.length]);

  const agents = presence.filter((p) => p.actor.kind === 'agent' && now - p.ts < 10 * 60_000);
  const listening = agents.some((p) => p.state === 'listening');

  const send = () => {
    const t = text.trim();
    if (!t) return;
    void session.say(t);
    setText('');
  };

  return (
    <div className="activity">
      <div className="activity-head">
        <h2>Activity</h2>
        <div className="who">
          <span className="chip human">You</span>
          {agents.map((p) => (
            <span key={p.actor.name} className={cx('chip agent', p.state)} title={`${p.actor.name} was ${p.state} ${timeAgo(p.ts, now)}`}>
              <Sparkles size={11} /> {p.actor.name}
            </span>
          ))}
        </div>
      </div>

      <div className="feed">
        {!feed.length && <p className="feed-empty">Changes, events and messages will show up here.</p>}
        {feed.map((b) => (
          <div key={b.key} className={cx('block', b.actor.kind, b.message && 'is-message', b.events && 'is-events')}>
            <div className="block-head">
              <span className={cx('who-name', b.actor.kind)}>{b.actor.kind === 'human' && b.actor.name === 'You' ? 'You' : b.actor.name}</span>
              <time>{timeAgo(b.ts, now)}</time>
            </div>
            {b.message && (
              <p className="bubble">
                {b.message.cell && <button className="chip" onClick={() => session.select(b.message!.cell!)}>{b.message.cell}</button>}
                {b.message.text}
              </p>
            )}
            {b.events && (
              <ul className="evs">
                {b.events.map((e) => (
                  <li key={e.n} className={cx(e.error && 'is-error')} style={{ paddingLeft: Math.min(e.depth, 4) * 10 }}>
                    <span className="ev-head">
                      {e.test ? <FlaskConical size={11} aria-label="fired by hand" /> : <Zap size={11} aria-hidden />}
                      <b>{e.via === 'do' ? 'do' : e.name}</b>
                      <button type="button" className="chip" onClick={() => e.cell && session.select(e.cell)} disabled={!e.cell}>{label(e.cell)}</button>
                      {e.source === 'server' && <small>on the server</small>}
                    </span>
                    {e.ops.map((op, i) => <code key={i}>{short(op)}</code>)}
                    {e.effects.map((fx, i) => <small key={'f' + i}>{sayEffect(fx, label)}</small>)}
                    {!e.ops.length && !e.effects.length && !e.error && <small>changed nothing</small>}
                    {e.error && <small className="ev-error">{e.error}</small>}
                  </li>
                ))}
              </ul>
            )}
            {b.ops && (
              <ul className="ops">
                {b.ops.map((o, i) => (
                  <li key={i}><code>{o.text}</code>{o.n > 1 && <small>×{o.n}</small>}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
        <div ref={end} />
      </div>

      <div className="composer">
        <p className={cx('listen', listening && 'is-on')}>
          {listening ? 'An agent is listening.' : agents.length ? 'An agent was here; your message waits for it.' : 'No agent is connected. Messages wait here until one is.'}
          <button className="link-btn" onClick={() => setHelp(!help)}>{help ? 'Hide' : 'Connect one'}</button>
        </p>
        {help && (
          <div className="connect">
            <p>Add this to the <code>.mcp.json</code> of any Claude Code project (it is already in this one), then ask Claude to open this document:</p>
            <pre>{`{ "mcpServers": { "edgy": {\n  "command": "npx", "args": ["tsx", "src/mcp/server.ts"],\n  "env": { "EDGY_URL": "http://127.0.0.1:8787" } } } }`}</pre>
            <p>Or talk to the API directly: <code>POST /api/docs/{session.id}/ops</code>. <a href="/api/guide" target="_blank" rel="noreferrer">Read the guide <ChevronRight size={12} /></a></p>
          </div>
        )}
        <div className="composer-row">
          <textarea
            value={text} rows={1} placeholder="Ask the agent for something…" aria-label="Message to the agent"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button className="send" onClick={send} disabled={!text.trim()} aria-label="Send"><Send size={15} /></button>
        </div>
      </div>
    </div>
  );
}
