// Storage: one SQLite file, every payload a JSON column.
//
//   docs      the current state of each document
//   ops       the append-only history of what changed, by whom
//   records   rows saved from documents into named collections
//   messages  the conversation between people and agents on a document

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { Actor, Doc, Json, Op } from '../core/types';

export interface DocSummary {
  id: string;
  title: string;
  v: number;
  createdAt: number;
  updatedAt: number;
  root: Doc['root'];
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
  }

  // ── documents ──

  listDocs(): DocSummary[] {
    const rows = this.db.prepare('SELECT id, title, body, v, created_at, updated_at FROM docs ORDER BY updated_at DESC').all();
    return rows.map((r) => ({
      id: r.id as string,
      title: r.title as string,
      v: r.v as number,
      createdAt: r.created_at as number,
      updatedAt: r.updated_at as number,
      root: (JSON.parse(r.body as string) as Doc).root,
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
    this.db.prepare('INSERT INTO docs (id, title, body, v, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(doc.id, doc.meta.title, JSON.stringify(doc), doc.v, now, now);
    this.cache.set(doc.id, doc);
  }

  /** Save the new state and the ops that produced it, together. */
  saveDoc(doc: Doc, actor: Actor, ops: Op[]): number {
    const now = Date.now();
    this.db.exec('BEGIN');
    try {
      this.db.prepare('UPDATE docs SET title = ?, body = ?, v = ?, updated_at = ? WHERE id = ?')
        .run(doc.meta.title, JSON.stringify(doc), doc.v, now, doc.id);
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

  deleteDoc(id: string): boolean {
    this.cache.delete(id);
    this.db.prepare('DELETE FROM ops WHERE doc_id = ?').run(id);
    this.db.prepare('DELETE FROM messages WHERE doc_id = ?').run(id);
    return this.db.prepare('DELETE FROM docs WHERE id = ?').run(id).changes > 0;
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
}
