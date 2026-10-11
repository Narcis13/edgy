// npm run docs:build [-- --out <dir>]: the documentation as a folder of static
// files (dist/docs by default). Every link in it is relative, so the folder
// works at /docs/ in the app and at any path on a static host.
//
//   1. The app's tokens (src/web/styles.css, src/web/code/code.css) → site/.gen/tokens.css
//   2. Vite builds the browser code: the page script and its CSS, and the live-example runtime
//   3. Every page is rendered to <page>/index.html, plus 404.html, the search index and pages.json
//   4. The font, the favicon, the screenshots and the clips are copied next to them

import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { SITE, missing } from './blocks';
import { loadSite, renderSite } from './site';
import { render404 } from './layout';
import { tokenCss } from './tokens';

const ROOT = resolve(SITE, '..');
const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};

export async function buildDocs(out = resolve(ROOT, 'dist/docs'), opts: { quiet?: boolean; draft?: boolean } = {}): Promise<{ pages: number; bytes: number; out: string }> {
  const log = (s: string) => opts.quiet || console.log(s);
  const started = Date.now();
  const site = loadSite(true);
  if (site.errors.length && opts.draft) log(`docs: ${site.errors.length} problems (draft build, kept going):\n  ${site.errors.slice(0, 20).join('\n  ')}`);
  else if (site.errors.length) throw new Error(`the docs have ${site.errors.length} problems:\n  ${site.errors.join('\n  ')}`);

  mkdirSync(join(SITE, '.gen'), { recursive: true });
  writeFileSync(join(SITE, '.gen/tokens.css'), tokenCss());

  rmSync(out, { recursive: true, force: true });
  const assetsDir = join(out, '_');
  await build({
    configFile: false,
    root: join(SITE, 'client'),
    base: './',
    logLevel: opts.quiet ? 'error' : 'warn',
    plugins: [react()],
    publicDir: false,
    build: {
      outDir: assetsDir,
      emptyOutDir: true,
      manifest: true,
      assetsDir: '',
      // The live runtime is the app's renderer: big, and loaded only when an example comes near.
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        input: { docs: join(SITE, 'client/docs.ts'), live: join(SITE, 'client/live.html') },
        output: { entryFileNames: '[name]-[hash].js', chunkFileNames: '[name]-[hash].js', assetFileNames: '[name]-[hash][extname]' },
      },
    },
  });
  const manifest = JSON.parse(readFileSync(join(assetsDir, '.vite/manifest.json'), 'utf8')) as Record<string, { file: string; css?: string[]; isEntry?: boolean }>;
  rmSync(join(assetsDir, '.vite'), { recursive: true, force: true });
  const entry = Object.values(manifest).find((m) => m.isEntry && /^docs-/.test(m.file));
  if (!entry) throw new Error('the docs script is missing from the build');
  const font = readdirSync(assetsDir).find((f) => f.startsWith('recursive-latin-mono') && f.endsWith('.woff2'));
  if (!font) throw new Error('the font is missing from the build');
  const assets = { js: entry.file, css: entry.css ?? [], font };

  const { files, search } = renderSite(site, assets);
  for (const [path, html] of files) {
    mkdirSync(dirname(join(out, path)), { recursive: true });
    writeFileSync(join(out, path), html);
  }
  writeFileSync(join(assetsDir, 'search.json'), JSON.stringify(search));
  writeFileSync(join(assetsDir, 'pages.json'), JSON.stringify(site.pages.map((p) => p.page)));
  const css = assets.css.map((c) => readFileSync(join(assetsDir, c), 'utf8')).join('\n');
  writeFileSync(join(out, '404.html'), render404(css.replace(/url\((?!data:)/g, 'url(_/'), [...new Set(site.pages.map((p) => p.page.split('/')[0]).filter(Boolean)), '_']));

  copyFileSync(join(ROOT, 'public/favicon.svg'), join(assetsDir, 'favicon.svg'));
  for (const dir of ['shots', 'clips']) {
    if (!existsSync(join(SITE, dir))) continue;
    cpSync(join(SITE, dir), join(assetsDir, dir), { recursive: true, filter: (p) => !p.endsWith('.json') || statSync(p).isDirectory() });
  }

  const bytes = size(out);
  log(`docs: ${files.size} pages, ${(bytes / 1024 / 1024).toFixed(1)} MB in ${out} (${((Date.now() - started) / 1000).toFixed(1)}s); search index ${(gzipSync(JSON.stringify(search)).length / 1024).toFixed(0)} KB gzipped`);
  if (missing.size) log(`docs: not made yet: ${[...missing].join(', ')}`);
  return { pages: files.size, bytes, out };
}

function size(dir: string): number {
  let n = 0;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    n += s.isDirectory() ? size(p) : s.size;
  }
  return n;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  buildDocs(resolve(ROOT, arg('out', 'dist/docs')), { draft: process.argv.includes('--draft') }).catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
