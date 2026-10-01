import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Cell, type Doc, type Json, type Op, newDoc } from './types';
import { Interp, formatValue, print, read } from './sx';
import { OpError, applyOp, applyOps } from './ops';
import { evalIn, evaluate, runAction } from './engine';
import { leaves, resolve } from './tree';
import { toNotation } from './notation';
import { outline } from './outline';

const world = { rows: () => [] as unknown[], now: Date.UTC(2026, 8, 30) };
const host = { ref: () => { throw new Error('no cells'); }, sib: () => null, idx: () => 0, child: () => '', rows: () => [], now: () => world.now };
const run = (src: string) => new Interp(host).run(read(src));

function docWith(n: Json): Doc {
  return applyOp(newDoc('t'), ['put', 'c1', n]).doc;
}
const shape = (c: Cell): Json => (c.children ? [c.kind, ...c.children.map(shape)] : c.name ?? c.id);
const val = (doc: Doc, name: string) => evaluate(doc, world).cells[resolve(doc.root, name)!.id];

test('reader and printer round-trip', () => {
  const cases: [string, Json][] = [
    ['(* qty price)', ['*', '$qty', '$price']],
    ['(if (> total 100) "big" "small")', ['if', ['>', '$total', 100], 'big', 'small']],
    ['(map (fn (x) (* x 2)) xs)', ['map', ['fn', ['x'], ['*', '$x', 2]], '$xs']],
    ['(let (a 1 b 2) (+ a b))', ['let', ['a', 1, 'b', 2], ['+', '$a', '$b']]],
    ['(set! count (+ count 1))', ['set!', 'count', ['+', '$count', 1]]],
    ['(insert! "orders" {qty qty note "hi"})', ['insert!', 'orders', { qty: '$qty', note: 'hi' }]],
    ['"$5"', ['quote', '$5']],
    ['total', '$total'],
    ['-3.5', -3.5],
    ['nil', null],
  ];
  for (const [src, json] of cases) {
    assert.deepEqual(read(src), json, src);
    assert.equal(print(json), src);
  }
  assert.throws(() => read('(+ 1'), /missing \)/);
  assert.throws(() => read('1 2'), /one expression/);
});

test('evaluation', () => {
  assert.equal(run('(+ 1 2 3)'), 6);
  assert.equal(run('(+ 0.1 0.2)'), 0.3);
  assert.equal(run('(sum (list 1 2 (list 3 "x" "4")))'), 10);
  assert.deepEqual(run('(map (* it 2) (range 1 4))'), [2, 4, 6]);
  assert.deepEqual(run('(filter (> it 1) (list 1 2 3))'), [2, 3]);
  assert.equal(run('(reduce (+ acc it) 0 (list 1 2 3))'), 6);
  assert.equal(run('((fn (x y) (* x y)) 3 4)'), 12);
  assert.equal(run('(let (sq (fn (x) (* x x))) (sq 5))'), 25);
  assert.equal(run('(cond (> 1 2) "a" (> 2 1) "b" "c")'), 'b');
  assert.equal(run('(str "a" 1.5 nil "b")'), 'a1.5b');
  assert.equal(run('(get {a 1 b (+ 1 1)} "b")'), 2);
  assert.deepEqual(run('(column (list {t 1} {t 2}) "t")'), [1, 2]);
  assert.equal(run('(sum-by (get it "t") (list {t 1} {t 2}))'), 3);
  assert.equal(run('(round (pmt (/ 0.06 12) 360 300000) 2)'), 1798.65);
  assert.equal(run('(days "2026-01-01" "2026-01-31")'), 30);
  assert.throws(() => run('(/ 1 0)'), /division by zero/);
  assert.throws(() => run('(nope 1)'), /unknown function nope/);
  assert.throws(() => run('(set! a 1)'), /only works in an action/);
  assert.throws(() => run('(1 2 3)'), /use \(list/);
});

test('formats', () => {
  assert.equal(formatValue(1234.5, 'currency'), '$1,234.50');
  assert.equal(formatValue(1234.5, 'EUR'), '€1,234.50');
  assert.equal(formatValue(0.256, 'percent'), '25.6%');
  assert.equal(formatValue(3.14159, '0.00'), '3.14');
  assert.equal(formatValue(1234567, 'compact'), '1.2M');
  assert.equal(formatValue(0.30000000000000004), '0.3');
});

test('split, nest and flatten', () => {
  let doc = newDoc('t');
  doc = applyOp(doc, ['split', 'c1', 'row']).doc;
  assert.deepEqual(shape(doc.root), ['row', 'c1', 'c2']);
  doc = applyOp(doc, ['split', 'c2', 'col']).doc;
  assert.deepEqual(shape(doc.root), ['row', 'c1', ['col', 'c2', 'c4']]);
  doc = applyOp(doc, ['split', 'c1', 'row', { before: true }]).doc;
  assert.deepEqual(shape(doc.root), ['row', 'c6', 'c1', ['col', 'c2', 'c4']]);
  assert.equal(resolve(doc.root, 'c1')!.size, 0.5);
  // removing collapses the group it leaves behind
  doc = applyOp(doc, ['remove', 'c4']).doc;
  assert.deepEqual(shape(doc.root), ['row', 'c6', 'c1', 'c2']);
});

test('every op can be undone', () => {
  const start = docWith(['col',
    ['row', ['text', { name: 'a' }, 'A'], ['text', { name: 'b' }, 'B']],
    ['row', ['text', { name: 'c' }, 'C'], ['text', { name: 'd' }, 'D']]]);
  const ops: Op[] = [
    ['split', 'a', 'col'], ['split', 'a', 'row'], ['merge', 'a', 'b'], ['merge', 'a', 'c'], ['remove', 'd'], ['dup', 'a'],
    ['swap', 'a', 'd'], ['move', 'a', 'd', 'after'], ['put', 'b', ['row', 'x', 'y']], ['set', 'a', 'text', 'Z'],
    ['set', 'a', 'name', 'alpha'], ['style', 'a', { bg: 'accent' }], ['set', 'a', 'size', 'hug'], ['meta', 'title', 'T'],
    ['do', ['split', 'a', 'row'], ['remove', 'b'], ['set', 'c', 'text', 'q']],
  ];
  for (const op of ops) {
    const r = applyOp(start, op);
    const back = applyOp(r.doc, r.inverse).doc;
    assert.deepEqual(back.root, start.root, 'undo of ' + JSON.stringify(op));
    assert.deepEqual(back.meta, start.meta);
    // replaying the normalized op gives the same document
    assert.deepEqual(applyOp(start, r.op).doc.root, r.doc.root, 'replay of ' + JSON.stringify(op));
  }
});

test('merge', () => {
  const grid = docWith(['col',
    ['row', ['text', { name: 'a' }, 'A'], ['text', { name: 'b' }, 'B'], ['text', { name: 'c' }, 'C']],
    ['row', ['text', { name: 'd' }, 'D'], ['text', { name: 'e' }, 'E'], ['text', { name: 'f' }, 'F']]]);
  // neighbours in a row
  let doc = applyOp(grid, ['merge', 'a', 'b']).doc;
  assert.deepEqual(shape(doc.root), ['col', ['row', 'a', 'c'], ['row', 'd', 'e', 'f']]);
  assert.equal(resolve(doc.root, 'a')!.text, 'A\n\nB');
  assert.equal(resolve(doc.root, 'a')!.size, 2);
  // across rows: the band is rebuilt so the merged cell spans both
  doc = applyOp(grid, ['merge', 'a', 'd']).doc;
  assert.deepEqual(shape(doc.root), ['row', 'a', ['col', 'b', 'e'], ['col', 'c', 'f']]);
  // a 2×2 block
  doc = applyOp(grid, ['merge', 'b', 'c', 'e', 'f']).doc;
  assert.deepEqual(shape(doc.root), ['row', ['col', 'a', 'd'], 'b']);
  assert.equal(leaves(doc.root).length, 3);
  // not a rectangle
  assert.throws(() => applyOp(grid, ['merge', 'a', 'e']), OpError);
  assert.throws(() => applyOp(grid, ['merge', 'a', 'c']), OpError);
  // a whole group
  doc = applyOp(grid, ['merge', grid.root.children![0].id]).doc;
  assert.deepEqual(shape(doc.root), ['col', 'a', ['row', 'd', 'e', 'f']]);
});

test('ops reject bad input and leave the doc alone', () => {
  const doc = docWith(['row', ['text', { name: 'a' }, 'A'], ['text', { name: 'b' }, 'B']]);
  assert.throws(() => applyOp(doc, ['set', 'a', 'name', 'b']), /already named/);
  assert.throws(() => applyOp(doc, ['set', 'a', 'nope', 1]), /can't be set/);
  assert.throws(() => applyOp(doc, ['split', 'zzz', 'row']), /no cell called/);
  assert.throws(() => applyOp(doc, ['put', 'a', ['wat']]), /unknown kind/);
  assert.throws(() => applyOps(doc, [['set', 'a', 'text', 'x'], ['remove', 'zzz']]), OpError);
  assert.equal(resolve(doc.root, 'a')!.text, 'A');
});

test('formulas, references and links', () => {
  const doc = docWith(['col',
    ['input', { name: 'qty', type: 'number', value: 3 }],
    ['input', { name: 'price', type: 'number', value: 9.99 }],
    ['formula', { name: 'total', format: 'currency' }, ['*', '$qty', '$price']],
    ['text', { name: 'note' }, 'Total: {{total | currency}} for {{qty}} items'],
    ['text', { name: 'warn', hidden: ['<', '$total', 100], style: { fg: ['if', ['>', '$total', 20], 'bad', 'ink'] } }, 'Big'],
  ]);
  const c = evaluate(doc, world);
  const id = (n: string) => resolve(doc.root, n)!.id;
  assert.equal(c.cells[id('total')].value, 29.97);
  assert.equal(c.cells[id('note')].value, 'Total: $29.97 for 3 items');
  assert.equal(c.cells[id('warn')].hidden, true);
  assert.equal(c.cells[id('warn')].style!.fg, 'bad');
  assert.deepEqual(c.cells[id('total')].reads!.sort(), [id('price'), id('qty')].sort());
  assert.ok(c.feeds[id('total')].includes(id('note')));
  // unchanged cells keep their identity across evaluations
  const next = applyOp(doc, ['set', 'qty', 'value', 4]).doc;
  const c2 = evaluate(next, world, c);
  assert.equal(c2.cells[id('price')], c.cells[id('price')]);
  assert.equal(c2.cells[id('total')].value, 39.96);
});

test('rows of relative formulas, groups as lists', () => {
  const line = (d: string, q: number, p: number): Json =>
    ['row', ['text', d], ['input', { type: 'number', value: q }], ['input', { type: 'number', value: p }], ['formula', ['*', ['sib', 1], ['sib', 2]]]];
  let doc = docWith(['col',
    ['col', { name: 'lines' }, line('Design', 2, 100), line('Build', 3, 50)],
    ['formula', { name: 'subtotal' }, ['sum', ['column', '$lines', 3]]]]);
  assert.equal(val(doc, 'subtotal').value, 350);
  const first = resolve(doc.root, 'lines')!.children![0].id;
  doc = applyOp(doc, ['dup', first]).doc;
  assert.equal(val(doc, 'subtotal').value, 550);
});

test('errors: cycles, unknown names, propagation', () => {
  const doc = docWith(['col',
    ['formula', { name: 'a' }, ['+', '$b', 1]],
    ['formula', { name: 'b' }, ['+', '$a', 1]],
    ['formula', { name: 'c' }, ['+', '$missing', 1]],
    ['formula', { name: 'd' }, ['/', 1, 0]],
    ['formula', { name: 'e' }, ['+', '$d', 1]]]);
  assert.match(val(doc, 'a').error!, /circular reference: a → b → a/);
  assert.match(val(doc, 'c').error!, /no cell called "missing"/);
  assert.match(val(doc, 'e').error!, /^d: division by zero/);
});

test('renaming a cell rewrites what reads it', () => {
  let doc = docWith(['col',
    ['input', { name: 'qty', type: 'number', value: 2 }],
    ['formula', { name: 'dbl' }, ['*', '$qty', 2]],
    ['text', { name: 't' }, 'You have {{qty | int}} ({{(* qty 2)}})'],
    ['button', { name: 'btn', do: ['set!', 'qty', ['+', '$qty', 1]] }, 'More']]);
  doc = applyOp(doc, ['set', 'qty', 'name', 'count']).doc;
  assert.deepEqual(resolve(doc.root, 'dbl')!.expr, ['*', '$count', 2]);
  assert.equal(resolve(doc.root, 't')!.text, 'You have {{count | int}} ({{(* count 2)}})');
  assert.deepEqual(resolve(doc.root, 'btn')!.do, ['set!', 'count', ['+', '$count', 1]]);
  assert.equal(val(doc, 'dbl').value, 4);
});

test('actions collect effects', () => {
  const doc = docWith(['col',
    ['input', { name: 'n', type: 'number', value: 1 }],
    ['button', { name: 'go', do: ['do', ['set!', 'n', ['+', '$n', 1]], ['insert!', 'log', { n: '$n' }]] }, 'Go']]);
  const btn = resolve(doc.root, 'go')!;
  const fx = runAction(doc, world, btn.id, btn.do!);
  assert.deepEqual(fx, [
    { type: 'op', op: ['set', resolve(doc.root, 'n')!.id, 'value', 2] },
    { type: 'insert', collection: 'log', record: { n: 1 } },
  ]);
  assert.deepEqual(evalIn(doc, world, ['*', '$n', 10]), { value: 10 });
});

test('notation and outline', () => {
  const n: Json = ['col', { id: 'c1' },
    ['text', { id: 'c2', name: 'title', style: { size: 28 } }, 'Hello'],
    ['formula', { id: 'c3', name: 'x' }, ['+', 1, 2]]];
  const doc = docWith(n);
  assert.deepEqual(toNotation(doc.root), n);
  const text = outline(doc, evaluate(doc, world));
  assert.match(text, /c3 formula x = \(\+ 1 2\) → 3/);
});

test('reading errors say where', () => {
  const at = (src: string) => {
    try { read(src); } catch (e) { return (e as { pos?: number }).pos; }
    return undefined;
  };
  assert.equal(at('(+ 1 (* 2 3)'), 0);
  assert.equal(at('(+ 1 2))'), 7);
  assert.equal(at('(str "abc'), 5);
  assert.equal(at('(+ 1 2) 3'), 8);
});

test('lists: items in the body, checklists as records, computed lists', () => {
  const doc = docWith(['col',
    ['list', { name: 'todo', type: 'check' }, 'Book the venue', { text: 'Send invites', done: true }],
    ['list', { name: 'steps', type: 'number' }, 'One', 'Two'],
    ['list', { name: 'squares', expr: ['map', ['*', '$it', '$it'], ['range', 1, 4]] }],
    ['formula', { name: 'done' }, ['count-if', ['get', '$it', 'done'], '$todo']]]);
  const todo = resolve(doc.root, 'todo')!;
  assert.deepEqual(todo.value, ['Book the venue', { text: 'Send invites', done: true }]);
  assert.deepEqual(val(doc, 'todo').value, [{ text: 'Book the venue', done: false }, { text: 'Send invites', done: true }]);
  assert.deepEqual(val(doc, 'steps').value, ['One', 'Two']);
  assert.deepEqual(val(doc, 'squares').value, [1, 4, 9]);
  assert.equal(val(doc, 'done').value, 1);
  // The items come back as the body, so notation round-trips.
  const n = toNotation(todo, false);
  assert.deepEqual(n, ['list', { name: 'todo', type: 'check' }, 'Book the venue', { text: 'Send invites', done: true }]);
  assert.deepEqual(toNotation(docWith(['list', {}, { text: 'a' }]).root, false), ['list', {}, { text: 'a' }]);
  assert.throws(() => docWith(['list', { value: 'nope' }]), OpError);
});

test('calendar, canvas, stat and break', () => {
  const doc = docWith(['col',
    ['input', { name: 'when', type: 'date', value: '2026-10-05' }],
    ['calendar', { name: 'cal', value: '2026-10-02' }, ['list', { date: '$when', title: 'Launch' }]],
    ['canvas', { name: 'sig', label: 'Sign here' }],
    ['stat', { name: 'revenue', label: 'Revenue', format: 'currency', compare: 80, trend: ['list', 1, 3, 2] }, ['*', 50, 2]],
    ['stat', { name: 'growth', compare: ['-', '$revenue', 20] }, '$revenue'],
    ['break'],
    ['formula', { name: 'signed' }, ['not', ['empty?', '$sig']]]]);
  const c = evaluate(doc, world);
  const at = (name: string) => c.cells[resolve(doc.root, name)!.id];
  assert.equal(at('cal').value, '2026-10-02');
  assert.deepEqual(at('cal').props?.events, [{ date: '2026-10-05', title: 'Launch' }]);
  assert.ok(at('cal').reads?.includes(resolve(doc.root, 'when')!.id), 'the calendar reads what its events read');
  assert.deepEqual(at('sig').value, []);
  assert.equal(at('signed').value, false);
  assert.equal(at('revenue').value, 100);
  assert.deepEqual(at('growth').props?.compare, 80);
  const signed = applyOp(doc, ['set', 'sig', 'value', [{ c: 'ink', w: 2, p: [10, 10, 40, 40] }]]).doc;
  assert.equal(val(signed, 'signed').value, true);
  // Renaming follows into compare and trend.
  const renamed = applyOp(doc, ['set', 'revenue', 'name', 'income']).doc;
  assert.deepEqual(resolve(renamed.root, 'growth')!.compare, ['-', '$income', 20]);
  const text = outline(doc, c);
  assert.match(text, /calendar cal events \(list \{date when title "Launch"\}\) picked "2026-10-02"/);
  assert.match(text, /canvas sig 0 strokes/);
  assert.match(text, /stat revenue = \(\* 50 2\) → 100/);
  assert.match(text, /break/);
});

test('page setup lives in meta and a row can opt out of stacking', () => {
  let doc = applyOps(newDoc('t'), [['meta', 'page', 'Letter'], ['meta', 'orientation', 'landscape'], ['meta', 'margin', 12]]).doc;
  assert.equal(doc.meta.page, 'Letter');
  assert.equal(doc.meta.orientation, 'landscape');
  doc = applyOp(doc, ['put', 'c1', ['row', { style: { stack: 'never' } }, 'a', 'b']]).doc;
  assert.equal(doc.root.style?.stack, 'never');
});

test('every template builds and evaluates without errors', async () => {
  const { TEMPLATES, tour } = await import('./templates');
  for (const t of [...TEMPLATES, tour]) {
    const doc = applyOp(newDoc('t'), ['put', 'c1', t.root]).doc;
    const c = evaluate(doc, world);
    const broken = Object.entries(c.cells).filter(([, st]) => st.error).map(([id, st]) => `${id}: ${st.error}`);
    assert.deepEqual(broken, [], t.id);
  }
});
