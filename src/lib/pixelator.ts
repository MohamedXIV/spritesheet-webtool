/**
 * pixelator.ts - High-performance browser-based pixelation, retro dithering,
 * and palette quantization engine.
 */

export interface PixelatorOptions {
  enabled: boolean;
  pixelSize: number; // 1 to 32
  palette: 'none' | 'gameboy' | 'nes' | 'pico8' | 'c64' | 'gameboy-color' | 'custom';
  customPaletteColors?: string[]; // hex colors for custom palette
  ditherType: 'none' | 'bayer4x4' | 'bayer8x8' | 'floyd-steinberg';
  ditherAmount: number; // 0 to 100 (percentage of error/dither to apply)
  pixelShape: 'square' | 'circle' | 'diamond';
  outlineEnabled: boolean;
  outlineColor: string;
  outlineThickness: number; // in pixels
  contrast: number; // -100 to 100
  saturation: number; // -100 to 100
  brightness: number; // -100 to 100
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

// Bayer matrices
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

  // Draw image downscaled
  smallCtx.imageSmoothingEnabled = false;
  smallCtx.drawImage(canvas, 0, 0, smallWidth, smallHeight);

  // Get downscaled pixel data
  const imgData = smallCtx.getImageData(0, 0, smallWidth, smallHeight);
  const data = imgData.data;

  // 2. Select retro palette
  let activePalette: number[][] | null = null;
  if (palettePreset === 'custom' && customPaletteColors && customPaletteColors.length > 0) {
    activePalette = customPaletteColors.map(hexToRgb);
  } else if (palettePreset !== 'none' && PALETTES[palettePreset]) {
    activePalette = PALETTES[palettePreset];
  }

  // 3. Process Pixels (Palette Mapping & Dithering)
  const adjustContrastSat = contrast !== 0 || saturation !== 0 || brightness !== 0;

  if (activePalette) {
    const dAmount = ditherAmount / 100;
    
    if (ditherType === 'bayer4x4' || ditherType === 'bayer8x8') {
      const matrix = ditherType === 'bayer4x4' ? BAYER_4X4 : BAYER_8X8;
      const matrixSize = ditherType === 'bayer4x4' ? 4 : 8;
      const maxVal = matrixSize * matrixSize;

      for (let y = 0; y < smallHeight; y++) {
        for (let x = 0; x < smallWidth; x++) {
          const idx = (y * smallWidth + x) * 4;
          if (data[idx + 3] === 0) continue; // Skip transparency

          let r = data[idx];
          let g = data[idx + 1];
          let b = data[idx + 2];

          if (adjustContrastSat) {
            [r, g, b] = adjustColor(r, g, b, contrast, saturation, brightness);
          }

          // Get Bayer threshold value
          const threshold = (matrix[y % matrixSize][x % matrixSize] / maxVal - 0.5) * 64 * dAmount;

          // Apply dither offset
          const dr = Math.max(0, Math.min(255, r + threshold));
          const dg = Math.max(0, Math.min(255, g + threshold));
          const db = Math.max(0, Math.min(255, b + threshold));

          // Map to palette
          const closest = findClosestColor(dr, dg, db, activePalette);
          data[idx] = closest[0];
          data[idx + 1] = closest[1];
          data[idx + 2] = closest[2];
        }
      }
    } else if (ditherType === 'floyd-steinberg') {
      // Floyd-Steinberg error diffusion
      // Create copies to hold floating-point values so error diffusion is precise
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

          if (data[dataIdx + 3] === 0) continue; // Transparency

          let r = rBuffer[idx];
          let g = gBuffer[idx];
          let b = bBuffer[idx];

          if (adjustContrastSat) {
            [r, g, b] = adjustColor(r, g, b, contrast, saturation, brightness);
          }

          // Map to closest palette color
          const closest = findClosestColor(r, g, b, activePalette);

          // Write result
          data[dataIdx] = closest[0];
          data[dataIdx + 1] = closest[1];
          data[dataIdx + 2] = closest[2];

          // Compute error
          const errR = (r - closest[0]) * dAmount;
          const errG = (g - closest[1]) * dAmount;
          const errB = (b - closest[2]) * dAmount;

          // Diffuse error to neighbors
          // Right
          if (x + 1 < smallWidth) {
            const nIdx = idx + 1;
            rBuffer[nIdx] += errR * (7 / 16);
            gBuffer[nIdx] += errG * (7 / 16);
            bBuffer[nIdx] += errB * (7 / 16);
          }
          // Down Left
          if (x > 0 && y + 1 < smallHeight) {
            const nIdx = idx + smallWidth - 1;
            rBuffer[nIdx] += errR * (3 / 16);
            gBuffer[nIdx] += errG * (3 / 16);
            bBuffer[nIdx] += errB * (3 / 16);
          }
          // Down
          if (y + 1 < smallHeight) {
            const nIdx = idx + smallWidth;
            rBuffer[nIdx] += errR * (5 / 16);
            gBuffer[nIdx] += errG * (5 / 16);
            bBuffer[nIdx] += errB * (5 / 16);
          }
          // Down Right
          if (x + 1 < smallWidth && y + 1 < smallHeight) {
            const nIdx = idx + smallWidth + 1;
            rBuffer[nIdx] += errR * (1 / 16);
            gBuffer[nIdx] += errG * (1 / 16);
            bBuffer[nIdx] += errB * (1 / 16);
          }
        }
      }
    } else {
      // No dithering, direct mapping
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] === 0) continue;
        let r = data[i];
        let g = data[i + 1];
        let b = data[i + 2];

        if (adjustContrastSat) {
          [r, g, b] = adjustColor(r, g, b, contrast, saturation, brightness);
        }

        const closest = findClosestColor(r, g, b, activePalette);
        data[i] = closest[0];
        data[i + 1] = closest[1];
        data[i + 2] = closest[2];
      }
    }
  } else if (adjustContrastSat) {
    // Just color adjustment without palette mapping
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
