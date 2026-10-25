import {buildTrainingCampus} from './utils/trainingCampus';
import { buildGarageLevel } from './utils/garage';
import { EXPANSION_CARS, EXPANSION_TUNING, EXPANSION_STEERING } from './utils/expansionVehicles';
import { WORLD_DESTINATIONS } from './utils/openWorld';
import { buildBeijingLevel } from './utils/beijingMap';
import { CarConfig, CarType, LevelData, Obstacle, ParkingSpot, Marking, RoadSurface, CurvedRoadSurface, SlopeZone, Vector2, VehicleTuning, MirrorAdjustment, MirrorId, SteeringCurve, HoodCameraAdjustment } from './types';

// Physics Constants
// Fallback steering lock used only when a CarConfig does not specify
// dynamics.maxSteerAngle. Real per-car values live in CAR_MODELS below and
// are derived from each vehicle's published minimum turning radius via
// δ = arctan(wheelbase / turningRadius).
export const MAX_STEER_ANGLE = Math.PI / 3;
export const STEERING_WHEEL_MAX_ROTATION = 540;

export const DEFAULT_VEHICLE_TUNING: Record<CarType, VehicleTuning> = {
  ...EXPANSION_TUNING,
  [CarType.SEDAN]: { torqueScale: 1, throttleResponseScale: 1, shiftTimeScale: 1, engineBrakeScale: 1, steerLockScale: 1, steerResponseScale: 1, speedSteerScale: 1.16, understeerScale: 1 },
  [CarType.SEAL08]: { torqueScale: 1, throttleResponseScale: 1, shiftTimeScale: 1, engineBrakeScale: 1, steerLockScale: 1, steerResponseScale: 1, speedSteerScale: 1.16, understeerScale: 1 },
  [CarType.SUV]: { torqueScale: 1, throttleResponseScale: 1, shiftTimeScale: 1, engineBrakeScale: 1, steerLockScale: 1, steerResponseScale: 1, speedSteerScale: 1.16, understeerScale: 1 },
  [CarType.SPORTS]: { torqueScale: 1, throttleResponseScale: 1, shiftTimeScale: 1, engineBrakeScale: 1, steerLockScale: 1, steerResponseScale: 1, speedSteerScale: 1.16, understeerScale: 1 },
  [CarType.TRUCK]: { torqueScale: 1, throttleResponseScale: 1, shiftTimeScale: 1, engineBrakeScale: 1, steerLockScale: 1, steerResponseScale: 1, speedSteerScale: 1.16, understeerScale: 1 },
  [CarType.SU7]: { torqueScale: 1, throttleResponseScale: 1, shiftTimeScale: 1, engineBrakeScale: 1, steerLockScale: 1, steerResponseScale: 1, speedSteerScale: 1.16, understeerScale: 1 },
  [CarType.YU7]: { torqueScale: 1, throttleResponseScale: 1, shiftTimeScale: 1, engineBrakeScale: 1, steerLockScale: 1, steerResponseScale: 1, speedSteerScale: 1.16, understeerScale: 1 },
  [CarType.ZUNJIE]: { torqueScale: 1, throttleResponseScale: 1, shiftTimeScale: 1, engineBrakeScale: 1, steerLockScale: 1, steerResponseScale: 1, speedSteerScale: 1.16, understeerScale: 1 },
};

/**
 * 每款车的方向盘输入曲线默认值。选车时载入对应车型的曲线，
 * 让每辆车都有自己独特的转向手感（海豹 08 为实测调校基准）。
 */
export const DEFAULT_STEERING_CURVES: Record<CarType, SteeringCurve> = {
  ...EXPANSION_STEERING,
  // 海豹 08 EV：实车精调参数
  [CarType.SEDAN]: {
    firstHalfGain: 0.24,
    secondHalfGain: 0.72,
    thirdHalfGain: 1.63,
    inputSmoothing: 0.25,
    highSpeedFloor: 0.11,
    centeringGain: 1.19,
    autoCenteringSpeed: 2.69,
  },
  [CarType.SEAL08]: {
    firstHalfGain: 0.31,
    secondHalfGain: 0.54,
    thirdHalfGain: 1.60,
    inputSmoothing: 0.16,
    highSpeedFloor: 0.22,
    centeringGain: 1.1,
    autoCenteringSpeed: 1.45,
  },
  [CarType.SUV]: {
    firstHalfGain: 0.3,
    secondHalfGain: 0.49,
    thirdHalfGain: 1.63,
    inputSmoothing: 0.11,
    highSpeedFloor: 0.28,
    centeringGain: 0.99,
    autoCenteringSpeed: 1,
  },
  [CarType.SPORTS]: {
    firstHalfGain: 0.3,
    secondHalfGain: 0.49,
    thirdHalfGain: 1.63,
    inputSmoothing: 0.11,
    highSpeedFloor: 0.28,
    centeringGain: 0.99,
    autoCenteringSpeed: 1,
  },
  [CarType.TRUCK]: {
    firstHalfGain: 0.3,
    secondHalfGain: 0.49,
    thirdHalfGain: 1.63,
    inputSmoothing: 0.11,
    highSpeedFloor: 0.28,
    centeringGain: 0.99,
    autoCenteringSpeed: 1,
  },
  [CarType.SU7]: {
    firstHalfGain: 0.32,
    secondHalfGain: 0.56,
    thirdHalfGain: 1.58,
    inputSmoothing: 0.12,
    highSpeedFloor: 0.24,
    centeringGain: 1.12,
    autoCenteringSpeed: 1.6,
  },
  [CarType.YU7]: {
    firstHalfGain: 0.29,
    secondHalfGain: 0.5,
    thirdHalfGain: 1.6,
    inputSmoothing: 0.13,
    highSpeedFloor: 0.27,
    centeringGain: 1.02,
    autoCenteringSpeed: 1.2,
  },
  [CarType.ZUNJIE]: {
    firstHalfGain: 0.26,
    secondHalfGain: 0.46,
    thirdHalfGain: 1.66,
    inputSmoothing: 0.16,
    highSpeedFloor: 0.31,
    centeringGain: 0.9,
    autoCenteringSpeed: 0.8,
  },
};

/** 海豹 08 实车视野调校基准；其他车型在渲染层叠加各自的车型补偿。 */
export const DEFAULT_MIRROR_ADJUSTMENTS: Record<MirrorId, MirrorAdjustment> = {
  left: {
    screenX: -13, screenY: 10, yaw: 18, pitch: -5,
    mountForward: -0.6, mountOutward: -2.5, mountHeight: 4.25,
    imageZoom: 8, targetDistance: 58, showBody: true,
  },
  right: {
    screenX: 13, screenY: 10, yaw: 18, pitch: -5,
    mountForward: -0.6, mountOutward: -2.5, mountHeight: 4.25,
    imageZoom: 8, targetDistance: 58, showBody: true,
  },
  centre: {
    screenX: 0, screenY: -55, yaw: 0, pitch: -0.5,
    mountForward: -0.55, mountOutward: 0, mountHeight: 4,
    imageZoom: -17, targetDistance: 98, showBody: false,
  },
};

/** 驾驶员眼位实调基准（海豹 08）：左舵眼位 + 座舱视域。 */
/** 默认驾驶按键；游戏内设置面板可改，方向键始终作为备用油门/刹车/换挡。 */
export const DEFAULT_KEY_BINDINGS = {
  accelerate: 'w',
  brake: 's',
  gearUp: 'd',
  gearDown: 'a',
  handbrake: ' ',
  camera: 'f',
  lights: 'l',
  engine: 'b',
  reset: 'r',
  settings: 'm',
  tuning: 't',
} as const;

export const DEFAULT_HOOD_CAMERA_ADJUSTMENT: HoodCameraAdjustment = {
  forward: -6.75,
  lateral: 3.25,
  height: -6,
  pitch: 8,
  yaw: 0,
  fov: 66,
};

export const hoodCameraDefaultForCar = (id: CarType): HoodCameraAdjustment => id === CarType.TAI7
  ? {forward:-7.5,lateral:3.25,height:-6.75,pitch:7.25,yaw:0,fov:65}
  : {...DEFAULT_HOOD_CAMERA_ADJUSTMENT};

// Dimensions
export const CAR_MODELS: Record<CarType, CarConfig> = {
  ...EXPANSION_CARS,
  [CarType.SEDAN]: {
    id: CarType.SEDAN,
    name: "海豹 08 手动训练（模拟）",
    price: 0,
    color: '#8a8f98',
    width: 19.99,
    length: 51.5,
    height: 15.05,
    maxSpeed: 16.0,
    acceleration: 0.02,
    turnSpeed: 0.03,
    wheelbase: 30.3,
    trackWidth: 17.225, turningRadiusTargetM: 4.95, turningRadiusDefinition: 'outer-front-wheel',
    rideHeightRangeM: 0.055,
    weight: 2145,
    dynamics: {
      // TRAINING-ONLY manual powertrain. The production Seal 08 EV is a
      // single-speed EV; this slot deliberately keeps the existing 5MT
      // clutch/gear lesson (and the 3rd-gear lug/stall exercise). Values are
      // SIMULATED CALIBRATION, not BYD EHS or factory gearbox data.
      driveLayout: 'FWD', enginePosition: 'FRONT', powerKw: 200, torqueNm: 315,
      zeroTo100Seconds: 8.8, frontWeightBias: 0.60, cgHeightM: 0.55, dragAreaM2: 0.63,
      grip: 0.94, steeringRatio: 12.0, throttleResponse: 0.026,
      transmission: {
        gearRatios: [5.13, 2.78, 1.77, 1.30, 0.81],
        reverseRatio: 3.33, finalDrive: 3.9, wheelRadiusM: 0.35155,
        idleRpm: 800, redlineRpm: 6500,
      },
      steerSpeedSensitivity: 0.92, steerResponse: 0.96,
      maxSteerAngle: 39.95426 * Math.PI / 180,
      understeerGradient: 0.18,
      yawResponse: 0.88,
      rearSteerMaxDeg: 7.0, rearSteerFadeStartKmh: 20, rearSteerFadeEndKmh: 55,
    },
  },
  [CarType.SEAL08]: {
    id: CarType.SEAL08,
    name: "海豹 08 EV 905 旗舰",
    price: 0,
    color: '#b7434d',
    width: 19.99,
    length: 51.5,
    height: 15.05,
    maxSpeed: 16.0, // 240 km/h official limiter
    acceleration: 0.024,
    turnSpeed: 0.034,
    wheelbase: 30.3,
    trackWidth: 17.225, turningRadiusTargetM: 4.95, turningRadiusDefinition: 'outer-front-wheel',
    rideHeightRangeM: 0.055,
    weight: 2160,
    dynamics: {
      // Official 905km flagship: RWD, 320kW/500N·m, 2160kg, 0-100 4.9s,
      // 240km/h, 245/45 R19. Single-speed reduction gear (no manual stall).
      // Drag area, steering ratio, understeer/yaw response and the rear-steer
      // speed curve are SIMULATED CALIBRATION (the official table publishes
      // only the ±7° hardware limit and 4.95m radius).
      driveLayout: 'RWD', enginePosition: 'MID', powerKw: 320, torqueNm: 500,
      zeroTo100Seconds: 4.9, frontWeightBias: 0.47, cgHeightM: 0.48, dragAreaM2: 0.58,
      grip: 1.03, steeringRatio: 14.2, throttleResponse: 0.050,
      transmission: {
        gearRatios: [1], reverseRatio: 1, finalDrive: 8.8, wheelRadiusM: 0.35155,
        idleRpm: 0, redlineRpm: 18000,
      },
      steerSpeedSensitivity: 0.72, steerResponse: 1.06,
      // 3.030m wheelbase, 1.715/1.730m tracks, 4.95m official minimum radius
      // (definition not stated by BYD). Game definition: outer-front-wheel.
      // Lock 39.95426° is the virtual front-centre angle calibrated together with
      // the ±7° rear steer; it is not the 41° inner-wheel angle.
      maxSteerAngle: 39.95426 * Math.PI / 180,
      understeerGradient: 0.10,
      yawResponse: 1.04,
      // Official: ±7° overall active rear steer. The speed fade 20–55 km/h is
      // SIMULATED CALIBRATION; only the ±7° limit is manufacturer-published.
      rearSteerMaxDeg: 7.0, rearSteerFadeStartKmh: 20, rearSteerFadeEndKmh: 55,
      // Official 云辇-A range is 55mm total body-height adjustment. It limits
      // usable ride-height change; it is NOT wheel travel or spring rate.
    },
  },
  [CarType.SUV]: {
    id: CarType.SUV,
    name: "乐道 L80 Ultra+",
    price: 500,
    color: '#46765c',
    width: 19.98,
    length: 51.45,
    height: 17.66,
    maxSpeed: 13.33, // 200 km/h official limiter
    acceleration: 0.026,
    turnSpeed: 0.030,
    wheelbase: 31.1,
    trackWidth: 17.185, turningRadiusTargetM: 5.7, turningRadiusDefinition: 'outer-front-wheel',
    rideHeightRangeM: 0.100,
    weight: 2360,
    dynamics: {
      // Official Ultra+ AWD: 440kW/535N·m, 0-100 4.5s, 200km/h, 2360kg
      // (AWD), 20-inch 255/55 R20 front + 275/50 R20 rear. Single-speed EV.
      // Drag area, steering ratio, understeer/yaw response and wheel radius
      // (the 5.5mm front/rear diameter difference is averaged) are SIMULATED.
      driveLayout: 'AWD', enginePosition: 'MID', powerKw: 440, torqueNm: 535,
      zeroTo100Seconds: 4.5, frontWeightBias: 0.50, cgHeightM: 0.62, dragAreaM2: 0.73,
      grip: 1.05, steeringRatio: 15.4, throttleResponse: 0.050,
      transmission: {
        gearRatios: [1], reverseRatio: 1, finalDrive: 8.4, wheelRadiusM: 0.3925,
        idleRpm: 0, redlineRpm: 18000,
      },
      steerSpeedSensitivity: 0.88, steerResponse: 0.98,
      // 3.110m wheelbase, 1.720/1.717m tracks, 5.7m official minimum radius
      // (definition not stated by ONVO). Outer-front-wheel calibration gives
      // 37.62°. No rear steer: the official L80 config has no such item.
      maxSteerAngle: 37.62 * Math.PI / 180,
      understeerGradient: 0.16,
      yawResponse: 0.94,
      // Official air suspension: 100mm total height range. This constrains
      // body-height/clearance, not the wheel bump/droop travel or damping,
      // which remain SIMULATED CALIBRATION.
    },
  },
  [CarType.SPORTS]: {
    id: CarType.SPORTS,
    name: "Concept GT",
    price: 1500,
    color: '#b91c1c',
    width: 24.52, // Native Concept envelope including mirrors; uniform scale.
    length: 45.7,
    height: 12.05,
    maxSpeed: 20.0, // 300 km/h
    acceleration: 0.03,
    turnSpeed: 0.035,
    wheelbase: 29.4,
    trackWidth: 20.54, turningRadiusTargetM: 5.5, turningRadiusDefinition: 'outer-front-wheel',
    weight: 1300,
    dynamics: {
      driveLayout: 'RWD', enginePosition: 'MID', powerKw: 220, torqueNm: 380,
      zeroTo100Seconds: 4.2, frontWeightBias: 0.44, cgHeightM: 0.47, dragAreaM2: 0.62,
      grip: 1.08, steeringRatio: 13.5, throttleResponse: 0.042,
      // 超跑：一挡很高（极速取向），高转红区
      transmission: {
        gearRatios: [5.22, 3.36, 2.35, 1.70, 1.0],
        reverseRatio: 2.9, finalDrive: 3.42, wheelRadiusM: 0.335,
        idleRpm: 950, redlineRpm: 8200,
      },
      steerSpeedSensitivity: 0.70, steerResponse: 1.12,
      // Concept GT is a training supercar using the CC-BY CarConcept mesh;
      // wheelbase/turn radius are matched to that mesh, not a production car.
      // δ = atan(2.62 / 5.5) ≈ 25.5°
      maxSteerAngle: 37.44 * Math.PI / 180,
      understeerGradient: 0.08,
      yawResponse: 1.0,
    },
  },
  [CarType.TRUCK]: {
    id: CarType.TRUCK,
    name: "荒野 2.4T · 燃油皮卡",
    price: 800,
    color: '#d97706',
    width: 19.7,
    length: 54.6,
    height: 18.5,
    maxSpeed: 11.33, // 170 km/h
    acceleration: 0.01,
    turnSpeed: 0.015,
    wheelbase: 32.6,
    trackWidth: 16.8, turningRadiusTargetM: 6.75, turningRadiusDefinition: 'outer-front-wheel',
    weight: 2200,
    dynamics: {
      driveLayout: 'RWD', enginePosition: 'FRONT', powerKw: 155, torqueNm: 360,
      zeroTo100Seconds: 11.5, frontWeightBias: 0.56, cgHeightM: .78, dragAreaM2: 1.08,
      grip: 0.82, steeringRatio: 16.5, throttleResponse: 0.016,
      // 皮卡：一挡为爬行挡，齿比级差最大，原创汽油皮卡模拟标定
      transmission: {
        gearRatios: [4.71, 2.62, 1.72, 1.25, 1.0],
        reverseRatio: 4.1, finalDrive: 4.3, wheelRadiusM: 0.39,
        idleRpm: 700, redlineRpm: 5200,
      },
      steerSpeedSensitivity: 1.20, steerResponse: 0.74,
      // Original fictional pickup: wheelbase 3.26 m, target radius 6.75 m
      // δ = atan(3.26 / 6.75) ≈ 25.8°
      maxSteerAngle: 32.53 * Math.PI / 180,
      understeerGradient: 0.28,
      yawResponse: 0.70,
    },
  },
  // ────────────────────────────────────────────────────────────
  // 小米 SU7（Max 四驱）：4997×1963×1455 mm，轴距 3000 mm，
  // 双电机 495 kW / 838 N·m，官方 0-100 km/h 2.78 s，极速 265 km/h。
  // 纯电单速减速器 —— 五个挡位使用同一齿比，换挡不产生动力空档。
  // ────────────────────────────────────────────────────────────
  [CarType.SU7]: {
    id: CarType.SU7,
    name: "小米 SU7",
    price: 1800,
    color: '#1c5f8f', // 海湾蓝
    width: 19.63,
    length: 49.97,
    height: 14.4,
    maxSpeed: 17.67, // 265 km/h
    acceleration: 0.032,
    turnSpeed: 0.038,
    wheelbase: 30.0,
    trackWidth: 16.8, turningRadiusTargetM: 5.7, turningRadiusDefinition: 'outer-front-wheel',
    weight: 2205,
    dynamics: {
      driveLayout: 'AWD', enginePosition: 'MID', powerKw: 495, torqueNm: 838,
      zeroTo100Seconds: 2.9, frontWeightBias: 0.47, cgHeightM: 0.44, dragAreaM2: 0.56,
      grip: 1.12, steeringRatio: 14.2, throttleResponse: 0.055,
      // 纯电单速：motor 红线 18000 rpm，主减速比 8.0，胎径 0.352 m
      // （245/40 R20）→ 红线车速约 280 km/h，由 265 km/h 电子限速截断。
      transmission: {
        gearRatios: [1],
        reverseRatio: 1, finalDrive: 8.0, wheelRadiusM: 0.352,
        idleRpm: 0, redlineRpm: 18000,
      },
      steerSpeedSensitivity: 0.72, steerResponse: 1.08,
      // 轴距 3.0 m，最小转弯半径 5.7 m → δ = atan(3.0 / 5.7) ≈ 27.8°
      maxSteerAngle: 36.83 * Math.PI / 180,
      understeerGradient: 0.10,
      yawResponse: 1.06,
    },
  },
  // ────────────────────────────────────────────────────────────
  // 小米 YU7（Max 四驱）：4999×1996×1608 mm，轴距 3000 mm，
  // 双电机 508 kW / 866 N·m，官方 0-100 km/h 3.23 s，极速 253 km/h，
  // 整备质量 2405 kg，245/55 R19 轮胎。
  // ────────────────────────────────────────────────────────────
  [CarType.YU7]: {
    id: CarType.YU7,
    name: "小米 YU7",
    price: 2000,
    color: '#2f7d6d', // 宝石绿
    width: 19.96,
    length: 49.99,
    height: 16.08,
    maxSpeed: 16.87, // 253 km/h
    acceleration: 0.028,
    turnSpeed: 0.032,
    wheelbase: 30.0,
    trackWidth: 17.0, turningRadiusTargetM: 5.9, turningRadiusDefinition: 'outer-front-wheel',
    weight: 2405,
    dynamics: {
      driveLayout: 'AWD', enginePosition: 'MID', powerKw: 508, torqueNm: 866,
      zeroTo100Seconds: 3.4, frontWeightBias: 0.48, cgHeightM: 0.60, dragAreaM2: 0.80,
      grip: 1.05, steeringRatio: 15.2, throttleResponse: 0.050,
      transmission: {
        gearRatios: [1],
        reverseRatio: 1, finalDrive: 8.4, wheelRadiusM: 0.376,
        idleRpm: 0, redlineRpm: 18000,
      },
      steerSpeedSensitivity: 0.86, steerResponse: 1.00,
      // 轴距 3.0 m，最小转弯半径 5.9 m → δ = atan(3.0 / 5.9) ≈ 26.9°
      maxSteerAngle: 35.32 * Math.PI / 180,
      understeerGradient: 0.16,
      yawResponse: 0.96,
    },
  },
  // ────────────────────────────────────────────────────────────
  // 尊界 V8（基于尊界 S800 车身）：5480×2000×1536 mm，轴距 3370 mm。
  // 车身/内饰尺寸沿用 S800，动力为 V8 版本标定：
  // 4.0T V8 双涡轮 + 全时四驱，410 kW / 750 N·m，0-100 km/h 4.6 s，
  // 电子限速 250 km/h，整备质量 2650 kg，265/40 R22 轮胎。
  // ────────────────────────────────────────────────────────────
  [CarType.ZUNJIE]: {
    id: CarType.ZUNJIE,
    name: "尊界 V8",
    price: 3600,
    color: '#1c222b', // 星夜黑（低模需要提亮一档，否则折面读不出来）
    width: 20.0,
    length: 54.8,
    height: 15.36,
    maxSpeed: 16.67, // 250 km/h
    acceleration: 0.024,
    turnSpeed: 0.026,
    wheelbase: 33.7,
    trackWidth: 17.0, turningRadiusTargetM: 6.1, turningRadiusDefinition: 'outer-front-wheel',
    weight: 2650,
    dynamics: {
      driveLayout: 'AWD', enginePosition: 'FRONT', powerKw: 410, torqueNm: 750,
      zeroTo100Seconds: 4.6, frontWeightBias: 0.53, cgHeightM: 0.58, dragAreaM2: 0.74,
      grip: 1.0, steeringRatio: 14.0, throttleResponse: 0.030,
      // 5 速自动（行政标定）：一挡短、高速挡齿比疏，红线 6500 rpm
      transmission: {
        gearRatios: [7.24, 4.05, 2.50, 1.65, 0.82],
        reverseRatio: 3.0, finalDrive: 3.1, wheelRadiusM: 0.385,
        idleRpm: 700, redlineRpm: 6500,
      },
      steerSpeedSensitivity: 1.15, steerResponse: 0.88,
      // 轴距 3.37 m，最小转弯半径 6.1 m → δ = atan(3.37 / 6.1) ≈ 28.9°
      maxSteerAngle: 38.52 * Math.PI / 180,
      understeerGradient: 0.22,
      yawResponse: 0.84,
    },
  }
};

export const TRANSLATIONS = {
  CN: {
    title: "停车模拟大师 Pro v2.0",
    start: "进入游戏",
    settings: "游戏设置",
    resume: "继续游戏",
    exit: "返回主菜单",
    reset: "原地重置车辆",
    sound: "音效",
    volume: "音量",
    weather: "天气效果",
    shadows: "光影效果",
    autoSignal: "自动转向灯",
    ghostWheel: "车轮透视",
    turnAssist: "转弯辅助线",
    mirrors: "驾驶后视镜",
    sensitivity: "转向灵敏度",
    gear: "挡位",
    brake: "刹车",
    gas: "油门",
    money: "资金",
    level: "关卡",
    lights: "车灯",
    selectLevel: "选择关卡",
    levels: {
        1: "北京东四",
        2: "第二关：地下车库",
        3: "第三关：斜列停车",
        4: "第四关：驾校",
        5: "第五关：驾校 2",
        6: "第六关：三层地库"
    },
    controls: {
      wheel: "[右键拖拽] 左右转向（指针锁失败时仍可拖动）",
      look: "[鼠标左键拖拽] 车外绕车 360° / 车内低敏转头（俯仰下 15° 上 10°）",
      steerFallback: "[, / .] 按住备用左右转向（不占用加减挡）",
      gearUp: "[D] 加挡",
      gearDown: "[A] 减挡（可减至倒挡）",
      reverse: "[Q] 倒挡",
      brake: "[S] 轻刹 12% / [Shift+S] 重刹 100%",
      park: "[V] 驻车",
      gas: "[W] 轻油 15% / [Shift+W] 30%（无键盘全油门）",
      engine: "[B] 启动/熄火",
      handbrake: "[按住空格] 手刹",
      lights: "[L] 车灯开关",
      camera: "[F / 右上角球形控件 / 滚轮] 视角、跟随与倒车镜头；左键拖拽自由观察"
    },
    initialSetup: "初始设置",
    vehicle: "选择车辆",
    keyGuide: "按键指南",
    language: "语言 / Language",
    menu: {
      pressStart: "点击任意处 或 按 Enter 点火",
      tagline: "专业驾驶训练模拟",
      stepCar: "选择座驾",
      stepLevel: "选择训练场",
      startEngine: "启动引擎",
      back: "返回",
      next: "下一步",
      sessionSetup: "训练设置",
      power: "功率",
      torque: "扭矩",
      weight: "车重",
      drive: "驱动",
      ready: "准备就绪",
      garage: "车库",
      selectTrack: "训练场",
    },
    parking: {
      perfect: "停车成功！+$100",
      good: "停车成功 +$50",
      reverse: "反向停车 -$20",
      line: "压线违规 -$30",
      fail: "未停入车位"
    }
  },
  EN: {
    title: "Parking Master Pro v2.0",
    start: "Enter Game",
    settings: "Settings",
    resume: "Resume",
    exit: "Main Menu",
    reset: "Recover Vehicle Here",
    sound: "Sound Effects",
    volume: "Volume",
    weather: "Weather",
    shadows: "Shadows",
    autoSignal: "Auto Turn Signal",
    ghostWheel: "Ghost Wheels",
    turnAssist: "Turn Assist",
    mirrors: "Driving Mirrors",
    sensitivity: "Steering Sensitivity",
    gear: "GEAR",
    brake: "BRAKE",
    gas: "GAS",
    money: "Credits",
    level: "Level",
    lights: "Lights",
    selectLevel: "Select Level",
    levels: {
        1: "Level 1: Urban Challenge",
        2: "Level 2: Underground",
        3: "Level 3: The Escape",
        4: "Level 4: Driving School",
        5: "Level 5: Driving School 2",
        6: "Level 6: 3-Story Garage"
    },
    controls: {
      wheel: "[Right-Drag] Steer L/R (works without pointer lock)",
      look: "[Plain left-drag] 360° exterior orbit / low-sensitivity cockpit head look (15° down, 10° up)",
      steerFallback: "[, / .] Hold for keyboard steering (does not use gear keys)",
      gearUp: "[D] Gear Up",
      gearDown: "[A] Gear Down (to Reverse)",
      reverse: "[Q] Reverse",
      brake: "[S] Light brake 12% / [Shift+S] Hard brake 100%",
      park: "[V] Park",
      gas: "[W] Light throttle 15% / [Shift+W] 30% (no keyboard full throttle)",
      engine: "[B] Start/Stop",
      handbrake: "[Hold Space] Handbrake",
      lights: "[L] Lights Toggle",
      camera: "[F / Orbit ball / Wheel] Views, chase & reverse; left-drag to look"
    },
    initialSetup: "Initial Setup",
    vehicle: "Select Vehicle",
    keyGuide: "Key Guide",
    language: "Language / 语言",
    menu: {
      pressStart: "Click anywhere or press Enter to ignite",
      tagline: "Professional Driver Training Simulator",
      stepCar: "SELECT YOUR RIDE",
      stepLevel: "SELECT COURSE",
      startEngine: "START ENGINE",
      back: "BACK",
      next: "NEXT",
      sessionSetup: "Session Setup",
      power: "POWER",
      torque: "TORQUE",
      weight: "WEIGHT",
      drive: "DRIVE",
      ready: "READY",
      garage: "GARAGE",
      selectTrack: "COURSES",
    },
    parking: {
      perfect: "PARKED! +$100",
      good: "Parked +$50",
      reverse: "Wrong Way -$20",
      line: "On Line Penalty -$30",
      fail: "Not in spot"
    }
  }
};

export const GARAGE_CARS: CarType[] = [CarType.SUV, CarType.SEAL08, CarType.TAI7, CarType.LI_I9, CarType.N90, CarType.TRUCK];

export const LEVEL_LIST = [
 {id:1,name:'城市与青岚山',desc:'城市街区、盘山公路、林场窄路与溪谷浅水。',locked:false,thumbnail:'/thumbnails/map-1.svg'},
 {id:4,name:'综合驾驶试验场',desc:'合并双驾校、紧凑车库和斜列停车场：坡道、S 弯、窄桥与泊车。',locked:false,thumbnail:'/thumbnails/map-4.svg'},
 {id:6,name:'三层地库',desc:'B1 / B2 / B3、双向坡道与楼层停车挑战。',locked:false,thumbnail:'/thumbnails/map-6.svg'}
];

// --- MAP GENERATION HELPERS ---

const createWall = (x: number, y: number, w: number, h: number): Obstacle => ({
  id: `wall-${Math.random()}`,
  x, y, width: w, height: h, rotation: 0, type: 'wall', movable: false, weight: 0, color: '#374151' 
});

const createStaticCar = (x: number, y: number, rotation: number, color: string = '#4b5563'): Obstacle => ({
  id: `obs-car-${Math.random()}`,
  x, y, width: 20, height: 47, rotation, type: 'car', movable: true, weight: 80, color
});

// Traffic AI Creator
const createTrafficCar = (path: Vector2[], speed: number, startOffsetRatio: number = 0): Obstacle => {
    const startIndex = Math.floor((path.length - 1) * startOffsetRatio);
    const startPos = path[startIndex];
    // Calculate initial rotation based on path
    const nextPos = path[Math.min(startIndex + 1, path.length - 1)];
    const rotation = Math.atan2(nextPos.y - startPos.y, nextPos.x - startPos.x);
    
    const baseColors = ['#f87171', '#60a5fa', '#fbbf24', '#a3a3a3'];
    const color = baseColors[Math.floor(Math.random() * baseColors.length)];

    return {
        id: `traffic-${Math.random()}`,
        x: startPos.x, 
        y: startPos.y,
        width: 19, 
        height: 47,
        rotation,
        type: 'car',
        movable: true,
        weight: 100,
        color,
        ai: {
            path: path,
            currentPathIndex: startIndex,
            speed: speed,
            maxSpeed: speed,
            state: 'drive'
        }
    };
};

// Helper for randomizing vehicles
const createRandomStaticCar = (x: number, y: number, rotation: number, excludeTrucks: boolean = false): Obstacle => {
    // Pick random car type
    const types = [CarType.SEDAN, CarType.SUV, CarType.SPORTS, CarType.TRUCK];
    const availableTypes = excludeTrucks ? types.filter(t => t !== CarType.TRUCK) : types;
    
    const type = availableTypes[Math.floor(Math.random() * availableTypes.length)];
    const config = CAR_MODELS[type];

    const baseColors = ['#4b5563', '#1f2937', '#374151', '#9ca3af', '#f3f4f6', '#000000', '#ffffff'];
    const color = baseColors[Math.floor(Math.random() * baseColors.length)];

    return {
        id: `obs-car-${Math.random()}`,
        x, y, 
        width: config.width, 
        height: config.length, 
        rotation, 
        type: 'car', 
        movable: true, 
        weight: type === CarType.TRUCK ? 150 : 80, 
        color
    };
};

interface ParkingRowSpec {
    idPrefix: string;
    centerX: number;
    centerY: number;
    count: number;
    /** Parked vehicle nose direction in the 2D map coordinate system. */
    heading: number;
    /** Direction in which adjacent bays are laid out. */
    rowAngle: number;
    spacing: number;
    occupiedIndices: readonly number[];
    /** Bays that stay empty and are NOT parkable targets (outline only). */
    emptyIndices?: readonly number[];
    length?: number;
    width?: number;
    excludeTrucks?: boolean;
}

/** Add a texture-like, ground-flat white outline for one oriented bay. */
const addParkingBayOutline = (
    markings: Marking[],
    x: number,
    y: number,
    length: number,
    width: number,
    heading: number,
) => {
    const forwardX = Math.cos(heading);
    const forwardY = Math.sin(heading);
    const normalX = -forwardY;
    const normalY = forwardX;
    const lineThickness = 1.45;
    [-1, 1].forEach(side => {
        markings.push({
            type: 'line-solid',
            x: x + normalX * width * 0.5 * side,
            y: y + normalY * width * 0.5 * side,
            width: length,
            height: lineThickness,
            rotation: heading,
            color: '#fff',
        });
        markings.push({
            type: 'line-solid',
            x: x + forwardX * length * 0.5 * side,
            y: y + forwardY * length * 0.5 * side,
            width,
            height: lineThickness,
            rotation: heading + Math.PI / 2,
            color: '#fff',
        });
    });
};

/**
 * Create a complete parking row. Occupied cells receive a correctly oriented
 * parked vehicle, empty cells keep only their painted outline, and every
 * remaining cell becomes an enterable training spot.
 */
const addParkingRow = (
    spots: ParkingSpot[],
    obstacles: Obstacle[],
    markings: Marking[],
    spec: ParkingRowSpec,
) => {
    const length = spec.length ?? 54;
    const width = spec.width ?? 26;
    const occupied = new Set(spec.occupiedIndices);
    const empty = new Set(spec.emptyIndices ?? []);
    const rowX = Math.cos(spec.rowAngle);
    const rowY = Math.sin(spec.rowAngle);
    for (let index = 0; index < spec.count; index++) {
        const offset = (index - (spec.count - 1) / 2) * spec.spacing;
        const x = spec.centerX + rowX * offset;
        const y = spec.centerY + rowY * offset;
        addParkingBayOutline(markings, x, y, length, width, spec.heading);
        if (occupied.has(index)) {
            obstacles.push(createRandomStaticCar(x, y, spec.heading, spec.excludeTrucks ?? true));
        } else if (!empty.has(index)) {
            spots.push({
                id: `${spec.idPrefix}-${index}`,
                x,
                y,
                width: length,
                height: width,
                rotation: spec.heading,
                occupied: false,
            });
        }
    }
};

const createCone = (x: number, y: number): Obstacle => ({
  id: `cone-${Math.random()}`,
  x, y, width: 6, height: 6, rotation: 0, type: 'cone', movable: true, weight: 2, color: '#f97316'
});

const createBox = (x: number, y: number): Obstacle => ({
    id: `box-${Math.random()}`,
    x, y, width: 15, height: 15, rotation: Math.random(), type: 'box', movable: true, weight: 5, color: '#8d6e63'
});

const createBarrier = (x: number, y: number, rotation: number): Obstacle => ({
    id: `barrier-${Math.random()}`,
    x, y, width: 40, height: 8, rotation, type: 'wall', movable: true, weight: 40, color: '#ef4444'
});

// Rich City Map Generator
export const generateLegacyLevel = (level: number): LevelData => {
  if (level === 6) return buildGarageLevel();
  if (level === 1 || level === 7) {
    const world = buildBeijingLevel();
    if (level === 7) world.startPos = { ...WORLD_DESTINATIONS[1] };
    return world;
  }
  const spots: ParkingSpot[] = [];
  const obstacles: Obstacle[] = [];
  const markings: Marking[] = [];
  const roadSurfaces: RoadSurface[] = [];
  const curvedRoads: CurvedRoadSurface[] = [];
  const slopeZones: SlopeZone[] = [];
  let training: LevelData['training'];
  let startPos = { x: 800, y: 1200, rotation: -Math.PI/2 };
  let mapSizeW = 2000;
  let mapSizeH = 2000;

  const SPOT_W = 54; // Length of the spot (car length is ~47)
  const SPOT_H = 26; // Width of the spot (car width is ~20)

  if (level === 2) {
      mapSizeW = 620;
      mapSizeH = 760;
      const centerX = 310;
      const centerY = 380;
      roadSurfaces.push({ x: centerX, y: centerY, width: 540, height: 680, rotation: 0, color: '#303034' });
      obstacles.push(createWall(centerX, 40, 540, 30));
      obstacles.push(createWall(centerX, 720, 540, 30));
      obstacles.push(createWall(40, centerY, 30, 680));
      obstacles.push(createWall(580, centerY, 30, 680));

      // Traffic Loop
      const loopPath = [
          {x: 80, y: 90}, {x: 540, y: 90},
          {x: 540, y: 670}, {x: 80, y: 670},
          {x: 80, y: 90}
      ];


      const AISLE_CENTER_X = centerX;
      markings.push({ type: 'arrow-straight', x: AISLE_CENTER_X, y: 210, width: 0, height: 0, rotation: Math.PI/2, color: '#fff' });
      markings.push({ type: 'arrow-straight', x: AISLE_CENTER_X, y: 610, width: 0, height: 0, rotation: -Math.PI/2, color: '#fff' });

      // Real basement practice aisles are deliberately compact: the parked
      // cars sit close to one another and leave only a low-speed manoeuvring
      // corridor between their bumpers.
      const SPOT_DEPTH = 60;
      const SPOT_VERTICAL_SPACING = 32;
      const AISLE_GAP = 65;
      const LEFT_ROW_X = AISLE_CENTER_X - (AISLE_GAP / 2) - (SPOT_DEPTH / 2);
      const RIGHT_ROW_X = AISLE_CENTER_X + (AISLE_GAP / 2) + (SPOT_DEPTH / 2);

      const SPOT_COUNT = 14;
      const START_Y = 190;

      for(let i=0; i<SPOT_COUNT; i++) {
          const y = START_Y + i * SPOT_VERTICAL_SPACING;
          const lineY = y - SPOT_VERTICAL_SPACING/2;
          markings.push({ type: 'line-solid', x: LEFT_ROW_X, y: lineY, width: SPOT_DEPTH, height: 2, rotation: 0, color: '#fff' });
          markings.push({ type: 'line-solid', x: LEFT_ROW_X - SPOT_DEPTH/2, y: y, width: 2, height: SPOT_VERTICAL_SPACING, rotation: 0, color: '#e5e7eb' });

          const isSpot = i === 0;
          if (isSpot) {
             spots.push({ id: `spot-L2-L-${i}`, x: LEFT_ROW_X, y: y, width: SPOT_DEPTH, height: 30, rotation: 0, occupied: false });
          } else {
             if (i % 3 !== 0) {
                // Ensure no trucks in Level 2 tight aisle
                obstacles.push(createRandomStaticCar(LEFT_ROW_X, y, 0, true));
             }
          }
          if (i === SPOT_COUNT - 1) {
             markings.push({ type: 'line-solid', x: LEFT_ROW_X, y: y + SPOT_VERTICAL_SPACING/2, width: SPOT_DEPTH, height: 2, rotation: 0, color: '#fff' });
          }
      }

      for(let i=0; i<SPOT_COUNT; i++) {
          const y = START_Y + i * SPOT_VERTICAL_SPACING;
          const lineY = y - SPOT_VERTICAL_SPACING/2;
          markings.push({ type: 'line-solid', x: RIGHT_ROW_X, y: lineY, width: SPOT_DEPTH, height: 2, rotation: 0, color: '#fff' });
          markings.push({ type: 'line-solid', x: RIGHT_ROW_X + SPOT_DEPTH/2, y: y, width: 2, height: SPOT_VERTICAL_SPACING, rotation: 0, color: '#e5e7eb' });

          if (i === 7) {
              spots.push({ id: `spot-L2-TARGET`, x: RIGHT_ROW_X, y: y, width: SPOT_DEPTH, height: 30, rotation: Math.PI, occupied: false });
              markings.push({ type: 'line-solid', x: RIGHT_ROW_X, y: y, width: SPOT_DEPTH - 4, height: 26, rotation: 0, color: 'rgba(16, 185, 129, 0.2)' }); 
          } else {
              if (i !== 2) {
                 obstacles.push(createRandomStaticCar(RIGHT_ROW_X, y, Math.PI, true));
              }
          }
          if (i === SPOT_COUNT - 1) {
             markings.push({ type: 'line-solid', x: RIGHT_ROW_X, y: y + SPOT_VERTICAL_SPACING/2, width: SPOT_DEPTH, height: 2, rotation: 0, color: '#fff' });
          }
      }
      startPos = { x: centerX, y: 670, rotation: -Math.PI/2 };
  } else if (level === 3) {
      mapSizeW=800;mapSizeH=800;
      roadSurfaces.push({x:400,y:400,width:740,height:740,rotation:0,color:'#303034',curbs:false});
      obstacles.push(createWall(400,20,760,20),createWall(400,780,760,20),createWall(20,400,20,760),createWall(780,400,20,760));
      startPos={x:160,y:400,rotation:0};
      training={title:'斜列停车场',tips:['沿中间通道单向行驶','以低速驶入斜列车位，注意车尾外摆']};
      for(const side of [-1,1]) addParkingRow(spots,obstacles,markings,{
        idPrefix:`angle-${side}`,centerX:400,centerY:400+side*75,count:9,
        heading:side>0?-Math.PI/3:Math.PI*2/3,rowAngle:0,spacing:40,length:62,width:30,
        occupiedIndices:[0,1,3,5,7,8],emptyIndices:[4],
      });
      for(const x of [200,400,600]) markings.push({type:'arrow-straight',x,y:400,width:12,height:30,rotation:0,color:'#fff'});
  } else if (level === 4) {
      // ===== 真实驾校综合场：所有考试项目沿一条窄路线连通 =====
      mapSizeW = 1700;
      mapSizeH = 1120;
      startPos = { x: 90, y: 150, rotation: 0 };
      training = {
          title: '驾校综合训练场',
          tips: ['依次完成坡道、倒车入库和侧方停车', '低速通过 S 弯、直角弯与窄桥', '路口停车观察，环岛让行后从指定出口驶出']
      };

      obstacles.push(createWall(mapSizeW / 2, -20, mapSizeW + 40, 40));
      obstacles.push(createWall(mapSizeW / 2, mapSizeH + 20, mapSizeW + 40, 40));
      obstacles.push(createWall(-20, mapSizeH / 2, 40, mapSizeH + 40));
      obstacles.push(createWall(mapSizeW + 20, mapSizeH / 2, 40, mapSizeH + 40));

      const addRoute = (a: Vector2, b: Vector2, width = 64, dashed = true, curbs = true) => {
          const angle = Math.atan2(b.y - a.y, b.x - a.x);
          const length = Math.hypot(b.x - a.x, b.y - a.y);
          roadSurfaces.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, width: length + 8, height: width, rotation: angle, color: '#303034', curbs });
          if (dashed) markings.push({ type: 'line-dashed', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, width: length, height: 1.5, rotation: angle, color: '#d1d5db' });
      };

      // 1. 坡道定点停车与起步。
      addRoute({ x: 55, y: 150 }, { x: 540, y: 150 }, 72, false);
      slopeZones.push({ x: 300, y: 150, length: 330, width: 72, rotation: 0, peakHeight: 26 });
      obstacles.push({ id: 'slope-rail-school-n', x: 300, y: 111, width: 330, height: 5, rotation: 0, type: 'wall', movable: false, weight: 0, color: '#6b7280' });
      obstacles.push({ id: 'slope-rail-school-s', x: 300, y: 189, width: 330, height: 5, rotation: 0, type: 'wall', movable: false, weight: 0, color: '#6b7280' });
      markings.push({ type: 'line-solid', x: 215, y: 150, width: 3, height: 72, rotation: 0, color: '#fbbf24' });
      markings.push({ type: 'line-solid', x: 385, y: 150, width: 3, height: 72, rotation: 0, color: '#fbbf24' });

      // 2. 下坡后转入倒车入库区，主通道保持考试宽度。
      addRoute({ x: 540, y: 150 }, { x: 540, y: 420 }, 66);
      addRoute({ x: 540, y: 420 }, { x: 1040, y: 420 }, 68, true, false);
      roadSurfaces.push({ x: 760, y: 325, width: 330, height: 125, rotation: 0, color: '#303034', curbs: false });
      spots.push({ id: 'school-reverse-bay', x: 760, y: 315, width: 30, height: 62, rotation: 0, occupied: false });
      obstacles.push(createStaticCar(700, 315, Math.PI / 2, '#d1d5db'));
      obstacles.push(createStaticCar(820, 315, Math.PI / 2, '#64748b'));
      markings.push({ type: 'line-solid', x: 745, y: 315, width: 2, height: 64, rotation: 0, color: '#e5e7eb' });
      markings.push({ type: 'line-solid', x: 775, y: 315, width: 2, height: 64, rotation: 0, color: '#e5e7eb' });

      // 3. 侧方停车区位于下一段窄路外侧。
      addRoute({ x: 1040, y: 420 }, { x: 1040, y: 650 }, 64);
      addRoute({ x: 1040, y: 650 }, { x: 690, y: 650 }, 66, true, false);
      roadSurfaces.push({ x: 805, y: 704, width: 270, height: 44, rotation: 0, color: '#303034', curbs: false });
      spots.push({ id: 'school-parallel-bay', x: 805, y: 704, width: 60, height: 27, rotation: 0, occupied: false });
      obstacles.push(createStaticCar(730, 704, 0, '#f3f4f6'));
      obstacles.push(createStaticCar(880, 704, 0, '#6b7280'));

      // 4. 连续 S 弯、直角弯，然后进入窄桥。
      const bends = [
          { x: 690, y: 650 }, { x: 625, y: 670 }, { x: 570, y: 715 },
          { x: 550, y: 770 }, { x: 575, y: 825 }, { x: 635, y: 875 },
          { x: 700, y: 910 }, { x: 735, y: 940 }
      ];
      curvedRoads.push({ points: bends, width: 60, color: '#303034' });
      addRoute({ x: 735, y: 940 }, { x: 1000, y: 940 }, 54, false);
      obstacles.push({ id: 'school-bridge-n', x: 850, y: 910, width: 300, height: 5, rotation: 0, type: 'wall', movable: false, weight: 0, color: '#6b7280' });
      obstacles.push({ id: 'school-bridge-s', x: 850, y: 970, width: 300, height: 5, rotation: 0, type: 'wall', movable: false, weight: 0, color: '#6b7280' });
      addRoute({ x: 1000, y: 940 }, { x: 1000, y: 650 }, 62);

      // 5. 十字路口、停止线、斑马线和环岛构成终段。
      addRoute({ x: 1000, y: 650 }, { x: 1340, y: 650 }, 66);
      addRoute({ x: 1200, y: 480 }, { x: 1200, y: 820 }, 66);
      markings.push({ type: 'crosswalk', x: 1155, y: 650, width: 16, height: 66, rotation: 0, color: '#e5e7eb' });
      markings.push({ type: 'line-solid', x: 1128, y: 650, width: 3, height: 66, rotation: 0, color: '#e5e7eb' });
      markings.push({ type: 'stop', x: 1095, y: 650, width: 20, height: 20, rotation: 0, color: '#e5e7eb' });

      const roundX = 1430;
      const roundY = 650;
      const ringRadius = 92;
      const ringPoints: Vector2[] = [];
      for (let i = 0; i < 24; i++) {
          const angle = Math.PI + (i / 24) * Math.PI * 2;
          ringPoints.push({ x: roundX + Math.cos(angle) * ringRadius, y: roundY + Math.sin(angle) * ringRadius });
      }
      curvedRoads.push({ points: ringPoints, width: 64, color: '#303034', closed: true, kind: 'roundabout', center: { x: roundX, y: roundY }, radius: ringRadius });
      addRoute({ x: 1522, y: 650 }, { x: 1650, y: 650 }, 64);
      markings.push({ type: 'arrow-turn', x: 1300, y: 650, width: 20, height: 30, rotation: 0, color: '#e5e7eb' });
      spots.push({ id: 'school-finish', x: 1620, y: 650, width: 62, height: 28, rotation: 0, occupied: false });

      // 6. 南侧回程把所有项目闭合成一条完整循环，并加入窄路掉头
      // 与左右交替绕障训练。转弯处使用宽连接垫，避免出现断路。
      addRoute({ x: 1650, y: 650 }, { x: 1650, y: 1025 }, 62);
      roadSurfaces.push({ x: 1580, y: 1025, width: 205, height: 112, rotation: 0, color: '#303034', curbs: false });
      addRoute({ x: 1650, y: 1025 }, { x: 120, y: 1025 }, 62);
      addRoute({ x: 120, y: 1025 }, { x: 120, y: 150 }, 62);
      roadSurfaces.push({ x: 120, y: 150, width: 122, height: 112, rotation: 0, color: '#303034', curbs: false });
      markings.push({ type: 'arrow-turn', x: 1580, y: 1025, width: 20, height: 30, rotation: Math.PI, color: '#e5e7eb' });
      markings.push({ type: 'arrow-straight', x: 430, y: 1025, width: 20, height: 30, rotation: Math.PI, color: '#e5e7eb' });
      for (let i = 0; i < 8; i++) {
          const x = 1320 - i * 72;
          const y = 1025 + (i % 2 === 0 ? -17 : 17);
          obstacles.push(createCone(x, y));
      }
      // Narrow U-turn gates: the staggered pairs teach positioning without
      // sealing the route or creating invisible collision walls.
      for (const [x, y] of [[1565, 985], [1515, 1065], [1465, 985], [1415, 1065]]) {
          obstacles.push(createCone(x, y));
      }
  } else if (level === 5) {
      // ===== 驾校 2：按参考航拍图还原的矩形综合训练基地 =====
      mapSizeW = 1800;
      mapSizeH = 1050;
      startPos = { x: 880, y: 950, rotation: 0 };
      training = {
          title: '驾校 2 · 综合路线',
          tips: ['沿外围环路进入中央训练区', '低速完成直角弯与上下两组单行 S 弯', '压到道路边线会触发警告，最后完成紧凑倒库与侧方停车']
      };

      obstacles.push(createWall(mapSizeW / 2, -20, mapSizeW + 40, 40));
      obstacles.push(createWall(mapSizeW / 2, mapSizeH + 20, mapSizeW + 40, 40));
      obstacles.push(createWall(-20, mapSizeH / 2, 40, mapSizeH + 40));
      obstacles.push(createWall(mapSizeW + 20, mapSizeH / 2, 40, mapSizeH + 40));

      const addLane = (a: Vector2, b: Vector2, laneWidth = 48, warningEdges = true, centreLine = false) => {
          const angle = Math.atan2(b.y - a.y, b.x - a.x);
          const length = Math.hypot(b.x - a.x, b.y - a.y);
          const x = (a.x + b.x) / 2;
          const y = (a.y + b.y) / 2;
          roadSurfaces.push({ x, y, width: length + 5, height: laneWidth, rotation: angle, color: '#303034', curbs: false, warningEdges });
          const normalX = -Math.sin(angle);
          const normalY = Math.cos(angle);
          const edgeOffset = laneWidth / 2 - 0.7;
          // 考试边线在路口前收口，不能把每段矩形道路的边框一直画到
          // 交叉中心。主通道不承担压线判定时也不重复画外框。
          const edgeInset = Math.min(laneWidth * 0.48, Math.max(0, length / 2 - 3));
          const edgeLength = Math.max(4, length - edgeInset * 2);
          if (warningEdges) for (const side of [-1, 1]) {
              markings.push({ type: 'line-solid', x: x + normalX * edgeOffset * side, y: y + normalY * edgeOffset * side, width: edgeLength, height: 1.1, rotation: angle, color: '#f5f5f5' });
          }
          if (centreLine) markings.push({ type: 'line-dashed', x, y, width: length, height: 1.2, rotation: angle, color: '#d1d5db' });
      };
      const addCurveLane = (points: Vector2[], laneWidth = 46, warningEdges = true) => {
          curvedRoads.push({ points, width: laneWidth, color: '#303034', warningEdges });
      };

      // 外围循环：四段直路和四个大圆角，对应航拍图红色线路。
      addLane({ x: 160, y: 100 }, { x: 1640, y: 100 }, 70, false, true);
      addLane({ x: 1700, y: 160 }, { x: 1700, y: 890 }, 70, false, true);
      addLane({ x: 1640, y: 950 }, { x: 160, y: 950 }, 70, false, true);
      addLane({ x: 100, y: 890 }, { x: 100, y: 160 }, 70, false, true);
      addCurveLane([{ x: 160, y: 100 }, { x: 118, y: 112 }, { x: 100, y: 160 }], 70, false);
      addCurveLane([{ x: 1640, y: 100 }, { x: 1688, y: 112 }, { x: 1700, y: 160 }], 70, false);
      addCurveLane([{ x: 1700, y: 890 }, { x: 1688, y: 938 }, { x: 1640, y: 950 }], 70, false);
      addCurveLane([{ x: 160, y: 950 }, { x: 112, y: 938 }, { x: 100, y: 890 }], 70, false);

      // 中央横向主通道及纵向连接，构成与参考图相同的上下分区。
      addLane({ x: 150, y: 505 }, { x: 1650, y: 505 }, 66, false, true);
      addLane({ x: 720, y: 100 }, { x: 720, y: 505 }, 54, true);
      addLane({ x: 1180, y: 100 }, { x: 1180, y: 505 }, 54, true);
      addLane({ x: 760, y: 505 }, { x: 760, y: 950 }, 52, true);
      addLane({ x: 1320, y: 505 }, { x: 1320, y: 950 }, 52, true);

      // 左上连续直角弯与窄路掉头区，均为单行考试宽度。
      addLane({ x: 190, y: 190 }, { x: 590, y: 190 }, 44, true);
      addLane({ x: 590, y: 190 }, { x: 590, y: 350 }, 44, true);
      addLane({ x: 590, y: 350 }, { x: 390, y: 350 }, 44, true);
      addLane({ x: 390, y: 350 }, { x: 390, y: 270 }, 44, true);
      addLane({ x: 390, y: 270 }, { x: 220, y: 270 }, 44, true);
      addLane({ x: 220, y: 270 }, { x: 220, y: 430 }, 44, true);
      addLane({ x: 220, y: 430 }, { x: 720, y: 430 }, 44, true);

      // 上部中央折线窄路与右上 S 弯。
      const angularCourse: Vector2[] = [
          { x: 790, y: 455 }, { x: 790, y: 315 }, { x: 850, y: 220 },
          { x: 920, y: 350 }, { x: 990, y: 220 }, { x: 1060, y: 350 },
          { x: 1120, y: 250 }, { x: 1180, y: 250 }
      ];
      // One continuous centripetal spline rounds every Z-course vertex and
      // avoids the overlapping square slabs that used to flicker at corners.
      addCurveLane(angularCourse, 34, true);
      addCurveLane([
          { x: 1240, y: 200 }, { x: 1310, y: 150 }, { x: 1380, y: 225 },
          { x: 1450, y: 165 }, { x: 1520, y: 245 }, { x: 1605, y: 205 }
      ], 34, true);
      addLane({ x: 1605, y: 205 }, { x: 1700, y: 205 }, 34, true);

      // 下部两组完整 S 弯和连接通道，对应图片绿色练习线路。
      addCurveLane([
          { x: 145, y: 670 }, { x: 235, y: 625 }, { x: 325, y: 680 },
          { x: 415, y: 625 }, { x: 505, y: 680 }, { x: 595, y: 630 },
          { x: 705, y: 680 }
      ], 34, true);
      addCurveLane([
          { x: 100, y: 650 }, { x: 122, y: 660 }, { x: 145, y: 670 }
      ], 34, true);
      addCurveLane([
          { x: 705, y: 680 }, { x: 732, y: 690 }, { x: 760, y: 700 }
      ], 34, true);
      addCurveLane([
          { x: 760, y: 700 }, { x: 782, y: 677 }, { x: 805, y: 650 }
      ], 34, true);
      addCurveLane([
          { x: 805, y: 650 }, { x: 890, y: 610 }, { x: 975, y: 675 },
          { x: 1060, y: 615 }, { x: 1145, y: 680 }, { x: 1230, y: 620 },
          { x: 1315, y: 650 }
      ], 34, true);
      addCurveLane([
          { x: 1315, y: 650 }, { x: 1338, y: 700 }, { x: 1360, y: 745 }
      ], 34, true);
      addCurveLane([
          { x: 1360, y: 735 }, { x: 1430, y: 700 }, { x: 1500, y: 750 },
          { x: 1570, y: 705 }, { x: 1645, y: 750 }
      ], 34, true);
      addCurveLane([
          { x: 1645, y: 750 }, { x: 1672, y: 755 }, { x: 1700, y: 760 }
      ], 34, true);

      // 右下坡道项目。
      addLane({ x: 1360, y: 850 }, { x: 1640, y: 850 }, 48, true);
      slopeZones.push({ x: 1500, y: 850, length: 220, width: 48, rotation: 0, peakHeight: 17 });
      markings.push({ type: 'line-solid', x: 1435, y: 850, width: 2, height: 48, rotation: 0, color: '#fbbf24' });
      markings.push({ type: 'line-solid', x: 1565, y: 850, width: 2, height: 48, rotation: 0, color: '#fbbf24' });

      // 紧凑倒车入库与侧方停车，空位外侧只保留小幅安全间距。
      roadSurfaces.push({ x: 480, y: 560, width: 360, height: 92, rotation: 0, color: '#303034', curbs: false });
      spots.push({ id: 'school2-reverse', x: 480, y: 565, width: 29, height: 57, rotation: 0, occupied: false });
      obstacles.push(createStaticCar(438, 565, Math.PI / 2, '#d1d5db'));
      obstacles.push(createStaticCar(522, 565, Math.PI / 2, '#64748b'));
      markings.push({ type: 'line-solid', x: 465.5, y: 565, width: 1.2, height: 59, rotation: 0, color: '#f5f5f5' });
      markings.push({ type: 'line-solid', x: 494.5, y: 565, width: 1.2, height: 59, rotation: 0, color: '#f5f5f5' });

      roadSurfaces.push({ x: 1030, y: 900, width: 245, height: 40, rotation: 0, color: '#303034', curbs: false });
      spots.push({ id: 'school2-parallel', x: 1030, y: 900, width: 58, height: 25, rotation: 0, occupied: false });
      obstacles.push(createStaticCar(969, 900, 0, '#f3f4f6'));
      obstacles.push(createStaticCar(1091, 900, 0, '#6b7280'));
      spots.push({ id: 'school2-finish', x: 880, y: 950, width: 58, height: 26, rotation: 0, occupied: false });
  }
  return { levelId: level, mapWidth: mapSizeW, mapHeight: mapSizeH, spots, obstacles, markings, startPos, roadSurfaces, curvedRoads, slopeZones, training };
};

export const GENERATE_LEVEL=(id:number):LevelData=>[2,3,4,5].includes(id)?buildTrainingCampus(generateLegacyLevel):generateLegacyLevel(id===7?1:id);
