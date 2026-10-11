// Everything the docs list that the code already lists: read from the code at
// build time, never copied by hand. The coverage test checks each item here has
// its entry in the pages, and that no entry names something that isn't here.

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { GROUP_KINDS, LEAF_KINDS } from '../../src/core/types';
import { FORMATS, builtinNames } from '../../src/core/sx';
import { DOC_EVENTS, KIND_EVENTS } from '../../src/core/events';
import { OP_VERBS } from '../../src/core/ops';
import { STYLE_KEYS } from '../../src/core/notation';
import { FONTS } from '../../src/core/fonts';
import { TEMPLATES, tour } from '../../src/core/templates';
import { TUTORIALS } from '../../src/core/tutorials';
import { COLOR_TOKENS } from '../../src/web/editor/look';
import { SHORTCUTS, SHORTCUT_PLACES } from '../../src/web/shortcuts';
import { GROUPS, GROUP_COLOR, docFor, signature } from '../../src/web/code/docs';
import { KIND_ABOUT } from '../../src/web/editor/inspector/about';
import { KIND_LABEL } from '../../src/web/editor/ctx';
import { KIND_OPTIONS } from '../../src/web/editor/KindMenu';

/** What the / menu offers for a kind: its entries' labels (none for row, col and panel). */
export const menuLabels = (kind: string): string[] => KIND_OPTIONS.filter((o) => o.kind === kind).map((o) => o.label);
import { TOOLS } from '../../src/mcp/tools';
import { createApp } from '../../src/server/app';
import { Store } from '../../src/server/store';
import type { Need } from '../../src/server/access';

export const KINDS = [...GROUP_KINDS, ...LEAF_KINDS] as string[];
export { FONTS, GROUPS, GROUP_COLOR, KIND_ABOUT, KIND_LABEL, SHORTCUTS, SHORTCUT_PLACES, TEMPLATES };

export interface FnInfo { name: string; group: string; use: string; does: string; color: string }

/** Every function the interpreter knows, with its signature and group from the code studio's reference. */
export function functions(): FnInfo[] {
  return builtinNames().map((name) => {
    const d = docFor(name);
    const sig = signature(name);
    const group = d?.group ?? 'Logic';
    return { name, group, use: sig?.head ? `(${[sig.head, ...sig.args].join(' ')})` : d?.use ?? `(${name} …)`, does: d?.does ?? '', color: GROUP_COLOR[group] };
  });
}

export interface EventInfo { name: string; from: string; kinds: { kind: string; data: string }[]; doc?: string }

/** Every event, with the kinds that raise it and the data each binds. */
export function events(): EventInfo[] {
  const by = new Map<string, EventInfo>();
  const get = (name: string, from: string) => {
    let e = by.get(name);
    if (!e) by.set(name, (e = { name, from, kinds: [] }));
    return e;
  };
  for (const [kind, k] of Object.entries(KIND_EVENTS)) for (const r of k.raises) get(r.name, r.from).kinds.push({ kind, data: r.data });
  for (const d of DOC_EVENTS) get(d.name, d.from).doc = d.data;
  return [...by.values()];
}

/** The events one kind raises. */
export const eventsOf = (kind: string) => KIND_EVENTS[kind]?.raises ?? [];

export const ops = (): string[] => [...OP_VERBS];
export const styleKeys = (): string[] => [...STYLE_KEYS];
export const formats = (): string[] => [...FORMATS];
export const tokens = (): string[] => [...COLOR_TOKENS];
export const templates = () => [...TEMPLATES, tour, ...TUTORIALS].map((t) => ({ id: t.id, title: t.title, about: t.about }));

export interface RouteInfo { method: string; path: string; need: Need }

let routeCache: RouteInfo[] | null = null;
/** Every /api route and what it needs, read from the app's own route table (no server runs). */
export function routes(): RouteInfo[] {
  if (routeCache) return routeCache;
  const { app } = createApp(new Store(':memory:'), join(mkdtempSync(join(tmpdir(), 'edgy-docs-')), 'assets'), undefined, { auth: 'accounts' });
  const seen = new Map<string, RouteInfo>();
  for (const r of app.routes) {
    if (!r.path.startsWith('/api/') || r.method === 'ALL') continue;
    const need = (r.handler as { need?: Need }).need;
    if (need !== undefined) seen.set(`${r.method} ${r.path}`, { method: r.method, path: r.path, need });
  }
  return (routeCache = [...seen.values()]);
}

/** What a route needs, in the docs' words. */
export function sayNeed(n: Need): string {
  if (n === 'public') return 'Nobody needs to be signed in.';
  if (n === 'in') return 'Anyone signed in, or a guest with a share link.';
  if (n === 'user') return 'A person: signed in, an agent with their API key, or local mode.';
  if (n === 'person') return 'The person themselves, signed in (not an agent with their key).';
  if ('guest' in n) return 'A guest who opened a share link.';
  if ('deck' in n) return 'The owner of the deck.';
  const link = n.link ? `, or a guest with a${n.link === 'edit' ? 'n edit' : ' view'} link` : '';
  if ('doc' in n) return n.doc === 'owner' ? `The owner of the document${link}.` : `${n.doc === 'view' ? 'View' : 'Edit'} access to the document${link}.`;
  return `${n.data === 'read' ? 'Reading' : 'Writing'} the collection: your own, or through a document (?doc=) you may ${n.data === 'read' ? 'view' : 'edit'}${link}.`;
}

export interface ToolInfo { name: string; description: string; params: { name: string; type: string; optional: boolean; about: string }[] }

/** Every MCP tool, as the server registers it. */
export function tools(): ToolInfo[] {
  return TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    params: Object.entries(t.inputSchema).map(([name, schema]) => describeParam(name, schema)),
  }));
}

function describeParam(name: string, schema: z.ZodType) {
  let s = schema;
  let optional = false;
  if (s instanceof z.ZodOptional) {
    optional = true;
    s = s.unwrap() as z.ZodType;
  }
  const about = s.description ?? schema.description ?? '';
  let type = 'value';
  if (s instanceof z.ZodString) type = 'text';
  else if (s instanceof z.ZodNumber) type = 'number';
  else if (s instanceof z.ZodBoolean) type = 'true or false';
  else if (s instanceof z.ZodEnum) type = (s.options as string[]).map((o) => `"${o}"`).join(' | ');
  else if (s instanceof z.ZodArray) type = 'list';
  else if (s instanceof z.ZodUnion) type = 'text or list';
  else if (s instanceof z.ZodRecord || s instanceof z.ZodObject) type = 'object';
  return { name, type, optional, about };
}

/** Every list the coverage test walks, by the entry type that documents its items. */
export function catalog(): Record<string, string[]> {
  return {
    kind: KINDS,
    fn: builtinNames(),
    event: events().map((e) => e.name),
    op: ops(),
    route: routes().map((r) => `${r.method} ${r.path}`),
    tool: TOOLS.map((t) => t.name),
    style: styleKeys(),
    format: formats(),
    token: tokens(),
    key: SHORTCUTS.map((s) => s.id),
    template: templates().map((t) => t.id),
  };
}
