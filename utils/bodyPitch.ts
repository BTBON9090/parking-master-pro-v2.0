import { approachExponential } from './timeStep';

/** Low-pass for measured longitudinal acceleration (g), independent of keys. */
export function filterLongitudinalAccel(currentG: number, measuredG: number, elapsedFrames: number): number {
  return approachExponential(currentG, Math.max(-1.2, Math.min(1.2, measuredG)), 0.09, elapsedFrames);
}

/** Small training-car pitch target; braking dives, throttle squats. */
export function dynamicPitchTargetRad(filteredAccelG: number, skidding = false): number {
  const pitch = -filteredAccelG * 0.045 + (skidding ? 0.010 : 0);
  return Math.max(-0.050, Math.min(0.040, pitch));
}

export function stepDynamicPitch(currentPitch: number, targetPitch: number, elapsedFrames: number): number {
  // Slightly slower release than build-up prevents brake-pedal tap jitter.
  return approachExponential(currentPitch, targetPitch, 0.13, elapsedFrames);
}
