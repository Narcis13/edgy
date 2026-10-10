// Small pieces the sections of the profile share.

import { useEffect, useId, useRef, useState } from 'react';

/** A short confirmation that clears itself. */
export function useFlash(): [string | null, (text: string) => void] {
  const [text, setText] = useState<string | null>(null);
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(t.current), []);
  return [text, (s) => {
    setText(s);
    clearTimeout(t.current);
    t.current = setTimeout(() => setText(null), 5000);
  }];
}

export function Section({ title, about, danger, children }: { title: string; about?: React.ReactNode; danger?: boolean; children: React.ReactNode }) {
  const id = useId();
  return (
    <section className={'pf-card' + (danger ? ' is-danger' : '')} aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {about && <p className="pf-about">{about}</p>}
      {children}
    </section>
  );
}

/** The state of a save: a confirmation, or what went wrong. */
export function Status({ ok, error }: { ok: string | null; error: string | null }) {
  return (
    <span className={'pf-status' + (error ? ' is-error' : '')} role={error ? 'alert' : 'status'}>
      {error ?? ok}
    </span>
  );
}
