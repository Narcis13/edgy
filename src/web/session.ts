// One open document: the optimistic copy people edit, the queue of ops on
// their way to the server, the stream of ops arriving from everyone else,
// undo, selection, and the evaluated values.

import { flushSync } from 'react-dom';
import type { Actor, Cell, Doc, Json, Op, Sx } from '../core/types';
import { isGroup } from '../core/types';
import { type Applied, applyOps } from '../core/ops';
import { type Computed, evaluate, runAction } from '../core/engine';
import { indexTree, leaves } from '../core/tree';
import { type LogEntry, type Message, type Row, ApiError, api } from './lib/api';
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

export interface SessionState {
  status: 'loading' | 'ready' | 'missing' | 'failed';
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

  constructor(readonly id: string) {
    this.s = {
      status: 'loading', online: true, doc: null, computed: null, unsaved: 0, selection: [], editing: null, seed: null,
      menu: null, mode: initialMode(), printing: false, links: true, log: [], messages: [], presence: [], flashes: {}, collections: {},
      toast: null, canUndo: false, canRedo: false, now: Date.now(),
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
      const [doc, log, messages] = await Promise.all([
        api<Doc>('GET', `/api/docs/${this.id}`),
        api<LogEntry[]>('GET', `/api/docs/${this.id}/log?limit=80`),
        api<Message[]>('GET', `/api/docs/${this.id}/messages`),
      ]);
      if (this.closed || generation !== this.generation) return;
      this.confirmed = doc;
      this.patch({ status: 'ready', doc, messages, log: log.map((e) => ({ ...e, mine: false })) });
      this.connect();
    } catch (e) {
      this.patch({ status: e instanceof ApiError && e.status === 404 ? 'missing' : 'failed' });
    }
  }

  close(): void {
    this.closed = true;
    this.es?.close();
    this.es = null;
    if (this.clock) clearInterval(this.clock);
    if (this.watchdog) clearInterval(this.watchdog);
    this.clock = this.watchdog = null;
  }

  private connect(): void {
    this.es?.close();
    const es = new EventSource(`/api/docs/${this.id}/events`);
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
    es.onopen = () => this.patch({ online: true });
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
  }

  private async resync(): Promise<void> {
    try {
      const since = this.confirmed?.v ?? 0;
      const [doc, log] = await Promise.all([
        api<Doc>('GET', `/api/docs/${this.id}`),
        api<LogEntry[]>('GET', `/api/docs/${this.id}/log?since=${since}&limit=80`),
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
    const recompute = ('doc' in p && p.doc !== this.s.doc) || 'collections' in p || 'now' in p;
    this.s = { ...this.s, ...p };
    if (recompute && this.s.doc) this.evaluate();
    this.publish(transition);
  }

  private evaluate(): void {
    const s = this.s;
    const computed = evaluate(s.doc!, { rows: (name) => s.collections[name] ?? [], now: s.now }, s.computed ?? undefined);
    this.s = { ...s, computed };
    for (const name of computed.collections) if (!(name in s.collections)) void this.loadCollection(name);
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

  toast(text: string): void {
    this.patch({ toast: { text, n: ++this.counter } });
  }

  // ── changing the document ──

  /** Apply ops here at once, then send them. Returns what was applied, or null if they don't apply. */
  dispatch(op: Op | Op[], o: DispatchOptions = {}): Applied | null {
    const doc = this.s.doc;
    if (!doc) return null;
    const ops = (Array.isArray(op[0]) ? op : [op]) as Op[];
    let r: Applied;
    try {
      r = applyOps(doc, ops);
    } catch (e) {
      this.toast(e instanceof Error ? sentence(e.message) : 'That change could not be made.');
      return null;
    }
    const sent = ops.length === 1 ? [r.op] : (r.op.slice(1) as Op[]);
    if (o.undo !== false) {
      const top = this.undoStack.at(-1);
      const now = Date.now();
      if (!(o.key && top?.key === o.key && now - top.ts < 1500)) this.undoStack.push({ op: r.inverse, key: o.key, ts: now });
      else top.ts = now;
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
    return r;
  }

  undo(): void {
    const entry = this.undoStack.pop();
    if (!entry) return;
    const r = this.dispatch(entry.op, { undo: false, transition: true });
    if (r) this.redoStack.push({ op: r.inverse, ts: Date.now() });
    this.patch({ canUndo: this.undoStack.length > 0, canRedo: this.redoStack.length > 0 });
  }

  redo(): void {
    const entry = this.redoStack.pop();
    if (!entry) return;
    const r = this.dispatch(entry.op, { undo: false, transition: true });
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
    if (this.sending || this.closed) return;
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
    this.s = { ...this.s, presence: upsert(this.s.presence, { actor: e.actor, state: 'editing', ts: e.ts }) };
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
    const ls = leaves(doc.root);
    const cur = this.s.selection.at(-1);
    let i = cur ? ls.findIndex((c) => c.id === cur) : delta > 0 ? -1 : 0;
    i = (i + delta + ls.length) % ls.length;
    this.patch({ selection: [ls[i].id], editing: null, seed: null, menu: null });
  }

  openMenu(id: string | null): void {
    this.patch({ menu: id, ...(id ? { selection: [id], editing: null } : {}) });
  }

  setMode(mode: Mode): void {
    this.patch({ mode, selection: [], editing: null, menu: null });
    try {
      const url = new URL(window.location.href);
      if (mode === 'page') url.searchParams.set('view', 'page');
      else url.searchParams.delete('view');
      window.history.replaceState(null, '', url);
    } catch { /* not in a browser */ }
  }

  /** Print the document as pages: switch to the page view, which prints once laid out. */
  print(): void {
    this.patch({ mode: 'page', printing: true, selection: [], editing: null, menu: null });
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
    try {
      const s = this.s;
      const effects = runAction(doc, { rows: (name) => s.collections[name] ?? [], now: Date.now() }, id, todo, action?.vars);
      const ops = effects.filter((e) => e.type === 'op').map((e) => (e as { op: Op }).op);
      if (ops.length) this.dispatch(ops);
      for (const e of effects) {
        const path = e.type === 'op' ? '' : `/api/data/${encodeURIComponent(e.collection)}`;
        if (e.type === 'insert') await api('POST', path, { record: e.record, source: { doc: this.id, cell: id } });
        if (e.type === 'delete') await api('DELETE', `${path}/${encodeURIComponent(e.id)}`);
        if (e.type === 'update') await api('PATCH', `${path}/${encodeURIComponent(e.id)}`, { fields: e.fields });
        if (e.type === 'clear') await api('DELETE', path);
      }
    } catch (e) {
      this.toast(e instanceof Error ? `That button failed: ${e.message}.` : 'That button failed.');
    }
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
