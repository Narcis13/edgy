// The search index, built with the site and searched in the browser: one entry
// per page and one per section or entry on it, with its text.

import type { Site } from './site';

export interface SearchEntry {
  /** Page path plus #anchor, relative to the docs' root. */
  u: string;
  /** What the result is called. */
  t: string;
  /** The page it is on (when it is a section). */
  p?: string;
  /** What kind of thing: Page, Section, Function, Cell, Event, … */
  k: string;
  /** Its text, for matching and the snippet. */
  x: string;
}

const KINDS: Record<string, string> = {
  fn: 'Function', event: 'Event', op: 'Op', route: 'Route', tool: 'MCP tool', style: 'Style key',
  format: 'Format', token: 'Colour token', key: 'Shortcut', template: 'Template', term: 'Glossary',
};

const text = (html: string) => html
  .replace(/<script[\s\S]*?<\/script>/g, ' ')
  .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
  .replace(/<a class="anchor"[^>]*>#<\/a>/g, '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ')
  .trim();

export function searchEntries(site: Site): SearchEntry[] {
  const out: SearchEntry[] = [];
  for (const p of site.pages) {
    const heads = [...p.html.matchAll(/<h([234]) id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g)];
    const intro = heads.length ? p.html.slice(0, heads[0].index) : p.html;
    out.push({ u: p.page, t: p.front.nav ?? p.title, k: p.page.startsWith('cells/') && p.page !== 'cells/' ? 'Cell' : 'Page', x: text(intro).slice(0, 2000) });
    heads.forEach((h, i) => {
      const end = i + 1 < heads.length ? heads[i + 1].index : p.html.length;
      const body = p.html.slice(h.index! + h[0].length, end);
      const id = h[2];
      const type = id.split('-')[0];
      const kind = KINDS[type] && (type !== 'term' || p.page === 'glossary/') ? KINDS[type] : 'Section';
      out.push({ u: `${p.page}#${id}`, t: text(h[3]), p: p.front.nav ?? p.title, k: kind, x: text(body).slice(0, 1500) });
    });
  }
  return out;
}
