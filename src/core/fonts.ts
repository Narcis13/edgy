// The typefaces a cell or a document can use. All are self-hosted (see
// src/web/fonts.ts), so documents look the same offline and on paper.

export interface FontDef {
  /** What `style.font` and `meta.font` hold. */
  id: string;
  label: string;
  group: 'Sans' | 'Serif' | 'Display' | 'Mono' | 'Handwriting';
  /** The CSS font-family stack. */
  family: string;
  /** Extra variation settings the face needs (Recursive's mono axis). */
  variation?: string;
}

const SANS = 'ui-sans-serif, system-ui, sans-serif';
const SERIF = "Georgia, 'Times New Roman', serif";
const MONO = 'ui-monospace, Menlo, monospace';

export const FONTS: FontDef[] = [
  { id: 'sans', label: 'Recursive', group: 'Sans', family: `'Recursive Variable', ${SANS}` },
  { id: 'inter', label: 'Inter', group: 'Sans', family: `'Inter Variable', ${SANS}` },
  { id: 'manrope', label: 'Manrope', group: 'Sans', family: `'Manrope Variable', ${SANS}` },
  { id: 'grotesk', label: 'Space Grotesk', group: 'Sans', family: `'Space Grotesk Variable', ${SANS}` },
  { id: 'serif', label: 'Newsreader', group: 'Serif', family: `'Newsreader Variable', ${SERIF}` },
  { id: 'lora', label: 'Lora', group: 'Serif', family: `'Lora Variable', ${SERIF}` },
  { id: 'source-serif', label: 'Source Serif', group: 'Serif', family: `'Source Serif 4 Variable', ${SERIF}` },
  { id: 'fraunces', label: 'Fraunces', group: 'Display', family: `'Fraunces Variable', ${SERIF}` },
  { id: 'playfair', label: 'Playfair Display', group: 'Display', family: `'Playfair Display Variable', ${SERIF}` },
  { id: 'mono', label: 'Recursive Mono', group: 'Mono', family: `'Recursive Variable', ${MONO}`, variation: '"MONO" 1' },
  { id: 'jetbrains', label: 'JetBrains Mono', group: 'Mono', family: `'JetBrains Mono Variable', ${MONO}` },
  { id: 'caveat', label: 'Caveat', group: 'Handwriting', family: `'Caveat Variable', cursive` },
];

export const FONT_IDS = FONTS.map((f) => f.id);

export const fontById = (id: unknown): FontDef | undefined => (typeof id === 'string' ? FONTS.find((f) => f.id === id) : undefined);
