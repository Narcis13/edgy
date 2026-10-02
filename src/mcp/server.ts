// Edgy for agents, over MCP (stdio). Every tool goes through the same HTTP API
// the browser uses, so a person watching the document sees each change land.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BASE = (process.env.EDGY_URL ?? 'http://127.0.0.1:8787').replace(/\/$/, '');
const AGENT = process.env.EDGY_AGENT_NAME ?? 'Claude';
const actor = { kind: 'agent', name: AGENT };

async function api(method: string, path: string, body?: unknown): Promise<any> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(`Edgy is not running at ${BASE}. Start it with "npm run dev" in the edgy folder, then try again.`);
  }
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { error: text.slice(0, 300) }; }
  if (!res.ok) throw new Error(json.error ?? `request failed (${res.status})`);
  return json;
}

let webUrl: string | null = null;
async function link(id: string): Promise<string> {
  webUrl ??= ((await api('GET', '/api/health')).web as string) ?? BASE;
  return `${webUrl}/d/${id}`;
}

/** Accept a document id or its title. */
async function docId(ref: string): Promise<string> {
  const docs = (await api('GET', '/api/docs')) as { id: string; title: string }[];
  if (docs.some((d) => d.id === ref)) return ref;
  const byTitle = docs.filter((d) => d.title.toLowerCase() === ref.toLowerCase());
  if (byTitle.length === 1) return byTitle[0].id;
  if (byTitle.length > 1) throw new Error(`several documents are titled "${ref}"; use an id: ${byTitle.map((d) => d.id).join(', ')}`);
  throw new Error(`no document "${ref}". Known: ${docs.map((d) => `${d.id} (${d.title})`).join(', ') || 'none yet'}`);
}

const text = (s: string) => ({ content: [{ type: 'text' as const, text: s }] });
const fail = (e: unknown) => ({ content: [{ type: 'text' as const, text: e instanceof Error ? e.message : String(e) }], isError: true });
const safely = <A>(fn: (a: A) => Promise<ReturnType<typeof text>>) => async (a: A) => {
  try { return await fn(a); } catch (e) { return fail(e); }
};

function report(view: any): string {
  const parts = [view.outline ?? '', ''];
  if (view.notation) parts.push('Notation:', JSON.stringify(view.notation), '');
  const errors = Object.entries(view.errors ?? {});
  parts.push(errors.length ? 'Errors:\n' + errors.map(([k, m]) => `  ${k}: ${m}`).join('\n') : 'No errors.');
  return parts.join('\n');
}

const server = new McpServer({ name: 'edgy', version: '0.1.0' });

server.registerTool('edgy_guide', {
  description: 'How Edgy documents work: cell notation, the expression language, ops and data. Read this once before editing.',
  inputSchema: {},
}, safely(async () => text(await (await fetch(BASE + '/api/guide')).text())));

/** One line per card: a document or a deck, with what the library knows of it. */
async function entryLine(e: any): Promise<string> {
  const flags = [e.pinned != null && `pinned #${e.pinned}`, e.archivedAt != null && 'archived', e.shared?.view && 'shared (view)', e.shared?.edit && 'shared (edit)', e.deckTitle && `in deck "${e.deckTitle}"`].filter(Boolean);
  const head = e.type === 'deck'
    ? `${e.id}  deck "${e.title}"  ${e.count} documents: ${(e.docs as string[]).join(', ')}`
    : `${e.id}  "${e.title}"  version ${e.v}, changed ${new Date(e.updatedAt).toISOString()}  ${await link(e.id)}`;
  return [head + (flags.length ? `  [${flags.join(', ')}]` : ''),
    e.description ? `    ${e.description}` : '',
    e.match ? `    found in the ${e.match.field === 'text' ? 'text' : e.match.field}: ${e.match.snippet}` : ''].filter(Boolean).join('\n');
}

server.registerTool('edgy_docs', {
  description: 'List or search the library: documents and decks, pinned first, with a link a person can open. query finds documents by words in their title, description or text (every word must appear). filter: all (default; documents in a deck show inside it), pinned, shared, decks or archived. sort: updated (default), created or title.',
  inputSchema: {
    query: z.string().optional(),
    filter: z.enum(['all', 'pinned', 'shared', 'decks', 'archived']).optional(),
    sort: z.enum(['updated', 'created', 'title']).optional(),
  },
}, safely(async ({ query, filter, sort }) => {
  const params = new URLSearchParams({ q: query ?? '', filter: filter ?? 'all', sort: sort ?? 'updated' });
  const lib = await api('GET', `/api/library?${params}`);
  if (!lib.total) return text(query ? `Nothing matches "${query}".` : filter && filter !== 'all' ? `Nothing under ${filter}.` : 'No documents yet. Create one with edgy_create.');
  const parts: string[] = [];
  if (lib.pinned.length) parts.push('Pinned:', ...(await Promise.all(lib.pinned.map(entryLine))), '');
  if (lib.rest.length) parts.push(...(lib.pinned.length ? ['Others:'] : []), ...(await Promise.all(lib.rest.map(entryLine))));
  return text(parts.join('\n'));
}));

server.registerTool('edgy_organize', {
  description: 'Arrange documents in the library. action: describe (set the description of docs[0]; it shows on the card and is searchable), pin, unpin, archive (out of the list, nothing lost), restore (back from the archive), order_pins (docs = every pinned id or title in the new order). docs are ids or titles.',
  inputSchema: {
    action: z.enum(['describe', 'pin', 'unpin', 'archive', 'restore', 'order_pins']),
    docs: z.array(z.string()).min(1).describe('Document ids or titles (deck ids work for pin, unpin, archive, restore)'),
    description: z.string().optional().describe('For describe: one or two sentences; empty removes it'),
  },
}, safely(async ({ action, docs, description }) => {
  const ids = await Promise.all(docs.map((d) => (d.startsWith('deck-') ? d : docId(d))));
  if (action === 'describe') {
    const r = await api('PATCH', `/api/docs/${ids[0]}`, { description: description ?? '', actor });
    return text(`"${r.title}" now reads: ${r.description || '(no description)'}`);
  }
  if (action === 'order_pins') return text(`Pinned, in order: ${(await api('POST', '/api/library/pins', { ids })).pins.join(', ')}`);
  const r = await api('POST', '/api/library/bulk', { action, ids });
  return text(`${action}: ${r.done.join(', ') || 'nothing'}${r.skipped.length ? `; not done: ${r.skipped.join(', ')}` : ''}.`);
}));

/** Accept a deck id or its title. */
async function deckId(ref: string): Promise<string> {
  const decks = (await api('GET', '/api/decks')) as { id: string; title: string }[];
  const hit = decks.find((k) => k.id === ref) ?? decks.filter((k) => k.title.toLowerCase() === ref.toLowerCase())[0];
  if (!hit) throw new Error(`no deck "${ref}". Known: ${decks.map((k) => `${k.id} (${k.title})`).join(', ') || 'none yet'}`);
  return hit.id;
}

server.registerTool('edgy_deck', {
  description: 'Decks: ordered sets of documents shown as one card and played as slides (the documents stay separate). action: create (title, description, docs in order), read, reorder (docs = all of its documents in the new order), add (docs appended, or inserted at position "at", 0 first), remove (docs taken out), describe (title and/or description), ungroup (the deck goes, its documents stay).',
  inputSchema: {
    action: z.enum(['create', 'read', 'reorder', 'add', 'remove', 'describe', 'ungroup']),
    deck: z.string().optional().describe('Deck id or title (not for create)'),
    docs: z.array(z.string()).optional().describe('Document ids or titles'),
    at: z.number().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
  },
}, safely(async ({ action, deck, docs, at, title, description }) => {
  const ids = await Promise.all((docs ?? []).map(docId));
  const show = async (k: any) => {
    const full = await api('GET', `/api/decks/${k.id}`);
    return text(`${full.id}  "${full.title}"${full.description ? ` — ${full.description}` : ''}\n${full.items.map((d: any, i: number) => `  ${i + 1}. ${d.id} "${d.title}"`).join('\n') || '  (no documents)'}\nPlay it at ${(await link(full.id)).replace('/d/', '/deck/')}/play`);
  };
  if (action === 'create') return show(await api('POST', '/api/decks', { title, description, docs: ids }));
  const id = await deckId(deck ?? '');
  if (action === 'ungroup') {
    await api('DELETE', `/api/decks/${id}`);
    return text(`Ungrouped ${id}; its documents are back in the list.`);
  }
  const cur = await api('GET', `/api/decks/${id}`);
  if (action === 'read') return show(cur);
  if (action === 'describe') return show(await api('PATCH', `/api/decks/${id}`, { ...(title !== undefined ? { title } : {}), ...(description !== undefined ? { description } : {}) }));
  let order: string[] = cur.docs;
  if (action === 'reorder') order = [...ids, ...order.filter((d) => !ids.includes(d))];
  if (action === 'add') {
    const rest = order.filter((d) => !ids.includes(d));
    order = [...rest.slice(0, at ?? rest.length), ...ids, ...rest.slice(at ?? rest.length)];
  }
  if (action === 'remove') order = order.filter((d) => !ids.includes(d));
  return show(await api('PATCH', `/api/decks/${id}`, { docs: order }));
}));

server.registerTool('edgy_share', {
  description: 'Share a document by link. action: on (make the link, access view or edit; anyone with it sees the document in Live, with no editor and no way to other documents; edit lets them change it), off (turn a link off; it then says the document is no longer shared), list (the links that are on). The server listens on this computer, so a link reaches others only once edgy is hosted where they can open it.',
  inputSchema: {
    doc: z.string().describe('Document id or title'),
    action: z.enum(['on', 'off', 'list']),
    access: z.enum(['view', 'edit']).optional(),
  },
}, safely(async ({ doc, action, access }) => {
  const id = await docId(doc);
  const on = (await api('GET', `/api/docs/${id}/shares`)) as { token: string; access: string; url: string }[];
  if (action === 'list') return text(on.length ? on.map((s) => `${s.access}: ${s.url}`).join('\n') : 'Not shared.');
  if (action === 'on') {
    const s = await api('POST', `/api/docs/${id}/shares`, { access: access ?? 'view' });
    return text(`Anyone with this link can ${s.access}: ${s.url}`);
  }
  const off = on.filter((s) => !access || s.access === access);
  for (const s of off) await api('DELETE', `/api/shares/${s.token}`);
  return text(off.length ? `Turned off: ${off.map((s) => s.access).join(', ')}.` : 'There was no such link.');
}));

server.registerTool('edgy_export', {
  description: 'Export a document or a deck as one self-contained .html file that opens from disk with no server and no network: layout, fonts, pictures and icons inside; formulas, inputs and buttons work; a deck plays as slides; records it reads are included as they are now. Give doc or deck, and file (a path to write) to save it; without file you get the address to download it.',
  inputSchema: {
    doc: z.string().optional().describe('Document id or title'),
    deck: z.string().optional().describe('Deck id or title'),
    file: z.string().optional().describe('Where to save the .html, e.g. C:/Users/me/Desktop/quote.html'),
  },
}, safely(async ({ doc, deck, file }) => {
  if (!doc === !deck) throw new Error('give either doc or deck');
  const path = doc ? `/api/docs/${await docId(doc)}/export` : `/api/decks/${await deckId(deck!)}/export`;
  if (!file) return text(`Download it from ${BASE}${path}`);
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(((await res.json().catch(() => null)) as any)?.error ?? `export failed (${res.status})`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const { writeFile } = await import('node:fs/promises');
  await writeFile(file, bytes);
  return text(`Saved ${file} (${(bytes.length / 1024).toFixed(0)} KB). It opens in any browser, offline.`);
}));

server.registerTool('edgy_create', {
  description: 'Create a document. Give root (cell notation) to start with content, or template (quote, savings, feedback). Without either it is a single empty cell.',
  inputSchema: {
    title: z.string().describe('The title people see'),
    root: z.any().optional().describe('Cell notation for the whole document, e.g. ["col", ["text", "Hello"], ["input", {"name": "n", "type": "number", "value": 1}]]'),
    template: z.string().optional(),
  },
}, safely(async ({ title, root, template }) => {
  const doc = await api('POST', '/api/docs', { title, root, template, actor });
  const view = await api('GET', `/api/docs/${doc.id}/read?agent=${encodeURIComponent(AGENT)}`);
  return text(`Created ${doc.id}. Open it at ${await link(doc.id)}\n\n${report(view)}`);
}));

server.registerTool('edgy_read', {
  description: 'Read a document: an outline with every cell\'s id, name, source and current value, plus any errors. Ask for format "notation" or "both" when you need the exact notation to reuse.',
  inputSchema: {
    doc: z.string().describe('Document id or title'),
    format: z.enum(['outline', 'notation', 'both']).optional(),
  },
}, safely(async ({ doc, format }) => {
  const id = await docId(doc);
  const view = await api('GET', `/api/docs/${id}/read?format=${format ?? 'outline'}&agent=${encodeURIComponent(AGENT)}`);
  return text(report(view));
}));

server.registerTool('edgy_apply', {
  description: 'Change a document with ops, applied together or not at all. Examples: ["put", "c1", ["row", "Left", "Right"]], ["split", "c3", "col"], ["set", "qty", "value", 5], ["set", "total", "expr", ["*", "$qty", "$price"]], ["style", "c2", {"bg": "accent-soft"}], ["merge", "c4", "c5"], ["set", "view", "value", "Details"] (open a tab), ["draw", "flow", {"type": "rect", "text": "Ship"}, {"type": "arrow", "from": "pack", "to": "e7"}] (add diagram elements). Returns the new outline and errors; people watching see the change immediately.',
  inputSchema: {
    doc: z.string().describe('Document id or title'),
    ops: z.array(z.array(z.any())).min(1).describe('A list of ops, each ["verb", …args]'),
  },
}, safely(async ({ doc, ops }) => {
  const id = await docId(doc);
  const r = await api('POST', `/api/docs/${id}/ops`, { ops, actor });
  return text(`Applied ${ops.length} op${ops.length === 1 ? '' : 's'}; now version ${r.v}.\n\n${report(r)}`);
}));

server.registerTool('edgy_eval', {
  description: 'Evaluate an expression against a document without changing it, in Lisp syntax, e.g. "(sum (column lines 3))".',
  inputSchema: {
    doc: z.string().describe('Document id or title'),
    src: z.string().describe('The expression in Lisp syntax'),
  },
}, safely(async ({ doc, src }) => {
  const r = await api('POST', `/api/docs/${await docId(doc)}/eval`, { src });
  return text(r.error ? `Error: ${r.error}` : JSON.stringify(r.value));
}));

server.registerTool('edgy_data', {
  description: 'Work with the collections documents save records into. action: "collections" lists them, "rows" reads one, "insert" adds a record, "update" merges the fields of record into the record with id, "delete" removes a record by id, "clear" empties a collection.',
  inputSchema: {
    action: z.enum(['collections', 'rows', 'insert', 'update', 'delete', 'clear']),
    collection: z.string().optional(),
    record: z.record(z.string(), z.any()).optional(),
    id: z.string().optional(),
  },
}, safely(async ({ action, collection, record, id }) => {
  if (action === 'collections') return text(JSON.stringify(await api('GET', '/api/data')));
  if (!collection) throw new Error('name the collection');
  const path = `/api/data/${encodeURIComponent(collection)}`;
  if (action === 'rows') return text(JSON.stringify(await api('GET', path)));
  if (action === 'insert') return text(JSON.stringify(await api('POST', path, { record: record ?? {}, source: { actor } })));
  if (action === 'update') return text(JSON.stringify(await api('PATCH', `${path}/${encodeURIComponent(id ?? '')}`, { fields: record ?? {} })));
  if (action === 'delete') return text(JSON.stringify(await api('DELETE', `${path}/${encodeURIComponent(id ?? '')}`)));
  return text(JSON.stringify(await api('DELETE', path)));
}));

server.registerTool('edgy_say', {
  description: 'Leave a short message in a document\'s Activity panel for the person working there, e.g. what you changed or a question.',
  inputSchema: {
    doc: z.string().describe('Document id or title'),
    text: z.string(),
    cell: z.string().optional().describe('A cell id the message is about'),
  },
}, safely(async ({ doc, text: body, cell }) => {
  const m = await api('POST', `/api/docs/${await docId(doc)}/messages`, { text: body, actor, cell });
  return text(`Sent (message ${m.id}).`);
}));

server.registerTool('edgy_listen', {
  description: 'Wait for the person to write to you in a document\'s Activity panel. Returns their messages, or nothing after the timeout. Pass the id of the last message you saw as after. It also returns compose requests: the person described in words what a cell should compute or do, or how it (or the document) reacts to events, and is waiting (up to 45 seconds) for code; each request says what shape of answer it needs. Answer each one with edgy_answer.',
  inputSchema: {
    doc: z.string().describe('Document id or title'),
    after: z.number().optional().describe('Only messages newer than this message id'),
    timeout: z.number().optional().describe('Seconds to wait, up to 120 (default 30)'),
  },
}, safely(async ({ doc, after, timeout }) => {
  const id = await docId(doc);
  const r = await api('GET', `/api/docs/${id}/messages/wait?after=${after ?? 0}&timeout=${timeout ?? 30}&agent=${encodeURIComponent(AGENT)}`);
  const asked = (r.requests ?? []) as { id: string; prompt: string; cell?: string; cellName?: string; target: string; current?: string }[];
  if (!r.messages.length && !asked.length) return text('Nothing yet.');
  return text([
    ...r.messages.map((m: any) => `#${m.id} ${m.actor.name}${m.cell ? ` (about ${m.cell})` : ''}: ${m.text}`),
    ...asked.map((q) => `Compose request ${q.id} for ${q.cell ? `cell ${q.cellName ?? q.cell}` : 'the document'} (${q.target}): ${JSON.stringify(q.prompt)}. `
      + `Current code: ${q.current?.trim() || '(none)'}. ${wanted(q.target, q.cellName ?? q.cell)} Answer with edgy_answer.`),
  ].join('\n'));
}));

/** What a compose request asks for, in a sentence, so an agent knows the shape of its answer. */
function wanted(target: string, cell?: string): string {
  const who = cell ? `cell ${cell}` : 'the document';
  if (target.startsWith('on.')) {
    return `Write ONE action that ${who} runs on its ${target.slice(3)} event, like a button's action; the event's data is bound by name (change: value, was; click: row, item, element; pick: rows; load: data; fail: message, status; tick: count; a custom event: payload, from).`;
  }
  if (target === 'action') return 'Write ONE custom action for the document: (fn (inputs…) actions…).';
  if (target === 'events') {
    return `Answer with a JSON array of ops for ${who}: ["set", cell, "on.<event>", action], ["meta", "on.open", action], ["meta", "actions.<name>", ["fn", [params], …]], ["set", fetch, "every", seconds], or ["split", <last top-level cell>, "col", {"cell": ["timer", {"name", "every", "on": {"tick": action}}]}] for a new timer (or data/fetch cell).`;
  }
  return '';
}

server.registerTool('edgy_answer', {
  description: 'Answer a compose request from edgy_listen with code in the document\'s Lisp syntax, e.g. "(* qty price)". '
    + 'Write ONE expression for the request\'s target: expr = what the cell shows; do = a button action (set!, toggle!, insert!, delete!, clear!, dup!, remove!, several in (do …)); '
    + 'hidden = a condition that hides the cell while true; style = an expression giving a colour token such as (if (< total 0) "bad" "ink"); '
    + 'options = a list for a select, e.g. (list "S" "M" "L"); compare = a number to compare against; trend = a list of numbers over time. '
    + 'Events (see the Events section of edgy_guide): on.<event> = one handler, an action run when that event reaches the cell (or the document), with the event\'s data bound by name, e.g. for on.change (set! status value); '
    + 'action = a custom action, (fn (who) (set! hello (str "Hi " who))); '
    + 'events = a whole sentence answered with a JSON array of ops, e.g. [["set", "agree", "on.change", ["set!", "status", "$value"]], ["meta", "on.open", ["set!", "visits", ["+", "$visits", 1]]], ["meta", "actions.reset", ["fn", [], ["set!", "qty", 0]]], ["set", "rate", "every", 60]]; '
    + 'new timers, fetches and data cells are added with ["split", <last top-level cell>, "col", {"cell": ["timer", {"name": "every-minute", "every": 60, "on": {"tick": …}}]}]. '
    + 'Use only cell names that exist (edgy_read shows them) and the functions in edgy_guide; actions only for targets do, on.<event>, action and events. '
    + 'Add a one or two sentence explanation for a beginner: what it does and which cells it reads. '
    + 'The code is checked against the document; if it is rejected you get the reason and can call edgy_answer again for the same request.',
  inputSchema: {
    doc: z.string().describe('Document id or title'),
    request: z.string().describe('The request id from edgy_listen, e.g. r7'),
    code: z.union([z.string(), z.array(z.any())]).describe('One expression in Lisp syntax; for target events, the JSON array of ops (as an array or as text)'),
    explanation: z.string().optional().describe('One or two plain sentences for a beginner'),
  },
}, safely(async ({ doc, request, code, explanation }) => {
  const id = await docId(doc);
  try {
    await api('POST', `/api/docs/${id}/compose/${encodeURIComponent(request)}`, { code, explanation, actor });
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    if (/no such request/.test(why)) throw new Error(`Request ${request} is no longer waiting: it was answered or timed out.`);
    throw new Error(`The code was rejected: ${why}. Fix it and call edgy_answer again for ${request}.`);
  }
  return text(`Answered ${request}; the person now sees ${typeof code === 'string' ? code : JSON.stringify(code)}${Array.isArray(code) || /^\s*[[{`]/.test(code) ? ' and can apply it' : ' with a preview'}.`);
}));

await server.connect(new StdioServerTransport());
