// What a docs page weighs: node site/scripts/weight.mjs [dist/docs]
// For every page, the bytes a first visit downloads before any live example
// starts, gzipped as a server would send them: the HTML, the stylesheet and the
// page script (fonts aside: they are listed on their own). Pictures and clips
// load lazily and are counted separately. Prints the heaviest pages, the
// largest text-only page, and fails when a text-only page is over 100 KB.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const dir = process.argv[2] ?? 'dist/docs';
const gz = (file) => gzipSync(readFileSync(file), { level: 9 }).length;
const pages = [];
const walk = (d) => {
  for (const name of readdirSync(d)) {
    const p = join(d, name);
    if (statSync(p).isDirectory()) { if (name !== '_') walk(p); }
    else if (name === 'index.html') pages.push(p);
  }
};
walk(dir);

const assetCache = new Map();
const asset = (file) => {
  if (!assetCache.has(file)) assetCache.set(file, gz(file));
  return assetCache.get(file);
};
const rows = pages.map((file) => {
  const html = readFileSync(file, 'utf8');
  const here = join(file, '..');
  const refs = [...html.matchAll(/<(?:link rel="stylesheet"|script type="module") (?:href|src)="([^"]+)"/g)].map((m) => join(here, m[1]));
  const fonts = [...html.matchAll(/<link rel="preload" href="([^"]+)" as="font"/g)].map((m) => statSync(join(here, m[1])).size);
  const images = [...html.matchAll(/<img [^>]*src="([^"]+)"/g)].length / 2;
  const live = (html.match(/class="live-box"/g) ?? []).length;
  const bytes = gz(file) + refs.reduce((n, f) => n + asset(f), 0);
  return { page: relative(dir, here).replace(/\\/g, '/') || '(home)', bytes, html: gz(file), fonts: fonts.reduce((a, b) => a + b, 0), images, live };
});
rows.sort((a, b) => b.bytes - a.bytes);
const kb = (n) => (n / 1024).toFixed(1) + ' KB';
console.log('heaviest pages (HTML + CSS + script, gzipped; fonts, pictures and live examples aside):');
for (const r of rows.slice(0, 8)) console.log(`  ${r.page.padEnd(36)} ${kb(r.bytes).padStart(9)}  (html ${kb(r.html)}, ${r.images} pictures, ${r.live} live examples)`);
const text = rows.filter((r) => r.live === 0);
const worst = text[0];
console.log(`text-only pages: ${text.length}; the heaviest is ${worst?.page} at ${kb(worst?.bytes ?? 0)}; font ${kb(rows[0]?.fonts ?? 0)} (once, cached)`);
const shared = [...assetCache.entries()].map(([f, n]) => `${relative(dir, f).replace(/\\/g, '/')} ${kb(n)}`).join(', ');
console.log(`shared files (gzipped): ${shared}`);
if (worst && worst.bytes > 100 * 1024) {
  console.log(`FAIL: ${worst.page} is over 100 KB`);
  process.exit(1);
}
