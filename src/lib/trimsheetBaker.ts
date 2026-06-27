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
import { zipSync, strToU8 } from 'fflate';

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
    // Round edges (not size) so adjacent regions share an exact pixel boundary
    // and leave no 1px fallback seam between them.
    const x = Math.round(rect.x * this.resolution);
    const y = Math.round(rect.y * this.resolution);
    const x2 = Math.round((rect.x + rect.w) * this.resolution);
    const y2 = Math.round((rect.y + rect.h) * this.resolution);
    return { x, y, w: x2 - x, h: y2 - y };
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
      const safeScale = scale > 1e-6 ? scale : 1e-6;
      const tilePxW = px.w / safeScale;
      const tilePxH = px.h / safeScale;
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

  /**
   * Export enabled channels as PNGs plus a region JSON, bundled into one zip.
   * @param regions current regions (for the JSON sidecar)
   * @param enabledChannels which map PNGs to include
   * @param projectName used for file naming inside the zip
   */
  async export(
    regions: Region[],
    enabledChannels: MapChannel[],
    projectName: string,
  ): Promise<Blob> {
    const safeName = (projectName || 'trimsheet').replace(/[^a-z0-9_-]+/gi, '_');
    const files: Record<string, Uint8Array> = {};

    // 1. Encode each enabled channel buffer to PNG bytes.
    for (const ch of enabledChannels) {
      const blob = await this.buffers[ch].convertToBlob({ type: 'image/png' });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      files[`${safeName}_${ch}.png`] = bytes;
    }

    // 2. Build the region metadata JSON (resolution-independent).
    const meta = {
      version: 1,
      resolution: this.resolution,
      channels: enabledChannels,
      regions: regions.map((r) => ({
        name: r.name,
        rect: r.rect,                 // normalized 0..1
        materialId: r.materialId,
        tiling: r.tiling,
      })),
    };
    files[`${safeName}.json`] = strToU8(JSON.stringify(meta, null, 2));

    // 3. Zip synchronously (small payloads) and wrap as a Blob.
    // The Blob constructor copies the bytes, so no manual copy is needed.
    const zipped = zipSync(files, { level: 6 });
    return new Blob([zipped], { type: 'application/zip' });
  }

  dispose(): void {
    // OffscreenCanvas has no explicit free; drop references and shrink to 0.
    for (const ch of MAP_CHANNELS) {
      this.buffers[ch].width = 0;
      this.buffers[ch].height = 0;
    }
  }
}
