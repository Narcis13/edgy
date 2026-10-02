// An agent uses the library over MCP: the real edgy MCP server (src/mcp/server.ts),
// talking to the edgy at the given address, driven by the MCP client.
//   node docs/showcase/library/mcp-check.mjs http://127.0.0.1:8791 out-dir
// Prints every call and its answer (mcp.txt is this output).
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { statSync } from 'node:fs';
import { join } from 'node:path';

const [base = 'http://127.0.0.1:8791', out = '.'] = process.argv.slice(2);
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['--import', 'tsx', 'src/mcp/server.ts'],
  env: { ...process.env, EDGY_URL: base, EDGY_AGENT_NAME: 'Claude' },
});
const client = new Client({ name: 'library-check', version: '1' });
await client.connect(transport);

let failures = 0;
async function call(name, args, expect) {
  const r = await client.callTool({ name, arguments: args });
  const text = r.content.map((c) => c.text).join('\n');
  const ok = !r.isError && (!expect || expect.test(text));
  if (!ok) failures++;
  console.log(`\n> ${name} ${JSON.stringify(args)}${ok ? '' : '   <-- UNEXPECTED'}`);
  const lines = text.split('\n');
  console.log([...lines.slice(0, 24), ...(lines.length > 24 ? [`(… ${lines.length - 24} more lines)`] : [])].map((l) => '  ' + l).join('\n'));
  return text;
}
const idOf = (text) => /Created (\w+)/.exec(text)[1];

const tools = (await client.listTools()).tools.map((t) => t.name);
console.log('Tools:', tools.join(', '));

const a = idOf(await call('edgy_create', { title: 'Harbour fees', root: ['col', ['text', 'Mooring costs for the summer season'], ['input', { name: 'boats', type: 'number', value: 12 }]] }));
const b = idOf(await call('edgy_create', { title: 'Crew rota', root: ['text', 'Who sails on which weekend'] }));
const c = idOf(await call('edgy_create', { title: 'Regatta day', template: 'quote' }));

await call('edgy_organize', { action: 'describe', docs: [a], description: 'What the marina charges per berth, kept for the treasurer' }, /treasurer/);
await call('edgy_docs', { query: 'treasurer' }, /Harbour fees[\s\S]*found in the description/);
await call('edgy_docs', { query: 'mooring' }, /Harbour fees[\s\S]*found in the text/);
await call('edgy_organize', { action: 'pin', docs: [b, a] }, /pin: /);
await call('edgy_organize', { action: 'order_pins', docs: [a, b] }, new RegExp(`${a}, ${b}`));
await call('edgy_docs', { filter: 'pinned' }, /pinned #1[\s\S]*pinned #2/);
await call('edgy_organize', { action: 'archive', docs: ['Crew rota'] }, new RegExp(`archive: ${b}`));
await call('edgy_docs', { filter: 'archived' }, /Crew rota[\s\S]*archived/);
await call('edgy_organize', { action: 'restore', docs: [b] }, new RegExp(`restore: ${b}`));
const deck = await call('edgy_deck', { action: 'create', title: 'Season plan', description: 'For the club meeting', docs: [a, b, c] }, /1\. [\s\S]*2\. [\s\S]*3\. /);
const deckId = /(deck-\w+)/.exec(deck)[1];
await call('edgy_deck', { action: 'reorder', deck: 'Season plan', docs: [c, a] }, /1\. \w+ "Regatta day"[\s\S]*2\. \w+ "Harbour fees"[\s\S]*3\. \w+ "Crew rota"/);
await call('edgy_deck', { action: 'remove', deck: deckId, docs: [b] }, /Regatta day[\s\S]*Harbour fees/);
await call('edgy_docs', { filter: 'decks' }, /deck "Season plan"  2 documents/);
await call('edgy_share', { doc: a, action: 'on', access: 'view' }, /can view: http/);
await call('edgy_share', { doc: a, action: 'list' }, /view: http/);
await call('edgy_share', { doc: a, action: 'off' }, /Turned off: view/);
const file = join(out, 'season-plan.html');
await call('edgy_export', { deck: 'Season plan', file }, /Saved/);
console.log(`\nThe exported deck: ${file}, ${statSync(file).size} bytes`);
await call('edgy_guide', {}, /## Library/);

await client.close();
console.log(failures ? `\n${failures} call(s) did not answer as expected` : '\nEvery call answered as expected.');
process.exit(failures ? 1 : 0);
