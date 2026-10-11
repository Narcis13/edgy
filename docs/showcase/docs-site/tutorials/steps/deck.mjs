// Tutorial: Documents played as slides (site/content/tutorials/deck.md)
// Builds the three documents through the UI, groups them in the library, orders them and plays them.
// The document compared with the template is the middle slide, Q4 review: numbers.

import { sleep } from '../lib.mjs';

export default {
  account: ['deck@example.test', 'Deck Reader'],
  async build({ ed }) {
    let numbers;
    const logo = async () => {
      await ed.waitSaved();
      await ed.clickEl(`document.querySelector('a.brand')`);
      await ed.waitFor(`location.pathname === '/'`);
      await sleep(900);
    };
    const reset = async (label) => ed.clickEl(`(${ed.propExpr(label)})?.querySelector('.ins-reset')`);

    await ed.step(1, 'New document, title Q4 review: title', async () => {
      await ed.newDocument();
      await ed.setTitle('Q4 review: title');
    });
    await ed.step(2, 'Click the empty cell, type # Q4 review, Esc', async () => {
      await ed.clickCell({ kind: 'empty' });
      await ed.type('# Q4 review');
      await ed.key('Escape');
    });
    await ed.step(3, 'Alt+Down, type Northwind Studio, Esc', async () => {
      await ed.split('down');
      await ed.type('Northwind Studio');
      await ed.key('Escape');
      await ed.expectSelected('text', { text: 'Northwind Studio' });
    });
    await ed.step(4, 'Click the logo (All documents) to go back to the home page', logo);

    await ed.step(5, 'New document, title Q4 review: numbers; Currency EUR', async () => {
      numbers = await ed.newDocument();
      await ed.setTitle('Q4 review: numbers');
      await ed.setField('Currency', 'EUR');
    });
    await ed.step(6, 'Click the empty cell, # Numbers, Esc, Alt+Down, / Stat', async () => {
      await ed.clickCell({ kind: 'empty' });
      await ed.type('# Numbers');
      await ed.key('Escape');
      await ed.split('down');
      await ed.slash('Stat');
      await ed.expectSelected('stat');
    });
    await ed.step(7, 'Default beside Trend; Number 41200, Label Billed, Compare with 38000', async () => {
      await reset('Trend');
      await ed.setField('Number', '41200');
      await ed.setField('Label', 'Billed');
      await ed.setField('Compare with', '38000');
    });
    await ed.step(8, 'Click the stat, Alt+Right, / Stat, Default beside Trend, Percent, Number 0.85, Label On time, Compare with 0.8', async () => {
      await ed.clickCell({ kind: 'stat' });
      await ed.split('right');
      await ed.slash('Stat');
      await reset('Trend');
      await ed.pick('Show the number as', 'Percent');
      await ed.setField('Number', '0.85');
      await ed.setField('Label', 'On time');
      await ed.setField('Compare with', '0.8');
      await ed.expectSelected('stat', { label: 'On time', format: 'percent' });
    });
    await ed.step(9, 'Click the logo to go back to the home page', logo);

    await ed.step(10, 'New document, title Q4 review: next', async () => {
      await ed.newDocument();
      await ed.setTitle('Q4 review: next');
    });
    await ed.step(11, 'Click the empty cell, # Next, Esc, Alt+Down, / Bulleted list: two sample items', async () => {
      await ed.clickCell({ kind: 'empty' });
      await ed.type('# Next');
      await ed.key('Escape');
      await ed.split('down');
      await ed.slash('Bulleted list');
      await ed.expectSelected('list', { type: 'bullet' });
    });
    const item = (i) => `(${ed.cellExpr({ kind: 'list' })})?.querySelectorAll('.klist-item')[${i}]?.querySelector('.klist-text')`;
    await ed.step(12, 'Click the first item, select all, type, Tab; the second the same', async () => {
      for (const [i, text] of ['Hire a second developer', 'Raise day rates'].entries()) {
        await ed.clickEl(item(i));
        await ed.key('ctrl+a', { wait: 80 });
        await ed.type(text);
        await ed.key('Tab', { wait: 300 });
      }
      const v = await ed.js(`JSON.stringify(window.edgy.state.doc.root.children.find((c) => c.kind === 'list').value.map((i) => i.text ?? i))`);
      await ed.check('the two items', v.includes('Hire a second developer') && v.includes('Raise day rates'), v);
    });
    await ed.step(13, 'Click the logo to go back to the home page', logo);

    await ed.step(14, 'Tick the box on the three Q4 review cards: a bar appears at the bottom', async () => {
      for (const t of ['Q4 review: title', 'Q4 review: numbers', 'Q4 review: next']) {
        await ed.clickEl(`document.querySelector('input.lc-check[aria-label=${JSON.stringify('Select ' + t)}]')`);
      }
      await ed.check('the selection bar shows', await ed.js(`!!document.querySelector('.lib-selbar')`));
    });
    await ed.step(15, 'Group into a deck; Title Q4 review; Group', async () => {
      await ed.press('Group into a deck', '.lib-selbar', { exact: false });
      await ed.waitFor(`document.querySelector('.lib-group')`);
      await ed.clickEl(`document.querySelector('.lib-group input')`);
      await ed.key('ctrl+a', { wait: 80 });
      await ed.type('Q4 review');
      await ed.press('Group', '.lib-group');
      await ed.waitFor(`!document.querySelector('.lib-group')`);
      await sleep(800);
      const t = await ed.js(`document.body.innerText`);
      await ed.check('the deck is in the library', /Q4 review/.test(t));
    });
    await ed.step(16, "Click the deck card's title: its page lists the slides", async () => {
      await ed.clickEl(`[...document.querySelectorAll('.lib-card a, .lib-card button, a, h3')].find((e) => e.innerText.trim() === 'Q4 review')`);
      await ed.waitFor(`location.pathname.startsWith('/deck/')`);
      await sleep(800);
      ed.deckPath = await ed.js(`location.pathname`);
    });
    const order = () => ed.js(`[...document.querySelectorAll('.deck-slides > li')].map((li) => (li.querySelector('h2, h3, .deck-slide-title, a') ?? li).innerText.trim().split('\\n')[0])`);
    await ed.step(17, 'Move up and Move down until the order is title, numbers, next', async () => {
      const want = ['Q4 review: title', 'Q4 review: numbers', 'Q4 review: next'];
      for (let guard = 0; guard < 8; guard++) {
        const now = await order();
        const i = want.findIndex((t, k) => now[k] !== t);
        if (i < 0) break;
        // Move the slide that belongs here up until it is here.
        await ed.clickEl(`document.querySelector('button[aria-label=${JSON.stringify(`Move “${want[i]}” up`)}]')`);
        await sleep(500);
      }
      const now = await order();
      await ed.check('the slides are in order', JSON.stringify(now) === JSON.stringify(want), JSON.stringify(now));
    });
    await ed.step(18, 'Description: The Q4 numbers in three slides, Enter', async () => {
      await ed.clickEl(`document.querySelector('[aria-label=Description]')`);
      await ed.key('ctrl+a', { wait: 80 });
      await ed.type('The Q4 numbers in three slides');
      await ed.key('Enter', { wait: 500 });
      await ed.clickAt(5, 400); // out of the field
      await sleep(500);
      const v = await ed.js(`document.querySelector('[aria-label=Description]').value`);
      await ed.check('the description is kept', v === 'The Q4 numbers in three slides', v);
    });
    ed.deckPage = await ed.js('location.pathname');
    await ed.p.shot(process.env.REPLAY_OUT ? process.env.REPLAY_OUT + '/deck-page.png' : 'deck-page.png');
    await ed.step(19, 'Play: the first slide fills the screen; → next, ← back, Esc leaves', async () => {
      await ed.press('Play', 'body');
      await ed.waitFor(`location.pathname.endsWith('/play')`);
      await sleep(2500);
      const slide = () => ed.js(`document.querySelector('.slide-room')?.innerText ?? ''`);
      let t = await slide();
      await ed.check('the first slide is the title', /Q4 review/.test(t) && /Northwind Studio/.test(t), t);
      await ed.p.shot(process.env.REPLAY_OUT ? process.env.REPLAY_OUT + '/deck-play-1.png' : 'deck-play-1.png');
      await ed.key('ArrowRight', { wait: 1800 });
      t = await slide();
      await ed.check('→ shows the numbers slide', /Numbers/.test(t) && /Billed/.test(t), t);
      await ed.p.shot(process.env.REPLAY_OUT ? process.env.REPLAY_OUT + '/deck-play-2.png' : 'deck-play-2.png');
      await ed.key('ArrowRight', { wait: 1800 });
      t = await slide();
      await ed.check('→ again shows the next slide', /Hire a second developer/.test(t), t);
      await ed.key('ArrowLeft', { wait: 1800 });
      t = await slide();
      await ed.check('← goes back to the numbers slide', /Billed/.test(t), t);
      await ed.key('Escape', { wait: 1200 });
      await ed.waitFor(`location.pathname.startsWith('/deck/') && !location.pathname.endsWith('/play')`);
    });
    return { id: numbers };
  },
};
