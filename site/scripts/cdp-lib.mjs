// A small headless-Chrome driver for the docs' evidence scripts: one browser,
// pages you can navigate, evaluate in, type into with real keys, and shoot,
// with every console problem and request recorded.
//
//   const b = await browser();               // CHROME=… on Windows
//   const p = await b.page({ width: 1440, height: 900, dark: false });
//   await p.go(url); await p.js('1 + 1'); await p.keys('/'); await p.type('sum-by'); await p.shot('a.png');
//   p.problems, p.requests; await b.close();

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export { sleep };

const CHROME = process.env.CHROME ?? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const KEYS = { Enter: [13, '\r'], Tab: [9], Escape: [27], ArrowDown: [40], ArrowUp: [38], ArrowLeft: [37], ArrowRight: [39], Backspace: [8], Space: [32, ' '] };

export async function browser() {
  const port = 9600 + Math.floor(Math.random() * 150);
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'cdp-lib-'));
  const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, 'about:blank'], { stdio: 'ignore' });
  let ok = false;
  for (let i = 0; i < 80 && !ok; i++) {
    await sleep(150);
    try { ok = (await fetch(`http://127.0.0.1:${port}/json/version`)).ok; } catch {}
  }
  if (!ok) throw new Error('chrome did not start');

  async function page({ width = 1440, height = 900, mobile = false, dark = false, cookie, origin } = {}) {
    const t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener('open', r, { once: true }));
    let id = 0;
    const waiting = new Map();
    const listeners = new Set();
    const p = { problems: [], requests: [] };
    ws.addEventListener('message', (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); return; }
      const e = msg.params;
      if (msg.method === 'Runtime.exceptionThrown') p.problems.push(`exception: ${e.exceptionDetails.exception?.description ?? e.exceptionDetails.text}`);
      if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'assert'].includes(e.type)) p.problems.push(`console ${e.type}: ${e.args.map((a) => a.value ?? a.description).join(' ')}`);
      if (msg.method === 'Log.entryAdded' && ['error', 'warning'].includes(e.entry.level)) p.problems.push(`log: ${e.entry.text} ${e.entry.url ?? ''}`);
      if (msg.method === 'Network.responseReceived' && e.response.status >= 400) p.problems.push(`http ${e.response.status}: ${e.response.url}`);
      if (msg.method === 'Network.loadingFailed' && !e.canceled) p.problems.push(`failed: ${e.errorText}`);
      if (msg.method === 'Network.requestWillBeSent') p.requests.push(e.request.url);
      for (const fn of listeners) fn(msg);
    });
    const send = (method, params = {}) => new Promise((r) => { const n = ++id; waiting.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
    await send('Runtime.enable');
    await send('Log.enable');
    await send('Network.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] });
    if (cookie && origin) {
      const i = cookie.indexOf('=');
      await send('Network.setCookie', { name: cookie.slice(0, i), value: cookie.slice(i + 1), url: origin, httpOnly: true, sameSite: 'Lax' });
    }
    Object.assign(p, {
      send,
      async go(url, settle = 800) {
        const loaded = new Promise((r) => {
          const t = setTimeout(r, 10000);
          const fn = (msg) => { if (msg.method === 'Page.loadEventFired') { clearTimeout(t); listeners.delete(fn); r(); } };
          listeners.add(fn);
        });
        await send('Page.navigate', { url });
        await loaded;
        await sleep(settle);
      },
      async js(expression) {
        // In REPL mode a promise is awaited only when the expression says await.
        if (/^\s*\(async\b/.test(expression) || /^\s*fetch\(/.test(expression)) expression = 'await ' + expression;
        const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, replMode: true });
        if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
        return r.result?.result?.value;
      },
      /** Real key presses: "Enter", "ArrowDown", "/", "ctrl+k". */
      async keys(...list) {
        for (const k of list) {
          const parts = k.split('+');
          const key = parts.pop();
          const mods = (parts.includes('ctrl') ? 2 : 0) | (parts.includes('shift') ? 8 : 0) | (parts.includes('alt') ? 1 : 0) | (parts.includes('meta') ? 4 : 0);
          const [code, text] = KEYS[key] ?? [key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0, key.length === 1 && !mods ? key : undefined];
          const base = { key, code: key.length === 1 ? `Key${key.toUpperCase()}` : key, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, modifiers: mods };
          await send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', ...base, ...(text ? { text } : {}) });
          await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
          await sleep(120);
        }
      },
      async type(text) {
        await send('Input.insertText', { text });
        await sleep(300);
      },
      async click(x, y) {
        for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
        await sleep(300);
      },
      async shot(file, { full = false } = {}) {
        let clip;
        if (full) {
          const h = await p.js('document.documentElement.scrollHeight');
          await send('Emulation.setDeviceMetricsOverride', { width, height: Math.min(h, 12000), deviceScaleFactor: 1, mobile });
          await sleep(500);
        }
        const r = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip } : {}) });
        writeFileSync(file, Buffer.from(r.result.data, 'base64'));
        if (full) await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
      },
      async pdf(file) {
        const r = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
        writeFileSync(file, Buffer.from(r.result.data, 'base64'));
      },
      close: () => ws.close(),
    });
    return p;
  }

  return { page, close: () => { try { proc.kill('SIGKILL'); } catch {} } };
}
