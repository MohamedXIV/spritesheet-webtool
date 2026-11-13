import gifenc from 'gifenc';

const { quantize, applyPalette } = gifenc;

/**
 * Reserve palette index 0 for transparency on EVERY frame, including fully
 * opaque frames. GIF logical-screen disposal background is index 0, so this
 * avoids stale opaque trails when a later frame clears to background.
 * Opaque black remains a normal palette color (index >= 1).
 */
export function toIndexedGifFrame(
  rgba: Uint8ClampedArray | Uint8Array,
  maxColors: number
): { palette: number[][]; index: Uint8Array } {
  const colors = Math.max(2, Math.min(256, Math.floor(maxColors)));
  let opaqueCount = 0;
  for (let pixel = 3; pixel < rgba.length; pixel += 4) {
    if (rgba[pixel] >= 128) opaqueCount++;
  }

  const opaque = new Uint8Array(opaqueCount * 4);
  let offset = 0;
  for (let pixel = 0; pixel < rgba.length; pixel += 4) {
    if (rgba[pixel + 3] < 128) continue;
    opaque[offset++] = rgba[pixel];
    opaque[offset++] = rgba[pixel + 1];
    opaque[offset++] = rgba[pixel + 2];
    opaque[offset++] = 255;
  }

  const opaquePalette: number[][] = opaqueCount
    ? quantize(opaque, colors - 1, { format: 'rgb565' })
    : [[0, 0, 0]];
  const palette = [[0, 0, 0], ...opaquePalette];
  const index = applyPalette(rgba, opaquePalette);
  for (let pixel = 3; pixel < rgba.length; pixel += 4) {
    const at = pixel >> 2;
    index[at] = rgba[pixel] < 128 ? 0 : index[at] + 1;
  }
  return { palette, index };
}
