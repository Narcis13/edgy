// A card's "⋯" menu: a button and a list of actions, usable with the keyboard alone.

import { useEffect, useRef, useState } from 'react';
import { Ellipsis } from 'lucide-react';
import { cx } from './text';

export interface MenuItem {
  label: string;
  icon: React.ReactNode;
  run?: () => void;
  /** A link instead of an action (an export to download). */
  href?: string;
  download?: boolean;
  danger?: boolean;
  disabled?: boolean;
}

const ITEMS = '[role="menuitem"]:not([aria-disabled="true"])';

export function Menu({ label, items, onOpenChange }: { label: string; items: () => MenuItem[]; onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState<null | 'first' | 'last'>(null);
  const [up, setUp] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);

  const show = (at: 'first' | 'last') => {
    // Near the bottom of the window the menu opens upwards, so it is never cut off.
    const r = btn.current?.getBoundingClientRect();
    setUp(!!r && r.bottom + 340 > window.innerHeight && r.top > 340);
    setOpen(at);
    onOpenChange?.(true);
  };
  const close = (refocus: boolean) => {
    setOpen(null);
    onOpenChange?.(false);
    if (refocus) btn.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const all = list.current?.querySelectorAll<HTMLElement>(ITEMS);
    (open === 'first' ? all?.[0] : all?.[all.length - 1])?.focus();
    const away = (e: PointerEvent) => {
      if (!list.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const onKey = (e: React.KeyboardEvent) => {
    const all = [...(list.current?.querySelectorAll<HTMLElement>(ITEMS) ?? [])];
    const i = all.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => { e.preventDefault(); all[(n + all.length) % all.length]?.focus(); };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(all.length - 1);
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === 'Tab') close(false);
    // Links answer Enter but not Space; menu items answer both.
    else if (e.key === ' ' && (e.target as HTMLElement).tagName === 'A') { e.preventDefault(); (e.target as HTMLElement).click(); }
  };

  return (
    <div className="lc-menu">
      <button
        ref={btn}
        type="button"
        className="icon-btn lc-menu-btn"
        aria-label={`Actions for ${label}`}
        aria-haspopup="menu"
        aria-expanded={!!open}
        onClick={() => (open ? close(false) : show('first'))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); show(e.key === 'ArrowDown' ? 'first' : 'last'); }
        }}
      >
        <Ellipsis size={18} />
      </button>
      {open && (
        <div ref={list} className={cx('lc-menu-list', up && 'is-up')} role="menu" aria-label={`Actions for ${label}`} onKeyDown={onKey}>
          {items().map((it) => it.href ? (
            <a key={it.label} role="menuitem" tabIndex={-1} href={it.href} download={it.download || undefined} onClick={() => close(false)}>
              {it.icon}{it.label}
            </a>
          ) : (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={cx(it.danger && 'is-danger')}
              aria-disabled={it.disabled || undefined}
              onClick={() => {
                if (it.disabled) return;
                close(true);
                it.run?.();
              }}
            >
              {it.icon}{it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
