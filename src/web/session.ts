// One open document: the optimistic copy people edit, the queue of ops on
// their way to the server, the stream of ops arriving from everyone else,
// undo, selection, and the evaluated values.

import { flushSync } from 'react-dom';
import type { Actor, Cell, Doc, Json, Op, Sx } from '../core/types';
import { isGroup } from '../core/types';
import { type Applied, applyOps } from '../core/ops';
import { toNotation } from '../core/notation';
import { shownLeaves } from '../core/containers';
import { type Fired, type Raised, type Reaction, type TraceEntry, collectionsUsed, react, sampleData } from '../core/events';
import { type Computed, type World, evaluate, runAction } from '../core/engine';
import type { Effect, FetchState } from '../core/sx';
import { indexTree, leaves } from '../core/tree';
import { type LogEntry, type Message, type Row, ApiError, api } from './lib/api';
import { listen, send } from './lib/transport';
import { type Store, createStore } from './lib/store';
import { asItems } from './kinds/items';
import { isoOf } from './kinds/month';

export interface LogItem extends LogEntry {
  mine: boolean;
}

export type Mode = 'edit' | 'live' | 'page';

export interface Presence {
  actor: Actor;
  state: 'reading' | 'editing' | 'listening' | 'idle';
  ts: number;
}

/** A handler that ran, here or on the server, as Activity lists it. */
export interface TraceItem extends TraceEntry {
  n: number;
  /** "here": this browser ran it (a gesture, the document opening); "server": a timer, a fetch, an agent's change. */
  source: 'here' | 'server';
  /** Fired by hand from the studio. */
  test?: boolean;
}

/** How this session was opened. */
export interface SessionOptions {
  /** Start in this mode instead of the one the address or the screen suggests. */
  mode?: Mode;
  /**
   * Opened with a share link: no history or messages, and with "view" nothing
   * is sent: what the person types stays in their tab.
   */
  guest?: 'view' | 'edit';
  /** A slide in a deck being played: the address bar belongs to the player. */
  embedded?: boolean;
}

export interface SessionState {
  /** unshared: opened with a share link that has been turned off. */
  status: 'loading' | 'ready' | 'missing' | 'failed' | 'unshared';
  /** When the library archived this document, or null. */
  archivedAt: number | null;
  online: boolean;
  doc: Doc | null;
  computed: Computed | null;
  unsaved: number;
  selection: string[];
  editing: string | null;
  /** Text typed to start an edit, so the first keystroke isn't lost. */
  seed: string | null;
  menu: string | null;
  /** edit: shape the document; live: use it; page: use it as printed pages. */
  mode: Mode;
  /** Set when someone asked to print; the page view prints once its pages are laid out. */
  printing: boolean;
  links: boolean;
  log: LogItem[];
  messages: Message[];
  presence: Presence[];
  flashes: Record<string, { actor: Actor; n: number }>;
  collections: Record<string, Row[]>;
  toast: { text: string; n: number } | null;
  /** Fetch cells' requests, by cell id, as the server reports them. */
  fetched: Record<string, FetchState>;
  /** The handlers that ran lately, oldest first. */
  trace: TraceItem[];
  canUndo: boolean;
  canRedo: boolean;
  now: number;
}

interface Pending {
  batch: string;
  ops: Op[];
  state: 'queued' | 'sent' | 'done';
  v?: number;
}

interface UndoEntry {
  op: Op;
  key?: string;
  ts: number;
}

export interface DispatchOptions {
  /** false for changes that should not be undoable on their own (undo itself). */
  undo?: boolean;
  /**
   * false for changes that set off no handlers: undo and redo, and handlers'
   * own changes. Otherwise, in Live, what a person changes runs the handlers
   * it sets off, in the same dispatch, so it all undoes as one step.
   */
  react?: boolean;
  /** Changes sharing a key within a moment undo as one (typing, dragging a slider). */
  key?: string;
  transition?: boolean;
}

const STRUCTURAL = new Set(['split', 'merge', 'remove', 'dup', 'swap', 'move', 'put', 'replace']);
const isStructural = (ops: Op[]): boolean =>
  ops.some((op) => STRUCTURAL.has(op[0]) || (op[0] === 'do' && isStructural(op.slice(1) as Op[])));

const uid = () => Math.random().toString(36).slice(2, 10);

const canAnimate = () =>
  typeof document !== 'undefined' &&
  'startViewTransition' in document &&
  !document.hidden &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Later values for the same property replace earlier ones that were never sent. */
function coalesce(ops: Op[]): Op[] {
  const out: Op[] = [];
  for (const op of ops) {
    const prev = out.at(-1);
    if (prev && op[0] === 'set' && prev[0] === 'set' && prev[1] === op[1] && prev[2] === op[2]) out[out.length - 1] = op;
    else out.push(op);
  }
  return out;
}

export class Session {
  readonly client = uid();
  readonly actor: Actor = { kind: 'human', name: 'You', id: this.client };
  readonly store: Store<SessionState>;
  /** While a formula is being typed, clicking another cell inserts a reference to it. */
  pick: ((ref: string) => void) | null = null;
  /** The events cells raised lately, newest last (see `raise`). */
  raised: Raised[] = [];

  private s: SessionState;
  private confirmed: Doc | null = null;
  private pending: Pending[] = [];
  private sending = false;
  private undoStack: UndoEntry[] = [];
  private redoStack: UndoEntry[] = [];
  private es: EventSource | null = null;
  private vtQueued = false;
  private clock: ReturnType<typeof setInterval> | null = null;
  private loading = new Set<string>();
  private counter = 0;
  private closed = false;
  private generation = 0;
  private lastEvent = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  /** The document's open handler ran for this open; close runs only after it. */
  private opened = false;
  /** Not on screen (a slide): no stream to the server until resumed. */
  private paused = false;
  private onPageHide = () => this.leaving(true);
  /** Back from the browser's page cache: that is opening it again. */
  private onPageShow = (e: PageTransitionEvent) => {
    if (e.persisted) this.opening();
  };

  constructor(readonly id: string, readonly options: SessionOptions = {}) {
    this.s = {
      status: 'loading', online: true, doc: null, computed: null, unsaved: 0, selection: [], editing: null, seed: null,
      menu: null, mode: options.mode ?? initialMode(), printing: false, links: true, log: [], messages: [], presence: [], flashes: {}, collections: {},
      toast: null, fetched: {}, trace: [], canUndo: false, canRedo: false, now: Date.now(), archivedAt: null,
    };
    this.store = createStore(this.s);
  }

  get state(): SessionState {
    return this.s;
  }

  // ── lifecycle ──

  async open(): Promise<void> {
    this.closed = false;
    const generation = ++this.generation;
    try {
      // Someone with a link sees the document as it is now, not its history or the conversation.
      const guest = !!this.options.guest;
      // The library says whether there is such a document at all, so a gone one asks for nothing else.
      if (!guest) {
        const { entry } = await api<{ entry: { archivedAt: number | null } | null }>('GET', `/api/library/${this.id}`);
        if (this.closed || generation !== this.generation) return;
        if (!entry) return this.patch({ status: 'missing' });
        this.s = { ...this.s, archivedAt: entry.archivedAt };
      }
      const [doc, log, messages, fetched] = await Promise.all([
        api<Doc>('GET', `/api/docs/${this.id}`),
        guest ? [] : api<LogEntry[]>('GET', `/api/docs/${this.id}/log?limit=80`),
        guest ? [] : api<Message[]>('GET', `/api/docs/${this.id}/messages`),
        api<Record<string, FetchState>>('GET', `/api/docs/${this.id}/fetched`).catch(() => ({})),
      ]);
      if (this.closed || generation !== this.generation) return;
      this.confirmed = doc;
      this.patch({ status: 'ready', doc, messages, fetched, log: log.map((e) => ({ ...e, mine: false })) });
      // A slide passed while it was loading stays quiet until it is shown again.
      if (!this.paused) this.connect();
      if (typeof window !== 'undefined') {
        window.addEventListener('pagehide', this.onPageHide);
        window.addEventListener('pageshow', this.onPageShow);
      }
      // The open handler sees the records it reads.
      await Promise.all(collectionsUsed(doc).map((name) => this.loadCollection(name)));
      if (this.closed || generation !== this.generation) return;
      this.opening();
    } catch (e) {
      this.patch({ status: e instanceof ApiError && e.reason === 'revoked' ? 'unshared' : e instanceof ApiError && (e.status === 404 || e.status === 403) ? 'missing' : 'failed' });
    }
  }

  /** Bring an archived document back into the library's list. */
  async restore(): Promise<void> {
    try {
      await api('PATCH', `/api/docs/${this.id}`, { archived: false });
      this.patch({ archivedAt: null });
    } catch (e) {
      this.toast(e instanceof Error ? sentence(e.message) : 'It could not be restored.');
    }
  }

  /**
   * Stop listening for a while (a slide that is not on screen) without
   * closing: what was typed is still sent, and the state stays as it is.
   */
  pause(): void {
    this.paused = true;
    this.es?.close();
    this.es = null;
    if (this.clock) clearInterval(this.clock);
    if (this.watchdog) clearInterval(this.watchdog);
    this.clock = this.watchdog = null;
  }

  /** Listen again after a pause, catching up on what changed meanwhile. */
  resume(): void {
    this.paused = false;
    if (this.closed || this.es || this.s.status !== 'ready') return;
    this.connect();
    void this.resync();
    if (this.s.computed?.usesNow && !this.clock) this.clock = setInterval(() => this.patch({ now: Date.now() }), 1000);
  }

  close(): void {
    this.leaving(false);
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', this.onPageHide);
      window.removeEventListener('pageshow', this.onPageShow);
    }
    this.closed = true;
    this.es?.close();
    this.es = null;
    if (this.clock) clearInterval(this.clock);
    if (this.watchdog) clearInterval(this.watchdog);
    this.clock = this.watchdog = null;
  }

  private connect(): void {
    this.es?.close();
    // Who this is and whether it is in Live: the server runs timers and fetches while anyone is.
    const es = listen(`/api/docs/${this.id}/events?client=${this.client}&mode=${this.s.mode}`);
    this.es = es;
    this.lastEvent = Date.now();
    const on = (type: string, fn: (e: any) => void) =>
      es.addEventListener(type, (m) => {
        this.lastEvent = Date.now();
        fn(JSON.parse((m as MessageEvent).data));
      });
    on('ping', () => undefined);
    // A stream can die quietly (a proxy, a server restart): if it goes silent, start a new one.
    if (!this.watchdog) {
      this.watchdog = setInterval(() => {
        if (this.es === es && Date.now() - this.lastEvent > 25_000) {
          this.connect();
          void this.resync();
        }
      }, 10_000);
    }
    es.onopen = () => {
      this.patch({ online: true });
      // The browser reconnects by itself with the address it first used; say which mode this really is now.
      this.told(this.s.mode);
    };
    es.onerror = () => this.patch({ online: false });
    on('hello', (e) => {
      if (this.confirmed && e.v !== this.confirmed.v && !this.pending.length) void this.resync();
    });
    on('ops', (e) => this.onOps(e));
    on('message', (e) => {
      if (!this.s.messages.some((m) => m.id === e.message.id)) this.patch({ messages: [...this.s.messages, e.message] });
    });
    on('presence', (e) => this.seen(e.actor, e.state, e.ts));
    on('data', (e) => {
      if (e.collection in this.s.collections) void this.loadCollection(e.collection);
    });
    on('deleted', () => this.patch({ status: 'missing' }));
    on('unshared', () => {
      this.patch({ status: 'unshared' });
      this.pause();
    });
    on('fetch', (e) => this.patch({ fetched: { ...this.s.fetched, [e.cell]: e.state } }));
    on('trace', (e) => this.traced(e.trace, 'server'));
  }

  private async resync(): Promise<void> {
    try {
      const since = this.confirmed?.v ?? 0;
      const [doc, log] = await Promise.all([
        api<Doc>('GET', `/api/docs/${this.id}`),
        this.options.guest ? [] : api<LogEntry[]>('GET', `/api/docs/${this.id}/log?since=${since}&limit=80`),
      ]);
      this.confirmed = doc;
      this.pending = this.pending.filter((p) => !(p.state === 'done' && (p.v ?? 0) <= doc.v));
      const seen = new Set(this.s.log.map((l) => l.v));
      const missed = log.filter((e) => !seen.has(e.v)).map((e) => ({ ...e, mine: e.actor.id === this.client }));
      this.patch({ doc: this.rebase(), unsaved: this.pending.length, log: [...this.s.log, ...missed].slice(-200) });
      for (const name of Object.keys(this.s.collections)) void this.loadCollection(name);
    } catch {
      this.patch({ online: false });
    }
  }

  // ── publishing state ──

  private publish(transition: boolean): void {
    if (this.vtQueued) return; // the queued transition publishes whatever is latest
    if (transition && canAnimate()) {
      this.vtQueued = true;
      const run = () => {
        this.vtQueued = false;
        flushSync(() => this.store.set(this.s));
      };
      try {
        (document as any).startViewTransition(run);
      } catch {
        run();
      }
    } else this.store.set(this.s);
  }

  private patch(p: Partial<SessionState>, transition = false): void {
    const recompute = ('doc' in p && p.doc !== this.s.doc) || 'collections' in p || 'now' in p || 'fetched' in p;
    this.s = { ...this.s, ...p };
    if (recompute && this.s.doc) this.evaluate();
    this.publish(transition);
  }

  private evaluate(): void {
    const s = this.s;
    const computed = evaluate(s.doc!, this.world(s.now), s.computed ?? undefined);
    this.s = { ...s, computed };
    for (const name of computed.collections) if (!(name in s.collections)) void this.loadCollection(name);
    // Collections only handlers read are loaded too, so a handler in this browser sees the same records the server would.
    for (const name of collectionsUsed(s.doc!)) if (!(name in s.collections)) void this.loadCollection(name);
    if (computed.usesNow && !this.clock) this.clock = setInterval(() => this.patch({ now: Date.now() }), 1000);
    if (!computed.usesNow && this.clock) {
      clearInterval(this.clock);
      this.clock = null;
    }
  }

  private async loadCollection(name: string): Promise<void> {
    if (this.loading.has(name)) return;
    this.loading.add(name);
    try {
      const rows = await api<Row[]>('GET', `/api/data/${encodeURIComponent(name)}`);
      this.patch({ collections: { ...this.s.collections, [name]: rows } });
    } catch {
      this.patch({ collections: { ...this.s.collections, [name]: [] } });
    } finally {
      this.loading.delete(name);
    }
  }

  /** What formulas and handlers see outside the document. */
  world(now = Date.now()): World {
    const s = this.s;
    return { rows: (name) => s.collections[name] ?? [], now, fetched: (id) => s.fetched[id] };
  }

  toast(text: string): void {
    this.patch({ toast: { text, n: ++this.counter } });
  }

  // ── changing the document ──

  /** Apply ops here at once, then send them. Returns what was applied, or null if they don't apply. */
  dispatch(op: Op | Op[], o: DispatchOptions = {}): Applied | null {
    const doc = this.s.doc;
    if (!doc) return null;
    let ops = (Array.isArray(op[0]) ? op : [op]) as Op[];
    let rx: Reaction | null = null;
    if (this.s.mode === 'live' && o.react !== false) {
      try {
        rx = react(doc, this.world(), { ops });
      } catch {
        rx = null; // the ops themselves don't apply; applying them below says why
      }
      if (rx?.ops.length) ops = [...ops, ...rx.ops];
    }
    let r: Applied;
    try {
      r = applyOps(doc, ops);
    } catch (e) {
      this.toast(e instanceof Error ? sentence(e.message) : 'That change could not be made.');
      return null;
    }
    const sent = ops.length === 1 ? [r.op] : (r.op.slice(1) as Op[]);
    // Handlers' changes are part of the gesture's step, even when the gesture alone isn't one (choosing a tab).
    if (o.undo !== false || rx?.ops.length) {
      const top = this.undoStack.at(-1);
      const now = Date.now();
      if (!(o.key && top?.key === o.key && now - top.ts < 1500)) this.undoStack.push({ op: r.inverse, key: o.key, ts: now });
      else {
        // Typing joins one step, but what each keystroke's handlers changed must be undone with it.
        if (rx?.ops.length) top.op = ['do', r.inverse, top.op];
        top.ts = now;
      }
      if (this.undoStack.length > 200) this.undoStack.shift();
      this.redoStack = [];
    }
    const last = this.pending.at(-1);
    if (last?.state === 'queued') last.ops = coalesce([...last.ops, ...sent]);
    else this.pending.push({ batch: uid(), ops: sent, state: 'queued' });
    const live = indexTree(r.doc.root).byId;
    this.patch(
      {
        doc: r.doc,
        unsaved: this.pending.length,
        selection: this.s.selection.filter((id) => live.has(id)),
        editing: this.s.editing && live.has(this.s.editing) ? this.s.editing : null,
        canUndo: this.undoStack.length > 0,
        canRedo: this.redoStack.length > 0,
      },
      o.transition ?? isStructural(sent),
    );
    void this.flush();
    if (rx?.trace.length) this.carryOut(rx);
    return r;
  }

  undo(): void {
    const entry = this.undoStack.pop();
    if (!entry) return;
    const r = this.dispatch(entry.op, { undo: false, react: false, transition: true });
    if (r) this.redoStack.push({ op: r.inverse, ts: Date.now() });
    this.patch({ canUndo: this.undoStack.length > 0, canRedo: this.redoStack.length > 0 });
  }

  redo(): void {
    const entry = this.redoStack.pop();
    if (!entry) return;
    const r = this.dispatch(entry.op, { undo: false, react: false, transition: true });
    if (r) this.undoStack.push({ op: r.inverse, ts: Date.now() });
    this.patch({ canUndo: this.undoStack.length > 0, canRedo: this.redoStack.length > 0 });
  }

  private rebase(): Doc {
    let doc = this.confirmed!;
    for (const p of this.pending) {
      if (p.state === 'done' && (p.v ?? 0) <= this.confirmed!.v) continue;
      try {
        doc = applyOps(doc, p.ops).doc;
      } catch {
        // A change made elsewhere got there first; the server will refuse this one too.
      }
    }
    return doc;
  }

  private async flush(): Promise<void> {
    // A view link changes nothing on the server: what the person does stays here.
    if (this.sending || this.closed || this.options.guest === 'view') return;
    const next = this.pending.find((p) => p.state === 'queued');
    if (!next) return;
    next.state = 'sent';
    this.sending = true;
    let retry = false;
    try {
      const r = await api<{ v: number }>('POST', `/api/docs/${this.id}/ops`, { ops: next.ops, actor: this.actor, client: this.client, batch: next.batch });
      next.state = 'done';
      next.v = r.v;
      if (this.confirmed && this.confirmed.v >= r.v) this.pending = this.pending.filter((p) => p !== next);
      if (!this.s.online || this.s.unsaved !== this.pending.length) this.patch({ online: true, unsaved: this.pending.length });
      // The stream normally confirms it within milliseconds; if it hasn't, it missed something.
      setTimeout(() => {
        if (this.confirmed && this.confirmed.v < r.v) {
          this.connect();
          void this.resync();
        }
      }, 1000);
    } catch (e) {
      if (e instanceof ApiError && e.status < 500) {
        this.pending = this.pending.filter((p) => p !== next);
        this.toast(`That change was not saved. ${sentence(e.message)}`);
        this.patch({ doc: this.rebase(), unsaved: this.pending.length });
      } else {
        next.state = 'queued';
        retry = true;
        this.patch({ online: false });
      }
    } finally {
      this.sending = false;
    }
    if (retry) setTimeout(() => void this.flush(), 1500);
    else void this.flush();
  }

  private onOps(e: { v: number; ts: number; actor: Actor; ops: Op[]; touched: string[]; client?: string; batch?: string }): void {
    const base = this.confirmed;
    if (!base || e.v <= base.v) return;
    if (e.v !== base.v + 1) {
      void this.resync();
      return;
    }
    const mine = e.client === this.client;
    try {
      this.confirmed = { ...applyOps(base, e.ops).doc, v: e.v };
    } catch {
      void this.resync();
      return;
    }
    if (mine) this.pending = this.pending.filter((p) => p.batch !== e.batch);
    const item: LogItem = { v: e.v, ts: e.ts, actor: e.actor, ops: e.ops, mine };
    const log = [...this.s.log.slice(-199), item];
    if (mine) {
      // Nothing new to show; keep the optimistic copy unless it has drifted.
      this.patch({ log, unsaved: this.pending.length, ...(this.pending.length ? {} : { doc: this.confirmed }) });
      return;
    }
    const doc = this.rebase();
    const live = indexTree(doc.root).byId;
    const flashes = { ...this.s.flashes };
    const n = ++this.counter;
    for (const id of e.touched) if (live.has(id)) flashes[id] = { actor: e.actor, n };
    setTimeout(() => this.clearFlashes(n), 2200);
    // The server's own handlers are not someone who is here.
    if (!(e.actor.kind === 'agent' && e.actor.name === 'Events')) this.s = { ...this.s, presence: upsert(this.s.presence, { actor: e.actor, state: 'editing', ts: e.ts }) };
    this.patch(
      {
        doc,
        log,
        flashes,
        selection: this.s.selection.filter((id) => live.has(id)),
        editing: this.s.editing && live.has(this.s.editing) ? this.s.editing : null,
      },
      isStructural(e.ops),
    );
  }

  private clearFlashes(n: number): void {
    const flashes = Object.fromEntries(Object.entries(this.s.flashes).filter(([, f]) => f.n !== n));
    this.patch({ flashes });
  }

  private seen(actor: Actor, state: Presence['state'], ts: number): void {
    this.patch({ presence: upsert(this.s.presence, { actor, state, ts }) });
  }

  // ── selection and editing ──

  select(id: string | null, additive = false): void {
    if (id === null) {
      if (this.s.selection.length || this.s.editing || this.s.menu) this.patch({ selection: [], editing: null, seed: null, menu: null });
      return;
    }
    let selection: string[];
    if (additive) {
      selection = this.s.selection.includes(id) ? this.s.selection.filter((x) => x !== id) : [...this.s.selection, id];
    } else {
      if (this.s.selection.length === 1 && this.s.selection[0] === id && !this.s.menu) return;
      selection = [id];
    }
    this.patch({ selection, menu: null, ...(this.s.editing && this.s.editing !== id ? { editing: null, seed: null } : {}) });
  }

  edit(id: string | null, seed: string | null = null): void {
    if (id === null) {
      if (this.s.editing) this.patch({ editing: null, seed: null });
      return;
    }
    this.patch({ selection: [id], editing: id, seed, menu: null });
  }

  /** Move the selection to the next (or previous) cell in reading order. */
  selectNext(delta: 1 | -1): void {
    const doc = this.s.doc;
    if (!doc) return;
    // Only the cells people can see: not those behind a closed tab or a folded section.
    const shown = shownLeaves(doc.root);
    // Everything folded away: fall back to every cell rather than none.
    const ls = shown.length ? shown : leaves(doc.root);
    const cur = this.s.selection.at(-1);
    let i = cur ? ls.findIndex((c) => c.id === cur) : delta > 0 ? -1 : 0;
    i = (i + delta + ls.length) % ls.length;
    this.patch({ selection: [ls[i].id], editing: null, seed: null, menu: null });
  }

  openMenu(id: string | null): void {
    this.patch({ menu: id, ...(id ? { selection: [id], editing: null } : {}) });
  }

  setMode(mode: Mode): void {
    const was = this.s.mode;
    this.patch({ mode, selection: [], editing: null, menu: null });
    if (mode !== was) this.told(mode);
    if (mode === 'live') this.opening();
    if (this.options.embedded || this.options.guest) return;
    try {
      const url = new URL(window.location.href);
      if (mode === 'page') url.searchParams.set('view', 'page');
      else url.searchParams.delete('view');
      window.history.replaceState(null, '', url);
    } catch { /* not in a browser */ }
  }

  /** Print the document as pages: switch to the page view, which prints once laid out. */
  print(): void {
    const was = this.s.mode;
    this.patch({ mode: 'page', printing: true, selection: [], editing: null, menu: null });
    if (was !== 'page') this.told('page');
  }

  printed(): void {
    if (this.s.printing) this.patch({ printing: false });
  }

  setLinks(links: boolean): void {
    this.patch({ links });
  }

  cell(id: string): Cell | undefined {
    return this.s.doc ? indexTree(this.s.doc.root).byId.get(id) : undefined;
  }

  parent(id: string): Cell | null {
    return this.s.doc ? indexTree(this.s.doc.root).parent.get(id) ?? null : null;
  }

  /** The selected cell that tools act on. */
  primary(): Cell | undefined {
    const id = this.s.selection.at(-1);
    return id ? this.cell(id) : undefined;
  }

  // ── commands, shared by the toolbar, the keyboard and the menus ──

  split(id: string, dir: 'row' | 'col', before = false): void {
    const r = this.dispatch(['split', id, dir, before ? { before: true } : {}]);
    const made = ((r?.op[3] as { cell?: Json[] } | undefined)?.cell?.[1] as { id?: string } | undefined)?.id;
    if (made) this.patch({ selection: [made], editing: null, menu: null });
  }

  merge(): void {
    const sel = this.s.selection;
    if (!sel.length) return;
    const r = this.dispatch(['merge', ...sel]);
    if (r?.touched[0]) this.patch({ selection: [r.touched[0]] });
  }

  canMerge(): boolean {
    const doc = this.s.doc;
    const sel = this.s.selection;
    if (!doc || !sel.length) return false;
    if (sel.length === 1 && !isGroup(this.cell(sel[0]) ?? doc.root)) return false;
    try {
      applyOps(doc, [['merge', ...sel]]);
      return true;
    } catch {
      return false;
    }
  }

  /** Clear a cell that has content; remove it once it is empty. */
  clearOrRemove(): void {
    const doc = this.s.doc;
    const sel = this.s.selection;
    if (!doc || !sel.length) return;
    const cells = sel.map((id) => this.cell(id)).filter((c): c is Cell => !!c);
    const full = cells.filter((c) => c.kind !== 'empty' && !isGroup(c));
    if (full.length) {
      this.dispatch(full.map((c) => ['put', c.id, ['empty']] as Op));
      return;
    }
    if (cells.length === 1 && cells[0].id === doc.root.id && !isGroup(cells[0])) return;
    const parent = this.parent(cells[0].id);
    const kids = parent?.children ?? [];
    const i = kids.findIndex((k) => k.id === cells[0].id);
    const neighbour = kids[i + 1] ?? kids[i - 1];
    this.dispatch(cells.map((c) => ['remove', c.id] as Op));
    const live = this.s.doc ? indexTree(this.s.doc.root).byId : new Map<string, Cell>();
    const next = neighbour && live.has(neighbour.id) ? leaves(live.get(neighbour.id)!)[0].id : null;
    this.patch({ selection: next ? [next] : [] });
  }

  duplicate(): void {
    const c = this.primary();
    if (!c) return;
    const r = this.dispatch(['dup', c.id]);
    if (r?.touched[0]) this.patch({ selection: [r.touched[0]] });
  }

  swap(): void {
    const [a, b] = this.s.selection;
    if (a && b) this.dispatch(['swap', a, b]);
  }

  /** Give a cell a new kind, keeping its name, size and look. `props` are a preset's own (a signature's label). */
  setKind(id: string, kind: string, type?: string, props?: Record<string, Json>): void {
    const c = this.cell(id);
    if (!c) return;
    const keep: Record<string, Json> = { ...(c.style ? { style: c.style } : {}), ...props };
    const text = c.kind === 'text' ? c.text ?? '' : c.kind === 'button' ? c.label ?? '' : '';
    const same = c.kind === kind;
    /** Props worth keeping when a cell is given its own kind again. */
    const own = (...keys: (keyof Cell)[]): Record<string, Json> =>
      same ? Object.fromEntries(keys.filter((k) => c[k] !== undefined).map((k) => [k, c[k] as Json])) : {};
    let cell: Json;
    switch (kind) {
      case 'text': cell = ['text', keep, text]; break;
      case 'formula': cell = ['formula', { ...keep, ...(c.expr !== undefined ? { expr: c.expr } : {}) }]; break;
      case 'input': {
        const t = type ?? 'text';
        const value: Json = t === 'number' ? 0 : t === 'slider' ? 50 : t === 'checkbox' || t === 'toggle' ? false : t === 'rating' ? 3 : '';
        const extra: Record<string, Json> =
          t === 'slider' ? { min: 0, max: 100 } : t === 'select' ? { options: ['list', 'First', 'Second', 'Third'], value: 'First' } : t === 'rating' ? { max: 5 } : {};
        cell = ['input', { ...keep, type: t, value, ...extra, ...(c.kind === 'input' && c.label ? { label: c.label } : {}) }];
        break;
      }
      case 'button': cell = ['button', keep, text || 'Button']; break;
      case 'image': cell = ['image', keep]; break;
      case 'icon': cell = ['icon', keep, 'sparkles']; break;
      case 'chart': cell = ['chart', { ...keep, type: type ?? 'bar' }, same && c.expr !== undefined ? c.expr : ['list', 3, 5, 4, 8, 6]]; break;
      case 'table':
        // A new table holds a few typed rows people can edit in place; one that already had data keeps it.
        cell = same
          ? ['table', { ...own('label', 'columns', 'value', 'group', 'select', 'actions', 'borders', 'stripes', 'density', 'header', 'search'), ...keep }, ...(c.expr !== undefined ? [c.expr] : [])]
          : ['table', { ...keep, value: [{ item: 'Tea', price: 3, qty: 2 }, { item: 'Cake', price: 5, qty: 1 }, { item: 'Juice', price: 4, qty: 3 }] }];
        break;
      case 'list': {
        // A list changing type keeps its items, reshaped; a new one starts with a few to show how it works.
        const t = type ?? 'bullet';
        const samples: Json[] = t === 'check'
          ? [{ text: 'Plan the week', done: true }, { text: 'Book the venue', done: false }, { text: 'Send the invites', done: false }]
          : t === 'number' ? ['First step', 'Second step'] : ['First thing', 'Second thing'];
        const items = same && Array.isArray(c.value) && c.value.length ? asItems(c.value, t) : samples;
        cell = ['list', { ...own('label', 'expr'), ...keep, type: t }, ...items];
        break;
      }
      case 'calendar': cell = ['calendar', { ...own('label', 'value'), ...keep }, same && c.expr !== undefined ? c.expr : ['list', { date: isoOf(new Date()), title: 'Today' }]]; break;
      case 'canvas': cell = ['canvas', { ...own('label', 'value'), ...keep }]; break;
      case 'stat':
        cell = same && c.expr !== undefined ? ['stat', { ...own('label', 'format', 'compare', 'trend', 'icon'), ...keep }, c.expr] : [
          'stat',
          { label: 'Revenue', format: 'currency', compare: 4200, trend: ['list', 3200, 3900, 4100, 4600, 5000], ...keep },
          ['*', 1250, 4],
        ];
        break;
      case 'break': cell = ['break']; break;
      case 'tabs':
      case 'accordion':
      case 'collapsible': {
        if (same) return;
        // What the cell held goes inside, keeping its own look; the container starts open so it can be edited.
        const inner: Json[] = c.kind === 'empty' ? [] : [toNotation(c, false)];
        const preset = props ?? {};
        if (kind === 'collapsible') cell = ['collapsible', { title: 'Details', ...preset }, ...inner];
        else {
          const word = kind === 'tabs' ? 'Tab' : 'Section';
          cell = [kind, { ...(kind === 'accordion' ? { value: [`${word} 1`] } : {}), ...preset },
            ['panel', { title: `${word} 1` }, ...inner], ['panel', { title: `${word} 2` }]];
        }
        break;
      }
      case 'data': {
        // A data cell is read by name, so it gets one; it keeps what an input or text held.
        const v: Json = same ? c.value ?? null : c.kind === 'input' ? c.value ?? null : c.kind === 'text' ? c.text ?? '' : 0;
        const names = new Set(indexTree(this.s.doc!.root).byName.keys());
        let name = c.name;
        if (!name) for (let n = 1; !name; n++) if (!names.has(n === 1 ? 'data' : `data${n}`)) name = n === 1 ? 'data' : `data${n}`;
        cell = ['data', { name, ...props }, v];
        break;
      }
      case 'timer':
      case 'fetch': {
        if (same) return;
        // Both are read by name, so each gets a free one; a fetch starts on the demo rate so it shows something at once.
        const names = new Set(indexTree(this.s.doc!.root).byName.keys());
        const base = kind === 'timer' ? 'timer' : 'rate';
        let name = c.name;
        if (!name) for (let n = 1; !name; n++) if (!names.has(n === 1 ? base : `${base}${n}`)) name = n === 1 ? base : `${base}${n}`;
        cell = kind === 'timer' ? ['timer', { name, every: 30, ...props }] : ['fetch', { name, label: 'Exchange rate', ...props }, '/api/demo/rate'];
        break;
      }
      case 'diagram':
        cell = same ? ['diagram', { ...own('label', 'value'), ...keep }] : ['diagram', keep,
          { id: 'a', type: 'rect', text: 'Start', fill: 'accent-soft', color: 'accent' },
          { id: 'b', type: 'rect', text: 'Next step' },
          { type: 'arrow', from: 'a', to: 'b' }];
        break;
      default: cell = ['empty', keep];
    }
    this.dispatch(['put', id, cell]);
    this.patch({ menu: null, selection: [id], ...(kind === 'text' || kind === 'formula' ? { editing: id, seed: null } : { editing: null }) });
  }

  /**
   * Run a button, or with `action` one of a table's row actions (its `row` in
   * `vars`). Document changes go through dispatch; records go to the server.
   */
  async run(id: string, action?: { do: Sx; vars: Record<string, unknown> }): Promise<void> {
    const doc = this.s.doc;
    const cell = this.cell(id);
    const todo = action ? action.do : cell?.do;
    if (!doc || !cell || todo == null) return;
    if (this.s.mode === 'live') {
      // In Live the action is the gesture: it, the button's click handler and what they set off are one step.
      const rx = react(doc, this.world(), {
        run: { cell: id, name: 'click', action: todo, vars: action?.vars },
        ...(action ? {} : { events: [{ cell: id, name: 'click' }] }),
      });
      const failed = rx.trace.find((t) => t.via === 'do' && t.error);
      if (failed) return this.toast(`That button failed: ${failed.error}.`);
      if (rx.ops.length) this.dispatch(rx.ops, { react: false });
      await this.carryOut(rx);
      return;
    }
    try {
      const s = this.s;
      const effects = runAction(doc, this.world(), id, todo, action?.vars);
      const ops = effects.filter((e) => e.type === 'op').map((e) => (e as { op: Op }).op);
      if (ops.length) this.dispatch(ops);
      for (const e of effects) {
        const path = 'collection' in e ? `/api/data/${encodeURIComponent(e.collection)}` : '';
        if (e.type === 'insert') await api('POST', path, { record: e.record, source: { doc: this.id, cell: id } });
        if (e.type === 'delete') await api('DELETE', `${path}/${encodeURIComponent(e.id)}`);
        if (e.type === 'update') await api('PATCH', `${path}/${encodeURIComponent(e.id)}`, { fields: e.fields });
        if (e.type === 'clear') await api('DELETE', path);
      }
    } catch (e) {
      this.toast(e instanceof Error ? `That button failed: ${e.message}.` : 'That button failed.');
    }
  }

  /**
   * A cell raised an event: a tab changed, a section opened, a shape was
   * clicked. The last few are kept so they can be looked at; what handlers
   * follow from a change is worked out by `dispatch`, and pointer events go
   * through `fire`.
   */
  raise(cell: string, name: string, data: Record<string, unknown> = {}): void {
    this.raised = [...this.raised.slice(-19), { cell, name, data }];
  }

  // ── events ──

  /**
   * An event happened here: a click, a double-click, the document opening.
   * Its handlers run now (only in Live), and what they change is one undo step
   * unless `undo` is false (nobody did it: the document opening).
   */
  fire(ev: Fired, o: { undo?: boolean } = {}): TraceEntry[] {
    const doc = this.s.doc;
    if (!doc || this.s.mode !== 'live') return [];
    const rx = react(doc, this.world(), { events: [ev] });
    if (!rx.trace.length) return [];
    if (rx.ops.length) this.dispatch(rx.ops, { react: false, undo: o.undo });
    void this.carryOut(rx);
    return rx.trace;
  }

  /**
   * A person clicked (or double-clicked) a cell in Live. `index` is the
   * position of the table row or list item clicked; `part` is what the kind
   * itself said was clicked (a diagram's shape).
   */
  pointer(cell: string, name: 'click' | 'dblclick', where: { index?: number; part?: Record<string, unknown> } = {}): void {
    const c = this.cell(cell);
    if (!c) return;
    const value = this.s.computed?.cells[cell]?.value;
    const list = Array.isArray(value) ? value : [];
    let data: Record<string, unknown> = { ...where.part };
    if (where.index !== undefined && c.kind === 'table') data = { row: list[where.index] ?? null, index: where.index };
    else if (where.index !== undefined && c.kind === 'list') data = { item: list[where.index] ?? null, index: where.index };
    else if (c.kind === 'table') data = { row: null, index: null };
    else if (c.kind === 'list') data = { item: null, index: null };
    else if (c.kind === 'diagram' && !('element' in data)) data = { element: null };
    this.fire({ cell, name, data });
  }

  /**
   * Fire an event by hand, to try a handler, in any mode: the studio's test
   * button. With no data, sample data stands in for what the event would carry.
   * Its changes are real, and one undo step.
   */
  test(cell: string | null, name: string, data?: Record<string, unknown>): TraceEntry[] {
    const doc = this.s.doc;
    if (!doc) return [];
    const c = cell ? this.cell(cell) ?? null : null;
    const rx = react(doc, this.world(), { events: [{ cell, name, data: data ?? sampleData(doc, this.world(), c, name) }] });
    if (rx.ops.length) this.dispatch(rx.ops, { react: false });
    void this.carryOut(rx, true);
    if (!rx.trace.length) this.toast(`Nothing handles ${name} here yet.`);
    return rx.trace;
  }

  /** Fetch a fetch cell now; with `handlers` its load or fail runs (Live), without it only the answer arrives (designing). */
  async fetchNow(cell: string, handlers: boolean): Promise<void> {
    try {
      await api('POST', `/api/docs/${this.id}/fetch/${encodeURIComponent(cell)}`, { handlers });
    } catch (e) {
      this.toast(e instanceof Error ? sentence(e.message) : 'That could not be fetched.');
    }
  }

  /** Records, fetches and the trace: what a reaction leaves to be done after its ops are applied. */
  private async carryOut(rx: Reaction, test = false): Promise<void> {
    this.traced(rx.trace, 'here', test);
    const bad = rx.trace.find((t) => t.error);
    if (bad) this.toast(`${bad.name}: ${sentence(bad.error!)}`);
    for (const e of rx.effects) {
      try {
        await this.effect(e);
      } catch (err) {
        this.toast(err instanceof Error ? sentence(err.message) : 'A handler could not finish.');
      }
    }
  }

  private async effect(e: Effect, keepalive = false): Promise<void> {
    if (this.options.guest === 'view' && e.type !== 'op' && e.type !== 'emit') {
      this.toast('This link can only view the document, so nothing is saved.');
      return;
    }
    if (e.type === 'refresh') {
      await api('POST', `/api/docs/${this.id}/fetch/${encodeURIComponent(e.cell)}`, { handlers: true });
      return;
    }
    if (e.type === 'op' || e.type === 'emit') return;
    const path = `/api/data/${encodeURIComponent(e.collection)}`;
    if (keepalive) {
      const [method, url, body] = e.type === 'insert' ? ['POST', path, { record: e.record, source: { doc: this.id } }]
        : e.type === 'update' ? ['PATCH', `${path}/${encodeURIComponent(e.id)}`, { fields: e.fields }]
        : e.type === 'delete' ? ['DELETE', `${path}/${encodeURIComponent(e.id)}`, undefined] : ['DELETE', path, undefined];
      void send(url as string, { method: method as string, keepalive: true, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }).catch(() => undefined);
      return;
    }
    if (e.type === 'insert') await api('POST', path, { record: e.record, source: { doc: this.id } });
    if (e.type === 'delete') await api('DELETE', `${path}/${encodeURIComponent(e.id)}`);
    if (e.type === 'update') await api('PATCH', `${path}/${encodeURIComponent(e.id)}`, { fields: e.fields });
    if (e.type === 'clear') await api('DELETE', path);
  }

  private traced(entries: TraceEntry[], source: TraceItem['source'], test = false): void {
    if (!entries.length) return;
    const items = entries.map((t) => ({ ...t, n: ++this.counter, source, ...(test ? { test } : {}) }));
    this.patch({ trace: [...this.s.trace, ...items].slice(-100) });
  }

  /** The server runs timers and fetches while someone is in Live, so it hears when this browser changes mode. */
  private told(mode: Mode): void {
    if (this.s.status !== 'ready') return;
    void api('POST', `/api/docs/${this.id}/viewer`, { client: this.client, mode }).catch(() => undefined);
  }

  /** The document's open handler: once per open, the first time it is used in Live. */
  private opening(): void {
    if (this.opened || this.s.status !== 'ready' || this.s.mode !== 'live') return;
    this.opened = true;
    this.fire({ cell: null, name: 'open' }, { undo: false });
  }

  /**
   * The person is leaving: the document's close handler, if it opened. When
   * the page itself goes away (`unloading`), its changes are sent with
   * keepalive, since the usual queue won't get to send them.
   */
  private leaving(unloading: boolean): void {
    const doc = this.s.doc;
    if (!this.opened || !doc || this.closed) return;
    this.opened = false;
    // Events don't fire while designing or on paper, leaving included.
    if (this.s.mode !== 'live') return;
    const on = doc.meta.on;
    if (!on || typeof on !== 'object' || (on as Record<string, unknown>).close == null) return;
    const rx = react(doc, this.world(), { events: [{ cell: null, name: 'close' }] });
    if (rx.ops.length && this.options.guest !== 'view') {
      const body = JSON.stringify({ ops: rx.ops, actor: this.actor, client: this.client, batch: uid() });
      void send(`/api/docs/${this.id}/ops`, { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body }).catch(() => undefined);
    }
    for (const e of rx.effects) void this.effect(e, true).catch(() => undefined);
    if (!unloading) this.traced(rx.trace, 'here');
  }

  async say(text: string): Promise<void> {
    try {
      const cell = this.s.selection.at(-1);
      await api('POST', `/api/docs/${this.id}/messages`, { text, actor: this.actor, ...(cell ? { cell } : {}) });
    } catch (e) {
      this.toast(e instanceof Error ? e.message : 'The message was not sent.');
    }
  }
}

/** Open on the page view when the link asks for it; on a phone, start by using the document. */
function initialMode(): Mode {
  if (typeof window === 'undefined') return 'edit';
  const view = new URLSearchParams(window.location.search).get('view');
  if (view === 'page' || view === 'live' || view === 'edit') return view;
  return window.innerWidth < 720 ? 'live' : 'edit';
}

function upsert(list: Presence[], p: Presence): Presence[] {
  return [...list.filter((x) => x.actor.name !== p.actor.name), p];
}

function sentence(s: string): string {
  const t = s.trim();
  return t.charAt(0).toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) ? '' : '.');
}
