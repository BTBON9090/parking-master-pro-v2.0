import {SettingsPage} from './SettingsPage';
import {DrivingGuide,GUIDE_VERSION} from './DrivingGuide';
import { garageFloorAt } from '../utils/garage';
import { WORLD_ROUTES, WORLD_PLACES, WORLD_DESTINATIONS, WORLD_PUDDLES, mapCurveSamples } from '../utils/openWorld';
import React, { useRef, useState, useEffect, useMemo } from 'react';
import { UserSettings, InputState, Language, ParkingResultType, CarType, LevelData, CameraView, MirrorId, Marking } from '../types';
import { STEERING_WHEEL_MAX_ROTATION, TRANSLATIONS, CAR_MODELS, GARAGE_CARS, LEVEL_LIST, DEFAULT_KEY_BINDINGS } from '../constants';
import { getPowertrain, computeRpm, steeringWheelMaxDeg, isElectricVehicle } from '../utils/powertrain';
import TuningPanel from './TuningPanel';
import { resolveCockpitPack } from './cockpit/stylePacks';
import { publishMirrorGlassLayout } from '../utils/mirrorLayout';
import { firstPersonClusterScale } from '../utils/hudLayout';
import { SideMirrorFrame, CentreMirrorFrame, CockpitCluster } from './cockpit/CockpitParts';
import { Settings, X, Zap, Pause, Power, Volume2, Gauge, ChevronUp, ChevronDown, RotateCcw, Keyboard, Sliders, Map, Scan, LocateFixed, Camera, MoveUpRight, MoveUpLeft, MoveDownRight, MoveDownLeft, CarFront, Eye, Maximize2, Languages, AlertTriangle } from 'lucide-react';

interface UIOverlayProps {
  money: number;
  level: number;
  settings: UserSettings;
  updateSettings: (s: Partial<UserSettings>) => void;
  inputState: InputState;
  setInputState: React.Dispatch<React.SetStateAction<InputState>>;
  exitGame: () => void;
  resetLevel: () => void;
  lang: Language;
  setLang: (l: Language) => void;
  showReward: { show: boolean; amount: number; type: ParkingResultType };
  carSpeed: number;
  onSettingsToggle: (isOpen: boolean) => void;
  currentCarId: CarType;
  onChangeCar: (car:CarType)=>void;
  onChangeMap: (map:number)=>void;
  onTravel: (pose:{x:number;y:number;rotation:number})=>void;
  levelData: LevelData | null;
  cameraView: CameraView;
  onCameraViewChange: (view: CameraView) => void;
  overviewCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  globalOverviewCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  globalOverviewOpen: boolean;
  setGlobalOverviewOpen: (open: boolean) => void;
  completedSpots: Set<string>;
}


// ============================================================
// 路线地图：按真实道路交通标线绘制
// ------------------------------------------------------------
// 地图直接读取关卡里的标线数据（停止线 / 人行横道 / 导向箭头 /
// 虚实线 / 让行线 / 中心圈），用国标配色（白 #f8fafc、黄 #f5c842）
// 画在路面上，而不是只画灰色色块。世界单位 1 unit = 0.1 m。
// ============================================================
const MAP_WHITE = '#dfe7ef';
const MAP_YELLOW = '#e6c249';

/**
 * 把一条关卡标线画到 2D 路线图上。
 * 地图比例很小（1 像素≈3 米），所以标线改用「1~2 像素描边 + 虚线样式」
 * 的制图语言表达，而不是按真实尺寸铺色块——后者会糊成一片。
 */
function mapMarking(ctx: CanvasRenderingContext2D, m: Marking, px: number): void {
  if (m.width <= 0 || m.height <= 0) return;
  const w = m.width;
  const h = m.height;
  const horizontal = w >= h;
  const long = Math.max(w, h);
  const color = m.type === 'line-double' ? MAP_YELLOW : (m.color && m.color.toLowerCase() !== '#ffffff' ? m.color : MAP_WHITE);
  const lw = 1.3 / px;                       // 1.3 像素线宽（世界单位）
  const dash = [7 / px, 5 / px];

  ctx.save();
  ctx.translate(m.x, m.y);
  ctx.rotate(m.rotation);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'butt';

  const strokeAxis = (across: number, dashed: boolean) => {
    ctx.setLineDash(dashed ? dash : []);
    ctx.beginPath();
    if (horizontal) {
      ctx.moveTo(-w / 2, across);
      ctx.lineTo(w / 2, across);
    } else {
      ctx.moveTo(across, -h / 2);
      ctx.lineTo(across, h / 2);
    }
    ctx.stroke();
  };

  switch (m.type) {
    case 'line-solid': strokeAxis(0, false); break;
    case 'line-dashed': strokeAxis(0, true); break;
    case 'line-double':
      strokeAxis(-1.4 / px, false);
      strokeAxis(1.4 / px, false);
      break;
    case 'stop':
      ctx.fillRect(-w / 2, -Math.max(h, 2.6 / px) / 2, w, Math.max(h, 2.6 / px));
      break;
    case 'crosswalk':
    case 'zebra': {
      // 斑马线：在纵深方向画 4 条短条，地图上一眼能认出来
      const depth = horizontal ? h : w;
      const span = horizontal ? w : h;
      const bars = 4;
      for (let i = 0; i < bars; i++) {
        const t = (i + 0.5) / bars;
        const pos = -span / 2 + t * span;
        if (horizontal) ctx.fillRect(pos - 1.6 / px, -depth / 2, 3.2 / px, depth);
        else ctx.fillRect(-depth / 2, pos - 1.6 / px, depth, 3.2 / px);
      }
      break;
    }
    case 'arrow-straight':
    case 'arrow-left':
    case 'arrow-right':
    case 'arrow-turn':
    case 'arrow-uturn':
    case 'arrow-merge-left':
    case 'arrow-merge-right': {
      const len = Math.max(h, 16) * 0.7;
      const head = len * 0.45;
      ctx.setLineDash([]);
      ctx.lineWidth = 2 / px;
      ctx.beginPath();
      ctx.moveTo(0, len / 2);
      ctx.lineTo(0, -len / 2 + head);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-head * 0.8, -len / 2 + head);
      ctx.lineTo(0, -len / 2 - head * 0.2);
      ctx.lineTo(head * 0.8, -len / 2 + head);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'yield': {
      const size = 10 / px;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(-size, -size * 0.5);
      ctx.lineTo(size, -size * 0.5);
      ctx.lineTo(0, size * 0.7);
      ctx.closePath();
      ctx.stroke();
      break;
    }
    case 'roundabout':
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(w, 10) / 2, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'channelize':
      ctx.globalAlpha = 0.5;
      ctx.setLineDash(dash);
      strokeAxis(0, true);
      break;
    default:
      ctx.globalAlpha = 0.6;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      break;
  }
  ctx.restore();
}

const Toggle: React.FC<{label: string, checked: boolean, onChange: (v: boolean) => void}> = ({label, checked, onChange}) => (
    <label className="flex justify-between items-center cursor-pointer">
        <span className="text-sm font-medium transition-colors" style={{ color: checked ? 'var(--text)' : 'var(--text-dim)' }}>{label}</span>
        <span className="relative inline-flex items-center">
            <input type="checkbox" className="sr-only" checked={checked} onChange={e => onChange(e.target.checked)} />
            <span className="block w-11 h-6 rounded-full transition-colors" style={{ background: checked ? 'var(--amber)' : 'var(--panel-3)' }}></span>
            <span className="absolute left-1 top-1 block w-4 h-4 rounded-full bg-black transition-transform" style={{ transform: checked ? 'translateX(20px)' : 'translateX(0)' }}></span>
        </span>
    </label>
);

/** Sectioned settings group: a small uppercase header with an icon, then a
 *  stacked list of controls separated by hairlines. */
const SettingsSection: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
    <section className="space-y-3">
        <div className="flex items-center gap-2">
            <span style={{ color: 'var(--amber)' }}>{icon}</span>
            <span className="mono text-[10px] font-bold tracking-[0.2em]" style={{ color: 'var(--text-mute)' }}>{title.toUpperCase()}</span>
        </div>
        <div className="space-y-3 pl-1">
            {children}
        </div>
    </section>
);

/** 车状态指示灯：无背景悬浮灯。熄灭 = 暗色轮廓，点亮 = 彩色发光。 */
const Telltale: React.FC<{ on: boolean; color: string; icon: React.ReactNode; label: string; onClick?: () => void; onHold?: (held:boolean)=>void }> = ({ on, color, icon, label, onClick, onHold }) => (
    <div className="flex flex-col items-center gap-[3px] w-9" onClick={onClick} onPointerDown={e=>{if(onHold){e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);onHold(true);}}} onPointerUp={()=>onHold?.(false)} onPointerCancel={()=>onHold?.(false)} onLostPointerCapture={()=>onHold?.(false)} style={{ cursor: onClick ? 'pointer' : undefined }} role={onClick || onHold ? 'button' : undefined} tabIndex={onClick || onHold ? 0 : undefined}>
        <div
            className="w-[26px] h-[26px] rounded-full flex items-center justify-center transition-all duration-150"
            style={on
                ? { color: '#0b0b0d', background: color, boxShadow: `0 0 14px ${color}, 0 0 4px ${color}` }
                : { color: 'rgba(255,255,255,0.30)', background: 'rgba(5,6,8,0.42)', border: '1px solid rgba(255,255,255,0.13)' }}
        >
            {icon}
        </div>
        <span
            className="mono text-[7px] font-bold tracking-[0.12em]"
            style={{ color: on ? color : 'rgba(255,255,255,0.32)', textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}
        >
            {label}
        </span>
    </div>
);

const UIOverlay: React.FC<UIOverlayProps> = ({
  money,
  level,
  settings,
  updateSettings,
  inputState,
  setInputState,
  exitGame,
  resetLevel,
  lang,
  setLang,
  showReward,
  carSpeed,
  onSettingsToggle,
  currentCarId, onChangeCar, onChangeMap, onTravel,
  levelData,
  cameraView,
  onCameraViewChange,
  overviewCanvasRef,
  globalOverviewCanvasRef,
  globalOverviewOpen,
  setGlobalOverviewOpen,
  completedSpots,
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const [showGuide,setShowGuide]=useState(()=>localStorage.getItem(GUIDE_VERSION)!=="done");
  // 按键绑定：点击某一行后捕获下一个按键
  const [captureBinding, setCaptureBinding] = useState<keyof typeof DEFAULT_KEY_BINDINGS | null>(null);
  useEffect(() => {
    if (!captureBinding) return;
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const key = event.key.toLowerCase();
      if (key === 'escape') { setCaptureBinding(null); return; }
      updateSettings({ keyBindings: { ...DEFAULT_KEY_BINDINGS, ...(settings.keyBindings || {}), [captureBinding]: key } });
      setCaptureBinding(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [captureBinding, settings.keyBindings, updateSettings]);

  const [keyGuideOpen, setKeyGuideOpen] = useState(false);
  const [showTuning, setShowTuning] = useState(false);


  // 打开设置/调校时收起全局地图：否则地图会盖在面板上，挡住视线。
  useEffect(() => {
    if (showSettings || showTuning) setGlobalOverviewOpen(false);
  }, [showSettings, showTuning, setGlobalOverviewOpen]);


  // Esc：优先关闭当前浮层；没有浮层时打开暂停（设置）。
  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (captureBinding) return;               // 绑定捕获自己处理 Esc
      if (showSettings) { setShowSettings(false); return; }
      if (showTuning) { setShowTuning(false); return; }
      if (globalOverviewOpen) { setGlobalOverviewOpen(false); return; }
      if (keyGuideOpen) { setKeyGuideOpen(false); return; }
      setShowSettings(true);
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [captureBinding, showSettings, showTuning, globalOverviewOpen, keyGuideOpen, setGlobalOverviewOpen]);


  const [physicsReadout, setPhysicsReadout] = useState<{ yawRate: number; slipAngle: number; turnRadius: number; steeringAngleDeg: number; speed: number; rpm:number } | null>(null);
  const liveCarSpeed = physicsReadout?.speed ?? carSpeed;

  // 首次进入关卡的操控提示：车辆动起来或 9 秒后自动消失
  const [showStartHint, setShowStartHint] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setShowStartHint(false), 20000);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (Math.abs(liveCarSpeed) > 0.6) setShowStartHint(false);
  }, [liveCarSpeed]);
  const [laneLineWarning, setLaneLineWarning] = useState(false);
  const [steeringLockNotice, setSteeringLockNotice] = useState(0);
  const [gearNotice, setGearNotice] = useState<{
    reason: string; requested: number; current: number; speedKmh?: number;
  } | null>(null);
  const [steeringFallbackNotice, setSteeringFallbackNotice] = useState(false);
  const [stallNotice, setStallNotice] = useState<{ gear?: number; speedKmh?: number } | null>(null);
  const gearNoticeTimerRef = useRef<number | undefined>(undefined);
  const fallbackNoticeTimerRef = useRef<number | undefined>(undefined);
  const [mapCarPose, setMapCarPose] = useState({ x: 0, y: 0, rotation: 0 });
  const [mapCarFloor, setMapCarFloor] = useState(-1); // -1 = 不限楼层

  // 地库楼层过滤：只显示当前所在楼层的元素（非 Level 6 不过滤）
  const isLevel6 = levelData?.levelId === 6 && mapCarFloor >= 0;
  const mapW = levelData?.mapWidth ?? 2000;
  const mapH = levelData?.mapHeight ?? 2000;
  const mapViewY = 0;
  const floorFilter = (_y: number, elevation?:number) => !isLevel6 || garageFloorAt(elevation ?? -48) === mapCarFloor;

  const [orbitBall, setOrbitBall] = useState({ azimuth: 0, polar: 0.12 });
  const [cameraMenuOpen, setCameraMenuOpen] = useState(false);
  const [miniMapExpanded, setMiniMapExpanded] = useState(true);
  const [viewportWidth, setViewportWidth] = useState(() => typeof window === 'undefined' ? 1280 : window.innerWidth);
  const [trainingTipsOpen, setTrainingTipsOpen] = useState(() => typeof window === 'undefined' ? true : window.innerWidth >= 1450);
  const [miniMapAreaSize, setMiniMapAreaSize] = useState({ width: 300, height: 190 });
  const miniMapAreaRef = useRef<HTMLDivElement>(null);
  const orbitDragRef = useRef({ active: false, x: 0, y: 0 });
  const globalMapCacheRef = useRef<HTMLCanvasElement | null>(null);

  const [blink, setBlink] = useState(false);

  const [visualRpm, setVisualRpm] = useState(0);

  // 激活的驾驶舱样式包（后视镜 / 仪表盘 / 方向盘 / 转向指示器）
  const cockpitPack = resolveCockpitPack(settings.cockpitPackId);

  const cameraPresets: Array<{ view: CameraView; cn: string; en: string; icon: React.ReactNode }> = [
      { view: 'REAR_RIGHT', cn: '右斜侧后方', en: 'Rear right', icon: <MoveDownRight size={14} /> },
      { view: 'REAR_LEFT', cn: '左斜侧后方', en: 'Rear left', icon: <MoveDownLeft size={14} /> },
      { view: 'FRONT_LEFT', cn: '左斜侧前方', en: 'Front left', icon: <MoveUpLeft size={14} /> },
      { view: 'FRONT_RIGHT', cn: '右斜侧前方', en: 'Front right', icon: <MoveUpRight size={14} /> },
      { view: 'FOLLOW_FAR', cn: '远跟后方', en: 'Far chase', icon: <Camera size={14} /> },
      { view: 'FOLLOW_NEAR', cn: '近跟后方', en: 'Near chase', icon: <Camera size={14} /> },
      { view: 'TOP', cn: '顶视角', en: 'Top', icon: <LocateFixed size={14} /> },
      { view: 'SIDE_LEFT', cn: '左正视角', en: 'Left side', icon: <Eye size={14} /> },
      { view: 'SIDE_RIGHT', cn: '右正视角', en: 'Right side', icon: <Eye size={14} /> },
      { view: 'HOOD', cn: '驾驶视角', en: 'Driver', icon: <CarFront size={14} /> },
      { view: 'REVERSE', cn: '倒车视角', en: 'Reverse', icon: <Scan size={14} /> },
  ];
  const handleOrbitPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
      if (!orbitDragRef.current.active) return;
      const dx = event.clientX - orbitDragRef.current.x;
      const dy = event.clientY - orbitDragRef.current.y;
      orbitDragRef.current.x = event.clientX;
      orbitDragRef.current.y = event.clientY;
      setOrbitBall(previous => {
          const next = {
              azimuth: previous.azimuth - dx * 0.014,
              polar: Math.max(0.06, Math.min(1.48, previous.polar + dy * 0.012)),
          };
          window.dispatchEvent(new CustomEvent('camera-orbit-change', { detail: next }));
          onCameraViewChange('ORBIT');
          return next;
      });
  };

  // Mirror geometry measurement. The DOM glass rect is the single source of
  // truth for both the frame and the WebGL viewport. ResizeObserver + visual
  // viewport listeners cover window resize, browser zoom and scrolling.
  useEffect(() => {
      if (!settings.rearviewMirrors) {
          publishMirrorGlassLayout(null);
          return;
      }
      let frame = 0;
      let retries = 0;
      const observed = new Set<Element>();
      let resizeObserver: ResizeObserver | null = null;
      const measure = () => {
          frame = 0;
          const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-game-canvas]');
          if (!canvas) {
              if (retries++ < 240) frame = requestAnimationFrame(measure);
              return;
          }
          retries = 0;
          if (!resizeObserver && typeof ResizeObserver !== 'undefined') {
              resizeObserver = new ResizeObserver(() => schedule());
          }
          const observe = (element: Element | null) => {
              if (!element || observed.has(element) || !resizeObserver) return;
              observed.add(element);
              resizeObserver.observe(element);
          };
          observe(canvas);
          const canvasRect = canvas.getBoundingClientRect();
          if (canvasRect.width < 2 || canvasRect.height < 2) {
              frame = requestAnimationFrame(measure);
              return;
          }
          const rects: Record<string, { left: number; top: number; width: number; height: number; radius: number }> = {};
          (['left', 'right', 'centre'] as const).forEach(id => {
              const element = document.querySelector<HTMLElement>(`[data-mirror-glass="${id}"]`);
              if (!element) return;
              observe(element);
              const rect = element.getBoundingClientRect();
              if (rect.width < 1 || rect.height < 1) return;
              const radius = parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0;
              rects[id] = {
                  left: rect.left - canvasRect.left,
                  top: rect.top - canvasRect.top,
                  width: rect.width,
                  height: rect.height,
                  radius,
              };
          });
          if (rects.left && rects.right && rects.centre) {
              publishMirrorGlassLayout({
                  canvasWidth: canvasRect.width,
                  canvasHeight: canvasRect.height,
                  dpr: window.devicePixelRatio || 1,
                  rects,
              });
          } else if (retries++ < 240) {
              frame = requestAnimationFrame(measure);
          }
      };
      const schedule = () => {
          if (frame === 0) frame = requestAnimationFrame(measure);
      };
      schedule();
      window.addEventListener('resize', schedule);
      window.addEventListener('scroll', schedule, true);
      window.visualViewport?.addEventListener('resize', schedule);
      window.visualViewport?.addEventListener('scroll', schedule);
      return () => {
          if (frame) cancelAnimationFrame(frame);
          resizeObserver?.disconnect();
          window.removeEventListener('resize', schedule);
          window.removeEventListener('scroll', schedule, true);
          window.visualViewport?.removeEventListener('resize', schedule);
          window.visualViewport?.removeEventListener('scroll', schedule);
          publishMirrorGlassLayout(null);
      };
  }, [settings.rearviewMirrors, settings.mirrorAdjustments, settings.mirrorSwapSides]);

  useEffect(() => {
      const handler = () => setShowSettings(prev => {
        if (!prev) setShowTuning(false);
        return !prev;
      });
      window.addEventListener('toggle-settings', handler);
      const tuningHandler = () => setShowTuning(prev => !prev);
      window.addEventListener('toggle-tuning', tuningHandler);
      return () => {
        window.removeEventListener('toggle-settings', handler);
        window.removeEventListener('toggle-tuning', tuningHandler);
      };
  }, []);

  useEffect(() => {
      let lastAt = 0;
      const handleCarMapPosition = (event: Event) => {
          const now = performance.now();
          // Route-map pose at ~8 Hz is enough for a 300 px map; the old
          // 12.5 Hz update rebuilt the whole SVG during every physics tick.
          if (now - lastAt < 120) return;
          lastAt = now;
          const detail = (event as CustomEvent<{ x: number; y: number; rotation: number; floor?: number }>).detail;
          if (detail) {
            setMapCarPose({ x: detail.x, y: detail.y, rotation: detail.rotation });
            if (typeof detail.floor === 'number') setMapCarFloor(detail.floor);
          }
      };
      window.addEventListener('car-map-position', handleCarMapPosition);
      return () => window.removeEventListener('car-map-position', handleCarMapPosition);
  }, []);

  // Measure the actual route-map viewport so the fixed-pixel player marker
  // uses the same aspect-fit transform as the SVG (letterboxing included).
  useEffect(() => {
      const element = miniMapAreaRef.current;
      if (!element) return;
      const measure = () => setMiniMapAreaSize({
          width: Math.max(1, element.clientWidth),
          height: Math.max(1, element.clientHeight),
      });
      measure();
      const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
      observer?.observe(element);
      window.addEventListener('resize', measure);
      return () => {
          observer?.disconnect();
          window.removeEventListener('resize', measure);
      };
  }, [miniMapExpanded, levelData]);

  useEffect(() => {
      const onResize = () => setViewportWidth(window.innerWidth);
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
      // Small windows default the training card to a compact button so it
      // cannot cover the carriageway. The player can still reopen it.
      if (viewportWidth < 1450) setTrainingTipsOpen(false);
  }, [viewportWidth]);

  // Cache the complete course into a plain 2D bitmap. Subsequent updates
  // copy that bitmap and redraw only the vehicle locator, so opening the
  // global map never renders the 3D world a second time.
  useEffect(() => {
      if (!levelData) return;
      const cache = document.createElement('canvas');
      cache.width = 720;
      cache.height = 450;
      const context = cache.getContext('2d');
      if (!context) return;
      context.fillStyle = '#090d12';
      context.fillRect(0, 0, cache.width, cache.height);
      const padding = 22;
      const scale = Math.min(
          (cache.width - padding * 2) / Math.max(1, mapW),
          (cache.height - padding * 2) / Math.max(1, mapH),
      );
      const offsetX = (cache.width - mapW * scale) / 2;
      const offsetY = (cache.height - mapH * scale) / 2;
      context.save();
      context.translate(offsetX, offsetY);
      context.scale(scale, scale);
      // 地库裁剪：平移视口到当前楼层
      if (isLevel6) context.translate(0, -mapViewY);
      context.fillStyle = '#202832';
      context.fillRect(0, mapViewY, mapW, mapH);
      for (const road of levelData.roadSurfaces || []) {
          if (!floorFilter(road.y, road.elevation)) continue;
          context.save();
          context.translate(road.x, road.y);
          context.rotate(road.rotation);
          context.fillStyle = road.color || '#555b65';
          context.fillRect(-road.width / 2, -road.height / 2, road.width, road.height);
          context.restore();
      }
      context.lineCap = 'round';
      context.lineJoin = 'round';
      for (const road of levelData.curvedRoads || []) {
          if (road.points.length < 2) continue;
          const avgY = road.points.reduce((sum, p) => sum + p.y, 0) / road.points.length;
          if (!floorFilter(avgY)) continue;
          context.beginPath();
          const points = mapCurveSamples(road);
          context.moveTo(points[0].x, points[0].y);
          for (let index = 1; index < points.length; index++) {
              context.lineTo(points[index].x, points[index].y);
          }
          if (road.closed) context.closePath();
          context.strokeStyle = road.color || '#565b65';
          context.lineWidth = road.width;
          context.stroke();
      }
      if (levelData.openWorld) {
        for (const r of WORLD_ROUTES) {
          context.beginPath();r.samples.forEach((p,i)=>i?context.lineTo(p.x,p.y):context.moveTo(p.x,p.y));
          context.lineWidth=Math.max(r.width,3/scale);context.strokeStyle=r.gravel?'#b9a17a':'#a7beb0';context.stroke();
        }
        context.textAlign='center';context.font=`bold ${11/scale}px sans-serif`;
        for(const p of WORLD_PLACES){context.fillStyle=p.color;context.fillText(p.label,p.x,p.y-100);}
      }
      // —— 真实标线：优先使用关卡自带的标线数据 ——
      const mapMarkings = levelData.markings || [];
      for (const marking of mapMarkings) {
          if (!floorFilter(marking.y, marking.elevation)) continue;
          mapMarking(context, marking, scale);
      }
      // 没有标线数据的路面：补国标车道边线（15cm）与中心黄线
      if (mapMarkings.length === 0) {
          for (const road of levelData.roadSurfaces || []) {
              if (!floorFilter(road.y, road.elevation)) continue;
              const longSide = Math.max(road.width, road.height);
              const shortSide = Math.min(road.width, road.height);
              context.save();
              context.translate(road.x, road.y);
              context.rotate(road.rotation);
              const horizontal = road.width >= road.height;
              const edge = 1.5;
              const inset = 2.0;
              context.fillStyle = MAP_WHITE;
              if (horizontal) {
                  context.fillRect(-longSide / 2, -shortSide / 2 + inset, longSide, edge);
                  context.fillRect(-longSide / 2, shortSide / 2 - inset - edge, longSide, edge);
              } else {
                  context.fillRect(-shortSide / 2 + inset, -longSide / 2, edge, longSide);
                  context.fillRect(shortSide / 2 - inset - edge, -longSide / 2, edge, longSide);
              }
              // 双向中心线：宽路才画，避免停车场被画满
              if (shortSide >= 70) {
                  context.fillStyle = MAP_YELLOW;
                  const gap = 1.5;
                  if (horizontal) {
                      context.fillRect(-longSide / 2, -gap / 2 - edge, longSide, edge);
                      context.fillRect(-longSide / 2, gap / 2, longSide, edge);
                  } else {
                      context.fillRect(-gap / 2 - edge, -longSide / 2, edge, longSide);
                      context.fillRect(gap / 2, -longSide / 2, edge, longSide);
                  }
              }
              context.restore();
          }
      }

      context.strokeStyle = '#f5c842';
      context.lineWidth = Math.max(2 / scale, 2.2);
      for (const spot of levelData.spots) {
          if (!floorFilter(spot.y, spot.elevation)) continue;
          context.save();
          context.translate(spot.x, spot.y);
          context.rotate(spot.rotation);
          const isCompleted = completedSpots.has(spot.id);
          context.strokeStyle = isCompleted ? '#3b82f6' : '#f5c842';
          context.lineWidth = isCompleted ? 4 : Math.max(2 / scale, 2.2);
          context.strokeRect(-spot.width / 2, -spot.height / 2, spot.width, spot.height);
          if (isCompleted) {
            context.fillStyle = 'rgba(59, 130, 246, 0.18)';
            context.fillRect(-spot.width / 2, -spot.height / 2, spot.width, spot.height);
          }
          // 车位内标 P：地图上直接读作停车位
          if (Math.max(spot.width, spot.height) * 1 > 0) {
            context.save();
            context.rotate(-spot.rotation);
            context.fillStyle = isCompleted ? '#93c5fd' : '#f5c842';
            context.font = `bold ${Math.max(26, Math.min(spot.width, spot.height) * 0.9)}px ui-monospace, monospace`;
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.fillText('P', 0, 0);
            context.restore();
          }
          context.restore();
      }
      // 障碍物：墙体绘轮廓 + 填充，让地库/建筑布局清晰可见
      for (const obstacle of levelData.obstacles) {
          if (obstacle.type !== 'wall' && obstacle.type !== 'car') continue;
          if (!floorFilter(obstacle.y, obstacle.elevation)) continue;
          context.save();
          context.translate(obstacle.x, obstacle.y);
          context.rotate(obstacle.rotation);
          if (obstacle.type === 'wall') {
              const isBoundary = obstacle.width > 1500 || obstacle.height > 1500;
              context.fillStyle = isBoundary ? '#2a303c' : '#40495a';
              context.globalAlpha = 0.75;
              context.fillRect(-obstacle.width / 2, -obstacle.height / 2, obstacle.width, obstacle.height);
              // 墙体描边使轮廓更清晰
              if (!isBoundary && Math.min(obstacle.width, obstacle.height) > 20) {
                  context.strokeStyle = '#5a6578';
                  context.lineWidth = Math.max(1.5 / scale, 1.2);
                  context.strokeRect(-obstacle.width / 2, -obstacle.height / 2, obstacle.width, obstacle.height);
              }
          } else {
              context.fillStyle = '#39424d';
              context.globalAlpha = 0.9;
              context.fillRect(-obstacle.width / 2, -obstacle.height / 2, obstacle.width, obstacle.height);
          }
          context.restore();
      }
      // 路面上叠加半透明亮边，区分通道与墙体
      context.globalAlpha = 0.3;
      context.strokeStyle = '#6b7c8e';
      context.lineWidth = Math.max(1.2 / scale, 0.8);
      for (const road of levelData.roadSurfaces || []) {
          context.save();
          context.translate(road.x, road.y);
          context.rotate(road.rotation);
          context.strokeRect(-road.width / 2, -road.height / 2, road.width, road.height);
          context.restore();
      }
      context.globalAlpha = 1;
      context.restore();
      cache.dataset.mapScale = String(scale);
      cache.dataset.mapOffsetX = String(offsetX);
      cache.dataset.mapOffsetY = String(offsetY);
      cache.dataset.mapViewY = String(mapViewY);
      globalMapCacheRef.current = cache;
  }, [levelData, mapCarFloor, completedSpots]);

  useEffect(() => {
      if (!globalOverviewOpen || !levelData) return;
      const target = globalOverviewCanvasRef.current;
      const cache = globalMapCacheRef.current;
      const context = target?.getContext('2d');
      if (!target || !cache || !context) return;
      context.drawImage(cache, 0, 0);
      const scale = Number(cache.dataset.mapScale || 1);
      const offsetX = Number(cache.dataset.mapOffsetX || 0);
      const offsetY = Number(cache.dataset.mapOffsetY || 0);
      const viewY = Number(cache.dataset.mapViewY || 0);
      const x = offsetX + mapCarPose.x * scale;
      const y = offsetY + (mapCarPose.y - viewY) * scale;
      context.save();
      context.translate(x, y);
      context.rotate(mapCarPose.rotation);
      context.shadowColor = '#22d3ee';
      context.shadowBlur = 14;
      context.strokeStyle = '#22d3ee';
      context.fillStyle = '#f8fafc';
      context.lineWidth = 3;
      context.beginPath();
      context.arc(0, 0, 14, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.moveTo(18, 0);
      context.lineTo(-10, -9);
      context.lineTo(-6, 0);
      context.lineTo(-10, 9);
      context.closePath();
      context.fill();
      context.restore();
  }, [globalOverviewCanvasRef, globalOverviewOpen, levelData, mapCarPose]);

  useEffect(() => {
      let hideTimer: number | undefined;
      const handleLaneWarning = () => {
          setLaneLineWarning(true);
          if (hideTimer) window.clearTimeout(hideTimer);
          hideTimer = window.setTimeout(() => setLaneLineWarning(false), 1500);
      };
      window.addEventListener('lane-line-warning', handleLaneWarning);
      return () => {
          window.removeEventListener('lane-line-warning', handleLaneWarning);
          if (hideTimer) window.clearTimeout(hideTimer);
      };
  }, []);

  useEffect(() => {
      let hideTimer: number | undefined;
      const handleSteeringLock = (event: Event) => {
          const direction = (event as CustomEvent<{ direction: number }>).detail?.direction || 1;
          setSteeringLockNotice(direction);
          if (hideTimer) window.clearTimeout(hideTimer);
          hideTimer = window.setTimeout(() => setSteeringLockNotice(0), 850);
      };
      window.addEventListener('steering-lock-feedback', handleSteeringLock);
      return () => {
          window.removeEventListener('steering-lock-feedback', handleSteeringLock);
          if (hideTimer) window.clearTimeout(hideTimer);
      };
  }, []);

  // Gear refusal feedback: a rejected shift must never look like a dead key.
  useEffect(() => {
      const handleGearRejected = (event: Event) => {
          const detail = (event as CustomEvent<{ reason?: string; requested?: number; current?: number; speedKmh?: number }>).detail;
          if (!detail) return;
          setGearNotice({
              reason: detail.reason ?? 'invalid-gear',
              requested: detail.requested ?? 0,
              current: detail.current ?? 0,
              speedKmh: detail.speedKmh,
          });
          if (gearNoticeTimerRef.current) window.clearTimeout(gearNoticeTimerRef.current);
          gearNoticeTimerRef.current = window.setTimeout(() => setGearNotice(null), 1900);
      };
      window.addEventListener('gear-shift-rejected', handleGearRejected);
      window.addEventListener('gear-shift-warning', handleGearRejected);
      return () => {
          window.removeEventListener('gear-shift-rejected', handleGearRejected);
          window.removeEventListener('gear-shift-warning', handleGearRejected);
          if (gearNoticeTimerRef.current) window.clearTimeout(gearNoticeTimerRef.current);
      };
  }, []);

  // Discoverable steering fallback when pointer lock is unavailable/refused.
  useEffect(() => {
      const handleFallback = () => {
          setSteeringFallbackNotice(true);
          if (fallbackNoticeTimerRef.current) window.clearTimeout(fallbackNoticeTimerRef.current);
          fallbackNoticeTimerRef.current = window.setTimeout(() => setSteeringFallbackNotice(false), 6500);
      };
      window.addEventListener('steering-fallback-notice', handleFallback);
      return () => {
          window.removeEventListener('steering-fallback-notice', handleFallback);
          if (fallbackNoticeTimerRef.current) window.clearTimeout(fallbackNoticeTimerRef.current);
      };
  }, []);

  // High-gear start stall: persistent until the ignition is restored.
  useEffect(() => {
      const handleStall = (event: Event) => {
          const detail = (event as CustomEvent<{ gear?: number; speedKmh?: number }>).detail;
          setStallNotice(detail ?? {});
      };
      window.addEventListener('engine-stalled', handleStall);
      return () => window.removeEventListener('engine-stalled', handleStall);
  }, []);

  useEffect(() => {
      if (inputState.engineStarted) setStallNotice(null);
  }, [inputState.engineStarted]);

  useEffect(() => {
      onSettingsToggle(showSettings || showGuide);
  }, [showSettings, showGuide, onSettingsToggle]);

  useEffect(() => {
    const timer = setInterval(() => {
        setBlink(prev => !prev);
    }, 150);
    return () => clearInterval(timer);
  }, []);

  const rpmContextRef = useRef({ inputState, liveCarSpeed, currentCarId, physicsReadout });
  rpmContextRef.current = { inputState, liveCarSpeed, currentCarId, physicsReadout };
  useEffect(() => {
      // 20 Hz visual smoothing, computed from refs so this effect does not get
      // torn down/recreated every time a readout arrives (the old dependency
      // array included visualRpm itself and rebuilt a 16 ms interval forever).
      const updateRpm = () => {
          const ctx = rpmContextRef.current;
          let target = 0;
          const pt = getPowertrain(ctx.currentCarId);
          if (!ctx.inputState.engineStarted) {
             target = 0;
          } else if (ctx.inputState.gear === 0) {
             const idle = pt.idleRpm;
             const throttleVal = ctx.inputState.gasPressed ? 1 : ctx.inputState.throttle;
             target = idle + Math.pow(throttleVal, 0.8) * (pt.redlineRpm - idle);
          } else {
             const throttleVal = ctx.inputState.gasPressed ? 1 : ctx.inputState.throttle;
             target = computeRpm(pt, Math.abs(ctx.liveCarSpeed), ctx.inputState.gear, throttleVal, true);
          }
          target = ctx.physicsReadout?.rpm ?? Math.min(pt.redlineRpm, Math.max(0, target));
          const riseSpeed = 0.34;
          const fallSpeed = 0.09;
          setVisualRpm(prev => {
             const factor = target > prev ? riseSpeed : fallSpeed;
             const next = prev + (target - prev) * factor;
             // Suppress redundant React updates when settled.
             return Math.abs(next - prev) < 0.25 ? prev : next;
          });
      };
      const timer = setInterval(updateRpm, 50);
      return () => clearInterval(timer);
  }, []);

  const t = TRANSLATIONS[lang];
  const normalizedSteer = inputState.steeringWheelAngle / steeringWheelMaxDeg(CAR_MODELS[currentCarId]);
  // Live readout from GameCanvas3D's physics loop (~30 Hz while driving with
  // the debug panel enabled).
  useEffect(() => {
      let lastAt = 0;
      const handler = (e: Event) => {
          const now = performance.now();
          // The dashboard does not need the tuning panel's 30 Hz feed. Keeping
          // this at ~15 Hz avoids a full overlay reconciliation every frame.
          if (now - lastAt < 66) return;
          lastAt = now;
          const detail = (e as CustomEvent).detail;
          if (detail) setPhysicsReadout(detail);
      };
      window.addEventListener('physics-debug-readout', handler);
      return () => window.removeEventListener('physics-debug-readout', handler);
  }, []);

  const redlineRpm = getPowertrain(currentCarId).redlineRpm;
  const currentPreset = cameraPresets.find(item => item.view === cameraView);
  const gearPt = getPowertrain(currentCarId);
  const gear = inputState.gear;
  const speedKmhForGear = Math.abs(liveCarSpeed) * 15;
  const singleSpeed = isElectricVehicle(currentCarId) || gearPt.gearTops.length <= 1;
  const gearIndex = gear > 0 ? Math.min(gearPt.gearTops.length - 1, gear - 1) : -1;
  const gearBandMin = gearIndex >= 0 ? (gearPt.normalBandMinKmh?.[gearIndex] ?? gearPt.gearMins[gearIndex] * 15 ?? 0) : 0;
  const gearBandMax = gearIndex >= 0 ? gearPt.gearTops[gearIndex] * 15 : 0;
  const normalBandMax = gearIndex >= 0 ? (gearPt.normalBandMaxKmh?.[gearIndex] ?? gearBandMax * 0.9) : gearBandMax;
  const highGearLowSpeed = !singleSpeed && gear >= 4 && speedKmhForGear < Math.max(10, gearBandMin * 0.75);
  const suggestedShiftKmh = normalBandMax;
  const shiftUpHint = !singleSpeed && gearIndex >= 0 && gear < gearPt.gearTops.length && speedKmhForGear > suggestedShiftKmh;
  const shiftDownHint = !singleSpeed && gearIndex > 0 && speedKmhForGear < Math.max(8, gearBandMin * 0.85);
  const firstPersonScale = firstPersonClusterScale(viewportWidth);
  const miniViewW = isLevel6 ? mapW : (levelData?.mapWidth ?? 1);
  const miniViewH = isLevel6 ? mapH : (levelData?.mapHeight ?? 1);
  const miniScale = Math.min(miniMapAreaSize.width / Math.max(1, miniViewW), miniMapAreaSize.height / Math.max(1, miniViewH));
  const miniDisplayW = miniViewW * miniScale;
  const miniDisplayH = miniViewH * miniScale;
  const miniOffsetX = (miniMapAreaSize.width - miniDisplayW) / 2;
  const miniOffsetY = (miniMapAreaSize.height - miniDisplayH) / 2;
  const miniMarkerX = Math.max(7, Math.min(miniMapAreaSize.width - 7, miniOffsetX + mapCarPose.x * miniScale));
  const miniMarkerY = Math.max(7, Math.min(miniMapAreaSize.height - 7, miniOffsetY + (mapCarPose.y - mapViewY) * miniScale));

  const routeMapSvg = useMemo(() => (
                      <svg className="absolute inset-0 w-full h-full"
                           viewBox={isLevel6 ? `0 ${mapViewY} ${mapW} ${mapH}` : `0 0 ${levelData.mapWidth} ${levelData.mapHeight}`} preserveAspectRatio="xMidYMid meet">
                          <rect x="0" y={isLevel6 ? mapViewY : 0} width={isLevel6 ? mapW : levelData.mapWidth} height={isLevel6 ? mapH : levelData.mapHeight} fill="#0d1117" />
                          {levelData.roadSurfaces?.filter(r => floorFilter(r.y, r.elevation)).map((road, index) => (
                              <rect key={`mini-road-${index}`} x={road.x - road.width / 2} y={road.y - road.height / 2}
                                    width={road.width} height={road.height} rx={Math.min(8, road.height * 0.12)} fill="#4a4e57"
                                    transform={`rotate(${road.rotation * 180 / Math.PI} ${road.x} ${road.y})`} />
                          ))}
                          {levelData.elevatedRoads?.filter(road => floorFilter(road.y, road.deckHeight)).map((road, index) => (
                              <g key={`mini-elevated-${index}`}>
                                  <rect x={road.x - road.width / 2} y={road.y - road.height / 2}
                                        width={road.width} height={road.height} fill="none"
                                        stroke="#f59e0b" strokeWidth="4" strokeDasharray="12 8"
                                        transform={`rotate(${road.rotation * 180 / Math.PI} ${road.x} ${road.y})`} />
                                  <text x={road.x} y={road.y - 12} fill="#f59e0b" fontSize="18" fontWeight="700"
                                        textAnchor="middle">桥</text>
                              </g>
                          ))}
                          {levelData.terrainZones?.filter(zone => floorFilter(zone.y)).map((zone, index) => (
                              <g key={`mini-terrain-${index}`}>
                                  <rect x={zone.x - zone.width / 2} y={zone.y - zone.height / 2}
                                        width={zone.width} height={zone.height} fill={zone.color}
                                        stroke="#c4a26a" strokeWidth="3" opacity="0.9"
                                        transform={`rotate(${zone.rotation * 180 / Math.PI} ${zone.x} ${zone.y})`} />
                                  <text x={zone.x} y={zone.y + 8} fill="#f8e7be" fontSize="18" fontWeight="700"
                                        textAnchor="middle" transform={`rotate(${zone.rotation * 180 / Math.PI} ${zone.x} ${zone.y})`}>非铺装</text>
                              </g>
                          ))}
                          {levelData.curvedRoads?.filter(r => floorFilter(r.points.reduce((s, p) => s + p.y, 0) / r.points.length)).map((road, index) => (
                              <polyline key={`mini-curve-${index}`} points={mapCurveSamples(road).map(point => `${point.x},${point.y}`).join(' ')}
                                        fill="none" stroke="#565b65" strokeWidth={road.width} strokeLinecap="round" strokeLinejoin="round" />
                          ))}
                          {levelData.openWorld && <g>
                            <path d="M8800 1650 Q12500 700 16400 1800 L16400 7400 Q12000 8200 8800 7200Z" fill="#315446" opacity=".3"/>
                            {WORLD_ROUTES.map(r=><polyline key={r.id} points={r.samples.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke={r.gravel?'#c3ab80':'#bacdbb'} strokeWidth={r.gravel?65:85} strokeLinecap="round" strokeLinejoin="round"/>)}
                            {WORLD_PUDDLES.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r="65" fill="#73b7cc"/>)}
                            {WORLD_PLACES.map(p=><text key={p.label} x={p.x} y={p.y-160} fill={p.color} fontSize="180" textAnchor="middle">{p.label}</text>)}
                          </g>}
                          {isLevel6 && <g>
                            <rect x="1550" y="220" width="100" height="560" fill="#326081" />
                            <text x="1580" y="500" fill="#fff" fontSize="40" textAnchor="middle">↓</text><text x="1630" y="570" fill="#fff" fontSize="40" textAnchor="middle">↑</text>
                            <text x="200" y="200" fill="#86d3ef" fontSize="65" fontWeight="bold">B{mapCarFloor+1}</text>
                            {levelData.markings.filter(m=>floorFilter(m.y,m.elevation)).map((m,i)=>m.type==='line-solid'||m.type==='line-dashed'?<rect key={`garage-map-line-${i}`} x={m.x-m.width/2} y={m.y-m.height/2} width={m.width} height={m.height} fill={m.color} transform={`rotate(${m.rotation*180/Math.PI} ${m.x} ${m.y})`}/>:null)}
                          </g>}
                          {levelData.spots.filter(s => floorFilter(s.y, s.elevation)).map(spot => {
                              const isDone = completedSpots.has(spot.id);
                              return (
                                  <rect key={`mini-spot-${spot.id}`} x={spot.x - spot.width / 2} y={spot.y - spot.height / 2}
                                        width={spot.width} height={spot.height} fill={isDone ? 'rgba(59,130,246,0.18)' : 'none'}
                                        stroke={isDone ? '#3b82f6' : '#fbbf24'} strokeWidth={isDone ? '5' : '4'}
                                        transform={`rotate(${spot.rotation * 180 / Math.PI} ${spot.x} ${spot.y})`} />
                              );
                          })}
                          {levelData.obstacles.filter(obs => obs.type === 'wall' && floorFilter(obs.y, obs.elevation)).map(obs => {
                              const isBoundary = obs.width > 1500 || obs.height > 1500;
                              return (
                                  <rect key={`mini-wall-${obs.id}`}
                                        x={obs.x - obs.width / 2} y={obs.y - obs.height / 2}
                                        width={obs.width} height={obs.height}
                                        fill={isBoundary ? 'none' : '#374151'}
                                        stroke={isBoundary ? '#4a5568' : '#5a6578'}
                                        strokeWidth={isBoundary ? '3' : '1.5'}
                                        transform={`rotate(${obs.rotation * 180 / Math.PI} ${obs.x} ${obs.y})`} />
                              );
                          })}
                          {levelData.obstacles.filter(obs => obs.type === 'car' && floorFilter(obs.y, obs.elevation)).map(obs => (
                              <rect key={`mini-car-${obs.id}`}
                                    x={obs.x - obs.width / 2} y={obs.y - obs.height / 2}
                                    width={obs.width} height={obs.height} fill="#4b5563" opacity="0.8"
                                    transform={`rotate(${obs.rotation * 180 / Math.PI} ${obs.x} ${obs.y})`} />
                          ))}
                      </svg>
  ), [levelData, mapW, mapH, mapViewY, isLevel6, completedSpots, mapCarFloor]);

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between z-10 text-white">
      {cameraView === 'HOOD' && (
        <div className="absolute top-[56px] right-4 z-30 pointer-events-none mono text-[8px] tracking-[0.08em] px-2.5 py-1 rounded"
             style={{ background: 'rgba(6,8,11,0.72)', color: 'var(--text-mute)', border: '1px solid rgba(255,255,255,0.10)' }}>
          {lang === Language.CN
            ? '左键拖动转头 · 双击回正 · Alt+J/L 看左右 · Alt+K 回正 · Alt+C 转向归中'
            : 'Left-drag to look · Double-click to centre · Alt+J/L quick look · Alt+K centre'}
        </div>
      )}
      {showReward.show && (
          <div className="absolute top-[26%] left-1/2 -translate-x-1/2 z-50 reward-pop" role="status" aria-live="assertive">
              <div className="clip-angle mono font-black text-3xl px-12 py-5 flex flex-col items-center gap-1.5"
                   style={{
                       background: 'rgba(10,12,15,0.94)',
                       border: `2px solid ${showReward.type === 'reverse' ? 'var(--red)' : showReward.type === 'perfect' ? 'var(--green)' : 'var(--amber)'}`,
                       boxShadow: `0 0 58px ${showReward.type === 'reverse' ? 'rgba(239,68,68,0.45)' : showReward.type === 'perfect' ? 'rgba(34,197,94,0.45)' : 'var(--amber-glow)'}`,
                       color: showReward.type === 'reverse' ? 'var(--red)' : showReward.type === 'perfect' ? 'var(--green)' : 'var(--amber)'
                   }}>
                  <span className="flex items-center gap-3">
                    <span className="text-2xl" aria-hidden="true">{showReward.type === 'reverse' ? '↺' : '✓'}</span>
                    {showReward.amount === 0
                      ? (lang === Language.CN ? '停车成功' : 'PARKED')
                      : showReward.type === 'perfect' ? t.parking.perfect
                        : showReward.type === 'good' ? t.parking.good
                          : showReward.type === 'reverse' ? t.parking.reverse
                            : showReward.type === 'line' ? t.parking.line
                              : t.parking.fail}
                  </span>
                  <span className="text-[10px] tracking-[0.28em] font-bold opacity-75">
                    {showReward.type === 'reverse'
                      ? (lang === Language.CN ? '反向入位 · 已记录' : 'REVERSE PARK · LOGGED')
                      : (lang === Language.CN ? '车辆已停稳 · 挡位可回 P' : 'VEHICLE SECURED · PARK BRAKE')}
                  </span>
              </div>
          </div>
      )}

      {/* 旋钮模式提示（方向盘打死反馈） */}
      {settings.logitechKnobMode && (
          <div className="absolute bottom-[178px] left-1/2 -translate-x-1/2 pointer-events-none z-40 flex">
              <div className="mono text-[9px] tracking-[0.16em] px-2.5 py-1 rounded-full transition-all"
                   style={steeringLockNotice
                      ? { background: 'var(--red)', color: '#fff', boxShadow: '0 0 20px rgba(239,68,68,0.7)' }
                      : { background: 'rgba(8,10,14,0.6)', color: 'var(--cyan)', border: '1px solid rgba(34,211,238,0.25)' }}>
                  {steeringLockNotice
                      ? (lang === Language.CN ? `${steeringLockNotice < 0 ? '左' : '右'}转向已打死 ·${Math.round(steeringWheelMaxDeg(CAR_MODELS[currentCarId]))}°` : `${steeringLockNotice < 0 ? 'LEFT' : 'RIGHT'} STEERING LOCK ·${Math.round(steeringWheelMaxDeg(CAR_MODELS[currentCarId]))}°`)
                      : (lang === Language.CN ? '旋钮方向盘已连接' : 'DIAL STEERING ACTIVE')}
              </div>
          </div>
      )}

      {/* ===== 后视镜 ×3（样式包外壳，几何参数不变） ===== */}
      {settings.rearviewMirrors && (
          <>
              {(['left', 'right'] as const).map(id => {
                  const isLeftSlot = settings.mirrorSwapSides ? id === 'right' : id === 'left';
                  const label = id === 'left'
                      ? (lang === Language.CN ? '左后视镜' : 'LEFT MIRROR')
                      : (lang === Language.CN ? '右后视镜' : 'RIGHT MIRROR');
                  return (
                      <SideMirrorFrame
                          key={id}
                          id={id}
                          pack={cockpitPack}
                          adjustment={settings.mirrorAdjustments[id]}
                          slot={isLeftSlot ? 'left' : 'right'}
                          label={label}
                      />
                  );
              })}
              <CentreMirrorFrame
                  pack={cockpitPack}
                  adjustment={settings.mirrorAdjustments.centre}
                  label={lang === Language.CN ? '车内后视镜' : 'CENTRE MIRROR'}
              />
          </>
      )}

      {/* ===== 左上：资金 / 关卡（无背景悬浮排版） ===== */}
      <div className="absolute top-5 left-6 z-40 pointer-events-auto flex items-start gap-5">
          <div className="flex items-center gap-4" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.85)' }}>
              <div className="flex flex-col">
                  <span className="text-[9px] font-black tracking-[0.3em] uppercase mb-0.5" style={{ color: 'var(--amber)' }}>{t.money}</span>
                  <span className="mono text-[26px] font-black leading-none tabular-nums" style={{ color: money < 0 ? 'var(--red)' : 'var(--text)' }}>
                      ${money}
                  </span>
              </div>
              <div className="w-px h-9 self-center" style={{ background: 'rgba(255,255,255,0.28)' }} />
              <div className="flex flex-col">
                  <span className="text-[9px] font-black tracking-[0.3em] uppercase mb-0.5" style={{ color: 'var(--text-dim)' }}>{lang === Language.CN ? '场景' : 'WORLD'}</span>
                  <span className="mono text-[26px] font-black leading-none tabular-nums" style={{ color: 'var(--text)' }}>
                      0{level}
                  </span>
              </div>
          </div>
          {/* 调参 / 设置：幽灵图标按钮 */}
          <div className="flex items-center gap-1.5 mt-0.5">
              <button
                  onClick={() => setShowTuning(value => !value)}
                  aria-label={lang === Language.CN ? '实时调参' : 'Live tuning'}
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-150 hover:scale-105"
                  style={showTuning
                      ? { background: 'var(--amber)', color: '#111214', boxShadow: '0 0 16px var(--amber-glow)' }
                      : { background: 'rgba(6,7,9,0.45)', border: '1px solid rgba(255,255,255,0.14)', color: 'var(--amber)' }}
              >
                  <Sliders size={15} />
              </button>
              <button
                  onClick={() => { setShowTuning(false); setShowSettings(true); }}
                  aria-label="Settings [M]"
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-150 hover:scale-105"
                  style={{ background: 'rgba(6,7,9,0.45)', border: '1px solid rgba(255,255,255,0.14)', color: 'var(--text-dim)' }}
              >
                  <Settings size={15} />
              </button>
          </div>
      </div>

      {/* ===== 右上：状态灯 + 球形视角 + 视角切换（无背景紧凑排布） ===== */}
      <div className="absolute top-4 right-5 z-40 pointer-events-auto flex items-center gap-3">
          {/* 车状态指示灯 */}
          <div className="flex items-start gap-1.5 pr-2.5" style={{ borderRight: '1px solid rgba(255,255,255,0.14)' }}>
              <Telltale on={inputState.engineStarted} color="var(--green)" icon={<Power size={12} strokeWidth={2.6} />} label="ENG" />
              <Telltale on={inputState.lights} color={inputState.headlightMode===2?"#7ac9ff":"var(--amber)"} icon={<Zap size={12} />} label={inputState.lights?(inputState.headlightMode===2?"远光":"近光"):"LIGHT"} />
              <Telltale on={inputState.handbrake} color="var(--red)" icon={<Pause size={12} />} label="PARK" onHold={held => setInputState(prev => ({ ...prev, handbrake: held }))} />
          </div>
          {/* 球形视角控制 */}
          <div
              role="slider"
              aria-label={lang === Language.CN ? '球形视角控制' : 'Orbit camera control'}
              aria-valuemin={0}
              aria-valuemax={360}
              aria-valuenow={Math.round((orbitBall.azimuth * 180 / Math.PI + 360) % 360)}
              onPointerDown={event => {
                  orbitDragRef.current = { active: true, x: event.clientX, y: event.clientY };
                  onCameraViewChange('ORBIT');
                  event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={handleOrbitPointerMove}
              onPointerUp={event => {
                  orbitDragRef.current.active = false;
                  event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              className="relative w-10 h-10 rounded-full cursor-grab active:cursor-grabbing shrink-0 overflow-hidden"
              style={{
                  background: '#243244',
                  border: '1px solid rgba(255,255,255,0.32)',
                  boxShadow: 'inset -7px -8px 14px rgba(0,0,0,0.5), 0 0 10px rgba(34,211,238,0.18)',
                  transform: `rotate(${orbitBall.azimuth * 20}deg)`,
                  touchAction: 'none',
              }}
          >
              <div className="absolute left-1/2 top-0.5 w-px h-9 bg-white/35 -translate-x-1/2 rounded-full" />
              <div className="absolute left-0.5 top-1/2 w-9 h-px bg-white/35 -translate-y-1/2 rounded-full" />
              <div className="absolute inset-[6px] rounded-full border border-white/20" />
              <div className="absolute w-2 h-2 rounded-full bg-cyan-300 shadow-[0_0_8px_rgba(103,232,249,0.9)]"
                   style={{ left: `${19 + Math.sin(orbitBall.azimuth) * 12}px`, top: `${4 + orbitBall.polar / 1.48 * 24}px` }} />
          </div>
          {/* 视角切换（文字式按钮 + 下拉菜单） */}
          <div className="relative">
              <button
                  type="button"
                  onClick={() => setCameraMenuOpen(open => !open)}
                  className="flex items-center gap-2 px-1.5 py-1 text-left transition-colors"
                  style={{ textShadow: '0 2px 8px rgba(0,0,0,0.9)' }}
              >
                  <span style={{ color: 'var(--amber)' }}>{currentPreset?.icon ?? <Scan size={14} />}</span>
                  <span className="flex flex-col">
                      <span className="text-[11px] font-black tracking-wide whitespace-nowrap" style={{ color: 'var(--text)' }}>
                          {cameraView === 'ORBIT'
                              ? (lang === Language.CN ? '自由视角' : 'Free orbit')
                              : (lang === Language.CN ? currentPreset?.cn : currentPreset?.en)}
                      </span>
                      <span className="mono text-[7px] tracking-[0.18em]" style={{ color: 'var(--text-mute)' }}>F · CYCLE</span>
                  </span>
                  <ChevronDown size={13} style={{ color: 'var(--text-mute)', transform: cameraMenuOpen ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
              </button>
              <div className="h-[2px] rounded-full" style={{ background: 'var(--amber)', boxShadow: '0 0 6px var(--amber-glow)' }} />
              {cameraMenuOpen && (
                  <div className="absolute top-[46px] right-0 w-[252px] cockpit-panel p-2 grid grid-cols-2 gap-1 z-50"
                       style={{ boxShadow: '0 18px 42px rgba(0,0,0,0.62)' }}>
                      {cameraPresets.map(item => (
                          <button key={item.view} type="button" onClick={() => { onCameraViewChange(item.view); setCameraMenuOpen(false); }}
                                  className="px-2.5 py-2 rounded-md flex items-center gap-2 text-left text-[10px] font-bold"
                                  style={cameraView === item.view
                                      ? { background: 'var(--amber)', color: '#111214' }
                                      : { background: 'var(--panel-3)', color: 'var(--text-dim)' }}>
                              {item.icon}<span>{lang === Language.CN ? item.cn : item.en}</span>
                          </button>
                      ))}
                  </div>
              )}
          </div>
      </div>

      {laneLineWarning && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-50 pointer-events-none clip-angle px-7 py-3 font-black tracking-[0.16em] text-sm animate-pulse"
               style={{ background: 'rgba(127,29,29,0.94)', color: '#fff', border: '1px solid #ef4444', boxShadow: '0 0 28px rgba(239,68,68,0.45)' }}>
              {lang === Language.CN ? '压线警告 · 请回正车身' : 'LANE LINE WARNING'}
          </div>
      )}

      {gearNotice && (
          <div className="absolute bottom-[255px] left-1/2 -translate-x-1/2 z-50 pointer-events-none px-4 py-2 rounded-lg mono text-[11px] font-bold"
               style={{ background: 'rgba(28,18,8,0.94)', color: 'var(--amber)', border: '1px solid rgba(245,158,11,0.55)', boxShadow: '0 10px 28px rgba(0,0,0,0.5)' }}>
              {gearNotice.reason === 'single-speed'
                  ? (lang === Language.CN ? '此车为单速电驱，D 即前进挡，无需升入 2–5 挡' : 'Single-speed EV: D is drive; there are no gears 2–5')
                  : gearNotice.reason === 'over-rev'
                  ? (lang === Language.CN ? '车速/转速过高，无法挂入该挡' : 'SPEED TOO HIGH FOR THIS GEAR')
                  : gearNotice.reason === 'reverse-while-moving'
                      ? (lang === Language.CN ? '请先停稳，再挂 R 挡' : 'STOP BEFORE SELECTING REVERSE')
                      : gearNotice.reason === 'direction-reversal'
                          ? (gearNotice.requested < 0
                              ? (lang === Language.CN ? '前进中禁止挂倒挡，请先停稳' : 'STOP BEFORE REVERSE')
                              : (lang === Language.CN ? '倒车中禁止挂前进挡，请先停稳' : 'STOP BEFORE DRIVE'))
                          : (lang === Language.CN ? '该挡位当前不可用' : 'GEAR UNAVAILABLE')}
              {typeof gearNotice.speedKmh === 'number' && gearNotice.speedKmh > 1 && (
                  <span style={{ color: 'var(--text-mute)' }}> · {Math.round(gearNotice.speedKmh)} km/h</span>
              )}
          </div>
      )}

      {steeringFallbackNotice && (
          <div className="absolute top-[118px] left-1/2 -translate-x-1/2 z-50 pointer-events-none px-4 py-2 rounded-lg text-[10px] leading-4"
               style={{ background: 'rgba(8,14,20,0.94)', color: 'var(--text)', border: '1px solid rgba(34,211,238,0.45)', boxShadow: '0 10px 28px rgba(0,0,0,0.5)' }}>
              <span className="mono font-bold" style={{ color: 'var(--cyan)' }}>
                  {lang === Language.CN ? '转向降级' : 'STEERING FALLBACK'}
              </span>
              <span style={{ color: 'var(--text-dim)' }}>
                  {lang === Language.CN
                      ? ' 指针锁不可用/已退出：按住右键拖动，或按住 , / . 转向（不占用加减挡）'
                      : ' Pointer lock unavailable/exited: keep right-drag, or hold , / . to steer (gear keys untouched)'}
              </span>
          </div>
      )}

      {/* ===== 左上角音量开关 ===== */}
      <button
          type="button"
          onClick={() => {
            const newState = !settings.soundEnabled;
            updateSettings({
              soundEnabled: newState,
              radarSoundEnabled: newState,
              engineSoundEnabled: newState,
              steeringSoundEnabled: newState,
            });
          }}
          aria-label={settings.soundEnabled ? (lang === Language.CN ? '关闭所有声音' : 'Mute All') : (lang === Language.CN ? '开启所有声音' : 'Unmute All')}
          className="absolute left-4 top-[60px] z-40 w-10 h-10 pointer-events-auto rounded-xl flex items-center justify-center transition-all duration-150 hover:scale-105"
          style={{
              background: settings.soundEnabled ? 'rgba(16,185,129,0.18)' : 'rgba(239,68,68,0.22)',
              border: settings.soundEnabled ? '1px solid rgba(16,185,129,0.5)' : '1px solid rgba(239,68,68,0.5)',
              boxShadow: '0 6px 16px rgba(0,0,0,0.4)',
          }}
      >
          {settings.soundEnabled ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
          ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
          )}
      </button>

      {/* ===== 独立车辆俯瞰：屏幕左侧，点击打开三倍全局俯瞰 ===== */}
      {levelData && (
          <>
              <button
                  type="button"
                  onClick={() => setGlobalOverviewOpen(true)}
                  aria-label={lang === Language.CN ? '打开全局俯瞰地图' : 'Open global overhead map'}
                  className="absolute left-4 top-[118px] z-30 w-[240px] h-[184px] pointer-events-auto overflow-hidden rounded-xl text-left transition-all duration-200 hover:-translate-y-0.5"
                  style={{
                      opacity: globalOverviewOpen ? 0 : 1,
                      pointerEvents: globalOverviewOpen ? 'none' : 'auto',
                      background: '#0b1015',
                      border: '1px solid rgba(255,255,255,0.12)',
                      boxShadow: '0 12px 34px rgba(0,0,0,0.48)',
                  }}
              >
                  <div className="h-[34px] px-3 flex items-center justify-between"
                       style={{ background: 'rgba(16,18,22,0.92)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      <span className="flex items-center gap-2 text-[10px] font-black tracking-[0.14em]" style={{ color: 'var(--text)' }}>
                          <LocateFixed size={13} style={{ color: 'var(--amber)' }} />
                          {lang === Language.CN ? '车辆俯瞰' : 'VEHICLE OVERHEAD'}
                      </span>
                      <span className="flex items-center gap-1 mono text-[7px] tracking-[0.12em]" style={{ color: 'var(--text-mute)' }}>
                          {lang === Language.CN ? '展开全局' : 'EXPAND'} <Maximize2 size={11} />
                      </span>
                  </div>
                  <canvas ref={overviewCanvasRef} width={240} height={150} className="block w-[240px] h-[150px]" />
                  <div className="absolute inset-x-0 bottom-0 h-10 pointer-events-none" style={{ background: 'rgba(5,8,12,0.55)' }} />
              </button>

              {/* 路线地图保持独立，仍可折叠。 */}
              <div className="absolute right-4 top-[118px] z-30 transition-[width,height] duration-200"
                   style={{ width: miniMapExpanded ? 300 : 132, height: miniMapExpanded ? 236 : 40 }}>
                  <div className="relative z-20 h-10 px-2 flex items-center justify-between pointer-events-auto rounded-xl overflow-hidden"
                       style={{
                           background: 'rgba(6,8,11,0.78)',
                           border: '1px solid rgba(255,255,255,0.10)',
                           backdropFilter: 'blur(6px)',
                           boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                       }}>
                      <div className="flex items-center gap-2">
                          <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--amber)', color: '#111214' }}>
                              <Map size={14} />
                          </span>
                          {miniMapExpanded && (
                              <span className="text-[10px] font-black tracking-[0.14em]" style={{ color: 'var(--text)' }}>
                                  {isLevel6 ? `地库 B${mapCarFloor+1} · 高差 4.8m` : lang === Language.CN ? '路线地图' : 'ROUTE MAP'}
                              </span>
                          )}
                      </div>
                      <button type="button" onClick={() => setMiniMapExpanded(expanded => !expanded)} aria-label={miniMapExpanded ? (lang === Language.CN ? '收起地图' : 'Collapse map') : (lang === Language.CN ? '展开地图' : 'Expand map')}
                              className="w-7 h-7 rounded-md flex items-center justify-center transition-colors"
                              style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-dim)' }}>
                          {miniMapExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                  </div>
                  <div ref={miniMapAreaRef} className="absolute left-0 right-0 top-[46px] bottom-0 overflow-hidden rounded-xl transition-opacity duration-200"
                       style={{
                           opacity: miniMapExpanded ? 1 : 0,
                           pointerEvents: 'none',
                           background: '#0d1117',
                           border: '1px solid rgba(255,255,255,0.08)',
                           boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
                       }}>
                      {routeMapSvg}
                      <div className="absolute z-10 pointer-events-none"
                           style={{
                               left: miniMarkerX,
                               top: miniMarkerY,
                               width: 26,
                               height: 26,
                               transform: `translate(-50%, -50%) rotate(${mapCarPose.rotation}rad)`,
                               filter: 'drop-shadow(0 0 7px rgba(34,211,238,0.9)) drop-shadow(0 1px 2px rgba(0,0,0,0.9))',
                           }}>
                          <svg viewBox="0 0 26 26" width="26" height="26">
                              <circle cx="13" cy="13" r="11.5" fill="rgba(8,14,20,0.78)" stroke="#ecfeff" strokeWidth="2" />
                              <path d="M 22 13 L 7 6.5 L 10.5 13 L 7 19.5 Z" fill="#22d3ee" stroke="#ecfeff" strokeWidth="1" />
                          </svg>
                      </div>
                  </div>
              </div>

              {/* 720×450 = 小俯瞰 240×150 的三倍尺寸。 */}
              <section
                  aria-label={lang === Language.CN ? '全局俯瞰地图' : 'Global overhead map'}
                  className="absolute left-4 top-[104px] z-50 w-[720px] h-[500px] pointer-events-auto overflow-hidden rounded-2xl transition-all duration-200"
                  style={{
                      opacity: globalOverviewOpen ? 1 : 0,
                      transform: globalOverviewOpen ? 'scale(1)' : 'scale(0.94)',
                      transformOrigin: 'top left',
                      pointerEvents: globalOverviewOpen ? 'auto' : 'none',
                      background: '#070b10',
                      border: '1px solid rgba(245,158,11,0.48)',
                      boxShadow: '0 24px 70px rgba(0,0,0,0.72), 0 0 26px rgba(245,158,11,0.12)',
                  }}
              >
                  <header className="h-[50px] px-4 flex items-center justify-between"
                          style={{ background: 'rgba(16,18,22,0.94)', borderBottom: '1px solid rgba(255,255,255,0.09)' }}>
                      <div className="flex items-center gap-3">
                          <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--amber)', color: '#101216' }}>
                              <LocateFixed size={16} />
                          </span>
                          <div>
                              <h3 className="text-[12px] font-black tracking-[0.16em]" style={{ color: 'var(--text)' }}>
                                  {lang === Language.CN ? '全局俯瞰地图' : 'GLOBAL OVERHEAD MAP'}
                              </h3>
                              <p className="mono text-[8px] tracking-[0.14em] mt-0.5" style={{ color: 'var(--text-mute)' }}>
                                  {lang === Language.CN ? '青色圆环与白色箭头为本车位置及朝向' : 'CYAN RING + WHITE ARROW = CURRENT VEHICLE'}
                              </p>
                          </div>
                      </div>
                      <button type="button" onClick={() => setGlobalOverviewOpen(false)} aria-label={lang === Language.CN ? '关闭全局俯瞰地图' : 'Close global overhead map'}
                              className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
                              style={{ color: 'var(--text-dim)', border: '1px solid rgba(255,255,255,0.10)' }}>
                          <X size={17} />
                      </button>
                  </header>
                  <canvas ref={globalOverviewCanvasRef} width={720} height={450} className="block w-[720px] h-[450px]" />
                  <div className="absolute left-4 bottom-4 mono text-[9px] px-3 py-1.5 rounded-full"
                       style={{ background: 'rgba(5,8,12,0.78)', color: '#67e8f9', border: '1px solid rgba(34,211,238,0.32)' }}>
                      X {Math.round(mapCarPose.x)} · Y {Math.round(mapCarPose.y)}
                  </div>
              </section>
          </>
      )}

      {levelData?.training && (
          <div className="absolute top-[368px] right-4 z-30 flex flex-col items-end gap-1.5 pointer-events-auto"
               style={{ maxWidth: 'calc(100vw - 2rem)' }}>
              {levelData.levelId === 1 && (
                  <button type="button" disabled={Math.abs(liveCarSpeed) > 0.2}
                          onClick={() => window.dispatchEvent(new CustomEvent('terrain-teleport'))}
                          className="mono text-[9px] font-bold tracking-[0.12em] px-2.5 py-1.5 rounded-md disabled:opacity-60"
                          style={{ background: 'rgba(8,12,16,0.88)', color: 'var(--amber)', border: '1px solid rgba(245,158,11,0.45)' }}>
                      {Math.abs(liveCarSpeed) > 0.2
                        ? (lang === Language.CN ? '停稳后进入非铺装' : 'STOP TO ENTER OFF-ROAD')
                        : (lang === Language.CN ? '非铺装训练入口' : 'OFF-ROAD ENTRY')}
                  </button>
              )}
              <button type="button" onClick={() => setTrainingTipsOpen(open => !open)}
                      className="mono text-[9px] font-bold tracking-[0.12em] px-2.5 py-1.5 rounded-md"
                      style={{ background: 'rgba(8,12,16,0.88)', color: trainingTipsOpen ? 'var(--amber)' : 'var(--text-dim)', border: '1px solid rgba(255,255,255,0.16)' }}>
                  {trainingTipsOpen
                      ? (lang === Language.CN ? '收起训练提示' : 'HIDE TRAINING TIPS')
                      : (lang === Language.CN ? '训练提示' : 'TRAINING TIPS')}
              </button>
              {trainingTipsOpen && (
                  <div className="cockpit-panel p-3.5"
                       style={{ width: 'min(17rem, calc(100vw - 2rem))' }}>
                      <div className="text-xs font-black tracking-[0.14em] mb-2" style={{ color: 'var(--amber)' }}>
                          {levelData.training.title}
                      </div>
                      <ol className="space-y-1.5">
                          {levelData.training.tips.map((tip, index) => (
                              <li key={tip} className="flex gap-2 text-[10px] leading-4" style={{ color: 'var(--text-dim)' }}>
                                  <span className="mono" style={{ color: 'var(--green)' }}>{index + 1}</span>
                                  <span>{tip}</span>
                              </li>
                          ))}
                      </ol>
                  </div>
              )}
          </div>
      )}

      {/* ===== 挡位教练 / 手动训练标注：只在有换挡建议或熄火时出现 ===== */}
      {(stallNotice || highGearLowSpeed || shiftUpHint || shiftDownHint) && (
      <div className="absolute bottom-[210px] left-1/2 -translate-x-1/2 z-40 pointer-events-none w-[330px] max-w-[82vw]">
          {stallNotice ? (
              <div className="rounded-lg px-3 py-2 flex items-start gap-2"
                   style={{ background: 'rgba(35,12,12,0.95)', border: '1px solid rgba(239,68,68,0.7)', boxShadow: '0 8px 24px rgba(0,0,0,0.55)' }}>
                  <AlertTriangle size={14} style={{ color: '#f87171', marginTop: 1, flexShrink: 0 }} />
                  <div className="min-w-0">
                      <div className="mono text-[10px] font-black tracking-[0.08em]" style={{ color: '#fca5a5' }}>
                          {lang === Language.CN ? '高挡起步熄火' : 'HIGH-GEAR STALL'}
                      </div>
                      <div className="text-[10px] leading-4 mt-0.5" style={{ color: 'var(--text)' }}>
                          {lang === Language.CN
                              ? '挂 N 或 1 挡，按 B 重新点火。燃油手动训练模式。'
                              : 'Select N or 1 and press B to restart. Fuel manual training mode.'}
                      </div>
                  </div>
              </div>
          ) : (
              <div className="rounded-lg px-3 py-1.5 flex items-center justify-between gap-2"
                   style={{ background: 'rgba(7,10,14,0.78)', border: '1px solid rgba(255,255,255,0.12)' }}>
                  <div className="min-w-0">
                      <div className="mono text-[8px] font-bold tracking-[0.14em]" style={{ color: singleSpeed ? 'var(--cyan)' : 'var(--amber)' }}>
                          {singleSpeed
                              ? (lang === Language.CN ? '单速电驱' : 'SINGLE-SPEED EV')
                              : (lang === Language.CN ? '燃油手动训练' : 'FUEL MANUAL TRAINING')}
                      </div>
                      <div className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--text-dim)' }}>
                          {gear === 0
                              ? (lang === Language.CN ? `N · 挂 ${singleSpeed ? 'D' : '1'} 挡起步` : `N · select ${singleSpeed ? 'D' : '1'} to launch`)
                              : gear === -1
                                  ? (lang === Language.CN ? 'R · 倒挡' : 'R · reverse')
                                  : (lang === Language.CN
                                      ? `${singleSpeed ? 'D' : gear} 挡 · ${Math.round(speedKmhForGear)} km/h · 正常 ${Math.round(gearBandMin)}–${Math.round(normalBandMax)} / 红线 ${Math.round(gearBandMax)}`
                                      : `Gear ${singleSpeed ? 'D' : gear} · ${Math.round(speedKmhForGear)} km/h · normal ${Math.round(gearBandMin)}–${Math.round(normalBandMax)} / redline ${Math.round(gearBandMax)}`)}
                      </div>
                  </div>
                  <div className="mono text-[9px] font-bold shrink-0 text-right"
                       style={{ color: highGearLowSpeed ? '#f87171' : shiftUpHint ? 'var(--green)' : shiftDownHint ? 'var(--amber)' : 'var(--text-mute)' }}>
                      {singleSpeed
                          ? (lang === Language.CN ? '无多挡 / 不熄火' : 'NO STALL')
                          : highGearLowSpeed
                              ? (lang === Language.CN ? '高挡低速 · 熄火风险' : 'LUG / STALL RISK')
                              : shiftUpHint
                                  ? (lang === Language.CN ? '↑ 可升挡' : '↑ SHIFT UP')
                                  : shiftDownHint
                                      ? (lang === Language.CN ? '↓ 建议降挡' : '↓ SHIFT DOWN')
                                      : (lang === Language.CN ? '挡位合适' : 'GEAR OK')}
                  </div>
              </div>
          )}
      </div>
      )}

      {/* ===== 底部座舱总成：第一人称只显示仪表，实体方向盘承担转向 ===== */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 pointer-events-none z-40">
          <div style={cameraView === 'HOOD'
              ? { transform: `scale(${firstPersonScale})`, transformOrigin: 'bottom center' }
              : undefined}>
              <CockpitCluster
                  pack={cockpitPack}
                  steeringAngleDeg={inputState.steeringWheelAngle}
                  normalizedSteer={normalizedSteer}
                  blink={blink}
                  speedKmh={liveCarSpeed * 15}
                  rpm={visualRpm}
                  redlineRpm={redlineRpm}
                  gear={inputState.gear}
                  singleSpeed={singleSpeed}
                  rpmCaption={lang === Language.CN ? '转速 x1000' : 'RPM x1000'}
                  speedCaption="KM/H"
                  showSteeringWheels={cameraView !== 'HOOD'}
              />
          </div>
      </div>

      {/* ===== 设置抽屉（语言 + 按键指南 已迁移至此） ===== */}
      {showSettings && <SettingsPage settings={settings} update={updateSettings} car={currentCarId} level={level} openWorld={!!levelData?.openWorld} onCar={onChangeCar} onMap={onChangeMap} onTravel={onTravel} close={()=>setShowSettings(false)} reset={resetLevel} exit={exitGame} lang={lang} setLang={setLang} capture={captureBinding} bind={setCaptureBinding} guide={()=>{setShowSettings(false);setShowGuide(true);}}/>}
      {showGuide && <DrivingGuide settings={settings} done={()=>setShowGuide(false)}/>}

      {/* 首次进入：操控提示（车辆一动或 20 秒后自动收起） */}
      {showStartHint && !showSettings && !showGuide && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-[186px] z-40 pointer-events-auto"
             style={{ background: 'rgba(10,12,16,0.94)', border: '1px solid rgba(245,158,11,0.45)', borderRadius: 12, padding: '10px 14px', boxShadow: '0 10px 30px rgba(0,0,0,0.45)' }}>
          <div className="flex items-center gap-3">
            {[
              { key: (settings.keyBindings?.gearUp || 'd').toUpperCase(), label: lang === Language.CN ? '挂挡' : 'Gear' },
              { key: (settings.keyBindings?.accelerate || 'w').toUpperCase(), label: lang === Language.CN ? '油门' : 'Throttle' },
              { key: (settings.keyBindings?.brake || 's').toUpperCase(), label: lang === Language.CN ? '刹车' : 'Brake' },
              { key: 'SPACE', label: lang === Language.CN ? '手刹' : 'Handbrake' },
              { key: (settings.keyBindings?.camera || 'f').toUpperCase(), label: lang === Language.CN ? '视角' : 'Camera' },
            ].map(item => (
              <span key={item.label} className="flex items-center gap-1.5">
                <kbd className="mono text-[11px] font-bold px-1.5 py-0.5 rounded"
                     style={{ background: 'rgba(245,158,11,0.16)', color: 'var(--amber)', border: '1px solid rgba(245,158,11,0.4)' }}>
                  {item.key}
                </kbd>
                <span className="text-[11px]" style={{ color: 'var(--text-dim)' }}>{item.label}</span>
              </span>
            ))}
            <button onClick={() => setShowStartHint(false)} className="ml-1 text-[11px] px-2 py-1 rounded"
                    style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-mute)' }}>
              {lang === Language.CN ? '知道了' : 'Got it'}
            </button>
          </div>
        </div>
      )}

      <TuningPanel
          open={showTuning}
          onClose={() => setShowTuning(false)}
          settings={settings}
          updateSettings={updateSettings}
          currentCarId={currentCarId}
          levelId={levelData?.levelId}
          lang={lang}
      />
    </div>
  );
};

export default UIOverlay;
