// Evidence for the docs site (brief 5): run against a fresh build, as shoot.sh does.
//
//   node docs/showcase/docs-site/evidence.mjs static <docs-url> <out>     the static folder, the app stopped
//   node docs/showcase/docs-site/evidence.mjs app <app-url> <out>         the app serving /docs/ (CDP_COOKIE signs in)
//
// Writes screenshots, PDFs and a .txt per check into <out>, and prints PASS/FAIL lines.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { browser, sleep } from '../../../site/scripts/cdp-lib.mjs';

const [mode, base, out] = process.argv.slice(2);
if (!['static', 'app'].includes(mode) || !base || !out) {
  console.error('usage: node docs/showcase/docs-site/evidence.mjs static|app <url> <out>');
  process.exit(1);
}
mkdirSync(out, { recursive: true });
const root = base.endsWith('/') ? base : base + '/';
const b = await browser();
let failed = 0;
const lines = {};
const say = (file, s) => { (lines[file] ??= []).push(s); console.log(s); };
const check = (file, ok, what) => { if (!ok) failed++; say(file, `${ok ? 'PASS' : 'FAIL'} ${what}`); };
const frame = (sel) => `document.querySelector(${JSON.stringify(sel)}).querySelector('iframe').contentDocument`;

try {
  if (mode === 'static') {
    // ── live examples: nothing loads until an example comes near; then each kind of interaction works ──
    {
      // A page whose first example is more than two screens down: no live code until the reader gets near it.
      const f = 'live.txt';
      const p = await b.page();
      await p.go(root + 'language/functions/actions/', 1500);
      const far = await p.js(`document.querySelector('.live-box').getBoundingClientRect().top / innerHeight`);
      const before = p.requests.filter((u) => /\/_\/live/.test(u)).length;
      await p.js(`document.querySelector('.live-box').scrollIntoView({ block: 'center' }); 1`);
      await sleep(2500);
      const after = p.requests.filter((u) => /\/_\/live/.test(u)).length;
      check(f, far > 2 && before === 0 && after > 0, `language/functions/actions/: the first example is ${far.toFixed(1)} screens down; live code requested before scrolling: ${before}, after: ${after}`);
      p.close();
    }
    {
      const f = 'live.txt';
      const p = await b.page();
      await p.go(root + 'events/', 2500);
      // A ticked checkbox runs its handler.
      const ticked = await p.js(`(async () => { const d = ${frame('.live-box[data-live="agree"]')}; d.querySelector('input[type=checkbox], [role=checkbox]').click(); await new Promise(r => setTimeout(r, 800)); return d.body.innerText; })()`);
      check(f, /Status:\s*Agreed/.test(ticked), `a ticked checkbox runs its change handler (the text now says ${JSON.stringify(/Status:[^\n]*/.exec(ticked)?.[0])})`);
      await p.js(`document.querySelector('#live-agree').scrollIntoView({ block: 'center' }); 1`);
      await sleep(400);
      await p.shot(join(out, 'live-checkbox.png'));
      check(f, p.problems.length === 0, `no console problems on events/ (${p.problems.join('; ') || 'none'})`);
      p.close();
    }
    {
      const f = 'live.txt';
      const p = await b.page();
      await p.go(root, 1500);
      await p.js(`document.querySelector('#live-hello').scrollIntoView({ block: 'center' }); 1`);
      await sleep(2500);
      const was = await p.js(`${frame('.live-box[data-live="hello"]')}.body.innerText`);
      const now = await p.js(`(async () => { const d = ${frame('.live-box[data-live="hello"]')}; const i = d.querySelector('input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; i.focus(); set.call(i, '4'); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); i.blur(); await new Promise(r => setTimeout(r, 800)); return d.body.innerText; })()`);
      check(f, /\$37\.50/.test(was) && /\$50\.00/.test(now), `changing an input updates a formula: ${/\$[\d.,]+/.exec(was)?.[0]} → ${/\$[\d.,]+/.exec(now)?.[0]}`);
      await p.shot(join(out, 'live-input.png'));
      p.close();
    }
    {
      const f = 'live.txt';
      const p = await b.page();
      await p.go(root + 'cells/button/', 1500);
      await p.js(`document.querySelector('#live-counter').scrollIntoView({ block: 'center' }); 1`);
      await sleep(2500);
      const text = await p.js(`(async () => { const d = ${frame('.live-box[data-live="counter"]')}; const b = [...d.querySelectorAll('button')].find(x => /Add one/.test(x.textContent)); b.click(); await new Promise(r => setTimeout(r, 500)); b.click(); await new Promise(r => setTimeout(r, 800)); return d.body.innerText; })()`);
      check(f, /Pressed\s*2\s*times/.test(text), `a button runs its action (pressed twice: ${JSON.stringify(/Pressed[^\n]*/.exec(text)?.[0])})`);
      await p.shot(join(out, 'live-button.png'));
      p.close();
    }
    {
      const f = 'live.txt';
      const p = await b.page();
      await p.go(root + 'cells/tabs/', 1500);
      await p.js(`document.querySelector('#live-view').scrollIntoView({ block: 'center' }); 1`);
      await sleep(2500);
      const text = await p.js(`(async () => { const d = ${frame('.live-box[data-live="view"]')}; [...d.querySelectorAll('[role=tab]')].find(x => /Details/.test(x.textContent)).click(); await new Promise(r => setTimeout(r, 800)); return d.body.innerText; })()`);
      check(f, /Showing\s*Details/.test(text) && /Quantity/.test(text), `a tab changes (the text now says ${JSON.stringify(/Showing[^\n]*/.exec(text)?.[0])})`);
      await p.shot(join(out, 'live-tabs.png'));
      p.close();
    }
    {
      const f = 'live.txt';
      const p = await b.page();
      await p.go(root + 'tutorials/order-tracker/', 1500);
      const note = await p.js(`[...document.querySelectorAll('.live-note')].map(n => n.textContent)`);
      check(f, note.some((n) => /Records it saves live in memory/.test(n)), `an example that saves records says they live in memory: ${JSON.stringify(note[0])}`);
      p.close();
    }

    // ── search: by keyboard alone ──
    {
      const f = 'search.txt';
      const p = await b.page();
      await p.go(root, 1000);
      const cases = [['sum-by', 'Function', /sum-by/], ['accordion', 'Cell', /Accordion/i], ['dblclick', 'Event', /dblclick/], ['undo', null, /undo/i], ['keep the tab open', null, null], ['zebrafish', null, null]];
      for (const [q, kind, title] of cases) {
        await p.js(`document.activeElement?.blur?.(); 1`);
        await p.keys('/');
        await p.js(`(() => { const i = document.querySelector('.search-dialog input'); i.select(); return 1 })()`);
        await p.keys('Backspace');
        await p.type(q);
        await sleep(500);
        const r = await p.js(`({ status: document.querySelector('.search-status').textContent, top: [...document.querySelectorAll('.search-results li')].slice(0, 3).map(li => li.querySelector('.r-title').textContent + ' (' + li.querySelector('.r-kind').textContent + ')') })`);
        say(f, `"${q}": ${r.status} ${r.top.join(', ')}`);
        if (q === 'zebrafish') check(f, /Nothing in the docs matches/.test(r.status) && r.top.length === 0, 'a word with no match shows a clear empty state');
        else if (q === 'keep the tab open') check(f, r.top.length > 0, `a phrase only in a page's body is found (${r.top[0]})`);
        else check(f, title.test(r.top[0] ?? '') && (!kind || (r.top[0] ?? '').includes(`(${kind})`)), `"${q}" finds ${r.top[0]} first`);
        await p.shot(join(out, `search-${q.replace(/\s+/g, '-')}.png`));
        if (q === 'dblclick') {
          await p.keys('ArrowDown', 'ArrowUp', 'Enter');
          await sleep(1200);
          const at = await p.js('location.pathname + location.hash');
          check(f, /events\/reference\/#event-dblclick$/.test(at), `Enter opens the first result: ${at}`);
          await p.go(root, 800);
        } else await p.keys('Escape');
      }
      const size = await p.js(`fetch(${JSON.stringify(root + '_/search.json')}).then(r => r.text()).then(t => t.length)`);
      say(f, `index: ${(size / 1024).toFixed(0)} KB (served gzipped by most hosts)`);
      check(f, p.problems.length === 0, `no console problems (${p.problems.join('; ') || 'none'})`);
      p.close();
    }

    // ── theme: follows the system with nothing stored; the toggle is remembered ──
    {
      const f = 'theme.txt';
      const p = await b.page({ dark: true });
      await p.go(root + 'cells/table/', 800);
      check(f, (await p.js('document.documentElement.dataset.theme')) === 'dark', 'deployed alone with nothing stored, the docs follow the system (dark)');
      await p.shot(join(out, 'theme-system-dark.png'));
      await p.js(`document.querySelector('[data-theme-toggle]').click(); 1`);
      await p.go(root + 'cells/table/', 800);
      check(f, (await p.js('document.documentElement.dataset.theme')) === 'light' && (await p.js(`localStorage.getItem('edgy.theme')`)) === 'light', 'the toggle chose light and it is remembered on the next page');
      await p.shot(join(out, 'theme-toggled-light.png'));
      p.close();
    }

    // ── the drawer on a phone, by keyboard ──
    {
      const f = 'drawer.txt';
      const p = await b.page({ width: 390, height: 844, mobile: true });
      await p.go(root + 'cells/table/', 800);
      await p.js(`document.querySelector('[data-drawer-open]').focus(); 1`);
      await p.keys('Enter');
      await sleep(400);
      const open = await p.js(`({ open: document.documentElement.classList.contains('drawer-open'), focus: document.activeElement?.textContent, expanded: document.querySelector('[data-drawer-open]').getAttribute('aria-expanded') })`);
      check(f, open.open && open.expanded === 'true', `Enter on the menu button opens the drawer; focus is on "${open.focus}"`);
      await p.shot(join(out, 'drawer-open.png'));
      await p.keys('Tab', 'Tab');
      await p.keys('Escape');
      await sleep(400);
      const closed = await p.js(`({ open: document.documentElement.classList.contains('drawer-open'), focus: document.activeElement?.getAttribute('aria-label') })`);
      check(f, !closed.open && closed.focus === 'Open the contents', `Esc closes it and the focus goes back to "${closed.focus}"`);
      await p.shot(join(out, 'drawer-closed.png'));
      p.close();
    }

    // ── paper ──
    {
      const f = 'print.txt';
      const p = await b.page();
      for (const page of ['cells/table/', 'internals/session/']) {
        await p.go(root + page, 1500);
        const name = page.replace(/\/$/, '').replace(/\//g, '-');
        await p.pdf(join(out, `print-${name}.pdf`));
        say(f, `printed ${page} to print-${name}.pdf`);
      }
      p.close();
    }
  } else {
    // ── the app serves the docs: signed out and signed in; links from the app ──
    const cookie = process.env.CDP_COOKIE;
    const origin = new URL(root).origin;
    const f = 'app.txt';
    {
      const p = await b.page();
      await p.go(root + 'docs/cells/table/', 1200);
      const t = await p.js('document.title');
      check(f, t === 'Table · edgy docs', `signed out, /docs/cells/table/ opens (${t})`);
      const api = p.requests.filter((u) => u.includes('/api/'));
      check(f, api.length === 0, `the docs ask no /api route (${api.length})`);
      check(f, (await p.js(`document.querySelector('[data-app-link]').hidden`)) === false, 'inside the app, the header shows Open edgy');
      await p.shot(join(out, 'app-docs-signed-out.png'));
      check(f, p.problems.length === 0, `no console problems signed out (${p.problems.join('; ') || 'none'})`);
      p.close();
    }
    {
      const p = await b.page({ cookie, origin });
      await p.go(root + 'docs/', 1200);
      await p.shot(join(out, 'app-docs-signed-in.png'));
      for (const [path, name] of [['', 'home'], ['data', 'data'], ['profile', 'profile']]) {
        await p.go(root + path, 2500);
        const has = await p.js(`!!document.querySelector('.topbar a[href="/docs/"]')`);
        check(f, has, `the ${name} page's header has the Docs link`);
        await p.shot(join(out, `app-header-${name}.png`));
      }
      check(f, p.problems.length === 0, `no console problems signed in (${p.problems.join('; ') || 'none'})`);
      p.close();
    }
    {
      // A document: the header link, the panel's link to its kind, the code studio's functions.
      const id = process.env.DOC_ID;
      const p = await b.page({ cookie, origin });
      await p.go(root + `d/${id}?view=edit`, 3000);
      check(f, await p.js(`!!document.querySelector('.topbar a[href="/docs/"]')`), 'a document\'s header has the Docs link');
      await p.shot(join(out, 'app-header-document.png'));
      const kind = await p.js(`(async () => { const s = window.edgy; const c = [...document.querySelectorAll('.sheet [data-cell]')].map(e => e.dataset.cell).find(id => s.cell(id)?.kind === 'formula'); s.select(c); await new Promise(r => setTimeout(r, 800)); const a = document.querySelector('.ins-docs'); return a && { href: a.getAttribute('href'), text: a.textContent }; })()`);
      check(f, kind?.href === '/docs/cells/formula/', `the panel links the selected kind to its page: "${kind?.text}" → ${kind?.href}`);
      await p.shot(join(out, 'app-designer.png'));
      await p.keys('ctrl+e');
      await sleep(1200);
      await p.js(`(async () => { const t = [...document.querySelectorAll('[role=tab], .studio button')].find(b => /^Functions$/.test(b.textContent.trim())); t?.click(); await new Promise(r => setTimeout(r, 600)); return 1 })()`);
      const fn = await p.js(`(() => { const a = document.querySelector('.sp-docs'); return a && { href: a.getAttribute('href'), label: a.getAttribute('aria-label') }; })()`);
      check(f, !!fn && /^\/docs\/language\/functions\/[a-z]+\/#fn-/.test(fn.href), `the code studio's functions link to their entries: ${fn?.label} → ${fn?.href}`);
      if (fn) {
        const r = await fetch(new URL(fn.href, root));
        const html = await r.text();
        check(f, r.ok && html.includes(`id="${fn.href.split('#')[1]}"`), `that entry exists (${r.status}, #${fn.href.split('#')[1]})`);
      }
      await p.shot(join(out, 'app-hint.png'));
      check(f, p.problems.length === 0, `no console problems in the document (${p.problems.join('; ') || 'none'})`);
      p.close();
    }
    {
      // On a phone the Docs link is in the More menu.
      const id = process.env.DOC_ID;
      const p = await b.page({ width: 390, height: 844, mobile: true, cookie, origin });
      await p.go(root + `d/${id}`, 3000);
      await p.js(`document.querySelector('.more-btn').click(); 1`);
      await sleep(500);
      const items = await p.js(`[...document.querySelectorAll('.more-menu [role=menuitem]')].map(b => b.textContent.trim())`);
      check(f, items.includes('Docs'), `on a phone the More menu has Docs (${items.join(', ')})`);
      await p.shot(join(out, 'app-more-menu.png'));
      p.close();
    }
    {
      // The theme the person chose in the app is the docs' theme.
      const p = await b.page({ cookie, origin });
      await p.go(root, 2000);
      await p.js(`localStorage.setItem('edgy.theme', 'dark'); 1`);
      await p.go(root + 'docs/', 1000);
      check(f, (await p.js('document.documentElement.dataset.theme')) === 'dark', 'in the app, the docs open in the theme the person chose there (dark)');
      await p.shot(join(out, 'theme-from-app-dark.png'));
      await p.js(`localStorage.removeItem('edgy.theme'); 1`);
      p.close();
    }
  }
} finally {
  for (const [file, l] of Object.entries(lines)) writeFileSync(join(out, file), l.join('\n') + '\n');
  b.close();
}
console.log(failed ? `${failed} checks failed` : 'every check passed');
process.exit(failed ? 1 : 0);
