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
    case 'table': parts.push('= ' + clip(print(cell.expr ?? null, 10_000), 90)); break;
    case 'input': parts.push('= ' + lit(cell.value ?? null)); break;
    case 'button': parts.push(JSON.stringify(cell.label ?? ''), 'do ' + clip(print(cell.do ?? null, 10_000), 90)); break;
    case 'image': parts.push(clip(cell.src ?? '')); break;
    case 'icon': parts.push(cell.icon ?? ''); break;
  }
  if (st?.error && !isGroup(cell)) parts.push('→ ! ' + st.error);
  else if (st && (cell.kind === 'formula' || (cell.kind === 'text' && (cell.text ?? '').includes('{{')))) parts.push('→ ' + lit(st.value));
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
