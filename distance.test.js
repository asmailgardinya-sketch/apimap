import test from 'node:test';
import assert from 'node:assert/strict';
import { distanceMeters } from './distance.js';
test('identical coordinates have zero distance', () => {
  assert.equal(distanceMeters({ lat: 37, lon: 127 }, { lat: 37, lon: 127 }), 0);
});
test('one degree along the equator is approximately 111.195 km', () => {
  assert.ok(Math.abs(distanceMeters({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }) - 111195) < 1);
});
test('antipodal coordinates remain finite', () => {
  assert.ok(Math.abs(distanceMeters({ lat: 0, lon: 0 }, { lat: 0, lon: 180 }) - Math.PI * 6371008.8) < 1);
});
