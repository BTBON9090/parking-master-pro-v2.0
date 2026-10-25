import { brakeResponse } from './braking';
import { CarConfig, CarType, VehicleTuning } from '../types';
import {
  FRAME_ACCEL_TO_MS2,
  PowertrainSpec,
  gearTopSpeed,
  isElectricVehicle,
  shiftTorqueBlend,
  tractionCapWithTransfer,
} from './powertrain';
import { approachExponential } from './timeStep';

/**
 * Longitudinal vehicle response (throttle, brake, engine braking, slope,
 * resistance, creep and engine-off drag) extracted from the render loop so it
 * is deterministic and testable.
 *
 * The caller passes the real elapsed time in 60 Hz frame units. Internally the
 * step is split into sub-steps of at most one 60 Hz frame, so a 30 fps frame
 * (2 units) produces exactly two 60 Hz steps, while a 120 fps frame (0.5)
 * produces one half step. This keeps the same throttle/brake script on the same
 * trajectory at 30/60/120 fps and removes the old 0.2–2.5 clamp distortion at
 * low frame rates.
 */

export interface LongitudinalInputs {
  gear: number;
  engineStarted: boolean;
  gasPressed: boolean;
  shiftPressed: boolean;
  /** Mobile/analogue throttle 0..1. */
  throttle: number;
  brake: number;
  handbrake: boolean;
  absEnabled?: boolean;
}

export interface LongitudinalState {
  speed: number;
  /** Smoothed throttle 0..1. */
  throttle: number;
  /** Smoothed brake pedal 0..1. */
  brakePedal: number;
  /** 0..1 clutch-to-clutch shift handover. */
  shiftProgress: number;
  overRevBlend: number;
  ignitionBlend: number;
  launchBlend: number;
  prevLongAccelMs2: number;
  /** Fractional 60 Hz frames carried to the next call (fixed-step accumulator). */
  pendingFrames: number;
  /** Consecutive stationary fixed steps with no throttle demand. */
  holdFrames: number;
  /** Consecutive high-gear / low-speed throttle steps before a stall. */
  stallTimer: number;
}

export interface LongitudinalContext {
  carId: CarType;
  cc: CarConfig;
  pt: PowertrainSpec;
  vehicleTune: VehicleTuning;
  /** Weather grip multiplier (1 dry, 0.62 rain, 0.38 snow). */
  weatherGrip: number;
  rollingResistanceScale?: number;
  /** Road grade projected onto the car heading (dh/dx, up positive). */
  slopeAlongCar: number;
  /** Shift duration in 60 Hz frames, already scaled by the car tuning. */
  tunedShiftFrames: number;
  /** Real elapsed time in 60 Hz frame units. */
  elapsedFrames: number;
}

export interface LongitudinalResult extends LongitudinalState {
  engineForce: number;
  brakeForce: number;
  emergencyBraking: boolean;
  frontLocked: boolean;
  rearLocked: boolean;
  lateralGripScale: number;
  absActive: boolean;
  gravityAlongSlope: number;
  clutchBlend: number;
  targetThrottle: number;
  longitudinalAcceleration: number;
  /** Stationary auto-hold is keeping the car at exactly zero speed. */
  autoHold: boolean;
  /** Combustion high-gear start stalled this step. */
  stalled: boolean;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const GRAVITY_PER_FRAME = 9.81 / FRAME_ACCEL_TO_MS2;
/** 1.25 s at 60 Hz. Enough for a visible lug before the engine dies. */
export const STALL_DELAY_FRAMES = 75;
export const LIGHT_THROTTLE = 0.15;
export const SHIFT_LIGHT_THROTTLE = 0.30;

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = clamp((value - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

const moveTowardZero = (value: number, amount: number) => {
  if (value > 0) return Math.max(0, value - amount);
  if (value < 0) return Math.min(0, value + amount);
  return 0;
};

export const createLongitudinalState = (speed = 0): LongitudinalState => ({
  speed,
  throttle: 0,
  brakePedal: 0,
  shiftProgress: 1,
  overRevBlend: 0,
  ignitionBlend: 0,
  launchBlend: 1,
  prevLongAccelMs2: 0,
  pendingFrames: 0,
  holdFrames: 0,
  stallTimer: 0,
});

/**
 * First-gear clutch/torque-converter take-up. A continuous mechanical
 * multiplier from 1.50 at rest to 1.00 by 3.0 speed units; no throttle or
 * speed hard switch. The engine force itself remains proportional to throttle.
 */
export function lowSpeedTakeupFactor(speed: number, gear: number): number {
  if (Math.abs(gear) !== 1) return 1;
  const x = Math.max(0, Math.min(1, (Math.abs(speed) - 0.1) / 2.9));
  const smooth = x * x * (3 - 2 * x);
  return 1 + 0.50 * (1 - smooth);
}

/**
 * Clutch/torque multiplication while a manual gear lugs below its comfortable
 * band. Third gear deliberately keeps more coupling than 4th/5th: a light
 * throttle with an automatic clutch can still creep away on flat ground,
 * whereas 4th/5th are dominated by the load and will stall. This is a
 * continuous curve (no "gear 3 is forbidden" switch) and the low gears remain
 * stronger.
 */
export function lugCouplingFactor(speed: number, gear: number): number {
  const gearAbs = Math.abs(gear);
  if (gearAbs < 3) return 1;
  const floor = gearAbs === 3 ? 0.90 : gearAbs === 4 ? 0.14 : 0.11;
  // Use the same comfortable-band boundary as the powertrain (resolved by the
  // caller through gearMin); this helper only needs a smooth 0..1 ramp.
  const x = Math.max(0, Math.min(1, Math.abs(speed) / 0.85));
  const coupling = Math.pow(x, 1.35);
  return floor + (1 - floor) * coupling;
}

export function stepLongitudinal(
  inputState: LongitudinalState,
  inputs: LongitudinalInputs,
  ctx: LongitudinalContext,
): LongitudinalResult {
  const state: LongitudinalState = { ...inputState };
  const totalFrames = Number.isFinite(ctx.elapsedFrames) ? Math.max(0, ctx.elapsedFrames) : 0;
  // True fixed 60 Hz stepping: 30 fps performs two whole steps, 120 fps
  // carries half a frame and performs one step every other render frame. This
  // makes the same input script bit-identical at 30/60/120 fps, rather than
  // merely close. Cap the catch-up burst; the render loop already skips gaps
  // longer than 250 ms instead of simulating them.
  const availableFrames = Math.max(0, state.pendingFrames) + totalFrames;
  const steps = Math.min(20, Math.floor(availableFrames + 1e-9));
  state.pendingFrames = availableFrames > 20 ? 0 : Math.max(0, availableFrames - steps);
  const h = 1;

  const speedStart = state.speed;
  let engineForce = 0;
  let brakeForce = 0;
  let emergencyBraking = false;
  let clutchBlend = 1;
  let targetThrottle = 0;
  let autoHold = state.holdFrames >= 4;
  let stalled = false;
  const gravityAlongSlope = -GRAVITY_PER_FRAME * ctx.slopeAlongCar;
  const electric = isElectricVehicle(ctx.carId) || ctx.pt.gearTops.length <= 1;

  for (let step = 0; step < steps; step++) {
    const speedBeforeStep = state.speed;

    // —— 换挡离合衔接（不改变车速，只短暂中断动力）——
    state.shiftProgress = Math.min(1, state.shiftProgress + h / Math.max(1, ctx.tunedShiftFrames));
    clutchBlend = shiftTorqueBlend(ctx.carId, state.shiftProgress);

    // —— 油门建立 / 释放 ——
    targetThrottle = inputs.gasPressed
      ? (inputs.shiftPressed ? SHIFT_LIGHT_THROTTLE : LIGHT_THROTTLE)
      : clamp(inputs.throttle, 0, 1);
    const throttleRampRate = ctx.cc.dynamics.throttleResponse
      * ctx.vehicleTune.throttleResponseScale
      * (inputs.gasPressed && !inputs.shiftPressed ? 0.8 : 1);
    if (targetThrottle > state.throttle) {
      state.throttle = Math.min(targetThrottle, state.throttle + throttleRampRate * h);
    } else if (targetThrottle < state.throttle) {
      const releaseRate = Math.max(
        0.014,
        ctx.cc.dynamics.throttleResponse * ctx.vehicleTune.throttleResponseScale * 1.25,
      );
      // A held light pedal must sit exactly at its target instead of
      // oscillating between "release" and "ramp" every frame.
      state.throttle = Math.max(targetThrottle, state.throttle - releaseRate * h);
    }

    // Round 7: no stationary auto-hold. A car on a gradient must roll when
    // the foot brake and handbrake are released. Flat ground still does not
    // creep because there is no throttle force and gravity is zero.
    const throttleDemand = inputs.gasPressed || inputs.throttle > 0.02 || state.throttle > 0.02;
    state.holdFrames = 0;
    autoHold = false;

    // —— 高挡低速结合：拖挡与熄火由“可用轮上扭矩 vs 实际负载”决定 ——
    // Fuel/manual training only; single-speed EVs never stall. A stalled
    // uphill car must keep whatever speed it had and be allowed to roll back;
    // zeroing the speed here was the old bug. Third gear is not a switch:
    // its coupling floor lets a light throttle creep on flat ground, while
    // 4th/5th fail under the same load. A steep gradient raises the load and
    // can stall 3rd too, which is expected clutch behaviour.
    const stallGear = Math.abs(inputs.gear);
    if (!electric && inputs.engineStarted && stallGear >= 3
      && Math.abs(state.speed) < 0.6 && throttleDemand && state.shiftProgress > 0.55) {
      const top = gearTopSpeed(ctx.pt, inputs.gear);
      const load = Math.abs(gravityAlongSlope) + ctx.pt.resistance(Math.abs(state.speed)) + 0.00002;
      const rpmRatio = Math.min(1, Math.abs(state.speed) / Math.max(0.1, top));
      const steadyDrive = state.throttle
        * ctx.pt.peakAccel[stallGear - 1]
        * ctx.pt.torqueMult(rpmRatio)
        * lugCouplingFactor(state.speed, inputs.gear)
        * ctx.vehicleTune.torqueScale;
      if (steadyDrive < load) {
        state.stallTimer += h;
        if (state.stallTimer >= STALL_DELAY_FRAMES) {
          stalled = true;
          state.throttle = 0;
          state.stallTimer = 0;
          engineForce = 0;
          break;
        }
      } else {
        state.stallTimer = 0;
      }
    } else {
      state.stallTimer = 0;
    }

    // —— 驱动力 ——
    engineForce = 0;
    if (inputs.gear !== 0 && inputs.engineStarted) {
      const gearAbs = Math.abs(inputs.gear);
      const top = gearTopSpeed(ctx.pt, inputs.gear);
      const gearMin = ctx.pt.gearMins[gearAbs - 1] || 0;
      const rpmRatio = Math.min(1, Math.abs(state.speed) / Math.max(0.1, top));
      const torqueMult = ctx.pt.torqueMult(rpmRatio);
      const peak = inputs.gear === -1 ? ctx.pt.reversePeakAccel : ctx.pt.peakAccel[gearAbs - 1];
      let a = state.throttle * peak * torqueMult * clutchBlend * ctx.vehicleTune.torqueScale;
      if (gearMin > 0 && Math.abs(state.speed) < gearMin) {
        // Continuous lug curve shared with the stall test. Third gear keeps
        // enough clutch coupling to creep from rest; 4th/5th do not.
        a *= lugCouplingFactor(state.speed, inputs.gear);
      }
      // One continuous first-gear take-up curve; throttle stays a pure
      // multiplier, so there is no jump at 0.05 throttle or 1.5/2 speed.
      a *= lowSpeedTakeupFactor(state.speed, inputs.gear);
      const cap = tractionCapWithTransfer(ctx.cc, state.prevLongAccelMs2) * ctx.weatherGrip;
      a = Math.min(a, cap);
      const vMsTraction = Math.max(1.2, Math.abs(state.speed) * 4.1667);
      const powerAccel = (ctx.cc.dynamics.powerKw * 1000) / Math.max(1, ctx.cc.weight) / vMsTraction;
      a = Math.min(a, powerAccel / FRAME_ACCEL_TO_MS2);
      state.ignitionBlend = Math.min(1, state.ignitionBlend + h / 30);
      if (Math.abs(state.speed) < 0.9 && state.throttle < 0.04) state.launchBlend = 0;
      const launching = Math.abs(state.speed) < 0.9
        && state.throttle > 0.04
        && !inputs.handbrake
        && inputs.brake === 0;
      if (launching) state.launchBlend = Math.min(1, state.launchBlend + h / 26);
      a *= (0.4 + 0.6 * (launching ? state.launchBlend : 1)) * state.ignitionBlend;
      a *= 1 - smoothstep(0.96, 1.01, Math.abs(state.speed) / top);
      engineForce = (inputs.gear === -1 ? -1 : 1) * a;
    } else {
      state.overRevBlend = 0;
      state.ignitionBlend = 0;
    }

    // —— 制动踏板行程与制动力 ——
    const brakeTarget = inputs.brake;
    const pedalRate = brakeTarget > state.brakePedal ? 0.30 : 0.55;
    state.brakePedal = approachExponential(state.brakePedal, brakeTarget, pedalRate, h);
    if (Math.abs(brakeTarget - state.brakePedal) < 0.01) state.brakePedal = brakeTarget;
    emergencyBraking = inputs.handbrake || state.brakePedal > 0.82;
    brakeForce = brakeResponse(state.brakePedal, inputs.handbrake, state.speed,
      inputs.absEnabled !== false, ctx.pt.brakeMax, ctx.weatherGrip).force;

    if (brakeForce > 0) {
      state.speed = moveTowardZero(state.speed, brakeForce * h);
    } else {
      state.speed += engineForce * h;
    }

    // —— 发动机制动 ——
    if (inputs.gear !== 0 && inputs.engineStarted) {
      const gearAbs = Math.abs(inputs.gear);
      const top = gearTopSpeed(ctx.pt, inputs.gear);
      const ratio = Math.abs(state.speed) / Math.max(0.1, top);
      const overRev = ratio > 1;
      if (overRev && state.shiftProgress >= 1) {
        state.overRevBlend = Math.min(1, state.overRevBlend + h / 55);
      } else {
        state.overRevBlend = 0;
      }
      if (state.shiftProgress >= 1 && (state.throttle < 0.03 || overRev)) {
        const rho = ctx.pt.effectiveRatios[Math.min(ctx.pt.effectiveRatios.length - 1, gearAbs - 1)] ?? 1;
        const strength = overRev ? 1.45 * state.overRevBlend : 1;
        const engineBrake = Math.min(
          ctx.pt.engineBrakeBase * ctx.vehicleTune.engineBrakeScale * rho
            * (0.35 + 0.65 * Math.min(1, ratio)) * strength,
          0.0088,
        );
        state.speed = moveTowardZero(state.speed, engineBrake * h);
      }
    } else {
      state.overRevBlend = 0;
      state.ignitionBlend = 0;
    }

    // —— 坡道重力与静止保持 ——
    // Foot brake can now hold the car just like the parking brake: when the
    // available brake force exceeds the gravity component and the car is
    // essentially stopped, the speed is pinned to exactly zero. This removes
    // the old 0 → gravity → brake-to-zero sawtooth that crept downhill while
    // the player was holding S. Releasing the brake restores the gravity term
    // and lets the car roll, as expected.
    const staticHold = brakeForce > Math.abs(gravityAlongSlope)
      && Math.abs(state.speed) < 0.12
      && (inputs.handbrake || state.brakePedal > 0.05);
    if (staticHold) state.speed = 0;
    else state.speed += gravityAlongSlope * h;

    // —— 滚阻 + 风阻 ——
    if (Math.abs(state.speed) > 0.0001) {
      state.speed = moveTowardZero(state.speed, ctx.pt.resistance(Math.abs(state.speed)) * (ctx.rollingResistanceScale ?? 1) * h);
    }

    // —— 熄火带挡：车轮反拖 ——
    if (!inputs.engineStarted && inputs.gear !== 0 && Math.abs(state.speed) > 0.02) {
      const gearAbs = Math.max(1, Math.abs(inputs.gear));
      const rho = ctx.pt.effectiveRatios[Math.min(ctx.pt.effectiveRatios.length - 1, gearAbs - 1)] ?? 1;
      const drag = ctx.pt.engineBrakeBase * ctx.vehicleTune.engineBrakeScale * rho * 1.65;
      state.speed = moveTowardZero(state.speed, drag * h);
    }

    state.speed = clamp(state.speed, -ctx.cc.maxSpeed, ctx.cc.maxSpeed);
    const direction = Math.sign(Math.abs(state.speed) > 0.02 ? state.speed : engineForce || 1);
    state.prevLongAccelMs2 = (state.speed - speedBeforeStep) * direction * FRAME_ACCEL_TO_MS2;
  }

  if (steps === 0) {
    // 120 Hz render frames that do not advance a 60 Hz physics step must still
    // report the current pedal state so skid audio / dashboards do not flicker.
    brakeForce = brakeResponse(state.brakePedal, inputs.handbrake, state.speed,
      inputs.absEnabled !== false, ctx.pt.brakeMax, ctx.weatherGrip).force;
    emergencyBraking = inputs.handbrake || state.brakePedal > 0.82;
    clutchBlend = shiftTorqueBlend(ctx.carId, state.shiftProgress);
    targetThrottle = inputs.gasPressed ? (inputs.shiftPressed ? SHIFT_LIGHT_THROTTLE : LIGHT_THROTTLE) : clamp(inputs.throttle, 0, 1);
  }
  const direction = Math.sign(Math.abs(state.speed) > 0.02 ? state.speed : engineForce || 1);
  const longitudinalAcceleration = steps > 0
    ? ((state.speed - speedStart) * direction) / steps
    : 0;
  // Feed the next frame's traction-transfer model with the frame-average
  // acceleration instead of the last sub-step, so 30/60/120 fps agree. A
  // 120 Hz render frame that carried no full physics step keeps the previous
  // value; zeroing it would alternate the load transfer every frame.
  if (steps > 0) {
    state.prevLongAccelMs2 = longitudinalAcceleration * FRAME_ACCEL_TO_MS2;
  }

  return {
    ...state,
    ...brakeResponse(state.brakePedal, inputs.handbrake, state.speed, inputs.absEnabled !== false, ctx.pt.brakeMax, ctx.weatherGrip),
    engineForce,
    brakeForce,
    emergencyBraking,
    gravityAlongSlope,
    clutchBlend,
    targetThrottle,
    longitudinalAcceleration,
    autoHold,
    stalled,
  };
}
