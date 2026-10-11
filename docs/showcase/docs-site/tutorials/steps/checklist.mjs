import { sleep } from '../lib.mjs';

// Tutorial: A checklist that reacts (site/content/tutorials/checklist.md)

const item = (cell, i, part = '.klist-text') => `(${cell})?.querySelectorAll('.klist-item')[${i}]?.querySelector('${part}')`;

export default {
  account: ['reader@example.test', 'Reader'],
  async build({ ed }) {
    let id;
    const list = ed.cellExpr({ kind: 'list' });
    await ed.step(1, 'New document, title Workshop checklist', async () => {
      id = await ed.newDocument();
      await ed.setTitle('Workshop checklist');
    });
    await ed.step(2, 'Click the empty cell, type the heading, Esc', async () => {
      await ed.clickCell({ kind: 'empty' });
      await ed.type('# Workshop checklist');
      await ed.key('Escape');
      await ed.expectSelected('text', { text: '# Workshop checklist' });
    });
    await ed.step(3, 'Alt+Down, / Checklist, Enter: three sample items and a bar', async () => {
      await ed.split('down');
      await ed.slash('Checklist');
      await ed.expectSelected('list', { type: 'check' });
      const t = await ed.shown({ kind: 'list' });
      await ed.check('the bar says 1 of 3 done', /1 of 3 done/.test(t), t);
    });
    await ed.step(4, 'Name steps, Title Before the workshop starts', async () => {
      await ed.setField('Name', 'steps');
      await ed.setField('Title', 'Before the workshop starts');
    });
    await ed.step(5, 'Click each item\'s text, select all, type, Tab', async () => {
      for (const [i, text] of ['Book the room', 'Print the handouts', 'Test the projector'].entries()) {
        await ed.clickEl(item(list, i));
        await ed.key('ctrl+a', { wait: 80 });
        await ed.type(text);
        await ed.key('Tab', { wait: 300 });
      }
      const c = await ed.js(`JSON.stringify(window.edgy.state.doc.root.children.find((c) => c.kind === 'list').value)`);
      await ed.check('three items with the new words', ['Book the room', 'Print the handouts', 'Test the projector'].every((x) => c.includes(x)), c);
    });
    await ed.step(6, 'Click the first box to untick it: nothing ticked', async () => {
      await ed.clickEl(item(list, 0, '.klist-check'));
      const done = await ed.js(`window.edgy.state.doc.root.children.find((c) => c.kind === 'list').value.filter((i) => i.done).length`);
      await ed.check('nothing is ticked', done === 0, String(done));
    });
    await ed.step(7, 'Add an item, type Send the reminder, Enter, Esc', async () => {
      await ed.press('Add an item', `[data-cell="${await ed.js(`(${list}).dataset.cell`)}"]`);
      await ed.type('Send the reminder');
      await ed.key('Enter', { wait: 300 });
      await ed.key('Escape', { wait: 300 });
      const v = await ed.js(`JSON.stringify(window.edgy.state.doc.root.children.find((c) => c.kind === 'list').value)`);
      await ed.check('four items, the last Send the reminder, no empty one', JSON.parse(v).length === 4 && JSON.parse(v)[3].text === 'Send the reminder', v);
    });
    await ed.step(8, 'Click the list title, Alt+Down, type the message, Esc', async () => {
      await ed.clickEl(`(${list})?.querySelector('.klist-title, .klist-head')`, { edge: true });
      await ed.expectSelected('list');
      await ed.split('down');
      await ed.type('All done: the room is ready.');
      await ed.key('Escape');
      await ed.expectSelected('text', { text: 'All done: the room is ready.' });
    });
    await ed.step(9, 'Name ready; Show only when: Never', async () => {
      await ed.setField('Name', 'ready');
      await ed.openSection('Show only when');
      await ed.chooseIn('Show only when', 'Never');
      await ed.expectSelected('text', { name: 'ready', hidden: true });
    });
    await ed.step(10, 'Click the message (it opens for typing), Esc, Alt+Down, type the sentence, Esc', async () => {
      await ed.clickCell({ name: 'ready' });
      await ed.key('Escape');
      await ed.expectSelected('text', { name: 'ready' });
      await ed.split('down');
      await ed.type('Checklists finished so far: {{(len (rows "checklists"))}}.');
      await ed.key('Escape');
      await ed.expectSelected('text', { text: 'Checklists finished so far: {{(len (rows "checklists"))}}.' });
    });
    const handler = '(if (every (get it "done") value) (do (show! ready) (insert! "checklists" {items (len value) day (today)})) (hide! ready))';
    await ed.step(11, 'Click the list title, Events, Add a handler: the code studio opens on the events of steps', async () => {
      await ed.clickEl(`(${list})?.querySelector('.klist-head')`, { edge: true });
      await ed.expectSelected('list', { name: 'steps' });
      await ed.openSection('Events');
      await ed.press('Add a handler', '.side.right');
      await ed.waitFor(`document.querySelector('.studio')`);
    });
    await ed.step(12, 'When: change; What should happen: Start from nothing', async () => {
      await ed.press('change', '.studio .studio-ev, .studio', { exact: true }).catch(async () => ed.press('change', '.studio'));
      await ed.press('Start from nothing', '.studio', { exact: false });
    });
    await ed.step(13, 'Code tab, click in the editor, type the handler on one line', async () => {
      await ed.press('Code', '.studio');
      await ed.clickEl(`document.querySelector('.studio .cf-input')`);
      await ed.type(handler, { wait: 400 });
      const v = await ed.js(`document.querySelector('.studio .cf-input').value`);
      await ed.check('the editor holds the handler as typed', v === handler, v);
    });
    await ed.step(14, 'Apply: the studio closes and Events lists the handler', async () => {
      await ed.clickEl(`document.querySelector('.studio .st-apply')`);
      await ed.waitFor(`!document.querySelector('.studio')`);
      const t = await ed.panelText();
      await ed.check('Events lists When it changes', /When it changes/.test(t), t);
    });
    return { id };
  },

  async use({ ed }) {
    const list = ed.cellExpr({ kind: 'list' });
    const text = () => ed.js(`document.querySelector('.sheet').innerText`);
    await ed.step(15, 'Live: tick four boxes (message and "finished so far: 1"), untick one (message goes), tick again (a second record)', async () => {
      await ed.mode('Live');
      await ed.check('the message is not shown yet', !/All done/.test(await text()));
      for (let i = 0; i < 4; i++) await ed.clickEl(item(list, i, '.klist-check'));
      await sleep(800);
      let t = await text();
      await ed.check('the message shows and one list has been finished', /All done: the room is ready./.test(t) && /Checklists finished so far: 1./.test(t), t);
      await ed.clickEl(item(list, 3, '.klist-check'));
      await sleep(600);
      t = await text();
      await ed.check('the message goes when a box is unticked', !/All done/.test(t), t);
      await ed.clickEl(item(list, 3, '.klist-check'));
      await sleep(800);
      t = await text();
      await ed.check('ticking again saves a second record', /All done/.test(t) && /Checklists finished so far: 2./.test(t), t);
    });
    await ed.step(16, 'Home, Data: the checklists collection holds one record per completion', async () => {
      await ed.waitSaved();
      await ed.go('/');
      await ed.press('Data', 'header');
      await sleep(800);
      const t = await ed.js('document.body.innerText');
      await ed.check('the Data page lists checklists with 2 records', /checklists/.test(t) && /2 records/.test(t), t);
    });
  },
};
