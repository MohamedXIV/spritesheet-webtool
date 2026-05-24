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
  let totalR = 0, totalG = 0, totalB = 0;
  let count = 0;

  // Sample from all four corners
  const corners = [
    { x: 0, y: 0 },
    { x: width - sampleSize, y: 0 },
    { x: 0, y: height - sampleSize },
    { x: width - sampleSize, y: height - sampleSize }
  ];

  for (const corner of corners) {
    for (let y = corner.y; y < corner.y + sampleSize && y < height; y++) {
      for (let x = corner.x; x < corner.x + sampleSize && x < width; x++) {
        const idx = (y * width + x) * 4;
        totalR += data[idx];
        totalG += data[idx + 1];
        totalB += data[idx + 2];
        count++;
      }
    }
  }

  return {
    r: Math.round(totalR / count),
    g: Math.round(totalG / count),
    b: Math.round(totalB / count)
  };
}

/**
 * Remove background by color (chroma key) with pro-grade VFX unmixing spill suppression
 */
export async function removeBackgroundByColor(
  bitmap: ImageBitmap,
  options: ChromaKeyOptions
): Promise<ImageBitmap> {
  const { 
    targetColor, 
    tolerance, 
    edgeSoftness = 0,
    spillSuppression = false,
    spillMethod = 'cap',
    spillAmount = 100
  } = options;
  
  // Create canvas and draw bitmap
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  
  // Get image data
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
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
    
    if (distSq <= toleranceThresholdSq) {
      // Fully transparent
      data[i + 3] = 0;
    } else if (softnessRange > 0 && distSq <= softnessThresholdSq) {
      // Partial transparency for edge softness
      const distance = Math.sqrt(distSq);
      const alpha = ((distance - toleranceThreshold) / softnessRange) * 255;
      data[i + 3] = Math.round(alpha);
    }
    
    // Apply CorridorKey-style Spill Suppression & Color Unmixing if enabled and pixel is not fully transparent
    if (spillSuppression && data[i + 3] > 0) {
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
  
  // Put modified data back
  ctx.putImageData(imageData, 0, 0);
  
  // Create new ImageBitmap
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
