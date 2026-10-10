// A gate between edgy servers and Turso, for checking sync with the cloud cut off.
//
//   node --env-file=.env docs/showcase/accounts/cloud-gate.mjs 9900
//
// The servers get TURSO_URL=http://127.0.0.1:9900 and any TURSO_AUTH_TOKEN; the gate
// forwards their requests to the real TURSO_URL with the real token, which only it
// reads (from .env), so the token is never in their environment, logs or output.
//
//   GET  /__gate            {"open": true|false, "forwarded": n, "refused": n}
//   POST /__gate/close      from now on, requests are cut (the connection is dropped)
//   POST /__gate/open       requests go through again
import { createServer } from 'node:http';

const port = Number(process.argv[2] ?? 9900);
const target = process.env.TURSO_URL?.trim().replace(/^libsql:\/\//i, 'https://').replace(/\/+$/, '');
const token = process.env.TURSO_AUTH_TOKEN?.trim();
if (!target || !token) {
  console.error('the gate needs TURSO_URL and TURSO_AUTH_TOKEN (run it with --env-file=.env)');
  process.exit(1);
}

let open = true;
let forwarded = 0;
let refused = 0;

createServer(async (req, res) => {
  if (req.url === '/__gate' || req.url?.startsWith('/__gate/')) {
    if (req.method === 'POST' && req.url === '/__gate/close') open = false;
    if (req.method === 'POST' && req.url === '/__gate/open') open = true;
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ open, forwarded, refused }));
  }
  if (!open) {
    refused++;
    // As if the network were down: no answer at all.
    return req.socket.destroy();
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try {
    const answer = await fetch(target + req.url, {
      method: req.method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: req.method === 'POST' ? Buffer.concat(chunks) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    forwarded++;
    res.writeHead(answer.status, { 'content-type': answer.headers.get('content-type') ?? 'application/json' });
    res.end(Buffer.from(await answer.arrayBuffer()));
  } catch {
    req.socket.destroy();
  }
}).listen(port, '127.0.0.1', () => console.log(`cloud gate on http://127.0.0.1:${port} → ${new URL(target).hostname.replace(/^[^.]+/, '***')}`));
