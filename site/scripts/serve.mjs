// A plain static file server, the way a static host serves the docs folder:
// node site/scripts/serve.mjs <dir> [port=4174] [base=/edgy-docs/]
// A folder answers with its index.html, a folder without its slash is redirected,
// anything missing gets 404.html with status 404. Nothing else: no app, no API.

import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const [dir = 'dist/docs', port = '4174', base = '/edgy-docs/'] = process.argv.slice(2);
const root = resolve(dir);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp', '.webm': 'video/webm', '.png': 'image/png',
};

const send = (res, file, status = 200) => {
  res.writeHead(status, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
  createReadStream(file).pipe(res);
};

createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const path = decodeURIComponent(url.pathname);
  if (!path.startsWith(base)) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    return res.end(`Nothing here: the docs are at ${base}`);
  }
  const file = normalize(join(root, path.slice(base.length)));
  if (!file.startsWith(root)) return send(res, join(root, '404.html'), 404);
  if (existsSync(file) && statSync(file).isDirectory()) {
    if (!path.endsWith('/')) {
      res.writeHead(301, { location: path + '/' + url.search });
      return res.end();
    }
    if (existsSync(join(file, 'index.html'))) return send(res, join(file, 'index.html'));
  } else if (existsSync(file)) return send(res, file);
  send(res, join(root, '404.html'), 404);
}).listen(Number(port), '127.0.0.1', () => console.log(`docs at http://127.0.0.1:${port}${base} (from ${root})`));
