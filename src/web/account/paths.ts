// Where the sign-in gate lets a signed-out person go, and where they land after signing in.

/** Pages anyone may open: the sign-in and sign-up pages, and shared links. */
export function isPublicPath(pathname: string): boolean {
  return pathname === '/signin' || pathname === '/signup' || /^\/s\/[\w-]+$/.test(pathname);
}

/**
 * A `next` is a path in this app: it starts with one slash, never `//` (another site) or a backslash, and has no
 * control characters at all (a browser drops a tab or newline, so "/\t/evil.example" is "//evil.example").
 */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\') || /[\u0000-\u001f\u007f]/.test(next)) return null;
  // Whatever else a browser makes of it, it must stay on this site.
  try {
    if (new URL(next, 'https://edgy.invalid').origin !== 'https://edgy.invalid') return null;
  } catch {
    return null;
  }
  // Coming back to the sign-in page would loop.
  if (/^\/(signin|signup)(\/|\?|$)/.test(next)) return null;
  return next;
}

/** The `next` of a `/signin?next=…` address, or `/`. */
export function nextOf(search: string | undefined): string {
  return safeNext(new URLSearchParams(search ?? '').get('next')) ?? '/';
}

/** The sign-in address that brings a person back to `path` (a path with its query) afterwards. */
export function signInAddress(path: string, which: 'signin' | 'signup' = 'signin'): string {
  const next = safeNext(path);
  return next && next !== '/' ? `/${which}?next=${encodeURIComponent(next)}` : `/${which}`;
}
