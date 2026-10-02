import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Doc, type Json, type Op, newDoc } from './types';
import { OpError, applyOp, applyOps } from './ops';
import { type World, evaluate, runAction } from './engine';
import { resolve } from './tree';
import { build, toNotation } from './notation';
import { outline } from './outline';
import { print, read } from './sx';
import { BUILTIN_EVENTS, KIND_EVENTS, MAX_DEPTH, customEvents, durationMs, eventsOf, react, sampleData } from './events';

const world: World = { rows: () => [], now: Date.UTC(2026, 8, 30) };

function docWith(n: Json): Doc {
  return applyOp(newDoc('t'), ['put', 'c1', n]).doc;
}
const id = (doc: Doc, ref: string) => resolve(doc.root, ref)!.id;
const value = (doc: Doc, ref: string, w: World = world) => evaluate(doc, w).cells[id(doc, ref)].value;
const st = (doc: Doc, ref: string) => evaluate(doc, world).cells[id(doc, ref)];
/** A person sets a cell's value; their handlers follow. */
const setBy = (doc: Doc, ref: string, v: Json) => react(doc, world, { ops: [['set', id(doc, ref), 'value', v]] });
/** Press a button: its do runs, then its click handler and what they set off. */
function press(doc: Doc, ref: string) {
  const b = resolve(doc.root, ref)!;
  return react(doc, world, { run: { cell: b.id, name: 'click', action: b.do! }, events: [{ cell: b.id, name: 'click' }] });
}

test('handlers: notation round-trips, and bad names and times are refused', () => {
  const n: Json = ['col',
    ['input', { name: 'agree', type: 'checkbox', on: { change: ['set!', 'status', '$value'] } }],
    ['timer', { name: 'poll', every: 2, on: { tick: ['set!', 'n', ['+', '$n', 1]] } }],
    ['fetch', { name: 'rate', every: '1m' }, '/api/demo/rate'],
    ['data', { name: 'n' }, 0], ['data', { name: 'status' }, '']];
  const doc = docWith(n);
  const again = docWith(toNotation(doc.root, false));
  assert.deepEqual(toNotation(again.root, false), toNotation(doc.root, false));
  assert.equal(resolve(doc.root, 'rate')!.url, '/api/demo/rate');
  assert.deepEqual(toNotation(resolve(doc.root, 'rate')!, false), ['fetch', { name: 'rate', every: '1m' }, '/api/demo/rate']);
  const ctx = () => ({ gen: () => 'x' + Math.random(), used: new Set<string>(), names: new Set<string>() });
  assert.throws(() => build(['text', { on: { '1click': ['set!', 'a', 1] } }, 'x'], ctx()), /not an event name/);
  assert.throws(() => build(['timer', { every: 'soon' }], ctx()), /every is a time/);
  assert.throws(() => build(['fetch', { headers: { a: 1 } }], ctx()), /headers are an object of texts/);
  assert.equal(durationMs(30), 30_000);
  assert.equal(durationMs('2m'), 120_000);
  assert.equal(durationMs('500ms'), 500);
  assert.equal(durationMs('1h'), 3_600_000);
  assert.equal(durationMs(0), null);
  // The Lisp spelling of the new place forms keeps the cell's name bare.
  assert.deepEqual(read('(start! poll)'), ['start!', 'poll']);
  assert.equal(print(['refresh!', 'rate']), '(refresh! rate)');
  assert.deepEqual(read('(status rate)'), ['status', 'rate']);
});

test('handlers are set by ops one at a time, undo, and follow a renamed cell', () => {
  let doc = docWith(['col', ['data', { name: 'n' }, 0], ['button', { name: 'b' }, 'Go']]);
  const r = applyOp(doc, ['set', 'b', 'on.click', ['set!', 'n', 1]]);
  assert.deepEqual(resolve(r.doc.root, 'b')!.on, { click: ['set!', 'n', 1] });
  assert.deepEqual(r.inverse, ['set', id(doc, 'b'), 'on.click', null]);
  assert.equal(resolve(applyOp(r.doc, r.inverse).doc.root, 'b')!.on, undefined);
  assert.throws(() => applyOp(doc, ['set', 'b', 'on.no way', 1]), /not an event name/);
  doc = r.doc;
  // The document's handlers and actions are meta paths.
  const m = applyOps(doc, [['meta', 'on.open', ['set!', 'n', ['+', '$n', 1]]], ['meta', 'actions.bump', ['fn', ['k'], ['set!', 'n', ['+', '$n', '$k']]]]]);
  assert.deepEqual(m.doc.meta.on, { open: ['set!', 'n', ['+', '$n', 1]] });
  assert.ok(m.doc.meta.actions?.bump, 'the action is stored');
  const back = applyOp(m.doc, m.inverse).doc;
  assert.equal(back.meta.on, undefined);
  assert.equal(back.meta.actions, undefined);
  assert.throws(() => applyOp(doc, ['meta', 'actions.sum', ['fn', ['x'], 1]]), /built-in function/);
  assert.throws(() => applyOp(doc, ['meta', 'actions.bump', ['set!', 'n', 1]]), /written as a function/);
  assert.throws(() => applyOp(doc, ['meta', 'title.x', 'a']), OpError);
  // Renaming n reaches the button's handler and the document's.
  const renamed = applyOp(m.doc, ['set', 'n', 'name', 'count']).doc;
  assert.deepEqual(resolve(renamed.root, 'b')!.on, { click: ['set!', 'count', 1] });
  assert.deepEqual(renamed.meta.on, { open: ['set!', 'count', ['+', '$count', 1]] });
  assert.deepEqual(renamed.meta.actions?.bump, ['fn', ['k'], ['set!', 'count', ['+', '$count', '$k']]]);
  // A function's parameter and an event's own variable are not the cell of the same name.
  const shadow = applyOps(docWith(['col', ['data', { name: 'who' }, ''], ['data', { name: 'status' }, ''],
    ['fetch', { name: 'f', on: { fail: ['set!', 'note', '$status'], load: ['set!', 'note', '$status'] } }, '/api/demo/rate'], ['data', { name: 'note' }, '']]),
  [['meta', 'actions.hi', ['fn', ['who'], ['set!', 'note', '$who']]]]).doc;
  const r1 = applyOp(shadow, ['set', 'who', 'name', 'guest']).doc;
  assert.deepEqual(r1.meta.actions?.hi, ['fn', ['who'], ['set!', 'note', '$who']]);
  const r2 = applyOp(shadow, ['set', 'status', 'name', 'banner']).doc;
  assert.deepEqual(resolve(r2.root, 'f')!.on, { fail: ['set!', 'note', '$status'], load: ['set!', 'note', '$banner'] });
  // A plain col with a handler is not dissolved.
  const held = applyOp(docWith(['col', ['col', { on: { click: ['set!', 'x', 1] } }, ['text', 'a']], ['data', { name: 'x' }, 0]]), ['set', 'c1', 'size', 2]).doc;
  assert.equal(held.root.children![0].kind, 'col');
});

test('change: ticking and unticking a checkbox runs the handler with value and was', () => {
  const doc = docWith(['col',
    ['input', { name: 'agree', type: 'checkbox', value: false, on: { change: ['do', ['set!', 'status', ['if', '$value', 'Agreed', 'Not yet']], ['set!', 'seen', ['str', '$was', '→', '$value']]] } }],
    ['data', { name: 'status' }, ''], ['data', { name: 'seen' }, '']]);
  const on = setBy(doc, 'agree', true);
  assert.equal(value(on.doc, 'status'), 'Agreed');
  assert.equal(value(on.doc, 'seen'), 'no→yes');
  assert.equal(on.trace.length, 1);
  assert.equal(on.trace[0].name, 'change');
  assert.equal(on.trace[0].ops.length, 2);
  const off = setBy(on.doc, 'agree', false);
  assert.equal(value(off.doc, 'status'), 'Not yet');
  // The person's op and the handlers' ops replay as one change, and one inverse undoes both.
  const both = applyOps(doc, [['set', id(doc, 'agree'), 'value', true], ...on.ops]);
  assert.deepEqual(both.doc.root, on.doc.root);
  assert.deepEqual(applyOp(both.doc, both.inverse).doc.root, doc.root);
});

test('change: lists bind the item, tables the picked rows, formulas react to what they read', () => {
  const doc = docWith(['col',
    ['list', { name: 'todo', type: 'check', on: { change: ['set!', 'last', ['str', '$index', ':', ['get', '$item', 'text'], ':', ['get', '$item', 'done']]] } }, 'Milk', 'Eggs'],
    ['table', { name: 'people', select: 'one', value: [{ id: 'a', name: 'Ann' }, { id: 'b', name: 'Bo' }], on: { pick: ['set!', 'chosen', ['get', ['first', '$rows'], 'name']] } }],
    ['input', { name: 'qty', type: 'number', value: 1 }],
    ['formula', { name: 'total', on: { change: ['set!', 'moved', ['-', '$value', '$was']] } }, ['*', '$qty', 10]],
    ['calendar', { name: 'day', on: { change: ['set!', 'picked', '$value'] } }],
    ['data', { name: 'last' }, ''], ['data', { name: 'chosen' }, ''], ['data', { name: 'moved' }, 0], ['data', { name: 'picked' }, '']]);
  const ticked = setBy(doc, 'todo', [{ text: 'Milk', done: false }, { text: 'Eggs', done: true }]);
  assert.equal(value(ticked.doc, 'last'), '1:Eggs:yes');
  const picked = react(doc, world, { ops: [['set', id(doc, 'people'), 'selected', ['b']]] });
  assert.equal(value(picked.doc, 'chosen'), 'Bo');
  const more = setBy(doc, 'qty', 4);
  assert.equal(value(more.doc, 'moved'), 30);
  const day = setBy(doc, 'day', '2026-10-05');
  assert.equal(value(day.doc, 'picked'), '2026-10-05');
});

test('containers raise open and close from their values, whoever changed them', () => {
  const doc = docWith(['col',
    ['accordion', { name: 'faq', on: { open: ['set!', 'log', ['str', 'open ', '$title']], close: ['set!', 'shut', '$title'] } },
      ['panel', { title: 'A' }, 'a'], ['panel', { title: 'B' }, 'b']],
    ['collapsible', { name: 'more', title: 'More', on: { close: ['set!', 'folded', true] } }, 'x'],
    ['button', { name: 'go', do: ['set!', 'faq', 'B'] }, 'Go'],
    ['data', { name: 'log' }, ''], ['data', { name: 'shut' }, ''], ['data', { name: 'folded' }, false]]);
  const a = setBy(doc, 'faq', ['A']);
  assert.equal(value(a.doc, 'log'), 'open A');
  const b = press(a.doc, 'go');
  assert.equal(value(b.doc, 'log'), 'open B');
  assert.equal(value(b.doc, 'shut'), 'A');
  assert.equal(value(setBy(doc, 'more', false).doc, 'folded'), true);
});

test('pointer events carry their target, and a button runs its do then its click handler', () => {
  const doc = docWith(['col',
    ['text', { name: 'hello', on: { click: ['set!', 'clicked', '$target'], dblclick: ['set!', 'twice', true] } }, 'Hi'],
    ['table', { name: 't', value: [{ name: 'Ann' }], on: { click: ['set!', 'clicked', ['get', '$row', 'name']] } }],
    ['button', { name: 'b', do: ['set!', 'n', 1], on: { click: ['set!', 'n', ['+', '$n', 10]] } }, 'B'],
    ['data', { name: 'clicked' }, ''], ['data', { name: 'twice' }, false], ['data', { name: 'n' }, 0]]);
  const c = react(doc, world, { events: [{ cell: id(doc, 'hello'), name: 'click' }] });
  assert.equal(value(c.doc, 'clicked'), 'hello');
  assert.equal(value(react(doc, world, { events: [{ cell: id(doc, 'hello'), name: 'dblclick' }] }).doc, 'twice'), true);
  const row = react(doc, world, { events: [{ cell: id(doc, 't'), name: 'click', data: { row: { name: 'Ann' }, index: 0 } }] });
  assert.equal(value(row.doc, 'clicked'), 'Ann');
  // The handler sees what do already changed: 1, then + 10.
  assert.equal(value(press(doc, 'b').doc, 'n'), 11);
  // An event nobody handles runs nothing and leaves no trace.
  assert.equal(react(doc, world, { events: [{ cell: id(doc, 'n'), name: 'click' }] }).trace.length, 0);
});

test('custom events: an emit reaches every listener, which read the payload', () => {
  const doc = docWith(['col',
    ['button', { name: 'save', do: ['emit!', 'saved', { total: 42 }] }, 'Save'],
    ['data', { name: 'a', on: { saved: ['set!', 'a', ['get', '$payload', 'total']] } }, 0],
    ['data', { name: 'b', on: { saved: ['set!', 'b', ['str', 'from ', '$from']] } }, '']]);
  const withDoc = applyOp(doc, ['meta', 'on.saved', ['set!', 'c', ['get', ['get', '$event', 'payload'], 'total']]]).doc;
  const full = applyOp(withDoc, ['split', id(doc, 'b'), 'col', { cell: ['data', { name: 'c' }, 0] }]).doc;
  const r = press(full, 'save');
  assert.equal(value(r.doc, 'a'), 42);
  assert.equal(value(r.doc, 'b'), 'from save');
  assert.equal(value(r.doc, 'c'), 42);
  assert.deepEqual(r.trace.map((t) => [t.name, t.depth, t.via ?? '']), [['click', 0, 'do'], ['saved', 1, ''], ['saved', 1, ''], ['saved', 1, '']]);
  assert.deepEqual(customEvents(full), ['saved']);
  // A built-in name can't be emitted.
  const bad = docWith(['button', { name: 'x', do: ['emit!', 'click'] }, 'X']);
  assert.match(press(bad, 'x').trace.find((t) => t.error)?.error ?? '', /raises itself/);
});

test('custom actions: defined once, called with different arguments; a missing name is an error before anything runs', () => {
  let doc = docWith(['col',
    ['button', { name: 'one', do: ['greet', 'Ann'] }, 'Ann'],
    ['button', { name: 'two', do: ['greet', 'Bo', '!'] }, 'Bo'],
    ['button', { name: 'bad', do: ['grete', 'Cy'] }, 'Cy'],
    ['data', { name: 'hello' }, '']]);
  doc = applyOp(doc, ['meta', 'actions.greet', read('(fn (who mark) (set! hello (str "Hi " who (default mark "."))))') as Json]).doc;
  assert.equal(value(press(doc, 'one').doc, 'hello'), 'Hi Ann.');
  assert.equal(value(press(doc, 'two').doc, 'hello'), 'Hi Bo!');
  assert.match(st(doc, 'bad').error ?? '', /no action or function called "grete"/);
  assert.equal(st(doc, 'one').error, undefined);
  assert.match(outline(doc, evaluate(doc, world)), /action greet \(who mark\)/);
  assert.match(outline(doc, evaluate(doc, world)), /"Cy" do \(grete "Cy"\) → ! its action: no action or function called "grete"/);
  // Handlers are checked the same way, and the document's own.
  const h = applyOps(doc, [['set', 'hello', 'on.change', ['nope']], ['meta', 'on.open', ['nada']]]).doc;
  assert.match(st(h, 'hello').error ?? '', /on change: no action or function called "nope"/);
  assert.match(outline(h, evaluate(h, world)), /document → ! on open: no action or function called "nada"/);
  // Variables, let and fn names are not calls to unknown things.
  const ok = docWith(['button', { name: 'k', do: read('(let (f (fn (x) x)) (f 1))') as Json }, 'K']);
  assert.equal(st(ok, 'k').error, undefined);
});

test('the loop guard stops a handler setting off itself, directly and through another cell', () => {
  const self = docWith(['col', ['data', { name: 'n', on: { change: ['set!', 'n', ['+', '$n', 1]] } }, 0], ['button', { name: 'b', do: ['set!', 'n', 1] }, 'B']]);
  const r = press(self, 'b');
  const err = r.trace.at(-1)!;
  assert.match(err.error ?? '', new RegExp(`went ${MAX_DEPTH} deep \\(b → n → n`));
  // The button's do is depth 0; its change handler runs at depths 1 to MAX_DEPTH - 1.
  assert.equal(r.trace.filter((t) => !t.error && !t.via).length, MAX_DEPTH - 1);
  assert.equal(value(r.doc, 'n'), MAX_DEPTH, 'what ran is kept');
  const pair = docWith(['col',
    ['data', { name: 'a', on: { change: ['set!', 'b', ['+', '$a', 1]] } }, 0],
    ['data', { name: 'b', on: { change: ['set!', 'a', ['+', '$b', 1]] } }, 0]]);
  const p = setBy(pair, 'a', 1);
  assert.match(p.trace.at(-1)!.error ?? '', /a → b → a → b/);
  const ping = docWith(['data', { name: 'z', on: { ping: ['emit!', 'ping'] } }, 0]);
  const q = react(ping, world, { events: [{ cell: null, name: 'ping' }] });
  assert.match(q.trace.at(-1)!.error ?? '', /deep/);
});

test('timers, fetches and the actions that drive them', () => {
  const doc = docWith(['col',
    ['timer', { name: 'poll', every: 2 }],
    ['fetch', { name: 'rate' }, '/api/demo/rate'],
    ['text', { name: 'note', hidden: true }, 'Thanks'],
    ['button', { name: 'b', do: read('(do (stop! poll) (refresh! rate) (show! note))') as Json }, 'B'],
    ['button', { name: 'go', do: read('(start! poll)') as Json }, 'Go'],
    ['button', { name: 'wrong', do: read('(start! note)') as Json }, 'W'],
    ['formula', { name: 'shown' }, read('(str (status rate) "/" (error-of rate) "/" (get rate "rate"))') as Json]]);
  assert.equal(value(doc, 'poll'), true);
  assert.equal(value(doc, 'shown'), 'idle//');
  const loading: World = { ...world, fetched: () => ({ state: 'loading' }) };
  assert.equal(value(doc, 'shown', loading), 'loading//');
  const ready: World = { ...world, fetched: () => ({ state: 'ready', data: { rate: 4.2 }, at: 1 }) };
  assert.equal(value(doc, 'shown', ready), 'ready//4.2');
  assert.deepEqual(value(doc, 'rate', ready), { rate: 4.2 });
  const failed: World = { ...world, fetched: () => ({ state: 'failed', error: 'HTTP 500' }) };
  assert.equal(value(doc, 'shown', failed), 'failed/HTTP 500/');
  const fx = runAction(doc, world, id(doc, 'b'), resolve(doc.root, 'b')!.do!);
  assert.deepEqual(fx, [
    { type: 'op', op: ['set', id(doc, 'poll'), 'value', false] },
    { type: 'refresh', cell: id(doc, 'rate') },
    { type: 'op', op: ['set', id(doc, 'note'), 'hidden', null] },
  ]);
  const stopped = applyOps(doc, fx.filter((e) => e.type === 'op').map((e) => (e as { op: Op }).op)).doc;
  assert.equal(value(stopped, 'poll'), false);
  assert.equal(resolve(stopped.root, 'note')!.hidden, undefined);
  assert.deepEqual(runAction(stopped, world, id(doc, 'go'), resolve(doc.root, 'go')!.do!), [{ type: 'op', op: ['set', id(doc, 'poll'), 'value', world.now] }]);
  assert.throws(() => runAction(doc, world, id(doc, 'wrong'), resolve(doc.root, 'wrong')!.do!), /start! needs a timer/);
  const o = outline(doc, evaluate(doc, ready));
  assert.match(o, /timer poll every 2 s running/);
  assert.match(o, /fetch rate \/api\/demo\/rate ready → \{"rate":4.2\}/);
});

test('the document opening, and reactions in documents with no handlers', () => {
  let doc = docWith(['data', { name: 'visits' }, 0]);
  doc = applyOp(doc, ['meta', 'on.open', read('(set! visits (+ visits 1))') as Json]).doc;
  const once = react(doc, world, { events: [{ cell: null, name: 'open' }] });
  const twice = react(once.doc, world, { events: [{ cell: null, name: 'open' }] });
  assert.equal(value(twice.doc, 'visits'), 2);
  assert.equal(twice.trace[0].cell, null);
  // No handlers: nothing is evaluated or run, the ops simply apply.
  const plain = docWith(['input', { name: 'q', type: 'number', value: 1 }]);
  const r = setBy(plain, 'q', 2);
  assert.deepEqual([r.ops, r.trace, r.effects], [[], [], []]);
  assert.equal(value(r.doc, 'q'), 2);
});

test('each kind declares its events in one place; sample data lets a handler be tried', () => {
  for (const [kind, k] of Object.entries(KIND_EVENTS)) {
    assert.ok(k.raises.length, `${kind} raises something`);
    if (k.raises.some((e) => e.from === 'change')) assert.ok(k.watch?.length, `${kind} says how its change events are worked out`);
  }
  assert.deepEqual(eventsOf(null).map((e) => e.name), ['open', 'close']);
  assert.ok(BUILTIN_EVENTS.has('tick') && BUILTIN_EVENTS.has('pick') && !BUILTIN_EVENTS.has('saved'));
  const doc = docWith(['col', ['list', { name: 'l', type: 'check' }, 'A'], ['table', { name: 't', value: [{ x: 1 }] }]]);
  assert.deepEqual(sampleData(doc, world, resolve(doc.root, 'l')!, 'change').item, { text: 'A', done: false });
  assert.deepEqual(sampleData(doc, world, resolve(doc.root, 't')!, 'click').row, { x: 1 });
  assert.deepEqual(sampleData(doc, world, null, 'open'), {});
});
