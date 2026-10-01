// Turning a cell's size and resolved style into CSS.

import type { CSSProperties } from 'react';
import type { DocMeta, Size } from '../../core/types';
import { fontById } from '../../core/fonts';

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

const SHADOWS: Record<string, string> = {
  sm: '0 1px 2px rgba(20, 18, 50, 0.08), 0 1px 3px rgba(20, 18, 50, 0.06)',
  md: '0 2px 6px rgba(20, 18, 50, 0.08), 0 6px 16px rgba(20, 18, 50, 0.08)',
  lg: '0 6px 14px rgba(20, 18, 50, 0.1), 0 18px 40px rgba(20, 18, 50, 0.14)',
};

const CASES: Record<string, CSSProperties['textTransform']> = { upper: 'uppercase', lower: 'lowercase', title: 'capitalize' };

/** A font id from the registry as CSS; Recursive's mono face is the same family with its MONO axis on. */
export function fontCss(id: unknown): CSSProperties {
  const f = fontById(id);
  if (!f) return {};
  const variation = f.variation ? `${f.variation}, "CASL" 0` : '"MONO" 0, "CASL" 0';
  // Headings inside follow a font picked for the cell rather than the document's heading font.
  return { fontFamily: f.family, fontVariationSettings: variation, '--head-font': f.family, '--head-variation': variation } as CSSProperties;
}

/** The document's own typography: its text font and size, and the font its headings use. */
export function docCss(meta: DocMeta): CSSProperties {
  const css: CSSProperties & Record<string, string | number | undefined> = { ...fontCss(meta.font) };
  if (typeof meta.fontSize === 'number' && meta.fontSize >= 8 && meta.fontSize <= 40) css.fontSize = `${meta.fontSize}px`;
  const head = fontById(meta.headFont);
  if (head) {
    css['--head-font'] = head.family;
    css['--head-variation'] = head.variation ? `${head.variation}, "CASL" 0` : '"MONO" 0, "CASL" 0';
  }
  return css;
}

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
  Object.assign(css, fontCss(style.font));
  if (typeof style.size === 'number') css.fontSize = `${Math.min(200, Math.max(8, style.size))}px`;
  if (style.weight != null) css.fontWeight = Number(style.weight) || undefined;
  if (style.italic) css.fontStyle = 'italic';
  if (typeof style.line === 'number') css.lineHeight = Math.min(4, Math.max(0.8, style.line));
  if (typeof style.tracking === 'number') css.letterSpacing = `${Math.min(0.5, Math.max(-0.1, style.tracking))}em`;
  if (typeof style.case === 'string' && CASES[style.case]) css.textTransform = CASES[style.case];
  if (style.decor === 'underline') css.textDecorationLine = 'underline';
  if (style.decor === 'strike') css.textDecorationLine = 'line-through';
  if (typeof style.para === 'number') css['--para'] = `${Math.min(80, Math.max(0, style.para))}px`;
  if (typeof style.shadow === 'string' && SHADOWS[style.shadow]) css['--cell-shadow'] = SHADOWS[style.shadow];
  if (style.radius != null) css.borderRadius = px(style.radius);
  if (typeof style.border === 'string') {
    const b = style.border;
    const width = typeof style.bwidth === 'number' ? Math.min(12, Math.max(0, style.bwidth)) : 1;
    const line = `${width}px solid ${color(style.bcolor) ?? 'var(--line-strong)'}`;
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
