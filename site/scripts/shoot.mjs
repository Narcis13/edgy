// Every screenshot and clip the docs show, made from a fresh edgy, in light and dark.
//
//   node site/scripts/shoot.mjs [--only name,name] [--no-clips] [--keep] [--reuse-build] [--preview]
//
//   --only         shoot just these names (screenshots and clips alike); shots.json keeps the others
//   --no-clips     screenshots only
//   --keep         leave the server running at the end (port 8793)
//   --reuse-build  skip the app build when one is already there (for working on this script)
//   --preview      also write PNG copies of everything to $TMPDIR/shoot-preview/, to look at
//
// What it does: builds the app, starts a production edgy on port 8793 with an empty data
// directory under $TMPDIR (its own clock, set to a fixed day, so dates never change between
// runs), seeds it over HTTP (two people, a handful of documents, a pin, a deck, records, an
// API key, a share), drives one headless Chrome over CDP and writes site/shots/<name>-light.webp
// and -dark.webp, site/clips/<name>-light.webm and -dark.webm (with posters), and
// site/shots/shots.json, which carries each picture's size, alt text and numbered marks.
// Then it stops the server and lists the files that changed.
//
// Test data only: the people are example.test addresses, the password the test value serve.sh uses.
// Needs Node 22+, Chrome (CHROME=… if it is not in the usual place) and ffmpeg on the PATH.

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CLIPS, KIND_DESIGNERS, SHOTS, TUTORIALS } from './shots.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SHOTS_DIR = join(ROOT, 'site/shots');
const CLIPS_DIR = join(ROOT, 'site/clips');
const TMP = process.env.TMPDIR ?? process.env.TEMP ?? tmpdir();
const PORT = 8793;
const BASE = `http://127.0.0.1:${PORT}`;
const BEN_BASE = `http://localhost:${PORT}`; // a different host, so its own cookie jar
const PASSWORD = 'correct horse'; // the test value serve.sh uses for its accounts
const SCALE = 1.5;

const args = [...process.argv.slice(2), ...(process.env.SHOOT_REUSE ? ['--reuse-build'] : [])];
const flag = (n) => args.includes(`--${n}`);
const only = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',')) : null;
const wanted = (name) => !only || only.has(name);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log(...a);
const hashOf = (file) => createHash('sha1').update(readFileSync(file)).digest('hex').slice(0, 10);
const win = (p) => p.replace(/\\/g, '/');

// ───────────────────────────── the server ─────────────────────────────

const GIT_BASH = ['C:/Program Files/Git/bin/bash.exe', 'C:/Program Files (x86)/Git/bin/bash.exe'].find(existsSync) ?? 'bash';
const SERVE = join(ROOT, '.claude/goal-loop/serve.sh');
const DATA = join(TMP, 'shoot-data');
const DIST = join(TMP, `goal-loop-dist-${PORT}`);
const SERVER_LOG = join(TMP, `goal-loop-serve-${PORT}.log`);
const PIDFILE = join(TMP, `goal-loop-serve-${PORT}.pid`);

/** The day the server (and so every date in a picture) lives on. */
const DAY = Date.UTC(2026, 2, 12, 9, 30); // Thursday 12 March 2026, 09:30 UTC

let clockShift = 0;
/** The moment every page sees: five minutes after the server's clock now. */
export const pageNow = () => Date.now() + clockShift + 5 * 60_000;

function stopServer() {
  spawnSync(GIT_BASH, [SERVE, 'stop', String(PORT)], { cwd: ROOT, env: { ...process.env, TMPDIR: TMP }, stdio: 'ignore' });
}

async function startServer() {
  stopServer();
  rmSync(DATA, { recursive: true, force: true });
  mkdirSync(DATA, { recursive: true });
  // The app is built the way serve.sh builds it. The docs and the offline bundle are left out: no picture shows them,
  // and the docs may be half written while these pictures are made.
  if (!(flag('reuse-build') && existsSync(join(DIST, 'index.html')))) {
    say('building the app …');
    const b = spawnSync(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', DIST, '--emptyOutDir'], { cwd: ROOT, encoding: 'utf8' });
    if (b.status !== 0) throw new Error(`the app did not build:\n${(b.stdout ?? '') + (b.stderr ?? '')}`.slice(-2000));
  }
  // The server's clock starts at DAY and runs forward from there.
  clockShift = DAY - Date.now();
  const clock = join(TMP, 'shoot-clock.mjs');
  writeFileSync(clock, `const R = Date; const shift = ${clockShift};
globalThis.Date = class extends R { constructor(...a) { if (a.length === 0) super(R.now() + shift); else super(...a); } static now() { return R.now() + shift; } };
`);
  const env = {
    ...process.env, TMPDIR: TMP, NODE_ENV: 'production', EDGY_AUTH: 'accounts', EDGY_PORT: String(PORT), EDGY_DATA: DATA, EDGY_DIST: DIST,
    EDGY_AI: 'off', // Ask AI answers with the built-in composer, the same on every machine
  };
  delete env.ANTHROPIC_API_KEY;
  delete env.TURSO_URL;
  delete env.TURSO_AUTH_TOKEN;
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', '--import', 'tsx', '--import', pathToFileURL(clock).href, 'src/server/index.ts'], {
    cwd: ROOT, env, stdio: ['ignore', openLog(), openLog()], detached: true, windowsHide: true,
  });
  child.unref();
  writeFileSync(PIDFILE, String(child.pid));
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch { /* not yet */ }
    await sleep(500);
  }
  throw new Error(`the server did not come up; see ${SERVER_LOG}`);
}

const openLog = () => openSync(SERVER_LOG, 'a');

// ───────────────────────────── HTTP and seeding ─────────────────────────────

/** A person talking to the server: a cookie (or an API key) and no Origin, like curl. */
class Person {
  constructor(name, email) {
    this.name = name;
    this.email = email;
    this.cookie = '';
  }
  async call(method, path, body, { base = BASE, key } = {}) {
    const res = await fetch(base + path, {
      method,
      headers: {
        ...(this.cookie && !key ? { cookie: this.cookie } : {}),
        ...(key ? { authorization: `Bearer ${key}` } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : {};
  }
  async signUp() {
    const res = await fetch(`${BASE}/api/auth/signup`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: this.email, password: PASSWORD, name: this.name }),
    });
    if (!res.ok) throw new Error(`sign up ${this.email}: ${res.status} ${await res.text()}`);
    this.cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
    this.id = (await res.json()).user.id;
  }
}

/** Everything the pictures show, made in a fixed order so the words and the numbers are the same on every run (the ids are random). */
async function seed() {
  const ana = new Person('Ana', 'ana@example.test');
  const ben = new Person('Ben', 'ben@example.test');
  await ana.signUp();
  await ben.signUp();
  const ids = {};
  const human = { kind: 'human', name: 'Ana' };
  const make = async (key, title, from, description) => {
    const body = typeof from === 'string' ? { title, template: from } : { title, root: from };
    const d = await ana.call('POST', '/api/docs', { ...body, actor: human });
    if (description) await ana.call('PATCH', `/api/docs/${d.id}`, { description });
    ids[key] = d.id;
    return d.id;
  };
  // Older documents first, so "last changed" puts the newer ones on top.
  await make('feedback', 'Visitor feedback', 'feedback', 'The form on the studio tablet; answers go into the feedback collection.');
  await make('savings', 'Studio savings plan', 'savings', 'How much to put aside each month for the new printer and the van.');
  await make('billing', 'Studio billing and ledger', 'tables', 'Every invoice and project this quarter, grouped by status.');
  await make('offsite', 'Team offsite, Lisbon', 'showcase', 'Budget, packing list and who is coming, for the October offsite.');
  await make('stall', 'Saturday market stall', 'events', 'Prices in lei at the live rate, and the basket for Saturday.');
  await make('orders', 'Harbour & Co. order desk', 'elements', 'How an order travels, the week’s orders, and phone orders.');
  await make('quote', 'Quote for Northwind', 'quote', 'Brand identity, website and a photography day.');

  // A pin, and a deck of three for the quarterly review.
  await ana.call('PATCH', `/api/docs/${ids.offsite}`, { pinned: true });
  await ana.call('PATCH', `/api/docs/${ids.orders}`, { pinned: true });
  await ana.call('POST', '/api/library/pins', { ids: [ids.orders, ids.offsite] });
  const deck = await ana.call('POST', '/api/decks', { title: 'Quarterly review', description: 'The savings plan, the billing and the offsite budget, for Friday.', docs: [ids.savings, ids.billing, ids.offsite] });
  ids.deck = deck.id;

  // Saved records, the way the quote's "Save this quote" button writes them.
  for (const r of [
    { client: 'Northwind', date: '2026-02-03', items: 3, total: 6404.58 },
    { client: 'Harbour Lights', date: '2026-02-17', items: 2, total: 2380 },
    { client: 'Brightside Café', date: '2026-03-02', items: 4, total: 1190.4 },
    { client: 'Ada Lovelace', date: '2026-03-09', items: 1, total: 4200 },
  ]) await ana.call('POST', '/api/data/quotes', { record: r });

  // An API key, shown once and never printed.
  const key = (await ana.call('POST', '/api/me/keys', { name: 'Claude on my laptop' })).key;

  // Ben may edit the quote; anyone with the link may open it.
  await ana.call('POST', `/api/docs/${ids.quote}/people`, { email: ben.email, role: 'editor' });
  await ana.call('POST', `/api/docs/${ids.quote}/shares`, { access: 'view' });

  // A little history on the quote: Ana, Ben and Claude, each under their own name.
  await ana.call('POST', `/api/docs/${ids.quote}/ops`, { actor: human, ops: [['set', 'discount', 'value', 15]] });
  await ben.call('POST', `/api/docs/${ids.quote}/ops`, { actor: { kind: 'human', name: 'Ben' }, ops: [['set', 'c31', 'value', 3]] });
  await ana.call('POST', `/api/docs/${ids.quote}/ops`, { actor: { kind: 'agent', name: 'Claude' }, ops: [['set', 'c20', 'value', 'Brand identity and guidelines']] }, { key });
  await ana.call('POST', `/api/docs/${ids.quote}/messages`, { actor: human, text: 'Claude, can you make the photography line two days again?' });
  return { ana, ben, ids };
}

export { seed, startServer, stopServer, Person };


// ───────────────────────────── Chrome over CDP ─────────────────────────────

const CHROME = process.env.CHROME ?? [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find(existsSync);

const KEYS = {
  Enter: [13, '\r'], Escape: [27], Tab: [9], Backspace: [8], Delete: [46], Space: [32, ' '],
  ArrowLeft: [37], ArrowUp: [38], ArrowRight: [39], ArrowDown: [40], Home: [36], End: [35],
};

export class Browser {
  static async launch() {
    if (!CHROME) throw new Error('Chrome not found; set CHROME=/path/to/chrome');
    const port = 9400 + Math.floor(Math.random() * 400);
    const dir = join(TMP, 'shoot-chrome');
    rmSync(dir, { recursive: true, force: true });
    const proc = spawn(CHROME, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-color-profile=srgb', '--font-render-hinting=none',
      '--no-first-run', '--no-default-browser-check', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, 'about:blank',
    ], { stdio: 'ignore' });
    let ws;
    for (let i = 0; i < 80 && !ws; i++) {
      await sleep(150);
      try { ws = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; } catch { /* not yet */ }
    }
    if (!ws) { proc.kill(); throw new Error('Chrome did not start'); }
    const socket = new WebSocket(ws);
    await new Promise((r, j) => { socket.addEventListener('open', r, { once: true }); socket.addEventListener('error', j, { once: true }); });
    return new Browser(proc, socket);
  }

  constructor(proc, socket) {
    this.proc = proc;
    this.socket = socket;
    this.id = 0;
    this.waiting = new Map();
    this.listeners = new Map(); // sessionId -> Set<(method, params) => void>
    socket.addEventListener('message', (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && this.waiting.has(msg.id)) {
        const { resolve, reject, method } = this.waiting.get(msg.id);
        this.waiting.delete(msg.id);
        if (msg.error) reject(new Error(`${method}: ${msg.error.message}`));
        else resolve(msg.result);
        return;
      }
      for (const fn of this.listeners.get(msg.sessionId ?? '') ?? []) fn(msg.method, msg.params);
    });
  }

  send(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.waiting.set(id, { resolve, reject, method });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  /** A fresh tab in a context of its own (its own cookies, storage and theme). */
  async page(o = {}) {
    const { browserContextId } = await this.send('Target.createBrowserContext', { disposeOnDetach: true });
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank', browserContextId });
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    const page = new Page(this, sessionId, targetId, browserContextId);
    await page.init(o);
    return page;
  }

  async close() {
    try { await this.send('Browser.close'); } catch { /* gone already */ }
    try { this.socket.close(); } catch { /* ok */ }
    setTimeout(() => this.proc.kill(), 1500).unref();
  }
}

/** In the page, time stands still on the server's day, so "5 min ago" stays "5 min ago"; carets are hidden and, for stills, motion is off. */
const pageScript = (now, freezeMotion, cursor) => `(() => {
  const R = Date;
  const NOW = ${now};
  globalThis.Date = class extends R { constructor(...a) { if (a.length === 0) super(NOW); else super(...a); } static now() { return NOW; } };
  const css = ${JSON.stringify(
    '*,*::before,*::after{caret-color:transparent!important;scroll-behavior:auto!important}'
    + (freezeMotion ? '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important}' : ''),
  )};
  const add = () => { const s = document.createElement('style'); s.textContent = css; (document.head || document.documentElement).appendChild(s); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add, { once: true }); else add();
  ${cursor ? `
  // A pointer to follow, since a screen recording has none of its own.
  const arrow = () => {
    const c = document.createElement('div');
    c.id = '__cursor';
    c.style.cssText = 'position:fixed;left:-60px;top:-60px;width:22px;height:22px;z-index:2147483647;pointer-events:none;transition:transform 80ms;transform-origin:3px 2px;filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.45))';
    c.innerHTML = '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 2 L3 17 L7.2 13.2 L10 19.5 L12.6 18.4 L9.9 12.2 L15.5 12 Z" fill="#fff" stroke="#111" stroke-width="1.3" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(c);
    addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', () => { c.style.transform = 'scale(.82)'; }, true);
    addEventListener('mouseup', () => { c.style.transform = ''; }, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrow, { once: true }); else arrow();
  ` : ''}
})();`;

/** The shown elements matching a selector, as page code. `css >> text` keeps those whose text starts with `text`. */
const Q = (sel) => {
  const [css, text] = sel.split(' >> ');
  return `[...document.querySelectorAll(${JSON.stringify(css)})].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0${text ? ` && e.textContent.includes(${JSON.stringify(text)})` : ''}; })`;
};

export class Page {
  constructor(browser, sessionId, targetId, contextId) {
    this.browser = browser;
    this.sessionId = sessionId;
    this.targetId = targetId;
    this.contextId = contextId;
    this.problems = [];
    this.handlers = new Map();
  }

  send(method, params = {}) {
    return this.browser.send(method, params, this.sessionId);
  }

  on(method, fn) {
    this.handlers.set(method, [...(this.handlers.get(method) ?? []), fn]);
  }

  async init({ width = 1280, height = 800, mobile = false, dark = false, cookie, cookieUrl = BASE, now, freezeMotion = true, cursor = false } = {}) {
    this.mobile = mobile;
    const set = this.browser.listeners.get(this.sessionId) ?? new Set();
    this.browser.listeners.set(this.sessionId, set);
    set.add((method, p) => {
      for (const fn of this.handlers.get(method) ?? []) fn(p);
      if (method === 'Runtime.exceptionThrown') this.problems.push(`exception: ${p.exceptionDetails.exception?.description ?? p.exceptionDetails.text}`);
      if (method === 'Runtime.consoleAPICalled' && ['error', 'assert'].includes(p.type)) this.problems.push(`console.${p.type}: ${p.args.map((a) => a.value ?? a.description).join(' ')}`.slice(0, 300));
      if (method === 'Network.responseReceived' && p.response.status >= 400) this.problems.push(`http ${p.response.status} ${p.response.url}`);
    });
    for (const d of ['Runtime', 'Page', 'Network']) await this.send(`${d}.enable`);
    await this.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await this.viewport(width, height);
    await this.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }, { name: 'prefers-reduced-motion', value: 'no-preference' }] });
    await this.send('Emulation.setTimezoneOverride', { timezoneId: 'UTC' });
    await this.send('Emulation.setLocaleOverride', { locale: 'en-US' });
    if (mobile) await this.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    if (cookie) {
      const i = cookie.indexOf('=');
      await this.send('Network.setCookie', { name: cookie.slice(0, i), value: cookie.slice(i + 1), url: cookieUrl, httpOnly: true, sameSite: 'Lax' });
    }
    if (now) await this.send('Page.addScriptToEvaluateOnNewDocument', { source: pageScript(now, freezeMotion, cursor) });
  }

  async viewport(width, height) {
    this.width = width;
    this.height = height;
    await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: SCALE, mobile: this.mobile });
  }

  /** Evaluate an expression in the page (top-level await works); throws what the page threw. */
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, replMode: true });
    if (r.exceptionDetails) throw new Error(`in page: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}\n${expression.slice(0, 200)}`);
    return r.result.value;
  }

  async goto(url) {
    const loaded = new Promise((r) => this.on('Page.loadEventFired', r));
    await this.send('Page.navigate', { url });
    await Promise.race([loaded, sleep(15000)]);
  }

  /** Wait until an expression is truthy. */
  async until(expression, what = expression, timeout = 15000) {
    const t0 = Date.now();
    for (;;) {
      let v = false;
      try { v = await this.eval(`!!(${expression})`); } catch { /* the page is still loading */ }
      if (v) return v;
      if (Date.now() - t0 > timeout) throw new Error(`timed out waiting for ${what}`);
      await sleep(100);
    }
  }

  /** Everything has stopped moving: fonts loaded, pictures decoded, nothing saving, no "Opening…". */
  async settle(extra = 300) {
    await this.until(`!document.querySelector('.screen-note') && document.fonts.status === 'loaded'`, 'the page to open');
    await this.eval(`document.fonts.ready.then(() => Promise.all([...document.images].map((i) => i.decode().catch(() => 0)))).then(() => 1)`);
    await this.until(`!document.querySelector('.save-state.is-busy')`, 'saving to finish');
    await this.eval(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
    await sleep(extra);
  }

  /** The box of the nth shown element matching a selector, in CSS pixels of the viewport; null when none. */
  async box(selector, nth = 0) {
    return this.eval(`(() => {
      const el = ${Q(selector)}[${nth}];
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    })()`);
  }

  async need(selector, nth = 0) {
    await this.until(`${Q(selector)}.length > ${nth}`, selector);
    return this.box(selector, nth);
  }

  async mouse(type, x, y, extra = {}) {
    await this.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: type === 'mouseMoved' ? 0 : 1, ...extra });
  }

  /** Where the pointer is, so a move can glide there the way a hand does. */
  async move(x, y, buttons = 0) {
    if (this.glide && this.at) {
      const [x0, y0] = this.at;
      const steps = Math.max(6, Math.min(22, Math.round(Math.hypot(x - x0, y - y0) / 18)));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps, e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        await this.mouse('mouseMoved', x0 + (x - x0) * e, y0 + (y - y0) * e, buttons ? { button: 'left', buttons } : {});
        await sleep(14);
      }
    } else await this.mouse('mouseMoved', x, y, buttons ? { button: 'left', buttons } : {});
    this.at = [x, y];
  }

  /** Press at one point, drag to another, let go. */
  async drag(from, to) {
    await this.move(from[0], from[1]);
    await this.mouse('mousePressed', from[0], from[1]);
    await sleep(60);
    await this.move(to[0], to[1], 1);
    await sleep(60);
    await this.mouse('mouseReleased', to[0], to[1]);
  }

  async clickAt(x, y) {
    if (this.mobile) {
      // A finger, not a mouse.
      await this.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await this.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      return;
    }
    await this.move(x, y);
    await this.mouse('mousePressed', x, y);
    if (this.glide) await sleep(90);
    await this.mouse('mouseReleased', x, y);
  }

  /** A real click on an element (scrolled into view first); `at` is where in it, as fractions. */
  async click(selector, nth = 0, at = [0.5, 0.5]) {
    await this.need(selector, nth);
    await this.eval(`${Q(selector)}[${nth}].scrollIntoView({ block: 'nearest', inline: 'nearest' })`);
    const b = await this.box(selector, nth);
    await this.clickAt(b.x + b.w * at[0], b.y + b.h * at[1]);
  }

  /** A click on the first shown element matching a selector whose text starts with `text`. */
  async clickText(selector, text) {
    const nth = await this.eval(`${Q(selector)}.findIndex((e) => e.textContent.trim().startsWith(${JSON.stringify(text)}))`);
    if (nth < 0) throw new Error(`no ${selector} with the text "${text}"`);
    await this.click(selector, nth);
  }

  /** A real key press, with modifiers: key('e', { ctrl: true }), key('ArrowRight', { alt: true }). */
  async key(key, { ctrl = false, alt = false, shift = false } = {}) {
    const [vk, text] = KEYS[key] ?? (key.length === 1 ? [key.toUpperCase().charCodeAt(0), key] : [0]);
    const code = key.length === 1 ? (/[a-z]/i.test(key) ? `Key${key.toUpperCase()}` : key === '/' ? 'Slash' : key) : key;
    const vkey = key === '/' ? 191 : vk;
    const modifiers = (alt ? 1 : 0) | (ctrl ? 2 : 0) | (shift ? 8 : 0);
    const base = { key, code, windowsVirtualKeyCode: vkey, nativeVirtualKeyCode: vkey, modifiers };
    const typed = text && !ctrl && !alt;
    await this.send('Input.dispatchKeyEvent', { type: typed ? 'keyDown' : 'rawKeyDown', ...base, ...(typed ? { text } : {}) });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }

  /** Type text as a person would, one character at a time. */
  async type(text, delay = 25) {
    for (const ch of text) {
      await this.send('Input.insertText', { text: ch });
      await sleep(delay);
    }
  }

  /** A picture of the page, or of a rectangle of it (CSS pixels of the viewport), as WebP bytes. */
  async capture(clip) {
    const r = await this.send('Page.captureScreenshot', {
      format: 'webp', quality: 82,
      ...(clip ? { clip: { x: clip.x, y: clip.y, width: clip.w, height: clip.h, scale: 1 } } : {}),
    });
    return Buffer.from(r.data, 'base64');
  }

  async close() {
    try { await this.browser.send('Target.disposeBrowserContext', { browserContextId: this.contextId }); } catch { /* ok */ }
  }
}

// ───────────────────────────── the pictures ─────────────────────────────

const WORLD = { ids: {}, ana: null, ben: null, now: 0, browser: null };
const DESK = [1280, 800];
const PHONE = [390, 844];

/** What a picture needs from the page it was made on. */
class Scene {
  constructor(page, dark) {
    this.p = page;
    this.dark = dark;
  }
  /** The id of the cell with this name (or id, or `kind:<kind>` for the first of a kind). */
  id(name) {
    return this.p.eval(`(() => {
      const find = (c) => { if (${JSON.stringify(name)}.startsWith('kind:') ? c.kind === ${JSON.stringify(name)}.slice(5) : (c.name === ${JSON.stringify(name)} || c.id === ${JSON.stringify(name)})) return c.id; for (const k of c.children ?? []) { const r = find(k); if (r) return r; } return null; };
      return find(edgy.state.doc.root);
    })()`).then((id) => { if (!id) throw new Error(`no cell "${name}"`); return id; });
  }
  async select(name) {
    await this.p.eval(`edgy.select(${JSON.stringify(await this.id(name))})`);
    await this.p.settle(150);
  }
  /** Open a document in the editor and wait for it. */
  async open(key, view = 'edit', base = BASE) {
    const id = WORLD.ids[key] ?? key;
    await this.p.goto(`${base}/d/${id}?view=${view}`);
    await this.p.until(`window.edgy?.state.status === 'ready'`, 'the document to open');
    await this.p.settle();
  }
  /** Close the side panels the window opened by itself, so the document has the room. */
  async closePanels() {
    for (const title of ['Cell details', 'Activity and messages']) {
      if (await this.p.eval(`document.querySelector('button[title="${title}"]')?.getAttribute('aria-pressed') === 'true'`)) await this.p.click(`button[title="${title}"]`);
    }
    await this.p.settle(300);
  }
  /** A box of the page, from page code that returns a DOM element (or null). */
  async boxOf(js) {
    const b = await this.p.eval(`(() => { const el = (${js}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
    if (!b) throw new Error(`nothing for ${js}`);
    return b;
  }
  /** The smallest box holding several boxes, grown by `pad` and kept on the screen. */
  union(boxes, pad = 0, padTop = pad) {
    const x0 = Math.min(...boxes.map((b) => b.x)), y0 = Math.min(...boxes.map((b) => b.y));
    const x1 = Math.max(...boxes.map((b) => b.x + b.w)), y1 = Math.max(...boxes.map((b) => b.y + b.h));
    const x = Math.max(0, x0 - pad), y = Math.max(0, y0 - padTop);
    return { x, y, w: Math.min(this.p.width, x1 + pad) - x, h: Math.min(this.p.height, y1 + pad) - y };
  }
  /** Grow the window to show a scrolling pane whole (never beyond 2600 px). */
  async grow(within) {
    const extra = await this.p.eval(`(() => {
      let most = 0;
      const root = ${within ? `document.querySelector(${JSON.stringify(within)})` : 'document'};
      for (const el of [...(root === document ? [] : [root]), ...root.querySelectorAll('*')]) {
        const o = getComputedStyle(el).overflowY;
        if ((o === 'auto' || o === 'scroll') && el.clientHeight > 200 && el.scrollHeight > el.clientHeight + 2) most = Math.max(most, el.scrollHeight - el.clientHeight);
      }
      return most;
    })()`);
    if (extra) {
      await this.p.viewport(this.p.width, Math.min(2600, this.p.height + extra));
      await this.p.settle(300);
    }
  }
  async scrub() {
    // A share link carries a random token: show a made-up one so the picture is the same every time.
    await this.p.eval(`(() => { for (const el of document.querySelectorAll('.pf-keys code')) el.textContent = 'edgy_k7Qm2x…'; for (const el of document.querySelectorAll('.share-link code, .share-link input, .share-link span')) { const t = el.value ?? el.textContent; if (/\\/s\\//.test(t)) { const v = 'https://edgy.example/s/Hk3dQ8mW2xTn'; if ('value' in el) { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, v); } else el.textContent = v; } } })()`);
  }
}

const doc = (key, view = 'edit') => ({ view, key });

/** A document for a designer shot: one cell of the kind, named "thing", built from notation. */
const DESIGNERS = {
  row: ['col', ['text', { size: 'hug' }, '**Packing**'], ['row', { name: 'thing' }, ['input', { type: 'checkbox', label: 'Passport' }], ['input', { type: 'checkbox', label: 'Tickets', value: true }], ['input', { type: 'checkbox', label: 'Charger' }]]],
  col: ['row', ['col', { name: 'thing' }, ['text', '**Morning**'], ['text', 'Coffee and the stand-up'], ['text', 'Design review']], ['col', ['text', '**Afternoon**'], ['text', 'Workshop'], ['text', 'Demo']]],
  empty: ['col', ['text', { size: 'hug' }, '**Notes**'], ['empty', { name: 'thing' }]],
  tabs: ['tabs', { name: 'thing', value: 'Overview' }, ['panel', { title: 'Overview' }, ['text', 'Three days in Lisbon for the whole team.']], ['panel', { title: 'Budget' }, ['text', 'Flights, hotel nights and the venue.']], ['panel', { title: 'People' }, ['text', 'Fourteen people are coming.']]],
  panel: ['tabs', { name: 'holder', value: 'Budget' }, ['panel', { title: 'Overview', name: 'thing' }, ['text', 'Three days in Lisbon for the whole team.']], ['panel', { title: 'Budget' }, ['text', 'Flights, hotel nights and the venue.']]],
  accordion: ['accordion', { name: 'thing', multiple: true }, ['panel', { title: 'Shipping' }, ['text', 'Orders leave the studio on Tuesdays and Fridays.']], ['panel', { title: 'Returns' }, ['text', 'Send it back within 30 days.']]],
  collapsible: ['collapsible', { name: 'thing', title: 'More details', value: true }, ['text', 'The venue is a ten minute walk from the hotel.'], ['text', 'Dinner is on Thursday at 20:00.']],
  text: ['text', { name: 'thing' }, '# Welcome\nA short note with **bold** words, a [link](https://example.test) and a list:\n- one\n- two'],
  image: ['image', { name: 'thing', fit: 'contain', alt: 'One cell dividing into two' }, '/art/division.svg'],
  icon: ['icon', { name: 'thing' }, 'anchor'],
  break: ['col', ['text', 'Page one'], ['break'], ['text', 'Page two']],
  input: ['input', { name: 'thing', type: 'number', label: 'Quantity', value: 12, min: 0, step: 1 }],
  formula: ['col', ['input', { name: 'qty', type: 'number', label: 'Quantity', value: 12 }], ['input', { name: 'price', type: 'number', label: 'Unit price', value: 40 }], ['formula', { name: 'thing', format: 'currency' }, ['*', '$qty', '$price']]],
  data: ['col', ['text', 'The regions the report covers:'], ['data', { name: 'thing' }, ['North', 'South', 'East']]],
  stat: ['stat', { name: 'thing', label: 'Billed this quarter', format: 'currency', compare: 36000, trend: ['list', 30, 34, 33, 38, 41, 42] }, 42000],
  button: ['col', ['input', { name: 'count', type: 'number', label: 'Count', value: 0 }], ['button', { name: 'thing', variant: 'solid', do: ['set!', 'count', ['+', '$count', 1]] }, 'Add one']],
  list: ['list', { name: 'thing', type: 'check', label: 'Packing' }, 'Passport', { text: 'Tickets', done: true }, 'Charger'],
  table: ['table', { name: 'thing', label: 'The team', value: [{ name: 'Ada Lovelace', team: 'Engineering', nights: 3 }, { name: 'Grace Hopper', team: 'Research', nights: 2 }, { name: 'Mira Patel', team: 'Design', nights: 3 }], columns: ['name', 'team', { key: 'nights', total: 'sum' }] }],
  calendar: ['calendar', { name: 'thing', label: 'Offsite' }, ['list', { date: '2026-03-16', title: 'Kick-off', color: 'accent' }, { date: '2026-03-18', end: '2026-03-19', title: 'Workshop', color: 'live' }]],
  chart: ['chart', { name: 'thing', type: 'bar', label: 'Sales by month' }, ['list', ['list', 'Jan', 12], ['list', 'Feb', 18], ['list', 'Mar', 15], ['list', 'Apr', 24]]],
  diagram: ['diagram', { name: 'thing' }, { id: 'a', type: 'rect', text: 'Order placed' }, { id: 'b', type: 'diamond', text: 'Paid?' }, { id: 'c', type: 'rect', text: 'Ship it' }, { type: 'arrow', from: 'a', to: 'b' }, { type: 'arrow', from: 'b', to: 'c', text: 'yes' }],
  canvas: ['canvas', { name: 'thing', label: 'Sign here', paper: 'plain' }],
  timer: ['col', ['data', { name: 'ticks' }, 0], ['timer', { name: 'thing', every: 30, on: { tick: ['set!', 'ticks', ['+', '$ticks', 1]] } }]],
  fetch: ['fetch', { name: 'thing', every: 60, label: 'Exchange rate' }, '/api/demo/rate'],
};

/** What the cell in each designer shot is called (its notation says "thing"), and which cell the shot selects when that is not the named one. */
const DESIGNER_NAME = {
  row: 'packing', col: 'morning', empty: 'blank', tabs: 'view', panel: 'overview', accordion: 'faq', collapsible: 'more', text: 'welcome', image: 'diagram-art', icon: 'logo',
  break: 'split', input: 'quantity', formula: 'total', data: 'regions', stat: 'billed', button: 'add-one', list: 'todo', table: 'roster', calendar: 'cal', chart: 'sales',
  diagram: 'flow', canvas: 'signature', timer: 'poll', fetch: 'rate',
};
const DESIGNER_SELECT = { empty: 'kind:empty', break: 'kind:break', panel: 'kind:panel' };
const designerNotation = (kind) => JSON.parse(JSON.stringify(DESIGNERS[kind]).replaceAll('"thing"', JSON.stringify(DESIGNER_NAME[kind])));

/** Documents made for a picture, once per kind, by Ana. */
const made = new Map();
async function madeDoc(key, title, root) {
  if (!made.has(key)) made.set(key, (await WORLD.ana.call('POST', '/api/docs', { title, root, actor: { kind: 'human', name: 'Ana' } })).id);
  return made.get(key);
}

const SPECS = {};
const spec = (name, s) => { SPECS[name] = s; };

// ── pages outside the editor ──
spec('library', {
  url: '/',
  marks: [['input[placeholder^="Search"]', 'Search'], ['.lib-filters', 'Filters'], ['.lib-starts', 'Start from a template'], ['.lib-section.is-pinned .lc-pic', 'A pinned document, with a map of it'], ['.lib-new', 'New document']],
});
spec('library-search', {
  url: '/',
  setup: async ({ p }) => {
    await p.click('input[placeholder^="Search"]');
    await p.type('quote');
    await p.until(`document.querySelector('.lib-results')?.textContent.includes('results for')`, 'search results');
  },
  marks: [['input[placeholder^="Search"]', 'Search'], ['.lc-match', 'Where the words matched'], ['.lc-title mark, .lc-title .hit, .lc-title', 'The title, with the match marked']],
});
spec('data', {
  url: '/data',
  setup: async ({ p }) => { await p.click('.collections button >> quotes'); await p.until(`document.querySelector('.records-head h2')?.textContent === 'quotes'`); },
  marks: [['.collections', 'Collections', { at: [0.5, 0.25] }], ['.records-head h2', 'The selected one'], ['table.data tbody tr', 'A record'], ['.records-head .btn', 'Delete all']],
});
spec('profile', {
  url: '/profile',
  fit: true,
  crop: (c) => c.boxOf(`document.querySelector('.profile')`),
  marks: [['.pf-you', 'Name and colour'], ['.pf-themes', 'Theme'], ['.pf-keys', 'API keys']],
});
spec('api-keys', {
  url: '/profile',
  fit: true,
  crop: (c) => c.boxOf(`document.querySelector('.pf-keys').closest('section')`),
  marks: [['.pf-keys li', 'A key: its name, start and last use'], ['.pf-inline .btn', 'Create a key']],
});
spec('signin', {
  user: null,
  url: '/signin',
  setup: async ({ p }) => { await p.eval(`document.activeElement?.blur()`); },
  marks: [['input[type=email], input[name=email]', 'Email'], ['input[type=password]', 'Password'], ['form .btn.solid, button[type=submit]', 'Sign in']],
});

// ── the editor ──
spec('editor-edit', {
  doc: doc('quote'),
  setup: async (c) => { await c.select('subtotal'); },
  marks: [['.seg.mode', 'Edit, Live and Page'], ['.sheet .cell.is-selected', 'The selected cell'], ['aside.side.right .panel-body', 'Cell details'], ['.share-btn', 'Share'], ['button[title="Activity and messages"]', 'Activity']],
});
spec('editor-live', {
  doc: doc('quote', 'live'),
  setup: async (c) => { await c.closePanels(); },
  marks: [['.seg.mode', 'Edit, Live and Page'], ['.sheet input[type=number]', 'An input, ready to type in'], ['.sheet .kind-formula', 'A formula, up to date'], ['.sheet button >> Add a line', 'A button']],
});
spec('editor-page', {
  doc: doc('quote', 'page'), size: [1280, 1480],
  setup: async (c) => { await c.closePanels(); },
  crop: async (c) => c.union([await c.boxOf(`document.querySelector('.page-bar')`), await c.boxOf(`document.querySelector('.page')`)], 20),
  marks: [['.page-bar', 'Page setup'], ['.page', 'A printed page, with its margins'], ['.page-foot', 'The footer with its page number', { at: [0.93, 0.5] }]],
});
spec('editor-phone', {
  doc: doc('quote', 'live'), size: PHONE, mobile: true,
  marks: [['.more-btn', 'More'], ['.seg.mode', 'Edit, Live and Page'], ['.sheet input', 'Cells stacked in one column']],
});
spec('more-menu', {
  doc: doc('quote', 'live'), size: PHONE, mobile: true,
  setup: async ({ p }) => { await p.click('.more-btn'); await p.until(`document.querySelector('.more-menu')`); },
  marks: [['.more-btn', 'More'], ['.more-menu button >> Share', 'Share'], ['.more-menu button >> Profile', 'Profile']],
});
spec('split', {
  doc: doc('quote'),
  setup: async (c) => { await c.select('c40'); await c.p.move(10, 10); },
  crop: async (c) => c.union([await c.boxOf(`document.querySelector('.sheet .cell.is-selected')`), await c.boxOf(`document.querySelector('.toolbar')`)], 28),
  marks: [['.edge.r', 'Split to the right'], ['.edge.b', 'Split below'], ['.edge.l', 'Split to the left'], ['.edge.t', 'Split above']],
});
spec('slash-menu', {
  doc: doc('notes'),
  setup: async (c) => { await c.select('kind:empty'); await c.p.key('/'); await c.p.until(`document.querySelector('.kind-menu')`); await c.p.settle(200); },
  crop: async (c) => c.union([await c.boxOf(`document.querySelector('.sheet .cell.is-selected')`), await c.boxOf(`document.querySelector('.toolbar')`), await c.boxOf(`document.querySelector('.kind-menu')`)], 18, 100),
  marks: [['.kind-menu input', 'Search'], ['.kind-menu li.is-active', 'A kind of cell, with a hint'], ['.sheet .cell.is-selected', 'The empty cell']],
});
spec('panel', {
  doc: doc('quote'), fit: 'aside.side.right',
  setup: async (c) => { await c.select('total'); },
  crop: (c) => c.boxOf(`document.querySelector('aside.side.right')`),
  marks: [['aside.side.right .ins-sec-h button >> Content', 'Content'], ['aside.side.right .ins-sec-h button >> Text', 'Text'], ['aside.side.right .ins-sec-h button >> Spacing', 'Spacing and size'], ['aside.side.right .ins-sec-h button >> Events', 'Events']],
});
spec('formula-bar', {
  doc: doc('quote'),
  setup: async (c) => { await c.select('subtotal'); },
  crop: async (c) => { const b = await c.boxOf(`document.querySelector('.fbar')`); return { x: 0, y: b.y - 10, w: c.p.width, h: b.h + 20 }; },
  fullWidth: true,
  marks: [['.fbar-name', 'The cell’s name'], ['.fbar .cf-box', 'Its expression'], ['.fbar-result', 'Its result']],
});
spec('code-studio', {
  doc: doc('quote'),
  setup: async (c) => { await c.select('total'); await c.p.key('e', { ctrl: true }); await c.p.until(`document.querySelector('.studio')`); await c.p.settle(400); },
  marks: [['.studio .st-tablist', 'Code and Blocks'], ['.studio .st-main .cf-hl', 'The expression', { at: [0.5, 0.5] }], ['.studio .st-result', 'The result, live'], ['.studio .st-side', 'Functions and cells', { at: [0.5, 0.12] }], ['.studio .st-apply', 'Apply']],
});
spec('blocks', {
  doc: doc('quote'),
  setup: async (c) => { await c.select('total'); await c.p.key('e', { ctrl: true }); await c.p.until(`document.querySelector('.studio')`); await c.p.click('.studio [role=tab] >> Blocks'); await c.p.settle(400); },
  marks: [['.studio .st-tablist', 'Code and Blocks'], ['.studio .st-main .st-pane', 'The expression as blocks', { at: [0.12, 0.12] }], ['.studio .st-result', 'The result']],
});
spec('ask-ai', {
  doc: doc('quote'),
  setup: async (c) => {
    await c.select('total');
    await c.p.key('e', { ctrl: true });
    await c.p.until(`document.querySelector('.studio')`);
    await c.p.click('.studio [role=tab] >> Ask AI');
    await c.p.click('#ask-prompt');
    await c.p.type('Sum of subtotal, off and vat');
    await c.p.click('.ask-go');
    await c.p.until(`document.querySelector('.ask-out')?.textContent.trim().length > 20 && !document.querySelector('.ask-wait')`, 'the answer');
    await c.p.settle(400);
  },
  marks: [['#ask-prompt', 'What you type'], ['.ask-out', 'The code it became, and why']],
});
spec('events-section', {
  doc: doc('terms'), fit: 'aside.side.right',
  setup: async (c) => {
    await c.select('agree');
    await c.p.click('aside.side.right .ins-sec-h button >> Content');
    await c.p.click('aside.side.right .ins-sec-h button >> Events');
    await c.p.settle(300);
  },
  crop: (c) => c.boxOf(`document.querySelector('aside.side.right')`),
  marks: [['aside.side.right .ins-sec-h button >> Events', 'The Events section'], ['aside.side.right .ins-ev', 'A handler: when it runs, and what it does'], ['aside.side.right .ins-ev-add', 'Add a handler']],
});
spec('activity', {
  doc: doc('quote'),
  setup: async (c) => {
    if (!(await c.p.eval(`!!document.querySelector('aside.side.left')`))) await c.p.click('button[title="Activity and messages"]');
    await c.p.until(`document.querySelector('aside.side.left')`);
    await c.p.settle(300);
  },
  crop: (c) => c.boxOf(`document.querySelector('aside.side.left')`),
  marks: [['.activity-head .chip', 'Who is here'], ['.block.human .ops', 'Each change, as an s-expression'], ['.block.agent', 'An agent, named for whom it acts'], ['.composer textarea, .composer input', 'A line to the agent', { at: [0.96, 0.5] }]],
});
spec('links', {
  doc: doc('quote'),
  setup: async (c) => { await c.p.eval(`edgy.setLinks(true)`); await c.select('subtotal'); },
  crop: async (c) => {
    const boxes = [await c.boxOf(`document.querySelector('.sheet .cell.is-selected')`)];
    for (const b of await c.p.eval(`[...document.querySelectorAll('.link-box')].map((e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })`)) boxes.push(b);
    return c.union(boxes, 40);
  },
  marks: [['.link-box.in', 'What it reads'], ['.sheet .cell.is-selected', 'The selected formula'], ['.link-box.out', 'What reads it']],
});
spec('page-setup', {
  doc: doc('quote'), fit: 'aside.side.right',
  setup: async (c) => { await c.p.eval(`edgy.select(null)`); await c.p.settle(200); },
  crop: (c) => c.boxOf(`[...document.querySelectorAll('aside.side.right .ins-sec')].find((e) => e.querySelector('.ins-sec-title')?.textContent === 'Printing')`),
  marks: [['aside.side.right .ins-sec.is-open:last-of-type .seg', 'Portrait or landscape'], ['aside.side.right .ins-sec.is-open:last-of-type select', 'Paper size'], ['aside.side.right .ins-sec.is-open:last-of-type .btn', 'See the pages']],
});
spec('share-dialog', {
  doc: doc('quote'),
  setup: async (c) => { await c.p.click('.share-btn'); await c.p.until(`document.querySelector('dialog.share-dialog[open]')`); await c.p.settle(400); },
  crop: async (c) => c.union([await c.boxOf(`document.querySelector('dialog.share-dialog')`)], 0),
  marks: [['.people-list .person:nth-child(2)', 'Someone with access'], ['.people-add', 'Add people'], ['.share-row', 'A link anyone can open'], ['.share-link .btn', 'Copy the link']],
});
spec('deck', {
  url: (w) => `/deck/${w.ids.deck}`,
  marks: [['.deck-actions .btn.solid', 'Play'], ['.deck-doc', 'A document, one per slide', { at: [0.5, 0] }], ['.deck-grip', 'Drag to reorder']],
});
spec('play', {
  url: (w) => `/deck/${w.ids.deck}/play`,
  marks: [['.play-count', 'Which slide'], ['.play-bar .icon-btn', 'Next slide', { nth: 1 }], ['.play-bar .icon-btn', 'Leave', { nth: 3 }]],
});
spec('presence', {
  doc: doc('quote'),
  ben: true,
  setup: async (c) => { await c.select('total'); },
  marks: [['.presence', 'Who else is here'], ['.remote-sel', 'The cell they selected'], ['.sheet .cell.is-selected', 'Your selected cell']],
});

for (const kind of KIND_DESIGNERS) {
  spec(`designer-${kind}`, {
    designer: kind, fit: 'aside.side.right',
    setup: async (c) => {
      const pick = DESIGNER_SELECT[kind] ?? DESIGNER_NAME[kind];
      await c.select(pick);
    },
    crop: (c) => c.boxOf(`document.querySelector('aside.side.right')`),
    marks: [],
  });
}
for (const name of TUTORIALS) {
  // The finished document itself: panels closed, the window as tall as the sheet, a small margin around it.
  spec(`tutorial-${name}`, {
    tutorial: name, fit: '.desk',
    setup: async (c) => { await c.closePanels(); },
    crop: async (c) => c.union([await c.boxOf(`document.querySelector('.sheet')`)], 16),
    marks: [],
  });
}

/** Documents that exist only for one picture: made when it needs them, so the library shots never show them. */
const EXTRA = {
  notes: ['Packing notes', ['col', ['text', { size: 'hug', style: { size: 26, weight: 700 } }, 'Packing notes'], ['text', { size: 'hug' }, 'What goes in the van for Saturday.'], ['row', { size: 'hug' }, ['empty', { size: 'hug' }]]]],
  terms: ['Terms', ['col', ['text', { size: 'hug', style: { size: 26, weight: 700 } }, 'Before we start'],
    ['input', { name: 'agree', type: 'checkbox', label: 'I have read the terms', on: { change: ['set!', 'status', ['if', '$value', 'Agreed', 'Not yet']] } }],
    ['formula', { name: 'status' }, 'Not yet']]],
};

// ───────────────────────────── making one picture ─────────────────────────────

const round = (b) => { const x = Math.floor(b.x), y = Math.floor(b.y); return { x, y, w: Math.ceil(b.x + b.w) - x, h: Math.ceil(b.y + b.h) - y }; };

async function docIdFor(spec) {
  if (spec.doc) {
    const key = spec.doc.key;
    if (WORLD.ids[key]) return WORLD.ids[key];
    if (EXTRA[key]) return madeDoc(key, EXTRA[key][0], EXTRA[key][1]);
    throw new Error(`no document "${key}"`);
  }
  return null;
}

/** A tutorial's document, or null when no tutorial of that name exists yet (another writer is adding them). */
async function tutorialDoc(name) {
  const key = `tutorial-${name}`;
  if (made.has(key)) return made.get(key);
  try {
    const d = await WORLD.ana.call('POST', '/api/docs', { template: key, actor: { kind: 'human', name: 'Ana' } });
    made.set(key, d.id);
    return d.id;
  } catch (e) {
    if (/no template/.test(String(e.message))) return null;
    throw e;
  }
}

/** One picture of one spec in one theme: { bytes, w, h, marks } or { skipped }. */
async function shoot(name, s, dark) {
  const browser = WORLD.browser;
  const [width, height] = s.size ?? DESK;
  const pages = [];
  const open = async (o) => { const p = await browser.page(o); pages.push(p); return p; };
  try {
    const page = await open({ width, height, mobile: !!s.mobile, dark, cookie: s.user === null ? undefined : WORLD.ana.cookie, now: WORLD.now });
    const c = new Scene(page, dark);
    if (s.ben) {
      // Ben, on another host so he has his own cookies, in the same document with a cell selected.
      const bp = await open({ width, height, dark, cookie: WORLD.ben.cookie, cookieUrl: BEN_BASE, now: WORLD.now });
      const bc = new Scene(bp, dark);
      await bc.open('quote', 'edit', BEN_BASE);
      await bc.select('discount');
    }
    if (s.designer) {
      const id = await madeDoc(`designer-${s.designer}`, `A ${s.designer} cell`, designerNotation(s.designer));
      await c.open(id, 'edit');
    } else if (s.tutorial) {
      const id = await tutorialDoc(s.tutorial);
      if (!id) return { skipped: `no template "tutorial-${s.tutorial}" yet` };
      await c.open(id, 'live');
    } else if (s.doc) {
      await c.open(await docIdFor(s), s.doc.view);
    } else {
      await page.goto(BASE + (typeof s.url === 'function' ? s.url(WORLD) : s.url));
      await page.settle();
    }
    const theme = await page.eval(`document.documentElement.dataset.theme`);
    if (theme !== (dark ? 'dark' : 'light')) throw new Error(`the page shows the ${theme} theme, not ${dark ? 'dark' : 'light'}`);
    if (s.setup) await s.setup(c);
    if (s.ben) await page.until(`edgy.state.people.some((p) => p.name === 'Ben' && p.selected) && document.querySelector('.remote-sel') && document.querySelector('.presence')`, 'Ben to show up');
    if (s.fit) await c.grow(typeof s.fit === 'string' ? s.fit : undefined);
    await c.scrub();
    await page.settle(250);
    const clip = round(s.crop ? await s.crop(c) : { x: 0, y: 0, w: page.width, h: page.height });
    if (s.fullWidth) { clip.x = 0; clip.w = page.width; }
    const marks = [];
    for (const [sel, label, o] of s.marks ?? []) {
      const b = await page.box(sel, o?.nth ?? 0);
      if (!b) throw new Error(`mark "${label}": nothing matches ${sel}`);
      // The pin sits just left of what it marks, at mid-height, so it never covers a label's words;
      // `at` puts it at a point inside instead. Either way the whole pin (24px) stays in the picture.
      const [fx, fy] = o?.at ?? [0, 0.5];
      const px = b.x + b.w * fx - clip.x - (o?.at ? 0 : 14), py = b.y + b.h * fy - clip.y;
      if (px + 14 < 0 || px > clip.w || py < 0 || py > clip.h) throw new Error(`mark "${label}" (${sel}) falls outside the picture at ${px.toFixed(0)}, ${py.toFixed(0)}`);
      const x = (Math.min(Math.max(px, 13), clip.w - 13) / clip.w) * 100, y = (Math.min(Math.max(py, 13), clip.h - 13) / clip.h) * 100;
      marks.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, label });
    }
    const bytes = await page.capture(clip);
    // Anything the page complained about is worth knowing before the picture goes in a doc.
    const problems = page.problems.filter((x) => !/favicon/.test(x));
    return { bytes, w: clip.w, h: clip.h, marks, problems };
  } finally {
    for (const p of pages) await p.close();
  }
}

const sameMarks = (a, b) => a.length === b.length && a.every((m, i) => Math.abs(m.x - b[i].x) < 1.5 && Math.abs(m.y - b[i].y) < 1.5);

// ───────────────────────────── files ─────────────────────────────

function snapshot() {
  const out = new Map();
  for (const dir of [SHOTS_DIR, CLIPS_DIR]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) out.set(`${dir === SHOTS_DIR ? 'site/shots' : 'site/clips'}/${f}`, hashOf(join(dir, f)));
  }
  return out;
}

const PREVIEW = join(TMP, 'shoot-preview');
function preview(file, r) {
  if (!flag('preview')) return;
  mkdirSync(PREVIEW, { recursive: true });
  const base = file.replace(/^.*[\\/]/, '').replace(/\.webp$/, '.png');
  // Each mark is a red square at its centre, so a wrong one is easy to spot.
  const boxes = (r?.marks ?? []).map((m) => `drawbox=x=${Math.round((m.x / 100) * r.w * SCALE) - 9}:y=${Math.round((m.y / 100) * r.h * SCALE) - 9}:w=18:h=18:color=red:t=fill`).join(',');
  spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, ...(boxes ? ['-vf', boxes] : []), join(PREVIEW, base)]);
}

const rel = (f) => win(f).replace(win(ROOT) + '/', '');

// ───────────────────────────── clips ─────────────────────────────

const CLIP_SIZE = [960, 600];
const FPS = 12;
const MAX_KB = 600;

/** The picture in motion: Chrome's screencast while the script drives the page with real mouse and key events. */
async function record(page, drive) {
  const frames = [];
  page.on('Page.screencastFrame', (p) => {
    frames.push({ t: p.metadata.timestamp, data: p.data });
    page.send('Page.screencastFrameAck', { sessionId: p.sessionId }).catch(() => {});
  });
  await page.send('Page.startScreencast', { format: 'jpeg', quality: 88, everyNthFrame: 1, maxWidth: CLIP_SIZE[0], maxHeight: CLIP_SIZE[1] });
  await sleep(500);
  await drive();
  await sleep(900);
  await page.send('Page.stopScreencast');
  await sleep(150);
  return frames;
}

/** Frames on a steady beat: each tick of the clock shows the latest frame Chrome had sent by then. */
function evenly(frames) {
  const t0 = frames[0].t, t1 = frames.at(-1).t;
  const out = [];
  let j = 0;
  for (let k = 0; t0 + k / FPS <= t1 + 1e-6; k++) {
    while (j + 1 < frames.length && frames[j + 1].t <= t0 + k / FPS) j++;
    out.push(frames[j].data);
  }
  return out;
}

/** Encode frames to a muted VP9 WebM under the size limit, and a poster of the last frame. Returns the clip's length in seconds. */
function encode(name, scheme, jpegs, poster) {
  const dir = join(TMP, `shoot-frames-${name}-${scheme}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  jpegs.forEach((b64, i) => writeFileSync(join(dir, `f${String(i).padStart(4, '0')}.jpg`), Buffer.from(b64, 'base64')));
  const out = join(CLIPS_DIR, `${name}-${scheme}.webm`);
  for (const crf of [34, 38, 42, 46, 50]) {
    const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(dir, 'f%04d.jpg'), '-vf', `scale=${CLIP_SIZE[0]}:-2:flags=lanczos`,
      '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(crf), '-deadline', 'good', '-cpu-used', '1', '-row-mt', '0', '-threads', '1', '-pix_fmt', 'yuv420p', '-an', '-metadata', 'title=', out]);
    if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`);
    if (statSync(out).size <= MAX_KB * 1024) break;
  }
  const posterFile = join(CLIPS_DIR, `${name}-${scheme}.webp`);
  writeFileSync(posterFile, poster);
  if (flag('preview')) {
    mkdirSync(PREVIEW, { recursive: true });
    spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', out, '-vf', `fps=${(12 / (jpegs.length / FPS)).toFixed(3)},scale=480:-1,tile=4x3`, '-frames:v', '1', join(PREVIEW, `clip-${name}-${scheme}.png`)]);
  }
  rmSync(dir, { recursive: true, force: true });
  return { out, poster: posterFile, seconds: jpegs.length / FPS };
}

/** What each clip does. `open` sets the page up; `drive` is what the person does. */
const CLIP_RECIPES = {
  split: {
    open: async (c) => {
      const id = (await WORLD.ana.call('POST', '/api/docs', {
        title: 'Weekend plan', actor: { kind: 'human', name: 'Ana' },
        root: ['col', ['text', { size: 'hug', style: { size: 26, weight: 700 } }, 'Weekend plan'], ['text', { name: 'notes', style: { pad: 16 } }, 'Saturday: the market stall.\nSunday: rest.']],
      })).id;
      // Short enough that the + on the bottom edge is on the screen.
      await WORLD.ana.call('POST', `/api/docs/${id}/ops`, { actor: { kind: 'human', name: 'Ana' }, ops: [['meta', 'minHeight', 330]] });
      await c.open(id, 'edit');
      await c.p.eval(`edgy.select(null)`);
    },
    drive: async (c) => {
      const p = c.p;
      await p.click('.cell.leaf >> Saturday');
      await sleep(500);
      // The + on the right edge: a cell to the right.
      await p.move(...(await edge(p, 'r')));
      await sleep(600);
      await p.clickAt(...(await edge(p, 'r')));
      await sleep(600);
      // Choose what the new cell holds.
      await p.click('.toolbar .kind-btn');
      await p.until(`document.querySelector('.kind-menu')`);
      await sleep(500);
      await p.click('.kind-menu li >> Checkbox');
      await sleep(700);
      // Back to the first cell, and the + below it.
      await p.click('.cell.leaf >> Saturday');
      await sleep(400);
      await p.move(...(await edge(p, 'b')));
      await sleep(600);
      await p.clickAt(...(await edge(p, 'b')));
      await sleep(600);
      await p.click('.toolbar .kind-btn');
      await p.until(`document.querySelector('.kind-menu')`);
      await sleep(500);
      await p.click('.kind-menu li >> Slider');
      await sleep(900);
    },
  },
  arrow: {
    open: async (c) => {
      const id = (await WORLD.ana.call('POST', '/api/docs', {
        title: 'Order flow', actor: { kind: 'human', name: 'Ana' },
        root: ['col', ['text', { size: 'hug', style: { size: 26, weight: 700 } }, 'How an order travels'], ['diagram', { name: 'flow' }]],
      })).id;
      await c.open(id, 'edit');
      await c.p.eval(`edgy.select(null)`);
    },
    drive: async (c) => {
      const p = c.p;
      await p.click('.kdiagram');
      await sleep(900);
      const st = await p.need('.kdiagram-stage');
      const at = (fx, fy) => [st.x + st.w * fx, st.y + st.h * fy];
      // A box, then another.
      await p.click('.kdiagram-tools button[aria-label="Rectangle"]');
      await sleep(500);
      await p.drag(at(0.1, 0.25), at(0.36, 0.5));
      await sleep(900);
      await p.click('.kdiagram-tools button[aria-label="Rectangle"]');
      await sleep(500);
      await p.drag(at(0.62, 0.25), at(0.88, 0.5));
      await sleep(900);
      // An arrow from one to the other.
      await p.click('.kdiagram-tools button[aria-label="Arrow"]');
      await sleep(500);
      await p.drag(at(0.23, 0.375), at(0.75, 0.375));
      await sleep(1500);
    },
  },
  play: {
    open: async (c) => {
      await c.p.goto(`${BASE}/deck/${WORLD.ids.deck}`);
      await c.p.settle();
    },
    drive: async (c) => {
      const p = c.p;
      await sleep(800);
      await p.click('.deck-actions .btn.solid');
      await p.until(`document.querySelector('.play .slide-sheet')`);
      await p.settle(500);
      await sleep(1700);
      await p.key('ArrowRight');
      await sleep(2000);
      await p.key('Escape');
      await sleep(1400);
    },
  },
};

/** The + on one edge of the selected cell, as a point on the screen. */
async function edge(p, which) {
  const b = await p.need(`.edge.${which}`);
  return [b.x + b.w / 2, b.y + b.h / 2];
}

async function makeClip(name, dark) {
  const r = CLIP_RECIPES[name];
  const page = await WORLD.browser.page({ width: CLIP_SIZE[0], height: CLIP_SIZE[1], dark, cookie: WORLD.ana.cookie, now: WORLD.now, freezeMotion: false, cursor: true });
  try {
    page.glide = true;
    const c = new Scene(page, dark);
    await r.open(c);
    await page.settle(300);
    const theme = await page.eval(`document.documentElement.dataset.theme`);
    if (theme !== (dark ? 'dark' : 'light')) throw new Error(`the page shows the ${theme} theme`);
    const frames = await record(page, () => r.drive(c));
    if (!frames.length) throw new Error('no frames came from the screencast');
    // The poster is the page as it ended, shot like the stills, so it is the same on every run.
    const poster = Buffer.from((await page.send('Page.captureScreenshot', { format: 'webp', quality: 82, clip: { x: 0, y: 0, width: CLIP_SIZE[0], height: CLIP_SIZE[1], scale: 1 / SCALE } })).data, 'base64');
    return { ...encode(name, dark ? 'dark' : 'light', evenly(frames), poster), problems: page.problems.filter((x) => !/favicon/.test(x)) };
  } finally {
    await page.close();
  }
}

// ───────────────────────────── main ─────────────────────────────

async function main() {
  mkdirSync(SHOTS_DIR, { recursive: true });
  mkdirSync(CLIPS_DIR, { recursive: true });
  const before = snapshot();
  const metaFile = join(SHOTS_DIR, 'shots.json');
  const meta = only && existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, 'utf8')) : {};
  const skipped = [];
  const warnings = [];
  let browser;
  try {
    await startServer();
    say('server up on', BASE);
    const w = await seed();
    Object.assign(WORLD, { ids: w.ids, ana: w.ana, ben: w.ben, now: Math.floor(pageNow() / 60_000) * 60_000 + 30_000 });
    say('seeded: 2 people,', Object.keys(w.ids).length, 'documents, a pin, a deck, records, a key and a share');
    browser = await Browser.launch();
    WORLD.browser = browser;

    for (const shot of SHOTS) {
      if (!wanted(shot.name)) continue;
      const s = SPECS[shot.name];
      if (!s) { warnings.push(`${shot.name}: no recipe in shoot.mjs`); continue; }
      const got = {};
      for (const dark of [false, true]) {
        const scheme = dark ? 'dark' : 'light';
        try {
          const r = await shoot(shot.name, s, dark);
          if (r.skipped) { skipped.push(`${shot.name}: ${r.skipped}`); break; }
          const file = join(SHOTS_DIR, `${shot.name}-${scheme}.webp`);
          writeFileSync(file, r.bytes);
          preview(file, r);
          say(`wrote ${rel(file)}  ${r.w}x${r.h}  ${(r.bytes.length / 1024).toFixed(0)} KB`);
          for (const pr of r.problems) warnings.push(`${shot.name} (${scheme}): ${pr}`);
          got[scheme] = r;
        } catch (e) {
          warnings.push(`${shot.name} (${scheme}): ${e.message.split('\n')[0]}`);
          say(`FAILED ${shot.name} (${scheme}): ${e.message.split('\n')[0]}`);
        }
      }
      if (got.light && got.dark) {
        if (got.light.w !== got.dark.w || got.light.h !== got.dark.h) warnings.push(`${shot.name}: light and dark differ in size`);
        else if (!sameMarks(got.light.marks, got.dark.marks)) warnings.push(`${shot.name}: marks sit differently in light and dark`);
      }
      if (got.light) meta[shot.name] = { w: got.light.w, h: got.light.h, alt: shot.alt, marks: got.light.marks };
    }

    // Clips: the interaction recorded in each theme.
    const clipsFile = join(CLIPS_DIR, 'clips.json');
    const clipMeta = only && existsSync(clipsFile) ? JSON.parse(readFileSync(clipsFile, 'utf8')) : {};
    if (!flag('no-clips')) {
      for (const clip of CLIPS) {
        if (!wanted(clip.name)) continue;
        const got = {};
        for (const dark of [false, true]) {
          const scheme = dark ? 'dark' : 'light';
          try {
            const r = await makeClip(clip.name, dark);
            say(`wrote ${rel(r.out)}  ${(statSync(r.out).size / 1024).toFixed(0)} KB, ${r.seconds.toFixed(1)} s`);
            say(`wrote ${rel(r.poster)}`);
            for (const pr of r.problems) warnings.push(`clip ${clip.name} (${scheme}): ${pr}`);
            if (r.seconds < 4 || r.seconds > 10) warnings.push(`clip ${clip.name} (${scheme}): ${r.seconds.toFixed(1)} s is outside 4 to 10 s`);
            if (statSync(r.out).size > MAX_KB * 1024) warnings.push(`clip ${clip.name} (${scheme}): over ${MAX_KB} KB`);
            got[scheme] = r;
          } catch (e) {
            warnings.push(`clip ${clip.name} (${scheme}): ${e.message.split('\n')[0]}`);
            say(`FAILED clip ${clip.name} (${scheme}): ${e.message.split('\n')[0]}`);
          }
        }
        if (got.light) clipMeta[clip.name] = { w: CLIP_SIZE[0], h: CLIP_SIZE[1] };
      }
      const orderedClips = {};
      for (const clip of CLIPS) if (clipMeta[clip.name]) orderedClips[clip.name] = clipMeta[clip.name];
      writeFileSync(clipsFile, JSON.stringify(orderedClips, null, 2) + '\n');
      say(`wrote ${rel(clipsFile)}`);
    }

    // shots.json in the order of the list, with the alt text as it stands in shots.mjs.
    const ordered = {};
    for (const shot of SHOTS) if (meta[shot.name]) ordered[shot.name] = { ...meta[shot.name], alt: shot.alt };
    writeFileSync(metaFile, JSON.stringify(ordered, null, 2) + '\n');
    say(`wrote ${rel(metaFile)}  (${Object.keys(ordered).length} pictures)`);
  } finally {
    if (browser) await browser.close();
    if (!flag('keep')) stopServer();
  }

  const after = snapshot();
  const changed = [...after].filter(([f, h]) => before.get(f) !== h).map(([f]) => f);
  const gone = [...before.keys()].filter((f) => !after.has(f));
  say(`\n${changed.length} file(s) changed compared with before${changed.length ? ':' : '.'}`);
  for (const f of changed) say('  ' + f + (before.has(f) ? '' : '  (new)'));
  for (const f of gone) say('  ' + f + '  (gone)');
  if (skipped.length) { say('\nskipped:'); for (const x of skipped) say('  ' + x); }
  if (warnings.length) { say('\nto look at:'); for (const x of warnings) say('  ' + x); }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((e) => { console.error(e); stopServer(); process.exit(1); });
}
