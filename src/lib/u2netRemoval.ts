/**
 * U-2-Net Background Removal
 * Uses @imgly/background-removal package (ONNX-based, lazy-loaded)
 */

// Will be dynamically imported
let removeBackground: typeof import('@imgly/background-removal').removeBackground | null = null;

export interface U2NetOptions {
  quality?: 'low' | 'medium' | 'high';
}

/**
 * Check if U-2-Net is loaded
 */
export function isU2NetLoaded(): boolean {
  return removeBackground !== null;
}

/**
 * Load U-2-Net model (lazy load)
 */
export async function loadU2Net(
  onProgress?: (message: string) => void
): Promise<void> {
  if (removeBackground) return;
  
  onProgress?.('Loading U-2-Net model...');
  
  const module = await import('@imgly/background-removal');
  removeBackground = module.removeBackground;
  
  onProgress?.('U-2-Net ready!');
}

/**
 * Remove background using U-2-Net
 */
export async function removeBackgroundU2Net(
  bitmap: ImageBitmap,
  options: U2NetOptions = {},
  onProgress?: (progress: number) => void
): Promise<ImageBitmap> {
  if (!removeBackground) {
    throw new Error('U-2-Net not loaded. Call loadU2Net() first.');
  }
  
  // Convert bitmap to blob
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  
  const blob = await new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => resolve(b!), 'image/png');
  });
  
  // Process with U-2-Net
  // Note: @imgly/background-removal uses 'isnet' models
  const resultBlob = await removeBackground(blob, {
    progress: (key, current, total) => {
      if (onProgress && total > 0) {
        onProgress(current / total);
      }
    },
    model: options.quality === 'low' ? 'isnet_quint8' : 'isnet_fp16'
  });
  
  // Convert result blob back to ImageBitmap
  return createImageBitmap(resultBlob);
}

/**
 * Process multiple frames with U-2-Net
 */
export async function removeBackgroundBatch(
  bitmaps: ImageBitmap[],
  options: U2NetOptions = {},
  onProgress?: (current: number, total: number) => void
): Promise<ImageBitmap[]> {
  const results: ImageBitmap[] = [];
  
  for (let i = 0; i < bitmaps.length; i++) {
    onProgress?.(i + 1, bitmaps.length);
    const result = await removeBackgroundU2Net(bitmaps[i], options);
    results.push(result);
  }
  
  return results;
}
