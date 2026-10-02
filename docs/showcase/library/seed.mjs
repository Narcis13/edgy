// The showcase library: a studio's documents as someone would keep them, using every
// library feature together. Described documents, two pinned in a chosen order, one
// archived, one shared both ways, and a deck of three for the quarterly review.
//   node docs/showcase/library/seed.mjs http://127.0.0.1:8795 [--many 300]
// Prints the ids as shell assignments (A=… B=…) for shoot.sh.
const args = process.argv.slice(2);
const base = args.find((a) => a.startsWith('http')) ?? 'http://127.0.0.1:8795';
const many = args.includes('--many') ? Number(args[args.indexOf('--many') + 1]) : 0;
const actor = { kind: 'human', name: 'Mira' };

async function call(method, path, body) {
  const res = await fetch(base + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}
const make = async (title, from, description) => {
  const doc = await call('POST', '/api/docs', { title, actor, ...(typeof from === 'string' ? { template: from } : { root: from }) });
  if (description) await call('PATCH', `/api/docs/${doc.id}`, { description, actor });
  return doc.id;
};

const ids = {};
// Older documents first, so "last changed" puts the newer ones on top.
ids.feedback = await make('Visitor feedback', 'feedback', 'The form on the studio tablet; answers go into the feedback collection.');
ids.savings = await make('Studio savings plan', 'savings', 'How much to put aside each month for the new printer and the van.');
ids.notes = await make('Kick-off notes, Harbour & Co.', ['col',
  ['text', { size: 'hug', style: { size: 26, weight: 700 } }, 'Kick-off with Harbour & Co.'],
  ['text', { size: 'hug' }, 'They want the mug shop live before the **lighthouse festival**. Ana leads design; Jonas sets up payments.'],
  ['list', { type: 'check', label: 'Next steps' }, 'Send the moodboard', { text: 'Book the photographer', done: true }, 'Agree the delivery zones']], '');
ids.billing = await make('Studio billing and ledger', 'tables', 'Every invoice and project this quarter, grouped by status.');
ids.offsite = await make('Team offsite, Lisbon', 'showcase', 'Budget, packing list and who is coming, for the October offsite.');
ids.stall = await make('Saturday market stall', 'events', 'Prices in lei at the live rate, and the basket for Saturday.');
ids.orders = await make('Harbour & Co. order desk', 'elements', 'How an order travels, the week’s orders, and phone orders.');
ids.quote = await make('Quote for Harbour & Co.', 'quote', 'Brand identity, website and a photography day.');
ids.old = await make('Spring fair checklist', ['col',
  ['text', { size: 'hug', style: { size: 26, weight: 700 } }, 'Spring fair'],
  ['list', { type: 'check' }, { text: 'Rent the stand', done: true }, { text: 'Print the price cards', done: true }]], 'Done in April; kept for next year.');

// Pinned: the order desk first, then billing (pinned in the other order, then moved).
await call('PATCH', `/api/docs/${ids.billing}`, { pinned: true });
await call('PATCH', `/api/docs/${ids.orders}`, { pinned: true });
await call('POST', '/api/library/pins', { ids: [ids.orders, ids.billing] });
// Archived: last spring's checklist.
await call('POST', '/api/library/bulk', { action: 'archive', ids: [ids.old] });
// Shared: the quote, view for the client, edit for the account manager.
const view = await call('POST', `/api/docs/${ids.quote}/shares`, { access: 'view' });
const edit = await call('POST', `/api/docs/${ids.quote}/shares`, { access: 'edit' });
// A deck for the quarterly review.
const deck = await call('POST', '/api/decks', { title: 'Quarterly review', description: 'Billing, the offsite budget and the savings plan, for Friday.', docs: [ids.billing, ids.offsite, ids.savings] });

if (many) {
  const { spawnSync } = await import('node:child_process');
  spawnSync(process.execPath, ['scripts/seed-library.mjs', base, String(many)], { stdio: 'inherit' });
}

const out = { ...Object.fromEntries(Object.entries(ids).map(([k, v]) => [k.toUpperCase(), v])), DECK: deck.id, VIEW: view.token, EDIT: edit.token };
console.log(Object.entries(out).map(([k, v]) => `${k}=${v}`).join(' '));
