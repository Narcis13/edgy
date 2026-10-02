import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { createApp } from './app';
import { Store } from './store';
import { bundleLoader } from './export';

const port = Number(process.env.EDGY_PORT ?? 8787);
const hostname = process.env.HOST ?? '127.0.0.1';
const dataDir = process.env.EDGY_DATA ?? join(process.cwd(), 'data');

// The built app; EDGY_DIST points elsewhere so several builds can be served side by side.
const dist = relative(process.cwd(), process.env.EDGY_DIST ?? 'dist') || '.';
const built = existsSync(join(dist, 'index.html')) && process.env.NODE_ENV === 'production';
// In development the app is served by Vite; tell agents where people should look.
const webUrl = process.env.EDGY_WEB_URL ?? (built ? undefined : 'http://localhost:5173');

const store = new Store(join(dataDir, 'edgy.db'));
// Exports use the offline build: next to a production build, or built once on the first export in development.
const offline = built ? bundleLoader(join(dist, 'offline'), false) : bundleLoader(mkdtempSync(join(tmpdir(), 'edgy-offline-')), true);
const { app } = createApp(store, join(dataDir, 'assets'), webUrl, { offline });

// After `npm run build`, this one process serves the app too.
if (built) {
  app.use('/*', serveStatic({ root: dist }));
  app.get('*', (c) => c.html(readFileSync(join(dist, 'index.html'), 'utf8')));
}

serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.log(`edgy api on http://${hostname}:${info.port}  (data in ${dataDir})`);
});
