// The documents the tutorials in the docs end with (site/content/tutorials/),
// written in the same notation as the templates. They open by id
// (POST /api/docs {"template": "tutorial-quote"}) from each tutorial's page;
// the home page's list of templates stays as it is.
//
// Each one is what the tutorial's steps produce, cell for cell: same kinds,
// names, formulas and handlers. Where the steps leave a choice of wording
// (a label, an item), the template holds the wording the tutorial suggests.

import type { Json } from './types';
import type { Template } from './templates';

// ── the quote: formulas, formats, a text template ──

/** One line item: the amount reads its two neighbours by place, so a copy of the row still works. */
const line = (item: string, qty: number, price: number, name?: string): Json => [
  'row',
  ['input', { type: 'text', label: 'Item', value: item }],
  ['input', { type: 'number', label: 'Qty', value: qty }],
  ['input', { type: 'number', label: 'Price', value: price }],
  ['formula', { ...(name ? { name } : {}), format: 'currency' }, ['*', ['sib', 1], ['sib', 2]]],
];

const quote: Template = {
  id: 'tutorial-quote',
  title: 'Simple quote',
  about: 'The Quote tutorial’s result: two line items that multiply, a subtotal, VAT from a rate you type, a total, and a sentence that reads them.',
  meta: { currency: 'EUR' },
  root: ['col',
    ['text', '# Quote for {{client}}'],
    ['input', { name: 'client', type: 'text', label: 'Client', value: 'Ada Lovelace' }],
    // The second line is a copy of the first, so its amount is named amount2.
    line('Brand identity', 1, 2400, 'amount'),
    line('Website design, per page', 6, 380, 'amount2'),
    ['row',
      ['text', 'Subtotal'],
      ['formula', { name: 'subtotal', format: 'currency' }, ['+', '$amount', '$amount2']]],
    ['row',
      ['input', { name: 'rate', type: 'number', label: 'VAT rate (%)', value: 19 }],
      ['formula', { name: 'vat', format: 'currency' }, ['*', '$subtotal', ['/', '$rate', 100]]]],
    ['row',
      ['text', '**Total**'],
      ['formula', { name: 'total', format: 'currency' }, ['+', '$subtotal', '$vat']]],
    ['text', '{{client}} owes **{{total | currency}}**, VAT included.'],
  ],
};

// ── the checklist: a change handler, every, show! ──

const step = (text: string): Json => ({ text, done: false });

const checklist: Template = {
  id: 'tutorial-checklist',
  title: 'Workshop checklist',
  about: 'A checklist whose change handler shows a message and saves a record once every box is ticked.',
  root: ['col',
    ['text', '# Workshop checklist'],
    ['list', {
      name: 'steps', type: 'check', label: 'Before the workshop starts',
      // Every item ticked: show the note and keep a record; otherwise hide the note again.
      on: {
        change: ['if', ['every', ['get', '$it', 'done'], '$value'],
          ['do', ['show!', 'ready'], ['insert!', 'checklists', { items: ['len', '$value'], day: ['today'] }]],
          ['hide!', 'ready']],
      },
    }, step('Book the room'), step('Print the handouts'), step('Test the projector'), step('Send the reminder')],
    ['text', { name: 'ready', hidden: true }, 'All done: the room is ready.'],
    ['text', 'Checklists finished so far: {{(len (rows "checklists"))}}.'],
  ],
};

// ── the wizard: a step counter and cells that hide ──

const wizard: Template = {
  id: 'tutorial-wizard',
  title: 'Order wizard',
  about: 'Three steps on one hidden counter: each step shows only while the counter says so, and Back and Next change it.',
  root: ['col',
    ['data', { name: 'step' }, 1],
    ['text', 'Step {{step}} of 3'],
    ['input', { name: 'customer', type: 'text', label: 'Who is the order for?', value: 'Ada Lovelace', hidden: ['!=', '$step', 1] }],
    ['input', { name: 'qty', type: 'number', label: 'How many mugs?', value: 2, hidden: ['!=', '$step', 2] }],
    ['text', { hidden: ['!=', '$step', 3] }, '**{{qty}} mugs** for {{customer}}. Check them, then start again for the next order.'],
    ['row',
      ['button', { variant: 'ghost', hidden: ['<=', '$step', 1], do: ['set!', 'step', ['-', '$step', 1]] }, 'Back'],
      ['button', { hidden: ['>=', '$step', 3], do: ['set!', 'step', ['+', '$step', 1]] }, 'Next'],
      ['button', {
        variant: 'soft', hidden: ['!=', '$step', 3],
        do: ['do', ['set!', 'step', 1], ['set!', 'customer', ''], ['set!', 'qty', 1]],
      }, 'Start again']],
  ],
};

// ── the order tracker: records saved and changed ──

const order = (customer: string, qty: number, total: number, status: string): Record<string, Json> => ({ customer, qty, total, status });

/** The orders the tracker and the dashboard read; each is saved only into an `orders` collection that is still empty. */
const ORDERS = [
  order('Ada Lovelace', 2, 48, 'New'),
  order('Grace Hopper', 5, 120, 'Shipped'),
  order('Katherine Johnson', 1, 24, 'Shipped'),
  order('Alan Turing', 3, 72, 'New'),
  order('Hedy Lamarr', 4, 96, 'Shipped'),
  order('Margaret Hamilton', 2, 48, 'New'),
];

const orderTracker: Template = {
  id: 'tutorial-order-tracker',
  title: 'Order tracker',
  about: 'A form that saves each order to a collection, a table that reads it back, and a button on every row that marks the order shipped.',
  meta: { currency: 'EUR' },
  data: { orders: ORDERS },
  root: ['col',
    ['text', '# Orders'],
    ['row',
      ['input', { name: 'customer', type: 'text', label: 'Customer' }],
      ['input', { name: 'qty', type: 'number', label: 'Quantity', value: 1 }],
      ['formula', { name: 'total', format: 'currency' }, ['*', '$qty', 24]]],
    ['button', {
      do: ['do',
        ['insert!', 'orders', { customer: '$customer', qty: '$qty', total: '$total', status: 'New' }],
        ['set!', 'customer', '']],
    }, 'Save order'],
    ['table', {
      columns: ['customer', 'qty', 'total', 'status'],
      actions: [{ label: 'Shipped', icon: 'check', variant: 'soft', do: ['update!', 'orders', ['get', '$row', 'id'], { status: 'Shipped' }] }],
    }, ['rows', 'orders']],
  ],
};

// ── the dashboard: stats and charts from records ──

const dashboard: Template = {
  id: 'tutorial-dashboard',
  title: 'Orders dashboard',
  about: 'Three stats and two charts read from the saved orders: what was taken, how many, what still waits, who ordered what, and how they stand.',
  meta: { currency: 'EUR' },
  data: { orders: ORDERS },
  root: ['col',
    ['text', '# Orders at a glance'],
    ['row',
      ['stat', {
        label: 'Taken', format: 'currency', compare: 360,
        trend: ['column', ['rows', 'orders'], 'total'],
      }, ['sum', ['column', ['rows', 'orders'], 'total']]],
      ['stat', { label: 'Orders' }, ['len', ['rows', 'orders']]],
      ['stat', { label: 'Waiting to ship', compare: 4, better: 'down' },
        ['count-if', ['=', ['get', '$it', 'status'], 'New'], ['rows', 'orders']]]],
    ['row',
      ['chart', { type: 'bar', label: 'Total by customer', format: 'currency' },
        ['map', { label: ['get', '$it', 'customer'], value: ['get', '$it', 'total'] }, ['rows', 'orders']]],
      ['chart', { type: 'donut', label: 'Orders by status' },
        ['map', ['list', ['get', '$it', 'key'], ['get', '$it', 'count']], ['group', ['rows', 'orders'], 'status']]]],
  ],
};

// ── the flowchart: a diagram whose shapes show live values ──

const flowchart: Template = {
  id: 'tutorial-flowchart',
  title: 'Order flowchart',
  about: 'A diagram of how an order moves, drawn in Edit; two of its shapes show a number you can change above it.',
  root: ['col',
    ['input', { name: 'waiting', type: 'number', label: 'Orders waiting', value: 3 }],
    ['diagram', { name: 'flow' },
      { id: 'placed', type: 'ellipse', text: 'Order placed' },
      { id: 'paid', type: 'diamond', text: 'Paid?' },
      { id: 'pack', type: 'rect', text: 'Pick and pack: {{waiting}} waiting' },
      { id: 'remind', type: 'rect', text: 'Send a reminder' },
      { id: 'ship', type: 'rect', text: 'Ship {{(* waiting 24) | currency}} of goods' },
      { type: 'arrow', from: 'placed', to: 'paid' },
      { type: 'arrow', from: 'paid', to: 'pack', text: 'yes' },
      { type: 'arrow', from: 'paid', to: 'remind', text: 'no' },
      { type: 'arrow', from: 'pack', to: 'ship' }],
  ],
};

// ── the deck: the middle slide of three ──

const deck: Template = {
  id: 'tutorial-deck',
  title: 'Q4 review: numbers',
  about: 'The middle slide of the Decks tutorial’s deck: a heading and two stats that fill the screen when the deck is played.',
  meta: { currency: 'EUR' },
  root: ['col',
    ['text', '# Numbers'],
    ['row',
      ['stat', { label: 'Billed', format: 'currency', compare: 38000 }, 41200],
      ['stat', { label: 'On time', format: 'percent', compare: 0.8 }, 0.85]],
  ],
};

// ── sharing: a document worth giving to someone ──

const sharing: Template = {
  id: 'tutorial-sharing',
  title: 'Planning notes',
  about: 'A small document with a checklist and a notes field, the one the Sharing tutorial gives to a colleague as editor and as viewer.',
  root: ['col',
    ['text', '# Planning notes'],
    ['list', { type: 'check', label: 'Actions' }, { text: 'Plan the week', done: true }, step('Book the venue'), step('Send the invites')],
    ['input', { name: 'notes', type: 'textarea', label: 'Notes', placeholder: 'Write what was decided' }],
    ['text', 'Notes so far: {{notes}}'],
  ],
};

// ── printing and export ──

const printExport: Template = {
  id: 'tutorial-print-export',
  title: 'Corner Cafe: quarterly report',
  about: 'A two-page report set up for paper: wide margins, a footer with the title and page numbers, and a page break between its pages.',
  meta: { margin: 25, footer: 'title' },
  root: ['col',
    ['text', '# Corner Cafe: quarterly report'],
    ['text', 'What sold this quarter, and what we plan next.'],
    ['table', {
      label: 'Sold this quarter',
      value: [{ item: 'Tea', price: 3, qty: 2 }, { item: 'Cake', price: 5, qty: 1 }, { item: 'Juice', price: 4, qty: 3 }],
    }],
    ['break'],
    ['text', '## Next quarter'],
    ['list', { type: 'bullet' }, 'Add a lunch menu', 'Open on Sundays'],
  ],
};

// ── working with an agent ──

const agent: Template = {
  id: 'tutorial-agent',
  title: 'Team lunch',
  about: 'The kind of document an agent builds from one sentence in the Agent tutorial: two inputs, a total, and a button that saves the order.',
  meta: { currency: 'EUR' },
  root: ['col',
    ['text', '# Team lunch'],
    ['row',
      ['input', { name: 'people', type: 'number', label: 'People', value: 8 }],
      ['input', { name: 'price', type: 'number', label: 'Price each', value: 12.5, step: 0.5 }],
      ['formula', { name: 'total', format: 'currency' }, ['*', '$people', '$price']]],
    ['button', { do: ['insert!', 'lunches', { people: '$people', total: '$total' }] }, 'Order lunch'],
    ['text', 'Lunches ordered so far: {{(len (rows "lunches"))}}.'],
  ],
};

export const TUTORIALS: Template[] = [quote, checklist, wizard, orderTracker, dashboard, flowchart, deck, sharing, printExport, agent];
