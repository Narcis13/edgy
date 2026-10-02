import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Doc, type Json, newDoc } from './types';
import { applyOps } from './ops';
import { type Entry, arrange, docText, match, movePinned, normalize, plainText, queryWords, shapeOf } from './library';

const docWith = (root: Json, meta: Record<string, Json> = {}): Doc =>
  applyOps(newDoc('t'), [...Object.entries(meta).map(([k, v]) => ['meta', k, v] as [string, ...Json[]]), ['put', 'c1', root]]).doc;

test('a document\'s text is what a reader sees, not its code', () => {
  const doc = docWith(['col',
    ['text', '# Harbour **report**\nSee [the map](https://example.com/map) for {{total}} boats.'],
    ['input', { name: 'qty', type: 'number', label: 'Boats in port', placeholder: 'How many?', value: 3 }],
    ['formula', { name: 'total', label: 'Total' }, ['*', '$qty', 2]],
    ['list', { type: 'check', label: 'Checks' }, 'milk', { text: 'Anchors', done: true }],
    ['table', { columns: [{ key: 'who', label: 'Skipper' }] }, ['list', { who: 'Grace Hopper' }]],
    ['button', { do: ['set!', 'qty', 0] }, 'Reset the count'],
    ['tabs', ['panel', { title: 'Overview' }, ['text', 'Inside a tab']]],
  ]);
  const text = docText(doc);
  for (const w of ['Harbour report', 'the map for', 'Boats in port', 'How many?', 'Checks', 'milk', 'Anchors', 'Skipper', 'Grace Hopper', 'Reset the count', 'Overview', 'Inside a tab']) {
    assert.ok(text.includes(w), `"${w}" in ${text}`);
  }
  for (const w of ['https://', '{{', '**', 'qty', 'set!', 'number', 'check']) assert.ok(!text.includes(w), `no "${w}" in ${text}`);
  assert.equal(plainText('## A *b* `c`'), 'A b c');
});

test('search matches every word, in the title, the description or the text, ignoring case and accents', () => {
  const doc = { title: 'Trip to Kyoto', description: 'Budget for the café crawl', text: 'Ryokan · Tea ceremony · Shinkansen passes' };
  assert.equal(match(queryWords('kyoto'), doc)?.field, 'title');
  assert.equal(match(queryWords('CAFE'), doc)?.field, 'description', 'accents and case are ignored');
  assert.equal(match(queryWords('shinkan'), doc)?.field, 'text', 'part of a word matches');
  assert.equal(match(queryWords('kyoto tea'), doc)?.field, 'title', 'words may be in different fields');
  assert.equal(match(queryWords('kyoto sushi'), doc), null, 'every word must appear');
  assert.equal(match(queryWords('   '), doc), null, 'no words, no match');
  const m = match(queryWords('ceremony'), doc)!;
  assert.ok(m.snippet.includes('Tea ceremony'), m.snippet);
  // The snippet keeps the original spelling around a match found without accents.
  const long = { title: 'Notes', description: '', text: 'x '.repeat(80) + 'Crème brûlée for twelve people ' + 'y '.repeat(80) };
  const s = match(queryWords('brulee'), long)!.snippet;
  assert.ok(s.includes('Crème brûlée') && s.startsWith('…') && s.endsWith('…'), s);
  assert.equal(normalize('Ünïcödé'), 'unicode');
});

const entry = (id: string, o: Partial<Entry> = {}): Entry => ({
  type: 'doc', id, title: id, description: '', createdAt: 0, updatedAt: 0, pinned: null, archivedAt: null, deck: null, shared: { view: false, edit: false }, ...o,
});

test('pinned entries come first in their own order, whatever the sort', () => {
  const entries = [
    entry('b', { title: 'Beta', createdAt: 2, updatedAt: 30, pinned: 2 }),
    entry('a', { title: 'Alpha', createdAt: 1, updatedAt: 10 }),
    entry('c', { title: 'Gamma', createdAt: 3, updatedAt: 20, pinned: 1 }),
    entry('d', { title: 'Delta', createdAt: 4, updatedAt: 40 }),
  ];
  for (const sort of ['updated', 'created', 'title'] as const) {
    assert.deepEqual(arrange(entries, { sort }).pinned.map((e) => e.id), ['c', 'b'], sort);
  }
  assert.deepEqual(arrange(entries, { sort: 'updated' }).rest.map((e) => e.id), ['d', 'a']);
  assert.deepEqual(arrange(entries, { sort: 'created' }).rest.map((e) => e.id), ['d', 'a']);
  assert.deepEqual(arrange(entries, { sort: 'title' }).rest.map((e) => e.id), ['a', 'd']);
  assert.deepEqual(arrange(entries, { filter: 'pinned' }).rest, []);
  assert.deepEqual(movePinned(['c', 'b', 'x'], 'x', 0), ['x', 'c', 'b']);
  assert.deepEqual(movePinned(['c', 'b'], 'zz', 0), ['c', 'b']);
});

test('archived entries leave every list but Archived; documents in a deck sit in its card unless searching', () => {
  const entries = [
    entry('a'),
    entry('gone', { archivedAt: 5, pinned: null }),
    entry('in', { deck: 'deck-1' }),
    entry('pinnedIn', { deck: 'deck-1', pinned: 1 }),
    entry('deck-1', { type: 'deck' }),
    entry('s', { shared: { view: true, edit: false } }),
    entry('sharedIn', { deck: 'deck-1', shared: { view: false, edit: true } }),
  ];
  const ids = (o: Parameters<typeof arrange>[1]) => { const r = arrange(entries, o); return [...r.pinned, ...r.rest].map((e) => e.id).sort(); };
  assert.deepEqual(ids({}), ['a', 'deck-1', 'pinnedIn', 's'], 'a pinned document in a deck stays pinned');
  assert.deepEqual(ids({ filter: 'archived' }), ['gone']);
  assert.deepEqual(ids({ filter: 'decks' }), ['deck-1']);
  assert.deepEqual(ids({ filter: 'shared' }), ['s', 'sharedIn'], 'a shared document in a deck is still shared');
  assert.deepEqual(ids({ searching: true }), ['a', 'deck-1', 'in', 'pinnedIn', 's', 'sharedIn']);
});

test('search results put title matches before description and text matches', () => {
  const entries = [
    entry('t', { updatedAt: 1, match: { field: 'text', snippet: '' } }),
    entry('d', { updatedAt: 2, match: { field: 'description', snippet: '' } }),
    entry('h', { updatedAt: 0, match: { field: 'title', snippet: '' } }),
  ];
  assert.deepEqual(arrange(entries, { searching: true }).rest.map((e) => e.id), ['h', 'd', 't']);
});

test('a card\'s shape is small and holds no content', () => {
  const rows = Array.from({ length: 60 }, (_, i) => ['row', ['text', `secret ${i}`], ['input', { value: 'hidden words' }]] as Json);
  const doc = docWith(['col', ['tabs', ['panel', { title: 'One' }, ['text', 'a']], ['panel', { title: 'Two' }, ['text', 'b']]], ...rows]);
  const shape = JSON.stringify(shapeOf(doc.root));
  assert.ok(shape.length < 900, `${shape.length} bytes`);
  assert.ok(!/secret|hidden|One|Two/.test(shape), shape);
  assert.deepEqual(shapeOf(doc.root).c![0].o, [0], 'the open tab is known');
});
