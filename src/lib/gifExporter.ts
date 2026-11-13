import type { FrameData } from '@/types';
import { resolveFrameDurationMs } from './gifTiming';

export interface AnimatedGifExportOptions {
  fps: number;
  colors: number;
  repeat: 'forever' | 'once';
  useSourceTiming: boolean;
  onProgress?: (completed: number, total: number) => void;
}

/**
 * Export complete animated GIFs entirely in the browser. A module Web Worker
 * performs the palette quantization and LZW encoding; the UI thread only reads
 * one frame at a time and transfers its RGBA buffer to the worker.
 */
export async function exportAnimatedGif(
  frames: readonly FrameData[],
  options: AnimatedGifExportOptions
): Promise<Blob> {
  if (frames.length < 1 || frames.length > 600) throw new Error('Select between 1 and 600 frames');

  const width = Math.max(...frames.map(frame => frame.bitmap.width));
  const height = Math.max(...frames.map(frame => frame.bitmap.height));
  if (!width || !height || width > 4096 || height > 4096 ||
      width * height * frames.length > 200_000_000) {
    throw new Error('GIF dimensions exceed the export memory limit');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas is unavailable');

  const worker = new Worker(new URL('../workers/gifEncoder.worker.ts', import.meta.url), { type: 'module' });
  let resolveOutput!: (blob: Blob) => void;
  let rejectOutput!: (reason: Error) => void;
  const result = new Promise<Blob>((resolve, reject) => {
    resolveOutput = resolve;
    rejectOutput = reject;
  });
  let settled = false;

  const fail = (error: Error) => {
    if (settled) return;
    settled = true;
    worker.terminate();
    rejectOutput(error);
  };

  worker.onerror = () => fail(new Error('GIF encoder worker crashed'));
  worker.onmessage = (event: MessageEvent<
    | { type: 'progress'; completed: number; total: number }
    | { type: 'complete'; buffer: ArrayBuffer }
    | { type: 'error'; message: string }
  >) => {
    if (settled) return;
    const message = event.data;
    if (message.type === 'progress') options.onProgress?.(message.completed, message.total);
    else if (message.type === 'error') fail(new Error(message.message));
    else if (message.type === 'complete') {
      settled = true;
      worker.terminate();
      resolveOutput(new Blob([message.buffer], { type: 'image/gif' }));
    }
  };

  try {
    worker.postMessage({
      type: 'start',
      width,
      height,
      colors: options.colors,
      repeat: options.repeat === 'once' ? -1 : 0,
      total: frames.length,
    });

    for (let index = 0; index < frames.length; index++) {
      if (settled) throw new Error('GIF encoding stopped unexpectedly');
      const frame = frames[index];
      ctx.clearRect(0, 0, width, height);
      // Uniform GIF canvas; center smaller frames without distorting pixels.
      ctx.drawImage(
        frame.bitmap,
        Math.floor((width - frame.bitmap.width) / 2),
        Math.floor((height - frame.bitmap.height) / 2)
      );
      const pixels = ctx.getImageData(0, 0, width, height).data;
      worker.postMessage({
        type: 'frame',
        pixels,
        delay: resolveFrameDurationMs(frame, options.fps, options.useSourceTiming),
      }, [pixels.buffer]);

      // Allow the browser to paint export progress on large batches.
      if (index % 8 === 7) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    }
    worker.postMessage({ type: 'finish' });
  } catch (error) {
    fail(error instanceof Error ? error : new Error(String(error)));
  }

  return result;
}
