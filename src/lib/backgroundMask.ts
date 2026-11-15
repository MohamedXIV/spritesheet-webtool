/** Pixel-level operations shared by Color Key and AI background removal. */
import { applyChromaKeyToImageData, detectSolidBackground } from './chromaKey.ts';

export type EdgeStyle = 'soft' | 'pixel';

export interface MaskRefinement {
  edgeStyle: EdgeStyle;
  erosion?: number;
  decontaminate?: boolean;
}

/**
 * Apply a foreground mask without restoring pixels that were transparent in the source.
 * The input RGBA array is deliberately copied so previews cannot alter the project.
 */
export function applyForegroundMask(
  source: Uint8ClampedArray,
  mask: Uint8Array,
  width: number,
  height: number,
  refinement: MaskRefinement,
): Uint8ClampedArray {
  const count = width * height;
  if (source.length !== count * 4 || mask.length !== count) {
    throw new Error('Background mask and source dimensions do not match.');
  }

  const output = new Uint8ClampedArray(source);
  const alpha = new Uint8Array(mask);
  const shrink = Math.max(0, Math.min(3, Math.trunc(refinement.erosion ?? 0)));

  if (refinement.edgeStyle === 'pixel') {
    for (let i = 0; i < count; i++) alpha[i] = alpha[i] >= 128 ? 255 : 0;
  }

  // Optional erosion is never applied by default; it destroys thin sprite details.
  for (let pass = 0; pass < shrink; pass++) {
    const previous = new Uint8Array(alpha);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        alpha[i] = Math.min(
          previous[i],
          y > 0 ? previous[i - width] : 0,
          y < height - 1 ? previous[i + width] : 0,
          x > 0 ? previous[i - 1] : 0,
          x < width - 1 ? previous[i + 1] : 0,
        );
      }
    }
  }

  for (let i = 0; i < count; i++) {
    output[4 * i + 3] = Math.round((source[4 * i + 3] * alpha[i]) / 255);
  }

  // Only translucent edges are modified, and only when the user requests it.
  if (refinement.decontaminate && refinement.edgeStyle === 'soft') {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixel = y * width + x;
        const a = output[4 * pixel + 3];
        if (a <= 8 || a >= 247) continue;

        let nearest = -1;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (let dy = -3; dy <= 3; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -3; dx <= 3; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            const candidate = ny * width + nx;
            const distance = dx * dx + dy * dy;
            if (distance >= bestDistance || output[4 * candidate + 3] < 247) continue;
            bestDistance = distance;
            nearest = candidate;
          }
        }
        if (nearest >= 0) {
          for (let c = 0; c < 3; c++) {
            output[4 * pixel + c] = Math.round(
              0.65 * source[4 * pixel + c] + 0.35 * source[4 * nearest + c],
            );
          }
        }
      }
    }
  }

  return output;
}

export interface SafeMaskResult {
  pixels: Uint8ClampedArray;
  fallback: 'none' | 'color-key';
}

/**
 * Never return an all-transparent AI result for a source that visibly contains
 * content. Recover only if the opaque bounds have a confident solid-color
 * border; otherwise fail closed and let the user try another method/backend.
 */
export function applySafeForegroundMask(
  source: Uint8ClampedArray,
  mask: Uint8Array,
  width: number,
  height: number,
  refinement: MaskRefinement,
): SafeMaskResult {
  const output = applyForegroundMask(source, mask, width, height, refinement);
  let sourceVisible = false;
  let outputVisible = false;
  for (let i = 3; i < source.length; i += 4) {
    if (source[i] > 16) sourceVisible = true;
    if (output[i] > 16) outputVisible = true;
    if (sourceVisible && outputVisible) break;
  }
  if (!sourceVisible || outputVisible) return { pixels: output, fallback: 'none' };

  const color = detectSolidBackground({ data: source, width, height });
  if (color) {
    const recovered = new Uint8ClampedArray(source);
    applyChromaKeyToImageData({ data: recovered, width, height }, {
      targetColor: color,
      tolerance: 12,
      edgeSoftness: refinement.edgeStyle === 'pixel' ? 0 : 6,
      spillSuppression: refinement.edgeStyle !== 'pixel',
      spillMethod: 'cap',
      spillAmount: 65,
    });
    for (let i = 3; i < recovered.length; i += 4) {
      if (recovered[i] > 16) return { pixels: recovered, fallback: 'color-key' };
    }
  }

  throw new Error('The AI returned an empty foreground mask. Nothing was applied. Try CPU fallback or Color Key.');
}
