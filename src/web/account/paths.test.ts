import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPublicPath, nextOf, safeNext, signInAddress } from './paths';

test('only the sign-in pages and share links are public', () => {
  assert.equal(isPublicPath('/signin'), true);
  assert.equal(isPublicPath('/signup'), true);
  assert.equal(isPublicPath('/s/abc-123'), true);
  assert.equal(isPublicPath('/'), false);
  assert.equal(isPublicPath('/d/abc'), false);
  assert.equal(isPublicPath('/profile'), false);
  assert.equal(isPublicPath('/s/abc/extra'), false);
  assert.equal(isPublicPath('/signin/x'), false);
});

test('a next must be a path in this app', () => {
  assert.equal(safeNext('/d/abc'), '/d/abc');
  assert.equal(safeNext('/deck/x/play?from=%2F'), '/deck/x/play?from=%2F');
  assert.equal(safeNext('//evil.test'), null);
  assert.equal(safeNext('/\\evil.test'), null);
  assert.equal(safeNext('https://evil.test'), null);
  assert.equal(safeNext('javascript:alert(1)'), null);
  assert.equal(safeNext('d/abc'), null);
  assert.equal(safeNext(''), null);
  assert.equal(safeNext(null), null);
  assert.equal(safeNext('/a\nb'), null);
  // A browser drops tabs and newlines in an address: these would be //evil.example.
  assert.equal(safeNext('/\t/evil.example'), null);
  assert.equal(safeNext('/\n/evil.example'), null);
  assert.equal(safeNext('/?q=a b'), '/?q=a b', 'a space is only a space');
});

test('next never points back at the sign-in pages', () => {
  assert.equal(safeNext('/signin'), null);
  assert.equal(safeNext('/signup?next=/'), null);
  assert.equal(safeNext('/signing'), '/signing');
});

test('nextOf reads a query and falls back to the library', () => {
  assert.equal(nextOf('next=%2Fd%2Fabc'), '/d/abc');
  assert.equal(nextOf('next=%2F%2Fevil.test'), '/');
  assert.equal(nextOf('next=https%3A%2F%2Fevil.test'), '/');
  assert.equal(nextOf(undefined), '/');
  assert.equal(nextOf(''), '/');
});

test('the sign-in address carries where to come back to', () => {
  assert.equal(signInAddress('/d/abc'), '/signin?next=%2Fd%2Fabc');
  assert.equal(signInAddress('/deck/x?a=1&b=2'), '/signin?next=%2Fdeck%2Fx%3Fa%3D1%26b%3D2');
  assert.equal(signInAddress('/'), '/signin');
  assert.equal(signInAddress('/signin'), '/signin');
  assert.equal(signInAddress('/d/abc', 'signup'), '/signup?next=%2Fd%2Fabc');
  assert.equal(nextOf(signInAddress('/d/abc').split('?')[1]), '/d/abc');
});
