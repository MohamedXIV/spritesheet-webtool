/**
 * GIF image blocks can cover only a rectangle. This pure compositor applies
 * transparency and GIF disposal modes before producing complete RGBA frames.
 */
export interface GifPatch {
  dims: { left: number; top: number; width: number; height: number };
  patch: Uint8ClampedArray;
  disposalType: number; // 0/1=keep, 2=background, 3=restore previous
  delay: number; // milliseconds
}

export function* compositeGifPatches(
  patches: readonly GifPatch[],
  width: number,
  height: number,
  background: readonly [number, number, number, number] = [0, 0, 0, 0]
): Generator<{ rgba: Uint8ClampedArray; durationMs: number }> {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width < 1 || height < 1 || width > 4096 || height > 4096) {
    throw new Error('GIF dimensions are invalid or too large');
  }
  const current = new Uint8ClampedArray(width * height * 4);

  const clearRectangle = (left: number, top: number, w: number, h: number) => {
    const x0 = Math.max(0, left);
    const y0 = Math.max(0, top);
    const x1 = Math.min(width, left + w);
    const y1 = Math.min(height, top + h);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * width + x) * 4;
        current.set(background, i);
      }
    }
  };

  clearRectangle(0, 0, width, height);
  let previous: GifPatch | null = null;
  let restorePrevious: Uint8ClampedArray | null = null;

  for (const patch of patches) {
    if (previous?.disposalType === 2) {
      const { left, top, width: w, height: h } = previous.dims;
      clearRectangle(left, top, w, h);
    } else if (previous?.disposalType === 3 && restorePrevious) {
      current.set(restorePrevious);
    }

    // Disposal 3 saves the canvas *before* the current patch is painted.
    const snapshot = patch.disposalType === 3 ? current.slice() : null;
    const { left, top, width: w, height: h } = patch.dims;
    if (patch.patch.length !== w * h * 4) throw new Error('Invalid GIF patch dimensions');
    for (let y = 0; y < h; y++) {
      if (top + y < 0 || top + y >= height) continue;
      for (let x = 0; x < w; x++) {
        if (left + x < 0 || left + x >= width) continue;
        const src = (y * w + x) * 4;
        if (patch.patch[src + 3] === 0) continue; // transparent pixels do not erase earlier frames
        const dst = ((top + y) * width + left + x) * 4;
        current[dst] = patch.patch[src];
        current[dst + 1] = patch.patch[src + 1];
        current[dst + 2] = patch.patch[src + 2];
        current[dst + 3] = patch.patch[src + 3];
      }
    }

    yield { rgba: current.slice(), durationMs: patch.delay > 0 ? patch.delay : 100 };
    previous = patch;
    restorePrevious = snapshot;
  }
}
