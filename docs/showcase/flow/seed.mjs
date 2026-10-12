// The Flow showcase: a fortnight of Ana Pop's notes, tasks and events, with
// Claude (an agent with her API key) taking part.
//
//   node docs/showcase/flow/seed.mjs http://127.0.0.1:8791
//
// Everything goes through the HTTP API, dated from today backwards (posted:
// the time something was written, kept when it is brought in). Prints shell
// assignments for shoot.sh: the cookie, the key, the dashboard's id and a few
// item ids. The password is a test value for this local server only.
const base = process.argv[2] ?? 'http://127.0.0.1:8791';
const PASSWORD = 'correct horse';
const NOW = Date.now();
const DAY = 86_400_000;
const pad = (n) => String(n).padStart(2, '0');
const day = (n) => {
  const d = new Date(NOW + n * DAY);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
/** n days ago at hh:mm local, in ms. */
const ago = (n, hh = 10, mm = 0) => {
  const d = new Date(NOW - n * DAY);
  d.setHours(hh, mm, 0, 0);
  return Math.min(d.getTime(), NOW - 60_000);
};

async function call(who, method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(who?.cookie ? { cookie: who.cookie } : {}), ...(who?.key ? { authorization: `Bearer ${who.key}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text}`);
  return { json: JSON.parse(text), cookie: res.headers.get('set-cookie')?.split(';')[0] };
}

// Ana, or her session when she exists already.
let ana;
try {
  const r = await call(null, 'POST', '/api/auth/signup', { email: 'ana@example.test', password: PASSWORD, name: 'Ana Pop' });
  ana = { cookie: r.cookie };
} catch {
  const r = await call(null, 'POST', '/api/auth/signin', { email: 'ana@example.test', password: PASSWORD });
  ana = { cookie: r.cookie };
}
const claude = { key: (await call(ana, 'POST', '/api/me/keys', { name: 'Claude on Ana’s laptop' })).json.key };
const agent = { actor: { kind: 'agent', name: 'Claude' } };

const post = async (who, text, more = {}) => (await call(who, 'POST', '/api/flow', { text, ...more })).json;
const comment = (who, id, text, posted) => call(who, 'POST', `/api/flow/${id}/comments`, { text, posted, ...(who.key ? agent : {}) });
const react = (who, id, kind) => call(who, 'POST', `/api/flow/${id}/react`, { kind, ...(who.key ? agent : {}) });

// A draft to attach to a post.
const draft = (await call(ana, 'POST', '/api/docs', {
  title: 'Launch post',
  root: ['col', ['text', '# Flow: one timeline for notes, tasks and days'],
    ['text', 'A note becomes a task with one click. A task given a time appears in the week. Finishing it shows in the timeline, where someone reacts.'],
    ['text', '*Draft. Claude checks the numbers before it goes out.*']],
})).json.id;

// ── Two weeks ago ──
const why = await post(ana, 'Why one timeline?\nNotes, tasks and events are the same thing seen at different times: an idea, then a commitment, then an hour in the day. One record, five views. #flow', { posted: ago(13, 9, 12) });
const turso = await post(ana, 'todo Set up the Turso database #infra', { posted: ago(12, 10, 5) });
await call(ana, 'PATCH', `/api/flow/${turso.id}`, { done: true });
// Finished eleven days ago: the time of that is a plain field, set the way a document could.
await call(ana, 'PATCH', `/api/data/flow/${turso.id}`, { fields: { doneAt: ago(11, 15, 20), updated: ago(11, 15, 20) } });
await post(ana, `event Team offsite planning ${day(-10)} 14:00-15:30 #team`, { posted: ago(11, 16, 40) });
const reading = await post(ana, 'Reading list #reading\n- Designing Data-Intensive Applications, ch. 5\n- The Pragmatic Programmer, again\n- Hono docs: streaming', { posted: ago(9, 21, 15), pinned: true });

// ── Last week ──
const launch = await post(ana, `todo Write the launch post ${day(0)} #launch !`, { posted: ago(8, 9, 30), status: 'Doing', doc: draft });
await comment(claude, launch.id, 'The draft is in the Launch post document, attached here. I kept the three sentences you liked.', ago(2, 11, 20));
const quote = await post(ana, `todo Send the Northwind quote ${day(-2)} #sales !!`, { posted: ago(7, 8, 50) });
await react(claude, quote.id, 'like');
await post(ana, `Dentist ${day(1)} 10:30-11:00`, { posted: ago(6, 12, 0) });
const q4 = await post(ana, 'todo Review the Q4 numbers #finance', { posted: ago(5, 10, 10) });
await comment(ana, q4.id, 'Margins are up 3 points on last quarter.', ago(1, 17, 5));
await comment(claude, q4.id, 'I checked the totals against the ledger; they match to the cent.', ago(1, 17, 30));
await call(ana, 'PATCH', `/api/flow/${q4.id}`, { done: true });
await call(ana, 'PATCH', `/api/data/flow/${q4.id}`, { fields: { doneAt: ago(1, 17, 40), updated: ago(1, 17, 40) } });
await react(ana, q4.id, 'party');
await react(claude, q4.id, 'like');
const idea = await post(ana, 'Idea: let agents react #flow\nIf Claude can like a post, the feed becomes a conversation, not a log.', { posted: ago(4, 15, 45) });
await react(claude, idea.id, 'idea');
await react(ana, idea.id, 'love');
await comment(claude, idea.id, 'Done: an agent reacts with your key and counts as itself.', ago(4, 16, 2));
const venue = await post(ana, `todo Book the offsite venue ${day(3)} #team`, { posted: ago(3, 11, 0) });
await post(ana, `Standup ${day(0)} 9:30-9:45 #team`, { posted: ago(2, 18, 0) });
const deep = await post(ana, `Deep work ${day(0)} 10:00-12:00 #launch`, { posted: ago(2, 18, 1) });
const ben = await post(ana, `Call Ben ${day(0)} 15:00-16:00 #sales\nAsk about the Q4 numbers and the renewal.`, { posted: ago(2, 18, 2) });
await post(ana, 'todo Read the Hono docs on streaming #reading', { posted: ago(2, 20, 30) });

// ── Yesterday: a task with the clock on it (started 25 minutes ago, 40 minutes already logged). ──
const badge = await post(ana, 'todo Fix the sync badge on phones #bugs', { posted: ago(1, 9, 0), status: 'Doing' });
await call(ana, 'POST', `/api/flow/${badge.id}/clock`, { running: true });
await call(ana, 'PATCH', `/api/data/flow/${badge.id}`, { fields: { clock: NOW - 25 * 60_000, spent: 40 } });

// ── Today ──
const leads = await post(claude, 'todo Reply to the three new leads #sales !', { posted: ago(0, 8, 12), ...agent });
await comment(claude, leads.id, 'Two came through the website form overnight, one from the Northwind call. Drafts are ready when you are.', ago(0, 8, 14));
const works = await post(ana, 'Flow works: notes, tasks and events in one timeline, and Claude is in it. #flow #launch', { posted: ago(0, 9, 5) });
await react(claude, works.id, 'party');
await post(ana, `todo Prepare the demo ${day(1)} #launch`, { posted: ago(0, 9, 20) });
await post(ana, `event Offsite ${day(3)} #team`, { posted: ago(0, 9, 22) });
await call(ana, 'PATCH', `/api/flow/${(await post(ana, `todo Pay the invoice ${day(10)} #finance`, { posted: ago(0, 9, 24) })).id}`, { priority: 0 });
// The dashboard, from the template: made now that the Flow has items, so the template brings no samples of its own.
const dash = (await call(ana, 'POST', '/api/docs', { template: 'flow' })).json.id;
const dashNote = await post(ana, 'The dashboard document reads the Flow #flow\nOpen it: the stats, the table and the chart are (rows "flow"), live.', { posted: ago(0, 9, 40), doc: dash });
await react(claude, dashNote.id, 'love');

console.log(`ANA_COOKIE='${ana.cookie}'`);
console.log(`CLAUDE_KEY='${claude.key}'`);
console.log(`DASH=${dash}`);
console.log(`DRAFT=${draft}`);
console.log(`LAUNCH=${launch.id}`);
console.log(`Q4=${q4.id}`);
console.log(`IDEA=${idea.id}`);
console.log(`BADGE=${badge.id}`);
console.log(`VENUE=${venue.id}`);
console.log(`DEEP=${deep.id}`);
console.log(`BEN=${ben.id}`);
console.log(`WHY=${why.id}`);
console.log(`READING=${reading.id}`);
