// Core types for the Video to Spritesheet tool

// Color palette for source identification
export const SOURCE_COLORS = [
  '#3b82f6', // Blue
  '#f97316', // Orange
  '#22c55e', // Green
  '#a855f7', // Purple
  '#ec4899', // Pink
  '#eab308', // Yellow
  '#06b6d4', // Cyan
  '#ef4444', // Red
] as const;

export interface ProjectLayer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number; // 0 to 1
  blendMode: 'normal' | 'multiply' | 'screen' | 'overlay';
}

export interface FrameData {
  id: string;
  index: number;
  timestamp: number;
  layerContents?: Record<string, ImageBitmap | null>; // Maps globalLayerId -> ImageBitmap
  bitmap: ImageBitmap;
  thumbnailUrl?: string;
  sourceId: string;      // ID of source video/image
  sourceColor: string;   // Color for visual grouping
}

export interface SourceInfo {
  id: string;
  name: string;
  type: 'video' | 'image';
  frameCount: number;
  color: string;
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

export interface Folder {
  id: string;
  name: string;
  frameIds: string[];
  visible: boolean;
  collapsed: boolean;
  color: string;
}

export interface TextureSourceSlot {
  id: string;
  type: 'material' | 'udim';
  name: string;
  originalTextureUrl: string | null;
  originalColor: string; // hex color
  userTextureUrl: string | null;
  userTextureFile: File | null;
  weight: number;
  included: boolean;
  detectedUdimTile?: number;
  meshNames: string[];
}



