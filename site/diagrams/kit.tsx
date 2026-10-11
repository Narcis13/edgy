// The pieces every diagram is drawn with: one stroke weight, real text, colours
// only through the theme's CSS variables (so they switch with dark mode), no
// filters. A tone means something and is said in the diagram's description.

import type { ReactNode } from 'react';

export type Tone = 'ink' | 'muted' | 'accent' | 'agent' | 'live' | 'warn' | 'bad';
export const STROKE = 1.5;

/** The frame: a title and a description for screen readers, and a viewBox that scales. */
export function Diagram({ id, title, desc, w, h, children }: { id: string; title: string; desc: string; w: number; h: number; children: ReactNode }) {
  return (
    <svg className="dg" viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-labelledby={`${id}-t ${id}-d`} xmlns="http://www.w3.org/2000/svg">
      <title id={`${id}-t`}>{title}</title>
      <desc id={`${id}-d`}>{desc}</desc>
      <defs>
        {(['ink', 'muted', 'accent', 'agent', 'live', 'warn', 'bad'] as Tone[]).map((t) => (
          <marker key={t} id={`${id}-arrow-${t}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 1 L 9 5 L 0 9 z" fill={`var(--${t})`} />
          </marker>
        ))}
      </defs>
      <g data-diagram={id}>{children}</g>
    </svg>
  );
}

const soft = (t: Tone) => (t === 'ink' || t === 'muted' ? 'var(--paper)' : `var(--${t}-soft)`);

/** A box with a label (and an optional second, quieter line). */
export function Box({ x, y, w, h, label, sub, tone = 'ink', dashed, mono }: { x: number; y: number; w: number; h: number; label: ReactNode; sub?: ReactNode; tone?: Tone; dashed?: boolean; mono?: boolean }) {
  const cy = y + h / 2;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8} fill={soft(tone)} stroke={tone === 'ink' ? 'var(--line-strong)' : `var(--${tone})`} strokeWidth={STROKE} strokeDasharray={dashed ? '5 4' : undefined} />
      <text x={x + w / 2} y={sub ? cy - 4 : cy + 4.5} textAnchor="middle" className={mono ? 'dg-label dg-mono' : 'dg-label'} fill="var(--ink)">{label}</text>
      {sub && <text x={x + w / 2} y={cy + 13} textAnchor="middle" className="dg-sub" fill="var(--muted)">{sub}</text>}
    </g>
  );
}

/** A straight or bent arrow through the given points, with an optional label at its middle. */
export function Arrow({ id, points, label, tone = 'muted', dashed, both, labelAt }: { id: string; points: [number, number][]; label?: ReactNode; tone?: Tone; dashed?: boolean; both?: boolean; labelAt?: [number, number] }) {
  const d = points.map(([x, y], i) => `${i ? 'L' : 'M'} ${x} ${y}`).join(' ');
  const mid = labelAt ?? (() => {
    const i = Math.floor((points.length - 1) / 2);
    const [a, b] = [points[i], points[i + 1] ?? points[i]];
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 6] as [number, number];
  })();
  return (
    <g>
      <path d={d} fill="none" stroke={`var(--${tone})`} strokeWidth={STROKE} strokeDasharray={dashed ? '5 4' : undefined}
        markerEnd={`url(#${id}-arrow-${tone})`} markerStart={both ? `url(#${id}-arrow-${tone})` : undefined} />
      {label && <text x={mid[0]} y={mid[1]} textAnchor="middle" className="dg-note" fill="var(--muted)">{label}</text>}
    </g>
  );
}

/** Free text. */
export function Label({ x, y, children, anchor = 'start', tone = 'muted', size = 'note', mono }: { x: number; y: number; children: ReactNode; anchor?: 'start' | 'middle' | 'end'; tone?: Tone; size?: 'label' | 'note' | 'title'; mono?: boolean }) {
  return <text x={x} y={y} textAnchor={anchor} className={`dg-${size}${mono ? ' dg-mono' : ''}`} fill={`var(--${tone})`}>{children}</text>;
}

/** A thin rule or outline that groups things: a lane, a machine, a browser. */
export function Frame({ x, y, w, h, label, tone = 'muted' }: { x: number; y: number; w: number; h: number; label?: ReactNode; tone?: Tone }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={12} fill="none" stroke={tone === 'muted' ? 'var(--line-strong)' : `var(--${tone})`} strokeWidth={STROKE} strokeDasharray="2 4" />
      {label && <text x={x + 12} y={y + 18} className="dg-note" fill="var(--muted)">{label}</text>}
    </g>
  );
}
