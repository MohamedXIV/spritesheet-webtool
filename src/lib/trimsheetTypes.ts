// src/lib/trimsheetTypes.ts
/**
 * trimsheetTypes - Core types for the Trimsheet Builder tool.
 * Pure types + constants, no runtime dependencies.
 */

export type MapChannel = 'albedo' | 'normal' | 'roughness' | 'metalness' | 'ao';

export const MAP_CHANNELS: MapChannel[] = [
  'albedo', 'normal', 'roughness', 'metalness', 'ao',
];

export type TrimResolution = 512 | 1024 | 2048;

/** Normalized rect, all values 0..1 relative to the trimsheet. */
export interface NormRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TrimMaterialMaps {
  albedo: ImageBitmap | null;
  normal: ImageBitmap | null;
  roughness: ImageBitmap | null;
  metalness: ImageBitmap | null;
  ao: ImageBitmap | null;
}

export interface TrimMaterial {
  id: string;
  name: string;
  source: 'polyhaven' | 'upload' | 'flat';
  maps: TrimMaterialMaps;
  flatColor?: string;   // for source==='flat'; also albedo fallback tint
  thumbnailUrl: string;
}

export interface RegionTiling {
  scale: number;        // pattern repeats across the rect (1 = fill once)
  offsetX: number;      // 0..1
  offsetY: number;      // 0..1
  rotation: 0 | 90 | 180 | 270;
}

export interface Region {
  id: string;
  name: string;
  rect: NormRect;       // NORMALIZED 0..1
  materialId: string | null;
  tiling: RegionTiling;
}

export interface TrimsheetProject {
  resolution: TrimResolution;
  regions: Region[];
}

/** Solid-color fallbacks the baker paints when a material channel is null. */
export const CHANNEL_FALLBACK: Record<MapChannel, string> = {
  albedo: '#808080',
  normal: '#8080ff',
  roughness: '#808080',
  metalness: '#000000',
  ao: '#ffffff',
};

export const DEFAULT_TILING: RegionTiling = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
};

export function makeRegionId(): string {
  return `region-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function makeMaterialId(): string {
  return `mat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
