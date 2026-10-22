import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { newDoc } from '../core/types';
import { Store, StoreError } from './store';

/** A store in a file (where a commit can wait for the disk), with one account. */
function stored(file = join(mkdtempSync(join(tmpdir(), 'edgy-')), 'edgy.db')) {
  const store = new Store(file);
  const user = store.createUser({ email: null, name: 'Ana', color: '#336699', password: null, local: true });
  return { store, user, file };
}

/** A number from the file, read on a connection of its own: what is committed. */
const count = (file: string, sql: string, ...args: string[]) => {
  const db = new DatabaseSync(file);
  try {
    return Number((db.prepare(sql).get(...args) as { n: number }).n);
  } finally {
    db.close();
  }
};

test('the file waits for the disk only as WAL needs, and for another process holding it a moment', () => {
  const { store } = stored();
  const db = (store as any).db as DatabaseSync;
  assert.equal((db.prepare('PRAGMA synchronous').get() as any).synchronous, 1, 'NORMAL');
  assert.equal((db.prepare('PRAGMA busy_timeout').get() as any).timeout, 5000);
});

test('clearing thousands of records is one quick transaction, and sync knows of every one of them', () => {
  const { store, user, file } = stored();
  const n = 3000;
  let t = performance.now();
  for (let i = 0; i < n; i++) store.insert(user.id, 'orders', { i });
  const inserting = performance.now() - t;
  t = performance.now();
  assert.equal(store.clear(user.id, 'orders'), n);
  const clearing = performance.now() - t;
  assert.ok(inserting < 5000, `${n} inserts took ${inserting.toFixed(0)} ms`);
  assert.ok(clearing < 2000, `clearing ${n} records took ${clearing.toFixed(0)} ms`);
  store.close();
  assert.equal(count(file, "SELECT COUNT(*) AS n FROM records WHERE collection = 'orders'"), 0);
  assert.equal(count(file, "SELECT COUNT(*) AS n FROM sync_gone WHERE kind = 'record'"), n, 'each one gone for good');
  assert.equal(count(file, "SELECT COUNT(*) AS n FROM sync_dirty WHERE kind = 'record' AND fields = '*'"), n, 'each one to send');
  assert.equal(count(file, "SELECT COUNT(DISTINCT n) AS n FROM sync_dirty WHERE kind = 'record'"), n, 'each with its own number');
  assert.equal(count(file, "SELECT CAST(value AS INTEGER) AS n FROM sync_meta WHERE key = 'n'"), count(file, 'SELECT MAX(n) AS n FROM sync_dirty'), 'the counter is where the last change left it');
});

test('a failure partway through clearing leaves every record, and nothing new to send', () => {
  const { store, user } = stored(':memory:');
  const ids = Array.from({ length: 10 }, (_, i) => store.insert(user.id, 'orders', { i }).id);
  const before = store.dirtyItems();
  let changes = 0;
  store.onChange = () => {
    if (++changes === 5) throw new Error('the disk is full');
  };
  assert.throws(() => store.clear(user.id, 'orders'), /disk is full/);
  store.onChange = undefined;
  assert.equal(store.rows(user.id, 'orders').length, 10, 'every record is still there');
  assert.ok(ids.every((id) => !store.isGone('record', id)), 'none marked gone');
  assert.deepEqual(store.dirtyItems(), before, 'sync bookkeeping as it was');
});

test('a deck asked for with tens of thousands of ids answers at once; repeats count once', () => {
  const { store, user } = stored(':memory:');
  const ids = Array.from({ length: 80_000 }, (_, i) => 'x' + i);
  const t = performance.now();
  assert.throws(() => store.createDeck('Big', '', ids, user.id), StoreError);
  const took = performance.now() - t;
  assert.ok(took < 1000, `took ${took.toFixed(0)} ms`);
  for (const id of ['a', 'b']) store.createDoc(newDoc(id, id.toUpperCase()), user.id);
  const deck = store.createDeck('D', '', ['a', 'b', 'a', 'b', 'a'], user.id);
  assert.deepEqual(deck.docs, ['a', 'b']);
  store.setPinned('a', true);
  store.setPinned('b', true);
  assert.deepEqual(store.orderPins(user.id, [...Array(50_000).fill('b'), 'nope', 'a']), ['b', 'a']);
});

test("a document's messages come back as the latest 500, oldest first", () => {
  const store = new Store(':memory:');
  const actor = { kind: 'human' as const, name: 'Ana' };
  for (let i = 0; i < 520; i++) store.addMessage('d1', actor, `m${i}`);
  const latest = store.messages('d1');
  assert.equal(latest.length, 500);
  assert.deepEqual([latest[0].text, latest[499].text], ['m20', 'm519']);
  assert.ok(latest.every((m, i) => i === 0 || m.id > latest[i - 1].id), 'in order');
  assert.deepEqual(store.messages('d1', latest[494].id).map((m) => m.text), ['m515', 'm516', 'm517', 'm518', 'm519']);
});

test('sessions past their end are deleted when the store opens; live ones and API keys stay', () => {
  const { store, user, file } = stored();
  store.createSession('old', user.id, Date.now() - 1000);
  store.createSession('live', user.id, Date.now() + 86_400_000);
  store.createKey(user.id, 'Claude', 'key-hash', 'edgy_abc');
  store.revokeKey(user.id, store.keys(user.id)[0].id);
  store.close();
  new Store(file).close();
  assert.equal(count(file, "SELECT COUNT(*) AS n FROM sessions WHERE hash = 'old'"), 0, 'the expired one went');
  assert.equal(count(file, "SELECT COUNT(*) AS n FROM sessions WHERE hash = 'live'"), 1);
  assert.equal(count(file, 'SELECT COUNT(*) AS n FROM api_keys'), 1, 'keys, even revoked, are not sessions');
});

test('new record ids are long (they are global: every account, every machine); shorter ones from before still work', () => {
  const { store, user } = stored(':memory:');
  const r = store.insert(user.id, 'orders', { item: 'tea' });
  assert.match(r.id, /^r[a-z0-9]{16}$/);
  // A record from before, as it comes down from the cloud.
  store.receiveRecord(user.id, 'orders', 'rabc1234', Date.now(), { item: 'old' }, null);
  assert.equal(store.update(user.id, 'orders', 'rabc1234', { item: 'still here' })!.item, 'still here');
  assert.ok(store.deleteRow(user.id, 'orders', 'rabc1234'));
});
