import { CarConfig, CarType } from '../types';
import { CAR_MODELS, STEERING_WHEEL_MAX_ROTATION } from '../constants';

/**
 * 真实动力总成模型
 * ----------------
 * 每台车的驱动表现由公开车况数据推导：变速箱齿比、主减速比、轮径、
 * 转速区间、功率/扭矩、整备质量、驱动形式与轮胎抓地。模型输出：
 *   - 各挡极速（由红线转速 × 齿比 × 主减速比 × 轮胎半径直接推导）
 *   - 各挡峰值加速度（按真实"低挡猛、高挡缓"的齿比分布，再用
 *     官方 0-100 km/h 时间做数值标定）
 *   - 扭矩曲线（按车型性格：家用 / 涡轮 / 高转 / 柴油）
 *   - 发动机制动、换挡离合衔接时长、刹车减速度
 *
 * 游戏单位约定：
 *   车速 1 unit/frame = 15 km/h（与仪表显示一致），物理 60 fps。
 *   因此 1 frame 加速度单位 = 15 km/h / 3.6 × 60 = 250 m/s²。
 */

export const SPEED_UNIT_KMH = 15;
export const TRAVEL_PER_SPEED_FRAME = SPEED_UNIT_KMH / 3.6 * 10 / 60;
/** 1 per-frame accel unit corresponds to 250 m/s². */
export const FRAME_ACCEL_TO_MS2 = 250;
/** Gravity expressed in per-frame accel units (≈0.03924). */
export const GRAVITY_FRAME = 9.81 / FRAME_ACCEL_TO_MS2;
/** The world is drawn and simulated at 10 units per metre. */
export const WORLD_UNITS_PER_METRE = 10;
/**
 * One game speed unit is 15 km/h. The Cannon world integrates in metres and
 * seconds, so a body velocity must be converted to world units per second:
 * 15 km/h = 4.1667 m/s = 41.6667 world units/s. Passing the raw speed unit to
 * CANNON.make cones/barriers react ~42× too slowly (and made impacts read in
 * the wrong units).
 */
export const SPEED_UNIT_TO_WORLD_PER_SECOND = SPEED_UNIT_KMH / 3.6 * WORLD_UNITS_PER_METRE;

/** Convert the player's game speed to a Cannon body velocity (units/s). */
export function gameSpeedToWorldVelocity(speed: number): number {
  return speed * SPEED_UNIT_TO_WORLD_PER_SECOND;
}

/** Convert a Cannon contact impact (units/s) back to game speed units. */
export function worldImpactToGameSpeed(impact: number): number {
  return impact / SPEED_UNIT_TO_WORLD_PER_SECOND;
}

export interface PowertrainSpec {
  idleRpm: number;
  redlineRpm: number;
  /** Per-forward-gear top speed at redline, in speed units. Index 0 = 1st. */
  gearTops: number[];
  /** Recommended lower bound for each gear, in game speed units. A value of
   *  zero means the gear has no training-range lower bound. */
  gearMins: number[];
  /** Game-training upshift suggestion (km/h), not a mechanical redline. */
  shiftUpKmh: number[];
  /** Normal-use band (km/h) for HUD; distinct from mechanical redline. */
  normalBandMinKmh: number[];
  normalBandMaxKmh: number[];
  reverseTop: number;
  /** Effective ratio per gear relative to 5th (ρ_g = ratio_g / ratio_5). */
  effectiveRatios: number[];
  reverseEffRatio: number;
  /** Calibrated peak wheel acceleration per gear (per-frame, dry asphalt,
   *  before the traction cap). Index 0 = 1st. */
  peakAccel: number[];
  reversePeakAccel: number;
  /** Tyre-limited acceleration cap (per-frame, dry, static load). Weather
   *  scales it; the game loop adds acceleration weight transfer on top. */
  tractionCap: number;
  /** Physical road-load resistance (rolling + aerodynamic), per-frame decel
   *  at the given speed in speed units. Replaces the old global DRAG and
   *  FRICTION multipliers. */
  resistance: (speedUnits: number) => number;
  /** Engine torque multiplier across the rev band (rpmRatio 0..1 → 0..1+). */
  torqueMult: (rpmRatio: number) => number;
  /** Engine-braking decel at ρ=1 mid rpm (per-frame). Scales with ratio. */
  engineBrakeBase: number;
  /** Clutch-to-clutch shift duration in frames (AT-style torque hole). */
  shiftFrames: number;
  /** Full-brake decel (per-frame, dry). Weather scales it. */
  brakeMax: number;
  handbrakeMax: number;
  /** Echo of the raw data, for the tuning panel's spec sheet. */
  gearRatios: number[];
  finalDrive: number;
  wheelRadiusM: number;
  /** Simulated 0-100 km/h from the physical torque/ratio model (seconds); not used as a calibration target. */
  zeroTo100Measured: number;
  /** Steering wheel lock angle (deg, one side). Echoed from the car config so
   *  the tuning panel can read it from the cached powertrain spec. */
  steerWheelMaxDeg: number;
}

// —— 各车型扭矩曲线性格（分段线性：rpmRatio → 扭矩倍率）——
// 家用车：中段饱满，高转衰减；SUV：涡轮平原；跑车：高转爆发；皮卡：低速大扭矩、高转乏力。
const TORQUE_CURVES: Record<CarType, [number, number][]> = {
  [CarType.JEEP]:[[0,.75],[.2,.96],[.4,1],[.7,.88],[1,.68]],
  [CarType.MIDIBUS]:[[0,.8],[.2,1],[.5,.98],[.8,.78],[1,.60]],
  [CarType.COACH]:[[0,.8],[.2,1],[.5,.98],[.8,.78],[1,.60]],
  [CarType.VAN]:[[0,.75],[.2,.96],[.4,1],[.7,.88],[1,.68]],
  [CarType.LIGHT_TRUCK]:[[0,.8],[.2,1],[.5,.98],[.8,.78],[1,.60]],
  [CarType.TAI7]: [[0,1],[.45,1],[.65,.96],[.9,.80],[1,.66]],
  [CarType.LI_I9]: [[0,1],[.45,1],[.65,.96],[.9,.80],[1,.66]],
  [CarType.N90]: [[0,1],[.45,1],[.65,.96],[.9,.80],[1,.66]],
  [CarType.SEDAN]: [[0, 0.72], [0.15, 0.86], [0.35, 1.0], [0.6, 1.0], [0.85, 0.9], [1, 0.82]],
  // 海豹 08 EV：后永磁同步，恒扭矩区到约 55% 转速
  [CarType.SEAL08]: [[0, 1.0], [0.5, 1.0], [0.65, 0.96], [0.82, 0.86], [0.93, 0.75], [1, 0.62]],
  // L80 electric training tune: available low-speed motor torque must not
  // inherit the old combustion SUV's 30% idle-torque deficit.
  [CarType.SUV]: [[0, 1.0], [0.45, 1.0], [0.65, 0.96], [0.9, 0.80], [1, 0.66]],
  [CarType.SPORTS]: [[0, 0.6], [0.2, 0.75], [0.4, 0.88], [0.65, 1.0], [0.88, 1.0], [1, 0.9]],
  [CarType.TRUCK]: [[0, 0.85], [0.18, 1.0], [0.45, 1.0], [0.7, 0.82], [1, 0.6]],
  // 小米 SU7：永磁同步电机，恒扭矩区到 50% 转速后转入恒功率
  [CarType.SU7]: [[0, 1.0], [0.45, 1.0], [0.62, 0.96], [0.8, 0.86], [0.92, 0.76], [1, 0.62]],
  // 小米 YU7：同为双电机四驱，恒扭矩区略窄、后段更早衰减
  [CarType.YU7]: [[0, 1.0], [0.42, 1.0], [0.58, 0.95], [0.78, 0.84], [0.9, 0.74], [1, 0.6]],
  // 尊界 V8：4.0T 双涡轮，低转扭矩饱满、6000 rpm 后明显衰减
  [CarType.ZUNJIE]: [[0, 0.78], [0.14, 0.95], [0.3, 1.0], [0.58, 1.0], [0.82, 0.92], [1, 0.8]],
};

const evalCurve = (points: [number, number][], x: number): number => {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    if (x <= points[i][0]) {
      const [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      const t = (x - x0) / (x1 - x0);
      return y0 + (y1 - y0) * t;
    }
  }
  return points[points.length - 1][1];
};

/** Driven-axle static load fraction: how much weight sits on the driven wheels. */
const drivenAxleLoad = (cc: CarConfig): number => {
  if (cc.dynamics.driveLayout === 'AWD') return 1;
  if (cc.dynamics.driveLayout === 'FWD') return cc.dynamics.frontWeightBias;
  return 1 - cc.dynamics.frontWeightBias;
};

/**
 * Traction cap including longitudinal weight transfer. Under acceleration a
 * the rear axle gains m·a·h/L of load: RWD launches harder, FWD lighter.
 * `currentAccelMs2` is the vehicle's present acceleration (0 when unknown).
 */
export const tractionCapWithTransfer = (cc: CarConfig, currentAccelMs2: number): number => {
  const staticLoad = drivenAxleLoad(cc);
  if (cc.dynamics.driveLayout === 'AWD') return cc.dynamics.grip * GRAVITY_FRAME;
  const wheelbaseM = cc.wheelbase / 10; // game is 10 units per metre
  const transfer = Math.max(-0.2, Math.min(0.25,
    (currentAccelMs2 * cc.dynamics.cgHeightM) / (wheelbaseM * 9.81)));
  const load = cc.dynamics.driveLayout === 'FWD'
    ? staticLoad - transfer
    : staticLoad + transfer;
  return cc.dynamics.grip * Math.max(0.3, load) * GRAVITY_FRAME;
};

/** Physical road-load resistance build-up for one car. */
const buildResistance = (cc: CarConfig): ((speedUnits: number) => number) => {
  // Rolling resistance ≈ 0.013 g for passenger tyres, a touch more for the
  // truck's all-terrain rubber.
  const rolling = (cc.id === CarType.TRUCK ? 0.15 : 0.13) / FRAME_ACCEL_TO_MS2;
  // a = ½ρ·CdA·v²/m with v_real = v_units × (15/3.6) m/s, expressed per frame.
  const aeroK = ((0.5 * 1.225 * cc.dynamics.dragAreaM2) / cc.weight)
    * Math.pow(SPEED_UNIT_KMH / 3.6, 2) / FRAME_ACCEL_TO_MS2;
  return (v) => rolling + aeroK * v * v;
};

/**
 * Simulate a flat-out 0-100 km/h run with the same integration order the
 * game loop uses (force → resistance), including throttle ramp-in, dynamic
 * traction cap (weight transfer) and shift pauses. Returns elapsed seconds.
 */
const simulateZeroTo100 = (
  cc: CarConfig,
  A: number,
  gearTops: number[],
  effectiveRatios: number[],
  resistance: (v: number) => number,
  torqueMult: (r: number) => number,
  shiftFrames: number,
): number => {
  const TARGET = 100 / SPEED_UNIT_KMH;
  let v = 0;
  let gear = 0; // index into forward gears
  let throttle = 0;
  let shiftLeft = 0;
  let prevAccelMs2 = 0;
  for (let frame = 0; frame < 60 * 90; frame++) {
    throttle = Math.min(1, throttle + cc.dynamics.throttleResponse);
    const top = gearTops[gear];
    const shiftProgress = 1 - shiftLeft / Math.max(1,shiftFrames);
    const clutch = shiftTorqueBlend(cc.id, shiftProgress);
    if(shiftLeft>0) shiftLeft--;
    const a = Math.min(
      A * effectiveRatios[gear] * torqueMult(Math.min(1,v/top)) * throttle * clutch,
      tractionCapWithTransfer(cc,prevAccelMs2),
      cc.dynamics.powerKw * 1000 / cc.weight / Math.max(1.2,v*SPEED_UNIT_KMH/3.6) / FRAME_ACCEL_TO_MS2,
    ) * Math.min(1,(frame+1)/30);
    v += a;
    prevAccelMs2 = a * FRAME_ACCEL_TO_MS2;
    v = Math.max(0, v - resistance(v));
    if (v >= TARGET) return frame / 60;
    if (gear < gearTops.length - 1 && v >= gearTops[gear] * 0.97) {
      gear++;
      shiftLeft = shiftFrames;
    }
  }
  return Infinity;
};

// Game-training shift suggestions, deliberately distinct from redline speeds.
// They are not manufacturer shift points or universal real-car figures.
const SHIFT_UP_KMH: Record<CarType, number[]> = {
 [CarType.JEEP]:[18,34,53,78,110], [CarType.MIDIBUS]:[14,26,42,62,85],
 [CarType.COACH]:[12,22,36,54,80], [CarType.VAN]:[16,30,48,72,100], [CarType.LIGHT_TRUCK]:[13,25,40,60,85],
 [CarType.TAI7]:[120], [CarType.LI_I9]:[120], [CarType.N90]:[120],
  [CarType.SEDAN]: [20, 38, 58, 85, 120],
  [CarType.SEAL08]: [120],
  [CarType.SUV]: [120],
  [CarType.SPORTS]: [35, 65, 100, 150, 200],
  [CarType.TRUCK]: [16, 32, 50, 75, 95],
  [CarType.SU7]: [120],
  [CarType.YU7]: [120],
  [CarType.ZUNJIE]: [28, 55, 90, 130, 180],
};

const buildPowertrain = (cc: CarConfig): PowertrainSpec => {
  const tx = cc.dynamics.transmission;

  // Real per-gear top speed at redline: v = (rpm/60)·2πr / (ratio·FD).
  const realTopKmh = (ratio: number) =>
    ((tx.redlineRpm / 60) * (2 * Math.PI * tx.wheelRadiusM)) / (ratio * tx.finalDrive) * 3.6;
  // Preserve the real mechanical result instead of compressing every gear so
  // fifth happens to equal the former low game-map speed. Each forward gear
  // reaches the smaller of its redline speed and the vehicle speed limiter.
  const gearTops = tx.gearRatios.map(r => realTopKmh(r) / SPEED_UNIT_KMH);
  // Lower "comfortable pull" band for each gear. This is used to soften the
  // clutch coupling and to warn about high-gear lugging, not as a hard lock.
  // The first two gears keep zero so the automatic low-gear clutch assist
  // remains available for hill starts and parking manoeuvres.
  const idleRatio = tx.redlineRpm > 0 ? tx.idleRpm / tx.redlineRpm : 0;
  const gearMins = tx.gearRatios.map((_, index) =>
    index >= 2 ? gearTops[index] * Math.max(0.06, idleRatio) * 0.9 : 0,
  );
  // Reverse is ECU-limited for a training simulator even when the raw ratio
  // would mechanically permit more speed.
  const reverseTop = Math.min(realTopKmh(tx.reverseRatio), 45) / SPEED_UNIT_KMH;

  const top5 = tx.gearRatios[tx.gearRatios.length - 1];
  const effectiveRatios = tx.gearRatios.map(r => r / top5);
  const reverseEffRatio = tx.reverseRatio / top5;

  const tractionCap = cc.dynamics.grip * drivenAxleLoad(cc) * GRAVITY_FRAME;
  const resistance = buildResistance(cc);
  const torqueMult = (r: number) => evalCurve(TORQUE_CURVES[cc.id], r);

  // Physical training tractive-effort scalar: engine torque × top gear ×
  // final drive / wheel radius / mass. There is no 0-100 secant calibration
  // here; calibration used to weaken low gears and boost high gears invisibly.
  const topGearRatio = tx.gearRatios[tx.gearRatios.length - 1];
  const drivetrainEfficiency = 0.90;
  const wheelForceN = cc.dynamics.torqueNm * topGearRatio * tx.finalDrive * drivetrainEfficiency / Math.max(0.01, tx.wheelRadiusM);
  const driveAccelMs2 = wheelForceN / Math.max(1, cc.weight);
  const A = driveAccelMs2 / FRAME_ACCEL_TO_MS2;
  const measured = simulateZeroTo100(cc, A, gearTops, effectiveRatios, resistance, torqueMult, shiftFramesFor(cc.id));

  // Braking is tyre-limited, not weight-limited: real cars all stop at
  // ~0.75-1.05 g depending on tyre and load. Grip coefficient stands in for
  // tyre compound; heavy pickups sit at the bottom of the band.
  const brakeMax = cc.dynamics.grip * 0.95 * GRAVITY_FRAME;

  return {
    idleRpm: tx.idleRpm,
    redlineRpm: tx.redlineRpm,
    gearTops,
    gearMins,
    shiftUpKmh: SHIFT_UP_KMH[cc.id].slice(0, gearTops.length),
    normalBandMaxKmh: SHIFT_UP_KMH[cc.id].slice(0, gearTops.length),
    normalBandMinKmh: SHIFT_UP_KMH[cc.id].slice(0, gearTops.length).map((_, index) =>
      index === 0 ? 0 : Math.round(SHIFT_UP_KMH[cc.id][index - 1] * 0.8),
    ),
    reverseTop,
    effectiveRatios,
    reverseEffRatio,
    peakAccel: effectiveRatios.map(rho => A * rho),
    reversePeakAccel: A * reverseEffRatio,
    tractionCap,
    resistance,
    torqueMult,
    engineBrakeBase: cc.id === CarType.TRUCK ? 0.4 / FRAME_ACCEL_TO_MS2 : 0.25 / FRAME_ACCEL_TO_MS2,
    shiftFrames: shiftFramesFor(cc.id),
    brakeMax,
    handbrakeMax: brakeMax * 0.55,
    gearRatios: tx.gearRatios,
    finalDrive: tx.finalDrive,
    wheelRadiusM: tx.wheelRadiusM,
    zeroTo100Measured: measured,
    steerWheelMaxDeg: steeringWheelMaxDeg(cc),
  };
};

/** Clutch-to-clutch shift time: sports boxes snap, truck boxes lumber. */
function shiftFramesFor(id: CarType): number {
  switch (id) {
    case CarType.SPORTS: return 10;
    case CarType.SEDAN: return 14;
    case CarType.TAI7:
    case CarType.LI_I9:
    case CarType.N90:
    case CarType.SEAL08: return 3;
    case CarType.SUV: return 3;
    case CarType.TRUCK: return 22;
    // 纯电单速减速器没有换挡过程，只保留一个极短的"扭矩重建"窗口
    case CarType.SU7:
    case CarType.YU7: return 3;
    case CarType.ZUNJIE: return 12;
    default: return 14;
  }
}

const cache = new Map<CarType, PowertrainSpec>();

/** Per-car calibrated powertrain, computed once and cached. */
export function getPowertrain(id: CarType): PowertrainSpec {
  let spec = cache.get(id);
  if (!spec) {
    spec = buildPowertrain(CAR_MODELS[id]);
    cache.set(id, spec);
  }
  return spec;
}

/** Top speed of a gear in speed units. gear: -1 = R, 0 = N, 1..5 forward. */
export function gearTopSpeed(spec: PowertrainSpec, gear: number): number {
  if (gear === -1) return spec.reverseTop;
  if (gear <= 0) return 0;
  return spec.gearTops[Math.min(spec.gearTops.length - 1, gear - 1)];
}

/**
 * Single source of truth for engine rpm, shared by the audio engine and the
 * dashboard tachometer. Clutch-engaged rpm follows wheel speed linearly;
 * near standstill the converter/clutch slip lets the engine rev a little
 * above the wheel-coupled value under throttle.
 */
export function computeRpm(
  spec: PowertrainSpec,
  speedAbs: number,
  gear: number,
  throttle01: number,
  engineStarted: boolean,
): number {
  if (!engineStarted) return 0;
  const band = spec.redlineRpm - spec.idleRpm;
  if (gear === 0) {
    return spec.idleRpm + Math.pow(throttle01, 0.8) * band * 0.7;
  }
  const top = gearTopSpeed(spec, gear);
  const ratio = Math.min(1.02, speedAbs / Math.max(0.1, top));
  const wheelCoupled = Math.max(spec.idleRpm, ratio * spec.redlineRpm);
  const slipAllowance = Math.max(0, 1 - ratio * 3) * throttle01 * band * 0.25;
  return Math.min(spec.redlineRpm, wheelCoupled + slipAllowance);
}

/** Standard training-wheel travel per side. Every selectable vehicle exposes
 *  the full ±1.5 turns to the player; vehicle-specific steering ratios and
 *  road-wheel lock remain in the physical front-wheel mapping instead of
 *  shortening the usable input range. */
export function steeringWheelMaxDeg(cc: CarConfig): number {
  return Math.min(STEERING_WHEEL_MAX_ROTATION, cc.dynamics.steeringRatio * cc.dynamics.maxSteerAngle * 180 / Math.PI);
}

export type GearRejectionReason =
  | 'invalid-gear'
  | 'single-speed'
  | 'reverse-while-moving'
  | 'direction-reversal'
  | 'over-rev';

/**
 * Explain why a requested gear is refused. Keeping this separate from the
 * boolean guard lets the HUD tell the player what to do (stop first, slow
 * down, …) instead of silently swallowing the key.
 */
export function gearRejectionReason(
  spec: PowertrainSpec,
  signedSpeed: number,
  gear: number,
): GearRejectionReason | null {
  if (Number.isInteger(gear) && gear > 1 && spec.gearTops.length === 1) return 'single-speed';
  if (!Number.isInteger(gear) || gear < -1 || gear > spec.gearTops.length) return 'invalid-gear';
  if (gear === 0) return null;
  // Selection is a request. The longitudinal controller decelerates opposite
  // rolling motion before engaging drive in the requested direction.
  return null;
}

/** Validate the gear itself; rolling reversal is handled by controlled braking. */
export function canSelectGear(spec: PowertrainSpec, signedSpeed: number, gear: number): boolean {
  return gearRejectionReason(spec, signedSpeed, gear) === null;
}

/** Battery-electric models use a single-speed reduction gear and never stall. */
export function isElectricVehicle(id: CarType): boolean {
  return id === CarType.TAI7 || id === CarType.LI_I9 || id === CarType.N90 || id === CarType.SEAL08 || id === CarType.SUV
    || id === CarType.SU7 || id === CarType.YU7;
}

export function shiftTorqueBlend(id:CarType, progress:number):number {
  const electric = isElectricVehicle(id);
  const floor = electric ? 1 : id === CarType.SPORTS ? 0.72 : 0.60;
  return 1-(1-floor)*Math.sin(Math.PI*Math.min(1,Math.max(0,progress)))**2;
}
