import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDays, addMonths, eventsFrom, eventsOn, monthGrid, toDay, toEvents } from './month';
import { addPoint, smoothPath, spaceHeight, toStrokes } from './strokes';
import { columnChoices, columnsProp, filterRows, marks, nextSort, resolveColumns, rowCount, sortRows } from './rows';
import { change, changeText, numbers, spark } from './kpi';
import { asItems, inserted, itemText, moved, progress, removed, toggled, withText } from './items';

test('a month grid starts on Monday and pads with the neighbouring months', () => {
  const oct = monthGrid(2026, 9); // October 2026 starts on a Thursday
  assert.equal(oct.length, 5);
  assert.deepEqual(oct[0].slice(0, 4).map((d) => [d.iso, d.inMonth]), [
    ['2026-09-28', false], ['2026-09-29', false], ['2026-09-30', false], ['2026-10-01', true],
  ]);
  assert.equal(oct.at(-1)!.at(-1)!.iso, '2026-11-01');
  assert.ok(oct.every((w) => w.length === 7));
  const feb = monthGrid(2027, 1); // February 2027 starts on a Monday and fills four weeks
  assert.equal(feb.length, 4);
  assert.equal(feb[0][0].iso, '2027-02-01');
  assert.equal(monthGrid(2026, 2).length, 6); // March 2026 starts on a Sunday
});

test('days are read from anything that names one, and moved by days and months', () => {
  assert.equal(toDay('2026-10-01'), '2026-10-01');
  assert.equal(toDay('2026-10-01T23:30:00'), '2026-10-01');
  assert.equal(toDay(new Date(2026, 0, 5, 9)), '2026-01-05');
  assert.equal(toDay('nonsense'), null);
  assert.equal(toDay(null), null);
  assert.equal(toDay(''), null);
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2026-01-15', -1), '2025-12-15');
});

test('events are normalised, sorted and found by day', () => {
  const ev = toEvents([
    { date: '2026-10-12', title: 'Launch', color: 'live' },
    { date: '2026-10-03', end: '2026-10-05', label: 'Trip' },
    { name: 'No date' },
    'not a record',
    { start: '2026-11-02', title: 'Next month', end: '2026-10-01' },
  ]);
  assert.deepEqual(ev.map((e) => [e.start, e.end, e.title]), [
    ['2026-10-03', '2026-10-05', 'Trip'], ['2026-10-12', '2026-10-12', 'Launch'], ['2026-11-02', '2026-11-02', 'Next month'],
  ]);
  assert.equal(ev[1].color, 'live');
  assert.deepEqual(eventsOn(ev, '2026-10-04').map((e) => e.title), ['Trip']);
  assert.deepEqual(eventsFrom(ev, 2026, 9, '2026-10-06').map((e) => e.title), ['Launch']);
  assert.deepEqual(eventsFrom(ev, 2026, 9, '2026-09-01').map((e) => e.title), ['Trip', 'Launch']);
});

test('strokes are smoothed through midpoints and never cut off', () => {
  assert.equal(smoothPath([]), '');
  assert.match(smoothPath([10, 10]), /^M10 10l/);
  assert.equal(smoothPath([0, 0, 10, 10]), 'M0 0L10 10');
  assert.equal(smoothPath([0, 0, 10, 0, 20, 10, 30, 10]), 'M0 0Q10 0 15 5Q20 10 25 10L30 10');
  assert.deepEqual(addPoint([0, 0], 0.5, 0.5), [0, 0]);
  assert.deepEqual(addPoint([0, 0], 10.04, 3), [0, 0, 10, 3]);
  const strokes = toStrokes([{ c: 'ink', w: 4, p: [0, 0, 100, 900] }, { c: 'ink', p: [] }, 'x']);
  assert.equal(strokes.length, 1);
  assert.equal(spaceHeight(0.5, strokes), 900 + 2 + 24);
  assert.equal(spaceHeight(0.5, []), 500);
  assert.equal(spaceHeight(1.2, strokes), 1200);
});

const rows = [
  { id: 'a', item: 'Tea', price: 3, at: 1 },
  { id: 'b', item: 'cake', price: 12, note: null },
  { id: 'c', item: 'Coffee', price: 4.5, note: 'oat milk' },
];

test('table columns come from the prop, or from the rows', () => {
  assert.deepEqual(resolveColumns(rows, undefined).map((c) => c.key), ['item', 'price', 'at', 'note']);
  assert.deepEqual(resolveColumns(rows, ['price', { key: 'item', label: 'Thing', format: 'upper' }, 'price', 7]), [
    { key: 'price', label: 'price' }, { key: 'item', label: 'Thing', format: 'upper' },
  ]);
  assert.equal(resolveColumns(rows, []).length, 4);
});

test('tables search, sort and highlight', () => {
  const cols = resolveColumns(rows, undefined);
  const text = (r: Record<string, unknown>, c: { key: string }) => String(r[c.key] ?? '');
  assert.deepEqual(filterRows(rows, cols, 'C', text).map((r) => r.id), ['b', 'c']);
  assert.deepEqual(filterRows(rows, cols, 'OAT', text).map((r) => r.id), ['c']);
  assert.equal(filterRows(rows, cols, '  ', text).length, 3);
  assert.deepEqual(sortRows(rows, { key: 'price', dir: 'desc' }).map((r) => r.id), ['b', 'c', 'a']);
  assert.deepEqual(sortRows(rows, { key: 'item', dir: 'asc' }).map((r) => r.id), ['b', 'c', 'a']);
  assert.deepEqual(sortRows(rows, { key: 'note', dir: 'asc' }).map((r) => r.id), ['c', 'a', 'b']);
  assert.deepEqual(sortRows(rows, { key: 'note', dir: 'desc' }).map((r) => r.id), ['c', 'a', 'b']);
  assert.deepEqual(sortRows([{ n: 'item 10' }, { n: 'item 9' }], { key: 'n', dir: 'asc' }).map((r) => r.n), ['item 9', 'item 10']);
  assert.deepEqual(nextSort(null, 'a'), { key: 'a', dir: 'asc' });
  assert.deepEqual(nextSort({ key: 'a', dir: 'asc' }, 'a'), { key: 'a', dir: 'desc' });
  assert.equal(nextSort({ key: 'a', dir: 'desc' }, 'a'), null);
  assert.deepEqual(nextSort({ key: 'a', dir: 'desc' }, 'b'), { key: 'b', dir: 'asc' });
  assert.deepEqual(marks('Banana', 'an'), [{ text: 'B', hit: false }, { text: 'an', hit: true }, { text: 'an', hit: true }, { text: 'a', hit: false }]);
  assert.deepEqual(marks('Tea', ''), [{ text: 'Tea', hit: false }]);
  assert.equal(rowCount(3, 3), '3 rows');
  assert.equal(rowCount(1, 1), '1 row');
  assert.equal(rowCount(2, 12), '2 of 12 rows');
});

test('choosing columns writes the prop only when it differs from the default', () => {
  const choices = columnChoices(rows, undefined);
  assert.deepEqual(choices.map((c) => [c.key, c.shown]), [['item', true], ['price', true], ['at', true], ['note', true]]);
  assert.equal(columnsProp(rows, choices), null);
  const hidden = choices.map((c) => (c.key === 'at' ? { ...c, shown: false } : c));
  assert.deepEqual(columnsProp(rows, hidden), ['item', 'price', 'note']);
  const custom = columnChoices(rows, [{ key: 'price', label: 'Price', format: 'USD' }, 'item']);
  assert.deepEqual(custom.map((c) => [c.key, c.shown]), [['price', true], ['item', true], ['at', false], ['note', false]]);
  assert.deepEqual(columnsProp(rows, [custom[1], custom[0], ...custom.slice(2)]), ['item', { key: 'price', label: 'Price', format: 'USD' }]);
});

test('a stat compares with an earlier value and draws its trend', () => {
  assert.deepEqual(change(5000, 4000), { pct: 0.25, dir: 'up' });
  assert.equal(change(3000, 4000)!.dir, 'down');
  assert.equal(change(-50, -100)!.dir, 'up');
  assert.equal(change(5, 0), null);
  assert.equal(change(5, null), null);
  assert.equal(change('x', 3), null);
  assert.equal(changeText(change(5000, 4000)), '▲ 25.0%');
  assert.equal(changeText(change(3876, 4000)), '▼ 3.1%');
  assert.equal(changeText(change(9000, 4000)), '▲ 125%');
  assert.equal(changeText(change(4000, 4000)), '0%');
  assert.equal(changeText(null), '—');
  assert.deepEqual(numbers([1, '2', ['b', 3], { value: 4 }, 'x', null]), [1, 2, 3, 4]);
  assert.equal(spark([1], 100, 30), null);
  assert.deepEqual(spark([0, 10], 100, 30, 0), { line: '0,30 100,0', area: '0,30 0,30 100,0 100,30' });
  assert.equal(spark([5, 5, 5], 100, 30)!.line, '0,15 50,15 100,15');
});

test('list items keep their stored shape', () => {
  const check = asItems(['Milk', { text: 'Eggs', done: true, by: 'me' }, { title: 'Bread' }], 'check');
  assert.deepEqual(check, [{ text: 'Milk', done: false }, { text: 'Eggs', done: true, by: 'me' }, { title: 'Bread', text: 'Bread', done: false }]);
  assert.deepEqual(asItems(check, 'bullet'), ['Milk', 'Eggs', 'Bread']);
  assert.equal(itemText({ name: 'Ann', age: 3 }), 'Ann');
  assert.equal(itemText({ age: 3 }), '{"age":3}');
  assert.equal(itemText(4), '4');
  assert.deepEqual(toggled(check, 0)[0], { text: 'Milk', done: true });
  assert.deepEqual(withText(check, 1, 'Ten eggs', 'check')[1], { text: 'Ten eggs', done: true, by: 'me' });
  assert.deepEqual(withText(['a', 'b'], 0, 'z', 'number'), ['z', 'b']);
  assert.deepEqual(inserted(['a', 'b'], 1, 'x', 'bullet'), ['a', 'x', 'b']);
  assert.deepEqual(inserted([], 5, 'x', 'check'), [{ text: 'x', done: false }]);
  assert.deepEqual(removed(['a', 'b', 'c'], 1), ['a', 'c']);
  assert.deepEqual(moved(['a', 'b', 'c'], 0, 2), ['b', 'c', 'a']);
  assert.deepEqual(moved(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b']);
  assert.deepEqual(moved(['a', 'b', 'c'], 1, 9), ['a', 'c', 'b']);
  assert.deepEqual(progress(check), { done: 1, total: 3 });
});
