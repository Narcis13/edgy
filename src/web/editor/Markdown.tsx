// A small, safe subset of Markdown for text cells: headings, lists, bold,
// italic, code and links. Builds elements directly; no HTML is ever injected.

import { type ReactNode, memo } from 'react';

const INLINE = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\))/g;
const safeHref = (url: string) => (/^(https?:|mailto:|\/|#)/i.test(url) ? url : undefined);

function inline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={i}>{part.slice(1, -1)}</code>;
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link) {
      const href = safeHref(link[2]);
      return href ? <a key={i} href={href} target="_blank" rel="noreferrer">{link[1]}</a> : link[1];
    }
    return part;
  });
}

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (para.length) {
      blocks.push(<p key={blocks.length}>{para.flatMap((l, i) => (i ? [<br key={'b' + i} />, ...inline(l)] : inline(l)))}</p>);
      para = [];
    }
    if (list) {
      const items = list.items.map((l, i) => <li key={i}>{inline(l)}</li>);
      blocks.push(list.ordered ? <ol key={blocks.length}>{items}</ol> : <ul key={blocks.length}>{items}</ul>);
      list = null;
    }
  };
  for (const line of text.split('\n')) {
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    const li = /^\s*([-*]|\d+\.)\s+(.*)$/.exec(line);
    if (h) {
      flush();
      const Tag = (['h1', 'h2', 'h3'] as const)[h[1].length - 1];
      blocks.push(<Tag key={blocks.length}>{inline(h[2])}</Tag>);
    } else if (li) {
      const ordered = /\d/.test(li[1]);
      if (para.length || (list && list.ordered !== ordered)) flush();
      list ??= { ordered, items: [] };
      list.items.push(li[2]);
    } else if (!line.trim()) flush();
    else {
      if (list) flush();
      para.push(line);
    }
  }
  flush();
  return <div className="md">{blocks}</div>;
});
