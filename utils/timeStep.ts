/**
 * Small, deterministic time-response helpers shared by the driving loop and
 * its tests. Everything is expressed in 60 Hz "frames" so the existing tuning
 * numbers keep their meaning, while the elapsed-frame argument carries the
 * real wall-clock time measured by the render loop.
 *
 * Why this exists: ad-hoc forms such as `min(1, rate * frameScale)` and
 * `min(1.5, frameScale)` do not compose across 30/60/120 fps, so the same
 * throttle/brake script produced different speeds and pedal feel. These
 * helpers compose exactly: two half-frame steps equal one full-frame step.
 */

export const BASE_FRAME_HZ = 60;
export const BASE_FRAME_MS = 1000 / BASE_FRAME_HZ;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Convert a wall-clock delta to 60 Hz frame units. */
export function elapsedFramesFromMs(deltaMs: number): number {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) return 0;
  return deltaMs / BASE_FRAME_MS;
}

/**
 * Decide how much simulation time one render frame may consume.
 * - paused: 0 (settings/ESC is a real freeze, not a slow-motion state)
 * - a gap longer than `maxCatchUpMs`: 0 (tab hide / long hitch must not become
 *   one huge teleport when the page becomes visible again)
 * - otherwise the real delta, however low the frame rate.
 */
export function simulationDeltaMs(
  rawDeltaMs: number,
  paused: boolean,
  maxCatchUpMs = 250,
): number {
  if (paused) return 0;
  if (!Number.isFinite(rawDeltaMs) || rawDeltaMs <= 0) return 0;
  if (rawDeltaMs > maxCatchUpMs) return 0;
  return rawDeltaMs;
}

/** Linear ramp with a per-60 Hz-frame delta, without overshooting the target. */
export function approachLinear(
  current: number,
  target: number,
  perFrameDelta: number,
  elapsedFrames: number,
): number {
  if (!Number.isFinite(current) || !Number.isFinite(target)) return target;
  if (elapsedFrames <= 0 || perFrameDelta <= 0) return current;
  const step = perFrameDelta * elapsedFrames;
  if (target >= current) return Math.min(target, current + step);
  return Math.max(target, current - step);
}

/**
 * Exponential approach. `perFrameRate` is the fraction of the remaining gap
 * closed in one 60 Hz frame (0..1). `1 - (1-rate)^frames` is the exact
 * time-scaled form, so the result is independent of step size.
 */
export function approachExponential(
  current: number,
  target: number,
  perFrameRate: number,
  elapsedFrames: number,
): number {
  if (!Number.isFinite(current) || !Number.isFinite(target)) return target;
  if (elapsedFrames <= 0) return current;
  const rate = clamp01(perFrameRate);
  if (rate <= 0) return current;
  if (rate >= 1) return target;
  return target + (current - target) * Math.pow(1 - rate, elapsedFrames);
}

/** Decay a value toward zero by `perFrameRate` each 60 Hz frame. */
export function decayExponential(value: number, perFrameRate: number, elapsedFrames: number): number {
  return approachExponential(value, 0, perFrameRate, elapsedFrames);
}
