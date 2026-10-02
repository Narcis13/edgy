(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const click = (el, detail = 1) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail }));
  const cell = (name) => window.edgy.state.doc && [...document.querySelectorAll('[data-cell]')].find((e) => window.edgy.cell(e.dataset.cell)?.name === name);
  const idOf = (name) => { let f; (function w(c) { if (c.name === name) f = c.id; (c.children || []).forEach(w); })(window.edgy.state.doc.root); return f; };
  const val = (name) => window.edgy.state.computed.cells[idOf(name)]?.value;
  const out = {};
  for (let i = 0; i < 40 && !window.edgy?.state?.doc; i++) await wait(100);
  await wait(500);
  // checkbox: tick, then untick
  $('[data-cell] input[type=checkbox]').click();
  await wait(150);
  out.afterTick = [val('status'), val('flips')];
  await wait(1600); // a separate gesture, not coalesced with the tick
  $('[data-cell] input[type=checkbox]').click();
  await wait(150);
  out.afterUntick = [val('status'), val('flips')];
  await wait(1600);
  // undo once: the untick and what its handler changed go back together
  window.edgy.undo();
  await wait(150);
  out.afterUndo = [val('agree'), val('status'), val('flips')];
  // text: a single click waits 250 ms; a double-click runs only dblclick
  click(cell('clicker'));
  await wait(400);
  click(cell('clicker'), 1); await wait(60); click(cell('clicker'), 2);
  await wait(400);
  out.clicker = [val('clicks'), val('doubles')];
  // image
  click(cell('pic').querySelector('img') ?? cell('pic'));
  await wait(100);
  out.image = val('lastClick');
  // table row: click Bo, double-click Ann
  const rows = cell('people').querySelectorAll('tr[data-ev-index]');
  click(rows[1].querySelector('td'));
  await wait(400);
  out.rowClick = val('lastClick');
  click(rows[0].querySelector('td'), 1); await wait(50); click(rows[0].querySelector('td'), 2);
  await wait(400);
  out.rowDouble = [val('lastDouble'), val('lastClick')];
  // custom event, custom actions
  cell('shout').querySelector('button').click();
  await wait(150);
  out.emitted = [val('a'), val('b')];
  cell('greetAnn').querySelector('button').click(); await wait(100);
  out.greet1 = val('hello');
  cell('greetBo').querySelector('button').click(); await wait(100);
  out.greet2 = val('hello');
  // loop guard: the tab keeps working afterwards
  cell('loop').querySelector('button').click(); await wait(150);
  out.loop = [val('spin'), val('spun'), window.edgy.state.trace.filter((t) => t.error).map((t) => t.error).at(-1)];
  click(cell('clicker')); await wait(400);
  out.stillResponsive = val('clicks');
  // stop the timer
  const before = val('ticks');
  cell('stopper').querySelector('button').click();
  await wait(4500);
  out.ticksAfterStop = [before, val('ticks'), val('poll')];
  out.traceNames = window.edgy.state.trace.map((t) => `${t.via === 'do' ? 'do' : t.name}@${window.edgy.cell(t.cell)?.name ?? 'doc'}${t.error ? '!' : ''}`).join(' ');
  return JSON.stringify(out);
})()
