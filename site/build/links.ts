// The link check: every href and src in the built pages points at a page,
// file or anchor that exists. External links are collected, not followed.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix, relative } from 'node:path';

export interface LinkReport { pages: number; links: number; broken: string[]; external: string[] }

/** Check a set of files (path → HTML), with `exists` answering for assets that aren't pages. */
export function checkLinks(files: Map<string, string>, exists: (path: string) => boolean): LinkReport {
  const ids = new Map<string, Set<string>>();
  for (const [path, html] of files) ids.set(path, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  const broken: string[] = [];
  const external = new Set<string>();
  let links = 0;
  for (const [path, html] of files) {
    if (path === '404.html') continue;
    const dir = posix.dirname(path);
    // Live examples' notation and inline scripts carry no links.
    const body = html.replace(/<script[\s\S]*?<\/script>/g, '');
    for (const m of body.matchAll(/\s(href|src|poster)="([^"]*)"/g)) {
      const url = m[2].replace(/&amp;/g, '&');
      links++;
      if (/^(https?:|mailto:)/.test(url)) {
        external.add(url);
        continue;
      }
      if (url === '/' && m[0].includes('href')) continue; // "Open edgy": shown only when the app serves the docs
      if (url.startsWith('/')) {
        broken.push(`${path}: ${url} is absolute; links must be relative`);
        continue;
      }
      const [target, hash] = url.split('#');
      let file = target === '' ? path : posix.normalize(posix.join(dir, target));
      if (target.endsWith('/') || target === '' && path.endsWith('index.html') && false) file = posix.join(file, 'index.html');
      if (target === '.' || target === './') file = posix.join(dir, 'index.html');
      if (file.startsWith('..')) {
        broken.push(`${path}: ${url} leaves the docs folder`);
        continue;
      }
      const isPage = files.has(file);
      if (!isPage && !exists(file)) {
        broken.push(`${path}: ${url} → ${file} does not exist`);
        continue;
      }
      if (hash && isPage && !ids.get(file)!.has(decodeURIComponent(hash))) broken.push(`${path}: ${url} → no #${hash} on ${file}`);
    }
  }
  return { pages: files.size, links, broken, external: [...external].sort() };
}

/** Check a built folder on disk. */
export function checkFolder(dir: string): LinkReport {
  const files = new Map<string, string>();
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.html')) {
        // The folder's own _/ (the live examples' frame) is not a page; an underscore elsewhere in the path is nothing.
        const rel = relative(dir, p).replace(/\\/g, '/');
        if (!rel.startsWith('_/')) files.set(rel, readFileSync(p, 'utf8'));
      }
    }
  };
  walk(dir);
  return checkLinks(files, (p) => existsSync(join(dir, p)));
}
