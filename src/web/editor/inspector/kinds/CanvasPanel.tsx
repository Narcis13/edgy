// A drawing surface: a signature line, the paper, the pen's colour, and the strokes so far.

import { TextField } from '../../fields';
import { Prop, STRONG_TOKENS, Swatches, Tiles, Toggle, colorName } from '../controls';
import type { KindProps } from './types';

const PAPERS = ['plain', 'lines', 'grid', 'dots'].map((p) => ({
  value: p,
  label: p[0].toUpperCase() + p.slice(1),
  art: <span className={`ins-paper ins-paper-${p}`} />,
}));

export function CanvasPanel({ e }: KindProps) {
  const c = e.cell;
  const strokes = Array.isArray(c.value) ? c.value.length : 0;
  const signing = c.label !== undefined;
  return (
    <>
      <Toggle on={signing} onChange={(on) => e.set('label', on ? 'Sign here' : null)} hint="A line with words under it, for a signature.">Signature line</Toggle>
      {signing && (
        <Prop label="Words under the line">
          <TextField value={c.label ?? ''} label="Words under the line" placeholder="Sign here" onCommit={(v) => e.set('label', v || 'Sign here')} />
        </Prop>
      )}
      <Prop label="Paper">
        <Tiles label="Paper" cols={4} value={c.paper ?? 'plain'} onChange={(v) => e.set('paper', v === 'plain' ? null : v)} options={PAPERS} />
      </Prop>
      <Prop label="Pen colour" aside={c.color ? <span className="ins-value">{colorName(c.color)}</span> : undefined} onReset={c.color ? () => e.set('color', null) : undefined}>
        <Swatches value={c.color} label="Pen colour" tokens={STRONG_TOKENS.filter((t) => t !== 'ink')} noneLabel="Ink" onChange={(v) => e.set('color', v)} />
      </Prop>
      <Prop label="Drawn so far" inline>
        <span className="ins-count">{strokes ? `${strokes} ${strokes === 1 ? 'stroke' : 'strokes'}` : 'Nothing yet'}</span>
        <button type="button" className="btn ghost small" disabled={!strokes} onClick={() => e.set('value', null)}>Clear</button>
      </Prop>
    </>
  );
}
