/** Browser-only ISNet adapter. Large model resources are loaded only when requested. */
import { applyForegroundMask, type MaskRefinement } from './backgroundMask';

export type AiBackend = 'gpu' | 'cpu';
export type AiStage = 'download' | 'initializing' | 'inference' | 'compositing';
export interface AiProgress {
  stage: AiStage;
  fraction?: number;
  detail?: string;
}

export interface AiRemoveOptions {
  signal: AbortSignal;
  backend: AiBackend;
  refinement: MaskRefinement;
  progress?: (state: AiProgress) => void;
}

export const AI_MODEL_ESTIMATES = {
  gpu: 'approximately 80 MB (ISNet FP16)',
  cpu: 'approximately 40 MB (ISNet quantized)',
} as const;

export function hasWebGPU(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator &&
    (typeof isSecureContext === 'undefined' || isSecureContext);
}

/** Check an actual adapter; merely having navigator.gpu does not guarantee one. */
export async function probeWebGPU(): Promise<boolean> {
  if (!hasWebGPU()) return false;
  try {
    const gpu = (navigator as Navigator & { gpu: { requestAdapter(): Promise<unknown> } }).gpu;
    return !!(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

function abortIfRequested(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('Background removal cancelled.', 'AbortError');
}

// IMG.LY caches sessions by serialized configuration. A stable bridge keeps its
// memoized session while letting the currently running batch receive progress.
let activeProgress: ((state: AiProgress) => void) | undefined;
const configs = {
  gpu: {
    device: 'gpu' as const,
    model: 'isnet_fp16' as const,
    rescale: true,
    output: { format: 'image/x-rgba8' as const },
    progress: (key: string, current: number, total: number) => reportResourceProgress(key, current, total),
  },
  cpu: {
    device: 'cpu' as const,
    model: 'isnet_quint8' as const,
    rescale: true,
    output: { format: 'image/x-rgba8' as const },
    progress: (key: string, current: number, total: number) => reportResourceProgress(key, current, total),
  },
};

function reportResourceProgress(key: string, current: number, total: number): void {
  if (key.startsWith('compute:')) return;
  activeProgress?.({
    stage: 'download',
    detail: key,
    fraction: total > 0 ? Math.min(1, current / total) : undefined,
  });
}

/**
 * Returns a new bitmap. The original is never altered; its RGB and alpha are
 * composited at full resolution with the separate model mask.
 *
 * IMG.LY inference cannot be interrupted mid-frame. Cancellation is checked
 * before/after each expensive call, and the batch caller must check between frames.
 */
export async function removeBackgroundAI(
  source: ImageBitmap,
  options: AiRemoveOptions,
): Promise<ImageBitmap> {
  const { signal, backend, refinement, progress } = options;
  abortIfRequested(signal);
  if (source.width * source.height > 16_000_000) {
    throw new Error('This frame exceeds the AI safety limit of 16 megapixels. Resize it first.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas is unavailable.');
  ctx.drawImage(source, 0, 0);
  const original = ctx.getImageData(0, 0, source.width, source.height);

  activeProgress = progress;
  try {
    progress?.({ stage: 'initializing', detail: `Preparing ISNet on ${backend === 'gpu' ? 'WebGPU' : 'CPU/WASM'}` });
    const { preload, segmentForeground } = await import('@imgly/background-removal');
    abortIfRequested(signal);
    const config = configs[backend];
    await preload(config);
    abortIfRequested(signal);

    // Raw RGBA avoids the previous Canvas -> PNG -> model -> PNG roundtrip.
    const input = new Blob([original.data], {
      type: `image/x-rgba8;width=${source.width};height=${source.height}`,
    });
    progress?.({ stage: 'inference', detail: 'Running ISNet segmentation' });
    const result = await segmentForeground(input, config);
    abortIfRequested(signal);

    progress?.({ stage: 'compositing', detail: 'Preserving original sprite colors' });
    const raw = new Uint8Array(await result.arrayBuffer());
    if (raw.length !== source.width * source.height * 4) {
      throw new Error('The AI model returned an unexpected mask size. No frames were changed.');
    }
    const mask = new Uint8Array(source.width * source.height);
    for (let i = 0; i < mask.length; i++) mask[i] = raw[i * 4 + 3];
    const output = applyForegroundMask(original.data, mask, source.width, source.height, refinement);
    const imageData = new ImageData(new Uint8ClampedArray(output), source.width, source.height);
    ctx.putImageData(imageData, 0, 0);
    abortIfRequested(signal);
    return createImageBitmap(canvas);
  } finally {
    activeProgress = undefined;
  }
}
