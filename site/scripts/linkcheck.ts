// The link check over a built folder: npx tsx site/scripts/linkcheck.ts [dist/docs]
// Every href, src and poster in every page points at a page, file or anchor in
// the folder (assets included); external links are listed. Exit 1 on a broken one.

import { checkFolder } from '../build/links';

const r = checkFolder(process.argv[2] ?? 'dist/docs');
console.log(`${r.pages} pages, ${r.links} links checked, ${r.broken.length} broken, ${r.external.length} external:`);
for (const u of r.external) console.log(`  ${u}`);
for (const b of r.broken) console.log(`BROKEN ${b}`);
process.exit(r.broken.length ? 1 : 0);
