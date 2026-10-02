import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from './app';
import { Store } from './store';
import { type Bundle, fileName, fontsFor, rangeHits, sniffImage } from './export';
import type { ExportPayload } from '../core/offline';
import type { Getter } from './runner';

// A one-pixel PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

const bundle: Bundle = {
  js: 'document.title = "app"; const end = "</script>";',
  css: [
    '@font-face{font-family:Recursive Variable;src:url(/fonts/rec-latin.woff2)format("woff2");unicode-range:U+0-FF,U+20AC}',
    '@font-face{font-family:Recursive Variable;src:url(/fonts/rec-cyrillic.woff2)format("woff2");unicode-range:U+400-4FF}',
    '@font-face{font-family:Fraunces Variable;src:url(/fonts/fraunces.woff2)format("woff2");unicode-range:U+0-FF}',
    '@font-face{font-family:Lora Variable;font-style:italic;src:url(/fonts/lora-italic.woff2)format("woff2");unicode-range:U+0-FF}',
    '.x{background:url(https://cdn.example/bg.png)}',
  ].join(''),
  file: (path) => (/^\/fonts\/[\w.-]+$/.test(path) ? Buffer.from(`font bytes of ${path}`) : null),
};

function setup(o: { offline?: boolean } = {}) {
  const asked: string[] = [];
  const get: Getter = async (url) => {
    asked.push(url);
    if (url === 'https://pics.example/cat.png') return { status: 200, body: '', bytes: PNG };
    throw new Error('no network in tests');
  };
  const { app } = createApp(new Store(':memory:'), join(mkdtempSync(join(tmpdir(), 'edgy-')), 'assets'), undefined, {
    get, offline: async () => (o.offline === false ? null : bundle),
  });
  const call = async (method: string, path: string, body?: unknown, type = 'application/json') => {
    const res = await app.request(path, { method, headers: body === undefined ? {} : { 'content-type': type }, body: body === undefined ? undefined : body instanceof Buffer ? body : JSON.stringify(body) });
    return res;
  };
  return { call, asked };
}

/** The payload a file carries, read back out of it. */
const payloadOf = (html: string) => JSON.parse(/<script type="application\/json" id="edgy-export">([\s\S]*?)<\/script>/.exec(html)![1]) as ExportPayload;

test('an export holds its document, the records it reads and its pictures, and nothing else', async () => {
  const { call, asked } = setup();
  const upload = (await (await call('POST', '/api/assets', PNG, 'image/png')).json()) as { url: string };
  await call('POST', '/api/data/orders', { record: { item: 'Tea', qty: 2 } });
  await call('POST', '/api/data/salaries', { record: { who: 'Ann', pay: 99_000 } });
  const other = (await (await call('POST', '/api/docs', { title: 'Payroll', root: ['text', 'Confidential payroll notes'] })).json()) as { id: string };
  const doc = (await (await call('POST', '/api/docs', {
    title: 'Café menu',
    root: ['col',
      ['text', '# Café menu — Ünïcödé'],
      ['text', 'Not a tag: </script><b>bold?</b>'],
      ['image', { name: 'logo' }, upload.url],
      ['image', { name: 'cat' }, 'https://pics.example/cat.png'],
      ['image', { name: 'gone' }, 'https://unreachable.example/x.png'],
      ['fetch', { name: 'rate', headers: { Authorization: 'secret:RATES_KEY' } }, 'https://api.example/rate?apikey=hunter2'],
      ['formula', { name: 'n' }, ['len', ['rows', 'orders']]]],
  })).json()) as { id: string };

  const res = await call('GET', `/api/docs/${doc.id}/export`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type')!, /text\/html/);
  assert.equal(res.headers.get('content-disposition'), 'attachment; filename="cafe-menu.html"');
  assert.equal(res.headers.get('x-edgy-missing-pictures'), '1');
  const html = await res.text();

  // Nothing in the file points outside it.
  assert.ok(!/https?:\/\//i.test(html), 'no external URL anywhere: ' + (/.{40}https?:\/\/.{40}/i.exec(html)?.[0] ?? ''));
  assert.ok(!/\b(src|href)\s*=\s*["']?(?!data:)[^"'\s>]+/i.test(html.replace(/<script type="application\/json"[\s\S]*?<\/script>/, '')), 'no src or href in the page');
  assert.match(html, /Content-Security-Policy" content="default-src 'none'/);
  // No keys, no other documents, no unrelated collections.
  for (const secret of ['hunter2', 'RATES_KEY', 'Payroll', 'Confidential', 'salaries', '99000', other.id]) assert.ok(!html.includes(secret), secret);

  const p = payloadOf(html);
  assert.deepEqual(p.docs.map((d) => d.meta.title), ['Café menu']);
  assert.ok(!/<\/script><b>/.test(html), 'text in the data can not close the script element');
  assert.ok(JSON.stringify(p).includes('</script><b>bold?</b>'), 'and reads back as written');
  assert.deepEqual(Object.keys(p.records), ['orders']);
  assert.equal(p.records.orders[0].item, 'Tea');
  const cells = Object.fromEntries([...walkCells(p.docs[0].root)].map((c) => [c.name, c]));
  assert.match(cells.logo.src, /^data:image\/png;base64,/);
  assert.match(cells.cat.src, /^data:image\/png;base64,/);
  assert.equal(cells.gone.src, '');
  assert.equal(cells.rate.url, '');
  assert.equal(cells.rate.headers, undefined);
  assert.deepEqual(asked.sort(), ['https://pics.example/cat.png', 'https://unreachable.example/x.png']);

  // Only the font files its text needs, inside the file.
  assert.ok(html.includes(`data:font/woff2;base64,${Buffer.from('font bytes of /fonts/rec-latin.woff2').toString('base64')}`));
  for (const unused of ['rec-cyrillic', 'fraunces', 'lora-italic']) assert.ok(!html.includes(Buffer.from(`font bytes of /fonts/${unused}.woff2`).toString('base64')), unused);
  assert.ok(html.includes('.x{background:none}'));
  // The script can't end its own element early.
  assert.ok(html.includes('const end = "<\\/script>"'));
});

test('a deck exports its documents in order, as slides, without archived ones', async () => {
  const { call } = setup();
  const mk = async (title: string) => ((await (await call('POST', '/api/docs', { title })).json()) as { id: string }).id;
  const [a, b, c] = [await mk('One'), await mk('Two'), await mk('Three')];
  const deck = (await (await call('POST', '/api/decks', { title: 'Review', docs: [c, a, b] })).json()) as { id: string };
  await call('PATCH', `/api/docs/${b}`, { archived: true });
  const res = await call('GET', `/api/decks/${deck.id}/export`);
  const p = payloadOf(await res.text());
  assert.equal(p.kind, 'deck');
  assert.deepEqual(p.docs.map((d) => d.meta.title), ['Three', 'One']);
  assert.deepEqual(p.deck, { id: deck.id, title: 'Review', description: '', docs: [c, a] });
  assert.ok(p.shapes[c] && p.shapes[a]);
});

test('without the offline build an export says how to get it', async () => {
  const { call } = setup({ offline: false });
  const id = ((await (await call('POST', '/api/docs', { title: 'x' })).json()) as { id: string }).id;
  const res = await call('GET', `/api/docs/${id}/export`);
  assert.equal(res.status, 503);
  assert.match(((await res.json()) as { error: string }).error, /npm run build/);
});

test('font faces, ranges, picture types and names', () => {
  assert.equal(rangeHits('U+0-FF,U+131', new Set([0x41])), true);
  assert.equal(rangeHits('U+400-4FF', new Set([0x41, 0x20ac])), false);
  assert.equal(rangeHits('U+4??', new Set([0x4a0])), true);
  const css = fontsFor(bundle.css, new Set(['Lora Variable']), 'plain', true, bundle.file);
  assert.ok(css.includes('font-style:italic') && !css.includes('Recursive'));
  assert.equal(sniffImage(PNG), 'image/png');
  assert.equal(sniffImage(Buffer.from('<svg xmlns="x"></svg>')), 'image/svg+xml');
  assert.equal(sniffImage(Buffer.from('hello')), null);
  assert.equal(fileName('Ünïcödé: report / Q4!'), 'unicode-report-q4.html');
  assert.equal(fileName('???'), 'document.html');
});

function* walkCells(c: any): Generator<any> {
  yield c;
  for (const ch of c.children ?? []) if (ch && typeof ch === 'object' && 'kind' in ch) yield* walkCells(ch);
}
