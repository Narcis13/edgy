// How the app reaches the server: one seam. A page opened with a share link
// sends its token with every request; an exported file swaps in a stand-in
// that answers from memory (see web/offline).

export interface Transport {
  fetch(url: string, init?: RequestInit): Promise<Response>;
  /** An event stream: the browser's EventSource, or something that behaves like one. */
  stream(url: string): EventSource;
}

let current: Transport = {
  fetch: (url, init) => window.fetch(url, init),
  stream: (url) => new EventSource(url),
};

/** The share link this page was opened with, sent along with every request. */
let token: string | null = null;

export function setTransport(t: Transport): void {
  current = t;
}

export function setShareToken(t: string | null): void {
  token = t;
}

export function send(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (token) headers.set('x-edgy-share', token);
  return current.fetch(url, { ...init, headers });
}

export function listen(url: string): EventSource {
  return current.stream(token ? `${url}${url.includes('?') ? '&' : '?'}share=${encodeURIComponent(token)}` : url);
}
