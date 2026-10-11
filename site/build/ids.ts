// Names in the site: page URLs, heading ids, entry anchors and the links
// between them. Every page is a folder with an index.html and every link is
// relative, so the same build works at /docs/ and at any path on a static host.

import { fnAnchor } from '../../src/web/docsLinks';

/** Lower case, letters and digits joined by single dashes. */
export function slug(text: string): string {
  return text
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z]+;/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** The anchor of an entry: `fn sum-by` → fn-sum-by, `fn set!` → fn-set-bang, `route GET /api/docs/:id` → route-get-api-docs-id. */
export function entryId(type: string, name: string): string {
  if (type === 'fn') return fnAnchor(name);
  return `${type}-${slug(name)}`;
}

/** A content file (relative to site/content, with forward slashes) → its page path: "cells/table.md" → "cells/table/", "index.md" → "". */
export function pageOf(file: string): string {
  const p = file.replace(/\.md$/, '');
  if (p === 'index') return '';
  return (p.endsWith('/index') ? p.slice(0, -'/index'.length) : p) + '/';
}

/** A relative URL from one page (or file) path to another: rel("cells/table/", "language/") = "../../language/". */
export function rel(from: string, to: string): string {
  const up = from.split('/').length - 1;
  const r = '../'.repeat(up) + to;
  return r === '' ? './' : r;
}

export const GITHUB = 'https://github.com/Narcis13/edgy';
/** A source file on GitHub, on main. */
export const sourceUrl = (path: string) => `${GITHUB}/blob/main/${path.replace(/^\/+/, '')}`;
