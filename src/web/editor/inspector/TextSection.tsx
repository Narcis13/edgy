// Typography: ready-made text styles first, then the font, size, weight,
// emphasis, colour, alignment and spacing between lines and letters.

import type { CSSProperties } from 'react';
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart,
  Italic, Strikethrough, Underline,
} from 'lucide-react';
import type { Json } from '../../../core/types';
import { fontById } from '../../../core/fonts';
import { NumberField } from '../fields';
import { cx } from '../ctx';
import { color } from '../look';
import { Chips, ColorPick, FontPicker, Prop, Slider, colorName } from './controls';
import { type Edit, num } from './edit';
import { SIZE_SCALE, TEXT_PRESETS, type TextPreset, WEIGHTS, matchPreset, presetPatch } from './presets';
import { Section } from './Section';

/** A preset drawn in its own style, small enough for the panel. */
function previewCss(p: TextPreset): CSSProperties {
  const s = p.style;
  const f = fontById(s.font);
  const css: CSSProperties = {
    fontSize: Math.max(11.5, Math.min(22, num(s.size) ?? 15)),
    fontWeight: num(s.weight) ?? undefined,
    letterSpacing: num(s.tracking) != null ? `${s.tracking}em` : undefined,
    textTransform: s.case === 'upper' ? 'uppercase' : undefined,
    fontStyle: s.italic ? 'italic' : undefined,
    color: color(s.fg),
  };
  if (f) {
    css.fontFamily = f.family;
    css.fontVariationSettings = f.variation;
  }
  if (s.border === 'l') {
    css.borderLeft = `2px solid ${color(s.bcolor) ?? 'var(--line-strong)'}`;
    css.paddingLeft = 8;
  }
  return css;
}

export function TextSection({ e, open }: { e: Edit; open?: boolean }) {
  const s = e.cell.style ?? {};
  const current = matchPreset(s);
  const font = fontById(s.font);
  const size = num(s.size);
  const weight = num(s.weight);
  const line = num(s.line);
  const tracking = num(s.tracking);
  const key = (k: string) => ({ key: `${k}:${e.ids.join(',')}` });
  const st = (k: string, v: Json) => e.style({ [k]: v });

  const summary = [font?.label, size ? `${size}px` : null, current && current.id !== 'body' ? current.label : null].filter(Boolean).join(' · ');

  return (
    <Section name="text" title="Text" open={open} summary={summary || 'Default'}>
      <Prop label="Text style" hint="Pick one to start; fine-tune below.">
        <div className="ins-presets" role="group" aria-label="Text styles">
          {TEXT_PRESETS.map((p) => (
            <button key={p.id} type="button" className={cx('ins-preset', current?.id === p.id && 'is-on')} aria-pressed={current?.id === p.id}
              onClick={() => e.style(presetPatch(p, s))}>
              <span className="ins-preset-name" style={previewCss(p)}>{p.label}</span>
              <span className="ins-preset-size">{num(p.style.size) ?? 15}</span>
            </button>
          ))}
        </div>
      </Prop>

      <Prop label="Font" onReset={s.font != null ? () => st('font', null) : undefined}>
        <FontPicker value={s.font} label="Font" onChange={(id) => st('font', id)} />
      </Prop>

      <Prop label="Size" aside={<span className="ins-value">{size ?? 15}px</span>} onReset={size != null ? () => st('size', null) : undefined}>
        <Chips label="Text size" cols={4} value={size ?? undefined} onChange={(v) => st('size', v)}
          options={SIZE_SCALE.map((n) => ({ value: n, label: String(n) }))} />
        <NumberField value={size} placeholder="15" min={8} max={200} label="Text size in pixels" onCommit={(v) => st('size', v)} />
      </Prop>

      <Prop label="Weight" aside={weight != null && !WEIGHTS.some((w) => w.value === weight) ? <span className="ins-value">{weight}</span> : undefined}
        onReset={weight != null ? () => st('weight', null) : undefined}>
        <Chips label="Weight" cols={3} value={weight} onChange={(v) => st('weight', v)}
          options={WEIGHTS.map((w) => ({ value: w.value, label: <span style={{ fontWeight: w.value ?? 400 }}>{w.label}</span>, title: w.label }))} />
      </Prop>

      <Prop label="Emphasis and case">
        <div className="ins-line">
          <div className="ins-chips ins-icon-chips" role="group" aria-label="Emphasis">
            <button type="button" className={cx('ins-chip', s.italic === true && 'is-on')} aria-pressed={s.italic === true} title="Italic" aria-label="Italic"
              onClick={() => st('italic', s.italic === true ? null : true)}><Italic size={15} /></button>
            <button type="button" className={cx('ins-chip', s.decor === 'underline' && 'is-on')} aria-pressed={s.decor === 'underline'} title="Underline" aria-label="Underline"
              onClick={() => st('decor', s.decor === 'underline' ? null : 'underline')}><Underline size={15} /></button>
            <button type="button" className={cx('ins-chip', s.decor === 'strike' && 'is-on')} aria-pressed={s.decor === 'strike'} title="Strike through" aria-label="Strike through"
              onClick={() => st('decor', s.decor === 'strike' ? null : 'strike')}><Strikethrough size={15} /></button>
          </div>
          <Chips label="Letter case" value={typeof s.case === 'string' ? s.case : 'none'} onChange={(v) => st('case', v === 'none' ? null : v)}
            options={[
              { value: 'none', label: '–', title: 'As typed' },
              { value: 'upper', label: 'AA', title: 'Capitals' },
              { value: 'lower', label: 'aa', title: 'Small letters' },
              { value: 'title', label: 'Aa', title: 'Each word capitalised' },
            ]} />
        </div>
      </Prop>

      <Prop label="Colour" aside={s.fg != null ? <span className="ins-value">{colorName(s.fg)}</span> : undefined} onReset={s.fg != null ? () => st('fg', null) : undefined}>
        <ColorPick value={s.fg} label="Text colour" onChange={(v) => st('fg', v)} />
      </Prop>

      <Prop label="Alignment">
        <div className="ins-line">
          <Chips label="Horizontal alignment" value={typeof s.align === 'string' ? s.align : 'start'} onChange={(v) => st('align', v === 'start' ? null : v)}
            options={[
              { value: 'start', label: <AlignLeft size={15} />, title: 'Left' },
              { value: 'center', label: <AlignCenter size={15} />, title: 'Centre' },
              { value: 'end', label: <AlignRight size={15} />, title: 'Right' },
              { value: 'justify', label: <AlignJustify size={15} />, title: 'Justified' },
            ]} />
          <Chips label="Vertical alignment" value={typeof s.valign === 'string' ? s.valign : 'start'} onChange={(v) => st('valign', v === 'start' ? null : v)}
            options={[
              { value: 'start', label: <AlignVerticalJustifyStart size={15} />, title: 'Top' },
              { value: 'center', label: <AlignVerticalJustifyCenter size={15} />, title: 'Middle' },
              { value: 'end', label: <AlignVerticalJustifyEnd size={15} />, title: 'Bottom' },
            ]} />
        </div>
      </Prop>

      <Prop label="Line height" aside={<span className="ins-value">{line ?? 'Default'}</span>} onReset={line != null ? () => st('line', null) : undefined}>
        <Slider value={line} fallback={1.45} min={1} max={2.2} step={0.05} label="Line height" onChange={(v) => e.style({ line: v }, key('line'))} />
      </Prop>

      <Prop label="Letter spacing" aside={<span className="ins-value">{tracking != null ? `${tracking} em` : 'Default'}</span>} onReset={tracking != null ? () => st('tracking', null) : undefined}>
        <Slider value={tracking} fallback={0} min={-0.05} max={0.2} step={0.01} label="Letter spacing in em" onChange={(v) => e.style({ tracking: v }, key('tracking'))} />
      </Prop>

      <Prop label="Space between paragraphs" inline onReset={s.para != null ? () => st('para', null) : undefined}>
        <NumberField value={num(s.para)} placeholder="Auto" min={0} max={80} label="Space between paragraphs in pixels" onCommit={(v) => st('para', v)} />
        <span className="ins-unit">px</span>
      </Prop>
    </Section>
  );
}
