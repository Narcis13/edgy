import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ClickGate, DOUBLE_WAIT } from './pointer';

/** Timers that run only when told the time has passed. */
function fakeTimers() {
  let now = 0;
  let n = 0;
  const due = new Map<number, { at: number; fn: () => void }>();
  return {
    timers: {
      set: (fn: () => void, ms: number) => { due.set(++n, { at: now + ms, fn }); return n; },
      clear: (h: unknown) => void due.delete(h as number),
    },
    pass(ms: number) {
      now += ms;
      for (const [h, t] of [...due]) if (t.at <= now) { due.delete(h); t.fn(); }
    },
  };
}

test('a double-click runs only dblclick when the cell handles it; a single click waits, then runs click', () => {
  const t = fakeTimers();
  const gate = new ClickGate(t.timers);
  const seen: string[] = [];
  const press = (detail: number) => gate.press('c1', detail, true, () => seen.push('click'), () => seen.push('dblclick'));
  press(1);
  t.pass(100);
  press(2);
  t.pass(DOUBLE_WAIT * 2);
  assert.deepEqual(seen, ['dblclick']);
  press(1);
  assert.deepEqual(seen, ['dblclick'], 'a single click waits');
  t.pass(DOUBLE_WAIT);
  assert.deepEqual(seen, ['dblclick', 'click']);
  // A third click in a row (detail 3) runs nothing more.
  press(1); press(2); press(3);
  t.pass(DOUBLE_WAIT);
  assert.deepEqual(seen, ['dblclick', 'click', 'dblclick']);
});

test('without a dblclick handler every click runs at once', () => {
  const gate = new ClickGate(fakeTimers().timers);
  const seen: string[] = [];
  gate.press('c1', 1, false, () => seen.push('click'), () => seen.push('dblclick'));
  gate.press('c1', 2, false, () => seen.push('click'), () => seen.push('dblclick'));
  assert.deepEqual(seen, ['click', 'click']);
});

test('clicks on different cells or rows do not cancel each other', () => {
  const t = fakeTimers();
  const gate = new ClickGate(t.timers);
  const seen: string[] = [];
  gate.press('a', 1, true, () => seen.push('a'), () => seen.push('A'));
  gate.press('b', 1, true, () => seen.push('b'), () => seen.push('B'));
  t.pass(DOUBLE_WAIT);
  assert.deepEqual(seen.sort(), ['a', 'b']);
});
