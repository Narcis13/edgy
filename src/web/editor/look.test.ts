import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cssOf, docCss, fontCss } from './look';

test('the new style keys become CSS', () => {
  const css = cssOf({ tracking: 0.05, case: 'upper', decor: 'strike', para: 14, shadow: 'md', border: 'l', bcolor: 'accent', bwidth: 3, pad: '4 0 4 16', line: 1.6 }) as Record<string, unknown>;
  assert.equal(css.letterSpacing, '0.05em');
  assert.equal(css.textTransform, 'uppercase');
  assert.equal(css.textDecorationLine, 'line-through');
  assert.equal(css['--para'], '14px');
  assert.match(String(css['--cell-shadow']), /rgba/);
  assert.equal(css.borderLeft, '3px solid var(--accent)');
  assert.equal(css.borderTop, undefined);
  assert.equal(css.padding, '4px 0px 4px 16px');
  assert.equal(css.lineHeight, 1.6);
  // Out-of-range values are held in range; unknown ones are ignored.
  const wild = cssOf({ tracking: 3, line: 40, case: 'shout', shadow: 'huge', border: 'all' }) as Record<string, unknown>;
  assert.equal(wild.letterSpacing, '0.5em');
  assert.equal(wild.lineHeight, 4);
  assert.equal(wild.textTransform, undefined);
  assert.equal(wild['--cell-shadow'], undefined);
  assert.equal(wild.border, '1px solid var(--line-strong)');
});

test('fonts come from the registry; the mono face turns its axis on', () => {
  assert.match(String(fontCss('playfair').fontFamily), /Playfair Display Variable/);
  assert.match(String(fontCss('mono').fontVariationSettings), /"MONO" 1/);
  assert.match(String(fontCss('inter').fontVariationSettings), /"MONO" 0/);
  assert.deepEqual(fontCss('comic-sans'), {});
  assert.match(String(cssOf({ font: 'caveat' }).fontFamily), /Caveat/);
});

test('a document sets its text font, size and heading font', () => {
  const css = docCss({ title: 'x', font: 'lora', fontSize: 17, headFont: 'grotesk' }) as Record<string, unknown>;
  assert.match(String(css.fontFamily), /Lora/);
  assert.equal(css.fontSize, '17px');
  assert.match(String(css['--head-font']), /Space Grotesk/);
  assert.deepEqual(docCss({ title: 'x', fontSize: 400 }), {});
});
