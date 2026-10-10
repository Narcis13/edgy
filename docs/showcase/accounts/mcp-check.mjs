// An agent acts for a person over MCP: the real edgy MCP server (src/mcp/server.ts),
// started with the person's API key, talking to an edgy in accounts mode.
//   EDGY_AUTH=accounts .claude/goal-loop/serve.sh fresh 8797 "$TMPDIR/mcp-data"
//   node docs/showcase/accounts/mcp-check.mjs http://127.0.0.1:8797 > docs/showcase/accounts/mcp.txt
// Needs a fresh server (it signs Ana and Ben up). Prints every call and its answer.
// The server's log is read from $TMPDIR/goal-loop-serve-<port>.log (where serve.sh writes it).
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const base = (process.argv[2] ?? 'http://127.0.0.1:8797').replace(/\/$/, '');
const port = new URL(base).port;

const printed = [];
const log = (s = '') => { printed.push(s); console.log(s); };
let failures = 0;
function check(label, ok, detail = '') {
  if (!ok) failures++;
  log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `: ${detail}` : ''}${ok ? '' : '   <-- UNEXPECTED'}`);
  return ok;
}
const indent = (s, n = 4) => s.split('\n').map((l) => ' '.repeat(n) + l).join('\n');

// ── plain HTTP, for the setup and for looking at what the server holds ──
async function http(method, path, body, { cookie } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  const set = res.headers.getSetCookie?.().find((c) => c.startsWith('edgy_session='));
  return { status: res.status, json, text, cookie: set?.split(';')[0] };
}
/** Every answer read after the key was made, to look for the key in. */
const afterKey = [];
let tracking = false;
async function read(label, method, path, body, who) {
  const r = await http(method, path, body, who);
  if (tracking) afterKey.push({ label, text: r.text });
  return r;
}

const PASSWORD = 'correct horse';
async function signup(email, name) {
  const r = await http('POST', '/api/auth/signup', { email, password: PASSWORD, name });
  log(`POST /api/auth/signup {email: ${email}, name: ${name}} -> ${r.status}, signed in as ${r.json?.user?.name} (${r.json?.user?.id})`);
  assert.equal(r.status, 201, `sign-up of ${name} answered ${r.status}: ${r.text}`);
  return { cookie: r.cookie, user: r.json.user };
}
async function makeDoc(who, title, root) {
  const r = await http('POST', '/api/docs', { title, root }, who);
  log(`${who.name} makes "${title}" -> ${r.status}, id ${r.json?.id}`);
  assert.equal(r.status, 201, r.text);
  return r.json.id;
}

log(`Accounts and MCP, ${new Date().toISOString().slice(0, 16)}Z: an agent holding Ana's API key, against ${base}`);
log();
log('1. Setup over HTTP (not MCP)');
const ana = { ...(await signup('ana@example.test', 'Ana')), name: 'Ana' };
const ben = { ...(await signup('ben@example.test', 'Ben')), name: 'Ben' };
const budget = await makeDoc(ana, 'Ana\'s budget', ['col', ['text', 'Rent and food for the month'], ['input', { name: 'qty', type: 'number', value: 2 }]]);
const reading = await makeDoc(ana, 'Ana\'s reading list', ['text', 'Three books to finish']);
const priv = await makeDoc(ben, 'Ben\'s private notes', ['text', 'Only Ben reads this']);
const plan = await makeDoc(ben, 'Ben\'s shared plan', ['col', ['text', 'The plan for May'], ['input', { name: 'weeks', type: 'number', value: 4 }]]);
const given = await http('POST', `/api/docs/${plan}/people`, { email: 'ana@example.test', role: 'editor' }, ben);
log(`Ben gives Ana editor access to "Ben's shared plan": POST /api/docs/${plan}/people {email: ana@example.test, role: editor} -> ${given.status}`);
log(indent(JSON.stringify(given.json?.people?.map((p) => ({ name: p.name, role: p.role })))));
assert.equal(given.status, 200, given.text);

const made = await http('POST', '/api/me/keys', { name: 'Claude on Ana\'s laptop' }, ana);
assert.equal(made.status, 201, made.text);
const KEY = made.json.key;
const KEY_SECRET = KEY.slice(11); // everything after the prefix the list shows
const keyId = made.json.id;
log(`Ana creates a key with her session: POST /api/me/keys {name: "Claude on Ana's laptop"} -> ${made.status}`);
log(indent(JSON.stringify({ ...made.json, key: `${KEY.slice(0, 11)}… (${KEY.length} characters, shown once)` })));
check('the answer carries the key itself, once', typeof KEY === 'string' && /^edgy_/.test(KEY));
tracking = true;

// ── the agent, with Ana's key ──
function connect(key, name) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', 'src/mcp/server.ts'],
    env: { ...process.env, EDGY_URL: base, EDGY_AGENT_NAME: 'Claude', EDGY_API_KEY: key },
  });
  const client = new Client({ name, version: '1' });
  return client.connect(transport).then(() => client);
}

const outputs = [];
async function call(client, name, args, expect, { fails = false } = {}) {
  const r = await client.callTool({ name, arguments: args });
  const text = r.content.map((c) => c.text).join('\n');
  outputs.push(text);
  if (tracking) afterKey.push({ label: `MCP ${name}`, text });
  const ok = (fails ? !!r.isError : !r.isError) && (!expect || expect.test(text));
  if (!ok) failures++;
  log(`\n  > ${name} ${JSON.stringify(args)}${ok ? '' : '   <-- UNEXPECTED'}${r.isError ? '   (an error answer)' : ''}`);
  const lines = text.split('\n');
  log(indent([...lines.slice(0, 18), ...(lines.length > 18 ? [`(… ${lines.length - 18} more lines)`] : [])].join('\n'), 4));
  return text;
}

log();
log('2. The agent, started with EDGY_API_KEY = Ana\'s key');
const agent = await connect(KEY, 'accounts-check');
const tools = (await agent.listTools()).tools.map((t) => t.name);
log(`  Tools (${tools.length}): ${tools.join(', ')}`);

const mine = await call(agent, 'edgy_docs', {}, /(?=[\s\S]*Ana's budget)(?=[\s\S]*Ana's reading list)/);
check('Ben\'s private notes are not in Ana\'s list', !mine.includes('Ben\'s private notes') && !mine.includes(priv));
check('Ben\'s shared plan is not among "mine" either', !mine.includes('Ben\'s shared plan'));
const shared = await call(agent, 'edgy_docs', { scope: 'shared' }, /Ben's shared plan[\s\S]*you can edit/);
check('Ben\'s private notes are not shared with her', !shared.includes('Ben\'s private notes') && !shared.includes(priv));

await call(agent, 'edgy_apply', { doc: 'Ana\'s budget', ops: [['set', 'qty', 'value', 5]] }, /Applied 1 op; now version \d+/);
await call(agent, 'edgy_read', { doc: budget }, /qty[\s\S]*5/);
await call(agent, 'edgy_apply', { doc: plan, ops: [['set', 'weeks', 'value', 6]] }, /Applied 1 op/);
log('  (the shared plan is Ana\'s to edit, so that one works)');

log();
log('   What Ana\'s history says about it (GET /api/docs/' + budget + '/log with her cookie):');
const history = await read(`GET /api/docs/${budget}/log (Ana's cookie)`, 'GET', `/api/docs/${budget}/log`, undefined, ana);
const last = history.json.at(-1);
log(indent(JSON.stringify(last, null, 1).replace(/\n\s*/g, ' ')));
const wanted = { kind: 'agent', name: 'Claude', id: ana.user.id, for: 'Ana' };
let same = true;
try { assert.deepEqual(last.actor, wanted); } catch { same = false; }
check('the last entry\'s actor is the agent acting for Ana', same, JSON.stringify(last.actor));
const sharedLog = await read(`GET /api/docs/${plan}/log (Ben's cookie)`, 'GET', `/api/docs/${plan}/log`, undefined, ben);
check('on Ben\'s shared plan too, the actor is the agent for Ana (Ben sees who really did it)', JSON.stringify(sharedLog.json.at(-1).actor) === JSON.stringify(wanted), JSON.stringify(sharedLog.json.at(-1).actor));

log();
log('3. What the agent can not reach');
const refused = await call(agent, 'edgy_apply', { doc: priv, ops: [['set', 'qty', 'value', 9]] }, /no document/, { fails: true });
check('the error does not give away Ben\'s document', !refused.includes('Ben\'s private notes'));
await call(agent, 'edgy_read', { doc: 'Ben\'s private notes' }, /no document/, { fails: true });
const direct = await fetch(`${base}/api/docs/${priv}`, { headers: { authorization: `Bearer ${KEY}` } });
check('asked directly over HTTP with the key, Ben\'s document answers 404', direct.status === 404, `${direct.status}`);
const mint = await fetch(`${base}/api/me/keys`, { method: 'POST', headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }, body: '{"name":"more"}' });
check('a key can not make keys', mint.status === 403, `${mint.status}`);

log();
log('4. The key shows nowhere after it was made');
const listed = await read('GET /api/me/keys (Ana cookie)', 'GET', '/api/me/keys', undefined, ana);
log(`  GET /api/me/keys -> ${listed.status}`);
log(indent(JSON.stringify(listed.json)));
check('the list shows only the prefix', listed.json.length === 1 && listed.json[0].prefix === KEY.slice(0, 11) && !('key' in listed.json[0]));
const docNow = await read(`GET /api/docs/${budget} (Ana's cookie)`, 'GET', `/api/docs/${budget}`, undefined, ana);
const logNow = await read(`GET /api/docs/${budget}/log (Ana's cookie, again)`, 'GET', `/api/docs/${budget}/log`, undefined, ana);
const me = await fetch(`${base}/api/me`, { headers: { authorization: `Bearer ${KEY}` } });
afterKey.push({ label: 'GET /api/me (with the key)', text: await me.text() });
const healthNow = await read('GET /api/health', 'GET', '/api/health');
void docNow; void logNow; void healthNow;
const where = [];
const sources = [...afterKey];
const logFile = join(process.env.TMPDIR ?? '/tmp', `goal-loop-serve-${port}.log`);
if (existsSync(logFile)) sources.push({ label: `server log (${logFile})`, text: readFileSync(logFile, 'utf8') });
else log(`  (no server log at ${logFile}; not searched)`);
for (const s of sources) if (s.text.includes(KEY) || s.text.includes(KEY_SECRET)) where.push(s.label);
log(`  Searched ${sources.length} answers and files for the whole key and for its secret part (${KEY_SECRET.length} characters after the prefix):`);
log(indent([...new Set(sources.map((s) => s.label))].join('\n'), 4));
check(where.length ? `the key appears in: ${where.join(', ')}` : `the key appears in none of: GET /api/me/keys, the document, its log, /api/me, the MCP outputs, the server log`, where.length === 0);

log();
log('5. Ana revokes the key');
const revoke = await read('DELETE /api/me/keys/<id>', 'DELETE', `/api/me/keys/${keyId}`, undefined, ana);
log(`  DELETE /api/me/keys/${keyId} -> ${revoke.status}, revokedAt ${revoke.json?.revokedAt}`);
check('the revoke answered 200', revoke.status === 200, `${revoke.status}`);

// A minimal, plausible call for each tool the server registers.
const MINIMAL = {
  edgy_guide: {},
  edgy_docs: {},
  edgy_organize: { action: 'pin', docs: [budget] },
  edgy_deck: { action: 'read', deck: 'Season plan' },
  edgy_share: { doc: budget, action: 'list' },
  edgy_export: { doc: budget },
  edgy_create: { title: 'After the key was revoked' },
  edgy_read: { doc: budget },
  edgy_apply: { doc: budget, ops: [['set', 'qty', 'value', 7]] },
  edgy_eval: { doc: budget, src: '(+ 1 2)' },
  edgy_data: { action: 'collections' },
  edgy_say: { doc: budget, text: 'Still there?' },
  edgy_listen: { doc: budget, timeout: 1 },
  edgy_answer: { doc: budget, request: 'r1', code: '(* qty 2)' },
};
async function everyTool(client, expect, what) {
  const names = (await client.listTools()).tools.map((t) => t.name);
  const missing = names.filter((n) => !(n in MINIMAL));
  check(`every registered tool has a call in this check (${names.length} tools)`, missing.length === 0, missing.length ? `no call for ${missing.join(', ')}` : '');
  for (const name of names) {
    if (!(name in MINIMAL)) continue;
    const r = await client.callTool({ name, arguments: MINIMAL[name] });
    const text = r.content.map((c) => c.text).join('\n');
    outputs.push(text);
    const ok = !!r.isError && expect.test(text);
    if (!ok) failures++;
    log(`  ${name.padEnd(14)} ${ok ? 'ok  ' : 'FAIL'} ${r.isError ? 'error: ' : 'answered: '}${text.replace(/\s+/g, ' ').slice(0, 170)}${ok ? '' : '   <-- UNEXPECTED'}`);
  }
}
log();
log('   Every tool, with the revoked key still in the agent\'s settings:');
await everyTool(agent, /revoked/, 'revoked');
const afterRevoke = await http('GET', `/api/docs/${budget}`, undefined, ana);
check('Ana\'s own documents are still hers, with her cookie', afterRevoke.status === 200, `${afterRevoke.status}`);
await agent.close();

log();
log('6. An agent with no key at all');
const keyless = await connect('', 'accounts-check-keyless');
await everyTool(keyless, /Edgy needs an API key/, 'no key');
await keyless.close();

// The key must not be in anything this check printed either.
const inPrinted = printed.some((l) => l.includes(KEY) || l.includes(KEY_SECRET)) || outputs.some((o) => o.includes(KEY) || o.includes(KEY_SECRET));
log();
check('this transcript and every MCP output hold no key', !inPrinted);

log();
log(failures
  ? `${failures} check(s) did not come out as expected.`
  : `Every check came out as expected: Ana's key reads and writes only what Ana may, shows as the agent acting for Ana in the history, appears nowhere after it was made, and after revoking it all ${Object.keys(MINIMAL).length} tools say so; with no key they ask for one.`);
process.exit(failures ? 1 : 0);
