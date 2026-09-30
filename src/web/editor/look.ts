// Turning a cell's size and resolved style into CSS.

import type { CSSProperties } from 'react';
import type { Size } from '../../core/types';

export const COLOR_TOKENS = [
  'ink', 'muted', 'faint', 'paper', 'sunken', 'line',
  'accent', 'accent-soft', 'agent', 'agent-soft', 'live', 'live-soft', 'warn', 'warn-soft', 'bad', 'bad-soft',
] as const;
const TOKENS = new Set<string>(COLOR_TOKENS);

export function color(v: unknown): string | undefined {
  if (typeof v !== 'string' || !v) return undefined;
  if (TOKENS.has(v)) return `var(--${v})`;
  return /^[#\w(),.%\s/-]+$/.test(v) ? v : undefined;
}

const px = (v: unknown): string | undefined => {
  if (typeof v === 'number') return `${v}px`;
  if (typeof v === 'string' && v.trim()) return v.trim().split(/\s+/).map((p) => (/^\d+(\.\d+)?$/.test(p) ? p + 'px' : p)).join(' ');
  return undefined;
};

const FLEX: Record<string, string> = { start: 'flex-start', center: 'center', end: 'flex-end' };

export function flexOf(size: Size | undefined): CSSProperties {
  if (size === 'hug') return { flex: '0 0 auto' };
  if (typeof size === 'string') return { flex: `0 0 ${size}` };
  return { flex: `${size ?? 1} 1 0px` };
}

export function cssOf(style: Record<string, unknown> | undefined): CSSProperties {
  if (!style) return {};
  const css: CSSProperties & Record<string, string | number | undefined> = {};
  if (style.bg != null) css.background = color(style.bg);
  if (style.fg != null) css.color = color(style.fg);
  if (style.pad != null) css.padding = px(style.pad);
  if (style.gap != null) css['--gap'] = px(style.gap);
  if (typeof style.align === 'string') {
    css.textAlign = style.align as CSSProperties['textAlign'];
    css['--align'] = FLEX[style.align] ?? 'stretch';
  }
  if (typeof style.valign === 'string') css.justifyContent = FLEX[style.valign];
  if (style.font === 'serif') css.fontFamily = 'var(--font-serif)';
  if (style.font === 'sans') css.fontFamily = 'var(--font-ui)';
  if (style.font === 'mono') {
    css.fontFamily = 'var(--font-ui)';
    css.fontVariationSettings = '"MONO" 1';
  }
  if (typeof style.size === 'number') css.fontSize = `${Math.min(200, Math.max(8, style.size))}px`;
  if (style.weight != null) css.fontWeight = Number(style.weight) || undefined;
  if (style.italic) css.fontStyle = 'italic';
  if (typeof style.line === 'number') css.lineHeight = style.line;
  if (style.radius != null) css.borderRadius = px(style.radius);
  if (typeof style.border === 'string') {
    const b = style.border;
    const line = '1px solid var(--line-strong)';
    if (b === 'all') css.border = line;
    else if (b !== 'none') {
      if (b.includes('t')) css.borderTop = line;
      if (b.includes('r')) css.borderRight = line;
      if (b.includes('b')) css.borderBottom = line;
      if (b.includes('l')) css.borderLeft = line;
    }
  }
  return css;
}
