/**
 * spritesheetSlicer.ts - Slices packed spritesheet images into individual frames
 */

import { FrameData } from '@/types';

// Counter to ensure unique IDs
let sliceIdCounter = 0;
function generateSliceId(): string {
  return `frame-slice-${Date.now()}-${sliceIdCounter++}`;
}

/**
 * Slice a spritesheet image file into frames by grid (cols, rows)
 */
export async function sliceSpritesheetByGrid(
  file: File,
  cols: number,
  rows: number,
  sourceId: string,
  sourceColor: string
): Promise<{ frames: FrameData[]; width: number; height: number; cellWidth: number; cellHeight: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    img.onload = async () => {
      try {
        const width = img.width;
        const height = img.height;
        
        const cellWidth = Math.max(1, Math.floor(width / cols));
        const cellHeight = Math.max(1, Math.floor(height / rows));
        
        const frames: FrameData[] = [];
        let index = 0;
        
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const canvas = document.createElement('canvas');
            canvas.width = cellWidth;
            canvas.height = cellHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) continue;
            
            // Draw grid cell segment
            ctx.drawImage(
              img,
              c * cellWidth, r * cellHeight, cellWidth, cellHeight, // Source
              0, 0, cellWidth, cellHeight                          // Destination
            );
            
            const bitmap = await createImageBitmap(canvas);
            
            frames.push({
              id: generateSliceId(),
              index,
              timestamp: index,
              bitmap,
              sourceId,
              sourceColor,
            });
            
            index++;
          }
        }
        
        URL.revokeObjectURL(img.src);
        resolve({ frames, width, height, cellWidth, cellHeight });
      } catch (error) {
        URL.revokeObjectURL(img.src);
        reject(error);
      }
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Failed to load spritesheet image file.'));
    };
    
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Slice a spritesheet image file into frames by specific cell size (dimensions)
 */
export async function sliceSpritesheetByDimensions(
  file: File,
  cellWidth: number,
  cellHeight: number,
  sourceId: string,
  sourceColor: string
): Promise<{ frames: FrameData[]; width: number; height: number; cols: number; rows: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    img.onload = async () => {
      try {
        const width = img.width;
        const height = img.height;
        
        const cols = Math.max(1, Math.floor(width / cellWidth));
        const rows = Math.max(1, Math.floor(height / cellHeight));
        
        const frames: FrameData[] = [];
        let index = 0;
        
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const canvas = document.createElement('canvas');
            canvas.width = cellWidth;
            canvas.height = cellHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) continue;
            
            // Draw grid cell segment
            ctx.drawImage(
              img,
              c * cellWidth, r * cellHeight, cellWidth, cellHeight,
              0, 0, cellWidth, cellHeight
            );
            
            const bitmap = await createImageBitmap(canvas);
            
            frames.push({
              id: generateSliceId(),
              index,
              timestamp: index,
              bitmap,
              sourceId,
              sourceColor,
            });
            
            index++;
          }
        }
        
        URL.revokeObjectURL(img.src);
        resolve({ frames, width, height, cols, rows });
      } catch (error) {
        URL.revokeObjectURL(img.src);
        reject(error);
      }
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Failed to load spritesheet image file.'));
    };
    
    img.src = URL.createObjectURL(file);
  });
}
