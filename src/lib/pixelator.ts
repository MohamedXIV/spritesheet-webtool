/**
 * pixelator.ts - High-performance browser-based pixelation, retro dithering,
 * and palette quantization engine.
 */

export interface PixelatorOptions {
  enabled: boolean;
  pixelSize: number; // 1 to 32
  palette: 'none' | 'gameboy' | 'nes' | 'pico8' | 'c64' | 'gameboy-color' | 'custom';
  customPaletteColors?: string[]; // hex colors for custom palette
  ditherType: 'none' | 'white-noise' | 'blue-noise' | 'bayer2x2' | 'bayer4x4' | 'bayer8x8' | 'pattern' | 'floyd-steinberg';
  ditherAmount: number; // 0 to 100 (percentage of error/dither to apply)
  pixelShape: 'square' | 'circle' | 'diamond';
  outlineEnabled: boolean;
  outlineColor: string;
  outlineThickness: number; // in pixels
  contrast: number; // -100 to 100
  saturation: number; // -100 to 100
  brightness: number; // -100 to 100

  // Advanced Quantization Settings
  quantizationType?: 'none' | 'custom' | 'per-channel' | 'lut';
  quantizeUsePixelated?: boolean;
  quantizeQuality?: number; // 1 to 8 (1 = highest, 8 = fastest subsampling)
  quantizeNumColors?: number; // 8 to 256
  quantizeGamma?: number; // 0.5 to 2.0
  quantizeForceColors?: 'none' | 'black-white' | 'nes-anchors';
  quantizeUseRangeAdaptive?: boolean;
  quantizeColorsPerChannel?: number; // 2 to 256
  quantizeLUTPreset?: 'none' | 'amiga-12bit' | 'sega-md' | 'psx-15bit' | 'pc98';
}

export const DEFAULT_PIXELATOR_OPTIONS: PixelatorOptions = {
  enabled: true,
  pixelSize: 8,
  palette: 'none',
  ditherType: 'none',
  ditherAmount: 50,
  pixelShape: 'square',
  outlineEnabled: false,
  outlineColor: '#000000',
  outlineThickness: 1,
  contrast: 0,
  saturation: 0,
  brightness: 0,

  // Advanced Quantization defaults
  quantizationType: 'none',
  quantizeUsePixelated: false,
  quantizeQuality: 2,
  quantizeNumColors: 32,
  quantizeGamma: 1.0,
  quantizeForceColors: 'none',
  quantizeUseRangeAdaptive: false,
  quantizeColorsPerChannel: 256,
  quantizeLUTPreset: 'none',
};

// Preset RGB Palettes
const PALETTES: Record<string, number[][]> = {
  gameboy: [
    [15, 56, 15],     // Darkest green
    [48, 98, 48],     // Dark green
    [139, 172, 15],   // Light green
    [155, 188, 15],   // Lightest green
  ],
  pico8: [
    [0, 0, 0], [29, 43, 83], [126, 37, 83], [0, 135, 81],
    [171, 82, 54], [95, 87, 79], [194, 195, 199], [255, 241, 232],
    [255, 0, 77], [255, 163, 0], [255, 236, 39], [0, 228, 54],
    [41, 173, 255], [131, 118, 156], [255, 119, 168], [255, 204, 170]
  ],
  c64: [
    [0, 0, 0], [255, 255, 255], [136, 0, 0], [170, 255, 238],
    [204, 68, 204], [0, 204, 85], [0, 0, 170], [238, 238, 119],
    [221, 136, 85], [102, 68, 0], [255, 119, 119], [51, 51, 51],
    [119, 119, 119], [170, 255, 102], [0, 136, 255], [187, 187, 187]
  ],
  nes: [
    [124, 124, 124], [0, 0, 252], [0, 0, 188], [68, 40, 188],
    [148, 0, 132], [168, 0, 32], [168, 16, 0], [136, 20, 0],
    [80, 48, 0], [0, 120, 0], [0, 104, 0], [0, 88, 0],
    [0, 64, 88], [0, 0, 0], [0, 0, 0], [0, 0, 0],
    [188, 188, 188], [0, 120, 248], [0, 88, 248], [104, 68, 252],
    [216, 0, 204], [228, 0, 88], [248, 56, 0], [228, 92, 16],
    [172, 124, 0], [0, 184, 0], [0, 168, 0], [0, 168, 68],
    [0, 136, 136], [248, 248, 248], [60, 188, 252], [104, 136, 252],
    [152, 120, 248], [248, 120, 248], [248, 88, 152], [248, 120, 88],
    [252, 160, 68], [248, 184, 0], [184, 248, 248], [88, 216, 84],
    [88, 248, 152], [0, 232, 216], [120, 120, 120]
  ],
  'gameboy-color': [
    [0, 0, 0], [8, 24, 32], [16, 48, 64], [24, 72, 96],
    [32, 96, 128], [48, 112, 144], [64, 128, 160], [96, 160, 192],
    [128, 192, 224], [160, 224, 240], [200, 240, 248], [255, 255, 255],
    [160, 0, 0], [224, 32, 32], [248, 96, 96], [255, 160, 160],
    [0, 128, 0], [32, 192, 32], [96, 224, 96], [160, 255, 160],
    [0, 0, 160], [32, 32, 224], [96, 96, 248], [160, 160, 255]
  ]
};

// Bayer & Ordered Matrices
const BAYER_2X2 = [
  [0, 2],
  [3, 1]
];

const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5]
];

const BAYER_8X8 = [
  [0, 48, 12, 60, 3, 51, 15, 63],
  [32, 16, 44, 28, 35, 19, 47, 31],
  [8, 56, 4, 52, 11, 59, 7, 55],
  [40, 24, 48, 20, 43, 27, 51, 23],
  [2, 50, 14, 62, 1, 49, 13, 61],
  [34, 18, 46, 30, 33, 17, 45, 29],
  [10, 58, 6, 54, 9, 57, 5, 53],
  [42, 26, 50, 22, 41, 25, 49, 21]
];

const BLUE_NOISE_16X16 = [
  [  0, 161,  46, 216,  12, 188,  34, 203,  23, 176,  59, 237,   4, 167,  52, 228],
  [128,  78, 251, 114, 150,  92, 243, 122, 137,  71, 247, 102, 144,  84, 255, 110],
  [ 38, 192,  17, 172,  56, 231,   8, 164,  49, 211,  28, 184,  62, 222,  19, 179],
  [240, 106, 141,  81, 254, 119, 134,  96, 250, 113, 153,  89, 245, 125, 131,  74],
  [ 15, 182,  50, 225,  25, 200,  41, 175,  57, 234,  11, 169,  44, 207,  31, 196],
  [147,  87, 246, 126, 133,  69, 249, 105, 143,  80, 252, 116, 155,  94, 242, 121],
  [ 60, 239,   5, 166,  54, 219,  20, 186,  36, 213,  22, 180,  63, 230,   2, 162],
  [139,  72, 248, 103, 157,  90, 244, 112, 149,  97, 253, 118, 135,  76, 250, 101],
  [ 27, 209,  42, 191,  29, 177,  61, 227,  13, 170,  48, 224,  26, 193,  45, 215],
  [253, 115, 152,  88, 241, 123, 132,  75, 255, 109, 145,  83, 238, 127, 138,  85],
  [ 10, 168,  58, 233,   3, 163,  51, 214,  32, 198,  60, 236,  16, 173,  53, 220],
  [142,  82, 251, 107, 146,  93, 247, 120, 136,  70, 249,  99, 151,  91, 240, 111],
  [ 55, 226,  24, 183,  39, 210,  18, 178,  57, 232,   7, 165,  40, 205,  33, 187],
  [130,  95, 245, 117, 154,  79, 252, 100, 148,  86, 243, 124, 133,  77, 254, 104],
  [ 47, 202,  35, 195,  63, 229,  14, 171,  43, 217,  30, 190,  61, 223,  21, 174],
  [236, 121, 140,  73, 250, 108, 139,  92, 239, 114, 156,  82, 248, 106, 146,  98]
];

const PATTERN_CHECKER = [
  [0, 128, 0, 128],
  [128, 0, 128, 0],
  [0, 128, 0, 128],
  [128, 0, 128, 0]
];

// Helper to convert Hex to RGB
export function hexToRgb(hex: string): number[] {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return [isNaN(r) ? 0 : r, isNaN(g) ? 0 : g, isNaN(b) ? 0 : b];
}

// Find closest color in palette
function findClosestColor(r: number, g: number, b: number, palette: number[][]): number[] {
  let minDistance = Infinity;
  let closest = palette[0] || [0, 0, 0];

  for (const color of palette) {
    // Using euclidean distance weighted by human visual perception (redmean formula)
    const rMean = (r + color[0]) / 2;
    const dr = r - color[0];
    const dg = g - color[1];
    const db = b - color[2];
    const distance = (2 + rMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rMean) / 256) * db * db;

    if (distance < minDistance) {
      minDistance = distance;
      closest = color;
    }
  }

  return closest;
}

/**
 * Apply contrast, saturation and brightness to an RGB pixel
 */
function adjustColor(r: number, g: number, b: number, contrast: number, saturation: number, brightness: number): number[] {
  // 1. Brightness (-100 to 100 -> -255 to 255)
  const bFactor = (brightness / 100) * 255;
  r += bFactor;
  g += bFactor;
  b += bFactor;

  // 2. Contrast (-100 to 100 -> factor 0 to 3)
  const cFactor = contrast >= 0 
    ? 1 + (contrast / 100) * 2 
    : 1 + (contrast / 100);
  r = (r - 128) * cFactor + 128;
  g = (g - 128) * cFactor + 128;
  b = (b - 128) * cFactor + 128;

  // 3. Saturation (-100 to 100 -> factor 0 to 2)
  const sFactor = saturation >= 0
    ? 1 + (saturation / 100) * 2
    : 1 + (saturation / 100);
  const gray = 0.2989 * r + 0.5870 * g + 0.1140 * b;
  r = gray + (r - gray) * sFactor;
  g = gray + (g - gray) * sFactor;
  b = gray + (b - gray) * sFactor;

  // Clamp values
  return [
    Math.max(0, Math.min(255, Math.round(r))),
    Math.max(0, Math.min(255, Math.round(g))),
    Math.max(0, Math.min(255, Math.round(b)))
  ];
}

/**
 * Pixelates an ImageBitmap and returns a new ImageBitmap with the processed pixel art effect.
 */
// Helper to generate a custom palette dynamically using Median Cut with Gamma weighting
interface ColorBucket {
  colors: number[][];
  minR: number; maxR: number;
  minG: number; maxG: number;
  minB: number; maxB: number;
}

function getBucketRanges(bucket: ColorBucket) {
  let minR = 255, maxR = 0;
  let minG = 255, maxG = 0;
  let minB = 255, maxB = 0;
  for (const c of bucket.colors) {
    if (c[0] < minR) minR = c[0];
    if (c[0] > maxR) maxR = c[0];
    if (c[1] < minG) minG = c[1];
    if (c[1] > maxG) maxG = c[1];
    if (c[2] < minB) minB = c[2];
    if (c[2] > maxB) maxB = c[2];
  }
  bucket.minR = minR; bucket.maxR = maxR;
  bucket.minG = minG; bucket.maxG = maxG;
  bucket.minB = minB; bucket.maxB = maxB;
}

export function generateCustomPalette(
  pixels: Uint8ClampedArray,
  numColors: number,
  subsampling: number,
  gamma: number,
  forceColors: 'none' | 'black-white' | 'nes-anchors'
): number[][] {
  const colorSet = new Set<number>();
  const uniqueColors: number[][] = [];
  
  for (let i = 0; i < pixels.length; i += 4 * subsampling) {
    if (pixels[i + 3] < 128) continue;
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const rgbKey = (r << 16) | (g << 8) | b;
    if (!colorSet.has(rgbKey)) {
      colorSet.add(rgbKey);
      uniqueColors.push([r, g, b]);
    }
  }
  
  if (uniqueColors.length <= numColors) {
    return uniqueColors.length > 0 ? uniqueColors : [[0, 0, 0], [255, 255, 255]];
  }
  
  const initialBucket: ColorBucket = {
    colors: uniqueColors,
    minR: 0, maxR: 255,
    minG: 0, maxG: 255,
    minB: 0, maxB: 255
  };
  getBucketRanges(initialBucket);
  
  const buckets: ColorBucket[] = [initialBucket];
  
  while (buckets.length < numColors) {
    let largestRange = -1;
    let splitIndex = -1;
    let splitChannel: 'r' | 'g' | 'b' = 'r';
    
    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i];
      if (b.colors.length < 2) continue;
      
      const rRange = (b.maxR - b.minR) * 0.299;
      const gRange = (b.maxG - b.minG) * 0.587;
      const bRange = (b.maxB - b.minB) * 0.114;
      
      const maxChannelRange = Math.max(rRange, gRange, bRange);
      if (maxChannelRange > largestRange) {
        largestRange = maxChannelRange;
        splitIndex = i;
        if (maxChannelRange === rRange) splitChannel = 'r';
        else if (maxChannelRange === gRange) splitChannel = 'g';
        else splitChannel = 'b';
      }
    }
    
    if (splitIndex === -1) break;
    
    const bucketToSplit = buckets.splice(splitIndex, 1)[0];
    const channelIdx = splitChannel === 'r' ? 0 : splitChannel === 'g' ? 1 : 2;
    bucketToSplit.colors.sort((a, b) => a[channelIdx] - b[channelIdx]);
    
    const medianIdx = Math.floor(bucketToSplit.colors.length / 2);
    const part1 = bucketToSplit.colors.slice(0, medianIdx);
    const part2 = bucketToSplit.colors.slice(medianIdx);
    
    const b1: ColorBucket = { colors: part1, minR: 0, maxR: 0, minG: 0, maxG: 0, minB: 0, maxB: 0 };
    const b2: ColorBucket = { colors: part2, minR: 0, maxR: 0, minG: 0, maxG: 0, minB: 0, maxB: 0 };
    getBucketRanges(b1);
    getBucketRanges(b2);
    buckets.push(b1, b2);
  }
  
  let palette: number[][] = buckets.map(b => {
    let sumR = 0, sumG = 0, sumB = 0;
    let totalWeight = 0;
    
    for (const c of b.colors) {
      const luminance = (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
      const weight = Math.pow(1 - luminance, gamma - 1) || 1;
      sumR += c[0] * weight;
      sumG += c[1] * weight;
      sumB += c[2] * weight;
      totalWeight += weight;
    }
    
    if (totalWeight === 0) totalWeight = b.colors.length;
    
    return [
      Math.max(0, Math.min(255, Math.round(sumR / totalWeight))),
      Math.max(0, Math.min(255, Math.round(sumG / totalWeight))),
      Math.max(0, Math.min(255, Math.round(sumB / totalWeight)))
    ];
  });
  
  if (forceColors === 'black-white') {
    palette[0] = [0, 0, 0];
    if (palette.length > 1) palette[palette.length - 1] = [255, 255, 255];
  } else if (forceColors === 'nes-anchors') {
    palette[0] = [0, 0, 0];
    if (palette.length > 1) palette[1] = [255, 255, 255];
    if (palette.length > 2) palette[2] = [128, 128, 128];
  }
  
  return palette;
}

// Calculate ordered threshold patterns for noise injection
function getDitherOffset(
  x: number,
  y: number,
  ditherType: string,
  dAmount: number,
  stepSize: number = 64
): number {
  if (ditherType === 'none') return 0;
  
  let threshold = 0.5;
  if (ditherType === 'white-noise') {
    threshold = Math.random();
  } else if (ditherType === 'blue-noise') {
    threshold = BLUE_NOISE_16X16[y % 16][x % 16] / 255;
  } else if (ditherType === 'bayer2x2') {
    threshold = BAYER_2X2[y % 2][x % 2] / 4;
  } else if (ditherType === 'bayer4x4') {
    threshold = BAYER_4X4[y % 4][x % 4] / 16;
  } else if (ditherType === 'bayer8x8') {
    threshold = BAYER_8X8[y % 8][x % 8] / 64;
  } else if (ditherType === 'pattern') {
    threshold = PATTERN_CHECKER[y % 4][x % 4] / 255;
  }
  
  return (threshold - 0.5) * stepSize * dAmount;
}

// Quantizes a single RGB color based on options
function quantizePixel(
  r: number,
  g: number,
  b: number,
  quantizationType: 'none' | 'custom' | 'per-channel' | 'lut',
  palettePreset: string,
  activePalette: number[][] | null,
  quantizeLUTPreset: string,
  quantizeColorsPerChannel: number,
  quantizeUseRangeAdaptive: boolean,
  minR: number, maxR: number,
  minG: number, maxG: number,
  minB: number, maxB: number
): number[] {
  if (quantizationType === 'lut') {
    if (quantizeLUTPreset === 'amiga-12bit' || quantizeLUTPreset === 'pc98') {
      return [
        Math.max(0, Math.min(255, Math.round(r / 17) * 17)),
        Math.max(0, Math.min(255, Math.round(g / 17) * 17)),
        Math.max(0, Math.min(255, Math.round(b / 17) * 17))
      ];
    } else if (quantizeLUTPreset === 'sega-md') {
      return [
        Math.max(0, Math.min(255, Math.round(r / 36.42) * 36)),
        Math.max(0, Math.min(255, Math.round(g / 36.42) * 36)),
        Math.max(0, Math.min(255, Math.round(b / 36.42) * 36))
      ];
    } else if (quantizeLUTPreset === 'psx-15bit') {
      return [
        Math.max(0, Math.min(255, Math.round(r / 8.22) * 8)),
        Math.max(0, Math.min(255, Math.round(g / 8.22) * 8)),
        Math.max(0, Math.min(255, Math.round(b / 8.22) * 8))
      ];
    }
  }
  
  if (quantizationType === 'per-channel') {
    const steps = quantizeColorsPerChannel;
    if (quantizeUseRangeAdaptive) {
      const stepR = (maxR - minR) / (steps - 1);
      const stepG = (maxG - minG) / (steps - 1);
      const stepB = (maxB - minB) / (steps - 1);
      return [
        Math.max(0, Math.min(255, minR + Math.round((r - minR) / (stepR || 1)) * stepR)),
        Math.max(0, Math.min(255, minG + Math.round((g - minG) / (stepG || 1)) * stepG)),
        Math.max(0, Math.min(255, minB + Math.round((b - minB) / (stepB || 1)) * stepB))
      ];
    } else {
      const step = 255 / (steps - 1);
      return [
        Math.max(0, Math.min(255, Math.round(r / step) * step)),
        Math.max(0, Math.min(255, Math.round(g / step) * step)),
        Math.max(0, Math.min(255, Math.round(b / step) * step))
      ];
    }
  }
  
  if (activePalette) {
    return findClosestColor(r, g, b, activePalette);
  }
  
  return [
    Math.max(0, Math.min(255, Math.round(r))),
    Math.max(0, Math.min(255, Math.round(g))),
    Math.max(0, Math.min(255, Math.round(b)))
  ];
}

export async function pixelateImage(bitmap: ImageBitmap, options: PixelatorOptions): Promise<ImageBitmap> {
  const {
    pixelSize,
    palette: palettePreset,
    customPaletteColors,
    ditherType,
    ditherAmount,
    pixelShape,
    outlineEnabled,
    outlineColor,
    outlineThickness,
    contrast,
    saturation,
    brightness
  } = options;

  // Resolve advanced parameters with default fallbacks for backwards compatibility
  const quantizationType = options.quantizationType || 'none';
  const quantizeUsePixelated = options.quantizeUsePixelated !== undefined ? options.quantizeUsePixelated : false;
  const quantizeQuality = options.quantizeQuality || 2;
  const quantizeNumColors = options.quantizeNumColors || 32;
  const quantizeGamma = options.quantizeGamma !== undefined ? options.quantizeGamma : 1.0;
  const quantizeForceColors = options.quantizeForceColors || 'none';
  const quantizeUseRangeAdaptive = options.quantizeUseRangeAdaptive !== undefined ? options.quantizeUseRangeAdaptive : false;
  const quantizeColorsPerChannel = options.quantizeColorsPerChannel || 256;
  const quantizeLUTPreset = options.quantizeLUTPreset || 'none';

  if (bitmap.width === 0 || bitmap.height === 0) {
    return bitmap;
  }

  // Create workspace canvas
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return bitmap;

  // Draw original image
  ctx.drawImage(bitmap, 0, 0);

  // Determine low-res grid size
  const scale = 1 / pixelSize;
  const smallWidth = Math.max(1, Math.floor(bitmap.width * scale));
  const smallHeight = Math.max(1, Math.floor(bitmap.height * scale));

  // 1. Create a downscaled canvas
  const smallCanvas = document.createElement('canvas');
  smallCanvas.width = smallWidth;
  smallCanvas.height = smallHeight;
  const smallCtx = smallCanvas.getContext('2d', { willReadFrequently: true });
  if (!smallCtx) return bitmap;

  smallCtx.imageSmoothingEnabled = false;
  smallCtx.drawImage(canvas, 0, 0, smallWidth, smallHeight);

  // Get downscaled pixel data
  const imgData = smallCtx.getImageData(0, 0, smallWidth, smallHeight);
  const data = imgData.data;

  // Determine active palette preset if needed
  let activePalette: number[][] | null = null;
  if (quantizationType === 'none' && palettePreset !== 'none') {
    if (palettePreset === 'custom' && customPaletteColors && customPaletteColors.length > 0) {
      activePalette = customPaletteColors.map(hexToRgb);
    } else if (PALETTES[palettePreset]) {
      activePalette = PALETTES[palettePreset];
    }
  }

  // Handle advanced custom palette extraction
  if (quantizationType === 'custom') {
    let sourcePixels: Uint8ClampedArray;
    if (quantizeUsePixelated) {
      sourcePixels = data;
    } else {
      const origData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      sourcePixels = origData.data;
    }
    activePalette = generateCustomPalette(
      sourcePixels,
      quantizeNumColors,
      quantizeQuality,
      quantizeGamma,
      quantizeForceColors
    );
  }

  // Handle range adaptive boundaries if per-channel adaptive is active
  let minR = 255, maxR = 0;
  let minG = 255, maxG = 0;
  let minB = 255, maxB = 0;
  if (quantizationType === 'per-channel' && quantizeUseRangeAdaptive) {
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      const r = data[i]; const g = data[i + 1]; const b = data[i + 2];
      if (r < minR) minR = r; if (r > maxR) maxR = r;
      if (g < minG) minG = g; if (g > maxG) maxG = g;
      if (b < minB) minB = b; if (b > maxB) maxB = b;
    }
    if (minR === maxR) { minR = 0; maxR = 255; }
    if (minG === maxG) { minG = 0; maxG = 255; }
    if (minB === maxB) { minB = 0; maxB = 255; }
  }

  // Determine dither step size based on mode
  let ditherStep = 64;
  if (quantizationType === 'per-channel') {
    ditherStep = 255 / (quantizeColorsPerChannel - 1);
  } else if (quantizationType === 'lut') {
    if (quantizeLUTPreset === 'sega-md') ditherStep = 36;
    else if (quantizeLUTPreset === 'psx-15bit') ditherStep = 8;
    else ditherStep = 17; // Amiga 12bit / pc98
  } else if (quantizationType === 'none' && (palettePreset === 'none' || palettePreset === undefined)) {
    ditherStep = 16; // True color dithering step size to make noise visible on gradients
  }

  const dAmount = ditherAmount / 100;
  const adjustContrastSat = contrast !== 0 || saturation !== 0 || brightness !== 0;

  // Check if color mapping, quantization, or dithering is active
  const isQuantizing = quantizationType !== 'none' || activePalette !== null || ditherType !== 'none';

  if (isQuantizing) {
    if (ditherType !== 'none' && ditherType !== 'floyd-steinberg') {
      // Ordered grid-based dithering
      for (let y = 0; y < smallHeight; y++) {
        for (let x = 0; x < smallWidth; x++) {
          const idx = (y * smallWidth + x) * 4;
          if (data[idx + 3] === 0) continue;

          let r = data[idx];
          let g = data[idx + 1];
          let b = data[idx + 2];

          if (adjustContrastSat) {
            [r, g, b] = adjustColor(r, g, b, contrast, saturation, brightness);
          }

          const offset = getDitherOffset(x, y, ditherType, dAmount, ditherStep);
          const dr = Math.max(0, Math.min(255, r + offset));
          const dg = Math.max(0, Math.min(255, g + offset));
          const db = Math.max(0, Math.min(255, b + offset));

          const quantized = quantizePixel(
            dr, dg, db,
            quantizationType, palettePreset, activePalette, quantizeLUTPreset,
            quantizeColorsPerChannel, quantizeUseRangeAdaptive,
            minR, maxR, minG, maxG, minB, maxB
          );

          data[idx] = quantized[0];
          data[idx + 1] = quantized[1];
          data[idx + 2] = quantized[2];
        }
      }
    } else if (ditherType === 'floyd-steinberg') {
      // Floyd-Steinberg error diffusion
      const rBuffer = new Float32Array(smallWidth * smallHeight);
      const gBuffer = new Float32Array(smallWidth * smallHeight);
      const bBuffer = new Float32Array(smallWidth * smallHeight);

      for (let i = 0; i < smallWidth * smallHeight; i++) {
        rBuffer[i] = data[i * 4];
        gBuffer[i] = data[i * 4 + 1];
        bBuffer[i] = data[i * 4 + 2];
      }

      for (let y = 0; y < smallHeight; y++) {
        for (let x = 0; x < smallWidth; x++) {
          const idx = y * smallWidth + x;
          const dataIdx = idx * 4;
          if (data[dataIdx + 3] === 0) continue;

          let r = rBuffer[idx];
          let g = gBuffer[idx];
          let b = bBuffer[idx];

          if (adjustContrastSat) {
            [r, g, b] = adjustColor(r, g, b, contrast, saturation, brightness);
          }

          const quantized = quantizePixel(
            r, g, b,
            quantizationType, palettePreset, activePalette, quantizeLUTPreset,
            quantizeColorsPerChannel, quantizeUseRangeAdaptive,
            minR, maxR, minG, maxG, minB, maxB
          );

          data[dataIdx] = quantized[0];
          data[dataIdx + 1] = quantized[1];
          data[dataIdx + 2] = quantized[2];

          const errR = (r - quantized[0]) * dAmount;
          const errG = (g - quantized[1]) * dAmount;
          const errB = (b - quantized[2]) * dAmount;

          if (x + 1 < smallWidth) {
            const nIdx = idx + 1;
            rBuffer[nIdx] += errR * (7 / 16);
            gBuffer[nIdx] += errG * (7 / 16);
            bBuffer[nIdx] += errB * (7 / 16);
          }
          if (x > 0 && y + 1 < smallHeight) {
            const nIdx = idx + smallWidth - 1;
            rBuffer[nIdx] += errR * (3 / 16);
            gBuffer[nIdx] += errG * (3 / 16);
            bBuffer[nIdx] += errB * (3 / 16);
          }
          if (y + 1 < smallHeight) {
            const nIdx = idx + smallWidth;
            rBuffer[nIdx] += errR * (5 / 16);
            gBuffer[nIdx] += errG * (5 / 16);
            bBuffer[nIdx] += errB * (5 / 16);
          }
          if (x + 1 < smallWidth && y + 1 < smallHeight) {
            const nIdx = idx + smallWidth + 1;
            rBuffer[nIdx] += errR * (1 / 16);
            gBuffer[nIdx] += errG * (1 / 16);
            bBuffer[nIdx] += errB * (1 / 16);
          }
        }
      }
    } else {
      // Direct quantization mapping without dithering
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] === 0) continue;

        let r = data[i];
        let g = data[i + 1];
        let b = data[i + 2];

        if (adjustContrastSat) {
          [r, g, b] = adjustColor(r, g, b, contrast, saturation, brightness);
        }

        const quantized = quantizePixel(
          r, g, b,
          quantizationType, palettePreset, activePalette, quantizeLUTPreset,
          quantizeColorsPerChannel, quantizeUseRangeAdaptive,
          minR, maxR, minG, maxG, minB, maxB
        );

        data[i] = quantized[0];
        data[i + 1] = quantized[1];
        data[i + 2] = quantized[2];
      }
    }
  } else if (adjustContrastSat) {
    // Just color adjustments (no quantization)
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      const adjusted = adjustColor(data[i], data[i + 1], data[i + 2], contrast, saturation, brightness);
      data[i] = adjusted[0];
      data[i + 1] = adjusted[1];
      data[i + 2] = adjusted[2];
    }
  }

  // Put processed pixel data back to the small canvas
  smallCtx.putImageData(imgData, 0, 0);

  // 4. Render upscaled canvas with correct pixel shape
  ctx.clearRect(0, 0, bitmap.width, bitmap.height);
  ctx.imageSmoothingEnabled = false;

  if (pixelShape === 'square') {
    // Direct upscale drawing
    ctx.drawImage(smallCanvas, 0, 0, bitmap.width, bitmap.height);
  } else {
    // Loop through small canvas pixels and draw shapes
    const processedData = smallCtx.getImageData(0, 0, smallWidth, smallHeight).data;
    
    for (let y = 0; y < smallHeight; y++) {
      for (let x = 0; x < smallWidth; x++) {
        const idx = (y * smallWidth + x) * 4;
        const a = processedData[idx + 3];
        if (a === 0) continue;

        const r = processedData[idx];
        const g = processedData[idx + 1];
        const b = processedData[idx + 2];
        ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`;

        const drawX = x * pixelSize;
        const drawY = y * pixelSize;

        if (pixelShape === 'circle') {
          ctx.beginPath();
          ctx.arc(
            drawX + pixelSize / 2,
            drawY + pixelSize / 2,
            pixelSize / 2 - 0.2, // Small margin to prevent bleed
            0,
            Math.PI * 2
          );
          ctx.fill();
        } else if (pixelShape === 'diamond') {
          ctx.beginPath();
          ctx.moveTo(drawX + pixelSize / 2, drawY);
          ctx.lineTo(drawX + pixelSize, drawY + pixelSize / 2);
          ctx.lineTo(drawX + pixelSize / 2, drawY + pixelSize);
          ctx.lineTo(drawX, drawY + pixelSize / 2);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }

  // 5. Restoring/Adding Sharp Silhouette Outline
  if (outlineEnabled && outlineThickness > 0) {
    const outlineColorRgb = hexToRgb(outlineColor);
    const largeData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    const lPixels = largeData.data;
    const outlineOverlay = new Uint8Array(bitmap.width * bitmap.height);

    const checkBorder = (px: number, py: number) => {
      // Loop around neighborhood based on thickness
      for (let dy = -outlineThickness; dy <= outlineThickness; dy++) {
        for (let dx = -outlineThickness; dx <= outlineThickness; dx++) {
          if (dx * dx + dy * dy > outlineThickness * outlineThickness) continue;
          
          const nx = px + dx;
          const ny = py + dy;
          if (nx >= 0 && nx < bitmap.width && ny >= 0 && ny < bitmap.height) {
            const nIdx = (ny * bitmap.width + nx) * 4;
            if (lPixels[nIdx + 3] > 10) { // Found solid neighbor
              return true;
            }
          }
        }
      }
      return false;
    };

    // Draw outline
    for (let y = 0; y < bitmap.height; y++) {
      for (let x = 0; x < bitmap.width; x++) {
        const idx = (y * bitmap.width + x) * 4;
        if (lPixels[idx + 3] <= 10) { // Empty pixel
          if (checkBorder(x, y)) {
            outlineOverlay[y * bitmap.width + x] = 1;
          }
        }
      }
    }

    // Apply overlay back to pixel array
    for (let i = 0; i < outlineOverlay.length; i++) {
      if (outlineOverlay[i] === 1) {
        const idx = i * 4;
        lPixels[idx] = outlineColorRgb[0];
        lPixels[idx + 1] = outlineColorRgb[1];
        lPixels[idx + 2] = outlineColorRgb[2];
        lPixels[idx + 3] = 255;
      }
    }

    ctx.putImageData(largeData, 0, 0);
  }

  // Generate output ImageBitmap
  return await createImageBitmap(canvas);
}
