// A compact picture of a document for an agent: one line per cell, with ids,
// names, sources and current values.

import type { Cell, Doc } from './types';
import { isGroup } from './types';
import { type Computed, plainValue } from './engine';
import { print } from './sx';

const clip = (s: string, n = 64) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const lit = (v: unknown) => clip(JSON.stringify(plainValue(v)) ?? 'null', 80);

function line(cell: Cell, computed?: Computed): string {
  const st = computed?.cells[cell.id];
  const parts = [cell.id, cell.kind + (cell.type && cell.kind !== 'text' ? ':' + cell.type : '')];
  if (cell.name) parts.push(cell.name);
  if (cell.size != null) parts.push(`[${cell.size}]`);
  if (st?.hidden) parts.push('(hidden)');
  switch (cell.kind) {
    case 'text': parts.push(JSON.stringify(clip((cell.text ?? '').replace(/\n/g, ' ⏎ ')))); break;
    case 'formula':
    case 'chart':
    case 'stat': parts.push('= ' + clip(print(cell.expr ?? null, 10_000), 90)); break;
    case 'table':
      parts.push(cell.expr !== undefined ? '= ' + clip(print(cell.expr, 10_000), 90) : `${Array.isArray(cell.value) ? cell.value.length : 0} typed rows`);
      if (cell.group) parts.push('grouped by ' + cell.group);
      if (cell.select) parts.push(`select ${cell.select}, picked ${lit(cell.selected ?? [])}`);
      if (Array.isArray(cell.actions) && cell.actions.length) parts.push(`${cell.actions.length} row actions`);
      break;
    case 'list': parts.push(cell.expr !== undefined ? '= ' + clip(print(cell.expr, 10_000), 90) : `${Array.isArray(cell.value) ? cell.value.length : 0} items`); break;
    case 'calendar': parts.push('events ' + clip(print(cell.expr ?? null, 10_000), 80), 'picked ' + lit(cell.value ?? null)); break;
    case 'canvas': parts.push(`${Array.isArray(cell.value) ? cell.value.length : 0} strokes`); break;
    case 'input': parts.push('= ' + lit(cell.value ?? null)); break;
    case 'button': parts.push(JSON.stringify(cell.label ?? ''), 'do ' + clip(print(cell.do ?? null, 10_000), 90)); break;
    case 'image': parts.push(clip(cell.src ?? '')); break;
    case 'icon': parts.push(cell.icon ?? ''); break;
  }
  if (st?.error && !isGroup(cell)) parts.push('→ ! ' + st.error);
  else if (st && (cell.kind === 'formula' || cell.kind === 'stat' || (cell.kind === 'list' && cell.expr !== undefined) || (cell.kind === 'text' && (cell.text ?? '').includes('{{')))) parts.push('→ ' + lit(st.value));
  return parts.join(' ');
}

export function outline(doc: Doc, computed?: Computed): string {
  const out: string[] = [`"${doc.meta.title}" — doc ${doc.id}, version ${doc.v}`];
  const visit = (cell: Cell, prefix: string, tee: string) => {
    out.push(prefix + tee + line(cell, computed));
    const kids = cell.children ?? [];
    const next = prefix + (tee === '' ? '' : tee === '└─ ' ? '   ' : '│  ');
    kids.forEach((ch, i) => visit(ch, next, i === kids.length - 1 ? '└─ ' : '├─ '));
  };
  visit(doc.root, '', '');
  return out.join('\n');
}
