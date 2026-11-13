import test from 'node:test';
import assert from 'node:assert/strict';
import { compositeGifPatches } from '../src/lib/gifDisposal.ts';

const rgba = (r,g,b,a=255) => new Uint8ClampedArray([r,g,b,a]);
const patch = (left, top, width, height, pixels, disposalType=1, delay=60) => ({
  dims: { left, top, width, height },
  patch: new Uint8ClampedArray(pixels),
  disposalType,
  delay
});
const at = (pixels, x) => Array.from(pixels.slice(x*4, x*4+4));

test('GIF partial patches retain earlier pixels and honor transparent pixels', () => {
  const frames = Array.from(compositeGifPatches([
    patch(0,0,2,1,[255,0,0,255,255,0,0,255]),
    patch(0,0,2,1,[0,0,0,0,0,0,255,255])
  ],2,1));
  assert.deepEqual(at(frames[1].rgba,0),[255,0,0,255]);
  assert.deepEqual(at(frames[1].rgba,1),[0,0,255,255]);
  assert.equal(frames[0].durationMs,60);
});

test('disposal 2 restores background before following patch', () => {
  const frames = Array.from(compositeGifPatches([
    patch(0,0,2,1,[255,0,0,255,255,0,0,255]),
    patch(0,0,1,1,[0,0,255,255],2),
    patch(1,0,1,1,[0,255,0,255]),
  ],2,1));
  assert.deepEqual(at(frames[1].rgba,0),[0,0,255,255]);
  assert.deepEqual(at(frames[2].rgba,0),[0,0,0,0]);
  assert.deepEqual(at(frames[2].rgba,1),[0,255,0,255]);
});

test('disposal 3 restores previous canvas snapshot, not a blank frame', () => {
  const frames = Array.from(compositeGifPatches([
    patch(0,0,2,1,[255,0,0,255,255,0,0,255]),
    patch(0,0,1,1,[0,255,0,255],3),
    patch(1,0,1,1,[0,0,255,255])
  ],2,1));
  assert.deepEqual(at(frames[1].rgba,0),[0,255,0,255]);
  assert.deepEqual(at(frames[2].rgba,0),[255,0,0,255]);
  assert.deepEqual(at(frames[2].rgba,1),[0,0,255,255]);
});

test('invalid patch dimensions and oversized canvas are rejected', () => {
  assert.throws(() => [...compositeGifPatches([patch(0,0,2,1,[255,0,0,255])],2,1)],/Invalid GIF patch/);
  assert.throws(() => [...compositeGifPatches([],8192,1)],/too large/);
});
