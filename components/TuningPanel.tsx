import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { UserSettings, Language, CarType, VehicleTuning, MirrorAdjustment, MirrorId, HoodCameraAdjustment } from '../types';
import { CAR_MODELS, DEFAULT_MIRROR_ADJUSTMENTS, DEFAULT_VEHICLE_TUNING, hoodCameraDefaultForCar, TRANSLATIONS } from '../constants';
import { getPowertrain, SPEED_UNIT_KMH } from '../utils/powertrain';
import { ackermannAngles } from '../utils/driving';
import { Sliders, X, Activity, Cpu, RotateCcw, Copy, Check, Gauge, Wrench, Route, CarFront, GripHorizontal, ChevronDown, ChevronUp, Scan } from 'lucide-react';
import HoodCameraLocator from './HoodCameraLocator';
import { DRIVING_TEST_POINTS, GARAGE_TEST_POINTS } from '../utils/testPoints';

/**
 * In-game floating tuning panel. Opens with the `T` hotkey (toggle-tuning
 * window event) and stays over the live scene — it does NOT pause the game
 * and does NOT rebuild the Three.js scene (the camera stays exactly where it
 * is). Live readouts (speed, rpm, gear, steer δ°, turn radius, longitudinal
 * g) stream in at ~30 Hz from GameCanvas3D via the `physics-debug-readout`
 * event, which the physics loop now always dispatches.
 *
 * The steering-curve and Ackermann-debug sliders that used to live inside the
 * pause-settings modal are moved here so the player can scrub them while
 * watching the car react in real time.
 */
interface TuningPanelProps {
  open: boolean;
  onClose: () => void;
  settings: UserSettings;
  updateSettings: (s: Partial<UserSettings>) => void;
  currentCarId: CarType;
  levelId?: number;
  lang: Language;
}

interface Readout {
  speed: number;
  speedKmh?: number;
  rpm?: number;
  gear?: number;
  yawRate: number;
  turnRadius: number;
  steeringAngleDeg: number;
  steeringWheelDeg?: number;
  effectiveSteeringAngleDeg?: number;
  accelG?: number;
  lateralG?: number;
  shiftProgress?: number;
  steerWheelMaxDeg?: number;
  /** Actual model axle geometry streamed from the physics loop. */
  wheelbase?: number;
  frameAvgMs?: number;
  frameP95Ms?: number;
  positionStepMax?: number;
  speedStepMax?: number;
  audioReady?: boolean;
  audioLoaded?: number;
  audioTotal?: number;
  audioFailed?: string;
  audioActive?: boolean;
  audioMix?:{cabin:boolean;motor:number;road:number;hz:number;driving:boolean};
  terrainHeight?: number;
  bodyHeave?: number;
  bodyPitchDeg?: number;
  bodyRollDeg?: number;
  driverHeadOffset?:number[];
  impactReadout?:{closing:number;yaw:number;speedAfter:number;obstacle:string};
  wheelTravel?: number[];
  wheelContacts?: number[];
  wheelGap?: number[];
  wheelGrounded?: boolean[];
  surface?: string;
  filteredAccelG?: number;
  throttleActual?: number;
  brakeActual?: number;
  brakeLocks?: string;
  dynamicPitchDeg?: number;
  rearSteerDeg?: number;
  surfaceHeight?: number;
  npcStatic?: number;
  halfTrack?: number;
  rearAxleOffset?: number;
}

type NumericMirrorKey = Exclude<keyof MirrorAdjustment, 'showBody'>;

const DEFAULT_READOUT: Readout = {
  speed: 0,
  yawRate: 0,
  turnRadius: Infinity,
  steeringAngleDeg: 0,
};

const TuningPanel: React.FC<TuningPanelProps> = ({
  open, onClose, settings, updateSettings, currentCarId, lang, levelId,
}) => {
  const [readout, setReadout] = useState<Readout>(DEFAULT_READOUT);
  const [tab, setTab] = useState<TuningTab>('steer');
  const [copied, setCopied] = useState<'none' | 'steer' | 'drive' | 'geo' | 'mirror' | 'camera' | 'all'>('none');
  const [activeMirror, setActiveMirror] = useState<MirrorId>('left');
  const [showSpecs, setShowSpecs] = useState(true);
  const [showTelemetry, setShowTelemetry] = useState(true);
  const rideRangeMm = Math.round((CAR_MODELS[currentCarId].rideHeightRangeM ?? 0) * 1000);
  const [collisionDebug, setCollisionDebug] = useState(false);
  const [position, setPosition] = useState(() => ({
    x: typeof window === 'undefined' ? 16 : Math.max(12, window.innerWidth - 404),
    y: 86,
  }));
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ active: false, pointerId: -1, dx: 0, dy: 0 });

  useEffect(() => {
    if (!open) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) setReadout(detail);
    };
    window.addEventListener('physics-debug-readout', handler);
    return () => window.removeEventListener('physics-debug-readout', handler);
  }, [open]);

  useEffect(() => {
    if (!copied || copied === 'none') return;
    const t = window.setTimeout(() => setCopied('none'), 1500);
    return () => window.clearTimeout(t);
  }, [copied]);

  useEffect(() => {
    const clampPosition = () => setPosition(previous => ({
      x: Math.max(8, Math.min(previous.x, window.innerWidth - 388)),
      y: Math.max(8, Math.min(previous.y, window.innerHeight - 72)),
    }));
    window.addEventListener('resize', clampPosition);
    return () => window.removeEventListener('resize', clampPosition);
  }, []);

  const beginDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button,input')) return;
    dragRef.current = {
      active: true,
      pointerId: event.pointerId,
      dx: event.clientX - position.x,
      dy: event.clientY - position.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active || dragRef.current.pointerId !== event.pointerId) return;
    setPosition({
      x: Math.max(8, Math.min(event.clientX - dragRef.current.dx, window.innerWidth - 388)),
      y: Math.max(8, Math.min(event.clientY - dragRef.current.dy, window.innerHeight - 72)),
    });
  };
  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current.pointerId === event.pointerId) dragRef.current.active = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  if (!open) return null;

  const t = TRANSLATIONS[lang];
  const cc = CAR_MODELS[currentCarId];
  const pt = getPowertrain(currentCarId);
  const vehicleTune = settings.vehicleTuning[currentCarId] ?? DEFAULT_VEHICLE_TUNING[currentCarId];
  const isCN = lang === Language.CN;

  const fmtRadius = (r: number) =>
    !Number.isFinite(r) ? '∞' : (Math.abs(r) / 10).toFixed(2) + ' m';

  const liveRows: Array<[string, string, string]> = [
    [isCN ? '车速' : 'Speed',
      Math.round(readout.speedKmh ?? Math.abs(readout.speed) * 15) + ' km/h',
      'var(--amber)'],
    [isCN ? '转速' : 'RPM',
      (readout.rpm ?? 0) + ' / ' + pt.redlineRpm,
      (readout.rpm ?? 0) > pt.redlineRpm * 0.92 ? 'var(--red)' : 'var(--text)'],
    [isCN ? '档位' : 'Gear',
      readout.gear === -1 ? 'R' : readout.gear === 0 ? 'N' : String(readout.gear ?? 0),
      readout.gear === -1 ? 'var(--red)' : (readout.gear ?? 0) > 0 ? 'var(--green)' : 'var(--text-dim)'],
    [isCN ? '前轮转角 δ' : 'Steer δ',
      (readout.steeringAngleDeg ?? 0).toFixed(1) + '°',
      'var(--text)'],
    [isCN ? '有效轨迹转角' : 'Path steer',
      (readout.effectiveSteeringAngleDeg ?? readout.steeringAngleDeg ?? 0).toFixed(1) + '°',
      'var(--cyan)'],
    [isCN ? '方向盘' : 'Steering wheel',
      Math.round(readout.steeringWheelDeg ?? 0) + '° / ±' + Math.round(readout.steerWheelMaxDeg ?? pt.steerWheelMaxDeg) + '°',
      'var(--text)'],
    [isCN ? '转弯半径 R' : 'Turn radius R',
      fmtRadius(readout.turnRadius), 'var(--cyan)'],
    [isCN ? '横摆率 ω' : 'Yaw rate ω',
      readout.yawRate.toFixed(3) + ' rad/s', 'var(--text-dim)'],
    [isCN ? '纵向加速度' : 'Long. accel',
      (readout.accelG ?? 0).toFixed(2) + ' g',
      Math.abs(readout.accelG ?? 0) > 0.6 ? 'var(--amber)' : 'var(--text-dim)'],
    [isCN ? '横向加速度' : 'Lateral accel',
      (readout.lateralG ?? 0).toFixed(2) + ' g',
      Math.abs(readout.lateralG ?? 0) > 0.5 ? 'var(--amber)' : 'var(--text-dim)'],
    [isCN ? '换挡接合' : 'Shift coupling',
      Math.round((readout.shiftProgress ?? 1) * 100) + '%',
      (readout.shiftProgress ?? 1) < 1 ? 'var(--amber)' : 'var(--green)'],
    [isCN ? '帧间隔 mean/p95' : 'Frame mean/p95',
      `${(readout.frameAvgMs ?? 0).toFixed(1)} / ${(readout.frameP95Ms ?? 0).toFixed(1)} ms`,
      (readout.frameP95Ms ?? 0) > 25 ? 'var(--amber)' : 'var(--green)'],
    [isCN ? '单帧位移/速度跃变' : 'Step / speed jump',
      `${(readout.positionStepMax ?? 0).toFixed(2)} u / ${(readout.speedStepMax ?? 0).toFixed(3)} u`,
      (readout.speedStepMax ?? 0) > 0.2 ? 'var(--amber)' : 'var(--text-dim)'],
    [isCN ? '音频素材' : 'Audio assets',
      `${readout.audioLoaded ?? 0}/${readout.audioTotal ?? 0}${readout.audioFailed ? ' · ' + readout.audioFailed : ''} · ${readout.audioActive ? 'ACTIVE' : 'MUTED'}`,
      readout.audioReady && readout.audioActive ? 'var(--green)' : 'var(--amber)'],
    [isCN ? '声场 / 驱动力音' : 'Sound / drive', `${readout.audioMix?.cabin?'车内':'车外'} · ${readout.audioMix?.driving?'驱动':'滑行/静止'} · 电机 ${(readout.audioMix?.motor??0).toFixed(4)} / 胎噪 ${(readout.audioMix?.road??0).toFixed(4)}`, 'var(--cyan)'],
    [isCN ? '地形 / 升沉' : 'Terrain / heave',
      `${(readout.terrainHeight ?? 0).toFixed(2)} / ${(readout.bodyHeave ?? 0).toFixed(2)} u`,
      'var(--cyan)'],
    [isCN ? '头部偏移 左/上/前' : 'Head left/up/forward', (readout.driverHeadOffset??[0,0,0]).map(v=>v.toFixed(2)).join(' / ')+' cm', 'var(--cyan)'],
    [isCN ? '碰撞 法向/剩余速度/旋转' : 'Impact normal/speed/yaw', `${(readout.impactReadout?.closing??0).toFixed(1)} / ${(readout.impactReadout?.speedAfter??0).toFixed(1)} km/h / ${(readout.impactReadout?.yaw??0).toFixed(2)} rad/s`, 'var(--amber)'],
    [isCN ? '俯仰 / 侧倾' : 'Pitch / roll',
      `${(readout.bodyPitchDeg ?? 0).toFixed(1)}° / ${(readout.bodyRollDeg ?? 0).toFixed(1)}°`,
      'var(--text-dim)'],
    [isCN ? '四轮行程' : 'Wheel travel',
      (readout.wheelTravel ?? []).map(value => value.toFixed(2)).join(' / '),
      'var(--amber)'],
    [isCN ? '四轮接地' : 'Wheel contact',
      (readout.wheelGrounded ?? []).map(value => value ? 'G' : '--').join(' / ')
        + ' · ' + (readout.wheelContacts ?? []).map(value => value.toFixed(2)).join(' / '),
      'var(--text-dim)'],
    [isCN ? '轮底-路面间隙' : 'Tyre centre − radius − surface',
      (readout.wheelGap ?? []).map(value => value.toFixed(2)).join(' / ') + ' u',
      (readout.wheelGap ?? []).some(value => value > 0.10) ? 'var(--amber)' : 'var(--green)'],
    [isCN ? '路面层' : 'Surface',
      readout.surface ?? 'asphalt',
      readout.surface === 'gravel' ? 'var(--amber)' : 'var(--text-dim)'],
    [isCN ? '实际油门 / 刹车' : 'Actual throttle / brake',
      `${((readout.throttleActual ?? 0) * 100).toFixed(0)}% / ${((readout.brakeActual ?? 0) * 100).toFixed(0)}%`,
      'var(--cyan)'],
    ['前轴 / 后轴制动', readout.brakeLocks ?? '滚动 / 滚动', 'var(--cyan)'],
    [isCN ? '纵向 g / 动态俯仰' : 'Long g / dynamic pitch',
      `${(readout.filteredAccelG ?? 0).toFixed(2)}g / ${(readout.dynamicPitchDeg ?? 0).toFixed(2)}°`,
      'var(--amber)'],
    [isCN ? '路面高度 / NPC' : 'Road height / NPC',
      `${(readout.surfaceHeight ?? 0).toFixed(2)}u / ${readout.npcStatic ?? 0}`,
      'var(--text-dim)'],
    [isCN ? '后轮转向' : 'Rear steer',
      `${(readout.rearSteerDeg ?? 0).toFixed(2)}°`,
      'var(--cyan)'],
  ];

  const steerRows: Array<[keyof UserSettings['steeringCurve'], string, number, number, number, number, number, string]> = [
    ['firstHalfGain', isCN ? '第一半圈增益' : 'First half-turn', 0.05, 3, 0.01, 0, 5, isCN ? '方向盘中心到半圈的响应。调低更容易保持直线。' : 'Response from centre to half a turn. Lower values improve straight-line control.'],
    ['secondHalfGain', isCN ? '第二半圈增益' : 'Second half-turn', 0.05, 3, 0.01, 0, 5, isCN ? '控制中段转向速度，影响一般弯道和倒库修正。' : 'Controls mid-range steering used for normal turns and parking corrections.'],
    ['thirdHalfGain', isCN ? '第三半圈增益' : 'Third half-turn', 0.1, 4, 0.01, 0, 6, isCN ? '控制接近打死时的后段响应，调大可更快到达满舵。' : 'Controls the final range near full lock. Higher reaches full lock faster.'],
    ['inputSmoothing', isCN ? '输入平滑' : 'Input smoothing', 0.01, 1, 0.01, 0, 1.5, isCN ? '调小更柔和稳定，调大更直接跟手。' : 'Lower is smoother and steadier; higher feels more immediate.'],
    ['highSpeedFloor', isCN ? '高速最低响应' : 'High-speed floor', 0.05, 1, 0.01, 0, 1, isCN ? '高速时保留的最低转向响应。调大后高速更灵敏。' : 'Minimum steering retained at speed. Higher makes high-speed steering more responsive.'],
    ['autoCenteringSpeed', isCN ? '方向盘自动回正速度' : 'Auto-centering speed', 0, 4, 0.01, 0, 8, isCN ? '松开转向操作后的回正速度倍率。1 保持原速度，0 关闭自动回正，数值越大回正越快。' : 'Hands-off return-speed multiplier. 1 keeps the original rate, 0 disables auto-centering, and higher values return faster.'],
  ];

  // Only knobs that are actually read by the driving loop live here. The old
  // motion-reference / visual-lock / half-track / Ackermann-split / diff-gain
  // sliders were no-ops after the model moved to the authored wheel axles, so
  // they were removed rather than left as fake controls.
  const geoRows: Array<[keyof UserSettings['debugPhysics'], string, number, number, number, 'deg' | 'num', number, number, string]> = [
    ['maxSteerMultiplier', isCN ? '转向锁倍率' : 'Max steer mult', 0.3, 2, 0.01, 'num', 0.1, 3, isCN ? '放大或缩小车辆实际最大前轮转角，会改变转弯半径。仅在调试覆盖开启时生效。' : 'Scales physical road-wheel lock and changes the turning radius. Applies only while overrides are enabled.'],
  ];

  const mirrorRows: Array<[NumericMirrorKey, string, number, number, number, string]> = [
    ['screenX', isCN ? '屏幕水平位置' : 'Screen X', -240, 240, 1, isCN ? '只移动当前镜框在屏幕中的水平位置。' : 'Moves this mirror frame horizontally on screen.'],
    ['screenY', isCN ? '屏幕上下位置' : 'Screen Y', activeMirror === 'centre' ? -68 : -180, activeMirror === 'centre' ? 20 : 10, 1, isCN ? '负值向上，向下范围受限，避免镜框离开屏幕。' : 'Negative moves upward; downward travel is limited to keep the mirror on screen.'],
    ['yaw', isCN ? '内外旋角度' : 'Inward / outward yaw', -25, 25, 0.5, isCN ? '校正镜面向车内或车外的观察方向。' : 'Aims the mirror inward or outward.'],
    ['pitch', isCN ? '上下俯仰角' : 'Vertical pitch', -18, 18, 0.5, isCN ? '调整镜面观察地面或远处的俯仰方向。' : 'Aims the mirror toward the road or horizon.'],
    ['mountForward', isCN ? '镜头前后位置' : 'Mount forward', -1, 1, 0.05, isCN ? '沿车身前后移动虚拟镜头安装点。' : 'Moves the virtual mirror mount along the body.'],
    ['mountOutward', isCN ? '镜面内外位置' : 'Mount outward', -10, 1, 0.05, isCN ? '调整镜头相对车身向内或向外的位置；负值范围扩展至 -10，便于不同车型精细校准。' : 'Moves the mirror mount inward or outward; the negative range extends to -10 for per-vehicle calibration.'],
    ['mountHeight', isCN ? '镜头安装高度' : 'Mount height', -4, 8, 0.25, isCN ? '匹配不同车型后视镜的实际安装高度。' : 'Matches the mount height of each vehicle.'],
    ['imageZoom', isCN ? '成像远近' : 'Image zoom', -18, 18, 0.5, isCN ? '调整视野角，负值显示更远、更广。' : 'Changes field of view; negative values show a wider, farther image.'],
    ['targetDistance', isCN ? '观察目标距离' : 'Target distance', 28, 150, 1, isCN ? '改变镜头朝向的参考目标距离。' : 'Changes the aiming target distance.'],
  ];

  const cameraRows: Array<[keyof HoodCameraAdjustment, string, number, number, number, string, string]> = [
    ['forward', isCN ? '前后位置' : 'Forward position', -24, 30, 0.25, '', isCN ? '正值向车头移动，负值向座舱方向移动。' : 'Positive moves toward the nose; negative moves toward the cabin.'],
    ['lateral', isCN ? '左右位置' : 'Lateral position', -20, 20, 0.25, '', isCN ? '驾驶眼位相对车身中心线的左右偏移，正值向左；左舵车默认在左侧。' : 'Lateral offset of the driver eye; positive moves left. Left-hand-drive baseline sits on the left.'],
    ['height', isCN ? '上下高度' : 'Camera height', -10, 24, 0.25, '', isCN ? '在默认驾驶员眼位上下增减高度。' : 'Raises or lowers the driver-eye baseline.'],
    ['pitch', isCN ? '上下俯仰' : 'Pitch', -24, 30, 0.25, '°', isCN ? '负值看向近处路面，正值看向更高的地平线。' : 'Negative aims toward the near road; positive raises the horizon.'],
    ['yaw', isCN ? '左右偏航' : 'Yaw', -20, 20, 0.25, '°', isCN ? '调整车头视角的水平朝向，正值向左。' : 'Adjusts horizontal aim; positive looks left.'],
    ['fov', isCN ? '广角视域' : 'Field of view', 40, 120, 1, '°', isCN ? '数值越大视野越广，边缘透视也会更强。' : 'Higher is wider and increases edge perspective.'],
  ];

  // The angle card reports the runtime Ackermann pair from the actual model
  // axle geometry (streamed by GameCanvas3D), not a formula using stale knobs.
  const runtimeWheelbase = readout.wheelbase ?? cc.wheelbase;
  const runtimeHalfTrack = readout.halfTrack ?? cc.width * 0.46;
  const actualSteerRad = (readout.steeringAngleDeg ?? 0) * Math.PI / 180;
  const actualAngles = ackermannAngles(actualSteerRad, runtimeWheelbase, runtimeHalfTrack);
  const actualLargerDeg = Math.max(Math.abs(actualAngles.left), Math.abs(actualAngles.right)) * 180 / Math.PI;
  const actualSmallerDeg = Math.min(Math.abs(actualAngles.left), Math.abs(actualAngles.right)) * 180 / Math.PI;
  const visualSplitDeg = Math.max(0, actualLargerDeg - actualSmallerDeg);

  const driveRows: Array<[keyof VehicleTuning, string, number, number, number, string]> = [
    ['torqueScale', isCN ? '轮上扭矩' : 'Wheel torque', 0.2, 2.5, 0.01, isCN ? '整体驱动力倍率。调大会提高各挡加速度和爬坡能力。' : 'Overall tractive force. Higher increases acceleration and hill-climb ability.'],
    ['throttleResponseScale', isCN ? '油门响应' : 'Throttle response', 0.1, 3, 0.01, isCN ? '油门建立速度。调小更柔和，调大动力来得更快。' : 'How quickly throttle builds. Lower is gentler; higher responds faster.'],
    ['shiftTimeScale', isCN ? '换挡接合时间' : 'Shift duration', 0.2, 3, 0.01, isCN ? '换挡扭矩衔接时长。调小换挡更快，调大更缓慢。' : 'Torque handover duration. Lower shifts faster; higher shifts more slowly.'],
    ['engineBrakeScale', isCN ? '发动机制动' : 'Engine braking', 0.1, 3, 0.01, isCN ? '松油门或熄火带挡时的减速强度。' : 'Deceleration strength off-throttle or in-gear with engine off.'],
  ];

  const vehicleSteerRows: Array<[keyof VehicleTuning, string, number, number, number, string]> = [
    ['steerLockScale', isCN ? '车型转向锁' : 'Vehicle steer lock', 0.5, 2, 0.005, isCN ? '当前车型最大实际转角倍率，调大会缩小最小转弯半径。' : 'Physical lock multiplier. Higher reduces the minimum turning radius.'],
    ['steerResponseScale', isCN ? '转向系统响应' : 'Steering response', 0.2, 3, 0.01, isCN ? '前轮跟随方向盘和车身横摆的速度，调大更跟手。' : 'How quickly wheels and yaw follow input. Higher feels more immediate.'],
    ['understeerScale', isCN ? '轮胎不足转向' : 'Tyre understeer', 0, 3, 0.01, isCN ? '调大会让高速轨迹更容易推头，0 表示不附加不足转向。' : 'Higher adds more high-speed understeer; 0 disables the extra effect.'],
  ];

  const updateVehicleTune = (key: keyof VehicleTuning, value: number) => {
    updateSettings({
      vehicleTuning: {
        ...settings.vehicleTuning,
        [currentCarId]: { ...vehicleTune, [key]: value },
      },
    });
  };

  const updateMirror = (id: MirrorId, patch: Partial<MirrorAdjustment>) => {
    updateSettings({
      mirrorAdjustments: {
        ...settings.mirrorAdjustments,
        [id]: { ...settings.mirrorAdjustments[id], ...patch },
      },
    });
  };
  const copyMirrors = () => {
    void navigator.clipboard?.writeText(JSON.stringify({
      mirrorSwapSides: settings.mirrorSwapSides,
      mirrorAdjustments: settings.mirrorAdjustments,
    }, null, 2));
    setCopied('mirror');
  };
  const resetMirror = () => updateMirror(activeMirror, { ...DEFAULT_MIRROR_ADJUSTMENTS[activeMirror] });

  const copySteer = () => {
    try {
      navigator.clipboard?.writeText(JSON.stringify(settings.steeringCurve, null, 2));
      setCopied('steer');
    } catch { /* ignore */ }
  };
  const copyGeo = () => {
    try {
      navigator.clipboard?.writeText(JSON.stringify({
        enabled: settings.debugPhysics.enabled,
        maxSteerMultiplier: settings.debugPhysics.maxSteerMultiplier,
        runtimeGeometry: {
          wheelbase: readout.wheelbase,
          halfTrack: readout.halfTrack,
          steeringAngleDeg: readout.steeringAngleDeg,
        },
      }, null, 2));
      setCopied('geo');
    } catch { /* ignore */ }
  };
  const copyDrive = () => {
    void navigator.clipboard?.writeText(JSON.stringify({
      car: currentCarId,
      dynamics: vehicleTune,
    }, null, 2));
    setCopied('drive');
  };
  const copyCamera = () => {
    void navigator.clipboard?.writeText(JSON.stringify({
      car: currentCarId,
      hoodCameraAdjustment: settings.hoodCameraAdjustment,
    }, null, 2));
    setCopied('camera');
  };
  const copyAll = () => {
    void navigator.clipboard?.writeText(JSON.stringify({
      car: currentCarId,
      steeringSensitivity: settings.steeringSensitivity,
      steeringCurve: settings.steeringCurve,
      vehicleTuning: vehicleTune,
      geometry: {
        enabled: settings.debugPhysics.enabled,
        maxSteerMultiplier: settings.debugPhysics.maxSteerMultiplier,
      },
      hoodCameraAdjustment: settings.hoodCameraAdjustment,
      display: {
        turnAssist: settings.turnAssist,
        hideVehicleBody: settings.hideVehicleBody,
      },
    }, null, 2));
    setCopied('all');
  };
  const resetVehicleTune = () => {
    updateSettings({
      vehicleTuning: {
        ...settings.vehicleTuning,
        [currentCarId]: { ...DEFAULT_VEHICLE_TUNING[currentCarId] },
      },
    });
  };

  return createPortal(
    <>
    <div
      ref={panelRef}
      className="fixed pointer-events-auto"
      style={{
        top: position.y, left: position.x,
        width: 380, maxHeight: `calc(100vh - ${Math.max(12, position.y + 12)}px)`,
        zIndex: 45,
      }}
      onPointerDown={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
      onWheel={e => e.stopPropagation()}
      onContextMenu={e => e.stopPropagation()}>
      <div className="cockpit-panel flex flex-col" style={{ maxHeight: 'inherit' }}>
        <div className="absolute top-0 left-0 w-full h-[2px]" style={{ background: 'var(--amber)' }} />
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b cursor-grab active:cursor-grabbing select-none"
             style={{ borderColor: 'var(--hairline)', touchAction: 'none' }}
             onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
          <div className="flex items-center gap-2">
            <GripHorizontal size={14} style={{ color: 'var(--text-mute)' }} />
            <Sliders size={14} style={{ color: 'var(--amber)' }} />
            <span className="mono text-[11px] font-bold tracking-[0.18em]" style={{ color: 'var(--text)' }}>
              {isCN ? '车辆实时标定' : 'LIVE VEHICLE TUNING'}
            </span>
          </div>
          <button onClick={onClose}
                  onPointerDown={e => e.stopPropagation()}
                  className="p-1.5 hover:bg-white/5 rounded-full transition-colors">
            <X size={14} style={{ color: 'var(--text-dim)' }} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain cockpit-scroll">
        {/* Spec strip — per-car real data */}
        <div className="border-b" style={{ borderColor: 'var(--hairline)', background: 'rgba(0,0,0,0.25)' }}>
          <button type="button" onClick={() => setShowSpecs(value => !value)} className="w-full px-4 py-2.5 flex items-center justify-between text-left">
            <span className="text-[10px] font-bold tracking-wider" style={{ color: 'var(--amber)' }}>
              {isCN ? '车型参数' : 'VEHICLE SPEC'} · {cc.name.toUpperCase()}
            </span>
            {showSpecs ? <ChevronUp size={13} style={{ color: 'var(--text-mute)' }} /> : <ChevronDown size={13} style={{ color: 'var(--text-mute)' }} />}
          </button>
          {showSpecs && <div className="px-4 pb-3 grid grid-cols-2 gap-x-3 gap-y-1">
          <div className="col-span-2 mono text-[9px]" style={{ color: 'var(--text-mute)' }}>{cc.dynamics.driveLayout} / {cc.dynamics.zeroTo100Seconds.toFixed(1)}s 0-100</div>
          <Spec wide label={isCN ? '齿比' : 'Gears'} value={pt.gearRatios.map(r => r.toFixed(2)).join(' / ')} />
          <Spec
            wide
            label={isCN ? '正常带 / 红线' : 'Normal band / redline'}
            value={pt.gearTops.map((top, index) => `${pt.normalBandMinKmh[index]}-${pt.normalBandMaxKmh[index]}/${Math.round(top * SPEED_UNIT_KMH)}`).join(' / ') + ' km/h'}
          />
          <Spec label={isCN ? '主减速' : 'Final drive'} value={pt.finalDrive.toFixed(2)} />
          <Spec label={isCN ? '轮径' : 'Wheel Ø'} value={(pt.wheelRadiusM * 2).toFixed(2) + ' m'} />
          <Spec label={isCN ? '转向比' : 'Steer ratio'} value={cc.dynamics.steeringRatio.toFixed(0) + ' : 1'} />
          <Spec label={isCN ? '方向盘锁' : 'Steer lock'}
                value={'±' + Math.round(pt.steerWheelMaxDeg) + '°'} />
          <Spec label={isCN ? '前轮锁' : 'Wheel lock'}
                value={'±' + (cc.dynamics.maxSteerAngle * 180 / Math.PI).toFixed(1) + '°'} />
          </div>}
        </div>

        {/* Always-on telemetry stays visible while any slider is adjusted. */}
        <div className="border-b" style={{ borderColor: 'var(--hairline)', background: 'rgba(9,11,14,0.72)' }}>
          <button type="button" onClick={() => setShowTelemetry(value => !value)} className="w-full px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Activity size={11} style={{ color: 'var(--green)' }} />
              <span className="mono text-[9px] font-bold tracking-[0.14em]" style={{ color: 'var(--text-dim)' }}>
                {isCN ? '实时状态' : 'LIVE STATE'}
              </span>
            </div>
            <span className="flex items-center gap-2 mono text-[9px]" style={{ color: 'var(--text-mute)' }}>30 Hz {showTelemetry ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</span>
          </button>
          {showTelemetry && <div className="px-4 pb-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
            {liveRows.map(([label, value, color]) => (
              <div key={label} className="flex justify-between items-baseline gap-2 text-[10px] min-w-0">
                <span className="truncate" style={{ color: 'var(--text-mute)' }}>{label}</span>
                <span className="mono shrink-0" style={{ color }}>{value}</span>
              </div>
            ))}
          </div>}
        </div>

        {/* Slider groups */}
        <div className="flex gap-1 px-3 pt-3 pb-2">
          <TuningTabButton id="steer" active={tab === 'steer'} icon={<Sliders size={11} />} label={isCN ? '转向' : 'STEER'} onSelect={setTab} />
          <TuningTabButton id="drive" active={tab === 'drive'} icon={<Gauge size={11} />} label={isCN ? '驱动' : 'DRIVE'} onSelect={setTab} />
          <TuningTabButton id="geo" active={tab === 'geo'} icon={<Cpu size={11} />} label={isCN ? '几何' : 'GEO'} onSelect={setTab} />
          <TuningTabButton id="mirror" active={tab === 'mirror'} icon={<Scan size={11} />} label={isCN ? '后视镜' : 'MIRROR'} onSelect={setTab} />
          <TuningTabButton id="camera" active={tab === 'camera'} icon={<CarFront size={11} />} label={isCN ? '驾驶眼位' : 'DRIVER EYE'} onSelect={setTab} />
        </div>

        {/* Render-only diagnostics stay available on every tuning tab. */}
        <div className="grid grid-cols-2 gap-2 px-3 pb-3">
          <TuningQuickToggle
            label={isCN ? '显示辅助线' : 'Show guides'}
            hint={isCN ? '实时显示前进或倒车轨迹' : 'Show live forward or reverse path'}
            checked={settings.turnAssist}
            icon={<Route size={13} />}
            onToggle={() => updateSettings({ turnAssist: !settings.turnAssist })}
          />
          <TuningQuickToggle
            label={isCN ? '隐藏车身' : 'Hide body'}
            hint={isCN ? '保留车轮、转向与悬架动画' : 'Keep wheels, steering and suspension'}
            checked={settings.hideVehicleBody}
            icon={<CarFront size={13} />}
            onToggle={() => updateSettings({ hideVehicleBody: !settings.hideVehicleBody })}
          />
          <TuningQuickToggle
            label={isCN ? '碰撞线框' : 'Collision hulls'}
            hint={isCN ? '青色=玩家，红=地面，黄=高架层' : 'Cyan player, red ground, amber elevated'}
            checked={collisionDebug}
            icon={<Scan size={13} />}
            onToggle={() => {
              const next = !collisionDebug;
              setCollisionDebug(next);
              window.dispatchEvent(new CustomEvent('toggle-collision-debug', { detail: { enabled: next } }));
            }}
          />
        </div>

        <div className="px-3 pb-3">
          <div className="mono text-[9px] font-bold tracking-[0.12em] mb-1.5" style={{ color: 'var(--text-mute)' }}>
            {isCN ? '验收测试点（停稳后传送）' : 'ACCEPTANCE POINTS (STOP FIRST)'}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {(levelId===6 ? GARAGE_TEST_POINTS : DRIVING_TEST_POINTS).map(point => (
              <button key={point.id} type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('test-teleport', { detail: point }))}
                className="rounded-md px-2 py-1.5 text-[9px] text-left"
                title={`${point.x}, ${point.y} · ${point.hint ?? ''}`}
                style={{ background: 'rgba(8,12,16,0.88)', color: 'var(--text-dim)', border: '1px solid rgba(255,255,255,0.12)' }}>
                <span className="block">{point.label}</span>
                <span className="block mono text-[7px] mt-0.5" style={{ color: 'var(--text-mute)' }}>{point.x},{point.y} · {point.hint}</span>
              </button>
            ))}
          </div>
          <div className="mt-1 text-[9px]" style={{ color: 'var(--text-mute)' }}>
            {isCN ? '桥上/桥下为同一 XY 的不同高度层；传送仅在低速安全状态生效。' : 'Bridge top/under share XY but use different height layers; teleport is stopped-only.'}
          </div>
        </div>

        {/* Body */}
        <div className="px-4 pb-4 pt-1">
          {tab === 'steer' && (
            <div className="space-y-3">
              <SliderRow
                label={isCN ? '转向灵敏度' : 'Sensitivity'}
                hint={isCN ? '鼠标或旋钮输入的整体倍率。只影响打方向速度，不改变车型最大转角。' : 'Overall mouse or dial input gain. Changes steering speed, not vehicle lock.'}
                value={settings.steeringSensitivity.toFixed(1) + 'x'}
                min={0} max={5} step={0.1} inputMin={0} inputMax={8}
                current={settings.steeringSensitivity}
                onChange={v => updateSettings({ steeringSensitivity: v })}
              />
              {steerRows.map(([key, label, min, max, step, inputMin, inputMax, hint]) => (
                <SliderRow
                  key={key}
                  label={label}
                  hint={hint}
                  value={settings.steeringCurve[key].toFixed(2)}
                  min={min} max={max} step={step} inputMin={inputMin} inputMax={inputMax}
                  current={settings.steeringCurve[key]}
                  onChange={v => updateSettings({ steeringCurve: { ...settings.steeringCurve, [key]: v } })}
                />
              ))}
              <div className="hairline-h" />
              {vehicleSteerRows.map(([key, label, min, max, step, hint]) => (
                <SliderRow
                  key={key}
                  label={label}
                  hint={hint}
                  value={vehicleTune[key].toFixed(2) + 'x'}
                  min={min} max={max} step={step} inputMin={0.2} inputMax={2}
                  current={vehicleTune[key]}
                  onChange={value => updateVehicleTune(key, value)}
                />
              ))}
              <CopyButton onClick={copySteer} copied={copied === 'steer'} isCN={isCN} />
            </div>
          )}

          {tab === 'drive' && (
            <div className="space-y-3">
              <div className="rounded-lg px-3 py-2.5 text-[10px] leading-4"
                   style={{ background: 'rgba(245,158,11,0.08)', color: 'var(--text-dim)', border: '1px solid rgba(245,158,11,0.18)' }}>
                {isCN
                  ? '倍率仅作用于当前车型。换挡采用连续扭矩接合，调整过程不会改变当前车速或摄像机。'
                  : 'Multipliers affect this vehicle only. Shift coupling stays continuous and never resets speed or camera.'}
              </div>
              {rideRangeMm > 0 && (
                <SliderRow
                  label={isCN ? '可调车身高度' : 'Adjustable ride height'}
                  hint={isCN
                    ? `官方总调节范围 ${rideRangeMm}mm。只移动车身，不改变轮胎压缩/回弹行程。`
                    : `Published total range ${rideRangeMm}mm. Moves the body only; wheel bump/droop travel is separate.`}
                  value={`${settings.rideHeightMm.toFixed(0)} mm`}
                  min={-rideRangeMm / 2} max={rideRangeMm / 2} step={1}
                  inputMin={-rideRangeMm / 2} inputMax={rideRangeMm / 2}
                  current={settings.rideHeightMm}
                  onChange={v => updateSettings({ rideHeightMm: v })}
                />
              )}
              {driveRows.map(([key, label, min, max, step, hint]) => (
                <SliderRow
                  key={key}
                  label={label}
                  hint={hint}
                  value={vehicleTune[key].toFixed(2) + 'x'}
                  min={min} max={max} step={step} inputMin={0.2} inputMax={2}
                  current={vehicleTune[key]}
                  onChange={value => updateVehicleTune(key, value)}
                />
              ))}
              <div className="grid grid-cols-2 gap-2">
                <button onClick={resetVehicleTune} className="px-3 py-2 rounded-lg mono text-[10px] font-bold flex items-center justify-center gap-1.5"
                        style={{ background: 'var(--panel-3)', color: 'var(--text-dim)', border: '1px solid var(--hairline)' }}>
                  <RotateCcw size={11} /> {isCN ? '恢复车型基准' : 'RESET BASE'}
                </button>
                <CopyButton onClick={copyDrive} copied={copied === 'drive'} isCN={isCN} compact />
              </div>
            </div>
          )}

          {tab === 'geo' && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 rounded-lg px-3 py-2.5"
                   style={{ background: 'rgba(34,211,238,0.07)', border: '1px solid rgba(34,211,238,0.18)' }}>
                <AngleStat label={isCN ? '内侧大角' : 'Inside'} value={`${actualLargerDeg.toFixed(1)}°`} />
                <AngleStat label={isCN ? '外侧小角' : 'Outside'} value={`${actualSmallerDeg.toFixed(1)}°`} />
                <AngleStat label={isCN ? '角度偏差' : 'Difference'} value={`${visualSplitDeg.toFixed(1)}°`} accent />
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg px-3 py-2"
                   style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--hairline)' }}>
                <Spec label={isCN ? '实际轴距' : 'Actual wheelbase'} value={`${(runtimeWheelbase / 10).toFixed(2)} m`} />
                <Spec label={isCN ? '实际半轮距' : 'Actual half-track'} value={`${(runtimeHalfTrack / 10).toFixed(2)} m`} />
              </div>
              <p className="text-[9px] leading-4" style={{ color: 'var(--text-mute)' }}>
                {isCN
                  ? '读数来自模型实际前后轮轴，不再使用旧的运动参考点、视觉锁或半轮距假参数。当前 Ackermann 规则：内侧前轮取较大角，外侧前轮取较小角。'
                  : 'Readout uses the model’s actual axles, not the removed motion-reference, visual-lock or half-track fakes. Current Ackermann rule: inside wheel uses the larger angle.'}
              </p>
              <label className="flex items-center justify-between cursor-pointer"
                     onPointerDown={e => e.stopPropagation()}
                     onMouseDown={e => e.stopPropagation()}>
                <span className="text-[11px] font-bold"
                      style={{ color: settings.debugPhysics.enabled ? 'var(--cyan)' : 'var(--text-dim)' }}>
                  {isCN ? '启用转向锁覆盖' : 'Enable steer override'}
                </span>
                <button
                  onClick={() => updateSettings({ debugPhysics: { ...settings.debugPhysics, enabled: !settings.debugPhysics.enabled } })}
                  onPointerDown={e => e.stopPropagation()}
                  className="relative w-10 h-5 rounded-full transition-colors"
                  style={{ background: settings.debugPhysics.enabled ? 'var(--cyan)' : 'var(--panel-3)', border: '1px solid var(--hairline)' }}>
                  <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                        style={{ transform: settings.debugPhysics.enabled ? 'translateX(20px)' : 'translateX(2px)' }} />
                </button>
              </label>
              {geoRows.map(([key, label, min, max, step, kind, inputMin, inputMax, hint]) => (
                <SliderRow
                  key={key}
                  label={label}
                  hint={hint}
                  value={kind === 'deg' ? settings.debugPhysics[key].toFixed(1) + '°' : settings.debugPhysics[key].toFixed(2)}
                  min={min} max={max} step={step} inputMin={inputMin} inputMax={inputMax}
                  current={settings.debugPhysics[key]}
                  disabled={!settings.debugPhysics.enabled}
                  onChange={v => updateSettings({ debugPhysics: { ...settings.debugPhysics, [key]: v } })}
                />
              ))}
              <CopyButton onClick={copyGeo} copied={copied === 'geo'} isCN={isCN} />
            </div>
          )}

          {tab === 'mirror' && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-1">
                {(['left', 'right', 'centre'] as MirrorId[]).map(id => (
                  <button key={id} type="button" onClick={() => setActiveMirror(id)}
                          className="py-2 rounded-md text-[10px] font-bold"
                          style={{ background: activeMirror === id ? 'var(--amber)' : 'var(--panel-3)', color: activeMirror === id ? '#111214' : 'var(--text-dim)' }}>
                    {id === 'left' ? (isCN ? '左后视镜' : 'LEFT') : id === 'right' ? (isCN ? '右后视镜' : 'RIGHT') : (isCN ? '车内镜' : 'CENTRE')}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <TuningQuickToggle
                  label={isCN ? '交换左右镜位' : 'Swap side slots'}
                  hint={isCN ? '只交换屏幕位置，不翻转成像' : 'Swaps screen slots only'}
                  checked={settings.mirrorSwapSides}
                  icon={<Scan size={13} />}
                  onToggle={() => updateSettings({ mirrorSwapSides: !settings.mirrorSwapSides })}
                />
                <TuningQuickToggle
                  label={isCN ? '显示本车车身' : 'Show own body'}
                  hint={isCN ? '保留镜中车身参照' : 'Keep body reference in mirror'}
                  checked={settings.mirrorAdjustments[activeMirror].showBody}
                  icon={<CarFront size={13} />}
                  onToggle={() => updateMirror(activeMirror, { showBody: !settings.mirrorAdjustments[activeMirror].showBody })}
                />
              </div>
              <div className="rounded-lg px-3 py-2 text-[9px] leading-4"
                   style={{ background: 'rgba(245,158,11,0.08)', color: 'var(--text-mute)', border: '1px solid rgba(245,158,11,0.18)' }}>
                {isCN ? '镜框位置、安装点、俯仰和成像参数均按当前镜单独保存。上下位置已增加向上行程，并限制向下越界。' : 'Frame, mount, pitch and image settings are stored per mirror. Upward travel is expanded and downward off-screen travel is limited.'}
              </div>
              {mirrorRows.map(([key, label, min, max, step, hint]) => (
                <SliderRow key={key} label={label} hint={hint}
                           value={settings.mirrorAdjustments[activeMirror][key].toFixed(step < 1 ? 2 : 0)}
                           min={min} max={max} step={step} inputMin={min} inputMax={max}
                           current={settings.mirrorAdjustments[activeMirror][key]}
                           onChange={value => updateMirror(activeMirror, { [key]: value })} />
              ))}
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={resetMirror} className="px-3 py-2 rounded-lg mono text-[10px] font-bold flex items-center justify-center gap-1.5"
                        style={{ background: 'var(--panel-3)', color: 'var(--text-dim)', border: '1px solid var(--hairline)' }}>
                  <RotateCcw size={11} /> {isCN ? '恢复当前镜' : 'RESET MIRROR'}
                </button>
                <CopyButton onClick={copyMirrors} copied={copied === 'mirror'} isCN={isCN} compact />
              </div>
            </div>
          )}

          {tab === 'camera' && (
            <div className="space-y-3">
              <div className="rounded-lg px-3 py-2.5 text-[10px] leading-4"
                   style={{ background: 'rgba(34,211,238,0.07)', color: 'var(--text-dim)', border: '1px solid rgba(34,211,238,0.18)' }}>
                {isCN
                  ? '第一人称驾驶员眼位绑定车身悬架节点，会随坡度、刹车点头和车身横摆同步变化；视野内含轻量仪表台、方向盘和 A 柱。滑块实时生效，不重置驾驶视角。'
                   : 'The first-person driver eye is mounted to the sprung body and follows grade, brake dive and body roll. A lightweight dashboard, wheel and A-pillars frame the view. Sliders apply live without resetting the view.'}
              </div>
              {cameraRows.map(([key, label, min, max, step, suffix, hint]) => (
                <SliderRow
                  key={key}
                  label={label}
                  hint={hint}
                  value={settings.hoodCameraAdjustment[key].toFixed(step < 1 ? 2 : 0) + suffix}
                  min={min} max={max} step={step} inputMin={min} inputMax={max}
                  current={settings.hoodCameraAdjustment[key]}
                  onChange={value => updateSettings({
                    hoodCameraAdjustment: { ...settings.hoodCameraAdjustment, [key]: value },
                  })}
                />
              ))}
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => updateSettings({ hoodCameraAdjustment: hoodCameraDefaultForCar(currentCarId) })}
                        className="px-3 py-2 rounded-lg mono text-[10px] font-bold flex items-center justify-center gap-1.5"
                        style={{ background: 'var(--panel-3)', color: 'var(--text-dim)', border: '1px solid var(--hairline)' }}>
                  <RotateCcw size={11} /> {isCN ? '恢复默认镜头' : 'RESET CAMERA'}
                </button>
                <CopyButton onClick={copyCamera} copied={copied === 'camera'} isCN={isCN} compact />
              </div>
            </div>
          )}
        </div>

        </div>
        {/* Footer hint */}
        <div className="px-4 py-2 border-t flex items-center justify-between"
             style={{ borderColor: 'var(--hairline)', background: 'rgba(0,0,0,0.25)' }}>
          <span className="mono text-[9px]" style={{ color: 'var(--text-mute)' }}>{isCN ? 'T 键开关 / 调参不中断驾驶' : 'T TOGGLE / LIVE APPLY'}</span>
          <button onClick={copyAll} className="mono text-[9px] font-bold flex items-center gap-1" style={{ color: copied === 'all' ? 'var(--green)' : 'var(--cyan)' }}>
            {copied === 'all' ? <Check size={10} /> : <Wrench size={10} />}
            {isCN ? (copied === 'all' ? '已复制全部' : '复制全部') : (copied === 'all' ? 'COPIED' : 'COPY ALL')}
          </button>
        </div>
      </div>
    </div>
    {tab === 'camera' && (
      <HoodCameraLocator car={cc} adjustment={settings.hoodCameraAdjustment} lang={lang} />
    )}
    </>,
    document.body,
  );
};

type TuningTab = 'steer' | 'drive' | 'geo' | 'mirror' | 'camera';

/** Kept outside TuningPanel so 30 Hz telemetry updates do not replace the
 * button element between pointer-down and click. */
const TuningTabButton: React.FC<{
  id: TuningTab;
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onSelect: (id: TuningTab) => void;
}> = ({ id, active, icon, label, onSelect }) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={() => onSelect(id)}
    onPointerDown={event => event.stopPropagation()}
    onMouseDown={event => event.stopPropagation()}
    className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-md mono text-[10px] font-bold tracking-wider transition-colors"
    style={{
      background: active ? 'var(--panel-3)' : 'transparent',
      color: active ? 'var(--amber)' : 'var(--text-mute)',
      border: '1px solid ' + (active ? 'var(--hairline-strong)' : 'transparent'),
    }}>
    {icon} {label}
  </button>
);

const TuningQuickToggle: React.FC<{
  label: string;
  hint: string;
  checked: boolean;
  icon: React.ReactNode;
  onToggle: () => void;
}> = ({ label, hint, checked, icon, onToggle }) => (
  <button
    type="button"
    aria-pressed={checked}
    onClick={onToggle}
    onPointerDown={event => event.stopPropagation()}
    onMouseDown={event => event.stopPropagation()}
    className="min-w-0 rounded-lg px-2.5 py-2 text-left transition-colors"
    style={{
      background: checked ? 'rgba(34,211,238,0.10)' : 'var(--panel-3)',
      border: `1px solid ${checked ? 'rgba(34,211,238,0.34)' : 'var(--hairline)'}`,
    }}>
    <span className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-[10px] font-bold truncate"
            style={{ color: checked ? 'var(--cyan)' : 'var(--text-dim)' }}>
        {icon}{label}
      </span>
      <span className="mono text-[8px] shrink-0" style={{ color: checked ? 'var(--green)' : 'var(--text-mute)' }}>
        {checked ? 'ON' : 'OFF'}
      </span>
    </span>
    <span className="block mt-1 text-[8px] leading-3 truncate" style={{ color: 'var(--text-mute)' }}>{hint}</span>
  </button>
);

const Spec: React.FC<{ label: string; value: string; wide?: boolean }> = ({ label, value, wide }) => (
  <div className={`flex flex-col ${wide ? 'col-span-2' : ''}`}>
    <span className="text-[9px] tracking-wider" style={{ color: 'var(--text-mute)' }}>{label.toUpperCase()}</span>
    <span className="mono text-[10px]" style={{ color: 'var(--text)' }}>{value}</span>
  </div>
);

const AngleStat: React.FC<{ label: string; value: string; accent?: boolean }> = ({ label, value, accent }) => (
  <div className="flex flex-col min-w-0">
    <span className="text-[8px] truncate" style={{ color: 'var(--text-mute)' }}>{label}</span>
    <span className="mono text-[12px] font-bold" style={{ color: accent ? 'var(--amber)' : 'var(--cyan)' }}>{value}</span>
  </div>
);

const SliderRow: React.FC<{
  label: string;
  hint?: string;
  value: string;
  min: number;
  max: number;
  step: number;
  inputMin: number;
  inputMax: number;
  current: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}> = ({ label, hint, value, min, max, step, inputMin, inputMax, current, disabled, onChange }) => {
  // Local string state lets the user type freely (e.g. "-", "0.", "1.05")
  // without the input fighting them. We commit on blur or Enter.
  const [text, setText] = useState<string>(String(current));
  useEffect(() => { setText(String(current)); }, [current]);

  const commit = (raw: string) => {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      const clamped = Math.min(inputMax, Math.max(inputMin, parsed));
      onChange(clamped);
      // Reflect the clamped value back so the field shows what was applied.
      setText(String(clamped));
    } else {
      setText(String(current));
    }
  };

  return (
    <div className={disabled ? ' opacity-40 pointer-events-none' : ''}
         onPointerDown={e => e.stopPropagation()}
         onMouseDown={e => e.stopPropagation()}>
      <div className="flex justify-between items-center text-[10px] mb-1" style={{ color: 'var(--text-dim)' }}>
        <span>{label}</span>
        <span className="mono" style={{ color: 'var(--amber)' }}>{value}</span>
      </div>
      {hint && <p className="text-[9px] leading-[1.45] mb-1.5" style={{ color: 'var(--text-mute)' }}>{hint}</p>}
      <div className="flex items-center gap-2">
        <input
          aria-label={label}
          type="range" min={min} max={max} step={step} value={Math.min(max, Math.max(min, current))}
          onChange={e => onChange(Number(e.target.value))}
          onPointerDown={e => e.stopPropagation()}
          className="cockpit-range flex-1 min-w-0" />
        <input
          aria-label={`${label} ${value}`}
          type="number"
          value={text}
          min={inputMin} max={inputMax} step={step}
          onChange={e => setText(e.target.value)}
          onBlur={() => commit(text)}
          onKeyDown={e => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); } }}
          onPointerDown={e => e.stopPropagation()}
          className="w-16 px-1.5 py-1 mono text-[10px] rounded-md"
          style={{
            background: 'var(--bg)',
            color: 'var(--text)',
            border: '1px solid var(--hairline)',
            outline: 'none',
          }} />
      </div>
    </div>
  );
};

const CopyButton: React.FC<{ onClick: () => void; copied: boolean; isCN: boolean; compact?: boolean }> = ({ onClick, copied, isCN, compact }) => (
  <button
    onClick={onClick}
    onPointerDown={e => e.stopPropagation()}
    className={`${compact ? '' : 'w-full'} px-3 py-2 rounded-lg mono text-[10px] font-bold flex items-center justify-center gap-2`}
    style={{ background: 'rgba(34,211,238,0.1)', color: 'var(--cyan)', border: '1px solid rgba(34,211,238,0.3)' }}>
    {copied ? <Check size={12} /> : <Copy size={12} />}
    {copied ? (isCN ? '已复制' : 'COPIED') : (isCN ? '复制参数' : 'COPY PARAMETERS')}
  </button>
);

export default TuningPanel;
export { RotateCcw };
