// The inspector's building blocks: a labelled property, chips, switches,
// sliders, colours, fonts and icons. Each shows its current value and offers
// a way back to the default.

import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import type { Json } from '../../../core/types';
import { print, read } from '../../../core/sx';
import { FONTS, type FontDef, fontById } from '../../../core/fonts';
import { COLOR_TOKENS } from '../look';
import { CELL_ICONS, ICON_NAMES } from '../icons';
import { NumberField, TextField } from '../fields';
import { cx } from '../ctx';

/** Keys typed in a control stay there, so the editor's shortcuts don't fire. */
export const stop = (e: KeyboardEvent) => e.stopPropagation();

/** One short line under a control. */
export const Hint = ({ children }: { children: ReactNode }) => <p className="ins-hint">{children}</p>;

/** A sub-heading inside a section. */
export const Sub = ({ children }: { children: ReactNode }) => <h4 className="ins-sub">{children}</h4>;

/**
 * A labelled property. Stacked by default (label above, the control full
 * width); `inline` puts a short control beside its label. `onReset` shows a
 * "Default" button, meant to be passed only while something is set.
 */
export function Prop({ label, children, hint, inline, onReset, aside }: {
  label: string; children: ReactNode; hint?: ReactNode; inline?: boolean; onReset?: () => void; aside?: ReactNode;
}) {
  const id = useId();
  return (
    <div className={cx('ins-prop', inline && 'is-inline')} role="group" aria-labelledby={id}>
      <div className="ins-prop-top">
        <span id={id} className="ins-label">{label}</span>
        {aside}
        {onReset && <button type="button" className="ins-reset" onClick={onReset} aria-label={`${label}: back to default`}>Default</button>}
      </div>
      <div className="ins-control">{children}</div>
      {hint && <Hint>{hint}</Hint>}
    </div>
  );
}

export interface ChipOption<T> {
  value: T;
  label: ReactNode;
  /** Spoken and shown on hover when the label is a picture. */
  title?: string;
}

/** A row (or grid) of choices; one is on. */
export function Chips<T extends Json>({ value, options, onChange, label, cols, className }: {
  value: T | undefined; options: ChipOption<T>[]; onChange: (v: T) => void; label: string; cols?: number; className?: string;
}) {
  return (
    <div className={cx('ins-chips', className)} role="group" aria-label={label} style={cols ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoFlow: 'row' } : undefined}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" className={cx('ins-chip', value === o.value && 'is-on')} aria-pressed={value === o.value}
          title={o.title} aria-label={typeof o.label === 'string' ? undefined : o.title} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Bigger choices with a picture above the words. */
export function Tiles<T extends string>({ value, options, onChange, label, cols = 3 }: {
  value: T | undefined; options: { value: T; label: string; art: ReactNode; hint?: string }[]; onChange: (v: T) => void; label: string; cols?: number;
}) {
  return (
    <div className="ins-tiles" role="group" aria-label={label} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button key={o.value} type="button" className={cx('ins-tile', value === o.value && 'is-on')} aria-pressed={value === o.value} title={o.hint} onClick={() => onChange(o.value)}>
          <span className="ins-tile-art" aria-hidden>{o.art}</span>
          <span className="ins-tile-label">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/** An on/off switch with its words beside it. */
export function Toggle({ on, onChange, children, hint }: { on: boolean; onChange: (on: boolean) => void; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="ins-toggle-wrap">
      <button type="button" role="switch" aria-checked={on} className={cx('ins-toggle', on && 'is-on')} onClick={() => onChange(!on)}>
        <span className="ins-switch" aria-hidden><span /></span>
        <span>{children}</span>
      </button>
      {hint && <Hint>{hint}</Hint>}
    </div>
  );
}

/** A range with the number beside it. Moving it writes as it goes. */
export function Slider({ value, fallback, min, max, step, onChange, label }: {
  value: number | null; fallback: number; min: number; max: number; step: number; onChange: (v: number | null) => void; label: string;
}) {
  return (
    <div className="ins-slider">
      <input type="range" min={min} max={max} step={step} value={value ?? fallback} aria-label={label} className={cx(value == null && 'is-default')}
        onChange={(e) => onChange(Number(e.target.value))} onKeyDown={stop} />
      <NumberField value={value} placeholder={String(fallback)} step={step} label={label} onCommit={onChange} />
    </div>
  );
}

// ── colours ──

const TOKEN_NAMES: Record<string, string> = {
  ink: 'Ink', muted: 'Grey', faint: 'Light grey', paper: 'Paper', sunken: 'Shade', line: 'Line',
  accent: 'Accent', 'accent-soft': 'Accent, soft', agent: 'Pink', 'agent-soft': 'Pink, soft', live: 'Green', 'live-soft': 'Green, soft',
  warn: 'Amber', 'warn-soft': 'Amber, soft', bad: 'Red', 'bad-soft': 'Red, soft',
};

export const colorName = (v: unknown): string =>
  typeof v === 'string' ? TOKEN_NAMES[v] ?? v : v == null ? '' : 'From a formula';

/** Colours that read as a label on a badge or a series: strong ones first. */
export const STRONG_TOKENS = ['accent', 'live', 'warn', 'bad', 'agent', 'muted', 'ink'];

/** Colour tokens as swatches; the first one clears. */
export function Swatches({ value, onChange, tokens, label, noneLabel = 'Default' }: {
  value: unknown; onChange: (v: string | null) => void; tokens?: readonly string[]; label: string; noneLabel?: string;
}) {
  const list = tokens ?? COLOR_TOKENS.filter((t) => t !== 'line');
  return (
    <div className="colors ins-swatches" role="group" aria-label={label}>
      <button type="button" className={cx('swatch none', value == null && 'is-on')} title={noneLabel} aria-label={noneLabel} aria-pressed={value == null} onClick={() => onChange(null)} />
      {list.map((t) => (
        <button key={t} type="button" className={cx('swatch', value === t && 'is-on')} style={{ background: `var(--${t})` }}
          title={TOKEN_NAMES[t] ?? t} aria-label={TOKEN_NAMES[t] ?? t} aria-pressed={value === t} onClick={() => onChange(t)} />
      ))}
    </div>
  );
}

/** Swatches, and a field for any CSS colour or an (if …) expression. */
export function ColorPick({ value, onChange, label }: { value: unknown; onChange: (v: Json) => void; label: string }) {
  const [custom, setCustom] = useState(false);
  const isToken = typeof value === 'string' && (COLOR_TOKENS as readonly string[]).includes(value);
  const current = typeof value === 'string' ? value : value == null ? '' : print(value as Json);
  const showField = custom || (value != null && !isToken);
  return (
    <>
      <Swatches value={value} onChange={onChange} label={label} />
      {showField ? (
        <TextField value={current} placeholder="#hex, a CSS colour or (if …)" label={`${label}: custom colour or formula`} mono onCommit={(raw) => {
          const v = raw.trim();
          if (!v) return onChange(null);
          if (v.startsWith('(')) {
            try { onChange(read(v)); } catch { /* keep the previous value */ }
          } else onChange(v);
        }} />
      ) : (
        <button type="button" className="ins-link" onClick={() => setCustom(true)}>Other colour…</button>
      )}
    </>
  );
}

// ── fonts ──

const GROUPS = [...new Set(FONTS.map((f) => f.group))];
const fontStyle = (f: FontDef | undefined) => (f ? { fontFamily: f.family, fontVariationSettings: f.variation } : undefined);

/**
 * The current font's name, set in that font; opens a list of every font, each
 * in its own face. Keyboard: ↑/↓, Home/End, Enter, Escape, or type a letter.
 */
export function FontPicker({ value, onChange, label, defaultLabel = 'Document default', defaultFont }: {
  value: unknown; onChange: (id: string | null) => void; label: string; defaultLabel?: string;
  /** What the default looks like, to show it in its face. */
  defaultFont?: FontDef;
}) {
  const current = fontById(value);
  const options: (FontDef | null)[] = [null, ...GROUPS.flatMap((g) => FONTS.filter((f) => f.group === g))];
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const base = useId();
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const optId = (i: number) => `${base}-o${i}`;

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open]);
  useEffect(() => {
    if (open) document.getElementById(optId(active))?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const show = () => {
    setActive(Math.max(0, options.findIndex((o) => (o?.id ?? null) === (current?.id ?? null))));
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  const choose = (i: number) => {
    onChange(options[i]?.id ?? null);
    close();
  };
  const onKey = (e: KeyboardEvent) => {
    e.stopPropagation();
    const k = e.key;
    if (k === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(options.length - 1, a + 1)); }
    else if (k === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (k === 'Home') { e.preventDefault(); setActive(0); }
    else if (k === 'End') { e.preventDefault(); setActive(options.length - 1); }
    else if (k === 'Enter' || k === ' ') { e.preventDefault(); choose(active); }
    else if (k === 'Escape') { e.preventDefault(); close(); }
    else if (k === 'Tab') setOpen(false);
    else if (k.length === 1 && /\S/.test(k)) {
      const n = options.length;
      for (let s = 1; s <= n; s++) {
        const i = (active + s) % n;
        const name = options[i]?.label ?? defaultLabel;
        if (name.toLowerCase().startsWith(k.toLowerCase())) { setActive(i); break; }
      }
    }
  };

  let i = 0;
  const option = (f: FontDef | null) => {
    const j = i++;
    const on = (f?.id ?? null) === (current?.id ?? null);
    return (
      <div key={f?.id ?? 'default'} id={optId(j)} role="option" aria-selected={on} className={cx('ins-font-opt', j === active && 'is-active', on && 'is-on')}
        onPointerEnter={() => setActive(j)} onClick={() => choose(j)}>
        <span style={fontStyle(f ?? defaultFont)}>{f ? f.label : defaultLabel}</span>
        {on && <Check size={14} aria-hidden />}
      </div>
    );
  };

  return (
    <div className="ins-font" ref={box}>
      <button ref={button} type="button" className="ins-font-btn" aria-haspopup="listbox" aria-expanded={open} aria-label={`${label}: ${current?.label ?? defaultLabel}`}
        onClick={() => (open ? close() : show())} onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'ArrowDown' && !open) { e.preventDefault(); show(); }
        }}>
        <span style={fontStyle(current ?? defaultFont)}>{current?.label ?? defaultLabel}</span>
        <ChevronDown size={14} aria-hidden />
      </button>
      {open && (
        <div ref={list} className="ins-font-list" role="listbox" tabIndex={-1} aria-label={label} aria-activedescendant={optId(active)} onKeyDown={onKey}>
          {option(null)}
          {GROUPS.map((g) => (
            <div key={g} role="group" aria-label={g}>
              <div className="ins-font-group" aria-hidden>{g}</div>
              {FONTS.filter((f) => f.group === g).map(option)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── icons ──

/** Every icon, searchable, with a way to have none. */
export function IconPicker({ value, onChange, allowNone = true }: { value: string | undefined; onChange: (v: string | null) => void; allowNone?: boolean }) {
  const [q, setQ] = useState('');
  const grid = useRef<HTMLDivElement>(null);
  const names = ICON_NAMES.filter((n) => !q || n.includes(q.trim().toLowerCase()));
  // Bring the chosen icon into view inside the grid, without scrolling the panel.
  useEffect(() => {
    const g = grid.current;
    const on = g?.querySelector<HTMLElement>('.is-on');
    if (g && on) g.scrollTop = on.offsetTop - g.offsetTop - g.clientHeight / 2 + on.clientHeight / 2;
  }, []);
  return (
    <div className="ins-icons">
      <div className="ins-search">
        <Search size={14} aria-hidden />
        <input className="text-field" value={q} placeholder="Search icons" aria-label="Search icons" onChange={(e) => setQ(e.target.value)} onKeyDown={stop} />
      </div>
      <div ref={grid} className="icon-grid" role="listbox" aria-label="Icons">
        {allowNone && !q && (
          <button type="button" role="option" aria-selected={!value} className={cx('ins-no-icon', !value && 'is-on')} title="No icon" aria-label="No icon" onClick={() => onChange(null)}>
            <X size={16} strokeWidth={1.75} />
          </button>
        )}
        {names.map((n) => {
          const I = CELL_ICONS[n];
          return (
            <button key={n} type="button" role="option" aria-selected={value === n} aria-label={n} className={cx(value === n && 'is-on')} title={n} onClick={() => onChange(n)}>
              <I size={18} strokeWidth={1.75} />
            </button>
          );
        })}
        {!names.length && <p className="ins-hint ins-grid-note">No icon matches “{q}”.</p>}
      </div>
    </div>
  );
}

/** A small button showing the icon; opens the picker below it. */
export function IconChoice({ value, onChange, label = 'Icon' }: { value: string | undefined; onChange: (v: string | null) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const I = value ? CELL_ICONS[value] : undefined;
  return (
    <div className="ins-icon-choice">
      <button type="button" className="ins-icon-btn" aria-expanded={open} aria-label={`${label}: ${value ?? 'none'}`} onClick={() => setOpen(!open)}>
        {I ? <I size={16} strokeWidth={1.75} /> : <span className="ins-faint">None</span>}
        <span className="ins-faint">{value ?? ''}</span>
        <ChevronDown size={14} aria-hidden />
      </button>
      {open && <IconPicker value={value} onChange={(v) => { onChange(v); setOpen(false); }} />}
    </div>
  );
}

// ── formats ──

export const FORMATS: [string, string][] = [
  ['auto', 'Automatic'], ['int', 'Whole number'], ['number', 'Two decimals'], ['0.0', 'One decimal'], ['percent', 'Percent'],
  ['compact', 'Compact (1.2k)'], ['currency', 'Currency'], ['USD', 'US dollars'], ['EUR', 'Euros'], ['GBP', 'Pounds'], ['RON', 'Lei'],
  ['date', 'Date'], ['time', 'Time'], ['datetime', 'Date and time'], ['ago', 'Time ago'],
];

export function FormatSelect({ value, onChange, label = 'Format' }: { value: string | undefined; onChange: (v: string | null) => void; label?: string }) {
  return (
    <select className="text-field" aria-label={label} value={value ?? 'auto'} onKeyDown={stop} onChange={(e) => onChange(e.target.value === 'auto' ? null : e.target.value)}>
      {FORMATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      {value && !FORMATS.some(([v]) => v === value) && <option value={value}>{value}</option>}
    </select>
  );
}
