// Core types for the Video to Spritesheet tool

export interface FrameData {
  id: string;
  index: number;
  timestamp: number;
  bitmap: ImageBitmap;
  thumbnailUrl?: string;
}

export interface SpritesheetConfig {
  columns: number;
  padding: number;
  backgroundColor: string;
}

export interface SpritesheetMetadata {
  fps: number;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  rows: number;
  totalFrames: number;
  frames: FramePosition[];
}

export interface FramePosition {
  x: number;
  y: number;
  w: number;
  h: number;
  index: number;
}

export interface ExtractionProgress {
  current: number;
  total: number;
  percentage: number;
}

export type DecoderType = 'webcodecs' | 'fallback';

export interface VideoInfo {
  width: number;
  height: number;
  duration: number;
  frameCount: number;
  fps: number;
}
