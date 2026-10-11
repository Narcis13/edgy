// Turns the result files of a replay (replay.mjs writes one per tutorial) into replay.txt.
//
//   node docs/showcase/docs-site/tutorials/report.mjs

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, outDir, workDir } from './lib.mjs';

const NAMES = ['quote', 'checklist', 'wizard', 'order-tracker', 'dashboard', 'flowchart', 'deck', 'sharing', 'print-export', 'agent'];
const work = workDir();
const out = outDir();
const changes = existsSync(join(HERE, 'changes.txt'))
  ? readFileSync(join(HERE, 'changes.txt'), 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#'))
  : [];

const lines = [];
const say = (s = '') => lines.push(s);
const results = NAMES.map((n) => (existsSync(join(work, `${n}.result.json`)) ? JSON.parse(readFileSync(join(work, `${n}.result.json`), 'utf8')) : { name: n, missing: true }));

say('Tutorials, replayed for real');
say('==========================');
say('Each tutorial of site/content/tutorials/ was followed step by step on a fresh production server (port 8794, empty data) with real input in headless Chrome:');
say('mouse clicks at the element\'s place on the screen, key presses, characters typed one key at a time. window.edgy was read, never written.');
say('The document each one builds was then compared with its template (src/core/tutorials.ts, tutorial-<name>): the cell trees with ids removed (kinds, names, props,');
say('values, expressions, order), and both were shot in Live at 1280 wide and put side by side (<name>-side-by-side.png: the replay on the left, the template on the right).');
say();
say('Rerun: bash docs/showcase/docs-site/tutorials/replay.sh        (one tutorial: bash docs/showcase/docs-site/tutorials/replay.sh quote)');
say();
say('Summary');
say('-------');
for (const r of results) {
  if (r.missing) { say(`  MISSING  ${r.name}`); continue; }
  const steps = r.steps.filter((s) => s.ok).length;
  say(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name.padEnd(14)} ${String(steps).padStart(2)} steps followed, ${r.diffs.length ? r.diffs.length + ' differences' : 'trees match'}, console problems: ${r.problems.length}${r.notes.length ? ', ' + r.notes.length + ' note(s)' : ''}`);
}
say();
for (const r of results) {
  say('='.repeat(72));
  say(`${r.name}: ${r.missing ? 'MISSING' : r.pass ? 'PASS' : 'FAIL'}`);
  say('='.repeat(72));
  if (r.missing) continue;
  say(`Steps followed (${r.steps.filter((s) => s.ok).length}${r.steps.some((s) => !s.ok) ? ', one failed' : ''}), as the page numbers them:`);
  for (const s of r.steps) say(`  ${s.ok ? 'ok  ' : 'FAIL'} ${String(s.n).padStart(2)}. ${s.text}${s.err ? '\n         ' + s.err.split('\n')[0] : ''}${s.problems ? '\n         console: ' + s.problems.join('; ') : ''}`);
  say();
  say(`Tree comparison: ${r.pass ? 'PASS' : 'FAIL'}${r.error ? ' (the replay stopped early, see below)' : ''}`);
  say('  Ignored in the comparison:');
  for (const i of r.ignored) say(`    - ${i}`);
  if (r.diffs.length) { say('  Differences:'); for (const d of r.diffs) say(`    - ${d}`); } else say('  Differences: none');
  if (r.error) { say('  Error:'); for (const l of r.error.split('\n').slice(0, 6)) say(`    ${l}`); }
  if (r.selectFallbacks) say(`  Selects: ${r.selectFallbacks} choice(s) in a <select> were set through the control's change event because the headless browser's popup did not take the typed keys.`);
  say(`  Console problems: ${r.problems.length ? '' : 'none'}`);
  for (const p of r.problems) say(`    - ${p}`);
  if (r.printedPages !== undefined) say(`  Printed: the Page view printed to a PDF with Page.printToPDF has ${r.printedPages} pages (print-export-printed.pdf); the export downloaded (${r.exportBytes} bytes) opened from file:// with the network off made ${r.offlineNetworkRequests} network requests and ${r.offlineProblems?.length ?? 0} console problems.`);
  if (r.tools) say(`  MCP: the server offered ${r.tools.length} tools (${r.tools.join(', ')}).`);
  if (r.activity) say(`  Activity, as the page shows it: ${r.activity}`);
  for (const n of r.notes) say(`  NOTE: ${n}`);
  const mine = changes.filter((c) => c.startsWith(r.name + '\t'));
  say(`  Page/template changes: ${mine.length ? '' : 'none'}`);
  for (const c of mine) say(`    - ${c.split('\t').slice(1).join(' ')}`);
  say(`  Evidence: ${r.name}-replayed.png, ${r.name}-template.png, ${r.name}-side-by-side.png${r.templateId ? '' : ' (not made)'}`);
  say(`  (${r.seconds}s)`);
  say();
}
writeFileSync(join(out, 'replay.txt'), lines.join('\n') + '\n');
console.log(lines.slice(0, 40 + NAMES.length).join('\n'));
