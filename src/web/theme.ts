import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const KEY = 'edgy.theme';

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

export function currentTheme(): Theme {
  return stored() ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

export function applyTheme(t: Theme): void {
  document.documentElement.dataset.theme = t;
}

// Whoever shows the theme (the buttons in the bars) is told when something else changes it
// (the profile), and whoever keeps a profile is told when a button chose one. Nothing here
// knows about accounts: the exported files carry this module too.
const changed = new Set<() => void>();
const chosen = new Set<(t: Theme) => void>();

/** Show this theme and remember it in this browser; `null` goes back to the system's. */
export function setStoredTheme(t: Theme | null): void {
  try {
    if (t) localStorage.setItem(KEY, t);
    else localStorage.removeItem(KEY);
  } catch { /* private mode */ }
  applyTheme(currentTheme());
  for (const fn of [...changed]) fn();
}

/** Called when a theme button chose a theme (not when the profile did). */
export function onThemeChosen(fn: (t: Theme) => void): () => void {
  chosen.add(fn);
  return () => void chosen.delete(fn);
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(currentTheme);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (!stored()) {
        const t = mq.matches ? 'dark' : 'light';
        setThemeState(t);
        applyTheme(t);
      }
    };
    const onOther = () => setThemeState(currentTheme());
    mq.addEventListener('change', onChange);
    changed.add(onOther);
    return () => {
      mq.removeEventListener('change', onChange);
      changed.delete(onOther);
    };
  }, []);
  const setTheme = useCallback((t: Theme) => {
    try { localStorage.setItem(KEY, t); } catch { /* private mode */ }
    setThemeState(t);
    applyTheme(t);
    // Other buttons on screen follow too.
    for (const fn of [...changed]) fn();
    for (const fn of [...chosen]) fn(t);
  }, []);
  return [theme, setTheme];
}
