// A fetch cell: the address of the JSON, how often it is fetched again, the
// label readers see, and how the last fetch went, with a button to fetch now.

import { AlertTriangle, CloudDownload, LoaderCircle, RefreshCw } from 'lucide-react';
import type { FetchState } from '../../../../core/sx';
import { durationMs } from '../../../../core/duration';
import { NumberField, TextField } from '../../fields';
import { cx, useS, useSession } from '../../ctx';
import { Hint, Prop } from '../controls';
import type { KindProps } from './types';

const when = (ms?: number) => (ms ? new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '');

export function FetchPanel({ e, st }: KindProps) {
  const session = useSession();
  const c = e.cell;
  const known = useS((s) => s.fetched[c.id]);
  const f: FetchState = (st?.props?.fetch as FetchState | undefined) ?? known ?? { state: 'idle' };
  const every = durationMs(c.every);
  const url = c.url ?? '';
  const fields = f.data && typeof f.data === 'object' && !Array.isArray(f.data) ? Object.keys(f.data) : [];
  const name = c.name ?? c.id;
  return (
    <>
      <Prop label="Address" hint="JSON over http(s), or a path on this server such as /api/data/orders.">
        <TextField value={url} mono label="Address" placeholder="https://example.com/rate.json" onCommit={(v) => e.set('url', v.trim() || null)} />
      </Prop>
      <Prop label="Fetch again every" inline onReset={c.every != null ? () => e.set('every', null) : undefined}>
        <NumberField value={every ? every / 1000 : null} min={5} step={5} placeholder="never" label="Seconds between fetches"
          onCommit={(v) => e.set('every', v && v > 0 ? Math.max(5, v) : null)} />
        <span className="ins-unit">seconds</span>
      </Prop>
      <Prop label="Label" hint="What readers see on its status line in Live.">
        <TextField value={c.label ?? ''} label="Label" placeholder="Exchange rate" onCommit={(v) => e.set('label', v.trim() || null)} />
      </Prop>
      <div className={cx('ins-fetch', `is-${f.state}`)} role="status" aria-live="polite">
        {f.state === 'loading' ? <LoaderCircle size={14} className="ins-spin" aria-hidden /> : f.state === 'failed' ? <AlertTriangle size={14} aria-hidden /> : <CloudDownload size={14} aria-hidden />}
        <span className="ins-fetch-text">
          {f.state === 'loading' ? 'Fetching…'
            : f.state === 'failed' ? `Failed: ${f.error ?? 'something went wrong'}`
            : f.state === 'ready' ? `Loaded at ${when(f.at)}${fields.length ? ` · ${fields.slice(0, 4).join(', ')}${fields.length > 4 ? '…' : ''}` : ''}`
            : 'Not fetched yet'}
        </span>
        <button type="button" className="btn soft small" disabled={!url || f.state === 'loading'} onClick={() => void session.fetchNow(c.id, false)}>
          <RefreshCw size={13} /> Fetch now
        </button>
      </div>
      <Hint>
        Formulas read the answer by name{fields[0] ? <>: <code>(get {name} "{fields[0]}")</code></> : <>, like <code>(get {name} "rate")</code></>}.
        In Live it is fetched when the document opens{every ? ' and on its interval' : ''}; its load and fail handlers run then. Fetching now, while designing, runs no handler.
      </Hint>
    </>
  );
}
