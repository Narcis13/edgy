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

server.registerTool('edgy_docs', {
  description: 'List the documents, newest first, with a link a person can open.',
  inputSchema: {},
}, safely(async () => {
  const docs = (await api('GET', '/api/docs')) as { id: string; title: string; v: number; updatedAt: number }[];
  if (!docs.length) return text('No documents yet. Create one with edgy_create.');
  const lines = await Promise.all(docs.map(async (d) => `${d.id}  "${d.title}"  version ${d.v}, changed ${new Date(d.updatedAt).toISOString()}  ${await link(d.id)}`));
  return text(lines.join('\n'));
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
  description: 'Wait for the person to write to you in a document\'s Activity panel. Returns their messages, or nothing after the timeout. Pass the id of the last message you saw as after. It also returns compose requests: the person described in words what a cell should compute or do and is waiting (up to 45 seconds) for code; answer each one with edgy_answer.',
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
      + `Current code: ${q.current?.trim() || '(none)'}. Answer with edgy_answer.`),
  ].join('\n'));
}));

server.registerTool('edgy_answer', {
  description: 'Answer a compose request from edgy_listen with code in the document\'s Lisp syntax, e.g. "(* qty price)". '
    + 'Write ONE expression for the request\'s target: expr = what the cell shows; do = a button action (set!, toggle!, insert!, delete!, clear!, dup!, remove!, several in (do …)); '
    + 'hidden = a condition that hides the cell while true; style = an expression giving a colour token such as (if (< total 0) "bad" "ink"); '
    + 'options = a list for a select, e.g. (list "S" "M" "L"); compare = a number to compare against; trend = a list of numbers over time. '
    + 'Use only cell names that exist (edgy_read shows them) and the functions in edgy_guide; actions only for target do. '
    + 'Add a one or two sentence explanation for a beginner: what it does and which cells it reads. '
    + 'The code is checked against the document; if it is rejected you get the reason and can call edgy_answer again for the same request.',
  inputSchema: {
    doc: z.string().describe('Document id or title'),
    request: z.string().describe('The request id from edgy_listen, e.g. r7'),
    code: z.string().describe('One expression in Lisp syntax'),
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
  return text(`Answered ${request}; the person now sees ${code} with a preview.`);
}));

await server.connect(new StdioServerTransport());
