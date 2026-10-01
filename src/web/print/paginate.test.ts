import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Box, pageSpec, paginate } from './paginate';

const stack = (...heights: number[]): Box[] => {
  let y = 0;
  return heights.map((h) => ({ top: y, bottom: (y += h) }));
};

test('a short document is one page', () => {
  assert.deepEqual(paginate({ total: 300, room: 1000, leaves: stack(100, 200), groups: [], forced: [] }), [{ start: 0, end: 300 }]);
});

test('pages end between cells, never inside one', () => {
  const leaves = stack(400, 400, 400, 400);
  const pages = paginate({ total: 1600, room: 1000, leaves, groups: [], forced: [] });
  assert.deepEqual(pages, [{ start: 0, end: 800 }, { start: 800, end: 1600 }]);
});

test('a page break cell always ends the page', () => {
  const leaves = [...stack(200, 200), { top: 400, bottom: 400 }, { top: 400, bottom: 600 }];
  const pages = paginate({ total: 600, room: 1000, leaves, groups: [], forced: [400] });
  assert.deepEqual(pages, [{ start: 0, end: 400 }, { start: 400, end: 600 }]);
});

test('cutting between whole groups is preferred to cutting through one', () => {
  // Two cards of two lines each; the second card straddles 700 but 600 sits between the cards.
  const leaves = stack(150, 150, 150, 150, 150, 150, 150, 150);
  const groups = [{ top: 0, bottom: 600 }, { top: 600, bottom: 1200 }];
  const pages = paginate({ total: 1200, room: 760, leaves, groups, forced: [] });
  assert.equal(pages[0].end, 600);
});

test('a cell taller than a page is sliced, and the next page resumes the slice', () => {
  const pages = paginate({ total: 2500, room: 1000, leaves: [{ top: 0, bottom: 2500 }], groups: [], forced: [] });
  assert.deepEqual(pages, [{ start: 0, end: 1000 }, { start: 1000, end: 2000 }, { start: 2000, end: 2500 }]);
});

test('a new page starts at the next cell, skipping the gap', () => {
  const leaves = [{ top: 0, bottom: 700 }, { top: 720, bottom: 1300 }];
  const pages = paginate({ total: 1300, room: 1000, leaves, groups: [], forced: [] });
  assert.equal(pages.length, 2);
  assert.equal(pages[1].start, 720);
});

test('page formats', () => {
  assert.deepEqual(pageSpec({ title: 't' }), { size: 'A4', landscape: false, w: 210, h: 297, margin: 16, footer: 'number' });
  const l = pageSpec({ title: 't', page: 'Letter', orientation: 'landscape', margin: 10, footer: 'none' });
  assert.equal(l.w, 279.4);
  assert.equal(l.h, 215.9);
  assert.equal(l.margin, 10);
  assert.equal(pageSpec({ title: 't', page: 'B9' }).size, 'A4');
});
