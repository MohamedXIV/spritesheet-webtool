/**
 * Editable per-frame animation timing.
 *
 * No changes to the underlying bitmaps: this is a normal, immutable document
 * edit so existing Undo/Redo and IndexedDB serialization handle it naturally.
 */
import type { FrameState } from './frameStore';
import type { FrameData } from '@/types';
import { resolveFrameDurationMs } from './gifTiming.ts';

export const MIN_FRAME_DURATION_MS = 10;
export const MAX_FRAME_DURATION_MS = 60_000;

/** null restores FPS-based timing; a number sets an explicit frame duration. */
export function updateFrameDurations(
  state: FrameState,
  frameIds: ReadonlySet<string>,
  durationMs: number | null
): FrameState {
  if (durationMs !== null &&
    (!Number.isSafeInteger(durationMs) ||
      durationMs < MIN_FRAME_DURATION_MS ||
      durationMs > MAX_FRAME_DURATION_MS)) {
    throw new RangeError('Frame duration must be between 10 and 60000 milliseconds');
  }
  if (frameIds.size === 0) return state;

  const newDuration = durationMs ?? undefined;
  let changed = false;
  const frames = state.frames.map(frame => {
    if (!frameIds.has(frame.id) || frame.durationMs === newDuration) return frame;
    changed = true;
    return { ...frame, durationMs: newDuration };
  });
  return changed ? { ...state, frames } : state;
}

export function sequenceDurationMs(
  frames: readonly Pick<FrameData, 'durationMs'>[],
  fps: number
): number {
  return frames.reduce((sum, frame) => sum + resolveFrameDurationMs(frame, fps), 0);
}
