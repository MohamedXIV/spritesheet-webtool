import test from 'node:test';
import assert from 'node:assert/strict';
import { applyForegroundMask, applySafeForegroundMask } from '../src/lib/backgroundMask.ts';
import { sampleCornerColor, applyChromaKeyToImageData, detectSolidBackground } from '../src/lib/chromaKey.ts';

const rgba = (...pixels) => new Uint8ClampedArray(pixels.flat());
const image = (width, height, ...pixels) => ({ width, height, data: rgba(...pixels) });

test('AI mask preserves original alpha and RGB at full resolution', () => {
  const input = rgba([255, 30, 60, 255], [20, 80, 140, 128], [5, 6, 7, 0]);
  const result = applyForegroundMask(input, new Uint8Array([255, 128, 255]), 3, 1, { edgeStyle: 'soft' });
  assert.deepEqual(Array.from(result), [255, 30, 60, 255, 20, 80, 140, 64, 5, 6, 7, 0]);
  assert.equal(input[7], 128, 'preview must not modify source pixels');
});

test('pixel-art mask hardens only alpha while leaving original colors untouched', () => {
  const input = rgba([200, 40, 60, 255], [6, 7, 8, 255]);
  const result = applyForegroundMask(input, new Uint8Array([127, 128]), 2, 1, { edgeStyle: 'pixel' });
  assert.deepEqual(Array.from(result), [200, 40, 60, 0, 6, 7, 8, 255]);
});

test('invalid AI masks fail before any compositing', () => {
  assert.throws(() => applyForegroundMask(rgba([1, 2, 3, 4]), new Uint8Array(2), 1, 1, { edgeStyle: 'soft' }), /dimensions/);
});

test('Color Key does not resurrect existing transparency', () => {
  const input = image(3, 1, [0, 255, 0, 80], [0, 200, 0, 100], [200, 30, 40, 0]);
  applyChromaKeyToImageData(input, { targetColor: { r: 0, g: 255, b: 0 }, tolerance: 0, edgeSoftness: 20 });
  assert.equal(input.data[3], 0);
  assert.ok(input.data[7] <= 100);
  assert.equal(input.data[11], 0);
});

test('Color Key leaves opaque foreground green detail intact outside key edge', () => {
  const input = image(2, 1, [0, 255, 0, 255], [0, 90, 0, 255]);
  applyChromaKeyToImageData(input, {
    targetColor: { r: 0, g: 255, b: 0 }, tolerance: 0,
    edgeSoftness: 4, spillSuppression: true, spillAmount: 100,
  });
  assert.equal(input.data[3], 0);
  assert.equal(input.data[5], 90, 'do not desaturate opaque green clothing');
  assert.equal(input.data[7], 255);
});

test('corner detection handles tiny images, transparency, and differing corner colors', () => {
  const tiny = image(2, 2,
    [0, 255, 0, 255], [0, 255, 0, 255],
    [0, 255, 0, 255], [255, 0, 0, 255],
  );
  assert.deepEqual(sampleCornerColor(tiny, 10), { r: 0, g: 255, b: 0 });
  const transparent = image(1, 1, [1, 2, 3, 0]);
  assert.deepEqual(sampleCornerColor(transparent, 10), { r: 0, g: 255, b: 0 });
});

function solidScreenWithTransparentPadding() {
  const width = 32, height = 32;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 6; y < 26; y++) {
    for (let x = 2; x < 30; x++) {
      const i = (y * width + x) * 4;
      const character = x >= 13 && x <= 18 && y >= 10 && y <= 23;
      data.set(character ? [190, 40, 60, 255] : [0, 255, 0, 255], i);
    }
  }
  return { width, height, data };
}

test('an empty AI mask on solid green recovers the subject rather than erasing everything', () => {
  const source = solidScreenWithTransparentPadding();
  assert.deepEqual(detectSolidBackground(source), { r: 0, g: 255, b: 0 });
  const result = applySafeForegroundMask(source.data, new Uint8Array(source.width * source.height), source.width, source.height, { edgeStyle: 'soft' });
  assert.equal(result.fallback, 'color-key');
  const pixel = (x, y) => result.pixels[(y * source.width + x) * 4 + 3];
  assert.equal(pixel(15, 16), 255, 'subject must survive');
  assert.equal(pixel(4, 8), 0, 'flat green background must be removed');
  assert.equal(pixel(0, 0), 0, 'existing transparent padding must stay transparent');
});

test('empty AI mask on complex backgrounds fails safely without producing a blank preview', () => {
  const { width, height, data } = solidScreenWithTransparentPadding();
  for (let x = 2; x < 30; x++) {
    const i = (6 * width + x) * 4;
    data.set(x % 2 ? [50, 50, 230, 255] : [230, 70, 50, 255], i);
  }
  assert.equal(detectSolidBackground({ width, height, data }), null);
  assert.throws(
    () => applySafeForegroundMask(data, new Uint8Array(width * height), width, height, { edgeStyle: 'soft' }),
    /empty foreground mask/,
  );
});

test('valid AI masks are applied without triggering Color Key fallback', () => {
  const source = solidScreenWithTransparentPadding();
  const mask = new Uint8Array(source.width * source.height).fill(255);
  const result = applySafeForegroundMask(source.data, mask, source.width, source.height, { edgeStyle: 'soft' });
  assert.equal(result.fallback, 'none');
  assert.equal(result.pixels[(16 * source.width + 15) * 4 + 3], 255);
});
