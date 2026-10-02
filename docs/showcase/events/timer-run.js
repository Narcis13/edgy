(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 40 && !window.edgy?.state?.doc; i++) await wait(100);
  const id = window.edgy.id;
  const read = async () => (await (await fetch(`/api/docs/${id}/read`)).json()).values;
  const t0 = performance.now();
  await wait(7000);
  const atSeven = await read();
  // Leave for Home the way a person does: the logo link.
  document.querySelector('a[href="/"]').click();
  await wait(500);
  const left = await read();
  const mark = performance.now();
  await wait(5000);
  const later = await read();
  const after = performance.getEntriesByType('resource').filter((e) => e.startTime > mark && e.name.includes(id)).map((e) => e.name);
  return JSON.stringify({ seconds: Math.round((performance.now() - t0) / 100) / 10, atSeven, left, later, requestsAfterLeaving: after, path: location.pathname });
})()
