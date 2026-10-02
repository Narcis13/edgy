(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const e = window.edgy;
  const log = [];
  const byText = (sel, text) => [...document.querySelectorAll(sel)].find((x) => x.textContent.trim().includes(text));
  const click = async (el, what, wait = 250) => {
    if (!el) throw new Error('missing: ' + what + ' | log: ' + log.join(' > '));
    el.click();
    log.push(what);
    await sleep(wait);
  };
  const phone = window.innerWidth < 700;
  const id = location.pathname.split('/').pop();
  const agree = e.state.doc.root.children.find((c) => c.name === 'agree');
  e.select(agree.id);
  await sleep(300);
  if (!document.querySelector('.ins-ev-add, .ins-sec-head')) {
    await click(document.querySelector('.more-btn'), 'More');
    await click(byText('[role=menuitem]', 'Cell details'), 'Cell details', 400);
  }
  if (!document.querySelector('.ins-ev-add')) await click(byText('.ins-sec-head', 'Events'), 'open the Events section');
  // 1. Open the Events part from the inspector and add a change handler from a preset.
  await click(document.querySelector('.ins-ev-add'), 'Add a handler', 500);
  await click(document.querySelector('.ev-chip[data-event="change"]'), 'event: change');
  await click(document.querySelector('.ev-preset[data-preset="set-value"]'), 'preset: Set a cell to the new value', 400);
  await click(byText('.pm-item', 'status'), 'pick status from the list', 400);
  const blocks = document.querySelector('.bk-root')?.textContent ?? '';
  log.push('blocks show: ' + blocks.replace(/\s+/g, ' ').slice(0, 60));
  await click(document.querySelector('.st-apply'), 'Apply', 800);
  const handler = e.cell(agree.id).on;
  // 2. Live: tick the checkbox, as a reader would.
  e.setMode('live');
  await sleep(500);
  const box = document.querySelector(`[data-cell="${agree.id}"] input[type=checkbox]`) ?? document.querySelector('input[type=checkbox]');
  await click(box, 'tick the checkbox in Live', 1500);
  const read = await fetch(`/api/docs/${id}/read`).then((r) => r.json());
  const line = (read.outline ?? '').split('\n').filter((l) => /status|agree/.test(l)).join(' | ');
  // 3. Back to Edit and open the handler again, in the Events part, to show it and try it.
  e.setMode('edit');
  await sleep(400);
  e.select(agree.id);
  await sleep(300);
  if (!document.querySelector('.ins-ev')) {
    await click(document.querySelector('.more-btn'), 'More');
    await click(byText('[role=menuitem]', 'Cell details'), 'Cell details', 400);
  }
  await click(document.querySelector('.ins-ev[data-event="change"]'), 'open the change handler from the inspector', 600);
  await click(document.querySelector('.ev-try'), 'Try it', 600);
  const ran = document.querySelector('.ev-run')?.textContent.replace(/\s+/g, ' ').slice(0, 120);
  if (phone) document.querySelector('.st-pane')?.scrollTo(0, 0);
  return JSON.stringify({ steps: log, handler, outline: line, values: read.values ?? null, ran }, null, 1);
})()
