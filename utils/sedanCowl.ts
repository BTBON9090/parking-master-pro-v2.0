import type { CarConfig } from '../types';

/** Shared Sedan cowl placement; kept pure so wheel occlusion is testable. */
export function sedanCowlLayout(
  car: CarConfig,
  wheelZRatio: number,
  wheelCenterRatio: number,
  hoodRearYNormalized: number,
  eyeY: number,
  hoodRearZNormalized: number,
) {
  const wheelZ = car.length * wheelZRatio;
  const wheelRadius = 1.25;
  const depth = Math.max(0.8, car.length * 0.025);
  const z = Math.max(wheelZ + 2.2, wheelZ + wheelRadius + depth / 2 + 0.15);
  const hoodTop = hoodRearYNormalized * car.height;
  const hoodZ = Math.max(1, hoodRearZNormalized * car.length);
  // The cowl is behind the wheel disc. To meet the hood rear edge in the
  // driver's projection, raise/lower its top with the actual eye/hood/cowl Z
  // ratio instead of clamping it to a guessed car-height fraction.
  const projectedTop = eyeY + (hoodTop - eyeY) * (z / hoodZ);
  const top = projectedTop + Math.max(0.08, car.height * 0.008);
  const bottom = Math.min(car.height * 0.52, top - Math.max(0.5, car.height * 0.065));
  const height = Math.max(car.height * 0.065, top - bottom);
  const y = top - height / 2;
  return {
    wheelZ,
    wheelRadius,
    wheelCenterY: car.height * wheelCenterRatio,
    depth,
    z,
    y,
    height,
    top,
    frontZ: z - depth / 2,
    rearZ: z + depth / 2,
  };
}
