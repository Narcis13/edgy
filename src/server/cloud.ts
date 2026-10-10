// The database in the cloud that sync talks to: Turso (hosted libSQL) over its
// HTTP API, one JSON POST per batch of statements (Hrana over HTTP,
// /v2/pipeline). No client library: the protocol is that one request.
//
// A local stand-in runs the same SQL in a node:sqlite database, for tests,
// and can be switched off to play an unreachable cloud.

import { DatabaseSync } from 'node:sqlite';

export type Value = string | number | null | Uint8Array;

export interface Stmt {
  sql: string;
  args?: Value[];
}

export interface Result {
  rows: Record<string, Value>[];
  /** What Turso bills: rows the statement read and wrote (0 from the stand-in). */
  rowsRead: number;
  rowsWritten: number;
}

/** The cloud could not be reached, or didn't answer: try again later. */
export class CloudDown extends Error {}

export interface Cloud {
  /** Run statements in order, in one request. A statement that fails throws, with its message. */
  run(stmts: Stmt[]): Promise<Result[]>;
  /** Rows read and written so far, by this process. */
  readonly stats: { requests: number; rowsRead: number; rowsWritten: number };
}

type Hrana = { type: 'null' } | { type: 'integer'; value: string } | { type: 'float'; value: number } | { type: 'text'; value: string } | { type: 'blob'; base64: string };

function toHrana(v: Value): Hrana {
  if (v === null) return { type: 'null' };
  if (typeof v === 'number') return Number.isInteger(v) ? { type: 'integer', value: String(v) } : { type: 'float', value: v };
  if (typeof v === 'string') return { type: 'text', value: v };
  return { type: 'blob', base64: Buffer.from(v).toString('base64') };
}

function fromHrana(v: Hrana): Value {
  switch (v.type) {
    case 'null': return null;
    case 'integer': return Number(v.value);
    case 'float': return v.value;
    case 'text': return v.value;
    case 'blob': return new Uint8Array(Buffer.from(v.base64, 'base64'));
  }
}

/** libsql://name.turso.io → https://name.turso.io; http(s) addresses are used as they are (a local gate in tests). */
export function pipelineUrl(url: string): string {
  const u = url.trim().replace(/^libsql:\/\//i, 'https://').replace(/\/+$/, '');
  return u + '/v2/pipeline';
}

export class HttpCloud implements Cloud {
  readonly stats = { requests: 0, rowsRead: 0, rowsWritten: 0 };
  private endpoint: string;

  constructor(url: string, private token: string, private ms = 15_000, private doFetch: typeof fetch = fetch) {
    this.endpoint = pipelineUrl(url);
  }

  async run(stmts: Stmt[]): Promise<Result[]> {
    if (!stmts.length) return [];
    const body = JSON.stringify({
      requests: [...stmts.map((s) => ({ type: 'execute', stmt: { sql: s.sql, args: (s.args ?? []).map(toHrana) } })), { type: 'close' }],
    });
    let res: Response;
    try {
      res = await this.doFetch(this.endpoint, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
        body,
        signal: AbortSignal.timeout(this.ms),
      });
    } catch (e) {
      throw new CloudDown(`the cloud did not answer (${e instanceof Error ? e.name : 'error'})`);
    }
    this.stats.requests++;
    if (res.status === 401 || res.status === 403) throw new Error(`the cloud refused the credentials (HTTP ${res.status}); check TURSO_AUTH_TOKEN`);
    if (res.status === 413) throw new Error('the cloud refused a request that large (HTTP 413)');
    if (!res.ok) throw new CloudDown(`the cloud answered HTTP ${res.status}`);
    const json = (await res.json()) as { results: ({ type: 'ok'; response: { type: string; result?: { cols: { name: string }[]; rows: Hrana[][]; rows_read?: number; rows_written?: number } } } | { type: 'error'; error: { message: string } })[] };
    const out: Result[] = [];
    for (let i = 0; i < stmts.length; i++) {
      const r = json.results[i];
      if (!r) throw new CloudDown('the cloud answered without results');
      if (r.type === 'error') throw new Error(`the cloud refused a statement: ${r.error.message}`);
      const result = r.response.result!;
      const names = result.cols.map((c) => c.name);
      const rows = result.rows.map((row) => Object.fromEntries(row.map((v, j) => [names[j], fromHrana(v)])));
      this.stats.rowsRead += result.rows_read ?? 0;
      this.stats.rowsWritten += result.rows_written ?? 0;
      out.push({ rows, rowsRead: result.rows_read ?? 0, rowsWritten: result.rows_written ?? 0 });
    }
    return out;
  }
}

/** The same SQL in a local database: what tests sync through. `down` plays an unreachable cloud. */
export class LocalCloud implements Cloud {
  readonly stats = { requests: 0, rowsRead: 0, rowsWritten: 0 };
  readonly db: DatabaseSync;
  down = false;
  /** Tests: a request this says yes to breaks off before it runs, as a dropped connection would. */
  failIf: ((stmts: Stmt[]) => boolean) | null = null;

  constructor(file = ':memory:') {
    this.db = new DatabaseSync(file);
  }

  async run(stmts: Stmt[]): Promise<Result[]> {
    // An answer never arrives in the same tick, as over the network.
    await new Promise((r) => setImmediate(r));
    if (this.down) throw new CloudDown('the cloud did not answer (offline)');
    if (this.failIf?.(stmts)) throw new CloudDown('the connection broke off');
    this.stats.requests++;
    try {
      return this.runAll(stmts);
    } catch (e) {
      // As a request that breaks off does over the network: a transaction it opened ends.
      try { this.db.exec('ROLLBACK'); } catch { /* none open */ }
      throw e;
    }
  }

  private runAll(stmts: Stmt[]): Result[] {
    return stmts.map((s) => {
      const st = this.db.prepare(s.sql);
      const args = (s.args ?? []) as (string | number | null | Uint8Array)[];
      if (/^\s*(select|with)\b/i.test(s.sql) || /\breturning\b/i.test(s.sql)) {
        return { rows: st.all(...args) as Record<string, Value>[], rowsRead: 0, rowsWritten: 0 };
      }
      st.run(...args);
      return { rows: [], rowsRead: 0, rowsWritten: 0 };
    });
  }
}

/** The cloud from the environment, or null: sync is off without both variables. */
export function cloudFromEnv(env: Record<string, string | undefined> = process.env): HttpCloud | null {
  const url = env.TURSO_URL?.trim();
  const token = env.TURSO_AUTH_TOKEN?.trim();
  return url && token ? new HttpCloud(url, token) : null;
}
