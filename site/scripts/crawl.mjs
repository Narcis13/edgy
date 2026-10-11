// Every docs page, at every size, in both themes, in one headless Chrome:
//
//   node site/scripts/crawl.mjs <docs-url> <out-dir> [--sizes desktop,tablet,phone] [--themes light,dark]
//        [--pages a/,b/] [--axe] [--shots] [--live] [--cookie name=value]
//
// For each page and size and theme it records: console errors and warnings, failed requests and
// HTTP errors (in the page and its live-example frames), horizontal overflow of the page, text
// clipped inside its box, controls smaller than 40px on a phone (links inside running prose are
// exempt, as in WCAG 2.5.8), and, with --axe, axe-core's serious and critical issues. --live scrolls
// through the page (desktop, light) so every live example starts, and counts the iframes that ran.
// --shots writes <out>/<page>-<size>-<theme>.png (the top of the page) for reading.
// It writes <out>/report.json and prints one line per problem; the exit code is 3 when there were any.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const opt = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback; };
const flag = (name) => argv.includes(`--${name}`);
const [base, out] = argv;
if (!base || !out) {
  console.error('usage: node site/scripts/crawl.mjs <docs-url> <out-dir> [--sizes desktop,tablet,phone] [--themes light,dark] [--pages a/,b/] [--axe] [--shots] [--live]');
  process.exit(1);
}
const root = base.endsWith('/') ? base : base + '/';
mkdirSync(out, { recursive: true });
const SIZES = { desktop: [1440, 900, false], tablet: [820, 1180, true], phone: [390, 844, true] };
const sizes = opt('sizes', 'desktop,tablet,phone').split(',');
const themes = opt('themes', 'light,dark').split(',');
const CHROME = process.env.CHROME ?? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const AXE = flag('axe') ? readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8') : '';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9800 + Math.floor(Math.random() * 150);
const profile = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'crawl-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
let target;
for (let i = 0; i < 80 && !target; i++) {
  await sleep(150);
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch {}
}
if (!target) { console.error('chrome did not start'); process.exit(2); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const waiting = new Map();
let seen = [];
const requests = [];
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); return; }
  const p = msg.params;
  if (msg.method === 'Runtime.exceptionThrown') seen.push(`exception: ${p.exceptionDetails.exception?.description ?? p.exceptionDetails.text}`);
  if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'assert'].includes(p.type)) seen.push(`console ${p.type}: ${p.args.map((a) => a.value ?? a.description).join(' ')}`);
  if (msg.method === 'Log.entryAdded' && ['error', 'warning'].includes(p.entry.level)) seen.push(`log: ${p.entry.text} ${p.entry.url ?? ''}`);
  if (msg.method === 'Network.responseReceived' && p.response.status >= 400) seen.push(`http ${p.response.status}: ${p.response.url}`);
  if (msg.method === 'Network.loadingFailed' && !p.canceled) seen.push(`failed: ${p.errorText} (${p.type})`);
  if (msg.method === 'Network.requestWillBeSent') requests.push(p.request.url);
});
const send = (method, params = {}) => new Promise((r) => { const n = ++id; waiting.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, replMode: true });
  if (process.env.CRAWL_DEBUG) console.log('EVAL', JSON.stringify(r).slice(0, 300));
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
  return r.result?.result?.value;
};
await send('Runtime.enable');
await send('Log.enable');
await send('Network.enable');
await send('Page.enable');
const cookie = opt('cookie', '');
if (cookie) {
  const i = cookie.indexOf('=');
  await send('Network.setCookie', { name: cookie.slice(0, i), value: cookie.slice(i + 1), url: new URL(root).origin, httpOnly: true, sameSite: 'Lax' });
}

const loaded = () => new Promise((resolve) => {
  const t = setTimeout(resolve, 8000);
  const on = (m) => { const msg = JSON.parse(m.data); if (msg.method === 'Page.loadEventFired') { clearTimeout(t); ws.removeEventListener('message', on); resolve(); } };
  ws.addEventListener('message', on);
});

const pages = opt('pages', '') ? opt('pages', '').split(',') : await (await fetch(new URL('_/pages.json', root))).json();
const report = [];
let problems = 0;
const CHECKS = `(() => {
  const w = innerWidth, out = { overflow: document.documentElement.scrollWidth - w, wide: [], clipped: [], small: [], h1: document.querySelectorAll('h1').length, skipped: [], images: [], diagrams: [] };
  const scrolls = (el) => el.closest('.table-wrap, pre, .diagram, .live-box, .search-results, .side, .toc');
  const name = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).join('.') : '') + (el.textContent ? ' "' + el.textContent.trim().slice(0, 30) + '"' : '');
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.position === 'fixed') continue;
    if (r.right > w + 1 && !scrolls(el)) out.wide.push(name(el));
    if (/^(P|LI|TD|TH|H[1-6]|A|SPAN|CODE|FIGCAPTION|DT|DD|SUMMARY|BUTTON|LABEL)$/.test(el.tagName) && el.scrollWidth > el.clientWidth + 1 && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll' && cs.textOverflow !== 'ellipsis' && cs.display !== 'inline' && !scrolls(el)) out.clipped.push(name(el));
  }
  if (${'MOBILE'}) {
    for (const el of document.querySelectorAll('a[href], button, summary, input, select, textarea')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue;
      if (el.closest('.prose p, .prose li, .prose td, .prose dd, .prose figcaption, .callout, .foot p, .entry-facts, .search-empty, .search-status') && getComputedStyle(el).display === 'inline') continue;
      if (r.height < 40 || r.width < 40) out.small.push(name(el) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    }
  }
  let last = 1;
  for (const h of document.querySelectorAll('main h1, main h2, main h3, main h4, main h5, main h6')) {
    const n = +h.tagName[1];
    if (n > last + 1) out.skipped.push(h.tagName + ' after H' + last + ': ' + h.textContent.trim().slice(0, 40));
    last = n;
  }
  for (const img of document.querySelectorAll('img')) if (!img.getAttribute('alt')) out.images.push(img.src);
  for (const svg of document.querySelectorAll('svg.dg')) if (!svg.querySelector('title')) out.diagrams.push('a diagram has no title');
  return out;
})()`;

for (const page of pages) {
  for (const size of sizes) {
    const [w, h, mobile] = SIZES[size];
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
    await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 0 });
    for (const theme of themes) {
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
      seen = [];
      requests.length = 0;
      const url = new URL(page, root).href;
      const done = loaded();
      await send('Page.navigate', { url });
      await done;
      await sleep(400);
      const entry = { page, size, theme, problems: [] };
      const add = (s) => { entry.problems.push(s); problems++; console.log(`PROBLEM ${page || '(home)'} ${size} ${theme}: ${s}`); };
      try {
        const c = await evaluate(CHECKS.replace('MOBILE', String(size === 'phone')));
        if (c.overflow > 1) add(`the page scrolls sideways by ${c.overflow}px: ${c.wide.slice(0, 3).join(' | ')}`);
        else if (c.wide.length) add(`sticks out: ${c.wide.slice(0, 3).join(' | ')}`);
        if (c.clipped.length) add(`clipped text: ${c.clipped.slice(0, 4).join(' | ')}`);
        if (c.small.length) add(`small targets: ${c.small.slice(0, 5).join(' | ')}${c.small.length > 5 ? ` and ${c.small.length - 5} more` : ''}`);
        if (c.h1 !== 1) add(`${c.h1} h1 headings`);
        if (c.skipped.length) add(`skipped heading levels: ${c.skipped.join(' | ')}`);
        if (c.images.length) add(`images without alt: ${c.images.join(' ')}`);
        if (c.diagrams.length) add(c.diagrams[0]);
        if (flag('live') && size === sizes[0] && theme === themes[0]) {
          const n = await evaluate(`await (async () => { const H = document.documentElement.scrollHeight; for (let y = 0; y < H; y += innerHeight * 0.8) { scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); } await new Promise(r => setTimeout(r, 2500)); const boxes = [...document.querySelectorAll('.live-box')]; return { examples: boxes.length, running: boxes.filter(b => b.querySelector('iframe')?.contentDocument?.querySelector('.sheet')).length }; })()`);
          entry.live = n;
          if (n.running !== n.examples) add(`${n.examples - n.running} of ${n.examples} live examples did not start`);
          await evaluate('scrollTo(0, 0)');
        }
        if (AXE && (size === 'desktop' || size === 'phone')) {
          const inj = await send('Runtime.evaluate', { expression: AXE });
          if (process.env.CRAWL_DEBUG) console.log(JSON.stringify(inj).slice(0, 300));
          const v = await evaluate(`await (async () => { const r = await window.axe.run(document, { resultTypes: ['violations'] }); return r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id + ' (' + v.impact + '): ' + v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(', ')); })()`);
          for (const x of v) add(`axe ${x}`);
        }
      } catch (e) {
        add(`check failed: ${e.message}`);
      }
      await sleep(150);
      for (const s of seen) add(s);
      const outside = requests.filter((u) => !u.startsWith(root) && !/^(data|blob|about|chrome):/.test(u));
      if (outside.length) add(`requests outside the docs folder: ${outside.slice(0, 3).join(' ')}`);
      if (flag('shots')) {
        const r = await send('Page.captureScreenshot', { format: 'png' });
        writeFileSync(join(out, `${(page || 'home').replace(/\/$/, '').replace(/\//g, '_')}-${size}-${theme}.png`), Buffer.from(r.result.data, 'base64'));
      }
      report.push(entry);
    }
  }
}
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 1));
console.log(`crawled ${pages.length} pages × ${sizes.length} sizes × ${themes.length} themes: ${problems} problems`);
try { chrome.kill('SIGKILL'); } catch {}
process.exit(problems ? 3 : 0);
