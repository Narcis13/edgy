import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type FlowItem, normalizeItem } from '../../../core/flow';
import { agendaDays, hourAt, hourSlot, isLate, itemsOn, longDate, monthDays, monthTitle, onDay, timeOn, weekCells, weekTitle } from './calendar-days';

const ana = { kind: 'human' as const, name: 'Ana' };
const make = (id: string, raw: Record<string, unknown>): FlowItem => normalizeItem({ id, at: 1, text: id, ...raw }, ana);
const event = (id: string, start: string | null, end: string | null = null) => make(id, { kind: 'event', start, end });
const task = (id: string, due: string | null, extra: Record<string, unknown> = {}) => make(id, { kind: 'task', due, ...extra });

const items = [
  event('standup', '2026-10-12T09:30', '2026-10-12T10:00'),
  event('offsite', '2026-10-13', '2026-10-15'),
  event('trip', '2026-10-14T18:00', '2026-10-16T09:00'),
  event('lunch', '2026-10-12T12:00'),
  task('report', '2026-10-12'),
  task('filed', '2026-10-12', { done: true }),
  task('call', '2026-10-14', { start: '2026-10-14T15:00', end: '2026-10-14T15:30' }),
  task('nodate', null),
  make('note', { kind: 'note', due: '2026-10-12' }),
];
const byId = (id: string) => items.find((i) => i.id === id)!;

test('an event is on each day from its start to its end; a task on its due day; a note nowhere', () => {
  const trip = byId('trip');
  assert.deepEqual(['2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17'].map((d) => onDay(trip, d)), [false, true, true, true, false]);
  assert.equal(onDay(byId('report'), '2026-10-12'), true);
  assert.equal(onDay(byId('report'), '2026-10-13'), false);
  assert.equal(items.filter((i) => onDay(i, '2026-10-12')).some((i) => i.id === 'note' || i.id === 'nodate'), false);
  assert.equal(onDay(event('x', '2026-10-12', '2026-10-10'), '2026-10-12'), true, 'an end before the start is one day');
});

test('a day lists whole-day events, then the timed ones in order, then tasks (open first)', () => {
  assert.deepEqual(itemsOn(items, '2026-10-12').map((i) => i.id), ['standup', 'lunch', 'report', 'filed']);
  assert.deepEqual(itemsOn(items, '2026-10-14').map((i) => i.id), ['offsite', 'call', 'trip']);
  // The later days of a timed event carry no time.
  assert.equal(timeOn(byId('trip'), '2026-10-14'), '18:00');
  assert.equal(timeOn(byId('trip'), '2026-10-15'), null);
  assert.deepEqual(itemsOn(items, '2026-10-15').map((i) => i.id), ['offsite', 'trip']);
});

test('late means an open task before today', () => {
  assert.equal(isLate(byId('report'), '2026-10-13'), true);
  assert.equal(isLate(byId('report'), '2026-10-12'), false);
  assert.equal(isLate(byId('filed'), '2026-10-13'), false);
  assert.equal(isLate(byId('standup'), '2026-10-13'), false);
});

test('the agenda lists the days that hold something, and today even when empty', () => {
  const days = monthDays(2026, 9);
  assert.equal(days.length, 31);
  const list = agendaDays(items, days, '2026-10-20');
  assert.deepEqual(list.map((d) => d.day), ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-20']);
  assert.deepEqual(list.at(-1)!.items, []);
  assert.deepEqual(agendaDays(items, days, '2026-10-12').map((d) => d.day).slice(0, 2), ['2026-10-12', '2026-10-13']);
  assert.deepEqual(agendaDays([], days, '2026-11-02').map((d) => d.day), []);
});

test('a week splits into the row above the hours and the blocks', () => {
  const days = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'];
  const week = weekCells(items, days);
  const ids = (d: number, k: 'allday' | 'timed') => week[d][k].map((i) => i.id);
  assert.deepEqual(ids(0, 'timed'), ['standup', 'lunch']);
  assert.deepEqual(ids(0, 'allday'), ['report', 'filed']);
  assert.deepEqual(ids(1, 'allday'), ['offsite']);
  assert.deepEqual(ids(2, 'timed').sort(), ['call', 'trip']);
  assert.deepEqual(ids(2, 'allday'), ['offsite']);
  // The long timed event shows on its later days in the row.
  assert.deepEqual(ids(3, 'allday'), ['offsite', 'trip']);
  assert.deepEqual(ids(4, 'allday'), ['trip']);
  // A timed task whose start is in another week stays in the row by its due day.
  const far = task('far', '2026-10-13', { start: '2026-10-30T10:00' });
  assert.deepEqual(weekCells([far], days)[1].allday.map((i) => i.id), ['far']);
  // …and one whose start is this week is only a block.
  const near = task('near', '2026-10-13', { start: '2026-10-15T10:00' });
  assert.deepEqual(weekCells([near], days)[1].allday, []);
  assert.deepEqual(weekCells([near], days)[3].timed.map((i) => i.id), ['near']);
});

test('titles', () => {
  assert.equal(monthTitle('2026-10-12'), 'October 2026');
  assert.equal(longDate('2026-10-12'), 'Monday 12 October');
  assert.equal(weekTitle(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']), '12 – 18 October 2026');
  assert.equal(weekTitle(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']), '28 Sep – 4 Oct 2026');
  assert.equal(weekTitle(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']), '28 Dec 2026 – 3 Jan 2027');
});

test('a click in a day column names its hour', () => {
  assert.equal(hourAt(0, 7, 1.4), 7);
  assert.equal(hourAt(84 * 2 + 5, 7, 1.4), 9);
  assert.equal(hourAt(99999, 7, 1.4), 23);
  assert.deepEqual(hourSlot('2026-10-12', 9), { start: '2026-10-12T09:00', end: '2026-10-12T10:00' });
  assert.deepEqual(hourSlot('2026-10-12', 23), { start: '2026-10-12T23:00', end: '2026-10-12T23:59' });
});
