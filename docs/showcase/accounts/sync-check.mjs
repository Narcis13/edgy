// Sync end to end, against the real Turso database, through cloud-gate.mjs:
// two edgy servers, one account, the cloud cut off and brought back.
//
//   node docs/showcase/accounts/sync-check.mjs <server-1> <server-2> <gate> [out.txt]
//
// Both servers run in accounts mode with TURSO_URL=<gate> (see sync.sh). Each run
// signs up an account of its own (sync-<time>@edgy.test), works only in that
// account's space, and deletes it at the end: the space, its account row and the
// note that it was deleted. What it did and what it found is printed and written to out.txt.
import { writeFileSync } from 'node:fs';

const [one, two, gate, out] = process.argv.slice(2);
if (!one || !two || !gate) {
  console.error('usage: node sync-check.mjs <server-1> <server-2> <gate> [out.txt]');
  process.exit(2);
}
const lines = [];
const say = (s) => { lines.push(s); console.log(s); };
let failed = 0;
const check = (ok, what) => { say(`${ok ? 'PASS' : 'FAIL'}  ${what}`); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A browser-like client of one server: keeps its session cookie. */
function client(base, name) {
  let cookie = '';
  const call = async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }), origin: base },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set && !/Max-Age=0/.test(set)) cookie = set.split(';')[0];
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, json };
  };
  return { base, name, call, cookie: () => cookie };
}

/** Run statements in the cloud through the gate (which adds the token). */
async function cloud(stmts) {
  const res = await fetch(gate + '/v2/pipeline', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requests: [...stmts.map(([sql, ...args]) => ({ type: 'execute', stmt: { sql, args: args.map((a) => (typeof a === 'number' ? { type: 'integer', value: String(a) } : { type: 'text', value: a })) } })), { type: 'close' }] }),
  });
  const json = await res.json();
  return json.results.slice(0, stmts.length).map((r) => (r.type === 'ok' ? { rows: r.response.result.rows.map((row) => row.map((v) => v.value)), read: r.response.result.rows_read, written: r.response.result.rows_written } : { error: r.error.message }));
}

const syncNow = async (c) => (await c.call('POST', '/api/sync')).json;
/** Sync both (in this order) until neither has anything left to send. */
async function settle(...cs) {
  for (let i = 0; i < 3; i++) for (const c of cs) await syncNow(c);
}
const values = async (c, id) => (await c.call('GET', `/api/docs/${id}/read`)).json.values;
const log = async (c, id) => (await c.call('GET', `/api/docs/${id}/log?limit=500`)).json.map((e) => ({ v: e.v, ops: e.ops, by: e.actor.name, conflict: !!e.conflict }));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const A = client(one, 'one');
const B = client(two, 'two');
const email = `sync-${Date.now()}@edgy.test`;
const password = 'sync check ' + Math.random().toString(36).slice(2);
say(`# Sync, end to end, ${new Date().toISOString()}`);
say(`servers ${one} and ${two}; cloud: Turso, through the gate at ${gate}`);
say(`account ${email} (made for this run, deleted at the end)`);

// 1. The account, made on one; signed in on two.
const up = await A.call('POST', '/api/auth/signup', { email, password, name: 'Sync Check' });
check(up.status === 201, `sign up on one (${up.status})`);
const space = up.json.user.id;
await settle(A);
const st1 = await syncNow(A);
check(st1.state === 'synced' && st1.pending === 0, `one is synced: ${JSON.stringify({ state: st1.state, pending: st1.pending })}`);
const t0 = Date.now();
const inTwo = await B.call('POST', '/api/auth/signin', { email, password });
check(inTwo.status === 200, `the same account signs in on two, from the cloud (${inTwo.status}, ${Date.now() - t0} ms)`);
const docsOne = (await A.call('GET', '/api/docs')).json.map((d) => d.title).sort();
const docsTwo = (await B.call('GET', '/api/docs')).json.map((d) => d.title).sort();
check(same(docsOne, docsTwo) && docsOne.length > 0, `two finds the same documents: ${JSON.stringify(docsTwo)}`);

// 2. A document made on one appears on two; edits go both ways.
const ROOT = ['col', ['input', { name: 'qty', type: 'number', value: 1 }], ['input', { name: 'price', type: 'number', value: 10 }],
  ['formula', { name: 'total' }, ['*', '$qty', '$price']], ['text', { name: 'note' }, 'Written on one']];
const id = (await A.call('POST', '/api/docs', { title: 'Synced order', root: ROOT })).json.id;
await A.call('POST', '/api/data/orders', { record: { item: 'tea', qty: 1, paid: false } });
await settle(A, B);
check((await B.call('GET', `/api/docs/${id}`)).status === 200, `"Synced order", made on one, is on two`);
await A.call('POST', `/api/docs/${id}/ops`, { ops: [['set', 'qty', 'value', 3]] });
await settle(A, B);
check((await values(B, id)).total === 30, `an edit on one shows on two: total ${(await values(B, id)).total}`);
await B.call('POST', `/api/docs/${id}/ops`, { ops: [['set', 'price', 'value', 12]] });
await settle(B, A);
check((await values(A, id)).total === 36, `an edit on two shows on one: total ${(await values(A, id)).total}`);
const rec = (await A.call('GET', '/api/data/orders')).json[0];
check((await B.call('GET', '/api/data/orders')).json[0]?.item === 'tea', 'records travel');

// 3. The cloud is cut off. Both keep working.
await fetch(gate + '/__gate/close', { method: 'POST' });
say('-- the cloud is unreachable now --');
for (const n of [4, 5, 6]) await A.call('POST', `/api/docs/${id}/ops`, { ops: [['set', 'qty', 'value', n]] });
await A.call('POST', `/api/docs/${id}/ops`, { ops: [['remove', 'note']] });
await A.call('PATCH', `/api/data/orders/${rec.id}`, { fields: { qty: 4 } });
for (const p of [20, 25]) await B.call('POST', `/api/docs/${id}/ops`, { ops: [['set', 'price', 'value', p]] });
await B.call('POST', `/api/docs/${id}/ops`, { ops: [['set', 'qty', 'value', 9]] });
await B.call('POST', `/api/docs/${id}/ops`, { ops: [['set', 'note', 'text', 'Edited on two while one removed it']] });
await B.call('PATCH', `/api/data/orders/${rec.id}`, { fields: { paid: true } });
const off1 = await syncNow(A);
const off2 = await syncNow(B);
check(off1.state === 'offline' && off2.state === 'offline', `both say offline: one ${off1.state} (${off1.pending} waiting), two ${off2.state} (${off2.pending} waiting)`);

// 4. The cloud is back. One reaches it first, then two.
await fetch(gate + '/__gate/open', { method: 'POST' });
say('-- the cloud is back: one syncs first, then two --');
await syncNow(A);
await settle(B, A);
const s1 = await syncNow(A);
const s2 = await syncNow(B);
check(s1.state === 'synced' && s2.state === 'synced' && s1.pending === 0 && s2.pending === 0, `both synced again, nothing waiting (one ${s1.state}, two ${s2.state})`);
const docA = (await A.call('GET', `/api/docs/${id}`)).json;
const docB = (await B.call('GET', `/api/docs/${id}`)).json;
check(same(docA, docB), `the document is the same on both (version ${docA.v})`);
const logA = await log(A, id);
const logB = await log(B, id);
check(same(logA, logB), `the two op logs are the same: ${logA.length} entries each`);
const sets = (pred) => logA.filter((e) => e.ops.some(pred)).length;
check(sets((o) => o[0] === 'set' && o[2] === 'value' && [4, 5, 6, 9].includes(o[3])) === 4, 'every qty edit made offline is in the log once (4, 5, 6 on one; 9 on two)');
check(sets((o) => o[0] === 'set' && o[2] === 'value' && [20, 25].includes(o[3])) === 2, 'both price edits made offline on two are in the log once');
const v = await values(A, id);
check(v.qty === 9 && v.price === 25, `the same property edited on both: the one that reached the cloud last wins (qty ${v.qty} from two; price ${v.price})`);
const clash = logA.find((e) => e.ops.some((o) => o[3] === 'Edited on two while one removed it'));
check(clash?.conflict === true && !JSON.stringify(docA).includes('Edited on two'), 'the edit to the cell one removed is kept in the history as a conflict and changes nothing');
const ordersA = (await A.call('GET', '/api/data/orders')).json;
const ordersB = (await B.call('GET', '/api/data/orders')).json;
check(same(ordersA, ordersB) && ordersA[0].qty === 4 && ordersA[0].paid === true, `a record edited on both: both fields survive (qty ${ordersA[0]?.qty}, paid ${ordersA[0]?.paid})`);
say('');
say('the log, as both have it:');
for (const e of logA.slice(-12)) say(`  v${e.v}  ${e.by.padEnd(10)} ${JSON.stringify(e.ops).slice(0, 90)}${e.conflict ? '   (conflict: changed nothing)' : ''}`);

// 5. Row counts, both sides, and what an idle pull costs.
const [count] = await cloud([['SELECT COUNT(*) FROM edgy_log WHERE space = ?', space]]);
const local1 = logA.length;
say('');
say(`row counts: cloud edgy_log rows for this account: ${count.rows[0][0]}; "Synced order" history on one: ${local1}, on two: ${logB.length}; orders records: ${ordersA.length} and ${ordersB.length}`);
const before = (await A.call('GET', '/api/sync')).json.stats;
await sleep(6000);
const after = (await A.call('GET', '/api/sync')).json.stats;
const reqs = after.requests - before.requests;
say(`idle for 6 s: one made ${reqs} requests to the cloud, reading ${after.rowsRead - before.rowsRead} rows and writing ${after.rowsWritten - before.rowsWritten}`);
check(reqs > 0 && after.rowsRead - before.rowsRead <= reqs && after.rowsWritten === before.rowsWritten, 'an idle pull reads nothing more than its index lookup and writes nothing');
const [plan] = await cloud([['EXPLAIN QUERY PLAN SELECT seq, oid, kind, key, origin, ts, body FROM edgy_log WHERE space = ? AND seq > ? ORDER BY seq LIMIT 500', space, 0]]);
say(`a pull's query plan: ${plan.rows ? plan.rows.map((r) => r[r.length - 1]).join('; ') : plan.error}`);
check(!!plan.rows && plan.rows.some((r) => /USING (COVERING )?INDEX edgy_log_space|USING INTEGER PRIMARY KEY/.test(String(r[r.length - 1]))) && !plan.rows.some((r) => /^SCAN edgy_log$/.test(String(r[r.length - 1]))), 'a pull reads from an index, never a scan of the table');
console.log('STATS', JSON.stringify({ one: after }));

// 6. Clean up: the account goes, and with it its space in the cloud.
if (process.env.KEEP !== '1') {
  const del = await A.call('DELETE', '/api/me', { password });
  check(del.status === 200, `the account is deleted on one (${del.status})`);
  for (let i = 0; i < 20 && (await B.call('GET', '/api/me')).status === 200; i++) await sleep(1000);
  check((await B.call('GET', '/api/me')).status === 401, 'two hears that the account is gone, and signs it out');
  const [left] = await cloud([['SELECT kind FROM edgy_log WHERE space = ?', space]]);
  say(`left in the cloud for this account: ${JSON.stringify(left.rows.map((r) => r[0]))}`);
  await cloud([['DELETE FROM edgy_log WHERE space = ?', space], ['DELETE FROM edgy_accounts WHERE id = ?', space]]);
  const [gone] = await cloud([['SELECT (SELECT COUNT(*) FROM edgy_log WHERE space = ?) + (SELECT COUNT(*) FROM edgy_accounts WHERE id = ?)', space, space]]);
  check(Number(gone.rows[0][0]) === 0, 'nothing of this run is left in the cloud (the deletion note removed too)');
}
say('');
say(failed ? `${failed} FAILED` : 'all passed');
if (out) writeFileSync(out, lines.join('\n') + '\n');
process.exit(failed ? 1 : 0);
