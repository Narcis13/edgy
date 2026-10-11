// What the custom blocks render to. Every list here is read from the code
// (catalog.ts); the prose around it is in the pages.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import type { Json } from '../../src/core/types';
import { newDoc } from '../../src/core/types';
import { applyOp } from '../../src/core/ops';
import { collectionsUsed } from '../../src/core/events';
import { TEMPLATES, tour } from '../../src/core/templates';
import { TUTORIALS } from '../../src/core/tutorials';
import * as C from './catalog';
import { type Blocks, type EntryType, type Example, type PageCtx, codeBlock, tableWrap } from './markdown';
import { entryId, rel } from './ids';
import { esc, highlightJson } from './highlight';
import { DIAGRAMS } from '../diagrams';

export const SITE = join(import.meta.dirname, '..');

const code = (s: string) => `<code>${esc(s)}</code>`;
const kbd = (k: string) => k.split('+').map((p) => `<kbd>${esc(p === 'Mod' ? '⌘/Ctrl' : p === 'Alt' ? '⌥/Alt' : p === 'Arrow' ? 'arrow' : p)}</kbd>`).join('+');
export const keysHtml = (keys: string[]) => keys.map(kbd).join(' <span class="or">or</span> ');

/** A link to an entry, or plain text with an error when the entry is missing. */
function entryLink(ctx: PageCtx, type: string, name: string, text = code(name)): string {
  const id = entryId(type, name);
  const page = ctx.anchors.get(id);
  if (page === undefined) {
    ctx.errors.push(`${type} "${name}" has no entry (::: ${type} ${name})`);
    return text;
  }
  return `<a href="${page === ctx.page ? '' : rel(ctx.page, page)}#${id}">${text}</a>`;
}

const kindLink = (ctx: PageCtx, kind: string) => {
  const page = `cells/${kind}/`;
  if (!ctx.pages.has(page)) ctx.errors.push(`kind "${kind}" has no page`);
  return `<a href="${rel(ctx.page, page)}">${code(kind)}</a>`;
};

const table = (head: string[], rows: string[][], label: string) =>
  tableWrap(`<table class="ref"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('\n')}</tbody></table>`, label);

const inline = (links: string[], label: string) => `<p class="ref-inline" aria-label="${label}">${links.join(' ')}</p>\n`;

const groupChip = (group: string) => `<span class="group" style="--group: ${C.GROUP_COLOR[group as keyof typeof C.GROUP_COLOR]}">${esc(group)}</span>`;

/** The page summaries a section index lists. */
export interface PageInfo { page: string; title: string; summary: string }
let pageInfo = new Map<string, PageInfo>();
export const setPageInfo = (m: Map<string, PageInfo>) => void (pageInfo = m);
/** Every entry and explicit anchor in the site, for the A–Z. */
let index: { id: string; label: string; type: string; page: string }[] = [];
export const setIndex = (list: typeof index) => void (index = list);

const TYPE_NAMES: Record<string, string> = {
  fn: 'function', event: 'event', op: 'op', route: 'route', tool: 'MCP tool', style: 'style key', format: 'format',
  token: 'colour token', key: 'shortcut', template: 'template', term: 'glossary', kind: 'cell',
};

/** Everything, A to Z: pages, kinds, entries and glossary words, each with what it is. */
function aToZ(ctx: PageCtx): string {
  const items: { label: string; href: string; what: string }[] = [];
  for (const p of pageInfo.values()) {
    if (p.page === '' || p.page === ctx.page) continue;
    const kind = /^cells\/([\w-]+)\/$/.exec(p.page);
    items.push({ label: kind ? kind[1] : p.title, href: rel(ctx.page, p.page), what: kind ? 'cell' : 'page' });
  }
  for (const a of index) {
    if (a.type === 'key') continue;
    items.push({ label: a.label, href: `${rel(ctx.page, a.page)}#${a.id}`, what: TYPE_NAMES[a.type] ?? 'section' });
  }
  const letter = (s: string) => (/^[a-z]/i.test(s) ? s[0].toUpperCase() : '#');
  items.sort((a, b) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }) || a.what.localeCompare(b.what));
  const groups = new Map<string, typeof items>();
  for (const i of items) (groups.get(letter(i.label)) ?? groups.set(letter(i.label), []).get(letter(i.label))!).push(i);
  const letters = [...groups.keys()].sort((a, b) => (a === '#' ? -1 : b === '#' ? 1 : a.localeCompare(b)));
  const jump = `<nav class="az-jump" aria-label="Letters">${letters.map((l) => `<a href="#az-${l === '#' ? 'symbols' : l.toLowerCase()}">${l}</a>`).join('')}</nav>`;
  return jump + letters.map((l) => {
    const id = `az-${l === '#' ? 'symbols' : l.toLowerCase()}`;
    ctx.used.add(id);
    return `<h2 id="${id}">${l === '#' ? 'Symbols' : l}</h2>
<ul class="az">${groups.get(l)!.map((i) => `<li><a href="${i.href}">${esc(i.label)}</a> <span class="muted">${esc(i.what)}</span></li>`).join('')}</ul>
`;
  }).join('');
}

function ref(ctx: PageCtx, list: string, arg: string): string {
  switch (list) {
    case 'functions': {
      const fns = C.functions().filter((f) => !arg || f.group.toLowerCase() === arg.toLowerCase());
      return table(['Function', 'Written', 'What it does', ...(arg ? [] : ['Group'])],
        fns.map((f) => [entryLink(ctx, 'fn', f.name), code(f.use), esc(f.does), ...(arg ? [] : [groupChip(f.group)])]), arg ? `${arg} functions` : 'Every function');
    }
    case 'kinds':
      return table(['Kind', 'Called', 'What it is for'], C.KINDS.map((k) => [kindLink(ctx, k), esc(C.KIND_LABEL[k] ?? k), esc(C.KIND_ABOUT[k as keyof typeof C.KIND_ABOUT] ?? '')]), 'Every kind of cell');
    case 'kind': {
      const k = arg;
      if (!C.KINDS.includes(k)) {
        ctx.errors.push(`::ref kind ${k}: no such kind`);
        return '';
      }
      const evs = C.eventsOf(k);
      const group = ['row', 'col', 'tabs', 'accordion', 'collapsible', 'panel'].includes(k);
      return `<dl class="facts"><div><dt>In notation</dt><dd>${code(`["${k}", …]`)}</dd></div><div><dt>In the / menu</dt><dd>${C.menuLabels(k).length ? C.menuLabels(k).map((l) => `<b>${esc(l)}</b>`).join(', ') : k === 'panel' ? 'no: made with tabs or an accordion' : 'no: made by splitting'}</dd></div><div><dt>Holds</dt><dd>${group ? 'other cells' : 'no other cells'}</dd></div><div><dt>Raises</dt><dd>${evs.length ? evs.map((e) => entryLink(ctx, 'event', e.name)).join(', ') : 'no events'}</dd></div></dl>\n`;
    }
    case 'events':
      return table(['Event', 'Raised by', 'Comes from'], C.events().map((e) => [entryLink(ctx, 'event', e.name), [...e.kinds.map((k) => kindLink(ctx, k.kind)), ...(e.doc ? ['the document'] : [])].join(', '), esc(FROM[e.from] ?? e.from)]), 'Every event');
    case 'events-of': {
      const evs = C.eventsOf(arg);
      if (!evs.length) return `<p class="muted">A ${esc(arg)} cell raises no events.</p>\n`;
      return table(['Event', 'Its data'], evs.map((e) => [entryLink(ctx, 'event', e.name), esc(e.data)]), `Events a ${arg} raises`);
    }
    case 'ops':
      return inline(C.ops().map((o) => entryLink(ctx, 'op', o)), 'Every op');
    case 'routes':
      return table(['Route', 'Who may call it'], C.routes().map((r) => [entryLink(ctx, 'route', `${r.method} ${r.path}`, code(`${r.method} ${r.path}`)), esc(C.sayNeed(r.need))]), 'Every route');
    case 'tools':
      return table(['Tool', 'What it does'], C.tools().map((t) => [entryLink(ctx, 'tool', t.name), esc(firstSentence(t.description))]), 'Every MCP tool');
    case 'style-keys':
      return inline(C.styleKeys().map((k) => entryLink(ctx, 'style', k)), 'Every style key');
    case 'formats':
      return inline(C.formats().map((k) => entryLink(ctx, 'format', k)), 'Every format');
    case 'tokens':
      return table(['Token', 'Looks like'], C.tokens().map((t) => [entryLink(ctx, 'token', t), swatch(t)]), 'Every colour token');
    case 'fonts':
      return table(['Font id', 'Name', 'Group'], C.FONTS.map((f) => [code(f.id), esc(f.label), esc(f.group)]), 'Every font');
    case 'shortcuts': {
      const places = Object.keys(C.SHORTCUT_PLACES).filter((p) => !arg || p === arg);
      return places.map((p) => {
        const keys = C.SHORTCUTS.filter((s) => s.where === p);
        return `${arg ? '' : `<h3 class="ref-group">${esc(C.SHORTCUT_PLACES[p as keyof typeof C.SHORTCUT_PLACES])}</h3>\n`}${table(['Keys', 'What they do'], keys.map((s) => [keysHtml(s.keys), entryLink(ctx, 'key', s.id, esc(s.does))]), C.SHORTCUT_PLACES[p as keyof typeof C.SHORTCUT_PLACES])}`;
      }).join('');
    }
    case 'templates':
      return table(['Template', 'Title', 'What it shows'], C.templates().map((t) => [entryLink(ctx, 'template', t.id), esc(t.title), esc(t.about)]), 'Every template');
    case 'pages': {
      const pages = arg.split(',').map((p) => p.trim()).filter(Boolean);
      return `<ul class="page-list">${pages.map((p) => {
        const info = pageInfo.get(p);
        if (!info) {
          ctx.errors.push(`::ref pages: no page ${p}`);
          return '';
        }
        return `<li><a href="${rel(ctx.page, p)}">${esc(info.title)}</a><span>${esc(info.summary)}</span></li>`;
      }).join('')}</ul>\n`;
    }
    case 'a-z':
      return aToZ(ctx);
    default:
      ctx.errors.push(`::ref ${list}: no such list`);
      return '';
  }
}

const FROM: Record<string, string> = { pointer: 'a click or tap', change: 'a value changing', lifecycle: 'opening or leaving the document', runner: 'the server, while the document is open in Live' };

export const firstSentence = (s: string) => {
  const m = /^.*?[.!?](?=\s|$)/.exec(s.trim());
  return m ? m[0] : s.trim();
};

const swatch = (token: string) => `<span class="swatch" style="--swatch: var(--${token})"></span>`;

function entryHead(ctx: PageCtx, type: EntryType, name: string, level: number, id: string): string {
  const h = (inner: string) => `<h${level} id="${id}" class="entry-head">${inner}<a class="anchor" href="#${id}" aria-label="Link to ${esc(name)}">#</a></h${level}>`;
  switch (type) {
    case 'fn': {
      const f = C.functions().find((x) => x.name === name);
      if (!f) ctx.errors.push(`::: fn ${name}: the interpreter has no function "${name}"`);
      return h(code(name)) + (f ? `<p class="entry-facts">${code(f.use)} ${groupChip(f.group)}</p>` : '');
    }
    case 'event': {
      const e = C.events().find((x) => x.name === name);
      if (!e) {
        ctx.errors.push(`::: event ${name}: no such event`);
        return h(code(name));
      }
      const rows = e.kinds.map((k) => [kindLink(ctx, k.kind), esc(k.data)]);
      if (e.doc) rows.push(['the document', esc(e.doc)]);
      return h(code(name)) + table(['Raised by', 'The data it binds'], rows, `Who raises ${name}`);
    }
    case 'route': {
      const r = C.routes().find((x) => `${x.method} ${x.path}` === name);
      if (!r) ctx.errors.push(`::: route ${name}: the app has no such route`);
      return h(code(name)) + (r ? `<p class="entry-facts">${esc(C.sayNeed(r.need))}</p>` : '');
    }
    case 'tool': {
      const t = C.tools().find((x) => x.name === name);
      if (!t) {
        ctx.errors.push(`::: tool ${name}: the MCP server has no such tool`);
        return h(code(name));
      }
      const params = t.params.length
        ? table(['Parameter', 'Type', 'About'], t.params.map((p) => [code(p.name) + (p.optional ? ' <span class="muted">optional</span>' : ''), esc(p.type), esc(p.about)]), `${name} parameters`)
        : '<p class="entry-facts">No parameters.</p>';
      return h(code(name)) + params;
    }
    case 'token':
      if (!C.tokens().includes(name)) ctx.errors.push(`::: token ${name}: no such colour token`);
      return h(`${swatch(name)} ${code(name)}`);
    case 'key': {
      const s = C.SHORTCUTS.find((x) => x.id === name);
      if (!s) {
        ctx.errors.push(`::: key ${name}: no shortcut with that id in src/web/shortcuts.ts`);
        return h(esc(name));
      }
      return h(keysHtml(s.keys)) + `<p class="entry-facts">${esc(C.SHORTCUT_PLACES[s.where])}: ${esc(s.does)}</p>`;
    }
    case 'template': {
      const t = C.templates().find((x) => x.id === name);
      if (!t) ctx.errors.push(`::: template ${name}: no such template`);
      return h(`${esc(t?.title ?? name)} ${code(name)}`) + (t ? `<p class="entry-facts">${esc(t.about)} <button type="button" class="btn small js-only" data-open-template="${esc(name)}" hidden>Open in edgy</button></p>` : '');
    }
    case 'op':
      if (!C.ops().includes(name)) ctx.errors.push(`::: op ${name}: applyOp has no such verb`);
      return h(code(name));
    case 'style':
      if (!C.styleKeys().includes(name)) ctx.errors.push(`::: style ${name}: no such style key`);
      return h(code(name));
    case 'format':
      if (!(C.formats() as string[]).includes(name)) ctx.errors.push(`::: format ${name}: no such format`);
      return h(code(name));
  }
}

/** The shots manifest written by site/scripts/shoot.mjs: size and numbered marks of each screenshot. */
interface ShotInfo { w: number; h: number; alt: string; marks?: { x: number; y: number; label: string }[] }
let shots: Record<string, ShotInfo> | null = null;
const shotInfo = (): Record<string, ShotInfo> => (shots ??= existsSync(join(SITE, 'shots/shots.json')) ? JSON.parse(readFileSync(join(SITE, 'shots/shots.json'), 'utf8')) : {});
/** Shots and clips a page asked for that have not been made yet. */
export const missing = new Set<string>();

function shot(ctx: PageCtx, name: string, caption: string): string {
  const info = shotInfo()[name];
  const has = existsSync(join(SITE, `shots/${name}-light.webp`)) && existsSync(join(SITE, `shots/${name}-dark.webp`));
  if (!info || !has) missing.add(`shot ${name}`);
  const src = (t: string) => `${rel(ctx.page, `_/shots/${name}-${t}.webp`)}`;
  const size = info ? ` width="${info.w}" height="${info.h}"` : '';
  const alt = esc(info?.alt ?? caption);
  const marks = info?.marks ?? [];
  const pins = marks.map((m, i) => `<span class="pin" style="left:${m.x}%;top:${m.y}%" aria-hidden="true">${i + 1}</span>`).join('');
  const legend = marks.length ? `<ol class="legend">${marks.map((m) => `<li>${esc(m.label)}</li>`).join('')}</ol>` : '';
  return `<figure class="shot"><div class="shot-frame"><img class="only-light" src="${src('light')}" alt="${alt}"${size} loading="lazy" decoding="async"><img class="only-dark" src="${src('dark')}" alt="${alt}"${size} loading="lazy" decoding="async">${pins}</div>${caption || legend ? `<figcaption>${esc(caption)}${legend}</figcaption>` : ''}</figure>\n`;
}

function clip(ctx: PageCtx, name: string, caption: string): string {
  const has = ['light', 'dark'].every((t) => existsSync(join(SITE, `clips/${name}-${t}.webm`)) && existsSync(join(SITE, `clips/${name}-${t}.webp`)));
  if (!has) missing.add(`clip ${name}`);
  const v = (t: string) => `<video class="only-${t}" src="${rel(ctx.page, `_/clips/${name}-${t}.webm`)}" poster="${rel(ctx.page, `_/clips/${name}-${t}.webp`)}" muted loop playsinline preload="none" controls aria-label="${esc(caption)}"></video>`;
  return `<figure class="clip">${v('light')}${v('dark')}<figcaption>${esc(caption)}</figcaption></figure>\n`;
}

function diagram(ctx: PageCtx, name: string): string {
  const D = DIAGRAMS[name];
  if (!D) {
    missing.add(`diagram ${name}`);
    return `<figure class="diagram"><p class="muted">Diagram ${esc(name)} is not drawn yet.</p></figure>
`;
  }
  return `<figure class="diagram">${renderToStaticMarkup(createElement(D))}</figure>\n`;
}

/** A live example's document: notation, or {root, meta, data}, or a template (template=<id>). */
export interface LiveSource { title: string; root: Json; meta?: Record<string, Json>; data?: Record<string, Record<string, Json>[]> }

export function liveSource(ex: Example): LiveSource {
  const t = ex.attrs.template;
  if (t) {
    const tpl = [...TEMPLATES, tour, ...TUTORIALS].find((x) => x.id === t);
    if (!tpl) throw new Error(`live template=${t}: no such template`);
    return { title: ex.attrs.title ?? tpl.title, root: tpl.root, meta: tpl.meta, data: tpl.data };
  }
  const body = JSON.parse(ex.source) as Json;
  if (Array.isArray(body)) return { title: ex.attrs.title ?? 'Example', root: body };
  const o = body as { root: Json; meta?: Record<string, Json>; data?: Record<string, Record<string, Json>[]> };
  return { title: ex.attrs.title ?? 'Example', root: o.root, meta: o.meta, data: o.data };
}

function live(ctx: PageCtx, ex: Example): string {
  let src: LiveSource;
  let usesRecords = false;
  try {
    src = liveSource(ex);
    const doc = applyOp(newDoc('example'), ['put', 'c1', src.root]).doc;
    usesRecords = collectionsUsed(doc).length > 0;
  } catch (e) {
    ctx.errors.push(`live example ${ex.id}: ${e instanceof Error ? e.message : String(e)}`);
    return '';
  }
  const height = Number(ex.attrs.height ?? 240);
  const notation = JSON.stringify(src.root, null, 1).replace(/\n\s*/g, (m) => '\n' + ' '.repeat(Math.max(0, m.length - 2)));
  const data = JSON.stringify({ ...src, template: ex.attrs.template ?? null }).replace(/</g, '\\u003c');
  const note = usesRecords ? 'Runs in this page. Records it saves live in memory and are gone when you leave.' : 'Runs in this page. Nothing you change is saved.';
  return `<figure class="live" id="live-${ex.id}">
<div class="live-box" data-live="${ex.id}" style="height:${height}px"><p class="live-wait">This example runs here when JavaScript is on: the notation is below.</p></div>
<figcaption class="live-bar"><span class="live-title">${esc(src.title)}</span><span class="live-note">${note}</span><span class="live-acts"><button type="button" class="btn small js-only" data-live-reset="${ex.id}">Start over</button><button type="button" class="btn small" data-open-live="${ex.id}" hidden>Open in edgy</button></span></figcaption>
<details class="live-src"><summary>Its notation</summary>${codeBlock(highlightJson(notation), 'Notation')}</details>
<script type="application/json" data-live-src="${ex.id}">${data}</script>
</figure>\n`;
}

export const blocks: Blocks = { ref, entryHead, shot, clip, diagram, live };
