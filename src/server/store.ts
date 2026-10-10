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

/** The schema this code writes. 1: docs, ops, records, messages. 2: the library. 3: the collections a link reaches. 4: accounts. */
export const SCHEMA = 4;

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
    this.db.exec(`
      PRAGMA journal_mode = WAL;
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
  }

  /** Bring a file written by an older version up to SCHEMA, in place and all at once. */
  private migrate(): void {
    const version = Number((this.db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);
    if (version >= SCHEMA) return;
    this.db.exec('BEGIN');
    try {
      if (version < 2) this.toLibrary();
      // 3: a link remembers the collections it may reach (a link made before reaches none until the owner next edits).
      if (!this.columns('shares').has('collections')) this.db.exec("ALTER TABLE shares ADD COLUMN collections TEXT NOT NULL DEFAULT '[]'");
      if (version < 4) this.toAccounts();
      this.db.exec(`PRAGMA user_version = ${SCHEMA}`);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
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
    this.db.exec('BEGIN');
    try {
      this.db.prepare('UPDATE docs SET title = ?, body = ?, v = ?, updated_at = ?, description = ?, text = ?, shape = ? WHERE id = ?')
        .run(doc.meta.title, JSON.stringify(doc), doc.v, now, ...derived(doc), doc.id);
      this.db.prepare('INSERT INTO ops (doc_id, v, ts, actor, ops) VALUES (?, ?, ?, ?, ?)')
        .run(doc.id, doc.v, now, JSON.stringify(actor), JSON.stringify(ops));
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    this.cache.set(doc.id, doc);
    return now;
  }

  /** Gone for good: the document, its history, its messages, its links and its place in a deck. Records stay with their collections. */
  deleteDoc(id: string): boolean {
    this.cache.delete(id);
    let ok = false;
    this.db.exec('BEGIN');
    try {
      this.db.prepare('DELETE FROM ops WHERE doc_id = ?').run(id);
      this.db.prepare('DELETE FROM messages WHERE doc_id = ?').run(id);
      this.db.prepare('DELETE FROM shares WHERE doc_id = ?').run(id);
      this.db.prepare('DELETE FROM deck_docs WHERE doc_id = ?').run(id);
      this.db.prepare('DELETE FROM doc_access WHERE doc_id = ?').run(id);
      const owner = this.docOwner(id);
      ok = this.db.prepare('DELETE FROM docs WHERE id = ?').run(id).changes > 0;
      // The pinned close up behind it.
      if (ok) this.renumberPins(owner ?? null);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    return ok;
  }

  log(docId: string, since = 0, limit = 200): LogEntry[] {
    const rows = this.db.prepare('SELECT v, ts, actor, ops FROM ops WHERE doc_id = ? AND v > ? ORDER BY v DESC LIMIT ?').all(docId, since, limit);
    return rows.reverse().map((r) => ({
      v: r.v as number,
      ts: r.ts as number,
      actor: JSON.parse(r.actor as string),
      ops: JSON.parse(r.ops as string),
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
    if (archived) {
      this.db.prepare(`UPDATE ${this.table(id)} SET archived_at = COALESCE(archived_at, ?), pinned = NULL WHERE id = ?`).run(Date.now(), id);
      this.renumberPins(this.ownerOf(id));
    } else this.db.prepare(`UPDATE ${this.table(id)} SET archived_at = NULL WHERE id = ?`).run(id);
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
    if (!pinned) this.db.prepare(`UPDATE ${this.table(id)} SET pinned = NULL WHERE id = ?`).run(id);
    this.writePins(pins);
    return true;
  }

  /**
   * Put an owner's pinned in this order. Ids given that aren't pinned are ignored;
   * pinned ones left out keep their order after those given.
   */
  orderPins(owner: string | null, ids: string[]): string[] {
    const pins = this.pins(owner);
    const given = ids.filter((id, i) => pins.includes(id) && ids.indexOf(id) === i);
    this.writePins([...given, ...pins.filter((id) => !given.includes(id))]);
    return this.pins(owner);
  }

  private writePins(ids: string[]): void {
    ids.forEach((id, i) => this.db.prepare(`UPDATE ${this.table(id)} SET pinned = ? WHERE id = ?`).run(i + 1, id));
  }

  private renumberPins(owner: string | null): void {
    this.writePins(this.pins(owner));
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
    this.db.exec('BEGIN');
    try {
      this.db.prepare('INSERT INTO decks (id, title, description, created_at, updated_at, owner) VALUES (?, ?, ?, ?, ?, ?)').run(id, title, description, now, now, owner);
      this.putDocs(id, docs);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    return this.deck(id)!;
  }

  /** Change a deck's title or description. */
  updateDeck(id: string, fields: { title?: string; description?: string }): Deck | null {
    if (!this.exists(id)) return null;
    if (fields.title !== undefined) this.db.prepare('UPDATE decks SET title = ? WHERE id = ?').run(fields.title, id);
    if (fields.description !== undefined) this.db.prepare('UPDATE decks SET description = ? WHERE id = ?').run(fields.description, id);
    this.db.prepare('UPDATE decks SET updated_at = ? WHERE id = ?').run(Date.now(), id);
    return this.deck(id);
  }

  /** The deck's documents become exactly these, in this order: reorder, add and take out in one. */
  setDeckDocs(id: string, docs: string[]): Deck | null {
    if (!this.exists(id)) return null;
    this.db.exec('BEGIN');
    try {
      this.db.prepare('DELETE FROM deck_docs WHERE deck_id = ?').run(id);
      this.putDocs(id, docs);
      this.db.prepare('UPDATE decks SET updated_at = ? WHERE id = ?').run(Date.now(), id);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    return this.deck(id);
  }

  private putDocs(deck: string, docs: string[]): void {
    const unique = docs.filter((d, i) => docs.indexOf(d) === i);
    // A deck holds its owner's documents only; someone else's is "no document" here.
    const owner = this.ownerOf(deck);
    const missing = unique.filter((d) => !this.db.prepare('SELECT 1 FROM docs WHERE id = ? AND owner IS ?').get(d, owner));
    if (missing.length) throw new StoreError(`no document ${missing.join(', ')}`);
    unique.forEach((doc, i) => {
      this.db.prepare('DELETE FROM deck_docs WHERE doc_id = ?').run(doc);
      this.db.prepare('INSERT INTO deck_docs (deck_id, doc_id, pos) VALUES (?, ?, ?)').run(deck, doc, i);
    });
  }

  /** Ungroup: the deck goes, its documents stay and come back to the list. */
  deleteDeck(id: string): boolean {
    const owner = this.ownerOf(id);
    this.db.prepare('DELETE FROM deck_docs WHERE deck_id = ?').run(id);
    const ok = this.db.prepare('DELETE FROM decks WHERE id = ?').run(id).changes > 0;
    if (ok) this.renumberPins(owner);
    return ok;
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
    this.db.prepare('INSERT INTO shares (token, doc_id, access, created_at, collections) VALUES (?, ?, ?, ?, ?)')
      .run(token, docId, access, Date.now(), JSON.stringify(collections));
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
    this.db.prepare('UPDATE docs SET reaches = ? WHERE id = ?').run(json, docId);
    this.db.prepare('UPDATE shares SET collections = ? WHERE doc_id = ? AND revoked_at IS NULL').run(json, docId);
  }

  /** Turn a link off for good. The token stays known, so it can say it was turned off. */
  closeShare(token: string): Share | null {
    this.db.prepare('UPDATE shares SET revoked_at = COALESCE(revoked_at, ?) WHERE token = ?').run(Date.now(), token);
    return this.share(token);
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
    const id = 'r' + shortId(7);
    const ts = Date.now();
    const { id: _i, at: _a, ...clean } = data;
    this.db.prepare('INSERT INTO records (id, collection, data, ts, source, owner) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, collection, JSON.stringify(clean), ts, source == null ? null : JSON.stringify(source), owner);
    return { ...clean, id, at: ts };
  }

  /** Merge fields into a saved record; null when there is no such record. id and at can't be changed. */
  update(owner: string | null, collection: string, id: string, fields: Record<string, Json>): Row | null {
    const r = this.db.prepare('SELECT data, ts FROM records WHERE owner IS ? AND collection = ? AND id = ?').get(owner, collection, id);
    if (!r) return null;
    const { id: _i, at: _a, ...clean } = fields;
    const data = { ...(JSON.parse(r.data as string) as Record<string, Json>), ...clean };
    this.db.prepare('UPDATE records SET data = ? WHERE owner IS ? AND collection = ? AND id = ?').run(JSON.stringify(data), owner, collection, id);
    return { ...data, id, at: r.ts as number };
  }

  deleteRow(owner: string | null, collection: string, id: string): boolean {
    return this.db.prepare('DELETE FROM records WHERE owner IS ? AND collection = ? AND id = ?').run(owner, collection, id).changes > 0;
  }

  clear(owner: string | null, collection: string): number {
    return Number(this.db.prepare('DELETE FROM records WHERE owner IS ? AND collection = ?').run(owner, collection).changes);
  }

  // ── messages ──

  messages(docId: string, after = 0): Message[] {
    const rows = this.db.prepare('SELECT id, ts, actor, text, cell FROM messages WHERE doc_id = ? AND id > ? ORDER BY id').all(docId, after);
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
  createUser(u: { id?: string; email: string | null; name: string; color: string; password: string | null; local?: boolean; createdAt?: number }): User {
    const id = u.id ?? 'u' + shortId(9);
    const now = u.createdAt ?? Date.now();
    this.db.exec('BEGIN');
    try {
      const first = !this.db.prepare('SELECT 1 FROM users LIMIT 1').get();
      this.db.prepare('INSERT INTO users (id, email, name, color, password, local, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, u.email, u.name, u.color, u.password, u.local ? 1 : 0, now, now);
      if (first) this.claimOrphans(id);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    return this.user(id)!;
  }

  /** Everything without an owner becomes this account's. */
  claimOrphans(userId: string): void {
    for (const t of ['docs', 'decks', 'records']) this.db.prepare(`UPDATE ${t} SET owner = ? WHERE owner IS NULL`).run(userId);
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
      this.db.prepare(`UPDATE users SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(...keys.map((k) => cols[k]), Date.now(), id);
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
    for (const doc of docs) this.deleteDoc(doc);
    this.db.exec('BEGIN');
    try {
      for (const deck of this.db.prepare('SELECT id FROM decks WHERE owner = ?').all(id)) this.db.prepare('DELETE FROM deck_docs WHERE deck_id = ?').run(deck.id as string);
      this.db.prepare('DELETE FROM decks WHERE owner = ?').run(id);
      this.db.prepare('DELETE FROM records WHERE owner = ?').run(id);
      this.db.prepare('DELETE FROM doc_access WHERE user_id = ?').run(id);
      this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
      this.db.prepare('DELETE FROM api_keys WHERE user_id = ?').run(id);
      this.db.prepare('DELETE FROM users WHERE id = ?').run(id);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    return docs;
  }

  // ── sessions: only the digest of the cookie is kept ──

  createSession(hash: string, userId: string, expiresAt: number, agent?: string): void {
    const now = Date.now();
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
    if (role) {
      this.db.prepare('INSERT INTO doc_access (doc_id, user_id, role, granted_at) VALUES (?, ?, ?, ?) ON CONFLICT (doc_id, user_id) DO UPDATE SET role = excluded.role')
        .run(docId, userId, role, Date.now());
    } else this.db.prepare('DELETE FROM doc_access WHERE doc_id = ? AND user_id = ?').run(docId, userId);
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
