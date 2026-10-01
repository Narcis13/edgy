// No cell selected: the document itself — its page, its type, its printing.

import type { Json } from '../../../core/types';
import { FONTS, fontById } from '../../../core/fonts';
import { NumberField, TextField } from '../fields';
import { useS, useSession } from '../ctx';
import { PageSetup } from '../../print/PageSetup';
import { FontPicker, Prop } from './controls';
import { num } from './edit';
import { Section } from './Section';

export function DocPanel() {
  const session = useSession();
  const meta = useS((s) => s.doc!.meta);
  const set = (k: string, v: Json) => session.dispatch(['meta', k, v], { transition: false });
  const body = fontById(meta.font);
  return (
    <>
      <h2 className="panel-title">Document</h2>
      <p className="ins-about">Select a cell to see what it holds. This is the sheet itself.</p>
      <div className="ins-secs">
        <Section name="doc-page" title="Page" open>
          <Prop label="Title">
            <TextField value={meta.title} label="Title" onCommit={(v) => set('title', v.trim() || 'Untitled')} />
          </Prop>
          <div className="ins-pair">
            <Prop label="Width" onReset={meta.width != null ? () => set('width', null) : undefined}>
              <NumberField value={num(meta.width)} placeholder="880" min={320} max={2400} step={20} label="Width in pixels" onCommit={(v) => set('width', v)} />
            </Prop>
            <Prop label="Least height" onReset={meta.minHeight != null ? () => set('minHeight', null) : undefined}>
              <NumberField value={num(meta.minHeight)} placeholder="560" min={0} step={40} label="Least height in pixels" onCommit={(v) => set('minHeight', v)} />
            </Prop>
          </div>
          <div className="ins-pair">
            <Prop label="Margin" onReset={meta.pad != null ? () => set('pad', null) : undefined}>
              <NumberField value={num(meta.pad)} placeholder="28" min={0} max={200} label="Margin in pixels" onCommit={(v) => set('pad', v)} />
            </Prop>
            <Prop label="Currency">
              <TextField value={typeof meta.currency === 'string' ? meta.currency : ''} placeholder="USD" label="Currency" onCommit={(v) => set('currency', v.trim().toUpperCase() || null)} />
            </Prop>
          </div>
        </Section>
        <Section name="doc-type" title="Typography" open summary={body?.label}>
          <Prop label="Text font" onReset={meta.font != null ? () => set('font', null) : undefined}>
            <FontPicker value={meta.font} label="Text font" defaultLabel="Recursive (default)" defaultFont={FONTS[0]} onChange={(id) => set('font', id)} />
          </Prop>
          <Prop label="Heading font" hint="For # headings and title styles." onReset={meta.headFont != null ? () => set('headFont', null) : undefined}>
            <FontPicker value={meta.headFont} label="Heading font" defaultLabel="Same as the text" defaultFont={body ?? FONTS[0]} onChange={(id) => set('headFont', id)} />
          </Prop>
          <Prop label="Base text size" inline onReset={meta.fontSize != null ? () => set('fontSize', null) : undefined}>
            <NumberField value={num(meta.fontSize)} placeholder="15" min={10} max={24} label="Base text size in pixels" onCommit={(v) => set('fontSize', v)} />
            <span className="ins-unit">px</span>
          </Prop>
        </Section>
        <Section name="doc-print" title="Printing" open>
          <PageSetup />
          <button className="btn soft" onClick={() => session.setMode('page')}>See the pages</button>
        </Section>
      </div>
    </>
  );
}
