/**
 * Basic Inpainting for Watermark Removal
 * Telea-style neighbor blending algorithm
 */

export interface InpaintRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Inpaint a region by blending with surrounding pixels
 */
export async function inpaintRegion(
  bitmap: ImageBitmap,
  region: InpaintRegion,
  iterations: number = 3
): Promise<ImageBitmap> {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const width = canvas.width;
  const height = canvas.height;
  
  // Create mask for the region to inpaint
  const mask = new Uint8Array(width * height);
  for (let y = region.y; y < region.y + region.height && y < height; y++) {
    for (let x = region.x; x < region.x + region.width && x < width; x++) {
      if (x >= 0 && y >= 0) {
        mask[y * width + x] = 1;
      }
    }
  }
  
  // Iterative inpainting from edges inward
  for (let iter = 0; iter < iterations; iter++) {
    const newData = new Uint8ClampedArray(data);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (mask[idx] !== 1) continue;
        
        // Check if this is a boundary pixel (has non-masked neighbors)
        const neighbors: number[][] = [];
        const offsets = [
          [-1, -1], [0, -1], [1, -1],
          [-1, 0],          [1, 0],
          [-1, 1],  [0, 1],  [1, 1]
        ];
        
        for (const [dx, dy] of offsets) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nidx = ny * width + nx;
            if (mask[nidx] !== 1) {
              const pidx = nidx * 4;
              neighbors.push([data[pidx], data[pidx + 1], data[pidx + 2], data[pidx + 3]]);
            }
          }
        }
        
        if (neighbors.length > 0) {
          // Average the neighbor colors
          const pidx = idx * 4;
          let sumR = 0, sumG = 0, sumB = 0, sumA = 0;
          for (const [r, g, b, a] of neighbors) {
            sumR += r;
            sumG += g;
            sumB += b;
            sumA += a;
          }
          newData[pidx] = Math.round(sumR / neighbors.length);
          newData[pidx + 1] = Math.round(sumG / neighbors.length);
          newData[pidx + 2] = Math.round(sumB / neighbors.length);
          newData[pidx + 3] = Math.round(sumA / neighbors.length);
          
          // Mark as filled for next iteration
          mask[idx] = 2;
        }
      }
    }
    
    // Update data and reset mask for filled pixels
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] === 2) {
        const pidx = i * 4;
        data[pidx] = newData[pidx];
        data[pidx + 1] = newData[pidx + 1];
        data[pidx + 2] = newData[pidx + 2];
        data[pidx + 3] = newData[pidx + 3];
        mask[i] = 0; // No longer needs inpainting
      }
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
  return createImageBitmap(canvas);
}

/**
 * Fill a region with a solid color sampled from nearby
 */
export async function fillRegionWithNearbyColor(
  bitmap: ImageBitmap,
  region: InpaintRegion
): Promise<ImageBitmap> {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  
  // Sample color from just outside the region
  const sampleX = Math.max(0, region.x - 5);
  const sampleY = Math.max(0, region.y - 5);
  const sampleData = ctx.getImageData(sampleX, sampleY, 5, 5);
  
  let totalR = 0, totalG = 0, totalB = 0;
  const pixelCount = sampleData.data.length / 4;
  for (let i = 0; i < sampleData.data.length; i += 4) {
    totalR += sampleData.data[i];
    totalG += sampleData.data[i + 1];
    totalB += sampleData.data[i + 2];
  }
  
  const avgColor = {
    r: Math.round(totalR / pixelCount),
    g: Math.round(totalG / pixelCount),
    b: Math.round(totalB / pixelCount)
  };
  
  ctx.fillStyle = `rgb(${avgColor.r}, ${avgColor.g}, ${avgColor.b})`;
  ctx.fillRect(region.x, region.y, region.width, region.height);
  
  return createImageBitmap(canvas);
}

/**
 * Crop out a region (changes dimensions)
 */
export async function cropOutRegion(
  bitmap: ImageBitmap,
  region: InpaintRegion,
  edge: 'top' | 'bottom' | 'left' | 'right'
): Promise<ImageBitmap> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  
  let sx = 0, sy = 0, sWidth = bitmap.width, sHeight = bitmap.height;
  
  switch (edge) {
    case 'top':
      sy = region.height;
      sHeight = bitmap.height - region.height;
      break;
    case 'bottom':
      sHeight = bitmap.height - region.height;
      break;
    case 'left':
      sx = region.width;
      sWidth = bitmap.width - region.width;
      break;
    case 'right':
      sWidth = bitmap.width - region.width;
      break;
  }
  
  canvas.width = sWidth;
  canvas.height = sHeight;
  ctx.drawImage(bitmap, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);
  
  return createImageBitmap(canvas);
}

/**
 * Get watermark region preset
 */
export function getWatermarkPreset(
  width: number,
  height: number,
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right',
  size: number = 50
): InpaintRegion {
  const regionWidth = Math.min(size * 3, width * 0.3);
  const regionHeight = Math.min(size, height * 0.15);
  
  switch (position) {
    case 'top-left':
      return { x: 0, y: 0, width: regionWidth, height: regionHeight };
    case 'top-right':
      return { x: width - regionWidth, y: 0, width: regionWidth, height: regionHeight };
    case 'bottom-left':
      return { x: 0, y: height - regionHeight, width: regionWidth, height: regionHeight };
    case 'bottom-right':
      return { x: width - regionWidth, y: height - regionHeight, width: regionWidth, height: regionHeight };
  }
}
