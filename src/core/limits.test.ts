// Formulas run on the server for anyone who can view a document, so a hostile
// one must fail fast with an error, never freeze or crash the process. Each
// case here is sized to stay finite without the limits (long, but finite), so
// the tests fail, rather than hang, if the limits go.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Json, newDoc } from './types';
import { Interp, deepEqual, read } from './sx';
import { evalIn, evaluate, runAction } from './engine';
import { applyOp } from './ops';
import { resolve } from './tree';

const world = { rows: () => [] as unknown[], now: Date.UTC(2026, 8, 30) };
const host = { ref: () => { throw new Error('no cells'); }, sib: () => null, idx: () => 0, child: () => '', rows: () => [], now: () => world.now };
const run = (src: string) => new Interp(host).run(read(src));
const docWith = (n: Json) => applyOp(newDoc('t'), ['put', 'c1', n]).doc;

/** Generous: each case takes milliseconds with the limits, and seconds, or forever, without. */
const FAST = 2000;

/** Evaluate one expression the way the server's eval route does, and how long it took. */
function timed(src: string): { value?: unknown; error?: string; ms: number } {
  const t = performance.now();
  const r = evalIn(newDoc('t'), world, read(src));
  return { ...r, ms: performance.now() - t };
}

function failsFast(src: string, error: RegExp) {
  const r = timed(src);
  assert.ok(r.error !== undefined, `${src} should fail, but gave a value`);
  assert.match(r.error, error, src);
  assert.ok(r.ms < FAST, `${src} took ${Math.round(r.ms)} ms`);
}

test('building a huge list or text stops at a cap, not out of memory', () => {
  // The reviewer's repro, smaller: (range 40) killed Node with "heap out of memory".
  failsFast('(count (reduce (fn (acc it) (concat acc acc)) (list 1) (range 24)))', /this list is too long/);
  failsFast('(count (flat (let (r (range 20000)) (map r (range 100)))))', /this list is too long/);
  failsFast(`(let (s (join (map "x" (range 20000)) "")) (len (str ${'s '.repeat(101)})))`, /this text is too long/);
  failsFast('(len (let (s (str (range 1000))) (replace s "" s)))', /this text is too long/);
  failsFast('(len (join (range 20000) (str (range 1000))))', /this text is too long/);
  failsFast('(let (s (join (map "x" (range 20000)) "")) (count (split (str s s s s s s) "")))', /this list is too long/);
  // The reviewer's other repro, a text doubled in a Live timer's handler, stops one way or the other.
  failsFast('(len (reduce (fn (acc it) (str acc acc)) "ab" (range 22)))', /too long/);
  // Below the caps nothing changes.
  assert.equal(run('(count (concat (range 20000) (range 20000)))'), 40000);
  assert.equal(run('(count (flat (list (range 20000) (list (range 20000)))))'), 40000);
  assert.equal(run('(len (str "a" (range 3) "b"))'), 9);
  assert.equal(run('(replace "a-b-c" "-" "+")'), 'a+b+c');
});

test('work done inside functions counts toward the limit', () => {
  // Each of these makes or walks 20,000-item lists over and over, which used to count for nothing.
  failsFast('(count (map (fn (x) (range 20000)) (range 100)))', /this takes too long to compute/);
  failsFast('(count (let (r (range 20000)) (map (fn (x) (count-if true r)) (range 100))))', /this takes too long to compute/);
  failsFast('(count (let (r (range 20000)) (map (fn (x) (sum r)) (range 100))))', /this takes too long to compute/);
  failsFast('(let (r (range 2000)) (count-if (includes? r it) r))', /this takes too long to compute/);
  failsFast('(let (r (range 2000) s (range 2000)) (count-if (= r s) r))', /this takes too long to compute/);
  failsFast('(count (let (r (range 20000)) (map (fn (x) (reverse r)) (range 100))))', /this takes too long to compute/);
  // Long text that starts alike, sorted: every comparison reads the shared start.
  failsFast('(let (s (str (range 20000)) a (str s "a") b (str s "b")) (count (sort (map (nth (list a b) (% it 2)) (range 2000)))))', /this takes too long to compute/);
  // Text far longer than any number is not one, and is not read through each time.
  failsFast('(let (s (join (map 1 (range 20000)) "")) (sum-by (+ s 0) (range 20000)))', /expected a number/);
  assert.equal(run('(num "1,234.5")'), 1234.5);
  assert.equal(run('(+ " 2 " 1)'), 3);
  assert.equal(run('(sum (list 1 "2" "x" (list 3)))'), 6);
});

test('uniq is quick on a long list, and keeps what counted as equal', () => {
  // Compared pair by pair, 40,000 records took seconds, and the reviewer's repro up to a second for each uniq.
  const t = performance.now();
  assert.equal(run('(count (uniq (concat (map {n it} (range 20000)) (map {n (+ it 20000)} (range 20000)))))'), 40000);
  assert.equal(run('(count (map (fn (x) (uniq (range 20000))) (range 6)))'), 6);
  assert.equal(run('(count (uniq (concat (range 20000) (range 20000) (range 20000))))'), 20000);
  const ms = performance.now() - t;
  assert.ok(ms < FAST, `uniq took ${Math.round(ms)} ms`);

  // The same answers as comparing every pair with deepEqual: fields in any order,
  // 1 not "1", a function only itself, NaN not even itself (but a list holding it is itself).
  const pairwise = (l: unknown[]) => l.filter((x, i) => l.findIndex((y) => deepEqual(x, y)) === i);
  const l = run(`(let (f (fn (x) x) z (list (sqrt -1)))
    (list 1 "1" 1.0 0 -0 nil nil true false "" "" (list) (list) {} {}
      {a 1 b 2} {b 2 a 1} {a 1} {a "1"} (list 1 2) (list 1 2) (list 2 1)
      {a (list 1 {b 2})} {a (list 1 {b 2})} (list (list 1) 2) (list 1 (list 2))
      f f (fn (x) x) (sqrt -1) (list (sqrt -1)) (assoc {} "k") (assoc {} "j") (assoc {a 1} "k")
      z z (list (sqrt -1)) {a z} {a z}))`) as unknown[];
  const uniq = new Interp({ ...host, ref: () => l }).run(read('(uniq xs)'));
  assert.deepEqual(uniq, pairwise(l));
  assert.equal((uniq as unknown[]).length, 23);
  assert.deepEqual(run('(uniq nil)'), []);
});

test("one document's formulas share a budget, so many cells can't add up to minutes", () => {
  // Each cell stays under one formula's limit; three hundred of them took about ten seconds.
  const heavy = read('(count-if (> it -1) (concat (range 20000) (range 20000) (range 20000) (range 20000)))');
  const cells: Json[] = Array.from({ length: 300 }, (_, i) => ['formula', { name: `f${i}` }, heavy as Json]);
  const doc = docWith(['col', ...cells, ['formula', { name: 'last' }, ['+', '$f299', 1]]]);
  const t = performance.now();
  const c = evaluate(doc, world);
  const ms = performance.now() - t;
  const st = (n: string) => c.cells[resolve(doc.root, n)!.id];
  assert.equal(st('f0').value, 80000, 'the first cells still work');
  assert.equal(st('f299').error, "this document's formulas take too long to compute together");
  assert.equal(st('last').error, "this document's formulas take too long to compute together", 'even a cheap cell, once the budget is spent');
  assert.ok(ms < FAST, `the document took ${Math.round(ms)} ms`);

  // A document that does a lot, but less than that, works.
  const fine = docWith(['col', ...cells.slice(0, 8)]);
  assert.deepEqual(Object.values(evaluate(fine, world).cells).filter((s) => s.error), []);
});

test('a value that holds one list many times, or nests too deeply, does not leave the formula', () => {
  // Made in a millisecond; showing, sending or comparing it walked 2^40 items.
  failsFast('(reduce (fn (acc it) (list acc acc)) 1 (range 40))', /this value is too big to show or send/);
  failsFast('(reduce (list acc) 0 (range 1000))', /this value nests too deeply/);
  // Inside a formula, spelling such a list out is paid for item by item.
  failsFast('(len (str (reduce (fn (acc it) (list acc acc)) 1 (range 22))))', /this takes too long to compute/);
  failsFast('(get {a 1} (reduce (fn (acc it) (list acc acc)) 1 (range 22)))', /this takes too long to compute/);
  failsFast('(count (group (map {k (reduce (fn (acc it) (list acc acc)) 1 (range 12))} (range 200)) "k"))', /this takes too long to compute/);
  // What an action sends is weighed too: a Live timer's handler runs on the server.
  const doc = docWith(['col', ['button', { name: 'go' }, 'Go']]);
  const go = resolve(doc.root, 'go')!.id;
  const t = performance.now();
  assert.throws(() => runAction(doc, world, go, read('(insert! "log" {x (reduce (fn (acc it) (list acc acc)) 1 (range 40))})')), /this value is too big to show or send/);
  assert.ok(performance.now() - t < FAST);
  // A big value that is no trick is fine.
  assert.equal((run('(map {n it name (str "row " it)} (range 20000))') as unknown[]).length, 20000);
});
