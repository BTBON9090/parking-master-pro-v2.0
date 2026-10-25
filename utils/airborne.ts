/** Minimal vertical state for a car leaving a support edge. Frame-based units. */
export interface SupportLoss {
  active: boolean;
  frontLost: boolean;
  rearLost: boolean;
  drop: number;
  verticalVelocity: number;
  /** +1 = nose-down pitch impulse (front loses support), -1 = nose-up. */
  pitchSign: number;
}

export const AIRBORNE_GRAVITY = 0.018;
export const SUPPORT_LOSS_THRESHOLD = 3.0;
export const MIN_AIRBORNE_VELOCITY = -0.18;

export function detectSupportLoss(
  previousFront: number,
  previousRear: number,
  front: number,
  rear: number,
  threshold = SUPPORT_LOSS_THRESHOLD,
): SupportLoss {
  const frontDrop = previousFront - front;
  const rearDrop = previousRear - rear;
  const frontLost = frontDrop > threshold;
  const rearLost = rearDrop > threshold;
  const drop = Math.max(0, frontDrop, rearDrop);
  return {
    active: frontLost || rearLost,
    frontLost,
    rearLost,
    drop,
    // Do not launch with zero vertical speed. On a true cliff the body starts
    // at least slightly downward; shallow normal slopes stay below threshold.
    verticalVelocity: -(Math.max(Math.abs(MIN_AIRBORNE_VELOCITY), Math.min(1.2, drop * 0.025))),
    pitchSign: frontLost && !rearLost ? 1 : rearLost && !frontLost ? -1 : 0,
  };
}

export interface AirborneStep {
  offset: number;
  velocity: number;
  pitch: number;
  pitchVelocity: number;
  landed: boolean;
}

/** Ballistic fall; returns landed when the minimum support surface is reached. */
export function stepAirborne(
  offset: number,
  velocity: number,
  pitch: number,
  pitchVelocity: number,
  supportY: number,
  baseY: number,
  frameScale: number,
  gravity = AIRBORNE_GRAVITY,
): AirborneStep {
  let nextVelocity = velocity - gravity * frameScale;
  let nextOffset = offset + nextVelocity * frameScale;
  let nextPitch = pitch + pitchVelocity * frameScale;
  let nextPitchVelocity = pitchVelocity * Math.pow(0.985, frameScale);
  const y = baseY + nextOffset;
  const landed = y <= supportY;
  if (landed) {
    nextOffset = supportY - baseY;
    nextVelocity = 0;
    nextPitchVelocity *= 0.25;
  }
  return { offset: nextOffset, velocity: nextVelocity, pitch: nextPitch, pitchVelocity: nextPitchVelocity, landed };
}
