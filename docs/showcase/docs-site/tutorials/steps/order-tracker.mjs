// Tutorial: Saving and tracking orders (site/content/tutorials/order-tracker.md)

import { sleep } from '../lib.mjs';

export default {
  account: ['reader@example.test', 'Reader'],
  /** Using the form in Live (step 9) leaves values in its two inputs; the template keeps the starting ones. */
  normalize(doc) {
    const walk = (c) => {
      if (c.kind === 'input' && (c.name === 'customer' || c.name === 'qty')) delete c.value;
      if (c.kind === 'table' && c.expr !== undefined) delete c.value;
      (c.children ?? []).forEach(walk);
    };
    walk(doc.root);
  },
  ignored: [
    "title (the replay types the page's title, the template has its own name)",
    'size (what splitting a cell leaves: shares of the row or column; the template leaves every cell its equal share)',
    "value of the table (the three sample rows the table starts with stay in the cell after its rows come from (rows \"orders\"); the formula decides what it shows)",
    "value of the Customer and Quantity inputs (step 9 types in them in Live: Customer ends empty, Quantity at 3; the template keeps Quantity 1). The picture shows Quantity 3 for that reason.",
  ],
  async build({ ed }) {
    let id;
    await ed.step(1, 'New document, title Order tracker', async () => {
      id = await ed.newDocument();
      await ed.setTitle('Order tracker');
    });
    await ed.step(2, 'With no cell selected, Currency EUR', () => ed.setField('Currency', 'EUR'));
    await ed.step(3, 'Click the empty cell, type # Orders, Esc', async () => {
      await ed.clickCell({ kind: 'empty' });
      await ed.type('# Orders');
      await ed.key('Escape');
      await ed.expectSelected('text', { text: '# Orders' });
    });
    await ed.step(4, 'Alt+Down, / Text field, Name customer, Label Customer', async () => {
      await ed.split('down');
      await ed.slash('Text field');
      await ed.setField('Name', 'customer');
      await ed.setField('Label', 'Customer');
    });
    await ed.step(5, 'Alt+Right, / Number, Name qty, Label Quantity, Value 1', async () => {
      await ed.split('right');
      await ed.slash('Number');
      await ed.setField('Name', 'qty');
      await ed.setField('Label', 'Quantity');
      await ed.setField('Value', '1');
    });
    await ed.step(6, 'Alt+Right, / Formula, (* qty 24), Enter, Currency, Name total', async () => {
      await ed.split('right');
      await ed.slash('Formula');
      await ed.type('(* qty 24)');
      await ed.key('Enter', { wait: 400 });
      await ed.pick('Show the result as', 'Currency');
      await ed.setField('Name', 'total');
      await ed.expectSelected('formula', { name: 'total', format: 'currency' });
    });
    await ed.step(7, 'Esc, Alt+Down, / Button, Label Save order, What it does', async () => {
      await ed.key('Escape');
      await ed.expectSelected('row');
      await ed.split('down');
      await ed.slash('Button');
      await ed.setField('Label', 'Save order');
      await ed.setField('What it does', '(do (insert! "orders" {customer customer qty qty total total status "New"}) (set! customer ""))');
      await ed.expectSelected('button', { label: 'Save order' });
    });
    await ed.step(8, 'Alt+Down, / Table, the formula bar: (rows "orders"), Enter: the table empties', async () => {
      await ed.split('down');
      await ed.slash('Table');
      await ed.expectSelected('table');
      await ed.clickEl(`document.querySelector('.fbar .cf-input')`);
      await ed.key('ctrl+a', { wait: 80 });
      await ed.type('(rows "orders")');
      await ed.key('Enter', { wait: 400 });
      await ed.expectSelected('table', { expr: ['rows', 'orders'] });
      const shown = await ed.shown({ kind: 'table' });
      await ed.check('the table is empty: it says No rows yet', /No rows yet/.test(shown), shown);
    });
    await ed.step(9, 'Live: Ada Lovelace, Save order; Grace Hopper, Quantity 3, Save order: two rows, Customer empties', async () => {
      await ed.mode('Live');
      await ed.typeInCell({ name: 'customer' }, 'Ada Lovelace');
      await ed.press('Save order', '.sheet');
      await sleep(500);
      await ed.check('Customer empties after the save', (await ed.inputValue({ name: 'customer' })) === '');
      await ed.typeInCell({ name: 'customer' }, 'Grace Hopper');
      await ed.typeInCell({ name: 'qty' }, '3');
      await ed.press('Save order', '.sheet');
      await sleep(800);
      const t = await ed.js(`document.querySelector('.sheet').innerText`);
      await ed.check('two rows in the table', /Ada Lovelace/.test(t) && /Grace Hopper/.test(t), t);
      await ed.check('Customer empties again', (await ed.inputValue({ name: 'customer' })) === '');
    });
    await ed.step(10, 'Edit, click the table, Columns: untick Show at', async () => {
      await ed.mode('Edit');
      await ed.clickCell({ kind: 'table' }, { at: [40, 25] });
      await ed.expectSelected('table');
      await ed.clickEl(`document.querySelector('.side.right input[type=checkbox][aria-label="Show at"]')`);
      const c = await ed.selected();
      await ed.check('the at column is no longer shown', Array.isArray(c.columns) && !c.columns.includes('at'), JSON.stringify(c));
    });
    await ed.step(11, 'Row buttons: Change a field, Field status, New value Shipped, Add the button', async () => {
      await ed.press('Change a field', '.side.right');
      await ed.setField('Field to change', 'status');
      await ed.setField('New value', 'Shipped');
      await ed.press('Add the button', '.side.right');
      await sleep(400);
      const c = await ed.selected();
      await ed.check('the table has the Shipped button', JSON.stringify(c.actions).includes('Shipped'), JSON.stringify(c.actions));
    });
    return { id };
  },

  async use({ ed }) {
    await ed.step(12, 'Live: press Shipped on Ada\'s row: its status changes at once', async () => {
      await ed.mode('Live');
      const row = (name) => `[...document.querySelectorAll('.sheet tbody tr')].find((r) => r.innerText.includes(${JSON.stringify(name)}))`;
      const status = (name) => ed.js(`(${row(name)})?.innerText`);
      await ed.check('both orders are New', /New/.test(await status('Ada Lovelace')) && /New/.test(await status('Grace Hopper')));
      await ed.clickEl(`(${row('Ada Lovelace')}).querySelector('button')`);
      await sleep(600);
      const ada = await status('Ada Lovelace'), grace = await status('Grace Hopper');
      await ed.check("Ada's status changes to Shipped and Grace's stays New", /Shipped/.test(ada.replace(/Shippeds*$/, '')) || /Shipped[sS]*Shipped/.test(ada) || (/Shipped/.test(ada) && !/New/.test(ada)), ada + ' | ' + grace);
      await ed.check("Grace's row is still New", /New/.test(grace), grace);
    });
  },
};
