import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Actor } from '../../core/types';
import { type Member, type Present, actorName, avatarStack, describePresent, isYou, othersPresent, sameActor } from './people';

const here = (id: string, name: string, clients: string[], over: Partial<Present> = {}): Present => ({
  id, name, color: '#336699', kind: 'human', selected: null, mode: 'edit', clients, ...over,
});
const members: Member[] = [
  { id: 'u-ana', name: 'Ana Maria', email: 'ana@example.test', color: '#aa3333', role: 'owner' },
  { id: 'u-ben', name: 'Ben', email: 'ben@example.test', color: '#3333aa', role: 'editor' },
];
const ben = { meId: 'u-ben', client: 'tab-1' };

test('the people next to the title leave out this person and their other tabs', () => {
  const people = [here('u-ben', 'Ben', ['tab-1']), here('u-ana', 'Ana', ['tab-9']), here('u-ben', 'Ben', ['tab-2'])];
  assert.deepEqual(othersPresent(people, ben).map((p) => p.name), ['Ana']);
  // The same person in another tab is still this person: excluded by account.
  assert.deepEqual(othersPresent([here('u-ben', 'Ben', ['tab-2'])], ben), []);
});

test('without an account, a tab finds itself by its client id; agents are not faces', () => {
  const people = [here('p1', 'Pat', ['mine']), here('p2', 'Quinn', ['theirs']), here('k1', 'Claude', ['k'], { kind: 'agent' })];
  assert.deepEqual(othersPresent(people, { meId: null, client: 'mine' }).map((p) => p.name), ['Quinn']);
});

test('a stack shows the first few and counts the rest', () => {
  assert.deepEqual(avatarStack([1, 2, 3, 4, 5, 6], 4), { shown: [1, 2, 3, 4], more: 2 });
  assert.deepEqual(avatarStack([1, 2], 4), { shown: [1, 2], more: 0 });
  assert.deepEqual(avatarStack([1, 2, 3], 2), { shown: [1, 2], more: 1 });
});

test('a face says what the person is doing and where', () => {
  assert.equal(describePresent({ name: 'Ana', mode: 'edit', selected: null }), 'Ana — editing');
  assert.equal(describePresent({ name: 'Ana', mode: 'live', selected: null }), 'Ana — reading');
  assert.equal(describePresent({ name: 'Ana', mode: 'page', selected: null }), 'Ana — reading');
  assert.equal(describePresent({ name: 'Ana', mode: 'edit', selected: 'c3' }, (id) => (id === 'c3' ? 'total' : undefined)), 'Ana — editing (total)');
  assert.equal(describePresent({ name: 'Ana', mode: 'edit', selected: 'c3' }), 'Ana — editing (c3)');
});

test('"you" is the account when there is one, the tab otherwise', () => {
  assert.equal(isYou({ kind: 'human', name: 'Ben', id: 'u-ben' }, ben), true);
  assert.equal(isYou({ kind: 'human', name: 'Ben', id: 'u-ana' }, ben), false);
  // An entry made from another tab of the same account is still mine.
  assert.equal(isYou({ kind: 'human', name: 'Ben', id: 'u-ben' }, { meId: 'u-ben', client: 'tab-7' }), true);
  assert.equal(isYou({ kind: 'human', name: 'You', id: 'tab-1' }, { meId: null, client: 'tab-1' }), true);
  assert.equal(isYou({ kind: 'human', name: 'You', id: 'tab-2' }, { meId: null, client: 'tab-1' }), false);
  // A guest is never the signed-in person, even if the ids were to collide.
  assert.equal(isYou({ kind: 'human', name: 'Guest', id: 'u-ben', guest: true }, ben), false);
});

test('entries by the same actor group; by id when both have one', () => {
  const a: Actor = { kind: 'human', name: 'Ana', id: 'u-ana' };
  assert.equal(sameActor(a, { ...a, name: 'Ana Maria' }), true, 'renamed, same account');
  assert.equal(sameActor(a, { kind: 'human', name: 'Ana', id: 'u-ben' }), false, 'same name, another account');
  assert.equal(sameActor({ kind: 'human', name: 'You' }, { kind: 'human', name: 'You' }), true);
  assert.equal(sameActor({ kind: 'human', name: 'Ana' }, { kind: 'agent', name: 'Ana' }), false);
  assert.equal(sameActor({ kind: 'human', name: 'Guest', guest: true }, { kind: 'human', name: 'Guest' }), false);
});

test('Activity names people as their account is named now', () => {
  // Ana made this entry when she was "Ana"; she is "Ana Maria" now.
  assert.deepEqual(actorName({ kind: 'human', name: 'Ana', id: 'u-ana' }, ben, members), { name: 'Ana Maria', you: false });
  assert.deepEqual(actorName({ kind: 'human', name: 'Benny', id: 'u-ben' }, ben, members), { name: 'You', you: true });
  // Someone no longer on the list keeps the name they made the entry under.
  assert.deepEqual(actorName({ kind: 'human', name: 'Cleo', id: 'u-cleo' }, ben, members), { name: 'Cleo', you: false });
  assert.deepEqual(actorName({ kind: 'human', name: 'You', id: 'tab-1' }, { meId: null, client: 'tab-1' }, []), { name: 'You', you: true });
});

test('an agent is named for the person it acts for, a link guest is Guest', () => {
  assert.equal(actorName({ kind: 'agent', name: 'Claude', id: 'u-ana', for: 'Ana' }, ben, members).name, 'Claude for Ana Maria');
  assert.equal(actorName({ kind: 'agent', name: 'Claude', id: 'u-zed', for: 'Zed' }, ben, members).name, 'Claude for Zed');
  assert.equal(actorName({ kind: 'agent', name: 'Claude' }, ben, members).name, 'Claude');
  assert.equal(actorName({ kind: 'agent', name: 'Events' }, ben, members).name, 'Events');
  assert.deepEqual(actorName({ kind: 'human', name: 'Visitor', guest: true }, ben, members), { name: 'Guest', you: false });
});
