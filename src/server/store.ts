// Storage: one SQLite file, every payload a JSON column.
//
//   docs       the current state of each document, plus what the library shows of it
//   ops        the append-only history of what changed, by whom
//   records    rows saved from documents into named collections
//   messages   the conversation between people and agents on a document
//   decks      ordered sets of documents that play as slides
//   deck_docs  which documents a deck holds, in order (a document is in at most one)
//   shares     links that open one document for someone else, "view" or "edit", and the
//              collections they may reach
//   users      accounts: email, a scrypt hash of the password, name, colour, theme
//   sessions   signed-in browsers, by the SHA-256 of their cookie
//   api_keys   keys agents use for a person, by the SHA-256 of the key
//   doc_access who else may open a document, as viewer or editor
//   sync_*     what the cloud has confirmed and what is still to send (see sync.ts)
//
// Every document, deck and record has an owner (an account). What the library
// shows, pins and archives is the owner's arrangement of their own things.
//
// The schema's version is SQLite's user_version; opening an older file
// migrates it in place (see `migrate`).

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { Actor, Doc, Json, Op } from '../core/types';
import { type Shape, describe, docText, shapeOf } from '../core/library';

export interface DocSummary {
  id: string;
  /** The account it belongs to (null only before the first account exists). */
  owner: string | null;
  title: string;
  description: string;
  v: number;
  createdAt: number;
  updatedAt: number;
  /** Position among the pinned (1 first), or null. */
  pinned: number | null;
  archivedAt: number | null;
  /** The deck it belongs to, or null. */
  deck: string | null;
  /** Which share links are on, and how many people besides the owner may open it. */
  shared: { view: boolean; edit: boolean; people: number };
  shape: Shape;
}

export interface Deck {
  id: string;
  owner: string | null;
  title: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  pinned: number | null;
  archivedAt: number | null;
  /** Its documents' ids, in order. */
  docs: string[];
}

export type Access = 'view' | 'edit';

export interface Share {
  token: string;
  doc: string;
  access: Access;
  createdAt: number;
  /** When it was turned off; an old link then says so instead of "not found". */
  revokedAt: number | null;
  /**
   * The collections the link may read (and with "edit", write): those the
   * document used when its owner last changed it. Never what a guest's own
   * changes make it read.
   */
  collections: string[];
}

export interface LogEntry {
  v: number;
  ts: number;
  actor: Actor;
  ops: Op[];
  conflict?: boolean;
}

export interface Message {
  id: number;
  ts: number;
  actor: Actor;
  text: string;
  cell?: string;
}

export type Row = { id: string; at: number } & Record<string, Json>;

/** What someone other than the owner may do with a document. */
export type Role = 'viewer' | 'editor';

export interface User {
  id: string;
  /** Null for the local account until its person gives it one. */
  email: string | null;
  name: string;
  color: string;
  theme: 'light' | 'dark' | null;
  createdAt: number;
  updatedAt: number;
  /** The account local mode signs in by itself. */
  local: boolean;
  hasPassword: boolean;
}

export interface ApiKey {
  id: string;
  userId: string;
  name: string;
  /** The first characters of the key, so a person can tell keys apart. */
  prefix: string;
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
}

export interface Person {
  id: string;
  name: string;
  email: string | null;
  color: string;
  role: Role | 'owner';
}

export const shortId = (n = 8) => randomBytes(n).toString('base64url').replace(/[-_]/g, 'x').slice(0, n).toLowerCase();
/** A share link's secret: 32 random bytes, 43 characters. */
export const newToken = () => randomBytes(32).toString('base64url');

/** The schema this code writes. 1: docs, ops, records, messages. 2: the library. 3: the collections a link reaches. 4: accounts. 5: sync. 6: secrets a document's owner approved. */
export const SCHEMA = 6;

/** A globally unique id for something to sync (an op, a change). */
export const newOid = () => randomBytes(9).toString('base64url');

/** Columns version 2 added to docs, with their definitions. */
const DOC_COLUMNS: [string, string][] = [
  ['description', "TEXT NOT NULL DEFAULT ''"],
  ['text', "TEXT NOT NULL DEFAULT ''"],
  ['shape', 'TEXT'],
  ['pinned', 'INTEGER'],
  ['archived_at', 'INTEGER'],
];

/** What the library keeps beside a document's body: its description, words and shape. */
function derived(doc: Doc): [string, string, string] {
  return [describe(doc), docText(doc), JSON.stringify(shapeOf(doc.root))];
}

const num = (v: unknown): number | null => (v == null ? null : Number(v));

export class Store {
  private db: DatabaseSync;
  private cache = new Map<string, Doc>();

  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    // With WAL, NORMAL loses at most the last commits on a power cut, never the file; FULL waits for the disk on every one.
    // Another process (a backup, the sqlite shell) holding the file a moment is waited for, not an error.
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS docs (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL,
        v INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS ops (
        doc_id TEXT NOT NULL, v INTEGER NOT NULL, ts INTEGER NOT NULL, actor TEXT NOT NULL, ops TEXT NOT NULL,
        PRIMARY KEY (doc_id, v));
      CREATE TABLE IF NOT EXISTS records (
        id TEXT PRIMARY KEY, collection TEXT NOT NULL, data TEXT NOT NULL, ts INTEGER NOT NULL, source TEXT);
      CREATE INDEX IF NOT EXISTS records_by_collection ON records (collection, ts);
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT, doc_id TEXT NOT NULL, ts INTEGER NOT NULL,
        actor TEXT NOT NULL, text TEXT NOT NULL, cell TEXT);
      CREATE INDEX IF NOT EXISTS messages_by_doc ON messages (doc_id, id);
    `);
    this.migrate();
    this.pruneSessions();
  }

  /**
   * Run fn as one transaction: all of its writes, or (when it throws) none.
   * Called inside another, it is a savepoint of that one, so a step can fail
   * alone and its caller still decides about the rest.
   */
  transaction<T>(fn: () => T): T {
    // Counted here rather than asked of the database (isTransaction), which Node only has from 22.16.
    const level = this.depth++;
    const mark = `level${level}`;
    this.db.exec(level ? `SAVEPOINT ${mark}` : 'BEGIN');
    try {
      const out = fn();
      this.db.exec(level ? `RELEASE ${mark}` : 'COMMIT');
      return out;
    } catch (e) {
      // (SQLite may have ended the transaction itself, on a full disk say: then there is nothing to roll back.)
      try {
        this.db.exec(level ? `ROLLBACK TO ${mark}; RELEASE ${mark}` : 'ROLLBACK');
      } catch { /* already ended */ }
      // A document cached meanwhile may be one that is no longer stored.
      this.cache.clear();
      throw e;
    } finally {
      this.depth--;
    }
  }
  private depth = 0;

  /** Bring a file written by an older version up to SCHEMA, in place and all at once. */
  private migrate(): void {
    const version = Number((this.db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);
    if (version >= SCHEMA) return;
    this.transaction(() => {
      if (version < 2) this.toLibrary();
      // 3: a link remembers the collections it may reach (a link made before reaches none until the owner next edits).
      if (!this.columns('shares').has('collections')) this.db.exec("ALTER TABLE shares ADD COLUMN collections TEXT NOT NULL DEFAULT '[]'");
      if (version < 4) this.toAccounts();
      if (version < 5) this.toSync();
      if (version < 6) this.toTrusted();
      this.db.exec(`PRAGMA user_version = ${SCHEMA}`);
    });
  }

  private columns(table: string): Set<string> {
    return new Set(this.db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name as string));
  }

  /** 2: the library's columns and tables, filled in from each document's body. */
  private toLibrary(): void {
    const have = this.columns('docs');
    for (const [name, def] of DOC_COLUMNS) if (!have.has(name)) this.db.exec(`ALTER TABLE docs ADD COLUMN ${name} ${def}`);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS decks (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, pinned INTEGER, archived_at INTEGER);
      CREATE TABLE IF NOT EXISTS deck_docs (
        deck_id TEXT NOT NULL, doc_id TEXT NOT NULL UNIQUE, pos INTEGER NOT NULL, PRIMARY KEY (deck_id, doc_id));
      CREATE TABLE IF NOT EXISTS shares (
        token TEXT PRIMARY KEY, doc_id TEXT NOT NULL, access TEXT NOT NULL, created_at INTEGER NOT NULL, revoked_at INTEGER);
      CREATE INDEX IF NOT EXISTS shares_by_doc ON shares (doc_id);
    `);
    // What the library shows of each document comes from its body; bodies and history are not touched.
    const update = this.db.prepare('UPDATE docs SET description = ?, text = ?, shape = ? WHERE id = ?');
    for (const r of this.db.prepare('SELECT id, body FROM docs').all()) {
      update.run(...derived(JSON.parse(r.body as string) as Doc), r.id as string);
    }
  }

  /**
   * 4: accounts. Documents, decks and records get an owner column, empty until
   * the first account claims them (see `claimOrphans`); nothing else changes.
   * A document's `reaches` (the collections its owner let it use) starts as
   * those its links reached; null means "work it out on first use".
   */
  private toAccounts(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, email TEXT UNIQUE, name TEXT NOT NULL, color TEXT NOT NULL, password TEXT,
        theme TEXT, local INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (
        hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, seen_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL, agent TEXT);
      CREATE INDEX IF NOT EXISTS sessions_by_user ON sessions (user_id);
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, hash TEXT NOT NULL UNIQUE, prefix TEXT NOT NULL,
        created_at INTEGER NOT NULL, last_used_at INTEGER, revoked_at INTEGER);
      CREATE TABLE IF NOT EXISTS doc_access (
        doc_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, granted_at INTEGER NOT NULL,
        PRIMARY KEY (doc_id, user_id));
      CREATE INDEX IF NOT EXISTS doc_access_by_user ON doc_access (user_id);
    `);
    for (const [table, cols] of [['docs', ['owner', 'reaches']], ['decks', ['owner']], ['records', ['owner']]] as const) {
      const have = this.columns(table);
      for (const col of cols) if (!have.has(col)) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} TEXT`);
    }
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS docs_by_owner ON docs (owner);
      CREATE INDEX IF NOT EXISTS records_by_owner ON records (owner, collection, ts);
    `);
    // What a document's links reached is what it reaches.
    for (const r of this.db.prepare("SELECT doc_id, collections FROM shares WHERE collections != '[]'").all()) {
      const had = JSON.parse((this.db.prepare('SELECT reaches FROM docs WHERE id = ?').get(r.doc_id as string)?.reaches as string | null) ?? '[]') as string[];
      const names = [...new Set([...had, ...(JSON.parse(r.collections as string) as string[])])];
      this.db.prepare('UPDATE docs SET reaches = ? WHERE id = ?').run(JSON.stringify(names), r.doc_id as string);
    }
  }

  /**
   * 5: sync. Every op gets a global id (oid) and, once the cloud has it, its
   * place there (seq); ops from before have neither and travel as history.
   * sync_docs keeps each document as the cloud last confirmed it; sync_dirty
   * what changed here and is still to send; sync_gone what was deleted, so a
   * late change to it doesn't bring it back.
   */
  /**
   * 6: a document's `trusted` list says which fetch cell may send which of the
   * server's secrets to which origin, as its owner last left it; and the server
   * remembers whose secrets those are (its first account), rather than guessing.
   */
  private toTrusted(): void {
    if (!this.columns('docs').has('trusted')) this.db.exec('ALTER TABLE docs ADD COLUMN trusted TEXT');
    const first = this.db.prepare('SELECT id FROM users ORDER BY created_at LIMIT 1').get();
    if (first) this.db.prepare("INSERT OR IGNORE INTO sync_meta (key, value) VALUES ('server-owner', ?)").run(first.id as string);
  }

  private toSync(): void {
    const have = this.columns('ops');
    for (const [col, def] of [['oid', 'TEXT'], ['seq', 'INTEGER'], ['conflict', 'INTEGER']]) if (!have.has(col)) this.db.exec(`ALTER TABLE ops ADD COLUMN ${col} ${def}`);
    this.db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS ops_by_oid ON ops (oid) WHERE oid IS NOT NULL;
      CREATE TABLE IF NOT EXISTS sync_docs (doc_id TEXT PRIMARY KEY, space TEXT NOT NULL, base_v INTEGER NOT NULL, base_body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sync_spaces (space TEXT PRIMARY KEY, cursor INTEGER NOT NULL DEFAULT 0, ready INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS sync_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sync_dirty (kind TEXT NOT NULL, key TEXT NOT NULL, space TEXT NOT NULL, n INTEGER NOT NULL, fields TEXT NOT NULL, PRIMARY KEY (kind, key));
      CREATE TABLE IF NOT EXISTS sync_gone (kind TEXT NOT NULL, key TEXT NOT NULL, PRIMARY KEY (kind, key));
      CREATE TABLE IF NOT EXISTS sync_assets (file TEXT PRIMARY KEY);
    `);
  }

  /** The schema version of the open file. */
  version(): number {
    return Number((this.db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);
  }

  // ── documents ──

  /** Summaries of one owner's documents; with no owner, of every document (for the server's own use). */
  listDocs(owner?: string): DocSummary[] {
    return this.summaries(owner === undefined ? '' : 'WHERE owner IS ?', owner === undefined ? [] : [owner]);
  }

  /** The documents other people gave this account access to, with its role. */
  sharedWith(userId: string): (DocSummary & { role: Role })[] {
    const roles = new Map(this.db.prepare('SELECT doc_id, role FROM doc_access WHERE user_id = ?').all(userId).map((r) => [r.doc_id as string, r.role as Role]));
    if (!roles.size) return [];
    return this.summaries('WHERE id IN (SELECT doc_id FROM doc_access WHERE user_id = ?)', [userId]).map((d) => ({ ...d, role: roles.get(d.id)! }));
  }

  private summaries(where: string, args: (string | null)[]): DocSummary[] {
    const decks = new Map(this.db.prepare('SELECT doc_id, deck_id FROM deck_docs').all().map((r) => [r.doc_id as string, r.deck_id as string]));
    const shared = new Map<string, { view: boolean; edit: boolean; people: number }>();
    const flags = (id: string) => {
      let s = shared.get(id);
      if (!s) shared.set(id, (s = { view: false, edit: false, people: 0 }));
      return s;
    };
    for (const r of this.db.prepare('SELECT doc_id, access FROM shares WHERE revoked_at IS NULL').all()) flags(r.doc_id as string)[r.access as Access] = true;
    for (const r of this.db.prepare('SELECT doc_id, COUNT(*) AS n FROM doc_access GROUP BY doc_id').all()) flags(r.doc_id as string).people = Number(r.n);
    const rows = this.db.prepare(`SELECT id, owner, title, description, shape, v, created_at, updated_at, pinned, archived_at FROM docs ${where} ORDER BY updated_at DESC`).all(...args);
    return rows.map((r) => ({
      id: r.id as string,
      owner: (r.owner as string | null) ?? null,
      title: r.title as string,
      description: r.description as string,
      v: r.v as number,
      createdAt: r.created_at as number,
      updatedAt: r.updated_at as number,
      pinned: num(r.pinned),
      archivedAt: num(r.archived_at),
      deck: decks.get(r.id as string) ?? null,
      shared: shared.get(r.id as string) ?? { view: false, edit: false, people: 0 },
      shape: r.shape ? (JSON.parse(r.shape as string) as Shape) : { k: 'empty' },
    }));
  }

  summary(id: string): DocSummary | null {
    return this.summaries('WHERE id = ?', [id])[0] ?? null;
  }

  /** What search reads: each document's title, description and words (one owner's, or these documents'). */
  texts(owner?: string, ids?: string[]): { id: string; title: string; description: string; text: string }[] {
    const rows = ids ? this.db.prepare(`SELECT id, title, description, text FROM docs WHERE id IN (${ids.map(() => '?').join(',') || "''"})`).all(...ids)
      : this.db.prepare('SELECT id, title, description, text FROM docs WHERE owner IS ?').all(owner ?? null);
    return rows.map((r) => ({
      id: r.id as string, title: r.title as string, description: r.description as string, text: r.text as string,
    }));
  }

  /** Who a document belongs to: an account id, null before the first account, undefined when there is no such document. */
  docOwner(id: string): string | null | undefined {
    const r = this.db.prepare('SELECT owner FROM docs WHERE id = ?').get(id);
    return r ? ((r.owner as string | null) ?? null) : undefined;
  }

  getDoc(id: string): Doc | null {
    const hit = this.cache.get(id);
    if (hit) return hit;
    const row = this.db.prepare('SELECT body FROM docs WHERE id = ?').get(id);
    if (!row) return null;
    const doc = JSON.parse(row.body as string) as Doc;
    this.cache.set(id, doc);
    return doc;
  }

  createDoc(doc: Doc, owner: string | null = null): void {
    const now = Date.now();
    this.db.prepare('INSERT INTO docs (id, title, body, v, created_at, updated_at, description, text, shape, owner) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(doc.id, doc.meta.title, JSON.stringify(doc), doc.v, now, now, ...derived(doc), owner);
    this.cache.set(doc.id, doc);
  }

  /** Save the new state and the ops that produced it, together. */
  saveDoc(doc: Doc, actor: Actor, ops: Op[]): number {
    const now = Date.now();
    this.transaction(() => {
      this.db.prepare('UPDATE docs SET title = ?, body = ?, v = ?, updated_at = ?, description = ?, text = ?, shape = ? WHERE id = ?')
        .run(doc.meta.title, JSON.stringify(doc), doc.v, now, ...derived(doc), doc.id);
      this.db.prepare('INSERT INTO ops (doc_id, v, ts, actor, ops, oid) VALUES (?, ?, ?, ?, ?, ?)')
        .run(doc.id, doc.v, now, JSON.stringify(actor), JSON.stringify(ops), newOid());
    });
    this.cache.set(doc.id, doc);
    this.onChange?.();
    return now;
  }

  /** Gone for good: the document, its history, its messages, its links and its place in a deck. Records stay with their collections. */
  deleteDoc(id: string): boolean {
    this.cache.delete(id);
    return this.transaction(() => {
      this.db.prepare('DELETE FROM ops WHERE doc_id = ?').run(id);
      this.db.prepare('DELETE FROM messages WHERE doc_id = ?').run(id);
      this.db.prepare('DELETE FROM shares WHERE doc_id = ?').run(id);
      this.db.prepare('DELETE FROM deck_docs WHERE doc_id = ?').run(id);
      this.db.prepare('DELETE FROM doc_access WHERE doc_id = ?').run(id);
      const owner = this.docOwner(id);
      const synced = !!this.db.prepare('SELECT 1 FROM sync_docs WHERE doc_id = ?').get(id);
      this.db.prepare('DELETE FROM sync_docs WHERE doc_id = ?').run(id);
      const ok = this.db.prepare('DELETE FROM docs WHERE id = ?').run(id).changes > 0;
      // The pinned close up behind it.
      if (ok) this.renumberPins(owner ?? null);
      if (ok) this.gone('doc', id);
      // Sent or on its way (a push may be in flight): other machines must hear it went.
      if (ok) this.dirty('doc', id, owner ?? null);
      if (ok && !synced) this.db.prepare("DELETE FROM sync_dirty WHERE kind = 'doclib' AND key = ?").run(id);
      return ok;
    });
  }

  log(docId: string, since = 0, limit = 200): LogEntry[] {
    const rows = this.db.prepare('SELECT v, ts, actor, ops, conflict FROM ops WHERE doc_id = ? AND v > ? ORDER BY v DESC LIMIT ?').all(docId, since, limit);
    return rows.reverse().map((r) => ({
      v: r.v as number,
      ts: r.ts as number,
      actor: JSON.parse(r.actor as string),
      ops: JSON.parse(r.ops as string),
      // Sync put it after another machine's change it no longer applies to: it changed nothing.
      ...(r.conflict ? { conflict: true } : {}),
    }));
  }

  // ── the library: archive and pins, for documents and decks alike; each owner pins their own ──

  private table(id: string): 'docs' | 'decks' {
    return isDeckId(id) ? 'decks' : 'docs';
  }

  private exists(id: string): boolean {
    return !!this.db.prepare(`SELECT 1 FROM ${this.table(id)} WHERE id = ?`).get(id);
  }

  /** Who a document or a deck belongs to. */
  ownerOf(id: string): string | null {
    return (this.db.prepare(`SELECT owner FROM ${this.table(id)} WHERE id = ?`).get(id)?.owner as string | null | undefined) ?? null;
  }

  /** Archive (or bring back) a document or a deck. Archiving unpins it. False when there is no such thing. */
  setArchived(id: string, archived: boolean): boolean {
    if (!this.exists(id)) return false;
    this.transaction(() => {
      if (archived) {
        this.db.prepare(`UPDATE ${this.table(id)} SET archived_at = COALESCE(archived_at, ?), pinned = NULL WHERE id = ?`).run(Date.now(), id);
        this.renumberPins(this.ownerOf(id));
      } else this.db.prepare(`UPDATE ${this.table(id)} SET archived_at = NULL WHERE id = ?`).run(id);
      this.dirty(isDeckId(id) ? 'deck' : 'doclib', id, this.ownerOf(id));
    });
    return true;
  }

  /** An owner's pinned documents and decks, in their order. */
  pins(owner: string | null): string[] {
    return this.db.prepare(`
      SELECT id, pinned FROM docs WHERE pinned IS NOT NULL AND owner IS ?
      UNION ALL SELECT id, pinned FROM decks WHERE pinned IS NOT NULL AND owner IS ?
      ORDER BY pinned`).all(owner, owner).map((r) => r.id as string);
  }

  /** Pin at the end of its owner's pinned, or unpin. Archived things can't be pinned. */
  setPinned(id: string, pinned: boolean): boolean {
    if (!this.exists(id)) return false;
    const owner = this.ownerOf(id);
    if (pinned && this.pins(owner).includes(id)) return true;
    const pins = this.pins(owner).filter((x) => x !== id);
    if (pinned) {
      const archived = this.db.prepare(`SELECT archived_at FROM ${this.table(id)} WHERE id = ?`).get(id)?.archived_at;
      if (archived != null) return false;
      pins.push(id);
    }
    this.transaction(() => {
      if (!pinned) this.db.prepare(`UPDATE ${this.table(id)} SET pinned = NULL WHERE id = ?`).run(id);
      this.writePins(owner, pins);
    });
    return true;
  }

  /**
   * Put an owner's pinned in this order. Ids given that aren't pinned are ignored;
   * pinned ones left out keep their order after those given.
   */
  orderPins(owner: string | null, ids: string[]): string[] {
    const pins = this.pins(owner);
    // Sets, not indexOf: the list comes from a request, and may be long.
    const pinned = new Set(pins);
    const given = new Set(ids.filter((id) => pinned.has(id)));
    this.writePins(owner, [...given, ...pins.filter((id) => !given.has(id))]);
    return this.pins(owner);
  }

  private writePins(owner: string | null, ids: string[]): void {
    this.transaction(() => {
      ids.forEach((id, i) => this.db.prepare(`UPDATE ${this.table(id)} SET pinned = ? WHERE id = ?`).run(i + 1, id));
      this.dirty('pins', owner ?? '', owner);
    });
  }

  private renumberPins(owner: string | null): void {
    this.writePins(owner, this.pins(owner));
  }

  /** Put pins as the cloud says, quietly: these ids pinned in this order, the owner's others unpinned. */
  setPinsFromCloud(owner: string, ids: string[]): void {
    this.quietly(() => this.transaction(() => {
      for (const t of ['docs', 'decks']) this.db.prepare(`UPDATE ${t} SET pinned = NULL WHERE owner = ?`).run(owner);
      // Only this owner's things can be in this owner's pins.
      ids.filter((id) => this.exists(id) && this.ownerOf(id) === owner).forEach((id, i) => this.db.prepare(`UPDATE ${this.table(id)} SET pinned = ? WHERE id = ?`).run(i + 1, id));
    }));
  }

  // ── decks ──

  /** One owner's decks; with no owner, every deck. */
  decks(owner?: string | null): Deck[] {
    const members = new Map<string, string[]>();
    for (const r of this.db.prepare('SELECT deck_id, doc_id FROM deck_docs ORDER BY deck_id, pos').all()) {
      const list = members.get(r.deck_id as string) ?? [];
      list.push(r.doc_id as string);
      members.set(r.deck_id as string, list);
    }
    const where = owner === undefined ? '' : 'WHERE owner IS ?';
    return this.db.prepare(`SELECT id, owner, title, description, created_at, updated_at, pinned, archived_at FROM decks ${where} ORDER BY updated_at DESC`).all(...(owner === undefined ? [] : [owner])).map((r) => ({
      id: r.id as string,
      owner: (r.owner as string | null) ?? null,
      title: r.title as string,
      description: r.description as string,
      createdAt: r.created_at as number,
      updatedAt: r.updated_at as number,
      pinned: num(r.pinned),
      archivedAt: num(r.archived_at),
      docs: members.get(r.id as string) ?? [],
    }));
  }

  deck(id: string): Deck | null {
    const owner = this.db.prepare('SELECT owner FROM decks WHERE id = ?').get(id);
    return owner ? (this.decks((owner.owner as string | null) ?? null).find((d) => d.id === id) ?? null) : null;
  }

  /** Group an owner's documents into a new deck, in this order. A document already in another deck moves. */
  createDeck(title: string, description: string, docs: string[], owner: string | null = null): Deck {
    const id = 'deck-' + shortId(7);
    const now = Date.now();
    this.transaction(() => {
      this.db.prepare('INSERT INTO decks (id, title, description, created_at, updated_at, owner) VALUES (?, ?, ?, ?, ?, ?)').run(id, title, description, now, now, owner);
      this.putDocs(id, docs);
      this.dirty('deck', id, owner);
    });
    return this.deck(id)!;
  }

  /** Change a deck's title or description. */
  updateDeck(id: string, fields: { title?: string; description?: string }): Deck | null {
    if (!this.exists(id)) return null;
    this.transaction(() => {
      if (fields.title !== undefined) this.db.prepare('UPDATE decks SET title = ? WHERE id = ?').run(fields.title, id);
      if (fields.description !== undefined) this.db.prepare('UPDATE decks SET description = ? WHERE id = ?').run(fields.description, id);
      this.db.prepare('UPDATE decks SET updated_at = ? WHERE id = ?').run(Date.now(), id);
      this.dirty('deck', id, this.ownerOf(id));
    });
    return this.deck(id);
  }

  /** The deck's documents become exactly these, in this order: reorder, add and take out in one. */
  setDeckDocs(id: string, docs: string[]): Deck | null {
    if (!this.exists(id)) return null;
    this.transaction(() => {
      this.db.prepare('DELETE FROM deck_docs WHERE deck_id = ?').run(id);
      this.putDocs(id, docs);
      this.db.prepare('UPDATE decks SET updated_at = ? WHERE id = ?').run(Date.now(), id);
      this.dirty('deck', id, this.ownerOf(id));
    });
    return this.deck(id);
  }

  private putDocs(deck: string, docs: string[]): void {
    // A Set, not indexOf: the list comes from a request, and may be long.
    const unique = [...new Set(docs)];
    // A deck holds its owner's documents only; someone else's is "no document" here.
    const owner = this.ownerOf(deck);
    const mine = this.db.prepare('SELECT 1 FROM docs WHERE id = ? AND owner IS ?');
    const missing = unique.filter((d) => !mine.get(d, owner));
    if (missing.length) throw new StoreError(`no document ${missing.join(', ')}`);
    unique.forEach((doc, i) => {
      // A document moving from another deck changes that deck too.
      const was = this.db.prepare('SELECT deck_id FROM deck_docs WHERE doc_id = ?').get(doc)?.deck_id as string | undefined;
      if (was && was !== deck) this.dirty('deck', was, owner);
      this.db.prepare('DELETE FROM deck_docs WHERE doc_id = ?').run(doc);
      this.db.prepare('INSERT INTO deck_docs (deck_id, doc_id, pos) VALUES (?, ?, ?)').run(deck, doc, i);
    });
  }

  /** Ungroup: the deck goes, its documents stay and come back to the list. */
  deleteDeck(id: string): boolean {
    const owner = this.ownerOf(id);
    return this.transaction(() => {
      this.db.prepare('DELETE FROM deck_docs WHERE deck_id = ?').run(id);
      const ok = this.db.prepare('DELETE FROM decks WHERE id = ?').run(id).changes > 0;
      if (ok) this.renumberPins(owner);
      if (ok) {
        this.gone('deck', id);
        this.dirty('deck', id, owner);
      }
      return ok;
    });
  }

  // ── share links ──

  shares(docId: string): Share[] {
    return this.db.prepare('SELECT token, doc_id, access, created_at, revoked_at, collections FROM shares WHERE doc_id = ? ORDER BY created_at').all(docId).map(shareOf);
  }

  share(token: string): Share | null {
    const r = this.db.prepare('SELECT token, doc_id, access, created_at, revoked_at, collections FROM shares WHERE token = ?').get(token);
    return r ? shareOf(r) : null;
  }

  /** Turn a link on: the one already on for this access, or a new token. It reaches these collections. */
  openShare(docId: string, access: Access, collections: string[]): Share {
    const on = this.shares(docId).find((s) => s.access === access && s.revokedAt == null);
    if (on) return on;
    const token = newToken();
    this.transaction(() => {
      this.db.prepare('INSERT INTO shares (token, doc_id, access, created_at, collections) VALUES (?, ?, ?, ?, ?)')
        .run(token, docId, access, Date.now(), JSON.stringify(collections));
      this.dirty('share', token, this.docOwner(docId) ?? null);
    });
    return this.share(token)!;
  }

  /** The collections a document's owner let it use, or null when not worked out yet. */
  reaches(docId: string): string[] | null {
    const r = this.db.prepare('SELECT reaches FROM docs WHERE id = ?').get(docId);
    return r?.reaches ? (JSON.parse(r.reaches as string) as string[]) : null;
  }

  /** The owner changed the document: it (and its links) reach the collections it uses now. */
  setReaches(docId: string, collections: string[]): void {
    const json = JSON.stringify(collections);
    const before = this.db.prepare('SELECT reaches FROM docs WHERE id = ?').get(docId)?.reaches;
    if (before === json) return;
    this.transaction(() => {
      this.db.prepare('UPDATE docs SET reaches = ? WHERE id = ?').run(json, docId);
      this.db.prepare('UPDATE shares SET collections = ? WHERE doc_id = ? AND revoked_at IS NULL').run(json, docId);
      const owner = this.docOwner(docId) ?? null;
      this.dirty('doclib', docId, owner);
      for (const s of this.shares(docId)) if (s.revokedAt == null) this.dirty('share', s.token, owner);
    });
  }

  /** Turn a link off for good. The token stays known, so it can say it was turned off. */
  closeShare(token: string): Share | null {
    return this.transaction(() => {
      this.db.prepare('UPDATE shares SET revoked_at = COALESCE(revoked_at, ?) WHERE token = ?').run(Date.now(), token);
      const s = this.share(token);
      if (s) this.dirty('share', token, this.docOwner(s.doc) ?? null);
      return s;
    });
  }

  // ── collections ──

  // Every collection belongs to an account: two people's "orders" are two collections.

  collections(owner: string | null): { name: string; count: number; updatedAt: number }[] {
    const rows = this.db.prepare('SELECT collection, COUNT(*) AS n, MAX(ts) AS ts FROM records WHERE owner IS ? GROUP BY collection ORDER BY collection').all(owner);
    return rows.map((r) => ({ name: r.collection as string, count: r.n as number, updatedAt: r.ts as number }));
  }

  rows(owner: string | null, collection: string): Row[] {
    const rows = this.db.prepare('SELECT id, data, ts FROM records WHERE owner IS ? AND collection = ? ORDER BY ts, rowid').all(owner, collection);
    return rows.map((r) => ({ ...(JSON.parse(r.data as string) as Record<string, Json>), id: r.id as string, at: r.ts as number }));
  }

  insert(owner: string | null, collection: string, data: Record<string, Json>, source?: Json): Row {
    // Ids are global (every account, every machine, one table in the cloud): long enough never to meet. Older, shorter ones still work.
    const id = 'r' + shortId(16);
    const ts = Date.now();
    const { id: _i, at: _a, ...clean } = data;
    this.transaction(() => {
      this.db.prepare('INSERT INTO records (id, collection, data, ts, source, owner) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, collection, JSON.stringify(clean), ts, source == null ? null : JSON.stringify(source), owner);
      this.dirty('record', id, owner);
    });
    return { ...clean, id, at: ts };
  }

  /** Merge fields into a saved record; null when there is no such record. id and at can't be changed. */
  update(owner: string | null, collection: string, id: string, fields: Record<string, Json>): Row | null {
    return this.transaction(() => {
      const r = this.db.prepare('SELECT data, ts FROM records WHERE owner IS ? AND collection = ? AND id = ?').get(owner, collection, id);
      if (!r) return null;
      const { id: _i, at: _a, ...clean } = fields;
      const data = { ...(JSON.parse(r.data as string) as Record<string, Json>), ...clean };
      this.db.prepare('UPDATE records SET data = ? WHERE owner IS ? AND collection = ? AND id = ?').run(JSON.stringify(data), owner, collection, id);
      this.dirty('record', id, owner, Object.keys(clean));
      return { ...data, id, at: r.ts as number };
    });
  }

  deleteRow(owner: string | null, collection: string, id: string): boolean {
    return this.transaction(() => {
      const ok = this.db.prepare('DELETE FROM records WHERE owner IS ? AND collection = ? AND id = ?').run(owner, collection, id).changes > 0;
      if (ok) this.recordGone(id, owner);
      return ok;
    });
  }

  /** Every record of the collection goes. (Synced as each of them deleted: one added elsewhere meanwhile stays.) */
  clear(owner: string | null, collection: string): number {
    return this.transaction(() => {
      const ids = this.db.prepare('SELECT id FROM records WHERE owner IS ? AND collection = ?').all(owner, collection).map((r) => r.id as string);
      this.db.prepare('DELETE FROM records WHERE owner IS ? AND collection = ?').run(owner, collection);
      for (const id of ids) this.recordGone(id, owner);
      return ids.length;
    });
  }

  private recordGone(id: string, owner: string | null): void {
    this.gone('record', id);
    this.dirty('record', id, owner);
  }

  // ── messages ──

  /** A document's messages after `after`, oldest first: the latest `limit` of them. */
  messages(docId: string, after = 0, limit = 500): Message[] {
    const rows = this.db.prepare('SELECT id, ts, actor, text, cell FROM messages WHERE doc_id = ? AND id > ? ORDER BY id DESC LIMIT ?').all(docId, after, limit).reverse();
    return rows.map((r) => ({
      id: r.id as number,
      ts: r.ts as number,
      actor: JSON.parse(r.actor as string),
      text: r.text as string,
      ...(r.cell ? { cell: r.cell as string } : {}),
    }));
  }

  addMessage(docId: string, actor: Actor, text: string, cell?: string): Message {
    const ts = Date.now();
    const r = this.db.prepare('INSERT INTO messages (doc_id, ts, actor, text, cell) VALUES (?, ?, ?, ?, ?)')
      .run(docId, ts, JSON.stringify(actor), text, cell ?? null);
    return { id: Number(r.lastInsertRowid), ts, actor, text, ...(cell ? { cell } : {}) };
  }

  // ── accounts ──

  private static USER_COLS = 'id, email, name, color, theme, local, created_at, updated_at, password IS NOT NULL AS has_password';

  users(): User[] {
    return this.db.prepare(`SELECT ${Store.USER_COLS} FROM users ORDER BY created_at`).all().map(userOf);
  }

  user(id: string): User | null {
    const r = this.db.prepare(`SELECT ${Store.USER_COLS} FROM users WHERE id = ?`).get(id);
    return r ? userOf(r) : null;
  }

  userByEmail(email: string): User | null {
    const r = this.db.prepare(`SELECT ${Store.USER_COLS} FROM users WHERE email = ?`).get(email);
    return r ? userOf(r) : null;
  }

  /** The stored scrypt hash, for signing in. */
  passwordOf(id: string): string | null {
    return (this.db.prepare('SELECT password FROM users WHERE id = ?').get(id)?.password as string | null | undefined) ?? null;
  }

  /** The account local mode signs in by itself. */
  localUser(): User | null {
    const r = this.db.prepare(`SELECT ${Store.USER_COLS} FROM users WHERE local = 1 ORDER BY created_at LIMIT 1`).get();
    return r ? userOf(r) : null;
  }

  /**
   * A new account. The first one ever made owns everything that has no owner
   * yet: the documents, decks, links and records of an installation from
   * before accounts.
   */
  createUser(u: { id?: string; email: string | null; name: string; color: string; password: string | null; local?: boolean; createdAt?: number; fromCloud?: boolean }): User {
    const id = u.id ?? 'u' + shortId(9);
    const now = u.createdAt ?? Date.now();
    this.transaction(() => {
      // An account that comes down from the cloud has its own things there; it claims nothing here.
      const first = !u.fromCloud && !this.db.prepare('SELECT 1 FROM users LIMIT 1').get();
      this.db.prepare('INSERT INTO users (id, email, name, color, password, local, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, u.email, u.name, u.color, u.password, u.local ? 1 : 0, now, now);
      if (first) {
        this.claimOrphans(id);
        // Its secrets (EDGY_SECRET_…) are this account's to use.
        this.setSyncMeta('server-owner', id);
      }
      if (u.fromCloud) this.db.prepare('INSERT OR IGNORE INTO sync_spaces (space, cursor, ready) VALUES (?, 0, 1)').run(id);
      else this.dirty('account', id, id);
    });
    return this.user(id)!;
  }

  /** Everything without an owner becomes this account's. */
  claimOrphans(userId: string): void {
    this.transaction(() => {
      for (const t of ['docs', 'decks', 'records']) this.db.prepare(`UPDATE ${t} SET owner = ? WHERE owner IS NULL`).run(userId);
    });
  }

  updateUser(id: string, fields: { email?: string | null; name?: string; color?: string; theme?: 'light' | 'dark' | null; password?: string; local?: boolean }): User | null {
    const cols: Record<string, string | number | null> = {};
    if (fields.email !== undefined) cols.email = fields.email;
    if (fields.name !== undefined) cols.name = fields.name;
    if (fields.color !== undefined) cols.color = fields.color;
    if (fields.theme !== undefined) cols.theme = fields.theme;
    if (fields.password !== undefined) cols.password = fields.password;
    if (fields.local !== undefined) cols.local = fields.local ? 1 : 0;
    const keys = Object.keys(cols);
    if (keys.length) {
      this.transaction(() => {
        this.db.prepare(`UPDATE users SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(...keys.map((k) => cols[k]), Date.now(), id);
        this.dirty('account', id, id);
      });
    }
    return this.user(id);
  }

  /**
   * An account goes, with everything it owns: its documents (and their
   * history, messages, links and access lists), decks, records, sessions and
   * keys, and its access to other people's documents. Returns the ids of the
   * documents that went, so whoever had them open can be told.
   */
  deleteUser(id: string): string[] {
    const docs = this.db.prepare('SELECT id FROM docs WHERE owner = ?').all(id).map((r) => r.id as string);
    // The account and all it has go together; with sync, its space in the cloud goes as one (see sync.ts).
    this.transaction(() => {
      this.quietly(() => { for (const doc of docs) this.deleteDoc(doc); });
      this.forgetSpace(id);
      for (const deck of this.db.prepare('SELECT id FROM decks WHERE owner = ?').all(id)) this.db.prepare('DELETE FROM deck_docs WHERE deck_id = ?').run(deck.id as string);
      this.db.prepare('DELETE FROM decks WHERE owner = ?').run(id);
      this.db.prepare('DELETE FROM records WHERE owner = ?').run(id);
      this.db.prepare('DELETE FROM doc_access WHERE user_id = ?').run(id);
      this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
      this.db.prepare('DELETE FROM api_keys WHERE user_id = ?').run(id);
      this.db.prepare('DELETE FROM users WHERE id = ?').run(id);
    });
    return docs;
  }

  // ── sessions: only the digest of the cookie is kept ──

  private prunedAt = 0;

  /** Sessions past their end go (at most once an hour): one that is never used again would otherwise stay for good. */
  private pruneSessions(now = Date.now()): void {
    if (now - this.prunedAt < 3_600_000) return;
    this.prunedAt = now;
    this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
  }

  createSession(hash: string, userId: string, expiresAt: number, agent?: string): void {
    const now = Date.now();
    this.pruneSessions(now);
    this.db.prepare('INSERT INTO sessions (hash, user_id, created_at, seen_at, expires_at, agent) VALUES (?, ?, ?, ?, ?, ?)')
      .run(hash, userId, now, now, expiresAt, agent?.slice(0, 200) ?? null);
  }

  /** The account a session belongs to, if it is still valid. */
  session(hash: string, now = Date.now()): { userId: string; seenAt: number; expiresAt: number } | null {
    const r = this.db.prepare('SELECT user_id, seen_at, expires_at FROM sessions WHERE hash = ?').get(hash);
    if (!r) return null;
    if ((r.expires_at as number) <= now) {
      this.deleteSession(hash);
      return null;
    }
    return { userId: r.user_id as string, seenAt: r.seen_at as number, expiresAt: r.expires_at as number };
  }

  touchSession(hash: string, seenAt: number, expiresAt: number): void {
    this.db.prepare('UPDATE sessions SET seen_at = ?, expires_at = ? WHERE hash = ?').run(seenAt, expiresAt, hash);
  }

  deleteSession(hash: string): void {
    this.db.prepare('DELETE FROM sessions WHERE hash = ?').run(hash);
  }

  /** End an account's sessions, all or all but one. Returns the digests that ended. */
  endSessions(userId: string, except?: string): string[] {
    const gone = this.db.prepare('SELECT hash FROM sessions WHERE user_id = ? AND hash IS NOT ?').all(userId, except ?? null).map((r) => r.hash as string);
    this.db.prepare('DELETE FROM sessions WHERE user_id = ? AND hash IS NOT ?').run(userId, except ?? null);
    return gone;
  }

  // ── API keys: only the digest of the key is kept ──

  createKey(userId: string, name: string, hash: string, prefix: string): ApiKey {
    const id = 'k' + shortId(9);
    this.db.prepare('INSERT INTO api_keys (id, user_id, name, hash, prefix, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, userId, name, hash, prefix, Date.now());
    return this.keys(userId).find((k) => k.id === id)!;
  }

  keys(userId: string): ApiKey[] {
    return this.db.prepare('SELECT id, user_id, name, prefix, created_at, last_used_at, revoked_at FROM api_keys WHERE user_id = ? ORDER BY created_at').all(userId).map(keyOf);
  }

  /** The key with this digest, revoked or not. */
  keyByHash(hash: string): ApiKey | null {
    const r = this.db.prepare('SELECT id, user_id, name, prefix, created_at, last_used_at, revoked_at FROM api_keys WHERE hash = ?').get(hash);
    return r ? keyOf(r) : null;
  }

  touchKey(id: string, at: number): void {
    this.db.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').run(at, id);
  }

  revokeKey(userId: string, id: string): ApiKey | null {
    this.db.prepare('UPDATE api_keys SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ? AND user_id = ?').run(Date.now(), id, userId);
    return this.keys(userId).find((k) => k.id === id) ?? null;
  }

  // ── who else may open a document ──

  /** What this account may do with a document: owner, editor, viewer, or null (nothing; or no such document). */
  roleOf(docId: string, userId: string): Role | 'owner' | null {
    const owner = this.docOwner(docId);
    if (owner === undefined) return null;
    if (owner === userId) return 'owner';
    return (this.db.prepare('SELECT role FROM doc_access WHERE doc_id = ? AND user_id = ?').get(docId, userId)?.role as Role | undefined) ?? null;
  }

  /** The owner first, then everyone given access, in the order they were added. */
  people(docId: string): Person[] {
    const owner = this.docOwner(docId);
    const out: Person[] = [];
    const o = owner ? this.user(owner) : null;
    if (o) out.push({ id: o.id, name: o.name, email: o.email, color: o.color, role: 'owner' });
    for (const r of this.db.prepare('SELECT a.user_id, a.role, u.name, u.email, u.color FROM doc_access a JOIN users u ON u.id = a.user_id WHERE a.doc_id = ? ORDER BY a.granted_at').all(docId)) {
      out.push({ id: r.user_id as string, name: r.name as string, email: (r.email as string | null) ?? null, color: r.color as string, role: r.role as Role });
    }
    return out;
  }

  /** Give access, change it, or (role null) take it away. */
  setRole(docId: string, userId: string, role: Role | null): void {
    this.transaction(() => {
      this.dirty('access', `${docId} ${userId}`, this.docOwner(docId) ?? null);
      if (role) {
        this.db.prepare('INSERT INTO doc_access (doc_id, user_id, role, granted_at) VALUES (?, ?, ?, ?) ON CONFLICT (doc_id, user_id) DO UPDATE SET role = excluded.role')
          .run(docId, userId, role, Date.now());
      } else this.db.prepare('DELETE FROM doc_access WHERE doc_id = ? AND user_id = ?').run(docId, userId);
    });
  }

  // ── sync: what the cloud has, and what is still to send (see sync.ts) ──

  /** Called after every change that may need sending. */
  onChange?: () => void;
  private quiet = false;

  /** Changes the cloud asked for are not changes to send back. */
  quietly<T>(fn: () => T): T {
    const was = this.quiet;
    this.quiet = true;
    try {
      return fn();
    } finally {
      this.quiet = was;
    }
  }

  /** Something of `space` changed here: remember to send it (which fields, or '*' for all of it). */
  private dirty(kind: string, key: string, space: string | null, fields: string[] | '*' = '*'): void {
    if (this.quiet || !space) return;
    this.transaction(() => {
      const n = this.counter();
      const prev = this.db.prepare('SELECT fields FROM sync_dirty WHERE kind = ? AND key = ?').get(kind, key)?.fields as string | undefined;
      const merged = prev === '*' || fields === '*'
        ? '*'
        : JSON.stringify([...new Set([...(prev ? (JSON.parse(prev) as string[]) : []), ...fields])]);
      this.db.prepare('INSERT INTO sync_dirty (kind, key, space, n, fields) VALUES (?, ?, ?, ?, ?) ON CONFLICT (kind, key) DO UPDATE SET n = excluded.n, fields = excluded.fields, space = excluded.space')
        .run(kind, key, space, n, merged);
    });
    this.onChange?.();
  }

  /** A number that only goes up, for this file. */
  private counter(): number {
    const r = this.db.prepare("INSERT INTO sync_meta (key, value) VALUES ('n', '1') ON CONFLICT (key) DO UPDATE SET value = CAST(value AS INTEGER) + 1 RETURNING value").get();
    return Number(r!.value);
  }

  private gone(kind: string, key: string): void {
    this.db.prepare('INSERT OR IGNORE INTO sync_gone (kind, key) VALUES (?, ?)').run(kind, key);
  }

  isGone(kind: string, key: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM sync_gone WHERE kind = ? AND key = ?').get(kind, key);
  }

  markGone(kind: string, key: string): void {
    this.gone(kind, key);
  }

  syncMeta(key: string): string | null {
    return (this.db.prepare('SELECT value FROM sync_meta WHERE key = ?').get(key)?.value as string | undefined) ?? null;
  }

  setSyncMeta(key: string, value: string): void {
    this.db.prepare('INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(key, value);
  }

  deleteSyncMeta(key: string): void {
    this.db.prepare('DELETE FROM sync_meta WHERE key = ?').run(key);
  }

  /** The keys of sync_meta that start with this. */
  syncMetaKeys(prefix: string): string[] {
    return this.db.prepare('SELECT key FROM sync_meta WHERE substr(key, 1, ?) = ?').all(prefix.length, prefix).map((r) => r.key as string);
  }

  /** The version of the snapshot the cloud kept when a document was first sent (its history goes up to there). */
  firstBase(id: string, fallback: number): number {
    return Number(this.syncMeta(`base:${id}`) ?? fallback);
  }

  /** Forget a pending change that no longer matters (what it changed was deleted elsewhere). */
  dropDirty(kind: string, key: string): void {
    this.db.prepare('DELETE FROM sync_dirty WHERE kind = ? AND key = ?').run(kind, key);
  }

  /** Every account on this machine, with where its pull stands and whether its first sync is done. */
  spaces(): { space: string; cursor: number; ready: boolean }[] {
    return this.db.prepare('SELECT u.id AS space, COALESCE(s.cursor, 0) AS cursor, COALESCE(s.ready, 0) AS ready FROM users u LEFT JOIN sync_spaces s ON s.space = u.id ORDER BY u.created_at').all()
      .map((r) => ({ space: r.space as string, cursor: Number(r.cursor), ready: !!r.ready }));
  }

  setCursor(space: string, cursor: number, ready?: boolean): void {
    this.db.prepare('INSERT INTO sync_spaces (space, cursor, ready) VALUES (?, ?, ?) ON CONFLICT (space) DO UPDATE SET cursor = excluded.cursor, ready = MAX(ready, excluded.ready)')
      .run(space, cursor, ready ? 1 : 0);
  }

  /**
   * An account's first sync found the cloud empty: everything it has here is
   * to send (records, decks, pins, links, access, its library flags, the account).
   */
  markAll(space: string): void {
    this.transaction(() => {
      for (const r of this.db.prepare('SELECT id FROM records WHERE owner = ?').all(space)) this.dirty('record', r.id as string, space);
      for (const r of this.db.prepare('SELECT id FROM decks WHERE owner = ?').all(space)) this.dirty('deck', r.id as string, space);
      for (const r of this.db.prepare('SELECT id FROM docs WHERE owner = ?').all(space)) this.dirty('doclib', r.id as string, space);
      for (const r of this.db.prepare('SELECT s.token FROM shares s JOIN docs d ON d.id = s.doc_id WHERE d.owner = ?').all(space)) this.dirty('share', r.token as string, space);
      for (const r of this.db.prepare('SELECT a.doc_id, a.user_id FROM doc_access a JOIN docs d ON d.id = a.doc_id WHERE d.owner = ?').all(space)) this.dirty('access', `${r.doc_id} ${r.user_id}`, space);
      this.dirty('pins', space, space);
      this.dirty('account', space, space);
    });
  }

  dirtyItems(): { kind: string; key: string; space: string; n: number; fields: string[] | '*' }[] {
    return this.db.prepare('SELECT kind, key, space, n, fields FROM sync_dirty ORDER BY n').all().map((r) => ({
      kind: r.kind as string, key: r.key as string, space: r.space as string, n: Number(r.n),
      fields: r.fields === '*' ? '*' : (JSON.parse(r.fields as string) as string[]),
    }));
  }

  /** Sent: forget it, unless it changed again meanwhile. */
  clearDirty(kind: string, key: string, n: number): void {
    this.db.prepare('DELETE FROM sync_dirty WHERE kind = ? AND key = ? AND n = ?').run(kind, key, n);
  }

  /** What a pending local change says about a record's fields: '*' (all of it), these fields, or nothing. */
  dirtyFields(kind: string, key: string): string[] | '*' | null {
    const f = this.db.prepare('SELECT fields FROM sync_dirty WHERE kind = ? AND key = ?').get(kind, key)?.fields as string | undefined;
    return f === undefined ? null : f === '*' ? '*' : (JSON.parse(f) as string[]);
  }

  /** How much is waiting to be sent, for one account or all. */
  pendingCount(space?: string): number {
    const dirty = Number(this.db.prepare('SELECT COUNT(*) AS n FROM sync_dirty WHERE (? IS NULL OR space = ?)').get(space ?? null, space ?? null)!.n);
    const ops = Number(this.db.prepare('SELECT COUNT(*) AS n FROM ops o JOIN sync_docs s ON s.doc_id = o.doc_id WHERE o.v > s.base_v AND (? IS NULL OR s.space = ?)').get(space ?? null, space ?? null)!.n);
    const docs = Number(this.db.prepare('SELECT COUNT(*) AS n FROM docs d WHERE d.owner IS NOT NULL AND (? IS NULL OR d.owner = ?) AND NOT EXISTS (SELECT 1 FROM sync_docs s WHERE s.doc_id = d.id)').get(space ?? null, space ?? null)!.n);
    return dirty + ops + docs;
  }

  /** Documents of an account the cloud doesn't have yet. */
  unsentDocs(): { id: string; owner: string }[] {
    return this.db.prepare('SELECT id, owner FROM docs d WHERE owner IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sync_docs s WHERE s.doc_id = d.id) ORDER BY created_at').all()
      .map((r) => ({ id: r.id as string, owner: r.owner as string }));
  }

  /** A document as the cloud last confirmed it. */
  syncDoc(id: string): { space: string; baseV: number; base: Doc } | null {
    const r = this.db.prepare('SELECT space, base_v, base_body FROM sync_docs WHERE doc_id = ?').get(id);
    return r ? { space: r.space as string, baseV: Number(r.base_v), base: JSON.parse(r.base_body as string) as Doc } : null;
  }

  setSyncDoc(id: string, space: string, baseV: number, base: Doc): void {
    this.transaction(() => {
      if (!this.syncMeta(`base:${id}`)) this.setSyncMeta(`base:${id}`, String(baseV));
      this.db.prepare('INSERT INTO sync_docs (doc_id, space, base_v, base_body) VALUES (?, ?, ?, ?) ON CONFLICT (doc_id) DO UPDATE SET base_v = excluded.base_v, base_body = excluded.base_body, space = excluded.space')
        .run(id, space, baseV, JSON.stringify(base));
    });
  }

  /** Ops made here after what the cloud confirmed, in order, per document (or for one). */
  pendingOps(doc?: string): { doc: string; space: string; v: number; ts: number; actor: Actor; ops: Op[]; oid: string; conflict: boolean }[] {
    return this.db.prepare('SELECT o.doc_id, s.space, o.v, o.ts, o.actor, o.ops, o.oid, o.conflict FROM ops o JOIN sync_docs s ON s.doc_id = o.doc_id WHERE o.v > s.base_v AND (? IS NULL OR o.doc_id = ?) ORDER BY o.doc_id, o.v').all(doc ?? null, doc ?? null)
      .map((r) => ({ doc: r.doc_id as string, space: r.space as string, v: Number(r.v), ts: Number(r.ts), actor: JSON.parse(r.actor as string), ops: JSON.parse(r.ops as string), oid: (r.oid as string | null) ?? '', conflict: !!r.conflict }));
  }

  /** A document's history up to a version, oldest first (what its first upload carries). */
  history(id: string, upto: number): { v: number; ts: number; actor: Actor; ops: Op[]; oid: string | null; conflict?: boolean }[] {
    return this.db.prepare('SELECT v, ts, actor, ops, oid, conflict FROM ops WHERE doc_id = ? AND v <= ? ORDER BY v').all(id, upto)
      .map((r) => ({ v: Number(r.v), ts: Number(r.ts), actor: JSON.parse(r.actor as string), ops: JSON.parse(r.ops as string), oid: (r.oid as string | null) ?? null, ...(r.conflict ? { conflict: true } : {}) }));
  }

  /** The full log with ids, for comparing two machines. */
  fullLog(id: string): { v: number; oid: string | null; actor: Actor; ops: Op[]; conflict: boolean }[] {
    return this.db.prepare('SELECT v, oid, actor, ops, conflict FROM ops WHERE doc_id = ? ORDER BY v').all(id)
      .map((r) => ({ v: Number(r.v), oid: (r.oid as string | null) ?? null, actor: JSON.parse(r.actor as string), ops: JSON.parse(r.ops as string), conflict: !!r.conflict }));
  }

  /** A document that came down from the cloud: its state at `doc.v` and the account it belongs to. */
  receiveDoc(doc: Doc, owner: string, createdAt: number, updatedAt: number): void {
    this.quietly(() => {
      const made = this.db.prepare('INSERT INTO docs (id, title, body, v, created_at, updated_at, description, text, shape, owner) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING')
        .run(doc.id, doc.meta.title, JSON.stringify(doc), doc.v, createdAt, updatedAt, ...derived(doc), owner).changes > 0;
      // Only what is now stored: a document already here stays as it is, in the cache too.
      if (made) this.cache.set(doc.id, doc);
    });
  }

  /** History that came down from the cloud, entries this file doesn't have yet. */
  receiveHistory(id: string, entries: { v: number; ts: number; actor: Actor; ops: Op[]; conflict?: boolean; oid?: string | null }[]): void {
    const put = this.db.prepare('INSERT OR IGNORE INTO ops (doc_id, v, ts, actor, ops, oid, conflict) VALUES (?, ?, ?, ?, ?, ?, ?)');
    this.transaction(() => {
      for (const e of entries) put.run(id, e.v, e.ts, JSON.stringify(e.actor), JSON.stringify(e.ops), e.oid ?? null, e.conflict ? 1 : 0);
    });
  }

  /**
   * The cloud ordered things differently: the history after `fromV` becomes
   * `entries` (each with its oid, confirmed or still to send) and the document
   * becomes `doc`, in one transaction.
   */
  rewriteHistory(doc: Doc, fromV: number, entries: { v: number; ts: number; actor: Actor; ops: Op[]; oid: string; seq?: number; conflict?: boolean }[]): void {
    this.transaction(() => {
      this.db.prepare('DELETE FROM ops WHERE doc_id = ? AND v > ?').run(doc.id, fromV);
      const put = this.db.prepare('INSERT INTO ops (doc_id, v, ts, actor, ops, oid, seq, conflict) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
      for (const e of entries) put.run(doc.id, e.v, e.ts, JSON.stringify(e.actor), JSON.stringify(e.ops), e.oid, e.seq ?? null, e.conflict ? 1 : 0);
      this.db.prepare('UPDATE docs SET title = ?, body = ?, v = ?, updated_at = ?, description = ?, text = ?, shape = ? WHERE id = ?')
        .run(doc.meta.title, JSON.stringify(doc), doc.v, Date.now(), ...derived(doc), doc.id);
    });
    // (Inside a larger transaction that is undone later, the cache is emptied then: see `transaction`.)
    this.cache.set(doc.id, doc);
  }

  /** The cloud confirmed these ops where they already are. */
  confirmOps(id: string, confirmed: { oid: string; seq: number }[]): void {
    const set = this.db.prepare('UPDATE ops SET seq = ? WHERE doc_id = ? AND oid = ?');
    this.transaction(() => {
      for (const c of confirmed) set.run(c.seq, id, c.oid);
    });
  }

  /** A document's library flags, as the cloud says. */
  setDocLibrary(id: string, archivedAt: number | null, reaches: string[] | null, trusted: string[] | null): void {
    this.db.prepare('UPDATE docs SET archived_at = ?, reaches = ?, trusted = ? WHERE id = ?')
      .run(archivedAt, reaches ? JSON.stringify(reaches) : null, trusted ? JSON.stringify(trusted) : null, id);
  }

  docLibrary(id: string): { archivedAt: number | null; reaches: string[] | null; trusted: string[] | null } | null {
    const r = this.db.prepare('SELECT archived_at, reaches, trusted FROM docs WHERE id = ?').get(id);
    return r ? {
      archivedAt: num(r.archived_at),
      reaches: r.reaches ? (JSON.parse(r.reaches as string) as string[]) : null,
      trusted: r.trusted ? (JSON.parse(r.trusted as string) as string[]) : null,
    } : null;
  }

  /** The account whose secrets this server holds (its first account here), or null. */
  serverOwner(): string | null {
    return this.syncMeta('server-owner');
  }

  /** Which fetch cell may send which secret where ("<cell> <origin> <SECRET>"), as the owner last left the document. */
  trusted(docId: string): string[] {
    const r = this.db.prepare('SELECT trusted FROM docs WHERE id = ?').get(docId);
    return r?.trusted ? (JSON.parse(r.trusted as string) as string[]) : [];
  }

  setTrusted(docId: string, entries: string[]): void {
    const json = JSON.stringify(entries);
    if (this.db.prepare('SELECT trusted FROM docs WHERE id = ?').get(docId)?.trusted === json) return;
    this.transaction(() => {
      this.db.prepare('UPDATE docs SET trusted = ? WHERE id = ?').run(json, docId);
      this.dirty('doclib', docId, this.docOwner(docId) ?? null);
    });
  }

  /** Documents whose reach was never worked out and that nobody but their owner can change: safe to work out now. */
  unapproved(): string[] {
    return this.db.prepare(`SELECT id FROM docs d WHERE reaches IS NULL AND owner IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM doc_access a WHERE a.doc_id = d.id)
      AND NOT EXISTS (SELECT 1 FROM shares s WHERE s.doc_id = d.id AND s.access = 'edit' AND s.revoked_at IS NULL)`).all().map((r) => r.id as string);
  }

  /** A record as stored, with its owner and collection, or null. */
  record(id: string): { owner: string | null; collection: string; data: Record<string, Json>; ts: number; source: Json | null } | null {
    const r = this.db.prepare('SELECT owner, collection, data, ts, source FROM records WHERE id = ?').get(id);
    return r ? { owner: (r.owner as string | null) ?? null, collection: r.collection as string, data: JSON.parse(r.data as string), ts: Number(r.ts), source: r.source ? JSON.parse(r.source as string) : null } : null;
  }

  /** A record's fields as the cloud says: made if it isn't here, merged if it is. Quiet. */
  receiveRecord(owner: string, collection: string, id: string, ts: number, set: Record<string, Json>, source: Json | null): void {
    const r = this.record(id);
    if (!r) {
      this.db.prepare('INSERT INTO records (id, collection, data, ts, source, owner) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, collection, JSON.stringify(set), ts, source == null ? null : JSON.stringify(source), owner);
    } else {
      this.db.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify({ ...r.data, ...set }), id);
    }
  }

  dropRecord(id: string): void {
    this.transaction(() => {
      this.db.prepare('DELETE FROM records WHERE id = ?').run(id);
      this.gone('record', id);
    });
  }

  /** A deck as the cloud says (or gone). Quiet. */
  receiveDeck(owner: string, d: { id: string; title: string; description: string; createdAt: number; updatedAt: number; archivedAt: number | null; docs: string[] } | null, id: string): void {
    this.quietly(() => this.transaction(() => {
      this.db.prepare('DELETE FROM deck_docs WHERE deck_id = ?').run(id);
      if (!d) {
        this.db.prepare('DELETE FROM decks WHERE id = ?').run(id);
        this.gone('deck', id);
        return;
      }
      // The deck is `id`, whatever the body says it is (sync checks they agree).
      this.db.prepare('INSERT INTO decks (id, title, description, created_at, updated_at, archived_at, owner) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET title = excluded.title, description = excluded.description, updated_at = excluded.updated_at, archived_at = excluded.archived_at')
        .run(id, d.title, d.description, d.createdAt, d.updatedAt, d.archivedAt, owner);
      d.docs.filter((doc) => this.db.prepare('SELECT 1 FROM docs WHERE id = ? AND owner = ?').get(doc, owner)).forEach((doc, i) => {
        this.db.prepare('DELETE FROM deck_docs WHERE doc_id = ?').run(doc);
        this.db.prepare('INSERT INTO deck_docs (deck_id, doc_id, pos) VALUES (?, ?, ?)').run(id, doc, i);
      });
    }));
  }

  /** A share link as the cloud says. */
  receiveShare(s: Share): void {
    this.db.prepare('INSERT INTO shares (token, doc_id, access, created_at, revoked_at, collections) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (token) DO UPDATE SET revoked_at = excluded.revoked_at, collections = excluded.collections')
      .run(s.token, s.doc, s.access, s.createdAt, s.revokedAt, JSON.stringify(s.collections));
  }

  /** Who may open a document, as the cloud says. */
  receiveAccess(docId: string, userId: string, role: Role | null): void {
    this.quietly(() => this.setRole(docId, userId, role));
  }

  accessOf(docId: string, userId: string): Role | null {
    return (this.db.prepare('SELECT role FROM doc_access WHERE doc_id = ? AND user_id = ?').get(docId, userId)?.role as Role | undefined) ?? null;
  }

  /** An account's row as stored, hash included: what goes to the cloud so it can sign in on another machine. */
  accountRow(id: string): { id: string; email: string | null; name: string; color: string; theme: string | null; password: string | null; createdAt: number } | null {
    const r = this.db.prepare('SELECT id, email, name, color, theme, password, created_at FROM users WHERE id = ?').get(id);
    return r ? { id: r.id as string, email: (r.email as string | null) ?? null, name: r.name as string, color: r.color as string, theme: (r.theme as string | null) ?? null, password: (r.password as string | null) ?? null, createdAt: Number(r.created_at) } : null;
  }

  /** An account's profile as the cloud says. Quiet. */
  receiveAccount(a: { id: string; email: string | null; name: string; color: string; theme: string | null; password: string | null }): void {
    this.db.prepare('UPDATE users SET email = ?, name = ?, color = ?, theme = ?, password = ?, updated_at = ? WHERE id = ?')
      .run(a.email, a.name, a.color, a.theme, a.password, Date.now(), a.id);
  }

  /** The asset files the cloud doesn't have yet. */
  unsentAssets(): string[] {
    return this.db.prepare('SELECT file FROM sync_assets').all().map((r) => r.file as string);
  }

  assetToSend(file: string): void {
    this.db.prepare('INSERT OR IGNORE INTO sync_assets (file) VALUES (?)').run(file);
    this.onChange?.();
  }

  assetSent(file: string): void {
    this.db.prepare('DELETE FROM sync_assets WHERE file = ?').run(file);
  }

  /**
   * The cloud is another database than the one this file synced with (new, or restored):
   * start again, as if never synced. Everything here goes up; what the cloud has comes down.
   */
  resetSync(): void {
    this.transaction(() => {
      this.db.prepare('UPDATE sync_spaces SET cursor = 0, ready = 0').run();
      this.db.prepare('DELETE FROM sync_docs').run();
      this.db.prepare("DELETE FROM sync_meta WHERE key LIKE 'base:%'").run();
      this.db.prepare('UPDATE ops SET seq = NULL').run();
      // A restored cloud still has each account's older rows, so the first pull won't find it empty and mark
      // everything itself (see sync.ts): what changed since that backup would never go up again.
      for (const r of this.db.prepare('SELECT id FROM users').all()) this.markAll(r.id as string);
    });
  }

  /** The ops of a document the cloud already confirmed, by oid. */
  confirmedOids(docId: string): Set<string> {
    return new Set(this.db.prepare('SELECT oid FROM ops WHERE doc_id = ? AND seq IS NOT NULL AND oid IS NOT NULL').all(docId).map((r) => r.oid as string));
  }

  /** Forget an account's sync state (it was deleted). */
  forgetSpace(space: string): void {
    this.transaction(() => {
      for (const r of this.db.prepare('SELECT doc_id FROM sync_docs WHERE space = ?').all(space)) this.deleteSyncMeta(`base:${r.doc_id}`);
      this.db.prepare('DELETE FROM sync_dirty WHERE space = ?').run(space);
      this.db.prepare('DELETE FROM sync_spaces WHERE space = ?').run(space);
      this.db.prepare('DELETE FROM sync_docs WHERE space = ?').run(space);
    });
  }

  close(): void {
    this.db.close();
  }
}

/** A request the store can't carry out, in words a person can act on. */
export class StoreError extends Error {}

/** Deck ids carry a dash; document ids never do. */
export const isDeckId = (id: string): boolean => id.startsWith('deck-');

function shareOf(r: Record<string, unknown>): Share {
  return {
    token: r.token as string,
    doc: r.doc_id as string,
    access: r.access as Access,
    createdAt: r.created_at as number,
    revokedAt: num(r.revoked_at),
    collections: JSON.parse((r.collections as string | null) ?? '[]') as string[],
  };
}

function userOf(r: Record<string, unknown>): User {
  return {
    id: r.id as string,
    email: (r.email as string | null) ?? null,
    name: r.name as string,
    color: r.color as string,
    theme: (r.theme as 'light' | 'dark' | null) ?? null,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
    local: !!r.local,
    hasPassword: !!r.has_password,
  };
}

function keyOf(r: Record<string, unknown>): ApiKey {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    name: r.name as string,
    prefix: r.prefix as string,
    createdAt: r.created_at as number,
    lastUsedAt: num(r.last_used_at),
    revokedAt: num(r.revoked_at),
  };
}
