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
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const setTheme = useCallback((t: Theme) => {
    try { localStorage.setItem(KEY, t); } catch { /* private mode */ }
    setThemeState(t);
    applyTheme(t);
  }, []);
  return [theme, setTheme];
}
