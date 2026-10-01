import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Cell } from '../../../core/types';
import { borderSides, borderValue, formatPad, parsePad } from './box';
import { TABLE_LOOKS, TEXT_PRESETS, lookOps, matchLook, matchPreset, presetPatch } from './presets';
import {
  addColumnOps, addRowOps, changeFieldDo, collectionOf, copyDo, deleteDo, deleteFieldOps, distinctValues, freeName, literal, missingColumns, moved, pickingOps, withoutColumns,
  renameFieldOps, tableSource, toSavedOps, toTypedOps,
} from './tableOps';

const preset = (id: string) => TEXT_PRESETS.find((p) => p.id === id)!;
const look = (id: string) => TABLE_LOOKS.find((l) => l.id === id)!;

test('padding reads a number or "top right bottom left" and writes the shortest form back', () => {
  assert.deepEqual(parsePad(12), [12, 12, 12, 12]);
  assert.deepEqual(parsePad('8 16 8 16'), [8, 16, 8, 16]);
  assert.deepEqual(parsePad('8 16'), [8, 16, 8, 16]);
  assert.deepEqual(parsePad('4 0 4'), [4, 0, 4, 0]);
  assert.deepEqual(parsePad('10px'), [10, 10, 10, 10]);
  assert.equal(parsePad(['if', true, 4, 8]), null);
  assert.equal(parsePad('1em'), null);
  assert.equal(parsePad(undefined), null);
  assert.equal(formatPad([6, 6, 6, 6]), 6);
  assert.equal(formatPad([0, 0, 0, 0]), 0);
  assert.equal(formatPad([8, 16, 8, 16]), '8 16 8 16');
  assert.deepEqual(parsePad(formatPad([4, 0, 4, 16])), [4, 0, 4, 16]);
});

test('border sides go both ways', () => {
  assert.deepEqual(borderSides('all'), ['t', 'r', 'b', 'l']);
  assert.deepEqual(borderSides('bt'), ['t', 'b']);
  assert.deepEqual(borderSides('none'), []);
  assert.deepEqual(borderSides(undefined), []);
  assert.equal(borderValue(['b', 't']), 'tb');
  assert.equal(borderValue(['l', 'b', 't', 'r']), 'all');
  assert.equal(borderValue([]), null);
});

test('a text preset is recognised only when its keys are exactly there', () => {
  assert.equal(matchPreset(undefined)?.id, 'body');
  assert.equal(matchPreset({ bg: 'sunken', font: 'inter' })?.id, 'body');
  assert.equal(matchPreset({ size: 36, weight: 750, line: 1.1, tracking: -0.02 })?.id, 'title');
  assert.equal(matchPreset({ size: 36, weight: 750, line: 1.1, tracking: -0.02, font: 'serif' })?.id, 'title');
  assert.equal(matchPreset({ size: 36, weight: 750, line: 1.1, tracking: -0.02, italic: true }), undefined);
  assert.equal(matchPreset({ size: 13 })?.id, 'small');
  assert.equal(matchPreset({ size: 14 }), undefined);
  assert.equal(matchPreset(preset('quote').style)?.id, 'quote');
  assert.equal(matchPreset(preset('label').style)?.id, 'label');
});

test('applying a preset clears the typographic keys it does not set, and what the last preset added', () => {
  assert.deepEqual(presetPatch(preset('heading'), { size: 13, italic: true, bg: 'sunken' }), {
    size: 26, weight: 700, line: 1.2, tracking: -0.01, italic: null,
  });
  assert.deepEqual(presetPatch(preset('body'), { size: 36, weight: 750, line: 1.1, tracking: -0.02, fg: 'accent' }), {
    size: null, weight: null, line: null, tracking: null,
  });
  // From Quote to Title the quote's font, border and padding go too.
  assert.deepEqual(presetPatch(preset('title'), preset('quote').style), {
    font: null, italic: null, border: null, bcolor: null, pad: null, size: 36, weight: 750, line: 1.1, tracking: -0.02,
  });
  // A colour people chose themselves stays.
  assert.deepEqual(presetPatch(preset('small'), { fg: 'accent' }), { size: 13 });
  assert.deepEqual(presetPatch(preset('title'), preset('title').style), {});
});

test('table looks write only what changes, defaults as removals', () => {
  const cell: Cell = { id: 'c4', kind: 'table' };
  assert.equal(matchLook(cell)?.id, 'simple');
  assert.deepEqual(lookOps(cell, look('striped')), [['set', 'c4', 'header', 'filled'], ['set', 'c4', 'stripes', true]]);
  const striped: Cell = { ...cell, header: 'filled', stripes: true };
  assert.equal(matchLook(striped)?.id, 'striped');
  assert.deepEqual(lookOps(striped, look('grid')), [['set', 'c4', 'borders', 'grid'], ['set', 'c4', 'stripes', null]]);
  assert.deepEqual(lookOps(striped, look('simple')), [['set', 'c4', 'header', null], ['set', 'c4', 'stripes', null]]);
  assert.deepEqual(lookOps({ ...cell, density: 'roomy' }, look('compact')), [['set', 'c4', 'density', 'compact']]);
  assert.equal(matchLook({ ...cell, borders: 'outer' }), undefined);
});

test('a table knows where its rows come from', () => {
  assert.equal(tableSource({ id: 'a', kind: 'table', value: [] }), 'typed');
  assert.equal(tableSource({ id: 'a', kind: 'table', expr: ['rows', 'orders'] }), 'saved');
  assert.equal(collectionOf({ id: 'a', kind: 'table', expr: ['rows', 'orders'] }), 'orders');
  assert.equal(tableSource({ id: 'a', kind: 'table', expr: ['where', ['rows', 'orders'], 'paid', true] }), 'formula');
});

test('switching the source is one step that keeps the rows', () => {
  const saved: Cell = { id: 'c2', kind: 'table', expr: ['rows', 'orders'] };
  const rows = [{ id: 'r1', qty: 2 }, { id: 'r2', qty: 5 }];
  assert.deepEqual(toTypedOps(saved, rows), [['set', 'c2', 'value', rows], ['set', 'c2', 'expr', null]]);
  // Nothing to copy: rows typed before come back.
  const before: Cell = { ...saved, value: [{ item: 'Tea' }] };
  assert.deepEqual(toTypedOps(before, []), [['set', 'c2', 'value', [{ item: 'Tea' }]], ['set', 'c2', 'expr', null]]);
  assert.deepEqual(toSavedOps({ id: 'c2', kind: 'table', value: [] }, ' orders '), [['set', 'c2', 'expr', ['rows', 'orders']]]);
});

test('typed rows and fields', () => {
  const t: Cell = { id: 'c3', kind: 'table', value: [{ item: 'Tea', price: 3 }], columns: ['item', { key: 'price', format: 'EUR' }], group: 'price' };
  assert.deepEqual(addRowOps(t), [['set', 'c3', 'value', [{ item: 'Tea', price: 3 }, { item: '', price: '' }]]]);
  assert.deepEqual(addRowOps({ id: 'c3', kind: 'table' }), [['set', 'c3', 'value', [{ item: '' }]]]);
  assert.deepEqual(addColumnOps(t, 'qty'), [
    ['set', 'c3', 'value', [{ item: 'Tea', price: 3, qty: '' }]],
    ['set', 'c3', 'columns', ['item', { key: 'price', format: 'EUR' }, 'qty']],
  ]);
  assert.deepEqual(addColumnOps({ id: 'c3', kind: 'table' }, 'name'), [['set', 'c3', 'value', [{ name: '' }]]]);
  assert.deepEqual(addColumnOps(t, '  '), []);
  assert.deepEqual(renameFieldOps(t, 'price', 'cost'), [
    ['set', 'c3', 'value', [{ item: 'Tea', cost: 3 }]],
    ['set', 'c3', 'columns', ['item', { key: 'cost', format: 'EUR' }]],
    ['set', 'c3', 'group', 'cost'],
  ]);
  assert.deepEqual(deleteFieldOps(t, 'price'), [
    ['set', 'c3', 'value', [{ item: 'Tea' }]],
    ['set', 'c3', 'columns', ['item']],
    ['set', 'c3', 'group', null],
  ]);
});

test('row button presets write the expression for you', () => {
  assert.deepEqual(changeFieldDo('orders', 'status', 'Done'), ['update!', 'orders', ['get', '$row', 'id'], { status: 'Done' }]);
  assert.deepEqual(changeFieldDo('orders', 'qty', '3'), ['update!', 'orders', ['get', '$row', 'id'], { qty: 3 }]);
  assert.deepEqual(changeFieldDo('orders', 'paid', 'true'), ['update!', 'orders', ['get', '$row', 'id'], { paid: true }]);
  assert.deepEqual(deleteDo('orders'), ['delete!', 'orders', ['get', '$row', 'id']]);
  assert.deepEqual(copyDo('chosen', 'client'), ['set!', 'chosen', ['get', '$row', 'client']]);
  assert.equal(literal(' 12.5 '), 12.5);
  assert.equal(literal('12 apples'), '12 apples');
});

test('turning picking off forgets the picked rows', () => {
  const t: Cell = { id: 'c5', kind: 'table', select: 'many', selected: [0, 2] };
  assert.deepEqual(pickingOps(t, 'off'), [['set', 'c5', 'select', null], ['set', 'c5', 'selected', null]]);
  assert.deepEqual(pickingOps(t, 'one'), [['set', 'c5', 'select', 'one']]);
  assert.deepEqual(pickingOps(t, 'many'), []);
  assert.deepEqual(pickingOps({ id: 'c5', kind: 'table' }, 'off'), []);
});

test('columns the data no longer has are found and dropped', () => {
  const rows = [{ id: 'r1', client: 'Acme', status: 'Due' }];
  const columns = ['item', { key: 'status', show: 'badge' }, 'price'];
  assert.deepEqual(missingColumns(rows, columns), ['item', 'price']);
  assert.deepEqual(missingColumns([], columns), []);
  assert.deepEqual(missingColumns(rows, null), []);
  assert.deepEqual(withoutColumns(columns, ['item', 'price']), [{ key: 'status', show: 'badge' }]);
  assert.equal(withoutColumns(['item'], ['item']), null);
});

test('small helpers', () => {
  assert.equal(freeName('table', new Set(['table1', 'c1'])), 'table2');
  assert.deepEqual(moved([1, 2, 3], 0, 1), [2, 1, 3]);
  assert.deepEqual(moved([1, 2, 3], 0, -1), [1, 2, 3]);
  assert.deepEqual(distinctValues([{ s: 'Paid' }, { s: 'Due' }, { s: 'Paid' }, { s: '' }, { s: 3 }], 's'), ['Paid', 'Due', '3']);
});
