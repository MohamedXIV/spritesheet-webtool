/**
 * Outline/Stroke Generator for Sprites
 * Adds stylistic outlines to transparent images
 */

export interface OutlineOptions {
  enabled: boolean;
  thickness: number; // 1-8 pixels
  color: string; // Hex color, e.g., '#000000'
  position: 'outside' | 'inside' | 'both';
  softness: number; // 0-5, blur amount
}

export const DEFAULT_OUTLINE_OPTIONS: OutlineOptions = {
  enabled: false,
  thickness: 2,
  color: '#000000',
  position: 'outside',
  softness: 0,
};

/**
 * Parse hex color to RGB
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) {
    return { r: 0, g: 0, b: 0 };
  }
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

/**
 * Dilate alpha mask outward by N pixels
 */
function dilateMask(
  alpha: Uint8Array,
  width: number,
  height: number,
  pixels: number
): Uint8Array {
  let current = new Uint8Array(alpha);
  let next = new Uint8Array(width * height);
  
  for (let pass = 0; pass < pixels; pass++) {
    next.set(current);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        
        // If current pixel is transparent
        if (current[idx] < 128) {
          // Check if any neighbor is opaque
          let maxNeighbor = 0;

          // Up
          if (y > 0) maxNeighbor = Math.max(maxNeighbor, current[idx - width]);
          // Down
          if (y < height - 1) maxNeighbor = Math.max(maxNeighbor, current[idx + width]);
          // Left
          if (x > 0) maxNeighbor = Math.max(maxNeighbor, current[idx - 1]);
          // Right
          if (x < width - 1) maxNeighbor = Math.max(maxNeighbor, current[idx + 1]);

          // Diagonals for smoother outline
          if (y > 0 && x > 0) maxNeighbor = Math.max(maxNeighbor, current[idx - width - 1]);
          if (y > 0 && x < width - 1) maxNeighbor = Math.max(maxNeighbor, current[idx - width + 1]);
          if (y < height - 1 && x > 0) maxNeighbor = Math.max(maxNeighbor, current[idx + width - 1]);
          if (y < height - 1 && x < width - 1) maxNeighbor = Math.max(maxNeighbor, current[idx + width + 1]);
          
          if (maxNeighbor > 128) {
            next[idx] = 255;
          }
        }
      }
    }
    
    const temp = current;
    current = next;
    next = temp;
  }
  
  return current;
}

/**
 * Erode alpha mask inward by N pixels
 */
function erodeMask(
  alpha: Uint8Array,
  width: number,
  height: number,
  pixels: number
): Uint8Array {
  let current = new Uint8Array(alpha);
  let next = new Uint8Array(width * height);
  
  for (let pass = 0; pass < pixels; pass++) {
    next.set(current);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        
        // If current pixel is opaque
        if (current[idx] > 128) {
          // Check if any neighbor is transparent (or out of bounds, which implies transparent)
          let hasTransparentNeighbor = false;

          if (y === 0 || current[idx - width] < 128) hasTransparentNeighbor = true;
          else if (y === height - 1 || current[idx + width] < 128) hasTransparentNeighbor = true;
          else if (x === 0 || current[idx - 1] < 128) hasTransparentNeighbor = true;
          else if (x === width - 1 || current[idx + 1] < 128) hasTransparentNeighbor = true;
          
          if (hasTransparentNeighbor) {
            next[idx] = 0;
          }
        }
      }
    }
    
    const temp = current;
    current = next;
    next = temp;
  }
  
  return current;
}

/**
 * Add outline/stroke to an image with transparency
 */
export async function addOutline(
  bitmap: ImageBitmap,
  options: Partial<OutlineOptions> = {}
): Promise<ImageBitmap> {
  const opts = { ...DEFAULT_OUTLINE_OPTIONS, ...options };
  
  if (!opts.enabled || opts.thickness <= 0) {
    return bitmap;
  }
  
  const { width, height } = bitmap;
  const outlineColor = hexToRgb(opts.color);
  
  // Create canvas and get image data
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  
  // Extract alpha channel
  const originalAlpha = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    originalAlpha[i] = data[i * 4 + 3];
  }
  
  // Generate outline mask based on position
  let outlineMask: Uint8Array;
  
  if (opts.position === 'outside') {
    // Outline = Dilated - Original
    const dilated = dilateMask(originalAlpha, width, height, opts.thickness);
    outlineMask = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
      outlineMask[i] = (dilated[i] > 128 && originalAlpha[i] < 128) ? 255 : 0;
    }
  } else if (opts.position === 'inside') {
    // Outline = Original - Eroded
    const eroded = erodeMask(originalAlpha, width, height, opts.thickness);
    outlineMask = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
      outlineMask[i] = (originalAlpha[i] > 128 && eroded[i] < 128) ? 255 : 0;
    }
  } else {
    // Both - combine inside and outside
    const dilated = dilateMask(originalAlpha, width, height, opts.thickness);
    const eroded = erodeMask(originalAlpha, width, height, opts.thickness);
    outlineMask = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const outsideOutline = dilated[i] > 128 && originalAlpha[i] < 128;
      const insideOutline = originalAlpha[i] > 128 && eroded[i] < 128;
      outlineMask[i] = (outsideOutline || insideOutline) ? 255 : 0;
    }
  }
  
  // Create result canvas
  const resultCanvas = document.createElement('canvas');
  resultCanvas.width = width;
  resultCanvas.height = height;
  const resultCtx = resultCanvas.getContext('2d')!;
  
  // For outside outlines: draw outline first, then original on top
  // For inside outlines: draw original first, then outline on top (to cover edge bleed)
  
  if (opts.position === 'outside') {
    // Draw outline first (behind)
    const outlineData = resultCtx.createImageData(width, height);
    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      if (outlineMask[i] > 0) {
        outlineData.data[idx] = outlineColor.r;
        outlineData.data[idx + 1] = outlineColor.g;
        outlineData.data[idx + 2] = outlineColor.b;
        outlineData.data[idx + 3] = 255;
      }
    }
    resultCtx.putImageData(outlineData, 0, 0);
    
    // Apply softness/blur if specified
    if (opts.softness > 0) {
      resultCtx.filter = `blur(${opts.softness}px)`;
      resultCtx.drawImage(resultCanvas, 0, 0);
      resultCtx.filter = 'none';
    }
    
    // Draw original image on top
    resultCtx.drawImage(bitmap, 0, 0);
  } else {
    // For inside or both: draw original first, then outline on top
    resultCtx.drawImage(bitmap, 0, 0);
    
    // Get image data to draw outline on top
    const resultData = resultCtx.getImageData(0, 0, width, height);
    
    // Draw outline pixels on top (overwriting the edge pixels)
    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      if (outlineMask[i] > 0) {
        resultData.data[idx] = outlineColor.r;
        resultData.data[idx + 1] = outlineColor.g;
        resultData.data[idx + 2] = outlineColor.b;
        resultData.data[idx + 3] = 255;
      }
    }
    resultCtx.putImageData(resultData, 0, 0);
    
    // Apply softness/blur if specified (more complex for inside)
    if (opts.softness > 0) {
      // Create separate outline layer for blur
      const blurCanvas = document.createElement('canvas');
      blurCanvas.width = width;
      blurCanvas.height = height;
      const blurCtx = blurCanvas.getContext('2d')!;
      
      const outlineOnly = blurCtx.createImageData(width, height);
      for (let i = 0; i < width * height; i++) {
        const idx = i * 4;
        if (outlineMask[i] > 0) {
          outlineOnly.data[idx] = outlineColor.r;
          outlineOnly.data[idx + 1] = outlineColor.g;
          outlineOnly.data[idx + 2] = outlineColor.b;
          outlineOnly.data[idx + 3] = 255;
        }
      }
      blurCtx.putImageData(outlineOnly, 0, 0);
      blurCtx.filter = `blur(${opts.softness}px)`;
      blurCtx.drawImage(blurCanvas, 0, 0);
      
      // Redraw: original, then blurred outline on top
      resultCtx.clearRect(0, 0, width, height);
      resultCtx.drawImage(bitmap, 0, 0);
      resultCtx.drawImage(blurCanvas, 0, 0);
    }
  }
  
  return createImageBitmap(resultCanvas);
}
