import assert from 'node:assert/strict';
import { test } from 'node:test';
import { print, read } from '../../core/sx';
import { type Known, indentAt, insertionPoint, lex, matchAt, spotAt } from './lexer';
import { acceptText, argToShow, complete, formFor, signature, templateFor } from './docs';
import {
  addField, blankCall, getAt, insertArg, isShort, kindOf, localsAt, removeAt, renameKey, setAt, slotHint, slotLabel, swapHead, wrapAt,
} from './edits';

const known: Known = (n) => (n === 'qty' || n === 'price' || n === 'total' ? 'cell' : n === 'balance' ? 'fn' : null);
const kinds = (src: string) => lex(src, known).map((t) => `${t.text}:${t.kind}`);
const cells = [
  { name: 'qty', id: 'c2', isFn: false, preview: '3' },
  { name: 'price', id: 'c3', isFn: false, preview: '40' },
  { name: 'total', id: 'c4', isFn: false, preview: '120' },
  { name: 'balance', id: 'c5', isFn: true, preview: 'ƒ function' },
];

test('lexer: classifies heads, references, literals and locals', () => {
  assert.deepEqual(kinds('(* qty price)'), ['(:open', '*:builtin', 'qty:ref', 'price:ref', '):close']);
  assert.deepEqual(kinds('(if true "a" nil)'), ['(:open', 'if:special', 'true:literal', '"a":string', 'nil:literal', '):close']);
  assert.deepEqual(kinds('(set! qty 1)'), ['(:open', 'set!:action', 'qty:ref', '1:number', '):close']);
  assert.deepEqual(kinds('(balance 2)'), ['(:open', 'balance:fn', '2:number', '):close']);
  assert.deepEqual(kinds('(frob x)'), ['(:open', 'frob:unknown-fn', 'x:symbol', '):close']);
  assert.deepEqual(kinds('{name qty}'), ['{:open', 'name:key', 'qty:ref', '}:close']);
  assert.deepEqual(kinds('; hi\n1'), ['; hi:comment', '1:number']);
  // it and i only inside map's expression; let and fn names in their bodies
  assert.deepEqual(kinds('(map (* it 2) it)').filter((k) => k.startsWith('it')), ['it:local', 'it:symbol']);
  assert.deepEqual(kinds('(let (x 1 y (+ x 1)) (* x y))').filter((k) => /^[xy]:/.test(k)), ['x:local', 'y:local', 'x:local', 'x:local', 'y:local']);
  assert.deepEqual(kinds('(fn (a) (+ a 1))').filter((k) => k.startsWith('a:')), ['a:local', 'a:local']);
  assert.deepEqual(kinds('(reduce (+ acc it) 0 xs)').filter((k) => /^(acc|it):/.test(k)), ['acc:local', 'it:local']);
});

test('lexer: never throws on half-typed code, and pairs brackets with depth', () => {
  for (const src of ['(', ')', '"abc', '(+ 1 "x', '{a', '(()', '}}', '(let (x', '\\', '"\\']) assert.doesNotThrow(() => lex(src));
  const t = lex('(a (b) "s');
  assert.equal(t[0].kind, 'open');
  assert.equal(t[0].open, true, 'the outer bracket is never closed');
  assert.equal(t[2].depth, 1);
  assert.equal(t[2].partner, 4);
  assert.equal(t[4].partner, 2);
  assert.equal(t.at(-1)!.kind, 'string');
  assert.equal(t.at(-1)!.open, true);
  assert.equal(lex('a)')[1].stray, true);
  // Character for character: tokens never overlap and stay in order.
  const src = '(if (> total 100) "big" ; note\n  {a 1})';
  const toks = lex(src);
  for (let i = 1; i < toks.length; i++) assert.ok(toks[i].start >= toks[i - 1].end);
  assert.equal(toks.map((x) => x.text).join('').replace(/\s/g, ''), src.replace(/\s/g, ''));
});

test('lexer: the call, argument and word at a caret', () => {
  assert.deepEqual(spotAt('(round pri', 10).call, { head: 'round', arg: 0, open: 0 });
  assert.deepEqual(spotAt('(round pri', 10).word, { start: 7, end: 10, text: 'pri' });
  assert.equal(spotAt('(round x ', 9).call!.arg, 1);
  assert.equal(spotAt('(ro', 3).call!.arg, -1, 'typing the head itself');
  assert.equal(spotAt('(round x| 2)'.replace('|', ''), 8).call!.arg, 0);
  assert.deepEqual(spotAt('(rows "or', 9).string, { start: 6, text: 'or' });
  assert.deepEqual(spotAt('(map (* it ', 11).locals, ['it', 'i']);
  assert.deepEqual(spotAt('(map (* it 2) ', 14).locals, []);
  assert.deepEqual(spotAt('(let (x 1) ', 11).locals, ['x']);
  assert.equal(spotAt('{a 1 ', 5).record!.key, true);
  assert.equal(spotAt('{a ', 3).record!.key, false);
  assert.equal(spotAt('1 ; com', 7).comment, true);
});

test('lexer: matching brackets, indentation, insertion point', () => {
  const toks = lex('(a (b))');
  assert.deepEqual(matchAt(toks, 7), { at: 5, partner: 0 }, 'the bracket just before the caret');
  assert.deepEqual(matchAt(toks, 3), { at: 2, partner: 4 }, 'else the one just after');
  assert.equal(matchAt(toks, 2), null);
  assert.equal(indentAt('(if (> a 1)\n', 12), 2);
  assert.equal(indentAt('  (let (x 1\n', 11), 9, 'two past the innermost open bracket');
  assert.equal(indentAt('{a 1\n', 5), 1);
  assert.equal(indentAt('(a)\n', 4), 0);
  assert.equal(insertionPoint('(+ a b)', 7), 6, 'after a finished call, inside it');
  assert.equal(insertionPoint('(+ a b)  ', 9), 6);
  assert.equal(insertionPoint('(+ a b', 6), 6);
  assert.equal(insertionPoint('(+ a b)', 3), 3);
  assert.equal(insertionPoint('', 0), 0);
  assert.equal(insertionPoint('total', 5), 5);
});

test('docs: signatures and templates per name', () => {
  assert.deepEqual(signature('round')!.args, ['x', '2']);
  assert.deepEqual(signature('max')!.args, ['list', '…'], 'shares the line of sum');
  assert.equal(formFor('toggle!'), '(toggle! done)');
  assert.equal(formFor('sib'), '(sib 1)', 'found inside the example');
  assert.equal(formFor('idx'), '(idx)');
  assert.equal(formFor('range'), '(range 1 13)', 'the second form of the example');
  assert.equal(signature('total'), null);
  assert.deepEqual(templateFor('round'), { text: '(round x 2)', select: [7, 8] });
  assert.deepEqual(templateFor('today'), { text: '(today)', select: null });
  assert.equal(templateFor('sum').text, '(sum list)', 'no … in inserted code');
  const sig = signature('sum')!;
  assert.equal(argToShow(sig, 0), 0);
  assert.equal(argToShow(sig, 4), 1, 'past the end of a variadic call: the …');
  assert.equal(argToShow(signature('round')!, 5), -1);
});

test('completion: ranks, filters and accepts', () => {
  const c = complete('(su', 3, cells, [])!;
  assert.equal(c.from, 1);
  assert.equal(c.afterParen, true);
  assert.equal(c.items[0].label, 'sum');
  assert.ok(c.items.some((i) => i.label === 'sum-by'));
  assert.deepEqual(acceptText(c.items[0], c), { text: 'sum ', caret: 4 });
  assert.deepEqual(acceptText(c.items[0], c, ' '), { text: 'sum', caret: 4 }, 'no double space');

  const v = complete('(+ q', 4, cells, [])!;
  assert.equal(v.items[0].label, 'qty');
  assert.equal(v.items[0].detail, '3');
  assert.deepEqual(acceptText(v.items[0], v), { text: 'qty', caret: 3 });

  const f = complete('(+ 1 rou', 8, cells, [])!;
  assert.equal(f.items[0].label, 'round');
  assert.deepEqual(acceptText(f.items[0], f), { text: '(round )', caret: 7 }, 'a function typed bare gets its brackets');
  const now = complete('no', 2, cells, [])!.items.find((i) => i.label === 'now')!;
  assert.deepEqual(acceptText(now, complete('no', 2, cells, [])!), { text: '(now)', caret: 5 });

  assert.equal(complete('(+ 1 2', 6, cells, []), null, 'not on numbers');
  assert.equal(complete('(+ qty', 6, cells, []), null, 'nothing left to complete');
  assert.equal(complete('(+ qty ', 7, cells, []), null, 'nothing typed');
  assert.ok(complete('(+ qty ', 7, cells, [], undefined, true)!.items.length > 10, 'Ctrl+Space lists everything');
  assert.ok(!complete('(+ to', 5, cells, [], 'c4')!.items.some((i) => i.label === 'total'), 'the cell itself is left out');

  const inMap = complete('(map (* i', 9, cells, [])!;
  assert.equal(inMap.items[0].label, 'i');
  assert.equal(inMap.items[0].kind, 'local');

  const rows = complete('(rows "or', 9, cells, ['orders', 'people'])!;
  assert.deepEqual(rows.items.map((i) => i.label), ['orders']);
  assert.equal(rows.from, 7);
  assert.equal(complete('(str "or', 8, cells, ['orders']), null, 'collections only where one is named');
  assert.equal(complete('{na', 3, cells, []), null, 'not on record keys');
});

test('edits: reading values as blocks', () => {
  assert.equal(kindOf(['+', 1, 2]), 'call');
  assert.equal(kindOf('$qty'), 'ref');
  assert.equal(kindOf('hello'), 'text');
  assert.equal(kindOf(['quote', '$x']), 'text');
  assert.equal(kindOf(3), 'number');
  assert.equal(kindOf(false), 'bool');
  assert.equal(kindOf(null), 'nil');
  assert.equal(kindOf({ a: 1 }), 'record');
  assert.equal(kindOf([]), 'list');
  assert.equal(isShort(read('(+ subtotal off vat)')), true);
  assert.equal(isShort(read('(if (> total 100) (* total 0.9) (round (* total 1.1) 2))')), false);
});

test('edits: change by path without touching the original', () => {
  const x = read('(+ qty (* price 2))');
  const frozen = JSON.stringify(x);
  assert.equal(getAt(x, [2, 1]), '$price');
  assert.equal(print(setAt(x, [2, 2], 3)), '(+ qty (* price 3))');
  assert.equal(print(removeAt(x, [1])), '(+ (* price 2))');
  assert.equal(removeAt(x, []), null);
  assert.equal(print(insertArg(x, [], 1)), '(+ qty (* price 2) 1)');
  assert.equal(print(insertArg(x, [2], '$qty', 1)), '(+ qty (* qty price 2))');
  assert.equal(print(swapHead(x, [2], '/')), '(+ qty (/ price 2))');
  assert.equal(JSON.stringify(x), frozen);
  // Fixed slots read like a sentence: removing one empties it.
  assert.equal(print(removeAt(read('(if a b c)'), [2])), '(if a nil c)');
  assert.equal(print(removeAt(read('(map (* it 2) xs)'), [2])), '(map (* it 2) nil)');
  // Records
  const r = read('{name client total 3}');
  assert.equal(print(addField(r, [], 'field')), '{name client total 3 field nil}');
  assert.equal(print(addField(addField(r, [], 'f'), [], 'f')), '{name client total 3 f nil f2 nil}');
  assert.equal(print(renameKey(r, [], 'name', 'who')), '{who client total 3}');
  assert.equal(renameKey(r, [], 'name', 'total'), r, 'no clash');
  assert.equal(print(removeAt(r, ['name'])), '{total 3}');
});

test('edits: blank calls and wrapping make valid code', () => {
  assert.deepEqual(blankCall('round'), ['round', null, 2]);
  assert.deepEqual(blankCall('if'), ['if', null, null, null]);
  assert.deepEqual(blankCall('map'), ['map', ['*', '$it', 2], null]);
  assert.deepEqual(blankCall('set!'), ['set!', null, ['+', null, 1]]);
  assert.deepEqual(blankCall('insert!'), ['insert!', 'orders', { qty: null }]);
  assert.deepEqual(blankCall('today'), ['today']);
  assert.deepEqual(blankCall('let'), ['let', ['x', null], '$x']);
  assert.deepEqual(blankCall('fn'), ['fn', ['x'], null]);
  assert.equal(print(wrapAt(read('(* qty price)'), [1], 'round')), '(* (round qty 2) price)');
  assert.equal(print(wrapAt('$xs', [], 'map')), '(map (* it 2) xs)', 'the list goes where the list goes');
  assert.equal(print(wrapAt(read('(> total 100)'), [], 'if')), '(if (> total 100) nil nil)');
  assert.equal(print(wrapAt(3, [], 'today')), '(today 3)');
  // Every blank call prints to code that reads back to the same thing.
  for (const name of ['round', 'if', 'cond', 'map', 'filter', 'reduce', 'sort-by', 'set!', 'toggle!', 'insert!', 'let', 'fn', 'str', 'fmt', 'rows', 'sib', 'dup!']) {
    const x = blankCall(name);
    assert.deepEqual(read(print(x)), x, name);
  }
});

test('edits: slot labels, hints and local names', () => {
  assert.equal(slotLabel('if', 2, 4), 'then');
  assert.equal(slotLabel('if', 3, 4), 'else');
  assert.equal(slotLabel('map', 2, 3), 'for each it in');
  assert.equal(slotLabel('cond', 1, 6), null);
  assert.equal(slotLabel('cond', 2, 6), 'then');
  assert.equal(slotLabel('cond', 3, 6), 'or if');
  assert.equal(slotLabel('cond', 5, 6), 'otherwise');
  assert.equal(slotLabel('+', 1, 3), null);
  assert.equal(slotHint('round', 1), 'x');
  assert.equal(slotHint('sum', 3), 'list', 'variadic calls repeat the last name');
  assert.equal(slotHint('map', 1), null, 'not an expression');
  const x = read('(let (k 2) (map (* it k) (fn (a) a)))');
  assert.deepEqual(localsAt(x, [2, 1, 1]), ['k', 'it', 'i']);
  assert.deepEqual(localsAt(x, [2, 2, 2]), ['k', 'a']);
  assert.deepEqual(localsAt(x, [1, 1]), []);
  assert.deepEqual(localsAt(read('(reduce (+ acc it) 0 xs)'), [1, 1]), ['acc', 'it', 'i']);
});
