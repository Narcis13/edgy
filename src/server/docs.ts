// The documentation at /docs/: the folder `npm run docs:build` writes, served
// to anyone (it is not /api, so no route here asks who is calling). Each page
// is told it is inside the app, so its "Open in edgy" buttons appear. In
// development the site is built once, on the first visit.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import type { Hono } from 'hono';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp', '.webm': 'video/webm', '.png': 'image/png',
};

/** Tell a page it is served by the app: where the app is (and, on the 404 page, where the docs are). */
const inApp = (html: string, missing = false) =>
  html.replace('<head>', `<head>\n${missing ? '<base href="/docs/">\n' : ''}<meta name="edgy-app" content="/">`);

export function serveDocs(app: Hono<any>, dir: string, build?: () => Promise<void>): void {
  const root = resolve(dir);
  let ready: Promise<void> | null = build ? null : Promise.resolve();
  const file = (path: string, status = 200) => {
    const type = TYPES[extname(path)] ?? 'application/octet-stream';
    const body = type.startsWith('text/html') ? inApp(readFileSync(path, 'utf8'), status === 404) : readFileSync(path);
    return new Response(body, {
      status,
      headers: {
        'content-type': type,
        'cache-control': /[\\/]_[\\/]/.test(path) && !path.endsWith('.json') ? 'public, max-age=31536000, immutable' : 'no-cache',
        'x-content-type-options': 'nosniff',
      },
    });
  };

  app.get('/docs', (c) => c.redirect('/docs/', 301));
  app.get('/docs/*', async (c) => {
    ready ??= build!().catch((e) => {
      ready = null;
      throw e;
    });
    try {
      await ready;
    } catch (e) {
      return c.text(`The docs could not be built: ${e instanceof Error ? e.message : e}`, 500);
    }
    if (!existsSync(join(root, 'index.html'))) return c.text('The docs are not built. Run npm run docs:build (npm run build does it too).', 404);
    let path: string;
    try {
      path = decodeURIComponent(c.req.path.slice('/docs/'.length));
    } catch {
      return file(join(root, '404.html'), 404);
    }
    const target = normalize(join(root, path));
    // Inside the folder, not merely starting with its name: /docs/..%2Fdocs-old/ is a sibling, not a page.
    if (target !== root && !target.startsWith(root + sep)) return file(join(root, '404.html'), 404);
    if (existsSync(target) && statSync(target).isDirectory()) {
      if (!c.req.path.endsWith('/')) return c.redirect(c.req.path + '/', 301);
      if (existsSync(join(target, 'index.html'))) return file(join(target, 'index.html'));
    } else if (existsSync(target)) return file(target);
    return file(join(root, '404.html'), 404);
  });
}
