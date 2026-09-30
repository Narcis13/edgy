// Small form pieces shared by the formula bar, the inspector and in-cell editing.

import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import type { Sx } from '../../core/types';
import { deepEqual, print, read, show } from '../../core/sx';
import { evalIn, plainValue } from '../../core/engine';
import { cx, useSession } from './ctx';

const grow = (el: HTMLTextAreaElement | null) => {
  if (!el) return;
  el.style.height = '0';
  el.style.height = el.scrollHeight + 'px';
};

interface SxFieldProps {
  value: Sx | undefined;
  onCommit: (x: Sx) => void;
  onDone?: () => void;
  /** The cell the expression belongs to, for previews and relative references. */
  cell?: string;
  placeholder?: string;
  autoFocus?: boolean;
  preview?: boolean;
  className?: string;
  label?: string;
  /** Line width before the printer wraps. */
  width?: number;
}

/** An expression editor in Lisp syntax. While focused, clicking a cell inserts its name. */
export function SxField({ value, onCommit, onDone, cell, placeholder, autoFocus, preview, className, label, width }: SxFieldProps) {
  const session = useSession();
  const source = value === undefined || value === null ? '' : print(value, width ?? 56);
  const [text, setText] = useState(source);
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const skip = useRef(false);

  useEffect(() => {
    if (!focused) {
      setText(source);
      setError(null);
    }
  }, [source, focused]);
  useEffect(() => grow(ref.current), [text]);
  useEffect(() => {
    if (autoFocus && ref.current) {
      ref.current.focus();
      ref.current.setSelectionRange(ref.current.value.length, ref.current.value.length);
    }
  }, [autoFocus]);

  const result = useMemo(() => {
    if (!preview || !focused || !text.trim()) return null;
    const s = session.state;
    if (!s.doc) return null;
    try {
      const r = evalIn(s.doc, { rows: (n) => s.collections[n] ?? [], now: s.now }, read(text), cell);
      return r.error ? { error: r.error } : { value: show(plainValue(r.value)) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [preview, focused, text, cell, session]);

  const commit = (): boolean => {
    try {
      const x = read(text);
      setError(null);
      if (!deepEqual(x, value ?? null)) onCommit(x);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  };

  const insert = (name: string) => {
    const el = ref.current;
    if (!el) return;
    const before = el.value.slice(0, el.selectionStart);
    const pad = before && !/[\s(]$/.test(before) ? ' ' : '';
    el.setRangeText(pad + name, el.selectionStart, el.selectionEnd, 'end');
    setText(el.value);
  };

  return (
    <div className={cx('sx-field', className, error && 'has-error')}>
      <textarea
        ref={ref}
        rows={1}
        value={text}
        aria-label={label ?? 'Formula'}
        placeholder={placeholder}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        onChange={(e) => setText(e.target.value)}
        onFocus={() => {
          setFocused(true);
          session.pick = insert;
        }}
        onBlur={() => {
          if (session.pick === insert) session.pick = null;
          setFocused(false);
          if (skip.current) skip.current = false;
          else commit();
          onDone?.();
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (commit()) {
              skip.current = true;
              e.currentTarget.blur();
            }
          } else if (e.key === 'Escape') {
            e.preventDefault();
            skip.current = true;
            setText(source);
            setError(null);
            e.currentTarget.blur();
          }
        }}
      />
      {error && <p className="field-error">{error}</p>}
      {!error && result && (
        <p className={cx('sx-preview', result.error && 'is-error')}>{result.error ? result.error : `= ${result.value}`}</p>
      )}
    </div>
  );
}

interface TextFieldProps {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  label?: string;
  mono?: boolean;
}

/** Plain text that saves when you leave the field or press Enter. */
export function TextField({ value, onCommit, placeholder, multiline, label, mono }: TextFieldProps) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!focused) setText(value);
  }, [value, focused]);
  useEffect(() => grow(ref.current), [text]);
  const done = () => {
    setFocused(false);
    if (text !== value) onCommit(text);
  };
  const common = {
    value: text,
    placeholder,
    'aria-label': label,
    className: cx('text-field', mono && 'mono'),
    onFocus: () => setFocused(true),
    onBlur: done,
  };
  return multiline ? (
    <textarea
      ref={ref} rows={1} {...common}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) e.currentTarget.blur();
      }}
    />
  ) : (
    <input
      type="text" {...common}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
      }}
    />
  );
}

export function NumberField({ value, onCommit, min, max, step, label, placeholder }: {
  value: number | null; onCommit: (v: number | null) => void; min?: number; max?: number; step?: number; label?: string; placeholder?: string;
}) {
  const [text, setText] = useState(value == null ? '' : String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(value == null ? '' : String(value));
  }, [value, focused]);
  return (
    <input
      type="number" className="text-field" value={text} min={min} max={max} step={step} aria-label={label} placeholder={placeholder}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        setText(e.target.value);
        const n = e.target.value === '' ? null : Number(e.target.value);
        if (n === null || !Number.isNaN(n)) onCommit(n);
      }}
      onBlur={() => setFocused(false)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
      }}
    />
  );
}

export function Seg<T extends string>({ value, options, onChange, label }: {
  value: T | undefined; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className={cx(value === o.value && 'is-on')} aria-pressed={value === o.value} title={o.title} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Row({ label, children, stack }: { label: string; children: ReactNode; stack?: boolean }) {
  return (
    <label className={cx('prop', stack && 'is-stack')}>
      <span className="prop-label">{label}</span>
      <span className="prop-control">{children}</span>
    </label>
  );
}
