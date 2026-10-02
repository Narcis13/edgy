import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from './app';
import { Store } from './store';
import { type Target, check, compose as composeWith, composeClaude, composeLocal, context, parseReply, suggestions, systemPrompt, validate } from './compose';
import { applyOps } from '../core/ops';
import { type Doc, type Json, type Op, type Sx, newDoc } from '../core/types';
import { print, read } from '../core/sx';
import { evalIn, evaluate, runAction } from '../core/engine';
import { indexTree } from '../core/tree';

// No test talks to the network: Claude is only "set up" where a test mocks fetch.
for (const k of ['ANTHROPIC_API_KEY', 'EDGY_AI', 'EDGY_AI_MODEL', 'EDGY_AI_BASE_URL']) delete process.env[k];

const line = (what: string, qty: number, price: number): Json => ['row',
  ['input', { type: 'text', value: what }],
  ['input', { type: 'number', value: qty }],
  ['input', { type: 'number', value: price }],
  ['formula', ['*', ['sib', 1], ['sib', 2]]]];

/** A small quote: inputs, a group of line rows, formulas, a function cell, a select and a button. */
const ROOT: Json = ['col',
  ['text', 'Quote for {{client}}'],
  ['row', ['input', { name: 'client', type: 'text', value: 'Acme' }], ['input', { name: 'date', type: 'date', value: '2026-10-01' }]],
  ['row',
    ['input', { name: 'qty', type: 'number', value: 3 }],
    ['input', { name: 'price', type: 'number', value: 40 }],
    ['input', { name: 'discount', type: 'number', value: 0 }],
    ['input', { name: 'unit-price', type: 'number', value: 12, label: 'Unit price' }]],
  ['row',
    ['input', { name: 'start', type: 'date', value: '2026-10-01' }],
    ['input', { name: 'end', type: 'date', value: '2026-10-31' }],
    ['input', { name: 'done', type: 'checkbox', value: false }],
    ['input', { name: 'apples', type: 'number', value: 5 }]],
  ['row', { style: { weight: 600 } }, ['text', 'Item'], ['text', 'Qty'], ['text', 'Price'], ['text', 'Amount']],
  ['col', { name: 'lines' }, line('Widget', 2, 10), line('Gadget', 1, 25)],
  ['formula', { name: 'subtotal' }, ['*', '$qty', '$price']],
  ['formula', { name: 'total', format: 'currency' }, ['-', '$subtotal', '$discount']],
  ['formula', { name: 'tax' }, ['fn', ['x'], ['*', '$x', 0.19]]],
  ['input', { name: 'size', type: 'select' }],
  ['button', 'Save']];

function fixture() {
  const store = new Store(':memory:');
  store.insert('quotes', { client: 'Acme', total: 120 });
  store.insert('quotes', { client: 'Beta', total: 80 });
  store.insert('feedback', { rating: 4, comment: 'fine' });
  store.insert('feedback', { rating: 5, comment: 'great' });
  store.insert('orders', { status: 'paid', total: 10 });
  store.insert('orders', { status: 'open', total: 30 });
  const doc = applyOps(newDoc('t'), [['put', 'c1', ROOT]]).doc;
  const world = { rows: (n: string) => store.rows(n), now: Date.UTC(2026, 9, 1) };
  const ctx = (target: Target = 'expr', cell?: string, current = '') =>
    context(doc, world, store.collections().map((c) => c.name), { target, cell, current });
  return { store, doc, world, ctx };
}

const { ctx } = fixture();
const compose = (target: Target, prompt: string, cell?: string, current?: string) => {
  const r = composeLocal(ctx(target, cell, current), prompt);
  return r ? print(r.expr, 1000) : null;
};

test('the built-in composer: formulas', () => {
  const cases: [string, string][] = [
    // arithmetic between cells and numbers
    ['qty times price', '(* qty price)'],
    ['the qty multiplied by the price', '(* qty price)'],
    ['qty x price', '(* qty price)'],
    ['qty * price', '(* qty price)'],
    ['price plus 10', '(+ price 10)'],
    ['subtotal minus discount', '(- subtotal discount)'],
    ['subtract discount from subtotal', '(- subtotal discount)'],
    ['total divided by 12', '(/ total 12)'],
    ['total over twelve', '(/ total 12)'],
    ['price with 19% vat', '(* price 1.19)'],
    ['price minus 10%', '(* price 0.9)'],
    ['price with discount percent off', '(* price (- 1 (/ discount 100)))'],
    ['20% of total', '(* total 0.2)'],
    ['20 percent of total plus 5', '(+ (* total 0.2) 5)'],
    ['half of price', '(/ price 2)'],
    ['double qty', '(* qty 2)'],
    ['qty squared', '(^ qty 2)'],
    ['square root of price', '(sqrt price)'],
    ['round total to 2 decimals', '(round total 2)'],
    ['unit price times qty', '(* unit-price qty)'],
    ['what is qty and price', '(+ qty price)'],
    ['tax of price', '(tax price)'],
    // aggregates
    ['sum of qty, price and discount', '(sum qty price discount)'],
    ['total of qty and price', '(sum qty price)'],
    ['average of qty price discount', '(avg qty price discount)'],
    ['biggest of qty and price', '(max qty price)'],
    ['the smallest of qty and price', '(min qty price)'],
    ['the average of qty, price and discount rounded to 2 decimals', '(round (avg qty price discount) 2)'],
    ['sum of the lines column 3', '(sum (column lines 3))'],
    ['sum of the amounts in lines', '(sum (column lines 3))'],
    ['total of the qty in lines', '(sum (column lines 1))'],
    ['count of items in lines', '(len lines)'],
    // collections
    ['number of orders', '(len (rows "orders"))'],
    ['how many quotes', '(len (rows "quotes"))'],
    ['number of orders where status is paid', '(len (where (rows "orders") "status" "paid"))'],
    ['sum of total in quotes', '(sum (column (rows "quotes") "total"))'],
    ['total of quotes', '(sum (column (rows "quotes") "total"))'],
    ['average rating in feedback', '(avg (column (rows "feedback") "rating"))'],
    ['latest 5 orders', '(take 5 (reverse (rows "orders")))'],
    ['latest quote', '(last (rows "quotes"))'],
    ['orders where status is paid', '(where (rows "orders") "status" "paid")'],
    ['orders where total is over 20', '(filter (> (get it "total") 20) (rows "orders"))'],
    ['quotes sorted by total descending', '(sort-by (get it "total") (rows "quotes") "desc")'],
    ['orders by status', '(group (rows "orders") "status")'],
    ['client of every quote', '(column (rows "quotes") "client")'],
    // conditions
    ['if total is over 100 then "big" else "small"', '(if (> total 100) "big" "small")'],
    ['if qty > 0 say yes otherwise no', '(if (> qty 0) "yes" "no")'],
    ['"big" if total is at least 100 otherwise "small"', '(if (>= total 100) "big" "small")'],
    ['if total > 100 and qty < 5 then "ok" else "no"', '(if (and (> total 100) (< qty 5)) "ok" "no")'],
    ['if total is between 5 and 100 then "mid" else "edge"', '(if (and (>= total 5) (<= total 100)) "mid" "edge")'],
    ['whether done', '(if done "yes" "no")'],
    // text
    ['hello and client', '(str "Hello " client)'],
    ['upper case of client', '(upper client)'],
    ['client in capitals', '(upper client)'],
    ['join client and date', '(str client " " date)'],
    // dates
    ['days between start and end', '(days start end)'],
    ['days until end', '(days (today) end)'],
    ['today', '(today)'],
    ['now', '(now)'],
    ['date plus 30 days', '(date+ date 30)'],
    ['30 days after date', '(date+ date 30)'],
    ['a week before end', '(date+ end -7)'],
    ['weekday of date', '(weekday date)'],
    ['year of date', '(year date)'],
    // formats
    ['total as currency', '(fmt total "currency")'],
    ['price in euros', '(fmt price "EUR")'],
    ['price as a percentage', '(fmt price "percent")'],
    ['total with 2 decimals', '(fmt total "0.00")'],
    // lists
    ['numbers from 1 to 10', '(range 1 11)'],
    ['list of qty, price and discount', '(list qty price discount)'],
    ['first of lines', '(first lines)'],
    ['last of lines', '(last lines)'],
  ];
  const wrong = cases.map(([p, want]) => [p, compose('expr', p), want]).filter(([, got, want]) => got !== want);
  assert.deepEqual(wrong, []);
  assert.equal(compose('expr', 'round it to 2 decimals', undefined, '(* qty price)'), '(round (* qty price) 2)', '"it" is the code being edited');
});

test('the built-in composer: actions, hidden, style and options', () => {
  const cases: [Target, string, string, string?][] = [
    ['do', 'add one to apples', '(set! apples (+ apples 1))'],
    ['do', 'increase apples by 2', '(set! apples (+ apples 2))'],
    ['do', 'decrease apples by 1', '(set! apples (- apples 1))'],
    ['do', 'add price to apples', '(set! apples (+ apples price))'],
    ['do', 'set qty to 5', '(set! qty 5)'],
    ['do', 'set client to "Acme Ltd"', '(set! client "Acme Ltd")'],
    ['do', 'reset qty', '(set! qty 0)'],
    ['do', 'clear client', '(set! client "")'],
    ['do', 'toggle done', '(toggle! done)'],
    ['do', 'check done', '(set! done true)'],
    ['do', 'save client and total to quotes', '(insert! "quotes" {client client total total})'],
    ['do', 'insert client, total into quotes', '(insert! "quotes" {client client total total})'],
    ['do', 'add a line', '(dup! (child lines -1))'],
    ['do', 'duplicate the last line of lines', '(dup! (child lines -1))'],
    ['do', 'remove the last line', '(remove! (child lines -1))'],
    ['do', 'clear orders', '(clear! "orders")'],
    ['do', 'delete all orders', '(clear! "orders")'],
    ['do', 'add 1 to apples and then reset qty', '(do (set! apples (+ apples 1)) (set! qty 0))'],
    ['do', 'save client and total to quotes, then clear client', '(do (insert! "quotes" {client client total total}) (set! client ""))'],
    ['hidden', 'when the discount is 0', '(= discount 0)'],
    ['hidden', 'hide if total is under 10', '(< total 10)'],
    ['hidden', 'unless done', '(not done)'],
    ['hidden', 'show only when qty is over 2', '(<= qty 2)'],
    ['hidden', 'when client is empty', '(empty? client)'],
    ['style', 'red when negative', '(if (< total 0) "bad" "ink")', 'total'],
    ['style', 'green when over 100, otherwise grey', '(if (> total 100) "live" "muted")', 'total'],
    ['style', 'when total is below 10 make it orange', '(if (< total 10) "warn" "ink")', 'total'],
    ['style', 'red background when negative', '(if (< total 0) "bad-soft" nil)', 'total'],
    ['options', 'small, medium and large', '(list "Small" "Medium" "Large")', 'size'],
    ['options', 'S/M/L', '(list "S" "M" "L")', 'size'],
    ['options', '1 to 5', '(range 1 6)', 'size'],
    ['options', 'client of quotes', '(uniq (column (rows "quotes") "client"))', 'size'],
  ];
  const wrong = cases.map(([t, p, want, cell]) => [t, p, compose(t, p, cell), want]).filter(([, , got, want]) => got !== want);
  assert.deepEqual(wrong, []);

  // A style on an unnamed cell refers to itself by id.
  const unnamed = ctx('style', 'c2');
  assert.equal(print(composeLocal(unnamed, 'red when negative')!.expr), '(if (< c2 0) "bad" "ink")');
});

test('the built-in composer explains in plain words and admits what it does not know', () => {
  assert.equal(composeLocal(ctx(), 'qty times price')!.explanation, 'Multiplies qty by price. It updates whenever qty or price changes.');
  assert.equal(composeLocal(ctx(), 'number of orders')!.explanation, 'Counts the records saved in orders. It updates when records are saved to orders.');
  assert.equal(composeLocal(ctx('do'), 'add one to apples')!.explanation, 'When clicked, it adds 1 to apples.');
  assert.equal(composeLocal(ctx('hidden'), 'when the discount is 0')!.explanation, 'Hides this cell while discount is 0. It checks again whenever discount changes.');
  assert.equal(composeLocal(ctx(), 'frobnicate the widget'), null);
  assert.equal(composeLocal(ctx('do'), 'qty times price'), null, 'a formula is not an action');
  assert.equal(composeLocal(ctx(), 'set qty to 5'), null, 'an action is not a formula');
  for (const t of ['expr', 'do', 'hidden', 'style', 'options'] as Target[]) {
    const c = ctx(t, t === 'style' ? 'total' : t === 'options' ? 'size' : undefined);
    const tips = suggestions(c);
    assert.ok(tips.length >= 3, t);
    for (const tip of tips) assert.ok(composeLocal(c, tip), `suggestion "${tip}" for ${t} should compose`);
  }
});

// ── tabs, accordions, collapsibles, data cells and diagrams ──

/** Tabs, a step counter, two accordions (one at a time, any number), a collapsible, a diagram, and a second tabs holding a button. */
const KINDS: Json = ['col',
  ['tabs', { name: 'view' }, ['panel', { title: 'Overview' }, ['text', 'Hello']], ['panel', { title: 'Details' }, ['text', 'More']]],
  ['data', { name: 'step' }, 1],
  ['accordion', { name: 'faq' }, ['panel', { title: 'Shipping' }, ['text', 'Two days']], ['panel', { title: 'Returns' }, ['text', '30 days']]],
  ['accordion', { name: 'topics', multiple: true }, ['panel', { title: 'Billing' }, ['text', 'b']], ['panel', { title: 'Account' }, ['text', 'a']]],
  ['collapsible', { name: 'more', title: 'More details' }, ['text', 'Small print']],
  ['diagram', { name: 'flow' },
    { id: 'a', type: 'rect', text: 'Order' }, { id: 'b', type: 'diamond', text: 'Paid?' }, { id: 'c', type: 'ellipse', text: 'Done' },
    { id: 'n', type: 'text', text: 'note' }, { type: 'arrow', from: 'a', to: 'b' }, { type: 'arrow', from: 'b', to: 'c' }],
  ['tabs', { name: 'admin' }, ['panel', { title: 'Details' }, ['text', 'x']], ['panel', { title: 'Log' }, ['button', { name: 'onward' }, 'Next']]],
  ['formula', { name: 'note' }, 0],
  ['button', { name: 'go' }, 'Go']];

const kindsDoc = () => applyOps(newDoc('k'), [['put', 'c1', KINDS]]).doc;
const noData = { rows: () => [], now: Date.UTC(2026, 9, 1) };
const kindsCtx = (target: Target = 'expr', cell?: string, doc = kindsDoc()) => context(doc, noData, [], { target, cell });
const composeKinds = (target: Target, prompt: string, cell?: string) => {
  const r = composeLocal(kindsCtx(target, cell), prompt);
  return r ? print(r.expr, 1000) : null;
};
/** Click: run an action from a button and apply what it changes. */
function click(doc: Doc, button: string, action: Sx): Doc {
  const id = indexTree(doc.root).byName.get(button)!.id;
  const ops = runAction(doc, noData, id, action).flatMap((e) => (e.type === 'op' ? [e.op as Op] : []));
  return applyOps(doc, ops).doc;
}
const valueOf = (doc: Doc, name: string) => evaluate(doc, noData).cells[indexTree(doc.root).byName.get(name)!.id].value;

test('the built-in composer: tabs, data cells, accordions, collapsibles and diagrams', () => {
  const cases: [Target, string, string, string?][] = [
    // tabs, matched by the panel's title even when the sentence does not name the tabs cell
    ['do', 'a button that opens the Details tab', '(set! view "Details")', 'go'],
    ['do', 'open the Details tab', '(set! view "Details")', 'go'],
    ['do', 'show details', '(set! view "Details")', 'go'],
    ['do', 'go to the "Details" tab', '(set! view "Details")'],
    ['do', 'switch to the overview tab', '(set! view "Overview")'],
    ['do', 'open Details in admin', '(set! admin "Details")'],
    ['do', 'set view to details', '(set! view "Details")'],
    ['do', 'next tab', '(set! view (cond (= view "Overview") "Details" view))'],
    // a number data cell, stepped
    ['do', 'go to the next step', '(set! step (+ step 1))'],
    ['do', 'next step', '(set! step (+ step 1))'],
    ['do', 'go back a step', '(set! step (- step 1))'],
    ['do', 'previous step', '(set! step (- step 1))'],
    ['do', 'step back', '(set! step (- step 1))'],
    ['do', 'go forward 2 steps', '(set! step (+ step 2))'],
    ['do', 'go to the next step, up to 4', '(set! step (min (+ step 1) 4))'],
    ['do', 'previous step but not below 1', '(set! step (max (- step 1) 1))'],
    ['do', 'set step to 3', '(set! step 3)'],
    ['do', 'go to step 2', '(set! step 2)'],
    ['do', 'reset step', '(set! step 1)'],
    ['do', 'increase step by 2', '(set! step (+ step 2))'],
    // accordions: one at a time takes one title, any number keeps the others open
    ['do', 'open the Shipping section', '(set! faq "Shipping")'],
    ['do', 'open the Billing section', '(set! topics (uniq (concat topics (list "Billing"))))'],
    ['do', 'close the Shipping section', '(set! faq (filter (!= it "Shipping") faq))'],
    ['do', 'close all sections', '(set! faq (list))'],
    ['do', 'close all the sections in topics', '(set! topics (list))'],
    ['do', 'open all sections', '(set! topics (list "Billing" "Account"))'],
    ['do', 'toggle the Shipping section', '(set! faq (if (includes? faq "Shipping") (filter (!= it "Shipping") faq) "Shipping"))'],
    // collapsibles, by name, by heading or by a word of the heading
    ['do', 'fold the details', '(set! more false)'],
    ['do', 'collapse more', '(set! more false)'],
    ['do', 'toggle more details', '(toggle! more)'],
    ['do', 'unfold more', '(set! more true)'],
    ['do', 'expand the details', '(set! more true)'],
    ['do', 'open the Details tab and go to the next step', '(do (set! view "Details") (set! step (+ step 1)))'],
    // diagrams
    ['expr', 'count the shapes in the flow', '(count-if (includes? (list "rect" "ellipse" "diamond") (get it "type")) flow)'],
    ['expr', 'how many shapes', '(count-if (includes? (list "rect" "ellipse" "diamond") (get it "type")) flow)'],
    ['expr', 'how many arrows', '(count-if (= (get it "type") "arrow") flow)'],
    ['expr', 'number of arrows in flow', '(count-if (= (get it "type") "arrow") flow)'],
    ['expr', 'how many elements in flow', '(len flow)'],
    ['expr', 'step times 2', '(* step 2)'],
    ['expr', 'if the Details tab is open then "yes" else "no"', '(if (= view "Details") "yes" "no")'],
    // hiding: only on a tab, a step, while something is open
    ['hidden', 'show only on the Details tab', '(!= view "Details")'],
    ['hidden', 'only when the Details tab is open', '(!= view "Details")'],
    ['hidden', 'hide on the Details tab', '(= view "Details")'],
    ['hidden', 'when view is details', '(= view "Details")'],
    ['hidden', 'hide unless step is 2', '(!= step 2)'],
    ['hidden', 'show on step 2', '(!= step 2)'],
    ['hidden', 'show when more is open', '(not more)'],
    ['hidden', 'when more is folded', '(not more)'],
    ['hidden', 'show when the Shipping section is open', '(not (includes? faq "Shipping"))'],
    ['hidden', 'when the Billing section is not open', '(not (includes? topics "Billing"))'],
  ];
  const wrong = cases.map(([t, p, want, cell]) => [t, p, composeKinds(t, p, cell), want]).filter(([, , got, want]) => got !== want);
  assert.deepEqual(wrong, []);

  // Two tabs have a Details panel: the one holding the button wins, else the first in the document.
  assert.equal(composeKinds('do', 'open the Details tab', 'onward'), '(set! admin "Details")');
  assert.equal(composeKinds('do', 'next tab', 'onward'), '(set! admin (cond (= admin "Details") "Log" admin))');
  // Nothing to match: no guessing.
  assert.equal(composeKinds('do', 'open the Pricing tab'), null);
  assert.equal(composeKinds('expr', 'how many lines'), null, '"lines" names other things too, so the diagram must be named');
  assert.equal(composeKinds('do', 'reset note'), null, 'a formula is not something a button sets');
});

test('composed actions and conditions on the new kinds do what was asked', () => {
  const act = (doc: Doc, prompt: string) => {
    const r = composeLocal(kindsCtx('do', 'go', doc), prompt);
    assert.ok(r, prompt);
    return click(doc, 'go', r.expr);
  };
  const cond = (doc: Doc, target: Target, prompt: string) => {
    const r = composeLocal(kindsCtx(target, 'note', doc), prompt);
    assert.ok(r, prompt);
    return evalIn(doc, noData, r.expr).value;
  };
  let doc = kindsDoc();
  assert.equal(valueOf(doc, 'view'), 'Overview');
  assert.equal(cond(doc, 'hidden', 'show only on the Details tab'), true, 'hidden while Overview is open');
  doc = act(doc, 'a button that opens the Details tab');
  assert.equal(valueOf(doc, 'view'), 'Details');
  assert.equal(cond(doc, 'hidden', 'show only on the Details tab'), false, 'shown on Details');
  doc = act(doc, 'previous tab');
  assert.equal(valueOf(doc, 'view'), 'Overview');

  doc = act(doc, 'go to the next step');
  assert.equal(valueOf(doc, 'step'), 2);
  assert.equal(cond(doc, 'hidden', 'show on step 2'), false);
  doc = act(doc, 'go to the next step, up to 2');
  assert.equal(valueOf(doc, 'step'), 2, 'clamped');
  doc = act(doc, 'go back a step');
  assert.equal(valueOf(doc, 'step'), 1);
  assert.equal(cond(doc, 'hidden', 'hide unless step is 2'), true);
  doc = act(doc, 'set step to 3');
  assert.equal(valueOf(doc, 'step'), 3);
  doc = act(doc, 'reset step');
  assert.equal(valueOf(doc, 'step'), 1);

  doc = act(doc, 'open the Shipping section');
  assert.deepEqual(valueOf(doc, 'faq'), ['Shipping']);
  assert.equal(cond(doc, 'hidden', 'show when the Shipping section is open'), false);
  doc = act(doc, 'open the Returns section');
  assert.deepEqual(valueOf(doc, 'faq'), ['Returns'], 'one at a time');
  doc = act(doc, 'close all sections');
  assert.deepEqual(valueOf(doc, 'faq'), []);
  assert.equal(cond(doc, 'hidden', 'show when the Shipping section is open'), true);
  doc = act(doc, 'open the Billing section');
  doc = act(doc, 'open the Account section');
  doc = act(doc, 'open the Billing section');
  assert.deepEqual(valueOf(doc, 'topics'), ['Billing', 'Account'], 'any number, no repeats');
  doc = act(doc, 'toggle the Billing section');
  assert.deepEqual(valueOf(doc, 'topics'), ['Account']);

  assert.equal(valueOf(doc, 'more'), true, 'a collapsible starts open');
  assert.equal(cond(doc, 'hidden', 'show when more is open'), false);
  doc = act(doc, 'fold the details');
  assert.equal(valueOf(doc, 'more'), false);
  assert.equal(cond(doc, 'hidden', 'show when more is open'), true);
  doc = act(doc, 'toggle more details');
  assert.equal(valueOf(doc, 'more'), true);
  doc = act(doc, 'collapse more');
  doc = act(doc, 'unfold more');
  assert.equal(valueOf(doc, 'more'), true);

  assert.equal(cond(doc, 'expr', 'how many shapes'), 3);
  assert.equal(cond(doc, 'expr', 'how many arrows'), 2);
  assert.equal(cond(doc, 'expr', 'number of boxes in flow'), 4, 'boxes count text too');
});

test('the new kinds are explained in their own words and suggested', () => {
  const why = (t: Target, p: string, cell?: string) => composeLocal(kindsCtx(t, cell), p)!.explanation;
  assert.equal(why('do', 'open the Details tab'), 'When clicked, it opens the Details tab of view.');
  assert.equal(why('do', 'open the Billing section'), 'When clicked, it opens the Billing section of topics.');
  assert.equal(why('do', 'close all sections'), 'When clicked, it closes every section of faq.');
  assert.equal(why('do', 'fold the details'), 'When clicked, it folds more.');
  assert.equal(why('do', 'toggle more'), 'When clicked, it folds or unfolds more.');
  assert.equal(why('do', 'go to the next step'), 'When clicked, it adds 1 to step.');
  assert.equal(why('expr', 'how many arrows'), 'Counts the arrows in flow. It updates whenever flow changes.');
  assert.equal(why('hidden', 'show when the Shipping section is open', 'note'), 'Hides this cell while faq does not include "Shipping". It checks again whenever faq changes.');
  for (const t of ['expr', 'do', 'hidden'] as Target[]) {
    const c = kindsCtx(t);
    const tips = suggestions(c);
    assert.ok(tips.length >= 3, t);
    for (const tip of tips) assert.ok(composeLocal(c, tip), `suggestion "${tip}" for ${t} should compose`);
  }
  assert.ok(suggestions(kindsCtx('do')).includes('open the Details tab'));
  assert.ok(suggestions(kindsCtx('do')).includes('go to the next step'));
  assert.ok(suggestions(kindsCtx('hidden')).includes('show only on the Details tab'));
  assert.ok(suggestions(kindsCtx('expr')).includes('how many shapes in flow'));
});

test('validation rejects unknown functions and names, and actions outside a button', () => {
  const ok = (target: Target, src: string) => check(ctx(target), read(src), target);
  ok('expr', '(* qty price)');
  ok('expr', '(let (n 2) (* n qty))');
  ok('expr', '(map (fn (x) (* x 2)) (list qty price))');
  ok('expr', '(sum-by (get it "total") (rows "quotes"))');
  ok('expr', '(tax price)');
  ok('expr', '(* c2 2)');
  ok('do', '(do (set! qty 1) (dup! (child lines -1)) (insert! "quotes" {qty qty}))');
  assert.throws(() => ok('expr', '(frobnicate qty)'), /unknown function frobnicate/);
  assert.throws(() => ok('expr', '(* qty prise)'), /no cell called "prise"; did you mean price/);
  assert.throws(() => ok('expr', '(qty 2)'), /qty is a cell, not a function/);
  assert.throws(() => ok('expr', '(set! qty 5)'), /set! changes the document/);
  assert.throws(() => ok('hidden', '(clear! "orders")'), /clear! changes the document/);
  assert.throws(() => ok('do', '(set! nope 1)'), /no cell called "nope"/);
  assert.throws(() => ok('do', '(dup! (child nope -1))'), /no cell called "nope"/);
  assert.equal(print(validate(ctx(), '```lisp\n(+ qty 1)\n```', 'expr')), '(+ qty 1)');
  assert.deepEqual(validate(ctx(), ['+', '$qty', 1], 'expr'), ['+', '$qty', 1], 'the JSON form is accepted too');
  assert.throws(() => validate(ctx(), '(+ qty', 'expr'), /missing \)/);
  assert.throws(() => validate(ctx(), '   ', 'expr'), /empty/);
});

test('a reply from Claude is split into code and explanation', () => {
  assert.deepEqual(parseReply('```lisp\n(* qty price)\n```\nExplanation: Multiplies qty by price.'), { code: '(* qty price)', explanation: 'Multiplies qty by price.' });
  assert.deepEqual(parseReply('(+ a 1)\nExplanation: Adds one.'), { code: '(+ a 1)', explanation: 'Adds one.' });
  const sys = systemPrompt(ctx('expr', 'total', '(- subtotal discount)'));
  assert.match(sys, /\(sum-by \(get it "total"\) rows\)/, 'the language comes from the reference');
  assert.match(sys, /input:number qty = 3/, 'the outline of the document');
  assert.match(sys, /"quotes" with fields client, total/);
  assert.match(sys, /named total \(a formula\)/);
  assert.match(sys, /Current code: \(- subtotal discount\)/);
  assert.doesNotMatch(sys, /What these cells hold/, 'no notes for kinds the document does not have');

  const kinds = systemPrompt(kindsCtx('do', 'go'));
  assert.match(kinds, /tabs \(view\): its value is the open tab's title\. Read it with \(= view "Details"\); a button opens a tab with \(set! view "Details"\)/);
  assert.match(kinds, /accordion \(faq\): .*\(includes\? faq "Shipping"\).*\(set! faq "Shipping"\) opens just that one.*\(set! faq \(list\)\)/);
  assert.match(kinds, /collapsible \(more\): its value is true while open.*\(toggle! more\)/);
  assert.match(kinds, /data \(step\): .*\(set! step \(\+ step 1\)\)/);
  assert.match(kinds, /diagram \(flow\): .*\(count-if \(includes\? \(list "rect" "ellipse" "diamond"\) \(get it "type"\)\) flow\).*\(count-if \(= \(get it "type"\) "arrow"\) flow\)/);
  assert.match(kinds, /c2 tabs view 2 tabs, open "Overview"/, 'the outline shows the panels');
});

// ── over HTTP ──

function api() {
  const store = new Store(':memory:');
  const { app } = createApp(store, join(mkdtempSync(join(tmpdir(), 'edgy-')), 'assets'));
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await app.request(path, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json()) as any };
  };
  return { call, store };
}

async function quoteDoc(call: ReturnType<typeof api>['call']) {
  await call('POST', '/api/data/quotes', { record: { client: 'Acme', total: 120 } });
  return (await call('POST', '/api/docs', { title: 'Quote', root: ROOT })).json as { id: string };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('compose with the built-in composer over HTTP', async () => {
  const { call } = api();
  const doc = await quoteDoc(call);
  const r = await call('POST', `/api/docs/${doc.id}/compose`, { prompt: 'qty times price', cell: 'total' });
  assert.equal(r.status, 200);
  assert.equal(r.json.provider, 'local');
  assert.equal(r.json.code, '(* qty price)');
  assert.deepEqual(r.json.expr, ['*', '$qty', '$price']);
  assert.match(r.json.explanation, /^Multiplies qty by price\./);
  assert.deepEqual(r.json.preview, { value: 120, display: '$120.00' }, 'previewed with the cell\'s own format');

  const act = await call('POST', `/api/docs/${doc.id}/compose`, { prompt: 'save client and total to quotes', target: 'do', provider: 'local' });
  assert.equal(act.json.code, '(insert! "quotes" {client client total total})');
  assert.equal(act.json.preview, undefined, 'actions are not run for a preview');

  const broken = await call('POST', `/api/docs/${doc.id}/compose`, { prompt: 'total divided by discount' });
  assert.equal(broken.status, 200);
  assert.match(broken.json.preview.error, /division by zero/, 'an evaluation error is reported, not fatal');

  const lost = await call('POST', `/api/docs/${doc.id}/compose`, { prompt: 'make it sparkle like the sea' });
  assert.equal(lost.status, 422);
  assert.ok(lost.json.suggestions.length >= 3);
  assert.ok(lost.json.suggestions.some((s: string) => s.includes('qty')), 'suggestions use the document\'s names');

  assert.equal((await call('POST', `/api/docs/${doc.id}/compose`, { prompt: '' })).status, 400);
  assert.equal((await call('POST', `/api/docs/${doc.id}/compose`, { prompt: 'x', target: 'nope' })).status, 400);
  assert.equal((await call('POST', `/api/docs/${doc.id}/compose`, { prompt: 'x', cell: 'nope' })).status, 400);
  assert.equal((await call('POST', '/api/docs/nope/compose', { prompt: 'x' })).status, 404);
});

test('GET /api/ai says which providers are available', async () => {
  const { call } = api();
  const doc = await quoteDoc(call);
  assert.deepEqual((await call('GET', '/api/ai')).json, { providers: { claude: false, agent: false, local: true }, model: null });
  const waiting = call('GET', `/api/docs/${doc.id}/messages/wait?timeout=1`);
  await sleep(10);
  assert.equal((await call('GET', `/api/ai?doc=${doc.id}`)).json.providers.agent, true);
  assert.equal((await call('GET', '/api/ai?doc=other')).json.providers.agent, false);
  await waiting;
  assert.equal((await call('GET', '/api/ai')).json.providers.agent, true, 'an agent counts as present for a while after listening');
  process.env.ANTHROPIC_API_KEY = 'test-key';
  try {
    assert.deepEqual((await call('GET', '/api/ai')).json.model, 'claude-sonnet-5-5');
    process.env.EDGY_AI = 'off';
    assert.equal((await call('GET', '/api/ai')).json.providers.claude, false);
  } finally {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.EDGY_AI;
  }
});

test('an agent answers a compose request', async () => {
  const { call } = api();
  const doc = await quoteDoc(call);

  // Nobody listening: the built-in composer answers and says so.
  const alone = await call('POST', `/api/docs/${doc.id}/compose`, { prompt: 'qty times price', provider: 'agent' });
  assert.equal(alone.json.provider, 'local');
  assert.match(alone.json.notes[0], /No agent is listening/);

  const listening = call('GET', `/api/docs/${doc.id}/messages/wait?timeout=5&agent=Claude`);
  await sleep(20);
  const composing = call('POST', `/api/docs/${doc.id}/compose`, { prompt: 'what the quote costs', cell: 'total', current: '(- subtotal discount)' });
  const heard = (await listening).json;
  assert.deepEqual(heard.messages, []);
  assert.equal(heard.requests.length, 1);
  const req = heard.requests[0];
  assert.equal(req.prompt, 'what the quote costs');
  assert.equal(req.cellName, 'total');
  assert.equal(req.target, 'expr');
  assert.equal(req.current, '(- subtotal discount)');
  assert.deepEqual((await call('GET', `/api/docs/${doc.id}/messages/wait?timeout=1`)).json.requests, [], 'a request is handed out once');

  const unknown = await call('POST', `/api/docs/${doc.id}/compose/${req.id}`, { code: '(frobnicate qty)' });
  assert.equal(unknown.status, 422);
  assert.match(unknown.json.error, /unknown function frobnicate/);
  const action = await call('POST', `/api/docs/${doc.id}/compose/${req.id}`, { code: '(set! qty 1)' });
  assert.equal(action.status, 422);
  const ok = await call('POST', `/api/docs/${doc.id}/compose/${req.id}`, { code: '(* qty price)', explanation: 'Multiplies qty by price.', actor: { name: 'Claude' } });
  assert.deepEqual(ok.json, { ok: true });

  const r = (await composing).json;
  assert.equal(r.provider, 'agent');
  assert.equal(r.code, '(* qty price)');
  assert.equal(r.explanation, 'Multiplies qty by price.');
  assert.equal(r.preview.value, 120);
  assert.equal((await call('POST', `/api/docs/${doc.id}/compose/${req.id}`, { code: '1' })).status, 404, 'answered requests are gone');
});

test('a person\'s message still wakes a listening agent', async () => {
  const { call } = api();
  const doc = await quoteDoc(call);
  const listening = call('GET', `/api/docs/${doc.id}/messages/wait?timeout=5`);
  await sleep(20);
  await call('POST', `/api/docs/${doc.id}/messages`, { text: 'hi', actor: { kind: 'human', name: 'You' } });
  const got = (await listening).json;
  assert.equal(got.messages[0].text, 'hi');
  assert.deepEqual(got.requests, []);
});

function mockClaude(replies: (string | { status: number; body: unknown })[]) {
  const calls: { url: string; headers: Record<string, string>; body: any }[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
    const next = replies.shift() ?? '';
    const [status, body] = typeof next === 'string'
      ? [200, { type: 'message', role: 'assistant', content: [{ type: 'text', text: next }], stop_reason: 'end_turn' }]
      : [next.status, next.body];
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  return {
    calls,
    restore() {
      globalThis.fetch = real;
      delete process.env.ANTHROPIC_API_KEY;
    },
  };
}

test('Claude composes, and gets one retry when its code does not fit', async () => {
  const mock = mockClaude([
    '```lisp\n(* qty prise)\n```\nExplanation: Multiplies.',
    '```lisp\n(* qty price)\n```\nExplanation: Multiplies qty by price.',
  ]);
  try {
    const { call } = api();
    const doc = await quoteDoc(call);
    const r = await call('POST', `/api/docs/${doc.id}/compose`, { prompt: 'the quantity times the price', cell: 'total' });
    assert.equal(r.status, 200);
    assert.equal(r.json.provider, 'claude');
    assert.equal(r.json.code, '(* qty price)');
    assert.equal(r.json.explanation, 'Multiplies qty by price.');
    assert.equal(mock.calls.length, 2);
    const [first, second] = mock.calls;
    assert.equal(first.url, 'https://api.anthropic.com/v1/messages');
    assert.equal(first.headers['x-api-key'], 'test-key');
    assert.equal(first.headers['anthropic-version'], '2023-06-01');
    assert.equal(first.body.model, 'claude-sonnet-5-5');
    assert.ok(first.body.max_tokens <= 600);
    assert.match(first.body.system, /input:number qty = 3/);
    assert.deepEqual(first.body.messages, [{ role: 'user', content: 'the quantity times the price' }]);
    assert.equal(second.body.messages.length, 3);
    assert.match(second.body.messages[2].content, /did you mean price/);
  } finally {
    mock.restore();
  }
});

test('when Claude fails, the built-in composer answers with a note', async () => {
  const mock = mockClaude([{ status: 529, body: { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } } }]);
  try {
    const { call } = api();
    const doc = await quoteDoc(call);
    const r = await call('POST', `/api/docs/${doc.id}/compose`, { prompt: 'qty times price' });
    assert.equal(r.json.provider, 'local');
    assert.equal(r.json.code, '(* qty price)');
    assert.match(r.json.notes[0], /Claude could not answer: Overloaded/);
  } finally {
    mock.restore();
  }
});

const CFG = { key: 'k', model: 'claude-sonnet-5-5', base: 'https://api.anthropic.com' };

test('Claude opens a tab and steps a counter, told how these kinds work', async () => {
  const mock = mockClaude([
    '```lisp\n(do (set! view "Details") (set! step (+ step 1)))\n```\nExplanation: Opens the Details tab and moves to the next step.',
  ]);
  try {
    const c = kindsCtx('do', 'go');
    const a = await composeClaude(c, 'open the details tab and go to the next step', CFG);
    assert.equal(print(a.expr, 1000), '(do (set! view "Details") (set! step (+ step 1)))');
    assert.equal(a.explanation, 'Opens the Details tab and moves to the next step.');
    assert.match(mock.calls[0].body.system, /a button opens a tab with \(set! view "Details"\)/);
    assert.match(mock.calls[0].body.system, /data \(step\)/);
    const doc = click(c.doc, 'go', a.expr);
    assert.equal(valueOf(doc, 'view'), 'Details');
    assert.equal(valueOf(doc, 'step'), 2);
  } finally {
    mock.restore();
  }
});

test('Claude hides a cell by an accordion, retried when the title is wrong, and counts a diagram', async () => {
  const mock = mockClaude([
    // Not a title in the document and not a cell: the retry says why.
    '```lisp\n(not (includes? faq shipping))\n```\nExplanation: Hides it.',
    '```lisp\n(not (includes? faq "Shipping"))\n```\nExplanation: Hidden unless the Shipping section is open.',
    '```lisp\n(count-if (= (get it "type") "arrow") flow)\n```\nExplanation: Counts the arrows in flow.',
  ]);
  try {
    let doc = kindsDoc();
    const hidden = await composeWith(kindsCtx('hidden', 'note', doc), 'show when the shipping section is open', { claude: CFG, agent: null });
    assert.equal(hidden.provider, 'claude');
    assert.equal(hidden.code, '(not (includes? faq "Shipping"))');
    assert.match(mock.calls[1].body.messages[2].content, /no cell called "shipping"/);
    assert.equal(hidden.preview?.value, true, 'hidden while every section is closed');
    doc = click(doc, 'go', ['set!', 'faq', 'Shipping']);
    assert.equal(evalIn(doc, noData, hidden.expr).value, false, 'shown once Shipping is open');

    const arrows = await composeWith(kindsCtx('expr', 'note', doc), 'how many arrows', { claude: CFG, agent: null });
    assert.equal(arrows.code, '(count-if (= (get it "type") "arrow") flow)');
    assert.equal(arrows.preview?.value, 2);
    assert.match(mock.calls[2].body.system, /diagram \(flow\): its value is the list of its elements/);
  } finally {
    mock.restore();
  }
});

test('composeClaude gives up after two answers that do not fit', async () => {
  const mock = mockClaude(['(nope 1)', '(nope 2)']);
  try {
    const c = ctx();
    await assert.rejects(composeClaude(c, 'anything', { key: 'k', model: 'claude-sonnet-5-5', base: 'https://api.anthropic.com' }), /unknown function nope/);
    assert.equal(mock.calls.length, 2);
  } finally {
    mock.restore();
  }
});

test('tabs and sections are not lines of a form, and a title starting with $ stays text', () => {
  // A named tabs cell before the invoice lines must not be taken for them.
  const doc = applyOps(newDoc('t'), [['put', 'c1', ['col',
    ['tabs', { name: 'view' }, ['panel', { title: '$ Pricing' }, ['text', 'p']], ['panel', { title: 'Terms' }, ['text', 't']]],
    ['col', { name: 'lines' }, line('Widget', 2, 10), line('Gadget', 1, 25)],
    ['button', { name: 'go' }, 'Go']]]]).doc;
  const c = (target: Target) => context(doc, noData, [], { target, cell: 'go' });
  assert.equal(print(composeLocal(c('do'), 'add a line')!.expr), '(dup! (child lines -1))');
  // Written as a cell reference, "$ Pricing" would look for a cell called " Pricing".
  const reset = composeLocal(c('do'), 'reset view')!;
  assert.deepEqual(reset.expr, ['set!', 'view', ['quote', '$ Pricing']]);
  const next = composeLocal(c('do'), 'next tab')!;
  const moved = click(doc, 'go', next.expr);
  assert.equal(valueOf(moved, 'view'), 'Terms');
  assert.equal(valueOf(click(moved, 'go', reset.expr), 'view'), '$ Pricing');
});
