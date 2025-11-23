import React, { useRef, useState, useEffect } from 'react';
import { UserSettings, InputState, Language, ParkingResultType, CarType, LevelData, ParkingSpot } from '../types';
import { STEERING_WHEEL_MAX_ROTATION, TRANSLATIONS, GEAR_MAX_SPEEDS } from '../constants';
import { Settings, X, Zap, Pause, HelpCircle, Power, Volume2, Gauge, ChevronUp, ChevronDown, RotateCcw, Bot, MapPin, Check, Keyboard } from 'lucide-react';

interface UIOverlayProps {
  isMobile: boolean;
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
  cursorPos: { x: number, y: number };
  isDragging: boolean;
  onSettingsToggle: (isOpen: boolean) => void;
  currentCarId: CarType;
  levelData: LevelData | null;
  onAutoPark: (spot: ParkingSpot | null) => void; // Updated to allow null
  isAutoParking: boolean; 
}

const Toggle: React.FC<{label: string, checked: boolean, onChange: (v: boolean) => void}> = ({label, checked, onChange}) => (
    <label className="flex justify-between items-center cursor-pointer group">
        <span className="text-gray-300 font-medium group-hover:text-white transition-colors">{label}</span>
        <div className="relative">
            <input type="checkbox" className="sr-only" checked={checked} onChange={e => onChange(e.target.checked)} />
            <div className={`w-12 h-6 rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-gray-700'}`}></div>
            <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${checked ? 'translate-x-6' : 'translate-x-0'}`}></div>
        </div>
    </label>
);

const UIOverlay: React.FC<UIOverlayProps> = ({
  isMobile,
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
  cursorPos,
  isDragging,
  onSettingsToggle,
  currentCarId,
  levelData,
  onAutoPark,
  isAutoParking
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showMapSelect, setShowMapSelect] = useState(false);
  const [selectedSpot, setSelectedSpot] = useState<ParkingSpot | null>(null);
  
  const throttleRef = useRef<HTMLDivElement>(null);
  const brakeRef = useRef<HTMLDivElement>(null);
  const [blink, setBlink] = useState(false); 
  
  const [visualRpm, setVisualRpm] = useState(0);

  useEffect(() => {
      const handler = () => setShowSettings(prev => !prev);
      window.addEventListener('toggle-settings', handler);
      return () => window.removeEventListener('toggle-settings', handler);
  }, []);

  useEffect(() => {
      onSettingsToggle(showSettings || showMapSelect);
  }, [showSettings, showMapSelect, onSettingsToggle]);

  useEffect(() => {
    const timer = setInterval(() => {
        setBlink(prev => !prev);
    }, 150); 
    return () => clearInterval(timer);
  }, []);
  
  useEffect(() => {
      const updateRpm = () => {
          let target = 0;
          const idle = 900;
          
          if (!inputState.engineStarted) {
             target = 0;
          } else {
             const throttleVal = inputState.gasPressed ? 1 : inputState.throttle;
             
             if (inputState.gear === 0) {
                 target = idle + (Math.pow(throttleVal, 0.8) * 6500);
             } else {
                 const activeGearKey = String(Math.abs(inputState.gear)) as keyof typeof GEAR_MAX_SPEEDS;
                 const gearMax = GEAR_MAX_SPEEDS[activeGearKey] || 1;
                 const speedRatio = Math.min(1.2, Math.abs(carSpeed) / gearMax); 
                 const wheelRpm = idle + (speedRatio * 6000);
                 const stallSpeed = 2500;
                 const converterSlip = throttleVal * (stallSpeed - idle); 
                 target = Math.max(wheelRpm, idle + converterSlip);
             }
          }
          target = Math.min(8000, Math.max(0, target));
          const riseSpeed = 0.2;
          const fallSpeed = 0.05;
          const lerpFactor = target > visualRpm ? riseSpeed : fallSpeed;
          setVisualRpm(prev => prev + (target - prev) * lerpFactor);
      };
      const timer = setInterval(updateRpm, 16);
      return () => clearInterval(timer);
  }, [inputState, carSpeed, visualRpm]);

  const t = TRANSLATIONS[lang];
  const normalizedSteer = inputState.steeringWheelAngle / STEERING_WHEEL_MAX_ROTATION;

  const handlePedalMove = (type: 'throttle' | 'brake', e: React.TouchEvent) => {
      const touch = e.touches[0];
      const ref = type === 'throttle' ? throttleRef.current : brakeRef.current;
      if(!ref) return;
      const rect = ref.getBoundingClientRect();
      const val = 1 - (touch.clientY - rect.top) / rect.height;
      const clamped = Math.max(0, Math.min(1, val));
      setInputState((prev) => ({ ...prev, [type]: clamped }));
  };

  const GearBox = () => (
      <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-6 py-2 rounded-xl border border-gray-700 shadow-lg">
        {['-1', '0', '1', '2', '3', '4', '5'].map(g => {
            const gearNum = parseInt(g);
            const isActive = inputState.gear === gearNum;
            let label = g;
            if (g === '-1') label = 'R';
            if (g === '0') label = 'N';
            return (
                <div key={g} className={`w-8 h-8 flex items-center justify-center rounded font-black text-sm transition-all ${isActive ? (gearNum === -1 ? 'bg-red-600 text-white scale-110' : gearNum === 0 ? 'bg-gray-500 text-white scale-110' : 'bg-green-500 text-white scale-110') : 'bg-gray-800 text-gray-500'}`}>
                    {label}
                </div>
            );
        })}
    </div>
  );

  const SteeringScale = () => {
      const SEGMENTS_PER_SIDE = 24;
      const activeSegments = Math.round(Math.abs(normalizedSteer) * SEGMENTS_PER_SIDE);
      const isLeft = normalizedSteer < 0;
      const isRight = normalizedSteer > 0;

      const renderSide = (side: 'left' | 'right') => (
          <div className={`flex ${side === 'left' ? 'flex-row-reverse' : 'flex-row'} items-center gap-[2px]`}>
              {Array.from({ length: SEGMENTS_PER_SIDE }).map((_, i) => {
                  const isActive = (side === 'left' && isLeft && i < activeSegments) || 
                                   (side === 'right' && isRight && i < activeSegments);
                  const activeColor = side === 'left' ? 'bg-green-500 border-green-500 shadow-[0_0_5px_#22c55e]' : 'bg-red-500 border-red-500 shadow-[0_0_5px_#ef4444]';
                  const inactiveColor = 'bg-transparent border-gray-600';
                  const isGroupEnd = (i + 1) % 8 === 0 && i !== SEGMENTS_PER_SIDE - 1;
                  const marginClass = isGroupEnd ? (side === 'left' ? 'ml-2' : 'mr-2') : '';
                  
                  const isMax = i === SEGMENTS_PER_SIDE - 1 && isActive;
                  const blinkStyle = isMax && blink ? { opacity: 0.2 } : {};
                  const scaleClass = isMax ? 'scale-125 z-10' : '';

                  return (
                      <div 
                        key={i} 
                        style={blinkStyle}
                        className={`w-1.5 h-3 md:w-2 md:h-4 border ${isActive ? activeColor : inactiveColor} ${marginClass} ${scaleClass} transition-all duration-75`}
                      ></div>
                  );
              })}
          </div>
      );
      return (
          <div className="flex items-center justify-center gap-4 bg-black px-6 py-3 rounded-full border border-gray-800 shadow-xl">
              {renderSide('left')}
              <div className="h-6 w-1 bg-white rounded-full shadow-lg"></div>
              {renderSide('right')}
          </div>
      );
  };

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between z-10 text-white">
      {showReward.show && (
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 animate-bounce z-50">
              <div className={`font-black text-4xl px-8 py-4 rounded-full shadow-[0_0_50px_rgba(255,255,255,0.2)] border-4 border-white transform rotate-[-5deg] ${
                  showReward.amount > 50 ? 'bg-green-500 text-white' : showReward.amount > 0 ? 'bg-yellow-500 text-black' : 'bg-red-600 text-white'
              }`}>
                  {showReward.type === 'perfect' && t.parking.perfect}
                  {showReward.type === 'good' && t.parking.good}
                  {showReward.type === 'reverse' && t.parking.reverse}
                  {showReward.type === 'line' && t.parking.line}
                  {showReward.type === 'fail' && t.parking.fail}
              </div>
          </div>
      )}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 pointer-events-none z-20 hidden md:block">
          <SteeringScale />
      </div>

      {/* TOP LEFT STATS */}
      <div className="absolute top-0 left-0 w-auto flex flex-col md:flex-row items-start md:items-center gap-2 p-4 pointer-events-auto bg-transparent z-40">
        <div className="flex items-center gap-6 bg-black/40 p-2 rounded-xl backdrop-blur border border-gray-800 shadow-md">
             <div className="flex flex-col">
                <div className="text-yellow-500 text-xs font-bold tracking-widest uppercase mb-1">{t.money}</div>
                <div className={`text-2xl font-mono font-bold leading-none ${money < 0 ? 'text-red-500' : 'text-white'}`}>${money}</div>
             </div>
             <div className="h-8 w-[1px] bg-gray-600"></div>
             <div className="flex flex-col">
                <div className="text-blue-400 text-xs font-bold tracking-widest uppercase mb-1">{t.level}</div>
                <div className="text-xl font-mono font-bold text-white leading-none">0{level}</div>
             </div>
        </div>
        
        <div className="flex items-center gap-3 bg-black/40 p-2 rounded-xl border border-gray-800 backdrop-blur-md shadow-md">
             <div className="flex gap-1 bg-black/20 p-1 rounded-lg border border-gray-700">
                <button onClick={() => setLang(Language.CN)} className={`px-3 py-1 text-xs font-bold rounded transition-colors ${lang === Language.CN ? 'bg-white text-black' : 'text-gray-400 hover:text-white'}`}>CN</button>
                <button onClick={() => setLang(Language.EN)} className={`px-3 py-1 text-xs font-bold rounded transition-colors ${lang === Language.EN ? 'bg-white text-black' : 'text-gray-400 hover:text-white'}`}>EN</button>
            </div>
            <button onClick={() => setShowSettings(true)} className="p-2 rounded-full hover:bg-white/20 transition-all relative group">
                <Settings size={20} className="text-gray-200" />
                <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-black/80 text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none">
                    Settings [M]
                </div>
            </button>
        </div>
      </div>

      {/* KEYBOARD CONTROLS GUIDE (Desktop Only) */}
      {!isMobile && (
          <div className="absolute top-24 left-4 z-30 flex flex-col items-start gap-2 pointer-events-auto transition-all">
              {/* Collapsed State */}
              {!showControls && (
                  <button 
                      onClick={() => setShowControls(true)} 
                      className="bg-black/60 hover:bg-black/80 text-white p-2 rounded-lg border border-gray-700 backdrop-blur-sm shadow-lg flex items-center gap-2 transition-all hover:scale-105"
                  >
                      <Keyboard size={18} className="text-yellow-500" />
                      <span className="text-xs font-bold uppercase hidden md:inline">Controls</span>
                  </button>
              )}

              {/* Expanded State */}
              {showControls && (
                  <div className="bg-black/80 backdrop-blur-md border border-gray-700 rounded-xl overflow-hidden shadow-2xl w-64 animate-in fade-in slide-in-from-left-4 duration-200">
                      <div 
                          className="flex items-center justify-between px-4 py-3 bg-white/5 cursor-pointer hover:bg-white/10 transition-colors border-b border-gray-700"
                          onClick={() => setShowControls(false)}
                      >
                          <div className="flex items-center gap-2">
                              <Keyboard size={16} className="text-yellow-500" />
                              <span className="text-xs font-bold text-white uppercase tracking-wider">Key Guide</span>
                          </div>
                          <ChevronUp size={14} className="text-gray-400" />
                      </div>
                      
                      <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar">
                          {/* Parse and render controls from translations */}
                          {Object.entries(t.controls).map(([key, value]) => {
                               // Expected format: "[Key] Description"
                               const match = value.match(/\[(.*?)\] (.*)/);
                               let k = "";
                               let desc = value;
                               if (match) {
                                   k = match[1];
                                   desc = match[2];
                               }

                               return (
                                  <div key={key} className="flex items-center justify-between group">
                                      <span className="text-[10px] text-gray-300 font-medium group-hover:text-white transition-colors">{desc}</span>
                                      {k && (
                                          <span className="px-1.5 py-0.5 bg-gray-800 border border-gray-600 rounded text-[9px] font-mono font-bold text-yellow-500 shadow-sm min-w-[20px] text-center whitespace-nowrap">
                                              {k}
                                          </span>
                                      )}
                                  </div>
                               );
                          })}
                          <div className="pt-2 mt-2 border-t border-gray-700 text-[10px] text-gray-500 italic text-center">
                              Press [M] for Settings
                          </div>
                      </div>
                  </div>
              )}
          </div>
      )}

      <div className="absolute bottom-8 left-8 pointer-events-none opacity-90 z-40">
          <div className="relative w-32 h-32 bg-gray-900 rounded-full border-4 border-gray-700 shadow-2xl flex items-center justify-center"
               style={{ transform: `rotate(${inputState.steeringWheelAngle}deg)`, transition: 'transform 0.1s linear' }}>
               <div className="absolute inset-0 rounded-full border-[12px] border-[#222] shadow-inner"></div>
               <div className="absolute w-full h-4 bg-[#333] top-1/2 -translate-y-1/2"></div>
               <div className="absolute w-4 h-1/2 bg-[#333] bottom-0 left-1/2 -translate-x-1/2"></div>
               <div className="absolute w-10 h-10 bg-[#444] rounded-full z-10 border-2 border-gray-600"></div>
               <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-4 bg-yellow-500 z-20"></div>
          </div>
          <div className="mt-2 text-center font-bold text-gray-500 text-xs uppercase tracking-wider">Steering</div>
      </div>

      {/* AUTO PARK BUTTON / CANCEL BUTTON */}
      {currentCarId !== CarType.TRUCK && !isMobile && (
          <div className="absolute bottom-8 left-44 pointer-events-auto z-50">
              {!isAutoParking ? (
                  <button 
                    onClick={() => setShowMapSelect(true)}
                    className="group bg-cyan-900/80 hover:bg-cyan-700 p-4 rounded-2xl border-2 border-cyan-500/50 shadow-[0_0_20px_rgba(6,182,212,0.3)] transition-all hover:scale-105 active:scale-95 flex flex-col items-center justify-center gap-1"
                  >
                      <Bot size={28} className="text-cyan-300" />
                      <span className="text-[10px] font-bold text-cyan-100 uppercase tracking-wide">Auto Pilot</span>
                  </button>
              ) : (
                  <button 
                    onClick={() => onAutoPark(null)}
                    className="group bg-red-900/90 hover:bg-red-700 p-4 rounded-2xl border-2 border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.4)] animate-pulse transition-all hover:scale-105 active:scale-95 flex flex-col items-center justify-center gap-1"
                  >
                      <X size={28} className="text-red-300" />
                      <span className="text-[10px] font-bold text-red-100 uppercase tracking-wide">STOP PILOT</span>
                  </button>
              )}
          </div>
      )}

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-auto z-30">
        <GearBox />
      </div>

      <div className="absolute bottom-6 right-6 pointer-events-none flex items-end gap-4">
          <div className="flex flex-col gap-2 mb-2">
              <div className={`flex items-center gap-2 px-2 py-1 rounded border transition-colors ${inputState.engineStarted ? 'bg-green-900/60 border-green-400 text-green-300 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-gray-900/40 border-gray-700 text-gray-600'}`}>
                  <Power size={12} fill={inputState.engineStarted ? "currentColor" : "none"} />
                  <span className="text-[10px] font-bold">ENGINE</span>
              </div>
              <div className={`flex items-center gap-2 px-2 py-1 rounded border transition-colors ${inputState.lights ? 'bg-blue-900/60 border-blue-400 text-blue-300 shadow-[0_0_10px_rgba(59,130,246,0.5)]' : 'bg-gray-900/40 border-gray-700 text-gray-600'}`}>
                  <Zap size={12} fill={inputState.lights ? "currentColor" : "none"} />
                  <span className="text-[10px] font-bold">LIGHTS</span>
              </div>
              <div className={`flex items-center gap-2 px-2 py-1 rounded border transition-colors ${inputState.handbrake ? 'bg-red-900/60 border-red-500 text-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'bg-gray-900/40 border-gray-700 text-gray-600'}`}>
                  <Pause size={12} fill={inputState.handbrake ? "currentColor" : "none"} />
                  <span className="text-[10px] font-bold">PARK</span>
              </div>
          </div>

          <div className="bg-black/80 backdrop-blur-md p-4 rounded-2xl border border-gray-800 flex items-center gap-6 shadow-2xl relative overflow-hidden">
              <div className="relative w-32 h-32">
                  <svg viewBox="0 0 100 100" className="w-full h-full transform rotate-[-225deg]">
                      <circle cx="50" cy="50" r="45" fill="none" stroke="#1f2937" strokeWidth="10" strokeDasharray="200 100" />
                      <path d="M 50 5 a 45 45 0 0 1 32 13" fill="none" stroke="#dc2626" strokeWidth="10" />
                      {Array.from({length: 9}).map((_, i) => {
                         const angle = (i / 8) * 270; 
                         const rad = (angle * Math.PI) / 180;
                         const x1 = 50 + 35 * Math.cos(rad);
                         const y1 = 50 + 35 * Math.sin(rad);
                         const x2 = 50 + 45 * Math.cos(rad);
                         const y2 = 50 + 45 * Math.sin(rad);
                         return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#9ca3af" strokeWidth="2" />;
                      })}
                  </svg>
                  <div className="absolute top-0 left-0 w-full h-full transition-transform duration-100 ease-linear" style={{ transform: `rotate(${((Math.min(visualRpm, 8000) / 8000) * 270) - 45}deg)` }}>
                      <div className="absolute top-2 left-1/2 w-1 h-1/2 bg-red-500 origin-bottom rounded-full shadow-lg"></div>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-[10px] font-bold text-gray-500 mt-8">x1000 RPM</div>
                  </div>
              </div>
              <div className="flex flex-col items-center justify-center w-24">
                  <div className="text-5xl font-black font-mono text-white italic tabular-nums tracking-tighter">
                      {Math.round(Math.abs(carSpeed) * 15)}
                  </div>
                  <div className="text-xs font-bold text-yellow-500">KM/H</div>
              </div>
          </div>
      </div>

      {isMobile && (
        <div className="flex justify-end items-end pointer-events-auto h-full w-full pb-8 px-6 absolute top-0 right-0 pointer-events-none">
          <div className="pointer-events-auto flex gap-6 items-end mb-4">
             <div className="flex flex-col gap-2 mr-4 mb-4">
                  <button className={`w-12 h-12 rounded-lg border font-bold transition-colors ${inputState.engineStarted ? 'bg-green-600 border-green-400 text-white' : 'bg-red-900 border-red-600 text-gray-400'}`} onClick={() => setInputState(p => ({...p, engineStarted: !p.engineStarted}))}><Power size={20}/></button>
                  <button className="w-12 h-12 bg-gray-800 rounded-lg border border-gray-600 text-white font-bold active:bg-green-900 transition-colors" onClick={() => setInputState(p => ({...p, gear: Math.min(5, p.gear === -1 ? 0 : p.gear + 1)}))}>+</button>
                  <button className="w-12 h-12 bg-gray-800 rounded-lg border border-gray-600 text-white font-bold active:bg-red-900 transition-colors" onClick={() => setInputState(p => ({...p, gear: Math.max(0, p.gear === -1 ? 0 : p.gear - 1)}))}>-</button>
                  <button className={`w-12 h-12 rounded-lg border font-bold transition-colors ${inputState.gear === -1 ? 'bg-red-600 border-red-400 text-white' : 'bg-gray-800 border-gray-600 text-gray-400'}`} onClick={() => setInputState(p => ({...p, gear: -1}))}>R</button>
             </div>
             <div ref={brakeRef} className="w-20 h-36 bg-gray-900 border-4 border-gray-700 rounded-t-lg relative overflow-hidden touch-none shadow-lg active:scale-95 transition-transform" onTouchStart={(e) => handlePedalMove('brake', e)} onTouchMove={(e) => handlePedalMove('brake', e)} onTouchEnd={() => setInputState(p => ({...p, brake: 0}))} style={{ background: 'linear-gradient(180deg, #333 0%, #111 100%)'}}>
                 <div className="absolute bottom-0 left-0 right-0 bg-red-600/50 transition-all duration-75" style={{ height: `${inputState.brake * 100}%` }}></div>
                 <span className="absolute bottom-4 w-full text-center font-black text-gray-500 select-none pointer-events-none">STOP</span>
             </div>
             <div ref={throttleRef} className="w-20 h-44 bg-gray-900 border-4 border-gray-700 rounded-t-lg relative overflow-hidden touch-none shadow-lg active:scale-95 transition-transform" onTouchStart={(e) => handlePedalMove('throttle', e)} onTouchMove={(e) => handlePedalMove('throttle', e)} onTouchEnd={() => setInputState(p => ({...p, throttle: 0}))} style={{ background: 'linear-gradient(180deg, #333 0%, #111 100%)'}}>
                 <div className="absolute bottom-0 left-0 right-0 bg-green-500/50 transition-all duration-75" style={{ height: `${inputState.throttle * 100}%` }}></div>
                 <span className="absolute bottom-4 w-full text-center font-black text-gray-500 select-none pointer-events-none">GO</span>
             </div>
          </div>
        </div>
      )}

      {showSettings && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 pointer-events-auto">
              <div className="bg-gray-900/90 p-8 rounded-2xl border border-gray-600 w-96 shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-yellow-500 via-red-500 to-blue-500"></div>
                  <div className="flex justify-between items-center mb-8">
                      <h2 className="text-3xl font-black text-white tracking-tighter italic">{t.settings}</h2>
                      <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X className="text-white" /></button>
                  </div>
                  <div className="space-y-6">
                      <Toggle label={t.sound} checked={settings.soundEnabled} onChange={v => updateSettings({soundEnabled: v})} />
                      <div>
                           <div className="flex justify-between mb-1">
                                <div className="text-gray-300 font-bold text-sm flex items-center gap-2"><Volume2 size={14}/> {t.volume}</div>
                                <div className="text-blue-400 font-mono text-sm">{Math.round(settings.volume * 100)}%</div>
                           </div>
                           <input type="range" min="0" max="1" step="0.05" value={settings.volume} onChange={e => updateSettings({volume: parseFloat(e.target.value)})} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                      </div>
                      <Toggle label={t.weather} checked={settings.weatherEnabled} onChange={v => updateSettings({weatherEnabled: v})} />
                      <Toggle label={t.autoSignal} checked={settings.autoTurnSignal} onChange={v => updateSettings({autoTurnSignal: v})} />
                      <Toggle label={t.turnAssist} checked={settings.turnAssist} onChange={v => updateSettings({turnAssist: v})} /> 
                      <Toggle label={t.ghostWheel} checked={settings.wheelGhost} onChange={v => updateSettings({wheelGhost: v})} />
                      <div className="pt-6 border-t border-gray-700">
                          <div className="flex justify-between mb-2">
                              <div className="text-gray-300 font-bold text-sm flex items-center gap-2"><Gauge size={14}/> {t.sensitivity}</div>
                              <div className="text-yellow-500 font-mono text-sm">{settings.steeringSensitivity.toFixed(1)}x</div>
                          </div>
                          <input type="range" min="1.0" max="5.0" step="0.1" value={settings.steeringSensitivity} onChange={e => updateSettings({steeringSensitivity: parseFloat(e.target.value)})} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-yellow-500" />
                      </div>
                  </div>
                  <div className="mt-10 flex flex-col gap-3">
                      <button onClick={() => { resetLevel(); setShowSettings(false); }} className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white py-3 rounded-lg font-bold uppercase tracking-wider shadow-lg flex items-center justify-center gap-2">
                          <RotateCcw size={16} /> {t.reset}
                      </button>
                      <button onClick={() => setShowSettings(false)} className="w-full bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-black py-3 rounded-lg font-bold uppercase tracking-wider shadow-lg transform transition hover:scale-[1.02]">
                          {t.resume}
                      </button>
                      <button onClick={exitGame} className="w-full bg-transparent hover:bg-red-900/30 text-red-400 py-3 rounded-lg font-bold border border-red-900/50 transition-colors">
                          {t.exit}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* MAP SELECTION MODAL */}
      {showMapSelect && levelData && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[60] pointer-events-auto">
              <div className="relative bg-gray-900 border-2 border-cyan-500/30 rounded-3xl p-6 shadow-2xl w-[90%] max-w-4xl h-[80%] flex flex-col">
                  <div className="flex justify-between items-center mb-4">
                      <div className="flex items-center gap-3">
                          <MapPin className="text-cyan-400" size={24} />
                          <h2 className="text-2xl font-black text-white tracking-wider">SELECT PARKING SPOT</h2>
                      </div>
                      <button onClick={() => setShowMapSelect(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X className="text-gray-400" /></button>
                  </div>
                  
                  <div className="flex-1 bg-[#1a1a1a] relative overflow-hidden rounded-xl border border-gray-700 select-none touch-none cursor-move flex items-center justify-center">
                      <div className="relative" style={{ width: 600, height: 600, transform: 'scale(0.8)' }}>
                          <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
                          <div className="absolute inset-0">
                              {(() => {
                                  const scale = 600 / levelData.mapWidth; 
                                  return (
                                      <>
                                          {levelData.obstacles.filter(o => o.type === 'wall').map(obs => (
                                              <div key={obs.id} 
                                                   className="absolute bg-gray-700"
                                                   style={{ 
                                                       left: obs.x * scale - (obs.width * scale)/2, 
                                                       top: obs.y * scale - (obs.height * scale)/2, 
                                                       width: obs.width * scale, 
                                                       height: obs.height * scale 
                                                   }} 
                                              />
                                          ))}
                                          
                                          {levelData.spots.map(spot => {
                                              const isSelected = selectedSpot?.id === spot.id;
                                              return (
                                                  <button 
                                                      key={spot.id}
                                                      onClick={() => setSelectedSpot(spot)}
                                                      className={`absolute border-2 transition-all ${isSelected ? 'bg-cyan-500/40 border-cyan-400 z-20 animate-pulse' : 'bg-yellow-900/20 border-yellow-600/50 hover:bg-yellow-500/20'}`}
                                                      style={{ 
                                                          left: spot.x * scale - 10, 
                                                          top: spot.y * scale - 10, 
                                                          width: 20, 
                                                          height: 20,
                                                          transform: `rotate(${spot.rotation}rad)`
                                                      }} 
                                                  >
                                                      <span className="text-[6px] text-white font-bold block transform rotate-[-45deg]">{isSelected ? '✓' : 'P'}</span>
                                                  </button>
                                              );
                                          })}
                                          <div className="absolute w-2 h-2 bg-blue-500 rounded-full shadow-[0_0_10px_blue] z-30"
                                               style={{ left: cursorPos.x * scale - 1, top: cursorPos.y * scale - 1 }} 
                                          ></div>
                                      </>
                                  )
                              })()}
                          </div>
                      </div>
                  </div>

                  <div className="mt-6 flex justify-end gap-4">
                      <button 
                        onClick={() => setShowMapSelect(false)}
                        className="px-6 py-3 rounded-lg font-bold text-gray-400 hover:text-white hover:bg-gray-800"
                      >
                          CANCEL
                      </button>
                      <button 
                        disabled={!selectedSpot}
                        onClick={() => {
                            if (selectedSpot) {
                                onAutoPark(selectedSpot);
                                setShowMapSelect(false);
                            }
                        }}
                        className={`px-8 py-3 rounded-lg font-bold text-black flex items-center gap-2 transition-all
                            ${selectedSpot ? 'bg-cyan-400 hover:bg-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.4)]' : 'bg-gray-700 cursor-not-allowed'}
                        `}
                      >
                          <Check size={20} /> CONFIRM TARGET
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default UIOverlay;