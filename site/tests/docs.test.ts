// Keeping the docs true. Coverage: every kind, function, event, op, route, MCP
// tool, style key, format, colour token, shortcut and template in the code has
// its entry in the pages. Doc-tests: every example runs and gives what the page
// says. Links: nothing in the site points at a page or anchor that isn't there.
// Look: the docs' CSS and diagrams have no gradient, blur, glow or text shadow.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadSite, renderSite } from '../build/site';
import { catalog } from '../build/catalog';
import { entryId } from '../build/ids';
import { navPages } from '../nav';
import { applyOpsBlock, exampleDoc, runSx } from '../build/examples';
import { checkLinks } from '../build/links';
import { SITE } from '../build/blocks';
import { tokenCss } from '../build/tokens';
import { DIAGRAMS } from '../diagrams';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

const site = loadSite();

test('the pages build without problems', () => {
  assert.deepEqual(site.errors, [], site.errors.join('\n'));
});

test('every page is in the contents once, and every page in the contents exists', () => {
  const listed = navPages().map((p) => p.page);
  assert.equal(new Set(listed).size, listed.length, 'a page is listed twice in site/nav.ts');
  for (const p of listed) assert.ok(site.byPage.has(p), `site/nav.ts lists ${p}, but site/content has no page for it`);
  for (const p of site.pages) if (p.page !== '') assert.ok(listed.includes(p.page), `${p.file} is not in site/nav.ts`);
});

test('every page has a title and says what it covers in its first sentence', () => {
  for (const p of site.pages) {
    assert.ok(p.front.title, `${p.file}: no title`);
    assert.ok(p.summary.length > 20 && /[.!?]$/.test(p.summary), `${p.file}: the first paragraph should open with a sentence saying what the page covers (got "${p.summary}")`);
  }
});

test('coverage: everything the code lists has its entry in the docs', () => {
  const counts: string[] = [];
  const missing: string[] = [];
  for (const [type, names] of Object.entries(catalog())) {
    for (const name of names) {
      const ok = type === 'kind' ? site.byPage.has(`cells/${name}/`) : site.anchors.has(entryId(type, name));
      if (!ok) missing.push(type === 'kind' ? `kind ${name}: no page site/content/cells/${name}.md` : `${type} ${name}: no "::: ${type} ${name}" entry`);
    }
    counts.push(`${type} ${names.length}`);
  }
  console.log(`coverage: ${counts.join(', ')}`);
  assert.deepEqual(missing, [], `${missing.length} undocumented:\n  ${missing.join('\n  ')}`);
});

test('doc-tests: every example runs and gives what the page says', () => {
  let sx = 0;
  let results = 0;
  let notation = 0;
  let ops = 0;
  const failures: string[] = [];
  for (const p of site.pages) {
    const docs = new Map<string, ReturnType<typeof exampleDoc>>();
    for (const ex of p.examples) {
      const where = `${p.file}:${ex.line}`;
      try {
        if (ex.lang === 'live' || ex.lang === 'notation') {
          notation++;
          const run = exampleDoc(ex);
          if (ex.id) docs.set(ex.id, run);
        } else if (ex.lang === 'ops') {
          ops++;
          const base = ex.in ? docs.get(ex.in) : undefined;
          if (!base) throw new Error(`ops block needs in=<id> of a live or notation block above it${ex.in ? ` (no "${ex.in}")` : ''}`);
          const after = applyOpsBlock(base, ex.source);
          if (ex.id) docs.set(ex.id, after);
        } else {
          // A snippet with no stated result and no document is only shown.
          if (!ex.in && !ex.source.includes('⇒')) continue;
          sx++;
          const base = ex.in ? docs.get(ex.in) : undefined;
          if (ex.in && !base) throw new Error(`no live or notation block with id=${ex.in} above it`);
          for (const c of runSx(ex.source, base)) {
            if (c.expect !== undefined) results++;
            if (!c.ok) failures.push(`${where}: ${c.expr}\n      page says ${c.expect ?? '(no result, but it should run)'}, edgy gives ${c.got}`);
          }
        }
      } catch (e) {
        failures.push(`${where}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }
  console.log(`doc-tests: ${sx} expression blocks with ${results} stated results, ${notation} documents (live and notation), ${ops} ops blocks`);
  assert.deepEqual(failures, [], failures.join('\n'));
});

test('links: every internal link and anchor in the site exists', () => {
  const { files } = renderSite(site, { css: ['docs.css'], js: 'docs.js', font: 'font.woff2' });
  const assets = new Set(['_/docs.css', '_/docs.js', '_/font.woff2', '_/favicon.svg']);
  const shot = (p: string) => /^_\/(shots|clips)\//.test(p) && (() => { try { readFileSync(join(SITE, p.slice(2))); return true; } catch { return false; } })();
  const r = checkLinks(files, (p) => assets.has(p) || shot(p));
  console.log(`links: ${r.links} in ${r.pages} pages, ${r.external.length} external`);
  assert.deepEqual(r.broken, [], r.broken.join('\n'));
});

test('the look: no gradient, backdrop blur, text shadow or SVG filter in the docs’ CSS and diagrams', () => {
  const css = readFileSync(join(SITE, 'styles/docs.css'), 'utf8') + tokenCss();
  const banned = /gradient\(|backdrop-filter|text-shadow|filter\s*:|<filter|filter=/i;
  assert.ok(!banned.test(css), `the docs' CSS has ${banned.exec(css)?.[0]}`);
  for (const [name, D] of Object.entries(DIAGRAMS)) {
    const svg = renderToStaticMarkup(createElement(D));
    assert.ok(!banned.test(svg), `diagram ${name} has ${banned.exec(svg)?.[0]}`);
    assert.match(svg, /<title id=/, `diagram ${name} has no title`);
  }
  for (const f of readdirSync(join(SITE, 'content'), { recursive: true }) as string[]) {
    if (!f.endsWith('.md')) continue;
    const text = readFileSync(join(SITE, 'content', f), 'utf8');
    assert.ok(!/<svg[\s\S]*?(filter|gradient)/i.test(text), `${f} has an inline SVG with a filter or gradient`);
  }
});

test('the docs take the app’s tokens from src/web/styles.css', () => {
  const app = readFileSync(join(SITE, '../src/web/styles.css'), 'utf8');
  const accent = /--accent:\s*([^;]+);/.exec(app)![1];
  assert.ok(tokenCss().includes(`--accent: ${accent};`), 'the generated tokens carry the app’s --accent');
});
