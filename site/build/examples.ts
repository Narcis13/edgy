// Running what the pages show: the documents of live and notation blocks, the
// ops of ops blocks, and the expressions of sx blocks with their ⇒ results.
// The doc-tests use it; so could anything else that wants to check a page.

import type { Doc, Json, Op } from '../../src/core/types';
import { newDoc } from '../../src/core/types';
import { applyOps } from '../../src/core/ops';
import { type World, evalIn, plainValue } from '../../src/core/engine';
import { react } from '../../src/core/events';
import { deepEqual, read } from '../../src/core/sx';
import type { Example } from './markdown';
import { liveSource } from './blocks';

/** The fixed moment examples run at: 11 October 2026, 09:00 UTC (a Sunday). */
export const NOW = Date.UTC(2026, 9, 11, 9, 0);

export interface Run { doc: Doc; rows: Record<string, Record<string, Json>[]> }

/** The document of a live or notation block, with the records it brings. */
export function exampleDoc(ex: Example): Run {
  if (ex.lang === 'live') {
    const s = liveSource(ex);
    const ops: Op[] = [...Object.entries(s.meta ?? {}).map(([k, v]): Op => ['meta', k, v]), ['put', 'c1', s.root]];
    const rows: Run['rows'] = {};
    for (const [name, list] of Object.entries(s.data ?? {})) rows[name] = list.map((r, i) => ({ ...r, id: `r${i + 1}`, at: 0 }));
    return { doc: applyOps(newDoc('ex'), ops).doc, rows };
  }
  if (ex.lang === 'notation') {
    const body = JSON.parse(ex.source) as Json;
    const o = !Array.isArray(body) && body && typeof body === 'object' && 'root' in body ? (body as { root: Json; meta?: Record<string, Json> }) : { root: body };
    const ops: Op[] = [...Object.entries(o.meta ?? {}).map(([k, v]): Op => ['meta', k, v]), ['put', 'c1', o.root]];
    return { doc: applyOps(newDoc('ex'), ops).doc, rows: {} };
  }
  throw new Error(`a ${ex.lang} block has no document of its own`);
}

const world = (run: Run): World => ({ rows: (c) => run.rows[c] ?? [], now: NOW });

/** Apply an ops block (a JSON list of ops) to a document. */
export function applyOpsBlock(run: Run, source: string): Run {
  const ops = JSON.parse(source) as Op[];
  if (!Array.isArray(ops) || !ops.every(Array.isArray)) throw new Error('an ops block is a JSON list of ops: [["split", "c1", "row"], …]');
  return { ...run, doc: applyOps(run.doc, ops).doc };
}

/** The expressions of an sx block, each with the result the page states (if any). */
export function sxSteps(source: string): { expr: string; expect?: string }[] {
  const steps: { expr: string; expect?: string }[] = [];
  let cur: string[] = [];
  const flush = () => {
    if (cur.join('').trim()) steps.push({ expr: cur.join('\n') });
    cur = [];
  };
  for (const line of source.split('\n')) {
    const r = /^⇒\s?(.*)$/.exec(line);
    if (r) {
      flush();
      const last = steps.at(-1);
      if (!last || last.expect !== undefined) throw new Error(`"⇒ ${r[1]}" has no expression above it`);
      last.expect = r[1];
    } else if (/^\S/.test(line) && cur.length && balanced(cur.join('\n'))) {
      flush();
      cur.push(line);
    } else cur.push(line);
  }
  flush();
  return steps;
}

function balanced(s: string): boolean {
  let d = 0;
  let str = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (str) { if (c === '\\') i++; else if (c === '"') str = false; continue; }
    if (c === '"') str = true;
    else if (c === '(' || c === '{') d++;
    else if (c === ')' || c === '}') d--;
  }
  return d <= 0;
}

export interface Checked { expr: string; expect?: string; got: string; ok: boolean }

/**
 * Run an sx block: each expression against the document (or none), in order.
 * An action (set!, insert!, …) runs the way a click does, handlers included,
 * and the expressions after it see what it changed. `⇒ error: words` expects an error containing them.
 */
export function runSx(source: string, start?: Run): Checked[] {
  // Each block starts from the example as written: records one block saves never leak into the next.
  let run: Run = start ? { doc: start.doc, rows: structuredClone(start.rows) } : { doc: newDoc('ex'), rows: {} };
  const out: Checked[] = [];
  for (const step of sxSteps(source)) {
    const x = read(step.expr);
    let r = evalIn(run.doc, world(run), x);
    let got: string;
    if (r.error && /only works in an action/.test(r.error)) {
      const re = react(run.doc, world(run), { run: { cell: run.doc.root.id, name: 'click', action: x } }, NOW);
      const err = re.trace.find((t) => t.error)?.error;
      run = { doc: re.doc, rows: { ...run.rows } };
      for (const e of re.effects) {
        const list = (run.rows[(e as { collection?: string }).collection ?? ''] ??= []);
        if (e.type === 'insert') list.push({ ...e.record, id: `r${list.length + 1}`, at: NOW });
        if (e.type === 'update') Object.assign(list.find((row) => row.id === e.id) ?? {}, e.fields);
        if (e.type === 'delete') run.rows[e.collection] = list.filter((row) => row.id !== e.id);
        if (e.type === 'clear') run.rows[e.collection] = [];
      }
      r = err ? { error: err } : { value: null };
    }
    if (r.error !== undefined) got = `error: ${r.error}`;
    else got = JSON.stringify(plainValue(r.value));
    let ok = true;
    if (step.expect !== undefined) {
      if (step.expect.startsWith('error:')) ok = r.error !== undefined && r.error.toLowerCase().includes(step.expect.slice(6).trim().toLowerCase());
      else if (r.error !== undefined) ok = false;
      else {
        try {
          ok = deepEqual(plainValue(r.value), expected(step.expect));
        } catch (e) {
          ok = false;
          got += ` (could not read the stated result: ${e instanceof Error ? e.message : e})`;
        }
      }
    } else if (r.error !== undefined) ok = false;
    out.push({ expr: step.expr, expect: step.expect, got, ok });
  }
  return out;
}

/** A stated result, written the way the language writes values: 3, "text", (list 1 2), {total 5}, nil, true. */
function expected(text: string): unknown {
  const x = read(text);
  const lit = (v: Json): unknown => {
    if (Array.isArray(v)) {
      if (v[0] === 'list') return v.slice(1).map(lit);
      if (v[0] === 'quote') return v[1];
      return v.map(lit);
    }
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, y]) => [k, lit(y)]));
    if (typeof v === 'string' && v.startsWith('$')) {
      const name = v.slice(1);
      if (name === 'yes' || name === 'true') return true;
      if (name === 'no' || name === 'false') return false;
      return name;
    }
    return v;
  };
  return lit(x);
}
