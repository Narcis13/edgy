import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type FlowItem, normalizeItem } from '../../../core/flow';
import { addressOf, hourRange, layoutBlocks, viewOf } from './state';

const ana = { kind: 'human' as const, name: 'Ana' };
const item = (id: string, start: string | null, end: string | null = null): FlowItem => normalizeItem({ id, at: 1, kind: 'event', text: id, start, end }, ana);

test('the view comes from the address, and goes back into it', () => {
  assert.equal(viewOf(''), 'timeline');
  assert.equal(viewOf('?view=board'), 'board');
  assert.equal(viewOf('?view=nope'), 'timeline');
  assert.equal(addressOf('timeline'), '/flow');
  assert.equal(addressOf('calendar'), '/flow?view=calendar');
});

test('a day’s timed items become blocks; the ones that overlap share the width', () => {
  const day = '2026-10-12';
  const blocks = layoutBlocks([
    item('a', `${day}T09:00`, `${day}T10:00`),
    item('b', `${day}T09:30`, `${day}T11:00`),
    item('c', `${day}T10:15`, `${day}T10:45`),
    item('d', `${day}T14:00`),
    item('e', `${day}T15:00`, `${day}T15:05`),
    item('allday', day, day),
    item('other', '2026-10-13T09:00', '2026-10-13T10:00'),
    item('spans', `${day}T22:00`, '2026-10-13T02:00'),
  ], day);
  const by = Object.fromEntries(blocks.map((b) => [b.id, b]));
  assert.deepEqual(Object.keys(by).sort(), ['a', 'b', 'c', 'd', 'e', 'spans']);
  assert.deepEqual([by.a.top, by.a.height, by.a.col, by.a.cols], [540, 60, 0, 2]);
  assert.deepEqual([by.b.top, by.b.height, by.b.col, by.b.cols], [570, 90, 1, 2]);
  assert.deepEqual([by.c.col, by.c.cols], [0, 2], 'c starts after a ends, so it takes a’s lane');
  assert.deepEqual([by.d.top, by.d.height, by.d.cols], [840, 60, 1], 'no end means an hour');
  assert.equal(by.e.height, 20, 'short ones stay readable');
  assert.deepEqual([by.spans.top, by.spans.height], [1320, 120], 'runs to midnight');
  assert.deepEqual(hourRange(blocks), [7, 24]);
  assert.deepEqual(hourRange([]), [7, 20]);
  assert.deepEqual(hourRange([{ id: 'x', top: 6 * 60 + 30, height: 30, col: 0, cols: 1 }]), [6, 20]);
});
