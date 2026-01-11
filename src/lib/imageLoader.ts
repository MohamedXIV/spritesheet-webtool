/**
 * Image Loader - Loads individual images as single frames
 */

import { FrameData, ExtractionProgress } from '@/types';

// Generate unique IDs for frames
let frameIdCounter = 0;
function generateFrameId(): string {
  return `frame-${Date.now()}-${frameIdCounter++}`;
}

/**
 * Load a single image file as a frame
 */
async function loadImageAsFrame(
  file: File,
  index: number,
  sourceId: string,
  sourceColor: string
): Promise<FrameData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    img.onload = async () => {
      try {
        const bitmap = await createImageBitmap(img);
        URL.revokeObjectURL(img.src);
        
        resolve({
          id: generateFrameId(),
          index,
          timestamp: index, // Images don't have real timestamps
          bitmap,
          sourceId,
          sourceColor,
        });
      } catch (error) {
        URL.revokeObjectURL(img.src);
        reject(error);
      }
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error(`Failed to load image: ${file.name}`));
    };
    
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Load multiple images as frames
 */
export async function loadImagesAsFrames(
  files: File[],
  sourceId: string,
  sourceColor: string,
  startIndex: number = 0,
  onProgress?: (progress: ExtractionProgress) => void
): Promise<FrameData[]> {
  const frames: FrameData[] = [];
  const total = files.length;
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    
    // Skip non-image files
    if (!file.type.startsWith('image/')) {
      continue;
    }
    
    const frame = await loadImageAsFrame(file, startIndex + i, sourceId, sourceColor);
    frames.push(frame);
    
    onProgress?.({
      current: i + 1,
      total,
      percentage: Math.round(((i + 1) / total) * 100),
    });
  }
  
  return frames;
}

/**
 * Check if a file is an image
 */
export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

/**
 * Check if a file is a video
 */
export function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/');
}
