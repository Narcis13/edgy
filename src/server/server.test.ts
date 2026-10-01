import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from './app';
import { Store } from './store';
import { TEMPLATES, tour } from '../core/templates';
import { applyOp } from '../core/ops';
import { evaluate } from '../core/engine';
import { newDoc } from '../core/types';
import { leaves } from '../core/tree';

function api() {
  const { app, hub } = createApp(new Store(':memory:'), join(mkdtempSync(join(tmpdir(), 'edgy-')), 'assets'));
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await app.request(path, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json()) as any };
  };
  return { call, hub };
}

test('templates build and evaluate without errors', () => {
  for (const t of [...TEMPLATES, tour]) {
    const doc = applyOp(newDoc('t'), ['put', 'c1', t.root]).doc;
    const computed = evaluate(doc, { rows: () => [], now: Date.now() });
    const errors = leaves(doc.root).filter((c) => computed.cells[c.id].error).map((c) => `${c.name ?? c.id}: ${computed.cells[c.id].error}`);
    assert.deepEqual(errors, [], t.id);
  }
});

test('a first run seeds the tour', async () => {
  const { call } = api();
  const docs = (await call('GET', '/api/docs')).json;
  assert.equal(docs.length, 1);
  assert.equal(docs[0].title, 'Start here');
});

test('an agent builds a document and reads the result', async () => {
  const { call, hub } = api();
  const doc = (await call('POST', '/api/docs', { title: 'Trip' })).json;
  const seen: string[] = [];
  hub.subscribe(doc.id, (e) => seen.push(e.type));

  const r = await call('POST', `/api/docs/${doc.id}/ops`, {
    actor: { kind: 'agent', name: 'Claude' },
    ops: [['put', 'c1', ['col',
      ['input', { name: 'nights', type: 'number', value: 3 }],
      ['input', { name: 'rate', type: 'number', value: 120 }],
      ['formula', { name: 'stay', format: 'currency' }, ['*', '$nights', '$rate']]]]],
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.v, 1);
  assert.equal(r.json.values.stay, 360);
  assert.match(r.json.outline, /formula stay = \(\* nights rate\) → 360/);
  assert.deepEqual(seen, ['ops']);

  const bad = await call('POST', `/api/docs/${doc.id}/ops`, { ops: [['set', 'nights', 'value', 5], ['remove', 'nope']] });
  assert.equal(bad.status, 422);
  assert.match(bad.json.error, /no cell called "nope"/);
  assert.equal((await call('GET', `/api/docs/${doc.id}/read`)).json.values.nights, 3, 'a failed batch changes nothing');

  const ev = await call('POST', `/api/docs/${doc.id}/eval`, { src: '(+ stay 40)' });
  assert.equal(ev.json.value, 400);

  const log = (await call('GET', `/api/docs/${doc.id}/log`)).json;
  assert.equal(log.length, 1);
  assert.equal(log[0].actor.name, 'Claude');
});

test('collections feed formulas', async () => {
  const { call } = api();
  const doc = (await call('POST', '/api/docs', { root: ['formula', { name: 'n' }, ['sum', ['column', ['rows', 'orders'], 'total']]] })).json;
  await call('POST', '/api/data/orders', { record: { total: 10 } });
  await call('POST', '/api/data/orders', { record: { total: 32 } });
  assert.equal((await call('GET', `/api/docs/${doc.id}/read`)).json.values.n, 42);
  assert.deepEqual((await call('GET', '/api/data')).json.map((c: any) => [c.name, c.count]), [['orders', 2]]);
});

test('an agent waiting for a message gets it', async () => {
  const { call } = api();
  const doc = (await call('POST', '/api/docs', {})).json;
  const waiting = call('GET', `/api/docs/${doc.id}/messages/wait?timeout=5&agent=Claude`);
  await new Promise((r) => setTimeout(r, 20));
  await call('POST', `/api/docs/${doc.id}/messages`, { text: 'Add a total row', actor: { kind: 'human', name: 'You' } });
  const got = (await waiting).json;
  assert.equal(got.messages[0].text, 'Add a total row');
});

test('a saved record can be changed in place', async () => {
  const { call } = api();
  const made = (await call('POST', '/api/data/invoices', { record: { client: 'Acme', status: 'Due', total: 120 } })).json;
  const changed = await call('PATCH', `/api/data/invoices/${made.id}`, { fields: { status: 'Paid', id: 'nope', at: 1 } });
  assert.equal(changed.status, 200);
  assert.deepEqual(changed.json, { client: 'Acme', status: 'Paid', total: 120, id: made.id, at: made.at });
  assert.deepEqual((await call('GET', '/api/data/invoices')).json, [changed.json]);
  assert.equal((await call('PATCH', '/api/data/invoices/rmissing', { fields: { a: 1 } })).status, 404);
  assert.equal((await call('PATCH', `/api/data/invoices/${made.id}`, { fields: [1] })).status, 400);
});

test('a template seeds its sample records once, and its tables read them', async () => {
  const { call } = api();
  const doc = (await call('POST', '/api/docs', { template: 'tables' })).json;
  const rows = (await call('GET', '/api/data/studio-invoices')).json;
  assert.equal(rows.length, 10);
  await call('POST', '/api/docs', { template: 'tables' });
  assert.equal((await call('GET', '/api/data/studio-invoices')).json.length, 10);
  const read = (await call('GET', `/api/docs/${doc.id}/read`)).json;
  assert.deepEqual(read.errors, {});
  assert.equal(read.values.billed, 42000);
  assert.equal(read.values.owed, 42000 - 4200 - 7800 - 3800);
  assert.equal(read.values.picked, 0);
  // Picking two invoices totals them.
  const ids = rows.filter((r: any) => r.client === 'Kite Bikes').map((r: any) => r.id);
  await call('POST', `/api/docs/${doc.id}/ops`, { ops: [['set', 'invoices', 'selected', ids]] });
  assert.equal((await call('GET', `/api/docs/${doc.id}/read`)).json.values.picked, 5400 + 3800);
});
