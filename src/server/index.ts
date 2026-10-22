import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { createApp } from './app';
import { Store } from './store';
import { bundleLoader } from './export';
import { cloudFromEnv } from './cloud';
import { serveDocs } from './docs';

const port = Number(process.env.EDGY_PORT ?? 8787);
const hostname = process.env.HOST ?? '127.0.0.1';
const dataDir = process.env.EDGY_DATA ?? join(process.cwd(), 'data');

// The built app; EDGY_DIST points elsewhere so several builds can be served side by side.
const dist = relative(process.cwd(), process.env.EDGY_DIST ?? 'dist') || '.';
const built = existsSync(join(dist, 'index.html')) && process.env.NODE_ENV === 'production';
// In development the app is served by Vite; tell agents where people should look.
const webUrl = process.env.EDGY_WEB_URL ?? (built ? undefined : 'http://localhost:5173');

// Local mode (no sign-in from this machine) only while the server can't be reached from elsewhere.
const loopback = ['127.0.0.1', 'localhost', '::1'].includes(hostname);
const auth = process.env.EDGY_AUTH === 'accounts' || process.env.EDGY_AUTH === 'local' ? process.env.EDGY_AUTH : loopback ? 'local' : 'accounts';
if (auth === 'local' && !loopback) {
  console.error(`EDGY_AUTH=local needs a loopback HOST; ${hostname} can be reached from other machines`);
  process.exit(1);
}

const store = new Store(join(dataDir, 'edgy.db'));
// Exports use the offline build: next to a production build, or built once on the first export in development.
const offline = built ? bundleLoader(join(dist, 'offline'), false) : bundleLoader(mkdtempSync(join(tmpdir(), 'edgy-offline-')), true);
// Sync with Turso when TURSO_URL and TURSO_AUTH_TOKEN are set; local only otherwise.
const cloud = cloudFromEnv();
const { app, sync, runner } = createApp(store, join(dataDir, 'assets'), webUrl, { offline, auth, cloud, syncInterval: Number(process.env.EDGY_SYNC_INTERVAL ?? 3000) });
sync?.start();

// The documentation at /docs/: next to a production build, or built once on the first visit in development.
const docsDir = built ? join(dist, 'docs') : mkdtempSync(join(tmpdir(), 'edgy-docs-'));
serveDocs(app, docsDir, built ? undefined : async () => {
  const { buildDocs } = await import('../../site/build/build');
  await buildDocs(docsDir, { quiet: true });
});

// After `npm run build`, this one process serves the app too.
if (built) {
  // Vite names its bundles by their content: a browser may keep them for good. The page itself is asked for each time.
  app.use('/static/*', async (c, next) => {
    await next();
    if (c.res.ok) c.res.headers.set('cache-control', 'public, max-age=31536000, immutable');
  });
  app.use('/*', serveStatic({ root: dist }));
  const shell = readFileSync(join(dist, 'index.html'), 'utf8');
  app.get('*', (c) => c.html(shell, 200, { 'cache-control': 'no-cache' }));
}

const server = serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.log(`edgy api on http://${hostname}:${info.port}  (data in ${dataDir}; ${auth === 'local' ? 'local mode: this machine is signed in' : 'accounts: sign in to use it'}; sync ${cloud ? 'on' : 'off'}${process.env.EDGY_SIGNUPS === 'off' ? '; sign-ups off' : ''})`);
});

// Stopped by the service manager (SIGTERM) or Ctrl+C: timers and sync stop, open streams end, the database closes
// with nothing half written. The same signal often comes twice (to the launcher and to this process); ten seconds
// end it anyway.
let stopping = false;
const stop = (signal: string) => {
  if (stopping) return;
  stopping = true;
  console.log(`edgy: ${signal}, stopping`);
  sync?.stop();
  runner.close();
  let closed = false;
  const done = () => {
    if (closed) return;
    closed = true;
    store.close();
    process.exit(0);
  };
  server.close(done);
  (server as { closeAllConnections?: () => void }).closeAllConnections?.();
  setTimeout(done, 10_000).unref();
};
process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
