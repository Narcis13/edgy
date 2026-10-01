// Spacing and size (how much room a cell takes and leaves inside) and the box
// (fill, border, corners, shadow).

import { useState } from 'react';
import { Link2, Unlink2 } from 'lucide-react';
import type { Cell, Json } from '../../../core/types';
import { NumberField } from '../fields';
import { cx } from '../ctx';
import { Chips, ColorPick, Hint, Prop, Swatches, colorName } from './controls';
import { type Edit, num } from './edit';
import { SIDE_NAMES, type Side, borderSides, borderValue, formatPad, parsePad, type Sides } from './box';
import { Section } from './Section';

export function SizeControl({ cell, set }: { cell: Cell; set: (p: string, v: Json) => void }) {
  const size = cell.size ?? 1;
  const mode = size === 'hug' ? 'hug' : typeof size === 'string' ? 'fixed' : 'fill';
  return (
    <>
      <Chips label="Size" value={mode} onChange={(m) => set('size', m === 'hug' ? 'hug' : m === 'fixed' ? '160px' : null)}
        options={[{ value: 'fill', label: 'Fill', title: 'Share the space by weight' }, { value: 'hug', label: 'Hug', title: 'As small as its content' }, { value: 'fixed', label: 'Fixed', title: 'A number of pixels' }]} />
      {mode === 'fill' && (
        <div className="ins-line">
          <NumberField value={typeof size === 'number' ? size : 1} min={0.1} step={0.5} label="Share of the space" onCommit={(v) => set('size', v && v > 0 ? v : null)} />
          <span className="ins-unit">shares</span>
        </div>
      )}
      {mode === 'fixed' && (
        <div className="ins-line">
          <NumberField value={parseInt(size as string, 10)} min={8} step={8} label="Pixels" onCommit={(v) => v && set('size', `${Math.round(v)}px`)} />
          <span className="ins-unit">px</span>
        </div>
      )}
    </>
  );
}

const PAD_STEPS = [{ value: 0, label: 'None' }, { value: 6, label: 'S' }, { value: 12, label: 'M' }, { value: 24, label: 'L' }];

/** Padding on all four sides at once, or each on its own. */
export function PadEditor({ value, fallback, onChange }: { value: unknown; fallback: number; onChange: (v: Json) => void }) {
  const sides = parsePad(value);
  const [split, setSplit] = useState(() => !!sides && !sides.every((x) => x === sides[0]));
  if (value != null && !sides) {
    return <Hint>Set by a formula or in other units. Use Default to start again.</Hint>;
  }
  const cur: Sides = sides ?? [fallback, fallback, fallback, fallback];
  const side = (i: number) => (
    <NumberField value={sides ? sides[i] : null} placeholder={String(fallback)} min={0} max={200} label={SIDE_NAMES[i]}
      onCommit={(v) => {
        const next = [...cur] as Sides;
        next[i] = v ?? fallback;
        onChange(formatPad(next));
      }} />
  );
  return (
    <>
      <div className="ins-line">
        {split ? <span className="ins-faint">Each side</span> : (
          <>
            <NumberField value={sides ? sides[0] : null} placeholder={String(fallback)} min={0} max={200} label="Padding on every side" onCommit={(v) => onChange(v)} />
            <span className="ins-unit">px</span>
          </>
        )}
        <button type="button" className={cx('icon-btn ins-link-btn', !split && 'is-on')} aria-pressed={!split}
          title={split ? 'Use one number for every side' : 'Set each side on its own'} aria-label="Same padding on every side"
          onClick={() => {
            if (split && sides && !sides.every((x) => x === sides[0])) onChange(sides[0]);
            setSplit(!split);
          }}>
          {split ? <Unlink2 size={15} /> : <Link2 size={15} />}
        </button>
      </div>
      {split ? (
        <div className="ins-sides" role="group" aria-label="Padding on each side">
          <div className="ins-side-t">{side(0)}</div>
          <div className="ins-side-l">{side(3)}</div>
          <div className="ins-side-box" aria-hidden />
          <div className="ins-side-r">{side(1)}</div>
          <div className="ins-side-b">{side(2)}</div>
        </div>
      ) : (
        <Chips label="Padding steps" cols={4} value={sides ? sides[0] : undefined} onChange={(v) => onChange(v)}
          options={PAD_STEPS.map((p) => ({ value: p.value, label: p.label, title: `${p.value}px` }))} />
      )}
    </>
  );
}

export function SpacingSection({ e, parent, group }: { e: Edit; parent: Cell | null; group: boolean }) {
  const s = e.cell.style ?? {};
  const size = e.cell.size;
  const summary = [size === 'hug' ? 'Hug' : typeof size === 'string' ? size : typeof size === 'number' ? `${size} shares` : null, s.pad != null ? `padding ${String(s.pad)}` : null]
    .filter(Boolean).join(' · ');
  return (
    <Section name="spacing" title="Spacing and size" summary={summary}>
      {parent && (
        <Prop label={parent.kind === 'row' ? 'Width' : 'Height'} hint="Fill shares the space; Hug fits the content; Fixed is exact."
          onReset={size != null ? () => e.set('size', null) : undefined}>
          <SizeControl cell={e.cell} set={(p, v) => e.set(p, v)} />
        </Prop>
      )}
      <Prop label="Padding" hint="Room between the edge and what is inside." onReset={s.pad != null ? () => e.style({ pad: null }) : undefined}>
        <PadEditor value={s.pad} fallback={group ? 0 : 12} onChange={(v) => e.style({ pad: v })} />
      </Prop>
    </Section>
  );
}

const SIDE_CHOICES: { side: Side; label: string }[] = [{ side: 't', label: 'Above' }, { side: 'b', label: 'Below' }, { side: 'l', label: 'Left' }, { side: 'r', label: 'Right' }];
const RADII = [0, 4, 8, 16];
const SHADOWS = ['none', 'sm', 'md', 'lg'] as const;
const SHADOW_NAMES: Record<string, string> = { none: 'None', sm: 'Soft', md: 'Medium', lg: 'Deep' };

export function BoxSection({ e }: { e: Edit }) {
  const s = e.cell.style ?? {};
  const sides = borderSides(s.border);
  const mode = s.border === 'all' ? 'all' : sides.length ? 'sides' : 'none';
  const radius = num(s.radius);
  const shadow = typeof s.shadow === 'string' ? s.shadow : 'none';
  const st = (k: string, v: Json) => e.style({ [k]: v });
  const summary = [s.bg != null ? `Fill ${colorName(s.bg)}` : null, mode !== 'none' ? 'Border' : null, radius ? `Corners ${radius}` : null, shadow !== 'none' ? 'Shadow' : null]
    .filter(Boolean).join(' · ');

  return (
    <Section name="box" title="Box" summary={summary}>
      <Prop label="Fill" aside={s.bg != null ? <span className="ins-value">{colorName(s.bg)}</span> : undefined} onReset={s.bg != null ? () => st('bg', null) : undefined}>
        <ColorPick value={s.bg} label="Fill colour" onChange={(v) => st('bg', v)} />
      </Prop>

      <Prop label="Border" onReset={s.border != null || s.bcolor != null || s.bwidth != null ? () => e.style({ border: null, bcolor: null, bwidth: null }) : undefined}>
        <Chips label="Border" value={mode} onChange={(m) => st('border', m === 'none' ? null : m === 'all' ? 'all' : 'b')}
          options={[{ value: 'none', label: 'None' }, { value: 'all', label: 'All round' }, { value: 'sides', label: 'Some sides' }]} />
        {mode === 'sides' && (
          <div className="ins-chips" role="group" aria-label="Border sides" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gridAutoFlow: 'row' }}>
            {SIDE_CHOICES.map(({ side, label }) => {
              const on = sides.includes(side);
              return (
                <button key={side} type="button" className={cx('ins-chip ins-side-chip', on && 'is-on')} aria-pressed={on}
                  onClick={() => st('border', borderValue(on ? sides.filter((x) => x !== side) : [...sides, side]))}>
                  <span className={`ins-edge ins-edge-${side}`} aria-hidden />{label}
                </button>
              );
            })}
          </div>
        )}
      </Prop>
      {mode !== 'none' && (
        <>
          <Prop label="Border colour" onReset={s.bcolor != null ? () => st('bcolor', null) : undefined}>
            <Swatches value={s.bcolor} label="Border colour" onChange={(v) => st('bcolor', v)} />
          </Prop>
          <Prop label="Border width" inline onReset={s.bwidth != null ? () => st('bwidth', null) : undefined}>
            <NumberField value={num(s.bwidth)} placeholder="1" min={1} max={12} label="Border width in pixels" onCommit={(v) => st('bwidth', v)} />
            <span className="ins-unit">px</span>
          </Prop>
        </>
      )}

      <Prop label="Corners" onReset={s.radius != null ? () => st('radius', null) : undefined}>
        <Chips label="Corner rounding" cols={4} value={radius ?? 0} onChange={(v) => st('radius', v || null)}
          options={RADII.map((r) => ({ value: r, title: r ? `${r}px` : 'Square', label: <span className="ins-corner" style={{ borderTopLeftRadius: r * 0.75 }} aria-hidden /> }))} />
        <div className="ins-line">
          <NumberField value={radius} placeholder="0" min={0} max={80} label="Corner rounding in pixels" onCommit={(v) => st('radius', v)} />
          <span className="ins-unit">px</span>
        </div>
      </Prop>

      <Prop label="Shadow" onReset={s.shadow != null ? () => st('shadow', null) : undefined}>
        <Chips label="Shadow" cols={4} value={shadow} onChange={(v) => st('shadow', v === 'none' ? null : v)}
          options={SHADOWS.map((sh) => ({ value: sh, title: SHADOW_NAMES[sh], label: <><span className={`ins-shadow ins-shadow-${sh}`} aria-hidden /><span>{SHADOW_NAMES[sh]}</span></> }))} />
      </Prop>
    </Section>
  );
}
