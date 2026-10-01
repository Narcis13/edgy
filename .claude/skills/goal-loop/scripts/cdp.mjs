// Drive headless Chrome over CDP: screenshots, PDFs, console and network errors.
//
//   node cdp.mjs shot <url> <out.png> [--size 1440x900] [--mobile] [--dark] [--full | --scroll] [--js "<expr>"] [--wait 3500]
//   node cdp.mjs pdf  <url> <out.pdf> [--dark] [--js "<expr>"] [--wait 3500]
//
// --full    one image of the whole document (grows the viewport to the app's scrolling pane)
// --scroll  one image per screenful of the app's scrolling pane: out-0.png, out-1.png, …
// --dark    prefers-color-scheme: dark
// --js      evaluated after load (awaited); its value is printed as a JS line, then the page settles
//
// Every console error/warning, uncaught exception, failed request and HTTP status >= 400 is printed
// as a line starting with "CONSOLE". The exit code is 3 when any was seen, so a sweep can't miss one.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback; };
const [cmd, url, out] = argv;
if (!['shot', 'pdf'].includes(cmd) || !url || !out) {
  console.error('usage: node cdp.mjs shot|pdf <url> <out> [--size WxH] [--mobile] [--dark] [--full|--scroll] [--js expr] [--wait ms]');
  process.exit(1);
}
const [w, h] = opt('size', '1440x900').split('x').map(Number);
const mobile = flag('mobile');
const js = opt('js', '');
const wait = Number(opt('wait', '3500'));
// The selector of the element the app scrolls in (the page itself does not scroll).
const PANE = '.desk, .home, .records';

const CHROME = process.env.CHROME ?? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync);
if (!CHROME) { console.error('Chrome not found; set CHROME=/path/to/chrome'); process.exit(2); }
const port = 9300 + Math.floor(Math.random() * 500);
const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'cdp-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let problems = 0;
const report = (o) => { problems++; console.log('CONSOLE', JSON.stringify(o)); };
const done = (code) => { try { chrome.kill('SIGKILL'); } catch {} process.exit(code === 0 && problems ? 3 : code); };
setTimeout(() => { console.error('timeout'); done(2); }, 90_000);

let target;
for (let i = 0; i < 60 && !target; i++) {
  await sleep(150);
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch {}
}
if (!target) { console.error('chrome did not start'); done(2); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const waiting = new Map();
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); return; }
  const p = msg.params;
  if (msg.method === 'Runtime.exceptionThrown') report({ exception: p.exceptionDetails.exception?.description ?? p.exceptionDetails.text });
  if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'assert'].includes(p.type)) report({ [p.type]: p.args.map((a) => a.value ?? a.description).join(' ') });
  if (msg.method === 'Log.entryAdded' && ['error', 'warning'].includes(p.entry.level)) report({ log: p.entry.text, url: p.entry.url });
  if (msg.method === 'Network.responseReceived' && p.response.status >= 400) report({ http: p.response.status, url: p.response.url });
  if (msg.method === 'Network.loadingFailed' && !p.canceled) report({ failed: p.errorText, type: p.type });
});
const send = (method, params = {}) => new Promise((r) => { const n = ++id; waiting.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result;
const metrics = (height) => send('Emulation.setDeviceMetricsOverride', { width: w, height, deviceScaleFactor: mobile ? 2 : 1, mobile });

await send('Runtime.enable');
await send('Log.enable');
await send('Network.enable');
await send('Page.enable');
await metrics(h);
if (flag('dark')) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.navigate', { url });
await sleep(wait);
if (js) {
  const r = await evaluate(js);
  console.log('JS', JSON.stringify(r?.result?.value ?? r?.exceptionDetails?.exception?.description ?? r?.exceptionDetails?.text ?? null));
  await sleep(1200);
}

const png = async (file) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(file, Buffer.from(r.result.data, 'base64'));
};

if (cmd === 'pdf') {
  const r = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false });
  if (!r.result) { console.error(JSON.stringify(r.error)); done(1); }
  writeFileSync(out, Buffer.from(r.result.data, 'base64'));
} else if (flag('scroll')) {
  const size = (await evaluate(`(() => { const d = document.querySelector('${PANE}'); return d ? [d.scrollHeight, d.clientHeight] : [document.documentElement.scrollHeight, innerHeight]; })()`)).result.value;
  const [total, view] = size;
  for (let i = 0, y = 0; y < total && i < 15; i++, y += view - 40) {
    await evaluate(`(() => { const d = document.querySelector('${PANE}'); if (d) d.scrollTop = ${y}; else scrollTo(0, ${y}); })()`);
    await sleep(500);
    await png(out.replace(/\.png$/, `-${i}.png`));
  }
} else {
  if (flag('full')) {
    const inner = (await evaluate(`(() => { const d = document.querySelector('${PANE}'); return d ? d.scrollHeight + d.getBoundingClientRect().top : document.documentElement.scrollHeight; })()`)).result.value;
    const height = Math.max(h, Math.ceil(inner || 0));
    if (height > h) { await metrics(height); await sleep(1200); }
  }
  await png(out);
}
console.log('OK', out);
done(0);
