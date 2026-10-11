// What the docs' pages do with JavaScript on. Without it every page still
// reads in full: this adds the theme switch, the drawer on a phone, copy
// buttons, search, live examples, clips that play when seen, and (when the app
// serves the docs) the buttons that open an example in edgy.

import '../styles/docs.css';
import { startSearch } from './search';
import { startLive } from './live-embed';

const html = document.documentElement;
/** The docs' root, relative to this page ("../../"), from the page itself. */
export const ROOT = new URL(document.querySelector<HTMLMetaElement>('meta[name="docs-root"]')?.content ?? './', location.href);
// The 404 page, served at any depth, reads this to find the way back.
try { sessionStorage.setItem('edgy-docs-root', ROOT.pathname); } catch { /* private mode */ }
/** Set by the app's server when it serves the docs: where the app is. */
export const APP =document.querySelector<HTMLMetaElement>('meta[name="edgy-app"]')?.content ?? null;

// ── theme: the app's own key, so the docs and the app share one choice ──

const KEY = 'edgy.theme';
const themeButton = document.querySelector<HTMLButtonElement>('[data-theme-toggle]');
const theme = () => (html.dataset.theme === 'dark' ? 'dark' : 'light');
const labelTheme = () => themeButton?.setAttribute('aria-label', theme() === 'dark' ? 'Light theme' : 'Dark theme');
const listeners = new Set<(t: string) => void>();
export const onTheme = (fn: (t: string) => void) => listeners.add(fn);
function setTheme(t: 'light' | 'dark', remember: boolean) {
  html.dataset.theme = t;
  if (remember) try { localStorage.setItem(KEY, t); } catch { /* private mode */ }
  labelTheme();
  for (const fn of listeners) fn(t);
}
labelTheme();
themeButton?.addEventListener('click', () => setTheme(theme() === 'dark' ? 'light' : 'dark', true));
// Nothing stored: follow the system as it changes. Another tab (or the app) chose: follow that.
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  let stored: string | null = null;
  try { stored = localStorage.getItem(KEY); } catch { /* private mode */ }
  if (stored !== 'light' && stored !== 'dark') setTheme(e.matches ? 'dark' : 'light', false);
});
addEventListener('storage', (e) => {
  if (e.key === KEY && (e.newValue === 'light' || e.newValue === 'dark')) setTheme(e.newValue, false);
});

// ── the drawer (phones): the contents slide in; Esc, the scrim or the close button put them away ──

const side = document.getElementById('side');
const opener = document.querySelector<HTMLButtonElement>('[data-drawer-open]');
let scrim: HTMLDivElement | null = null;
const drawerOpen = () => html.classList.contains('drawer-open');
function openDrawer() {
  html.classList.add('drawer-open');
  opener?.setAttribute('aria-expanded', 'true');
  scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.addEventListener('click', closeDrawer);
  document.body.append(scrim);
  side?.setAttribute('role', 'dialog');
  side?.setAttribute('aria-modal', 'true');
  const here = side?.querySelector<HTMLElement>('[aria-current="page"]') ?? side?.querySelector<HTMLElement>('a, button');
  requestAnimationFrame(() => here?.focus());
}
function closeDrawer() {
  if (!drawerOpen()) return;
  html.classList.remove('drawer-open');
  opener?.setAttribute('aria-expanded', 'false');
  scrim?.remove();
  scrim = null;
  side?.removeAttribute('role');
  side?.removeAttribute('aria-modal');
  opener?.focus();
}
opener?.addEventListener('click', openDrawer);
document.querySelector('[data-drawer-close]')?.addEventListener('click', closeDrawer);
side?.addEventListener('keydown', (e) => {
  if (!drawerOpen()) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    closeDrawer();
  } else if (e.key === 'Tab') {
    // Keep the focus inside the drawer while it is open.
    const all = [...side.querySelectorAll<HTMLElement>('a, button, summary')].filter((el) => el.offsetParent !== null);
    const first = all[0];
    const last = all.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  }
});
matchMedia('(min-width: 901px)').addEventListener('change', (e) => e.matches && closeDrawer());

// ── copy buttons on code ──

for (const box of document.querySelectorAll<HTMLElement>('.code')) {
  const pre = box.querySelector('pre');
  if (!pre) continue;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'copy';
  b.textContent = 'Copy';
  b.setAttribute('aria-label', `Copy this ${(box.dataset.lang ?? 'code').toLowerCase()}`);
  b.addEventListener('click', async () => {
    const text = [...pre.querySelectorAll('code')].map((c) => c.textContent ?? '').join('\n').replace(/^⇒.*$\n?/gm, '');
    try {
      await navigator.clipboard.writeText(text.trimEnd());
      b.textContent = 'Copied';
    } catch {
      b.textContent = 'Select and copy';
    }
    b.classList.add('is-done');
    setTimeout(() => { b.textContent = 'Copy'; b.classList.remove('is-done'); }, 1600);
  });
  box.append(b);
}

// ── On this page: mark the section being read ──

const tocLinks = [...document.querySelectorAll<HTMLAnchorElement>('.toc a')];
if (tocLinks.length && 'IntersectionObserver' in window) {
  const byId = new Map(tocLinks.map((a) => [decodeURIComponent(a.hash.slice(1)), a]));
  const seen = new Set<string>();
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) (e.isIntersecting ? seen.add(e.target.id) : seen.delete(e.target.id));
    const first = [...byId.keys()].find((id) => seen.has(id));
    if (first) for (const [id, a] of byId) a.classList.toggle('is-here', id === first);
  }, { rootMargin: '-60px 0px -60% 0px' });
  for (const id of byId.keys()) {
    const el = document.getElementById(id);
    if (el) io.observe(el);
  }
}

// ── clips: play while on screen, never under reduced motion ──

const still = matchMedia('(prefers-reduced-motion: reduce)');
const clips = [...document.querySelectorAll<HTMLVideoElement>('.clip video')];
if (clips.length) {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const v = e.target as HTMLVideoElement;
      if (e.isIntersecting && !still.matches && v.offsetParent !== null) void v.play().catch(() => undefined);
      else v.pause();
    }
  }, { threshold: 0.4 });
  for (const v of clips) {
    v.removeAttribute('controls');
    v.setAttribute('preload', 'metadata');
    if (still.matches) v.setAttribute('controls', '');
    io.observe(v);
  }
  onTheme(() => { for (const v of clips) if (v.offsetParent === null) v.pause(); });
}

// ── when the app serves the docs: open edgy, and open examples and templates in it ──

if (APP !== null) {
  const app = new URL(APP, location.href);
  const link = document.querySelector<HTMLAnchorElement>('[data-app-link]');
  if (link) {
    link.href = app.href;
    link.hidden = false;
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-open-live], [data-open-template]')) b.hidden = false;
}

/** Make a document in the app from an example or a template, then open it (sign-in first when needed). */
export async function openInEdgy(body: Record<string, unknown>, button: HTMLButtonElement) {
  if (APP === null) return;
  const app = new URL(APP, location.href);
  button.disabled = true;
  const was = button.textContent;
  button.textContent = 'Opening…';
  try {
    const res = await fetch(new URL('api/docs', app), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' });
    if (res.status === 401) {
      location.href = new URL(`signin?next=${encodeURIComponent(location.pathname + location.hash)}`, app).href;
      return;
    }
    const doc = (await res.json()) as { id?: string; error?: string };
    if (!res.ok || !doc.id) throw new Error(doc.error ?? `edgy answered ${res.status}`);
    location.href = new URL(`d/${doc.id}`, app).href;
  } catch (e) {
    button.textContent = 'Could not open it';
    button.title = e instanceof Error ? e.message : String(e);
    setTimeout(() => { button.textContent = was; button.disabled = false; }, 2500);
  }
}

for (const b of document.querySelectorAll<HTMLButtonElement>('[data-open-template]')) {
  b.addEventListener('click', () => void openInEdgy({ template: b.dataset.openTemplate }, b));
}

startSearch(ROOT);
startLive(ROOT, theme, onTheme, openInEdgy);
