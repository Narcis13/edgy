// A small searchable menu that floats next to the button that opened it
// (a sheet at the bottom of the screen on phones). Arrow keys, Enter, Esc.

import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search } from 'lucide-react';
import { cx } from '../editor/ctx';
import { place } from './float';

export interface PickItem {
  key: string;
  label: ReactNode;
  /** What search matches against. */
  text: string;
  detail?: ReactNode;
  icon?: ReactNode;
  group?: string;
  onPick: () => void;
}

export function PickMenu({ anchor, items, title, onClose, search, placeholder = 'Search…', footer }: {
  anchor: HTMLElement | null;
  items: PickItem[];
  title?: string;
  onClose: () => void;
  /** Defaults to on for long lists. */
  search?: boolean;
  placeholder?: string;
  footer?: ReactNode;
}) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const searching = search ?? items.length > 8;
  const phone = typeof window !== 'undefined' && window.innerWidth < 700;
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return items;
    const starts = items.filter((i) => i.text.toLowerCase().startsWith(t));
    const has = items.filter((i) => !i.text.toLowerCase().startsWith(t) && i.text.toLowerCase().includes(t));
    return [...starts, ...has];
  }, [items, q]);
  useEffect(() => setActive(0), [q]);

  // Placed once, where the button that opened it sits.
  const [pos] = useState<React.CSSProperties>(() => {
    if (!anchor) return {};
    const p = place(anchor.getBoundingClientRect(), 320, 380, 6);
    return { left: p.left, top: p.top, bottom: p.bottom, maxHeight: Math.min(420, p.maxHeight) };
  });

  useEffect(() => {
    if (searching && !phone) input.current?.focus();
    else ref.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node) && !anchor?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [anchor, onClose]);

  useEffect(() => {
    document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, id]);

  const pick = (item: PickItem) => {
    item.onPick();
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(list.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(list.length - 1); }
    else if (e.key === 'Enter' && list[active]) { e.preventDefault(); pick(list[active]); }
    else if (e.key === 'Escape' || (e.key === 'Tab' && !searching)) { e.preventDefault(); onClose(); anchor?.focus(); }
  };

  let lastGroup: string | undefined;
  return createPortal(
    <>
      {phone && <div className="pm-scrim" onPointerDown={onClose} />}
      <div
        ref={ref}
        className={cx('pick-menu', phone && 'is-sheet')}
        style={phone ? undefined : pos}
        role="dialog"
        aria-label={title ?? 'Choose'}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        {title && <div className="pm-title">{title}</div>}
        {searching && (
          <label className="pm-search">
            <Search size={14} />
            <input
              ref={input}
              value={q}
              placeholder={placeholder}
              aria-label={placeholder}
              aria-controls={id}
              aria-activedescendant={list[active] ? `${id}-${active}` : undefined}
              onChange={(e) => setQ(e.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
            />
          </label>
        )}
        <ul className="pm-list" role="listbox" id={id} aria-label={title ?? 'Choices'}>
          {list.map((item, i) => {
            const head = !q && item.group && item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <li key={item.key} role="presentation">
                {head && <div className="pm-group" role="presentation">{head}</div>}
                <div
                  id={`${id}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className={cx('pm-item', i === active && 'is-active')}
                  onPointerEnter={(e) => e.pointerType === 'mouse' && setActive(i)}
                  onClick={() => pick(item)}
                >
                  {item.icon && <span className="pm-icon">{item.icon}</span>}
                  <span className="pm-text">
                    <span className="pm-label">{item.label}</span>
                    {item.detail && <small className="pm-detail">{item.detail}</small>}
                  </span>
                </div>
              </li>
            );
          })}
          {!list.length && <li className="pm-none">Nothing matches “{q}”</li>}
        </ul>
        {footer}
      </div>
    </>,
    document.body,
  );
}
