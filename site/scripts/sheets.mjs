// Contact sheets of a crawl: node site/scripts/sheets.mjs <crawl-out-dir> <sheets-dir>
// One image per page: desktop, tablet and phone side by side, light above dark,
// each scaled to the same height, so every shot of every page can be read.
// Needs ffmpeg on the PATH.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const [dir, out] = process.argv.slice(2);
if (!dir || !out) {
  console.error('usage: node site/scripts/sheets.mjs <crawl-out-dir> <sheets-dir>');
  process.exit(1);
}
mkdirSync(out, { recursive: true });
const pages = [...new Set(readdirSync(dir).filter((f) => f.endsWith('-desktop-light.png')).map((f) => f.replace(/-desktop-light\.png$/, '')))].sort();
const order = ['desktop-light', 'tablet-light', 'phone-light', 'desktop-dark', 'tablet-dark', 'phone-dark'];
let n = 0;
for (const page of pages) {
  const files = order.map((o) => join(dir, `${page}-${o}.png`));
  if (!files.every(existsSync)) continue;
  const inputs = files.flatMap((f) => ['-i', f]);
  const scale = files.map((_, i) => `[${i}:v]scale=-2:450[s${i}]`).join(';');
  const filter = `${scale};[s0][s1][s2]hstack=inputs=3[top];[s3][s4][s5]hstack=inputs=3[bottom];[top][bottom]vstack=inputs=2`;
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...inputs, '-filter_complex', filter, join(out, `${page}.png`)]);
  n++;
}
console.log(`${n} sheets in ${out}`);
