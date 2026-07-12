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

// Draw a bitmap into a canvas of an explicit target size and read it back.
// Used to resample auxiliary maps (AO/height) to the styled albedo's dimensions.
function toImageDataScaled(bitmap: ImageBitmap, width: number, height: number): ImageData {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
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

// Returns a Float32Array of edge magnitude (0..~1) per pixel.
function sobelEdges(src: ImageData): Float32Array {
  const { width: w, height: h, data } = src;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    lum[i] = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) / 255;
  }
  const edges = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -lum[i - w - 1] - 2 * lum[i - 1] - lum[i + w - 1] +
        lum[i - w + 1] + 2 * lum[i + 1] + lum[i + w + 1];
      const gy =
        -lum[i - w - 1] - 2 * lum[i - w] - lum[i - w + 1] +
        lum[i + w - 1] + 2 * lum[i + w] + lum[i + w + 1];
      edges[i] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return edges;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const TOON_COLORS = [
  [16, 16, 20], [240, 240, 245], [235, 75, 75], [75, 190, 110], [60, 120, 240],
  [250, 200, 50], [230, 90, 220], [70, 210, 215], [110, 115, 125], [175, 180, 190],
  [120, 30, 30], [120, 120, 30], [25, 90, 45], [80, 25, 110], [20, 95, 100],
  [15, 30, 100], [255, 215, 185], [245, 185, 145], [195, 130, 95], [105, 60, 40],
  [255, 125, 150], [150, 220, 90], [255, 160, 60], [100, 80, 70]
];

function snapToPalette(data: Uint8ClampedArray, palette: number[][]): void {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    let bestDist = Infinity;
    let br = r, bg = g, bb = b;
    for (const [pr, pg, pb] of palette) {
      const dr = r - pr;
      const dg = g - pg;
      const db = b - pb;
      const d = dr * dr + dg * dg + db * db;
      if (d < bestDist) {
        bestDist = d;
        br = pr; bg = pg; bb = pb;
      }
    }
    data[i] = br;
    data[i + 1] = bg;
    data[i + 2] = bb;
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
    case 'cel': {
      if (opts.celSmoothing > 0) {
        const celR = Math.max(1, Math.round((opts.celSmoothing / 100) * 5));
        img = kuwahara(img, celR);
      }
      // Posterize the Value (brightness) channel to preserve hue/saturation and prevent gray-out
      const step = 255 / Math.max(1, opts.levels - 1);
      for (let i = 0; i < img.data.length; i += 4) {
        let r = img.data[i];
        let g = img.data[i + 1];
        let b = img.data[i + 2];

        // Soft saturation boost for cartoon color pop
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        r = Math.min(255, Math.max(0, luma + (r - luma) * 1.25));
        g = Math.min(255, Math.max(0, luma + (g - luma) * 1.25));
        b = Math.min(255, Math.max(0, luma + (b - luma) * 1.25));

        const val = Math.max(r, g, b);
        if (val > 0) {
          const newVal = Math.round(Math.round(val / step) * step);
          img.data[i] = Math.min(255, (r / val) * newVal);
          img.data[i + 1] = Math.min(255, (g / val) * newVal);
          img.data[i + 2] = Math.min(255, (b / val) * newVal);
        }
      }
      if (opts.paletteSnap) {
        snapToPalette(img.data, TOON_COLORS);
      }
      break;
    }
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
      // Saturation boost for glowing, translucent watercolor colors
      for (let i = 0; i < img.data.length; i += 4) {
        const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        img.data[i] = Math.min(255, Math.max(0, luma + (r - luma) * 1.55));
        img.data[i + 1] = Math.min(255, Math.max(0, luma + (g - luma) * 1.55));
        img.data[i + 2] = Math.min(255, Math.max(0, luma + (b - luma) * 1.55));
      }

      const blurR = Math.round((opts.bleed / 100) * 3);
      if (blurR > 0) {
        img = boxBlur(img, blurR);
      }
      posterize(img.data, 12); // gentle banding for pigment pooling

      // 1. Organic paper grain/fiber texture (bright and dark fibers)
      const { width: w, height: h } = img;
      const grain = opts.granulation / 100;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const o = (y * w + x) * 4;
          const val1 = Math.sin(x * 0.35) * Math.cos(y * 0.35);
          const val2 = Math.sin(x * 0.1 + 3) * Math.sin(y * 0.1 + 1);
          const val3 = ((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1) * 2.0 - 1.0;
          const noise = (val1 * 0.45 + val2 * 0.45 + val3 * 0.1) * grain;
          const factor = 1.0 + noise * 0.12;
          img.data[o] = Math.min(255, Math.max(0, img.data[o] * factor));
          img.data[o + 1] = Math.min(255, Math.max(0, img.data[o + 1] * factor));
          img.data[o + 2] = Math.min(255, Math.max(0, img.data[o + 2] * factor));
        }
      }

      // 2. Wet-edge pigment pooling (dark contour borders)
      const edgeMag = sobelEdges(img);
      const bleedStrength = (opts.bleed / 100) * 0.5;
      for (let i = 0; i < img.data.length; i += 4) {
        const edge = edgeMag[i / 4];
        const factor = 1.0 - edge * bleedStrength * 0.55;
        img.data[i] = Math.min(255, Math.max(0, img.data[i] * factor));
        img.data[i + 1] = Math.min(255, Math.max(0, img.data[i + 1] * factor));
        img.data[i + 2] = Math.min(255, Math.max(0, img.data[i + 2] * factor));
      }

      // 3. Watercolor wash lift (blends dilution color towards paper white)
      const wash = opts.washStrength / 100;
      for (let i = 0; i < img.data.length; i += 4) {
        img.data[i] = Math.min(255, img.data[i] + (255 - img.data[i]) * wash * 0.35);
        img.data[i + 1] = Math.min(255, img.data[i + 1] + (255 - img.data[i + 1]) * wash * 0.35);
        img.data[i + 2] = Math.min(255, img.data[i + 2] + (255 - img.data[i + 2]) * wash * 0.35);
      }
      break;
    }
    case 'sketch': {
      const edges = sobelEdges(img);
      const thr = opts.lineThreshold / 100;
      const strength = opts.lineStrength / 100;
      const { width: w, height: h } = img;

      // 1. Compute grayscale luma
      const lumaData = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) {
        const o = i * 4;
        lumaData[i] = 0.299 * img.data[o] + 0.587 * img.data[o + 1] + 0.114 * img.data[o + 2];
      }

      // 2. Draw light paper pencil shading & cross-hatching
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          const o = i * 4;
          const luma = lumaData[i];
          const shadingFactor = 0.75 + (luma / 255) * 0.25;
          let pencilVal = 255 * shadingFactor;

          if (opts.hatching) {
            const normL = luma / 255;
            if (normL < 0.65) {
              if ((x + y) % 6 === 0) pencilVal *= 0.75;
            }
            if (normL < 0.45) {
              if ((x - y) % 6 === 0) pencilVal *= 0.75;
            }
            if (normL < 0.25) {
              if (x % 6 === 0) pencilVal *= 0.75;
            }
          }

          img.data[o] = Math.min(255, Math.max(0, pencilVal));
          img.data[o + 1] = Math.min(255, Math.max(0, pencilVal));
          img.data[o + 2] = Math.min(255, Math.max(0, pencilVal));
        }
      }

      // 3. Apply edge outlines
      for (let i = 0; i < w * h; i++) {
        const e = edges[i];
        if (e > thr) {
          const ink = Math.min(1, (e - thr) * strength * 4);
          const o = i * 4;
          img.data[o] = Math.max(0, img.data[o] * (1 - ink));
          img.data[o + 1] = Math.max(0, img.data[o + 1] * (1 - ink));
          img.data[o + 2] = Math.max(0, img.data[o + 2] * (1 - ink));
        }
      }
      break;
    }
    default:
      break;
  }

  // Shared outline/ink post-stage
  if (opts.outlineEnabled) {
    const edges = sobelEdges(img);
    const [or, og, ob] = hexToRgb(opts.outlineColor);
    const t = opts.outlineThickness; // 1..4 → threshold scaling
    const thr = 0.5 / t;
    for (let i = 0; i < edges.length; i++) {
      if (edges[i] > thr) {
        const o = i * 4;
        img.data[o] = or; img.data[o + 1] = og; img.data[o + 2] = ob;
      }
    }
  }

  return fromImageData(img);
}

// --- Lighting bake --------------------------------------------------------

export async function bakeLighting(
  stylizedAlbedo: ImageBitmap,
  ao: ImageBitmap | undefined,
  height: ImageBitmap | undefined,
  opts: StylizerOptions,
): Promise<ImageBitmap> {
  const img = toImageData(stylizedAlbedo);
  const strength = opts.bakeStrength / 100;
  // AO/height maps may be full-resolution while the styled albedo was downscaled
  // for preview; resample them to the styled dimensions so all arrays align.
  const { width: bw, height: bh } = stylizedAlbedo;

  if (opts.bakeAO && ao) {
    const aoData = toImageDataScaled(ao, bw, bh).data;
    for (let i = 0; i < img.data.length; i += 4) {
      const occ = aoData[i] / 255; // AO stored in R (grayscale)
      const factor = 1 - (1 - occ) * strength;
      img.data[i] *= factor;
      img.data[i + 1] *= factor;
      img.data[i + 2] *= factor;
    }
  }

  if (opts.bakeShading && height) {
    // Soft top-down light: brighten where height slope faces up.
    const hd = toImageDataScaled(height, bw, bh);
    for (let y = 1; y < bh - 1; y++) {
      for (let x = 0; x < bw; x++) {
        const i = y * bw + x;
        const up = hd.data[((y - 1) * bw + x) * 4];
        const down = hd.data[((y + 1) * bw + x) * 4];
        const slope = (up - down) / 255; // -1..1
        const light = 1 + slope * strength * 0.5;
        const o = i * 4;
        img.data[o] *= light;
        img.data[o + 1] *= light;
        img.data[o + 2] *= light;
      }
    }
  }

  return fromImageData(img);
}

// --- Map regeneration -----------------------------------------------------

export async function regenerateNormal(
  albedo: ImageBitmap,
  strength: number,
): Promise<ImageBitmap> {
  const src = toImageData(albedo);
  const { width: w, height: h } = src;
  // Directional gradients for normal:
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    lum[i] = (0.299 * src.data[i * 4] + 0.587 * src.data[i * 4 + 1] + 0.114 * src.data[i * 4 + 2]) / 255;
  }
  const out = new ImageData(w, h);
  const s = (strength / 100) * 4;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const xl = lum[y * w + Math.max(0, x - 1)];
      const xr = lum[y * w + Math.min(w - 1, x + 1)];
      const yu = lum[Math.max(0, y - 1) * w + x];
      const yd = lum[Math.min(h - 1, y + 1) * w + x];
      const dx = (xl - xr) * s;
      const dy = (yu - yd) * s;
      const len = Math.sqrt(dx * dx + dy * dy + 1);
      const o = i * 4;
      out.data[o] = ((dx / len) * 0.5 + 0.5) * 255;
      out.data[o + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      out.data[o + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      out.data[o + 3] = 255;
    }
  }
  return fromImageData(out);
}

export async function regenerateHeight(albedo: ImageBitmap): Promise<ImageBitmap> {
  let img = toImageData(albedo);
  img = boxBlur(img, 1);
  const out = new ImageData(img.width, img.height);
  for (let i = 0; i < img.data.length; i += 4) {
    const luma = 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
    out.data[i] = luma; out.data[i + 1] = luma; out.data[i + 2] = luma; out.data[i + 3] = 255;
  }
  return fromImageData(out);
}

export async function flattenMap(map: ImageBitmap, levels: number): Promise<ImageBitmap> {
  const img = toImageData(map);
  posterize(img.data, levels);
  return fromImageData(img);
}
