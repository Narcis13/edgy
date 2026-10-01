import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  actionName, addField, addRow, aggregate, alignOf, badgeColors, clampWidth, coerce, deleteRow, findRows, groupRows, indexRows, isYes,
  linkHref, linkText, livePicks, moveEdit, orderRows, pickMany, pickState, progressFraction, rawText, resolveColumns, rowActions,
  setCell, starCount, togglePick,
} from './rows';
import { show } from '../../core/sx';

const data = [
  { id: 'a', client: 'Acme', status: 'Due', total: 120 },
  { id: 'b', client: 'Bolt', status: 'Paid', total: 80 },
  'not a record',
  { client: 'Cord', status: '', total: '' },
  { id: 'd', client: 'Dune', status: 'Due', total: 40 },
];

test('rows keep their original position and key through search and sort', () => {
  const rows = indexRows(data);
  assert.deepEqual(rows.map((r) => [r.i, r.key]), [[0, 'a'], [1, 'b'], [3, 3], [4, 'd']]);
  const cols = resolveColumns(rows.map((r) => r.rec), null);
  const text = (r: Record<string, unknown>, c: { key: string }) => show(r[c.key]);
  assert.deepEqual(findRows(rows, cols, 'C', text).map((r) => r.i), [0, 3]); // Acme, Cord
  const sorted = orderRows(rows, { key: 'total', dir: 'asc' });
  assert.deepEqual(sorted.map((r) => [r.i, r.key]), [[4, 'd'], [1, 'b'], [0, 'a'], [3, 3]]); // the empty total stays last
  assert.deepEqual(orderRows(rows, { key: 'total', dir: 'desc' }).map((r) => r.i), [0, 1, 4, 3]);
  assert.deepEqual(indexRows(null), []);
});

test('groups follow first appearance, empty values gather under (none)', () => {
  const rows = indexRows(data);
  const groups = groupRows(rows, 'status');
  assert.deepEqual(groups.map((g) => [g.value, g.label, g.rows.map((r) => r.i)]), [
    ['Due', 'Due', [0, 4]], ['Paid', 'Paid', [1]], ['', '(none)', [3]],
  ]);
  // Sorted by the group field, the groups come in that order.
  const desc = groupRows(orderRows(rows, { key: 'status', dir: 'desc' }), 'status');
  assert.deepEqual(desc.map((g) => g.label), ['Paid', 'Due', '(none)']);
  assert.deepEqual(groupRows(indexRows([{ n: 1 }, { n: 2 }, { n: 1 }]), 'n').map((g) => [g.value, g.rows.length]), [['1', 2], ['2', 1]]);
});

test('totals skip blanks and text; count counts filled values', () => {
  const recs = [{ v: 10 }, { v: '' }, { v: 'n/a' }, { v: 5 }, { v: null }, { v: '2.5' }, {}];
  assert.equal(aggregate(recs, 'v', 'sum'), 17.5);
  assert.ok(Math.abs(aggregate(recs, 'v', 'avg')! - 17.5 / 3) < 1e-9);
  assert.equal(aggregate(recs, 'v', 'min'), 2.5);
  assert.equal(aggregate(recs, 'v', 'max'), 10);
  assert.equal(aggregate(recs, 'v', 'count'), 4);
  assert.equal(aggregate([{ v: true }, { v: false }, { v: true }], 'v', 'count'), 2);
  assert.equal(aggregate([{ v: 0.1 }, { v: 0.2 }], 'v', 'sum'), 0.3);
  assert.equal(aggregate([], 'v', 'sum'), 0);
  assert.equal(aggregate([{ v: 'x' }], 'v', 'avg'), null);
  assert.equal(aggregate([{ v: 1 }], 'v', 'median'), null);
});

test('typed rows change by original position', () => {
  const rows = [{ item: 'Tea', price: 3 }, { item: 'Cake', price: 4 }];
  assert.deepEqual(setCell(rows, 1, 'price', 5), [{ item: 'Tea', price: 3 }, { item: 'Cake', price: 5 }]);
  assert.deepEqual(setCell(rows, 0, 'note', 'hot')[0], { item: 'Tea', price: 3, note: 'hot' });
  assert.deepEqual(rows[1], { item: 'Cake', price: 4 }); // untouched
  assert.deepEqual(addRow(rows, ['item', 'price']).at(-1), { item: '', price: '' });
  assert.deepEqual(deleteRow(rows, 0), [{ item: 'Cake', price: 4 }]);
  assert.deepEqual(addField(rows, 'qty'), [{ item: 'Tea', price: 3, qty: '' }, { item: 'Cake', price: 4, qty: '' }]);
  assert.deepEqual(addField([], 'item'), [{ item: '' }]);
});

test('typed text becomes numbers and booleans where the column holds them', () => {
  assert.equal(coerce('12.5', [3, 4]), 12.5);
  assert.equal(coerce(' 7 ', [3, '']), 7);
  assert.equal(coerce('7', []), 7);
  assert.equal(coerce('7', ['a', 3]), '7');
  assert.equal(coerce('seven', [3]), 'seven');
  assert.equal(coerce('', [3]), '');
  assert.equal(coerce('TRUE', [], 'check'), true);
  assert.equal(coerce('false', [true, false]), false);
  assert.equal(coerce('true', ['x']), 'true');
  assert.equal(rawText(1200), '1200');
  assert.equal(rawText(true), 'true');
  assert.equal(rawText(null), '');
});

test('editing moves down with Enter and across with Tab, wrapping rows', () => {
  const order = [4, 0, 2]; // original positions as shown, after a sort
  const keys = ['item', 'price'];
  assert.deepEqual(moveEdit(order, keys, { i: 4, key: 'price' }, 'down'), { i: 0, key: 'price' });
  assert.equal(moveEdit(order, keys, { i: 2, key: 'price' }, 'down'), null);
  assert.deepEqual(moveEdit(order, keys, { i: 4, key: 'item' }, 'next'), { i: 4, key: 'price' });
  assert.deepEqual(moveEdit(order, keys, { i: 4, key: 'price' }, 'next'), { i: 0, key: 'item' });
  assert.deepEqual(moveEdit(order, keys, { i: 0, key: 'item' }, 'prev'), { i: 4, key: 'price' });
  assert.equal(moveEdit(order, keys, { i: 4, key: 'item' }, 'prev'), null);
  assert.equal(moveEdit(order, keys, { i: 2, key: 'price' }, 'next'), null);
});

test('progress, checks, links and stars read their values', () => {
  assert.equal(progressFraction(0.4), 0.4);
  assert.equal(progressFraction(40), 0.4);
  assert.equal(progressFraction(150), 1);
  assert.equal(progressFraction(-1), 0);
  assert.equal(progressFraction('0.5'), 0.5);
  assert.equal(progressFraction('soon'), null);
  assert.ok(isYes(true) && isYes(1) && isYes('yes'));
  assert.ok(!isYes(false) && !isYes(0) && !isYes('') && !isYes('false') && !isYes(null));
  assert.equal(linkHref('https://example.com/a'), 'https://example.com/a');
  assert.equal(linkHref('example.com'), 'https://example.com');
  assert.equal(linkHref('ann@example.com'), 'mailto:ann@example.com');
  assert.equal(linkHref('javascript:alert(1)'), null);
  assert.equal(linkText('https://example.com/'), 'example.com');
  assert.equal(starCount(3.6), 4);
  assert.equal(starCount(9), 5);
  assert.equal(starCount('x'), null);
});

test('badges take a token\'s soft shade, and unmapped values stay neutral', () => {
  const colors = { Paid: 'live', Late: 'bad', Odd: 'ink', Soft: 'warn-soft' };
  assert.deepEqual(badgeColors(colors, 'Paid'), { bg: 'var(--live-soft)', fg: 'var(--live)' });
  assert.deepEqual(badgeColors(colors, 'late'), { bg: 'var(--bad-soft)', fg: 'var(--bad)' });
  assert.deepEqual(badgeColors(colors, 'Soft'), { bg: 'var(--warn-soft)', fg: 'var(--warn)' });
  assert.deepEqual(badgeColors(colors, 'Odd'), { bg: 'var(--sunken)', fg: 'var(--muted)' });
  assert.deepEqual(badgeColors(colors, 'Due'), { bg: 'var(--sunken)', fg: 'var(--muted)' });
  assert.deepEqual(badgeColors(undefined, 'Paid'), { bg: 'var(--sunken)', fg: 'var(--muted)' });
});

test('widths stay within sense, and columns align by what they hold', () => {
  assert.equal(clampWidth(10), 48);
  assert.equal(clampWidth(120.6), 121);
  assert.equal(clampWidth(99999), 2000);
  assert.equal(alignOf({ key: 'n', label: 'n' }, true), 'end');
  assert.equal(alignOf({ key: 'n', label: 'n', show: 'progress' }, true), 'start');
  assert.equal(alignOf({ key: 'n', label: 'n', show: 'check' }, false), 'center');
  assert.equal(alignOf({ key: 'n', label: 'n', align: 'center' }, true), 'center');
  assert.equal(alignOf({ key: 's', label: 's' }, false), 'start');
});

test('picking one replaces, many adds and removes, and missing keys are ignored', () => {
  assert.deepEqual(togglePick(['a'], 'b', 'one'), ['b']);
  assert.deepEqual(togglePick(['b'], 'b', 'one'), []);
  assert.deepEqual(togglePick(['a'], 'b', 'many'), ['a', 'b']);
  assert.deepEqual(togglePick(['a', 'b'], 'a', 'many'), ['b']);
  assert.deepEqual(pickMany(['a'], ['a', 'b', 3], true), ['a', 'b', 3]);
  assert.deepEqual(pickMany(['a', 'b', 3], ['a', 3], false), ['b']);
  const rows = indexRows(data);
  const live = livePicks(['a', 'gone', 3], rows);
  assert.deepEqual([...live], ['a', 3]);
  assert.equal(pickState(live, ['a', 3]), 'all');
  assert.equal(pickState(live, ['a', 'b']), 'some');
  assert.equal(pickState(live, ['b']), 'none');
});

test('row actions need something to do and default to ghost buttons', () => {
  const acts = rowActions([
    { label: 'Paid', do: ['update!', 'x'], icon: 'check', variant: 'soft' },
    { label: '', icon: 'trash-2', confirm: 'Delete it?', do: ['delete!', 'x'], variant: 'loud' },
    { label: 'Nothing' },
    'junk',
  ]);
  assert.equal(acts.length, 2);
  assert.deepEqual(acts[0], { label: 'Paid', do: ['update!', 'x'], icon: 'check', variant: 'soft' });
  assert.equal(acts[1].variant, 'ghost');
  assert.equal(acts[1].confirm, 'Delete it?');
  assert.deepEqual(rowActions(null), []);
  assert.equal(actionName(acts[0]), 'Paid');
  assert.equal(actionName(acts[1]), 'Delete');
  assert.equal(actionName({ label: '', icon: 'piggy-bank' }), 'Piggy bank');
});

test('a small table keeps its grid in a narrow cell; a wide one turns into cards sooner', async () => {
  const { cardsAt } = await import('./rows');
  assert.equal(cardsAt(2, false, 0), 220);
  assert.equal(cardsAt(5, true, 3), 560);
  assert.ok(cardsAt(3, true, 1) < 560);
});
