// What a cell, or the document, does when something happens: one line per
// handler (and, for the document, per custom action), each opening the code
// studio's Events part, where handlers are added from presets.

import { BellPlus, ChevronRight, FunctionSquare, SquareFunction, Zap } from 'lucide-react';
import type { Cell } from '../../../core/types';
import { print } from '../../../core/sx';
import { useS } from '../ctx';
import { DOC, openEvents, openStudio } from '../../code/store';
import { actionsOf, eventRows, handlersOf, sayEvent } from '../../code/handlers';
import { Hint, Sub } from './controls';
import { Section } from './Section';

const oneLine = (x: unknown) => print(x as never, 10_000).replace(/\s+/g, ' ');

export function EventsSection({ cell }: { cell: Cell | null }) {
  const doc = useS((s) => s.doc);
  if (!doc) return null;
  const handlers = Object.entries(handlersOf(doc, cell));
  const actions = cell ? [] : actionsOf(doc);
  // A container that handles nothing has nothing to offer here.
  if (cell && !handlers.length && !eventRows(doc, cell).length) return null;
  const n = handlers.length;
  const summary = n ? `${n} ${n === 1 ? 'handler' : 'handlers'}` : cell ? 'None' : actions.length ? undefined : 'None';
  const at = cell ? cell.id : null;
  // The event most worth naming in the hint: what the kind is for (tick, load), else the first.
  const own = cell ? eventRows(doc, cell).filter((r) => !r.custom) : [];
  const first = (own.find((r) => r.decl?.from === 'runner') ?? own[0])?.name;
  return (
    <Section name={cell ? 'events' : 'doc-events'} title={cell ? 'Events' : 'Events and actions'} summary={summary} open={!cell}>
      {n ? (
        <ul className="ins-ev-list" aria-label="Handlers">
          {handlers.map(([ev, action]) => (
            <li key={ev}>
              <button type="button" className="ins-ev" data-event={ev} onClick={() => openEvents({ cell: at, event: ev })} title="Open in the code studio">
                <Zap size={13} className="ins-ev-ico" aria-hidden />
                <span className="ins-ev-main">
                  <span className="ins-ev-name">{sayEvent(ev, cell ? 'it' : null)}</span>
                  <code className="ins-ev-code">{oneLine(action)}</code>
                </span>
                <ChevronRight size={14} className="ins-ev-go" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Hint>{cell ? `Nothing happens yet. A handler runs an action ${first ? sayEvent(first, 'it').replace(/^When/, 'when') : 'when an event reaches it'}.` : 'Nothing runs yet when the document opens or closes.'}</Hint>
      )}
      <button type="button" className="btn soft small ins-ev-add" onClick={() => openEvents({ cell: at })}><BellPlus size={14} /> Add a handler</button>
      {!cell && (
        <>
          <Sub>Actions</Sub>
          {actions.length ? (
            <ul className="ins-ev-list" aria-label="Actions">
              {actions.map((a) => (
                <li key={a.name}>
                  <button type="button" className="ins-ev" data-action={a.name} onClick={() => openEvents({ cell: null, action: a.name })} title="Open in the code studio">
                    <SquareFunction size={13} className="ins-ev-ico" aria-hidden />
                    <span className="ins-ev-main">
                      <code className="ins-ev-name">({[a.name, ...a.params].join(' ')})</code>
                    </span>
                    <ChevronRight size={14} className="ins-ev-go" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : <Hint>A custom action is a function any handler or button calls by name, like <code>(greet "Ann")</code>.</Hint>}
          <button type="button" className="btn soft small ins-ev-add" onClick={() => openStudio({ cell: DOC, prop: 'actions', tab: 'events' })}>
            <FunctionSquare size={14} /> New action
          </button>
        </>
      )}
    </Section>
  );
}
