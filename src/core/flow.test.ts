import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type FlowItem, type Who, DEFAULT_COLUMNS, between, bucketOf, cardsIn, columnOf, describeQuick, durationLabel, feedOf, minutesOn, moveTo,
  normalizeBoard, normalizeItem, normalizeReaction, parseQuick, postsOf, reactionCounts, recordOf, tagsOf, todayOf, weekOf, whenLabel,
} from './flow';

// Monday 12 October 2026, 09:00 local.
const now = new Date(2026, 9, 12, 9, 0);
const today = '2026-10-12';
const ana: Who = { kind: 'human', name: 'Ana', id: 'u1' };
const claude: Who = { kind: 'agent', name: 'Claude', id: 'u1', for: 'Ana' };

const item = (over: Partial<FlowItem> & { id: string }): FlowItem => normalizeItem({ at: 1, updated: 1, ...over } as Record<string, unknown>, ana);

test('quick-add: kinds, tags, priority, dates and times', () => {
  const cases: [string, Partial<ReturnType<typeof parseQuick>>][] = [
    ['Call Ben tomorrow 3pm-4pm #sales !!', { kind: 'event', text: 'Call Ben', start: '2026-10-13T15:00', end: '2026-10-13T16:00', tags: ['sales'], priority: 2, due: null }],
    ['Buy milk tomorrow', { kind: 'task', text: 'Buy milk', due: '2026-10-13', start: null }],
    ['Idea: use records for flow', { kind: 'note', text: 'Idea: use records for flow', due: null, start: null, tags: [] }],
    ['todo write the report', { kind: 'task', text: 'write the report', due: null }],
    ['task: Write the report', { kind: 'task', text: 'Write the report' }],
    ['/event Team offsite tomorrow', { kind: 'event', text: 'Team offsite', start: '2026-10-13', end: '2026-10-13', due: null }],
    ['note Birthday party friday', { kind: 'note', text: 'Birthday party', due: '2026-10-16' }],
    ['Dentist friday 10:30', { kind: 'event', text: 'Dentist', start: '2026-10-16T10:30', end: '2026-10-16T11:30' }],
    ['Standup at 9 on monday', { kind: 'event', text: 'Standup', start: '2026-10-19T09:00' }],
    ['Lunch with Ana at 1', { kind: 'event', text: 'Lunch with Ana', start: '2026-10-12T13:00', end: '2026-10-12T14:00' }],
    ['Review PR in 3 days !', { kind: 'task', text: 'Review PR', due: '2026-10-15', priority: 1 }],
    ['Launch oct 20', { kind: 'task', text: 'Launch', due: '2026-10-20' }],
    ['Launch on 20 Oct', { kind: 'task', text: 'Launch', due: '2026-10-20' }],
    ['Launch October 20th, 2027', { kind: 'task', text: 'Launch', due: '2027-10-20' }],
    ['Pay rent jan 5', { kind: 'task', text: 'Pay rent', due: '2027-01-05' }],
    ['Plan next week', { kind: 'task', text: 'Plan', due: '2026-10-19' }],
    ['Taxes in 2 weeks', { kind: 'task', text: 'Taxes', due: '2026-10-26' }],
    ['Ship v2 2026-12-01', { kind: 'task', text: 'Ship v2', due: '2026-12-01' }],
    ['Gym 7am for 45m', { kind: 'event', text: 'Gym', start: '2026-10-12T07:00', end: '2026-10-12T07:45' }],
    ['Deep work 14:00 for 2h', { kind: 'event', text: 'Deep work', start: '2026-10-12T14:00', end: '2026-10-12T16:00' }],
    ['Meeting 15:00-16:30', { kind: 'event', text: 'Meeting', start: '2026-10-12T15:00', end: '2026-10-12T16:30' }],
    ['Meeting from 3 to 4pm', { kind: 'event', text: 'Meeting', start: '2026-10-12T15:00', end: '2026-10-12T16:00' }],
    ['Call mom tonight', { kind: 'event', text: 'Call mom', start: '2026-10-12T20:00', end: '2026-10-12T21:00' }],
    ['Lunch at noon tomorrow', { kind: 'event', text: 'Lunch', start: '2026-10-13T12:00' }],
    ['Read the docs !', { kind: 'note', text: 'Read the docs', priority: 1 }],
    ['Buy 3 apples', { kind: 'note', text: 'Buy 3 apples', start: null }],
    ['Sunny day, monitor the satellite feed', { kind: 'note', text: 'Sunny day, monitor the satellite feed', due: null }],
    ['todo Call Ben 3pm', { kind: 'task', text: 'Call Ben', due: '2026-10-12', start: '2026-10-12T15:00', end: null }],
    ['Coffee #café #Sales #sales', { kind: 'note', text: 'Coffee', tags: ['café', 'sales'] }],
    ['monday', { kind: 'task', text: '', due: '2026-10-19' }],
  ];
  for (const [input, want] of cases) {
    const got = parseQuick(input, now);
    for (const [k, v] of Object.entries(want)) assert.deepEqual((got as unknown as Record<string, unknown>)[k], v, `${input}: ${k}`);
  }
});

test('quick-add: the first line is the text, the rest the body', () => {
  const q = parseQuick('Title tomorrow #x\nbody line 1\nline 2', now);
  assert.equal(q.text, 'Title');
  assert.equal(q.body, 'body line 1\nline 2');
  assert.deepEqual(q.tags, ['x']);
  assert.equal(describeQuick(parseQuick('Call Ben tomorrow 3pm-4pm #sales !!', now), today), 'Event · Tomorrow 15:00–16:00 · #sales · urgent');
  assert.equal(describeQuick(parseQuick('Buy milk', now), today), 'Note');
  assert.equal(describeQuick(parseQuick('Buy milk friday', now), today), 'Task · Due fri 16 oct');
  const r = recordOf(parseQuick('todo Buy milk', now), ana, 5, 'Inbox');
  assert.equal(r.status, 'Inbox');
  assert.equal(r.kind, 'task');
  assert.equal(r.updated, 5);
});

test('a record missing fields reads as a whole item', () => {
  const i = normalizeItem({ id: 'r1', at: 10, text: ' Hello ', tags: ['#A', 'b c', 'b-c'], priority: 5, done: 'true', due: 'nonsense', start: '2026-10-12T10:00' }, ana);
  assert.equal(i.kind, 'note');
  assert.equal(i.text, 'Hello');
  assert.deepEqual(i.tags, ['a', 'bc', 'b-c']);
  assert.equal(i.priority, 2);
  assert.equal(i.done, true);
  assert.equal(i.due, null);
  assert.equal(i.start, '2026-10-12T10:00');
  assert.equal(i.updated, 10);
  assert.equal(i.order, 10);
  assert.deepEqual(i.by, ana);
  assert.equal(normalizeItem({ id: 'r2', title: 'From a table' }, ana).text, 'From a table');
  assert.deepEqual(normalizeBoard(null).columns, DEFAULT_COLUMNS);
  assert.deepEqual(normalizeBoard({ columns: ['A', ' ', 'A', 'B'] }).columns, ['A', 'B']);
  assert.equal(normalizeReaction({ id: 'x', item: 'r1', kind: 'wow' }, ana), null);
  assert.equal(normalizeReaction({ id: 'x', item: 'r1', kind: 'love' }, ana)?.kind, 'love');
});

test('columns: done means the last column, moving into it completes', () => {
  const cols = ['Inbox', 'Doing', 'Done'];
  assert.equal(columnOf(item({ id: 'a', kind: 'task', status: 'Doing' }), cols), 'Doing');
  assert.equal(columnOf(item({ id: 'a', kind: 'task', status: 'Gone' }), cols), 'Inbox');
  assert.equal(columnOf(item({ id: 'a', kind: 'task', status: 'Inbox', done: true }), cols), 'Done');
  assert.equal(columnOf(item({ id: 'a', kind: 'task', status: 'Done', done: false }), cols), 'Inbox');
  assert.deepEqual(moveTo('Done', cols), { status: 'Done', done: true });
  assert.deepEqual(moveTo('Doing', cols), { status: 'Doing', done: false });
  assert.deepEqual(moveTo('Nope', cols), { status: 'Inbox', done: false });
  const items = [
    item({ id: 'a', kind: 'task', status: 'Inbox', order: 2 }),
    item({ id: 'b', kind: 'task', status: 'Inbox', order: 1 }),
    item({ id: 'c', kind: 'note', status: 'Inbox' }),
    item({ id: 'd', kind: 'task', done: true }),
  ];
  assert.deepEqual(cardsIn(items, 'Inbox', cols).map((i) => i.id), ['b', 'a']);
  assert.deepEqual(cardsIn(items, 'Done', cols).map((i) => i.id), ['d']);
  assert.equal(between(1, 3), 2);
  assert.equal(between(undefined, 3), -997);
  assert.equal(between(5, undefined), 1005);
});

test('buckets and labels follow the day', () => {
  const t = (over: Partial<FlowItem>) => item({ id: 'x', kind: 'task', ...over });
  assert.equal(bucketOf(t({ due: '2026-10-10' }), today), 'overdue');
  assert.equal(bucketOf(t({ due: '2026-10-12' }), today), 'today');
  assert.equal(bucketOf(t({ due: '2026-10-13' }), today), 'tomorrow');
  assert.equal(bucketOf(t({ due: '2026-10-18' }), today), 'week');
  assert.equal(bucketOf(t({ due: '2026-10-19' }), today), 'later');
  assert.equal(bucketOf(t({}), today), 'none');
  assert.equal(bucketOf(t({ due: '2026-10-10', done: true }), today), 'done');
  assert.equal(bucketOf(t({ start: '2026-10-12T15:00' }), today), 'today');
  assert.equal(whenLabel(t({ due: '2026-10-10' }), today), 'Overdue 2 days');
  assert.equal(whenLabel(t({ due: '2026-10-11' }), today), 'Overdue 1 day');
  assert.equal(whenLabel(t({ due: '2026-10-12' }), today), 'Due today');
  assert.equal(whenLabel(t({ due: '2026-10-16' }), today), 'Due fri 16 oct');
  assert.equal(whenLabel(t({ due: '2027-01-05' }), today), 'Due tue 5 jan 2027');
  assert.equal(whenLabel(t({ kind: 'event', start: '2026-10-13T15:00', end: '2026-10-13T16:00' }), today), 'Tomorrow 15:00–16:00');
  assert.equal(whenLabel(t({ kind: 'event', start: '2026-10-13', end: '2026-10-13' }), today), 'Tomorrow');
  assert.equal(whenLabel(t({ kind: 'event', start: '2026-10-13', end: '2026-10-15' }), today), 'Tomorrow – Thu 15 Oct');
  assert.equal(whenLabel(t({ kind: 'note' }), today), '');
  assert.deepEqual(weekOf('2026-10-14'), ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']);
  assert.deepEqual(weekOf('2026-10-18'), weekOf('2026-10-12'));
});

test('the feed groups posts by their last activity, newest first, and filters', () => {
  const d = (day: number, h = 12) => new Date(2026, 9, day, h).getTime();
  const items = [
    item({ id: 'a', kind: 'note', text: 'A note about #sales', tags: ['sales'], at: d(10), updated: d(10) }),
    item({ id: 'b', kind: 'task', text: 'Finish report', at: d(11), updated: d(12, 8), done: true }),
    item({ id: 'c', kind: 'event', text: 'Standup', at: d(12, 9), updated: d(12, 9) }),
  ];
  const comments = [{ id: 'k1', at: d(12), item: 'a', text: 'great sales idea', by: claude }];
  const reactions = [
    { id: 'r1', at: 1, item: 'a', kind: 'like' as const, by: ana },
    { id: 'r2', at: 2, item: 'a', kind: 'like' as const, by: claude },
    { id: 'r3', at: 3, item: 'a', kind: 'idea' as const, by: claude },
  ];
  const posts = postsOf({ items, comments, reactions });
  const feed = feedOf(posts, today);
  assert.deepEqual(feed.map((f) => [f.label, f.posts.map((p) => p.item.id)]), [['Today', ['c', 'b']], ['Saturday 10 October', ['a']]]);
  assert.deepEqual(feedOf(posts, today, 'done').flatMap((f) => f.posts.map((p) => p.item.id)), ['b']);
  assert.deepEqual(feedOf(posts, today, 'all', 'sales idea').flatMap((f) => f.posts.map((p) => p.item.id)), ['a']);
  assert.deepEqual(feedOf(posts, today, 'all', '', 'sales').flatMap((f) => f.posts.map((p) => p.item.id)), ['a']);
  assert.deepEqual(feedOf(posts, today, 'event').flatMap((f) => f.posts.map((p) => p.item.id)), ['c']);
  const counts = reactionCounts(posts[0].reactions, ana);
  assert.deepEqual(counts.map((c) => [c.kind, c.count, c.mine]), [['like', 2, true], ['idea', 1, false]]);
  assert.deepEqual(reactionCounts(posts[0].reactions, claude).map((c) => c.mine), [true, true]);
  assert.deepEqual(tagsOf(items), [{ tag: 'sales', count: 1 }]);
});

test('today: events, due, overdue, the running clock', () => {
  const items = [
    item({ id: 'e', kind: 'event', text: 'Standup', start: '2026-10-12T09:00', end: '2026-10-12T09:15' }),
    item({ id: 'e2', kind: 'event', text: 'Offsite', start: '2026-10-11', end: '2026-10-13' }),
    item({ id: 't', kind: 'task', text: 'Report', due: '2026-10-12' }),
    item({ id: 'o', kind: 'task', text: 'Old', due: '2026-10-01' }),
    item({ id: 'c', kind: 'task', text: 'Running', spent: 10, clock: now.getTime() - 25 * 60_000 }),
    item({ id: 'd', kind: 'task', text: 'Done', done: true, doneAt: now.getTime() }),
  ];
  const t = todayOf(items, today);
  assert.deepEqual(t.events.map((i) => i.id), ['e2', 'e']);
  assert.deepEqual(t.due.map((i) => i.id), ['t']);
  assert.deepEqual(t.overdue.map((i) => i.id), ['o']);
  assert.equal(t.running?.id, 'c');
  assert.equal(t.doneToday, 1);
  assert.equal(minutesOn(items[4], now.getTime()), 35);
  assert.equal(durationLabel(35), '35 min');
  assert.equal(durationLabel(65), '1 h 05');
  assert.equal(durationLabel(180), '3 h');
});
