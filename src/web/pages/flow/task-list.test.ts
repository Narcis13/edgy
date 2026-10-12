import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type FlowItem, normalizeItem } from '../../../core/flow';
import { byDue, countTasks, dayValue, groupTasks, matchesTask } from './task-list';

const ana = { kind: 'human' as const, name: 'Ana' };
const today = '2026-10-12'; // a Monday
const task = (id: string, extra: Record<string, unknown> = {}): FlowItem => normalizeItem({ id, at: 1, kind: 'task', text: id, ...extra }, ana);
const ids = (items: FlowItem[]) => items.map((i) => i.id);

test('tasks fall into groups in the order they are shown, and empty groups are left out', () => {
  const items = [
    task('later', { due: '2026-11-30' }),
    task('none'),
    task('late', { due: '2026-10-01' }),
    task('now', { due: today }),
    task('tom', { due: '2026-10-13' }),
    task('wk', { due: '2026-10-16' }),
    task('fin', { done: true, doneAt: 5 }),
  ];
  const groups = groupTasks(items, today);
  assert.deepEqual(groups.map((g) => g.bucket), ['overdue', 'today', 'tomorrow', 'week', 'later', 'none', 'done']);
  assert.deepEqual(groups.map((g) => g.label), ['Overdue', 'Today', 'Tomorrow', 'This week', 'Later', 'No date', 'Done']);
  assert.deepEqual(groupTasks([task('a', { due: today })], today).map((g) => g.bucket), ['today']);
  assert.deepEqual(groupTasks([], today), []);
});

test('only tasks are listed', () => {
  const items = [task('t'), normalizeItem({ id: 'n', at: 1, kind: 'note', text: 'n' }, ana), normalizeItem({ id: 'e', at: 1, kind: 'event', text: 'e', start: today }, ana)];
  assert.deepEqual(groupTasks(items, today).flatMap((g) => ids(g.items)), ['t']);
});

test('within a group: soonest due, then priority, then the latest touched', () => {
  const items = [
    task('c', { due: '2026-10-15', priority: 0, updated: 10 }),
    task('b', { due: '2026-10-14', priority: 1, updated: 1 }),
    task('a', { due: '2026-10-14', priority: 2, updated: 1 }),
    task('d', { due: '2026-10-14', priority: 2, updated: 9 }),
  ];
  const week = groupTasks(items, today).find((g) => g.bucket === 'week')!;
  assert.deepEqual(ids(week.items), ['d', 'a', 'b', 'c']);
  assert.ok(byDue(task('x', { due: '2026-10-14' }), task('y')) < 0, 'a day before no day');
});

test('done tasks come most recently finished first', () => {
  const items = [task('old', { done: true, doneAt: 100 }), task('new', { done: true, doneAt: 900 }), task('mid', { done: true, doneAt: 500 })];
  assert.deepEqual(ids(groupTasks(items, today)[0].items), ['new', 'mid', 'old']);
});

test('a task with only a start counts on the start day', () => {
  const groups = groupTasks([task('t', { start: '2026-10-13T15:00' })], today);
  assert.equal(groups[0].bucket, 'tomorrow');
});

test('search: words in any order, any case, in text, body and tags', () => {
  const t = task('x', { text: 'Call Ben about the quote', body: 'Northwind pricing', tags: ['sales'] });
  assert.ok(matchesTask(t, ''));
  assert.ok(matchesTask(t, '  '));
  assert.ok(matchesTask(t, 'ben CALL'));
  assert.ok(matchesTask(t, 'northwind'));
  assert.ok(matchesTask(t, '#sales'));
  assert.ok(matchesTask(t, 'sales quote'));
  assert.ok(!matchesTask(t, 'ben invoice'));
  const groups = groupTasks([t, task('other', { text: 'Pay rent' })], today, 'rent');
  assert.deepEqual(groups.flatMap((g) => ids(g.items)), ['other']);
  assert.deepEqual(groupTasks([t], today, 'zzz'), []);
});

test('open and done are counted over tasks only', () => {
  const items = [task('a'), task('b'), task('c', { done: true }), normalizeItem({ id: 'n', at: 1, kind: 'note', text: 'n', done: true }, ana)];
  assert.deepEqual(countTasks(items), { open: 2, done: 1 });
});

test('a date input value: a day, cleared, or not usable yet', () => {
  assert.equal(dayValue('2026-10-20'), '2026-10-20');
  assert.equal(dayValue(''), null);
  assert.equal(dayValue('0002-10-20'), undefined);
  assert.equal(dayValue('nope'), undefined);
});
