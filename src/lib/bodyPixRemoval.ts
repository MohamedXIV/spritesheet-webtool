/**
 * BodyPix Background Removal
 * TensorFlow.js-based person segmentation (lazy-loaded)
 */

// These will be dynamically imported
let tf: typeof import('@tensorflow/tfjs') | null = null;
let bodyPix: typeof import('@tensorflow-models/body-pix') | null = null;
let loadedNet: import('@tensorflow-models/body-pix').BodyPix | null = null;

export interface BodyPixOptions {
  threshold?: number; // 0-1, segmentation threshold
  internalResolution?: 'low' | 'medium' | 'high' | 'full';
}

/**
 * Check if BodyPix is loaded
 */
export function isBodyPixLoaded(): boolean {
  return loadedNet !== null;
}

/**
 * Load BodyPix model (lazy load)
 */
export async function loadBodyPix(
  onProgress?: (message: string) => void
): Promise<void> {
  if (loadedNet) return;
  
  onProgress?.('Loading TensorFlow.js...');
  
  // Dynamic import
  tf = await import('@tensorflow/tfjs');
  onProgress?.('Loading BodyPix model...');
  
  bodyPix = await import('@tensorflow-models/body-pix');
  
  loadedNet = await bodyPix.load({
    architecture: 'MobileNetV1',
    outputStride: 16,
    multiplier: 0.75,
    quantBytes: 2
  });
  
  onProgress?.('BodyPix ready!');
}

/**
 * Segment person from background
 */
export async function segmentPerson(
  bitmap: ImageBitmap,
  options: BodyPixOptions = {}
): Promise<ImageBitmap> {
  if (!loadedNet || !bodyPix || !tf) {
    throw new Error('BodyPix not loaded. Call loadBodyPix() first.');
  }
  
  const { threshold = 0.7, internalResolution = 'medium' } = options;
  
  // Create canvas from bitmap
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  
  // Run segmentation
  const segmentation = await loadedNet.segmentPerson(canvas, {
    internalResolution,
    segmentationThreshold: threshold,
    flipHorizontal: false
  });
  
  // Create mask
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = bitmap.width;
  maskCanvas.height = bitmap.height;
  const maskCtx = maskCanvas.getContext('2d')!;
  
  // Draw original image
  maskCtx.drawImage(bitmap, 0, 0);
  
  // Get image data for masking
  const imageData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
  const data = imageData.data;
  
  // Apply mask - make non-person pixels transparent
  for (let i = 0; i < segmentation.data.length; i++) {
    if (segmentation.data[i] === 0) {
      // Background pixel - make transparent
      data[i * 4 + 3] = 0;
    }
  }
  
  maskCtx.putImageData(imageData, 0, 0);
  
  return createImageBitmap(maskCanvas);
}

/**
 * Cleanup BodyPix resources
 */
export function disposeBodyPix(): void {
  if (loadedNet) {
    loadedNet.dispose();
    loadedNet = null;
  }
}
