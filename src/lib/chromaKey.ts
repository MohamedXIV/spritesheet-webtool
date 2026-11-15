/**
 * Chroma Key Background Removal
 * Pure Canvas API implementation for solid color backgrounds
 */

export interface ChromaKeyOptions {
  targetColor: { r: number; g: number; b: number };
  tolerance: number; // 0-100
  edgeSoftness?: number; // 0-20, for smoother edges
  spillSuppression?: boolean; // CorridorKey-style spill suppression
  spillMethod?: 'cap' | 'desaturate'; // cap = cap excess green, desaturate = unmix color average
  spillAmount?: number; // 0-100
}

/**
 * Sample the dominant color from corners of an image
 */
export function sampleCornerColor(
  imageData: ImageData,
  sampleSize: number = 10
): { r: number; g: number; b: number } {
  const { data, width, height } = imageData;
  if (width === 0 || height === 0) return { r: 0, g: 255, b: 0 };
  const size = Math.max(1, Math.min(Math.trunc(sampleSize), width, height));
  const corners = [
    { x: 0, y: 0 }, { x: width - size, y: 0 },
    { x: 0, y: height - size }, { x: width - size, y: height - size },
  ];
  const groups = new Map<number, { count: number; r: number; g: number; b: number }>();
  for (const corner of corners) {
    for (let y = corner.y; y < corner.y + size; y++) {
      for (let x = corner.x; x < corner.x + size; x++) {
        const i = (y * width + x) * 4;
        if (data[i + 3] < 32) continue;
        // Quantization groups close background colors rather than averaging
        // different-colored corners into a color not present in the image.
        const key = (data[i] >> 4) * 256 + (data[i + 1] >> 4) * 16 + (data[i + 2] >> 4);
        const group = groups.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
        group.count++;
        group.r += data[i];
        group.g += data[i + 1];
        group.b += data[i + 2];
        groups.set(key, group);
      }
    }
  }
  const winner = Array.from(groups.values()).sort((a, b) => b.count - a.count)[0];
  return winner
    ? { r: Math.round(winner.r / winner.count), g: Math.round(winner.g / winner.count), b: Math.round(winner.b / winner.count) }
    : { r: 0, g: 255, b: 0 };
}

/**
 * Remove background by color (chroma key) with pro-grade VFX unmixing spill suppression
 */
export function applyChromaKeyToImageData(
  imageData: ImageData,
  options: ChromaKeyOptions
): void {
  const { 
    targetColor, 
    tolerance, 
    edgeSoftness = 0,
    spillSuppression = false,
    spillMethod = 'cap',
    spillAmount = 100
  } = options;
  
  const data = imageData.data;
  
  // Max possible color distance is sqrt(255^2 * 3) ≈ 441.67
  const maxDistance = 441.67;
  const toleranceThreshold = (tolerance / 100) * maxDistance;
  const softnessRange = (edgeSoftness / 100) * maxDistance;
  
  const toleranceThresholdSq = toleranceThreshold * toleranceThreshold;
  const softnessThresholdSq = (toleranceThreshold + softnessRange) ** 2;

  // Auto-detect dominant key color channel to support green, blue, and red keying unspills
  let dominantChannel: 'r' | 'g' | 'b' = 'g';
  if (targetColor.r > targetColor.g && targetColor.r > targetColor.b) {
    dominantChannel = 'r';
  } else if (targetColor.b > targetColor.g && targetColor.b > targetColor.r) {
    dominantChannel = 'b';
  }

  // Process each pixel
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    const distSq = (r - targetColor.r) ** 2 +
                   (g - targetColor.g) ** 2 +
                   (b - targetColor.b) ** 2;
    
    const matte = distSq <= toleranceThresholdSq ? 0
      : softnessRange > 0 && distSq <= softnessThresholdSq
        ? (Math.sqrt(distSq) - toleranceThreshold) / softnessRange
        : 1;
    // Existing transparent/semi-transparent sprites must stay transparent.
    data[i + 3] = Math.round(data[i + 3] * matte);
    
    // Apply CorridorKey-style Spill Suppression & Color Unmixing if enabled and pixel is not fully transparent
    if (spillSuppression && data[i + 3] > 0 && matte < 1) {
      const factor = spillAmount / 100;
      if (dominantChannel === 'g') {
        const excess = g - Math.max(r, b);
        if (excess > 0) {
          if (spillMethod === 'cap') {
            data[i + 1] = Math.round(Math.max(r, Math.max(b, g - excess * factor)));
          } else { // desaturate / unmix color average
            const avg = (r + b) / 2;
            data[i + 1] = Math.round(g - (g - avg) * factor);
          }
        }
      } else if (dominantChannel === 'b') {
        const excess = b - Math.max(r, g);
        if (excess > 0) {
          if (spillMethod === 'cap') {
            data[i + 2] = Math.round(Math.max(r, Math.max(g, b - excess * factor)));
          } else {
            const avg = (r + g) / 2;
            data[i + 2] = Math.round(b - (b - avg) * factor);
          }
        }
      } else if (dominantChannel === 'r') {
        const excess = r - Math.max(g, b);
        if (excess > 0) {
          if (spillMethod === 'cap') {
            data[i] = Math.round(Math.max(g, Math.max(b, r - excess * factor)));
          } else {
            const avg = (g + b) / 2;
            data[i] = Math.round(r - (r - avg) * factor);
          }
        }
      }
    }
  }
  
}

export async function removeBackgroundByColor(
  bitmap: ImageBitmap,
  options: ChromaKeyOptions,
): Promise<ImageBitmap> {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is unavailable.');
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  applyChromaKeyToImageData(imageData, options);
  ctx.putImageData(imageData, 0, 0);
  return createImageBitmap(canvas);
}

/**
 * Get color at specific pixel from ImageBitmap
 */
export async function getColorAtPixel(
  bitmap: ImageBitmap,
  x: number,
  y: number
): Promise<{ r: number; g: number; b: number }> {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  
  const imageData = ctx.getImageData(x, y, 1, 1);
  return {
    r: imageData.data[0],
    g: imageData.data[1],
    b: imageData.data[2]
  };
}

/**
 * Auto-detect background color from corners
 */
export async function autoDetectBackgroundColor(
  bitmap: ImageBitmap
): Promise<{ r: number; g: number; b: number }> {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return sampleCornerColor(imageData);
}
