import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Cell, type Doc, type Json, type Op, newDoc } from './types';
import { OpError, applyOp, applyOps } from './ops';
import { evaluate, runAction } from './engine';
import { normalize, resolve } from './tree';
import { build, toNotation } from './notation';
import { outline } from './outline';
import { openSections, openTab, panelTitles, shownLeaves, toggleSection } from './containers';

const world = { rows: () => [] as unknown[], now: Date.UTC(2026, 8, 30) };

function docWith(n: Json): Doc {
  return applyOp(newDoc('t'), ['put', 'c1', n]).doc;
}
const cell = (doc: Doc, ref: string) => resolve(doc.root, ref)!;
const val = (doc: Doc, ref: string) => evaluate(doc, world).cells[cell(doc, ref).id];
/** The tree as kinds and names, so a test can say what shape it expects. */
const shape = (c: Cell): Json => (c.children ? [c.kind + (c.title ? `:${c.title}` : ''), ...c.children.map(shape)] : c.name ?? c.kind);
/** Run a button's action and apply what it does. */
function press(doc: Doc, button: string): Doc {
  const b = cell(doc, button);
  const ops = runAction(doc, world, b.id, b.do!).map((e) => (e as { op: Op }).op);
  return applyOps(doc, ops).doc;
}
/** Apply an op and check that its inverse gives back the document it started from. */
function step(doc: Doc, op: Op): Doc {
  const r = applyOp(doc, op);
  const back = applyOp(r.doc, r.inverse).doc;
  assert.deepEqual(toNotation(back.root), toNotation(doc.root), `undo of ${JSON.stringify(op)}`);
  return r.doc;
}

const TABS: Json = ['col',
  ['tabs', { name: 'view' },
    ['panel', { title: 'Overview' }, ['text', { name: 'intro' }, 'Hello'], ['formula', { name: 'hiddenTotal' }, ['*', 6, 7]]],
    ['panel', { title: 'Details' }, ['row', ['text', { name: 'a' }, 'A'], ['text', { name: 'b' }, 'B']]],
    ['panel', { title: 'Notes' }, ['text', { name: 'note' }, 'N']]],
  ['text', { name: 'banner', hidden: ['!=', '$view', 'Details'] }, 'Details are open'],
  ['button', { name: 'go', do: ['set!', 'view', 'Details'] }, 'Open details'],
];

test('containers: notation round-trips and fills in defaults', () => {
  for (const n of [
    TABS,
    ['accordion', { name: 'faq', multiple: true, value: ['B'] }, ['panel', { title: 'A' }, 'x'], ['panel', { title: 'B' }, ['row', 'y', 'z']]],
    ['collapsible', { name: 'more', title: 'More', value: false }, ['text', 'inside'], ['table', { value: [{ a: 1 }] }]],
    ['data', { name: 'step' }, 2],
    ['data', { name: 'cfg' }, { vat: 0.2 }],
    ['data', { name: 'regions' }, ['North', 'South']],
  ] as Json[]) {
    const d = docWith(n);
    const again = docWith(toNotation(d.root, false));
    assert.deepEqual(toNotation(again.root, false), toNotation(d.root, false), JSON.stringify(n));
  }
  const fresh = docWith(['tabs']);
  assert.deepEqual(shape(fresh.root), ['tabs', ['panel:Tab 1', 'empty'], ['panel:Tab 2', 'empty']]);
  assert.deepEqual(shape(docWith(['accordion', ['panel', 'a'], ['panel', 'b']]).root), ['accordion', ['panel:Section 1', 'text'], ['panel:Section 2', 'text']]);
  assert.throws(() => docWith(['tabs', ['text', 'not a panel']]), /tabs hold panels/);
  assert.throws(() => docWith(['col', ['panel', { title: 'x' }]]), /only sits directly in tabs/);
  assert.equal(cell(docWith(['data', { name: 'cfg' }, { vat: 0.2 }]), 'cfg').value!.constructor, Object);
});

test('containers: normalize keeps a container with a single child, and tidies inside it', () => {
  const ctx = { gen: (() => { let n = 100; return () => 'c' + n++; })(), used: new Set<string>(), names: new Set<string>() };
  const one = build(['tabs', ['panel', { title: 'Only' }, ['col', ['text', 'a'], ['text', 'b']]]], ctx);
  // The plain col inside the panel dissolves into it (a panel stacks like a col); the tabs and panel stay.
  assert.deepEqual(shape(normalize(one)), ['tabs', ['panel:Only', 'text', 'text']]);
  const fold = build(['col', ['collapsible', { title: 'T' }, ['text', 'only']], ['text', 'after']], ctx);
  assert.deepEqual(shape(normalize(fold)), ['col', ['collapsible:T', 'text'], 'text']);
  const single = build(['collapsible', { title: 'T' }, ['row', ['text', 'only']]], ctx);
  assert.deepEqual(shape(normalize(single)), ['collapsible:T', 'text']);
});

test('containers: split, merge, move, dup and remove inside panels, each undoable', () => {
  let d = docWith(TABS);
  // Split a cell stacked in a panel: the new cell joins the panel's stack.
  d = step(d, ['split', 'note', 'col']);
  assert.deepEqual((shape(cell(d, 'view')) as Json[]).slice(3), [['panel:Notes', 'note', 'empty']]);
  // Split side by side: a row inside the panel.
  d = step(d, ['split', 'intro', 'row']);
  assert.deepEqual((shape(cell(d, 'view')) as Json[])[1], ['panel:Overview', ['row', 'intro', 'empty'], 'hiddenTotal']);
  // Splitting a panel adds a panel beside it, with a title of its own.
  d = step(d, ['split', cell(d, 'view').children![2].id, 'row']);
  assert.deepEqual(panelTitles(cell(d, 'view')), ['Overview', 'Details', 'Notes', 'Tab 4']);
  // Dup a panel: a new tab with copied cells and a fresh title.
  d = step(d, ['dup', cell(d, 'view').children![1].id]);
  assert.deepEqual(panelTitles(cell(d, 'view')), ['Overview', 'Details', 'Details 2', 'Notes', 'Tab 4']);
  // Move a panel: reorders the tabs.
  const v = cell(d, 'view').children!;
  d = step(d, ['move', v[3].id, v[0].id, 'before']);
  assert.deepEqual(panelTitles(cell(d, 'view')), ['Notes', 'Overview', 'Details', 'Details 2', 'Tab 4']);
  // Move a cell from one panel into another.
  d = step(d, ['move', 'a', 'intro', 'after']);
  assert.equal(cell(d, 'a').id, resolve(d.root, 'a')!.id);
  // Merging the whole content of a panel keeps the panel and its title.
  const details = cell(d, 'view').children!.find((p) => p.title === 'Details')!;
  assert.deepEqual(shape(details), ['panel:Details', 'b']);
  const overview = cell(d, 'view').children!.find((p) => p.title === 'Overview')!;
  d = step(d, ['merge', overview.id]);
  assert.deepEqual(shape(cell(d, 'view').children!.find((p) => p.title === 'Overview')!), ['panel:Overview', 'intro']);
  // Removing the last cell of a panel leaves an empty cell, so the tab stays.
  d = step(d, ['remove', 'b']);
  assert.deepEqual(shape(cell(d, 'view').children!.find((p) => p.title === 'Details')!), ['panel:Details', 'empty']);
  // Removing a panel removes the tab; the last one can't go.
  const one = docWith(['tabs', { name: 't' }, ['panel', { title: 'Only' }, 'x']]);
  assert.throws(() => applyOp(one, ['remove', cell(one, 't').children![0].id]), /keep at least one panel/);
  // What can't happen: merging across tabs, a cell beside a panel, a panel swapped with a cell, a non-panel put in place of a panel.
  const fresh = docWith(TABS);
  assert.throws(() => applyOp(fresh, ['merge', 'intro', 'note']), /different tabs/);
  assert.throws(() => applyOp(fresh, ['move', 'banner', cell(fresh, 'view').children![0].id, 'after']), /only panels sit in tabs/);
  assert.throws(() => applyOp(fresh, ['swap', 'banner', cell(fresh, 'view').children![0].id]), /only swaps with another panel/);
  assert.throws(() => applyOp(fresh, ['put', cell(fresh, 'view').children![0].id, ['text', 'x']]), /hold only panels/);
  assert.throws(() => applyOp(fresh, ['split', cell(fresh, 'view').children![0].id, 'col', { cell: ['text', 'x'] }]), /another panel/);
});

test('tabs: the open tab is the value; formulas react and set! changes it', () => {
  let d = docWith(TABS);
  assert.equal(val(d, 'view').value, 'Overview');
  assert.equal(val(d, 'banner').hidden, true);
  // Panels that are not shown still evaluate.
  assert.equal(val(d, 'hiddenTotal').value, 42);
  d = press(d, 'go');
  assert.equal(cell(d, 'view').value, 'Details');
  assert.equal(val(d, 'view').value, 'Details');
  assert.equal(val(d, 'banner').hidden ?? false, false);
  // A stored title that no longer exists falls back to the first; case is forgiven.
  assert.equal(openTab({ ...cell(d, 'view'), value: 'gone' }), 'Overview');
  assert.equal(openTab({ ...cell(d, 'view'), value: 'notes' }), 'Notes');
  // Renaming the open tab keeps it open.
  const details = cell(d, 'view').children![1].id;
  const r = applyOp(d, ['set', details, 'title', 'Specs']);
  assert.equal(cell(r.doc, 'view').value, 'Specs');
  assert.deepEqual(toNotation(applyOp(r.doc, r.inverse).doc.root), toNotation(d.root));
  assert.match(outline(d, evaluate(d, world)), /tabs view 3 tabs, open "Details"/);
});

test('accordion: one at a time or any number; collapsible folds', () => {
  const acc = (multiple: boolean, value?: Json) =>
    build(['accordion', { multiple, ...(value !== undefined ? { value } : {}) }, ['panel', { title: 'A' }], ['panel', { title: 'B' }], ['panel', { title: 'C' }]],
      { gen: (() => { let n = 1; return () => 'x' + n++; })(), used: new Set(), names: new Set() });
  assert.deepEqual(openSections(acc(false)), []);
  assert.deepEqual(openSections(acc(false, ['B', 'C'])), ['B']);
  assert.deepEqual(openSections(acc(true, ['C', 'A'])), ['A', 'C']);
  assert.deepEqual(openSections(acc(true, 'b')), ['B']);
  assert.deepEqual(openSections(acc(true, true)), ['A', 'B', 'C']);
  // One at a time: opening B closes A. Any number: they're independent.
  assert.deepEqual(toggleSection(acc(false, ['A']), 'B'), ['B']);
  assert.deepEqual(toggleSection(acc(false, ['A']), 'A'), []);
  assert.deepEqual(toggleSection(acc(true, ['A']), 'C'), ['A', 'C']);
  assert.deepEqual(toggleSection(acc(true, ['A', 'C']), 'A'), ['C']);

  let d = docWith(['col',
    ['accordion', { name: 'faq' }, ['panel', { title: 'Shipping' }, ['table', { value: [{ a: 1 }] }]], ['panel', { title: 'Returns' }, ['chart', ['list', 1, 2]]]],
    ['collapsible', { name: 'more', title: 'More', value: false }, 'Hidden words'],
    ['button', { name: 'open', do: ['set!', 'faq', 'Returns'] }, 'Returns'],
    ['button', { name: 'fold', do: ['toggle!', 'more'] }, 'More'],
  ]);
  assert.deepEqual(val(d, 'faq').value, []);
  assert.equal(val(d, 'more').value, false);
  d = press(d, 'open');
  assert.deepEqual(val(d, 'faq').value, ['Returns']);
  d = press(d, 'fold');
  assert.equal(val(d, 'more').value, true);
  assert.equal(val(docWith(['collapsible', { title: 'x' }]), 'c1').value, true);
  assert.match(outline(d, evaluate(d, world)), /collapsible more "More" open/);
});

test('data cell: holds a value, formulas read it, set! changes it, hidden rules react', () => {
  let d = docWith(['col',
    ['data', { name: 'step' }, 1],
    ['data', { name: 'cfg' }, { vat: 0.2 }],
    ['text', { name: 's1', hidden: ['!=', '$step', 1] }, 'Step one'],
    ['text', { name: 's2', hidden: ['!=', '$step', 2] }, 'Step two'],
    ['formula', { name: 'tax' }, ['*', 100, ['get', '$cfg', 'vat']]],
    ['button', { name: 'next', do: ['set!', 'step', ['min', ['+', '$step', 1], 2]] }, 'Next'],
    ['button', { name: 'back', do: ['set!', 'step', ['max', ['-', '$step', 1], 1]] }, 'Back'],
  ]);
  assert.equal(val(d, 'step').value, 1);
  assert.equal(val(d, 'tax').value, 20);
  assert.equal(val(d, 's1').hidden ?? false, false);
  assert.equal(val(d, 's2').hidden, true);
  d = press(d, 'next');
  assert.equal(cell(d, 'step').value, 2);
  assert.equal(val(d, 's1').hidden, true);
  assert.equal(val(d, 's2').hidden ?? false, false);
  d = press(d, 'next');
  assert.equal(cell(d, 'step').value, 2);
  d = press(d, 'back');
  assert.equal(cell(d, 'step').value, 1);
  assert.match(outline(d, evaluate(d, world)), /data step \(never shown\) = 1/);
  assert.match(outline(d, evaluate(d, world)), /data cfg \(never shown\) = \{"vat":0.2\}/);
});

test('containers: a rename reaches titles that carry templates', () => {
  const d = docWith(['col', ['data', { name: 'n' }, 3], ['collapsible', { title: 'Items ({{n}})' }, 'x']]);
  assert.equal(val(d, cell(d, 'c1').children![1].id).props?.title, 'Items (3)');
  const r = applyOp(d, ['set', 'n', 'name', 'count']);
  assert.equal(r.doc.root.children![1].title, 'Items ({{count}})');
});

test('containers: only the leaves behind open tabs and sections are shown', () => {
  const d = docWith(['col',
    ['tabs', { name: 'view', value: 'Two' }, ['panel', { title: 'One' }, ['text', { name: 'a' }, 'a']], ['panel', { title: 'Two' }, ['text', { name: 'b' }, 'b']]],
    ['collapsible', { title: 'Folded', value: false }, ['text', { name: 'c' }, 'c']],
    ['accordion', { value: ['Y'] }, ['panel', { title: 'X' }, ['text', { name: 'x' }, 'x']], ['panel', { title: 'Y' }, ['text', { name: 'y' }, 'y']]],
  ]);
  assert.deepEqual(shownLeaves(d.root).map((c) => c.name), ['b', 'y']);
});
