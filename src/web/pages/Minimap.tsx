// A document's shape at a glance: its cells as tiny blocks.

import type { Cell, Json } from '../../core/types';
import { flowOf } from '../../core/types';
import { build } from '../../core/notation';
import { isOpen, openSections, openTab, panelTitles } from '../../core/containers';
import { flexOf } from '../editor/look';
import type { Shape } from '../../core/library';

function fromNotation(n: Json): Cell | null {
  try {
    let i = 0;
    return build(n, { gen: () => `m${i++}`, used: new Set(), names: new Set() });
  } catch {
    return null;
  }
}

function Block({ cell, dir }: { cell: Cell; dir: 'row' | 'col' | null }) {
  const style = dir ? flexOf(cell.size === 'hug' ? 'hug' : typeof cell.size === 'string' ? undefined : cell.size) : undefined;
  // A data cell or a timer takes no room on the page.
  if (cell.kind === 'data' || cell.kind === 'timer') return null;
  if (cell.children) {
    const titles = cell.kind === 'tabs' || cell.kind === 'accordion' ? panelTitles(cell) : [];
    const open = cell.kind === 'tabs' ? [openTab(cell)] : cell.kind === 'accordion' ? openSections(cell) : [];
    const kids = cell.children.map((c, i) => ({ c, open: open.includes(titles[i]) }));
    return (
      <div className={`mm-group ${cell.kind}`} style={style}>
        {cell.kind === 'tabs' && (
          <>
            <div className="mm-tabbar">{kids.map(({ c, open: on }) => <span key={c.id} className={on ? 'is-on' : undefined} />)}</div>
            {kids.filter((k) => k.open).map(({ c }) => <Block key={c.id} cell={c} dir={null} />)}
          </>
        )}
        {cell.kind === 'accordion' && kids.map(({ c, open: on }) => (
          <div key={c.id} className={`mm-section${on ? ' is-open' : ''}`}>
            <div className="mm-head" />
            {on && <Block cell={c} dir={null} />}
          </div>
        ))}
        {cell.kind === 'collapsible' && <div className="mm-head" />}
        {cell.kind !== 'tabs' && cell.kind !== 'accordion' && (cell.kind !== 'collapsible' || isOpen(cell)) &&
          cell.children.map((c) => <Block key={c.id} cell={c} dir={flowOf(cell)} />)}
      </div>
    );
  }
  // A fetch is one status line in Live: a thin tinted strip.
  if (cell.kind === 'fetch') return <div className="mm-leaf fetch" style={{ ...style, maxHeight: 6, background: 'color-mix(in srgb, var(--live) 24%, var(--paper))' }} />;
  return <div className={`mm-leaf ${cell.kind}`} style={style} />;
}

const GROUP = new Set(['row', 'col', 'panel', 'collapsible', 'tabs', 'accordion']);

/** The same picture from a shape (see core/library), which is all the document list carries. */
function ShapeBlock({ s, dir }: { s: Shape; dir: 'row' | 'col' | null }) {
  const style = dir ? flexOf(s.s === 'hug' ? 'hug' : s.s) : undefined;
  if (s.k === 'data' || s.k === 'timer') return null;
  if (GROUP.has(s.k)) {
    const kids = s.c ?? [];
    const open = (i: number) => (Array.isArray(s.o) ? s.o.includes(i) : true);
    const flow = s.k === 'row' ? 'row' : 'col';
    return (
      <div className={`mm-group ${s.k}`} style={style}>
        {s.k === 'tabs' && (
          <>
            <div className="mm-tabbar">{kids.map((_, i) => <span key={i} className={open(i) ? 'is-on' : undefined} />)}</div>
            {kids.map((c, i) => open(i) && <ShapeBlock key={i} s={c} dir={null} />)}
          </>
        )}
        {s.k === 'accordion' && kids.map((c, i) => (
          <div key={i} className={`mm-section${open(i) ? ' is-open' : ''}`}>
            <div className="mm-head" />
            {open(i) && <ShapeBlock s={c} dir={null} />}
          </div>
        ))}
        {s.k === 'collapsible' && <div className="mm-head" />}
        {s.k !== 'tabs' && s.k !== 'accordion' && (s.k !== 'collapsible' || s.o !== false) &&
          kids.map((c, i) => <ShapeBlock key={i} s={c} dir={flow} />)}
      </div>
    );
  }
  if (s.k === 'fetch') return <div className="mm-leaf fetch" style={{ ...style, maxHeight: 6, background: 'color-mix(in srgb, var(--live) 24%, var(--paper))' }} />;
  return <div className={`mm-leaf ${s.k}`} style={style} />;
}

export function Minimap({ root, notation, shape }: { root?: Cell; notation?: Json; shape?: Shape }) {
  if (shape) {
    return (
      <div className="minimap" aria-hidden>
        <ShapeBlock s={shape} dir={null} />
      </div>
    );
  }
  const cell = root ?? (notation !== undefined ? fromNotation(notation) : null);
  if (!cell) return <div className="minimap" />;
  return (
    <div className="minimap" aria-hidden>
      <Block cell={cell} dir={null} />
    </div>
  );
}
