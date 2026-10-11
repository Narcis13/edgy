// Search, in the browser, over the index built with the site (_/search.json):
// every page, section, function, cell, event, op, route and tool. Opened with
// "/" or ⌘K (Ctrl+K), or the search box; used by keyboard alone.

interface Entry { u: string; t: string; p?: string; k: string; x: string }
interface Hit { e: Entry; score: number }

const norm = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

let index: { e: Entry; t: string; x: string }[] | null = null;

async function load(root: URL) {
  if (index) return index;
  const res = await fetch(new URL('_/search.json', root));
  const all = (await res.json()) as Entry[];
  index = all.map((e) => ({ e, t: norm(e.t), x: norm(e.x) }));
  return index;
}

/** Every word must appear; a match in the title counts most, an exact title more still. */
export function find(entries: { e: Entry; t: string; x: string }[], query: string): Hit[] {
  const q = norm(query.trim());
  const words = q.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hits: Hit[] = [];
  entries.forEach(({ e, t, x }, i) => {
    let score = 0;
    for (const w of words) {
      if (t.includes(w)) score += t === w ? 60 : t.startsWith(w) ? 30 : 15;
      else if (x.includes(w)) score += 4;
      else return;
    }
    if (t === q) score += 100;
    else if (words.length > 1 && t.includes(q)) score += 30;
    else if (x.includes(q)) score += 6;
    if (e.k !== 'Section' && e.k !== 'Page') score += 3;
    hits.push({ e, score: score - i / 100000 });
  });
  return hits.sort((a, b) => b.score - a.score).slice(0, 40);
}

function snippet(x: string, query: string): string {
  const words = norm(query).split(/\s+/).filter(Boolean);
  const nx = norm(x);
  let at = words.map((w) => nx.indexOf(w)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  at = Math.max(0, at - 50);
  let s = (at > 0 ? '…' : '') + x.slice(at, at + 170) + (x.length > at + 170 ? '…' : '');
  s = escHtml(s);
  for (const w of words) {
    if (w.length < 2) continue;
    s = s.replace(new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark>$1</mark>');
  }
  return s;
}

export function startSearch(root: URL) {
  const opener = document.querySelector<HTMLAnchorElement>('[data-search-open]');
  let dialog: HTMLDialogElement | null = null;
  let input: HTMLInputElement;
  let list: HTMLUListElement;
  let status: HTMLParagraphElement;
  let hits: Hit[] = [];
  let active = 0;

  const build = () => {
    dialog = document.createElement('dialog');
    dialog.className = 'search-dialog';
    dialog.setAttribute('aria-label', 'Search the docs');
    dialog.innerHTML = `
      <div class="search-field" role="search">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="search" role="combobox" aria-expanded="true" aria-controls="search-results" aria-autocomplete="list" aria-label="Search the docs" placeholder="A function, a cell, an event, any words…" autocomplete="off" spellcheck="false">
        <button type="button" class="icon-btn" data-search-close aria-label="Close the search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
      </div>
      <p class="search-status" role="status" aria-live="polite"></p>
      <ul class="search-results" id="search-results" role="listbox" aria-label="Results"></ul>
      <div class="search-foot" aria-hidden="true"><span><kbd>↑</kbd> <kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span></div>`;
    document.body.append(dialog);
    input = dialog.querySelector('input')!;
    list = dialog.querySelector('ul')!;
    status = dialog.querySelector('.search-status')!;
    dialog.querySelector('[data-search-close]')!.addEventListener('click', () => dialog!.close());
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog!.close(); });
    dialog.addEventListener('close', () => opener?.focus());
    input.addEventListener('input', () => void run());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!hits.length) return;
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length;
        mark();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const a = list.querySelector<HTMLAnchorElement>(`li[aria-selected="true"] a`);
        if (a) go(a.href);
      }
    });
  };

  const go = (href: string) => {
    dialog?.close();
    const u = new URL(href);
    if (u.pathname === location.pathname && u.hash) {
      location.hash = u.hash;
      document.getElementById(decodeURIComponent(u.hash.slice(1)))?.focus({ preventScroll: true });
    } else location.href = href;
  };

  const mark = () => {
    list.querySelectorAll('li').forEach((li, i) => {
      li.setAttribute('aria-selected', String(i === active));
      if (i === active) {
        input.setAttribute('aria-activedescendant', li.id);
        li.scrollIntoView({ block: 'nearest' });
      }
    });
  };

  const run = async () => {
    const q = input.value;
    const entries = await load(root).catch(() => null);
    if (!entries) {
      status.textContent = 'The search index could not be loaded. The A–Z page lists everything.';
      return;
    }
    if (q !== input.value) return;
    hits = find(entries, q);
    active = 0;
    input.removeAttribute('aria-activedescendant');
    if (!q.trim()) {
      list.innerHTML = '';
      status.textContent = 'Type a function, a kind of cell, an event, a route or any words from the pages.';
      return;
    }
    if (!hits.length) {
      list.innerHTML = '';
      status.innerHTML = `Nothing in the docs matches “${escHtml(q.trim())}”. Try fewer or shorter words, or look through the <a href="${new URL('a-z/', root).href}">A–Z</a>.`;
      return;
    }
    status.textContent = `${hits.length === 40 ? 'The first 40' : hits.length} result${hits.length === 1 ? '' : 's'}.`;
    list.innerHTML = hits.map((h, i) => `<li role="option" id="sr-${i}" aria-selected="false"><a href="${new URL(h.e.u, root).href}" tabindex="-1">
      <span class="r-head"><span class="r-title">${escHtml(h.e.t)}</span><span class="r-kind">${escHtml(h.e.k)}</span>${h.e.p ? `<span class="r-where">${escHtml(h.e.p)}</span>` : ''}</span>
      <span class="r-snip">${snippet(h.e.x, q)}</span></a></li>`).join('');
    list.querySelectorAll('a').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); go(a.href); }));
    mark();
  };

  const open = () => {
    if (!dialog) build();
    if (dialog!.open) return;
    dialog!.showModal();
    input.select();
    void run();
  };

  opener?.addEventListener('click', (e) => {
    e.preventDefault();
    open();
  });
  addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    const typing = t.closest?.('input, textarea, select, [contenteditable="true"]');
    if ((e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
      e.preventDefault();
      open();
    }
  });
}
