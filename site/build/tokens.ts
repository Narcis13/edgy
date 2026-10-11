// The docs take the app's look from the app's own stylesheets: the token
// blocks of src/web/styles.css and the syntax colours of src/web/code/code.css,
// copied at build time, so changing --accent there changes both.

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const WEB = resolve(import.meta.dirname, '../../src/web');

/** The rule blocks whose selector starts with :root, as written. */
function rootBlocks(css: string): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = [];
  for (const m of css.matchAll(/(^|\n)((?::root[^{]*|:root,\s*\n?\.theme-light\s*))\{([^}]*)\}/g)) {
    out.push({ selector: m[2].replace(/\s+/g, ' ').trim(), body: m[3] });
  }
  return out;
}

/** The code colours: the --sx-* blocks and the .t-* rules, up to the code field's own styles. */
function codeRules(css: string): string {
  const end = css.indexOf('/* ─────────────────────────── the field');
  return (end > 0 ? css.slice(0, end) : css).replace(/^:root[^{]*\{[^}]*\}/gm, '');
}

export function tokenCss(): string {
  const styles = readFileSync(join(WEB, 'styles.css'), 'utf8').replace(/\r\n/g, '\n');
  const code = readFileSync(join(WEB, 'code/code.css'), 'utf8').replace(/\r\n/g, '\n');
  const blocks = [...rootBlocks(styles), ...rootBlocks(code)];
  const light = blocks.filter((b) => !b.selector.includes('dark'));
  const dark = blocks.filter((b) => b.selector.includes('dark'));
  if (!light.length || !dark.length) throw new Error('could not find the token blocks in src/web/styles.css');
  // Light on :root, dark under [data-theme=dark]; with no script the system's choice picks.
  return [
    '/* Generated from src/web/styles.css and src/web/code/code.css by site/build/tokens.ts. Do not edit. */',
    `:root {${light.map((b) => b.body).join('\n')}}`,
    `:root[data-theme='dark'] {${dark.map((b) => b.body).join('\n')}}`,
    `@media (prefers-color-scheme: dark) { :root:not([data-theme]) {${dark.map((b) => b.body).join('\n')}} }`,
    // Paper is light whatever the screen's theme.
    `@media print { :root, :root[data-theme='dark'] {${light.map((b) => b.body).join('\n')}} }`,
    codeRules(code),
  ].join('\n');
}
