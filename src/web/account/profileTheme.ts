// The theme follows the profile: a saved theme wins over what this browser remembered, and a
// theme button also saves its choice to the profile. (theme.ts knows nothing about accounts.)

import { useEffect } from 'react';
import { api } from '../lib/api';
import { onThemeChosen, setStoredTheme } from '../theme';
import { type Me, currentMe, setMe, useMe } from './me';

/** Save a theme to the profile (`null`: follow the system) and show it everywhere. */
export async function saveTheme(theme: 'light' | 'dark' | null): Promise<Me> {
  const { user } = await api<{ user: Me }>('PATCH', '/api/me', { theme });
  setStoredTheme(theme);
  setMe(user);
  return user;
}

/** Used once, by App. */
export function useProfileTheme(): void {
  const { me } = useMe();
  const theme = me?.theme ?? null;
  useEffect(() => {
    if (theme) setStoredTheme(theme);
  }, [theme, me?.id]);
  useEffect(() => onThemeChosen((t) => {
    if (!currentMe().me) return;
    // Fire and forget: the button already did its work here.
    api<{ user: Me }>('PATCH', '/api/me', { theme: t }).then((r) => setMe(r.user)).catch(() => undefined);
  }), []);
}
