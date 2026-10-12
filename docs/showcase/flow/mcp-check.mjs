// An agent takes part in the Flow over MCP: the real edgy MCP server (src/mcp/server.ts),
// started with Ana's API key, calling edgy_flow against a seeded server.
//   EDGY_URL=http://127.0.0.1:8792 EDGY_API_KEY=edgy_… node docs/showcase/flow/mcp-check.mjs
// Prints every call and what came back; exits non-zero when something is not as expected.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const base = (process.env.EDGY_URL ?? 'http://127.0.0.1:8792').replace(/\/$/, '');
const key = process.env.EDGY_API_KEY;
if (!key) {
  console.log('  FAIL: set EDGY_API_KEY (the seed prints CLAUDE_KEY)');
  process.exit(1);
}
let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `: ${detail}` : ''}`);
};

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['--import', 'tsx', 'src/mcp/server.ts'],
  env: { ...process.env, EDGY_URL: base, EDGY_AGENT_NAME: 'Claude', EDGY_API_KEY: key },
  stderr: 'ignore',
});
const client = new Client({ name: 'flow-check', version: '0' });
await client.connect(transport);

const call = async (args) => {
  const r = await client.callTool({ name: 'edgy_flow', arguments: args });
  const text = r.content.map((c) => c.text ?? '').join('\n');
  console.log(`edgy_flow ${JSON.stringify(args)}\n    -> ${text.length > 400 ? text.slice(0, 400) + ' …' : text.replace(/\n/g, '\n       ')}`);
  return { text, isError: !!r.isError };
};

const tools = (await client.listTools()).tools.map((t) => t.name);
check('edgy_flow is listed among the tools', tools.includes('edgy_flow'), tools.join(', '));

const list = await call({ action: 'list' });
check('list names the board columns and the items', /Board columns: Inbox, Doing, Done/.test(list.text) && /items, latest activity first/.test(list.text));
const today = await call({ action: 'list', filter: 'today' });
check('list filter today has the standup', /Standup/.test(today.text));
const overdue = await call({ action: 'list', filter: 'overdue' });
check('list filter overdue has the Northwind quote', /Send the Northwind quote/.test(overdue.text));

const posted = await call({ action: 'post', text: 'todo Draft the renewal offer for Ben tomorrow #sales !' });
const item = JSON.parse(posted.text);
check('post: a task due tomorrow, high, tagged sales, by Claude for Ana', item.kind === 'task' && item.priority === 1 && item.tags.includes('sales') && item.by.kind === 'agent' && item.by.for === 'Ana Pop', `${item.kind} due ${item.due} by ${item.by.name} for ${item.by.for}`);

const commented = await call({ action: 'comment', id: item.id, text: 'Starting from the Q4 numbers; the margin line is the one to lead with.' });
check('comment: by the agent', JSON.parse(commented.text).by.kind === 'agent');
const reacted = await call({ action: 'react', id: item.id, kind: 'idea' });
check('react: on', JSON.parse(reacted.text).on === true);
const moved = await call({ action: 'move', id: item.id, column: 'Doing' });
check('move: in Doing', JSON.parse(moved.text).status === 'Doing');
const started = await call({ action: 'clock', id: item.id, running: true });
check('clock: running', JSON.parse(started.text).clock > 0);
const stopped = await call({ action: 'clock', id: item.id, running: false });
check('clock: stopped', JSON.parse(stopped.text).clock === null);
const done = await call({ action: 'done', id: item.id });
check('done: true, in the last column', JSON.parse(done.text).done === true && JSON.parse(done.text).status === 'Done');
const bad = await call({ action: 'move', id: item.id, column: 'Nowhere' });
check('move to a column that does not exist is refused with the columns named', bad.isError && /no column "Nowhere"/.test(bad.text));
const removed = await call({ action: 'delete', id: item.id });
check('delete: ok', JSON.parse(removed.text).ok === true);
const after = await call({ action: 'list', query: 'renewal offer' });
check('the deleted item is gone from the list', /Nothing in the Flow/.test(after.text));

await client.close();
console.log(failures ? `  ${failures} check(s) FAILED` : '  every MCP check passed');
process.exit(failures ? 1 : 0);
