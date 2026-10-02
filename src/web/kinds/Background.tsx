// Timers and fetch cells: what happens by itself. A timer is only a chip while
// designing; a fetch is a chip while designing and one line in Live (loading,
// when it last updated, or what failed), so readers can see where the numbers
// come from and fetch again.

import { AlertTriangle, CloudDownload, LoaderCircle, RefreshCw, Timer } from 'lucide-react';
import type { Cell } from '../../core/types';
import type { CellState } from '../../core/engine';
import type { FetchState } from '../../core/sx';
import { durationMs, sayDuration } from '../../core/duration';
import { cx, useS, useSession } from '../editor/ctx';
import './background.css';

const when = (ms?: number) => (ms ? new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '');

export function TimerChip({ cell }: { cell: Cell }) {
  const every = durationMs(cell.every);
  const after = durationMs(cell.after);
  const plan = every ? `every ${sayDuration(every)}` : after ? `once, after ${sayDuration(after)}` : 'no time set';
  const on = cell.value !== false;
  return (
    <span className="kdata-chip kbg-chip" title="A timer: in Live it ticks and runs its tick handler; readers never see it">
      <Timer size={13} strokeWidth={2} aria-hidden />
      <b>{cell.name ?? cell.id}</b>
      <span className="kdata-val">{plan} · {on ? 'running' : 'stopped'}</span>
    </span>
  );
}

export function FetchView({ cell, st }: { cell: Cell; st: CellState | undefined }) {
  const session = useSession();
  const mode = useS((s) => s.mode);
  const f = (st?.props?.fetch as FetchState | undefined) ?? { state: 'idle' };
  const url = String(st?.props?.url ?? cell.url ?? '');
  const name = cell.label || cell.name || 'Data';
  const again = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Designing, it only looks; in Live a refresh runs load or fail like any other.
    void session.fetchNow(cell.id, mode === 'live');
  };
  if (mode === 'edit') {
    const every = durationMs(cell.every);
    const status = f.state === 'ready' ? `loaded ${when(f.at)}` : f.state === 'failed' ? 'failed' : f.state === 'loading' ? 'loading…' : 'not fetched yet';
    return (
      <span className={cx('kdata-chip kbg-chip', f.state === 'failed' && 'is-bad')} title={f.state === 'failed' ? f.error : 'A fetch: JSON from an address, readable by formulas'}>
        <CloudDownload size={13} strokeWidth={2} aria-hidden />
        <b>{cell.name ?? cell.id}</b>
        <span className="kdata-val">{url || 'no address'}{every ? ` · every ${sayDuration(every)}` : ''} · {status}</span>
        <button type="button" className="kbg-go" onClick={again} title="Fetch now" aria-label={`Fetch ${cell.name ?? 'it'} now`} disabled={!url || f.state === 'loading'}>
          <RefreshCw size={12} className={cx(f.state === 'loading' && 'kbg-spin')} />
        </button>
      </span>
    );
  }
  return (
    <div className={cx('kfetch', `is-${f.state}`)} role="status" aria-live="polite">
      {f.state === 'loading' ? (
        <><LoaderCircle size={14} className="kbg-spin" aria-hidden /><span>Loading {name}…</span></>
      ) : f.state === 'failed' ? (
        <>
          <AlertTriangle size={14} aria-hidden />
          <span className="kfetch-text">Couldn’t load {name}: {f.error ?? 'something went wrong'}</span>
          <button type="button" className="btn soft kfetch-btn" onClick={again}><RefreshCw size={13} /> Retry</button>
        </>
      ) : (
        <>
          <CloudDownload size={14} aria-hidden />
          <span className="kfetch-text">{f.state === 'ready' ? <>{name} · updated {when(f.at)}</> : <>{name} · not loaded yet</>}</span>
          <button type="button" className="icon-btn kfetch-btn" onClick={again} title="Fetch again" aria-label={`Fetch ${name} again`}><RefreshCw size={14} /></button>
        </>
      )}
    </div>
  );
}
