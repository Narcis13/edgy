// What a cell can hold. Opens from the toolbar or with /.

import { useEffect, useRef, useState } from 'react';
import {
  Calendar, ChartArea, ChartColumn, ChartLine, ChartPie, CircleDashed, Gauge, Hash, Image, type LucideIcon, MousePointerClick,
  Sigma, SlidersHorizontal, Smile, SquareCheck, Star, Table2, TextCursorInput, ToggleLeft, Type, ListFilter, Text,
} from 'lucide-react';
import { cx, useSession } from './ctx';

export interface KindOption {
  kind: string;
  type?: string;
  label: string;
  hint: string;
  icon: LucideIcon;
}

export const KIND_OPTIONS: KindOption[] = [
  { kind: 'text', label: 'Text', hint: 'Words, headings, lists', icon: Type },
  { kind: 'formula', label: 'Formula', hint: 'A value computed from other cells', icon: Sigma },
  { kind: 'input', type: 'number', label: 'Number', hint: 'A number people type', icon: Hash },
  { kind: 'input', type: 'text', label: 'Text field', hint: 'A line people type', icon: TextCursorInput },
  { kind: 'input', type: 'slider', label: 'Slider', hint: 'A number in a range', icon: SlidersHorizontal },
  { kind: 'input', type: 'checkbox', label: 'Checkbox', hint: 'Yes or no', icon: SquareCheck },
  { kind: 'input', type: 'toggle', label: 'Toggle', hint: 'On or off', icon: ToggleLeft },
  { kind: 'input', type: 'select', label: 'Choice', hint: 'One of several options', icon: ListFilter },
  { kind: 'input', type: 'date', label: 'Date', hint: 'A day', icon: Calendar },
  { kind: 'input', type: 'textarea', label: 'Long text', hint: 'Several lines people type', icon: Text },
  { kind: 'input', type: 'rating', label: 'Rating', hint: 'Stars', icon: Star },
  { kind: 'button', label: 'Button', hint: 'Runs an action', icon: MousePointerClick },
  { kind: 'image', label: 'Picture', hint: 'An uploaded or linked image', icon: Image },
  { kind: 'icon', label: 'Icon', hint: 'A small symbol', icon: Smile },
  { kind: 'chart', type: 'bar', label: 'Bar chart', hint: 'Compare amounts', icon: ChartColumn },
  { kind: 'chart', type: 'line', label: 'Line chart', hint: 'Change over a sequence', icon: ChartLine },
  { kind: 'chart', type: 'area', label: 'Area chart', hint: 'A filled line', icon: ChartArea },
  { kind: 'chart', type: 'donut', label: 'Donut', hint: 'Parts of a whole', icon: ChartPie },
  { kind: 'chart', type: 'meter', label: 'Meter', hint: 'One number against a maximum', icon: Gauge },
  { kind: 'table', label: 'Table', hint: 'Rows of records', icon: Table2 },
  { kind: 'empty', label: 'Empty', hint: 'Clear the cell', icon: CircleDashed },
];

export function kindOption(kind: string, type?: string): KindOption {
  return KIND_OPTIONS.find((o) => o.kind === kind && (o.type === undefined || o.type === (type ?? o.type))) ?? KIND_OPTIONS[0];
}

export function KindMenu({ cell, current, onClose }: { cell: string; current?: KindOption; onClose: () => void }) {
  const session = useSession();
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const list = KIND_OPTIONS.filter((o) => !q || (o.label + ' ' + o.hint).toLowerCase().includes(q.toLowerCase()));
  useEffect(() => setI(0), [q]);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [onClose]);
  const choose = (o: KindOption) => session.setKind(cell, o.kind, o.type);
  return (
    <div className="kind-menu" ref={ref} role="dialog" aria-label="Choose what this cell holds">
      <input
        autoFocus value={q} placeholder="Search…" aria-label="Filter kinds"
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(list.length - 1, x + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
          else if (e.key === 'Enter' && list[i]) { e.preventDefault(); choose(list[i]); }
          else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
        }}
      />
      <ul role="listbox">
        {list.map((o, j) => (
          <li key={o.label} role="option" aria-selected={j === i} className={cx(j === i && 'is-active', current?.label === o.label && 'is-current')}
            onPointerEnter={() => setI(j)} onClick={() => choose(o)}>
            <o.icon size={16} strokeWidth={1.75} />
            <span>{o.label}</span>
            <small>{o.hint}</small>
          </li>
        ))}
        {!list.length && <li className="none">Nothing matches</li>}
      </ul>
    </div>
  );
}
