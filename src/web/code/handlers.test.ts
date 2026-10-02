import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Doc, type Json, newDoc } from '../../core/types';
import { applyOp, applyOps } from '../../core/ops';
import { type World, evaluate } from '../../core/engine';
import { resolve } from '../../core/tree';
import { print, read } from '../../core/sx';
import { react } from '../../core/events';
import {
  actionNameProblem, actionsOf, changedKeys, collectionChoices, draftOps, eventChoices, eventNameProblem, eventRows, eventVars, newAction,
  parseData, presetAction, presetsFor, sayEvent, sayOp, sayTrace, splitParams, targetsFor,
} from './handlers';
import { lex } from './lexer';

const world: World = { rows: () => [], now: Date.UTC(2026, 9, 2) };
const docWith = (n: Json): Doc => applyOp(newDoc('t'), ['put', 'c1', n]).doc;
const cellOf = (doc: Doc, ref: string) => resolve(doc.root, ref)!;
const value = (doc: Doc, ref: string) => evaluate(doc, world).cells[cellOf(doc, ref).id].value;

const form = (): Doc => docWith(['col',
  ['input', { name: 'agree', type: 'checkbox', value: false }],
  ['data', { name: 'status' }, 'Not yet'],
  ['data', { name: 'n' }, 0],
  ['text', { name: 'thanks', hidden: true }, 'Thank you'],
  ['timer', { name: 'poll', every: 30 }],
  ['button', { name: 'go', do: ['emit!', 'saved', 1] }, 'Go'],
]);

test('events part: a cell lists its own events, then custom ones, then any other it handles', () => {
  const doc = form();
  const agree = cellOf(doc, 'agree');
  const rows = eventRows(doc, agree);
  assert.deepEqual(rows.map((r) => r.name), ['change', 'click', 'saved'], 'the checkbox raises change and click; "saved" is emitted by the button');
  assert.equal(rows[2].custom, true, 'saved is a custom event');
  // A handler on an event this kind never raises still shows, marked.
  const odd = applyOps(doc, [['set', agree.id, 'on.tick', ['set!', 'n', 1]]]).doc;
  const tick = eventRows(odd, cellOf(odd, 'agree')).find((r) => r.name === 'tick');
  assert.ok(tick?.stray, 'a tick handler on a checkbox is listed as not raised by its kind');
  const docRows = eventRows(doc, null).map((r) => r.name);
  assert.deepEqual(docRows, ['open', 'close', 'saved'], 'the document has open, close and the custom events');
  assert.deepEqual(eventRows(doc, cellOf(doc, 'c1')).map((r) => r.name), [], 'a column that handles nothing offers nothing');
});

test('events part: the names a handler sees come from the declarations', () => {
  assert.deepEqual(parseData('value: the new value; was: the value before'), [{ name: 'value', does: 'the new value' }, { name: 'was', does: 'the value before' }]);
  assert.deepEqual(parseData('nothing: it runs once'), [], 'the document opening binds nothing');
  const doc = form();
  const change = eventRows(doc, cellOf(doc, 'agree')).find((r) => r.name === 'change')!;
  assert.deepEqual(eventVars(change, true).map((v) => v.name), ['value', 'was', 'target', 'event']);
  const saved = eventRows(doc, null).find((r) => r.name === 'saved')!;
  assert.deepEqual(eventVars(saved, false).map((v) => v.name), ['payload', 'from', 'event'], 'a custom event brings payload and from');
  // Bound names colour as local names in the code editor.
  const kinds = lex('(set! status value)', (n) => (n === 'status' ? 'cell' : null), ['value']).map((t) => `${t.text}:${t.kind}`);
  assert.ok(kinds.includes('value:local'), `value reads as a local name, got ${kinds.join(' ')}`);
});

test('events part: presets write ready actions, and only offer what the document has', () => {
  const doc = form();
  const kinds = { agree: 'input', status: 'data', n: 'data', thanks: 'text', poll: 'timer', go: 'button' };
  const ctx = { vars: ['value', 'was', 'target', 'event'], kinds, actions: [] };
  const ids = presetsFor(ctx).map((p) => p.id);
  assert.ok(ids.includes('set-value') && ids.includes('start') && ids.includes('stop'), `set-value and the timer presets are offered: ${ids.join(' ')}`);
  assert.ok(!ids.includes('refresh') && !ids.includes('call'), 'no fetch cell and no action: those presets are left out');
  const say = (id: string, pick: string) => print(presetAction(id, pick, ctx), 60);
  assert.equal(say('set-value', 'status'), '(set! status value)');
  assert.equal(say('count', 'n'), '(set! n (+ n 1))');
  assert.equal(say('show', 'thanks'), '(show! thanks)');
  assert.equal(say('hide', 'thanks'), '(hide! thanks)');
  assert.equal(say('save', 'log'), '(insert! "log" {value value})');
  assert.equal(say('emit', 'saved'), '(emit! "saved" value)');
  assert.equal(say('stop', 'poll'), '(stop! poll)');
  // Without a value (a click), setting leaves the value to fill in, and saving keeps what the event has.
  const click = { vars: ['target', 'event'], kinds, actions: [{ name: 'greet', params: ['who', 'how'] }] };
  assert.ok(presetsFor(click).some((p) => p.id === 'set') && presetsFor(click).some((p) => p.id === 'call'), 'set (to fill in) and call are offered');
  assert.equal(print(presetAction('set', 'status', click), 60), '(set! status nil)');
  assert.equal(print(presetAction('call', 'greet', click), 60), '(greet nil nil)', 'an action call gets a slot per input');
  assert.equal(print(presetAction('save', 'log', click), 60), '(insert! "log" {at (now)})', 'a click brings only its target, so the time is saved');
  // The pick lists: cells a value can be set on, numbers to count, timers.
  assert.deepEqual(targetsFor(doc, 'settable', cellOf(doc, 'agree').id).map((t) => t.name), ['status', 'n', 'thanks'], 'never the cell itself; no buttons or timers');
  assert.deepEqual(targetsFor(doc, 'timer', null).map((t) => t.name), ['poll']);
  assert.deepEqual(targetsFor(doc, 'number', null).map((t) => t.name), ['status', 'n'], 'data cells and number inputs');
  assert.deepEqual(collectionChoices(['orders']).map((c) => c.name), ['orders', 'responses', 'log']);
  assert.deepEqual(eventChoices(doc).map((c) => c.name), ['saved', 'done', 'updated', 'reset']);
});

test('events part: a preset applied as ops makes the checkbox set status when ticked (D11 without the browser)', () => {
  const doc = form();
  const agree = cellOf(doc, 'agree');
  const text = print(presetAction('set-value', 'status', { vars: ['value'], kinds: {}, actions: [] }), 60);
  const drafts = { 'on.change': text };
  const keys = changedKeys(drafts, {});
  assert.deepEqual(keys, ['on.change']);
  const r = draftOps(agree.id, drafts, keys);
  assert.ok('ops' in r, 'the draft reads');
  assert.deepEqual(r.ops, [['set', agree.id, 'on.change', ['set!', 'status', '$value']]]);
  const withHandler = applyOps(doc, r.ops).doc;
  const ticked = react(withHandler, world, { ops: [['set', agree.id, 'value', true]] });
  assert.equal(value(ticked.doc, 'status'), true, 'ticking runs the handler');
  assert.equal(ticked.trace[0].name, 'change');
});

test('events part: drafts become ops for a cell or the document; empty removes; bad drafts are named', () => {
  const doc = form();
  const r = draftOps(null, { 'on.open': '(set! n (+ n 1))', 'actions.greet': '(fn (who) (set! status who))', 'on.close': '' }, ['on.open', 'actions.greet', 'on.close']);
  assert.ok('ops' in r, 'all three read');
  assert.deepEqual(r.ops.map((o) => [o[0], o[1]]), [['meta', 'on.open'], ['meta', 'actions.greet'], ['meta', 'on.close']]);
  assert.equal(r.ops[2][2], null, 'an emptied handler is removed');
  const after = applyOps(doc, r.ops).doc;
  assert.deepEqual(actionsOf(after).map((a) => [a.name, a.params]), [['greet', ['who']]]);
  const bad = draftOps(null, { 'actions.x': '(+ 1 2)' }, ['actions.x']);
  assert.ok('error' in bad && bad.key === 'actions.x' && /function/.test(bad.error), 'an action that is not a function is refused');
  const broken = draftOps('c2', { 'on.click': '(set! n' }, ['on.click']);
  assert.ok('error' in broken && broken.key === 'on.click', 'unfinished code is named');
  assert.deepEqual(changedKeys({ a: '', b: 'x', c: 'y' }, { b: 'x', c: 'z' }), ['c'], 'a new empty draft is no change');
  assert.equal(newAction(['who']), '(fn (who) nil)');
  assert.deepEqual(read(newAction([])), ['fn', [], null]);
  assert.deepEqual(splitParams('who, amount  $x 2bad who'), ['who', 'amount', 'x']);
});

test('events part: names for custom events and actions are checked', () => {
  assert.equal(eventNameProblem('saved'), null);
  assert.match(eventNameProblem('change') ?? '', /raise/, 'a built-in event is not a custom name');
  assert.match(eventNameProblem('9lives') ?? '', /letter/);
  assert.equal(actionNameProblem('greet', []), null);
  assert.match(actionNameProblem('sum', []) ?? '', /built-in/);
  assert.match(actionNameProblem('greet', ['greet']) ?? '', /already/);
});

test('events part: events and what ran, in words', () => {
  assert.equal(sayEvent('change', 'agree'), 'When agree changes');
  assert.equal(sayEvent('open', null), 'When the document opens');
  assert.equal(sayEvent('saved', 'go'), 'When “saved” is sent');
  const name = (id: string) => ({ c3: 'status', c5: 'thanks' } as Record<string, string>)[id] ?? id;
  assert.equal(sayOp(['set', 'c3', 'value', 'Agreed'], name), 'set status to "Agreed"');
  assert.equal(sayOp(['set', 'c5', 'hidden', null], name), 'showed thanks');
  assert.equal(sayOp(['set', 'c5', 'hidden', true], name), 'hid thanks');
  const lines = sayTrace([
    { cell: 'c2', name: 'change', depth: 0, ops: [['set', 'c3', 'value', true]], effects: [{ type: 'insert', collection: 'log', record: { value: true } }], at: 1 },
    { cell: null, name: 'saved', depth: 1, ops: [], effects: [], at: 1, error: 'boom' },
  ], name);
  assert.deepEqual(lines[0], { head: 'c2 · change', depth: 0, did: ['set status to true', 'saved a record to "log"'] });
  assert.equal(lines[1].head, 'the document · saved');
  assert.equal(lines[1].error, 'boom');
});
