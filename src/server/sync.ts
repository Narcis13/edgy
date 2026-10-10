// Cloud sync: the local SQLite file stays the working store, and everything an
// account owns travels both ways through an append-only log in the cloud
// (Turso; see cloud.ts), one "space" per account.
//
//   push  what changed here: documents the cloud doesn't have (their state and
//         their history), ops made since, and the latest state of every record,
//         deck, pin list, link, access entry and profile that changed (sync_dirty).
//         INSERT … ON CONFLICT(oid) DO NOTHING: sending twice never duplicates.
//   pull  `WHERE space = ? AND seq > ?` on an index: only what is new, never a scan.
//
// The cloud's order is the truth. A document is what its confirmed ops give, in
// cloud order, with this machine's unconfirmed ops replayed on top; when another
// machine's ops came first, the local history is rewritten to that order, so
// every machine ends with the same ops in the same order. An op that no longer
// applies (its cell was removed meanwhile) is kept in the history, marked as a
// conflict, and changes nothing, everywhere. Records merge field by field; the
// rest is last-writer-wins, in cloud order. Deleted things stay deleted.

import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Actor, Doc, Json, Op } from '../core/types';
import { applyOps } from '../core/ops';
import { type Cloud, CloudDown, type Stmt, type Value } from './cloud';
import type { Role, Store } from './store';

export interface SyncHooks {
  /** A document changed under the people looking at it (ops pulled, history rewritten): they load it again. */
  reset(doc: string, v: number): void;
  /** A document was deleted on another machine. */
  deleted(doc: string): void;
  /** Records of a collection changed. */
  data(owner: string, collection: string): void;
  /** A profile changed on another machine; with a new password, its sessions here end. */
  account(id: string, passwordChanged: boolean): void;
  /** An account was deleted on another machine. */
  accountDeleted(id: string): void;
}

export type SyncState = 'off' | 'synced' | 'syncing' | 'offline';

export interface SyncStatus {
  state: SyncState;
  /** Changes made here the cloud doesn't have yet. */
  pending: number;
  lastSyncAt: number | null;
  error: string | null;
  /** Requests, rows read and rows written (what Turso bills), since the server started. */
  stats: { requests: number; rowsRead: number; rowsWritten: number };
  /** Ops another machine's order left with nothing to change. */
  conflicts: number;
}

interface LogRow {
  seq: number;
  oid: string;
  kind: string;
  key: string;
  origin: string;
  ts: number;
  body: string;
}

const PAGE = 500;
const HISTORY_CHUNK = 100;
const STMTS_PER_REQUEST = 100;

export const CLOUD_SCHEMA: Stmt[] = [
  { sql: 'CREATE TABLE IF NOT EXISTS edgy_log (seq INTEGER PRIMARY KEY AUTOINCREMENT, space TEXT NOT NULL, oid TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, key TEXT NOT NULL, origin TEXT NOT NULL, ts INTEGER NOT NULL, body TEXT NOT NULL)' },
  { sql: 'CREATE INDEX IF NOT EXISTS edgy_log_space ON edgy_log (space, seq)' },
  { sql: 'CREATE TABLE IF NOT EXISTS edgy_accounts (id TEXT PRIMARY KEY, email TEXT UNIQUE, body TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER)' },
  { sql: 'CREATE TABLE IF NOT EXISTS edgy_assets (file TEXT PRIMARY KEY, type TEXT NOT NULL, bytes BLOB NOT NULL)' },
];

const insert = (space: string, oid: string, kind: string, key: string, origin: string, body: unknown): Stmt => ({
  sql: 'INSERT INTO edgy_log (space, oid, kind, key, origin, ts, body) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (oid) DO NOTHING',
  args: [space, oid, kind, key, origin, Date.now(), JSON.stringify(body)],
});

/** A document after these ops, one version later. Throws when they no longer apply. */
function step(doc: Doc, ops: Op[]): Doc {
  return { ...applyOps(doc, ops).doc, v: doc.v + 1 };
}

const ASSET_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml' };

export class Sync {
  private origin: string;
  private schemaReady = false;
  private running: Promise<void> | null = null;
  private again = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private kicked: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private lastError: unknown = null;
  private lastSyncAt: number | null = null;
  private conflicts = 0;

  constructor(
    private store: Store,
    private cloud: Cloud,
    private hooks: SyncHooks,
    private opts: { interval?: number; assetsDir?: string } = {},
  ) {
    let origin = store.syncMeta('origin');
    if (!origin) store.setSyncMeta('origin', (origin = randomBytes(6).toString('base64url')));
    this.origin = origin;
  }

  // ── when ──

  /** Sync every few seconds, and soon after each change. */
  start(): void {
    this.stopped = false;
    void this.round();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.kicked) clearTimeout(this.kicked);
  }

  /** Something changed here: send it soon. */
  kick(): void {
    if (this.stopped || this.kicked) return;
    this.kicked = setTimeout(() => {
      this.kicked = null;
      void this.round();
    }, 300);
  }

  private schedule(): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    const every = this.opts.interval ?? 3000;
    // While the cloud can't be reached, try less often.
    this.timer = setTimeout(() => void this.round(), this.lastError instanceof CloudDown ? Math.max(every, 30_000) : every);
  }

  /** One push and pull (or wait for the one under way, and run once more after it). */
  round(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      do {
        this.again = false;
        try {
          await this.once();
          this.lastError = null;
          this.lastSyncAt = Date.now();
        } catch (e) {
          this.lastError = e;
          if (!(e instanceof CloudDown)) console.error('sync:', e instanceof Error ? e.message : e);
          break;
        }
      } while (this.again);
    })().finally(() => {
      this.running = null;
      this.schedule();
    });
    return this.running;
  }

  status(space?: string): SyncStatus {
    const pending = this.store.pendingCount(space);
    const down = this.lastError instanceof CloudDown;
    return {
      state: down ? 'offline' : this.running || pending > 0 ? 'syncing' : 'synced',
      pending,
      lastSyncAt: this.lastSyncAt,
      error: this.lastError ? (this.lastError instanceof Error ? this.lastError.message : String(this.lastError)) : null,
      stats: { ...this.cloud.stats },
      conflicts: this.conflicts,
    };
  }

  private async once(): Promise<void> {
    if (!this.schemaReady) {
      await this.cloud.run(CLOUD_SCHEMA);
      this.schemaReady = true;
    }
    await this.removals();
    await this.pull();
    if (await this.push()) await this.pull();
  }

  // ── accounts in the cloud ──

  /** The account with this email in the cloud: how a new machine signs someone in. */
  async findAccount(email: string): Promise<{ id: string; email: string; name: string; color: string; theme: string | null; password: string | null; createdAt: number } | null> {
    if (!this.schemaReady) {
      await this.cloud.run(CLOUD_SCHEMA);
      this.schemaReady = true;
    }
    const [r] = await this.cloud.run([{ sql: 'SELECT id, email, body FROM edgy_accounts WHERE email = ? AND deleted_at IS NULL', args: [email] }]);
    const row = r.rows[0];
    if (!row) return null;
    return { id: row.id as string, email: row.email as string, ...(JSON.parse(row.body as string) as { name: string; color: string; theme: string | null; password: string | null; createdAt: number }) };
  }

  /** An account was deleted here: its space in the cloud goes too (now, or as soon as the cloud answers). */
  deleteAccount(id: string): void {
    this.store.setSyncMeta(`remove:${id}`, String(Date.now()));
    this.kick();
  }

  private async removals(): Promise<void> {
    for (const id of this.store.syncMetaKeys('remove:')) {
      const space = id.slice('remove:'.length);
      await this.cloud.run([
        { sql: 'DELETE FROM edgy_log WHERE space = ?', args: [space] },
        { sql: "UPDATE edgy_accounts SET email = NULL, body = '{}', deleted_at = ? WHERE id = ?", args: [Date.now(), space] },
        // The one row left: other machines learn the account is gone.
        insert(space, `deleted:${space}`, 'account-deleted', space, this.origin, {}),
      ]);
      this.store.deleteSyncMeta(id);
    }
  }

  /** A picture another machine uploaded, fetched once by its name. */
  async fetchAsset(file: string): Promise<{ type: string; bytes: Uint8Array } | null> {
    const [r] = await this.cloud.run([{ sql: 'SELECT type, bytes FROM edgy_assets WHERE file = ?', args: [file] }]);
    const row = r.rows[0];
    return row ? { type: row.type as string, bytes: row.bytes as Uint8Array } : null;
  }

  // ── push ──

  /** Send what changed here. Returns whether anything went. */
  private async push(): Promise<boolean> {
    const stmts: Stmt[] = [];
    const after: (() => void)[] = [];
    const store = this.store;

    // Documents the cloud doesn't have: their state now, and their history up to it.
    for (const { id, owner } of store.unsentDocs()) {
      const doc = store.getDoc(id);
      if (!doc) continue;
      const created = store.summary(id);
      stmts.push(insert(owner, `create:${id}:${doc.v}`, 'create', id, this.origin, { doc, createdAt: created?.createdAt ?? Date.now(), updatedAt: created?.updatedAt ?? Date.now() }));
      const hist = store.history(id, doc.v);
      for (let i = 0; i < hist.length; i += HISTORY_CHUNK) {
        stmts.push(insert(owner, `hist:${id}:${doc.v}:${i / HISTORY_CHUNK}`, 'hist', id, this.origin, { base: doc.v, entries: hist.slice(i, i + HISTORY_CHUNK) }));
      }
    }
    // Ops after what the cloud confirmed, in order.
    for (const p of store.pendingOps()) {
      stmts.push(insert(p.space, p.oid, 'op', p.doc, this.origin, { v: p.v, ts: p.ts, actor: p.actor, ops: p.ops }));
    }
    // The latest state of everything else that changed.
    for (const d of store.dirtyItems()) {
      const body = this.describe(d.kind, d.key, d.fields);
      if (body !== undefined) {
        stmts.push(insert(d.space, `${this.origin}:${d.n}`, d.kind, d.key, this.origin, body));
        if (d.kind === 'account' && body && typeof body === 'object' && 'email' in body) {
          const a = body as { email: string | null };
          stmts.push({
            sql: 'INSERT INTO edgy_accounts (id, email, body, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET email = excluded.email, body = excluded.body, updated_at = excluded.updated_at',
            args: [d.key, a.email, JSON.stringify(body), Date.now()],
          });
        }
      }
      after.push(() => store.clearDirty(d.kind, d.key, d.n));
    }
    if (!stmts.length && !store.unsentAssets().length) {
      for (const fn of after) fn();
      return false;
    }
    for (let i = 0; i < stmts.length; i += STMTS_PER_REQUEST) await this.cloud.run(stmts.slice(i, i + STMTS_PER_REQUEST));
    for (const fn of after) fn();
    // Pictures, one request each (they can be large).
    for (const file of store.unsentAssets()) {
      const path = this.opts.assetsDir ? join(this.opts.assetsDir, file) : '';
      if (path && existsSync(path)) {
        const type = ASSET_TYPES[file.split('.').pop() ?? ''] ?? 'application/octet-stream';
        await this.cloud.run([{ sql: 'INSERT INTO edgy_assets (file, type, bytes) VALUES (?, ?, ?) ON CONFLICT (file) DO NOTHING', args: [file, type, new Uint8Array(readFileSync(path))] }]);
      }
      store.assetSent(file);
    }
    return true;
  }

  /** What to send about one changed thing: its whole state, the fields that changed, or that it is gone. */
  private describe(kind: string, key: string, fields: string[] | '*'): unknown {
    const s = this.store;
    switch (kind) {
      case 'record': {
        const r = s.record(key);
        if (!r) return { deleted: true };
        const set = fields === '*' ? r.data : Object.fromEntries(fields.filter((f) => f in r.data).map((f) => [f, r.data[f]]));
        return { collection: r.collection, at: r.ts, set, source: r.source, ...(fields === '*' ? { whole: true } : {}) };
      }
      case 'doc':
        return s.getDoc(key) ? undefined : { deleted: true };
      case 'doclib': {
        const lib = s.docLibrary(key);
        return lib ?? undefined;
      }
      case 'pins':
        return { ids: s.pins(key) };
      case 'deck': {
        const d = s.deck(key);
        return d ? { id: d.id, title: d.title, description: d.description, createdAt: d.createdAt, updatedAt: d.updatedAt, archivedAt: d.archivedAt, docs: d.docs } : { deleted: true };
      }
      case 'share':
        return s.share(key) ?? undefined;
      case 'access': {
        const [doc, user] = key.split(' ');
        return { doc, user, role: s.accessOf(doc, user) };
      }
      case 'account': {
        const a = s.accountRow(key);
        return a ? { email: a.email, name: a.name, color: a.color, theme: a.theme, password: a.password, createdAt: a.createdAt } : undefined;
      }
    }
    return undefined;
  }

  // ── pull ──

  private async pull(): Promise<void> {
    let spaces = this.store.spaces();
    while (spaces.length) {
      const results = await this.cloud.run(spaces.map((s) => ({
        sql: 'SELECT seq, oid, kind, key, origin, ts, body FROM edgy_log WHERE space = ? AND seq > ? ORDER BY seq LIMIT ?',
        args: [s.space, s.cursor, PAGE] as Value[],
      })));
      const more: typeof spaces = [];
      spaces.forEach((s, i) => {
        const rows = results[i].rows as unknown as LogRow[];
        // An account's first sync, and the cloud has nothing of it: everything it has here goes up.
        if (!s.ready && !rows.length && s.cursor === 0) this.store.markAll(s.space);
        if (rows.length) this.apply(s.space, rows);
        const cursor = rows.length ? Number(rows[rows.length - 1].seq) : s.cursor;
        // The account may have gone while applying (deleted on another machine).
        if (this.store.user(s.space)) this.store.setCursor(s.space, cursor, true);
        if (rows.length === PAGE) more.push({ ...s, cursor, ready: true });
      });
      spaces = more;
    }
  }

  /** Apply what came down for one account, in cloud order. */
  private apply(space: string, rows: LogRow[]): void {
    const ops = new Map<string, LogRow[]>();
    const flush = (doc: string) => {
      const waiting = ops.get(doc);
      if (waiting) {
        ops.delete(doc);
        this.applyOps(doc, waiting);
      }
    };
    for (const row of rows) {
      if (row.kind === 'op') {
        const list = ops.get(row.key) ?? [];
        list.push(row);
        ops.set(row.key, list);
        continue;
      }
      if (['create', 'hist', 'doc', 'doclib'].includes(row.kind)) flush(row.key);
      if (row.kind === 'account-deleted') {
        this.hooks.accountDeleted(space);
        return;
      }
      this.applyOne(space, row);
    }
    for (const doc of [...ops.keys()]) flush(doc);
  }

  private applyOne(space: string, row: LogRow): void {
    const s = this.store;
    const body = JSON.parse(row.body) as Record<string, unknown>;
    const key = row.key;
    switch (row.kind) {
      case 'create': {
        if (s.isGone('doc', key) || s.syncDoc(key)) return;
        const doc = body.doc as Doc;
        // Ours, coming back: the cloud has it now, as of the version we sent.
        if (!s.getDoc(key)) s.receiveDoc(doc, space, Number(body.createdAt), Number(body.updatedAt));
        s.setSyncDoc(key, space, doc.v, doc);
        if (row.origin !== this.origin) this.hooks.reset(key, doc.v);
        return;
      }
      case 'hist': {
        const sd = s.syncDoc(key);
        // History of a snapshot that wasn't the one the cloud kept: not ours to use.
        if (!sd || Number(body.base) !== s.firstBase(key, sd.baseV)) return;
        const base = Number(body.base);
        s.receiveHistory(key, (body.entries as { v: number; ts: number; actor: Actor; ops: Op[]; oid?: string | null; conflict?: boolean }[]).filter((e) => e.v <= base));
        return;
      }
      case 'doc': {
        if (!body.deleted) return;
        s.markGone('doc', key);
        if (s.getDoc(key)) {
          s.quietly(() => s.deleteDoc(key));
          this.hooks.deleted(key);
        }
        return;
      }
      case 'doclib': {
        if (s.dirtyFields('doclib', key) || !s.getDoc(key)) return;
        s.setDocLibrary(key, (body.archivedAt as number | null) ?? null, (body.reaches as string[] | null) ?? null);
        return;
      }
      case 'pins': {
        if (s.dirtyFields('pins', space)) return;
        s.setPinsFromCloud(space, (body.ids as string[]) ?? []);
        return;
      }
      case 'deck': {
        if (s.dirtyFields('deck', key)) return;
        if (body.deleted) s.receiveDeck(space, null, key);
        else if (!s.isGone('deck', key)) s.receiveDeck(space, body as never, key);
        return;
      }
      case 'share': {
        if (s.dirtyFields('share', key) || !s.getDoc(String(body.doc))) return;
        s.receiveShare(body as never);
        return;
      }
      case 'access': {
        if (s.dirtyFields('access', key) || !s.getDoc(String(body.doc))) return;
        s.receiveAccess(String(body.doc), String(body.user), (body.role as Role | null) ?? null);
        return;
      }
      case 'record': {
        if (body.deleted) {
          const had = s.record(key);
          s.dropRecord(key);
          s.dropDirty('record', key);
          if (had) this.hooks.data(space, had.collection);
          return;
        }
        if (s.isGone('record', key)) return;
        const mine = s.dirtyFields('record', key);
        // A change made here and not sent yet wins over what came before it.
        if (mine === '*' && s.record(key)) return;
        const set = Object.fromEntries(Object.entries(body.set as Record<string, Json>).filter(([f]) => !(Array.isArray(mine) && mine.includes(f))));
        s.receiveRecord(space, String(body.collection), key, Number(body.at), set, (body.source as Json) ?? null);
        this.hooks.data(space, String(body.collection));
        return;
      }
      case 'account': {
        if (s.dirtyFields('account', key) || !s.user(key)) return;
        const before = s.accountRow(key);
        const a = body as { email: string | null; name: string; color: string; theme: string | null; password: string | null };
        s.receiveAccount({ id: key, email: a.email, name: a.name, color: a.color, theme: a.theme, password: a.password });
        this.hooks.account(key, !!before && before.password !== a.password);
        return;
      }
    }
  }

  /**
   * Ops that came down for one document. When they are exactly this machine's
   * next unconfirmed ops, they are confirmed where they are. Otherwise the
   * confirmed state moves to include them, in their order, and this machine's
   * unconfirmed ops are replayed after them (one that no longer applies is dropped).
   */
  private applyOps(docId: string, rows: LogRow[]): void {
    const s = this.store;
    const sd = s.syncDoc(docId);
    if (!sd || s.isGone('doc', docId)) return;
    const pending = s.pendingOps(docId);
    const read = (r: LogRow) => JSON.parse(r.body) as { v: number; ts: number; actor: Actor; ops: Op[] };
    // One step in cloud order; an op that no longer applies is a conflict: a version that changes nothing.
    const attempt = (doc: Doc, ops: Op[]): { doc: Doc; conflict: boolean } => {
      try {
        return { doc: step(doc, ops), conflict: false };
      } catch {
        return { doc: { ...doc, v: doc.v + 1 }, conflict: true };
      }
    };
    if (rows.length <= pending.length && rows.every((r, i) => pending[i].oid === r.oid)) {
      // Ours, in our order: confirmed where they are (unless the cloud's order turns out a conflict differently).
      let base = sd.base;
      let same = true;
      rows.forEach((r, i) => {
        const a = attempt(base, read(r).ops);
        base = a.doc;
        if (a.conflict !== pending[i].conflict) same = false;
      });
      if (same) {
        s.setSyncDoc(docId, sd.space, sd.baseV + rows.length, base);
        s.confirmOps(docId, rows.map((r) => ({ oid: r.oid, seq: Number(r.seq) })));
        return;
      }
    }
    // Another machine's ops came first: rebuild on the confirmed state, in cloud order.
    let cur = sd.base;
    const entries: { v: number; ts: number; actor: Actor; ops: Op[]; oid: string; seq?: number; conflict?: boolean }[] = [];
    for (const r of rows) {
      const e = read(r);
      const a = attempt(cur, e.ops);
      cur = a.doc;
      if (a.conflict) this.conflicts++;
      entries.push({ v: cur.v, ts: e.ts, actor: e.actor, ops: e.ops, oid: r.oid, seq: Number(r.seq), ...(a.conflict ? { conflict: true } : {}) });
    }
    const base = cur;
    const seen = new Set(rows.map((r) => r.oid));
    // Ours not confirmed yet, after them. One that no longer applies stays in the history as a conflict and is still sent,
    // so every machine shows it the same way.
    for (const p of pending) {
      if (seen.has(p.oid)) continue;
      const a = attempt(cur, p.ops);
      cur = a.doc;
      if (a.conflict && !p.conflict) this.conflicts++;
      entries.push({ v: cur.v, ts: p.ts, actor: p.actor, ops: p.ops, oid: p.oid, ...(a.conflict ? { conflict: true } : {}) });
    }
    s.rewriteHistory(cur, sd.baseV, entries);
    s.setSyncDoc(docId, sd.space, base.v, base);
    this.hooks.reset(docId, cur.v);
  }
}
