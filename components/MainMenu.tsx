import {assetUrl} from '../utils/assetUrl';
/**
 * 主菜单 —— 3A 竞速游戏风格（尘埃 / 极品飞车 / 地平线）
 * =====================================================
 * 分步进入游戏：
 *   00 标题画面（警灯氛围 + 黄黑警示带 + 点火提示）
 *   01 选择座驾（左侧固定车单 + 右侧真 3D 车模展台）
 *   02 选择训练场（关卡卡 + 当前组合 + 与游戏内一致的完整训练设置）
 *
 * 点击"启动引擎"后播放柔和速度感转场和真实点火声。
 * 所有按钮统一使用机械键盘式咔哒声。
 */

import React, { useEffect, useState } from 'react';
import { CarType, Language, UserSettings } from '../types';
import { CAR_MODELS, GARAGE_CARS, LEVEL_LIST, TRANSLATIONS } from '../constants';
import { getPowertrain } from '../utils/powertrain';
import { simulatedAccelerationSeconds } from '../utils/vehiclePerformance';
import CarPreview3D from './CarPreview3D';
import { configureMenuAudio, playIgnitionRev, playUiClick } from '../utils/menuAudio';
import {
  ChevronDown, ChevronLeft, ChevronRight, Lock, Gauge, Zap, Weight, CircleDot, Flag,
  CloudRain, Ghost, Lightbulb, Disc3, Settings2, SunMedium, CarFront, Route, Volume2, Keyboard, Play,
} from 'lucide-react';

interface MainMenuProps {
  start: () => void;
  settings: UserSettings;
  updateSettings: (s: Partial<UserSettings>) => void;
  currentCar: CarType;
  setCar: (c: CarType) => void;
  lang: Language;
  setLang: (l: Language) => void;
  selectedLevel: number;
  setSelectedLevel: (id: number) => void;
  initialStep?: 0 | 1 | 2;
  onOpenEditor?: (currentStep: number) => void;
  onPlayCustom?: (record: { polylines: any[]; obstacles: any[]; spots: any[]; markings: any[]; intersections?: any[]; mapWidth: number; mapHeight: number }) => void;
}

// 底部导航按钮（返回 / 主按钮同尺寸，紧挨在一起）
const NAV_BTN = 'px-6 py-3 text-[13px] flex items-center gap-2 justify-center whitespace-nowrap';

// ---------- 通用小件 ----------

const LangSwitch: React.FC<{ lang: Language; setLang: (l: Language) => void }> = ({ lang, setLang }) => (
  <div className="flex gap-1 p-1 clip-angle-sm" style={{ background: 'rgba(10,11,14,0.72)', border: '1px solid rgba(255,255,255,0.10)' }}>
    {[Language.CN, Language.EN].map(l => (
      <button
        key={l}
        onClick={(e) => { e.stopPropagation(); setLang(l); }}
        className="px-3 py-1 text-[11px] font-bold tracking-[0.14em] transition-all duration-150"
        style={lang === l
          ? { background: 'var(--amber)', color: '#0b0b0d', clipPath: 'polygon(4px 0, 100% 0, calc(100% - 4px) 100%, 0 100%)' }
          : { color: 'var(--text-mute)' }}
      >
        {l}
      </button>
    ))}
  </div>
);

const StepIndicator: React.FC<{ step: number; labels: string[] }> = ({ step, labels }) => (
  <div className="flex items-center gap-3">
    {labels.map((label, i) => {
      const active = i === step - 1;
      const done = i < step - 1;
      return (
        <div key={label} className="flex items-center gap-3">
          <div className="flex items-center gap-2 transition-all duration-300" style={{ opacity: active || done ? 1 : 0.35 }}>
            <span
              className="mono text-[10px] font-black px-1.5 py-0.5"
              style={{
                color: active ? '#0b0b0d' : 'var(--amber)',
                background: active ? 'var(--amber)' : 'transparent',
                border: '1px solid var(--amber)',
              }}
            >
              {String(i + 1).padStart(2, '0')}
            </span>
            <span className="text-[11px] font-bold tracking-[0.22em]" style={{ color: active ? 'var(--text)' : 'var(--text-dim)' }}>{label}</span>
          </div>
          {i < labels.length - 1 && <div className="w-8 h-px" style={{ background: done ? 'var(--amber)' : 'rgba(255,255,255,0.14)' }} />}
        </div>
      );
    })}
  </div>
);

const ApexButton: React.FC<{
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  className?: string;
}> = ({ children, onClick, primary, className = '' }) => (
  <button
    onClick={(e) => { e.stopPropagation(); onClick(); }}
    className={`clip-angle font-black tracking-[0.2em] uppercase transition-all duration-150 active:translate-y-px ${className}`}
    style={primary
      ? {
          background: '#f59e0b',
          color: '#0b0b0d',
          boxShadow: '0 0 24px rgba(245,158,11,0.35), inset 0 1px 0 rgba(255,255,255,0.35)',
        }
      : {
          background: 'rgba(255,255,255,0.04)',
          color: 'var(--text-dim)',
          border: '1px solid rgba(255,255,255,0.14)',
        }}
  >
    {children}
  </button>
);

// ---------- 动态背景 ----------

/** 黄黑警示跑马灯带：上下滚动条纹线 + 黑底滚动文字（双层运动，不再呆板） */
const TICKER_ITEMS = [
  'PARKING MASTER PRO',
  'DRIVING ACADEMY',
  '停车大师',
  '专业驾驶训练模拟',
  'CAUTION · 谨慎驾驶',
  'ENGINE READY',
];

const HazardBand: React.FC<{ top?: boolean }> = ({ top }) => (
  <div className="hazard-band" style={top ? { top: 0 } : { bottom: 0 }}>
    <div
      className="hazard-stripes absolute top-0 left-0 right-0 h-[5px]"
      style={top ? undefined : { animationDirection: 'reverse' }}
    />
    <div className="hazard-ticker">
      <div className={`hazard-ticker-track${top ? '' : ' reverse'}`}>
        {[0, 1].map(dup => (
          <span key={dup} className="flex shrink-0">
            {TICKER_ITEMS.map(item => (
              <span key={`${dup}-${item}`} className="hazard-ticker-item">{item}<i>◆</i></span>
            ))}
          </span>
        ))}
      </div>
    </div>
    <div
      className="hazard-stripes absolute bottom-0 left-0 right-0 h-[5px]"
      style={top ? { animationDirection: 'reverse' } : undefined}
    />
  </div>
);

const AnimatedBackdrop: React.FC = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none">
    {/* 基底暖色薄雾 */}
    <div className="absolute inset-0" style={{ background: 'rgba(245,158,11,0.02)' }} />
    {/* 透视网格地板 */}
    <div className="menu-grid-floor" />
    {/* 斜向流光 */}
    <div className="menu-streak" style={{ top: '18%', animationDelay: '0s' }} />
    <div className="menu-streak" style={{ top: '46%', animationDelay: '2.2s', animationDuration: '5.4s' }} />
    <div className="menu-streak" style={{ top: '72%', animationDelay: '3.6s', animationDuration: '6.8s' }} />
    {/* 黄黑警示跑马灯带（顶 / 底通栏：条纹线 + 滚动文字） */}
    <HazardBand top />
    <HazardBand />
    {/* 整体暗化层 */}
    <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.20)' }} />
  </div>
);

// ---------- 主组件 ----------

const MainMenu: React.FC<MainMenuProps> = ({
  start, settings, updateSettings, currentCar, setCar, lang, setLang, selectedLevel, setSelectedLevel, initialStep = 0, onOpenEditor, onPlayCustom,
}) => {
  const t = TRANSLATIONS[lang];
  const [step, setStep] = useState<0 | 1 | 2>(initialStep);
  const [launching, setLaunching] = useState(false);
  const [keyGuideOpen, setKeyGuideOpen] = useState(false);
  const isCN = lang === Language.CN;

  // 菜单只保留机械按键声和最终点火声，不再启动音乐、车流、警笛或对讲机。
  useEffect(() => {
    configureMenuAudio({ enabled: settings.soundEnabled, volume: settings.volume });
  }, [settings.soundEnabled, settings.volume]);

  const launch = () => {
    if (launching) return;
    setLaunching(true);
    playIgnitionRev();
    window.setTimeout(() => {
      start();
    }, 820);
  };

  const advance = () => {
    if (step === 0) setStep(1);
    else if (step === 1) setStep(2);
    else launch();
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (launching) return;
      if (e.key === 'Enter') { playUiClick('confirm'); advance(); }
      if (e.key === 'Escape' && step > 0) {
        playUiClick('back');
        setStep(s => (s > 0 ? (s - 1) as 0 | 1 | 2 : s));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, currentCar, selectedLevel, launching]);

  const car = CAR_MODELS[currentCar];
  const pt = getPowertrain(currentCar);

  return (
    <div
      className="relative w-full h-full overflow-hidden select-none"
      style={{ background: 'var(--bg)' }}
      onClickCapture={(e) => {
        const el = e.target as HTMLElement;
        // 所有按键统一按键音：button 直接命中；label 内嵌 input 由合成点击命中一次
        if (el.closest('button,[role="button"],input,select')) playUiClick();
      }}
      onClick={(event) => {
        if (step === 0 && !launching) {
          if (!(event.target as HTMLElement).closest('button,[role="button"],input,select')) playUiClick('confirm');
          advance();
        }
      }}
    >
      <AnimatedBackdrop />

      {/* 全局右上：语言 */}
      <div className="absolute top-6 right-6 z-40">
        <LangSwitch lang={lang} setLang={setLang} />
      </div>

      {/* ============ STEP 0：标题画面 ============ */}
      {step === 0 && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center menu-step-enter" key="title">
          {/* 警灯氛围：红蓝冷暖对冲 + 旋转光束 + 全屏交替洗色 */}
          <div className="police-glow police-glow-red" />
          <div className="police-glow police-glow-blue" />
          <div className="police-beam police-beam-red" />
          <div className="police-beam police-beam-blue" />
          <div className="police-wash" />

          <div className="relative flex items-center gap-3 mb-5">
            <span className="block h-[3px] w-14" style={{ background: 'var(--amber)', boxShadow: '0 0 12px var(--amber-glow)' }} />
            <span className="mono text-[11px] font-bold tracking-[0.5em]" style={{ color: 'var(--text-dim)' }}>
              PARKING MASTER PRO
            </span>
            <span className="block h-[3px] w-14" style={{ background: 'var(--amber)', boxShadow: '0 0 12px var(--amber-glow)' }} />
          </div>

          <h1 className="relative font-display italic leading-[0.95] text-center" style={{ fontSize: 'clamp(64px, 11vw, 148px)', fontWeight: 900 }}>
            {/* 紧贴的同款白色小阴影 ×2 = 视觉加粗描边，CJK 回落字体也能黑得起来 */}
            <span className="title-shine block" style={{
              fontWeight: 900,
              letterSpacing: '0.04em',
              textShadow: '0 0 2px rgba(255,255,255,0.92), 0 0 2px rgba(255,255,255,0.92), 0 0 42px rgba(245,158,11,0.4)',
            }}>停车大师</span>
            <span className="block text-outline mt-2" style={{ fontSize: '0.4em', fontWeight: 700, letterSpacing: '0.32em' }}>DRIVING ACADEMY</span>
          </h1>

          <p className="relative mt-6 text-sm tracking-[0.3em] font-medium" style={{ color: 'var(--text-dim)' }}>
            {isCN ? '专业驾驶训练模拟器' : t.menu.tagline.toUpperCase()}
          </p>

          <div className="relative mt-14 flex flex-col items-center gap-3 prompt-blink">
            <div className="clip-angle px-10 py-3 text-sm font-black tracking-[0.28em] uppercase"
                 style={{ background: '#f59e0b', color: '#0b0b0d', boxShadow: '0 0 32px rgba(245,158,11,0.4)' }}>
              {isCN ? '点 火 开 始' : 'START ENGINE'}
            </div>
            <span className="mono text-[10px] tracking-[0.3em]" style={{ color: 'var(--text-mute)' }}>
              {isCN ? t.menu.pressStart : 'CLICK OR PRESS ENTER'}
            </span>
          </div>

        </div>
      )}

      {/* ============ STEP 1：选择座驾 ============ */}
      {step === 1 && (
        <div className="absolute inset-0 z-10 flex flex-col px-10 pt-8 pb-7 menu-step-enter" key="garage" onClick={(e) => e.stopPropagation()}>
          {/* 头部 */}
          <div className="flex items-center justify-between pr-44">
            <div>
              <div className="mono text-[10px] font-bold tracking-[0.4em] mb-1" style={{ color: 'var(--amber)' }}>
                {isCN ? '车库' : t.menu.garage} / 01
              </div>
              <h2 className="font-display italic text-5xl tracking-tight" style={{ color: 'var(--text)', fontWeight: 900 }}>
                {isCN ? '选择你的座驾' : t.menu.stepCar}
              </h2>
            </div>
            <StepIndicator step={1} labels={isCN ? ['座驾', '出发地'] : [t.menu.garage, t.menu.selectTrack]} />
          </div>

          <div className="flex-1 min-h-0 flex gap-6 mt-5">
            {/* 左：固定宽度车辆列表（与大转盘左右互换） */}
            <aside className="w-[292px] shrink-0 min-h-0 flex flex-col gap-2.5 overflow-y-auto cockpit-scroll pr-1">
              {GARAGE_CARS.map((key) => {
                const c = CAR_MODELS[key as CarType];
                const p = getPowertrain(key as CarType);
                const isSelected = currentCar === key;
                return (
                  <button
                    key={key}
                    onClick={() => setCar(key as CarType)}
                    className="clip-angle-sm relative px-4 py-3 text-left transition-all duration-150 group shrink-0"
                    style={isSelected
                      ? { background: 'rgba(245,158,11,0.10)', border: '1px solid var(--amber)', boxShadow: '0 0 18px rgba(245,158,11,0.18)' }
                      : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
                  >
                    <img src={assetUrl("thumbnails/"+key+".png")} alt={c.name+"车辆外观"} className="w-full h-28 object-cover rounded mb-2" loading="lazy"/><div className="flex items-center justify-between">
                      <span className="font-display italic text-lg" style={{ color: isSelected ? 'var(--amber)' : 'var(--text)', fontWeight: 900 }}>{c.name}</span>
                      <span className="mono text-[9px] font-bold px-1.5 py-0.5 tracking-[0.14em]"
                            style={{ background: isSelected ? 'var(--amber)' : 'rgba(255,255,255,0.07)', color: isSelected ? '#0b0b0d' : 'var(--text-dim)' }}>
                        {c.dynamics.driveLayout}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 mt-2">
                      {[
                        { icon: <Zap size={10} />, label: isCN ? '功率' : 'kW', value: `${c.dynamics.powerKw}` },
                        { icon: <Disc3 size={10} />, label: isCN ? '扭矩' : 'Nm', value: `${c.dynamics.torqueNm}` },
                        { icon: <Gauge size={10} />, label: '模拟 0-100', value: `${simulatedAccelerationSeconds(c.id).toFixed(1)}s` },
                        { icon: <Weight size={10} />, label: isCN ? '车重' : 'kg', value: `${c.weight}` },
                      ].map((s, i) => (
                        <div key={i} className="flex flex-col">
                          <span className="flex items-center gap-1 text-[8px] tracking-[0.12em] uppercase" style={{ color: 'var(--text-mute)' }}>{s.icon}{s.label}</span>
                          <span className="mono text-xs font-bold" style={{ color: isSelected ? 'var(--text)' : 'var(--text-dim)' }}>{s.value}</span>
                        </div>
                      ))}
                    </div>
                    {/* 极速条 */}
                    <div className="mt-2 h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                      <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.min(100, (c.maxSpeed / 20) * 100)}%`, background: isSelected ? 'var(--amber)' : 'rgba(255,255,255,0.25)', boxShadow: isSelected ? '0 0 8px var(--amber-glow)' : 'none' }} />
                    </div>
                  </button>
                );
              })}
            </aside>

            {/* 右：3D 展台（min-w-0 防止 canvas 撑破布局） */}
            <div className="relative flex-1 min-w-0 min-h-0">
              <CarPreview3D carType={currentCar} accentColor="#f59e0b" />
              {/* 车名 + 核心参数浮层（无背景文字式） */}
              <div className="absolute left-0 bottom-2 pointer-events-none">
                <div className="font-display italic text-4xl" style={{ color: 'var(--text)', fontWeight: 900, textShadow: '0 4px 24px rgba(0,0,0,0.8)' }}>
                  {car.name}
                </div>
                <div className="mono text-[10px] tracking-[0.3em] mt-1" style={{ color: 'var(--amber)' }}>
                  {car.dynamics.driveLayout} · {car.dynamics.powerKw} kW · {car.dynamics.torqueNm} Nm
                </div>
              </div>
              <div className="absolute right-2 top-2 mono text-[9px] tracking-[0.24em] px-2 py-1 pointer-events-none" style={{ color: 'var(--text-mute)', border: '1px solid rgba(255,255,255,0.08)' }}>
                {isCN ? '拖拽环视 · 实时车模' : 'DRAG TO ORBIT · LIVE MODEL'}
              </div>
            </div>
          </div>

          {/* 底部导航：返回与主按钮紧挨、同尺寸 */}
          <div className="flex items-center justify-end gap-3 mt-5">
            <ApexButton onClick={() => setStep(0)} className={NAV_BTN}>
              <ChevronLeft size={15} strokeWidth={2.6} /> {isCN ? '返回' : t.menu.back}
            </ApexButton>
            <ApexButton primary onClick={() => setStep(2)} className={NAV_BTN}>
              {isCN ? '下一步 · 选择出发地' : t.menu.next} <ChevronRight size={16} strokeWidth={2.6} />
            </ApexButton>
          </div>
        </div>
      )}

      {/* ============ STEP 2：选择训练场 ============ */}
      {step === 2 && (
        <div className="absolute inset-0 z-10 flex flex-col px-10 pt-8 pb-16 menu-step-enter" key="course" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between pr-44">
            <div>
              <div className="mono text-[10px] font-bold tracking-[0.4em] mb-1" style={{ color: 'var(--amber)' }}>
                {isCN ? '出发地' : t.menu.selectTrack} / 02
              </div>
              <h2 className="font-display italic text-5xl tracking-tight" style={{ color: 'var(--text)', fontWeight: 900 }}>
                {isCN ? '选择出发地' : t.menu.stepLevel}
              </h2>
            </div>
            <StepIndicator step={2} labels={isCN ? ['座驾', '出发地'] : [t.menu.garage, t.menu.selectTrack]} />
          </div>

          <div className="flex-1 min-h-0 flex gap-6 mt-5">
            {/* 左：关卡卡片 */}
            <div className="flex-1 min-w-0 min-h-0 overflow-y-auto cockpit-scroll pr-1 grid grid-cols-2 gap-3 content-start">
              {LEVEL_LIST.map((level) => {
                const isLocked = level.locked;
                const isSelected = selectedLevel === level.id;
                return (
                  <button
                    key={level.id}
                    disabled={isLocked}
                    onClick={() => setSelectedLevel(level.id)}
                    className="clip-angle-sm relative p-4 h-56 text-left transition-all duration-150 overflow-hidden"
                    style={isLocked
                      ? { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', cursor: 'not-allowed', opacity: 0.45 }
                      : isSelected
                        ? { background: 'rgba(245,158,11,0.12)', border: '1px solid var(--amber)', boxShadow: '0 0 20px rgba(245,158,11,0.16)' }
                        : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
                  >
                    <img src={assetUrl(level.thumbnail)} alt={level.name+"路线缩略图"} className="w-full h-28 object-contain rounded mb-2"/><span className="font-display italic absolute -bottom-3 right-1 font-black mono select-none"
                          style={{ fontSize: 74, color: isSelected ? 'var(--amber)' : 'rgba(255,255,255,0.06)', lineHeight: 1 }}>
                      0{level.id}
                    </span>
                    {isLocked && <div className="absolute top-3 right-3"><Lock size={15} style={{ color: 'var(--text-mute)' }} /></div>}
                    <div className="flex items-center gap-2">
                      <Flag size={13} style={{ color: isSelected ? 'var(--amber)' : 'var(--text-mute)' }} />
                      <span className="font-bold text-[15px]" style={{ color: isSelected ? 'var(--amber)' : 'var(--text)' }}>
                        {level.name || level.name}
                      </span>
                    </div>
                    <p className="text-[11px] leading-4 mt-1.5 pr-10" style={{ color: 'var(--text-mute)' }}>{level.desc}</p>
                  </button>
                );
              })}
              {/* 自定义关卡（来自地图编辑器存档） */}
              {(() => {
                if (!onPlayCustom) return null;
                let saves: Record<string, any> = {};
                try { saves = JSON.parse(localStorage.getItem('map-editor-saves-v2') || '{}'); } catch { /* ignore */ }
                const entries = Object.entries(saves);
                if (entries.length === 0) return null;
                return (
                  <>
                    <div className="col-span-2 flex items-center gap-2 mt-2 mb-1">
                      <span className="mono text-[10px] tracking-[0.25em] uppercase" style={{ color: 'var(--cyan)' }}>自定义关卡</span>
                      <div className="flex-1 h-px" style={{ background: 'rgba(34,211,238,0.2)' }} />
                    </div>
                    {entries.map(([name, rec]) => (
                      <button
                        key={name}
                        onClick={() => { playUiClick(); onPlayCustom(rec); }}
                        className="clip-angle-sm relative text-left px-4 py-3 transition-all duration-200 hover:scale-[1.02] hover:brightness-110"
                        style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.35)' }}
                      >
                        <div className="flex items-center gap-2">
                          <Play size={13} style={{ color: 'var(--cyan)' }} />
                          <span className="font-bold text-[15px]" style={{ color: 'var(--cyan)' }}>{name}</span>
                        </div>
                        <p className="text-[11px] leading-4 mt-1.5" style={{ color: 'var(--text-mute)' }}>编辑器存档 · 点击直接试玩</p>
                      </button>
                    ))}
                  </>
                );
              })()}
            </div>

            {/* 右：当前组合（置顶）+ 完整训练设置 + 同尺寸按钮组 */}
            <aside className="w-[360px] shrink-0 min-h-0 flex flex-col gap-3">
              {/* 当前驾驶组合（置顶展示） */}
              <div className="clip-angle-sm px-4 py-3 shrink-0"
                   style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.35)' }}>
                <div className="mono text-[9px] tracking-[0.3em] mb-1" style={{ color: 'var(--amber)' }}>
                  {isCN ? '当前驾驶组合' : 'CURRENT SESSION'}
                </div>
                <div className="font-display italic text-xl" style={{ color: 'var(--text)', fontWeight: 900 }}>
                  {car.name}
                  <span style={{ color: 'var(--amber)' }}> × </span>
                  {LEVEL_LIST.find(l => l.id === selectedLevel)?.name || t.levels[selectedLevel as keyof typeof t.levels]}
                </div>
                <div className="mono text-[10px] mt-0.5" style={{ color: 'var(--text-mute)' }}>
                  {simulatedAccelerationSeconds(car.id).toFixed(1)}s · {(car.maxSpeed * 15).toFixed(0)} km/h · {car.dynamics.driveLayout}
                </div>
              </div>

              {/* 训练设置（与游戏内设置保持一致） */}
              <div className="clip-angle-sm flex-1 min-h-0 overflow-y-auto cockpit-scroll p-4"
                   style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <Settings2 size={13} style={{ color: 'var(--amber)' }} />
                  <span className="text-[11px] font-black tracking-[0.24em] uppercase" style={{ color: 'var(--text-dim)' }}>
                    {isCN ? t.menu.sessionSetup : 'SESSION SETUP'}
                  </span>
                </div>
                <div className="space-y-1">
                  <MenuToggle icon={<Volume2 size={13} />} label={t.sound} checked={settings.soundEnabled} onChange={v => updateSettings({ soundEnabled: v })} />
                  {settings.soundEnabled && (
                    <div className="px-2 pb-1.5">
                      <div className="flex justify-between mb-1">
                        <span className="text-[10px] font-medium" style={{ color: 'var(--text-mute)' }}>{t.volume}</span>
                        <span className="mono text-[10px]" style={{ color: 'var(--amber)' }}>{Math.round(settings.volume * 100)}%</span>
                      </div>
                      <input type="range" min={0} max={1} step={0.05} value={settings.volume}
                             onChange={e => updateSettings({ volume: parseFloat(e.target.value) })}
                             className="cockpit-range w-full" />
                    </div>
                  )}
                  <MenuToggle icon={<CloudRain size={13} />} label={t.weather} checked={settings.weatherEnabled} onChange={v => updateSettings({ weatherEnabled: v })} />
                  <MenuToggle icon={<SunMedium size={13} />} label={t.shadows} checked={settings.shadowsEnabled} onChange={v => updateSettings({ shadowsEnabled: v })} />
                  <MenuToggle icon={<CarFront size={13} />} label={t.mirrors} checked={settings.rearviewMirrors} onChange={v => updateSettings({ rearviewMirrors: v })} />
                  <MenuToggle icon={<Ghost size={13} />} label={t.ghostWheel} checked={settings.wheelGhost} onChange={v => updateSettings({ wheelGhost: v })} />
                  <MenuToggle icon={<Route size={13} />} label={t.turnAssist} checked={settings.turnAssist} onChange={v => updateSettings({ turnAssist: v })} />
                  <MenuToggle icon={<Lightbulb size={13} />} label={t.autoSignal} checked={settings.autoTurnSignal} onChange={v => updateSettings({ autoTurnSignal: v })} />
                  <MenuToggle icon={<CircleDot size={13} />} label={isCN ? '罗技旋钮方向盘' : 'Logitech dial'} checked={settings.logitechKnobMode} onChange={v => updateSettings({ logitechKnobMode: v })} />
                </div>

                {/* 按键指南（与游戏内设置一致） */}
                <div className="mt-3 rounded-lg overflow-hidden" style={{ border: '1px solid var(--hairline)' }}>
                  <button
                    type="button"
                    onClick={() => setKeyGuideOpen(open => !open)}
                    className="w-full flex items-center justify-between px-3 py-2.5 transition-colors hover:bg-white/[0.03]"
                    style={{ background: 'var(--bg)' }}
                  >
                    <span className="flex items-center gap-2 text-[11px] font-bold tracking-[0.12em]" style={{ color: 'var(--text-dim)' }}>
                      <Keyboard size={12} style={{ color: 'var(--amber)' }} />
                      {isCN ? t.keyGuide : 'KEY GUIDE'}
                    </span>
                    <ChevronDown size={13} style={{ color: 'var(--text-mute)', transform: keyGuideOpen ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
                  </button>
                  {keyGuideOpen && (
                    <div className="px-3 py-3 space-y-2" style={{ background: 'rgba(0,0,0,0.25)', borderTop: '1px solid var(--hairline)' }}>
                      {settings.logitechKnobMode && (
                        <div className="rounded-lg p-2.5 mb-1 text-[10px] leading-4"
                             style={{ color: 'var(--cyan)', background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.2)' }}>
                          {isCN
                            ? '旋钮=方向 · O=倒挡 · I=油门 · K=刹车 · J/L=加/减挡 · M=启动 · P=驻车'
                            : 'Dial=steer · O=reverse · I=gas · K=brake · J/L=shift · M=start · P=park'}
                        </div>
                      )}
                      {Object.entries(t.controls).map(([key, value]) => {
                        const match = (value as string).match(/\[(.*?)\] (.*)/);
                        return (
                          <div key={key} className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-medium" style={{ color: 'var(--text-dim)' }}>{match ? match[2] : (value as string)}</span>
                            {match && (
                              <span className="mono px-1.5 py-0.5 rounded text-[9px] font-bold whitespace-nowrap"
                                    style={{ background: 'var(--bg)', border: '1px solid var(--hairline)', color: 'var(--amber)' }}>
                                {match[1]}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

            </aside>
          </div>

          {/* 返回与启动按钮紧挨、同尺寸 */}
          <div className="flex items-center justify-end gap-3 shrink-0">
            <ApexButton onClick={() => setStep(1)} className={NAV_BTN}>
              <ChevronLeft size={15} strokeWidth={2.6} /> {isCN ? '返回' : t.menu.back}
            </ApexButton>
            {onOpenEditor && (
              <ApexButton onClick={() => onOpenEditor(step)} className={NAV_BTN}>
                🗺️ {isCN ? '地图编辑器' : 'Map Editor'}
              </ApexButton>
            )}
            <ApexButton primary onClick={launch} className={`${NAV_BTN} start-pulse`}>
              {isCN ? '启动引擎' : t.menu.startEngine}
              <ChevronRight size={16} strokeWidth={2.8} />
            </ApexButton>
          </div>
        </div>
      )}

      {/* ============ START ENGINE 柔和点火转场 ============ */}
      {launching && (
        <div className="launch-overlay">
          {Array.from({ length: 14 }).map((_, i) => (
            <span
              key={i}
              className="launch-streak"
              style={{
                top: `${6 + i * 6.6}%`,
                animationDelay: `${i * 0.032}s`,
                height: i % 4 === 0 ? 3 : 2,
                opacity: 0,
              }}
            />
          ))}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="launch-title font-display italic text-7xl text-center"
                 style={{ color: '#fff', fontWeight: 900, textShadow: '0 0 42px rgba(245,158,11,0.85), 0 0 12px rgba(255,255,255,0.6)' }}>
              {isCN ? '引擎启动' : 'IGNITION'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// 菜单内开关行
const MenuToggle: React.FC<{ icon: React.ReactNode; label: string; checked: boolean; onChange: (v: boolean) => void }> = ({ icon, label, checked, onChange }) => (
  <label className="flex items-center justify-between cursor-pointer px-2 py-1.5 rounded transition-colors hover:bg-white/[0.04]">
    <span className="flex items-center gap-2 text-[13px] font-medium" style={{ color: checked ? 'var(--text)' : 'var(--text-dim)' }}>
      <span style={{ color: checked ? 'var(--amber)' : 'var(--text-mute)' }}>{icon}</span>
      {label}
    </span>
    <span className="relative inline-flex items-center">
      <input type="checkbox" className="sr-only" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="block w-9 h-5 rounded-full transition-colors" style={{ background: checked ? 'var(--amber)' : 'var(--panel-3)' }}></span>
      <span className="absolute left-0.5 top-0.5 block w-4 h-4 rounded-full bg-black transition-transform" style={{ transform: checked ? 'translateX(16px)' : 'translateX(0)' }}></span>
    </span>
  </label>
);

export default MainMenu;
