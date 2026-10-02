import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Doc, type Json, newDoc } from './types';
import { applyOp } from './ops';
import { evalIn, evaluate } from './engine';
import { resolve } from './tree';
import { toNotation } from './notation';
import { outline } from './outline';
import { read } from './sx';
import {
  type DiagramEl, anchorPoint, boxOf, centre, connectorEnds, duplicateElements, elementsOf, eraseElements, hitTest,
  insideBox, moveElements, prepareDiagram, resizeBox, wrapText,
} from './diagram';

const world = { rows: () => [] as unknown[], now: Date.UTC(2026, 8, 30) };
const docWith = (n: Json): Doc => applyOp(newDoc('t'), ['put', 'c1', n]).doc;
const near = (a: number, b: number, eps = 0.6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

const FLOW: Json = ['diagram', { name: 'flow' },
  { id: 'start', type: 'ellipse', text: 'Order placed' },
  { id: 'pay', type: 'diamond', text: 'Paid?' },
  { id: 'ship', type: 'rect', text: 'Ship it' },
  { id: 'remind', type: 'rect', text: 'Send a reminder' },
  { id: 'done', type: 'ellipse', text: 'Done' },
  { type: 'arrow', from: 'start', to: 'pay' },
  { type: 'arrow', from: 'pay', to: 'ship', text: 'yes' },
  { type: 'arrow', from: 'pay', to: 'remind', text: 'no' },
  { type: 'arrow', from: 'ship', to: 'done' },
  { type: 'arrow', from: 'remind', to: 'pay' },
];

test('diagram: an arrow end sits on the outline of rect, ellipse and diamond', () => {
  const b = { x: 0, y: 0, w: 200, h: 100 };
  const c = centre(b);
  for (const toward of [{ x: 500, y: 50 }, { x: 100, y: 400 }, { x: -300, y: -300 }, { x: 250, y: 120 }]) {
    const r = anchorPoint('rect', b, toward);
    assert.ok(Math.abs(r.x - 0) < 1e-9 || Math.abs(r.x - 200) < 1e-9 || Math.abs(r.y) < 1e-9 || Math.abs(r.y - 100) < 1e-9, 'rect edge');
    const e = anchorPoint('ellipse', b, toward);
    near(((e.x - c.x) / 100) ** 2 + ((e.y - c.y) / 50) ** 2, 1, 1e-9);
    const d = anchorPoint('diamond', b, toward);
    near(Math.abs(d.x - c.x) / 100 + Math.abs(d.y - c.y) / 50, 1, 1e-9);
    // A gap pushes the end out along the same line.
    const g = anchorPoint('rect', b, toward, 10);
    near(Math.hypot(g.x - r.x, g.y - r.y), 10, 1e-9);
  }
});

test('diagram: attached arrows follow their shapes when they move', () => {
  const els: DiagramEl[] = [
    { id: 'a', type: 'rect', x: 0, y: 0, w: 100, h: 50 },
    { id: 'b', type: 'ellipse', x: 300, y: 0, w: 100, h: 50 },
    { id: 'l', type: 'arrow', from: 'a', to: 'b' },
  ];
  const ends = (list: DiagramEl[]) => connectorEnds(list[2], new Map(list.map((e) => [e.id, e])), 0)!;
  assert.deepEqual(ends(els), { x1: 100, y1: 25, x2: 300, y2: 25 });
  const moved = moveElements(els, ['b'], 0, 200);
  const e = ends(moved);
  // Both ends stay on the outlines, now along the diagonal.
  assert.ok(insideBox(moved[0], { x: e.x1, y: e.y1 }, 0.5) && !insideBox(moved[0], { x: e.x1, y: e.y1 }, -0.5));
  assert.ok(insideBox(moved[1], { x: e.x2, y: e.y2 }, 0.5) && !insideBox(moved[1], { x: e.x2, y: e.y2 }, -0.5));
  assert.ok(e.y2 > 150);
  // Moving the arrow alone leaves attached ends where they are; a free end moves.
  const free: DiagramEl[] = [...els.slice(0, 2), { id: 'l', type: 'line', from: 'a', x2: 50, y2: 300 }];
  const m = moveElements(free, ['l'], 10, 10);
  assert.deepEqual([m[2].x2, m[2].y2, m[2].from], [60, 310, 'a']);
  // Resizing keeps the opposite corner.
  assert.deepEqual(resizeBox({ x: 10, y: 10, w: 100, h: 50 }, 'nw', 20, 10), { x: 30, y: 20, w: 80, h: 40 });
  assert.deepEqual(resizeBox({ x: 10, y: 10, w: 100, h: 50 }, 'e', -200, 0), { x: 10, y: 10, w: 16, h: 50 });
});

test('diagram: a flowchart written without positions is laid out top to bottom', () => {
  const els = prepareDiagram((FLOW as Json[]).slice(2));
  assert.equal(els.length, 10);
  const box = (id: string) => boxOf(els.find((e) => e.id === id)!);
  assert.ok(box('start').y < box('pay').y && box('pay').y < box('ship').y && box('ship').y < box('done').y);
  assert.equal(box('ship').y, box('remind').y);
  const boxes = els.filter((e) => e.type !== 'arrow').map((e) => boxOf(e));
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const [p, q] = [boxes[i], boxes[j]];
      assert.ok(p.x + p.w <= q.x || q.x + q.w <= p.x || p.y + p.h <= q.y || q.y + q.h <= p.y, 'no two boxes overlap');
    }
  }
  // Arrows got ids; boxes keep the ids they were given.
  assert.deepEqual(els.map((e) => e.id), ['start', 'pay', 'ship', 'remind', 'done', 'e1', 'e2', 'e3', 'e4', 'e5']);
  assert.throws(() => prepareDiagram([{ type: 'star' }]), /known: rect, ellipse, diamond, text, arrow, line/);
  assert.throws(() => prepareDiagram([{ type: 'arrow', from: 'nope', to: 'nope' }]), /not a shape or text/);
  assert.throws(() => prepareDiagram([{ type: 'line', x1: 0, y1: 0 }]), /needs "to"/);
  assert.throws(() => prepareDiagram([{ type: 'rect', x: '3' }]), /x must be a number/);
});

test('diagram: notation and ops round-trip; draw and erase change single elements', () => {
  const d = docWith(FLOW);
  const flow = resolve(d.root, 'flow')!;
  assert.equal(elementsOf(flow.value).length, 10);
  const again = docWith(toNotation(d.root, false));
  assert.deepEqual(again.root.value, d.root.value);
  // Draw a new box below the one its arrow comes from, then restyle one.
  let r = applyOp(d, ['draw', 'flow', { id: 'audit', type: 'rect', text: 'Audit' }, { type: 'arrow', from: 'done', to: 'audit' }]);
  let els = elementsOf(resolve(r.doc.root, 'flow')!.value);
  const done = boxOf(els.find((e) => e.id === 'done')!);
  assert.ok(boxOf(els.find((e) => e.id === 'audit')!).y > done.y + done.h);
  // The op as applied replays to the same result, and undoes.
  assert.deepEqual(applyOp(d, r.op).doc.root, r.doc.root);
  assert.deepEqual(applyOp(r.doc, r.inverse).doc.root, d.root);
  r = applyOp(r.doc, ['draw', 'flow', { id: 'ship', color: 'live', fill: 'live-soft', text: null }]);
  els = elementsOf(resolve(r.doc.root, 'flow')!.value);
  const ship = els.find((e) => e.id === 'ship')!;
  assert.deepEqual([ship.color, ship.fill, ship.text], ['live', 'live-soft', undefined]);
  // Erasing a shape takes the arrows attached to it.
  r = applyOp(r.doc, ['erase', 'flow', 'remind']);
  els = elementsOf(resolve(r.doc.root, 'flow')!.value);
  assert.equal(els.some((e) => e.from === 'remind' || e.to === 'remind' || e.id === 'remind'), false);
  assert.throws(() => applyOp(r.doc, ['erase', 'flow', 'ghost']), /no element "ghost"/);
  assert.throws(() => applyOp(d, ['set', 'flow', 'value', [{ type: 'blob' }]]), /known: rect/);
  assert.match(outline(d), /diagram flow 5 shapes, 5 connectors/);
});

test('diagram: labels show live values, and formulas read the elements', () => {
  let d = docWith(['col',
    ['input', { name: 'total', type: 'number', value: 1200 }],
    ['diagram', { name: 'flow' }, { id: 'a', type: 'rect', text: 'Total {{total | currency}}' }, { id: 'b', type: 'rect', text: 'Plain' }, { type: 'arrow', from: 'a', to: 'b' }],
  ]);
  const flowId = resolve(d.root, 'flow')!.id;
  assert.equal((evaluate(d, world).cells[flowId].props?.texts as Record<string, string>).a, 'Total $1,200.00');
  d = applyOp(d, ['set', 'total', 'value', 50]).doc;
  assert.equal((evaluate(d, world).cells[flowId].props?.texts as Record<string, string>).a, 'Total $50.00');
  assert.equal(evalIn(d, world, read('(count-if (!= (get it "type") "arrow") flow)')).value, 2);
  assert.equal(evalIn(d, world, read('(len (filter (= (get it "type") "arrow") flow))')).value, 1);
  // Renaming the input reaches the label.
  d = applyOp(d, ['set', 'total', 'name', 'sum']).doc;
  assert.equal(elementsOf(resolve(d.root, 'flow')!.value)[0].text, 'Total {{sum | currency}}');
});

test('diagram: hit testing, duplicating and erasing several at once', () => {
  const els: DiagramEl[] = [
    { id: 'a', type: 'diamond', x: 0, y: 0, w: 100, h: 100 },
    { id: 'b', type: 'rect', x: 200, y: 0, w: 100, h: 100 },
    { id: 'l', type: 'arrow', from: 'a', to: 'b' },
  ];
  assert.equal(hitTest(els, { x: 50, y: 50 })?.id, 'a');
  // The corner of a diamond's box is outside the diamond.
  assert.equal(hitTest(els, { x: 5, y: 5 }), null);
  assert.equal(hitTest(els, { x: 150, y: 52 })?.id, 'l');
  const dup = duplicateElements(els, ['a', 'b', 'l']);
  assert.equal(dup.els.length, 6);
  const copy = dup.els.find((e) => e.id === dup.made[2])!;
  assert.deepEqual([copy.from, copy.to], [dup.made[0], dup.made[1]]);
  // Copying an arrow without its shapes gives it free ends where it was, moved over.
  const lone = duplicateElements(els, ['l']).els.at(-1)!;
  assert.equal(lone.from, undefined);
  assert.deepEqual([lone.x1, lone.y1], [128, 74]);
  assert.deepEqual(eraseElements(els, ['a']).map((e) => e.id), ['b']);
  assert.deepEqual(wrapText('Send the customer a reminder', 100, 15), ['Send the', 'customer a', 'reminder']);
});
