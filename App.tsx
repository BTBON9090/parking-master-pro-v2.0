import {MountainAdventurePanel} from './components/MountainAdventurePanel';
import {portalAt} from './utils/mapPortals';
import {ReleaseNotes} from './components/ReleaseNotes';
import {SettingsPage} from './components/SettingsPage';
import {DrivingGuide} from './components/DrivingGuide';
import {loadProgress,saveProgress,WORLD_REVISION,type GameProgress,type SavedExam} from './utils/progressStorage';
import {progressStart} from './utils/progressResume';
import {loadSettings,saveSettings} from './utils/settingsStorage';
import {DEFAULT_DRIVER_SEAT} from './utils/driverSeat';
import {isTouchDevice} from './utils/device';
import {mergeMobileInput} from './utils/mobileInput';
import {parkingBrakeApplied} from './utils/parkingBrake';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { CarType, DayTime, LevelData, UserSettings, WeatherType, InputState, Language, ParkingResultType, CameraView, KeyBindings } from './types';
import { serializeToLevelData } from './utils/polyline';
import { GENERATE_LEVEL, CAR_MODELS, DEFAULT_MIRROR_ADJUSTMENTS, DEFAULT_VEHICLE_TUNING, DEFAULT_STEERING_CURVES, DEFAULT_HOOD_CAMERA_ADJUSTMENT, DEFAULT_KEY_BINDINGS, hoodCameraDefaultForCar } from './constants';
import GameCanvas3D from './components/GameCanvas3D';
import UIOverlay from './components/UIOverlay';
import type {MobileSnapshot} from './components/MobileControls';
import MainMenu from './components/MainMenu';
import MapEditor from './components/MapEditor';
import ErrorBoundary from './components/ErrorBoundary';
import { steeringWheelMaxDeg, getPowertrain, canSelectGear, gearRejectionReason } from './utils/powertrain';
import { configureMenuAudio, playUiClick } from './utils/menuAudio';
import {cameraDragMode} from './utils/cameraLook';
import { isEditableTarget, pointerButtonStillHeld } from './utils/inputGuards';
import { adjustHeadLook, resetHeadLook, setHeadLookTarget } from './utils/headLook';
import {
  SteeringInputSmoother,
  autoCenterWheelAngle,
  effectiveSteeringWheelMaxDeg,
  STEER_LEFT_KEY,
  STEER_RIGHT_KEY,
  KEYBOARD_STEER_DELTA_PER_FRAME,
  KNOB_STEER_STEP_DEG,
  applySymmetricSteeringDelta,
  snapSteeringCenter,
  SteeringActivityClock,
} from './utils/steering';
import { resolveKeyboardPedals, shouldHandleHandbrakeKey } from './utils/keyboardPedals';

function App() {
  const [savedGame,setSavedGame]=useState(loadProgress);
  const savedMaps=useRef(savedGame?.maps??{});
  const progressPose=useRef(savedGame?.pose??null);
  const saveMeta=useRef<{active:boolean;level:LevelData|null;car:CarType;money:number;camera:CameraView;spots:Set<string>}|null>(null);
  const [saveMessage,setSaveMessage]=useState('');
  const flushProgress=useCallback(()=>{
    const m=saveMeta.current;if(!m?.active||!m.level||!progressPose.current)return;
    savedMaps.current[String(m.level.levelId)]={...savedMaps.current[String(m.level.levelId)],completedSpots:[...m.spots]};
    const next:GameProgress={schema:1,worldRevision:WORLD_REVISION,savedAt:Date.now(),car:m.car,levelId:m.level.levelId,money:m.money,camera:m.camera,pose:{...progressPose.current},maps:{...savedMaps.current},...(m.level.levelId===0?{customLevel:m.level}:{})};
    if(saveProgress(next)){setSavedGame(next);setSaveMessage('进度已保存在此设备');}
    else setSaveMessage('暂时无法保存，请检查设备存储空间');
  },[]);
  useEffect(()=>{
    const position=(e:Event)=>{const d=(e as CustomEvent).detail;if(d?.safe&&[d.x,d.y,d.rotation,d.elevation].every(Number.isFinite))progressPose.current={x:d.x,y:d.y,rotation:d.rotation,elevation:d.elevation};};
    const exam=(e:Event)=>{const d=(e as CustomEvent<{levelId:number;exam:SavedExam}>).detail;savedMaps.current[String(d.levelId)]={...savedMaps.current[String(d.levelId)],completedSpots:savedMaps.current[String(d.levelId)]?.completedSpots??[],exam:d.exam};};
    const hidden=()=>{if(document.hidden)flushProgress();};
    const timer=setInterval(flushProgress,5000);
    window.addEventListener('car-map-position',position);window.addEventListener('exam-progress',exam);
    window.addEventListener('save-progress',flushProgress);window.addEventListener('pagehide',flushProgress);document.addEventListener('visibilitychange',hidden);
    return()=>{clearInterval(timer);window.removeEventListener('car-map-position',position);window.removeEventListener('exam-progress',exam);window.removeEventListener('save-progress',flushProgress);window.removeEventListener('pagehide',flushProgress);document.removeEventListener('visibilitychange',hidden);};
  },[flushProgress]);
  const [isInGame, setIsInGame] = useState(false);
  const [travelMessage,setTravelMessage]=useState('');
  const [menuSettings,setMenuSettings]=useState(false),[menuGuide,setMenuGuide]=useState(false);
  const [menuCapture,setMenuCapture]=useState<keyof KeyBindings|null>(null);
  const [editorMode, setEditorMode] = useState(false);
  // 本次游戏是否由地图编辑器「测试」发起；若是，退出游戏应返回编辑器而非选关页
  const [gameFromEditor, setGameFromEditor] = useState(false);
  const [menuEntryStep, setMenuEntryStep] = useState<0 | 1 | 2>(0);
  const [isPaused, setIsPaused] = useState(false);
  const [lang, setLang] = useState<Language>(Language.CN);
  
  const [level, setLevel] = useState(savedGame?.levelId||1);
  const [money, setMoney] = useState(savedGame?.money??100);
  const [levelData, setLevelData] = useState<LevelData | null>(null);
  const [rewardAnimation, setRewardAnimation] = useState<{show: boolean, amount: number, type: ParkingResultType}>({show: false, amount: 0, type: 'good'});
  const [completedSpots, setCompletedSpots] = useState<Set<string>>(new Set());
  
  // Default Weather and Lights OFF
  const weather = WeatherType.SUNNY; // Legacy fallback; explicit rain/snow/fog settings own weather.
  const [currentCar, setCurrentCar] = useState<CarType>(savedGame?.car??CarType.SUV);
  const [cameraView, setCameraView] = useState<CameraView>(savedGame?.camera??'HOOD');
  saveMeta.current={active:isInGame,level:levelData,car:currentCar,money,camera:cameraView,spots:completedSpots};
  const inspectionRef=useRef(false);
  const handleInspectionChange=useCallback((active:boolean)=>{
    inspectionRef.current=active;
    if(active){setCameraView('FOLLOW_FAR');if(document.pointerLockElement)document.exitPointerLock();}
  },[]);
  const overviewCanvasRef = useRef<HTMLCanvasElement>(null);
  const globalOverviewCanvasRef = useRef<HTMLCanvasElement>(null);
  const [globalOverviewOpen, setGlobalOverviewOpen] = useState(false);
  
  const [settings, setSettings] = useState<UserSettings>(()=>loadSettings({
    renderQuality: 'auto',
    soundEnabled: true,
    absEnabled: true,
    radarSoundEnabled: true,
    engineSoundEnabled: true,
    steeringSoundEnabled: true,
    volume: 0.8,
    cabinVolume: 0.7, exteriorVolume: 0.85,
    rideHeightMm: 0,
    steeringReleaseAssist: true,
    logitechKnobMode: false,
    wheelGhost: false,
    autoTurnSignal: true,
    dayTime: DayTime.DAY,
    weatherEnabled: false,
    weatherRain: false, weatherSnow: false, weatherFog: false,
    shadowsEnabled: true,    // 近范围硬边太阳阴影默认开启；远端不投射
    steeringSensitivity: 1,
    // 默认载入当前车型（海豹 08）的专属转向曲线
    steeringCurve: { ...DEFAULT_STEERING_CURVES[CarType.SUV] },
    vehicleTuning: structuredClone(DEFAULT_VEHICLE_TUNING),
    turnAssist: true,
    hideVehicleBody: false,
    rearviewMirrors: true,
    mirrorSwapSides: false,
    mirrorAdjustments: {
      left: { ...DEFAULT_MIRROR_ADJUSTMENTS.left },
      right: { ...DEFAULT_MIRROR_ADJUSTMENTS.right },
      centre: { ...DEFAULT_MIRROR_ADJUSTMENTS.centre },
    },
    hoodCameraAdjustment: { ...DEFAULT_HOOD_CAMERA_ADJUSTMENT },
    driverSeatAdjustment: { ...DEFAULT_DRIVER_SEAT },
    // 驾驶舱样式包（components/cockpit/stylePacks.ts）。缺省 = 默认包 APEX GT，
    // 后续会开放多车型样式包选择。
    cockpitPackId: 'apex-gt',
    keyBindings: { ...DEFAULT_KEY_BINDINGS },
    debugPhysics: {
      enabled: false,
      driveAxleOffset: 1.0,        // 默认后驱推
      motionReferenceOffset: 0.51,
      steerContactLateral: 0,
      guideAxleFraction: 1.0,      // 前轴
      maxSteerMultiplier: 1.0,
      frontWheelVisualAngleDeg: 48,
      halfTrackFactor: 0.46,
      ackermannSplitGain: 0.82,
      differentialGain: 0.37,
    },
  }));
  useEffect(()=>{
    if(isInGame)return;
    const toggle=()=>setMenuSettings(v=>!v);
    const key=(e:KeyboardEvent)=>{
      if(document.body.dataset.releaseNotes)return;
      if(menuCapture){e.preventDefault();e.stopPropagation();if(e.key!=='Escape')setSettings(v=>({...v,keyBindings:{...DEFAULT_KEY_BINDINGS,...v.keyBindings,[menuCapture!]:e.key.toLowerCase()}}));setMenuCapture(null);return;}
      if(e.key==='Escape'){setMenuSettings(false);setMenuGuide(false);}
    };
    window.addEventListener('toggle-settings',toggle);window.addEventListener('keydown',key,true);
    return()=>{window.removeEventListener('toggle-settings',toggle);window.removeEventListener('keydown',key,true);};
  },[isInGame,menuCapture]);
  const settingsToSave=useRef(settings);settingsToSave.current=settings;
  useEffect(()=>{const timer=setTimeout(()=>saveSettings(settings),250);return()=>clearTimeout(timer);},[settings]);
  useEffect(()=>{const flush=()=>saveSettings(settingsToSave.current);
    window.addEventListener('pagehide',flush);return()=>{flush();window.removeEventListener('pagehide',flush);};},[]);

  const dayTime = settings.dayTime ?? DayTime.DAY;

  const [inputState, setInputState] = useState<InputState>({
    throttle: 0,
    gasPressed: false,
    shiftPressed: false,
    brake: 0,
    steeringWheelAngle: 0,
    gear: 0, parkingBrake: true,
    handbrake: true,
    lights: false, 
    engineStarted: true
  });
  
  // Mouse/keyboard steering smoothing. The smoother keeps the full queued
  // displacement instead of throwing away the tail on release; see
  // utils/steering.ts for the regression-tested behaviour.
  const steeringSmootherRef = useRef(new SteeringInputSmoother());
  const steeringInputFrameRef = useRef<number | null>(null);
  const steeringKeyboardFrameRef = useRef<number | null>(null);
  const rightButtonDownRef = useRef(false);
  const mobileSteeringHeld=useRef(false);
  useEffect(()=>{const listener=(e:Event)=>{mobileSteeringHeld.current=!!(e as CustomEvent).detail;};window.addEventListener("mobile-steering-active",listener);return()=>window.removeEventListener("mobile-steering-active",listener);},[]);
  const draggingRef = useRef(false);
  const steeringActivityRef = useRef(new SteeringActivityClock());
  const cameraViewStateRef = useRef<CameraView>(cameraView);
  const lookDragRef = useRef<{
    active: boolean;
    lastX: number;
    lastY: number;
    mode: 'orbit' | 'head';
    moved: boolean;
  }>({ active: false, lastX: 0, lastY: 0, mode: 'orbit', moved: false });
  const touchSteerRef = useRef<{ active: boolean; pointerId: number; lastX: number }>({ active: false, pointerId: -1, lastX: 0 });
  const keyboardSteerHeldRef = useRef({ left: false, right: false });
  const keyboardPedalHeldRef = useRef({ w: false, s: false, shift: false, handbrake: false });
  const steeringFallbackNotifiedRef = useRef(false);
  const steeringAtLockRef = useRef(false);

  const inputRef = useRef<InputState>(inputState);
  const touchSnapshotRef=useRef<MobileSnapshot>({throttle:0,brake:0,gasPressed:false,handbrakeHeld:false,steeringWheelAngle:undefined});
  const touchUiTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  
  // Centralized Input Update
  const updateInput = useCallback((updater: (prev: InputState) => InputState) => {
      if (isPaused) return; 
      const prev=inputRef.current,next=updater(prev);
      if (next.gear !== prev.gear && !canSelectGear(getPowertrain(currentCar), carSpeedRef.current, next.gear)) next.gear = prev.gear;
      next.handbrake = parkingBrakeApplied(!!next.parkingBrake, next.handbrake || keyboardPedalHeldRef.current.handbrake || touchSnapshotRef.current.handbrakeHeld);
      inputRef.current=next;
      if(touchUiTimer.current!==null){clearTimeout(touchUiTimer.current);touchUiTimer.current=null;}
      if(next!==prev)setInputState(next);
  }, [isPaused, currentCar]);

  // Touch pointer events can exceed the display refresh rate. Physics reads
  // the ref immediately; React reconciles the expensive dashboard at most
  // every 66 ms while fingers move. Down/up/cancel flush synchronously.
  const updateTouchInput=useCallback((snapshot:MobileSnapshot,immediate:boolean)=>{
    touchSnapshotRef.current=snapshot;
    if(isPaused)return;
    const next=mergeMobileInput(inputRef.current,snapshot,keyboardPedalHeldRef.current);
    inputRef.current=next;
    if(immediate){if(touchUiTimer.current!==null)clearTimeout(touchUiTimer.current);touchUiTimer.current=null;setInputState(next);}
    else if(touchUiTimer.current===null)touchUiTimer.current=setTimeout(()=>{touchUiTimer.current=null;setInputState(inputRef.current);},66);
  },[isPaused]);
  useEffect(()=>()=>{if(touchUiTimer.current!==null)clearTimeout(touchUiTimer.current);},[]);

  // Input handlers are bound once per game session; a ref keeps the plain
  // left-drag decision (orbit vs. head look) on the current camera mode
  // without re-binding every listener or resetting the steering smoother.
  useEffect(() => {
      cameraViewStateRef.current = cameraView;
  }, [cameraView]);

  useEffect(() => {
      resetHeadLook(true);
  }, [cameraView, isInGame]);

  useEffect(() => {
      const reset = () => resetHeadLook(true);
      window.addEventListener('blur', reset);
      return () => window.removeEventListener('blur', reset);
  }, []);

  useEffect(() => {
    const releaseControls = () => {
      if(touchUiTimer.current!==null){clearTimeout(touchUiTimer.current);touchUiTimer.current=null;}
      touchSnapshotRef.current={throttle:0,brake:0,gasPressed:false,handbrakeHeld:false,steeringWheelAngle:undefined};
      const prev=inputRef.current,next={...prev,gasPressed:false,shiftPressed:false,throttle:0,brake:0,handbrake:!!prev.parkingBrake};
      inputRef.current=next;setInputState(next);
      draggingRef.current = false;
      rightButtonDownRef.current = false;
      lookDragRef.current.active = false;
      touchSteerRef.current.active = false;
      keyboardSteerHeldRef.current.left = false;
      keyboardSteerHeldRef.current.right = false;
      keyboardPedalHeldRef.current.w = false;
      keyboardPedalHeldRef.current.s = false;
      keyboardPedalHeldRef.current.shift = false;
      keyboardPedalHeldRef.current.handbrake = false;
      // Pause releases the mouse/buttons without changing the saved head view.
      // Explicit double-click / Alt+K still recentres; window blur has its own reset.
      steeringSmootherRef.current.reset();
      if (steeringInputFrameRef.current !== null) {
        cancelAnimationFrame(steeringInputFrameRef.current);
        steeringInputFrameRef.current = null;
      }
      if (steeringKeyboardFrameRef.current !== null) {
        cancelAnimationFrame(steeringKeyboardFrameRef.current);
        steeringKeyboardFrameRef.current = null;
      }
      if(document.pointerLockElement) document.exitPointerLock();
    };
    if(isPaused) releaseControls();
    const hidden = () => { if (document.hidden) releaseControls(); };
    window.addEventListener('blur',releaseControls);
    window.addEventListener('pagehide',releaseControls);
    window.addEventListener('free-drive-stop',releaseControls);
    document.addEventListener('visibilitychange',hidden);
    return()=>{
      window.removeEventListener('blur',releaseControls);
      window.removeEventListener('pagehide',releaseControls);
      window.removeEventListener('free-drive-stop',releaseControls);
      document.removeEventListener('visibilitychange',hidden);
    };
  },[isPaused]);


  // Desktop cockpit controls share one restrained mechanical click. The
  // menu owns its own capture handler, so this runs in-game only.
  useEffect(() => {
      configureMenuAudio({ enabled: settings.soundEnabled, volume: settings.volume });
  }, [settings.soundEnabled, settings.volume]);

  useEffect(() => {
      if (!isInGame || !settings.soundEnabled) return;
      const handleUiClick = (event: MouseEvent) => {
          const target = event.target as HTMLElement | null;
          if (target?.closest('button,[role="button"],input,select')) playUiClick();
      };
      document.addEventListener('click', handleUiClick, true);
      return () => document.removeEventListener('click', handleUiClick, true);
  }, [isInGame, settings.soundEnabled]);

  const carSpeedRef = useRef(0);

  useEffect(() => {
      if (isPaused) return;
      const interval = setInterval(() => {
          const now = Date.now();
          // Refs are the authoritative steering-held signal. React state can
          // trail the browser event by one render, which previously allowed
          // auto-centering to fight the active mouse input for a frame and
          // made the dashboard wheel visibly oscillate.
          const keyboardSteering = keyboardSteerHeldRef.current.left || keyboardSteerHeldRef.current.right;
          // Only steering actions feed this clock. Throttle/brake/gear repeats
          // used to refresh the old generic interaction timestamp, so holding
          // W kept auto-centre disabled forever.
          const isInteracting = steeringActivityRef.current.isSteeringActive(
            now,
            draggingRef.current || rightButtonDownRef.current || keyboardSteering || mobileSteeringHeld.current,
          );

          // If speed rose while the wheel was already turned, bleed the input
          // back to the current speed-sensitive lock even while the player is
          // still holding a steering input. This keeps the dashboard wheel and
          // the front-wheel path consistent without a snap.
          const effectiveWheelMax = effectiveSteeringWheelMaxDeg(
            CAR_MODELS[currentCar],
            Math.abs(carSpeedRef.current),
          );
          if (Math.abs(inputRef.current.steeringWheelAngle) > effectiveWheelMax + 0.01) {
             updateInput(prev => {
                 if (Math.abs(prev.steeringWheelAngle) <= effectiveWheelMax + 0.01) return prev;
                 const sign = Math.sign(prev.steeringWheelAngle) || 1;
                 return { ...prev, steeringWheelAngle: sign * Math.max(effectiveWheelMax, Math.abs(prev.steeringWheelAngle) - 1.2) };
             });
          }

          // A sub-degree release magnet covers mouse, keyboard, touch and the
          // Logitech dial even when full auto-centring is disabled. It is
          // deliberately skipped while any input is active, so crossing zero
          // remains continuous.
          if (!isInteracting) {
             const currentAngle = inputRef.current.steeringWheelAngle;
             const snappedAngle = snapSteeringCenter(currentAngle, false);
             if (snappedAngle !== currentAngle) {
                 updateInput(prev => ({ ...prev, steeringWheelAngle: snapSteeringCenter(prev.steeringWheelAngle, false) }));
             }
          }

          if (settings.steeringReleaseAssist !== false && !isInteracting) {
             if (inputRef.current.steeringWheelAngle !== 0) {
                 updateInput(prev => {
                     if (prev.steeringWheelAngle !== 0) {
                         // Hands-off return only; disabled while any steering
                         // input is active (see isInteracting above). 0 turns
                         // auto-centring off entirely.
                         const newAngle = autoCenterWheelAngle(
                             prev.steeringWheelAngle,
                             Math.abs(carSpeedRef.current),
                             Math.max(0, settings.steeringCurve.autoCenteringSpeed ?? 1),
                             33,
                             true,
                         );
                         if (newAngle === prev.steeringWheelAngle) return prev;
                         return { ...prev, steeringWheelAngle: newAngle };
                     }
                     return prev;
                 });
             }
          }
      }, 33);

      return () => clearInterval(interval);
  }, [updateInput, isPaused, settings.steeringReleaseAssist, settings.steeringCurve.autoCenteringSpeed, currentCar]);

  useEffect(() => {
      const wheelMax = effectiveSteeringWheelMaxDeg(CAR_MODELS[currentCar], Math.abs(carSpeedRef.current));
      const atLock = Math.abs(inputState.steeringWheelAngle) >= wheelMax - 0.5;
      if (settings.logitechKnobMode && atLock && !steeringAtLockRef.current) {
          steeringAtLockRef.current = true;
          window.dispatchEvent(new CustomEvent('steering-lock-feedback', {
              detail: { direction: Math.sign(inputState.steeringWheelAngle) || 1 },
          }));
          navigator.vibrate?.([38, 24, 55]);

          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) {
              const context = new AudioContextClass();
              const gain = context.createGain();
              const oscillator = context.createOscillator();
              oscillator.type = 'sine';
              oscillator.frequency.value = 115;
              gain.gain.setValueAtTime(0.0001, context.currentTime);
              gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.008);
              gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.105);
              oscillator.connect(gain);
              gain.connect(context.destination);
              oscillator.start();
              oscillator.stop(context.currentTime + 0.11);
              oscillator.addEventListener('ended', () => context.close());
          }
      } else if (!atLock || !settings.logitechKnobMode) {
          steeringAtLockRef.current = false;
      }
  }, [inputState.steeringWheelAngle, settings.logitechKnobMode, currentCar]);

  // 应用一个 LevelData 并进入 3D 游戏（编辑器测试 / 自定义关卡 / 内置关卡 共用）
  const playLevelData = (data: LevelData) => {
    flushProgress();
    window.dispatchEvent(new Event('free-drive-stop'));
    progressPose.current={...data.startPos,elevation:data.startPos.elevation??0};
    setLevelData(data);
    const initialInput = {
        throttle: 0, gasPressed: false, shiftPressed: false, brake: 0,
        steeringWheelAngle: 0, gear: 0, parkingBrake: true, handbrake: true, lights: false, engineStarted: true
    };
    setInputState(initialInput);
    inputRef.current = initialInput;
    steeringActivityRef.current.reset();
    carSpeedRef.current = 0;
    setRewardAnimation({show: false, amount: 0, type: 'good'});
    setCompletedSpots(new Set((savedMaps.current[String(data.levelId)]?.completedSpots??[]).filter(id=>data.spots.some(p=>p.id===id))));
    setIsPaused(false);
    setEditorMode(false);
    setIsInGame(true);
  };

  const startLevel = (lvl: number) => {
    playLevelData(GENERATE_LEVEL(lvl));
  };

  const resetCurrentLevel = () => {
      keyboardSteerHeldRef.current={left:false,right:false};
      keyboardPedalHeldRef.current={w:false,s:false,shift:false,handbrake:false};
      draggingRef.current=false;rightButtonDownRef.current=false;
      lookDragRef.current.active=false;touchSteerRef.current.active=false;
      parkForTravel();
      const next={...inputRef.current,engineStarted:true};
      inputRef.current=next;setInputState(next);
      window.dispatchEvent(new Event('vehicle-recover'));
      setIsPaused(false);
  };

  const continueGame = () => {
      const saved=loadProgress();if(!saved)return;
      const data=saved.customLevel??GENERATE_LEVEL(saved.levelId);
      data.startPos=progressStart(saved,data,CAR_MODELS[saved.car]);
      savedMaps.current=saved.maps;
      setCurrentCar(saved.car);setLevel(saved.levelId);setMoney(saved.money);setCameraView(saved.camera);
      setGameFromEditor(false);playLevelData(data);
  };

  useEffect(()=>{
      if(!isInGame||!levelData)return;
      let armed=false,moving=false,timer:ReturnType<typeof setTimeout>|undefined;
      const position=(event:Event)=>{
          if(moving)return;
          const d=(event as CustomEvent).detail;
          const portal=portalAt(levelData.levelId,d);
          if(!portal){armed=true;return;}
          if(!armed||!d.safe)return;
          moving=true;flushProgress();window.dispatchEvent(new Event('free-drive-stop'));setIsPaused(true);setTravelMessage('正在进入 '+portal.label);
          timer=setTimeout(()=>{
              const next=GENERATE_LEVEL(portal.target);next.startPos={...portal.arrival};
              setLevel(portal.target);setGameFromEditor(false);playLevelData(next);setTravelMessage('');
          },450);
      };
      window.addEventListener('car-map-position',position);
      return()=>{window.removeEventListener('car-map-position',position);if(timer)clearTimeout(timer);};
  },[isInGame,levelData]);

  const startGame = () => {
      setGameFromEditor(false);
      setIsInGame(true);
      startLevel(level);
  };

  const exitToTrackSelection = () => {
      setGlobalOverviewOpen(false);
      setIsPaused(false);
      setMenuEntryStep(2);
      setIsInGame(false);
  };

  // 退出当前游戏：编辑器测试发起 → 回到编辑器（保留地图状态）；否则 → 选关页
  const exitGame = () => {
      flushProgress();
      setGlobalOverviewOpen(false);
      setIsPaused(false);
      if (gameFromEditor) {
          setIsInGame(false);
          setEditorMode(true);
          setGameFromEditor(false);
      } else {
          exitToTrackSelection();
      }
  };

  // 设置 / 调校热键：暂停时也必须能按（否则打开设置后同一个键关不掉）。
  useEffect(() => {
    if (!isInGame || settings.logitechKnobMode) return;
    const onHotkey = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (isEditableTarget(event.target) || event.isComposing) return;
      const key = event.key.toLowerCase();
      const bindings = { ...DEFAULT_KEY_BINDINGS, ...(settings.keyBindings || {}) };
      if (key === bindings.settings) window.dispatchEvent(new CustomEvent('toggle-settings'));
      if (key === bindings.tuning) window.dispatchEvent(new CustomEvent('toggle-tuning'));
      if (key === bindings.reset) {event.preventDefault();resetCurrentLevel();}
    };
    window.addEventListener('keydown', onHotkey);
    return () => window.removeEventListener('keydown', onHotkey);
  }, [isInGame, settings.logitechKnobMode, settings.keyBindings]);

  // High-gear start stall: the physics loop reports it, App owns the ignition
  // state. Releasing the throttle here is deliberate: keeping W held would
  // immediately re-stall after the next restart.
  useEffect(() => {
    const handleEngineStalled = () => {
      updateInput(prev => ({ ...prev, engineStarted: false, gasPressed: false, throttle: 0 }));
    };
    window.addEventListener('engine-stalled', handleEngineStalled);
    return () => window.removeEventListener('engine-stalled', handleEngineStalled);
  }, [updateInput]);

  // Steering operations only. The name is kept for the existing call sites,
  // but throttle, gear, handbrake and camera input must never call it.
  const handleManualIntervention = useCallback(() => {
      steeringActivityRef.current.markSteering(Date.now());
  }, []);

  useEffect(() => {
    if (!isInGame || isPaused) return;

    steeringSmootherRef.current.setSmoothing(settings.steeringCurve.inputSmoothing);

    const applySteeringDelta = (delta: number) => {
        handleManualIntervention();

        const currentSpeed = Math.abs(carSpeedRef.current);
        const speedRatio = Math.min(1, currentSpeed / 8);
        const curve = settings.steeringCurve;
        const damping = curve.highSpeedFloor + (1 - curve.highSpeedFloor) / (1 + 2.2 * Math.pow(speedRatio, 1.6));

        // Per-car steering wheel lock: real lock-to-lock is capped by the car's
        // steeringRatio × maxSteerAngle (and by the input device's physical
        // range). Each car therefore stops at its own wheel-lock, not a global
        // value. Re-read on every call so a car switch is picked up instantly.
        const wheelMax = effectiveSteeringWheelMaxDeg(CAR_MODELS[currentCar], Math.abs(carSpeedRef.current));

        updateInput(prev => {
            // Manual steering uses one symmetric gain in both directions.
            // The old angle-dependent `centeringGain` made identical outward
            // and return deltas produce different angles and prevented exact
            // recentering. The three curve gains now shape a single calibrated
            // rate; turn lights remain a 12-cell display only.
            const curveGain = (curve.firstHalfGain + curve.secondHalfGain + curve.thirdHalfGain) / 3;
            const sensitivity = 0.58 * settings.steeringSensitivity * damping * (0.8 + curveGain * 0.2);
            const newAngle = applySymmetricSteeringDelta(prev.steeringWheelAngle, delta, wheelMax, sensitivity);
            if (newAngle === prev.steeringWheelAngle) return prev;
            return { ...prev, steeringWheelAngle: newAngle };
        });
    };

    let lastSteeringPumpAt = 0;
    let lastKeyboardSteerAt = 0;
    let keyboardSteerRampMs = 0;
    let keyboardSteerDirection = 0;
    const scheduleSteeringPump = () => {
        if (steeringInputFrameRef.current !== null) return;
        steeringInputFrameRef.current = requestAnimationFrame(pumpSteering);
    };
    const pumpSteering = () => {
        steeringInputFrameRef.current = null;
        const now = performance.now();
        const elapsedFrames = lastSteeringPumpAt > 0
            ? Math.max(0.1, Math.min(4, (now - lastSteeringPumpAt) / (1000 / 60)))
            : 1;
        lastSteeringPumpAt = now;
        const slice = steeringSmootherRef.current.take(elapsedFrames);
        if (Math.abs(slice) > 0.001) applySteeringDelta(slice);
        if (steeringSmootherRef.current.hasPending()) scheduleSteeringPump();
    };
    const queueSteeringDelta = (delta: number) => {
        if (!Number.isFinite(delta) || Math.abs(delta) < 0.001) return;
        steeringSmootherRef.current.push(delta);
        scheduleSteeringPump();
    };
    const flushSteeringDelta = () => {
        if (steeringInputFrameRef.current !== null) {
            cancelAnimationFrame(steeringInputFrameRef.current);
            steeringInputFrameRef.current = null;
        }
        lastSteeringPumpAt = 0;
        const remaining = steeringSmootherRef.current.flush();
        if (Math.abs(remaining) > 0.001) applySteeringDelta(remaining);
    };
    const resetSteeringDelta = () => {
        if (steeringInputFrameRef.current !== null) {
            cancelAnimationFrame(steeringInputFrameRef.current);
            steeringInputFrameRef.current = null;
        }
        lastSteeringPumpAt = 0;
        steeringSmootherRef.current.reset();
    };

    const notifySteeringFallback = () => {
        if (steeringFallbackNotifiedRef.current) return;
        steeringFallbackNotifiedRef.current = true;
        window.dispatchEvent(new CustomEvent('steering-fallback-notice'));
    };

    // Held-key steering fallback for browsers/windows where pointer lock is
    // unavailable or was dismissed. It is time-scaled to 60 Hz so 120 Hz
    // displays do not steer twice as fast, and does not occupy A/D/arrows.
    const keyboardSteerTick = () => {
        steeringKeyboardFrameRef.current = null;
        const held = keyboardSteerHeldRef.current;
        const direction = (held.right ? 1 : 0) - (held.left ? 1 : 0);
        if (direction === 0) {
            lastKeyboardSteerAt = 0;
            return;
        }
        const now = performance.now();
        const elapsedFrames = lastKeyboardSteerAt > 0
            ? Math.max(0.05, Math.min(4, (now - lastKeyboardSteerAt) / (1000 / 60)))
            : 1;
        lastKeyboardSteerAt = now;
        if (direction !== keyboardSteerDirection) {
            keyboardSteerDirection = direction;
            keyboardSteerRampMs = 0;
        }
        keyboardSteerRampMs += elapsedFrames * (1000 / 60);
        // Short tap = fine correction; held key ramps progressively to the
        // full keyboard rate over ~0.9 s.
        const ramp = 0.30 + 0.70 * Math.min(1, keyboardSteerRampMs / 900);
        handleManualIntervention();
        queueSteeringDelta(direction * KEYBOARD_STEER_DELTA_PER_FRAME * ramp * elapsedFrames);
        steeringKeyboardFrameRef.current = requestAnimationFrame(keyboardSteerTick);
    };
    const ensureKeyboardSteerLoop = () => {
        if (steeringKeyboardFrameRef.current !== null) return;
        lastKeyboardSteerAt = 0;
        steeringKeyboardFrameRef.current = requestAnimationFrame(keyboardSteerTick);
    };

    // 3D 模式：滚轮已由 canvas 接管用于缩放。右键按住后进入
    // pointer lock，因此鼠标到达屏幕边缘仍可继续打方向。如果 pointer lock
    // 被拒绝/不可用，右键拖拽仍然有效，并会提示可发现的键盘降级。
    const handleMouseDown = (e: MouseEvent) => {
        if(isTouchDevice())return;
        // Plain left drag is the look gesture now: in an exterior camera it
        // orbits 360° around the car; in HOOD it turns the driver's head with
        // low sensitivity. UI drags never reach here because the target must
        // be the game canvas, and right-button steering stays independent.
        if (e.button === 0 && !e.altKey && e.target instanceof HTMLCanvasElement
          && !rightButtonDownRef.current && !(document.pointerLockElement instanceof HTMLCanvasElement)) {
            e.preventDefault();
            lookDragRef.current = {
                active: true,
                lastX: e.clientX,
                lastY: e.clientY,
                mode: cameraDragMode(cameraViewStateRef.current,inspectionRef.current),
                moved: false,
            };
            return;
        }
        // Ignore right-clicks that originate inside overlay UI (tuning panel,
        // settings modal, mirror adjuster, etc.) so those controls keep working
        // instead of triggering pointer-lock steering.
        if (e.button === 2 && e.target instanceof HTMLCanvasElement) {
            e.preventDefault();
            rightButtonDownRef.current = true;
            draggingRef.current = true;
            handleManualIntervention();
            const canvas = e.target;
            if (typeof canvas.requestPointerLock !== 'function') {
                notifySteeringFallback();
                return;
            }
            try {
                const request = canvas.requestPointerLock() as unknown;
                if (request && typeof (request as Promise<void>).catch === 'function') {
                    (request as Promise<void>).catch(() => notifySteeringFallback());
                }
            } catch {
                notifySteeringFallback();
            }
        }
    };

    const releaseMouseSteering = (flush = false) => {
        rightButtonDownRef.current = false;
        draggingRef.current = false;
        if (flush) flushSteeringDelta(); else resetSteeringDelta();
        if (document.pointerLockElement instanceof HTMLCanvasElement) document.exitPointerLock();
    };
    const handleDoubleClick = (e: MouseEvent) => {
        if (e.button !== 0 || !(e.target instanceof HTMLCanvasElement) || cameraViewStateRef.current !== 'HOOD') return;
        e.preventDefault();
        lookDragRef.current.active = false;
        resetHeadLook(true);
    };
    const handleMouseUp = (e: MouseEvent) => {
        if (e.button === 0) lookDragRef.current.active = false;
        // Only release steering if the right button was actually held. A click
        // inside the tuning panel's number input must not abort a turn.
        if (e.button === 2 && (rightButtonDownRef.current || draggingRef.current || Boolean(document.pointerLockElement))) {
            // Flush the queued displacement instead of cancelling it: a quick
            // flick followed by mouse-up used to lose its final movement.
            releaseMouseSteering(true);
        }
    };

    const handleMouseMove = (e: MouseEvent) => {
        if ((rightButtonDownRef.current || document.pointerLockElement instanceof HTMLCanvasElement)
            && !pointerButtonStillHeld(rightButtonDownRef.current, e.buttons, 2)) releaseMouseSteering();
        if (lookDragRef.current.active && !pointerButtonStillHeld(true,e.buttons,1)) lookDragRef.current.active = false;
        if (lookDragRef.current.active) {
            const dx = e.clientX - lookDragRef.current.lastX;
            const dy = e.clientY - lookDragRef.current.lastY;
            lookDragRef.current.lastX = e.clientX;
            lookDragRef.current.lastY = e.clientY;
            if (lookDragRef.current.mode === 'head') {
                // Interior look is deliberately low-sensitivity: about
                // 0.11°/px yaw and 0.05°/px pitch. The pitch limits live in
                // utils/headLook.ts (15° down / 10° up).
                adjustHeadLook(-dx * 0.11, -dy * 0.05);
                return;
            }
            if (!lookDragRef.current.moved && Math.hypot(dx, dy) >= 1.5) {
                lookDragRef.current.moved = true;
                setCameraView('ORBIT');
            }
            if (lookDragRef.current.moved) {
                window.dispatchEvent(new CustomEvent('camera-orbit-nudge', {
                    detail: { dx, dy },
                }));
            }
            return;
        }
        if (pointerButtonStillHeld(rightButtonDownRef.current, e.buttons, 2)) {
            handleManualIntervention();
            // Accumulate hardware-rate events; the time-scaled smoother applies
            // a stable slice per animation frame without discarding the tail.
            queueSteeringDelta(e.movementX * 1.7);
        }
    };

    const handlePointerLockChange = () => {
        if (!document.pointerLockElement || !rightButtonDownRef.current) releaseMouseSteering();
    };
    const handleMousePointerEnd = (e: PointerEvent) => {
        if (e.pointerType !== 'mouse') return;
        if ((rightButtonDownRef.current || draggingRef.current || document.pointerLockElement instanceof HTMLCanvasElement)
          && (e.type === 'pointercancel' || (e.buttons & 2) === 0)) releaseMouseSteering(e.type === 'pointerup');
        if (e.type === 'pointercancel' || (e.buttons & 1) === 0) lookDragRef.current.active=false;
    };

    let touchTap={time:0,x:0,y:0};
    const handleTouchPointerDown = (e: PointerEvent) => {
        if (e.pointerType !== 'touch' || !(e.target instanceof HTMLCanvasElement) || touchSteerRef.current.active) return;
        e.preventDefault();
        touchSteerRef.current = { active: true, pointerId: e.pointerId, lastX: e.clientX };
        lookDragRef.current={active:true,lastX:e.clientX,lastY:e.clientY,mode:cameraViewStateRef.current==='HOOD'?'head':'orbit',moved:false};
        try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch { /* optional */ }
    };
    const handleTouchPointerMove = (e: PointerEvent) => {
        if (!touchSteerRef.current.active || e.pointerId !== touchSteerRef.current.pointerId) return;
        const dx = e.clientX - touchSteerRef.current.lastX;
        touchSteerRef.current.lastX = e.clientX;
        const dy=e.clientY-lookDragRef.current.lastY;lookDragRef.current.lastY=e.clientY;
        if(Math.abs(dx)+Math.abs(dy)>2)lookDragRef.current.moved=true;
        if(lookDragRef.current.mode==='head')adjustHeadLook(-dx*.11,-dy*.05);
        else {setCameraView('ORBIT');window.dispatchEvent(new CustomEvent('camera-orbit-nudge',{detail:{dx,dy}}));}
    };
    const handleTouchPointerUp = (e: PointerEvent) => {
        if (!touchSteerRef.current.active || e.pointerId !== touchSteerRef.current.pointerId) return;
        if(e.type==='pointerup'&&!lookDragRef.current.moved){
          const now=performance.now();
          if(now-touchTap.time<330&&Math.hypot(e.clientX-touchTap.x,e.clientY-touchTap.y)<28){resetHeadLook(true);touchTap.time=0;}
          else touchTap={time:now,x:e.clientX,y:e.clientY};
        }
        touchSteerRef.current.active = false;
        lookDragRef.current.active = false;
    };

    const handlePointerLockError = () => notifySteeringFallback();

    const handleContextMenu = (e: MouseEvent) => {
        if (e.target instanceof HTMLCanvasElement) e.preventDefault();
    };
    const knobDirectionForEvent = (event: KeyboardEvent) => {
        if (!settings.logitechKnobMode) return 0;
        const key = event.key.toLowerCase();
        const code = event.code.toLowerCase();
        if (['audiovolumeup', 'volumeup', 'mediatracknext'].includes(key)
            || ['audiovolumeup', 'volumeup', 'mediatracknext'].includes(code)) return 1;
        if (['audiovolumedown', 'volumedown', 'mediatrackprevious'].includes(key)
            || ['audiovolumedown', 'volumedown', 'mediatrackprevious'].includes(code)) return -1;
        return 0;
    };

    const mapDrivingKey = (key: string) => {
        if (!settings.logitechKnobMode) return key;
        const rightHandMap: Record<string, string> = {
            o: 'q', i: 'w', k: 's', j: 'd', l: 'a', m: 'b', p: 'v',
        };
        return rightHandMap[key] ?? key;
    };

    const requestGearChange = (target: number) => {
        const current = inputRef.current;
        if (target === current.gear) return;
        const reason = gearRejectionReason(getPowertrain(currentCar), carSpeedRef.current, target);
        if (reason) {
            window.dispatchEvent(new CustomEvent('gear-shift-rejected', {
                detail: {
                    reason,
                    requested: target,
                    current: current.gear,
                    speedKmh: Math.abs(carSpeedRef.current) * 15,
                },
            }));
            return;
        }
        const targetTop = getPowertrain(currentCar).gearTops[Math.abs(target) - 1];
        if (target > 0 && target < current.gear && targetTop && Math.abs(carSpeedRef.current) > targetTop * 0.90) {
            window.dispatchEvent(new CustomEvent('gear-shift-warning', {
                detail: { reason: 'over-rev', requested: target, current: current.gear, speedKmh: Math.abs(carSpeedRef.current) * 15 },
            }));
        }
        updateInput(prev => ({ ...prev, gear: target }));
    };

    const applyKeyboardPedals = () => {
        const intent = resolveKeyboardPedals(
          keyboardPedalHeldRef.current.w,
          keyboardPedalHeldRef.current.s,
          keyboardPedalHeldRef.current.shift,
        );
        updateInput(prev => ({
            ...prev,
            gasPressed: intent.gasPressed && touchSnapshotRef.current.brake===0 && touchSnapshotRef.current.throttle<intent.throttle,
            shiftPressed: intent.shiftPressed,
            throttle: intent.brake>0 ? 0 : touchSnapshotRef.current.throttle,
            brake: Math.max(intent.brake,touchSnapshotRef.current.brake),
        }));
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        // Number/range/text fields own their keystrokes. Without this guard,
        // typing in the live-tuning panel also changed camera/gear/throttle.
        // IME composition is likewise left to the editor.
        if (document.hidden || isEditableTarget(e.target) || e.isComposing) return;
        // Alt+J / Alt+L / Alt+K are deliberate look-only bindings. They avoid
        // the Logitech mode's j/l/k driving actions and all custom bindings.
        if (e.altKey && !e.repeat) {
            const lookKey = e.key.toLowerCase();
            if (lookKey === 'c') {
                e.preventDefault();
                steeringSmootherRef.current.reset();
                keyboardSteerHeldRef.current.left = false;
                keyboardSteerHeldRef.current.right = false;
                updateInput(prev => ({ ...prev, steeringWheelAngle: 0 }));
                return;
            }
            if (lookKey === 'j' || lookKey === 'l' || lookKey === 'k') {
                e.preventDefault();
                if (lookKey === 'j') setHeadLookTarget(75, 0);
                else if (lookKey === 'l') setHeadLookTarget(-75, 0);
                else resetHeadLook();
                return;
            }
        }
        const knobDirection = knobDirectionForEvent(e);
        if (knobDirection !== 0) {
            e.preventDefault();
            queueSteeringDelta(knobDirection * KNOB_STEER_STEP_DEG);
            return;
        }
        const rawKey = e.key.toLowerCase();
        const k = mapDrivingKey(rawKey);
        const bindings = { ...DEFAULT_KEY_BINDINGS, ...(settings.keyBindings || {}) } as KeyBindings;
        const action = (Object.keys(bindings) as Array<keyof KeyBindings>)
            .find(name => bindings[name] === k) ?? null;

        // Fixed auxiliary shortcuts must not steal a user-assigned driving key.
        if (!action && !e.repeat && ['[', ']', 'k'].includes(k)) {
            e.preventDefault();
            updateInput(v => k === 'k' ? {...v, wipers: !v.wipers}
                : {...v, indicator: v.indicator === (k === '[' ? -1 : 1) ? 0 : (k === '[' ? -1 : 1)});
            return;
        }

        // Shift/W/S pedal state is tracked independently so Shift pressed
        // before W, Shift released after W, or W+S cannot leave a stuck pedal.
        if (k === 'shift') {
            keyboardPedalHeldRef.current.shift = true;
            applyKeyboardPedals();
            return;
        }
        if (action === 'accelerate' || k === 'arrowup') {
            keyboardPedalHeldRef.current.w = true;
            // Pedal input deliberately does not mark steering activity.
            applyKeyboardPedals();
            return;
        }
        if (action === 'brake' || k === 'arrowdown') {
            keyboardPedalHeldRef.current.s = true;
            applyKeyboardPedals();
            return;
        }
        if (action === 'handbrake') {
            if (!shouldHandleHandbrakeKey(isInGame, isPaused, isEditableTarget(e.target))) return;
            e.preventDefault();
            keyboardPedalHeldRef.current.handbrake = true;
            updateInput(prev => ({ ...prev, handbrake: true }));
            return;
        }
        if (e.repeat) return;
        if (action === 'parkingBrake') {
            e.preventDefault();
            updateInput(prev => ({...prev,parkingBrake:!prev.parkingBrake,handbrake:parkingBrakeApplied(!prev.parkingBrake,keyboardPedalHeldRef.current.handbrake)}));
            return;
        }

        // Independent keyboard steering fallback (comma/period). If the player
        // deliberately bound one of these keys to a driving action, that bind
        // wins and the fallback stays out of the way.
        if (!action && (k === STEER_LEFT_KEY || k === STEER_RIGHT_KEY)) {
            e.preventDefault();
            if (k === STEER_LEFT_KEY) keyboardSteerHeldRef.current.left = true;
            else keyboardSteerHeldRef.current.right = true;
            keyboardSteerRampMs = 0;
            ensureKeyboardSteerLoop();
            return;
        }

        if (action === 'camera') {
            resetHeadLook(true);
            const cameraOrder: CameraView[] = [
                'REAR_RIGHT', 'REAR_LEFT', 'FRONT_LEFT', 'FRONT_RIGHT',
                'FOLLOW_FAR', 'FOLLOW_NEAR', 'TOP', 'SIDE_LEFT', 'SIDE_RIGHT',
                'HOOD', 'REVERSE',
            ];
            setCameraView(previous => {
                const available=inspectionRef.current?cameraOrder.filter(v=>v!=='HOOD'):cameraOrder;
                const index = available.indexOf(previous);
                return available[(index + 1 + available.length) % available.length];
            });
        }

        if (action === 'gearUp' || k === 'arrowright') {
            const gear = inputRef.current.gear;
            requestGearChange(gear === -1 ? 0 : Math.min(getPowertrain(currentCar).gearTops.length, gear + 1));
        }
        if (action === 'gearDown' || k === 'arrowleft') {
            const gear = inputRef.current.gear;
            if (gear > -1) requestGearChange(gear - 1);
        }
        if (!action && k === 'q') requestGearChange(-1);
        if (!action && k === 'v') requestGearChange(0);
        if (action === 'lights') updateInput(prev => {const mode=((prev.headlightMode??(prev.lights?1:0))+1)%3 as 0|1|2;return {...prev,lights:mode!==0,headlightMode:mode};});
        if (action === 'engine') updateInput(prev => ({ ...prev, engineStarted: !prev.engineStarted }));
    };

    const handleKeyUp = (e: KeyboardEvent) => {
         // Release paths are intentionally NOT focus-guarded: if focus moves
         // into a number field while W is held, releasing W must still clear
         // the throttle instead of leaving it stuck on.
         const k = mapDrivingKey(e.key.toLowerCase());
         if (k === STEER_LEFT_KEY) keyboardSteerHeldRef.current.left = false;
         if (k === STEER_RIGHT_KEY) keyboardSteerHeldRef.current.right = false;
         if (!keyboardSteerHeldRef.current.left && !keyboardSteerHeldRef.current.right) {
            lastKeyboardSteerAt = 0;
            keyboardSteerRampMs = 0;
            keyboardSteerDirection = 0;
        }
         const bindings = { ...DEFAULT_KEY_BINDINGS, ...(settings.keyBindings || {}) } as KeyBindings;
         if (k === 'shift') {
             keyboardPedalHeldRef.current.shift = false;
             applyKeyboardPedals();
             return;
         }
         if (k === bindings.accelerate || k === 'arrowup') {
             keyboardPedalHeldRef.current.w = false;
             applyKeyboardPedals();
             return;
         }
         if (k === bindings.brake || k === 'arrowdown') {
             keyboardPedalHeldRef.current.s = false;
             applyKeyboardPedals();
             return;
         }
         if (k === bindings.handbrake) {
             if (shouldHandleHandbrakeKey(isInGame, isPaused, isEditableTarget(e.target))) e.preventDefault();
             keyboardPedalHeldRef.current.handbrake = false;
             updateInput(prev => ({ ...prev, handbrake: false }));
             return;
         }
    };

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('dblclick', handleDoubleClick);
    window.addEventListener('pointerup', handleMousePointerEnd);
    window.addEventListener('pointercancel', handleMousePointerEnd);
    window.addEventListener('pointerdown', handleTouchPointerDown, { passive: false });
    window.addEventListener('pointermove', handleTouchPointerMove, { passive: false });
    window.addEventListener('pointerup', handleTouchPointerUp);
    window.addEventListener('pointercancel', handleTouchPointerUp);
    window.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('pointerlockchange', handlePointerLockChange);
    document.addEventListener('pointerlockerror', handlePointerLockError);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
        if (steeringInputFrameRef.current !== null) {
            cancelAnimationFrame(steeringInputFrameRef.current);
            steeringInputFrameRef.current = null;
        }
        if (steeringKeyboardFrameRef.current !== null) {
            cancelAnimationFrame(steeringKeyboardFrameRef.current);
            steeringKeyboardFrameRef.current = null;
        }
        resetSteeringDelta();
        releaseMouseSteering();
        window.removeEventListener('mousedown', handleMouseDown);
        window.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('dblclick', handleDoubleClick);
        window.removeEventListener('pointerup', handleMousePointerEnd);
        window.removeEventListener('pointercancel', handleMousePointerEnd);
        window.removeEventListener('pointerdown', handleTouchPointerDown);
        window.removeEventListener('pointermove', handleTouchPointerMove);
        window.removeEventListener('pointerup', handleTouchPointerUp);
        window.removeEventListener('pointercancel', handleTouchPointerUp);
        window.removeEventListener('contextmenu', handleContextMenu);
        document.removeEventListener('pointerlockchange', handlePointerLockChange);
        document.removeEventListener('pointerlockerror', handlePointerLockError);
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isInGame, settings.steeringSensitivity, settings.steeringCurve, settings.logitechKnobMode, updateInput, isPaused, handleManualIntervention, currentCar]);

  const handleCrash = useCallback((cost: number) => {
      setMoney(m => Math.max(0, m - cost)); 
  }, []);

  const handleParkingSuccess = useCallback((spotId: string, reward: number, type: ParkingResultType) => {
      setMoney(m => m + reward);
      setRewardAnimation({show: true, amount: reward, type});
      if (type === 'perfect' || type === 'good') {
        setCompletedSpots(prev => new Set(prev).add(spotId));
      }
      setTimeout(() => setRewardAnimation({show: false, amount: 0, type: 'good'}), 2500);
  }, []);

  // Travel / garage actions are allowed while paused. The normal driving
  // updater deliberately rejects paused input, so use an explicit safe reset.
  const parkForTravel = () => {
      const next = {...inputRef.current, gear:0, throttle:0, gasPressed:false, shiftPressed:false, brake:0, parkingBrake:true, handbrake:true, steeringWheelAngle:0};
      inputRef.current = next;
      setInputState(next);
      steeringSmootherRef.current.reset();
      steeringActivityRef.current.reset();
      window.dispatchEvent(new Event('free-drive-stop'));
  };

  // 选车时同时载入该车型的专属转向曲线默认值（每辆车都有自己的手感）
  const handleSetCar = useCallback((c: CarType) => {
      setCurrentCar(c);
      setSettings(prev => ({ ...prev, steeringCurve: { ...DEFAULT_STEERING_CURVES[c] }, hoodCameraAdjustment: hoodCameraDefaultForCar(c) }));
  }, []);

  return (
    <div className="w-full h-full overflow-hidden relative select-none cursor-crosshair" style={{ background: 'var(--bg)' }}>
      {/* 地图编辑器：编辑中正常显示；测试游玩期间隐藏挂载以保留地图状态（inactive 关闭其全局热键/画布循环） */}
      {(editorMode || gameFromEditor) && (
        <div style={{ display: editorMode && !isInGame ? 'block' : 'none', width: '100%', height: '100%' }}>
          <ErrorBoundary label="地图编辑器" onRecover={() => setEditorMode(false)}>
            <MapEditor
              inactive={isInGame}
              onBack={() => setEditorMode(false)}
              onPlayLevel={(ld) => { setGameFromEditor(true); playLevelData(ld); }}
            />
          </ErrorBoundary>
        </div>
      )}
      {!editorMode && !isInGame && (
        <MainMenu
            openSettings={()=>setMenuSettings(true)}
            start={startGame}
            savedGame={savedGame} onContinue={continueGame}
            settings={settings}
            updateSettings={(s) => setSettings(prev => ({...prev, ...s}))}
            currentCar={currentCar}
            setCar={handleSetCar}
            lang={lang}
            setLang={setLang}
            selectedLevel={level}
            setSelectedLevel={setLevel}
            initialStep={menuEntryStep}
            onOpenEditor={(currentStep) => {
              setMenuEntryStep(currentStep as 0|1|2);
              setEditorMode(true);
            }}
            onPlayCustom={(record) => { setGameFromEditor(false); playLevelData(serializeToLevelData(record)); }}
        />
      )}
      {travelMessage&&<div className="map-transition" role="status">{travelMessage}<small>已保存上一地图进度 · 到达后松开踏板重新起步</small></div>}
      {isInGame&&!isPaused&&levelData?.openWorld&&<MountainAdventurePanel/>}
      <ReleaseNotes/>
      {!isInGame&&menuSettings&&<SettingsPage inGame={false} onLayout={()=>{}} settings={settings} update={patch=>setSettings(v=>({...v,...patch}))}
        car={currentCar} level={level} openWorld={false} onCar={handleSetCar} onMap={setLevel} onTravel={()=>{}}
        close={()=>setMenuSettings(false)} reset={()=>{}} exit={()=>setMenuSettings(false)} lang={lang} setLang={setLang}
        capture={menuCapture} bind={setMenuCapture} guide={()=>{setMenuSettings(false);setMenuGuide(true);}}/>}
      {!isInGame&&menuGuide&&<DrivingGuide settings={settings} done={()=>setMenuGuide(false)}/>}
      {isInGame && (
        <ErrorBoundary label="游戏视图" onRecover={exitGame}>
          {levelData && (
              <GameCanvas3D
                levelData={levelData}
                settings={settings}
                currentCarId={currentCar}
                weather={weather}
                dayTime={dayTime}
                inputRef={inputRef}
                onCrash={handleCrash}
                onRecover={resetCurrentLevel}
                onInspectionChange={handleInspectionChange}
                onParkingSuccess={handleParkingSuccess}
                carSpeedRef={carSpeedRef}
                isPaused={isPaused}
                cameraView={cameraView}
                overviewCanvasRef={overviewCanvasRef}
                globalOverviewCanvasRef={globalOverviewCanvasRef}
                globalOverviewOpen={globalOverviewOpen}
                completedSpots={completedSpots}
              />
          )}
          <UIOverlay
            savedExam={savedMaps.current[String(levelData?.levelId)]?.exam}
            saveMessage={saveMessage}
            money={money}
            level={level}
            settings={settings}
            updateSettings={(s) => setSettings(prev => ({...prev, ...s}))}
            inputState={inputState}
            setInputState={value => updateInput(prev => typeof value === 'function' ? value(prev) : value)}
            onTouchInput={updateTouchInput}
            readInput={()=>inputRef.current}
            exitGame={exitGame}
            resetLevel={resetCurrentLevel}
            lang={lang}
            setLang={setLang}
            showReward={rewardAnimation}
            carSpeed={carSpeedRef.current}
            onSettingsToggle={setIsPaused}
            currentCarId={currentCar}
            onChangeCar={c => {
              parkForTravel();
              handleSetCar(c);
            }}
            onChangeMap={id => { setLevel(id); startLevel(id); setIsPaused(true); }}
            onTravel={pose => {
              parkForTravel();
              window.dispatchEvent(new CustomEvent('test-teleport', {detail:pose}));
            }}
            levelData={levelData}
            cameraView={cameraView}
            onCameraViewChange={view=>setCameraView(inspectionRef.current&&view==='HOOD'?'FOLLOW_FAR':view)}
            overviewCanvasRef={overviewCanvasRef}
            globalOverviewCanvasRef={globalOverviewCanvasRef}
            globalOverviewOpen={globalOverviewOpen}
            setGlobalOverviewOpen={setGlobalOverviewOpen}
            completedSpots={completedSpots}
          />
        </ErrorBoundary>
      )}
    </div>
  );
}

export default App;
