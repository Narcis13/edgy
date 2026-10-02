// A data cell: a value readers never see. Its type and an editor for each,
// and how formulas and buttons use it.

import { useEffect, useState, useRef } from 'react';
import type { Json } from '../../../../core/types';
import { NumberField, TextField } from '../../fields';
import { cx } from '../../ctx';
import { Chips, Hint, Prop, Toggle, stop } from '../controls';
import { type DataType, convertData, dataType, linesToList, listToLines, parseJson, plainList, setExample } from '../sections';
import { FormulaHint } from './PanelList';
import type { KindProps } from './types';

const TYPES: { value: DataType; label: string }[] = [
  { value: 'number', label: 'Number' }, { value: 'text', label: 'Text' }, { value: 'bool', label: 'Yes/no' },
  { value: 'list', label: 'List' }, { value: 'record', label: 'Record' },
];

export function DataPanel({ e }: KindProps) {
  const c = e.cell;
  const v = c.value;
  const type = dataType(v);
  const [json, setJson] = useState(false);
  useEffect(() => setJson(false), [c.id]);
  const put = (x: Json) => e.set('value', x);
  return (
    <>
      <Prop label="Kind of value">
        <Chips label="Kind of value" cols={3} value={type ?? undefined} onChange={(t) => put(convertData(v, t))} options={TYPES} />
      </Prop>
      {type === null && <Hint>Empty for now. Pick a kind of value to start.</Hint>}
      {type === 'number' && (
        <Prop label="Value">
          <NumberField value={v as number} label="Value" onCommit={(n) => put(n ?? 0)} />
        </Prop>
      )}
      {type === 'text' && (
        <Prop label="Value">
          <TextField value={v as string} label="Value" multiline placeholder="Some text" onCommit={put} />
        </Prop>
      )}
      {type === 'bool' && <Toggle on={v === true} onChange={put}>{v ? 'Yes (true)' : 'No (false)'}</Toggle>}
      {type === 'list' && (plainList(v) && !json ? (
        <Prop label="Items" hint="One item per line. Numbers stay numbers." aside={<button type="button" className="ins-reset" onClick={() => setJson(true)}>Edit as JSON</button>}>
          <LinesField value={v} onCommit={put} />
        </Prop>
      ) : (
        <Prop label="Items, as JSON" aside={plainList(v) ? <button type="button" className="ins-reset" onClick={() => setJson(false)}>One per line</button> : undefined}>
          <JsonField value={v as Json} want="list" onCommit={put} />
        </Prop>
      ))}
      {type === 'record' && (
        <Prop label="Fields, as JSON" hint='Names in quotes, then a colon and the value: {"vat": 0.2, "region": "North"}.'>
          <JsonField value={v as Json} want="record" onCommit={put} />
        </Prop>
      )}
      <Hint>Readers never see this cell, and it takes no space on the page.</Hint>
      <FormulaHint e={e} what="this value" example={(n) => (type === 'number' ? `(* ${n} 2)` : type === 'list' ? `(len ${n})` : type === 'record' ? `(get ${n} "${Object.keys(v as object)[0] ?? 'key'}")` : n)}
        change={(n) => setExample(n, v)} />
    </>
  );
}

function LinesField({ value, onCommit }: { value: (string | number | boolean)[]; onCommit: (v: Json) => void }) {
  const source = listToLines(value);
  const [text, setText] = useState(source);
  const [focused, setFocused] = useState(false);
  const cancelled = useRef(false);
  useEffect(() => {
    if (!focused) setText(source);
  }, [source, focused]);
  return (
    <textarea className="text-field ins-code-area" rows={Math.min(8, Math.max(3, value.length + 1))} value={text} aria-label="Items, one per line" spellCheck={false}
      onFocus={() => setFocused(true)}
      onChange={(ev) => setText(ev.target.value)}
      onBlur={() => {
        setFocused(false);
        // Escape blurs before React has put the old text back, so it says not to save.
        if (cancelled.current) cancelled.current = false;
        else if (text !== source) onCommit(linesToList(text));
      }}
      onKeyDown={(ev) => {
        stop(ev);
        if (ev.key === 'Escape') {
          cancelled.current = true;
          setText(source);
          ev.currentTarget.blur();
        }
        if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) ev.currentTarget.blur();
      }} />
  );
}

/** JSON in a box: saved when it reads; otherwise it stays, with what is wrong under it. */
function JsonField({ value, want, onCommit }: { value: Json; want: 'list' | 'record'; onCommit: (v: Json) => void }) {
  const source = JSON.stringify(value, null, 2);
  const [text, setText] = useState(source);
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);
  useEffect(() => {
    if (!focused && !error) setText(source);
  }, [source, focused, error]);
  const save = () => {
    const r = parseJson(text, want);
    if ('error' in r) return setError(r.error);
    setError(null);
    if (JSON.stringify(r.value) !== JSON.stringify(value)) onCommit(r.value);
  };
  return (
    <>
      <textarea className={cx('text-field mono ins-code-area', error && 'is-invalid')} rows={Math.min(10, Math.max(3, source.split('\n').length))} value={text}
        aria-label={want === 'list' ? 'Items, as JSON' : 'Fields, as JSON'} aria-invalid={!!error} spellCheck={false}
        onFocus={() => setFocused(true)}
        onChange={(ev) => setText(ev.target.value)}
        onBlur={() => {
          setFocused(false);
          if (cancelled.current) cancelled.current = false;
          else save();
        }}
        onKeyDown={(ev) => {
          stop(ev);
          if (ev.key === 'Escape') {
            cancelled.current = true;
            setText(source);
            setError(null);
            ev.currentTarget.blur();
          }
          if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) ev.currentTarget.blur();
        }} />
      {error ? (
        <div className="ins-warn" role="alert">
          <p className="ins-hint">{error} Nothing was saved yet.</p>
          <button type="button" className="btn ghost small" onClick={() => { setText(source); setError(null); }}>Put back what was saved</button>
        </div>
      ) : <Hint>Saved when you leave the box.</Hint>}
    </>
  );
}
