// Tutorial: A dashboard from records (site/content/tutorials/dashboard.md)

import { sleep } from '../lib.mjs';

export default {
  // Its own reader: the page starts from an `orders` collection that is empty, so it opens the tracker template for the sample orders.
  account: ['dashboard@example.test', 'Dashboard Reader'],
  async build({ ed }) {
    let id;
    const reset = async (label) => ed.clickEl(`(${ed.propExpr(label)})?.querySelector('.ins-reset')`);
    await ed.step(0, 'Have records to read: on the Templates page, Open in edgy beside Order tracker (six sample orders are saved)', async () => {
      await ed.go('/docs/library/templates/', 2000);
      await ed.clickEl(`document.querySelector('[data-open-template="tutorial-order-tracker"]')`);
      await ed.waitFor(`location.pathname.startsWith('/d/')`, 10000);
      await sleep(1500);
      ed.trackerId = await ed.js(`location.pathname.split('/')[2]`);
    });
    await ed.step(1, 'New document, title Orders dashboard', async () => {
      id = await ed.newDocument();
      await ed.setTitle('Orders dashboard');
    });
    await ed.step(2, 'With no cell selected, Currency EUR', () => ed.setField('Currency', 'EUR'));
    await ed.step(3, 'Click the empty cell, type # Orders at a glance, Esc', async () => {
      await ed.clickCell({ kind: 'empty' });
      await ed.type('# Orders at a glance');
      await ed.key('Escape');
      await ed.expectSelected('text', { text: '# Orders at a glance' });
    });
    await ed.step(4, 'Alt+Down, / Stat, Enter: a sample figure', async () => {
      await ed.split('down');
      await ed.slash('Stat');
      await ed.expectSelected('stat');
    });
    await ed.step(5, 'Number: (sum (column (rows "orders") "total"))', async () => {
      await ed.setField('Number', '(sum (column (rows "orders") "total"))');
    });
    await ed.step(6, 'Label Taken; Show the number as stays Currency', async () => {
      await ed.setField('Label', 'Taken');
      const c = await ed.selected();
      await ed.check('the number is shown as currency', c.format === 'currency', JSON.stringify(c));
    });
    await ed.step(7, 'Compare with 360; Trend (column (rows "orders") "total")', async () => {
      await ed.setField('Compare with', '360');
      await ed.setField('Trend', '(column (rows "orders") "total")');
      const t = await ed.shown({ kind: 'stat' });
      await ed.check('vs €360.00 shows beside the change', /360\.00/.test(t), t);
    });
    await ed.step(8, 'Alt+Right, / Stat, Number (len (rows "orders")), Label Orders', async () => {
      await ed.split('right');
      await ed.slash('Stat');
      await ed.setField('Number', '(len (rows "orders"))');
      await ed.setField('Label', 'Orders');
    });
    await ed.step(9, 'Default beside Compare with and Trend; Show the number as: Automatic', async () => {
      await reset('Compare with');
      await reset('Trend');
      await ed.pick('Show the number as', 'Automatic');
    });
    await ed.step(10, 'Click the second stat, Alt+Right, / Stat, Number (count-if …), Label Waiting to ship', async () => {
      await ed.clickCell({ kind: 'stat', nth: 1 });
      await ed.split('right');
      await ed.slash('Stat');
      await ed.setField('Number', '(count-if (= (get it "status") "New") (rows "orders"))');
      await ed.setField('Label', 'Waiting to ship');
    });
    await ed.step(11, 'Compare with 4; Default beside Trend; Automatic; Lower is better', async () => {
      await ed.setField('Compare with', '4');
      await reset('Trend');
      await ed.pick('Show the number as', 'Automatic');
      await ed.clickEl(`[...document.querySelectorAll('.side.right button[role=switch]')].find((b) => /Lower is better/.test(b.innerText))`);
      await ed.expectSelected('stat', { label: 'Waiting to ship', better: 'down' });
    });
    await ed.step(12, 'Click the third stat, Esc, Alt+Down, / Bar chart; Numbers, Title Total by customer, Show numbers as Currency', async () => {
      await ed.clickCell({ kind: 'stat', nth: 2 });
      await ed.key('Escape');
      await ed.expectSelected('row');
      await ed.split('down');
      await ed.slash('Bar chart');
      await ed.expectSelected('chart', { type: 'bar' });
      await ed.setField('Numbers', '(map {label (get it "customer") value (get it "total")} (rows "orders"))');
      await ed.setField('Title', 'Total by customer');
      await ed.pick('Show numbers as', 'Currency');
    });
    await ed.step(13, 'Click the chart, Alt+Right, / Donut; Numbers, Title Orders by status', async () => {
      await ed.clickCell({ kind: 'chart' });
      await ed.split('right');
      await ed.slash('Donut');
      await ed.expectSelected('chart', { type: 'donut' });
      await ed.setField('Numbers', '(map (list (get it "key") (get it "count")) (group (rows "orders") "status"))');
      await ed.setField('Title', 'Orders by status');
    });
    return { id };
  },

  async use({ ed }) {
    await ed.step(14, 'Live: open the Order tracker, save an order, come back: the numbers and charts follow the records', async () => {
      const dashboard = await ed.js(`location.pathname.split('/')[2]`);
      await ed.mode('Live');
      let t = await ed.js(`document.querySelector('.sheet').innerText`);
      await ed.check('the stats show the six sample orders', /€408.00/.test(t) && /Orders at a glance/.test(t), t);
      await ed.go('/d/' + ed.trackerId + '?view=live');
      await ed.waitFor(`window.edgy?.state.status === 'ready'`);
      await ed.typeInCell({ name: 'customer' }, 'Joan Clarke');
      await ed.typeInCell({ name: 'qty' }, '2');
      await ed.press('Save order', '.sheet');
      await sleep(800);
      await ed.go('/d/' + dashboard + '?view=live', 2000);
      t = await ed.js(`document.querySelector('.sheet').innerText`);
      await ed.check('Taken is now 456 and Orders 7', /456\.00/.test(t) && /\b7\b/.test(t), t);
    });
  },
};
