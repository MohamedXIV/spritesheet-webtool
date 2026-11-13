/**
 * GIF stores delays in centiseconds. Keep imported GIF timings in milliseconds;
 * other media use the workspace FPS. Quantize only when encoding GIF.
 */
export function resolveFrameDurationMs(
  frame: { durationMs?: number } | null | undefined,
  fps: number,
  useOriginal = true
): number {
  if (useOriginal && frame && Number.isFinite(frame.durationMs) && (frame.durationMs ?? 0) > 0) {
    return Math.max(10, frame.durationMs!);
  }
  return 1000 / (Number.isFinite(fps) && fps > 0 ? fps : 12);
}

export function gifCentisecondDelay(ms: number): number {
  const safe = Number.isFinite(ms) && ms > 0 ? ms : 100;
  return Math.max(10, Math.min(655350, Math.round(safe / 10) * 10));
}
