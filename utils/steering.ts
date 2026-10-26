/**
 * Steering input plumbing kept outside React so the focus, smoothing and
 * return-to-centre rules are testable without a browser.
 *
 * - The smoother preserves total mouse/keyboard displacement: a quick flick
 *   followed by a release still reaches its full angle when flushed, while the
 *   wheel still moves smoothly over several frames.
 * - Auto-centring is a hands-off helper only. The caller must not run it while
 *   any driver input (right-drag, pointer lock or keyboard steering) is active.
 */

import type { CarConfig } from '../types';
import { steeringWheelMaxDeg } from './powertrain';
import { approachExponential } from './timeStep';

/** Keyboard fallback for browsers/windows without pointer lock. These keys
 *  deliberately do not overlap gear +/- (A/D or arrow keys). */
export const STEER_LEFT_KEY = ',';
export const STEER_RIGHT_KEY = '.';
/** Raw steering demand per 60 Hz frame for held keyboard steering. */
export const KEYBOARD_STEER_DELTA_PER_FRAME = 9;
/** One hardware media-dial detent is intentionally small; the remainder stays
 *  fractional through SteeringInputSmoother and is never rounded to a notch. */
export const KNOB_STEER_STEP_DEG = 12;
/** Hands-off centre magnet in steering-wheel degrees. It is wider than one
 *  60 Hz keyboard step (≈3.6°) only in the sense that it catches a released
 *  ±1–2° nudge; active input is never snapped. This never quantises the wheel. */
export const CENTER_SNAP_DEG = 2.2;

/** Manual-input release magnet, independent of speed/auto-centre/logitech knob
 *  mode. It only acts after input has ended and never during a continuous
 *  crossing of zero. */
export function snapSteeringCenter(angleDeg: number, interacting: boolean): number {
  if (interacting) return angleDeg;
  return Math.abs(angleDeg) <= CENTER_SNAP_DEG ? 0 : angleDeg;
}

/** Symmetric manual steering step. Equal outward/return deltas preserve the
 *  same gain, so a mouse/keyboard/knob move can retrace exactly through zero. */
export function applySymmetricSteeringDelta(
  angleDeg: number,
  deltaDeg: number,
  wheelMaxDeg: number,
  sensitivity: number,
): number {
  const max = Math.max(1, wheelMaxDeg);
  const next = angleDeg + deltaDeg * sensitivity;
  return Math.max(-max, Math.min(max, next));
}

/**
 * Speed-sensitive usable lock. At parking speed the full mechanical lock is
 * available; above ~25 km/h the permitted road-wheel angle falls smoothly so
 * the steering wheel, front-wheel visual and actual path cannot disagree by a
 * huge margin at speed. This is an assistance/training limit, not a change to
 * the fixed rack ratio.
 */
export function speedSteeringFactor(speedAbs: number): number {
  const kmh = Math.max(0, speedAbs) * 15;
  if (kmh <= 30) return 1;
  const t = Math.max(0, Math.min(1, (kmh - 30) / 130));
  const eased = t * t * (3 - 2 * t);
  return 1 - 0.76 * eased;
}

/**
 * In-world steering-wheel rotation around local +Z. The driver camera looks
 * along +Z, so a positive local-Z rotation appears clockwise to the driver.
 * Keep this in one place: the front-wheel/path signs are a separate chain.
 */
export function driverWheelRotationZ(inputAngleDeg: number): number {
  return inputAngleDeg * Math.PI / 180;
}

export function effectiveSteeringWheelMaxDeg(car: CarConfig, speedAbs: number): number {
  return steeringWheelMaxDeg(car); // Grip limits the trajectory, never the driver's wheel travel.
}

/**
 * Controlled short drift state. High-speed sharp steering or handbrake+steer
 * builds a bounded slip angle; releasing the input decays it back to zero.
 * The render loop applies the slip to body yaw and lateral travel.
 */
export function driftSlipStep(
  currentSlip: number,
  forwardSpeed: number,
  steerAngle: number,
  handbrake: boolean,
  maxSteerAngle: number,
  elapsedFrames: number,
): number {
  const speedAbs = Math.abs(forwardSpeed);
  const steerAbs = Math.abs(steerAngle);
  const threshold = Math.max(0.055, maxSteerAngle * 0.60);
  const demand = forwardSpeed > 0.35 && speedAbs > 3.0 && steerAbs > 0.02
    && ((handbrake && speedAbs > 3.2) || (speedAbs > 5.0 && steerAbs > threshold));
  if (!demand) return approachExponential(currentSlip, 0, 0.075, elapsedFrames);
  const target = Math.sign(steerAngle) * Math.min(0.22, 0.07 + speedAbs * 0.012);
  return approachExponential(currentSlip, target, 0.16, elapsedFrames);
}

export class SteeringInputSmoother {
  private pending = 0;
  private smoothing: number;

  constructor(smoothing = 0.45) {
    this.smoothing = Math.max(0.01, Math.min(1, smoothing));
  }

  setSmoothing(value: number) {
    if (!Number.isFinite(value)) return;
    this.smoothing = Math.max(0.01, Math.min(1, value));
  }

  getSmoothing() {
    return this.smoothing;
  }

  /** Queue raw mouse/keys displacement (degrees at the steering wheel). */
  push(delta: number) {
    if (!Number.isFinite(delta) || delta === 0) return;
    this.pending += delta;
  }

  /**
   * Consume the next smoothed slice. `elapsedFrames` is the real time since
   * the previous slice in 60 Hz frame units, so 120 fps does not smooth twice
   * as fast as 60 fps. The remainder stays queued.
   */
  take(elapsedFrames = 1): number {
    if (this.pending === 0) return 0;
    const frames = Number.isFinite(elapsedFrames) ? Math.max(0.01, elapsedFrames) : 1;
    const rate = 1 - Math.pow(1 - this.smoothing, frames);
    let step = this.pending * rate;
    this.pending -= step;
    // Avoid an endless sub-pixel tail; snap the last fraction into this step.
    if (Math.abs(this.pending) < 0.01) {
      step += this.pending;
      this.pending = 0;
    }
    return step;
  }

  /** Immediately take everything still queued (mouse release / lock exit). */
  flush(): number {
    const remaining = this.pending;
    this.pending = 0;
    return remaining;
  }

  reset() {
    this.pending = 0;
  }

  hasPending(): boolean {
    return Math.abs(this.pending) > 0.001;
  }
}

/**
 * Hands-off return step for the 16 ms control tick. With no road speed the
 * wheel stays where it was (parking manoeuvres); once the car is actually
 * rolling it returns at a calibrated angular rate, not the old exponential
 * whose low-speed time constant was several seconds. The rate is independent
 * of throttle/gear: holding W must not count as "hands on the wheel".
 *
 * `autoCenteringSpeed` is the user setting (0 disables the assist, 1 is the
 * calibrated rate). The rate ramps from 48 °/s at a crawl to 96 °/s from
 * ~20 km/h, so a 180° correction takes ~3.7 s at walking pace and ~1.9 s at
 * road speed. The final sub-degree snap guarantees an exact zero.
 */
export function autoCenterWheelAngle(
  angleDeg: number,
  speedAbs: number,
  autoCenteringSpeed: number,
  tickMs = 16,
  stationaryAssist = false,
): number {
  if (!Number.isFinite(angleDeg) || angleDeg === 0) return 0;
  if (Math.abs(angleDeg) <= CENTER_SNAP_DEG) return 0;
  if (!Number.isFinite(autoCenteringSpeed) || autoCenteringSpeed <= 0) return angleDeg;
  const speed = Number.isFinite(speedAbs) ? Math.max(0, speedAbs) : 0;
  // 0.02 speed unit = 0.3 km/h. The wheel is never pulled while the car is
  // stationary, but any genuine rolling speed gets a visible return.
  if (speed < 0.02 && !stationaryAssist) return angleDeg;
  const speedT = Math.max(0, Math.min(1, (speed - 0.02) / 1.48));
  const eased = speedT * speedT * (3 - 2 * speedT);
  const rateDegPerSec = Math.min(1.8,autoCenteringSpeed) * (speed < .02 ? 44 : 52 + 66 * eased);
  const dtSeconds = Math.max(0, tickMs) / 1000;
  // Slightly firmer away from centre, gentler in the last few degrees; the
  // motion remains monotonic and never reverses.
  const ease = 0.55 + 0.45 * Math.min(1, Math.abs(angleDeg) / 90);
  const step = rateDegPerSec * dtSeconds * ease;
  const magnitude = Math.max(0, Math.abs(angleDeg) - step);
  return magnitude <= CENTER_SNAP_DEG ? 0 : Math.sign(angleDeg) * magnitude;
}

/**
 * Tracks only actual steering operations. Throttle, brake, handbrake, gear
 * changes and camera/look input must not refresh this clock: that was the
 * bug that let keyboard auto-repeat keep the wheel from returning while the
 * driver held W. The class is deliberately separate from React so the rule
 * can be regression-tested without a browser.
 */
export const STEERING_RETURN_GRACE_MS = 200;

export class SteeringActivityClock {
  private lastSteeringAt = Number.NEGATIVE_INFINITY;

  /** Call for mouse drag, dial detents and keyboard steering only. */
  markSteering(nowMs: number): void {
    if (Number.isFinite(nowMs)) this.lastSteeringAt = nowMs;
  }

  /** Directly held steering wins; otherwise the 200 ms release grace applies. */
  isSteeringActive(nowMs: number, directlyHeld: boolean, graceMs = STEERING_RETURN_GRACE_MS): boolean {
    if (directlyHeld) return true;
    if (!Number.isFinite(nowMs) || !Number.isFinite(this.lastSteeringAt)) return false;
    return nowMs - this.lastSteeringAt < Math.max(0, graceMs);
  }

  reset(): void {
    this.lastSteeringAt = Number.NEGATIVE_INFINITY;
  }
}

/** Low-speed counter-phase rear steering, fading to zero with speed. */
export function rearSteerAngleForSpeed(maxDeg: number | undefined, signedSpeed: number, frontSteer: number, maxFrontSteer = 0.60): number {
  if (!maxDeg || Math.abs(frontSteer) < 1e-6) return 0;
  const ratio = Math.max(-1, Math.min(1, frontSteer / Math.max(1e-4, maxFrontSteer)));
  const kmh = Math.abs(signedSpeed) * 15;
  const start = 20;
  const end = 55;
  const t = Math.max(0, Math.min(1, (kmh - start) / Math.max(1, end - start)));
  const fade = 1 - t * t * (3 - 2 * t);
  return -ratio * Math.abs(maxDeg) * Math.PI / 180 * fade;
}
