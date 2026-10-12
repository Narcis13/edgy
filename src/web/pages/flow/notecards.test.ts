import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type FlowItem, normalizeItem } from '../../../core/flow';
import { editFields, matchesNote, newNoteText, notesOf, oneLine, tidyBody } from './notecards';

const ana = { kind: 'human' as const, name: 'Ana' };
const make = (id: string, extra: Record<string, unknown> = {}): FlowItem => normalizeItem({ id, at: 1, kind: 'note', text: id, updated: 1, ...extra }, ana);

test('only notes show, pinned first, then the most recently changed', () => {
  const items = [
    make('old', { updated: 10 }),
    make('new', { updated: 30 }),
    make('pinned-old', { pinned: true, updated: 5 }),
    make('pinned-new', { pinned: true, updated: 20 }),
    make('a task', { kind: 'task', updated: 99 }),
    make('an event', { kind: 'event', updated: 98 }),
  ];
  assert.deepEqual(notesOf(items).map((i) => i.id), ['pinned-new', 'pinned-old', 'new', 'old']);
});

test('the words may be in the title, the body or the tags, in any order and any case', () => {
  const n = make('n', { text: 'Rates for Northwind', body: 'Send the quote\non Friday', tags: ['sales', 'q4'] });
  assert.ok(matchesNote(n, ''));
  assert.ok(matchesNote(n, '   '));
  assert.ok(matchesNote(n, 'NORTHWIND rates'));
  assert.ok(matchesNote(n, 'friday quote'));
  assert.ok(matchesNote(n, 'sales'));
  assert.ok(matchesNote(n, '#q4 northwind'));
  assert.ok(!matchesNote(n, 'northwind invoice'));
});

test('a picked tag and the words narrow together', () => {
  const items = [
    make('a', { text: 'Call Ben', tags: ['sales'], updated: 3 }),
    make('b', { text: 'Call Eva', tags: ['hr'], updated: 2 }),
    make('c', { text: 'Plan', body: 'call later', tags: ['sales'], updated: 1 }),
  ];
  assert.deepEqual(notesOf(items, '', 'sales').map((i) => i.id), ['a', 'c']);
  assert.deepEqual(notesOf(items, 'call', 'sales').map((i) => i.id), ['a', 'c']);
  assert.deepEqual(notesOf(items, 'eva', 'sales').map((i) => i.id), []);
  assert.deepEqual(notesOf(items, 'call').map((i) => i.id), ['a', 'b', 'c']);
});

test('a new note posts its title, then its lines; nothing typed posts nothing', () => {
  assert.equal(newNoteText('', ''), null);
  assert.equal(newNoteText('  ', '\n \n'), null);
  assert.equal(newNoteText('Rates #sales', ''), 'Rates #sales');
  assert.equal(newNoteText('Rates #sales', 'Line one\nLine two  \n\n'), 'Rates #sales\nLine one\nLine two');
  assert.equal(newNoteText('Title', '\n\nAfter blank lines'), 'Title\nAfter blank lines');
  assert.equal(newNoteText('', 'Only a body'), 'Only a body');
  assert.equal(newNoteText('Two\nlines', 'x'), 'Two lines\nx');
});

test('the helpers keep what should be kept', () => {
  assert.equal(oneLine('a\r\n  b\nc'), 'a b c');
  assert.equal(tidyBody('\n  \nkeep\n  indented\n\n'), 'keep\n  indented');
  assert.equal(tidyBody('  leading spaces stay'), '  leading spaces stay');
});

test('an edit patches only what changed, and an emptied title keeps the old one', () => {
  const n = make('n', { text: 'Title', body: 'One\nTwo' });
  assert.equal(editFields(n, 'Title', 'One\nTwo'), null);
  assert.equal(editFields(n, ' Title ', 'One\nTwo\n\n'), null);
  assert.deepEqual(editFields(n, 'Title 2', 'One\nTwo'), { text: 'Title 2' });
  assert.deepEqual(editFields(n, 'Title', 'One'), { body: 'One' });
  assert.deepEqual(editFields(n, 'Title 2', ''), { text: 'Title 2', body: '' });
  assert.equal(editFields(n, '', 'One\nTwo'), null);
  assert.deepEqual(editFields(n, '', 'Other'), { body: 'Other' });
});
