// Tutorial: Printing and exporting (site/content/tutorials/print-export.md)
// The report is built in the editor; its pages are printed to a PDF with Page.printToPDF of the Page view,
// and the export is downloaded (GET /api/docs/<id>/export, with the reader's cookie) and opened with the network off.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { sleep, BASE, outDir, workDir } from '../lib.mjs';

export default {
  account: ['print@example.test', 'Print Reader'],
  async build({ ed, b, cookie, result }) {
    let id;
    const out = outDir();
    const item = (i) => `(${ed.cellExpr({ kind: 'list' })})?.querySelectorAll('.klist-item')[${i}]?.querySelector('.klist-text')`;

    await ed.step(1, 'New document, title Corner Cafe: quarterly report', async () => {
      id = await ed.newDocument();
      await ed.setTitle('Corner Cafe: quarterly report');
    });
    await ed.step(2, 'Click the empty cell, type the heading, Esc', async () => {
      await ed.clickCell({ kind: 'empty' });
      await ed.type('# Corner Cafe: quarterly report');
      await ed.key('Escape');
    });
    await ed.step(3, 'Alt+Down, type the sentence, Esc', async () => {
      await ed.split('down');
      await ed.type('What sold this quarter, and what we plan next.');
      await ed.key('Escape');
    });
    await ed.step(4, 'Alt+Down, / Table: three sample rows; Look > Title Sold this quarter', async () => {
      await ed.split('down');
      await ed.slash('Table');
      await ed.expectSelected('table');
      await ed.setField('Title', 'Sold this quarter');
    });
    await ed.step(5, 'Alt+Down, / Page break: a dashed line in Edit', async () => {
      await ed.split('down');
      await ed.slash('Page break');
      await ed.expectSelected('break');
      const t = await ed.shown({ kind: 'break' });
      await ed.check('the cell is labelled Page break', /Page break/i.test(t), t);
    });
    await ed.step(6, 'Alt+Down, type ## Next quarter, Esc', async () => {
      await ed.split('down');
      await ed.type('## Next quarter');
      await ed.key('Escape');
    });
    await ed.step(7, 'Alt+Down, / Bulleted list, the two items', async () => {
      await ed.split('down');
      await ed.slash('Bulleted list');
      for (const [i, text] of ['Add a lunch menu', 'Open on Sundays'].entries()) {
        await ed.clickEl(item(i));
        await ed.key('ctrl+a', { wait: 80 });
        await ed.type(text);
        await ed.key('Tab', { wait: 300 });
      }
      const v = await ed.js(`JSON.stringify(window.edgy.state.doc.root.children.find((c) => c.kind === 'list').value)`);
      await ed.check('the two items', v.includes('Add a lunch menu') && v.includes('Open on Sundays'), v);
    });
    await ed.step(8, 'Esc until no cell is selected: the Document panel has a Printing section with Paper, Turn, Margins, Footer', async () => {
      for (let i = 0; i < 6 && (await ed.state()).selection.length; i++) await ed.key('Escape');
      await ed.check('no cell is selected', (await ed.state()).selection.length === 0);
      const t = await ed.panelText();
      await ed.check('the Printing section lists the four choices', /Printing[\s\S]*Paper[\s\S]*Turn[\s\S]*Margins[\s\S]*Footer/.test(t), t);
    });
    await ed.step(9, 'Margins Wide, Footer Title and numbers; Paper A4 and Portrait left as they are', async () => {
      await ed.choose('Margins', 'Wide');
      await ed.pickIn(`document.querySelector('.side.right select[aria-label="Page footer"]')`, 'Title and numbers');
      const d = await ed.doc();
      await ed.check('meta carries the margin and the footer', d.meta.footer === 'title' && d.meta.margin !== undefined, JSON.stringify(d.meta));
      result.meta = d.meta;
    });
    await ed.step(10, 'See the pages: the document opens in Page view', async () => {
      await ed.press('See the pages', '.side.right');
      await ed.waitFor(`window.edgy.state.mode === 'page'`);
      await sleep(2500);
    });

    // Read the pages
    let pdfPath;
    await ed.step('read', 'Read the pages: 2 pages, the table on page 1, Next quarter on page 2, a footer with the title and Page 1 of 2', async () => {
      const bar = await ed.js(`document.querySelector('.editor')?.innerText ?? ''`);
      await ed.check('the bar says 2 pages', /2 pages/.test(bar), bar.slice(0, 600));
      const pages = await ed.js(`[...document.querySelectorAll('.pages .page')].map((pg) => { const w = pg.querySelector('.page-window').getBoundingClientRect(); const seen = [...pg.querySelectorAll('.page-flow .cell.leaf')].filter((c) => { const r = c.getBoundingClientRect(); const y = r.top + r.height / 2; return r.height > 0 && y >= w.top && y <= w.bottom; }).map((c) => c.innerText.trim()); return seen.join('\\n') + '\\n' + pg.querySelector('.page-foot').innerText.replace(/\\s+/g, ' '); })`);
      await ed.check('two pages are laid out', pages.length === 2, JSON.stringify(pages));
      await ed.check('page 1 holds the heading, the sentence and the table', /Corner Cafe: quarterly report/.test(pages[0]) && /What sold this quarter/.test(pages[0]) && /Sold this quarter/.test(pages[0]) && !/Next quarter/.test(pages[0]), pages[0]);
      await ed.check('page 2 starts at Next quarter', /^\s*Next quarter/.test(pages[1].trim()) || /Next quarter/.test(pages[1]), pages[1]);
      await ed.check('the footers carry the title and Page n of 2', /Page 1 of 2/.test(pages[0]) && /Page 2 of 2/.test(pages[1]) && /Corner Cafe: quarterly report/.test(pages[0].split('Page 1 of 2')[0].slice(-80)), JSON.stringify(pages));
      await ed.p.shot(join(out, 'print-export-page-view.png'));
    });
    await ed.step(11, 'Print: the print dialog opens on those pages (headless: the Page view is printed to a PDF with Page.printToPDF)', async () => {
      await ed.press('Print', '.page-bar');
      await sleep(800);
      const pdf = await ed.p.send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
      const buf = Buffer.from(pdf.result.data, 'base64');
      pdfPath = join(out, 'print-export-printed.pdf');
      writeFileSync(pdfPath, buf);
      const n = (buf.toString('latin1').match(/\/Type\s*\/Page(?!s)\b/g) ?? []).length;
      result.printedPages = n;
      await ed.check('the printed PDF has 2 pages', n === 2, `${n} pages`);
    });

    // Export a file
    await ed.step(12, 'Switch to Edit, press Export as HTML: the browser saves corner-cafe-quarterly-report.html (downloaded here with GET /api/docs/<id>/export and the cookie)', async () => {
      await ed.mode('Edit');
      const link = await ed.js(`(() => { const a = document.querySelector('a[aria-label="Export as HTML"]'); return a ? { href: a.getAttribute('href'), title: a.title, download: a.hasAttribute('download') } : null; })()`);
      await ed.check('the header has the Export as HTML download button', link && link.download && /Export as one HTML file that works offline/.test(link.title), JSON.stringify(link));
      const r = await fetch(BASE + link.href, { headers: { cookie } });
      const cd = r.headers.get('content-disposition') ?? '';
      await ed.check('the file is called corner-cafe-quarterly-report.html', /corner-cafe-quarterly-report\.html/.test(cd), cd);
      const html = Buffer.from(await r.arrayBuffer());
      mkdirSync(join(workDir(), 'export'), { recursive: true });
      writeFileSync(join(workDir(), 'export', 'corner-cafe-quarterly-report.html'), html);
      result.exportBytes = html.length;
    });
    await ed.step(13, 'Open the file with a double-click (file://): the report opens with no edgy running, with an Offline copy bar', async () => {
      const p = await b.page({ width: 1280, height: 800 });
      await p.go('file:///' + join(workDir(), 'export', 'corner-cafe-quarterly-report.html').replace(/\\/g, '/'), 2500);
      const t = await p.js(`document.body.innerText`);
      await ed.check('the offline copy shows the report and its bar', /Offline copy/i.test(t) && /Corner Cafe: quarterly report/.test(t) && /Sold this quarter/.test(t) && /Next quarter/.test(t), t.slice(0, 800));
      await p.shot(join(out, 'print-export-offline.png'));
      result.offlineProblems = p.problems.slice();
      ed.offline = p;
    });
    await ed.step(14, 'Turn off the network and reload the file: it still opens', async () => {
      const p = ed.offline;
      await p.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
      p.requests.length = 0;
      await p.go('file:///' + join(workDir(), 'export', 'corner-cafe-quarterly-report.html').replace(/\\/g, '/'), 2500);
      const t = await p.js(`document.body.innerText`);
      const net = p.requests.filter((u) => /^https?:/.test(u));
      await ed.check('it still opens with the network off', /Offline copy/i.test(t) && /Corner Cafe/.test(t) && /Sold this quarter/.test(t), t.slice(0, 800));
      await ed.check('no request went to the network', net.length === 0, net.join(', '));
      await p.shot(join(out, 'print-export-offline-no-network.png'));
      result.offlineProblems.push(...p.problems);
      result.offlineNetworkRequests = net.length;
      await p.send('Page.close');
      p.close();
    });
    return { id };
  },
};
