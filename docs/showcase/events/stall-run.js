// The Market stall, used the way a stallholder would: look at a row, double-click to add,
// press the buttons that call the custom action, place the order, tick the set-up list.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !window.edgy?.state?.doc; i++) await wait(100);
  await wait(800);
  const idOf = (name) => { let f; (function w(c) { if (c.name === name) f = c.id; (c.children || []).forEach(w); })(window.edgy.state.doc.root); return f; };
  const val = (name) => window.edgy.state.computed.cells[idOf(name)]?.value;
  const el = (name) => document.querySelector(`[data-cell="${idOf(name)}"]`);
  const click = (target, detail = 1) => target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail }));
  const button = (name) => el(name).querySelector('button');
  const out = {};
  const rows = el('produce').querySelectorAll('[data-ev-index]');
  click(rows[2].querySelector('td, div') ?? rows[2]);
  await wait(400);
  out.picked = val('picked');
  click(rows[2].querySelector('td, div') ?? rows[2], 1); await wait(60); click(rows[2].querySelector('td, div') ?? rows[2], 2);
  await wait(400);
  button('add-apples').click(); await wait(200);
  button('add-honey').click(); await wait(200);
  out.basket = val('cart').map((l) => `${l.qty} × ${l.item} at ${l.price}`);
  out.total = val('total');
  button('place').click(); await wait(800);
  out.afterOrder = { ordersToday: val('orders-today'), lastOrder: val('last-order'), thanksShown: !window.edgy.cell(idOf('thanks')).hidden, basket: val('cart').length };
  for (const box of el('setup').querySelectorAll('.klist-item input[type=checkbox]')) { box.click(); await wait(250); }
  await wait(400);
  out.setup = { done: val('setup').filter((i) => i.done).length, readyShown: !window.edgy.cell(idOf('ready')).hidden };
  click(el('rate-now')); await wait(1500);
  out.rateAfterTap = val('rate')?.rate;
  out.visits = val('visits');
  el('thanks').scrollIntoView({ block: 'center' });
  return JSON.stringify(out);
})()
