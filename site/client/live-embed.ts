// Live examples, the page's side. Each example is a real edgy document running
// in an iframe (_/live.html), so the app's styles and its one transport stay
// out of the page. The iframe is made only when the example comes within a
// screen of the viewport: no example code loads before that.

type Theme = () => string;
type OpenInEdgy = (body: Record<string, unknown>, b: HTMLButtonElement) => Promise<void>;

interface LiveSource { title: string; root: unknown; meta?: Record<string, unknown>; data?: Record<string, unknown[]>; template: string | null }

export function startLive(root: URL, theme: Theme, onTheme: (fn: (t: string) => void) => void, openInEdgy: OpenInEdgy) {
  const boxes = [...document.querySelectorAll<HTMLElement>('.live-box[data-live]')];
  if (!boxes.length) return;
  const frames = new Map<string, HTMLIFrameElement>();
  const source = (id: string) => JSON.parse(document.querySelector(`script[data-live-src="${id}"]`)?.textContent ?? 'null') as LiveSource | null;

  const start = (box: HTMLElement) => {
    const id = box.dataset.live!;
    if (frames.has(id)) return;
    const f = document.createElement('iframe');
    f.title = `Live example: ${source(id)?.title ?? id}`;
    f.src = new URL(`_/live.html#${encodeURIComponent(id)}`, root).href;
    frames.set(id, f);
    box.append(f);
  };

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      start(e.target as HTMLElement);
      io.unobserve(e.target);
    }
  }, { rootMargin: '100% 0px' });
  for (const b of boxes) io.observe(b);

  addEventListener('message', (e) => {
    const m = e.data as { type?: string; id?: string; h?: number };
    if (!m || typeof m.id !== 'string') return;
    const f = frames.get(m.id);
    if (!f || e.source !== f.contentWindow) return;
    if (m.type === 'edgy-live-ready') f.contentWindow!.postMessage({ type: 'edgy-live-doc', source: source(m.id), theme: theme() }, '*');
    if (m.type === 'edgy-live-height' && typeof m.h === 'number') {
      const box = f.parentElement!;
      box.style.height = `${Math.max(80, Math.min(1400, Math.ceil(m.h)))}px`;
    }
  });

  onTheme((t) => { for (const f of frames.values()) f.contentWindow?.postMessage({ type: 'edgy-live-theme', theme: t }, '*'); });

  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-live-reset]')) {
    b.addEventListener('click', () => {
      const f = frames.get(b.dataset.liveReset!);
      if (f) f.src = f.src.replace(/(#.*)?$/, '') + '#' + encodeURIComponent(b.dataset.liveReset!) + '&' + Date.now();
      else start(document.querySelector<HTMLElement>(`.live-box[data-live="${b.dataset.liveReset}"]`)!);
    });
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-open-live]')) {
    b.addEventListener('click', () => {
      const s = source(b.dataset.openLive!);
      if (!s) return;
      void openInEdgy(s.template ? { template: s.template } : { title: s.title, root: s.root }, b);
    });
  }
}
