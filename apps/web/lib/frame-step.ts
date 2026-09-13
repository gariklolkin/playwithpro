/** Frame rate assumed for clips whose probe recorded none. */
export const DEFAULT_FPS = 30;

/**
 * The position one frame before or after `timeSeconds`. The target sits a
 * hair past the frame boundary so browsers that round seeks down do not land
 * on the previous frame.
 */
export function frameStepTarget(
  timeSeconds: number,
  fps: number | null,
  direction: 1 | -1,
  durationSeconds: number,
): number {
  const rate = fps !== null && fps > 0 ? fps : DEFAULT_FPS;
  const frame = Math.round(timeSeconds * rate) + direction;
  if (frame <= 0) return 0;
  const target = frame / rate + 0.001;
  return Number.isFinite(durationSeconds) && durationSeconds > 0
    ? Math.min(target, durationSeconds)
    : target;
}

/** The share (0–1) of the timeline at `seconds`, for markers and the track. */
export function timelineFraction(seconds: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.min(1, Math.max(0, seconds / duration));
}
