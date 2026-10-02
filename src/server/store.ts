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
  /** Which share links are on. */
  shared: { view: boolean; edit: boolean };
  shape: Shape;
}

export interface Deck {
  id: string;
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

export const shortId = (n = 8) => randomBytes(n).toString('base64url').replace(/[-_]/g, 'x').slice(0, n).toLowerCase();
/** A share link's secret: 32 random bytes, 43 characters. */
export const newToken = () => randomBytes(32).toString('base64url');

/** The schema this code writes. 1: docs, ops, records, messages. 2: the library. 3: the collections a link reaches. */
export const SCHEMA = 3;

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

  /** The schema version of the open file. */
  version(): number {
    return Number((this.db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);
  }

  // ── documents ──

  listDocs(): DocSummary[] {
    const decks = new Map(this.db.prepare('SELECT doc_id, deck_id FROM deck_docs').all().map((r) => [r.doc_id as string, r.deck_id as string]));
    const shared = new Map<string, { view: boolean; edit: boolean }>();
    for (const r of this.db.prepare('SELECT doc_id, access FROM shares WHERE revoked_at IS NULL').all()) {
      const s = shared.get(r.doc_id as string) ?? { view: false, edit: false };
      s[r.access as Access] = true;
      shared.set(r.doc_id as string, s);
    }
    const rows = this.db.prepare('SELECT id, title, description, shape, v, created_at, updated_at, pinned, archived_at FROM docs ORDER BY updated_at DESC').all();
    return rows.map((r) => ({
      id: r.id as string,
      title: r.title as string,
      description: r.description as string,
      v: r.v as number,
      createdAt: r.created_at as number,
      updatedAt: r.updated_at as number,
      pinned: num(r.pinned),
      archivedAt: num(r.archived_at),
      deck: decks.get(r.id as string) ?? null,
      shared: shared.get(r.id as string) ?? { view: false, edit: false },
      shape: r.shape ? (JSON.parse(r.shape as string) as Shape) : { k: 'empty' },
    }));
  }

  summary(id: string): DocSummary | null {
    return this.listDocs().find((d) => d.id === id) ?? null;
  }

  /** What search reads: each document's title, description and words. */
  texts(): { id: string; title: string; description: string; text: string }[] {
    return this.db.prepare('SELECT id, title, description, text FROM docs').all().map((r) => ({
      id: r.id as string, title: r.title as string, description: r.description as string, text: r.text as string,
    }));
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

  createDoc(doc: Doc): void {
    const now = Date.now();
    this.db.prepare('INSERT INTO docs (id, title, body, v, created_at, updated_at, description, text, shape) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(doc.id, doc.meta.title, JSON.stringify(doc), doc.v, now, now, ...derived(doc));
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
      ok = this.db.prepare('DELETE FROM docs WHERE id = ?').run(id).changes > 0;
      // The pinned close up behind it.
      if (ok) this.renumberPins();
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

  // ── the library: archive and pins, for documents and decks alike ──

  private table(id: string): 'docs' | 'decks' {
    return isDeckId(id) ? 'decks' : 'docs';
  }

  private exists(id: string): boolean {
    return !!this.db.prepare(`SELECT 1 FROM ${this.table(id)} WHERE id = ?`).get(id);
  }

  /** Archive (or bring back) a document or a deck. Archiving unpins it. False when there is no such thing. */
  setArchived(id: string, archived: boolean): boolean {
    if (!this.exists(id)) return false;
    if (archived) {
      this.db.prepare(`UPDATE ${this.table(id)} SET archived_at = COALESCE(archived_at, ?), pinned = NULL WHERE id = ?`).run(Date.now(), id);
      this.renumberPins();
    } else this.db.prepare(`UPDATE ${this.table(id)} SET archived_at = NULL WHERE id = ?`).run(id);
    return true;
  }

  /** The pinned documents and decks, in their order. */
  pins(): string[] {
    return this.db.prepare(`
      SELECT id, pinned FROM docs WHERE pinned IS NOT NULL
      UNION ALL SELECT id, pinned FROM decks WHERE pinned IS NOT NULL
      ORDER BY pinned`).all().map((r) => r.id as string);
  }

  /** Pin at the end of the pinned, or unpin. Archived things can't be pinned. */
  setPinned(id: string, pinned: boolean): boolean {
    if (!this.exists(id)) return false;
    if (pinned && this.pins().includes(id)) return true;
    const pins = this.pins().filter((x) => x !== id);
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
   * Put the pinned in this order. Ids given that aren't pinned are ignored;
   * pinned ones left out keep their order after those given.
   */
  orderPins(ids: string[]): string[] {
    const pins = this.pins();
    const given = ids.filter((id, i) => pins.includes(id) && ids.indexOf(id) === i);
    this.writePins([...given, ...pins.filter((id) => !given.includes(id))]);
    return this.pins();
  }

  private writePins(ids: string[]): void {
    ids.forEach((id, i) => this.db.prepare(`UPDATE ${this.table(id)} SET pinned = ? WHERE id = ?`).run(i + 1, id));
  }

  private renumberPins(): void {
    this.writePins(this.pins());
  }

  // ── decks ──

  decks(): Deck[] {
    const members = new Map<string, string[]>();
    for (const r of this.db.prepare('SELECT deck_id, doc_id FROM deck_docs ORDER BY deck_id, pos').all()) {
      const list = members.get(r.deck_id as string) ?? [];
      list.push(r.doc_id as string);
      members.set(r.deck_id as string, list);
    }
    return this.db.prepare('SELECT id, title, description, created_at, updated_at, pinned, archived_at FROM decks ORDER BY updated_at DESC').all().map((r) => ({
      id: r.id as string,
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
    return this.decks().find((d) => d.id === id) ?? null;
  }

  /** Group documents into a new deck, in this order. A document already in another deck moves. */
  createDeck(title: string, description: string, docs: string[]): Deck {
    const id = 'deck-' + shortId(7);
    const now = Date.now();
    this.db.exec('BEGIN');
    try {
      this.db.prepare('INSERT INTO decks (id, title, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(id, title, description, now, now);
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
    const missing = unique.filter((d) => !this.db.prepare('SELECT 1 FROM docs WHERE id = ?').get(d));
    if (missing.length) throw new StoreError(`no document ${missing.join(', ')}`);
    unique.forEach((doc, i) => {
      this.db.prepare('DELETE FROM deck_docs WHERE doc_id = ?').run(doc);
      this.db.prepare('INSERT INTO deck_docs (deck_id, doc_id, pos) VALUES (?, ?, ?)').run(deck, doc, i);
    });
  }

  /** Ungroup: the deck goes, its documents stay and come back to the list. */
  deleteDeck(id: string): boolean {
    this.db.prepare('DELETE FROM deck_docs WHERE deck_id = ?').run(id);
    const ok = this.db.prepare('DELETE FROM decks WHERE id = ?').run(id).changes > 0;
    if (ok) this.renumberPins();
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

  /** The owner changed the document: its links reach the collections it uses now. */
  shareCollections(docId: string, collections: string[]): void {
    this.db.prepare('UPDATE shares SET collections = ? WHERE doc_id = ? AND revoked_at IS NULL').run(JSON.stringify(collections), docId);
  }

  /** Turn a link off for good. The token stays known, so it can say it was turned off. */
  closeShare(token: string): Share | null {
    this.db.prepare('UPDATE shares SET revoked_at = COALESCE(revoked_at, ?) WHERE token = ?').run(Date.now(), token);
    return this.share(token);
  }

  // ── collections ──

  collections(): { name: string; count: number; updatedAt: number }[] {
    const rows = this.db.prepare('SELECT collection, COUNT(*) AS n, MAX(ts) AS ts FROM records GROUP BY collection ORDER BY collection').all();
    return rows.map((r) => ({ name: r.collection as string, count: r.n as number, updatedAt: r.ts as number }));
  }

  rows(collection: string): Row[] {
    const rows = this.db.prepare('SELECT id, data, ts FROM records WHERE collection = ? ORDER BY ts, rowid').all(collection);
    return rows.map((r) => ({ ...(JSON.parse(r.data as string) as Record<string, Json>), id: r.id as string, at: r.ts as number }));
  }

  insert(collection: string, data: Record<string, Json>, source?: Json): Row {
    const id = 'r' + shortId(7);
    const ts = Date.now();
    const { id: _i, at: _a, ...clean } = data;
    this.db.prepare('INSERT INTO records (id, collection, data, ts, source) VALUES (?, ?, ?, ?, ?)')
      .run(id, collection, JSON.stringify(clean), ts, source == null ? null : JSON.stringify(source));
    return { ...clean, id, at: ts };
  }

  /** Merge fields into a saved record; null when there is no such record. id and at can't be changed. */
  update(collection: string, id: string, fields: Record<string, Json>): Row | null {
    const r = this.db.prepare('SELECT data, ts FROM records WHERE collection = ? AND id = ?').get(collection, id);
    if (!r) return null;
    const { id: _i, at: _a, ...clean } = fields;
    const data = { ...(JSON.parse(r.data as string) as Record<string, Json>), ...clean };
    this.db.prepare('UPDATE records SET data = ? WHERE collection = ? AND id = ?').run(JSON.stringify(data), collection, id);
    return { ...data, id, at: r.ts as number };
  }

  deleteRow(collection: string, id: string): boolean {
    return this.db.prepare('DELETE FROM records WHERE collection = ? AND id = ?').run(collection, id).changes > 0;
  }

  clear(collection: string): number {
    return Number(this.db.prepare('DELETE FROM records WHERE collection = ?').run(collection).changes);
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
