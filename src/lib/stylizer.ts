/**
 * stylizer.ts - Pure, framework-free engine that converts realistic textures
 * into stylized looks (painterly / cel / watercolor / sketch), bakes lighting
 * into the albedo, and regenerates normal/height maps. Mirrors pixelator.ts.
 *
 * All functions take and return ImageBitmap and run on OffscreenCanvas so they
 * stay off the React tree. Callers own bitmap disposal.
 */

export type StylizerStyle = 'painterly' | 'cel' | 'watercolor' | 'sketch';

export interface StylizerOptions {
  style: StylizerStyle;

  // Shared pre-stage
  smoothRadius: number;        // 0..8  Kuwahara/mean radius ("brush size")
  bilateralPreSmooth: boolean;
  contrast: number;            // -100..100
  saturation: number;          // -100..100
  brightness: number;          // -100..100

  // Painterly
  brushStrength: number;       // 0..100
  detailPreserve: number;      // 0..100

  // Cel
  levels: number;              // 2..16 posterize bands
  celSmoothing: number;        // 0..100
  paletteSnap: boolean;

  // Watercolor
  bleed: number;               // 0..100
  granulation: number;         // 0..100
  washStrength: number;        // 0..100

  // Sketch
  lineStrength: number;        // 0..100
  lineThreshold: number;       // 0..100
  hatching: boolean;

  // Shared post-stage
  outlineEnabled: boolean;
  outlineColor: string;        // hex
  outlineThickness: number;    // 1..4 px

  // AO + shading bake
  bakeAO: boolean;
  bakeShading: boolean;
  bakeStrength: number;        // 0..100

  // Map regeneration
  regenerateNormal: boolean;
  normalStrength: number;      // 0..100
  regenerateHeight: boolean;
  flattenRoughness: boolean;
  flattenMetallic: boolean;
}

export const DEFAULT_STYLIZER_OPTIONS: StylizerOptions = {
  style: 'painterly',
  smoothRadius: 3,
  bilateralPreSmooth: true,
  contrast: 10,
  saturation: 0,
  brightness: 0,
  brushStrength: 50,
  detailPreserve: 50,
  levels: 5,
  celSmoothing: 40,
  paletteSnap: false,
  bleed: 40,
  granulation: 30,
  washStrength: 50,
  lineStrength: 60,
  lineThreshold: 30,
  hatching: false,
  outlineEnabled: false,
  outlineColor: '#000000',
  outlineThickness: 1,
  bakeAO: false,
  bakeShading: false,
  bakeStrength: 60,
  regenerateNormal: false,
  normalStrength: 50,
  regenerateHeight: false,
  flattenRoughness: false,
  flattenMetallic: false,
};

// --- Canvas helpers -------------------------------------------------------

function makeCanvas(width: number, height: number): OffscreenCanvas {
  return new OffscreenCanvas(width, height);
}

export function toImageData(bitmap: ImageBitmap): ImageData {
  const canvas = makeCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
}

export async function fromImageData(imageData: ImageData): Promise<ImageBitmap> {
  const canvas = makeCanvas(imageData.width, imageData.height);
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(imageData, 0, 0);
  return canvas.transferToImageBitmap();
}

// contrast/saturation/brightness in-place on RGBA Uint8ClampedArray
export function applyToneAdjust(
  data: Uint8ClampedArray,
  contrast: number,
  saturation: number,
  brightness: number,
): void {
  const c = 1 + contrast / 100;      // 0..2
  const s = 1 + saturation / 100;    // 0..2
  const b = (brightness / 100) * 255; // -255..255
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i], g = data[i + 1], bl = data[i + 2];
    // brightness
    r += b; g += b; bl += b;
    // contrast around 128
    r = (r - 128) * c + 128;
    g = (g - 128) * c + 128;
    bl = (bl - 128) * c + 128;
    // saturation toward luma
    const luma = 0.299 * r + 0.587 * g + 0.114 * bl;
    r = luma + (r - luma) * s;
    g = luma + (g - luma) * s;
    bl = luma + (bl - luma) * s;
    data[i] = r; data[i + 1] = g; data[i + 2] = bl;
  }
}
