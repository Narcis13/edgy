// Everything about the selected cell: what it is, its name, then folding
// sections from its content to its look.

import { useState } from 'react';
import { ChevronRight, Columns2, Rows2 } from 'lucide-react';
import type { Cell } from '../../../core/types';
import { isGroup } from '../../../core/types';
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
import { Section } from './Section';
import { Source } from './Source';
import { TextSection } from './TextSection';

/** Kinds whose text settings change nothing. */
const NO_TEXT = new Set(['break', 'image', 'canvas']);

export function CellPanel({ cell, ids }: { cell: Cell; ids: string[] }) {
  const session = useSession();
  const st = useS((s) => s.computed?.cells[cell.id]);
  const feeds = useS((s) => s.computed?.feeds[cell.id]);
  const parent = session.parent(cell.id);
  const e = useEdit(cell, ids);
  const group = isGroup(cell);
  const multi = ids.length > 1;
  const opt = !group ? kindOption(cell.kind, cell.type) : undefined;
  const Icon = opt?.icon ?? (cell.kind === 'row' ? Columns2 : Rows2);
  const crumbs: Cell[] = [];
  for (let p = parent; p; p = session.parent(p.id)) crumbs.unshift(p);

  return (
    <>
      <div className="crumbs">
        {crumbs.map((c) => (
          <button key={c.id} onClick={() => session.select(c.id)}>{c.name ?? KIND_LABEL[c.kind]}<ChevronRight size={12} /></button>
        ))}
        <span>{cell.name ?? cell.id}</span>
      </div>
      <h2 className="panel-title">
        <Icon size={16} strokeWidth={1.75} aria-hidden />
        {multi ? `${ids.length} cells` : opt?.label ?? `${KIND_LABEL[cell.kind]} of ${cell.children?.length ?? 0}`}
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
        {cell.kind !== 'break' && (
          <>
            <SpacingSection e={e} parent={parent} group={group} />
            <BoxSection e={e} />
          </>
        )}
        {!multi && <Visibility e={e} />}
      </div>

      {!multi && (st?.reads?.length || feeds?.length) ? (
        <>
          <h3 className="panel-h">Links</h3>
          {!!st?.reads?.length && <LinkList label="Reads" ids={st.reads} />}
          {!!feeds?.length && <LinkList label="Feeds" ids={feeds} />}
        </>
      ) : null}

      {!group && !multi && (
        <>
          <h3 className="panel-h">Value</h3>
          <p className={cx('value-preview', st?.error && 'is-error')}>{st?.error ? st.error : cell.kind === 'canvas' ? strokeCount(st?.value) : show(plainValue(st?.value)) || '—'}</p>
        </>
      )}

      {!multi && <Source cell={cell} />}
    </>
  );
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
