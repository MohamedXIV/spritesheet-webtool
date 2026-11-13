import test from 'node:test';
import assert from 'node:assert/strict';
import { gifCentisecondDelay, resolveFrameDurationMs } from '../src/lib/gifTiming.ts';

test('imported per-frame GIF delays take precedence over workspace FPS', () => {
  assert.equal(resolveFrameDurationMs({durationMs:40}, 12), 40);
  assert.equal(resolveFrameDurationMs({durationMs:250}, 24), 250);
  assert.equal(resolveFrameDurationMs({durationMs:250}, 20, false), 50);
});

test('frames without original timing follow FPS and invalid values fall back safely', () => {
  assert.equal(resolveFrameDurationMs({}, 25), 40);
  assert.equal(resolveFrameDurationMs({durationMs:0}, 10), 100);
  assert.equal(resolveFrameDurationMs({},0),1000/12);
});

test('GIF export delays snap to GIF centiseconds and stay within format limits', () => {
  assert.equal(gifCentisecondDelay(37), 40);
  assert.equal(gifCentisecondDelay(0), 100);
  assert.equal(gifCentisecondDelay(1), 10);
  assert.equal(gifCentisecondDelay(Infinity), 100);
  assert.equal(gifCentisecondDelay(1e8), 655350);
});
