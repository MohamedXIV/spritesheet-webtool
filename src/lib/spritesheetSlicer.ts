/**
 * spritesheetSlicer.ts - Slices packed spritesheet images into individual frames,
 * supporting Offset/Margin, Spacing/Gutter, Inner Padding, Custom Guides,
 * and Non-destructive Slice-as-Masks (shared source bitmap + offset + cell mask).
 */

import type { FrameData, LayerPixelData, ProjectLayer } from '@/types';
import { computeSliceLayout, type SheetSliceSettings } from './slicerGuides';
import { compositeFrameLayers, createBaseProjectLayer } from './layerCompositor';

let sliceIdCounter = 0;
function generateSliceId(): string {
  return `frame-slice-${Date.now()}-${sliceIdCounter++}`;
}

export interface SliceResult {
  frames: FrameData[];
  width: number;
  height: number;
  cellWidth: number;
  cellHeight: number;
  cols: number;
  rows: number;
}

/**
 * Slice a spritesheet image using unified SheetSliceSettings.
 */
export async function sliceSpritesheet(
  fileOrBlob: Blob,
  settings: SheetSliceSettings,
  sourceId: string,
  sourceColor: string,
  globalLayers: readonly ProjectLayer[] = [createBaseProjectLayer()]
): Promise<SliceResult> {
  const sheetBitmap = await createImageBitmap(fileOrBlob);
  try {
    const width = sheetBitmap.width;
    const height = sheetBitmap.height;
    const layout = computeSliceLayout(width, height, settings);

    if (layout.rects.length === 0) {
      throw new Error('No valid slice cells fit inside the spritesheet dimensions.');
    }

    const frames: FrameData[] = [];

    for (const rect of layout.rects) {
      const frameLayers: Record<string, LayerPixelData> = {};

      if (settings.sliceAsMasks) {
        // Frame canvas stays at exact cell dimensions (rect.w x rect.h).
        // Base layer holds the shared full sheet bitmap positioned at (-rect.x, -rect.y),
        // with a grayscale cell mask revealing the inner area (excluding innerPadding).
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = rect.w;
        maskCanvas.height = rect.h;
        const mCtx = maskCanvas.getContext('2d')!;
        mCtx.fillStyle = '#000000';
        mCtx.fillRect(0, 0, rect.w, rect.h);
        mCtx.fillStyle = '#ffffff';
        mCtx.fillRect(rect.innerX, rect.innerY, rect.innerW, rect.innerH);
        const maskBitmap = await createImageBitmap(maskCanvas);

        for (const layer of globalLayers) {
          if (layer.id === 'layer-base') {
            frameLayers[layer.id] = {
              bitmap: sheetBitmap,
              maskBitmap,
              offsetX: -rect.x,
              offsetY: -rect.y,
            };
          } else if (layer.scope === 'per-frame' && layer.type === 'raster') {
            frameLayers[layer.id] = { bitmap: null, maskBitmap: null, offsetX: 0, offsetY: 0 };
          }
        }

        const composited = await compositeFrameLayers(frameLayers, globalLayers, rect.w, rect.h);
        frames.push({
          id: generateSliceId(),
          index: rect.index,
          timestamp: rect.index,
          bitmap: composited,
          layers: frameLayers,
          sourceId,
          sourceColor,
        });
      } else {
        // Standard destructive slice: extract inner region (trimmed by innerPadding)
        const outW = rect.innerW;
        const outH = rect.innerH;
        const canvas = document.createElement('canvas');
        canvas.width = outW;
        canvas.height = outH;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(
          sheetBitmap,
          rect.x + rect.innerX,
          rect.y + rect.innerY,
          outW,
          outH,
          0,
          0,
          outW,
          outH
        );
        const cellBitmap = await createImageBitmap(canvas);

        for (const layer of globalLayers) {
          if (layer.id === 'layer-base') {
            frameLayers[layer.id] = {
              bitmap: await createImageBitmap(cellBitmap),
              maskBitmap: null,
              offsetX: 0,
              offsetY: 0,
            };
          } else if (layer.scope === 'per-frame' && layer.type === 'raster') {
            frameLayers[layer.id] = { bitmap: null, maskBitmap: null, offsetX: 0, offsetY: 0 };
          }
        }

        frames.push({
          id: generateSliceId(),
          index: rect.index,
          timestamp: rect.index,
          bitmap: cellBitmap,
          layers: frameLayers,
          sourceId,
          sourceColor,
        });
      }
    }

    if (!settings.sliceAsMasks) {
      sheetBitmap.close();
    }

    return {
      frames,
      width,
      height,
      cellWidth: settings.sliceAsMasks
        ? layout.effectiveCellWidth
        : Math.max(1, layout.effectiveCellWidth - settings.innerPadding * 2),
      cellHeight: settings.sliceAsMasks
        ? layout.effectiveCellHeight
        : Math.max(1, layout.effectiveCellHeight - settings.innerPadding * 2),
      cols: layout.cols,
      rows: layout.rows,
    };
  } catch (err) {
    try {
      sheetBitmap.close();
    } catch {}
    throw err;
  }
}
