/**
 * Spritesheet Packer - Arranges frames into a grid layout
 */

import { FrameData, SpritesheetConfig, SpritesheetMetadata, FramePosition } from '@/types';

export interface PackResult {
  canvas: HTMLCanvasElement;
  metadata: SpritesheetMetadata;
}

/**
 * Calculate optimal columns based on frame count
 */
export function calculateOptimalColumns(frameCount: number): number {
  if (frameCount <= 4) return frameCount;
  if (frameCount <= 16) return 4;
  if (frameCount <= 36) return 6;
  if (frameCount <= 64) return 8;
  return Math.ceil(Math.sqrt(frameCount));
}

/**
 * Pack frames into a spritesheet canvas
 */
export function packFrames(
  frames: FrameData[],
  config: SpritesheetConfig,
  fps: number
): PackResult {
  // Filter out frames with invalid bitmaps
  const validFrames = frames.filter(f => {
    try {
      return f.bitmap && f.bitmap.width > 0 && f.bitmap.height > 0;
    } catch {
      return false;
    }
  });

  if (validFrames.length === 0) {
    throw new Error('No valid frames to pack');
  }
  
  // Get frame dimensions from first frame
  const frameWidth = validFrames[0].bitmap.width;
  const frameHeight = validFrames[0].bitmap.height;
  
  // Calculate grid dimensions
  const columns = config.columns > 0 ? config.columns : calculateOptimalColumns(validFrames.length);
  const rows = Math.ceil(validFrames.length / columns);
  
  // Calculate canvas size with padding
  const canvasWidth = columns * frameWidth + (columns + 1) * config.padding;
  const canvasHeight = rows * frameHeight + (rows + 1) * config.padding;
  
  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  
  const ctx = canvas.getContext('2d')!;
  
  // Fill background
  ctx.fillStyle = config.backgroundColor;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  
  // Draw frames and build metadata
  const framePositions: FramePosition[] = [];
  
  validFrames.forEach((frame, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    
    const x = config.padding + col * (frameWidth + config.padding);
    const y = config.padding + row * (frameHeight + config.padding);
    
    // Draw frame to canvas (with safety check)
    try {
      ctx.drawImage(frame.bitmap, x, y);
    } catch {
      // Skip invalid bitmap
    }
    
    // Record position
    framePositions.push({
      x,
      y,
      w: frameWidth,
      h: frameHeight,
      index
    });
  });
  
  const metadata: SpritesheetMetadata = {
    fps,
    frameWidth,
    frameHeight,
    columns,
    rows,
    totalFrames: validFrames.length,
    frames: framePositions
  };
  
  return { canvas, metadata };
}

/**
 * Get default spritesheet config
 */
export function getDefaultConfig(): SpritesheetConfig {
  return {
    columns: 0, // 0 = auto-calculate
    padding: 0,
    backgroundColor: 'transparent'
  };
}
