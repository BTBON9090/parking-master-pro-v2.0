export enum CarType {
  /** 海豹 08 手动训练车：保留离合/挡位教学，动力总成明确为模拟。 */
  SEDAN = 'SEDAN',
  /** 海豹 08 EV 905 旗舰：官方三电/尺寸，单速纯电，无假熄火。 */
  SEAL08 = 'SEAL08',
  SUV = 'SUV',
  TAI7 = 'TAI7',
  LI_I9 = 'LI_I9',
  N90 = 'N90',
  JEEP = 'JEEP', MIDIBUS = 'MIDIBUS', COACH = 'COACH', VAN = 'VAN', LIGHT_TRUCK = 'LIGHT_TRUCK',
  SPORTS = 'SPORTS',
  TRUCK = 'TRUCK',
  /** 小米 SU7 — 纯电运动轿车（Max 四驱数据）。 */
  SU7 = 'SU7',
  /** 小米 YU7 — 纯电中大型 SUV（Max 四驱数据）。 */
  YU7 = 'YU7',
  /** 尊界 V8 — 基于尊界 S800 车身的 V8 旗舰（大型豪华四门轿车）。 */
  ZUNJIE = 'ZUNJIE',
}

export enum WeatherType {
  SUNNY = 'SUNNY',
  RAINY = 'RAINY',
  SNOWY = 'SNOWY',
  FOGGY = 'FOGGY'
}

export enum DayTime {
  DAY = 'DAY',
  NIGHT = 'NIGHT'
}

export enum Language {
  CN = 'CN',
  EN = 'EN'
}

export type CameraView =
  | 'REAR_RIGHT'
  | 'REAR_LEFT'
  | 'FRONT_LEFT'
  | 'FRONT_RIGHT'
  | 'FOLLOW_FAR'
  | 'FOLLOW_NEAR'
  | 'TOP'
  | 'SIDE_LEFT'
  | 'SIDE_RIGHT'
  | 'HOOD'
  | 'REVERSE'
  | 'ORBIT';
export type DriveLayout = 'FWD' | 'RWD' | 'AWD';
export type EnginePosition = 'FRONT' | 'MID';
export type MirrorId = 'left' | 'right' | 'centre';

export interface MirrorAdjustment {
  screenX: number;
  screenY: number;
  yaw: number;
  pitch: number;
  mountForward: number;
  mountOutward: number;
  mountHeight: number;
  imageZoom: number;
  targetDistance: number;
  showBody: boolean;
}

export interface Vector2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number; // In radians
}

/**
 * Real gearbox data for one car model. Ratios follow published 5-speed
 * transmissions of comparable real vehicles; the powertrain model derives
 * per-gear top speeds and tractive effort from these.
 */
export interface TransmissionSpec {
  /** Forward ratios; EVs have one reduction gear. */
  gearRatios: number[];
  reverseRatio: number;
  finalDrive: number;
  wheelRadiusM: number;
  idleRpm: number;
  redlineRpm: number;
}

export interface CarConfig {
  id: CarType;
  name: string;
  price: number;
  color: string;
  width: number;
  length: number;
  height: number;
  maxSpeed: number;
  acceleration: number;
  turnSpeed: number;
  wheelbase: number;
  /** Measured wheel-centre track in game units (1 unit = 0.1 m). */
  trackWidth?: number;
  /** Published total adjustable ride-height range in metres, if the model
   *  exposes a controllable body-height system. Kept separate from wheel
   *  bump/droop travel and spring rate. */
  rideHeightRangeM?: number;
  /** Published minimum radius used for the steering-lock derivation, metres. */
  turningRadiusTargetM?: number;
  /** Interpretation of turningRadiusTargetM. */
  turningRadiusDefinition?: 'outer-front-wheel' | 'centreline' | 'body-outer';
  weight: number; // kg, 影响加速度平缓度与刹车距离
  dynamics: {
    driveLayout: DriveLayout;
    enginePosition: EnginePosition;
    powerKw: number;
    torqueNm: number;
    zeroTo100Seconds: number;
    frontWeightBias: number;
    cgHeightM: number;
    /** Drag area Cd×A in m² — drives the physical aerodynamic resistance. */
    dragAreaM2: number;
    grip: number;
    steeringRatio: number;
    throttleResponse: number;
    /** Real 5-speed gearbox data (ratios, final drive, wheel, rev range). */
    transmission: TransmissionSpec;
    /** Speed-sensitive steering: gain at top speed = 1/(1+K). Models the
     *  real combination of speed-sensitive power assistance and the
     *  understeer gradient. 0 = perfectly direct at any speed. */
    steerSpeedSensitivity: number;
    /** Steering slew-rate multiplier. 1 = default road-wheel response;
     *  trucks steer slower (~0.8), sports cars quicker (~1.15). */
    steerResponse: number;
    /** Maximum average front-wheel steer angle (radians), derived from the
     *  real vehicle's published minimum turning radius via
     *  δ = arctan(wheelbase / turningRadius). Replaces the former global
     *  MAX_STEER_ANGLE so each car model carries its own steering lock. */
    maxSteerAngle: number;
    /** Steady-state understeer gradient used above parking speeds. Higher
     *  values make the actual yaw response fall further behind the road-wheel
     *  angle as lateral acceleration rises. */
    understeerGradient: number;
    /** First-order yaw response. A low, heavy vehicle responds more slowly
     *  than a short-wheelbase sports car even at the same wheel angle. */
    yawResponse: number;
  /** Optional low-speed counter-phase rear steering (radians used at crawl). */
  rearSteerMaxDeg?: number;
  rearSteerFadeStartKmh?: number;
  rearSteerFadeEndKmh?: number;
  /** Calibrated same-phase assist at motorway speed, not an OEM numeric specification. */
  rearSteerHighSpeedDeg?: number;
  };
}

/** Runtime multipliers for live, per-vehicle calibration. Defaults are 1.0;
 *  keeping them in settings lets the tuning panel update the active car
 *  without rebuilding the scene or resetting the camera. */
export interface VehicleTuning {
  torqueScale: number;
  throttleResponseScale: number;
  shiftTimeScale: number;
  engineBrakeScale: number;
  steerLockScale: number;
  steerResponseScale: number;
  /** @deprecated No longer read by the driving loop (the fixed rack ratio and
   *  grip model replace the old speed-scaling knob). Kept for saved settings
   *  compatibility; it is not shown as an adjustable control. */
  speedSteerScale: number;
  understeerScale: number;
}

export interface AiConfig {
    path: Vector2[];
    currentPathIndex: number;
    /** Current speed in game speed units (1 = 15 km/h). */
    speed: number;
    maxSpeed: number;
    state: 'drive' | 'brake' | 'stop';
    lastLaneChange?: number;
    /** Seconds spent blocked by the player or another vehicle. */
    blockedFor?: number;
    /** Simulation-clock timestamp of the last horn (ms). */
    lastHonkAt?: number;
    /** Collision recovery lockout (simulation clock ms). */
    collisionCooldownUntil?: number;
}

export interface Obstacle {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  type: 'wall' | 'car' | 'cone' | 'pedestrian' | 'box';
  movable: boolean;
  weight: number; // 0 = immovable, higher = harder to push
  color: string;
  ai?: AiConfig; // NEW: If present, this obstacle is an AI agent
  modelKey?: string; // 地图编辑器：关联的 MODEL_REGISTRY key
  /** 图层高度(0..5，默认0)：数值越大渲染越靠上，避免被道路/桥面遮挡。可选字段不破坏旧存档。 */
  layer?: number;
  /** Physical road elevation in game units for layered bridge collision. */
  elevation?: number;
  /** Vertical collision extent above elevation (defaults by obstacle type). */
  verticalHeight?: number;
  /** Local convex footprint (x=forward, y=-left), matching the visible car. */
  collisionFootprint?: Vector2[];
  /** Collision-only walls (bridge rails) are not rendered as separate meshes. */
  collisionOnly?: boolean;
}

export interface ParkingSpot {
  elevation?: number;
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  occupied: boolean;
  /** Only set for a task explicitly requiring an entry direction. */
  requiresDirection?: 'forward' | 'reverse';
}

export interface Marking {
  id?: string; // 地图编辑器用 ID
  type: 'line-solid' | 'line-dashed' | 'line-double' | 'arrow-straight' | 'arrow-turn' | 'arrow-uturn' | 'arrow-left' | 'arrow-right' | 'arrow-merge-left' | 'arrow-merge-right' | 'zebra' | 'stop' | 'crosswalk' | 'roundabout' | 'channelize' | 'yield';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  color: string;
  /** 绑定到智能路口(Intersection.id)；存在则视为自动标线，随路口刷新/可被分析重建。无=手动标线。 */
  junctionId?: string;
  /** 图层高度(0..5，默认0)：数值越大渲染越靠上，避免被道路/桥面遮挡。可选字段不破坏旧存档。 */
  layer?: number;
  /** Physical road elevation in game units for layered bridge collision. */
  elevation?: number;
  /** Vertical collision extent above elevation (defaults by obstacle type). */
  verticalHeight?: number;
  /** Local convex footprint (x=forward, y=-left), matching the visible car. */
  collisionFootprint?: Vector2[];
  /** Collision-only walls (bridge rails) are not rendered as separate meshes. */
  collisionOnly?: boolean;
}

export interface RoadSurface {
  id?: string; // 地图编辑器用 ID
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  color: string; // 路面颜色（与地面沥青色区分）
  elevation?: number;
  /** Parking pads and junction aprons need an open edge for vehicle access. */
  curbs?: boolean;
  /** Contact with either painted edge triggers the driving-school warning. */
  warningEdges?: boolean;
}

export interface CurvedRoadSurface {
  points: Vector2[];
  width: number;
  color: string;
  closed?: boolean;
  kind?: 'path' | 'roundabout';
  center?: Vector2;
  radius?: number;
  elevation?: number;
  warningEdges?: boolean;
  /** 车道总数；缺省按 width/35 推断(1..6) */
  lanes?: number;
  /** 行驶方向：双向/单向(纯视觉) */
  direction?: 'two-way' | 'one-way';
  /** 逐点路宽(与 points 等长)；存在则优先于标量 width，用于渐变(由宽变窄) */
  widths?: number[];
  /** World-space circles where edge lines / arrows must be omitted, e.g. a
   *  T-junction where this ribbon meets another road. */
  markingGaps?: Array<{ x: number; y: number; radius: number }>;
}

/** A smooth training hill: zero height at both ends and a crest at the centre. */
export interface SlopeZone {
  x: number;
  y: number;
  length: number;
  width: number;
  rotation: number;
  peakHeight: number;
  /** Only vehicles travelling roughly along the slope axis use its height. */
  directional?: boolean;
}

/** 智能路口分类 */
export type JunctionType = 'cross' | 'T' | 'Y' | 'roundabout' | 'ramp' | 'complex';

/** 进入路口的一个臂（一条道路的一个方向） */
export interface JunctionArm {
  polyId: string;        // 所属折线 id
  heading: number;       // 指向路口中心的方向角(rad)
  lanes: number;         // 该臂车道数
  direction: 'two-way' | 'one-way';
  width: number;         // 该臂路宽
}

/** 路口/桥面连接件：放在两条未相连道路的交叉处，填补空隙或形成上跨桥；亦可由"智能分析"自动创建 */
export interface Intersection {
  id?: string;
  x: number;
  y: number;
  size: number;        // 路口方块边长
  rotation?: number;
  bridge?: boolean;    // true = 桥面(抬升上跨)
  elevation?: number;  // 桥面高度(默认 60)
  overRoadId?: string; // 被跨越的道路 id(可选, 用于语义)
  // —— 智能路口字段（旧存档缺省即视为手动连接件） ——
  auto?: boolean;          // 由"智能分析"生成；true 时随道路几何刷新
  locked?: boolean;        // 锁定后自动刷新不再覆盖（用户接管）
  junctionType?: JunctionType;
  arms?: JunctionArm[];    // 各进入臂
}

/** A drivable elevated deck with entry/exit ramps; ground below remains passable. */
export interface ElevatedRoad {
  id: string;
  x: number;
  y: number;
  /** Length along local X. */
  width: number;
  /** Deck/corridor width along local Y. */
  height: number;
  rotation: number;
  deckHeight: number;
  rampLength: number;
}

export interface LevelData {
  garage?: boolean;
  /** Original challenge-world height field and surface calibration. */
  challengeTerrain?: {kind:'mud'|'snow'|'quarry'|'forest'|'coast'; seed:number; grip:number; rolling:number};
  /** Continuous city/mountain world. The route samples also drive contact heights. */
  openWorld?: boolean;
  streetSigns?: Array<{x:number;y:number;rotation:number;label:string;kind:'street'|'speed'|'parking'}>;
  levelId: number;
  mapWidth: number;
  mapHeight: number;
  spots: ParkingSpot[];
  obstacles: Obstacle[];
  markings: Marking[];
  startPos: { x: number; y: number; rotation: number; elevation?: number };
  roadSurfaces?: RoadSurface[];
  /** Map-only terrain patches (off-road training areas). */
  terrainZones?: Array<{ x: number; y: number; width: number; height: number; rotation: number; color: string; label: string }>;
  curvedRoads?: CurvedRoadSurface[];
  /** Visual-only curb segments (instanced by the Beijing scenery builder). */
  curbSegments?: Array<{ x: number; y: number; rotation: number; length: number }>;
  slopeZones?: SlopeZone[];
  elevatedRoads?: ElevatedRoad[];
  intersections?: Intersection[];
  training?: {
    title: string;
    tips: string[];
  };
}

/** 方向盘输入曲线：从中心到打死的分段增益 + 平滑 / 高速抑制 / 回正。 */
export interface SteeringCurve {
  firstHalfGain: number;
  secondHalfGain: number;
  thirdHalfGain: number;
  inputSmoothing: number;
  highSpeedFloor: number;
  /** @deprecated Manual steering is now symmetric; kept for settings compatibility. */
  centeringGain: number;
  /** Steering-wheel return multiplier after the driver releases input. 0 disables auto-centering. */
  autoCenteringSpeed: number;
}

/**
 * First-person driver-eye calibration. Offsets are expressed in the game's
 * world units and are applied relative to each vehicle's authored eye
 * baseline, so the same zeroed preset remains sensible across body styles.
 */
export interface HoodCameraAdjustment {
  /** Positive moves the camera toward the vehicle nose. */
  forward: number;
  /** Positive moves the camera toward the vehicle's left side. */
  lateral: number;
  /** Positive raises the camera above the authored hood-camera height. */
  height: number;
  /** Positive looks upward, negative looks toward the road. */
  pitch: number;
  /** Positive aims left, negative aims right. */
  yaw: number;
  /** Perspective field of view in degrees. */
  fov: number;
}

/** 可自定义的驾驶按键（均为 KeyboardEvent.key 的小写形式）。 */
export interface KeyBindings {
  accelerate: string;
  brake: string;
  gearUp: string;
  gearDown: string;
  handbrake: string;
  parkingBrake: string;
  camera: string;
  lights: string;
  engine: string;
  reset: string;
  settings: string;
  tuning: string;
}

export interface UserSettings {
  mobileHudLayout?: import("./utils/mobileLayout").HudLayout;
  renderQuality?: import("./utils/renderQuality").RenderQuality;
  soundEnabled: boolean;
  /** 雷达/碰撞检测声音（接近嘟嘟 + 撞击嘟嘟） */
  radarSoundEnabled: boolean;
  /** 引擎声（发动机 + 刹车） */
  engineSoundEnabled: boolean;
  /** 方向盘转向指示声（咔哒/滴滴/呲呲） */
  steeringSoundEnabled: boolean;
  volume: number; // 0.0 to 1.0
  cabinVolume?: number;
  exteriorVolume?: number;
  steeringReleaseAssist: boolean; // Hands-off return, including stationary parking assist
  logitechKnobMode: boolean; // Optional media-dial steering + right-hand key layout
  wheelGhost: boolean; // 车轮透视：车身 30% 半透明，便于观察车轮与转向几何
  autoTurnSignal: boolean;
  weatherEnabled: boolean;
  /** 光影效果（实时阴影）。默认关闭以节省显存；开启后阴影可投射到地面与相邻物体。 */
  shadowsEnabled: boolean;
  absEnabled?: boolean; // Service brake only; rear handbrake always locks.
  steeringSensitivity: number; // 0.0 to 3.0; 1.0 is the realistic default
  steeringCurve: SteeringCurve;
  vehicleTuning: Record<CarType, VehicleTuning>;
  turnAssist: boolean; // NEW: Trajectory prediction
  hideVehicleBody: boolean; // In-game geometry inspection: keep wheels visible
  rearviewMirrors: boolean; // 始终显示三块后视镜
  mirrorSwapSides: boolean;
  mirrorAdjustments: Record<MirrorId, MirrorAdjustment>;
  hoodCameraAdjustment: HoodCameraAdjustment;
  /** Controllable body-height offset in mm, clamped to the current car's
   *  published total range. It moves the sprung body only; wheels stay on
   *  their contact patches. 0 = nominal. */
  rideHeightMm: number;
  debugPhysics: DebugPhysics;
  /**
   * 驾驶舱组件样式包 id（后视镜 / 仪表盘 / 方向盘 / 转向指示器）。
   * 样式包定义见 components/cockpit/stylePacks.ts；后续规划会为不同车型
   * 提供多套样式供玩家选择。缺省时使用默认包。
   */
  cockpitPackId?: string;
  /** 驾驶按键绑定；缺省用 DEFAULT_KEY_BINDINGS。 */
  keyBindings?: KeyBindings;
}

/**
 * Live-tuning surface for the Ackermann four-wheel geometry model. Every
 * field below corresponds to a real, measurable vehicle quantity — no
 * bicycle-model fudge factors. When `enabled` is false the physics loop
 * uses the documented defaults (which are themselves pure Ackermann).
 */
export interface DebugPhysics {
  /** Master switch. false = use defaults below verbatim (still pure Ackermann). */
  enabled: boolean;
  // —— Drive & motion reference (longitudinal, in wheelbase fractions:
  //     0 = front axle, 0.5 = body centre, 1 = rear axle) ——
  /** @deprecated No longer affects physics. Traction per drive layout is now
   *  derived from CarConfig.dynamics (grip × driven-axle load). Kept only so
   *  old in-memory settings objects still type-check. */
  driveAxleOffset: number;
  /** @deprecated No longer affects physics. Motion is integrated from the
   *  model's actual rear axle offset; kept for old settings compatibility. */
  motionReferenceOffset: number;
  // —— Steering contact point ——
  /** @deprecated No longer affects physics or the guide. Kept for old
   *  settings compatibility; not shown in the tuning panel. */
  steerContactLateral: number;
  /** @deprecated No longer affects the assist line (it now uses the actual
   *  front axle). Kept for old settings compatibility. */
  guideAxleFraction: number;
  // —— Steering lock & track ——
  /** Multiplier on cc.dynamics.maxSteerAngle (physical steering lock).
   *  Range 0.7..1.4. */
  maxSteerMultiplier: number;
  /** @deprecated No longer affects the wheel visuals; front wheels use the
   *  physical Ackermann angle. Kept for old settings compatibility. */
  frontWheelVisualAngleDeg: number;
  /** @deprecated No longer affects visuals, the guide or the differential;
   *  those now use the model's actual wheel mounts. */
  halfTrackFactor: number;
  /** @deprecated No longer affects the Ackermann pair; the model uses the
   *  actual track width. Kept for old settings compatibility. */
  ackermannSplitGain: number;
  // —— Differential ——
  /** @deprecated No longer affects wheel roll; the differential uses the
   *  geometric Ackermann radius at 100%. Kept for old settings compatibility. */
  differentialGain: number;
}

export interface InputState {
  throttle: number; // 0 to 1 (From Mobile Slider)
  gasPressed: boolean; // From Keyboard W
  shiftPressed?: boolean; // Shift upgrades W/S from light pedal input to full input
  brake: number; // 0 to 1
  steeringWheelAngle: number; // Degrees
  gear: number; // -1 = R, 0 = N, 1-5 = Forward
  handbrake: boolean;
  parkingBrake?: boolean;
  lights: boolean;
  headlightMode?: 0 | 1 | 2; // off / dipped / main beam
  engineStarted: boolean; 
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // 0 to 1
  size: number;
  color: string;
}

export interface SkidMark {
  x: number;
  y: number;
  rotation: number;
  opacity: number;
  timestamp: number;
}

export type ParkingResultType = 'perfect' | 'good' | 'reverse' | 'line' | 'fail';
