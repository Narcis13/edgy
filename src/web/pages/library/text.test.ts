import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deckTitle, highlight, parsePrefs, plural, possessive, roleLabel, sharedBadge, theirDoc } from './text';

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
  const base = { view: 'grid', sort: 'updated', scope: 'mine' };
  assert.deepEqual(parsePrefs(null), base);
  assert.deepEqual(parsePrefs('{"view":"list","sort":"title"}'), { ...base, view: 'list', sort: 'title' });
  assert.deepEqual(parsePrefs('{"scope":"shared"}'), { ...base, scope: 'shared' });
  assert.deepEqual(parsePrefs('{"view":"tiles","sort":3,"scope":"all"}'), base);
  assert.deepEqual(parsePrefs('not json'), base);
});

test('an entry from Shared with me has a role and an owner; one of mine has neither', () => {
  assert.deepEqual(theirDoc({ role: 'editor', ownerName: 'Ana' }), { role: 'editor', ownerName: 'Ana' });
  assert.deepEqual(theirDoc({ role: 'viewer' }), { role: 'viewer', ownerName: 'Someone' });
  assert.equal(theirDoc({}), null);
  assert.equal(theirDoc({ role: 'owner' }), null);
  assert.equal(roleLabel('editor'), 'Can edit');
  assert.equal(roleLabel('viewer'), 'Can view');
});

test('whose a document is', () => {
  assert.equal(possessive('Ana'), 'Ana’s');
  assert.equal(possessive('Chris'), 'Chris’');
});

test('the shared badge counts people first, then says what a link allows', () => {
  assert.equal(sharedBadge(undefined), null);
  assert.equal(sharedBadge({ view: false, edit: false, people: 0 }), null);
  assert.equal(sharedBadge({ view: false, edit: false, people: 2 }), 'Shared with 2');
  assert.equal(sharedBadge({ view: true, edit: true, people: 1 }), 'Shared with 1');
  assert.equal(sharedBadge({ view: true, edit: true }), 'Shared · can edit');
  assert.equal(sharedBadge({ view: true, edit: false }), 'Shared · can view');
});
