// Code in the docs looks the way it does in the code studio: the studio's own
// lexer and span renderer for expressions, and the same token classes for
// notation (JSON), so the colours come from the same CSS variables.

import { Fragment, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { lex } from '../../src/web/code/lexer';
import { renderCode } from '../../src/web/code/Highlight';

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * An expression as the code studio colours it. Names that aren't built in are
 * read as the document's cells (or, called, its custom actions), as they are in
 * an example.
 */
export function highlightSx(src: string): string {
  const toks = lex(src, () => 'cell');
  return renderToStaticMarkup(createElement(Fragment, null, ...renderCode(src, toks))).replace(/ data-t="\d+"/g, '');
}

/** Notation and ops (JSON): strings, numbers, keys and literals in the studio's colours; "$name" reads as a cell, a call's head as a function. */
export function highlightJson(src: string): string {
  const re = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)|\b(true|false|null)\b|([[\]{}])/g;
  let out = '';
  let at = 0;
  let depth = 0;
  let afterOpen = false;
  for (let m; (m = re.exec(src)); ) {
    out += esc(src.slice(at, m.index));
    at = re.lastIndex;
    const [all, str, colon, num, lit, br] = m;
    if (str) {
      let cls = 't-string';
      if (colon) cls = 't-key';
      else if (str.startsWith('"$')) cls = 't-ref';
      else if (afterOpen) cls = 't-builtin is-head';
      out += `<span class="${cls}">${esc(str)}</span>${colon ? esc(colon) : ''}`;
      afterOpen = false;
      continue;
    }
    afterOpen = false;
    if (num) out += `<span class="t-number">${num}</span>`;
    else if (lit) out += `<span class="t-literal">${lit}</span>`;
    else if (br) {
      const open = br === '[' || br === '{';
      if (!open) depth = Math.max(0, depth - 1);
      out += `<span class="t-${open ? 'open' : 'close'} d${depth % 4}">${br}</span>`;
      if (open) depth++;
      afterOpen = br === '[';
    } else out += esc(all);
  }
  return out + esc(src.slice(at));
}
