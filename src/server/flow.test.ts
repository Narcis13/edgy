import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from './app';
import { Store } from './store';

/** An installation in accounts mode, and a way to call it as someone. */
function server() {
  const store = new Store(':memory:');
  const made = createApp(store, join(mkdtempSync(join(tmpdir(), 'edgy-')), 'assets'), undefined, { auth: 'accounts' });
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await made.app.request(path, {
      method,
      headers: { ...headers, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, json };
  };
  return { ...made, store, call };
}

/** Sign up and return the cookie header, and an API key header for an agent acting for them. */
async function people(s: ReturnType<typeof server>) {
  const up = async (email: string, name: string) => {
    const res = await s.app.request('/api/auth/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'correct horse', name }) });
    assert.equal(res.status, 201);
    const cookie = /edgy_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')![1];
    return { cookie: `edgy_session=${cookie}` };
  };
  const ana = await up('ana@example.test', 'Ana');
  const ben = await up('ben@example.test', 'Ben');
  const made = await s.call('POST', '/api/me/keys', { name: 'Claude' }, ana);
  const claude = { authorization: `Bearer ${made.json.key as string}` };
  return { ana, ben, claude };
}

test('Flow: posting reads quick-add, the author is who asked, everything comes back in one answer', async () => {
  const s = server();
  const { ana, claude } = await people(s);
  const r = await s.call('POST', '/api/flow', { text: 'Call Ben tomorrow 3pm-4pm #sales !!\nAsk about the Q4 numbers' }, ana);
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.equal(r.json.kind, 'event');
  assert.equal(r.json.text, 'Call Ben');
  assert.equal(r.json.body, 'Ask about the Q4 numbers');
  assert.deepEqual(r.json.tags, ['sales']);
  assert.equal(r.json.priority, 2);
  assert.match(r.json.start, /T15:00$/);
  assert.match(r.json.end, /T16:00$/);
  assert.deepEqual(r.json.by, { kind: 'human', name: 'Ana', id: r.json.by.id, color: r.json.by.color });
  assert.ok(r.json.updated > 0 && r.json.order > 0);

  const t = await s.call('POST', '/api/flow', { text: 'Write the report', kind: 'task', due: '2026-10-20' }, ana);
  assert.equal(t.json.kind, 'task');
  assert.equal(t.json.status, 'Inbox', 'a task starts in the first column');
  assert.equal(t.json.due, '2026-10-20');

  const plain = await s.call('POST', '/api/flow', { text: 'Launch oct 20', plain: true }, ana);
  assert.equal(plain.json.text, 'Launch oct 20', 'plain keeps the text as typed');
  assert.equal(plain.json.kind, 'note');
  assert.equal(plain.json.due, null);

  const a = await s.call('POST', '/api/flow', { text: 'The numbers look good', actor: { name: 'Claude' } }, claude);
  assert.equal(a.status, 201);
  assert.deepEqual(a.json.by, { kind: 'agent', name: 'Claude', id: r.json.by.id, for: 'Ana' });

  assert.equal((await s.call('POST', '/api/flow', { text: '   ' }, ana)).status, 400);
  assert.equal((await s.call('POST', '/api/flow', { text: 'x', kind: 'wish' }, ana)).status, 400);
  assert.equal((await s.call('POST', '/api/flow', { text: 'x', due: 'tomorrow' }, ana)).status, 400);
  assert.equal((await s.call('POST', '/api/flow', { text: 'x', doc: 'nope' }, ana)).status, 400);

  const all = (await s.call('GET', '/api/flow', undefined, ana)).json;
  assert.equal(all.items.length, 4);
  assert.deepEqual(all.board.columns, ['Inbox', 'Doing', 'Done']);
  assert.deepEqual(all.comments, []);
  assert.equal(all.me.name, 'Ana');
  assert.equal((await s.call('GET', '/api/flow', undefined, claude)).json.me.kind, 'agent');
  // They are records like any other: the Data page and (rows "flow") see them.
  assert.deepEqual((await s.call('GET', '/api/data', undefined, ana)).json.map((c: any) => c.name), ['flow']);
  assert.equal((await s.call('GET', '/api/data/flow', undefined, ana)).json.length, 4);
});

test('Flow: columns and done agree; the board is editable; an attached document must be one you can open', async () => {
  const s = server();
  const { ana, ben } = await people(s);
  const t = (await s.call('POST', '/api/flow', { text: 'todo Ship it' }, ana)).json;
  let r = await s.call('PATCH', `/api/flow/${t.id}`, { status: 'Done' }, ana);
  assert.equal(r.json.done, true, 'into the last column means done');
  assert.ok(r.json.doneAt > 0);
  r = await s.call('PATCH', `/api/flow/${t.id}`, { status: 'Doing' }, ana);
  assert.equal(r.json.done, false, 'out of it means not done');
  assert.equal(r.json.doneAt, null);
  r = await s.call('PATCH', `/api/flow/${t.id}`, { done: true }, ana);
  assert.equal(r.json.status, 'Done', 'done means the last column');
  r = await s.call('PATCH', `/api/flow/${t.id}`, { done: false }, ana);
  assert.equal(r.json.status, 'Inbox');
  assert.equal((await s.call('PATCH', `/api/flow/${t.id}`, { status: 'Nowhere' }, ana)).status, 400);
  assert.equal((await s.call('PATCH', `/api/flow/${t.id}`, { priority: 7 }, ana)).status, 400);
  r = await s.call('PATCH', `/api/flow/${t.id}`, { tags: ['#Sales', 'Q4 plan', ''], priority: 1, pinned: true, order: 5 }, ana);
  assert.deepEqual(r.json.tags, ['sales', 'q4plan']);
  assert.equal(r.json.priority, 1);
  assert.equal(r.json.pinned, true);
  assert.equal(r.json.order, 5);
  // A note made a task lands in the first column; made a note again it leaves the board.
  const n = (await s.call('POST', '/api/flow', { text: 'An idea' }, ana)).json;
  assert.equal((await s.call('PATCH', `/api/flow/${n.id}`, { kind: 'task' }, ana)).json.status, 'Inbox');

  // The board: columns change; cards of a column that went start again; the new last column means done.
  assert.equal((await s.call('PUT', '/api/flow/board', { columns: ['Only'] }, ana)).status, 400);
  const b = await s.call('PUT', '/api/flow/board', { columns: ['Backlog', 'Doing', 'Review', 'Shipped'] }, ana);
  assert.deepEqual(b.json.columns, ['Backlog', 'Doing', 'Review', 'Shipped']);
  const after = (await s.call('GET', '/api/flow', undefined, ana)).json;
  assert.equal(after.items.find((i: any) => i.id === t.id).status, 'Backlog', 'Inbox went, so the card starts again');
  await s.call('PUT', '/api/flow/board', { columns: ['Todo', 'Doing', 'Review', 'Shipped'], rename: { from: 'Backlog', to: 'Todo' } }, ana);
  assert.equal((await s.call('GET', '/api/flow', undefined, ana)).json.items.find((i: any) => i.id === t.id).status, 'Todo', 'a renamed column keeps its cards');
  r = await s.call('PATCH', `/api/flow/${t.id}`, { status: 'Shipped' }, ana);
  assert.equal(r.json.done, true);

  // A document of Ana's attaches; Ben's doesn't; Ben sees nothing of hers.
  const mine = (await s.call('POST', '/api/docs', { title: 'Plan' }, ana)).json.id;
  const his = (await s.call('POST', '/api/docs', { title: 'Secret' }, ben)).json.id;
  assert.equal((await s.call('PATCH', `/api/flow/${t.id}`, { doc: mine }, ana)).json.doc, mine);
  assert.equal((await s.call('PATCH', `/api/flow/${t.id}`, { doc: his }, ana)).status, 400);
  assert.equal((await s.call('GET', '/api/flow', undefined, ana)).json.docs[mine], 'Plan');
  assert.equal((await s.call('PATCH', `/api/flow/${t.id}`, { text: 'Mine now' }, ben)).status, 404);
  assert.equal((await s.call('DELETE', `/api/flow/${t.id}`, undefined, ben)).status, 404);
  assert.equal((await s.call('GET', '/api/flow', undefined, ben)).json.items.length, 0);
});

test('Flow: comments and reactions, by people and agents; deleting an item takes them along', async () => {
  const s = server();
  const { ana, claude } = await people(s);
  const t = (await s.call('POST', '/api/flow', { text: 'Finish the deck' }, ana)).json;
  const before = t.updated;
  await new Promise((r) => setTimeout(r, 2));
  const k = await s.call('POST', `/api/flow/${t.id}/comments`, { text: 'Done with the first half' }, ana);
  assert.equal(k.status, 201);
  assert.equal(k.json.item, t.id);
  assert.equal(k.json.by.name, 'Ana');
  const ak = await s.call('POST', `/api/flow/${t.id}/comments`, { text: 'I checked the numbers', actor: { name: 'Claude' } }, claude);
  assert.equal(ak.json.by.kind, 'agent');
  assert.equal((await s.call('POST', `/api/flow/${t.id}/comments`, { text: ' ' }, ana)).status, 400);
  assert.equal((await s.call('POST', '/api/flow/nope/comments', { text: 'x' }, ana)).status, 404);
  const bumped = (await s.call('GET', '/api/flow', undefined, ana)).json.items[0].updated;
  assert.ok(bumped > before, 'a comment is activity: the post moves up the timeline');

  // Reactions toggle, one per person and kind; Ana's and her agent's both count.
  let r = await s.call('POST', `/api/flow/${t.id}/react`, { kind: 'like' }, ana);
  assert.equal(r.json.on, true);
  r = await s.call('POST', `/api/flow/${t.id}/react`, { kind: 'like' }, claude);
  assert.equal(r.json.reactions.length, 2);
  r = await s.call('POST', `/api/flow/${t.id}/react`, { kind: 'like' }, ana);
  assert.equal(r.json.on, false);
  assert.equal(r.json.reactions.length, 1);
  assert.equal(r.json.reactions[0].by.kind, 'agent');
  r = await s.call('POST', `/api/flow/${t.id}/react`, { kind: 'idea' }, ana);
  assert.equal(r.json.reactions.length, 2);
  assert.equal((await s.call('POST', `/api/flow/${t.id}/react`, { kind: 'wow' }, ana)).status, 400);

  const all = (await s.call('GET', '/api/flow', undefined, ana)).json;
  assert.equal(all.comments.length, 2);
  assert.equal(all.reactions.length, 2);
  assert.equal((await s.call('DELETE', `/api/flow/comments/${k.json.id}`, undefined, ana)).json.ok, true);
  assert.equal((await s.call('DELETE', `/api/flow/comments/${k.json.id}`, undefined, ana)).status, 404);

  assert.equal((await s.call('DELETE', `/api/flow/${t.id}`, undefined, ana)).json.ok, true);
  const gone = (await s.call('GET', '/api/flow', undefined, ana)).json;
  assert.deepEqual([gone.items.length, gone.comments.length, gone.reactions.length], [0, 0, 0]);
  assert.deepEqual((await s.call('GET', '/api/data', undefined, ana)).json, [], 'no records left in any Flow collection');
});

test('Flow: one clock runs at a time; stopping keeps the minutes and says so', async () => {
  const s = server();
  const { ana } = await people(s);
  const a = (await s.call('POST', '/api/flow', { text: 'todo Write' }, ana)).json;
  const b = (await s.call('POST', '/api/flow', { text: 'todo Read' }, ana)).json;
  let r = await s.call('POST', `/api/flow/${a.id}/clock`, { running: true }, ana);
  assert.ok(r.json.clock > 0);
  // Pretend it has run 25 minutes.
  s.store.update(a.by.id, 'flow', a.id, { clock: r.json.clock - 25 * 60_000 });
  r = await s.call('POST', `/api/flow/${b.id}/clock`, { running: true }, ana);
  assert.ok(r.json.clock > 0, 'the second clock runs');
  const all = (await s.call('GET', '/api/flow', undefined, ana)).json;
  const first = all.items.find((i: any) => i.id === a.id);
  assert.equal(first.clock, null, 'the first stopped');
  assert.equal(first.spent, 25);
  assert.deepEqual(all.comments.map((k: any) => [k.item, k.text]), [[a.id, 'Worked 25 min on this']]);
  r = await s.call('POST', `/api/flow/${b.id}/clock`, { running: false }, ana);
  assert.equal(r.json.clock, null);
  assert.equal(r.json.spent, 0, 'under a minute logs nothing');
  assert.equal((await s.call('GET', '/api/flow', undefined, ana)).json.comments.length, 1);
  assert.equal((await s.call('POST', '/api/flow/nope/clock', { running: true }, ana)).status, 404);
});

test('Flow: the event stream says which collection changed, whoever changed it', async () => {
  const s = server();
  const { ana, claude } = await people(s);
  const res = await s.app.request('/api/flow/events', { headers: ana });
  assert.equal(res.status, 200);
  const reader = res.body!.getReader();
  const read = async (): Promise<string> => new TextDecoder().decode((await reader.read()).value);
  assert.match(await read(), /event: hello/);
  await s.call('POST', '/api/flow', { text: 'From the agent' }, claude);
  assert.match(await read(), /event: data\ndata: \{"type":"data","collection":"flow"\}/);
  // A document's insert! lands in the same collection, and is heard the same way.
  await s.call('POST', '/api/data/flow', { record: { kind: 'note', text: 'From a document' } }, ana);
  assert.match(await read(), /"collection":"flow"/);
  await reader.cancel();
  const all = (await s.call('GET', '/api/flow', undefined, ana)).json;
  assert.equal(all.items.length, 2);
  assert.equal(all.items[1].by.name, 'Ana', 'a bare record reads as the owner’s');
});
