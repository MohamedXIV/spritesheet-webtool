/**
 * Source-backed cropping. Pixel coordinates always refer to the immutable
 * original spritesheet, not to the previously rendered frame bitmap.
 * The source is retained as a Blob in ProjectMetadata.sourceSheets.
 */
export interface SourceCrop {
  sourceId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** True if the source/base bitmap has been modified by painting or effects. */
  baseModified?: boolean;
}

export function sourceCropForCell(
  sourceId: string, column: number, row: number,
  cellWidth: number, cellHeight: number
): SourceCrop {
  if (![column, row, cellWidth, cellHeight].every(Number.isSafeInteger) ||
      column < 0 || row < 0 || cellWidth < 1 || cellHeight < 1) {
    throw new RangeError('Invalid spritesheet cell');
  }
  return {
    sourceId,
    x: column * cellWidth,
    y: row * cellHeight,
    width: cellWidth,
    height: cellHeight,
  };
}

export function isSourceCrop(value: unknown): value is SourceCrop {
  if (!value || typeof value !== 'object') return false;
  const c = value as Partial<SourceCrop>;
  return typeof c.sourceId === 'string' && c.sourceId.length > 0 &&
    [c.x, c.y, c.width, c.height].every(Number.isSafeInteger) &&
    c.x! >= 0 && c.y! >= 0 && c.width! > 0 && c.height! > 0 &&
    c.width! <= 4096 && c.height! <= 4096 &&
    (c.baseModified === undefined || typeof c.baseModified === 'boolean');
}

/**
 * Deliberately keep the output canvas dimensions fixed at this stage:
 * moving a crop can expose lost pixels without resampling or clipping any
 * existing paint layers. Canvas expansion will require cel-space transforms.
 */
export function editSourceCrop(
  current: SourceCrop,
  changes: Pick<SourceCrop, 'x' | 'y' | 'width' | 'height'>,
  sourceWidth: number, sourceHeight: number
): SourceCrop {
  if (!isSourceCrop(current)) throw new Error('Invalid source crop');
  if (current.baseModified) {
    throw new Error('This frame has edits on its source layer. Make a new slice variant to preserve the edits.');
  }
  const next: SourceCrop = { ...current, ...changes };
  if (!isSourceCrop(next) ||
      !Number.isSafeInteger(sourceWidth) || !Number.isSafeInteger(sourceHeight) ||
      sourceWidth < 1 || sourceHeight < 1 ||
      next.x >= sourceWidth || next.y >= sourceHeight) {
    throw new RangeError('Crop bounds must be valid and begin inside the original spritesheet');
  }
  return next;
}

export async function renderSourceCrop(blob: Blob, crop: SourceCrop): Promise<ImageBitmap> {
  if (!isSourceCrop(crop)) throw new Error('Invalid source crop');
  const original = await createImageBitmap(blob);
  try {
    if (crop.x >= original.width || crop.y >= original.height) {
      throw new RangeError('Crop is outside its original image');
    }
    const canvas = document.createElement('canvas');
    canvas.width = crop.width;
    canvas.height = crop.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('2D canvas is unavailable');
    context.imageSmoothingEnabled = false;
    // Drawing the unmodified full source prevents previously clipped pixels
    // from being lost permanently, including transparent sprite edges.
    context.drawImage(original, -crop.x, -crop.y);
    return await createImageBitmap(canvas);
  } finally {
    original.close();
  }
}

/**
 * Rebuild only the immutable source/base layer, preserving other paint-layer
 * ImageBitmaps by reference. Changing canvas size is allowed only when there
 * are no raster paint layers to clip. Painted source layers must be corrected
 * by creating a fresh slice variant, never overwritten.
 */
import type { FrameData, ProjectLayer } from '@/types';
import type { SourceSheetAsset } from './sourceSheetAssets';

export async function reframeFromOriginal(
  frame: FrameData,
  asset: SourceSheetAsset,
  nextCrop: SourceCrop,
  layers: readonly ProjectLayer[]
): Promise<FrameData> {
  const previous = frame.sourceCrop;
  if (!previous || previous.sourceId !== asset.sourceId ||
      nextCrop.sourceId !== previous.sourceId) {
    throw new Error('Frame is not linked to this original spritesheet');
  }
  if (previous.baseModified) {
    throw new Error('The source/base layer was edited. Create a new slice variant to keep those changes intact.');
  }
  const changed = nextCrop.x !== previous.x || nextCrop.y !== previous.y ||
    nextCrop.width !== previous.width || nextCrop.height !== previous.height;
  const hasPaint = Object.entries(frame.layerContents || {})
    .some(([id, bitmap]) => id !== 'layer-base' && bitmap !== null);
  if (changed && hasPaint) {
    // Paint overlays have frame-local coordinates today. Moving the source
    // underneath them would silently misalign the artwork. Until cel-space
    // transforms exist, generate a variant instead of rewriting this frame.
    throw new Error('This frame has painted overlays. Create a slice variant to preserve their alignment.');
  }

  const newBase = await renderSourceCrop(asset.blob, nextCrop);
  try {
    const contents = { ...(frame.layerContents || {}), 'layer-base': newBase };
    const canvas = document.createElement('canvas');
    canvas.width = nextCrop.width;
    canvas.height = nextCrop.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('2D canvas is unavailable');
    for (const layer of layers) {
      const bitmap = contents[layer.id];
      if (!bitmap || !layer.visible) continue;
      context.globalAlpha = layer.opacity;
      context.globalCompositeOperation =
        layer.blendMode === 'normal' ? 'source-over' : layer.blendMode;
      context.drawImage(bitmap, 0, 0);
    }
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
    const composited = await createImageBitmap(canvas);
    return { ...frame, bitmap: composited, layerContents: contents, sourceCrop: nextCrop };
  } catch (error) {
    newBase.close();
    throw error;
  }
}
