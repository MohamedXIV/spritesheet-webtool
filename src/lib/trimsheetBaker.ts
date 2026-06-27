// src/lib/trimsheetBaker.ts
/**
 * trimsheetBaker - Pure, React-free engine that owns five OffscreenCanvas
 * buffers (one per PBR channel) and composites regions into them with
 * dirty-rect efficiency. Preview and export read from the same buffers.
 */

import {
  MapChannel,
  MAP_CHANNELS,
  NormRect,
  Region,
  TrimMaterial,
  CHANNEL_FALLBACK,
} from './trimsheetTypes';

type Ctx2D = OffscreenCanvasRenderingContext2D;

export class TrimsheetBaker {
  private resolution: number;
  private buffers: Record<MapChannel, OffscreenCanvas>;
  private ctxs: Record<MapChannel, Ctx2D>;

  constructor(resolution: number) {
    this.resolution = resolution;
    this.buffers = {} as Record<MapChannel, OffscreenCanvas>;
    this.ctxs = {} as Record<MapChannel, Ctx2D>;
    this.allocate();
  }

  private allocate(): void {
    for (const ch of MAP_CHANNELS) {
      const canvas = new OffscreenCanvas(this.resolution, this.resolution);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Failed to get 2D context for trimsheet buffer');
      this.buffers[ch] = canvas;
      this.ctxs[ch] = ctx;
      // Initialize each buffer to its channel fallback so empty sheet is valid.
      ctx.fillStyle = CHANNEL_FALLBACK[ch];
      ctx.fillRect(0, 0, this.resolution, this.resolution);
    }
  }

  getResolution(): number {
    return this.resolution;
  }

  setResolution(res: number, regions: Region[], materials: Map<string, TrimMaterial>): void {
    this.resolution = res;
    this.allocate();
    for (const region of regions) {
      const mat = region.materialId ? materials.get(region.materialId) ?? null : null;
      this.compositeRegion(region, mat);
    }
  }

  /** Convert a normalized rect to integer pixel coordinates at current resolution. */
  private toPixelRect(rect: NormRect): { x: number; y: number; w: number; h: number } {
    const x = Math.round(rect.x * this.resolution);
    const y = Math.round(rect.y * this.resolution);
    const w = Math.round(rect.w * this.resolution);
    const h = Math.round(rect.h * this.resolution);
    return { x, y, w, h };
  }

  /** Resolve the bitmap for a channel, or null to use the solid fallback. */
  private resolveMap(ch: MapChannel, material: TrimMaterial | null): ImageBitmap | null {
    if (!material) return null;
    return material.maps[ch];
  }

  /** Composite one region into all five buffers using tiled material maps. */
  compositeRegion(region: Region, material: TrimMaterial | null): void {
    const px = this.toPixelRect(region.rect);
    if (px.w <= 0 || px.h <= 0) return;

    const { scale, offsetX, offsetY, rotation } = region.tiling;

    for (const ch of MAP_CHANNELS) {
      const ctx = this.ctxs[ch];
      ctx.save();
      ctx.beginPath();
      ctx.rect(px.x, px.y, px.w, px.h);
      ctx.clip();

      const bitmap = this.resolveMap(ch, material);

      if (!bitmap) {
        // Solid fallback (albedo honors flatColor).
        const albedoFlat = material?.flatColor;
        ctx.fillStyle = ch === 'albedo' && albedoFlat ? albedoFlat : CHANNEL_FALLBACK[ch];
        ctx.fillRect(px.x, px.y, px.w, px.h);
        ctx.restore();
        continue;
      }

      // Build a repeating pattern from the bitmap.
      const pattern = ctx.createPattern(bitmap, 'repeat');
      if (!pattern) {
        ctx.fillStyle = CHANNEL_FALLBACK[ch];
        ctx.fillRect(px.x, px.y, px.w, px.h);
        ctx.restore();
        continue;
      }

      // Compute pattern transform:
      // - One "tile" should span (rect size / scale) pixels, so scale>1 => more repeats.
      // - rotation rotates the pattern about the rect's top-left.
      // - offset shifts the pattern within the rect (fraction of rect size).
      const tilePxW = px.w / scale;
      const tilePxH = px.h / scale;
      const sx = tilePxW / bitmap.width;
      const sy = tilePxH / bitmap.height;

      const m = new DOMMatrix();
      // Move into the rect, apply offset (as fraction of rect size).
      m.translateSelf(px.x + offsetX * px.w, px.y + offsetY * px.h);
      if (rotation !== 0) {
        m.rotateSelf(rotation); // degrees
      }
      m.scaleSelf(sx, sy);
      pattern.setTransform(m);

      ctx.fillStyle = pattern;
      ctx.fillRect(px.x, px.y, px.w, px.h);
      ctx.restore();
    }
  }

  /** Erase a rect back to channel fallbacks across all buffers. */
  clearRegion(rect: NormRect): void {
    const px = this.toPixelRect(rect);
    if (px.w <= 0 || px.h <= 0) return;
    for (const ch of MAP_CHANNELS) {
      const ctx = this.ctxs[ch];
      ctx.fillStyle = CHANNEL_FALLBACK[ch];
      ctx.fillRect(px.x, px.y, px.w, px.h);
    }
  }

  getPreviewCanvas(): OffscreenCanvas {
    return this.buffers.albedo;
  }

  getChannel(ch: MapChannel): OffscreenCanvas {
    return this.buffers[ch];
  }

  dispose(): void {
    // OffscreenCanvas has no explicit free; drop references and shrink to 0.
    for (const ch of MAP_CHANNELS) {
      this.buffers[ch].width = 0;
      this.buffers[ch].height = 0;
    }
  }
}
