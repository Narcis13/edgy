// The replay helpers: a reader's hands on a headless Chrome. Everything a step asks for is done with real
// input (mouse clicks at the element's place on the screen, key presses, typed characters); window.edgy is
// only ever read from, to find where a cell is and to check that a step had its effect.

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { browser, sleep } from '../../../../site/scripts/cdp-lib.mjs';

export { sleep };
export const HERE = dirname(fileURLToPath(import.meta.url));
export const PORT = process.env.REPLAY_PORT ?? '8794';
export const BASE = `http://127.0.0.1:${PORT}`;
export const OTHER = `http://localhost:${PORT}`; // a different host: its own cookie jar, a "private window"
export const PASSWORD = 'correct horse'; // the test value serve.sh uses

const NAMED = {
  Enter: [13, '\r', 'Enter'], Tab: [9, undefined, 'Tab'], Escape: [27, undefined, 'Escape'], Backspace: [8, undefined, 'Backspace'], Delete: [46, undefined, 'Delete'],
  ArrowDown: [40, undefined, 'ArrowDown'], ArrowUp: [38, undefined, 'ArrowUp'], ArrowLeft: [37, undefined, 'ArrowLeft'], ArrowRight: [39, undefined, 'ArrowRight'],
  Space: [32, ' ', 'Space'],
};

/** A promise that gives up: a browser that stops answering ends a step with an error instead of hanging the replay. */
export const timed = (promise, ms, what) => Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error(`timed out after ${ms / 1000}s ${what}`)), ms))]);
/** Try again, from the start, when an attempt hangs or fails. */
export async function tryTimes(n, fn, what = 'it') {
  let last;
  for (let i = 0; i < n; i++) {
    try { return await timed(fn(), 60000, what); } catch (e) { last = e; }
  }
  throw last;
}

/** Run a command of the shell (curl-like HTTP) through fetch: the cookie a session was given. */
export async function http(method, path, { cookie, body, base = BASE, headers = {} } = {}) {
  const r = await fetch(base + path, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, json, headers: r.headers };
}

/** A person's session cookie (signs up, or in) on the replay server. */
export async function sessionFor(email, name, base = BASE) {
  for (const route of ['signup', 'signin']) {
    const r = await fetch(`${base}/api/auth/${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, name, password: PASSWORD }) });
    const set = r.headers.getSetCookie?.().find((c) => c.startsWith('edgy_session='));
    if (set) return set.split(';')[0];
  }
  throw new Error(`could not sign in ${email}`);
}

/** One reader at one window. */
export class Reader {
  constructor(b, p, { base = BASE, name = 'reader' } = {}) { this.b = b; this.p = p; this.base = base; this.name = name; this.steps = []; }

  static async open(b, { cookie, base = BASE, width = 1280, height = 800, name } = {}) {
    const p = await b.page({ width, height, cookie, origin: base });
    return new this(b, p, { base, name });
  }

  get problems() { return this.p.problems; }
  js(x) { return timed(this.p.js(x), 60000, 'evaluating in the page'); }
  async go(path, settle = 1200) { await this.p.go(path.startsWith('http') ? path : this.base + path, settle); }

  // ── keys and typing ──
  async key(spec, { wait = 150 } = {}) {
    const parts = spec.split('+');
    const k = parts.pop();
    const mods = (parts.includes('alt') ? 1 : 0) | (parts.includes('ctrl') ? 2 : 0) | (parts.includes('meta') ? 4 : 0) | (parts.includes('shift') ? 8 : 0);
    const named = NAMED[k];
    const [vk, text, code] = named ?? [k.toUpperCase().charCodeAt(0), k, `Key${k.toUpperCase()}`];
    const base = { key: k === 'Space' ? ' ' : k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: mods };
    const commands = mods === 2 && k === 'a' ? ['selectAll'] : undefined;
    const typed = !mods || mods === 8 ? text : undefined;
    await this.p.send('Input.dispatchKeyEvent', { type: typed ? 'keyDown' : 'rawKeyDown', ...base, ...(typed ? { text: typed, unmodifiedText: typed } : {}), ...(commands ? { commands } : {}) });
    await this.p.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    await sleep(wait);
  }
  async keys(...list) { for (const k of list) await this.key(k); }

  /** Type characters one key at a time, the way a reader does. */
  async type(text, { wait = 200 } = {}) {
    const bodyFocused = await this.js('document.activeElement === document.body || document.activeElement === null');
    let i = 0;
    for (const ch of text) {
      const named = ch === ' ' ? NAMED.Space : undefined;
      const vk = named ? 32 : /[a-z]/i.test(ch) ? ch.toUpperCase().charCodeAt(0) : /[0-9]/.test(ch) ? ch.charCodeAt(0) : 0;
      const ev = { key: ch, code: named ? 'Space' : /[a-z]/i.test(ch) ? `Key${ch.toUpperCase()}` : /[0-9]/.test(ch) ? `Digit${ch}` : '', windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
      await this.p.send('Input.dispatchKeyEvent', { type: 'keyDown', ...ev, text: ch, unmodifiedText: ch });
      await this.p.send('Input.dispatchKeyEvent', { type: 'keyUp', ...ev });
      // The first key typed on the sheet opens the cell for typing; give it a moment before the rest.
      if (i === 0 && bodyFocused) await sleep(250);
      i++;
    }
    await sleep(wait);
  }

  // ── pointing ──
  async centerOf(expr, { edge = false, scroll = true, at } = {}) {
    const r = await this.js(`(() => { const el = (${expr}); if (!el) return null; ${scroll ? `el.scrollIntoView({ block: 'nearest', inline: 'nearest' });` : ''} const r = el.getBoundingClientRect(); return { x: ${at ? `r.left + ${at[0]}` : edge ? 'r.left + 4' : 'r.left + r.width / 2'}, y: ${at ? `r.top + ${at[1]}` : edge ? 'r.top + 4' : 'r.top + r.height / 2'}, w: r.width, h: r.height }; })()`);
    if (!r) throw new Error(`nothing to point at: ${expr}`);
    return r;
  }
  async clickEl(expr, opts = {}) {
    await sleep(80);
    const c = await this.centerOf(expr, opts);
    await sleep(80);
    const c2 = await this.centerOf(expr, { ...opts, scroll: false });
    await this.p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c2.x, y: c2.y });
    await this.p.click(c2.x, c2.y);
    await sleep(opts.wait ?? 200);
  }
  async clickAt(x, y, wait = 200) { await this.p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await this.p.click(x, y); await sleep(wait); }

  /** A real drag: press, move in steps, release. */
  async drag(x1, y1, x2, y2, steps = 12) {
    const s = this.p.send;
    await s('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1, y: y1 });
    await s('Input.dispatchMouseEvent', { type: 'mousePressed', x: x1, y: y1, button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= steps; i++) {
      await s('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1 + ((x2 - x1) * i) / steps, y: y1 + ((y2 - y1) * i) / steps, button: 'left', buttons: 1 });
      await sleep(15);
    }
    await s('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x2, y: y2, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(300);
  }

  // ── what the page says ──
  /** A button, link or menu item by its visible words or its label: scope is a CSS selector. */
  btnExpr(text, scope = 'body', { exact = true } = {}) {
    const t = JSON.stringify(text);
    return `[...document.querySelectorAll(${JSON.stringify(scope)} + ' button, ' + ${JSON.stringify(scope)} + ' a, ' + ${JSON.stringify(scope)} + ' [role=menuitem], ' + ${JSON.stringify(scope)} + ' [role=option], ' + ${JSON.stringify(scope)} + ' [role=tab]')].find((e) => { const s = (e.getAttribute('aria-label') || e.innerText || e.title || '').trim(); const v = e.offsetParent !== null || e.getClientRects().length > 0; return v && ${exact ? `(s === ${t} || (e.innerText || '').trim() === ${t} || (e.innerText || '').trim().split('\\n')[0].trim() === ${t})` : `s.includes(${t})`}; })`;
  }
  async press(text, scope = 'body', o = {}) { await this.clickEl(this.btnExpr(text, scope, o), o); }
  async exists(text, scope = 'body') { return !!(await this.js(`!!(${this.btnExpr(text, scope)})`)); }

  async text(sel) { return this.js(`document.querySelector(${JSON.stringify(sel)})?.innerText ?? null`); }

  // ── the editor's state, read only ──
  async state() { return this.js(`(() => { const s = window.edgy.state; return { selection: s.selection, editing: s.editing, menu: s.menu, mode: s.mode, status: s.status }; })()`); }
  async doc() { return this.js(`JSON.parse(JSON.stringify(window.edgy.state.doc))`); }
  async selected() {
    return this.js(`(() => { const s = window.edgy.state; const id = s.selection.at(-1); const c = id && window.edgy.cell(id); return c ? JSON.parse(JSON.stringify(c)) : null; })()`);
  }
  async waitSaved(ms = 6000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if ((await this.js(`window.edgy?.state.unsaved ?? 0`)) === 0) return; await sleep(100); }
    throw new Error('the document did not save');
  }

  // ── steps ──
  async step(n, text, fn) {
    const before = this.problems.length;
    const t0 = Date.now();
    try { await this.p.send('Page.bringToFront'); } catch {}
    try { await fn(); } catch (e) {
      this.steps.push({ n, text, ok: false, err: e.message });
      try { await this.p.shot((process.env.TMPDIR ?? '.') + '/fail-' + (this.name ?? 'x') + '-' + n + '.png'); } catch {}
      throw new Error(`step ${n} (${text}): ${e.message}`);
    }
    this.steps.push({ n, text, ok: true, ms: Date.now() - t0 });
    const added = this.problems.slice(before);
    if (added.length) this.steps.at(-1).problems = added;
  }
  async check(what, ok, detail = '') { if (!ok) throw new Error(`check failed: ${what} ${detail}`); }
}

// ── the editor, as a reader uses it ──

export class Editor extends Reader {
  /** The home page's New document button. */
  async newDocument() {
    await this.go('/', 1200);
    await this.press('New document');
    await this.waitFor(`location.pathname.startsWith('/d/')`);
    await this.waitFor(`window.edgy && window.edgy.state.status === 'ready'`);
    await sleep(500);
    return this.js(`location.pathname.split('/')[2]`);
  }
  async waitFor(expr, ms = 8000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { try { if (await this.js(`!!(${expr})`)) return; } catch {} await sleep(100); }
    throw new Error(`timed out waiting for: ${expr}`);
  }

  /** Click the title, select all, type, Enter. */
  async setTitle(t) {
    await this.clickEl(`document.querySelector('input.title')`);
    await this.key('ctrl+a');
    await this.type(t);
    await this.key('Enter');
    await this.waitSaved();
  }

  // cells: found through the document's state, clicked where they are on the screen
  cellExpr({ text, name, kind, label, nth = 0, id } = {}) {
    return `(() => {
      const doc = window.edgy.state.doc;
      const all = []; const walk = (c) => { all.push(c); (c.children ?? []).forEach(walk); }; walk(doc.root);
      const want = ${JSON.stringify({ text, name, kind, label, nth, id })};
      const ok = all.filter((c) => (want.id ? c.id === want.id : true) && (want.name ? c.name === want.name : true) && (want.kind ? c.kind === want.kind : true)
        && (want.label ? c.label === want.label : true) && (want.text ? (c.text ?? '').includes(want.text) : true));
      const c = ok[want.nth];
      if (!c) return null;
      return document.querySelector('.sheet [data-cell="' + c.id + '"]');
    })()`;
  }
  /** Select a cell with a click; inputs and lists are clicked at their corner so the click lands on the cell, not its control. */
  async clickCell(sel, { edge = false, at } = {}) {
    await this.clickEl(this.cellExpr(sel), { edge, at });
    await sleep(150);
  }
  /** Click the control inside a cell (an input, a textarea), select all, type; the caller leaves it by clicking elsewhere or pressing a key. */
  async typeInCell(sel, text, { enter = false } = {}) {
    await this.clickEl(`(${this.cellExpr(sel)})?.querySelector('input, textarea, select')`);
    await this.key('ctrl+a', { wait: 80 });
    await this.type(String(text), { wait: 150 });
    if (enter) await this.key('Enter', { wait: 300 });
  }
  /** The words a cell shows (what a reader reads off the sheet). */
  async shown(sel) { return this.js(`(${this.cellExpr(sel)})?.innerText ?? null`); }
  async inputValue(sel) { return this.js(`(${this.cellExpr(sel)})?.querySelector('input, textarea, select')?.value ?? null`); }

  /** Which cell is selected: its kind, and a property (or the whole cell). */
  async expectSelected(kind, props = {}) {
    const c = await this.selected();
    await this.check(`a ${kind} cell is selected`, c && c.kind === kind, JSON.stringify(c));
    for (const [k, v] of Object.entries(props)) await this.check(`the selected cell's ${k} is ${JSON.stringify(v)}`, JSON.stringify(c[k]) === JSON.stringify(v), `(it is ${JSON.stringify(c[k])})`);
    return c;
  }

  /** Alt+arrow: split the selected cell. */
  async split(dir) { await this.key(`alt+Arrow${{ up: 'Up', down: 'Down', left: 'Left', right: 'Right' }[dir]}`, { wait: 350 }); }

  /** The "/" menu: type the words and press Enter. */
  async slash(words) {
    await this.key('/', { wait: 250 });
    await this.waitFor(`document.querySelector('.kind-menu input')`);
    await this.type(words);
    await this.key('Enter', { wait: 350 });
    await this.waitFor(`!document.querySelector('.kind-menu')`);
  }

  // Cell details
  propExpr(label, { section, nth = 0 } = {}) {
    return `(() => {
      const root = document.querySelector('.side.right');
      const props = [...root.querySelectorAll('.ins-prop')].filter((p) => p.querySelector('.ins-label')?.textContent.trim() === ${JSON.stringify(label)} && p.getClientRects().length);
      return props[${nth}] ?? null;
    })()`;
  }
  async openSection(title) {
    const open = await this.js(`(() => { const b = [...document.querySelectorAll('.side.right .ins-sec-head')].find((b) => (b.querySelector('.ins-sec-title') ?? b).textContent.trim() === ${JSON.stringify(title)}); return b ? b.getAttribute('aria-expanded') : null; })()`);
    if (open === null) throw new Error(`no section ${title}`);
    if (open === 'false') await this.clickEl(`[...document.querySelectorAll('.side.right .ins-sec-head')].find((b) => (b.querySelector('.ins-sec-title') ?? b).textContent.trim() === ${JSON.stringify(title)})`);
  }
  controlExpr(label, o = {}) {
    return `(() => { const p = ${this.propExpr(label, o)}; return p && (p.querySelector('.cf-input, input:not([type=range]), textarea, select')); })()`;
  }
  /** Click the field of that label, select all, type, Enter. */
  async setField(label, value, o = {}) {
    await this.clickEl(this.controlExpr(label, o));
    await this.key('ctrl+a', { wait: 80 });
    if (value === '') await this.key('Backspace', { wait: 80 });
    else await this.type(String(value), { wait: 100 });
    await this.key('Enter', { wait: 300 });
  }
  /** One of a prop's choices (chips, tiles, a segmented control) by its words. */
  async choose(label, option, o = {}) {
    const prop = `(${this.propExpr(label, o)} || [...document.querySelectorAll('.side.right [role=group]')].find((g) => g.getAttribute('aria-label') === ${JSON.stringify(label)}))`;
    await this.clickEl(`(() => { const p = ${prop}; return p && [...p.querySelectorAll('button, [role=option]')].find((b) => (b.innerText || b.getAttribute('aria-label') || b.title || '').trim() === ${JSON.stringify(option)}); })()`);
  }
  /** A button inside a section of Cell details, by its words (the section is opened first). */
  async chooseIn(section, option) {
    await this.openSection(section);
    await this.clickEl(`(() => { const h = [...document.querySelectorAll('.side.right .ins-sec')].find((s) => (s.querySelector('.ins-sec-title') ?? s).textContent.trim() === ${JSON.stringify(section)}); return h && [...h.querySelectorAll('button, [role=option]')].find((b) => (b.innerText || b.getAttribute('aria-label') || b.title || '').trim() === ${JSON.stringify(option)}); })()`);
  }
  /** A <select> by its label: pick an option as a reader does (click, arrow, Enter is not possible headless; set through the native control). */
  async pick(label, option, o = {}) { return this.pickIn(this.controlExpr(label, o), option); }
  /** A <select> (by an expression for it): click it, type the option's words and press Enter, as a reader does; if the browser's popup does not take the keys, set it through its change event. */
  async pickIn(sel, option) {
    const current = () => this.js(`(() => { const s = ${sel}; return s.options[s.selectedIndex]?.text.trim(); })()`);
    await this.clickEl(sel);
    await this.type(option, { wait: 150 });
    await this.key('Enter', { wait: 300 });
    if ((await current()) !== option) {
      this.fallbacks = (this.fallbacks ?? 0) + 1;
      await this.js(`(() => { const s = ${sel}; const opt = [...s.options].find((x) => x.text.trim() === ${JSON.stringify(option)}); s.value = opt.value; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    }
    await sleep(250);
  }
  async panelText() { return this.js(`document.querySelector('.side.right')?.innerText ?? ''`); }

  /** Click a cell on the sheet so the keys go back to it (after a panel control). */
  async focusSheet(sel, o) { await this.clickCell(sel, o); }

  async mode(name) {
    await this.press(name, '.seg.mode');
    await this.waitFor(`window.edgy.state.mode === ${JSON.stringify(name.toLowerCase())}`);
    await sleep(700);
  }
}

// ── comparing documents ──

const strip = (c) => {
  if (Array.isArray(c)) return c.map(strip);
  if (c && typeof c === 'object') {
    const o = {};
    for (const k of Object.keys(c).sort()) if (k !== 'id') o[k] = strip(c[k]);
    return o;
  }
  return c;
};

/** The comparable tree of a document: cells without ids (kinds, names, props, values, expressions, order), and the meta. */
export function comparable(doc, { ignore = [], ignoreMeta = ['title'] } = {}) {
  const drop = (c) => {
    if (Array.isArray(c)) return c.map(drop);
    if (c && typeof c === 'object') {
      const o = {};
      for (const k of Object.keys(c)) if (!ignore.includes(k)) o[k] = drop(c[k]);
      // An input nobody has typed in holds '' in a cell made in the editor and nothing in a template: the same thing.
      if (o.kind === 'input' && o.value === '') delete o.value;
      return o;
    }
    return c;
  };
  const meta = { ...doc.meta }; for (const k of ignoreMeta) delete meta[k];
  return { meta: strip(drop(meta)), root: strip(drop(doc.root)) };
}

/** A list of differences between two comparable trees, each as a path and the two values. */
export function diff(a, b, path = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (Array.isArray(a) && Array.isArray(b)) {
    const out = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) out.push(...diff(a[i], b[i], `${path}[${i}]`));
    return out;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const out = [];
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) out.push(...diff(a[k], b[k], `${path}.${k}`));
    return out;
  }
  return [`${path || '(root)'}: replayed ${JSON.stringify(a)} / template ${JSON.stringify(b)}`];
}

/** Where the intermediate files go (result.json, the trees, the downloaded export): out of the repository. */
export const workDir = () => { const d = process.env.REPLAY_WORK ?? join(process.env.TMPDIR ?? process.env.TEMP ?? '/tmp', 'replay-work'); mkdirSync(d, { recursive: true }); return d; };
export const outDir = () => { const d = process.env.REPLAY_OUT ?? HERE; mkdirSync(d, { recursive: true }); return d; };
export { browser, mkdirSync, writeFileSync, existsSync, join };
