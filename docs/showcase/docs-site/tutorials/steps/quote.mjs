// Tutorial: A quote that adds itself up (site/content/tutorials/quote.md)

export default {
  account: ['reader@example.test', 'Reader'],
  async build({ ed }) {
    let id;
    await ed.step(1, 'New document: opens in Edit with one empty cell and the Document panel', async () => {
      id = await ed.newDocument();
      await ed.check('the Document panel shows', /Document/.test(await ed.panelText()));
    });
    await ed.step(2, 'Click the title, select all, type Quote, Enter', () => ed.setTitle('Quote'));
    await ed.step(3, 'With no cell selected, Currency = EUR', () => ed.setField('Currency', 'EUR'));

    await ed.step(4, 'Click the empty cell, press /, type Text field, Enter', async () => {
      await ed.clickCell({ kind: 'empty' });
      await ed.slash('Text field');
      await ed.expectSelected('input', { type: 'text' });
    });
    await ed.step(5, 'Name client, Label Client, Value Ada Lovelace', async () => {
      await ed.setField('Name', 'client');
      await ed.setField('Label', 'Client');
      await ed.setField('Value', 'Ada Lovelace');
    });
    await ed.step(6, 'Alt+Up, a new empty cell above; type the heading, Esc', async () => {
      await ed.clickCell({ name: 'client' }, { edge: true });
      await ed.split('up');
      await ed.expectSelected('empty');
      await ed.type('# Quote for {{client}}');
      await ed.key('Escape');
      await ed.expectSelected('text', { text: '# Quote for {{client}}' });
    });

    await ed.step(7, 'Tab to the Client field, Alt+Down, / Text field, Label Item, Value Brand identity', async () => {
      await ed.key('Tab');
      await ed.expectSelected('input', { name: 'client' });
      await ed.split('down');
      await ed.slash('Text field');
      await ed.setField('Label', 'Item');
      await ed.setField('Value', 'Brand identity');
    });
    await ed.step(8, 'Alt+Right, / Number, Label Qty, Value 1', async () => {
      await ed.clickCell({ label: 'Item' }, { edge: true });
      await ed.split('right');
      await ed.slash('Number');
      await ed.setField('Label', 'Qty');
      await ed.setField('Value', '1');
    });
    await ed.step(9, 'Alt+Right, / Number, Label Price, Value 2400', async () => {
      await ed.clickCell({ label: 'Qty' }, { edge: true });
      await ed.split('right');
      await ed.slash('Number');
      await ed.setField('Label', 'Price');
      await ed.setField('Value', '2400');
    });
    await ed.step(10, 'Alt+Right, / Formula, type (* (sib 1) (sib 2)), Enter', async () => {
      await ed.clickCell({ label: 'Price' }, { edge: true });
      await ed.split('right');
      await ed.slash('Formula');
      await ed.expectSelected('formula');
      await ed.type('(* (sib 1) (sib 2))');
      await ed.key('Enter', { wait: 400 });
    });
    await ed.step(11, 'Show the result as Currency, Name amount', async () => {
      await ed.pick('Show the result as', 'Currency');
      await ed.setField('Name', 'amount');
      await ed.expectSelected('formula', { name: 'amount', format: 'currency' });
    });
    await ed.step(12, 'Esc selects the row, Ctrl+D duplicates it; the copy\'s amount is amount2', async () => {
      await ed.key('Escape');
      await ed.expectSelected('row');
      await ed.key('ctrl+d', { wait: 400 });
      const d = await ed.doc();
      const rows = d.root.children.filter((c) => c.kind === 'row');
      await ed.check('there are two rows', rows.length === 2);
      await ed.check('the copy\'s amount is called amount2', rows[1].children[3].name === 'amount2', JSON.stringify(rows[1].children[3]));
    });
    await ed.step(13, 'In the copy: Item, Qty and Price typed in; the amount reads €2,280.00', async () => {
      await ed.typeInCell({ label: 'Item', nth: 1 }, 'Website design, per page');
      await ed.typeInCell({ label: 'Qty', nth: 1 }, '6');
      await ed.typeInCell({ label: 'Price', nth: 1 }, '380');
      await ed.clickCell({ name: 'amount2' });
      const shown = await ed.shown({ name: 'amount2' });
      await ed.check('the copy\'s amount reads €2,280.00', /2,280\.00/.test(shown), shown);
    });

    await ed.step(14, 'Click amount2, Esc, Alt+Down, type Subtotal, Esc', async () => {
      await ed.clickCell({ name: 'amount2' });
      await ed.key('Escape');
      await ed.expectSelected('row');
      await ed.split('down');
      await ed.expectSelected('empty');
      await ed.type('Subtotal');
      await ed.key('Escape');
      await ed.expectSelected('text', { text: 'Subtotal' });
    });
    await ed.step(15, 'Alt+Right, / Formula, (+ amount amount2), Enter, Currency, Name subtotal', async () => {
      await ed.split('right');
      await ed.slash('Formula');
      await ed.type('(+ amount amount2)');
      await ed.key('Enter', { wait: 400 });
      await ed.pick('Show the result as', 'Currency');
      await ed.setField('Name', 'subtotal');
      await ed.expectSelected('formula', { name: 'subtotal', format: 'currency' });
    });
    await ed.step(16, 'Esc, Alt+Down, / Number, Label VAT rate (%), Value 19, Name rate', async () => {
      await ed.key('Escape');
      await ed.expectSelected('row');
      await ed.split('down');
      await ed.slash('Number');
      await ed.setField('Label', 'VAT rate (%)');
      await ed.setField('Value', '19');
      await ed.setField('Name', 'rate');
    });
    await ed.step(17, 'Alt+Right, / Formula, (* subtotal (/ rate 100)), Enter, Currency, Name vat', async () => {
      await ed.clickCell({ name: 'rate' }, { edge: true });
      await ed.split('right');
      await ed.slash('Formula');
      await ed.type('(* subtotal (/ rate 100))');
      await ed.key('Enter', { wait: 400 });
      await ed.pick('Show the result as', 'Currency');
      await ed.setField('Name', 'vat');
      await ed.expectSelected('formula', { name: 'vat', format: 'currency' });
    });
    await ed.step(18, 'Esc, Alt+Down, **Total**, Esc, Alt+Right, / Formula, (+ subtotal vat), Currency, Name total', async () => {
      await ed.key('Escape');
      await ed.expectSelected('row');
      await ed.split('down');
      await ed.type('**Total**');
      await ed.key('Escape');
      await ed.split('right');
      await ed.slash('Formula');
      await ed.type('(+ subtotal vat)');
      await ed.key('Enter', { wait: 400 });
      await ed.pick('Show the result as', 'Currency');
      await ed.setField('Name', 'total');
      await ed.expectSelected('formula', { name: 'total', format: 'currency' });
    });
    await ed.step(19, 'Esc, Alt+Down, type the sentence, Esc', async () => {
      await ed.key('Escape');
      await ed.expectSelected('row');
      await ed.split('down');
      await ed.type('{{client}} owes **{{total | currency}}**, VAT included.');
      await ed.key('Escape');
      await ed.expectSelected('text');
    });
    return { id };
  },

  /** Step 20, in Live: it changes the document's values, so it runs after the tree has been compared. */
  async use({ ed }) {
    await ed.step(20, 'Live: Qty on the first line 2 changes amount, subtotal, VAT, total and the sentence; Client Grace Hopper', async () => {
      await ed.mode('Live');
      await ed.typeInCell({ label: 'Qty', nth: 0 }, '2');
      await ed.key('Tab');
      const text = await ed.js(`document.querySelector('.sheet').innerText`);
      await ed.check('the amount, subtotal, VAT, total and sentence follow the quantity', ['4,800.00', '7,080.00', '1,345.20', '8,425.20'].every((x) => text.includes(x)) && text.includes('owes €8,425.20'), text);
      await ed.typeInCell({ name: 'client' }, 'Grace Hopper');
      await ed.key('Tab');
      const after = await ed.js(`document.querySelector('.sheet').innerText`);
      await ed.check('the heading and the sentence follow the client', /Quote for Grace Hopper/.test(after) && /Grace Hopper owes/.test(after), after);
    });
  },
};
