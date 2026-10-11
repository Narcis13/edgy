// Tutorial: A form in steps (site/content/tutorials/wizard.md)

import { sleep } from '../lib.mjs';

export default {
  account: ['reader@example.test', 'Reader'],
  async build({ ed }) {
    let id;
    await ed.step(1, 'New document, title Order wizard', async () => {
      id = await ed.newDocument();
      await ed.setTitle('Order wizard');
    });
    await ed.step(2, 'Click the empty cell, / Data, Name step, Value 1', async () => {
      await ed.clickCell({ kind: 'empty' });
      await ed.slash('Data');
      await ed.expectSelected('data');
      await ed.setField('Name', 'step');
      await ed.setField('Value', '1');
      await ed.expectSelected('data', { name: 'step', value: 1 });
    });
    await ed.step(3, 'Alt+Down, type Step {{step}} of 3, Esc', async () => {
      await ed.split('down');
      await ed.type('Step {{step}} of 3');
      await ed.key('Escape');
      await ed.expectSelected('text', { text: 'Step {{step}} of 3' });
      const t = await ed.shown({ text: 'Step {{step}}' });
      await ed.check('the text shows the counter', /Step 1 of 3/.test(t), t);
    });
    await ed.step(4, 'Alt+Down, / Text field, Name customer, Label, Value', async () => {
      await ed.split('down');
      await ed.slash('Text field');
      await ed.setField('Name', 'customer');
      await ed.setField('Label', 'Who is the order for?');
      await ed.setField('Value', 'Ada Lovelace');
    });
    const hide = async (cond) => {
      await ed.chooseIn('Show only when', 'Depends…');
      await ed.setField('Hide it when', cond);
    };
    await ed.step(5, 'Show only when: Depends…, Hide it when (!= step 1)', async () => {
      await hide('(!= step 1)');
      await ed.expectSelected('input', { name: 'customer', hidden: ['!=', '$step', 1] });
    });
    await ed.step(6, 'Alt+Down, / Number, Name qty, Label How many mugs?, Value 2', async () => {
      await ed.split('down');
      await ed.slash('Number');
      await ed.setField('Name', 'qty');
      await ed.setField('Label', 'How many mugs?');
      await ed.setField('Value', '2');
    });
    await ed.step(7, 'Depends…, Hide it when (!= step 2)', async () => {
      await hide('(!= step 2)');
      await ed.expectSelected('input', { name: 'qty', hidden: ['!=', '$step', 2] });
    });
    await ed.step(8, 'Alt+Down, type the summary text, Esc', async () => {
      await ed.split('down');
      await ed.type('**{{qty}} mugs** for {{customer}}. Check them, then start again for the next order.');
      await ed.key('Escape');
      await ed.expectSelected('text');
    });
    await ed.step(9, 'Depends…, (!= step 3)', async () => {
      await hide('(!= step 3)');
    });
    await ed.step(10, 'Alt+Down, / Button, Look Quiet, Label Back, What it does, Depends… (<= step 1)', async () => {
      await ed.split('down');
      await ed.slash('Button');
      await ed.expectSelected('button');
      await ed.choose('Look', 'Quiet');
      await ed.setField('Label', 'Back');
      await ed.setField('What it does', '(set! step (- step 1))');
      await hide('(<= step 1)');
      await ed.expectSelected('button', { variant: 'ghost', label: 'Back', hidden: ['<=', '$step', 1] });
    });
    await ed.step(11, 'Alt+Right, / Button, Label Next, What it does, Depends… (>= step 3)', async () => {
      await ed.split('right');
      await ed.slash('Button');
      await ed.setField('Label', 'Next');
      await ed.setField('What it does', '(set! step (+ step 1))');
      await hide('(>= step 3)');
      await ed.expectSelected('button', { label: 'Next' });
    });
    await ed.step(12, 'Alt+Right, / Button, Look Soft, Label Start again, What it does, Depends… (!= step 3)', async () => {
      await ed.split('right');
      await ed.slash('Button');
      await ed.choose('Look', 'Soft');
      await ed.setField('Label', 'Start again');
      await ed.setField('What it does', '(do (set! step 1) (set! customer "") (set! qty 1))');
      await hide('(!= step 3)');
      await ed.expectSelected('button', { variant: 'soft', label: 'Start again' });
    });
    return { id };
  },

  async use({ ed }) {
    const shown = () => ed.js(`document.querySelector('.sheet').innerText`);
    await ed.step(13, 'Live: only the first question and Next; Next, Next, Start again', async () => {
      await ed.mode('Live');
      let t = await shown();
      await ed.check('step 1 shows the first question and Next only', /Who is the order for/.test(t) && /Next/.test(t) && !/How many mugs/.test(t) && !/Back/.test(t), t);
      await ed.press('Next', '.sheet');
      t = await shown();
      await ed.check('step 2 shows the second question and Back', /How many mugs/.test(t) && /Back/.test(t) && !/Who is the order for/.test(t), t);
      await ed.press('Next', '.sheet');
      t = await shown();
      await ed.check('step 3 shows the summary and Start again, not Next', /2 mugs for Ada Lovelace/.test(t) && /Start again/.test(t) && !/Next/.test(t), t);
      await ed.press('Start again', '.sheet');
      t = await shown();
      await ed.check('Start again goes back to step 1 with the form cleared', /Step 1 of 3/.test(t) && /Who is the order for/.test(t), t);
      const v = await ed.inputValue({ name: 'customer' });
      await ed.check('the customer field is cleared', v === '', JSON.stringify(v));
    });
  },
};
