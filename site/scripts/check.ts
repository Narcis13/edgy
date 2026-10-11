// Check some pages while writing them: npx tsx site/scripts/check.ts <prefix> [<prefix> …]
// e.g. `cells/` or `language/functions/math`. Prints the build problems on those
// pages and runs their doc-tests. A link to a page that site/nav.ts lists, or to
// an entry for something the code has, is reported as pending (another section
// may not be written yet), not as a problem.

import { loadSite } from '../build/site';
import { navPages } from '../nav';
import { catalog } from '../build/catalog';
import { entryId } from '../build/ids';
import { applyOpsBlock, exampleDoc, runSx } from '../build/examples';
import { missing } from '../build/blocks';

const prefixes = process.argv.slice(2);
if (!prefixes.length) {
  console.error('usage: npx tsx site/scripts/check.ts <page prefix> …   (e.g. cells/ or language/functions/)');
  process.exit(1);
}
const site = loadSite();
const mine = site.pages.filter((p) => prefixes.some((x) => p.page.startsWith(x) || p.file.startsWith(x)));
const planned = new Set(navPages().map((p) => p.page));
const known = new Set<string>();
for (const [type, names] of Object.entries(catalog())) for (const n of names) known.add(type === 'kind' ? `cells/${n}/` : entryId(type, n));

let problems = 0;
let pending = 0;
for (const p of mine) {
  for (const e of p.errors) {
    const page = /no page ([\w/-]+)/.exec(e)?.[1];
    const entry = /no entry #([\w-]+) anywhere/.exec(e)?.[1] ?? /has no entry/.test(e);
    const kindPage = /link to kind "([\w-]+)"/.exec(e)?.[1] ?? /kind "([\w-]+)" has no page/.exec(e)?.[1];
    const isPending = (page && planned.has(page)) || (kindPage && planned.has(`cells/${kindPage}/`))
      || (typeof entry === 'string' && (known.has(entry) || entry.startsWith('term-')))
      || (entry === true);
    if (isPending) pending++;
    else {
      problems++;
      console.log('PROBLEM', e);
    }
  }
  const docs = new Map<string, ReturnType<typeof exampleDoc>>();
  for (const ex of p.examples) {
    const where = `${p.file}:${ex.line}`;
    try {
      if (ex.lang === 'live' || ex.lang === 'notation') {
        const run = exampleDoc(ex);
        if (ex.id) docs.set(ex.id, run);
      } else if (ex.lang === 'ops') {
        const base = ex.in ? docs.get(ex.in) : undefined;
        if (!base) throw new Error(`ops block needs in=<id> of a live or notation block above it`);
        const after = applyOpsBlock(base, ex.source);
        if (ex.id) docs.set(ex.id, after);
      } else {
        if (!ex.in && !ex.source.includes('⇒')) continue;
        const base = ex.in ? docs.get(ex.in) : undefined;
        if (ex.in && !base) throw new Error(`no live or notation block with id=${ex.in} above it`);
        for (const c of runSx(ex.source, base)) {
          if (!c.ok) {
            problems++;
            console.log(`DOCTEST ${where}: ${c.expr}\n    the page says ${c.expect ?? '(no result, but it should run)'}; edgy gives ${c.got}`);
          }
        }
      }
    } catch (e) {
      problems++;
      console.log(`DOCTEST ${where}: ${e instanceof Error ? e.message : e}`);
    }
  }
  if (!/[.!?]$/.test(p.summary) || p.summary.length < 20) {
    problems++;
    console.log(`PROBLEM ${p.file}: the first paragraph should open with a sentence saying what the page covers`);
  }
}
const notWritten = [...planned].filter((p) => prefixes.some((x) => p.startsWith(x)) && !site.byPage.has(p));
console.log(`${mine.length} pages checked, ${problems} problems, ${pending} links to pages or entries not written yet${notWritten.length ? `; not written: ${notWritten.join(' ')}` : ''}`);
if (missing.size) console.log(`pictures not made yet (fine while writing): ${[...missing].join(', ')}`);
process.exit(problems ? 1 : 0);
