// Tutorial: A flowchart with live numbers (site/content/tutorials/flowchart.md)

import { sleep } from '../lib.mjs';

const GEOMETRY = ['x', 'y', 'w', 'h', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'width', 'height', 'points', 'bend'];

export default {
  account: ['reader@example.test', 'Reader'],
  /** Elements are compared by what they say and what they join, not by their ids or where they sit. */
  normalize(doc) {
    const walk = (c) => {
      if (c.kind === 'diagram' && Array.isArray(c.value)) {
        const text = new Map(c.value.filter((e) => e.id).map((e) => [e.id, e.text]));
        c.value = c.value.map((e) => {
          const o = { ...e };
          if (o.from !== undefined) o.from = text.get(o.from) ?? o.from;
          if (o.to !== undefined) o.to = text.get(o.to) ?? o.to;
          for (const k of GEOMETRY) delete o[k];
          return o;
        });
        // Where an arrow starts and ends on a shape, and the order the elements were put down in, are not part of the tutorial.
      }
      (c.children ?? []).forEach(walk);
    };
    walk(doc.root);
  },
  ignored: [
    "title (the replay types the page's title, the template has its own name)",
    'size (what splitting a cell leaves: shares of the row or column)',
    "element ids (arrows are compared by the text of the shapes they join) and the elements' places and sizes (the template writes none down, the replay's come from where it clicked and Tidy layout)",
  ],
  async build({ ed }) {
    let id;
    const svg = `document.querySelector('.sheet .kdiagram-svg')`;
    /** The diagram's drawing area, measured from its top left corner. */
    const at = async (x, y) => {
      const r = await ed.js(`(() => { const r = ${svg}.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
      return [r.x + x, r.y + y];
    };
    const centerOfText = async (words) => {
      const r = await ed.js(`(() => { const t = [...${svg}.querySelectorAll('text')].find((t) => t.textContent.includes(${JSON.stringify(words)})); if (!t) return null; const r = t.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      if (!r) throw new Error(`no shape says ${words}`);
      return [r.x, r.y];
    };
    const tool = (name) => ed.press(name, '.sheet .kdiagram-tools');
    const place = async (name, x, y, label) => {
      await tool(name);
      const [px, py] = await at(x, y);
      await ed.clickAt(px, py, 300);
      await ed.key('Enter', { wait: 250 });
      await ed.type(label, { wait: 150 });
      await ed.key('Enter', { wait: 300 });
    };
    const arrow = async (from, to, label) => {
      await tool('Arrow');
      const [x1, y1] = await centerOfText(from);
      const [x2, y2] = await centerOfText(to);
      await ed.drag(x1, y1, x2, y2);
      if (label) {
        await ed.key('Enter', { wait: 250 });
        await ed.type(label, { wait: 150 });
        await ed.key('Enter', { wait: 300 });
      }
    };

    await ed.step(1, 'New document, title Order flowchart', async () => {
      id = await ed.newDocument();
      await ed.setTitle('Order flowchart');
    });
    await ed.step(2, 'Click the empty cell, / Number, Name waiting, Label Orders waiting, Value 3', async () => {
      await ed.clickCell({ kind: 'empty' });
      await ed.slash('Number');
      await ed.setField('Name', 'waiting');
      await ed.setField('Label', 'Orders waiting');
      await ed.setField('Value', '3');
    });
    await ed.step(3, 'Alt+Down, / Diagram, Name flow: a sample of two boxes joined by an arrow', async () => {
      await ed.split('down');
      await ed.slash('Diagram');
      await ed.expectSelected('diagram');
      await ed.setField('Name', 'flow');
      const c = await ed.selected();
      await ed.check('the sample is two boxes and an arrow', Array.isArray(c.value) && c.value.length === 3, JSON.stringify(c.value));
    });
    await ed.step(4, 'Cell details: Clear; the cell says Pick a shape above, then drag to draw it', async () => {
      await ed.press('Clear', '.side.right');
      await sleep(400);
      const t = await ed.js(`document.querySelector('.sheet .kdiagram')?.innerText ?? ''`);
      await ed.check('the hint is shown', /Pick a shape above, then drag to draw it/.test(t), t);
      const tools = await ed.js(`[...document.querySelectorAll('.sheet .kdiagram-tools button')].map((b) => b.getAttribute('aria-label')).join(', ')`);
      await ed.check('the toolbar lists the tools the page names', ['Select and move', 'Rectangle', 'Ellipse', 'Diamond', 'Arrow', 'Line', 'Text'].every((x) => tools.includes(x)) && /Line and text colour/.test(tools) && /Fill colour/.test(tools), tools);
    });
    await ed.step(5, 'Ellipse, click at 110,50; Enter, Order placed, Enter', () => place('Ellipse', 110, 50, 'Order placed'));
    await ed.step(6, 'Diamond, click at 360,50; Enter, Paid?, Enter', () => place('Diamond', 360, 50, 'Paid?'));
    await ed.step(7, 'Rectangle, click at 610,50; Enter, the label with {{waiting}}, Enter', async () => {
      await place('Rectangle', 610, 50, 'Pick and pack: {{waiting}} waiting');
      const t = (await ed.js(`${svg}.textContent`)).replace(/\s+/g, '');
      await ed.check('the label shows Pick and pack: 3 waiting', /Pickandpack:3waiting/.test(t), t);
    });
    await ed.step(8, 'Rectangle, click at 360,170; Enter, Send a reminder, Enter', () => place('Rectangle', 360, 170, 'Send a reminder'));
    await ed.step(9, 'Rectangle, click at 610,170; Enter, the Ship label, Enter', async () => {
      await place('Rectangle', 610, 170, 'Ship {{(* waiting 24) | currency}} of goods');
      const t = (await ed.js(`${svg}.textContent`)).replace(/\s+/g, '');
      await ed.check('the label shows the amount', /Ship.*72.*ofgoods/.test(t), t);
    });
    await ed.step(10, 'Arrow: drag from Order placed to Paid?', () => arrow('Order placed', 'Paid?'));
    await ed.step(11, 'Arrow: drag from Paid? to Pick and pack; label yes', () => arrow('Paid?', 'Pick and pack', 'yes'));
    await ed.step(12, 'Arrow: drag from Paid? to Send a reminder; label no', () => arrow('Paid?', 'Send a reminder', 'no'));
    await ed.step(13, 'Arrow: drag from Pick and pack to Ship', async () => {
      await arrow('Pick and pack', 'Ship');
      const c = await ed.selected();
      const arrows = c.value.filter((e) => e.type === 'arrow');
      await ed.check('four arrows and five shapes', arrows.length === 4 && c.value.length === 9, JSON.stringify(c.value));
    });
    await ed.step(14, 'Cell details: Tidy layout', async () => {
      await ed.press('Tidy layout', '.side.right');
      await sleep(600);
    });
    return { id };
  },

  async use({ ed }) {
    await ed.step(15, 'Live: change Orders waiting to 5; the two labels follow', async () => {
      await ed.mode('Live');
      await ed.typeInCell({ name: 'waiting' }, '5');
      await ed.key('Tab');
      await sleep(500);
      const t = (await ed.js(`document.querySelector('.sheet .kdiagram-svg').textContent`)).replace(/\s+/g, '');
      await ed.check('Pick and pack: 5 waiting and Ship 120', /Pickandpack:5waiting/.test(t) && /Ship.*120.*ofgoods/.test(t), t);
    });
  },
};
