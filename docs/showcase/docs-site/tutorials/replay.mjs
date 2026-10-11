// Replays one tutorial (or all) on the replay server, following the page's steps with real input, then
// compares what was built with the tutorial's template and shoots both in Live, side by side.
//
//   node docs/showcase/docs-site/tutorials/replay.mjs [name …]      (the server is on REPLAY_PORT, 8794)
//
// Writes <name>-replayed.png, <name>-template.png, <name>-side-by-side.png and <name>.result.json into
// REPLAY_OUT (default: this folder); replay.sh turns the result files into replay.txt.

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BASE, Editor, tryTimes, timed, browser, comparable, diff, http, outDir, workDir, sessionFor, sleep, writeFileSync, HERE } from './lib.mjs';

export const NAMES = ['quote', 'checklist', 'wizard', 'order-tracker', 'dashboard', 'flowchart', 'deck', 'sharing', 'print-export', 'agent'];
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : NAMES;
const out = outDir();
const work = workDir();

/** The document as the server has it. */
export const getDoc = async (cookie, id) => (await http('GET', `/api/docs/${id}`, { cookie })).json;
export const fromTemplate = async (cookie, name) => (await http('POST', '/api/docs', { cookie, body: { template: `tutorial-${name}` } })).json.id;

/**
 * Two documents in Live at 1280 wide, shot to files: 800 high, or as high as the taller of the two needs
 * (the shot is the document's desk, so a long document is not cut off and the two pictures are the same size).
 */
export async function shootPair(b, cookie, [idA, fileA], [idB, fileB], { settle = 1800, width = 1280, height = 800, base = BASE } = {}) {
  const T0 = Date.now(); const lap = (l) => process.env.REPLAY_TRACE && console.error(`  shoot ${l} ${Date.now() - T0}ms`);
  const problems = [];
  /** One document on a page of its own at this height: what the desk needs, or its picture. One page at a time, so it is always the one in front. */
  const look = (id, h, file) => tryTimes(3, async () => {
    lap('open ' + id);
    const p = await b.page({ width, height: h, cookie, origin: base });
    lap('page');
    try {
      await p.send('Page.bringToFront');
      lap('front');
      await p.go(`${base}/d/${id}?view=live`, settle);
      lap('loaded');
      await sleep(600);
      await p.js(`document.querySelectorAll('.desk').forEach((d) => (d.scrollTop = 0)); 1`);
      if (!file) return await p.js(`(() => { const d = document.querySelector('.desk'); return Math.ceil(d.getBoundingClientRect().top + d.scrollHeight); })()`);
      const r = await p.js(`(() => { const r = document.querySelector('.desk').getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; })()`);
      const shot = await p.send('Page.captureScreenshot', { format: 'png', clip: { ...r, scale: 1 } });
      writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
      problems.push(...p.problems);
      return null;
    } finally {
      try { await p.send('Page.close'); } catch {}
      p.close();
    }
  }, 'shoot');
  const H = Math.min(2400, Math.max(height, await look(idA, height), await look(idB, height)));
  lap('measured');
  await look(idA, H, fileA); lap('a');
  await look(idB, H, fileB); lap('b');
  return problems;
}

export function sideBySide(a, b, file) {
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', a, '-i', b, '-filter_complex', 'hstack', file]);
  if (r.status !== 0) throw new Error('ffmpeg failed: ' + r.stderr);
}

async function run(name, b) {
  const mod = (await import(pathToFileURL(join(HERE, 'steps', `${name}.mjs`)).href)).default;
  const result = { name, steps: [], pass: false, diffs: [], ignored: mod.ignored ?? DEFAULT_IGNORED, problems: [], notes: [] };
  const t0 = Date.now();
  let ctx;
  const lap = (l) => process.env.REPLAY_TRACE && console.error(`[${name}] ${l} ${Math.round((Date.now() - t0) / 1000)}s`);
  try {
    let cookie;
    if (mod.account !== null) {
      const [email, who] = mod.account ?? ['reader@example.test', 'Reader'];
      cookie = await sessionFor(email.replace('@', (process.env.REPLAY_RUN ?? '') + '@'), who);
    }
    ctx = { b, name, cookie, result, out };
    /** Compare a document built in the editor with the tutorial's template and shoot both in Live. Run once, at the moment the build is finished. */
    ctx.compareNow = async (id, { cookie: ck = ctx.cookie } = {}) => {
      const L = (l) => process.env.REPLAY_TRACE && console.error(`  compare ${l} ${Math.round((Date.now() - t0) / 1000)}s`);
      L('begin');
      await ctx.ed.waitSaved();
      await sleep(400);
      L('saved');
      const replayed = await getDoc(ck, id);
      const tid = await fromTemplate(ck, name);
      const template = await getDoc(ck, tid);
      if (mod.normalize) { mod.normalize(replayed); mod.normalize(template); }
      const opts = { ignore: mod.ignoreProps ?? ['size'], ignoreMeta: mod.ignoreMeta ?? ['title'] };
      const a = comparable(replayed, opts), t = comparable(template, opts);
      result.diffs = diff(a, t);
      result.pass = result.diffs.length === 0;
      writeFileSync(join(work, `${name}.replayed.json`), JSON.stringify(a, null, 1));
      writeFileSync(join(work, `${name}.template.json`), JSON.stringify(t, null, 1));
      result.problems.push(...(await shootPair(b, ck, [id, join(out, `${name}-replayed.png`)], [tid, join(out, `${name}-template.png`)], mod.shot ?? {})));
      sideBySide(join(out, `${name}-replayed.png`), join(out, `${name}-template.png`), join(out, `${name}-side-by-side.png`));
      result.replayedId = id; result.templateId = tid;
    };
    ctx.ed = await Editor.open(b, { cookie, name });
    lap('start');
    const done = (await mod.build(ctx)) ?? {};
    lap('built');
    result.steps.push(...ctx.ed.steps);
    result.selectFallbacks = ctx.ed.fallbacks ?? 0;
    if (done.id && !result.templateId) await ctx.compareNow(done.id, { cookie: done.cookie ?? cookie });
    if (done.cookie) ctx.cookie = done.cookie;
    lap('compared');
    if (mod.use) {
      ctx.ed.steps.length = 0;
      await mod.use({ ...ctx, id: done.id });
      result.steps.push(...ctx.ed.steps);
    }
    result.problems.push(...ctx.ed.problems);
    for (const p of done.problems ?? []) result.problems.push(p);
  } catch (e) {
    result.error = e.stack ?? String(e);
    result.pass = false;
    if (ctx?.ed) { result.steps.push(...ctx.ed.steps); result.problems.push(...ctx.ed.problems); }
  }
  result.seconds = Math.round((Date.now() - t0) / 1000);
  writeFileSync(join(work, `${name}.result.json`), JSON.stringify(result, null, 1));
  console.log(`${result.pass ? 'PASS' : 'FAIL'} ${name} (${result.seconds}s)${result.error ? '\n' + result.error : ''}${result.diffs.length ? '\n  ' + result.diffs.join('\n  ') : ''}${result.problems.length ? '\n  console: ' + result.problems.join('; ') : ''}`);
  return result;
}

const DEFAULT_IGNORED = ["title (the replay types the page's title; the template has its own name)", 'size (what splitting a cell leaves: shares of the row or column; the template leaves every cell its equal share)', "an input's empty value (a field made in the editor holds '' where the template writes nothing: the same thing)"];

let b = await browser();
let failed = 0;
try {
  for (const name of wanted) {
    // A tutorial that hangs (a browser that stopped answering) is given up on, not waited for.
    const r = await Promise.race([run(name, b), new Promise((res) => setTimeout(() => res(null), 15 * 60 * 1000))]);
    if (r === null) {
      console.log(`FAIL ${name}: timed out after 15 minutes; the browser is restarted`);
      b.close(); b = await browser();
      failed++;
    } else if (!r.pass) failed++;
  }
} finally {
  b.close();
}
process.exit(failed ? 1 : 0);
