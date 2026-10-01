// A chart: its numbers, kind, title, colour and format.

import { ChartArea, ChartColumn, ChartLine, ChartPie, Gauge } from 'lucide-react';
import { SxField, TextField } from '../../fields';
import { FormatSelect, Prop, STRONG_TOKENS, Swatches, Tiles, colorName } from '../controls';
import type { KindProps } from './types';

const TYPES = [
  { value: 'bar', label: 'Bars', art: <ChartColumn size={20} strokeWidth={1.75} />, hint: 'Compare amounts' },
  { value: 'line', label: 'Line', art: <ChartLine size={20} strokeWidth={1.75} />, hint: 'Change over a sequence' },
  { value: 'area', label: 'Area', art: <ChartArea size={20} strokeWidth={1.75} />, hint: 'A filled line' },
  { value: 'donut', label: 'Donut', art: <ChartPie size={20} strokeWidth={1.75} />, hint: 'Parts of a whole' },
  { value: 'meter', label: 'Meter', art: <Gauge size={20} strokeWidth={1.75} />, hint: 'One number against a maximum' },
];

export function ChartPanel({ e }: KindProps) {
  const c = e.cell;
  const type = c.type ?? 'bar';
  return (
    <>
      <Prop label="Numbers" hint={type === 'meter' ? 'One number, e.g. total.' : 'A list of numbers, or label and value pairs.'}>
        <SxField value={c.expr} cell={c.id} prop="expr" preview placeholder="(list 3 5 2)" label="Numbers" onCommit={(x) => e.set('expr', x)} />
      </Prop>
      <Prop label="Kind of chart">
        <Tiles label="Kind of chart" value={type} onChange={(v) => e.set('type', v)} options={TYPES} />
      </Prop>
      <Prop label="Title">
        <TextField value={c.label ?? ''} label="Title" placeholder="Shown above the chart" onCommit={(v) => e.set('label', v || null)} />
      </Prop>
      <Prop label="Colour" aside={c.color ? <span className="ins-value">{colorName(c.color)}</span> : undefined} onReset={c.color ? () => e.set('color', null) : undefined}>
        <Swatches value={c.color} label="Chart colour" tokens={STRONG_TOKENS} noneLabel="Automatic" onChange={(v) => e.set('color', v)} />
      </Prop>
      <Prop label="Show numbers as" onReset={c.format ? () => e.set('format', null) : undefined}>
        <FormatSelect value={c.format} onChange={(v) => e.set('format', v)} />
      </Prop>
      {type === 'meter' && (
        <Prop label="Maximum" hint="A number or a cell's name; the meter is full there." onReset={c.max !== undefined ? () => e.set('max', null) : undefined}>
          <SxField value={c.max} cell={c.id} prop="max" preview placeholder="1" label="Maximum" onCommit={(x) => e.set('max', x)} />
        </Prop>
      )}
    </>
  );
}
