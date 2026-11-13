import { parseGIF, decompressFrames } from 'gifuct-js';
import type { FrameData } from '@/types';
import { compositeGifPatches } from './gifDisposal';

export function isGifFile(file: Pick<File, 'type' | 'name'>): boolean {
  return file.type.toLowerCase() === 'image/gif' || /\.gif$/i.test(file.name);
}

/**
 * Decode GIF locally, preserving complete composited frames and their delays.
 * The parsed GIF can contain cropped patches with disposal modes 2/3; treating
 * each patch as an independent image would produce broken animations.
 */
export async function importGifFrames(
  file: File,
  sourceId: string,
  sourceColor: string,
  onProgress?: (completed: number, total: number) => void
): Promise<FrameData[]> {
  if (file.size > 35 * 1024 * 1024) {
    throw new Error('GIF exceeds the 35 MB import limit');
  }
  const parsed = parseGIF(await file.arrayBuffer());
  const width = parsed.lsd.width;
  const height = parsed.lsd.height;
  const patches = decompressFrames(parsed, true);

  if (!patches.length || patches.length > 600 ||
      width > 4096 || height > 4096 || width * height * patches.length > 200_000_000) {
    throw new Error('GIF frame count or decoded dimensions exceed the browser memory limit');
  }

  // Files with no transparent GIF color use the logical screen background.
  const hasTransparency = patches.some(p => p.transparentIndex !== undefined && p.transparentIndex !== null);
  const color = parsed.gct?.[parsed.lsd.backgroundColorIndex];
  const background: [number, number, number, number] =
    hasTransparency || !color ? [0, 0, 0, 0] : [color[0], color[1], color[2], 255];

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas is unavailable');

  const decoded: FrameData[] = [];
  let elapsedMs = 0;

  try {
    let index = 0;
    for (const { rgba, durationMs } of compositeGifPatches(patches, width, height, background)) {
      const imageData = context.createImageData(width, height);
      imageData.data.set(rgba);
      context.putImageData(imageData, 0, 0);
      const bitmap = await createImageBitmap(canvas);
      decoded.push({
        id: `frame-gif-${crypto.randomUUID()}`,
        index,
        timestamp: elapsedMs / 1000,
        durationMs,
        bitmap,
        sourceId,
        sourceColor,
      });
      elapsedMs += durationMs;
      index += 1;
      onProgress?.(index, patches.length);
    }
    return decoded;
  } catch (error) {
    // Decoding must not strand ImageBitmaps when a later frame fails.
    for (const frame of decoded) frame.bitmap.close();
    throw error;
  }
}
