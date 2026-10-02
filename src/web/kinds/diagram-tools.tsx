// The diagram's toolbar: what to draw, the colours, and what to do with the picked elements.

import { Circle, Copy, Diamond, Minus, MousePointer2, MoveUpRight, PaintBucket, Palette, Redo2, Square, TextCursorInput, Trash2, Type, Undo2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cx } from '../editor/ctx';
import { tokenColor } from './shared';

export type Tool = 'select' | 'rect' | 'ellipse' | 'diamond' | 'arrow' | 'line' | 'text';

export const TOOLS: { tool: Tool; Icon: LucideIcon; name: string; key: string }[] = [
  { tool: 'select', Icon: MousePointer2, name: 'Select and move', key: 'v' },
  { tool: 'rect', Icon: Square, name: 'Rectangle', key: 'r' },
  { tool: 'ellipse', Icon: Circle, name: 'Ellipse', key: 'o' },
  { tool: 'diamond', Icon: Diamond, name: 'Diamond', key: 'd' },
  { tool: 'arrow', Icon: MoveUpRight, name: 'Arrow', key: 'a' },
  { tool: 'line', Icon: Minus, name: 'Line', key: 'l' },
  { tool: 'text', Icon: Type, name: 'Text', key: 't' },
];

/** Strokes in the strong colours; fills in their soft shades. Null is the default (ink, or the paper). */
const STROKES: [string, string][] = [['ink', 'Ink'], ['muted', 'Grey'], ['accent', 'Accent'], ['live', 'Green'], ['warn', 'Amber'], ['bad', 'Red'], ['agent', 'Pink']];
const FILLS: [string | null, string][] = [
  [null, 'Paper'], ['sunken', 'Shade'], ['accent-soft', 'Accent, soft'], ['live-soft', 'Green, soft'], ['warn-soft', 'Amber, soft'],
  ['bad-soft', 'Red, soft'], ['agent-soft', 'Pink, soft'], ['none', 'None'],
];

export type Swatch = 'stroke' | 'fill' | null;

interface Props {
  tool: Tool;
  setTool: (t: Tool) => void;
  stroke: string;
  fill: string | null;
  paint: (key: 'color' | 'fill', token: string | null) => void;
  swatch: Swatch;
  setSwatch: (s: Swatch) => void;
  picked: number;
  canLabel: boolean;
  label: () => void;
  duplicate: () => void;
  remove: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
}

const dot = (token: string | null, fallback: string) => (token === 'none' ? 'transparent' : tokenColor(token, fallback));

export function DiagramTools(p: Props) {
  const btn = (name: string, Icon: LucideIcon, run: () => void, disabled = false) => (
    <button type="button" className="kd-btn" title={name} aria-label={name} disabled={disabled} onClick={run}><Icon size={16} /></button>
  );
  return (
    <div className="kdiagram-tools" role="toolbar" aria-label="Diagram">
      <div className="kd-group">
        {TOOLS.map(({ tool, Icon, name, key }) => (
          <button key={tool} type="button" className={cx('kd-btn', p.tool === tool && 'is-on')} aria-pressed={p.tool === tool}
            title={`${name} (${key.toUpperCase()})`} aria-label={name} onClick={() => p.setTool(tool)}><Icon size={16} /></button>
        ))}
      </div>
      <div className="kd-group">
        <button type="button" className={cx('kd-btn kd-paint', p.swatch === 'stroke' && 'is-on')} aria-expanded={p.swatch === 'stroke'}
          title="Line and text colour" aria-label="Line and text colour" onClick={() => p.setSwatch(p.swatch === 'stroke' ? null : 'stroke')}>
          <Palette size={16} /><i style={{ background: dot(p.stroke, 'var(--ink)') }} />
        </button>
        <button type="button" className={cx('kd-btn kd-paint', p.swatch === 'fill' && 'is-on')} aria-expanded={p.swatch === 'fill'}
          title="Fill colour" aria-label="Fill colour" onClick={() => p.setSwatch(p.swatch === 'fill' ? null : 'fill')}>
          <PaintBucket size={16} /><i className={cx(p.fill === 'none' && 'is-none')} style={{ background: dot(p.fill, 'var(--paper)') }} />
        </button>
        {btn('Write a label (Enter)', TextCursorInput, p.label, !p.canLabel)}
        {btn('Duplicate (⌘D)', Copy, p.duplicate, !p.picked)}
        {btn('Delete (⌫)', Trash2, p.remove, !p.picked)}
      </div>
      <div className="kd-group">
        {btn('Undo (⌘Z)', Undo2, p.undo, !p.canUndo)}
        {btn('Redo (⇧⌘Z)', Redo2, p.redo, !p.canRedo)}
      </div>
      {p.swatch && (
        <div className="kd-swatches" role="group" aria-label={p.swatch === 'stroke' ? 'Line and text colour' : 'Fill colour'}>
          {(p.swatch === 'stroke' ? STROKES : FILLS).map(([token, name]) => {
            const on = p.swatch === 'stroke' ? p.stroke === token : p.fill === token;
            return (
              <button key={token ?? 'default'} type="button" className={cx('kd-swatch', on && 'is-on', token === 'none' && 'is-none')} aria-pressed={on} title={name} aria-label={name}
                onClick={() => p.paint(p.swatch === 'stroke' ? 'color' : 'fill', token)}>
                <i style={{ background: dot(token, p.swatch === 'stroke' ? 'var(--ink)' : 'var(--paper)') }} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
