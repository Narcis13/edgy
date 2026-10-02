import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deckTitle, highlight, parsePrefs, plural } from './text';

const marked = (text: string, q: string) => highlight(text, q).filter((p) => p.mark).map((p) => p.text);

test('search words are marked whatever their case or accents', () => {
  assert.deepEqual(marked('Café in São Paulo', 'cafe sao'), ['Café', 'São']);
  assert.deepEqual(marked('Budget BUDGET budget', 'budget'), ['Budget', 'BUDGET', 'budget']);
  assert.equal(highlight('Budget', 'budget').map((p) => p.text).join(''), 'Budget');
});

test('overlapping words make one mark, and the rest of the text stays as it was', () => {
  assert.deepEqual(marked('Planning the plan', 'plan planning'), ['Planning', 'plan']);
  const parts = highlight('…kept while planning. The word', 'planning');
  assert.equal(parts.map((p) => p.text).join(''), '…kept while planning. The word');
  assert.deepEqual(parts.map((p) => p.mark), [false, true, false]);
});

test('no query or no hit leaves the text whole', () => {
  assert.deepEqual(highlight('Roadmap', ''), [{ text: 'Roadmap', mark: false }]);
  assert.deepEqual(highlight('Roadmap', 'oslo'), [{ text: 'Roadmap', mark: false }]);
  assert.deepEqual(highlight('', 'oslo'), [{ text: '', mark: false }]);
});

test('a new deck is named after its first document', () => {
  assert.equal(deckTitle(['Budget', 'Trip', 'Retro']), 'Budget and 2 more');
  assert.equal(deckTitle(['Budget']), 'Budget');
  assert.equal(deckTitle([]), 'New deck');
  assert.equal(plural(1, 'document'), '1 document');
  assert.equal(plural(3, 'document'), '3 documents');
});

test('remembered choices fall back to the defaults when broken', () => {
  assert.deepEqual(parsePrefs(null), { view: 'grid', sort: 'updated' });
  assert.deepEqual(parsePrefs('{"view":"list","sort":"title"}'), { view: 'list', sort: 'title' });
  assert.deepEqual(parsePrefs('{"view":"tiles","sort":3}'), { view: 'grid', sort: 'updated' });
  assert.deepEqual(parsePrefs('not json'), { view: 'grid', sort: 'updated' });
});
