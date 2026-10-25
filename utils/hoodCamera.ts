import { CarConfig, HoodCameraAdjustment } from '../types';
import { DEFAULT_HOOD_CAMERA_ADJUSTMENT } from '../constants';

/**
 * The hood camera is authored in vehicle-local coordinates: X points toward
 * the vehicle's left side, Y points upward and Z points toward the nose.
 * Keeping this calculation shared prevents the live Three.js camera and the
 * tuning locator from drifting apart as vehicle dimensions change.
 */
export interface HoodCameraLocalPose {
  x: number;
  y: number;
  z: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  aimDistance: number;
}


export function resolveHoodCameraLocalPose(
  car: CarConfig,
  adjustment: HoodCameraAdjustment,
): HoodCameraLocalPose {
  let x: number;
  let y: number;
  let z: number;
  let pitchDeg: number;
  const yaw = adjustment.yaw * Math.PI / 180;

  // First-person driver eye: left-hand-drive seat, cabin height, just behind
  // the windscreen base. The authored adjustment values are offsets from this
  // baseline, so existing controller/keyboard sliders still work unchanged.
  x = car.width * 0.16 + (adjustment.lateral - DEFAULT_HOOD_CAMERA_ADJUSTMENT.lateral);
  y = car.height * 0.85 + (adjustment.height - DEFAULT_HOOD_CAMERA_ADJUSTMENT.height);
  z = car.length * 0.000 + (adjustment.forward - DEFAULT_HOOD_CAMERA_ADJUSTMENT.forward);
  pitchDeg = -2 + adjustment.pitch - DEFAULT_HOOD_CAMERA_ADJUSTMENT.pitch;

  const aimDistance = Math.max(80, car.length * 3.2);
  const pitch = pitchDeg * Math.PI / 180;

  return {
    x,
    y,
    z,
    targetX: x + Math.sin(yaw) * aimDistance,
    targetY: y + Math.tan(pitch) * aimDistance,
    targetZ: z + Math.cos(yaw) * aimDistance,
    aimDistance,
  };
}
