// The whole site in memory: every page read, lexed, linked and rendered. The
// build writes it out; the tests (coverage, doc-tests, links) read it as is.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Token, Tokens } from 'marked';
import { NAV, navPages } from '../nav';
import { type Example, type Heading, type PageCtx, lexPage, renderTokens } from './markdown';
import { type PageInfo, SITE, blocks, firstSentence, setIndex, setPageInfo } from './blocks';
import { pageOf } from './ids';
import { type PageView, renderPage } from './layout';
import { type SearchEntry, searchEntries } from './search';

export interface SitePage {
  file: string;
  page: string;
  title: string;
  summary: string;
  front: Record<string, string>;
  tokens: Token[];
  examples: Example[];
  anchors: string[];
  html: string;
  headings: Heading[];
  errors: string[];
}

export interface Site {
  pages: SitePage[];
  byPage: Map<string, SitePage>;
  anchors: Map<string, string>;
  errors: string[];
}

export const CONTENT = join(SITE, 'content');

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (name.endsWith('.md')) out.push(p);
  }
  return out;
}

/** `---\ntitle: X\n---` at the top: simple key: value lines. */
function frontMatter(src: string): { front: Record<string, string>; body: string; bodyLine: number } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(src);
  if (!m) return { front: {}, body: src, bodyLine: 1 };
  const front: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^(\w+):\s*(.*)$/.exec(line);
    if (kv) front[kv[1]] = kv[2].trim().replace(/^"(.*)"$/, '$1');
  }
  return { front, body: src.slice(m[0].length), bodyLine: m[1].split('\n').length + 3 };
}

const plainText = (t: Token): string => {
  const kids = (t as { tokens?: Token[] }).tokens;
  if (Array.isArray(kids)) return kids.map(plainText).join('');
  return (t as { text?: string }).text ?? '';
};

let cached: Site | null = null;

/** Read, lex and render every page. */
export function loadSite(fresh = false): Site {
  if (cached && !fresh) return cached;
  const raw = files(CONTENT).map((f) => {
    const file = relative(CONTENT, f).replace(/\\/g, '/');
    const page = pageOf(file);
    const { front, body, bodyLine } = frontMatter(readFileSync(f, 'utf8').replace(/\r\n/g, '\n'));
    const lexed = lexPage(page, body, bodyLine);
    const first = lexed.tokens.find((t) => t.type === 'paragraph') as Tokens.Paragraph | undefined;
    const summary = front.summary ?? (first ? firstSentence(plainText(first).replace(/\s+/g, ' ')) : '');
    return { file, page, title: front.title ?? page, summary, front, ...lexed };
  });
  const errors: string[] = [];
  const anchors = new Map<string, string>();
  for (const p of raw) {
    if (!p.front.title) errors.push(`${p.file}: no title in the front matter`);
    for (const a of p.anchors) {
      if (anchors.has(a)) errors.push(`${p.file}: #${a} is also on ${anchors.get(a) || '(home)'}`);
      anchors.set(a, p.page);
    }
  }
  const pages = new Set(raw.map((p) => p.page));
  setPageInfo(new Map<string, PageInfo>(raw.map((p) => [p.page, { page: p.page, title: p.front.nav ?? p.title, summary: p.summary }])));
  setIndex(raw.flatMap((p) => p.labels.map((l) => ({ ...l, page: p.page }))));
  const out: SitePage[] = raw.map((p) => {
    const ctx: PageCtx = { page: p.page, anchors, pages, headings: [], examples: p.examples, errors: [], blocks, used: new Set(['main', 'side', 'toc-title']) };
    const html = renderTokens(ctx, p.tokens);
    return { ...p, html, headings: ctx.headings, errors: ctx.errors.map((e) => `${p.file}: ${e}`) };
  });
  for (const p of out) errors.push(...p.errors);
  cached = { pages: out, byPage: new Map(out.map((p) => [p.page, p])), anchors, errors };
  return cached;
}

/** Every page as HTML, by its output path; plus the search index and the page list. */
export function renderSite(site: Site, assets: PageView['assets']): { files: Map<string, string>; search: SearchEntry[] } {
  const order = navPages();
  const titles = new Map(site.pages.map((p) => [p.page, p.front.nav ?? p.title]));
  const files = new Map<string, string>();
  for (const p of site.pages) {
    const i = order.findIndex((o) => o.page === p.page);
    const here = order[i];
    const same = (j: number) => (order[j] && here && order[j].path === here.path ? order[j] : undefined);
    const prev = i >= 0 ? same(i - 1) : undefined;
    const next = i >= 0 ? same(i + 1) : p.page === '' ? order[0] : undefined;
    const first = here?.section.pages.find((x): x is string => typeof x === 'string');
    const sectionIndex = first && site.byPage.get(first)?.file.endsWith('index.md') ? first : undefined;
    const view: PageView = {
      page: p.page, file: p.file, title: p.title, summary: p.summary, html: p.html, headings: p.headings,
      path: here?.path, section: here?.section.title, sectionIndex,
      prev: prev && { page: prev.page, title: titles.get(prev.page) ?? prev.page },
      next: next && { page: next.page, title: titles.get(next.page) ?? next.page },
      titles, assets,
    };
    files.set(p.page + 'index.html', renderPage(view));
  }
  return { files, search: searchEntries(site) };
}

export { NAV };
