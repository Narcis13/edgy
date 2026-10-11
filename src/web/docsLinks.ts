// Where the app links into the documentation (served at /docs/, see
// src/server/docs.ts). The docs build names its anchors with the same rule
// (site/build/ids.ts uses fnAnchor), and a docs test checks every link here lands.

export const DOCS = '/docs/';

/** Function names that are symbols get a word, so their anchors read: (+) → fn-plus. */
const SYMBOL_NAMES: Record<string, string> = {
  '+': 'plus', '-': 'minus', '*': 'times', '/': 'divide', '%': 'mod', '^': 'pow',
  '=': 'eq', '!=': 'ne', '<': 'lt', '<=': 'le', '>': 'gt', '>=': 'ge',
};

/** The anchor of a function's entry: sum-by → fn-sum-by, set! → fn-set-bang, empty? → fn-empty-q. */
export function fnAnchor(name: string): string {
  const n = SYMBOL_NAMES[name] ?? name.replace(/!$/, '-bang').replace(/\?$/, '-q').replace(/\+$/, '-plus');
  return 'fn-' + n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** A kind's page. */
export const kindDocs = (kind: string) => `${DOCS}cells/${kind}/`;

/** A function's entry, on its group's page. */
export const fnDocs = (name: string, group: string) => `${DOCS}language/functions/${group.toLowerCase()}/#${fnAnchor(name)}`;
