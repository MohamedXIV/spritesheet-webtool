/**
 * Mask Post-Processing for Background Removal
 * Improves edge quality after AI segmentation
 */

export interface PostProcessOptions {
  alphaThreshold: {
    low: number;  // Below this → fully transparent (default: 0.05)
    high: number; // Above this → fully opaque (default: 0.95)
  };
  erosion: number; // Pixels to erode inward (0-3)
  decontaminate: boolean; // Clean edge colors
}

export const DEFAULT_POST_PROCESS_OPTIONS: PostProcessOptions = {
  alphaThreshold: { low: 0.05, high: 0.95 },
  erosion: 1,
  decontaminate: true,
};

/**
 * Apply alpha thresholding to clean up weak transparency
 */
function applyAlphaThreshold(
  data: Uint8ClampedArray,
  low: number,
  high: number
): void {
  const lowByte = Math.round(low * 255);
  const highByte = Math.round(high * 255);
  
  for (let i = 3; i < data.length; i += 4) {
    const alpha = data[i];
    if (alpha < lowByte) {
      data[i] = 0;
    } else if (alpha > highByte) {
      data[i] = 255;
    }
  }
}

/**
 * Morphological erosion - shrink the mask inward
 * Removes background bleed at edges
 */
function applyErosion(
  imageData: ImageData,
  pixels: number
): void {
  if (pixels <= 0) return;
  
  const { data, width, height } = imageData;
  const originalAlpha = new Uint8Array(width * height);
  
  // Copy original alpha values
  for (let i = 0; i < width * height; i++) {
    originalAlpha[i] = data[i * 4 + 3];
  }
  
  const currentAlpha = new Uint8Array(width * height);

  // For each erosion pass
  for (let pass = 0; pass < pixels; pass++) {
    currentAlpha.set(originalAlpha);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        
        // Skip if already transparent
        if (currentAlpha[idx] === 0) continue;
        
        let hasTransparentNeighbor = false;

        // Check neighbors (4-connectivity)
        // Top
        if (y > 0) {
          if (currentAlpha[idx - width] < 128) hasTransparentNeighbor = true;
        } else {
          hasTransparentNeighbor = true;
        }

        if (!hasTransparentNeighbor) {
          // Bottom
          if (y < height - 1) {
            if (currentAlpha[idx + width] < 128) hasTransparentNeighbor = true;
          } else {
            hasTransparentNeighbor = true;
          }
        }
        
        if (!hasTransparentNeighbor) {
          // Left
          if (x > 0) {
            if (currentAlpha[idx - 1] < 128) hasTransparentNeighbor = true;
          } else {
            hasTransparentNeighbor = true;
          }
        }

        if (!hasTransparentNeighbor) {
          // Right
          if (x < width - 1) {
            if (currentAlpha[idx + 1] < 128) hasTransparentNeighbor = true;
          } else {
            hasTransparentNeighbor = true;
          }
        }
        if (hasTransparentNeighbor) {
          // Reduce alpha for edge pixels
          originalAlpha[idx] = Math.max(0, originalAlpha[idx] - 85);
        }
      }
    }
  }
  
  // Apply eroded alpha back
  for (let i = 0; i < width * height; i++) {
    data[i * 4 + 3] = originalAlpha[i];
  }
}

/**
 * Edge color decontamination
 * Removes background color bleeding at semi-transparent edges
 */
function applyDecontamination(imageData: ImageData): void {
  const { data, width, height } = imageData;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const alpha = data[idx + 3];
      
      // Only process semi-transparent pixels
      if (alpha > 10 && alpha < 245) {
        // Find nearest fully opaque pixel
        let foundOpaque = false;
        let searchRadius = 1;
        const maxRadius = 5;
        
        while (!foundOpaque && searchRadius <= maxRadius) {
          for (let dy = -searchRadius; dy <= searchRadius && !foundOpaque; dy++) {
            for (let dx = -searchRadius; dx <= searchRadius && !foundOpaque; dx++) {
              const nx = x + dx;
              const ny = y + dy;
              
              if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const nidx = (ny * width + nx) * 4;
                const nAlpha = data[nidx + 3];
                
                // Found an opaque pixel
                if (nAlpha > 250) {
                  // Blend toward opaque pixel's color
                  const blendFactor = 0.7;
                  data[idx] = Math.round(data[idx] * (1 - blendFactor) + data[nidx] * blendFactor);
                  data[idx + 1] = Math.round(data[idx + 1] * (1 - blendFactor) + data[nidx + 1] * blendFactor);
                  data[idx + 2] = Math.round(data[idx + 2] * (1 - blendFactor) + data[nidx + 2] * blendFactor);
                  foundOpaque = true;
                }
              }
            }
          }
          searchRadius++;
        }
      }
    }
  }
}

/**
 * Post-process a mask/image after AI background removal
 */
export async function postProcessMask(
  bitmap: ImageBitmap,
  options: Partial<PostProcessOptions> = {}
): Promise<ImageBitmap> {
  const opts = { ...DEFAULT_POST_PROCESS_OPTIONS, ...options };
  
  // Create canvas and get image data
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  
  // Apply post-processing steps
  applyAlphaThreshold(
    imageData.data,
    opts.alphaThreshold.low,
    opts.alphaThreshold.high
  );
  
  if (opts.erosion > 0) {
    applyErosion(imageData, opts.erosion);
  }
  
  if (opts.decontaminate) {
    applyDecontamination(imageData);
  }
  
  // Put processed data back
  ctx.putImageData(imageData, 0, 0);
  
  return createImageBitmap(canvas);
}
