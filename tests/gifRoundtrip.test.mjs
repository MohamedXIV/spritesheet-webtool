import test from 'node:test';
import assert from 'node:assert/strict';
import gifenc from 'gifenc';
import gifuct from 'gifuct-js';
import { toIndexedGifFrame } from '../src/lib/gifPalette.ts';
const { GIFEncoder, quantize, applyPalette } = gifenc;
const { parseGIF, decompressFrames } = gifuct;

test('gifenc and gifuct-js round-trip a two-frame animation with distinct delays', () => {
  const encoder = GIFEncoder();
  const first = new Uint8Array([255,0,0,255,255,0,0,255]);
  const second = new Uint8Array([0,255,0,255,0,255,0,255]);
  for (const [rgba, delay] of [[first, 40], [second, 130]]) {
    const palette = quantize(rgba, 256);
    const indexes = applyPalette(rgba, palette);
    encoder.writeFrame(indexes, 2, 1, { palette, delay, repeat: 0, dispose: 2 });
  }
  encoder.finish();

  const gifBytes = encoder.bytes();
  assert.ok(gifBytes.length > 20);
  const bytes = new Uint8Array(gifBytes);
  const parsed = parseGIF(bytes.buffer);
  const decoded = decompressFrames(parsed, true);
  assert.equal(decoded.length, 2);
  assert.equal(decoded[0].delay, 40);
  assert.equal(decoded[1].delay, 130);
  assert.deepEqual(Array.from(decoded[0].patch.slice(0,4)), [255,0,0,255]);
  assert.deepEqual(Array.from(decoded[1].patch.slice(0,4)), [0,255,0,255]);
});

test('gifenc exports 1-bit transparency for the selected palette index', () => {
  const rgba = new Uint8Array([0,0,0,0,255,0,0,255]);
  const palette = [[255,0,0],[0,0,0]];
  const indexes = new Uint8Array([1,0]);
  const encoder = GIFEncoder();
  encoder.writeFrame(indexes, 2, 1, { palette, transparent: true, transparentIndex: 1, repeat: -1, dispose: 2, delay: 50 });
  encoder.finish();
  const bytes = new Uint8Array(encoder.bytes());
  const decoded = decompressFrames(parseGIF(bytes.buffer), true);
  assert.equal(decoded.length, 1);
  assert.equal(decoded[0].patch[3], 0);
  assert.equal(decoded[0].patch[7], 255);
});

test('worker palette reserves transparent index and never makes opaque black transparent', () => {
  const rgba = new Uint8ClampedArray([
    0,0,0,255,    // solid black
    0,0,0,0,      // transparent
    255,0,0,255,  // solid red
  ]);
  const { palette, index } = toIndexedGifFrame(rgba, 16);
  assert.equal(index[1], 0);
  assert.ok(index[0] > 0);
  assert.ok(index[2] > 0);
  assert.equal(palette.length <= 16, true);
  const encoder = GIFEncoder();
  encoder.writeFrame(index, 3, 1, {
    palette, transparent:true, transparentIndex:0, dispose:2, delay:60, repeat:0
  });
  encoder.finish();
  const decoded = decompressFrames(parseGIF(new Uint8Array(encoder.bytes()).buffer), true);
  assert.deepEqual(Array.from(decoded[0].patch.slice(0,4)), [0,0,0,255]);
  assert.equal(decoded[0].patch[7], 0);
  assert.equal(decoded[0].patch[11], 255);
});
