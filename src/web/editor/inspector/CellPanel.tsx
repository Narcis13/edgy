// Everything about the selected cell: what it is, its name, then folding
// sections from its content to its look.

import { useState } from 'react';
import { ChevronRight, Columns2, PanelTopOpen, Rows2 } from 'lucide-react';
import type { Cell } from '../../../core/types';
import { isContainer, isGroup } from '../../../core/types';
import { containerValue, panelTitles } from '../../../core/containers';
import { describeDiagram, elementsOf } from '../../../core/diagram';
import { show } from '../../../core/sx';
import { plainValue } from '../../../core/engine';
import { SxField, TextField } from '../fields';
import { KIND_LABEL, cx, useS, useSession } from '../ctx';
import { kindOption } from '../KindMenu';
import { KIND_ABOUT } from './about';
import { BoxSection, SpacingSection } from './BoxSections';
import { Chips, Hint, Prop } from './controls';
import { type Edit, useEdit } from './edit';
import { Content } from './kinds/Content';
import { EventsSection } from './EventsSection';
import { Section } from './Section';
import { Source } from './Source';
import { TextSection } from './TextSection';

/** Kinds whose text settings change nothing. */
const NO_TEXT = new Set(['break', 'image', 'canvas', 'diagram', 'data', 'timer', 'fetch']);
/** Kinds that take no room on the page, so spacing and a box mean nothing. */
const NO_BOX = new Set(['break', 'data', 'timer']);

/** The heading: the kind, and for groups how many they hold. */
function titleOf(cell: Cell, parent: Cell | null, label: string | undefined): string {
  const n = cell.children?.length ?? 0;
  if (cell.kind === 'row' || cell.kind === 'col') return `${KIND_LABEL[cell.kind]} of ${n}`;
  if (cell.kind === 'tabs') return `Tabs, ${n} ${n === 1 ? 'tab' : 'tabs'}`;
  if (cell.kind === 'accordion') return `Accordion, ${n} ${n === 1 ? 'section' : 'sections'}`;
  if (cell.kind === 'panel' && parent) {
    const i = parent.children?.findIndex((k) => k.id === cell.id) ?? -1;
    return `${parent.kind === 'tabs' ? 'Tab' : 'Section'}: ${panelTitles(parent)[i] ?? ''}`;
  }
  return label ?? KIND_LABEL[cell.kind] ?? cell.kind;
}

/** What a container holds right now, in words. */
function stateOf(cell: Cell): string {
  const value = containerValue(cell);
  if (cell.kind === 'collapsible') return value === false ? 'Folded' : 'Open';
  if (cell.kind === 'tabs') return typeof value === 'string' ? `Showing “${value}”` : '—';
  const open = Array.isArray(value) ? value.map(String) : [];
  return open.length ? `Open: ${open.join(', ')}` : 'All closed';
}

export function CellPanel({ cell, ids }: { cell: Cell; ids: string[] }) {
  const session = useSession();
  const st = useS((s) => s.computed?.cells[cell.id]);
  const feeds = useS((s) => s.computed?.feeds[cell.id]);
  const parent = session.parent(cell.id);
  const e = useEdit(cell, ids);
  const group = isGroup(cell);
  const multi = ids.length > 1;
  const opt = cell.kind !== 'row' && cell.kind !== 'col' && cell.kind !== 'panel' ? kindOption(cell.kind, cell.type) : undefined;
  const Icon = opt?.icon ?? (cell.kind === 'row' ? Columns2 : cell.kind === 'panel' ? PanelTopOpen : Rows2);
  const crumbs: Cell[] = [];
  for (let p = parent; p; p = session.parent(p.id)) crumbs.unshift(p);

  return (
    <>
      <div className="crumbs">
        {crumbs.map((c) => (
          <button key={c.id} onClick={() => session.select(c.id)}>{c.name ?? ((c.kind === 'panel' && c.title) || KIND_LABEL[c.kind])}<ChevronRight size={12} /></button>
        ))}
        <span>{cell.name ?? cell.id}</span>
      </div>
      <h2 className="panel-title">
        <Icon size={16} strokeWidth={1.75} aria-hidden />
        {multi ? `${ids.length} cells` : titleOf(cell, parent, opt?.label)}
        <code className="id">{cell.id}</code>
      </h2>
      <p className="ins-about">{multi ? 'Changes to text, spacing and the box apply to every selected cell.' : KIND_ABOUT[cell.kind]}</p>

      {!multi && (
        <Prop label="Name" hint="Name it to use it in formulas.">
          <TextField value={cell.name ?? ''} placeholder="e.g. total" label="Name" mono onCommit={(v) => e.set('name', v.trim() || null)} />
        </Prop>
      )}

      <div className="ins-secs">
        <Section name="content" title={multi ? 'Selected cells' : 'Content'} open>
          {multi ? <Picked ids={ids} /> : <Content e={e} st={st} />}
        </Section>
        {!NO_TEXT.has(cell.kind) && <TextSection e={e} open={cell.kind === 'text'} />}
        {!NO_BOX.has(cell.kind) && (
          <>
            <SpacingSection e={e} parent={parent} group={group} />
            <BoxSection e={e} />
          </>
        )}
        {!multi && cell.kind !== 'data' && cell.kind !== 'timer' && <Visibility e={e} />}
        {!multi && <EventsSection cell={cell} />}
      </div>

      {!multi && (st?.reads?.length || feeds?.length) ? (
        <>
          <h3 className="panel-h">Links</h3>
          {!!st?.reads?.length && <LinkList label="Reads" ids={st.reads} />}
          {!!feeds?.length && <LinkList label="Feeds" ids={feeds} />}
        </>
      ) : null}

      {(!group || isContainer(cell)) && !multi && (
        <>
          <h3 className="panel-h">Value</h3>
          <p className={cx('value-preview', st?.error && 'is-error')}>{st?.error ? st.error : valueText(cell, st?.value)}</p>
        </>
      )}

      {!multi && <Source cell={cell} />}
    </>
  );
}

function valueText(cell: Cell, v: unknown): string {
  if (cell.kind === 'canvas') return strokeCount(v);
  if (cell.kind === 'diagram') return elementsOf(v).length ? describeDiagram(elementsOf(v)) : 'Nothing drawn yet';
  if (isContainer(cell)) return stateOf(cell);
  return show(plainValue(v)) || '—';
}

const strokeCount = (v: unknown) => {
  const n = Array.isArray(v) ? v.length : 0;
  return n ? `${n} ${n === 1 ? 'stroke' : 'strokes'}` : 'Nothing drawn yet';
};

function Picked({ ids }: { ids: string[] }) {
  const session = useSession();
  return (
    <>
      <div className="ins-picked">
        {ids.map((id) => {
          const c = session.cell(id);
          return c ? <button key={id} type="button" className="chip" onClick={() => session.select(id)}>{c.name ?? `${KIND_LABEL[c.kind]} ${id}`}</button> : null;
        })}
      </div>
      <Hint>Click one to see only it.</Hint>
    </>
  );
}

function Visibility({ e }: { e: Edit }) {
  const h = e.cell.hidden;
  const mode = h === true ? 'hidden' : h == null || h === false ? 'always' : 'when';
  const [asking, setAsking] = useState(false);
  const shown = asking && mode === 'always' ? 'when' : mode;
  const summary = shown === 'hidden' ? 'Hidden' : shown === 'when' ? 'Depends on a formula' : 'Always';
  return (
    <Section name="visibility" title="Show only when" summary={summary}>
      <Prop label="Show this cell">
        <Chips label="Show this cell" value={shown} onChange={(v) => {
          setAsking(v === 'when');
          if (v === 'always' || (v === 'when' && mode === 'hidden')) e.set('hidden', null);
          if (v === 'hidden') e.set('hidden', true);
        }} options={[{ value: 'always', label: 'Always' }, { value: 'hidden', label: 'Never' }, { value: 'when', label: 'Depends…' }]} />
      </Prop>
      {shown === 'hidden' && <Hint>Hidden while people use the document; still here while you edit.</Hint>}
      {shown === 'when' && (
        <Prop label="Hide it when" hint="It hides while this is true, e.g. (= total 0).">
          <SxField prop="hidden" value={mode === 'when' ? h : undefined} cell={e.cell.id} label="Hide it when" placeholder="(= total 0)" onCommit={(x) => e.set('hidden', x === false ? null : x)} />
        </Prop>
      )}
    </Section>
  );
}

function LinkList({ label, ids }: { label: string; ids: string[] }) {
  const session = useSession();
  return (
    <div className="link-list">
      <span className="prop-label">{label}</span>
      <div>
        {ids.map((id) => {
          const c = session.cell(id);
          return c ? <button key={id} className="chip" onClick={() => session.select(id)}>{c.name ?? id}</button> : null;
        })}
      </div>
    </div>
  );
}
