import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addedAfter, columnAt, dropIndex, edgeScroll, endOrder, freshName, movedColumn, neighbour, orderAt, removedColumn, renamed, samePlace } from './board-rules';

const rects = [
  { name: 'Inbox', left: 0, right: 100 },
  { name: 'Doing', left: 112, right: 212 },
  { name: 'Done', left: 224, right: 324 },
];

test('the column under the pointer, or the nearest one in the gaps and past the ends', () => {
  assert.equal(columnAt(rects, 50), 'Inbox');
  assert.equal(columnAt(rects, 150), 'Doing');
  assert.equal(columnAt(rects, 104), 'Inbox');
  assert.equal(columnAt(rects, 109), 'Doing');
  assert.equal(columnAt(rects, -40), 'Inbox');
  assert.equal(columnAt(rects, 900), 'Done');
  assert.equal(columnAt([], 10), null);
});

test('the drop index counts the cards whose middle is above the pointer', () => {
  const cards = [{ top: 0, bottom: 40 }, { top: 48, bottom: 88 }, { top: 96, bottom: 136 }];
  assert.equal(dropIndex(cards, -5), 0);
  assert.equal(dropIndex(cards, 19), 0);
  assert.equal(dropIndex(cards, 21), 1);
  assert.equal(dropIndex(cards, 80), 2);
  assert.equal(dropIndex(cards, 500), 3);
  assert.equal(dropIndex([], 10), 0);
});

test('a dropped card gets an order between its new neighbours, not counting itself', () => {
  const cards = [{ id: 'a', order: 10 }, { id: 'b', order: 20 }, { id: 'c', order: 40 }];
  assert.equal(orderAt(cards, 'x', 0), 10 - 1000);
  assert.equal(orderAt(cards, 'x', 1), 15);
  assert.equal(orderAt(cards, 'x', 3), 40 + 1000);
  // Moving b down inside its own column: the others are a and c, so index 2 is the end, index 1 is between them.
  assert.equal(orderAt(cards, 'b', 1), 25);
  assert.equal(orderAt(cards, 'b', 2), 1040);
  assert.equal(orderAt(cards, 'b', 0), -990);
  // An index past the end is the end.
  assert.equal(orderAt(cards, 'x', 99), 1040);
  // An empty column: any order will do, so it is a time.
  const empty = orderAt([], 'x', 0);
  assert.ok(Math.abs(empty - Date.now()) < 5000);
});

test('dropped where it was is no move', () => {
  const cards = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.equal(samePlace(cards, 'b', 1), true);
  assert.equal(samePlace(cards, 'b', 0), false);
  assert.equal(samePlace(cards, 'b', 2), false);
  assert.equal(samePlace(cards, 'z', 0), false);
});

test('the keyboard move: one column over, after the last card there', () => {
  const columns = ['Inbox', 'Doing', 'Done'];
  assert.equal(neighbour(columns, 'Doing', -1), 'Inbox');
  assert.equal(neighbour(columns, 'Doing', 1), 'Done');
  assert.equal(neighbour(columns, 'Inbox', -1), null);
  assert.equal(neighbour(columns, 'Done', 1), null);
  assert.equal(neighbour(columns, 'Nope', 1), null);
  assert.equal(endOrder([{ id: 'a', order: 5 }, { id: 'b', order: 9 }], 'x'), 1009);
  assert.equal(endOrder([{ id: 'a', order: 5 }, { id: 'b', order: 9 }], 'b'), 1005);
});

test('holding a card near an edge scrolls towards it, faster the closer', () => {
  assert.equal(edgeScroll(500, 0, 1000, 50, 20), 0);
  assert.equal(edgeScroll(0, 0, 1000, 50, 20), -20);
  assert.equal(edgeScroll(25, 0, 1000, 50, 20), -10);
  assert.equal(edgeScroll(1000, 0, 1000, 50, 20), 20);
  assert.equal(edgeScroll(1200, 0, 1000, 50, 20), 20);
  assert.equal(edgeScroll(10, 0, 60, 50, 20), 0);
});

test('a column is renamed to a name that is not empty and not another column’s', () => {
  const columns = ['Inbox', 'Doing', 'Done'];
  assert.deepEqual(renamed(columns, 1, '  Working  '), { columns: ['Inbox', 'Working', 'Done'] });
  assert.deepEqual(renamed(columns, 1, 'Doing'), { columns });
  assert.ok('error' in renamed(columns, 1, '   '));
  assert.ok('error' in renamed(columns, 1, 'done'));
  assert.ok('error' in renamed(columns, 0, 'Doing'));
});

test('columns are added after one, moved and removed, within two to eight', () => {
  const columns = ['Inbox', 'Doing', 'Done'];
  assert.deepEqual(addedAfter(columns, 0), { columns: ['Inbox', 'New column', 'Doing', 'Done'], name: 'New column' });
  assert.deepEqual(addedAfter(['A', 'New column', 'B'], 0)?.name, 'New column 2');
  assert.equal(freshName(['New column', 'New column 2']), 'New column 3');
  assert.equal(addedAfter(['1', '2', '3', '4', '5', '6', '7', '8'], 3), null);
  assert.deepEqual(movedColumn(columns, 1, -1), ['Doing', 'Inbox', 'Done']);
  assert.deepEqual(movedColumn(columns, 1, 1), ['Inbox', 'Done', 'Doing']);
  assert.deepEqual(movedColumn(columns, 0, -1), columns);
  assert.deepEqual(movedColumn(columns, 2, 1), columns);
  assert.deepEqual(removedColumn(columns, 1), ['Inbox', 'Done']);
  assert.deepEqual(removedColumn(['Inbox', 'Done'], 0), ['Inbox', 'Done']);
});
