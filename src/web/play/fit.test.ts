import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_UP, MIN_DOWN, fitSlide } from './fit';

const desktop = { w: 1376, h: 816 };
const phone = { w: 374, h: 760 };

test('a slide is never wider than the screen, and a phone gets the phone layout', () => {
  assert.equal(fitSlide(phone, 880).width, 374);
  assert.equal(fitSlide(desktop, 1600).width, 1376);
  for (const [frame, design, height] of [[desktop, 880, 300], [desktop, 880, 1100], [desktop, 880, 5000], [phone, 880, 900], [phone, 880, 4000], [desktop, 2400, 600]] as const) {
    const f = fitSlide(frame, design, height);
    assert.ok(f.width * f.scale <= frame.w + 0.01, `${design}×${height} on ${frame.w}: ${f.width}×${f.scale}`);
  }
});

test('short documents grow to fill, tall ones shrink while readable, taller ones scroll', () => {
  const small = fitSlide(desktop, 880, 300);
  assert.equal(small.scale, MAX_UP);
  assert.equal(small.scrolls, false);
  const tall = fitSlide(desktop, 880, 1100);
  assert.ok(tall.scale < 1 && tall.scale >= MIN_DOWN && !tall.scrolls);
  assert.ok(Math.abs(1100 * tall.scale - desktop.h) < 0.5, 'fits the height exactly');
  const long = fitSlide(desktop, 880, 5000);
  assert.deepEqual([long.scale, long.scrolls], [1, true]);
  // A phone shrinks less before it scrolls.
  assert.equal(fitSlide(phone, 880, 1000).scrolls, true);
  assert.equal(fitSlide(phone, 880, 900).scrolls, false);
});
