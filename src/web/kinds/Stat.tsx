// A stat cell: one headline number, how it moved against an earlier value,
// and a sparkline of where it has been.

import { useId } from 'react';
import type { Cell } from '../../core/types';
import type { CellState } from '../../core/engine';
import { formatValue } from '../../core/sx';
import { CELL_ICONS } from '../editor/icons';
import { cx } from '../editor/ctx';
import { change, changeText, numbers, spark } from './kpi';
import { useCurrency } from './shared';
import './kinds.css';

const W = 100;
const H = 32;

export function StatView({ cell, st }: { cell: Cell; st: CellState | undefined }) {
  const currency = useCurrency();
  const gradient = 'spark' + useId().replace(/[^\w-]/g, '');
  const label = (st?.props?.label as string | undefined) ?? cell.label;
  const Icon = cell.icon ? CELL_ICONS[cell.icon] : undefined;
  const props = st?.props ?? {};
  const compare = 'compare' in props ? props.compare : cell.compare;
  const trend = numbers('trend' in props ? props.trend : cell.trend);
  const value = st?.value;
  const delta = cell.compare !== undefined ? change(value, compare) : undefined;
  const line = spark(trend, W, H);
  const fmt = (v: unknown) => formatValue(v, cell.format, currency);
  const text = st?.error ? '' : fmt(value);

  return (
    <div className="kstat">
      {(label || Icon) && (
        <div className="kstat-label">
          {Icon && <Icon size={15} strokeWidth={1.75} aria-hidden />}
          {label && <span>{label}</span>}
        </div>
      )}
      <div className="kstat-main">
        <span className={cx('kstat-value', text === '' && 'is-empty')}>{text === '' ? '—' : text}</span>
        {delta !== undefined && !st?.error && (
          <span className="kstat-change">
            <span className={cx('kstat-delta', delta && `is-${delta.dir}`, cell.better === 'down' && 'is-inverted')}
              aria-label={delta ? `${delta.dir === 'up' ? 'Up' : delta.dir === 'down' ? 'Down' : 'No change'} ${changeText(delta).replace(/^[▲▼] /, '')}` : 'No earlier value to compare with'}>
              {changeText(delta)}
            </span>
            {delta && typeof compare === 'number' && <span className="kstat-vs">vs {fmt(compare)}</span>}
          </span>
        )}
      </div>
      {line && (
        <svg className="kstat-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Trend: ${trend.map((n) => fmt(n)).join(', ')}`}>
          <defs>
            <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="currentColor" stopOpacity="0.22" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={line.area} fill={`url(#${gradient})`} />
          <polyline points={line.line} fill="none" stroke="currentColor" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
    </div>
  );
}
