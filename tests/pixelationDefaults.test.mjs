import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PIXELATOR_OPTIONS } from '../src/lib/pixelator.ts';

test('pixelation is opt-in for new projects and standalone previews', () => {
  assert.equal(DEFAULT_PIXELATOR_OPTIONS.enabled, false);
  assert.equal(DEFAULT_PIXELATOR_OPTIONS.pixelSize, 8);
  assert.equal(DEFAULT_PIXELATOR_OPTIONS.palette, 'none');
});

test('enabling pixelation never mutates shared defaults', () => {
  const configured = { ...DEFAULT_PIXELATOR_OPTIONS, enabled: true, pixelSize: 4 };
  assert.equal(configured.enabled, true);
  assert.equal(DEFAULT_PIXELATOR_OPTIONS.enabled, false);
});
