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

/**
 * The cloud answered and refused this request: one too large, or a statement
 * it would not run. Sent again as it is, it fails again; other requests still go.
 */
export class CloudRefused extends Error {}

export interface Cloud {
  /** Run statements in order, in one request. A statement that fails throws, with its message. */
  run(stmts: Stmt[]): Promise<Result[]>;
  /** Run statements as one transaction, in one request: all of them, or (when one fails, which throws) none. */
  atomic(stmts: Stmt[]): Promise<Result[]>;
  /** Rows read and written so far, by this process. */
  readonly stats: { requests: number; rowsRead: number; rowsWritten: number };
}

type Hrana = { type: 'null' } | { type: 'integer'; value: string } | { type: 'float'; value: number } | { type: 'text'; value: string } | { type: 'blob'; base64: string };
type StmtResult = { cols: { name: string }[]; rows: Hrana[][]; rows_read?: number; rows_written?: number };
type Answer = { type: 'ok'; response: { type: string; result?: unknown } } | { type: 'error'; error: { message: string } };

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
    const results = await this.pipeline(stmts.map((s) => ({ type: 'execute', stmt: stmtOf(s) })), stmts.length);
    return results.map((r) => {
      if (r.type === 'error') throw new CloudRefused(`the cloud refused a statement: ${r.error.message}`);
      return this.result(r.response.result as StmtResult);
    });
  }

  async atomic(stmts: Stmt[]): Promise<Result[]> {
    if (!stmts.length) return [];
    // A pipeline runs every statement in it, even after one fails: BEGIN … COMMIT there would commit the rest. A batch's
    // steps can wait on the one before: each runs only if the previous went, and ROLLBACK runs when COMMIT didn't.
    const all = [{ sql: 'BEGIN' }, ...stmts, { sql: 'COMMIT' }];
    const steps: { condition?: unknown; stmt: ReturnType<typeof stmtOf> }[] = all.map((s, i) => ({ ...(i ? { condition: { type: 'ok', step: i - 1 } } : {}), stmt: stmtOf(s) }));
    steps.push({ condition: { type: 'not', cond: { type: 'ok', step: all.length - 1 } }, stmt: stmtOf({ sql: 'ROLLBACK' }) });
    const [r] = await this.pipeline([{ type: 'batch', batch: { steps } }], 1);
    if (r.type === 'error') throw new CloudRefused(`the cloud refused a statement: ${r.error.message}`);
    const { step_results: results, step_errors: errors } = r.response.result as { step_results: (StmtResult | null)[]; step_errors: ({ message: string } | null)[] };
    // The first error is the cause; a ROLLBACK after it may fail too.
    const failed = errors.find((e) => e);
    if (failed) throw new CloudRefused(`the cloud refused a statement: ${failed.message}`);
    if (!results[all.length - 1]) throw new CloudDown('the cloud answered without results');
    return results.slice(1, all.length - 1).map((res) => this.result(res!));
  }

  /** One POST of these requests (and a close): their answers, at least `expect` of them. */
  private async pipeline(requests: unknown[], expect: number): Promise<Answer[]> {
    const body = JSON.stringify({ requests: [...requests, { type: 'close' }] });
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
    // Wrong credentials refuse every request alike: not one to skip, the whole round stops.
    if (res.status === 401 || res.status === 403) throw new Error(`the cloud refused the credentials (HTTP ${res.status}); check TURSO_AUTH_TOKEN`);
    if (res.status === 413) throw new CloudRefused('the cloud refused a request that large (HTTP 413)');
    if (!res.ok) throw new CloudDown(`the cloud answered HTTP ${res.status}`);
    const json = (await res.json()) as { results: Answer[] };
    if (!Array.isArray(json.results) || json.results.length < expect) throw new CloudDown('the cloud answered without results');
    return json.results.slice(0, expect);
  }

  private result(result: StmtResult): Result {
    const names = result.cols.map((c) => c.name);
    const rows = result.rows.map((row) => Object.fromEntries(row.map((v, j) => [names[j], fromHrana(v)])));
    this.stats.rowsRead += result.rows_read ?? 0;
    this.stats.rowsWritten += result.rows_written ?? 0;
    return { rows, rowsRead: result.rows_read ?? 0, rowsWritten: result.rows_written ?? 0 };
  }
}

const stmtOf = (s: Stmt) => ({ sql: s.sql, args: (s.args ?? []).map(toHrana) });

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
      throw new CloudRefused(`the cloud refused a statement: ${e instanceof Error ? e.message : e}`);
    }
  }

  async atomic(stmts: Stmt[]): Promise<Result[]> {
    // Here a failing statement stops the rest, and the transaction is rolled back (see `run`).
    return stmts.length ? (await this.run([{ sql: 'BEGIN' }, ...stmts, { sql: 'COMMIT' }])).slice(1, -1) : [];
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
