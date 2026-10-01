// Charts drawn from a cell's value. One series: a bar, line or area; parts of
// a whole: a donut; one number against a maximum: a meter.

import { useLayoutEffect, useRef, useState } from 'react';
import { formatValue } from '../../core/sx';

export interface Point {
  label: string;
  value: number;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Accepts numbers, [label, value] pairs, or records with a label and a value. */
export function toPoints(v: unknown): Point[] {
  if (!Array.isArray(v)) return [];
  const out: Point[] = [];
  v.forEach((item, i) => {
    if (typeof item === 'number') out.push({ label: String(i + 1), value: item });
    else if (Array.isArray(item) && typeof item[1] === 'number') out.push({ label: String(item[0] ?? i + 1), value: item[1] });
    else if (isRecord(item)) {
      const value = typeof item.value === 'number' ? item.value : Object.values(item).find((x) => typeof x === 'number');
      const label = item.label ?? item.name ?? item.key ?? Object.values(item).find((x) => typeof x === 'string') ?? i + 1;
      if (typeof value === 'number') out.push({ label: String(label), value });
    } else if (typeof item === 'string' && item.trim() !== '' && !Number.isNaN(Number(item))) out.push({ label: String(i + 1), value: Number(item) });
  });
  return out.filter((p) => Number.isFinite(p.value));
}

function niceTicks(min: number, max: number, target = 3): number[] {
  if (min === max) max = min + 1;
  const raw = (max - min) / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let t = start; t < max + step * 0.999; t += step) ticks.push(Number(t.toPrecision(12)));
  return ticks;
}

/** Below this width a donut's legend sits under it (see kinds.css). */
const NARROW = 360;

const compact = (n: number) => (Math.abs(n) >= 10_000 ? formatValue(n, 'compact') : formatValue(n));

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize((s) => (s.w === el.clientWidth && s.h === el.clientHeight ? s : { w: el.clientWidth, h: el.clientHeight }));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

interface Props {
  type: string;
  value: unknown;
  label?: string;
  max?: number;
  format?: string;
  currency?: string;
}

export function Chart({ type, value, label, max, format, currency }: Props) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const fmt = (n: number) => (format ? formatValue(n, format, currency) : formatValue(n));

  if (type === 'meter') {
    const n = typeof value === 'number' ? value : Number(value) || 0;
    const top = max ?? (n > 1 ? 100 : 1);
    const share = Math.min(1, Math.max(0, n / top));
    return (
      <div className="chart meter" role="meter" aria-valuenow={n} aria-valuemin={0} aria-valuemax={top} aria-label={label}>
        <div className="meter-head">
          {label && <span className="chart-title">{label}</span>}
          <span className="meter-value">{format ? fmt(n) : top === 1 ? formatValue(n, 'percent') : `${formatValue(n)} of ${formatValue(top)}`}</span>
        </div>
        <div className="meter-track"><div className="meter-fill" style={{ width: `${share * 100}%` }} /></div>
      </div>
    );
  }

  const points = toPoints(value);
  const table = (
    <table className="sr-only">
      <caption>{label ?? 'Chart data'}</caption>
      <tbody>{points.map((p, i) => <tr key={i}><th scope="row">{p.label}</th><td>{fmt(p.value)}</td></tr>)}</tbody>
    </table>
  );

  if (!points.length) {
    return <div className="chart" ref={ref}><p className="chart-empty">Nothing to draw yet. A chart needs a list of numbers.</p></div>;
  }

  if (type === 'donut') {
    const parts = points.filter((p) => p.value > 0);
    const shown = parts.length > 8 ? [...parts.slice(0, 7), { label: 'Other', value: parts.slice(7).reduce((s, p) => s + p.value, 0) }] : parts;
    const total = shown.reduce((s, p) => s + p.value, 0) || 1;
    // Beside its legend the donut takes under half the width; in a narrow cell the legend goes underneath.
    const size = Math.max(60, Math.min(w < NARROW ? 160 : h - (label ? 24 : 0), w * (w < NARROW ? 0.7 : 0.45), 220));
    const r = size / 2 - 2;
    const stroke = Math.max(10, r * 0.34);
    const c = 2 * Math.PI * (r - stroke / 2);
    let acc = 0;
    // The figure in the hole shrinks to fit inside it.
    const centre = hover == null ? fmt(total) : fmt(shown[hover].value);
    return (
      <div className="chart" ref={ref}>
        {label && <div className="chart-title">{label}</div>}
        <div className="donut">
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label ?? 'Donut chart'}>
            <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
              {shown.map((p, i) => {
                const len = (p.value / total) * c;
                const gap = shown.length > 1 ? 2 : 0;
                const el = (
                  <circle
                    key={i} cx={size / 2} cy={size / 2} r={r - stroke / 2} fill="none"
                    stroke={`var(--series-${i + 1})`} strokeWidth={hover === i ? stroke + 3 : stroke}
                    strokeDasharray={`${Math.max(0, len - gap)} ${c - Math.max(0, len - gap)}`} strokeDashoffset={-acc}
                    onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}
                  />
                );
                acc += len;
                return el;
              })}
            </g>
            <text x={size / 2} y={size / 2} className="donut-total" textAnchor="middle" dominantBaseline="central"
              style={{ fontSize: Math.min(15, ((r - stroke) * 2 * 0.86) / Math.max(3, centre.length) / 0.6) }}>
              {centre}
            </text>
          </svg>
          <ul className="legend">
            {shown.map((p, i) => (
              <li key={i} className={hover === i ? 'is-hover' : ''} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
                <i style={{ background: `var(--series-${i + 1})` }} />
                <span>{p.label}</span>
                <b>{formatValue(p.value / total, 'percent')}</b>
              </li>
            ))}
          </ul>
        </div>
        {table}
      </div>
    );
  }

  // bar, line, area
  const titleH = label ? 22 : 0;
  const m = { t: 8, r: 10, b: 20, l: 0 };
  const values = points.map((p) => p.value);
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const ticks = niceTicks(lo, hi === lo ? lo + 1 : hi, h > 220 ? 4 : 3);
  const [y0, y1] = [ticks[0], ticks.at(-1)!];
  const tickLabels = ticks.map(compact);
  m.l = Math.max(...tickLabels.map((t) => t.length)) * 6.6 + 10;
  const H = Math.max(80, h - titleH);
  const iw = Math.max(10, w - m.l - m.r);
  const ih = Math.max(10, H - m.t - m.b);
  const y = (v: number) => m.t + ih - ((v - y0) / (y1 - y0)) * ih;
  const band = iw / points.length;
  const isBar = type !== 'line' && type !== 'area';
  const x = (i: number) => (isBar ? m.l + band * (i + 0.5) : m.l + (points.length === 1 ? iw / 2 : (iw * i) / (points.length - 1)));
  const every = Math.max(1, Math.ceil((Math.max(...points.map((p) => p.label.length)) * 6.4 + 14) / (isBar ? band : iw / Math.max(1, points.length - 1))));
  const barW = Math.max(2, Math.min(24, band - 2));
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');

  const onMove = (e: React.PointerEvent) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - box.left;
    const i = isBar ? Math.floor((px - m.l) / band) : Math.round(((px - m.l) / iw) * (points.length - 1));
    setHover(Math.min(points.length - 1, Math.max(0, i)));
  };
  const hp = hover == null ? null : points[hover];

  return (
    <div className="chart" ref={ref}>
      {label && <div className="chart-title">{label}</div>}
      {w > 0 && (
        <div className="plot" style={{ height: H }}>
          <svg width={w} height={H} role="img" aria-label={label ?? 'Chart'} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
            {ticks.map((t, i) => (
              <g key={t}>
                <line x1={m.l} x2={w - m.r} y1={y(t)} y2={y(t)} className={t === 0 ? 'axis' : 'grid'} />
                <text x={m.l - 8} y={y(t)} className="tick" textAnchor="end" dominantBaseline="central">{tickLabels[i]}</text>
              </g>
            ))}
            {points.map((p, i) => (i % every === 0 ? (
              <text key={i} x={x(i)} y={H - 5} className="tick" textAnchor={!isBar && i === 0 ? 'start' : !isBar && i === points.length - 1 ? 'end' : 'middle'}>{p.label}</text>
            ) : null))}
            {isBar && points.map((p, i) => {
              const top = Math.min(y(p.value), y(0));
              const height = Math.max(1, Math.abs(y(p.value) - y(0)));
              const r = Math.min(4, barW / 2, height);
              const bx = x(i) - barW / 2;
              const up = p.value >= 0;
              const d = up
                ? `M${bx} ${top + height}V${top + r}Q${bx} ${top} ${bx + r} ${top}H${bx + barW - r}Q${bx + barW} ${top} ${bx + barW} ${top + r}V${top + height}Z`
                : `M${bx} ${top}V${top + height - r}Q${bx} ${top + height} ${bx + r} ${top + height}H${bx + barW - r}Q${bx + barW} ${top + height} ${bx + barW} ${top + height - r}V${top}Z`;
              return <path key={i} d={d} className={'bar' + (hover === i ? ' is-hover' : '')} />;
            })}
            {!isBar && (
              <>
                {type === 'area' && <path d={`${path} L${x(points.length - 1)} ${y(0)} L${x(0)} ${y(0)} Z`} className="area" />}
                <path d={path} className="line" />
                {hover != null && <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={m.t + ih} className="crosshair" />}
                <circle cx={x(hover ?? points.length - 1)} cy={y(points[hover ?? points.length - 1].value)} r={4} className="dot" />
              </>
            )}
          </svg>
          {hp && (
            <div className="tip" style={{ left: Math.min(w - 8, Math.max(8, x(hover!))), top: Math.max(0, Math.min(y(hp.value), y(0)) - 8) }}>
              <b>{fmt(hp.value)}</b>
              <span>{hp.label}</span>
            </div>
          )}
        </div>
      )}
      {table}
    </div>
  );
}
