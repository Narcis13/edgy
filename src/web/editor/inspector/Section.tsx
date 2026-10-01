// A part of the inspector that folds away. Whether it is open is remembered
// per section name, across cells and visits.

import { type ReactNode, useId, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cx } from '../ctx';

const KEY = 'edgy.inspector.open.';

function remembered(name: string): boolean | undefined {
  try {
    const v = localStorage.getItem(KEY + name);
    return v === '1' ? true : v === '0' ? false : undefined;
  } catch {
    return undefined;
  }
}

function remember(name: string, open: boolean): void {
  try { localStorage.setItem(KEY + name, open ? '1' : '0'); } catch { /* private window: forget it */ }
}

export function Section({ name, title, summary, open: initial = false, children }: {
  /** Remembered under this; sections with the same name share it. */
  name: string;
  title: string;
  /** A short reminder of what is set, shown while folded. */
  summary?: ReactNode;
  open?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(() => remembered(name) ?? initial);
  const body = useId();
  const toggle = () => {
    setOpen(!open);
    remember(name, !open);
  };
  return (
    <section className={cx('ins-sec', open && 'is-open')}>
      <h3 className="ins-sec-h">
        <button type="button" className="ins-sec-head" aria-expanded={open} aria-controls={body} onClick={toggle}>
          <ChevronRight size={14} strokeWidth={2.25} className="ins-chev" aria-hidden />
          <span className="ins-sec-title">{title}</span>
          {!open && summary ? <span className="ins-sec-sum">{summary}</span> : null}
        </button>
      </h3>
      {open && <div id={body} className="ins-sec-body">{children}</div>}
    </section>
  );
}
