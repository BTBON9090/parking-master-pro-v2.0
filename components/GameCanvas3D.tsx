import {stableSunTarget} from '../utils/stableShadow';
import {createLateralState,stepLateral,advanceLateralPose} from '../utils/lateralDynamics';
import {createMirrorMaterial} from '../utils/mirrorMask';
import {qualityProfile,nextResolution,ResolutionSampler,retainedResolution,type RenderQuality} from '../utils/renderQuality';
import {isTouchDevice} from '../utils/device';
import { disposeResources } from '../three/disposeResources';
import { sensedObstacle, parkingPulse } from '../utils/proximity';
import { garageFloorAt, GARAGE_LEVELS } from '../utils/garage';
// @refresh reset
// The scene and audio own native resources and long-lived frame closures.
// Remount on development edits so a new mixer cannot use an older graph.
import { CrashDebris } from '../three/crashDebris';
import {VehicleDamage} from '../three/vehicleDamage';
import type {DamageTier} from '../utils/impactResponse';
import { solveVehicleImpact, impactContactArm } from '../utils/impactResponse';
import { createDriverMotion, stepDriverMotion } from '../utils/driverMotion';
import { motorMix, roadMix, cabinInsulation, hasMotorDrive, driveForceForAudio } from '../utils/motorAudio';
import {createChassisState,stepChassis,hubPose,chassisRotation,type RigWheel} from '../utils/chassisSupport';
import {VehicleRollover} from '../three/vehicleRollover';
import { worldSurface } from '../utils/openWorld';
import { advanceGripLimitedCenter, advanceVehicleCenter, fourWheelAckermannAngles, limitRearAxleSteer } from '../utils/driving';
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { CarType, LevelData, Obstacle, UserSettings, WeatherType, DayTime, InputState, ParkingResultType, CameraView, Vector2 } from '../types';
import { CAR_MODELS, DEFAULT_VEHICLE_TUNING, DEFAULT_HOOD_CAMERA_ADJUSTMENT, MAX_STEER_ANGLE } from '../constants';
import {
  checkVehicleCollision,
  checkVehicleRectCollision,
  vehicleLayersCompatible,
  getRectCorners,
  getConvexContactNormal,
  getVehicleBoundaryPoints,
  getVehicleContactNormal,
  getVehicleRectContactNormal,
  VehicleCollider,
} from '../utils/physics';
import { buildScene, BuiltScene } from '../three/sceneBuilder';
import { disposeMaterials, createVehicleEnvironment, applyVehicleEnvironment } from '../three/materials';
import { isAuthoredVehicle } from '../three/blenderVehicle';
import { CarMeshParts } from '../three/geometries';
import { updateVehicleExtras, hasProceduralCarModel } from '../three/vehicleModels';
import { PhysicsWorld } from '../utils/physicsWorld';
import { sampleSlopeProfile } from '../utils/slopeProfile';
import { disposeModelCache } from '../three/modelLoader';
import { computeRpm, getPowertrain, isElectricVehicle, steeringWheelMaxDeg, SPEED_UNIT_KMH, TRAVEL_PER_SPEED_FRAME } from '../utils/powertrain';
import { stepLongitudinal } from '../utils/longitudinal';
import { approachExponential, elapsedFramesFromMs, simulationDeltaMs } from '../utils/timeStep';
import { resolveHoodCameraLocalPose } from '../utils/hoodCamera';
import { getMirrorGlassLayout } from '../utils/mirrorLayout';
import { driverWheelRotationZ, rearSteerAngleForSpeed } from '../utils/steering';
import { stepHeadLook } from '../utils/headLook';
import { ORBIT_POLAR_MAX, ORBIT_POLAR_MIN, stepOrbitDrag, followRelativeCoordinate, speedVisualStrength, resolveInspectionView } from '../utils/cameraLook';
import { SpeedEffect } from '../three/speedEffect';
import { suspensionForCar } from '../utils/suspension';
import { resolveCurbMotion, sampleWheelSupport, nearbyWheelCurbs, type WheelShape } from '../utils/wheelObstacles';
import { disposeRecordingAudio, getRecordingAudioStatus, initRecordingAudio, playRecordingImpact, setRecordingAudioFocus, setRecordingAudioPaused, setRecordingAudioVisibility, updateRecordingAudio } from '../utils/recordingAudio';
import { buildCollisionGrid, queryCollisionGrid } from '../utils/collisionSpatial';
import { isGravelSurface, isTrainingTerrain, trainingTerrainGradient, trainingTerrainHeight, TRAINING_TERRAIN } from '../utils/trainingTerrain';
import { sampleElevatedRoad } from '../utils/elevatedRoad';
import { sampleTerrainSurface, sampleWheelSurfaceHeight } from '../utils/terrainSampling';
import { isWheelGroundedByGap } from '../utils/wheelContact';
import { accumulateParkingStable, evaluateParkingSpot } from '../utils/parking';
import { DRIVING_TEST_POINTS } from '../utils/testPoints';
import { calibrateCowlProfile, classifyCockpitPaintTriangle, cockpitProfileFor } from '../utils/cockpitCutout';
import { filterLongitudinalAccel } from '../utils/bodyPitch';
import { applyCockpitEyeOffset } from '../utils/cockpitView';
import { isCockpitGlassMaterial, isConceptCockpitFrameNode } from '../utils/materialClassification';
import { buildConceptCockpitFrame } from '../utils/conceptCockpit';
import { sedanCowlLayout } from '../utils/sedanCowl';
import { MAX_ACTIVE_TRAFFIC, stepTrafficVehicle } from '../utils/traffic';
import { buildDriverInterior, DriverInterior } from '../three/driverInterior';

interface GameCanvas3DProps {
  levelData: LevelData;
  settings: UserSettings;
  currentCarId: CarType;
  weather: WeatherType;
  dayTime: DayTime;
  inputRef: React.MutableRefObject<InputState>;
  onParkingSuccess: (spotId: string, reward: number, type: ParkingResultType) => void;
  onCrash: (cost: number) => void;
  carSpeedRef: React.MutableRefObject<number>;
  isPaused: boolean;
  cameraView: CameraView;
  overviewCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  globalOverviewCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  globalOverviewOpen: boolean;
  completedSpots: Set<string>;
  onRecover: () => void;
  onInspectionChange: (active:boolean) => void;
}

// ============================================================
// 相机参数：球坐标系（中键拖拽旋转 + 滚轮缩放 + 平滑跟随）
// 默认 15° 俯角，后方偏移
// ============================================================
const CAM_DEFAULT_DIST = 680;
const CAM_MIN_DIST = 95;
const CAM_MAX_DIST = 1800;
const SHADOW_SIZE = 220;

const isPlayerGlassMaterial = (node: THREE.Object3D, material: THREE.Material, carType: CarType) =>
  isCockpitGlassMaterial(carType, node.name, material.name);

const CAMERA_PRESETS: Record<CameraView, { azimuth: number; polar: number }> = {
  REAR_RIGHT: { azimuth: -0.72, polar: 1.05 },
  REAR_LEFT: { azimuth: 0.72, polar: 1.05 },
  FRONT_LEFT: { azimuth: 2.42, polar: 1.05 },
  FRONT_RIGHT: { azimuth: -2.42, polar: 1.05 },
  FOLLOW_FAR: { azimuth: Math.PI, polar: 0.92 },
  FOLLOW_NEAR: { azimuth: Math.PI, polar: 1.08 },
  TOP: { azimuth: 0, polar: 0.12 },
  SIDE_LEFT: { azimuth: Math.PI / 2, polar: 1.28 },
  SIDE_RIGHT: { azimuth: -Math.PI / 2, polar: 1.28 },
  HOOD: { azimuth: Math.PI, polar: 1.42 },
  REVERSE: { azimuth: 0, polar: 1.08 },
  ORBIT: { azimuth: -0.82, polar: 0.98 },
};

const sampleSlope = (level: LevelData, x: number, y: number, _heading?: number, currentHeight = 0) =>
  sampleTerrainSurface(level, x, y, currentHeight);

const sampleWheelSurface = (level: LevelData, x: number, y: number, _heading: number, currentHeight = 0) =>
  sampleWheelSurfaceHeight(level, x, y, currentHeight);

const GameCanvas3D: React.FC<GameCanvas3DProps> = React.memo(({
  levelData,
  settings,
  currentCarId,
  weather,
  dayTime,
  inputRef,
  onParkingSuccess,
  onCrash,
  carSpeedRef,
  isPaused,
  cameraView,
  overviewCanvasRef,
  globalOverviewCanvasRef,
  globalOverviewOpen,
  completedSpots,
  onRecover,
  onInspectionChange,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const retainedQuality = useRef<{quality:RenderQuality;dpr:number}|null>(null);
  const [wrecked,setWrecked]=useState(false);
  const [overturned,setOverturned]=useState(false);
  const [damagePercent,setDamagePercent]=useState(0);
  const [damageTier,setDamageTier]=useState<DamageTier>('none');
  useEffect(()=>{onInspectionChange(wrecked||overturned);},[wrecked,overturned,onInspectionChange]);
  useEffect(()=>()=>onInspectionChange(false),[onInspectionChange]);

  // 同步 ref（与 2D 版相同模式，避免 RAF 循环因 props 变化而重建）
  const settingsRef = useRef(settings);
  const weatherRef = useRef(weather);
  const dayTimeRef = useRef(dayTime);
  const levelDataRef = useRef(levelData);
  const currentCarIdRef = useRef(currentCarId);
  const cameraViewRef = useRef<CameraView>(cameraView);
  const globalOverviewOpenRef = useRef(globalOverviewOpen);
  // These callbacks/state are mirrored into refs so the render-loop effect
  // can depend on [levelData] ONLY. Volatile state is mirrored into refs.
  // (via callback identities) were effect dependencies: opening the settings
  // or physics-tuning panel destroyed and rebuilt the entire Three.js scene
  // — reloading every model and snapping the camera back to its preset.
  const isPausedRef = useRef(isPaused);
  const onCrashRef = useRef(onCrash);
  const onParkingSuccessRef = useRef(onParkingSuccess);
  const completedSpotsRef = useRef(completedSpots);

  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { weatherRef.current = weather; }, [weather]);
  useEffect(() => { dayTimeRef.current = dayTime; }, [dayTime]);
  useEffect(() => { levelDataRef.current = levelData; }, [levelData]);
  useEffect(() => { currentCarIdRef.current = currentCarId; }, [currentCarId]);
  useEffect(() => { cameraViewRef.current = cameraView; }, [cameraView]);
  useEffect(() => { globalOverviewOpenRef.current = globalOverviewOpen; }, [globalOverviewOpen]);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { onCrashRef.current = onCrash; }, [onCrash]);
  useEffect(() => { onParkingSuccessRef.current = onParkingSuccess; }, [onParkingSuccess]);
  useEffect(() => { completedSpotsRef.current = completedSpots; }, [completedSpots]);

  const carState = useRef({
    x: levelData.startPos.x,
    y: levelData.startPos.y,
    rotation: levelData.startPos.rotation,
    speed: 0,
    steeringAngle: 0,
    yawRate: 0,
    slipAngle: 0,
    driftSlip: 0,
    roadHeight: 0,
  });

  const throttleState = useRef(0);
  const obstaclesRef = useRef<Obstacle[]>(JSON.parse(JSON.stringify(levelData.obstacles)));
  const parkingStatusRef = useRef<Set<string>>(new Set());
  const parkingStableRef = useRef<Record<string, number>>({});
  const parkingReportedRef = useRef<Set<string>>(new Set());
  const parkingInsideRef = useRef<Set<string>>(new Set());
  const ceilingGroupRef = useRef<THREE.Group | undefined>(undefined);
  // Throttle timestamp for physics-debug readout dispatch (~30 Hz).
  const lastDebugReadoutAt = useRef(0);
  // Lightweight continuity probe for the tuning panel (visible only when the
  // panel is open; no per-frame console output).
  const collisionDebugEnabledRef = useRef(false);
  const collisionDebugGroupRef = useRef<THREE.Group | null>(null);
  const frameProbeRef = useRef({
    intervals: [] as number[],
    lastX: 0, lastY: 0, lastSpeed: 0, initialized: false,
    positionStepMax: 0, speedStepMax: 0,
  });
  const suspensionTelemetryRef = useRef({
    terrainHeight: 0, bodyHeave: 0, bodyPitchDeg: 0, bodyRollDeg: 0,
    wheelTravel: [0, 0, 0, 0], wheelContacts: [0, 0, 0, 0], wheelGap: [0, 0, 0, 0], wheelGrounded: [true, true, true, true], surface: 'asphalt',
  });
  const suspensionResetRef = useRef(0);

  // 音频
  const savedCameraRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const engineNodesRef = useRef<{
    osc1: OscillatorNode; osc2: OscillatorNode; osc3: OscillatorNode;
    noise: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode;
    noiseGain: GainNode; lowMix:GainNode; midMix:GainNode; pulseMix:GainNode;
  } | null>(null);
  const windNoiseRef = useRef<{ gain: GainNode } | null>(null);
  const skidNoiseRef = useRef<{ gain: GainNode } | null>(null);
  const tireNoiseRef = useRef<{ gain: GainNode; filter: BiquadFilterNode } | null>(null);
  const gravelNoiseRef = useRef<{ gain: GainNode } | null>(null);

  // 重置 carState（levelData 变化时）
  useEffect(() => {
    carState.current = {
      x: levelData.startPos.x, y: levelData.startPos.y,
      rotation: levelData.startPos.rotation, speed: 0, steeringAngle: 0,
      yawRate: 0, slipAngle: 0, driftSlip: 0, roadHeight: sampleTerrainSurface(levelData,levelData.startPos.x,levelData.startPos.y,levelData.startPos.elevation).height,
    };
    throttleState.current = 0;
    obstaclesRef.current = JSON.parse(JSON.stringify(levelData.obstacles));
    // Parked cars stay static; level-authored traffic keeps its ai and is
    // driven by updateTraffic() below. Only AI-bearing obstacles move.
    parkingStatusRef.current.clear();
    parkingStableRef.current = {};
    parkingReportedRef.current.clear();
    parkingInsideRef.current.clear();
    carSpeedRef.current = 0;
  }, [levelData, carSpeedRef]);

  // Clickable navigation entry: teleport only while essentially stopped; no
  // hidden window/coordinate hook is required for verification.
  useEffect(() => {
    const handleTerrainTeleport = () => {
      const state = carState.current;
      if (Math.abs(state.speed) > 0.2) return;
      state.x = TRAINING_TERRAIN.entranceX;
      state.y = TRAINING_TERRAIN.entranceY - 110;
      state.rotation = Math.PI / 2;
      state.speed = 0;
      state.steeringAngle = 0;
      state.yawRate = 0;
      state.slipAngle = 0;
      state.driftSlip = 0;
      state.roadHeight = 0;
      suspensionResetRef.current++;
      carSpeedRef.current = 0;
    };
    const handleTestTeleport = (event: Event) => {
      const detail = (event as CustomEvent<{ x: number; y: number; rotation: number; deckHeight?: number }>).detail;
      if (!detail) return;
      const state = carState.current;
      if (Math.abs(state.speed) > 0.2) return;
      state.x = detail.x;
      state.y = detail.y;
      state.rotation = detail.rotation;
      state.speed = 0;
      state.steeringAngle = 0;
      state.yawRate = 0;
      state.slipAngle = 0;
      state.driftSlip = 0;
      state.roadHeight = detail.deckHeight ?? sampleTerrainSurface(levelDataRef.current,detail.x,detail.y).height;
      suspensionResetRef.current++;
      carSpeedRef.current = 0;
    };
    const stop = () => {carState.current.speed=0;carState.current.yawRate=0;carState.current.slipAngle=0;carState.current.driftSlip=0;throttleState.current=0;carSpeedRef.current=0;};
    window.addEventListener('free-drive-stop', stop);
    window.addEventListener('terrain-teleport', handleTerrainTeleport);
    window.addEventListener('test-teleport', handleTestTeleport);
    return () => {
      window.removeEventListener('free-drive-stop', stop);
      window.removeEventListener('terrain-teleport', handleTerrainTeleport);
      window.removeEventListener('test-teleport', handleTestTeleport);
    };
  }, [carSpeedRef]);

  // ---- 音频初始化（完全复用 2D 版逻辑） ----
  useEffect(() => {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContext();
    audioContextRef.current = ctx;
    void initRecordingAudio(ctx);

    // Persistent, not `once`: a second suspension can happen after a tab
    // visibility change, and the parking chime must be audible after it.
    const resumeAudio = () => {
      if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    };
    window.addEventListener('keydown', resumeAudio);
    window.addEventListener('mousedown', resumeAudio);
    window.addEventListener('pointerdown', resumeAudio);
    const handleAudioBlur = () => setRecordingAudioFocus(false, document.hidden);
    const handleAudioWindowFocus = () => setRecordingAudioFocus(true, document.hidden);
    const handleAudioVisibility = () => {
      setRecordingAudioVisibility(document.hidden);
      setRecordingAudioFocus(!document.hidden, document.hidden);
      if (document.hidden && ctx.state === 'running') void ctx.suspend();
      else if (!document.hidden && ctx.state === 'suspended') void ctx.resume();
    };
    window.addEventListener('blur', handleAudioBlur);
    window.addEventListener('focus', handleAudioWindowFocus);
    document.addEventListener('visibilitychange', handleAudioVisibility);

    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
    const noise = ctx.createBufferSource(); noise.buffer = buffer; noise.loop = true;
    const osc1 = ctx.createOscillator(); osc1.type = 'sine';
    const osc2 = ctx.createOscillator(); osc2.type = 'triangle';
    const osc3 = ctx.createOscillator(); osc3.type = 'sine';
    const lowMix = ctx.createGain(); lowMix.gain.value = 0.72;
    const midMix = ctx.createGain(); midMix.gain.value = 0.20;
    const pulseMix = ctx.createGain(); pulseMix.gain.value = 0.10;
    const noiseFilter = ctx.createBiquadFilter(); noiseFilter.type = 'lowpass'; noiseFilter.frequency.value = 180;
    const noiseGain = ctx.createGain(); noiseGain.gain.value = 0.004;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 420; filter.Q.value = 0.55;
    const masterGain = ctx.createGain(); masterGain.gain.value = 0;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -22;
    compressor.knee.value = 18;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.012;
    compressor.release.value = 0.18;
    osc1.connect(lowMix); lowMix.connect(filter);
    osc2.connect(midMix); midMix.connect(filter);
    osc3.connect(pulseMix); pulseMix.connect(filter);
    noise.connect(noiseFilter); noiseFilter.connect(noiseGain); noiseGain.connect(filter);
    filter.connect(masterGain); masterGain.connect(compressor); compressor.connect(ctx.destination);
    osc1.start(); osc2.start(); osc3.start(); noise.start();
    engineNodesRef.current = { osc1, osc2, osc3, noise, gain: masterGain, filter, noiseGain, lowMix, midMix, pulseMix };

    // 胎噪
    const tireBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const tireData = tireBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) tireData[i] = (Math.random() * 2 - 1) * 0.5;
    const tireSrc = ctx.createBufferSource(); tireSrc.buffer = tireBuffer; tireSrc.loop = true;
    const tireLP = ctx.createBiquadFilter(); tireLP.type = 'lowpass'; tireLP.frequency.value = 800; tireLP.Q.value = 0.5;
    const tireBP = ctx.createBiquadFilter(); tireBP.type = 'lowpass'; tireBP.frequency.value = 500; tireBP.Q.value = 0.7;
    const tireGain = ctx.createGain(); tireGain.gain.value = 0;
    tireSrc.connect(tireLP); tireLP.connect(tireBP); tireBP.connect(tireGain); tireGain.connect(ctx.destination); tireSrc.start();
    tireNoiseRef.current = { gain: tireGain, filter: tireBP };

    // 碎石路噪
    const gravelBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const gravelData = gravelBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) gravelData[i] = (Math.random() * 2 - 1) * 0.4;
    const gravelSrc = ctx.createBufferSource(); gravelSrc.buffer = gravelBuffer; gravelSrc.loop = true;
    const gravelFilter = ctx.createBiquadFilter(); gravelFilter.type = 'lowpass'; gravelFilter.frequency.value = 900; gravelFilter.Q.value = .55;
    const gravelGain = ctx.createGain(); gravelGain.gain.value = 0;
    gravelSrc.connect(gravelFilter); gravelFilter.connect(gravelGain); gravelGain.connect(ctx.destination); gravelSrc.start();
    gravelNoiseRef.current = { gain: gravelGain };

    // 风声
    const windBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const windData = windBuffer.getChannelData(0); let lastW = 0;
    for (let i = 0; i < bufferSize; i++) { const w = Math.random() * 2 - 1; windData[i] = (lastW + 0.02 * w) / 1.02; lastW = windData[i]; windData[i] *= 3; }
    const windSrc = ctx.createBufferSource(); windSrc.buffer = windBuffer; windSrc.loop = true;
    const windFilter = ctx.createBiquadFilter(); windFilter.type = 'bandpass'; windFilter.frequency.value = 800; windFilter.Q.value = 1.0;
    const windGain = ctx.createGain(); windGain.gain.value = 0;
    windSrc.connect(windFilter); windFilter.connect(windGain); windGain.connect(ctx.destination); windSrc.start();
    windNoiseRef.current = { gain: windGain };

    // 打滑声
    const skidBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const skidData = skidBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) skidData[i] = (Math.random() * 2 - 1) * 0.5;
    const skidSrc = ctx.createBufferSource(); skidSrc.buffer = skidBuffer; skidSrc.loop = true;
    const skidFilter = ctx.createBiquadFilter(); skidFilter.type = 'bandpass'; skidFilter.frequency.value = 2000; skidFilter.Q.value = 2;
    const skidGain = ctx.createGain(); skidGain.gain.value = 0;
    skidSrc.connect(skidFilter); skidFilter.connect(skidGain); skidGain.connect(ctx.destination); skidSrc.start();
    skidNoiseRef.current = { gain: skidGain };

    return () => {
      disposeRecordingAudio();
      window.removeEventListener('blur', handleAudioBlur);
      window.removeEventListener('focus', handleAudioWindowFocus);
      document.removeEventListener('visibilitychange', handleAudioVisibility);
      window.removeEventListener('keydown', resumeAudio);
      window.removeEventListener('mousedown', resumeAudio);
      window.removeEventListener('pointerdown', resumeAudio);
      try { osc1.stop(); osc2.stop(); osc3.stop(); noise.stop(); tireSrc.stop(); gravelSrc.stop(); windSrc.stop(); skidSrc.stop(); } catch (e) {}
      if(audioContextRef.current===ctx){
        audioContextRef.current=null;engineNodesRef.current=null;tireNoiseRef.current=null;
        gravelNoiseRef.current=null;windNoiseRef.current=null;skidNoiseRef.current=null;
      }
      if (ctx.state !== 'closed') void ctx.close();
    };
  }, []);

  // ---- 主渲染 + 物理 + 音频 Effect ----
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // ===== Renderer =====
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    let quality=settingsRef.current.renderQuality??'auto';
    let profile=qualityProfile(quality,window.devicePixelRatio,isTouchDevice());
    let dynamicDpr = retainedResolution(retainedQuality.current,quality,profile);
    renderer.setPixelRatio(dynamicDpr);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    // Render the sun shadow map once per displayed frame. Without this,
    // every mirror/overview render call re-rendered all shadow casters.
    renderer.shadowMap.autoUpdate = false;
    mount.appendChild(renderer.domElement);
    renderer.domElement.dataset.gameCanvas = 'true';

    // The close overhead inset shares this renderer through a RenderTarget.
    // A throttled readback updates its small 2D canvas without allocating a
    // second WebGL context. The global map is drawn as cached Canvas 2D in UI.
    const overviewCanvas = overviewCanvasRef.current;
    const overviewContext = overviewCanvas?.getContext('2d', { alpha: false }) || null;
    const overviewTarget = overviewCanvas
      ? new THREE.WebGLRenderTarget(240, 150, {
          depthBuffer: true,
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
        })
      : null;
    const overviewPixels = overviewCanvas ? new Uint8Array(240 * 150 * 4) : null;
    const overviewImage = overviewContext?.createImageData(240, 150) || null;
    let lastOverviewRenderAt = 0;
    let overviewReadPending = false;
    const overviewCamera = new THREE.PerspectiveCamera(34, 240 / 150, 1, 1200);

    // ===== Camera (球坐标，跟随车辆) =====
    // A sensible near/far ratio greatly improves road and decal depth
    // precision in the wide and top-side camera presets.
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 2, 5200);
    const startX = carState.current.x;
    const startZ = carState.current.y;
    const initialPreset = CAMERA_PRESETS[cameraViewRef.current];
    camera.position.set(
      startX + CAM_DEFAULT_DIST * Math.sin(initialPreset.polar) * Math.sin(initialPreset.azimuth),
      CAM_DEFAULT_DIST * Math.cos(initialPreset.polar),
      startZ + CAM_DEFAULT_DIST * Math.sin(initialPreset.polar) * Math.cos(initialPreset.azimuth),
    );
    camera.lookAt(startX, 0, startZ);
    camera.up.set(0, 1, 0);

    // Reverse-only side cameras are rendered into two dashboard-style
    // viewports. They use a shorter far plane so mirrors stay readable and
    // do not add unnecessary full-scene draw cost while driving forward.
    const leftMirrorCamera = new THREE.PerspectiveCamera(40, 2.65, 0.08, 620);
    const rightMirrorCamera = new THREE.PerspectiveCamera(40, 2.65, 0.08, 620);
    const centreMirrorCamera = new THREE.PerspectiveCamera(34, 4, 0.08, 620);
    const mirrorTarget = new THREE.WebGLRenderTarget(profile.mirrorWidth, Math.round(profile.mirrorWidth*.375), { depthBuffer: true });
    const sideMirrorTarget=new THREE.WebGLRenderTarget(Math.round(profile.mirrorWidth*1.25),Math.round(profile.mirrorWidth*1.25/2.65),{depthBuffer:true});
    const mirrorDisplay = new THREE.Scene();
    const mirrorDisplayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
    mirrorDisplayCamera.position.z = 1;
    const mirrorQuadGeo = new THREE.PlaneGeometry(2, 2);
    const uv = mirrorQuadGeo.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
    const mirrorMask = createMirrorMaterial(mirrorTarget.texture);
    const mirrorQuadMat = mirrorMask.material;
    mirrorDisplay.add(new THREE.Mesh(mirrorQuadGeo, mirrorQuadMat));
    const renderMirrorImage = (camera: THREE.Camera, glass: {width:number;height:number;radius:number}) => {
      mirrorMask.setRect(glass.width,glass.height,glass.radius);
      const viewport = renderer.getViewport(new THREE.Vector4());
      const scissor = renderer.getScissor(new THREE.Vector4());
      const scissorTest = renderer.getScissorTest();
      const target=camera===centreMirrorCamera?mirrorTarget:sideMirrorTarget;
      mirrorQuadMat.map=target.texture;
      renderer.setRenderTarget(target);
      renderer.setScissorTest(false);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.setViewport(viewport);
      renderer.setScissor(scissor);
      renderer.setScissorTest(scissorTest);
      renderer.clearDepth();
      const autoClear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.render(mirrorDisplay, mirrorDisplayCamera);
      renderer.autoClear = autoClear;
    };


    // ===== 球坐标相机状态 =====
    const camState = {
      azimuth: initialPreset.azimuth,
      polar: initialPreset.polar,
      distance: CAM_DEFAULT_DIST,     // 距目标距离
      // 平滑插值后的值
      smoothAzimuth: initialPreset.azimuth,
      smoothPolar: initialPreset.polar,
      smoothDist: CAM_DEFAULT_DIST,
    };
    const chaseCameraDesired = new THREE.Vector3();
    const chaseCameraLookTarget = new THREE.Vector3(startX, 0, startZ);
    const chaseCameraSmoothedLook = new THREE.Vector3(startX, 0, startZ);
    let previousCameraCarX = startX, previousCameraCarZ = startZ;
    let previousCameraView = '';
    let speedEffectStrength = 0;
    const speedEffect = new SpeedEffect();
    const orbitTarget = { azimuth: initialPreset.azimuth, polar: initialPreset.polar };
    let activeCameraPreset = cameraViewRef.current;
    // Plain left-drag can start from any exterior preset. This local override
    // makes the orbit visible immediately, before React's camera-view state
    // round-trip; pressing F or using the orbit ball clears it through the
    // normal preset-change path.
    let manualOrbitOverride = false;
    const savedCamera=savedCameraRef.current;
    if(savedCamera?.level===levelData){
      Object.assign(camState,savedCamera.camState);Object.assign(orbitTarget,savedCamera.orbitTarget);
      camera.position.copy(savedCamera.position);camera.quaternion.copy(savedCamera.quaternion);camera.up.copy(savedCamera.up);
      chaseCameraSmoothedLook.copy(savedCamera.look);previousCameraView=cameraViewRef.current;
      manualOrbitOverride=savedCamera.manualOrbitOverride;
    }
    const handleOrbitChange = (event: Event) => {
      const detail = (event as CustomEvent<{ azimuth: number; polar: number }>).detail;
      if (!detail) return;
      manualOrbitOverride = true;
      orbitTarget.azimuth = detail.azimuth;
      orbitTarget.polar = THREE.MathUtils.clamp(detail.polar, ORBIT_POLAR_MIN, ORBIT_POLAR_MAX);
    };
    const handleOrbitNudge = (event: Event) => {
      const detail = (event as CustomEvent<{ dx: number; dy: number }>).detail;
      if (!detail) return;
      // First plain left-drag from a chase/reverse/side preset: start the
      // orbit exactly where that live camera is, instead of jumping to the
      // ORBIT preset's distant overhead angle. Distance is preserved so the
      // wheel zoom remains meaningful; the drag only changes the angles.
      if (!manualOrbitOverride) {
        const targetY = wreck ? inspectionFocus.y : carState.current.roadHeight;
        const dx = camera.position.x - (wreck ? inspectionFocus.x : carState.current.x);
        const dy = camera.position.y - targetY;
        const dz = camera.position.z - (wreck ? inspectionFocus.z : carState.current.y);
        const distance = Math.max(20, Math.hypot(dx, dy, dz));
        orbitTarget.azimuth = Math.atan2(dx, dz);
        orbitTarget.polar = THREE.MathUtils.clamp(
          Math.acos(THREE.MathUtils.clamp(dy / distance, -1, 1)),
          ORBIT_POLAR_MIN,
          ORBIT_POLAR_MAX,
        );
        camState.distance = distance;
        camState.smoothDist = distance;
        camState.smoothAzimuth = orbitTarget.azimuth;
        camState.smoothPolar = orbitTarget.polar;
      }
      manualOrbitOverride = true;
      const next = stepOrbitDrag(orbitTarget, detail.dx, detail.dy);
      orbitTarget.azimuth = next.azimuth;
      orbitTarget.polar = next.polar;
    };
    window.addEventListener('camera-orbit-change', handleOrbitChange);
    window.addEventListener('camera-orbit-nudge', handleOrbitNudge);

    // ===== Lights (Bruno Simon 风格：明亮柔和的环境光 + 暖色方向光) =====
    const ambient = new THREE.AmbientLight(0xd9e5f4, 0.24);

    const hemi = new THREE.HemisphereLight(0xd6e7ff, 0x3b4144, 0.40);

    const sun = new THREE.DirectionalLight(0xfff4e6, 1.8);
    sun.position.set(startX + 100, 400, startZ + 100);
    // 阴影默认关闭（设置里可开启）：开启后阴影既能投射到地面，
    // 也能投射到相邻车辆 / 墙体 / 建筑上。
    sun.castShadow = settingsRef.current.shadowsEnabled;
    sun.shadow.mapSize.width = profile.shadowSize;
    sun.shadow.mapSize.height = profile.shadowSize;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 1200;
    sun.shadow.camera.left = -SHADOW_SIZE;
    sun.shadow.camera.right = SHADOW_SIZE;
    sun.shadow.camera.top = SHADOW_SIZE;
    sun.shadow.camera.bottom = -SHADOW_SIZE;
    // 关键：修改正交阴影相机视锥后必须手动刷新投影矩阵，否则一直沿用
    // 构造时的默认 ±5 小盒子——这就是此前场景里看不到阴影的根因。
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.00008;
    sun.shadow.radius = 1;
    sun.shadow.normalBias = .35;  // PCF 小半径，保持清晰硬边

    // ===== 物理世界 =====
    const physics = new PhysicsWorld();
    let collisionGrid = buildCollisionGrid(obstaclesRef.current);
    let obstacleById = collisionGrid.byId;
    const indexCollisionObstacles = () => {
      collisionGrid = buildCollisionGrid(obstaclesRef.current);
      obstacleById = collisionGrid.byId;
    };
    const nearbyCollisionObstacles = (x: number, y: number, range = 150) =>
      queryCollisionGrid(collisionGrid, x, y, range);
    indexCollisionObstacles();
	    // 调试：输出碰撞网格统计
	    const gridWallCount = Array.from(collisionGrid.cells.values()).flat().filter(o => o.type === 'wall').length;
	    const gridCarCount = Array.from(collisionGrid.cells.values()).flat().filter(o => o.type === 'car').length;
	    console.log(`[碰撞网格] 已索引: wall×${gridWallCount} car×${gridCarCount} 总网格单元=${collisionGrid.cells.size} 总障碍物=${obstacleById.size}`);

	    // ===== 异步加载场景 + 注册物理刚体 =====
	    let disposed = false;
	    let built: BuiltScene | null = null;
	    const streamingPending = new Set<string>();
    const streamingLru: string[] = [];
    let lastStreamingCheckAt = 0;
    // 先创建占位 scene（供 applyWeather 等同步函数使用）
    let scene: THREE.Scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    let animationId: number = 0;
    let lastCrashAt = 0;
    let recoveryPose={x:carState.current.x,y:carState.current.y,rotation:carState.current.rotation,roadHeight:carState.current.roadHeight};
    let recoveryCandidate={...recoveryPose},accidentRecoveryPose={...recoveryPose},lastRecoveryAt=0;
    let wreck:CrashDebris|null=null;
    let damageModel:VehicleDamage|null=null;
    const looseDebris:CrashDebris[]=[];
    const inspectionFocus=new THREE.Vector3(startX,0,startZ);
    let rollover:VehicleRollover|null=null;
    let chassisState=createChassisState();
    setOverturned(false);
    let destroyed=false,damage=0,lastDamageAt=-1000;
    let impactReadout={closing:0,yaw:0,speedAfter:0,obstacle:'—'};
    const lateralState=createLateralState();
    let directionChangeActive=false;
    const impactMotion={x:0,y:0,yaw:0,time:0};
    setWrecked(false);setDamagePercent(0);setDamageTier('none');
    let driverMotion=createDriverMotion();
    let suspensionPitch = 0;
    let suspensionRoll = 0;
    let suspensionRoadPitch = 0;
    let bodyClearance = 0;
    let suspensionBodyHeight: number | null = null;
    let lastSuspensionReset = suspensionResetRef.current;
    let airborneActive = false;
    let airborneHeading = 0;
    let tyreLateralG = 0;
    let wheelBaseY: number[] = [];
    let wheelBaseZ: number[] = [];
    let wheelSuspensionOffsets: number[] = [];
    let playerBodyMeshes: THREE.Object3D[] = [];
    // 车门 / 尾翼 / 方向盘等可动子树的根节点（见 sceneBuilder 的部件绑定）
    let playerBodyRigRoots: THREE.Object3D[] = [];
    const playerBodyMaterialStates: Array<{ material: THREE.Material; opacity: number; transparent: boolean; depthWrite: boolean }> = [];
    const playerGlassMaterialStates: Array<{ material: THREE.Material; visible: boolean; transparent: boolean; opacity: number; depthWrite: boolean; transmission?: number }> = [];
    const playerPaintMaterialStates: Array<{ material: THREE.Material; visible: boolean }> = [];
    let cockpitEyeOffset: { x: number; y: number; z: number } | null = null;
    let measuredHoodRear: { y: number; z: number } | null = null;
    let hoodRearEdgeZ = Infinity;
    let hoodRearEdgeYSum = 0;
    let hoodRearEdgeCount = 0;
    let lastGhostBody = false;
    let playerBodyTiltPivot: THREE.Group | null = null;
    let firstPersonBodyFrame: THREE.Group | null = null;
    let playerPaintBodyMeshes: THREE.Object3D[] = [];
    let playerGlassMeshes: THREE.Object3D[] = [];
    let playerInteriorMeshes: THREE.Object3D[] = [];
    let driverInterior: DriverInterior | null = null;
    let hasModelSteeringWheel = false;
    let hoodCameraMount: THREE.Object3D | null = null;
    let hoodCameraTarget: THREE.Object3D | null = null;
    const hoodCameraPosition = new THREE.Vector3();
    const hoodCameraLookTarget = new THREE.Vector3();
    const hoodCameraUp = new THREE.Vector3();
    const hoodCameraQuaternion = new THREE.Quaternion();
    const mirrorLocalPosition = new THREE.Vector3();
    const mirrorLocalTarget = new THREE.Vector3();
    const mirrorLocalUp = new THREE.Vector3(0, 1, 0);
    const mirrorLocalLookMatrix = new THREE.Matrix4();
    const roadHeadlights: THREE.SpotLight[] = [];
    const roadTaillights: THREE.SpotLight[] = [];
    let simulatedEngineRpm = 0;
    let vehicleEnvironment: THREE.Texture | null = null;
    let selectedGear = 0;
    // Shift state: 0→1 over the clutch-to-clutch window of the current gear
    // change. The engine force is scaled by a smooth clutch engagement curve
    // — vehicle speed itself is NEVER touched by a gear change (this was the
    // old "shift = brake jab" bug: the gear speed limiter clamped velocity).
    let shiftProgress = 1;
    let overRevBlend = 0;
    // 点火后 0.5s 的起动结合，以及静止起步的离合咬合过程
    let ignitionBlend = 0;
    let launchBlend = 1;
    // 物理步长归一：所有「每帧」增量都按 60fps 折算，144Hz 屏幕上不会快一倍
    let lastPhysicsNow = performance.now();
    // Gameplay clock: advances only while the simulation runs. Pausing for the
    // settings panel must freeze skid-mark aging, minimap/radar timers and turn
    // signal blinking as well as the vehicle itself.
    let simulationClockMs = 0;
    let audioDistanceM=0;
    let lastMotorDriveForce=0;
    let audioMixReadout={cabin:false,motor:0,road:0,hz:0,driving:false};
    // A scene / vehicle rebuild starts a new simulation clock. Do not keep
    // the previous clock's telemetry deadline or the HUD freezes after a swap.
    lastDebugReadoutAt.current = 0;
    frameProbeRef.current.initialized = false;
    frameProbeRef.current.intervals = [];
    frameProbeRef.current.positionStepMax = 0;
    frameProbeRef.current.speedStepMax = 0;
    // 刹车踏板行程（0..1），按下/松开都有真实行程时间
    let brakePedal = 0;
    let prevLongAccelMs2 = 0;
    let filteredLongAccelG = 0;
    // Fixed-step carry: 120 Hz render frames feed half a 60 Hz physics frame.
    let longitudinalPendingFrames = 0;
    let longitudinalHoldFrames = 0;
    let longitudinalStallTimer = 0;
    let lastLaneWarningAt = 0;
    let lastMiniMapUpdateAt = 0;
    let lastSkidPosition: Vector2 | null = null;
    const skidMarks: THREE.Mesh[] = [];
    const skidMarkGeo = new THREE.PlaneGeometry(1.4, 4.5);
    const skidMarkMat = new THREE.MeshBasicMaterial({
      color: 0x171717,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -6,
      polygonOffsetUnits: -6,
      side: THREE.DoubleSide,
    });
    const skidMarkGroup = new THREE.Group();
    skidMarkGroup.name = 'skid-marks';
    const SKID_HOLD_MS = 8500;
    const SKID_FADE_MS = 5500;
    const turnAssistGroup = new THREE.Group();
    turnAssistGroup.name = 'turn-assist-guide';
    const turnAssistDashMeshes: THREE.Mesh[][] = [[], []];
    const guideDashGeometry = new THREE.PlaneGeometry(1, 1);
    // The lookahead distance varies with speed; keep a fixed vertex budget.
    const GUIDE_DASH_COUNT = 56;
    const GUIDE_STEP_COUNT = GUIDE_DASH_COUNT * 2;
    [0x22d3ee, 0xfbbf24].forEach((color, sideIndex) => {
      for (let dashIndex = 0; dashIndex < GUIDE_DASH_COUNT; dashIndex++) {
        const fade = 0.9 * Math.pow(1 - dashIndex / GUIDE_DASH_COUNT, 1.35);
        const material = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: fade,
          depthTest: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const dash = new THREE.Mesh(guideDashGeometry, material);
        dash.renderOrder = 20;
        dash.rotation.order = 'YXZ';
        turnAssistDashMeshes[sideIndex].push(dash);
        turnAssistGroup.add(dash);
      }
    });
    const turnAssistDistanceLines: THREE.Line[] = [];
    for (const color of [0xef4444, 0xfbbf24, 0x22c55e]) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(2 * 3), 3));
      const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.92, depthTest: true });
      const line = new THREE.Line(geometry, material);
      line.renderOrder = 20;
      turnAssistDistanceLines.push(line);
      turnAssistGroup.add(line);
    }
    turnAssistGroup.visible = false;

    // High-contrast locator used only by the global overhead renderer. It is
    // hidden for the driving camera, mirrors and the close vehicle inset.
    const globalCarMarker = new THREE.Group();
    globalCarMarker.name = 'global-overview-car-marker';
    const markerRingMaterial = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.96,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const markerRing = new THREE.Mesh(new THREE.RingGeometry(42, 58, 40), markerRingMaterial);
    markerRing.rotation.x = -Math.PI / 2;
    markerRing.renderOrder = 80;
    globalCarMarker.add(markerRing);
    const markerArrowShape = new THREE.Shape();
    markerArrowShape.moveTo(0, 58);
    markerArrowShape.lineTo(-34, -38);
    markerArrowShape.lineTo(0, -20);
    markerArrowShape.lineTo(34, -38);
    markerArrowShape.closePath();
    const markerArrowMaterial = new THREE.MeshBasicMaterial({
      color: 0xf8fafc,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const markerArrow = new THREE.Mesh(new THREE.ShapeGeometry(markerArrowShape), markerArrowMaterial);
    markerArrow.rotation.x = -Math.PI / 2;
    markerArrow.position.y = 0.6;
    markerArrow.renderOrder = 81;
    globalCarMarker.add(markerArrow);
    globalCarMarker.visible = false;

    // 物理碰撞回调（playCrashSound 在后面定义，使用函数提升）
    const physicsCrashHandler = (impactSpeed: number) => {
      const now = simulationClockMs;
      if (impactSpeed > 0.5 && now - lastCrashAt > 400) {
        lastCrashAt = now;
        playCrashSound(Math.max(0.3, impactSpeed));
        if (impactSpeed > 1.5) {
          onCrashRef.current(impactSpeed > 5 ? 50 : 10);
        }
      }
    };
    physics.onPlayerCollision = physicsCrashHandler;

    (async () => {
      const ccCur = CAR_MODELS[currentCarId];
      const staticLevelData = { ...levelData, obstacles: obstaclesRef.current };
      built = await buildScene(staticLevelData, ccCur, currentCarId);
      resolutionSampler.reset(performance.now());
      if (disposed) {disposeResources([built.scene,...(built.streamingChunks?.values()??[])]);return;}
      // buildScene computes actual parked-model hulls on the level objects;
      // copy them onto the live JSON-cloned obstacle refs used by collision.
      const sourceObstacles = new Map<string, Obstacle>(staticLevelData.obstacles.map(obs => [obs.id, obs]));
      obstaclesRef.current.forEach(obs => {
        const source = sourceObstacles.get(obs.id);
        if (source?.collisionFootprint) obs.collisionFootprint = source.collisionFootprint;
        if (source?.verticalHeight !== undefined) obs.verticalHeight = source.verticalHeight;
        if (source?.elevation !== undefined) obs.elevation = source.elevation;
      });
      indexCollisionObstacles();

      // 给玩家车模一层摄影棚反射：车漆/玻璃/轮毂的金属度很高，没有环境贴图
      // 时高光会发黑。只作用于本车材质，不影响道路与建筑的光照。
      // The colour-based low-poly cars need only the shared sun/hemisphere.
      // Keep legacy metallic assets readable without paying for a studio
      // environment on every new vehicle load.
      if (!isAuthoredVehicle(currentCarIdRef.current)) {
        vehicleEnvironment = createVehicleEnvironment(renderer);
        applyVehicleEnvironment(built.playerCarParts.group, vehicleEnvironment, 0.65);
      }
      // 开发期调试钩子：可在控制台直接检查车模节点与材质状态（生产构建会剔除）。
      if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) {
        (window as unknown as { __dshCar?: unknown }).__dshCar = built.playerCarParts;
      }

      // 用 buildScene 返回的 scene 替换占位 scene，并迁移灯光
      const oldScene = scene;
      scene = built.scene;
      const debugGroup = collisionDebugGroupRef.current;
      if (debugGroup) {
        debugGroup.parent?.remove(debugGroup);
        scene.add(debugGroup);
        debugGroup.visible = collisionDebugEnabledRef.current;
      }
      ceilingGroupRef.current = built.ceilingGroup;
      built.streamingChunks?.forEach((chunk, key) => {
        if (chunk.parent === scene) streamingLru.push(key);
      });
      scene.add(ambient);
      scene.add(hemi);
      scene.add(sun);
      scene.add(sun.target);
      scene.add(skidMarkGroup);
      scene.add(turnAssistGroup);

      wheelBaseY = built.playerCarParts.wheelMounts.map(mount => mount.position.y);
      wheelBaseZ = built.playerCarParts.wheelMounts.map(mount => mount.position.z);
      wheelSuspensionOffsets = built.playerCarParts.wheelMounts.map(() => 0);
      // Cache only the body renderables. Wheel nodes and every ancestor they
      // need remain visible, so geometry inspection can hide the body while
      // steering, rolling and independent suspension continue to animate.
      const wheelProtectedNodes = new Set<THREE.Object3D>();
      built.playerCarParts.wheelMounts.forEach((mount) => {
        mount.traverse(node => wheelProtectedNodes.add(node));
        let ancestor: THREE.Object3D | null = mount.parent;
        while (ancestor && ancestor !== built!.playerCarParts.group) {
          wheelProtectedNodes.add(ancestor);
          ancestor = ancestor.parent;
        }
      });
      // 程序化车模把可动部件（车门、尾翼、方向盘）挂在各自的铰链/枢轴上。
      // 这些子树必须先以「整棵子树」为单位挂到车身俯仰枢轴上，否则下面
      // 逐网格 attach() 会把网格从自己的铰链里拽出来，开合动画失效。
      playerBodyRigRoots = [];
      built.playerCarParts.group.traverse((node) => {
        const role = node.userData?.partRole as string | undefined;
        if (role === 'door-hinge' || role === 'active-spoiler-pivot' || role === 'steering-wheel-pivot') {
          playerBodyRigRoots.push(node);
        }
      });
      hasModelSteeringWheel = playerBodyRigRoots.some(root => root.userData?.partRole === 'steering-wheel-pivot');
      const insideRig = (node: THREE.Object3D): boolean => {
        let parent = node.parent;
        while (parent && parent !== built!.playerCarParts.group) {
          if (playerBodyRigRoots.includes(parent)) return true;
          parent = parent.parent;
        }
        return false;
      };
      const insideModelInterior = (node: THREE.Object3D): boolean => {
        let parent = node.parent;
        while (parent && parent !== built!.playerCarParts.group) {
          if (parent.userData?.partRole === 'interior' || parent.userData?.partRole === 'steering-wheel-pivot') return true;
          parent = parent.parent;
        }
        return false;
      };
      playerBodyMeshes = [];
      built.playerCarParts.group.traverse((node) => {
        if ((node instanceof THREE.Mesh || node instanceof THREE.Line || node instanceof THREE.Points)
          && !wheelProtectedNodes.has(node)) {
          playerBodyMeshes.push(node);
        }
      });
      // 车轮透视需要独立材质：克隆车身材质并记录原始透明参数，
      // 避免影响共享缓存材质的交通车（GLB clone 默认共享材质）。
      const clonedBodyMaterials = new Map<string, THREE.Material>();
      playerBodyMeshes.forEach(node => {
        const mesh = node as THREE.Mesh;
        const cloneOne = (source: THREE.Material): THREE.Material => {
          const cached = clonedBodyMaterials.get(source.uuid);
          if (cached) return cached;
          const cloned = source.clone();
          clonedBodyMaterials.set(source.uuid, cloned);
          playerBodyMaterialStates.push({
            material: cloned,
            opacity: (cloned as THREE.Material & { opacity: number }).opacity ?? 1,
            transparent: cloned.transparent,
            depthWrite: cloned.depthWrite,
          });
          return cloned;
        };
        if (Array.isArray(mesh.material)) mesh.material = mesh.material.map(cloneOne);
        else if (mesh.material) mesh.material = cloneOne(mesh.material);
        const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        materials.forEach(material => {
          if (isPlayerGlassMaterial(node, material, currentCarIdRef.current)) {
            if (!playerGlassMaterialStates.some(record => record.material === material)) {
              playerGlassMaterialStates.push({
                material,
                visible: material.visible,
                transparent: material.transparent,
                opacity: (material as THREE.Material & { opacity: number }).opacity ?? 1,
                depthWrite: material.depthWrite,
                transmission: typeof (material as THREE.MeshPhysicalMaterial).transmission === 'number'
                  ? (material as THREE.MeshPhysicalMaterial).transmission : undefined,
              });
            }
          } else if (!insideModelInterior(node)
            && !playerPaintMaterialStates.some(record => record.material === material)) {
            // Multi-material SUV body shares one mesh between white paint,
            // windows and black trim. Hide only the paint materials in HOOD;
            // hiding the whole node would also remove the transparent glass.
            playerPaintMaterialStates.push({ material, visible: material.visible });
          }
        });
      });
      // Classify the real player body once. Glass is a separate primitive on
      // the sedan (Material.006); paint/interior are treated differently so the
      // first-person pass can keep the actual frame instead of double-siding
      // the entire solid shell.
      playerPaintBodyMeshes = [];
      playerGlassMeshes = [];
      playerInteriorMeshes = [];
      playerBodyMeshes.forEach(node => {
        if (!(node instanceof THREE.Mesh)) return;
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        const hasGlass = materials.some(material => isPlayerGlassMaterial(node, material, currentCarIdRef.current));
        const hasPaint = materials.some(material => !isPlayerGlassMaterial(node, material, currentCarIdRef.current));
        if (hasGlass && !playerGlassMeshes.includes(node)) playerGlassMeshes.push(node);
        if (hasPaint && !insideModelInterior(node) && !playerPaintBodyMeshes.includes(node)) playerPaintBodyMeshes.push(node);
        if (insideModelInterior(node) && !playerInteriorMeshes.includes(node)) playerInteriorMeshes.push(node);
      });

      // Dynamic braking/acceleration pitch belongs to the sprung body only.
      // Gather every non-wheel renderable under a chassis pivot while the
      // four wheel mounts remain direct children of the road-aligned rig.
      // attach() preserves each imported mesh's world transform.
      playerBodyTiltPivot = new THREE.Group();
      playerBodyTiltPivot.name = 'sprung-body-tilt-pivot';
      built.playerCarParts.group.add(playerBodyTiltPivot);
      built.playerCarParts.group.updateWorldMatrix(true, true);
      playerBodyTiltPivot.updateWorldMatrix(true, false);
      playerBodyMeshes.forEach(node => {
        if (!insideRig(node)) playerBodyTiltPivot!.attach(node);
      });
      playerBodyRigRoots.forEach(root => playerBodyTiltPivot!.attach(root));
      playerBodyTiltPivot.rotation.order = 'YXZ';

      const nativeCockpit = built.playerCarParts.nativeCockpit;
      if (nativeCockpit) {
        const baseline = resolveHoodCameraLocalPose(ccCur, DEFAULT_HOOD_CAMERA_ADJUSTMENT);
        cockpitEyeOffset = {
          x: nativeCockpit.eye.x - baseline.x,
          y: nativeCockpit.eye.y - baseline.y,
          z: nativeCockpit.eye.z - baseline.z,
        };
      } else {
      // Build the first-person shell from the REAL paint geometry, filtered to
      // the hood/roof/A-pillar/door-frame regions. This avoids double-siding
      // the whole solid shell (the white slab in the failure screenshot) and
      // avoids inventing a rectangular fake cabin. The original paint shell is
      // hidden only in HOOD; mirrors/external/overview use the untouched model.
      firstPersonBodyFrame = new THREE.Group();
      firstPersonBodyFrame.name = 'first-person-real-paint-frame';
      playerBodyTiltPivot.updateWorldMatrix(true, true);
      const frameInverse = playerBodyTiltPivot.matrixWorld.clone().invert();
      const cockpitProfile = cockpitProfileFor(ccCur.id);
      const materialArray = (node: THREE.Mesh) => Array.isArray(node.material) ? node.material : [node.material];
      const forEachMaterialGroup = (
        node: THREE.Mesh,
        visit: (material: THREE.Material, start: number, count: number) => void,
      ) => {
        const materials = materialArray(node);
        const geometry = node.geometry;
        const positions = geometry.getAttribute('position');
        if (!positions) return;
        const index = geometry.index;
        const groups = geometry.groups;
        if (groups.length > 1) {
          groups.forEach(group => {
            const material = materials[group.materialIndex ?? 0] ?? materials[0];
            if (material) visit(material, group.start, group.count);
          });
        } else {
          const material = materials[0];
          if (material) visit(material, 0, index ? index.count : positions.count);
        }
      };
      const glassWorldBox = new THREE.Box3();
      const scratchVertex = new THREE.Vector3();
      playerGlassMeshes.forEach(node => {
        if (!(node instanceof THREE.Mesh)) return;
        const index = node.geometry.index;
        const positions = node.geometry.getAttribute('position');
        forEachMaterialGroup(node, (material, start, count) => {
          if (!isPlayerGlassMaterial(node, material, currentCarIdRef.current)) return;
          for (let i = start; i < start + count; i++) {
            const vertexIndex = index ? index.getX(i) : i;
            scratchVertex.fromBufferAttribute(positions, vertexIndex).applyMatrix4(node.matrixWorld);
            glassWorldBox.expandByPoint(scratchVertex);
          }
        });
      });
      const glassLocalBox = glassWorldBox.isEmpty()
        ? new THREE.Box3(new THREE.Vector3(-ccCur.width / 2, ccCur.height * 0.58, -ccCur.length / 2), new THREE.Vector3(ccCur.width / 2, ccCur.height, ccCur.length / 2))
        : glassWorldBox.clone().applyMatrix4(frameInverse);
      const glassMinYNormalized = glassLocalBox.min.y / Math.max(1, ccCur.height);
      const glassMaxYNormalized = glassLocalBox.max.y / Math.max(1, ccCur.height);
      const glassMaxXNormalized = Math.max(Math.abs(glassLocalBox.min.x), Math.abs(glassLocalBox.max.x)) / Math.max(1, ccCur.width);
      const glassMinZNormalized = glassLocalBox.min.z / Math.max(1, ccCur.length);
      const glassMaxZNormalized = glassLocalBox.max.z / Math.max(1, ccCur.length);
      // Every body gets an eye inside its own measured glass band. SUVs and
      // SU7 are not lowered sedan cabins; using .85h on the SUV put the eye
      // against the roof and removed the hood/wheel from view.
      const defaultEyePose = resolveHoodCameraLocalPose(ccCur, DEFAULT_HOOD_CAMERA_ADJUSTMENT);
      const measuredEyeY = THREE.MathUtils.clamp(
        glassLocalBox.min.y + (glassLocalBox.max.y - glassLocalBox.min.y) * cockpitProfile.eyeGlassFraction,
        ccCur.height * 0.78,
        ccCur.height * 0.88,
      );
      // Store an offset, not an absolute pose: user height/forward/lateral
      // adjustments continue to apply on top of the measured per-car eye.
      cockpitEyeOffset = {
        x: ccCur.width * 0.16 - defaultEyePose.x,
        y: measuredEyeY - defaultEyePose.y,
        z: 0 - defaultEyePose.z,
      };
      const hoodMaterials = new Map<string, THREE.Material>();
      const interiorFrameMaterial = new THREE.MeshStandardMaterial({
        color: '#17191d', roughness: 0.92, metalness: 0.02,
        side: THREE.DoubleSide, flatShading: true,
      });
      const excludedCockpitMaterial = (name: string) => {
        const lower = name.toLowerCase();
        if (/glass|window|windshield|windscreen|light|lamp|bumper|chrome|trim|interior/.test(lower)) return true;
        // Sedan: Material.004 headlights, Material.005 black bumper/trim.
        if (currentCarIdRef.current === CarType.SEDAN) {
          return lower === 'material.004' || lower === 'material.005';
        }
        // SUV uses a separate Black/Grey trim group; its front wiper/trim bar
        // was being dyed as a cockpit frame. Keep the actual White body frame,
        // hide that trim in HOOD only.
        if (currentCarIdRef.current === CarType.SUV) {
          return /black|grey/i.test(lower);
        }
        return false;
      };
      const addFramePart = (keptPositions: number[], keptNormals: number[], material: THREE.Material) => {
        if (keptPositions.length === 0) return;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(keptPositions, 3));
        if (keptNormals.length) geometry.setAttribute('normal', new THREE.Float32BufferAttribute(keptNormals, 3));
        else geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        firstPersonBodyFrame!.add(mesh);
      };
      if (currentCarIdRef.current === CarType.SPORTS) {
        // Clone the authored meshes directly; preserve UV/map/transform instead
        // of rebuilding triangles and losing the windshield-edge/UV data.
        firstPersonBodyFrame.add(buildConceptCockpitFrame(playerBodyTiltPivot, frameInverse, interiorFrameMaterial, glassLocalBox, ccCur, measuredEyeY));
      } else {
      playerPaintBodyMeshes.forEach(node => {
        if (!(node instanceof THREE.Mesh)) return;
        // This branch is non-Concept only; Concept uses the direct mesh clone.
        const conceptFrameNode = false;
        const sourceGeometry = node.geometry;
        const index = sourceGeometry.index;
        const positions = sourceGeometry.getAttribute('position');
        const normals = sourceGeometry.getAttribute('normal');
        if (!positions) return;
        const transform = new THREE.Matrix4().multiplyMatrices(frameInverse, node.matrixWorld);
        const normalMatrix = new THREE.Matrix3().getNormalMatrix(transform);
        forEachMaterialGroup(node, (sourceMaterial, groupStart, groupCount) => {
          if (!sourceMaterial || sourceMaterial.transparent) return;
          if (isPlayerGlassMaterial(node, sourceMaterial, currentCarIdRef.current)) return;
          if (!(sourceMaterial instanceof THREE.MeshStandardMaterial
            || sourceMaterial instanceof THREE.MeshLambertMaterial
            || sourceMaterial instanceof THREE.MeshPhongMaterial)) return;
          if (excludedCockpitMaterial(sourceMaterial.name || '')) return;
          const hoodPositions: number[] = [], hoodNormals: number[] = [];
          const framePositions: number[] = [], frameNormals: number[] = [];
          const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
          const n = new THREE.Vector3(), center = new THREE.Vector3();
          // Concept cockpit boundary: use the authored hood/pillar/roof
          // triangles directly. Do not run them through the generic hood
          // classifier, which discarded large pieces and left a floating wheel.
          if (conceptFrameNode) {
            const target = /^bodyhood$/i.test(node.name) ? hoodPositions : framePositions;
            const targetN = /^bodyhood$/i.test(node.name) ? hoodNormals : frameNormals;
            for (let t = groupStart; t + 2 < groupStart + groupCount; t += 3) {
              const ia = index ? index.getX(t) : t;
              const ib = index ? index.getX(t + 1) : t + 1;
              const ic = index ? index.getX(t + 2) : t + 2;
              a.fromBufferAttribute(positions, ia).applyMatrix4(transform);
              b.fromBufferAttribute(positions, ib).applyMatrix4(transform);
              c.fromBufferAttribute(positions, ic).applyMatrix4(transform);
              target.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
              if (normals) {
                for (const pointIndex of [ia, ib, ic]) {
                  n.fromBufferAttribute(normals, pointIndex).applyMatrix3(normalMatrix).normalize();
                  targetN.push(n.x, n.y, n.z);
                }
              }
            }
          } else {
          for (let t = groupStart; t + 2 < groupStart + groupCount; t += 3) {
            const ia = index ? index.getX(t) : t;
            const ib = index ? index.getX(t + 1) : t + 1;
            const ic = index ? index.getX(t + 2) : t + 2;
            a.fromBufferAttribute(positions, ia).applyMatrix4(transform);
            b.fromBufferAttribute(positions, ib).applyMatrix4(transform);
            c.fromBufferAttribute(positions, ic).applyMatrix4(transform);
            center.copy(a).add(b).add(c).multiplyScalar(1 / 3);
            // Classify with the actual transformed face normal. Vertex
            // normals on multi-primitive GLBs are not reliable enough to
            // decide whether the real hood is present; the geometry audit uses
            // the same face-normal rule.
            const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
            const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
            const faceX = uy * vz - uz * vy;
            const faceY = uz * vx - ux * vz;
            const faceZ = ux * vy - uy * vx;
            const faceLength = Math.hypot(faceX, faceY, faceZ);
            let normalY = faceLength > 1e-6 ? faceY / faceLength : 0;
            if (faceLength <= 1e-6 && normals) {
              n.fromBufferAttribute(normals, ia).applyMatrix3(normalMatrix).normalize(); normalY += n.y;
              n.fromBufferAttribute(normals, ib).applyMatrix3(normalMatrix).normalize(); normalY += n.y;
              n.fromBufferAttribute(normals, ic).applyMatrix3(normalMatrix).normalize(); normalY += n.y;
              normalY /= 3;
            }
            const lx = Math.abs(center.x) / Math.max(1, ccCur.width);
            const ly = center.y / Math.max(1, ccCur.height);
            const lz = center.z / Math.max(1, ccCur.length);
            const classification = classifyCockpitPaintTriangle(
              lx, ly, lz, normalY, glassMinYNormalized, glassMaxYNormalized, cockpitProfile,
            );
            if (classification === 'discard') continue;
            // Sedan's low-poly shell has no named pillar meshes. Keep only the
            // actual paint triangles immediately around the windshield: side
            // A-pillars and the roof header. Lower door/side panels produced
            // the huge black triangles across the cockpit.
            if (classification === 'frame' && currentCarIdRef.current === CarType.SEDAN) {
              // Check all three vertices, not only the centre: one huge door
              // triangle with a centre near the windshield otherwise became a
              // full-screen black wedge.
              const inWindshieldBand = [a, b, c].every(vertex => {
                const vx = Math.abs(vertex.x) / Math.max(1, ccCur.width);
                const vy = vertex.y / Math.max(1, ccCur.height);
                const vz = vertex.z / Math.max(1, ccCur.length);
                return vz >= glassMaxZNormalized - 0.18
                  && vz <= glassMaxZNormalized + 0.06
                  && (vx >= glassMaxXNormalized - 0.14 || vy >= glassMaxYNormalized - 0.12);
              });
              if (!inWindshieldBand) continue;
            }
            if (classification === 'hood') {
              // Use the actual hood vertices for the rear edge, not the
              // triangle centre. The centre sits ~half a triangle forward and
              // is exactly what left the visible road gap under the hood strip.
              for (const vertex of [a, b, c]) {
                const vz = vertex.z / Math.max(1, ccCur.length);
                const vy = vertex.y / Math.max(1, ccCur.height);
                if (vz < hoodRearEdgeZ - 1e-4) {
                  hoodRearEdgeZ = vz;
                  hoodRearEdgeYSum = vy;
                  hoodRearEdgeCount = 1;
                } else if (Math.abs(vz - hoodRearEdgeZ) <= 1e-4) {
                  hoodRearEdgeYSum += vy;
                  hoodRearEdgeCount++;
                }
              }
            }
            const targetPositions = classification === 'hood' ? hoodPositions : framePositions;
            const targetNormals = classification === 'hood' ? hoodNormals : frameNormals;
            targetPositions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
            if (normals) {
              for (const pointIndex of [ia, ib, ic]) {
                n.fromBufferAttribute(normals, pointIndex).applyMatrix3(normalMatrix).normalize();
                targetNormals.push(n.x, n.y, n.z);
              }
            }
          }
          }
          const materialKey = sourceMaterial.uuid;
          let hoodMaterial = hoodMaterials.get(materialKey);
          if (!hoodMaterial) {
            hoodMaterial = sourceMaterial.clone();
            hoodMaterial.side = THREE.FrontSide;
            hoodMaterial.transparent = false;
            // Concept keeps its authored hood paint texture; other training
            // shells avoid carrying stray trim maps into the frame clone.
            if (currentCarIdRef.current !== CarType.SPORTS) {
              (hoodMaterial as THREE.MeshStandardMaterial).map = null;
            }
            hoodMaterial.needsUpdate = true;
            hoodMaterials.set(materialKey, hoodMaterial);
          }
          addFramePart(hoodPositions, hoodNormals, hoodMaterial);
          addFramePart(framePositions, frameNormals, interiorFrameMaterial);
        });
      });
      }
      if (hoodRearEdgeCount > 0) {
        measuredHoodRear = { y: hoodRearEdgeYSum / hoodRearEdgeCount, z: hoodRearEdgeZ };
      }
      if (currentCarIdRef.current === CarType.SEDAN) {
        // Continuous dark cowl closing the hood-rear -> dashboard slit. It is
        // attached to the same pivot as the real hood/frame, so no road can be
        // seen between the two through head motion or body pitch.
        const cowlLayout = sedanCowlLayout(
          ccCur,
          cockpitProfile.wheelZRatio,
          cockpitProfile.wheelCenterRatio,
          measuredHoodRear?.y ?? glassMinYNormalized,
          measuredEyeY,
          measuredHoodRear?.z ?? (glassMaxZNormalized - 0.02),
        );
        const cowl = new THREE.Mesh(
          new THREE.BoxGeometry(ccCur.width * 0.98, cowlLayout.height, cowlLayout.depth),
          interiorFrameMaterial,
        );
        cowl.name = 'sedan-continuous-cowl';
        cowl.position.set(0, cowlLayout.y, cowlLayout.z);
        cowl.castShadow = false;
        cowl.receiveShadow = false;
        firstPersonBodyFrame.add(cowl);
      }
      playerBodyTiltPivot.add(firstPersonBodyFrame);
      firstPersonBodyFrame.visible = false;

      }

      // The hood camera is a real body-mounted viewpoint. Both its eye and
      // aiming target live under the sprung-body pivot, so hill attitude,
      // brake dive, acceleration rise and independent-suspension roll all
      // reach the camera without moving the unsprung wheels.
      hoodCameraMount = new THREE.Object3D();
      hoodCameraMount.name = 'hood-camera-mount';
      hoodCameraMount.position.set(0, ccCur.height + 3.5, ccCur.length * 0.08);
      hoodCameraTarget = new THREE.Object3D();
      hoodCameraTarget.name = 'hood-camera-target';
      hoodCameraTarget.position.set(0, ccCur.height * 0.72, ccCur.length * 3.2);
      playerBodyTiltPivot.add(hoodCameraMount, hoodCameraTarget);

      // Imported models have no usable cabin. Add one lightweight generic
      // interior, visible only in the first-person camera; mirrors and all
      // external views hide it explicitly.
      // Put the generic dash front just behind/below the real hood rear so a
      // narrow body-color hood strip remains visible; do not drop the firewall
      // to the floor or invent a second hood.
      if (!nativeCockpit) {
        const cockpitLayout = calibrateCowlProfile(cockpitProfileFor(ccCur.id), measuredHoodRear?.y ?? null, measuredHoodRear?.z ?? null);
        driverInterior = buildDriverInterior(ccCur, cockpitLayout);
        driverInterior.group.visible = false;
        playerBodyTiltPivot.add(driverInterior.group);
      }

      // Rear-view cameras are actual children of the sprung body. Keeping the
      // cameras in this hierarchy (rather than reconstructing a world-space
      // pose each frame) guarantees zero relative motion between the mirror
      // viewpoint and the body during pitch, roll and suspension animation.
      leftMirrorCamera.name = 'left-body-mounted-mirror-camera';
      rightMirrorCamera.name = 'right-body-mounted-mirror-camera';
      centreMirrorCamera.name = 'centre-body-mounted-mirror-camera';
      playerBodyTiltPivot.add(leftMirrorCamera, rightMirrorCamera, centreMirrorCamera);

      // Real light housings use emissive materials, but those alone cannot
      // illuminate asphalt. These vehicle-local spot lights add visible road
      // pools and follow the road-aligned chassis, not the body dive animation.
      const addRoadLamp = (front: boolean, side: number) => {
        const lamp = new THREE.SpotLight(
          front ? 0xfff4cf : 0xff2020,
          0,
          front ? 450 : 80,
          front ? 0.65 : 0.55,
          front ? 0.50 : 0.45,
          front ? 1.08 : 1.25,
        );
        const z = (front ? 1 : -1) * ccCur.length * 0.43;
        lamp.position.set(side * ccCur.width * 0.25, ccCur.height * (front ? 0.34 : 0.28), z);
        lamp.castShadow = false;
        const target = new THREE.Object3D();
        target.position.set(
          side * ccCur.width * (front ? 0.55 : 0.20),
          front ? 0.06 : 0.12,
          z + (front ? 330 : -42),
        );
        built!.playerCarParts.group.add(lamp, target);
        lamp.target = target;
        (front ? roadHeadlights : roadTaillights).push(lamp);
      };
      [-1, 1].forEach(side => {
        addRoadLamp(true, side);
        addRoadLamp(false, side);
      });
      // 释放占位 scene
      if (oldScene && oldScene !== scene) {
        oldScene.traverse(obj => { if (obj instanceof THREE.Mesh) obj.geometry.dispose(); });
      }

      // Keep AI simulation, rendered models and collision tests on the exact
      // same obstacle objects. Previously the AI moved a deep copy while the
      // visible car stayed on the original object, creating invisible cars.
      for (const id of Array.from(built.trafficObstacles.keys())) {
        const simulated = obstaclesRef.current.find(obs => obs.id === id);
        if (simulated) built.trafficObstacles.set(id, simulated);
      }

      // ===== 注册物理刚体 =====
      // 玩家车
      physics.addPlayerCar(
        carState.current.x, carState.current.y,
        ccCur.width, ccCur.length, ccCur.weight
      );

      // Live AI traffic is intentionally disabled; authored cars are fixed
      // roadside/parking obstacles and get static collision bodies.
      built.trafficObstacles.forEach((obs) => {
        const w = obs.width || 19;
        const l = obs.height || 47;
        physics.addTrafficCar(obs.id, obs.x, obs.y, w, l, obs.weight || 1500);
      });
      // Static parked cars are handled by the height-aware kinematic solver
      // with their actual model hull; adding ground Cannon boxes would create
      // false contacts for a car on the bridge deck above the same XZ.

      // 可移动物体（锥桶/箱子）
      staticLevelData.obstacles.forEach((obs) => {
        if ((obs.type === 'cone' || obs.type === 'box') && obs.movable) {
          physics.addMovableObstacle(obs);
        }
        // 静态建筑/围墙
        if (obs.type === 'wall') {
          const isBoundary = obs.width > 2000 || obs.height > 2000;
          // Elevated guard rails are handled by the height-aware kinematic
          // collision below; adding them at ground height would create walls
          // under the bridge.
          if (!isBoundary && !obs.collisionOnly && !(obs.elevation && obs.elevation > 2)) {
            physics.addStaticObstacle(obs.x, obs.y, obs.width, obs.height, 30, obs.rotation, obs.elevation || 0);
          }
        }
      });

      // 地图边界
      physics.addBoundary(levelData.mapWidth, levelData.mapHeight);

      // 启动渲染循环
      startRenderLoop();
    })();

    // ===== 天气 / 时间 状态（动态可调） =====
    let rainParticles: THREE.Points | null = null;
    let snowParticles: THREE.Points | null = null;

    function applyWeather() {
      const w = weatherRef.current;
      const d = dayTimeRef.current;

      // 清除旧粒子
      if (rainParticles) { scene.remove(rainParticles); rainParticles.geometry.dispose(); (rainParticles.material as THREE.Material).dispose(); rainParticles = null; }
      if (snowParticles) { scene.remove(snowParticles); snowParticles.geometry.dispose(); (snowParticles.material as THREE.Material).dispose(); snowParticles = null; }
      scene.fog = null;

      // 背景色
      let bg = 0x8db8e0;
      if (d === DayTime.NIGHT) bg = 0x0a0e1a;
      else if (w === WeatherType.RAINY) bg = 0x6b7a8f;
      else if (w === WeatherType.SNOWY) bg = 0xc0cad6;
      else if (w === WeatherType.FOGGY) bg = 0xb8b8b8;
      scene.background = new THREE.Color(bg);

      // 光照
      const isUnderground = levelDataRef.current?.levelId === 6;
      if (isUnderground) {
        // 地下车库：弱填充 + 定向主光，保留车身面的明暗与投影
        ambient.intensity = 0.22;
        hemi.intensity = 0.30;
        sun.intensity = 2.5;
        sun.color.setHex(0xffe6c0);
        scene.background=new THREE.Color('#2c343c');
      } else if (d === DayTime.NIGHT) {
        ambient.intensity = 0.2;
        hemi.intensity = 0.15;
        sun.intensity = 0.3;
        sun.color.setHex(0x8090b0);
      } else {
        ambient.intensity = 0.24;
        hemi.intensity = 0.42;
        sun.intensity = w === WeatherType.RAINY || w === WeatherType.SNOWY ? 1.4 : 2.6;
        sun.color.setHex(0xfff4e6);
      }

      // 雾
      if (w === WeatherType.RAINY) scene.fog = new THREE.Fog(0x6b7a8f, 200, 800);
      else if (w === WeatherType.SNOWY) scene.fog = new THREE.Fog(0xc0cad6, 150, 600);
      else if (w === WeatherType.FOGGY) scene.fog = new THREE.Fog(0xc8c8c8, 100, 400);

      // 雨粒子
      if (w === WeatherType.RAINY) {
        const count = 1500;
        const positions = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
          positions[i * 3] = (Math.random() - 0.5) * 1200;
          positions[i * 3 + 1] = Math.random() * 600;
          positions[i * 3 + 2] = (Math.random() - 0.5) * 1200;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.PointsMaterial({ color: 0x99bbdd, size: 3, transparent: true, opacity: 0.5 });
        rainParticles = new THREE.Points(geo, mat);
        scene.add(rainParticles);
      }

      // 雪粒子
      if (w === WeatherType.SNOWY) {
        const count = 800;
        const positions = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
          positions[i * 3] = (Math.random() - 0.5) * 1200;
          positions[i * 3 + 1] = Math.random() * 600;
          positions[i * 3 + 2] = (Math.random() - 0.5) * 1200;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 4, transparent: true, opacity: 0.7 });
        snowParticles = new THREE.Points(geo, mat);
        scene.add(snowParticles);
      }
    }
    applyWeather();

    // 监听天气/时间变化（通过 ref 间接轮询，避免重建 effect）
    let lastWeather: WeatherType = weatherRef.current;
    let lastDayTime: DayTime = dayTimeRef.current;

    // ===== 音效辅助函数 =====
    const playCrashSound = (force: number) => {
      const raw=settingsRef.current; const s={...raw,volume:raw.volume*(cameraViewRef.current==='HOOD'?(raw.cabinVolume??.7):(raw.exteriorVolume??.85))};
      if (!s.soundEnabled || !audioContextRef.current) return;
      const ctx = audioContextRef.current;
      if (ctx.state === 'closed') return;
      if (getRecordingAudioStatus().ready) {
        playRecordingImpact(Math.min(0.85, Math.sqrt(force / 6)) * s.volume);
        return;
      }
      const intensity = Math.min(0.85, Math.sqrt(force / 6));
      // 噪声模拟真实擦撞/重撞效果：轻擦低频闷响，重撞加入金属高频
      const bufferSize = ctx.sampleRate * 1.0;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let lastOut = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        data[i] = (lastOut + (0.02 * white)) / 1.02;
        lastOut = data[i];
        data[i] *= 3.5;
      }
      const noiseSrc = ctx.createBufferSource(); noiseSrc.buffer = buffer;
      const filter = ctx.createBiquadFilter(); filter.type = 'lowpass';
      filter.frequency.value = 800 + (intensity * 2000);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(intensity * s.volume * 0.7, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12 + (intensity * 0.25));
      noiseSrc.connect(filter); filter.connect(gain); gain.connect(ctx.destination); noiseSrc.start();
      if (intensity > 0.3) {
        // 重撞：追加金属撞击高频
        const metalOsc = ctx.createOscillator(); metalOsc.type = 'triangle';
        metalOsc.frequency.value = 340 + Math.random() * 180;
        const metalFilter = ctx.createBiquadFilter(); metalFilter.type = 'highpass';
        metalFilter.frequency.value = 160;
        const metalGain = ctx.createGain();
        metalGain.gain.setValueAtTime(intensity * s.volume * 0.12, ctx.currentTime);
        metalGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
        metalOsc.connect(metalFilter); metalFilter.connect(metalGain); metalGain.connect(ctx.destination);
        metalOsc.start(); metalOsc.stop(ctx.currentTime + 0.06);
      }
    };

    // 转向指示器咔哒声：1→2 半圈过渡（打入）/ 3→2 半圈过渡（回正）
    const playSteeringClick = () => {
      const raw=settingsRef.current; const s={...raw,volume:raw.volume*(cameraViewRef.current==='HOOD'?(raw.cabinVolume??.7):(raw.exteriorVolume??.85))};
      if (!s.soundEnabled || !s.steeringSoundEnabled || !inputRef.current.engineStarted || !audioContextRef.current) return;
      const ctx = audioContextRef.current;
      if (ctx.state === 'closed') return;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator(); osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, t0);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(s.volume * 0.06, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.02);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(t0); osc.stop(t0 + 0.025);
    };

    // 转向指示器滴滴声：2→3 半圈过渡（打入深打）
    const playSteeringBeep = () => {
      const raw=settingsRef.current; const s={...raw,volume:raw.volume*(cameraViewRef.current==='HOOD'?(raw.cabinVolume??.7):(raw.exteriorVolume??.85))};
      if (!s.soundEnabled || !s.steeringSoundEnabled || !inputRef.current.engineStarted || !audioContextRef.current) return;
      const ctx = audioContextRef.current;
      if (ctx.state === 'closed') return;
      const t0 = ctx.currentTime;
      [1600, 2000].forEach((freq, i) => {
        const osc = ctx.createOscillator(); osc.type = 'square';
        osc.frequency.setValueAtTime(freq, t0 + i * 0.04);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(s.volume * 0.05, t0 + i * 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + i * 0.04 + 0.03);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(t0 + i * 0.04); osc.stop(t0 + i * 0.04 + 0.035);
      });
    };

    // 转向呲呲声：2→1 半圈过渡（回正放松）
    const playSteeringHiss = () => {
      const raw=settingsRef.current; const s={...raw,volume:raw.volume*(cameraViewRef.current==='HOOD'?(raw.cabinVolume??.7):(raw.exteriorVolume??.85))};
      if (!s.soundEnabled || !s.steeringSoundEnabled || !inputRef.current.engineStarted || !audioContextRef.current) return;
      const ctx = audioContextRef.current;
      if (ctx.state === 'closed') return;
      const t0 = ctx.currentTime;
      const bufSize = Math.floor(ctx.sampleRate * 0.06);
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 3);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const filter = ctx.createBiquadFilter(); filter.type = 'highpass'; filter.frequency.value = 3000;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(s.volume * 0.04, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.06);
      src.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
      src.start(t0); src.stop(t0 + 0.07);
    };

    // 障碍物距离检测嘟嘟声（模拟真实倒车雷达蜂鸣器）
    const playProximityBeep = (urgency: number) => {
      const raw=settingsRef.current; const s={...raw,volume:raw.volume*(cameraViewRef.current==='HOOD'?(raw.cabinVolume??.7):(raw.exteriorVolume??.85))};
      if (!s.soundEnabled || !s.radarSoundEnabled || !inputRef.current.engineStarted || !audioContextRef.current) return;
      const ctx = audioContextRef.current;
      if (ctx.state === 'closed') return;
      const t0 = ctx.currentTime;
      const freq = 400 + urgency * 400; // 低频蜂鸣 400Hz→800Hz（更低沉不刺耳）
      const vol = 0.015 + urgency * 0.03; // 降低响度
      const dur = 0.065; // 脉冲稍长更像"嘟—"
      const osc = ctx.createOscillator(); osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t0);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(s.volume * vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(t0); osc.stop(t0 + dur + 0.01);
    };

    // 转向过渡状态追踪
    let prevSteerProgress = 0;
    // 距离传感器状态
    let lastProximityBeepAt = 0;
    let radarStationaryMs = 0;

    const playBrakeSound = (force: number) => {
      const raw=settingsRef.current; const s={...raw,volume:raw.volume*(cameraViewRef.current==='HOOD'?(raw.cabinVolume??.7):(raw.exteriorVolume??.85))};
      if (!s.soundEnabled || !s.engineSoundEnabled || !audioContextRef.current) return;
      const ctx = audioContextRef.current;
      if (ctx.state === 'closed') return;
      const bufferSize = ctx.sampleRate * 0.3;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
      const noiseSrc = ctx.createBufferSource(); noiseSrc.buffer = buffer;
      const filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 2000; filter.Q.value = 1.5;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(force * s.volume * 0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      noiseSrc.connect(filter); filter.connect(gain); gain.connect(ctx.destination); noiseSrc.start();
    };

    const playHornSound = () => {
      const raw=settingsRef.current; const s={...raw,volume:raw.volume*(cameraViewRef.current==='HOOD'?(raw.cabinVolume??.7):(raw.exteriorVolume??.85))};
      if (!s.soundEnabled || !audioContextRef.current) return;
      const ctx = audioContextRef.current;
      if (ctx.state === 'closed') return;
      const now = ctx.currentTime;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.min(0.12, 0.07 * s.volume), now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
      for (const frequency of [392, 494]) {
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(frequency, now);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.35);
      }
      gain.connect(ctx.destination);
    };

    const playSuccessSound = (isPenalty: boolean) => {
      const raw=settingsRef.current; const s={...raw,volume:raw.volume*(cameraViewRef.current==='HOOD'?(raw.cabinVolume??.7):(raw.exteriorVolume??.85))};
      const ctx = audioContextRef.current;
      if (!s.soundEnabled || !ctx || ctx.state === 'closed') return;
      // The context starts suspended until a user gesture and is also
      // suspended when the tab is hidden. A success chime scheduled into a
      // suspended context is silent, which is why the user heard nothing.
      if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
      const now = ctx.currentTime + 0.01;
      const master = ctx.createGain();
      master.gain.setValueAtTime(Math.max(0.0001, 0.42 * s.volume), now);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);
      master.connect(ctx.destination);
      if (isPenalty) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.3);
        osc.connect(master);
        osc.start(now); osc.stop(now + 0.42);
        return;
      }
      // A clearly audible two-note "ding-dong" (E6 → A6), with a quieter
      // octave harmonic so it cuts through engine/road noise without being
      // shrill. Both notes belong to the same parking-success event as the
      // on-screen banner.
      const notes = [
        { at: 0, hz: 1318.51, gain: 0.9 },
        { at: 0.16, hz: 1760.0, gain: 0.78 },
      ];
      for (const note of notes) {
        const t = now + note.at;
        for (const [type, hz, level] of [
          ['sine', note.hz, note.gain],
          ['triangle', note.hz * 2, note.gain * 0.22],
        ] as Array<[OscillatorType, number, number]>) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = type;
          osc.frequency.setValueAtTime(hz, t);
          gain.gain.setValueAtTime(0.0001, t);
          gain.gain.exponentialRampToValueAtTime(level, t + 0.012);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.62);
          osc.connect(gain); gain.connect(master);
          osc.start(t); osc.stop(t + 0.66);
        }
      }
    };

    // ===== Legacy traffic helper retained for unit tests; round 6 gameplay spawns no AI =====
    const trafficLastUpdateAt = new Map<string, number>();
    const updateTraffic = (frameDeltaMs: number) => {
      if (!built) return;
      // Explicit cap: level data may add more, but only the nearest active set
      // is simulated. The rest remain authored scenery.
      const active = Array.from(built.trafficObstacles.values())
        .filter(obs => obs.ai)
        .slice(0, MAX_ACTIVE_TRAFFIC);
      const playerCc = CAR_MODELS[currentCarIdRef.current];
      const playerBlocker = {
        id: 'player',
        x: carState.current.x,
        y: carState.current.y,
        width: playerCc.width,
        height: playerCc.length,
      };
      for (const obs of active) {
        if (!obs.ai) continue;
        const distanceToPlayer = Math.hypot(obs.x - carState.current.x, obs.y - carState.current.y);
        // Far cars update at 9 Hz; near cars every frame. dt covers the real
        // elapsed time, so traffic speed does not depend on the update rate.
        const interval = distanceToPlayer > 900 ? 110 : distanceToPlayer > 450 ? 55 : 0;
        const previousAt = trafficLastUpdateAt.get(obs.id) ?? (simulationClockMs - frameDeltaMs);
        if (interval > 0 && simulationClockMs - previousAt < interval) continue;
        const dtSeconds = Math.max(0.001, Math.min(0.2, (simulationClockMs - previousAt) / 1000));
        trafficLastUpdateAt.set(obs.id, simulationClockMs);

        const blockers = [];
        for (const other of obstaclesRef.current) {
          if (other.id === obs.id) continue;
          if (other.type !== 'car' && other.type !== 'wall') continue;
          if (Math.abs(other.x - obs.x) > 260 || Math.abs(other.y - obs.y) > 260) continue;
          blockers.push({ id: other.id, x: other.x, y: other.y, width: other.width, height: other.height });
        }
        blockers.push(playerBlocker);
        const result = stepTrafficVehicle({
          id: obs.id,
          x: obs.x,
          y: obs.y,
          rotation: obs.rotation,
          ai: obs.ai,
          blockers,
          player: { x: carState.current.x, y: carState.current.y },
          dtSeconds,
          nowMs: simulationClockMs,
        });
        obs.x = result.x;
        obs.y = result.y;
        obs.rotation = result.rotation;
        obs.ai.speed = result.speed;
        obs.ai.currentPathIndex = result.currentPathIndex;
        obs.ai.state = result.state;
        if (result.honked) playHornSound();
      }
    };

    // ===== 旋转映射辅助 =====
    // 2D rotation=0 → 车头朝 +x(东)
    // 3D buildCarMesh 中车头朝 +z(北)
    // 最终 θ_3d = π/2 - θ_2d
    const ROT_OFFSET = Math.PI / 2;
    const toMeshRotY = (rot2d: number) => -rot2d + ROT_OFFSET;

    // ===== 主渲染循环（场景加载完成后启动） =====
    const car = carState.current;
    const collisionDebugGroup = new THREE.Group();
    collisionDebugGroup.name = 'collision-debug-lines';
    collisionDebugGroup.visible = collisionDebugEnabledRef.current;
    collisionDebugGroupRef.current = collisionDebugGroup;
    scene.add(collisionDebugGroup);
    const collisionDebugHandler = (event: Event) => {
      const detail = (event as CustomEvent<{ enabled?: boolean }>).detail;
      collisionDebugEnabledRef.current = typeof detail?.enabled === 'boolean'
        ? detail.enabled
        : !collisionDebugEnabledRef.current;
      collisionDebugGroup.visible = collisionDebugEnabledRef.current;
    };
    window.addEventListener('toggle-collision-debug', collisionDebugHandler);
    let collisionDebugAt = 0;
    const clearCollisionDebug = () => {
      while (collisionDebugGroup.children.length) {
        const child = collisionDebugGroup.children.pop();
        if (child instanceof THREE.LineSegments) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      }
    };
    const buildCollisionDebug = (body: VehicleCollider) => {
      clearCollisionDebug();
      const addLoop = (points: Vector2[], color: string, y: number) => {
        if (points.length < 2) return;
        const vertices: number[] = [];
        for (let i = 0; i < points.length; i++) {
          const a = points[i], b = points[(i + 1) % points.length];
          vertices.push(a.x, y, a.y, b.x, y, b.y);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.9 }));
        line.renderOrder = 999;
        collisionDebugGroup.add(line);
      };
      addLoop(getVehicleBoundaryPoints(body), '#22d3ee', (body.elevation || 0) + 1.2);
      obstaclesRef.current.forEach(obs => {
        if (obs.type !== 'car' && obs.type !== 'wall' && obs.type !== 'box') return;
        if (Math.abs(obs.x - body.x) > 700 || Math.abs(obs.y - body.y) > 700) return;
        const elevation = obs.elevation || 0;
        if (obs.collisionFootprint?.length) {
          const cos = Math.cos(obs.rotation), sin = Math.sin(obs.rotation);
          const world = obs.collisionFootprint.map(p => ({
            x: obs.x + p.x * cos - p.y * sin,
            y: obs.y + p.x * sin + p.y * cos,
          }));
          addLoop(world, elevation > 2 ? '#f59e0b' : '#ef4444', elevation + 1.2);
        } else {
          addLoop(getRectCorners({ x: obs.x, y: obs.y, width: obs.width, height: obs.height, rotation: obs.rotation }), elevation > 2 ? '#f59e0b' : '#ef4444', elevation + 1.2);
        }
      });
    };
    const resolutionSampler = new ResolutionSampler();
    resolutionSampler.reset(performance.now());
    let simulationCpuMs=0,renderCpuMs=0;

    const render = () => {
      if(disposed)return;
      const cpuStart=performance.now();
      animationId = requestAnimationFrame(render);
      if (!built || !scene) return;

      const requestedQuality=settingsRef.current.renderQuality??'auto';
      if(requestedQuality!==quality){
        quality=requestedQuality;profile=qualityProfile(quality,window.devicePixelRatio,isTouchDevice());
        dynamicDpr=profile.initial;renderer.setPixelRatio(dynamicDpr);renderer.setSize(window.innerWidth,window.innerHeight,false);
        mirrorTarget.setSize(profile.mirrorWidth,Math.round(profile.mirrorWidth*.375));
        sideMirrorTarget.setSize(Math.round(profile.mirrorWidth*1.25),Math.round(profile.mirrorWidth*1.25/2.65));
        sun.shadow.mapSize.set(profile.shadowSize,profile.shadowSize);sun.shadow.map?.dispose();sun.shadow.map=null;renderer.shadowMap.needsUpdate=true;
        resolutionSampler.reset(performance.now());
      }
      const framePacing = resolutionSampler.sample(performance.now(), quality==='auto' && !isPausedRef.current && !document.hidden);
      if (framePacing !== null) {
        const next=nextResolution(dynamicDpr,framePacing,profile.floor,profile.ceiling);
        if(Math.abs(next-dynamicDpr)>=.025){dynamicDpr=next;renderer.setPixelRatio(next);renderer.setSize(window.innerWidth,window.innerHeight,false);}
      }
      retainedQuality.current={quality,dpr:dynamicDpr};
      renderer.domElement.dataset.renderDpr=dynamicDpr.toFixed(2);

      // Only the occupied floor is submitted; decks at the same XY must not
      // cover the view from an external inspection camera on a lower level.
      if (built.streamingChunks) {
        const floor=garageFloorAt(car.roadHeight ?? -48);
        for(const [key,chunk] of built.streamingChunks){
          const visible=key===`garage-floor-${floor}`;
          if(visible && !chunk.parent)scene.add(chunk);
          else if(!visible && chunk.parent)scene.remove(chunk);
        }
        if(built.ceilingGroup){
          built.ceilingGroup.children.forEach(n=>n.visible=n.userData.floor===floor);
          built.ceilingGroup.visible=cameraViewRef.current==='HOOD';
        }
        scene.children.forEach(n=>{if(n.userData.garageRamp!==undefined){
          const upper=n.userData.garageRamp as number;
          n.visible=(car.roadHeight??-48)<=GARAGE_LEVELS[upper]+2 && (car.roadHeight??-48)>=GARAGE_LEVELS[upper+1]-2;
          n.children.forEach(c=>{if(c.userData.garageCeiling)c.visible=cameraViewRef.current==='HOOD';});
        }});
      }

      const cc = CAR_MODELS[currentCarIdRef.current];
      const baseSettings=settingsRef.current;
      const sCur={...baseSettings,volume:baseSettings.volume*(cameraViewRef.current==='HOOD'?(baseSettings.cabinVolume??.7):(baseSettings.exteriorVolume??.85))};
      const ldCur = levelDataRef.current;
      const playerParts = built.playerCarParts;
      damageModel ??= new VehicleDamage(playerParts.group);
      const axleGeometry = playerParts.group.userData.axleGeometry;
      const rigWheelbase = axleGeometry?.wheelbase ?? cc.wheelbase;
      const rearAxleOffset = axleGeometry?.rearOffset ?? cc.wheelbase / 2;
      const rigHalfTrack = axleGeometry?.halfTrack ?? cc.width * 0.46;

      // This is a render-only diagnostic toggle. Physics, collisions and the
      // complete wheel rig remain untouched, and switching it never rebuilds
      // the scene or resets the camera.
      const showVehicleBody = !sCur.hideVehicleBody;
      const firstPersonView = !destroyed && !rollover && cameraViewRef.current === 'HOOD';
      playerParts.group.visible=!destroyed;
      // HOOD uses the real paint shell filtered into a frame clone. The solid
      // outer paint is hidden in this pass (its DoubleSide underside was the
      // white slab), while the real glass primitive stays visible and is made
      // translucent. Mirrors/external/overview use the untouched full model.
      let lastGlassFirstPerson: boolean | null = null;
      const setGlassMode = (firstPerson: boolean) => {
        if (lastGlassFirstPerson === firstPerson) return;
        lastGlassFirstPerson = firstPerson;
        playerGlassMaterialStates.forEach(record => {
          const physical = record.material as THREE.MeshPhysicalMaterial & { transmission?: number };
          record.material.visible = record.visible;
          const transparent = firstPerson ? true : record.transparent;
          const recompile = record.material.transparent !== transparent || (record.transmission !== undefined
            && (physical.transmission! > 0) !== (!firstPerson && record.transmission > 0));
          record.material.transparent = transparent;
          (record.material as THREE.Material & { opacity: number }).opacity = firstPerson ? 0.16 : record.opacity;
          record.material.depthWrite = firstPerson ? false : record.depthWrite;
          // KHR_materials_transmission on Concept Glass otherwise keeps a
          // scene transmission target alive across camera switches and can
          // ghost red paint into the cabin. Use neutral alpha in HOOD.
          if (record.transmission !== undefined) {
            physical.transmission = firstPerson ? 0 : record.transmission;
          }
          if (recompile) record.material.needsUpdate = true;
        });
      };
      const setFirstPersonBody = (firstPerson: boolean) => {
        if (playerParts.nativeCockpit) {
          playerPaintMaterialStates.forEach(record => { record.material.visible = showVehicleBody; });
          playerBodyMeshes.forEach(node => { node.visible = showVehicleBody && !(firstPerson && /InteriorRearViewMirror|RoofLidar/i.test(node.name)); });
          playerBodyRigRoots.forEach(root => { root.visible = showVehicleBody; });
          setGlassMode(firstPerson);
          return;
        }

        // SUV body is one multi-material mesh with white paint + glass. Hide
        // the paint materials, not the whole node, so its real side glass stays.
        playerPaintMaterialStates.forEach(record => {
          record.material.visible = showVehicleBody && !firstPerson;
        });
        playerPaintBodyMeshes.forEach(node => { node.visible = showVehicleBody; });
        // Concept GT's authored interior is not used by the first-person rig
        // and contributes many draw calls while hidden behind tinted glass.
        playerInteriorMeshes.forEach(node => {
          node.visible = showVehicleBody && currentCarIdRef.current !== CarType.SPORTS;
        });
        playerGlassMeshes.forEach(node => { node.visible = showVehicleBody; });
        playerBodyRigRoots.forEach(root => {
          const isModelWheel = root.userData?.partRole === 'steering-wheel-pivot';
          root.visible = showVehicleBody && !(firstPerson && isModelWheel);
        });
        // The Concept shell's raw windshield/door triangles fragment the view.
        // Use the generic interior + translucent glass, not a transparent car.
        if (firstPersonBodyFrame) firstPersonBodyFrame.visible = showVehicleBody && firstPerson;
        setGlassMode(firstPerson);
      };
      setFirstPersonBody(firstPersonView);
      // Wheels are separate from the body mesh array. They are the two black
      // bumps that used to intrude into the driver-eye view; hide the complete
      // wheel assemblies here and restore them for every auxiliary pass.
      playerParts.wheelMounts.forEach(mount => { mount.visible = !firstPersonView; });
      playerParts.wheels.forEach(wheel => { wheel.visible = !firstPersonView; });
      if (driverInterior) {
        driverInterior.group.visible = firstPersonView;
        driverInterior.steeringWheel.visible = firstPersonView;
        driverInterior.steeringWheel.rotation.z = driverWheelRotationZ(inputRef.current.steeringWheelAngle);
      }

      // Keep the authored glass visible; the cutout already opens the centre
      // of the windscreen, while side glass/door frames remain for head turns.

      // 车轮透视：车身变为 30% 不透明度，随时开关、随时还原。
      // 玻璃等原本就透明的材质会记住自己的参数，关闭时原样恢复。
      const ghostBody = sCur.wheelGhost;
      if (ghostBody !== lastGhostBody) {
        lastGhostBody = ghostBody;
        playerBodyMaterialStates.forEach(rec => {
          rec.material.transparent = ghostBody ? true : rec.transparent;
          (rec.material as THREE.Material & { opacity: number }).opacity = ghostBody ? 0.3 : rec.opacity;
          rec.material.depthWrite = ghostBody ? false : rec.depthWrite;
          rec.material.needsUpdate = true;
        });
      }

      // 光影效果：实时阴影总开关（默认关；开启后阴影投向地面与相邻物体）
      if (sun.castShadow !== sCur.shadowsEnabled) {
        sun.castShadow = sCur.shadowsEnabled;
        renderer.shadowMap.needsUpdate = sCur.shadowsEnabled;
      }

      // 天气/时间 变化检测
      if (weatherRef.current !== lastWeather || dayTimeRef.current !== lastDayTime) {
        lastWeather = weatherRef.current;
        lastDayTime = dayTimeRef.current;
        applyWeather();
      }

      const paused = isPausedRef.current;
      setRecordingAudioPaused(paused);
      if (paused) {
        // Opening settings is an actual simulation pause: freeze the pose,
        // wheels, physics bodies, timers, camera and weather, and fade the
        // engine/tyre sounds out. Reset the clock every frame so closing the
        // panel never catches up on the paused wall-clock time.
        lastPhysicsNow = performance.now();
        throttleState.current = 0;
        launchBlend = 0;
        const now = audioContextRef.current?.currentTime;
        setRecordingAudioPaused(true);
        if(now !== undefined) [engineNodesRef.current?.gain,tireNoiseRef.current?.gain,gravelNoiseRef.current?.gain,windNoiseRef.current?.gain,skidNoiseRef.current?.gain].forEach(g=>g?.gain.setTargetAtTime(0,now,0.05));
      }
      if (!paused) {
        // 1. 真实动力总成 + 转向运动学（场景车辆不再自动行驶）
        const physicsNow = performance.now();
        const rawFrameDelta = physicsNow - lastPhysicsNow;
        lastPhysicsNow = physicsNow;
        // No catch-up after a tab hide or a long hitch: a gap over 250 ms is
        // skipped instead of integrated as one large position jump.
        const frameDelta = simulationDeltaMs(rawFrameDelta, false);
        // 60 Hz frame units. No 0.2/2.5 clamp: slow frames are sub-stepped by
        // stepLongitudinal() and the pose integration is time-scaled exactly.
        const frameScale = elapsedFramesFromMs(frameDelta);
        carSpeedRef.current = car.speed;
        if (frameDelta > 0) {
        simulationClockMs += frameDelta;
        const currentInputReal = (destroyed || rollover) ? {...inputRef.current,throttle:0,gasPressed:false,brake:1,handbrake:true,engineStarted:false} : inputRef.current;
        if(destroyed || rollover){car.speed=0;throttleState.current=0;}
        if(lastSuspensionReset!==suspensionResetRef.current){
          damageModel?.reset();looseDebris.splice(0).forEach(d=>d.dispose());setDamageTier('none');
          impactMotion.time=0;directionChangeActive=false;Object.assign(lateralState,createLateralState());damage=0;setDamagePercent(0);impactReadout={closing:0,yaw:0,speedAfter:0,obstacle:'—'};
          if(wreck){wreck.dispose();wreck=null;}destroyed=false;setWrecked(false);
          rollover?.dispose();rollover=null;setOverturned(false);chassisState=createChassisState();
          recoveryPose={x:car.x,y:car.y,rotation:car.rotation,roadHeight:car.roadHeight};recoveryCandidate={...recoveryPose};accidentRecoveryPose={...recoveryPose};lastRecoveryAt=simulationClockMs;
        }
        const pt = getPowertrain(cc.id);
        const vehicleTune = settingsRef.current.vehicleTuning?.[cc.id] ?? DEFAULT_VEHICLE_TUNING[cc.id];
        const wCur = weatherRef.current;
        const terrainResponse = ldCur.openWorld ? worldSurface(car.x, car.y) : {grip:1,rolling:1,gravel:false};
        const weatherGrip = (wCur === WeatherType.RAINY ? 0.62 : wCur === WeatherType.SNOWY ? 0.38 : 1) * terrainResponse.grip;

        // —— 换挡选择：离合衔接进度由固定步进纵向模型推进 ——
        if (currentInputReal.gear !== selectedGear) {
          directionChangeActive=currentInputReal.gear!==0&&car.speed*Math.sign(currentInputReal.gear)<-.12;
          selectedGear = currentInputReal.gear;
          shiftProgress = 0;
        }
        const tunedShiftFrames = Math.max(4, pt.shiftFrames * vehicleTune.shiftTimeScale);

        // Per-car mechanical steering ratio and lock. Speed influences rack
        // response and tyre grip, without changing the wheel-to-rack ratio.
        const normalizedSpeed = Math.min(1, Math.abs(car.speed) / Math.max(0.1, cc.maxSpeed));
        const dbg = settingsRef.current.debugPhysics;
        const dbgOn = !!dbg?.enabled;
        const maxSteerMult = (dbgOn ? dbg!.maxSteerMultiplier : 1) * vehicleTune.steerLockScale;
        const carMaxSteer = (cc.dynamics.maxSteerAngle ?? MAX_STEER_ANGLE) * maxSteerMult;
        const wheelMaxDeg = steeringWheelMaxDeg(cc);

        // —— 转向指示器声音：检测方向盘跨越半圈过渡 ——
        const steerProgress = wheelMaxDeg > 0
          ? Math.abs(currentInputReal.steeringWheelAngle) / wheelMaxDeg
          : 0;
        // 打入（角度增大）：1→2 咔哒，2→3 滴滴
        if (prevSteerProgress < 0.38 && steerProgress >= 0.38) playSteeringClick();
        if (prevSteerProgress < 0.73 && steerProgress >= 0.73) playSteeringBeep();
        // 回正（角度减小）：3→2 咔哒，2→1 呲呲
        if (prevSteerProgress >= 0.73 && steerProgress < 0.73) playSteeringClick();
        if (prevSteerProgress >= 0.38 && steerProgress < 0.38) playSteeringHiss();
        prevSteerProgress = steerProgress;
        // Fixed rack ratio: assistance changes effort, not the mechanical angle.
        const targetSteerAngle = THREE.MathUtils.clamp(
          THREE.MathUtils.degToRad(currentInputReal.steeringWheelAngle) / cc.dynamics.steeringRatio,
          -carMaxSteer, carMaxSteer,
        );
        // 前轮转速率限制（转向系惯性）：皮卡更慵懒，跑车更跟手。
        const steerLerp = THREE.MathUtils.clamp(
          THREE.MathUtils.lerp(0.22, 0.085, normalizedSpeed) * cc.dynamics.steerResponse * vehicleTune.steerResponseScale,
          0.02, 0.5,
        );
        car.steeringAngle = approachExponential(car.steeringAngle, targetSteerAngle, steerLerp, frameScale);
        // Clamp to the car's real steering lock so the lagged value can never
        // overshoot the Ackermann geometry the guide and tyre visuals use.
        car.steeringAngle = THREE.MathUtils.clamp(car.steeringAngle, -carMaxSteer, carMaxSteer);

        // Gravity follows the visible hill profile. The longitudinal model
        // applies it after braking and can hold the car still with either the
        // foot brake or the handbrake when the brake force exceeds the grade.
        const slope = sampleSlope(ldCur, car.x, car.y, car.rotation, car.roadHeight);
        car.roadHeight = slope.height;
        const forwardXBeforeMove = Math.cos(car.rotation);
        const forwardYBeforeMove = Math.sin(car.rotation);
        const slopeAlongCar = slope.gradeX * forwardXBeforeMove + slope.gradeY * forwardYBeforeMove;

        const frameStartSpeed = car.speed;
        const longResult = stepLongitudinal(
          {
            speed: car.speed,
            throttle: throttleState.current,
            brakePedal,
            shiftProgress,
            overRevBlend,
            ignitionBlend,
            launchBlend,
            prevLongAccelMs2,
            pendingFrames: longitudinalPendingFrames,
            holdFrames: longitudinalHoldFrames,
            stallTimer: longitudinalStallTimer,
          },
          {
            gear: currentInputReal.gear,
            engineStarted: currentInputReal.engineStarted,
            gasPressed: currentInputReal.gasPressed,
            shiftPressed: !!currentInputReal.shiftPressed,
            throttle: currentInputReal.throttle,
            brake: currentInputReal.brake,
            handbrake: currentInputReal.handbrake,
            absEnabled: settingsRef.current.absEnabled !== false,
            reverseAssist:directionChangeActive,
          },
          {
            carId: cc.id,
            cc,
            pt,
            vehicleTune,
            weatherGrip,
            rollingResistanceScale: terrainResponse.rolling,
            slopeAlongCar,
            tunedShiftFrames,
            elapsedFrames: frameScale,
          },
        );
        car.speed = airborneActive ? frameStartSpeed : longResult.speed;
        if(car.speed*Math.sign(currentInputReal.gear)>=-.015)directionChangeActive=false;
        throttleState.current = longResult.throttle;
        brakePedal = longResult.brakePedal;
        shiftProgress = longResult.shiftProgress;
        overRevBlend = longResult.overRevBlend;
        ignitionBlend = longResult.ignitionBlend;
        launchBlend = longResult.launchBlend;
        prevLongAccelMs2 = longResult.prevLongAccelMs2;
        lastMotorDriveForce=driveForceForAudio(lastMotorDriveForce,airborneActive ? 0 : longResult.engineForce,longitudinalPendingFrames,frameScale);
        longitudinalPendingFrames = longResult.pendingFrames;
        longitudinalHoldFrames = longResult.holdFrames;
        longitudinalStallTimer = longResult.stallTimer;
        if (longResult.stalled) {
          // Ask App to switch the ignition off exactly once. The HUD receives
          // the same event and explains N/1 + B instead of silently locking.
          window.dispatchEvent(new CustomEvent('engine-stalled', {
            detail: {
              gear: currentInputReal.gear,
              speedKmh: Math.abs(car.speed) * SPEED_UNIT_KMH,
            },
          }));
        }
        const brakeForce = longResult.brakeForce;
        const emergencyBraking = longResult.emergencyBraking;
        const longitudinalAcceleration = longResult.longitudinalAcceleration;
        // Distance uses the average speed over the render interval rather than
        // the final speed only. Accelerating/braking then covers the same
        // distance at 30/60/120 fps instead of overshooting at low frame rates.
        let frameTravelSpeed = (frameStartSpeed + car.speed) * 0.5;

        const previousPose = {
          x: car.x, y: car.y, rotation: car.rotation,
          yawRate: car.yawRate, slipAngle: car.slipAngle,
        };
        // updateTraffic(frameDelta); // round 6: all NPCs are static
        // Use the authored wheel centres for both the rack geometry and body arc.
        const halfTrack = rigHalfTrack;

        // Road-wheel angle and actual path curvature are not identical once
        // speed builds. Tyre slip produces a mild, stable understeer gradient;
        // drivetrain layout changes how throttle affects it. At parking speed
        // the factor tends to 1, preserving exact Ackermann manoeuvring.
        const speedMs = Math.abs(car.speed) * SPEED_UNIT_KMH / 3.6;
        const requestedRearSteer = rearSteerAngleForSpeed(cc.dynamics.rearSteerMaxDeg, car.speed, car.steeringAngle, carMaxSteer);
        const rearSteerAngle = limitRearAxleSteer(car.steeringAngle, requestedRearSteer, rigWheelbase, halfTrack,
          (cc.dynamics.rearSteerMaxDeg ?? 0) * Math.PI / 180);
        // All four knuckles point at one common ICR. Rear steering therefore
        // uses its own left/right angles, not a shared visual animation angle.
        const fourAngles = fourWheelAckermannAngles(car.steeringAngle, rearSteerAngle, rigWheelbase, halfTrack);
        playerParts.frontWheels.forEach(w => {
          const side = Number(w.userData.vehicleSideX ?? w.position.x);
          w.rotation.y = side > 0 ? -fourAngles.frontLeft : -fourAngles.frontRight;
        });
        // Rear steering acts on the steer-knuckle (wheelMount), not on the
        // tyre roll node. frontWheels are mounts, wheels are roll pivots.
        playerParts.wheelMounts.forEach((mount, index) => {
          if (index < playerParts.frontWheels.length) return;
          const side = Number(mount.userData.vehicleSideX ?? mount.position.x);
          mount.rotation.y = side > 0 ? -fourAngles.rearLeft : -fourAngles.rearRight;
        });
        const rigWheels:RigWheel[]=playerParts.wheelMounts.map((mount,i)=>({
          x:mount.position.x,y:wheelBaseY[i],z:wheelBaseZ[i],
          radius:Number(playerParts.wheels[i]?.userData.wheelRadius)||cc.dynamics.transmission.wheelRadiusM*10,
          halfWidth:Number(playerParts.wheels[i]?.userData.wheelWidth)/2||cc.width*.065,steer:mount.rotation.y}));
        const worldAxis=(a:THREE.Vector3)=>({x:Math.sin(car.rotation)*a.x+Math.cos(car.rotation)*a.z,
          y:a.y,z:-Math.cos(car.rotation)*a.x+Math.sin(car.rotation)*a.z});
        const contactWheels: WheelShape[] = rigWheels.map((w,i)=>{
          const p=hubPose(w,chassisState.offsets[i]??0,chassisRotation(chassisState.pitch,chassisState.roll));
          return {x:p.hub.x,z:p.hub.z,radius:w.radius,halfWidth:w.halfWidth,steer:-w.steer,axis:worldAxis(p.axle)};
        });
        if (playerParts.updateCollisionFootprint) {
          playerParts.group.userData.collisionFootprint = playerParts.updateCollisionFootprint();
        }


        const lateral=stepLateral(lateralState,{speed:car.speed*SPEED_UNIT_KMH/3.6,
          steer:car.steeringAngle,rearSteer:rearSteerAngle,wheelbase:rigWheelbase/10,rearOffset:rearAxleOffset/10,
          frontBias:cc.dynamics.frontWeightBias,grip:cc.dynamics.grip*weatherGrip,layout:cc.dynamics.driveLayout,
          throttle:throttleState.current,handbrake:currentInputReal.handbrake,frontLocked:longResult.frontLocked,
          dt:frameDelta/1000,understeer:cc.dynamics.understeerGradient*vehicleTune.understeerScale});
        if(!airborneActive){
          car.speed=Math.sign(car.speed)*Math.max(0,Math.abs(car.speed)-lateral.scrubAccel*(frameDelta/1000)/(SPEED_UNIT_KMH/3.6));
          car.driftSlip=-lateral.beta;
        }
        const motionSteerAngle=Math.atan(lateral.yawRate*rigWheelbase/Math.max(.01,speedMs*10));

        if (Math.abs(frameTravelSpeed) > 0.0001) {
          const speedToMps=SPEED_UNIT_KMH/3.6;
          const dt=frameDelta/1000;
          const pose = resolveCurbMotion(car,frameStartSpeed*speedToMps,car.speed*speedToMps,
            dt,cc.weight,contactWheels,
            !airborneActive && (car.roadHeight ?? 0)<3 ? ldCur.curbSegments ?? [] : [],
            (p,d)=> {
              if(airborneActive)return {x:p.x+Math.cos(airborneHeading)*d,y:p.y+Math.sin(airborneHeading)*d,rotation:p.rotation};
              const turn=lateral.yawRate*dt*(Math.abs(d)/Math.max(.001,Math.abs((frameStartSpeed+car.speed)/2)*speedToMps*10*dt));
              return advanceLateralPose(p.x,p.y,p.rotation,d,lateral.beta,turn);
            });
          tyreLateralG=airborneActive?0:lateral.lateralG;
          car.speed=pose.speedMps/speedToMps;
          frameTravelSpeed=pose.distance/Math.max(1e-6,TRAVEL_PER_SPEED_FRAME*frameScale);
          const bodyHeading=pose.rotation;
          car.yawRate = (bodyHeading - car.rotation) / frameScale;
          car.x = pose.x;
          car.y = pose.y;
          car.rotation = bodyHeading;
          car.slipAngle = lateral.frontSlip;
        } else {
          tyreLateralG=0;
          car.speed = 0;
          car.yawRate *= Math.pow(0.72, frameScale);
          car.slipAngle = 0;
          car.driftSlip *= 0.5;
        }
        if(impactMotion.time>0 && !destroyed && !rollover){
          const dt=frameDelta/1000;
          const yawStep=impactMotion.yaw*dt;
          car.rotation=previousPose.rotation+yawStep;
          car.yawRate=impactMotion.yaw/60;
          const targetSpeed=car.speed*SPEED_UNIT_KMH/3.6*10;
          const recover=impactMotion.time>2.1?0:1-Math.exp(-dt*.75),drag=Math.exp(-dt*(currentInputReal.brake*5+.18));
          impactMotion.x=(impactMotion.x+(Math.cos(car.rotation)*targetSpeed-impactMotion.x)*recover)*drag;
          impactMotion.y=(impactMotion.y+(Math.sin(car.rotation)*targetSpeed-impactMotion.y)*recover)*drag;
          car.x=previousPose.x+impactMotion.x*dt;car.y=previousPose.y+impactMotion.y*dt;
          car.speed=(impactMotion.x*Math.cos(car.rotation)+impactMotion.y*Math.sin(car.rotation))/(SPEED_UNIT_KMH/3.6*10);
          impactMotion.yaw*=Math.exp(-dt*1.8);impactMotion.time=Math.max(0,impactMotion.time-dt);
        }
        if(destroyed || rollover){car.x=previousPose.x;car.y=previousPose.y;car.rotation=previousPose.rotation;car.speed=0;}
        // Body pitch responds to accepted motion, including obstacle losses.
        // Keep the drivetrain's own acceleration state separate from impacts.
        const actualLongAccel=(car.speed-frameStartSpeed)*(SPEED_UNIT_KMH/3.6)/Math.max(.001,frameDelta/1000);
        filteredLongAccelG=filterLongitudinalAccel(filteredLongAccelG,actualLongAccel/9.80665,frameScale);

        // Push live readouts to the tuning panel. Always dispatched, throttled
        // inside the listener; no per-frame console output.
        const probe = frameProbeRef.current;
        if (!probe.initialized) {
          probe.lastX = car.x; probe.lastY = car.y; probe.lastSpeed = frameTravelSpeed;
          probe.initialized = true;
        } else {
          probe.positionStepMax = Math.max(probe.positionStepMax, Math.hypot(car.x - probe.lastX, car.y - probe.lastY));
          probe.speedStepMax = Math.max(probe.speedStepMax, Math.abs(frameTravelSpeed - probe.lastSpeed));
          probe.lastX = car.x; probe.lastY = car.y; probe.lastSpeed = frameTravelSpeed;
        }
        probe.intervals.push(frameDelta);
        if (probe.intervals.length > 120) probe.intervals.shift();

        // by dbgOn) so the in-game floating panel shows live data even when
        // the settings debug overlay is closed. Throttle to ~30 Hz to keep the
        // React side cheap; the panel ignores stale frames.
        if (collisionDebugEnabledRef.current && simulationClockMs - collisionDebugAt > 120) {
          collisionDebugAt = simulationClockMs;
          buildCollisionDebug({
            x: car.x, y: car.y, length: cc.length, width: cc.width,
            footprint: playerParts.group.userData.collisionFootprint,
            rotation: car.rotation, elevation: car.roadHeight,
          });
        }
        {
          const now = simulationClockMs;
          if (now - lastDebugReadoutAt.current > 33) {
            lastDebugReadoutAt.current = now;
            const sortedIntervals = [...probe.intervals].sort((a, b) => a - b);
            const p95 = sortedIntervals.length ? sortedIntervals[Math.min(sortedIntervals.length - 1, Math.floor(sortedIntervals.length * 0.95))] : 0;
            const frameAvg = sortedIntervals.length ? sortedIntervals.reduce((a, b) => a + b, 0) / sortedIntervals.length : 0;
            const positionStepMax = probe.positionStepMax;
            const speedStepMax = probe.speedStepMax;
            const audioStatus = getRecordingAudioStatus();
            probe.positionStepMax = 0;
            probe.speedStepMax = 0;
            const δ = motionSteerAngle;
            const tanδ = Math.tan(δ);
            const R = Math.abs(tanδ) < 0.001 ? Infinity : rigWheelbase / tanδ;
            const effectiveRlive = R;
            const accelG = (prevLongAccelMs2 / 9.80665);
            const speedKmh = Math.abs(car.speed) * SPEED_UNIT_KMH;
            window.dispatchEvent(new CustomEvent('physics-debug-readout', {
              detail: {
                yawRate: car.yawRate*60,
                slipAngle: car.slipAngle,
                driftSlip: car.driftSlip,
                turnRadius: Math.abs(effectiveRlive) < 1 ? Infinity : effectiveRlive,
                steeringAngleDeg: car.steeringAngle * 180 / Math.PI,
                effectiveSteeringAngleDeg: motionSteerAngle * 180 / Math.PI,
                steeringWheelDeg: currentInputReal.steeringWheelAngle,
                speed: car.speed,
                speedKmh,
                rpm: Math.round(simulatedEngineRpm),
                gear: currentInputReal.gear,
                accelG,
                filteredAccelG: filteredLongAccelG,
                throttleActual: throttleState.current,
                brakeActual: brakePedal,
                brakeLocks: `${longResult.frontLocked?'抱死':'滚动'} / ${longResult.rearLocked?'抱死':'滚动'} · ABS ${settingsRef.current.absEnabled===false?'OFF':longResult.absActive?'工作':'ON'}`,

                dynamicPitchDeg: THREE.MathUtils.radToDeg(suspensionPitch),
                rearSteerDeg: THREE.MathUtils.radToDeg(rearSteerAngle),
                surfaceHeight: suspensionTelemetryRef.current.terrainHeight,
                npcStatic: built?.staticCarCount ?? 0,
                lateralG:tyreLateralG,
                shiftProgress,
                steerWheelMaxDeg: pt.steerWheelMaxDeg,
                wheelbase: rigWheelbase,
                halfTrack: rigHalfTrack,
                rearAxleOffset,
                terrainHeight: suspensionTelemetryRef.current.terrainHeight,
                bodyHeave: suspensionTelemetryRef.current.bodyHeave,
                bodyPitchDeg: suspensionTelemetryRef.current.bodyPitchDeg,
                bodyRollDeg: suspensionTelemetryRef.current.bodyRollDeg,
                wheelTravel: [...suspensionTelemetryRef.current.wheelTravel],
                wheelContacts: [...suspensionTelemetryRef.current.wheelContacts],
                wheelGrounded: [...suspensionTelemetryRef.current.wheelGrounded],
                wheelGap: [...suspensionTelemetryRef.current.wheelGap],
                surface: ldCur.openWorld && car.x>=8500 ? worldSurface(car.x,car.y).kind : suspensionTelemetryRef.current.surface,
                carId: cc.id,
                simulationSeconds:simulationClockMs/1000,
                driverReaction:wreck?.reaction?.phase??(destroyed?'飞出 / 落地':rollover?'翻滚':'驾驶中'),
                gpuResources:`${renderer.info.memory.geometries} / ${renderer.info.memory.textures} / ${renderer.info.programs?.length??0}`,
                cpuMs:`${simulationCpuMs.toFixed(1)} / ${renderCpuMs.toFixed(1)} ms`,
                frameAvgMs: frameAvg,
                frameP95Ms: p95,
                positionStepMax,
                speedStepMax,
                audioReady: audioStatus.ready,
                audioLoaded: audioStatus.loaded,
                audioTotal: audioStatus.total,
                audioFailed: audioStatus.failed.join(','),
                audioActive: audioStatus.active,
                audioMix:audioMixReadout,
                driverHeadOffset:[driverMotion.x.p*10,driverMotion.y.p*10,driverMotion.z.p*10],
                impactReadout,
              },
            }));
          }
        }

        // Skid / audio threshold. With pure Ackermann there is no
        // understeer/oversteer state to read, so the trigger is a simple
        // geometry-based demand: how hard is the car being asked to rotate
        // while moving. emergencyBraking still flags tyre-lock slides.
        const stabilitySlip = Math.min(
          1,
          (Math.abs(car.yawRate) * Math.abs(car.speed)) / Math.max(1, rigWheelbase),
        );

        // Reject movement through parked cars and solid scenery. Cannon is
        // still used for impacts and movable props, but the player car is
        // kinematic, so its accepted pose must be validated here as well.
        const collisionBody: VehicleCollider = {
          x: car.x, y: car.y,
          // Match the painted body shell, not the wheel-centre rectangle.
          // The old 0.91 length left several visible pixels of both bonnets
          // overlapping before a head-on contact was reported.
          length: cc.length,
          width: cc.width,
          footprint: playerParts.group.userData.collisionFootprint,
          rotation: car.rotation,
          elevation: airborneActive ? suspensionBodyHeight ?? car.roadHeight : car.roadHeight,
          verticalHeight: cc.height,
        };
        const boundaryPoints = getVehicleBoundaryPoints(collisionBody);
        const outsideMap = boundaryPoints.some(p =>
          p.x < 0 || p.y < 0 || p.x > ldCur.mapWidth || p.y > ldCur.mapHeight
        );
        const solidHitsAt = (x: number, y: number, rotation: number) => {
          const bodyAtPose = { ...collisionBody, x, y, rotation };
          const hits = new Set<string>();
          // The static collision grid is not rebuilt every frame, so active
          // NPC cars are merged in by their live positions. Without this, a
          // moving NPC could be missed by the player's kinematic collision.
          const candidates = new Map<string, Obstacle>();
          nearbyCollisionObstacles(x, y).forEach(obs => candidates.set(obs.id, obs));
          built?.trafficObstacles.forEach(obs => {
            if (Math.abs(obs.x - x) < 180 && Math.abs(obs.y - y) < 180) candidates.set(obs.id, obs);
          });
          candidates.forEach(obs => {
            // Height layers are explicit; direction/angle is never used to
            // guess whether an overpass barrier belongs to this layer.
            if (!vehicleLayersCompatible(bodyAtPose, obs)) return;
            const hit = (obs.type === 'car' || obs.collisionFootprint?.length)
              ? checkVehicleCollision(bodyAtPose, {
                  x: obs.x, y: obs.y,
                  length: obs.height,
                  width: obs.width,
                  rotation: obs.rotation,
                  footprint: obs.collisionFootprint,
                  elevation: obs.elevation,
                })
              : checkVehicleRectCollision(bodyAtPose, {
                  x: obs.x, y: obs.y,
                  width: obs.width,
                  height: obs.height,
                  rotation: obs.rotation,
                });
            if (hit) hits.add(obs.id);
          });
          return hits;
        };
        const previousHits = solidHitsAt(previousPose.x, previousPose.y, previousPose.rotation);
        const nextHits = solidHitsAt(car.x, car.y, car.rotation);
        // If a level ever starts a large vehicle slightly intersecting a prop,
        // let it escape; only reject collisions newly entered this frame.
        const newHitIds = Array.from(nextHits).filter(id => !previousHits.has(id));
        const hitSolid = newHitIds.length > 0;
        if (outsideMap || hitSolid) {
          const impactSpeed = Math.abs(car.speed);
          const motionX = car.x - previousPose.x;
          const motionY = car.y - previousPose.y;
          const motionLength = Math.hypot(motionX, motionY);
          const travelSign = car.speed < 0 ? -1 : 1;
          const impactTravelDirection = motionLength > 1e-5
            ? { x: motionX / motionLength, y: motionY / motionLength }
            : {
                x: Math.cos(previousPose.rotation) * travelSign,
                y: Math.sin(previousPose.rotation) * travelSign,
              };

          const contactNormals: Vector2[] = [];
          boundaryPoints.forEach(point => {
            if (point.x < 0) contactNormals.push({ x: 1, y: 0 });
            else if (point.x > ldCur.mapWidth) contactNormals.push({ x: -1, y: 0 });
            if (point.y < 0) contactNormals.push({ x: 0, y: 1 });
            else if (point.y > ldCur.mapHeight) contactNormals.push({ x: 0, y: -1 });
          });
          newHitIds.forEach(id => {
            const obstacle = obstacleById.get(id);
            if (!obstacle) return;
            const outline=(obstacle.type==='car'||obstacle.collisionFootprint?.length)
              ? getVehicleBoundaryPoints({x:obstacle.x,y:obstacle.y,length:obstacle.height,width:obstacle.width,rotation:obstacle.rotation,footprint:obstacle.collisionFootprint})
              : getRectCorners(obstacle);
            contactNormals.push(getConvexContactNormal(collisionBody,outline));
          });

          // Select the contact carrying the largest normal component. A value
          // near 1 is a frontal impact; a value near 0 is a side scrape.
          let contactNormal = contactNormals[0] || { x: -impactTravelDirection.x, y: -impactTravelDirection.y };
          let normalAlignment = Math.abs(
            impactTravelDirection.x * contactNormal.x + impactTravelDirection.y * contactNormal.y,
          );
          contactNormals.slice(1).forEach(normal => {
            const alignment = Math.abs(impactTravelDirection.x * normal.x + impactTravelDirection.y * normal.y);
            if (alignment > normalAlignment) {
              contactNormal = normal;
              normalAlignment = alignment;
            }
          });

          const dt=frameDelta/1000;
          const incoming={x:motionX/dt/10,y:motionY/dt/10};
          const arm=impactContactArm(boundaryPoints,{x:car.x,y:car.y},contactNormal);
          const response=solveVehicleImpact(incoming,contactNormal,arm,cc.length/10,cc.width/10,impactMotion.yaw);
          if(response.closing>.15) impactReadout={closing:response.closing*3.6,yaw:response.yawRate,speedAfter:Math.hypot(response.velocity.x,response.velocity.y)*3.6,obstacle:newHitIds[0]??'boundary'};
          // Return to the last accepted pose and separate outwards. Subsequent
          // frames carry the reflected world velocity, not just a reduced speed.
          car.x=previousPose.x;car.y=previousPose.y;car.rotation=previousPose.rotation;
          for(const separation of [.35,.18,.05]){
            const x=previousPose.x+contactNormal.x*separation,y=previousPose.y+contactNormal.y*separation;
            if(![...solidHitsAt(x,y,car.rotation)].some(id=>!previousHits.has(id))){car.x=x;car.y=y;break;}
          }
          impactMotion.x=response.velocity.x*10;impactMotion.y=response.velocity.y*10;
          impactMotion.yaw=response.yawRate;if(response.closing>.025)impactMotion.time=2.5;
          car.speed=(response.velocity.x*Math.cos(car.rotation)+response.velocity.y*Math.sin(car.rotation))/(SPEED_UNIT_KMH/3.6);
          car.driftSlip=0;Object.assign(lateralState,createLateralState());
          if(response.closing>2 && simulationClockMs-lastDamageAt>650 && !destroyed && !rollover){
            accidentRecoveryPose={...recoveryPose};
            damage=Math.min(1,damage+response.damage);lastDamageAt=simulationClockMs;setDamagePercent(Math.round(damage*100));
            setDamageTier(previous=>previous==='moderate'&&response.tier==='light'?previous:response.tier);
            if(!response.catastrophic){
              const contact=new THREE.Vector3(car.x+arm.x*10,playerParts.group.position.y+cc.height*.42,car.y+arm.y*10);
              const pieces=damageModel!.apply(response.tier,contact,new THREE.Vector3(contactNormal.x,0,contactNormal.y),response.closing);
              if(pieces.length){
                const debris=new CrashDebris(playerParts.group,{x:incoming.x*10,y:incoming.y*10},car.rotation,ldCur.obstacles,
                  (x,z,height)=>sampleTerrainSurface(ldCur,x,z,height).height,contactNormal,{looseParts:pieces,yawRate:impactMotion.yaw,bounds:{width:ldCur.mapWidth,height:ldCur.mapHeight}});
                looseDebris.push(debris);scene.add(debris.group);
                if(looseDebris.length>6)looseDebris.shift()!.dispose();
              }
            }
            if(response.catastrophic){
              // Capture the complete exterior even when impact occurs in the cabin.
              setFirstPersonBody(false);playerParts.wheels.forEach(w=>w.visible=true);playerParts.wheelMounts.forEach(w=>w.visible=true);
              wreck=new CrashDebris(playerParts.group,{x:incoming.x*10,y:incoming.y*10},car.rotation,ldCur.obstacles,
                (x,z,height)=>sampleTerrainSurface(ldCur,x,z,height).height,contactNormal,{yawRate:impactMotion.yaw,mass:cc.weight,bounds:{width:ldCur.mapWidth,height:ldCur.mapHeight}});
              scene.add(wreck.group);destroyed=true;setWrecked(true);damage=1;setDamagePercent(100);
              car.speed=0;impactMotion.time=0;playerParts.group.visible=false;
            }
          }

          const normalImpactSpeed = response.closing/(SPEED_UNIT_KMH/3.6);
          const now = simulationClockMs;
          // 任何碰撞（含轻微擦碰）都播放碰撞音效，音量随撞击力缩放
          if (normalImpactSpeed > 0.08 && now - lastCrashAt > 400) {
            lastCrashAt = now;
            playCrashSound(Math.max(0.3, normalImpactSpeed));
            if (normalImpactSpeed > 0.3) {
              onCrash(normalImpactSpeed > 5 ? 50 : 10);
            }
          }
        }

        // 4. 物理世界先按上一帧刚体位姿/速度推进，随后再写入本帧运动学
        // 结果。旧顺序先写当前位姿再 step，碰撞体会比主车多前进一帧并在下
        // 一帧被拉回，锥桶/交通接触时会出现位置双写。这里只调整顺序。
        physics.step(frameDelta / 1000);
        wreck?.step(frameDelta/1000);looseDebris.forEach(d=>d.step(frameDelta/1000));
        const playerRotY3D = toMeshRotY(car.rotation);
        physics.updatePlayerKinematics(car.x, car.y, playerRotY3D, car.speed, car.rotation,
          airborneActive ? suspensionBodyHeight ?? car.roadHeight : car.roadHeight);

        // 交通车运动学→物理刚体
        built.trafficObstacles.forEach((obs) => {
          const obsRotY3D = toMeshRotY(obs.rotation);
          const obsSpeed = obs.ai ? obs.ai.speed : 0;
          physics.updateTrafficKinematics(obs.id, obs.x, obs.y, obsRotY3D, obsSpeed, obs.rotation);
        });

        // 6. 从物理刚体读回可移动物体位置（锥桶/箱子被撞飞翻滚）
        built.movableMeshes.forEach((mesh, id) => {
          const tf = physics.getMovableTransform(id);
          if (tf) {
            const obstacle = obstaclesRef.current.find(candidate => candidate.id === id);
            // Cone meshes are authored from a ground-level group origin while
            // Cannon reports their centre of mass. Subtract the half-height
            // so the base, not the centre, sits on the road.
            const visualYOffset = obstacle?.type === 'cone' ? 4 : 0;
            const supportHeight = sampleSlope(ldCur, tf.x, tf.z, undefined, 0).height;
            const bodyOffset = obstacle?.type === 'cone' ? 4 : Math.max(1, (obstacle?.width || 2) / 2);
            physics.enforceMovableFloor(id, supportHeight + bodyOffset);
            const settled = physics.getMovableTransform(id) || tf;
            mesh.position.set(settled.x, settled.y - visualYOffset, settled.z);
            const body = (physics as any).movableBodies?.get(id);
            if (body) {
              mesh.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
            } else {
              mesh.rotation.y = tf.rotY;
            }
          }
        });

        // 8. 障碍物距离检测（仅在挂档后启用，模拟真实倒车雷达）
        radarStationaryMs = Math.abs(car.speed)*15 < .5 ? radarStationaryMs+frameDelta : 0;
        const isInGear = currentInputReal.engineStarted && currentInputReal.gear !== 0 && sCur.soundEnabled && sCur.radarSoundEnabled && !document.hidden;
        if (isInGear) {
        const proximityNow = simulationClockMs;
        const PROXIMITY_RANGE = 15; // 1.5 米检测范围
        let minDist = PROXIMITY_RANGE;
        const carHalfW = cc.width / 2;
        const carHalfL = cc.length / 2;
        const cosR = Math.cos(car.rotation);
        const sinR = Math.sin(car.rotation);
        const samplePoints: [number, number][] = [
          [carHalfL, 0], [-carHalfL, 0], [0, carHalfW], [0, -carHalfW],
          [carHalfL, carHalfW], [carHalfL, -carHalfW], [-carHalfL, carHalfW], [-carHalfL, -carHalfW],
        ];
        
        for (const obs of obstaclesRef.current) {
          if (!sensedObstacle(obs,car.roadHeight,cc.height)) continue;
          const maxRange = PROXIMITY_RANGE + carHalfL + Math.max(obs.width, obs.height) / 2;
          if (Math.abs(obs.x - car.x) > maxRange || Math.abs(obs.y - car.y) > maxRange) continue;
          // 障碍物本地半尺寸：对于 car 类型，height=车长(沿 heading)，width=车宽(垂直 heading)
          // 对于 wall 类型，width=墙长(沿 heading)，height=墙厚(垂直 heading)
          const isCarObs = obs.type === 'car';
          const obsHalfAlong = isCarObs ? obs.height / 2 : obs.width / 2;   // 沿 heading 半尺寸
          const obsHalfAcross = isCarObs ? obs.width / 2 : obs.height / 2;  // 垂直 heading 半尺寸
          const cosO = Math.cos(obs.rotation);
          const sinO = Math.sin(obs.rotation);
          for (const [lx, ly] of samplePoints) {
            const wx = car.x + lx * cosR - ly * sinR;
            const wy = car.y + lx * sinR + ly * cosR;
            const dx = wx - obs.x;
            const dy = wy - obs.y;
            const lox = dx * cosO + dy * sinO;       // 障碍物本地 X（沿 heading）
            const loy = -dx * sinO + dy * cosO;      // 障碍物本地 Y（垂直 heading）
            const cx = Math.max(-obsHalfAlong, Math.min(obsHalfAlong, lox));
            const cy = Math.max(-obsHalfAcross, Math.min(obsHalfAcross, loy));
            const dist = Math.hypot(lox - cx, loy - cy);
            if (dist < minDist) minDist = dist;
          }
        }
        const pulse=parkingPulse(minDist,Math.abs(car.speed)*15,isInGear,radarStationaryMs);
        if(pulse.enabled && proximityNow-lastProximityBeepAt>=pulse.intervalMs){
          lastProximityBeepAt=proximityNow;playProximityBeep(1-minDist/PROXIMITY_RANGE);
        }
        }

        // 7. 停车判定（SAT 用于停车精度判定）
        // Parking lessons use the configured BODY envelope, not the wheel
        // contact rectangle. A small inward line clearance means touching a
        // painted boundary is a failed park rather than a successful one.
        const lineClearance = 0.35;
        const carCorners = getRectCorners({ x: car.x, y: car.y, width: cc.length, height: cc.width, rotation: car.rotation });
        const parkingSpeedKmh = Math.abs(car.speed) * 15;
        ldCur.spots.forEach(spot => {
          if(Math.abs((spot.elevation ?? 0)-(car.roadHeight ?? 0))>12) return;
          const npcOccupied = obstaclesRef.current.some(obs => obs.type === 'car'
            && Math.abs((obs.elevation??0)-(spot.elevation??0))<12
            && Math.abs(obs.x - spot.x) <= spot.width / 2 + obs.width / 2
            && Math.abs(obs.y - spot.y) <= spot.height / 2 + obs.height / 2);
          const evaluation = evaluateParkingSpot(
            spot,
            { x: car.x, y: car.y, rotation: car.rotation, width: cc.width, length: cc.length },
            parkingSpeedKmh,
            npcOccupied,
            lineClearance,
          );
          if (evaluation.valid) {
            parkingInsideRef.current.add(spot.id);
            const stable = accumulateParkingStable(parkingStableRef.current[spot.id] ?? 0, true, frameDelta, 1000);
            parkingStableRef.current[spot.id] = stable.stableMs;
            if (stable.success && !parkingReportedRef.current.has(spot.id)) {
              parkingReportedRef.current.add(spot.id);
              // Ordinary bays have no entry-direction requirement: forward and
              // reverse (180°) are both a successful park. Only an explicitly
              // authored task direction can reject/penalise the opposite way.
              const isReverse = Boolean(spot.requiresDirection) && evaluation.direction === 'reverse';
              const type = isReverse ? 'reverse' : 'perfect';
              if (sCur.soundEnabled) playSuccessSound(isReverse);
              if (!parkingStatusRef.current.has(spot.id)) {
                parkingStatusRef.current.add(spot.id);
                onParkingSuccess(spot.id, isReverse ? -20 : 100, type);
              } else {
                // Re-entering after leaving gives the visible/sound feedback
                // again without adding score a second time.
                onParkingSuccess(spot.id, 0, type);
              }
              const spotGroup = built?.spotMeshes?.get(spot.id);
              if (spotGroup && !spotGroup.userData.completed) {
                spotGroup.userData.completed = true;
                spotGroup.traverse(child => {
                  if (child instanceof THREE.Mesh && child.material) {
                    const mat = (child.material as THREE.MeshLambertMaterial).clone();
                    mat.color.set('#3b82f6');
                    mat.emissive?.set('#1d4ed8');
                    mat.emissiveIntensity = 0.3;
                    child.material = mat;
                  }
                });
              }
            }
          } else {
            parkingStableRef.current[spot.id] = 0;
            // A speed wobble or partial overlap inside the bay must not reset
            // the notification. Only fully leaving the painted box allows a
            // new "parking success" feedback.
            if (evaluation.cornersInside === 0) {
              parkingInsideRef.current.delete(spot.id);
              parkingReportedRef.current.delete(spot.id);
            }
          }
        });
        // 8. 音频更新
        const speedAbs = Math.abs(car.speed);
        audioDistanceM+=Math.min(10,Math.hypot(car.x-previousPose.x,car.y-previousPose.y)/10);
        const insulation=cabinInsulation(cc.id);
        const roadSound=roadMix(speedAbs,firstPersonView,audioDistanceM,insulation);
        const drivingMotor=hasMotorDrive(currentInputReal.engineStarted,currentInputReal.gear,
          longResult.targetThrottle,lastMotorDriveForce,currentInputReal.brake,currentInputReal.handbrake);
        const audioMotor=motorMix(speedAbs,throttleState.current,firstPersonView,drivingMotor,insulation);
        audioMixReadout={cabin:firstPersonView,motor:sCur.soundEnabled&&sCur.engineSoundEnabled?audioMotor.gain:0,
          road:sCur.soundEnabled?roadSound.gain:0,hz:audioMotor.frequency,driving:drivingMotor};
        const targetEngineRpm = computeRpm(pt, speedAbs, currentInputReal.gear, throttleState.current, currentInputReal.engineStarted);
        const rpmResponse = targetEngineRpm > simulatedEngineRpm ? 0.075 : 0.05;
        simulatedEngineRpm = approachExponential(simulatedEngineRpm, targetEngineRpm, rpmResponse, frameScale);
        if (sCur.soundEnabled && sCur.engineSoundEnabled && engineNodesRef.current?.lowMix) {
          const { osc1, osc2, osc3, gain, filter, noiseGain, lowMix, midMix, pulseMix } = engineNodesRef.current;
          if (currentInputReal.engineStarted) {
            const profile = { idle: pt.idleRpm, redline: pt.redlineRpm,
              cylinders: cc.id === CarType.SPORTS ? 10 : cc.id === CarType.ZUNJIE ? 8 : 4, tone: 1 };
            const engineLoad = THREE.MathUtils.clamp(throttleState.current, 0, 1);
            const gearAbsForSound = Math.max(1, Math.abs(currentInputReal.gear));
            const gearTone = 1;
            const firingHz = Math.max(24, simulatedEngineRpm / 60 * (profile.cylinders / 2) * profile.tone * gearTone);
            const now = audioContextRef.current!.currentTime;
            // Low firing pulses + restrained harmonics create a rounded
            // exhaust note without the old buzzy sawtooth edge.
            osc1.frequency.setTargetAtTime(firingHz * 0.5, now, 0.09);
            osc2.frequency.setTargetAtTime(firingHz, now, 0.07);
            osc3.frequency.setTargetAtTime(firingHz * 2.01, now, 0.06);
            const filterFreq = 210 + gearAbsForSound * 34 + engineLoad * 570 + (simulatedEngineRpm / profile.redline) * 300;
            filter.frequency.setTargetAtTime(filterFreq, now, 0.14);
            filter.Q.setTargetAtTime(0.55, now, 0.14);
            noiseGain.gain.setTargetAtTime(0.0015 + engineLoad * 0.008, now, 0.12);
            const isElectric = isElectricVehicle(cc.id);
            const coasting = engineLoad < 0.025 && speedAbs > 0.15;
            const vol = (coasting ? 0.004 : 0.023 + Math.pow(engineLoad, 0.72) * 0.105) * sCur.volume;
            if(isElectric) {
              const motor=motorMix(speedAbs,engineLoad,firstPersonView,drivingMotor,insulation);
              lowMix.gain.value=firstPersonView?.65:.92;midMix.gain.value=firstPersonView?.23:.065;pulseMix.gain.value=firstPersonView?.12:.015;
              noiseGain.gain.setTargetAtTime(0,now,.04);
              osc1.type='sine';osc2.type='sine';osc3.type='sine';
              osc1.frequency.setTargetAtTime(motor.frequency,now,.10);
              osc2.frequency.setTargetAtTime(motor.frequency*1.5,now,.10);
              osc3.frequency.setTargetAtTime(motor.frequency*2,now,.10);
              filter.frequency.setTargetAtTime(motor.cutoff,now,.15);
              gain.gain.setTargetAtTime(motor.gain*sCur.volume,now,drivingMotor?.14:.035);
            } else {
              lowMix.gain.value=.72;midMix.gain.value=.20;pulseMix.gain.value=.10;
              gain.gain.setTargetAtTime(Math.min(.13,vol)*(firstPersonView?.4:1),now,.12);
            }
          } else {
            gain.gain.setTargetAtTime(0, audioContextRef.current!.currentTime, 0.1);
          }
        } else if (engineNodesRef.current) {
          engineNodesRef.current.gain.gain.value = 0;
        }

        if (sCur.soundEnabled && tireNoiseRef.current) {
          const tireVol = roadSound.gain*.35 * sCur.volume;
          tireNoiseRef.current.gain.gain.setTargetAtTime(tireVol, audioContextRef.current!.currentTime, roadSound.smoothing);
          const tireFreq = roadSound.cutoff;
          tireNoiseRef.current.filter.frequency.setTargetAtTime(tireFreq, audioContextRef.current!.currentTime, 0.1);
        } else if (tireNoiseRef.current) { tireNoiseRef.current.gain.gain.value = 0; }

        if (sCur.soundEnabled && gravelNoiseRef.current) {
          const gravelVol = 0;
          gravelNoiseRef.current.gain.gain.setTargetAtTime(gravelVol, audioContextRef.current!.currentTime, 0.05);
        } else if (gravelNoiseRef.current) { gravelNoiseRef.current.gain.gain.value = 0; }

        if (sCur.soundEnabled && windNoiseRef.current) {
          const windVol = Math.min(0.025, Math.max(0, speedAbs - 4) * 0.004) * sCur.volume * (firstPersonView?insulation:1);
          windNoiseRef.current.gain.gain.setTargetAtTime(windVol, audioContextRef.current!.currentTime, 0.1);
        } else if (windNoiseRef.current) { windNoiseRef.current.gain.gain.value = 0; }

        // stabilitySlip is computed in the Ackermann block above as a
        // geometry-based yaw demand (|ω|·|v| / wheelbase). slipAngle is
        // pinned to 0 by pure kinematics, so it is dropped from the trigger.
        const isSkiddingNow = speedAbs > 1.0 && (
          longResult.frontLocked || longResult.rearLocked || stabilitySlip > 0.42
          || Math.abs(car.driftSlip) > 0.035
          || (emergencyBraking && speedAbs > 2.5 && Math.abs(car.steeringAngle) > 0.08)
        );
        if (sCur.soundEnabled && skidNoiseRef.current) {
          const skidVol = isSkiddingNow ? Math.min(0.12, brakeForce * 2.5) * sCur.volume * (firstPersonView?.25:1) : 0;
          skidNoiseRef.current.gain.gain.setTargetAtTime(skidVol, audioContextRef.current!.currentTime, 0.05);
          if (isSkiddingNow && speedAbs > 2.0 && !getRecordingAudioStatus().ready && Math.random() < 0.02) playBrakeSound(brakeForce);
        } else if (skidNoiseRef.current) { skidNoiseRef.current.gain.gain.value = 0; }

        // Recorded CC0 layers replace the oscillator/noise beds once decoded.
        const recordingStatus = getRecordingAudioStatus();
        updateRecordingAudio({
          enabled: sCur.soundEnabled,
          paused: false,
          engineOn: currentInputReal.engineStarted,
          electric: isElectricVehicle(cc.id),
          cabin: firstPersonView,
          engineSoundEnabled:sCur.engineSoundEnabled,
          rpm: simulatedEngineRpm,
          redlineRpm: pt.redlineRpm,
          throttle: throttleState.current,
          speedAbs, distanceM:audioDistanceM, insulation,
          surface: (isGravelSurface(car.x, car.y) || (ldCur.openWorld && worldSurface(car.x,car.y).gravel)) ? 'gravel' : 'asphalt',
          skid: isSkiddingNow ? Math.min(1, Math.max(brakeForce * 2.5, Math.abs(car.driftSlip) * 4)) : 0,
          volume: sCur.volume,
        });
        if (recordingStatus.ready) {
          // Keep the synth fallback alive but silent; real recordings are the
          // combustion/road/gravel/skid sources; EV motor harmonics remain active.
          [...(isElectricVehicle(cc.id)?[]:[engineNodesRef.current?.gain]), tireNoiseRef.current?.gain, gravelNoiseRef.current?.gain, skidNoiseRef.current?.gain]
            .forEach(g => g?.gain.setTargetAtTime(0, audioContextRef.current!.currentTime, 0.05));
        }

        // One common support attitude for chassis, suspension axes and tyres.
        const renderSlope = sampleSlope(ldCur, car.x, car.y, car.rotation, car.roadHeight);
        const forwardXForWheels=Math.cos(car.rotation),forwardYForWheels=Math.sin(car.rotation);
        const leftXForWheels=Math.sin(car.rotation),leftYForWheels=-Math.cos(car.rotation);
        const frontWheelCount = playerParts.frontWheels.length;
        const suspensionSetup=suspensionForCar(cc.id);
        if(lastSuspensionReset!==suspensionResetRef.current){
          lastSuspensionReset=suspensionResetRef.current;chassisState=createChassisState();
          driverMotion=createDriverMotion();airborneActive=false;tyreLateralG=0;
        }
        const dx=car.x-previousPose.x,dz=car.y-previousPose.y;
        const rideRange=(cc.rideHeightRangeM??0)*1000;
        const rideHeight=THREE.MathUtils.clamp(settingsRef.current.rideHeightMm??0,-rideRange/2,rideRange/2)*.01;
        if(!rollover){
          // Sample road excitation along the travelled segment, not once at
          // its endpoint: a narrow bump must not disappear on a slow frame.
          const substeps=Math.min(24,Math.max(1,Math.ceil(frameDelta/1000*120),Math.ceil(Math.hypot(dx,dz)/2)));
          const supportLevel={...ldCur,curbSegments:nearbyWheelCurbs(ldCur.curbSegments??[],car,cc.length+Math.hypot(dx,dz))};
          let pose!:ReturnType<typeof stepChassis>;
          for(let sub=1;sub<=substeps;sub++){
            const at={x:previousPose.x+dx*sub/substeps,y:previousPose.y+dz*sub/substeps,rotation:car.rotation};
            const support=(i:number,hub:THREE.Vector3,axis:THREE.Vector3)=>sampleWheelSupport(supportLevel,at,
              {x:hub.x,z:hub.z,radius:rigWheels[i].radius,halfWidth:rigWheels[i].halfWidth,steer:-rigWheels[i].steer,axis:worldAxis(axis)},car.roadHeight);
            pose=stepChassis(chassisState,{wheels:rigWheels,spec:suspensionSetup,mass:cc.weight,
              cgM:cc.dynamics.cgHeightM,frontBias:cc.dynamics.frontWeightBias,longG:filteredLongAccelG,
              latG:tyreLateralG,deltaLeft:(dx*Math.sin(car.rotation)-dz*Math.cos(car.rotation))/substeps,
              deltaForward:(dx*Math.cos(car.rotation)+dz*Math.sin(car.rotation))/substeps,rideHeight,dt:frameDelta/1000/substeps,support});
          }
          if(pose!.airborne&&!airborneActive)airborneHeading=Math.hypot(dx,dz)>.001?
            Math.atan2(dz,dx)+(car.speed<0?Math.PI:0):car.rotation-car.driftSlip;
          suspensionBodyHeight=pose!.height;airborneActive=pose!.airborne;
          suspensionRoadPitch=pose.roadPitch;suspensionPitch=pose.pitch-pose.roadPitch;suspensionRoll=pose.roll;
          playerParts.group.position.set(car.x,pose.height,car.y);
          playerParts.group.rotation.set(pose.pitch,playerRotY3D,pose.roll,'YXZ');
          if(playerBodyTiltPivot){playerBodyTiltPivot.rotation.set(0,0,0);playerBodyTiltPivot.position.y=0;}
          wheelSuspensionOffsets=pose.offsets;
          playerParts.wheelMounts.forEach((mount,i)=>{
            mount.position.set(rigWheels[i].x,wheelBaseY[i]+pose.offsets[i],wheelBaseZ[i]);
            // No counter-pitch / world-up compensation: the knuckle shares
            // the chassis frame and steering is only around local up.
            mount.rotation.set(0,rigWheels[i].steer,0,'XYZ');
          });
          playerParts.group.updateWorldMatrix(true,true);
          suspensionTelemetryRef.current={terrainHeight:renderSlope.height,bodyHeave:pose.height-pose.neutralHeight,
            bodyPitchDeg:THREE.MathUtils.radToDeg(pose.pitch),bodyRollDeg:THREE.MathUtils.radToDeg(pose.roll),
            wheelTravel:pose.offsets, wheelContacts:pose.contacts.map(c=>c.height),wheelGap:pose.contacts.map(c=>c.gap),
            wheelGrounded:pose.contacts.map(c=>!pose.airborne&&isWheelGroundedByGap(c.gap)),
            surface:(isGravelSurface(car.x,car.y)||(ldCur.openWorld&&worldSurface(car.x,car.y).gravel))?'gravel':'asphalt'};
          if(!destroyed && impactMotion.time<=0 && !pose.unstable && !pose.airborne && Math.abs(pose.pitch)<.45 && Math.abs(pose.roll)<.4 && simulationClockMs-lastRecoveryAt>1000){
            recoveryPose=recoveryCandidate;recoveryCandidate={x:car.x,y:car.y,rotation:car.rotation,roadHeight:car.roadHeight};lastRecoveryAt=simulationClockMs;
          }
          if(pose.unstable&&!destroyed){
            accidentRecoveryPose={...recoveryPose};
            rollover=new VehicleRollover(playerParts.group,{mass:cc.weight,width:cc.width,length:cc.length,height:cc.height,
              cgHeight:cc.dynamics.cgHeightM*10,wheels:rigWheels.map((w,i)=>({position:playerParts.wheelMounts[i].position.clone(),radius:w.radius,width:w.halfWidth*2,steer:w.steer})),
              velocity:new THREE.Vector3(Math.cos(car.rotation),0,Math.sin(car.rotation)).multiplyScalar(car.speed*SPEED_UNIT_KMH/3.6*10),
              tipX:pose.loads.tipX,tipZ:pose.loads.tipZ,surface:(x,z)=>sampleTerrainSurface(ldCur,x,z,car.roadHeight).height});
            setOverturned(true);impactMotion.time=0;car.speed=0;
          }
        }else{
          const r=rollover.step(frameDelta/1000);car.x=r.position.x;car.y=r.position.z;car.speed=0;
          suspensionTelemetryRef.current.wheelGrounded=[false,false,false,false];
        }
        const effectiveRoadPitch=chassisState.pitch-suspensionPitch;
        if (isSkiddingNow && renderSlope.height < 0.4) {
          const travelled = lastSkidPosition
            ? Math.hypot(car.x - lastSkidPosition.x, car.y - lastSkidPosition.y)
            : Infinity;
          if (travelled > 2.8) {
            const forwardX = Math.cos(car.rotation);
            const forwardY = Math.sin(car.rotation);
            const sideX = -forwardY;
            const sideY = forwardX;
            const rearX = car.x - forwardX * rigWheelbase * 0.46;
            const rearY = car.y - forwardY * rigWheelbase * 0.46;
            const halfTrack = cc.width * 0.34;
            for (const side of [-1, 1]) {
              const markMaterial = skidMarkMat.clone();
              const mark = new THREE.Mesh(skidMarkGeo, markMaterial);
              // Default PlaneGeometry lies in the XY plane. Use the same YXZ
              // Euler order as the turn-assist dashes so the heading (Y) is
              // applied first in world space, then the plane is laid flat by
              // the X tilt. Without setting the order the mark ends up pinned
              // on its edge instead of flat on the ground.
              mark.rotation.order = 'YXZ';
              mark.rotation.x = -Math.PI / 2;
              mark.rotation.y = -car.rotation;
              mark.position.set(rearX + sideX * halfTrack * side, 0.195, rearY + sideY * halfTrack * side);
              mark.renderOrder = 5;
              mark.userData.createdAt = simulationClockMs;
              skidMarkGroup.add(mark);
              skidMarks.push(mark);
            }
            lastSkidPosition = { x: car.x, y: car.y };
            while (skidMarks.length > 320) {
              const oldest = skidMarks.shift();
              if (oldest) {
                skidMarkGroup.remove(oldest);
                (oldest.material as THREE.Material).dispose();
              }
            }
          }
        } else {
          lastSkidPosition = null;
        }

        // Tyre rubber first remains readable, then fades progressively rather
        // than accumulating forever across a lesson.
        const skidNow = simulationClockMs;
        for (let index = skidMarks.length - 1; index >= 0; index--) {
          const mark = skidMarks[index];
          const age = skidNow - Number(mark.userData.createdAt || skidNow);
          const material = mark.material as THREE.MeshBasicMaterial;
          if (age >= SKID_HOLD_MS + SKID_FADE_MS) {
            skidMarkGroup.remove(mark);
            material.dispose();
            skidMarks.splice(index, 1);
          } else if (age > SKID_HOLD_MS) {
            material.opacity = 0.48 * (1 - (age - SKID_HOLD_MS) / SKID_FADE_MS);
          }
        }

        if (simulationClockMs - lastMiniMapUpdateAt > 80) {
          lastMiniMapUpdateAt = simulationClockMs;
          const carFloor = levelData.levelId === 6
            ? garageFloorAt(car.roadHeight ?? -48)
            : -1;
          window.dispatchEvent(new CustomEvent('car-map-position', {
            detail: { x: car.x, y: car.y, rotation: car.rotation, floor: carFloor },
          }));
        }

        // 驾校 2 压线检测：只在带 warningEdges 的单行训练道路上启用。
        // If an overlapping junction lane safely contains the car, it wins so
        // crossing a legitimate intersection does not produce a false alarm.
        if (ldCur.levelId === 5) {
          let safelyInsideLane = false;
          let touchingEdge = false;
          for (const road of ldCur.roadSurfaces || []) {
            if (!road.warningEdges) continue;
            const dx = car.x - road.x;
            const dy = car.y - road.y;
            const cos = Math.cos(road.rotation);
            const sin = Math.sin(road.rotation);
            const localAlong = dx * cos + dy * sin;
            if (Math.abs(localAlong) > road.width / 2 + cc.length / 2) continue;
            const localSide = -dx * sin + dy * cos;
            const headingDelta = car.rotation - road.rotation;
            const lateralExtent = Math.abs(Math.sin(headingDelta)) * cc.length / 2
              + Math.abs(Math.cos(headingDelta)) * cc.width / 2;
            const clearance = road.height / 2 - (Math.abs(localSide) + lateralExtent);
            if (clearance > 1.2) safelyInsideLane = true;
            else if (clearance >= -1.8) touchingEdge = true;
          }
          const carCorners: Vector2[] = [];
          for (const longitudinal of [-1, 1]) {
            for (const lateral of [-1, 1]) {
              carCorners.push({
                x: car.x + forwardXForWheels * cc.length * 0.5 * longitudinal + leftXForWheels * cc.width * 0.5 * lateral,
                y: car.y + forwardYForWheels * cc.length * 0.5 * longitudinal + leftYForWheels * cc.width * 0.5 * lateral,
              });
            }
          }
          for (const curved of ldCur.curvedRoads || []) {
            if (!curved.warningEdges) continue;
            let maxCornerDistance = 0;
            for (const corner of carCorners) {
              let nearest = Infinity;
              for (let i = 0; i < curved.points.length - 1; i++) {
                const a = curved.points[i];
                const b = curved.points[i + 1];
                const abX = b.x - a.x;
                const abY = b.y - a.y;
                const lengthSq = abX * abX + abY * abY;
                const t = lengthSq > 0
                  ? THREE.MathUtils.clamp(((corner.x - a.x) * abX + (corner.y - a.y) * abY) / lengthSq, 0, 1)
                  : 0;
                nearest = Math.min(nearest, Math.hypot(corner.x - (a.x + abX * t), corner.y - (a.y + abY * t)));
              }
              maxCornerDistance = Math.max(maxCornerDistance, nearest);
            }
            const clearance = curved.width / 2 - maxCornerDistance;
            if (clearance > 1.2) safelyInsideLane = true;
            else if (clearance >= -1.8) touchingEdge = true;
          }
          if (touchingEdge && !safelyInsideLane && simulationClockMs - lastLaneWarningAt > 900) {
            lastLaneWarningAt = simulationClockMs;
            window.dispatchEvent(new CustomEvent('lane-line-warning'));
          }
        }
        const defaultWheelRadius = cc.dynamics.transmission.wheelRadiusM * 10;
        // Geometry-driven differential. Each wheel's roll-speed multiplier is
        // its path radius divided by the rear-axle-centre path radius. This is
        // deliberately an unsigned, positive multiplier: the differential may
        // make an outside wheel roll faster and an inside wheel roll slower,
        // but it must never reverse either wheel. The signed travel direction
        // remains exclusively in wheelRollBase, for both forward and reverse.
        // diffGain 0 ⇒ all four wheels share the body speed (legacy look);
        // diffGain 1 ⇒ full geometric split. The ICC radius R is recomputed
        // from the physical steering angle (car.steeringAngle), not the
        // visual lock, so the split reflects the actual turn the body makes.
        const diffGain = 1;
        const tanSteerPhys = Math.tan(car.steeringAngle);
        const turnRadius = Math.abs(tanSteerPhys) < 0.001
          ? Infinity
          : Math.abs(rigWheelbase / tanSteerPhys);
        playerParts.wheels.forEach((w, idx) => {
          let turnFactor = 1;
          if (diffGain > 0 && Number.isFinite(turnRadius) && Math.abs(car.speed) > 0.001) {
            const isFront = idx < playerParts.frontWheels.length;
            const mount = playerParts.wheelMounts[idx];
            const vehicleSideX = Number(mount?.userData.vehicleSideX ?? w.parent?.userData.vehicleSideX ?? 0);
            // This uses the same vehicle-side convention as the Ackermann
            // visuals above: positive steer is a right turn, whose inside is
            // the vehicle's -X side. The outside path is always the longer one.
            const isInner = car.steeringAngle > 0 ? vehicleSideX < 0 : vehicleSideX > 0;
            const lateralPathRadius = Math.max(0.25, turnRadius + (isInner ? -halfTrack : halfTrack));
            const wheelPathRadius = isFront
              ? Math.hypot(rigWheelbase, lateralPathRadius)
              : lateralPathRadius;
            const geometricRatio = wheelPathRadius / Math.max(0.25, turnRadius);
            // Values above 1 exaggerate the split for calibration. Clamp the
            // multiplier above zero so even extreme debug values cannot flip
            // the rotation direction of any front or rear wheel.
            turnFactor = Math.max(0.05, 1 + (geometricRatio - 1) * diffGain);
          }
          const wheelRadius = Number(w.userData.wheelRadius) || defaultWheelRadius;
          const locked = idx < playerParts.frontWheels.length ? longResult.frontLocked : longResult.rearLocked;
          if (!locked) w.rotation.x += (frameTravelSpeed * TRAVEL_PER_SPEED_FRAME / wheelRadius) * turnFactor * frameScale;
        });

        // Preview the same axle-based integration used by the live vehicle.
        turnAssistGroup.visible = settingsRef.current.turnAssist && !firstPersonView;
        if (turnAssistGroup.visible) {
          const reversing = currentInputReal.gear === -1;
          const travelSign = reversing ? -1 : 1;
          // 辅助线长度随车速伸缩：挪车时只画 ~3 米，给油后延长到 ~9 米，
          // 固定 80 单位在低速时反而看不出转弯趋势。
          const guideLength = THREE.MathUtils.clamp(30 + Math.abs(car.speed) * 4.2, 30, 90);
          const stepDistance = guideLength / GUIDE_STEP_COUNT;
          const axleForwardBody = reversing ? -rearAxleOffset : rigWheelbase - rearAxleOffset;
          let simX = car.x;
          let simY = car.y;
          let bodyHeading = car.rotation;
          const guidePoints: Array<[Vector2, Vector2]> = [];
          for (let i = 0; i <= GUIDE_STEP_COUNT; i++) {
            const forwardX = Math.cos(bodyHeading);
            const forwardY = Math.sin(bodyHeading);
            const leftX = forwardY;
            const leftY = -forwardX;
            const axleX = simX + forwardX * axleForwardBody;
            const axleY = simY + forwardY * axleForwardBody;
            guidePoints.push([
              { x: axleX + leftX * halfTrack, y: axleY + leftY * halfTrack },
              { x: axleX - leftX * halfTrack, y: axleY - leftY * halfTrack },
            ]);
            if (i < GUIDE_STEP_COUNT) {
              const pose = advanceVehicleCenter(simX, simY, bodyHeading, travelSign * stepDistance, rigWheelbase, motionSteerAngle, rearAxleOffset, rearSteerAngle);
              simX = pose.x; simY = pose.y; bodyHeading = pose.rotation;
            }
          }
          turnAssistDashMeshes.forEach((sideDashes, sideIndex) => {
            sideDashes.forEach((dash, dashIndex) => {
              const start = guidePoints[dashIndex * 2][sideIndex];
              const end = guidePoints[dashIndex * 2 + 1][sideIndex];
              const dx = end.x - start.x;
              const dy = end.y - start.y;
              const length = Math.hypot(dx, dy);
              const middleX = (start.x + end.x) / 2;
              const middleY = (start.y + end.y) / 2;
              dash.position.set(
                middleX,
                sampleWheelSurface(ldCur, middleX, middleY, car.rotation, car.roadHeight) + 0.39,
                middleY,
              );
              dash.rotation.x = -Math.PI / 2;
              dash.rotation.y = Math.atan2(dx, dy);
              dash.scale.set(1.35, length * 0.78, 1);
            });
          });
          // Approx. 0.8 m, 2.0 m and 3.6 m from the active axle at the game's
          // ten-units-per-metre vehicle scale. Heading for the perpendicular
          // tick markers is the body heading at that lookahead step.
          [8, 20, 36].forEach((distance, lineIndex) => {
            const pointIndex = Math.min(GUIDE_STEP_COUNT, Math.round(distance / stepDistance));
            const attribute = turnAssistDistanceLines[lineIndex].geometry.getAttribute('position') as THREE.BufferAttribute;
            const pair = guidePoints[pointIndex];
            // Recover the body heading at this step from the axle centre
            // displacement to keep the tick perpendicular to the body.
            const prev = guidePoints[Math.max(0, pointIndex - 1)];
            const tickHeading = Math.atan2(
              (pair[0].y + pair[1].y) - (prev[0].y + prev[1].y),
              (pair[0].x + pair[1].x) - (prev[0].x + prev[1].x),
            );
            for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
              const point = pair[sideIndex];
              attribute.setXYZ(sideIndex, point.x, sampleWheelSurface(ldCur, point.x, point.y, tickHeading, car.roadHeight) + 0.4, point.y);
            }
            attribute.needsUpdate = true;
            turnAssistDistanceLines[lineIndex].geometry.computeBoundingSphere();
          });
        }

        built.trafficCarParts.forEach((parts, id) => {
          const obs = built!.trafficObstacles.get(id);
          if (obs) {
            const trafficSlope = sampleSlope(ldCur, obs.x, obs.y, obs.rotation, obs.elevation ?? 0);
            const gradeAlongHeading = trafficSlope.gradeX * Math.cos(obs.rotation)
              + trafficSlope.gradeY * Math.sin(obs.rotation);
            parts.group.position.set(obs.x, trafficSlope.height, obs.y);
            parts.group.rotation.order = 'YXZ';
            parts.group.rotation.set(-Math.atan(gradeAlongHeading), toMeshRotY(obs.rotation), 0);
            const trafficRoll = -(obs.ai?.speed || 0) / 3.5;
            parts.wheels.forEach(w => { w.rotation.x += trafficRoll * frameScale; });
          }
        });

        // 头灯/尾灯材质切换
        const lightsOn = currentInputReal.lights && currentInputReal.engineStarted;
        const highBeam=currentInputReal.headlightMode===2;
        const isBraking = currentInputReal.brake > 0 || currentInputReal.handbrake;
        const reverseOn = currentInputReal.gear === -1 && currentInputReal.engineStarted;
        const signalBlinkOn = Math.floor(simulationClockMs / 380) % 2 === 0;
        const steeringSignalThreshold = 35;
        const leftSignalOn = settingsRef.current.autoTurnSignal
          && currentInputReal.steeringWheelAngle < -steeringSignalThreshold && signalBlinkOn;
        const rightSignalOn = settingsRef.current.autoTurnSignal
          && currentInputReal.steeringWheelAngle > steeringSignalThreshold && signalBlinkOn;
        const setLamp = (mesh: THREE.Mesh, on: boolean, onColor: number, offColor: number, intensity = 2.2) => {
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          materials.forEach(material => {
            if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshLambertMaterial) {
              material.color.setHex(on ? onColor : offColor);
              material.emissive.setHex(on ? onColor : 0x000000);
              if (material instanceof THREE.MeshStandardMaterial) material.emissiveIntensity = on ? intensity : 0;
              // Colour/emission are uniforms: no shader recompilation per frame.
            }
          });
        };
        playerParts.headlights.forEach(hl => {
          setLamp(hl, lightsOn, 0xfff7d6, 0x5b6470, 3.2);
        });
        playerParts.brakeLights.forEach(tl => {
          setLamp(tl, isBraking || lightsOn, isBraking ? 0xff2020 : 0xb91c1c, 0x4a0909, isBraking ? 3.2 : 1.2);
        });
        playerParts.reverseLights.forEach(light => setLamp(light, reverseOn, 0xffffff, 0x4b5563, 3));
        playerParts.leftIndicators.forEach(light => setLamp(light, leftSignalOn, 0xffa000, 0x5b3200, 3));
        playerParts.rightIndicators.forEach(light => setLamp(light, rightSignalOn, 0xffa000, 0x5b3200, 3));
        // 程序化车模的可动部件：主动尾翼、方向盘、制动盘热辉。
        // 这些部件全部由上面的车辆状态驱动，与物理层共用同一个来源。
        if (playerParts.extras) {
          updateVehicleExtras(playerParts.extras, {
            speed: car.speed,
            maxSpeed: cc.maxSpeed,
            steeringWheelAngle: THREE.MathUtils.degToRad(currentInputReal.steeringWheelAngle),
            steer: car.steeringAngle,
            throttle: throttleState.current,
            brake: currentInputReal.brake,
            lightsOn,
            dt: 1 / 60,
          });
        }
        playerParts.nativeCockpit?.updateInstruments?.(car.speed * 15, simulatedEngineRpm);
        roadHeadlights.forEach(light => {
          light.intensity = lightsOn ? (highBeam?2200:1100) : 0;
          light.distance=highBeam?800:360;light.angle=highBeam?.32:.60;
          light.target.position.y=highBeam?4:-5;light.target.position.z=highBeam?550:180;
        });
        roadTaillights.forEach(light => {
          light.intensity = isBraking ? 160 : lightsOn ? 45 : 0;
          light.distance = isBraking ? 72 : 48;
        });

        // Presets and the C4D-style orbit ball share one smooth camera target.
        if (activeCameraPreset !== cameraViewRef.current) {
          const nextPresetView = cameraViewRef.current;
          activeCameraPreset = nextPresetView;
          // The state change to ORBIT caused by the first pixels of a plain
          // left drag must not snap the view back to the ORBIT preset.
          driverMotion=createDriverMotion();
          if (nextPresetView !== 'ORBIT') {
            manualOrbitOverride = false;
            const preset = CAMERA_PRESETS[nextPresetView];
            orbitTarget.azimuth = preset.azimuth;
            orbitTarget.polar = preset.polar;
          }
        }
        camState.azimuth = orbitTarget.azimuth;
        camState.polar = orbitTarget.polar;
        camState.smoothAzimuth = approachExponential(camState.smoothAzimuth, camState.azimuth, 0.15, frameScale);
        camState.smoothPolar = approachExponential(camState.smoothPolar, camState.polar, 0.15, frameScale);
        camState.smoothDist = approachExponential(camState.smoothDist, camState.distance, 0.15, frameScale);

        const activeView = resolveInspectionView(cameraViewRef.current,manualOrbitOverride,Boolean(destroyed||rollover));
        const cameraAnchor=wreck?inspectionFocus.copy(wreck.focus):inspectionFocus.set(car.x,renderSlope.height,car.y);
        const hoodTune = sCur.hoodCameraAdjustment;
        const visualTarget = activeView === 'TOP' || activeView === 'ORBIT' ? 0 : speedVisualStrength(car.speed * SPEED_UNIT_KMH);
        speedEffectStrength = approachExponential(speedEffectStrength, visualTarget, .05, frameScale);
        const baseFov = activeView === 'HOOD'
          ? THREE.MathUtils.clamp(hoodTune?.fov ?? DEFAULT_HOOD_CAMERA_ADJUSTMENT.fov, 30, 120)
          : 45;
        const desiredFov = Math.min(120, baseFov + speedEffectStrength * 7);
        if (Math.abs(camera.fov - desiredFov) > 0.01) {
          camera.fov = desiredFov;
          camera.updateProjectionMatrix();
        }
        const forwardX = Math.cos(car.rotation);
        const forwardZ = Math.sin(car.rotation);
        const leftX = forwardZ;
        const leftZ = -forwardX;
        const cameraDX = cameraAnchor.x - previousCameraCarX, cameraDZ = cameraAnchor.z - previousCameraCarZ;
        const snapCamera = previousCameraView !== activeView || Math.hypot(cameraDX,cameraDZ) > 200;
        const followVehicle = (positionBlend: number, lookBlend: number) => {
          if(snapCamera) {
            camera.position.copy(chaseCameraDesired);
            chaseCameraSmoothedLook.copy(chaseCameraLookTarget);
          } else {
            camera.position.x=followRelativeCoordinate(camera.position.x,cameraDX,chaseCameraDesired.x,positionBlend);
            camera.position.z=followRelativeCoordinate(camera.position.z,cameraDZ,chaseCameraDesired.z,positionBlend);
            camera.position.y=THREE.MathUtils.lerp(camera.position.y,chaseCameraDesired.y,positionBlend);
            chaseCameraSmoothedLook.x=followRelativeCoordinate(chaseCameraSmoothedLook.x,cameraDX,chaseCameraLookTarget.x,lookBlend);
            chaseCameraSmoothedLook.z=followRelativeCoordinate(chaseCameraSmoothedLook.z,cameraDZ,chaseCameraLookTarget.z,lookBlend);
            chaseCameraSmoothedLook.y=THREE.MathUtils.lerp(chaseCameraSmoothedLook.y,chaseCameraLookTarget.y,lookBlend);
          }
        };
        previousCameraCarX=cameraAnchor.x;previousCameraCarZ=cameraAnchor.z;previousCameraView=activeView;
        if (activeView === 'FOLLOW_NEAR' || activeView === 'FOLLOW_FAR' || activeView === 'REVERSE') {
          const isReverseCamera = activeView === 'REVERSE';
          const isNear = activeView === 'FOLLOW_NEAR';
          const distance = destroyed ? 220 : rollover ? 150 : isReverseCamera ? 52 : isNear ? 72 : 142;
          const height = destroyed ? 110 : rollover ? 75 : isReverseCamera ? 24 : isNear ? 34 : 64;
          const cameraDirection = isReverseCamera ? 1 : -1;
          const lookOffset = isReverseCamera ? -32 : isNear ? 20 : 30;
          chaseCameraDesired.set(
            cameraAnchor.x + forwardX * distance * cameraDirection,
            cameraAnchor.y + height,
            cameraAnchor.z + forwardZ * distance * cameraDirection,
          );
          chaseCameraLookTarget.set(
            cameraAnchor.x + forwardX * lookOffset,
            cameraAnchor.y + 5,
            cameraAnchor.z + forwardZ * lookOffset,
          );
          const positionBlend = 1 - Math.pow(1 - (isReverseCamera ? 0.22 : 0.16), frameScale);
          const lookBlend = 1 - Math.pow(1 - 0.22, frameScale);
          followVehicle(positionBlend,lookBlend);
          camera.up.set(0, 1, 0);
          camera.lookAt(chaseCameraSmoothedLook);
        } else if (activeView === 'REAR_RIGHT' || activeView === 'REAR_LEFT'
          || activeView === 'FRONT_LEFT' || activeView === 'FRONT_RIGHT') {
          const isFront = activeView === 'FRONT_LEFT' || activeView === 'FRONT_RIGHT';
          const isLeft = activeView === 'REAR_LEFT' || activeView === 'FRONT_LEFT';
          const longitudinal = isFront ? 92 : -98;
          const lateral = isLeft ? 66 : -66;
          chaseCameraDesired.set(
            cameraAnchor.x + forwardX * longitudinal + leftX * lateral,
            cameraAnchor.y + 54,
            cameraAnchor.z + forwardZ * longitudinal + leftZ * lateral,
          );
          chaseCameraLookTarget.set(cameraAnchor.x + forwardX * (isFront ? -10 : 15), cameraAnchor.y + 5, cameraAnchor.z + forwardZ * (isFront ? -10 : 15));
          const positionBlend = 1 - Math.pow(1 - 0.17, frameScale);
          const lookBlend = 1 - Math.pow(1 - 0.20, frameScale);
          followVehicle(positionBlend,lookBlend);
          camera.up.set(0, 1, 0);
          camera.lookAt(chaseCameraSmoothedLook);
        } else if (activeView === 'SIDE_LEFT' || activeView === 'SIDE_RIGHT') {
          const side = activeView === 'SIDE_LEFT' ? 1 : -1;
          chaseCameraDesired.set(cameraAnchor.x + leftX * 125 * side, cameraAnchor.y + 22, cameraAnchor.z + leftZ * 125 * side);
          chaseCameraLookTarget.set(cameraAnchor.x, cameraAnchor.y + 5, cameraAnchor.z);
          const positionBlend = 1 - Math.pow(1 - 0.20, frameScale);
          const lookBlend = 1 - Math.pow(1 - 0.24, frameScale);
          followVehicle(positionBlend,lookBlend);
          camera.up.set(0, 1, 0);
          camera.lookAt(chaseCameraSmoothedLook);
        } else if (activeView === 'HOOD') {
          if (hoodCameraMount && hoodCameraTarget) {
            const tune = hoodTune || DEFAULT_HOOD_CAMERA_ADJUSTMENT;
            const pose = cockpitEyeOffset
              ? applyCockpitEyeOffset(resolveHoodCameraLocalPose(cc, tune), cockpitEyeOffset)
              : resolveHoodCameraLocalPose(cc, tune);
            if (playerParts.nativeCockpit) {
              const pitch = (playerParts.nativeCockpit.pitchDeg + tune.pitch - DEFAULT_HOOD_CAMERA_ADJUSTMENT.pitch) * Math.PI / 180;
              pose.targetY = pose.y + Math.tan(pitch) * Math.max(80, cc.length * 3.2);
            }
            const head=stepDriverMotion(driverMotion,frameDelta/1000,{
              height:playerParts.group.position.y,
              pitch:effectiveRoadPitch+suspensionPitch,roll:suspensionRoll,
              longG:filteredLongAccelG,latG:tyreLateralG,
            });
            hoodCameraMount.position.set(pose.x+head.x,pose.y+head.y,pose.z+head.z);
            const headStabilization=new THREE.Euler(head.pitchCorrection,0,head.rollCorrection,'XYZ');
            const headAim=new THREE.Vector3(pose.targetX-pose.x,pose.targetY-pose.y,pose.targetZ-pose.z).applyEuler(headStabilization);
            hoodCameraTarget.position.copy(hoodCameraMount.position).add(headAim);
            // Matrices have already been updated by the animated vehicle rig.
            // Updating here ensures the camera reads this frame's newest
            // road pitch and sprung-body pitch before the scene is rendered.
            playerParts.group.updateWorldMatrix(true, true);
            hoodCameraMount.getWorldPosition(hoodCameraPosition);
            hoodCameraTarget.getWorldPosition(hoodCameraLookTarget);
            hoodCameraMount.getWorldQuaternion(hoodCameraQuaternion);
            hoodCameraUp.set(0, 1, 0).applyEuler(headStabilization).applyQuaternion(hoodCameraQuaternion).normalize();
            camera.position.copy(hoodCameraPosition);
            camera.up.copy(hoodCameraUp);
            camera.lookAt(hoodCameraLookTarget);
            const look = stepHeadLook(frameDelta / 1000);
            if (look.yawDeg !== 0) camera.rotateOnWorldAxis(hoodCameraUp, THREE.MathUtils.degToRad(look.yawDeg));
            if (look.pitchDeg !== 0) camera.rotateX(THREE.MathUtils.degToRad(look.pitchDeg));
          } else {
            // Scene-load fallback, kept above every model's roof line.
            camera.position.set(cameraAnchor.x + forwardX * cc.length * 0.08, cameraAnchor.y + cc.height + 3.5, cameraAnchor.z + forwardZ * cc.length * 0.08);
            camera.up.set(0, 1, 0);
            camera.lookAt(cameraAnchor.x + forwardX * 150, cameraAnchor.y + cc.height * 0.72, cameraAnchor.z + forwardZ * 150);
          }
        } else if (activeView === 'TOP') {
          camera.position.set(cameraAnchor.x, cameraAnchor.y + Math.max(210, camState.smoothDist * 0.56), cameraAnchor.z);
          camera.up.set(forwardX, 0, forwardZ);
          camera.lookAt(cameraAnchor.x, cameraAnchor.y, cameraAnchor.z);
        } else {
          const sinPolar = Math.sin(camState.smoothPolar);
          const cosPolar = Math.cos(camState.smoothPolar);
          const sinAz = Math.sin(camState.smoothAzimuth);
          const cosAz = Math.cos(camState.smoothAzimuth);
          camera.position.x = cameraAnchor.x + camState.smoothDist * sinPolar * sinAz;
          camera.position.y = cameraAnchor.y + camState.smoothDist * cosPolar;
          camera.position.z = cameraAnchor.z + camState.smoothDist * sinPolar * cosAz;
          camera.up.set(0, 1, 0);
          camera.lookAt(cameraAnchor.x, cameraAnchor.y, cameraAnchor.z);
          chaseCameraSmoothedLook.set(cameraAnchor.x, cameraAnchor.y, cameraAnchor.z);
        }

        // 11. 太阳光跟随
        const lightTarget=stableSunTarget(new THREE.Vector3(car.x,renderSlope.height,car.y),SHADOW_SIZE,sun.shadow.mapSize.width);
        sun.target.position.copy(lightTarget);
        sun.position.copy(lightTarget).add(new THREE.Vector3(-150,220,-100));
        sun.target.updateMatrixWorld();

        // 12. 天气粒子更新
        if (rainParticles) {
          rainParticles.position.set(car.x, 0, car.y);
          const positions = (rainParticles.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
          for (let i = 0; i < positions.length; i += 3) {
            positions[i + 1] -= 18;
            if (positions[i + 1] < 0) positions[i + 1] = 600;
          }
          (rainParticles.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
        }
        if (snowParticles) {
          snowParticles.position.set(car.x, 0, car.y);
          const positions = (snowParticles.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
          for (let i = 0; i < positions.length; i += 3) {
            positions[i + 1] -= 2;
            positions[i] += Math.sin((Date.now() + i) * 0.001) * 0.5;
            if (positions[i + 1] < 0) positions[i + 1] = 600;
          }
          (snowParticles.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
        }
        } // end if (frameDelta > 0)
      }  // end if (!paused)

      // The main camera and three mirrors share one world transform snapshot.
      // Cameras update their own local mounts below; visibility/intensity
      // changes do not require re-walking the entire static city each pass.
      scene.updateMatrixWorld();
      scene.matrixWorldAutoUpdate = false;
      const renderCpuStart=performance.now();
      simulationCpuMs=simulationCpuMs*.9+(renderCpuStart-cpuStart)*.1;
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
      if (!isPausedRef.current) renderer.shadowMap.needsUpdate = settingsRef.current.shadowsEnabled;
      speedEffect.render(renderer, scene, camera, speedEffectStrength);

      if (settingsRef.current.rearviewMirrors) {
        // Scissor mirrors share the main canvas: they must be redrawn every
        // present, otherwise skipped frames expose the main camera image.
        const mirrorWidth = Math.min(440, Math.max(280, window.innerWidth * 0.28));
        const mirrorHeight = mirrorWidth / 2.65;
        const centreWidth = Math.min(520, Math.max(320, window.innerWidth * 0.32));
        const centreHeight = centreWidth / 3.7;
        const mirrorSettings = settingsRef.current;
        // Measured DOM glass rects are the source of truth. The formulas above
        // remain only as a first-frame fallback before UIOverlay publishes its
        // ResizeObserver measurement.
        const glassLayout = getMirrorGlassLayout();
        const layoutCanvasHeight = glassLayout?.canvasHeight ?? window.innerHeight;
        const resolveGlassRect = (
          id: 'left' | 'right' | 'centre',
          fallback: { x: number; y: number; width: number; height: number; radius: number },
        ) => {
          const rect = glassLayout?.rects[id];
          if (!rect || rect.width < 2 || rect.height < 2) return fallback;
          return {
            x: rect.left,
            y: layoutCanvasHeight - rect.top - rect.height,
            width: rect.width,
            height: rect.height,
            radius: Math.min(rect.radius, Math.min(rect.width, rect.height) / 2),
          };
        };
        const mirrorCalibration = cc.id === CarType.SUV
          ? { height: 1.1, outward: 0.07, forward: -0.01, zoom: 2.0, distance: 4 }
          : cc.id === CarType.SPORTS
            ? { height: -1.25, outward: 0.04, forward: -0.025, zoom: -1.4, distance: -3 }
            : cc.id === CarType.TRUCK
              ? { height: 1.9, outward: 0.12, forward: 0.035, zoom: 3.5, distance: 10 }
              // 小米 SU7：低坐姿 + 外后视镜前移
              : cc.id === CarType.SU7
                ? { height: -0.85, outward: 0.06, forward: -0.02, zoom: -0.8, distance: -1 }
                // 小米 YU7：坐姿更高、镜位更外扩
                : cc.id === CarType.YU7
                  ? { height: 1.15, outward: 0.09, forward: -0.005, zoom: 1.9, distance: 3.5 }
                  // 尊界 V8：长车头、镜位高且靠后
                  : cc.id === CarType.ZUNJIE
                    ? { height: 0.9, outward: 0.08, forward: 0.015, zoom: 1.4, distance: 2.5 }
                    : { height: 0, outward: 0, forward: 0, zoom: 0, distance: 0 };
        // Cameras are children of the sprung-body pivot. Their local pose is
        // recalibrated here, while the parent supplies the complete vehicle
        // attitude. The body and camera therefore share the exact same matrix.
        playerParts.group.updateWorldMatrix(true, true);
        const applyBodyLocalMirrorPose = (
          mirrorCamera: THREE.PerspectiveCamera,
          localPosition: THREE.Vector3,
          localTarget: THREE.Vector3,
        ) => {
          mirrorCamera.position.copy(localPosition);
          mirrorCamera.up.copy(mirrorLocalUp);
          mirrorLocalLookMatrix.lookAt(localPosition, localTarget, mirrorLocalUp);
          mirrorCamera.quaternion.setFromRotationMatrix(mirrorLocalLookMatrix);
          mirrorCamera.updateWorldMatrix(false, false);
        };
        const renderMirror = (mirrorCamera: THREE.PerspectiveCamera, id: 'left' | 'right', side: number) => {
          const tuning = mirrorSettings.mirrorAdjustments[id];
          const distance = tuning.targetDistance + mirrorCalibration.distance;
          const outward = Math.tan(THREE.MathUtils.degToRad(tuning.yaw)) * distance;
          const mountForward = cc.length * (0.18 + tuning.mountForward * 0.16 + mirrorCalibration.forward);
          const mountSide = Math.max(cc.width * 0.52, cc.width * (0.96 + tuning.mountOutward * 0.16 + mirrorCalibration.outward));
          const mountHeight = 7.5 + tuning.mountHeight + mirrorCalibration.height;
          const leftSlot = mirrorSettings.mirrorSwapSides ? id === 'right' : id === 'left';
          const viewportX = THREE.MathUtils.clamp((leftSlot ? 24 : window.innerWidth - 24 - mirrorWidth) + tuning.screenX, 8, window.innerWidth - mirrorWidth - 8);
          const viewportY = THREE.MathUtils.clamp(18 - tuning.screenY, 8, window.innerHeight - mirrorHeight - 8);
          const glass = resolveGlassRect(id, {
            x: viewportX,
            y: viewportY,
            width: mirrorWidth,
            height: mirrorHeight,
            radius: 16,
          });
          if (glass.width < 2 || glass.height < 2) return;
          mirrorCamera.fov = THREE.MathUtils.clamp(40 + tuning.imageZoom + mirrorCalibration.zoom, 18, 68);
          mirrorCamera.aspect = glass.width / glass.height;
          mirrorCamera.updateProjectionMatrix();
          // A real mirror reverses left and right within its own image. This
          // flips each side mirror independently without exchanging slots.
          // Horizontal reflection happens in the display texture, after rasterization.
          mirrorCamera.projectionMatrixInverse.copy(mirrorCamera.projectionMatrix).invert();
          mirrorLocalPosition.set(side * mountSide, mountHeight, mountForward);
          mirrorLocalTarget.set(
            side * (mountSide + outward),
            mountHeight + Math.tan(THREE.MathUtils.degToRad(tuning.pitch)) * distance,
            -distance,
          );
          applyBodyLocalMirrorPose(mirrorCamera, mirrorLocalPosition, mirrorLocalTarget);
          renderer.setViewport(glass.x, glass.y, glass.width, glass.height);
          renderer.setScissor(glass.x, glass.y, glass.width, glass.height);
          renderer.setScissorTest(true);
          const wasPlayerVisible = playerParts.group.visible;
          playerParts.group.visible = !destroyed && tuning.showBody;
          renderMirrorImage(mirrorCamera, glass);
          playerParts.group.visible = wasPlayerVisible;
        };

        const interiorWasVisible = driverInterior?.group.visible ?? false;
        if (driverInterior) driverInterior.group.visible = false;
        // Mirrors see the untouched shell/glass and wheels.
        setFirstPersonBody(false);
        playerParts.wheelMounts.forEach(mount => { mount.visible = true; });
        playerParts.wheels.forEach(wheel => { wheel.visible = true; });
        renderMirror(leftMirrorCamera, 'left', 1);
        renderMirror(rightMirrorCamera, 'right', -1);

        const centreTuning = mirrorSettings.mirrorAdjustments.centre;
        const centreX = THREE.MathUtils.clamp((window.innerWidth - centreWidth) / 2 + centreTuning.screenX, 8, window.innerWidth - centreWidth - 8);
        const centreTop = THREE.MathUtils.clamp(76 + centreTuning.screenY, 8, window.innerHeight - centreHeight - 8);
        const centreViewportY = window.innerHeight - centreTop - centreHeight;
        const centreGlass = resolveGlassRect('centre', {
          x: centreX,
          y: centreViewportY,
          width: centreWidth,
          height: centreHeight,
          radius: 14,
        });
        if (centreGlass.width >= 2 && centreGlass.height >= 2) {
        const centreDistance = centreTuning.targetDistance;
        const centreMountHeight = 10.5 + centreTuning.mountHeight;
        centreMirrorCamera.fov = 40 + centreTuning.imageZoom;
        centreMirrorCamera.aspect = centreGlass.width / centreGlass.height;
        centreMirrorCamera.updateProjectionMatrix();
        mirrorLocalPosition.set(
          centreTuning.mountOutward * cc.width * 0.12,
          centreMountHeight,
          cc.length * (0.08 + centreTuning.mountForward * 0.14),
        );
        mirrorLocalTarget.set(
          Math.tan(THREE.MathUtils.degToRad(centreTuning.yaw)) * centreDistance,
          5 + Math.tan(THREE.MathUtils.degToRad(centreTuning.pitch)) * centreDistance,
          -centreDistance,
        );
        applyBodyLocalMirrorPose(centreMirrorCamera, mirrorLocalPosition, mirrorLocalTarget);
        renderer.setViewport(centreGlass.x, centreGlass.y, centreGlass.width, centreGlass.height);
        renderer.setScissor(centreGlass.x, centreGlass.y, centreGlass.width, centreGlass.height);
        renderer.setScissorTest(true);
        const wasPlayerVisible = playerParts.group.visible;
        playerParts.group.visible = !destroyed && centreTuning.showBody;
        renderMirrorImage(centreMirrorCamera, centreGlass);
        playerParts.group.visible = wasPlayerVisible;
        }
        if (driverInterior) driverInterior.group.visible = interiorWasVisible;
        if (firstPersonView) {
          playerParts.wheelMounts.forEach(mount => { mount.visible = false; });
          playerParts.wheels.forEach(wheel => { wheel.visible = false; });
          setFirstPersonBody(true);
        }
        renderer.setScissorTest(false);
      }

      const overviewNow = performance.now();
      if (overviewTarget && overviewContext && overviewPixels && overviewImage
        && !overviewReadPending && overviewNow - lastOverviewRenderAt >= 100) {
        lastOverviewRenderAt = overviewNow;
        const overviewSlope = sampleSlope(levelDataRef.current, car.x, car.y, car.rotation,car.roadHeight);
        const overviewForwardX = Math.cos(car.rotation);
        const overviewForwardZ = Math.sin(car.rotation);
        // 俯瞰时隐藏楼顶，直接看到车辆和周围环境
        const ceilingGroup = ceilingGroupRef.current;
        if (ceilingGroup) ceilingGroup.visible = false;
        const rampCeilings:THREE.Object3D[]=[];
        scene.traverse(n=>{if(n.userData.garageCeiling && n.visible){rampCeilings.push(n);n.visible=false;}});
        // 俯瞰图不需要光影效果：不提升环境光，隐藏大灯/倒车灯光柱
        // 保留尾灯和转向灯可见（它们是车身上的发光材质，不受影响）
        const savedHeadlightIntensities = roadHeadlights.map(l => l.intensity);
        const savedReverseIntensities = roadTaillights.map(l => l.intensity);
        roadHeadlights.forEach(l => { l.intensity = 0; });
        // 倒车灯也隐藏（俯瞰图不需要）
        roadTaillights.forEach(l => { l.intensity = 0; });
        overviewCamera.position.set(car.x, overviewSlope.height + 220, car.y);
        overviewCamera.up.set(overviewForwardX, 0, overviewForwardZ);
        overviewCamera.lookAt(car.x, overviewSlope.height, car.y);
        // The driver view hides the exterior shell; restore it for this
        // auxiliary pass so the overhead map does not show a ghost/shadow.
        const overviewInteriorWasVisible = driverInterior?.group.visible ?? false;
        if (driverInterior) driverInterior.group.visible = false;
        setFirstPersonBody(false);
        playerParts.wheelMounts.forEach(mount => { mount.visible = true; });
        playerParts.wheels.forEach(wheel => { wheel.visible = true; });
        renderer.setRenderTarget(overviewTarget);
        renderer.render(scene, overviewCamera);
        // Fence the tiny overview readback instead of synchronously waiting for
        // every preceding main/mirror GPU command. Same pixels and 10 Hz rate.
        overviewReadPending = true;
        const overviewRead = renderer.readRenderTargetPixelsAsync(overviewTarget, 0, 0, 240, 150, overviewPixels);
        renderer.setRenderTarget(null);
        if (driverInterior) driverInterior.group.visible = overviewInteriorWasVisible;
        if (firstPersonView) {
          playerParts.wheelMounts.forEach(mount => { mount.visible = false; });
          playerParts.wheels.forEach(wheel => { wheel.visible = false; });
          setFirstPersonBody(true);
        }
        if (ceilingGroup) ceilingGroup.visible = firstPersonView;
        rampCeilings.forEach(n=>n.visible=true);
        // 恢复大灯和倒车灯
        roadHeadlights.forEach((l, i) => { l.intensity = savedHeadlightIntensities[i]; });
        roadTaillights.forEach((l, i) => { l.intensity = savedReverseIntensities[i]; });
        void overviewRead.then(() => {
          if (disposed) return;
          // WebGL's origin is bottom-left; Canvas2D's is top-left.
          for (let row = 0; row < 150; row++) {
            const sourceOffset = (149 - row) * 240 * 4;
            overviewImage.data.set(overviewPixels.subarray(sourceOffset, sourceOffset + 240 * 4), row * 240 * 4);
          }
          overviewContext.putImageData(overviewImage, 0, 0);
        }).catch(error => {
          if (!disposed) console.warn('Overview readback failed', error);
        }).finally(() => { overviewReadPending = false; });
      }
      renderCpuMs=renderCpuMs*.9+(performance.now()-renderCpuStart)*.1;
    };

    // 启动渲染循环的函数（场景加载完成后调用）
    function startRenderLoop() {
      if (disposed || animationId) return;
      render();
    }


    const recoverInPlace=()=>{
      const car=carState.current;
      if(destroyed || rollover || damage>0)Object.assign(car,accidentRecoveryPose);
      // Recover at the vehicle's last safe pose. Flying fragments can cross the
      // world boundary, so their centroid is not a valid recovery position.
      car.speed=0;car.yawRate=0;car.driftSlip=0;car.slipAngle=0;car.steeringAngle=0;
      car.roadHeight=sampleTerrainSurface(levelDataRef.current,car.x,car.y,car.roadHeight).height;
      throttleState.current=0;carSpeedRef.current=0;tyreLateralG=0;airborneActive=false;
      brakePedal=0;launchBlend=0;prevLongAccelMs2=0;filteredLongAccelG=0;
      longitudinalPendingFrames=0;longitudinalHoldFrames=0;longitudinalStallTimer=0;lastMotorDriveForce=0;
      // No level reload and no camera reset. The next simulation frame restores
      // the authored shell, spring rest pose and tyres at this location.
      suspensionResetRef.current++;
    };
    window.addEventListener('vehicle-recover',recoverInPlace);

    // ===== 仅保留滚轮缩放 =====
    const dom = renderer.domElement;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 1.1 : 1 / 1.1;
      camState.distance *= delta;
      if (camState.distance < CAM_MIN_DIST) camState.distance = CAM_MIN_DIST;
      if (camState.distance > CAM_MAX_DIST) camState.distance = CAM_MAX_DIST;
    };
    dom.addEventListener('wheel', onWheel, { passive: false });

    // ===== 窗口缩放 =====
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    // ===== 清理 =====
    return () => {
      disposed = true;
      cancelAnimationFrame(animationId);
      window.removeEventListener('toggle-collision-debug', collisionDebugHandler);
      clearCollisionDebug();
      collisionDebugGroupRef.current?.parent?.remove(collisionDebugGroupRef.current);
      collisionDebugGroupRef.current = null;
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('vehicle-recover',recoverInPlace);
      dom.removeEventListener('wheel', onWheel);
      // 物理引擎释放
      wreck?.dispose();looseDebris.forEach(d=>d.dispose());damageModel?.dispose();rollover?.dispose();
      physics.dispose();
      // 模型缓存释放
      disposeModelCache();
      disposeResources([scene,...(built?.streamingChunks?.values()??[])]);
      skidMarks.forEach(mark => (mark.material as THREE.Material).dispose());
      skidMarks.length = 0;
      skidMarkMat.dispose();
      disposeMaterials();
      vehicleEnvironment?.dispose();
      mirrorTarget.dispose(); sideMirrorTarget.dispose(); mirrorQuadGeo.dispose(); mirrorQuadMat.dispose();
      speedEffect.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      overviewTarget?.dispose();
      markerRingMaterial.dispose();
      markerArrowMaterial.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
      // 静音音频
      if (engineNodesRef.current && audioContextRef.current) {
        try {
          if (audioContextRef.current.state === 'running') {
            engineNodesRef.current.gain.gain.cancelScheduledValues(audioContextRef.current.currentTime);
            engineNodesRef.current.gain.gain.setValueAtTime(0, audioContextRef.current.currentTime);
          }
        } catch (e) {}
      }
      if (tireNoiseRef.current) { try { tireNoiseRef.current.gain.gain.value = 0; } catch (e) {} }
      if (gravelNoiseRef.current) { try { gravelNoiseRef.current.gain.gain.value = 0; } catch (e) {} }
      if (windNoiseRef.current) { try { windNoiseRef.current.gain.gain.value = 0; } catch (e) {} }
      if (skidNoiseRef.current) { try { skidNoiseRef.current.gain.gain.value = 0; } catch (e) {} }
      savedCameraRef.current={level:levelData,camState:{...camState},orbitTarget:{...orbitTarget},position:camera.position.clone(),quaternion:camera.quaternion.clone(),up:camera.up.clone(),look:chaseCameraSmoothedLook.clone(),manualOrbitOverride};
      window.removeEventListener('camera-orbit-change', handleOrbitChange);
      window.removeEventListener('camera-orbit-nudge', handleOrbitNudge);
    };
  // Dependencies are intentionally minimal: ONLY level data and the car-speed
  // ref trigger a full scene rebuild (new level / new car ⇒ new world). All
  // Volatile props are mirrored into refs above so live panel adjustments do
  // not rebuild the renderer or reset the camera.
  // and read inside the effect, so changing them (e.g. opening the tuning
  // panel, dragging a settings slider, pausing) no longer destroys and
  // rebuilds the WebGLRenderer/camera/scene. That was the root cause of the
  // "camera resets to preset position whenever a setting changes" bug.
  }, [levelData, carSpeedRef, currentCarId]);

  return <>
    <div ref={mountRef} className="block w-full h-full touch-none" />
    {(damagePercent>0 || overturned) && <div role="status" className={`damage-status ${isTouchDevice()?'damage-status-touch':''}`}>
      <span className="damage-status-dot"/>
      <span>{overturned?'车辆翻覆':wrecked?'车辆损毁':`车损 ${damagePercent}%`}</span>
      {(wrecked || overturned) && <small>{isTouchDevice()?'点顶部重置图标':'R 重置'}</small>}
    </div>}
  </>;
});

export default GameCanvas3D;
