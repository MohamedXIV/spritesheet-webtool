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
export function moveSourceCrop(
  current: SourceCrop,
  x: number, y: number,
  sourceWidth: number, sourceHeight: number
): SourceCrop {
  if (!isSourceCrop(current)) throw new Error('Invalid source crop');
  if (current.baseModified) {
    throw new Error('This frame has edits on its source layer. Make a new slice variant to preserve the edits.');
  }
  if (![x, y, sourceWidth, sourceHeight].every(Number.isSafeInteger) ||
      sourceWidth < 1 || sourceHeight < 1 ||
      x < 0 || y < 0 || x >= sourceWidth || y >= sourceHeight) {
    throw new RangeError('Crop position must stay inside the original spritesheet');
  }
  return { ...current, x, y };
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
