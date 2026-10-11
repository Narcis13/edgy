// Tutorial: Working with an agent (site/content/tutorials/agent.md)
// The agent is an MCP client of ours: it starts the MCP server the page names (npx tsx src/mcp/server.ts, with
// EDGY_URL, EDGY_API_KEY and EDGY_AGENT_NAME in its environment) and calls the tools the page's agent calls.
// The API key is made through Profile > API keys in the UI and never written anywhere.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { join } from 'node:path';
import { BASE, sleep, outDir } from '../lib.mjs';

const REPO = join(import.meta.dirname, '../../../../..');

export default {
  account: ['agent@example.test', 'Agent Reader'],
  ignored: [
    "title (the agent is asked for 'Team lunch'; the template has the same, the comparison ignores titles everywhere)",
    'size (none: the agent writes the notation, no cell has a size)',
    "the agent's own wording is not compared: the replay's agent writes the document from the prompt, and the comparison shows it matches the template cell for cell",
  ],
  async build({ ed, result, compareNow, cookie }) {
    const out = outDir();
    let key, client, id;
    const text = (r) => (r.content ?? []).map((c) => c.text).join('\n');
    const call = async (name, args) => {
      const r = await client.callTool({ name, arguments: args }, undefined, { timeout: 130000 });
      if (r.isError) throw new Error(`${name}: ${text(r)}`);
      return text(r);
    };
    const open = async (path, settle = 1500) => { await ed.go(path, settle); };

    await ed.step(1, 'Start edgy: the replay server is on 8794 and asks for sign-in (accounts mode), so the signed-in case below is the one followed', async () => {
      await open('/');
      await ed.check('the library is open', /Documents/.test(await ed.js('document.body.innerText')));
    });
    // The signed-in case: an API key from Profile > API keys (steps 12 and 13 of the page; the agent needs it first here).
    await ed.step(12, 'Avatar in the header, Profile; API keys: Name Claude on my laptop, Create key; the key is shown once: Copy, I have copied it', async () => {
      await ed.press('Account: Agent Reader', 'header');
      await sleep(500);
      await ed.press('Profile', 'body', { exact: false });
      await ed.waitFor(`location.pathname === '/profile'`);
      await sleep(1000);
      await ed.clickEl(`document.querySelector('input[name="key-name"]')`);
      await ed.type('Claude on my laptop');
      await ed.press('Create key', 'body');
      await ed.waitFor(`document.querySelector('input[aria-label="The new key"]')`);
      key = await ed.js(`document.querySelector('input[aria-label="The new key"]').value`);
      await ed.check('a key edgy_… was made', /^edgy_/.test(key));
      await ed.p.shot(join(out, 'agent-api-key-made.png')); // shows the key; blanked below
      await ed.press('Copy', '.pf-fresh', { exact: false });
      await sleep(500);
      await ed.press('I have copied it', 'body');
      await sleep(800);
      const list = await ed.js(`document.querySelector('.pf-keys')?.innerText ?? ''`);
      await ed.check('the key is listed by its name', /Claude on my laptop/.test(list), list);
      await ed.p.shot(join(out, 'agent-api-keys.png'));
    });
    // Evidence must not show the key.
    const { unlinkSync } = await import('node:fs');
    try { unlinkSync(join(out, 'agent-api-key-made.png')); } catch {}

    await ed.step(2, 'Connect the agent: start the MCP server of .mcp.json (npx tsx src/mcp/server.ts, EDGY_URL, EDGY_API_KEY, EDGY_AGENT_NAME=Claude) from an MCP client', async () => {
      const transport = new StdioClientTransport({
        command: 'npx', args: ['tsx', 'src/mcp/server.ts'], cwd: REPO,
        env: { EDGY_URL: BASE, EDGY_AGENT_NAME: 'Claude', EDGY_API_KEY: key },
      });
      client = new Client({ name: 'replay-agent', version: '1.0.0' });
      await client.connect(transport);
      const tools = (await client.listTools()).tools.map((t) => t.name);
      for (const t of ['edgy_docs', 'edgy_guide', 'edgy_create', 'edgy_read', 'edgy_apply', 'edgy_listen', 'edgy_say', 'edgy_answer']) {
        await ed.check(`the server offers ${t}`, tools.includes(t), tools.join(', '));
      }
      result.tools = tools;
    });
    await ed.step(4, 'Ask the agent: List my edgy documents; it answers from edgy_docs', async () => {
      const t = await call('edgy_docs', {});
      await ed.check('edgy_docs lists the library with links', /Start here|"/.test(t) && /\/d\//.test(t), t.slice(0, 400));
      result.docsListing = t.split('\n').slice(0, 3).join(' | ');
    });
    await ed.step(5, 'Ask for the Team lunch document: the agent reads edgy_guide, builds it with edgy_create, reads it back with edgy_read', async () => {
      const guide = await call('edgy_guide', {});
      await ed.check('the guide comes back', guide.length > 1000);
      const created = await call('edgy_create', {
        title: 'Team lunch',
        root: ['col',
          ['text', '# Team lunch'],
          ['row',
            ['input', { name: 'people', type: 'number', label: 'People', value: 8 }],
            ['input', { name: 'price', type: 'number', label: 'Price each', value: 12.5, step: 0.5 }],
            ['formula', { name: 'total', format: 'currency' }, ['*', '$people', '$price']]],
          ['button', { do: ['insert!', 'lunches', { people: '$people', total: '$total' }] }, 'Order lunch'],
          ['text', 'Lunches ordered so far: {{(len (rows "lunches"))}}.']],
      });
      id = /Created (\S+)\./.exec(created)[1];
      await ed.check('the agent got a link to open', /\/d\//.test(created), created.slice(0, 200));
      // Euros: the agent sets the document's currency with an op (edgy_create has no meta of its own).
      await call('edgy_apply', { doc: id, ops: [['meta', 'currency', 'EUR']] });
      const read = await call('edgy_read', { doc: id });
      await ed.check('the read-back shows the total 100 and no errors', /100/.test(read) && /No errors/.test(read), read);
    });
    await compareNow(id);

    await ed.step(6, 'Open the link; open Activity (the Activity and messages button)', async () => {
      await open('/d/' + id, 1800);
      await ed.waitFor(`window.edgy && window.edgy.state.status === 'ready'`);
      if (!(await ed.js(`!!document.querySelector('.activity')`))) await ed.clickEl(`document.querySelector('button[title="Activity and messages"]')`);
      await sleep(800);
    });
    await ed.step(7, 'Activity lists the agent next to the person and each of its changes as an op', async () => {
      const t = await ed.js(`document.querySelector('.activity').innerText`);
      await ed.check('Activity names Claude and lists ops', /Claude/.test(t) && /\(replace c1 \("col …"\)\)/.test(t) && /\(meta currency EUR\)/.test(t), t);
      result.activity = t.split('\n').slice(0, 12).join(' | ');
      await ed.p.shot(join(out, 'agent-activity.png'));
    });
    await ed.step(8, 'Live: change People, the total follows; press Order lunch: the line below reads Lunches ordered so far: 1', async () => {
      await ed.mode('Live');
      await ed.typeInCell({ name: 'people' }, '10');
      await ed.key('Tab');
      await sleep(500);
      let t = await ed.js(`document.querySelector('.sheet').innerText`);
      await ed.check('the total follows (10 people at 12.50)', /€125\.00/.test(t), t);
      await ed.press('Order lunch', '.sheet');
      await sleep(1000);
      t = await ed.js(`document.querySelector('.sheet').innerText`);
      await ed.check('Lunches ordered so far: 1', /Lunches ordered so far: 1\./.test(t), t);
      await ed.p.shot(join(out, 'agent-live.png'));
    });
    await ed.step(9, 'Home, Data: the collection lunches holds the record the button saved', async () => {
      await ed.go('/');
      await ed.press('Data', 'header');
      await sleep(900);
      const t = await ed.js(`document.body.innerText`);
      await ed.check('lunches has one record with people 10 and total 125', /lunches/.test(t) && /1 record/.test(t) && /125/.test(t), t);
    });

    // Talk to the agent in the document
    await ed.step(10, 'Ask the agent: Listen for requests in the Team lunch document: it calls edgy_listen, and the box under Activity says An agent is listening.', async () => {
      await open('/d/' + id, 1800);
      await ed.waitFor(`window.edgy && window.edgy.state.status === 'ready'`);
      if (!(await ed.js(`!!document.querySelector('.activity')`))) await ed.clickEl(`document.querySelector('button[title="Activity and messages"]')`);
      ed.listening = client.callTool({ name: 'edgy_listen', arguments: { doc: id, timeout: 90 } }, undefined, { timeout: 130000 });
      await ed.waitFor(`/An agent is listening\\./.test(document.querySelector('.activity')?.innerText ?? '')`, 15000);
    });
    await ed.step(11, 'In the box, Ask the agent for something…: type Show the total in bold, Enter; the agent picks it up, changes the document with edgy_apply and answers with edgy_say', async () => {
      await ed.clickEl(`document.querySelector('textarea[aria-label="Message to the agent"]')`);
      await ed.type('Show the total in bold');
      await ed.key('Enter', { wait: 500 });
      const heard = text(await ed.listening);
      await ed.check('the agent heard the message', /Show the total in bold/.test(heard), heard);
      await call('edgy_apply', { doc: id, ops: [['style', 'total', { weight: 700 }]] });
      await call('edgy_say', { doc: id, text: 'The total is now in bold.' });
      await ed.waitFor(`/The total is now in bold\\./.test(document.querySelector('.activity')?.innerText ?? '')`, 10000);
      await ed.mode('Live');
      const w = await ed.js(`getComputedStyle(${ed.cellExpr({ name: 'total' })}.querySelector('.value, span, div') ?? ${ed.cellExpr({ name: 'total' })}).fontWeight`);
      await ed.check('the total is in bold', Number(w) >= 600, String(w));
      await ed.mode('Edit');
      await ed.p.shot(join(out, 'agent-listening.png'));
    });
    await client.close();
    return { id };
  },
};
