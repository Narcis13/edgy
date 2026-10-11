// The page around the content, rendered to plain HTML at build time: it reads
// in full without JavaScript. The script adds search, the drawer, the theme
// switch, copy buttons and live examples.

import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArrowLeft, ArrowRight, Menu, Moon, Search, Sun, X } from 'lucide-react';
import { NAV, type Path } from '../nav';
import type { Heading } from './markdown';
import { rel } from './ids';

export interface PageView {
  page: string;
  file: string;
  title: string;
  summary: string;
  html: string;
  headings: Heading[];
  path?: Path;
  section?: string;
  sectionIndex?: string;
  prev?: { page: string; title: string };
  next?: { page: string; title: string };
  titles: Map<string, string>;
  /** Hashed asset names under _/ (from the client build). */
  assets: { css: string[]; js: string; font: string };
}

/** Sets the theme before the first paint: the app's own choice (same key), else the system's. */
export const THEME_SCRIPT = `(function(){var d=document.documentElement;d.classList.add('js');var t;try{t=localStorage.getItem('edgy.theme')}catch(e){}if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';d.dataset.theme=t})()`;

export function Logo() {
  return (
    <span className="logo">
      <span className="logo-mark" aria-hidden="true"><span className="paren">(</span><span className="nucleus" /><span className="paren">)</span></span>
      <span className="logo-word">edgy</span>
      <span className="logo-docs">docs</span>
    </span>
  );
}

function Sidebar({ v }: { v: PageView }) {
  const r = (to: string) => rel(v.page, to);
  return (
    <nav className="side" id="side" aria-label="All pages">
      <div className="side-head">
        <span className="side-title">Contents</span>
        <button type="button" className="icon-btn js-only" data-drawer-close aria-label="Close the contents"><X size={18} aria-hidden="true" /></button>
      </div>
      <ul className="side-paths">
        <li><a href={r('')} aria-current={v.page === '' ? 'page' : undefined} className="side-home">Start here</a></li>
        {NAV.map((p) => (
          <li key={p.id} className="side-path">
            <span className="side-path-title">{p.title}</span>
            {p.sections.map((s) => {
              const here = s.pages.includes(v.page);
              return (
                <details key={s.title} className="side-section" open={here || undefined}>
                  <summary>{s.title}</summary>
                  <ul>
                    {s.pages.map((pg, i) => typeof pg === 'string'
                      ? <li key={pg}><a href={r(pg)} aria-current={pg === v.page ? 'page' : undefined}>{v.titles.get(pg) ?? pg}</a></li>
                      : <li key={'g' + i} className="side-group" aria-hidden="true">{pg.label}</li>)}
                  </ul>
                </details>
              );
            })}
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Toc({ headings, inline }: { headings: Heading[]; inline?: boolean }) {
  const items = headings.filter((h) => h.depth === 2 || h.depth === 3);
  if (items.length < 2) return null;
  const list = (
    <ul>
      {items.map((h) => <li key={h.id} className={`toc-${h.depth}`}><a href={`#${h.id}`}>{h.text}</a></li>)}
    </ul>
  );
  if (inline) return <details className="toc-inline"><summary>On this page</summary>{list}</details>;
  return (
    <aside className="toc" aria-labelledby="toc-title">
      <p className="toc-title" id="toc-title">On this page</p>
      {list}
    </aside>
  );
}

function Page({ v }: { v: PageView }) {
  const r = (to: string) => rel(v.page, to);
  const crumbs: { label: string; href?: string }[] = [{ label: 'Docs', href: r('') }];
  if (v.path) crumbs.push({ label: v.path.title });
  if (v.section && v.section !== v.title) crumbs.push({ label: v.section, href: v.sectionIndex && v.sectionIndex !== v.page ? r(v.sectionIndex) : undefined });
  return (
    <>
      <a className="skip" href="#main">Skip to the content</a>
      <header className="top">
        <button type="button" className="icon-btn menu-btn js-only" data-drawer-open aria-label="Open the contents" aria-controls="side" aria-expanded="false"><Menu size={18} aria-hidden="true" /></button>
        <a className="brand" href={r('')} aria-label="edgy docs, start here"><Logo /></a>
        <a className="search-btn" href={r('a-z/')} data-search-open>
          <Search size={15} aria-hidden="true" /><span className="search-label">Search the docs</span><kbd className="search-key">/</kbd>
        </a>
        <span className="grow" />
        <a className="top-link" href="/" data-app-link hidden>Open edgy</a>
        <button type="button" className="icon-btn js-only" data-theme-toggle aria-label="Dark theme">
          <Moon size={17} className="when-light" aria-hidden="true" /><Sun size={17} className="when-dark" aria-hidden="true" />
        </button>
      </header>
      <div className="layout">
        <Sidebar v={v} />
        <main id="main" tabIndex={-1}>
          <div className="page">
            {v.page !== '' && (
              <nav className="crumbs" aria-label="You are here">
                <ol>{crumbs.map((c, i) => <li key={i}>{c.href ? <a href={c.href}>{c.label}</a> : <span>{c.label}</span>}</li>)}</ol>
              </nav>
            )}
            <article className="prose">
              <h1>{v.title}</h1>
              <Toc headings={v.headings} inline />
              <div dangerouslySetInnerHTML={{ __html: v.html }} />
            </article>
            {(v.prev || v.next) && (
              <nav className="pager" aria-label="Previous and next">
                {v.prev ? <a className="pager-prev" href={r(v.prev.page)} rel="prev"><span className="pager-dir"><ArrowLeft size={14} aria-hidden="true" /> Previous</span><span className="pager-title">{v.prev.title}</span></a> : <span />}
                {v.next ? <a className="pager-next" href={r(v.next.page)} rel="next"><span className="pager-dir">Next <ArrowRight size={14} aria-hidden="true" /></span><span className="pager-title">{v.next.title}</span></a> : <span />}
              </nav>
            )}
            <footer className="foot">
              <p>These pages describe edgy as it is on <code>main</code>. <a href={`https://github.com/Narcis13/edgy/blob/main/site/content/${v.file}`} rel="noopener">Edit this page on GitHub</a>.</p>
            </footer>
          </div>
        </main>
        <Toc headings={v.headings} />
      </div>
    </>
  );
}

const shell = (head: string, body: string) => `<!doctype html>
<html lang="en">
<head>
${head}
</head>
<body>
${body}
</body>
</html>
`;

export function renderPage(v: PageView): string {
  const r = (to: string) => rel(v.page, to);
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(v.page === '' ? 'edgy docs' : `${v.title} · edgy docs`)}</title>`,
    `<meta name="description" content="${esc(v.summary)}">`,
    `<meta name="docs-root" content="${r('')}">`,
    `<script>${THEME_SCRIPT}</script>`,
    `<link rel="icon" href="${r('_/favicon.svg')}" type="image/svg+xml">`,
    `<link rel="preload" href="${r('_/' + v.assets.font)}" as="font" type="font/woff2" crossorigin>`,
    ...v.assets.css.map((c) => `<link rel="stylesheet" href="${r('_/' + c)}">`),
    `<script type="module" src="${r('_/' + v.assets.js)}"></script>`,
  ].join('\n');
  return shell(head, renderToStaticMarkup(<Page v={v} />));
}

/**
 * The 404 page: served at any depth, so its CSS is inline and a script works out
 * the docs' root before a link is followed, without asking the network: the root
 * the last docs page remembered, else the path up to the first of the docs' own
 * folders (`tops`), else the folder above the missing page. The app's server
 * states it outright (a <base> in the head), which wins.
 */
export function render404(css: string, tops: string[]): string {
  const probe = `(function(){if(document.querySelector('base'))return;var p=location.pathname,root=null;try{var r=sessionStorage.getItem('edgy-docs-root');if(r&&p.indexOf(r)===0)root=r}catch(e){}if(!root){var parts=p.split('/'),tops=${JSON.stringify(tops)};for(var i=1;i<parts.length;i++)if(tops.indexOf(parts[i])>=0){root=parts.slice(0,i).join('/')+'/';break}if(!root){var q=p.charAt(p.length-1)==='/'?p.slice(0,-1):p;root=q.slice(0,q.lastIndexOf('/')+1)}}var b=document.createElement('base');b.href=root;document.head.prepend(b)})()`;
  const body = renderToStaticMarkup(
    <>
      <header className="top"><span className="brand"><Logo /></span></header>
      <main id="main" className="missing">
        <h1>This page isn’t here</h1>
        <p>There is no page at this address. It may have moved when the docs were reorganised, or the address has a typo.</p>
        <p><a href="./">Go to the start of the docs</a> or <a href="a-z/">look it up in the A–Z</a>.</p>
      </main>
    </>,
  );
  return shell([
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>Not found · edgy docs</title>',
    `<script>${probe};${THEME_SCRIPT}</script>`,
    `<style>${css}</style>`,
  ].join('\n'), body);
}

export const rendered = (n: ReactNode) => renderToStaticMarkup(<>{n}</>);
