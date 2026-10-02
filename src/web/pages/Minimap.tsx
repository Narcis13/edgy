// A document's shape at a glance: its cells as tiny blocks.

import type { Cell, Json } from '../../core/types';
import { flowOf } from '../../core/types';
import { build } from '../../core/notation';
import { isOpen, openSections, openTab, panelTitles } from '../../core/containers';
import { flexOf } from '../editor/look';

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

export function Minimap({ root, notation }: { root?: Cell; notation?: Json }) {
  const cell = root ?? (notation !== undefined ? fromNotation(notation) : null);
  if (!cell) return <div className="minimap" />;
  return (
    <div className="minimap" aria-hidden>
      <Block cell={cell} dir={null} />
    </div>
  );
}
