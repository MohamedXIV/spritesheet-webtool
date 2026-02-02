/**
 * Chroma Key Background Removal
 * Pure Canvas API implementation for solid color backgrounds
 */

export interface ChromaKeyOptions {
  targetColor: { r: number; g: number; b: number };
  tolerance: number; // 0-100
  edgeSoftness?: number; // 0-20, for smoother edges
}

/**
 * Calculate color distance between two RGB colors (Euclidean)
 */
function colorDistance(
  r1: number, g1: number, b1: number,
  r2: number, g2: number, b2: number
): number {
  return Math.sqrt(
    Math.pow(r1 - r2, 2) +
    Math.pow(g1 - g2, 2) +
    Math.pow(b1 - b2, 2)
  );
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
 * Remove background by color (chroma key)
 */
export async function removeBackgroundByColor(
  bitmap: ImageBitmap,
  options: ChromaKeyOptions
): Promise<ImageBitmap> {
  const { targetColor, tolerance, edgeSoftness = 0 } = options;
  
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
  
  // Process each pixel
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    const distance = colorDistance(r, g, b, targetColor.r, targetColor.g, targetColor.b);
    
    if (distance <= toleranceThreshold) {
      // Fully transparent
      data[i + 3] = 0;
    } else if (softnessRange > 0 && distance <= toleranceThreshold + softnessRange) {
      // Partial transparency for edge softness
      const alpha = ((distance - toleranceThreshold) / softnessRange) * 255;
      data[i + 3] = Math.round(alpha);
    }
    // else: keep original alpha
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
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, x, y, 1, 1, 0, 0, 1, 1);
  
  const imageData = ctx.getImageData(0, 0, 1, 1);
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
