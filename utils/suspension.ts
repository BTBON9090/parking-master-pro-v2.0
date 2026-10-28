import { CarType } from '../types';

/**
 * Central per-car suspension training calibration.
 * Wheels are simulated in SI units (m, s, kg, N/m, N·s/m); game offsets are
 * converted by GAME_UNITS_PER_METRE. This is a simplified 1-DOF-per-wheel
 * model, not a professional vehicle solver.
 */
export interface SuspensionSpec {
  massKg: number;
  /** Body/road attitude response (legacy body model). */
  bodyResponse: number;
  roll: number;
  /** Spring calibration, converted to N/m by SPRING_SCALE. */
  spring: number;
  /** Damping ratio (not a per-frame multiplier). */
  damping: number;
  /** Symmetric legacy travel bound in game units (1 unit = 0.1 m). */
  travel: number;
  /** One-wheel bump (compression) travel. Kept separate from droop so a
   *  single-wheel curb is absorbed by that corner instead of lifting the
   *  whole body. Simulated calibration, not OEM wheel-travel data. */
  bumpTravel?: number;
  /** Rebound/droop travel used to keep the other three tyres grounded. */
  droopTravel?: number;
  antiRoll: number;
}

export const GAME_UNITS_PER_METRE = 10;
export const SPRING_SCALE = 500000; // N/m per spec.spring unit

const SPECS: Record<CarType, SuspensionSpec> = {
[CarType.TYPE100]:{massKg:42000,bodyResponse:.08,roll:.55,spring:1.2,damping:.8,travel:2,bumpTravel:3.5,droopTravel:2.5,antiRoll:.6},
[CarType.MINING]:{massKg:260000,bodyResponse:.08,roll:.55,spring:6.5,damping:.8,travel:2,bumpTravel:3.5,droopTravel:2.5,antiRoll:.6},
[CarType.US22]:{massKg:44000,bodyResponse:.08,roll:.55,spring:1.2,damping:.8,travel:2,bumpTravel:3.5,droopTravel:2.5,antiRoll:.6},

[CarType.TRIKE]:{massKg:970,bodyResponse:.08,roll:.65,spring:0.06,damping:0.62,travel:1,bumpTravel:2.6,droopTravel:1.5,antiRoll:0.35},
[CarType.TRACTOR]:{massKg:7800,bodyResponse:.08,roll:.65,spring:0.24,damping:0.65,travel:1,bumpTravel:2.4,droopTravel:1.5,antiRoll:0.35},
[CarType.SEMI]:{massKg:36000,bodyResponse:.08,roll:.65,spring:1.0,damping:0.78,travel:1,bumpTravel:2.1,droopTravel:1.5,antiRoll:0.55},
[CarType.CYBERTRUCK]:{massKg:3009,bodyResponse:.08,roll:.65,spring:0.14,damping:0.85,travel:1,bumpTravel:2.4,droopTravel:1.5,antiRoll:0.7},
[CarType.REVUELTO]:{massKg:1900,bodyResponse:.08,roll:.65,spring:0.18,damping:0.85,travel:1,bumpTravel:0.95,droopTravel:1.5,antiRoll:0.85},
[CarType.VEYRON]:{massKg:1968,bodyResponse:.08,roll:.65,spring:0.17,damping:0.85,travel:1,bumpTravel:1.1,droopTravel:1.5,antiRoll:0.85},
[CarType.V800]:{massKg:3120,bodyResponse:.08,roll:.65,spring:0.14,damping:0.9,travel:1,bumpTravel:2.1,droopTravel:1.5,antiRoll:0.78},
[CarType.MINI]:{massKg:1285,bodyResponse:.08,roll:.65,spring:0.09,damping:0.78,travel:1,bumpTravel:1.4,droopTravel:1.5,antiRoll:0.75},

  [CarType.JEEP]:{massKg:2050,bodyResponse:.075,roll:.72,spring:.075,damping:.72,travel:1.5,bumpTravel:2.8,droopTravel:1.7,antiRoll:.43},
  [CarType.MIDIBUS]:{massKg:4500,bodyResponse:.065,roll:.7,spring:.16,damping:.78,travel:1.1,bumpTravel:2,droopTravel:1.3,antiRoll:.55},
  [CarType.COACH]:{massKg:13000,bodyResponse:.075,roll:.66,spring:.32,damping:.88,travel:1.0,bumpTravel:1.8,droopTravel:1.3,antiRoll:.65},
  [CarType.VAN]:{massKg:2650,bodyResponse:.07,roll:.7,spring:.09,damping:.72,travel:1.2,bumpTravel:2.2,droopTravel:1.4,antiRoll:.48},
  [CarType.LIGHT_TRUCK]:{massKg:6200,bodyResponse:.07,roll:.73,spring:.19,damping:.67,travel:1.3,bumpTravel:2.4,droopTravel:1.5,antiRoll:.5},
  // Distinct simulation calibrations; OEM damping maps and wheel travel are not published.
  [CarType.TAI7]: {massKg:2495,bodyResponse:.085,roll:.66,spring:.095,damping:.84,travel:1.2,bumpTravel:2.3,droopTravel:1.5,antiRoll:.58},
  [CarType.LI_I9]: {massKg:2745,bodyResponse:.08,roll:.58,spring:.105,damping:.88,travel:1.15,bumpTravel:2.05,droopTravel:1.4,antiRoll:.7},
  [CarType.N90]: {massKg:2650,bodyResponse:.08,roll:.63,spring:.10,damping:.83,travel:1.15,bumpTravel:2.15,droopTravel:1.45,antiRoll:.64},
  [CarType.SEDAN]: { massKg: 2145, bodyResponse: 0.10, roll: 0.56, spring: 0.11, damping: 0.75, travel: 0.95, bumpTravel: 1.95, droopTravel: 1.40, antiRoll: 0.54 },
  [CarType.SEAL08]: { massKg: 2160, bodyResponse: 0.10, roll: 0.52, spring: 0.12, damping: 0.73, travel: 0.82, bumpTravel: 1.95, droopTravel: 1.40, antiRoll: 0.74 },
  [CarType.SUV]: { massKg: 2360, bodyResponse: 0.085, roll: 0.68, spring: 0.09, damping: 0.78, travel: 1.10, bumpTravel: 1.95, droopTravel: 1.40, antiRoll: 0.66 },
  [CarType.SPORTS]: { massKg: 1300, bodyResponse: 0.12, roll: 0.48, spring: 0.14, damping: 0.70, travel: 0.42, bumpTravel: 1.60, droopTravel: 0.80, antiRoll: 0.42 },
  [CarType.TRUCK]: { massKg: 2200, bodyResponse: 0.075, roll: 0.62, spring: 0.075, damping: 0.68, travel: 1.35, bumpTravel: 2.60, droopTravel: 1.10, antiRoll: 0.58 },
  [CarType.SU7]: { massKg: 2200, bodyResponse: 0.108, roll: 0.50, spring: 0.125, damping: 0.72, travel: 0.50, bumpTravel: 1.60, droopTravel: 0.85, antiRoll: 0.76 },
  [CarType.YU7]: { massKg: 2400, bodyResponse: 0.09, roll: 0.64, spring: 0.095, damping: 0.77, travel: 0.82, bumpTravel: 2.00, droopTravel: 1.00, antiRoll: 0.58 },
  [CarType.ZUNJIE]: { massKg: 2600, bodyResponse: 0.082, roll: 0.52, spring: 0.088, damping: 0.80, travel: 0.62, bumpTravel: 1.80, droopTravel: 0.90, antiRoll: 0.72 },
};

export function suspensionForCar(id: CarType): SuspensionSpec {
  return { ...SPECS[id] };
}

/** Vehicle-local +X is LEFT, +Y is UP, +Z is FORWARD. A positive
 * rotation about Z raises +X, so the higher left contact needs positive roll.
 * Keep this separate from camera/screen left and right. */
export function roadRollTargetRad(leftHeight: number, rightHeight: number, trackWidth: number): number {
  return Math.atan2(leftHeight - rightHeight, Math.max(1, trackWidth));
}

export interface SuspensionState {
  /** Four wheel offsets in metres, in mount order. */
  offsetsM: number[];
  velocitiesM: number[];
}

export interface SuspensionStepResult {
  /** Four offsets in game units, in mount order. */
  offsetsGameUnits: number[];
  /** Heave (average compression) in game units. */
  bodyHeave: number;
  bodyPitchRad: number;
  bodyRollRad: number;
  maxTravelUsed: number;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export function createSuspensionState(wheelCount = 4): SuspensionState {
  return {
    offsetsM: Array.from({ length: wheelCount }, () => 0),
    velocitiesM: Array.from({ length: wheelCount }, () => 0),
  };
}

/**
 * Shared runtime/test step. `desiredOffsetsGameUnits` are the contact-height
 * errors at the four real wheel centres (not GLB local mount positions).
 * `positions` are those wheel centres in vehicle local game units (x left,
 * z forward). Fixed 1/240 s substeps make the same bump stable at 15–120 Hz.
 */
export function stepSuspension(
  state: SuspensionState,
  spec: SuspensionSpec,
  dtSeconds: number,
  desiredOffsetsGameUnits: number[],
  positions: Array<{ x: number; z: number }>,
): SuspensionStepResult {
  const dt = Math.max(0, Math.min(0.25, Number.isFinite(dtSeconds) ? dtSeconds : 0));
  const count = Math.max(1, Math.min(state.offsetsM.length, desiredOffsetsGameUnits.length));
  const mCorner = Math.max(50, spec.massKg / Math.max(1, count));
  const k = spec.spring * SPRING_SCALE; // N/m
  const zeta = Math.max(0.1, spec.damping);
  const c = 2 * zeta * Math.sqrt(k * mCorner); // N·s/m
  const bumpM = (spec.bumpTravel ?? spec.travel) / GAME_UNITS_PER_METRE;
  const droopM = (spec.droopTravel ?? spec.travel) / GAME_UNITS_PER_METRE;
  const sub = Math.max(1, Math.ceil(dt / (1 / 240)));
  const h = sub > 0 ? dt / sub : 0;
  for (let s = 0; s < sub; s++) {
    for (let i = 0; i < count; i++) {
      const desiredM = clamp(desiredOffsetsGameUnits[i] / GAME_UNITS_PER_METRE, -droopM, bumpM);
      const error = desiredM - state.offsetsM[i];
      const acceleration = (k * error - c * state.velocitiesM[i]) / mCorner;
      state.velocitiesM[i] += acceleration * h;
      state.offsetsM[i] = clamp(state.offsetsM[i] + state.velocitiesM[i] * h, -droopM, bumpM);
      if (state.offsetsM[i] >= bumpM - 1e-6 || state.offsetsM[i] <= -droopM + 1e-6) state.velocitiesM[i] = 0;
    }
  }
  const offsetsGameUnits = state.offsetsM.map(value => value * GAME_UNITS_PER_METRE);
  const average = offsetsGameUnits.slice(0, count).reduce((sum, value) => sum + value, 0) / count;
  const front = positions.filter(pos => pos.z > 0);
  const rear = positions.filter(pos => pos.z <= 0);
  const left = positions.filter(pos => pos.x > 0);
  const right = positions.filter(pos => pos.x <= 0);
  const avgFor = (list: Array<{ x: number; z: number }>) => {
    if (!list.length) return average;
    const indexes = list.map(pos => positions.indexOf(pos)).filter(index => index >= 0 && index < count);
    return indexes.length ? indexes.reduce((sum, index) => sum + offsetsGameUnits[index], 0) / indexes.length : average;
  };
  const wheelbase = Math.max(1, Math.abs((front[0]?.z ?? 0) - (rear[0]?.z ?? 0)));
  const track = Math.max(1, Math.abs((left[0]?.x ?? 0) - (right[0]?.x ?? 0)));
  const bodyPitchRad = Math.atan2((avgFor(front) - avgFor(rear)) / GAME_UNITS_PER_METRE, wheelbase / GAME_UNITS_PER_METRE);
  const bodyRollRad = Math.atan2((avgFor(left) - avgFor(right)) / GAME_UNITS_PER_METRE, track / GAME_UNITS_PER_METRE);
  return {
    offsetsGameUnits,
    bodyHeave: average,
    bodyPitchRad,
    bodyRollRad,
    maxTravelUsed: Math.max(...offsetsGameUnits.map(value => Math.abs(value))),
  };
}

/** Contact-constrained unsprung wheels. Springs may lag the body, never let
 * the tyre lag INTO solid ground. Extension has unsprung inertia, so a wheel
 * leaving a kerb drops/rebounds instead of teleporting down onto the road. */
export function stepContactSuspension(
  state: SuspensionState, spec: SuspensionSpec, dtSeconds: number,
  desiredOffsetsGameUnits: number[],
): number[] {
  const dt=clamp(dtSeconds,0,.25);
  const bump=(spec.bumpTravel ?? spec.travel)/GAME_UNITS_PER_METRE;
  const droop=(spec.droopTravel ?? spec.travel)/GAME_UNITS_PER_METRE;
  const unsprungMass=55; // simulated wheel/hub mass, not a quarter of the car
  const extensionAcceleration=9.80665*(1+spec.massKg/4/unsprungMass);
  const count=Math.max(1,Math.ceil(dt*240)), h=dt/count;
  for(let i=0;i<state.offsetsM.length;i++) {
    const contact=desiredOffsetsGameUnits[i]/GAME_UNITS_PER_METRE;
    for(let step=0;step<count;step++) {
      state.velocitiesM[i]=Math.max(-3,state.velocitiesM[i]-extensionAcceleration*h);
      state.offsetsM[i]=Math.max(-droop,state.offsetsM[i]+state.velocitiesM[i]*h);
      if(state.offsetsM[i]<=contact) {
        state.offsetsM[i]=Math.min(bump,contact);
        state.velocitiesM[i]=0;
      }
    }
  }
  return state.offsetsM.map(value=>value*GAME_UNITS_PER_METRE);
}

export interface SprungHeaveState { height: number; velocity: number; }
/** Four corner springs support the body mass. Critical damping is scaled by
 * the per-car damping ratio; game units cancel in this linear ODE. */
export function stepSprungHeave(state: SprungHeaveState, target: number, spec: SuspensionSpec, dt: number): number {
  const omega2=4*spec.spring*SPRING_SCALE/spec.massKg;
  const damping=2*spec.damping*Math.sqrt(omega2);
  const count=Math.max(1,Math.ceil(Math.min(dt,.25)*240)), h=Math.min(dt,.25)/count;
  for(let i=0;i<count;i++) {
    state.velocity+=(omega2*(target-state.height)-damping*state.velocity)*h;
    state.height+=state.velocity*h;
  }
  return state.height;
}

/** Shared test/runtime-style bump: distance-driven, so speed changes the input. */
export function simulateSuspensionBump(spec: SuspensionSpec, fps: number, speedMps: number): { maxTravel: number; maxPitch: number; maxRoll: number; maxHeave: number; finalOffset: number; maxVelocity: number; settled: boolean } {
  const state = createSuspensionState(4);
  const dt = 1 / Math.max(1, fps);
  const frames = Math.round(fps * 2.2);
  let maxTravel = 0;
  let maxPitch = 0;
  let maxRoll = 0;
  let maxHeave = 0;
  let maxVelocity = 0;
  for (let i = 0; i < frames; i++) {
    const t = i / Math.max(1, fps);
    const distance = speedMps * t;
    const bump = distance > 3 && distance < 9 ? Math.sin(Math.PI * (distance - 3) / 6) * 0.18 : 0;
    const desired = [bump, bump * 0.9, bump * 0.7, bump * 0.8];
    const positions = [{x:-8,z:15},{x:8,z:15},{x:-8,z:-14},{x:8,z:-14}];
    const result = stepSuspension(state, spec, dt, desired, positions);
    maxTravel = Math.max(maxTravel, result.maxTravelUsed);
    maxPitch = Math.max(maxPitch, Math.abs(result.bodyPitchRad));
    maxRoll = Math.max(maxRoll, Math.abs(result.bodyRollRad));
    maxHeave = Math.max(maxHeave, Math.abs(result.bodyHeave));
    maxVelocity = Math.max(maxVelocity, ...state.velocitiesM.map(Math.abs));
  }
  return {
    maxTravel,
    maxPitch,
    maxRoll,
    maxHeave,
    finalOffset: Math.abs(state.offsetsM[0]),
    maxVelocity,
    settled: Math.abs(state.offsetsM[0]) < 0.005,
  };
}
