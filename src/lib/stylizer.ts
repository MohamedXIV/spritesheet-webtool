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

// --- Shared pre-stage: Kuwahara (generalized mean) edge-preserving smooth ---

function kuwahara(src: ImageData, radius: number): ImageData {
  if (radius <= 0) return src;
  const { width: w, height: h, data } = src;
  const out = new ImageData(w, h);
  const od = out.data;
  const r = Math.min(8, Math.floor(radius));
  // Four overlapping quadrant windows; pick the one with lowest luma variance.
  const quads = [
    [-r, 0, -r, 0], [0, r, -r, 0], [-r, 0, 0, r], [0, r, 0, r],
  ];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let bestVar = Infinity, bR = 0, bG = 0, bB = 0;
      for (const [x0, x1, y0, y1] of quads) {
        let sum = 0, sumSq = 0, sr = 0, sg = 0, sb = 0, n = 0;
        for (let dy = y0; dy <= y1; dy++) {
          const yy = y + dy; if (yy < 0 || yy >= h) continue;
          for (let dx = x0; dx <= x1; dx++) {
            const xx = x + dx; if (xx < 0 || xx >= w) continue;
            const idx = (yy * w + xx) * 4;
            const rr = data[idx], gg = data[idx + 1], bb = data[idx + 2];
            const luma = 0.299 * rr + 0.587 * gg + 0.114 * bb;
            sum += luma; sumSq += luma * luma;
            sr += rr; sg += gg; sb += bb; n++;
          }
        }
        if (n === 0) continue;
        const variance = sumSq / n - (sum / n) * (sum / n);
        if (variance < bestVar) {
          bestVar = variance; bR = sr / n; bG = sg / n; bB = sb / n;
        }
      }
      const o = (y * w + x) * 4;
      od[o] = bR; od[o + 1] = bG; od[o + 2] = bB;
      od[o + 3] = data[o + 3];
    }
  }
  return out;
}

function posterize(data: Uint8ClampedArray, levels: number): void {
  const step = 255 / Math.max(1, levels - 1);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.round(Math.round(data[i] / step) * step);
    data[i + 1] = Math.round(Math.round(data[i + 1] / step) * step);
    data[i + 2] = Math.round(Math.round(data[i + 2] / step) * step);
  }
}

function boxBlur(src: ImageData, radius: number): ImageData {
  if (radius <= 0) return src;
  const { width: w, height: h, data } = src;
  const tmp = new ImageData(w, h);
  const td = tmp.data;
  const r = Math.floor(radius);
  // horizontal then vertical
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sr = 0, sg = 0, sb = 0, sa = 0, n = 0;
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx; if (xx < 0 || xx >= w) continue;
        const idx = (y * w + xx) * 4;
        sr += data[idx]; sg += data[idx + 1]; sb += data[idx + 2]; sa += data[idx + 3]; n++;
      }
      const o = (y * w + x) * 4;
      td[o] = sr / n; td[o + 1] = sg / n; td[o + 2] = sb / n; td[o + 3] = sa / n;
    }
  }
  const out = new ImageData(w, h);
  const od = out.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sr = 0, sg = 0, sb = 0, sa = 0, n = 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= h) continue;
        const idx = (yy * w + x) * 4;
        sr += td[idx]; sg += td[idx + 1]; sb += td[idx + 2]; sa += td[idx + 3]; n++;
      }
      const o = (y * w + x) * 4;
      od[o] = sr / n; od[o + 1] = sg / n; od[o + 2] = sb / n; od[o + 3] = sa / n;
    }
  }
  return out;
}

function desaturate(data: Uint8ClampedArray, amount: number): void {
  const a = amount / 100;
  for (let i = 0; i < data.length; i += 4) {
    const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    data[i] = data[i] + (luma - data[i]) * a;
    data[i + 1] = data[i + 1] + (luma - data[i + 1]) * a;
    data[i + 2] = data[i + 2] + (luma - data[i + 2]) * a;
  }
}

export async function stylize(
  albedo: ImageBitmap,
  opts: StylizerOptions,
): Promise<ImageBitmap> {
  // Pre-stage
  let img = toImageData(albedo);
  if (opts.smoothRadius > 0) img = kuwahara(img, opts.smoothRadius);
  applyToneAdjust(img.data, opts.contrast, opts.saturation, opts.brightness);

  // Style stage
  switch (opts.style) {
    case 'cel':
      if (opts.celSmoothing > 0) {
        img = kuwahara(img, Math.round((opts.celSmoothing / 100) * 4));
      }
      posterize(img.data, opts.levels);
      break;
    case 'painterly': {
      // Stronger Kuwahara scaled by brush strength, softened by detailPreserve.
      const brushRadius = Math.max(1, Math.round((opts.brushStrength / 100) * 6));
      img = kuwahara(img, brushRadius);
      if (opts.detailPreserve < 50) {
        img = boxBlur(img, 1);
      }
      break;
    }
    case 'watercolor': {
      const blurR = Math.max(1, Math.round((opts.bleed / 100) * 4));
      img = boxBlur(img, blurR);
      desaturate(img.data, opts.granulation * 0.4);
      posterize(img.data, 12); // gentle banding for pigment pooling
      // wash: lift toward white by washStrength
      const lift = (opts.washStrength / 100) * 40;
      for (let i = 0; i < img.data.length; i += 4) {
        img.data[i] += lift; img.data[i + 1] += lift; img.data[i + 2] += lift;
      }
      break;
    }
    // sketch added in later tasks
    default:
      break;
  }

  return fromImageData(img);
}
