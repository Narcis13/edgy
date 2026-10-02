// Draws three shapes, joins them with two arrows, labels one, moves, resizes and deletes,
// then undoes and redoes every step. POINTER is 'mouse' or 'touch'. Used by shoot.sh.
(async () => { const log = []; try {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const cellEl = document.querySelector('.sheet .kind-diagram');
  cellEl.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: POINTER })); await sleep(500);
  const svg = () => document.querySelector('.kind-diagram svg.kdiagram-svg');
  let id = 10;
  const ev = (type, x, y) => svg().dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType: POINTER, isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y }));
  const drag = async (x1, y1, x2, y2) => { id++; ev('pointerdown', x1, y1); for (let i = 1; i <= 5; i++) { ev('pointermove', x1 + (x2 - x1) * i / 5, y1 + (y2 - y1) * i / 5); await sleep(30); } ev('pointerup', x2, y2); await sleep(400); };
  const tap = async (x, y) => { id++; ev('pointerdown', x, y); ev('pointerup', x, y); await sleep(60); };
  const tool = async (name) => { const b = [...document.querySelectorAll('.kdiagram-tools button')].find((b) => b.getAttribute('aria-label') === name); b.click(); await sleep(200); };
  const doc = async () => (await (await fetch(location.pathname.replace('/d/', '/api/docs/'))).json());
  const value = async () => { const d = await doc(); const find = (c) => c.name === 'd' ? c : (c.children || []).map(find).find(Boolean); return find(d.root).value || []; };
  const scr = (ux, uy) => { const m = svg().getScreenCTM(); return [m.a * ux + m.e, m.d * uy + m.f]; };
  log.push(['tools', [...document.querySelectorAll('.kdiagram-tools button')].map((b) => b.getAttribute('aria-label')).join(',')]);
  const r = svg().getBoundingClientRect();
  await tool('Rectangle'); await drag(r.left + 20, r.top + 20, r.left + 130, r.top + 75);
  await tool('Ellipse'); await drag(r.left + 190, r.top + 20, r.left + 310, r.top + 75);
  await tool('Diamond'); await drag(r.left + 90, r.top + 160, r.left + 230, r.top + 240);
  await sleep(800); let v = await value();
  log.push(['shapes', v.map((e) => e.type + '@' + e.x + ',' + e.y + ' ' + e.w + 'x' + e.h).join(' | ')]);
  const c = (e) => scr(e.x + e.w / 2, e.y + e.h / 2);
  await tool('Arrow'); await drag(...c(v[0]), ...c(v[1]));
  await tool('Arrow'); await drag(...c(v[1]), ...c(v[2]));
  await sleep(800); v = await value();
  log.push(['arrows', v.filter((e) => e.type === 'arrow').map((e) => e.from + '->' + e.to).join(' ')]);
  // label the first shape by double tap
  await tool('Select and move');
  const s0 = c(v[0]); await tap(...s0); await tap(...s0); await sleep(300);
  const ta = document.querySelector('.kdiagram-writer');
  log.push(['writer', !!ta]);
  if (ta) { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, 'Start'); ta.dispatchEvent(new Event('input', { bubbles: true })); ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep(500); }
  // move the diamond
  await drag(...c(v[2]), c(v[2])[0] + 60, c(v[2])[1] + 50);
  await sleep(800); v = await value();
  log.push(['labelled+moved', v.map((e) => e.type + (e.text ? ':' + e.text : '') + (e.x != null ? '@' + e.x + ',' + e.y : '')).join(' | ')]);
  // resize the diamond from its south-east corner
  const dm = v[2]; await drag(...scr(dm.x + dm.w, dm.y + dm.h), ...scr(dm.x + dm.w + 30, dm.y + dm.h + 20));
  await sleep(800); v = await value();
  log.push(['resized', v[2].w + 'x' + v[2].h]);
  // delete it (and its arrow)
  document.querySelector('.kdiagram').dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true })); await sleep(800);
  v = await value(); log.push(['deleted', v.length + ' elements: ' + v.map((e) => e.type).join(',')]);
  const counts = [];
  for (let i = 0; i < 9; i++) { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true })); await sleep(500); counts.push((await value()).length); }
  log.push(['undo', counts.join(',')]);
  const redo = [];
  for (let i = 0; i < 9; i++) { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, shiftKey: true, bubbles: true })); await sleep(500); redo.push((await value()).length); }
  log.push(['redo', redo.join(',')]);
  } catch (e) { log.push(['ERR', String(e && e.stack || e)]); }
  return JSON.stringify(log);
})()
