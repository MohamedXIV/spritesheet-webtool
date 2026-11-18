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

export type LayerBlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

export interface LayerPixelData {
  bitmap: ImageBitmap | null;
  maskBitmap?: ImageBitmap | null;
  offsetX?: number;
  offsetY?: number;
}

export interface LayerFillConfig {
  kind: 'solid' | 'gradient';
  color: string;
  gradientEnd?: string;
  gradientType?: 'linear' | 'radial';
  angle?: number;
}

export interface LayerAdjustmentConfig {
  hue: number;          // -180 to 180
  saturation: number;   // -100 to 100
  brightness: number;   // -100 to 100
  contrast: number;     // -100 to 100
  invert?: boolean;
  posterize?: number;   // 0 = off, or 2..32
  levels?: {
    black: number;      // 0..254
    gamma: number;      // 0.1..3.0
    white: number;      // 1..255
  };
  curvesPoints?: [number, number, number, number]; // [y0, x1, y1, y2]
}

export interface ProjectLayer {
  id: string;
  name: string;
  type: 'raster' | 'fill' | 'adjustment' | 'group';
  parentId: string | null;
  collapsed?: boolean;
  scope: 'per-frame' | 'shared';
  visible: boolean;
  opacity: number; // 0 to 1
  blendMode: LayerBlendMode;
  locked?: boolean;
  alphaLocked?: boolean;
  clipped?: boolean;
  maskEnabled?: boolean;
  maskInverted?: boolean;
  fillConfig?: LayerFillConfig;
  adjustmentConfig?: LayerAdjustmentConfig;
  sharedData?: LayerPixelData;
}

export interface FrameData {
  id: string;
  index: number;
  timestamp: number;
  durationMs?: number; // Exact source frame hold time (animated GIF), in milliseconds
  layers?: Record<string, LayerPixelData>; // Maps layerId -> LayerPixelData
  /** @deprecated Legacy alias kept only while migrating old helpers */
  layerContents?: Record<string, ImageBitmap | null>;
  bitmap: ImageBitmap;
  thumbnailUrl?: string;
  sourceId: string;      // ID of source video/image
  sourceColor: string;   // Color for visual grouping
}

export interface SourceInfo {
  id: string;
  name: string;
  type: 'video' | 'image' | 'gif';
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
  durationMs?: number;
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



