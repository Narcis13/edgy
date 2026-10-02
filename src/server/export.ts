// One document (or a deck) as a single .html file that opens from disk with
// no server and no network. The file holds the offline build of the app
// (vite.offline.config.ts), the documents, the records they read and their
// fetch answers as they are now, their pictures, and the font files their
// text needs. A Content-Security-Policy keeps every request inside the file.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Cell, Doc, Json } from '../core/types';
import { type ExportPayload, PAYLOAD_ID } from '../core/offline';
import { fontById } from '../core/fonts';
import { walk } from '../core/tree';

/** The offline build: its script, its stylesheet, and the font files the stylesheet names. */
export interface Bundle {
  js: string;
  css: string;
  /** A file the stylesheet points at (`/fonts/x.woff2`), or null. */
  file(path: string): Buffer | null;
}

/**
 * Where exports get the offline build. A production build has it next to the
 * app; in development it is built once, on the first export, for this run.
 */
export function bundleLoader(dir: string, build: boolean): () => Promise<Bundle | null> {
  let cached: Bundle | null = build ? null : readBundle(dir);
  let building: Promise<Bundle | null> | null = null;
  return async () => {
    if (cached || !build) return cached ?? (cached = readBundle(dir));
    building ??= (async () => {
      const vite = await import('vite');
      await vite.build({ configFile: 'vite.offline.config.ts', logLevel: 'warn', build: { outDir: dir, emptyOutDir: true } });
      return readBundle(dir);
    })().finally(() => { building = null; });
    return (cached = await building);
  };
}

export function readBundle(dir: string): Bundle | null {
  if (!existsSync(join(dir, 'offline.js')) || !existsSync(join(dir, 'offline.css'))) return null;
  return {
    js: readFileSync(join(dir, 'offline.js'), 'utf8'),
    css: readFileSync(join(dir, 'offline.css'), 'utf8'),
    file: (path) => {
      const rel = path.replace(/^\/+/, '');
      if (!/^fonts\/[\w.-]+$/.test(rel) || !existsSync(join(dir, rel))) return null;
      return readFileSync(join(dir, rel));
    },
  };
}

/** Where a picture's bytes come from: an upload on this server, or the network (checked like a fetch cell). */
export type Pictures = (src: string) => Promise<string | null>;

/** A picture's type from its first bytes, so a file with a wrong extension still works. */
export function sniffImage(b: Buffer): string | null {
  if (b.length > 8 && b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG') return 'image/png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.toString('ascii', 0, 4) === 'GIF8') return 'image/gif';
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (b.toString('ascii', 4, 12).startsWith('ftypavi')) return 'image/avif';
  if (/^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(b.toString('utf8', 0, 512))) return 'image/svg+xml';
  return null;
}

export const dataUri = (type: string, b: Buffer) => `data:${type};base64,${b.toString('base64')}`;

/**
 * A document as the file needs it: pictures inside it, and fetch cells
 * without their address and headers (they are never fetched offline, and an
 * address can hold a key). `shown` gives each picture cell's current source.
 */
export async function forExport(doc: Doc, shown: (cell: Cell) => unknown, pictures: Pictures, missing: string[]): Promise<Doc> {
  const copy = withoutAddresses(doc);
  const jobs: Promise<void>[] = [];
  walk(copy.root, (c) => {
    if (c.kind === 'image') {
      const src = shown(c);
      jobs.push((async () => {
        const inline = typeof src === 'string' && src ? await pictures(src) : null;
        if (typeof src === 'string' && src && !inline) missing.push(src);
        c.src = inline ?? '';
      })());
    }
  });
  await Promise.all(jobs);
  return copy;
}

/**
 * A copy of the document whose fetch cells have no address and no headers:
 * what leaves the owner's hands (an export, a share link). The answers stay.
 */
export function withoutAddresses(doc: Doc): Doc {
  const copy = structuredClone(doc) as Doc;
  walk(copy.root, (c) => {
    if (c.kind !== 'fetch') return;
    c.url = '';
    delete c.headers;
  });
  return copy;
}

/** A fetch answer without the address it came from. */
export function quietState<T extends object>(st: T): Omit<T, 'url'> {
  const { url: _u, ...rest } = st as T & { url?: unknown };
  return rest;
}

// ── fonts ──

/** The families a document's text is set in, as the stylesheet names them. The app's own face is always there. */
export function familiesOf(docs: Doc[]): Set<string> {
  const out = new Set(['Recursive Variable']);
  const add = (id: unknown) => {
    const f = fontById(id);
    if (f) out.add(f.family.split(',')[0].replace(/['"]/g, '').trim());
  };
  for (const d of docs) {
    add(d.meta.font);
    add(d.meta.headFont);
    walk(d.root, (c: Cell) => add(c.style?.font));
  }
  return out;
}

/** Whether a unicode-range ("U+0-FF,U+131,U+2000-206F") holds any of these code points. */
export function rangeHits(range: string, points: Set<number>): boolean {
  return range.split(',').some((part) => {
    const m = /U\+([0-9A-F?]+)(?:-([0-9A-F]+))?/i.exec(part.trim());
    if (!m) return false;
    const lo = parseInt(m[1].replace(/\?/g, '0'), 16);
    const hi = m[2] ? parseInt(m[2], 16) : m[1].includes('?') ? parseInt(m[1].replace(/\?/g, 'F'), 16) : lo;
    for (const p of points) if (p >= lo && p <= hi) return true;
    return false;
  });
}

/**
 * The stylesheet with only the font faces this text needs (its families, the
 * subsets its characters fall in, italics only when something is italic),
 * each file inlined. Any other `url()` is dropped.
 */
export function fontsFor(css: string, families: Set<string>, text: string, italic: boolean, file: Bundle['file']): string {
  const points = new Set<number>();
  for (const ch of text) points.add(ch.codePointAt(0)!);
  for (let p = 0x20; p < 0x7f; p++) points.add(p);
  return css
    .replace(/@font-face\s*\{[^}]*\}/g, (face) => {
      const family = /font-family:\s*['"]?([^;'"}]+?)['"]?\s*[;}]/.exec(face)?.[1]?.trim() ?? '';
      if (!families.has(family)) return '';
      if (/font-style:\s*italic/.test(face) && !italic) return '';
      const range = /unicode-range:\s*([^;}]+)/.exec(face)?.[1];
      if (range && !rangeHits(range, points)) return '';
      let ok = true;
      const inlined = face.replace(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g, (_m, url: string) => {
        if (url.startsWith('data:')) return `url(${url})`;
        const bytes = file(url);
        if (!bytes) ok = false;
        return bytes ? `url(${dataUri('font/woff2', bytes)})` : 'url()';
      });
      return ok ? inlined : '';
    })
    .replace(/url\(\s*['"]?(?!data:)[^'")]*['"]?\s*\)/g, 'none');
}

// ── the file ──

const CSP = [
  "default-src 'none'", "script-src 'unsafe-inline'", "style-src 'unsafe-inline'", 'img-src data: blob:', 'font-src data:',
  'media-src data:', "connect-src 'none'", "base-uri 'none'", "form-action 'none'",
].join('; ');

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Everything readable in the payload: what the fonts must cover. */
function textOf(payload: ExportPayload): string {
  return JSON.stringify([payload.docs.map((d) => [d.meta, d.root]), payload.records, payload.fetched, payload.deck ?? null]);
}

const ITALIC = /"italic":true|(^|[^*\w])\*[^*\s][^*\n]*\*(?!\*)|(^|\W)_[^_\s][^_\n]*_(\W|$)/;

export function composeHtml(payload: ExportPayload, bundle: Bundle, title: string): string {
  const text = textOf(payload);
  const css = fontsFor(bundle.css, familiesOf(payload.docs), text, ITALIC.test(text), bundle.file);
  // Neither the data nor the script may end the element they sit in.
  const data = JSON.stringify(payload).replace(/</g, '\\u003c');
  const js = bundle.js.replace(/<\/(script)/gi, '<\\/$1');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="generator" content="edgy">
<title>${escapeHtml(title)}</title>
<style>${css.replace(/<\/(style)/gi, '<\\/$1')}</style>
</head>
<body>
<div id="root"></div>
<script type="application/json" id="${PAYLOAD_ID}">${data}</script>
<script type="module">${js}</script>
</body>
</html>
`;
}

/** A file name people recognise: the title, made safe. */
export function fileName(title: string): string {
  const base = title.normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase().slice(0, 60);
  return `${base || 'document'}.html`;
}

export type { Json };
