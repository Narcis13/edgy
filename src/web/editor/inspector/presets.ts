// Ready-made looks: text styles for any cell and quick looks for tables. Each
// is a patch applied in one step, and each can tell whether it is the one in use.

import type { Cell, Json, Op } from '../../../core/types';

/** The typographic keys a text preset owns: applying one clears whichever of these it doesn't set. */
export const TYPO_KEYS = ['size', 'weight', 'line', 'tracking', 'case', 'italic', 'decor'] as const;

export interface TextPreset {
  id: string;
  label: string;
  style: Record<string, Json>;
}

export const TEXT_PRESETS: TextPreset[] = [
  { id: 'title', label: 'Title', style: { size: 36, weight: 750, line: 1.1, tracking: -0.02 } },
  { id: 'heading', label: 'Heading', style: { size: 26, weight: 700, line: 1.2, tracking: -0.01 } },
  { id: 'subheading', label: 'Subheading', style: { size: 19, weight: 600, line: 1.3 } },
  { id: 'body', label: 'Body', style: {} },
  { id: 'small', label: 'Small', style: { size: 13 } },
  { id: 'caption', label: 'Caption', style: { size: 12, fg: 'muted', line: 1.4 } },
  { id: 'label', label: 'Label', style: { size: 11.5, weight: 650, case: 'upper', tracking: 0.08, fg: 'muted' } },
  { id: 'quote', label: 'Quote', style: { font: 'serif', italic: true, size: 19, line: 1.5, border: 'l', bcolor: 'accent', pad: '4 0 4 16' } },
  { id: 'big', label: 'Big number', style: { size: 44, weight: 800, tracking: -0.03, line: 1 } },
];

type Style = Record<string, unknown> | undefined;

const isSet = (v: unknown) => v !== undefined && v !== null;

/** The preset whose keys the style has exactly, with no other typographic key set. */
export function matchPreset(style: Style): TextPreset | undefined {
  const s = style ?? {};
  const fits = (p: TextPreset) =>
    Object.entries(p.style).every(([k, v]) => s[k] === v) &&
    TYPO_KEYS.every((k) => k in p.style || !isSet(s[k]));
  // Body sets nothing, so it is the last resort.
  return TEXT_PRESETS.find((p) => p.id !== 'body' && fits(p)) ?? (fits(TEXT_PRESETS[3]) ? TEXT_PRESETS[3] : undefined);
}

/**
 * The style patch that applies a preset: its own keys, and null for every
 * typographic key it leaves out, and for the keys of the preset in use before
 * (so going from Quote to Title drops the quote's border). Keys already unset
 * are left out of the patch.
 */
export function presetPatch(preset: TextPreset, style: Style): Record<string, Json> {
  const s = style ?? {};
  const patch: Record<string, Json> = {};
  const was = matchPreset(style);
  const clear = new Set<string>([...TYPO_KEYS, ...Object.keys(was?.style ?? {})]);
  for (const k of clear) if (isSet(s[k]) && !(k in preset.style)) patch[k] = null;
  for (const [k, v] of Object.entries(preset.style)) if (s[k] !== v) patch[k] = v;
  return patch;
}

export const SIZE_SCALE = [12, 13, 15, 18, 22, 28, 36, 48];

export const WEIGHTS: { value: number | null; label: string }[] = [
  { value: 300, label: 'Light' },
  { value: null, label: 'Regular' },
  { value: 500, label: 'Medium' },
  { value: 600, label: 'Semibold' },
  { value: 700, label: 'Bold' },
  { value: 850, label: 'Black' },
];

// ── tables ──

/** A table's look props and the value each has when unset. */
export const LOOK_DEFAULTS: Record<string, Json> = { borders: 'rows', header: 'plain', stripes: false, density: 'normal' };

export interface TableLook {
  id: string;
  label: string;
  props: Record<string, Json>;
}

export const TABLE_LOOKS: TableLook[] = [
  { id: 'simple', label: 'Simple', props: { borders: 'rows', header: 'plain', stripes: false, density: 'normal' } },
  { id: 'striped', label: 'Striped', props: { borders: 'rows', header: 'filled', stripes: true, density: 'normal' } },
  { id: 'grid', label: 'Grid', props: { borders: 'grid', header: 'filled', stripes: false, density: 'normal' } },
  { id: 'compact', label: 'Compact', props: { borders: 'rows', header: 'plain', stripes: false, density: 'compact' } },
  { id: 'bold', label: 'Bold header', props: { borders: 'rows', header: 'strong', stripes: false, density: 'normal' } },
  { id: 'clean', label: 'Clean', props: { borders: 'none', header: 'plain', stripes: false, density: 'normal' } },
];

/** What a look prop is on this cell, its default filled in. */
export const lookValue = (cell: Cell, k: string): Json => ((cell as unknown as Record<string, Json>)[k] ?? LOOK_DEFAULTS[k]);

export const matchLook = (cell: Cell): TableLook | undefined =>
  TABLE_LOOKS.find((l) => Object.entries(l.props).every(([k, v]) => lookValue(cell, k) === v));

/** The ops that give a table a look, in one step; defaults are written as removals. */
export function lookOps(cell: Cell, look: TableLook): Op[] {
  const ops: Op[] = [];
  for (const [k, v] of Object.entries(look.props)) {
    const next = v === LOOK_DEFAULTS[k] ? null : v;
    const cur = (cell as unknown as Record<string, Json>)[k] ?? null;
    if (cur !== next) ops.push(['set', cell.id, k, next]);
  }
  return ops;
}
