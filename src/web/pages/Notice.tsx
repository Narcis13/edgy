// A whole-screen message when there is nothing to show: a document that is
// gone, a link that was turned off, a server that doesn't answer.

import type { ReactNode } from 'react';
import { FileQuestion, Link2Off, Unplug } from 'lucide-react';

const ICONS = { missing: FileQuestion, unshared: Link2Off, failed: Unplug };

export function Notice({ kind, title, children, action }: {
  kind: keyof typeof ICONS;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const Icon = ICONS[kind];
  return (
    <main className="notice" role="main">
      <div className="notice-card">
        <span className="notice-icon" aria-hidden><Icon size={26} /></span>
        <h1>{title}</h1>
        {children && <p>{children}</p>}
        {action && <div className="notice-action">{action}</div>}
      </div>
    </main>
  );
}
