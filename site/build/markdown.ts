// The page format: Markdown (GitHub's flavour) plus a few blocks of edgy's own.
//
//   ::: fn sum-by            an entry: the heading and the facts that live in code are generated,
//   …prose…                  the prose under it is written by hand. Types: fn, event, op, route,
//   :::                      tool, style, format, token, key, template.
//
//   ::ref functions          a table generated from the code (see refs.tsx)
//   ::diagram op-life        an inline SVG from site/diagrams
//   ::shot editor "Caption"  a screenshot of the real app, light and dark, with its numbered marks
//   ::clip split "Caption"   a short muted loop with a poster
//
//   ```sx                    an expression, coloured as in the code studio; lines starting with ⇒
//   (+ 1 2)                  give the result, and make the block a doc-test. `in=<id>` runs it
//   ⇒ 3                      against the document of the live or notation block with that id.
//   ```
//   ```live id=counter title="A counter"   a real document running in the page (notation)
//   ```notation id=shop      notation, checked to build
//   ```ops in=shop           ops, checked to apply to that document
//
//   > [!NOTE] / [!TIP] / [!WARNING]   a callout
//
// Links: [text](/cells/table/) is a page (made relative), [text](fn:sum-by) an entry,
// [text](kind:table) a kind's page, [text](src:src/core/ops.ts) a file on GitHub.

import { Marked, type Token, type Tokens } from 'marked';
import { entryId, rel, slug, sourceUrl } from './ids';
import { esc, highlightJson, highlightSx } from './highlight';

export const ENTRY_TYPES = ['fn', 'event', 'op', 'route', 'tool', 'style', 'format', 'token', 'key', 'template'] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

/** One example block, kept for the doc-tests and the live examples. */
export interface Example {
  page: string;
  lang: 'sx' | 'live' | 'notation' | 'ops';
  id?: string;
  /** The document this block runs against (`in=`). */
  in?: string;
  source: string;
  attrs: Record<string, string>;
  line: number;
}

export interface Heading { depth: number; id: string; text: string }

/** What a page tells the renderer, and what rendering it finds out. */
export interface PageCtx {
  page: string;
  /** Anchor id → the page that holds it, across the whole site (entries and explicit {#ids}). */
  anchors: Map<string, string>;
  /** Pages that exist. */
  pages: Set<string>;
  headings: Heading[];
  examples: Example[];
  errors: string[];
  /** Renders a ::ref, an entry's generated head, a shot, a clip or a diagram. */
  blocks: Blocks;
  used: Set<string>;
}

export interface Blocks {
  ref(ctx: PageCtx, list: string, arg: string): string;
  entryHead(ctx: PageCtx, type: EntryType, name: string, level: number, id: string): string;
  shot(ctx: PageCtx, name: string, caption: string): string;
  clip(ctx: PageCtx, name: string, caption: string): string;
  diagram(ctx: PageCtx, name: string): string;
  live(ctx: PageCtx, ex: Example): string;
}

/** `id=counter title="A counter" height=320` → {id, title, height}. */
export function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/([\w-]+)=(?:"([^"]*)"|(\S+))/g)) out[m[1]] = m[2] ?? m[3];
  return out;
}

const plain = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

interface EntryToken { type: 'entry'; raw: string; etype: EntryType; name: string; level: number; tokens: Token[] }
interface DirectiveToken { type: 'directive'; raw: string; name: string; arg: string; caption: string }

let ctx: PageCtx;

/** A link written in the page → the URL it points to from this page. */
export function resolveHref(c: PageCtx, href: string): string {
  const m = /^(fn|event|op|route|tool|style|format|token|key|template|term|kind|src):(.+)$/.exec(href);
  if (m) {
    const [, scheme, name] = m;
    if (scheme === 'src') return sourceUrl(name);
    if (scheme === 'kind') {
      const page = `cells/${name}/`;
      if (!c.pages.has(page)) c.errors.push(`link to kind "${name}": no page ${page}`);
      return rel(c.page, page);
    }
    const id = scheme === 'term' ? `term-${slug(name)}` : entryId(scheme, name);
    const page = c.anchors.get(id);
    if (page === undefined) {
      c.errors.push(`link ${href}: no entry #${id} anywhere`);
      return '#' + id;
    }
    return (page === c.page ? '' : rel(c.page, page)) + '#' + id;
  }
  if (href.startsWith('/')) {
    const [path, hash] = href.slice(1).split('#');
    const page = path === '' || path.endsWith('/') ? path : path + '/';
    if (!c.pages.has(page)) c.errors.push(`link ${href}: no page ${page || '(home)'}`);
    return (page === c.page && hash ? '' : rel(c.page, page)) + (hash ? '#' + hash : '');
  }
  return href;
}

function headingHtml(depth: number, id: string, inner: string, cls = ''): string {
  return `<h${depth} id="${id}"${cls ? ` class="${cls}"` : ''}>${inner}<a class="anchor" href="#${id}" aria-label="Link to this section">#</a></h${depth}>`;
}

function uniqueId(base: string): string {
  let id = base || 'section';
  for (let n = 2; ctx.used.has(id); n++) id = `${base}-${n}`;
  ctx.used.add(id);
  return id;
}

const ALERTS: Record<string, string> = { NOTE: 'Note', TIP: 'Tip', WARNING: 'Watch out' };

export const md = new Marked({
  gfm: true,
  extensions: [
    {
      name: 'entry',
      level: 'block',
      start: (src: string) => src.match(/^::: /m)?.index,
      tokenizer(src: string) {
        const m = /^::: (\w+) ([^\n]+)\n([\s\S]*?)\n:::(?:\n|$)/.exec(src);
        if (!m) return undefined;
        const etype = m[1] as EntryType;
        if (!(ENTRY_TYPES as readonly string[]).includes(etype)) return undefined;
        const token: EntryToken = { type: 'entry', raw: m[0], etype, name: m[2].trim(), level: 3, tokens: [] };
        this.lexer.blockTokens(m[3], token.tokens);
        return token as unknown as Tokens.Generic;
      },
      renderer(t: Tokens.Generic) {
        const e = t as unknown as EntryToken;
        const id = entryId(e.etype, e.name);
        ctx.used.add(id);
        ctx.headings.push({ depth: e.level, id, text: e.name });
        return `<section class="entry entry-${e.etype}">${ctx.blocks.entryHead(ctx, e.etype, e.name, e.level, id)}${this.parser.parse(e.tokens)}</section>\n`;
      },
    },
    {
      name: 'directive',
      level: 'block',
      start: (src: string) => src.match(/^::(?!:)\w/m)?.index,
      tokenizer(src: string) {
        const m = /^::(ref|diagram|shot|clip) +([\w./-]+)(?: +([\w./,-]+))?(?: +"([^"]*)")? *(?:\n|$)/.exec(src);
        if (!m) return undefined;
        const token: DirectiveToken = { type: 'directive', raw: m[0], name: m[1], arg: m[2], caption: m[4] ?? m[3] ?? '' };
        if (m[1] === 'ref') token.caption = m[3] ?? '';
        return token as unknown as Tokens.Generic;
      },
      renderer(t: Tokens.Generic) {
        const d = t as unknown as DirectiveToken;
        if (d.name === 'ref') return ctx.blocks.ref(ctx, d.arg, d.caption);
        if (d.name === 'diagram') return ctx.blocks.diagram(ctx, d.arg);
        if (d.name === 'shot') return ctx.blocks.shot(ctx, d.arg, d.caption);
        return ctx.blocks.clip(ctx, d.arg, d.caption);
      },
    },
  ],
  renderer: {
    heading({ tokens, depth, text }) {
      let inner = this.parser.parseInline(tokens);
      let id: string;
      const m = /\s*\{#([\w-]+)\}\s*$/.exec(text);
      if (m) {
        inner = inner.replace(/\s*\{#[\w-]+\}\s*$/, '');
        id = m[1];
        ctx.used.add(id);
      } else id = uniqueId(slug(plain(inner)));
      ctx.headings.push({ depth, id, text: plain(inner) });
      return headingHtml(depth, id, inner) + '\n';
    },
    link({ href, title, tokens }) {
      const url = resolveHref(ctx, href);
      const external = /^https?:/.test(url);
      return `<a href="${esc(url)}"${title ? ` title="${esc(title)}"` : ''}${external ? ' rel="noopener"' : ''}>${this.parser.parseInline(tokens)}</a>`;
    },
    image({ href, text, title }) {
      return `<img src="${esc(href)}" alt="${esc(text)}"${title ? ` title="${esc(title)}"` : ''} loading="lazy">`;
    },
    code(token) {
      const { text, lang } = token;
      const info = (lang ?? '').trim();
      const kind = info.split(/\s+/)[0];
      const attrs = parseAttrs(info.slice(kind.length));
      if (kind === 'live') {
        const ex = (token as { ex?: Example }).ex;
        return ex ? ctx.blocks.live(ctx, ex) : '';
      }
      if (kind === 'sx') return sxBlock(text, attrs);
      if (kind === 'notation' || kind === 'ops' || kind === 'json') {
        const label = kind === 'notation' ? 'Notation' : kind === 'ops' ? 'Ops' : 'JSON';
        return codeBlock(highlightJson(text), label);
      }
      const label = { bash: 'Shell', sh: 'Shell', ts: 'TypeScript', text: '', http: 'HTTP' }[kind] ?? kind;
      return codeBlock(esc(text), label);
    },
    blockquote({ tokens }) {
      const body = this.parser.parse(tokens);
      const m = /^<p>\[!(NOTE|TIP|WARNING)\]\s*/.exec(body);
      if (!m) return `<blockquote>${body}</blockquote>\n`;
      const kind = m[1];
      return `<aside class="callout callout-${kind.toLowerCase()}"><p class="callout-label">${ALERTS[kind]}</p><p>${body.slice(m[0].length)}</aside>\n`;
    },
    table(token) {
      // The stock table, kept whole, in a box that scrolls sideways on its own.
      const head = token.header.map((c) => `<th${c.align ? ` style="text-align:${c.align}"` : ''}>${this.parser.parseInline(c.tokens)}</th>`).join('');
      const rows = token.rows.map((r) => `<tr>${r.map((c) => `<td${c.align ? ` style="text-align:${c.align}"` : ''}>${this.parser.parseInline(c.tokens)}</td>`).join('')}</tr>`).join('\n');
      return tableWrap(`<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`);
    },
  },
});

/** A table in a box that scrolls sideways on its own, reachable by keyboard. */
export const tableWrap = (table: string, label = 'Table') =>
  `<div class="table-wrap" tabindex="0" role="region" aria-label="${esc(label)}">${table}</div>\n`;

/** A code block; the copy button is added by the page's script. */
export const codeBlock = (html: string, label = '') =>
  `<div class="code"${label ? ` data-lang="${esc(label)}"` : ''}><pre tabindex="0"><code>${html}</code></pre></div>\n`;

/** An expression block: the code coloured, and each ⇒ result under the expression it belongs to. */
function sxBlock(text: string, _attrs: Record<string, string>): string {
  const parts = text.split('\n').map((line) => {
    const r = /^⇒\s?(.*)$/.exec(line);
    return r ? `<span class="sx-result" aria-label="gives">⇒ ${esc(r[1])}</span>` : highlightSx(line);
  });
  return codeBlock(parts.join('\n'), 'Expression');
}

export interface Lexed { tokens: Token[]; examples: Example[] }

/** First pass: the tokens, the entries and explicit anchors (for the site-wide index), and the examples. */
/** An anchor the whole site can link to and the A–Z lists: an entry or a heading with an explicit id. */
export interface Anchor { id: string; label: string; type: string }

export function lexPage(page: string, body: string, bodyLine: number): Lexed & { anchors: string[]; labels: Anchor[] } {
  const tokens = md.lexer(body);
  const anchors: string[] = [];
  const labels: Anchor[] = [];
  const examples: Example[] = [];
  let lastHeading = 1;
  let n = 0;
  // Lines: count through the raw text of the top-level tokens.
  let line = bodyLine;
  for (const t of tokens) {
    if (t.type === 'heading') {
      lastHeading = (t as Tokens.Heading).depth;
      const m = /\{#([\w-]+)\}\s*$/.exec((t as Tokens.Heading).text);
      if (m) {
        anchors.push(m[1]);
        labels.push({ id: m[1], label: (t as Tokens.Heading).text.replace(/\s*\{#[\w-]+\}\s*$/, '').replace(/[`*]/g, ''), type: m[1].split('-')[0] });
      }
    }
    if (t.type === 'entry') {
      const e = t as unknown as EntryToken;
      e.level = Math.min(4, lastHeading + 1);
      anchors.push(entryId(e.etype, e.name));
      labels.push({ id: entryId(e.etype, e.name), label: e.name, type: e.etype });
    }
    const visit = (tok: Token, at: number) => {
      if (tok.type === 'code') {
        const c = tok as Tokens.Code;
        const info = (c.lang ?? '').trim();
        const kind = info.split(/\s+/)[0];
        if (kind === 'sx' || kind === 'live' || kind === 'notation' || kind === 'ops') {
          const attrs = parseAttrs(info.slice(kind.length));
          const id = attrs.id ?? (kind === 'live' ? `ex-${++n}` : undefined);
          const ex: Example = { page, lang: kind, id, in: attrs.in, source: c.text, attrs, line: at };
          examples.push(ex);
          (c as { ex?: Example }).ex = ex;
        }
      }
      const kids = (tok as { tokens?: Token[] }).tokens;
      if (tok.type !== 'code' && Array.isArray(kids)) for (const k of kids) visit(k, at);
    };
    visit(t, line);
    line += (t.raw.match(/\n/g) ?? []).length;
  }
  return { tokens, examples, anchors, labels };
}

/** Second pass: HTML, with the headings and errors gathered into the context. */
export function renderTokens(c: PageCtx, tokens: Token[]): string {
  ctx = c;
  return md.parser(tokens);
}
