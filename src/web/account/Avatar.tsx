// A person as a coloured circle with their initials.

import './account.css';

export function initials(name: string): string {
  const words = name.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  return ((words[0]?.[0] ?? '?') + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
}

export function Avatar({ name, color, size = 28, title, ring }: { name: string; color: string; size?: number; title?: string; ring?: boolean }) {
  return (
    <span
      className={'avatar' + (ring ? ' has-ring' : '')}
      title={title ?? name}
      aria-label={title ?? name}
      role="img"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4), background: color }}
    >
      {initials(name)}
    </span>
  );
}
