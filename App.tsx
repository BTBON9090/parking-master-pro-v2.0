import React, { useEffect, useState, useCallback, useRef } from 'react';
import { CarType, DayTime, LevelData, UserSettings, WeatherType, InputState, Language, ParkingResultType, ParkingSpot } from './types';
import { GENERATE_LEVEL, STEERING_WHEEL_MAX_ROTATION, TRANSLATIONS, CAR_MODELS, LEVEL_LIST } from './constants';
import GameCanvas from './components/GameCanvas';
import UIOverlay from './components/UIOverlay';
import { Lock } from 'lucide-react';

// ... (Menu Component remains unchanged) ...

const Menu: React.FC<{ 
  start: () => void, 
  settings: UserSettings, 
  updateSettings: (s: Partial<UserSettings>) => void,
  currentCar: CarType,
  setCar: (c: CarType) => void,
  lang: Language,
  setLang: (l: Language) => void,
  selectedLevel: number,
  setSelectedLevel: (id: number) => void
}> = ({ start, settings, updateSettings, currentCar, setCar, lang, setLang, selectedLevel, setSelectedLevel }) => {
  const t = TRANSLATIONS[lang];

  return (
    <div className="relative h-full w-full bg-gray-900 text-white overflow-y-auto">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_#1f2937,_#000000)] z-0"></div>
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20 z-0"></div>

        <div className="relative z-10 flex flex-col items-center justify-center min-h-full p-8">
            <div className="absolute top-6 right-6 flex gap-2">
                <button onClick={() => setLang(Language.CN)} className={`px-4 py-1 rounded-full text-sm font-bold transition-all ${lang === Language.CN ? 'bg-yellow-500 text-black' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>CN</button>
                <button onClick={() => setLang(Language.EN)} className={`px-4 py-1 rounded-full text-sm font-bold transition-all ${lang === Language.EN ? 'bg-yellow-500 text-black' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>EN</button>
            </div>

            <div className="text-center mb-8">
                <h1 className="text-6xl md:text-8xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-500 drop-shadow-lg">
                    PARKING <span className="text-yellow-500">MASTER</span>
                </h1>
                <div className="w-full h-2 bg-yellow-500 mt-2 skew-x-12"></div>
                <p className="mt-4 text-gray-400 tracking-[0.5em] text-sm uppercase">Professional Simulator 2D</p>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 w-full max-w-7xl">
                
                <div className="space-y-8">
                     <div className="bg-gray-800/50 backdrop-blur p-6 rounded-2xl border border-gray-700 shadow-xl">
                        <h3 className="text-xl font-bold mb-6 text-blue-400 uppercase tracking-widest border-b border-gray-700 pb-2">{t.initialSetup}</h3>
                        <div className="space-y-4">
                            <OptionRow label={t.weather} checked={settings.weatherEnabled} onChange={e => updateSettings({weatherEnabled: e.target.checked})} />
                            <OptionRow label={t.ghostWheel} checked={settings.wheelGhost} onChange={e => updateSettings({wheelGhost: e.target.checked})} />
                            <OptionRow label={t.autoSignal} checked={settings.autoTurnSignal} onChange={e => updateSettings({autoTurnSignal: e.target.checked})} />
                        </div>
                    </div>

                    <div className="bg-gray-800/50 backdrop-blur p-6 rounded-2xl border border-gray-700 shadow-xl flex flex-col">
                        <h3 className="text-xl font-bold mb-6 text-green-400 uppercase tracking-widest border-b border-gray-700 pb-2">{t.vehicle}</h3>
                        <div className="grid grid-cols-2 gap-4 flex-1">
                            {Object.keys(CarType).map((key) => {
                                const car = CAR_MODELS[key as CarType];
                                const isSelected = currentCar === key;
                                return (
                                    <button 
                                        key={key} 
                                        onClick={() => setCar(key as CarType)}
                                        className={`relative p-4 rounded-xl border-2 transition-all duration-200 flex flex-col items-start justify-between h-28 group ${isSelected ? 'border-yellow-500 bg-yellow-500/10' : 'border-gray-700 bg-gray-800 hover:bg-gray-700'}`}
                                    >
                                        <div className="flex justify-between w-full">
                                            <span className={`font-bold text-sm ${isSelected ? 'text-yellow-400' : 'text-gray-300'}`}>{car.name}</span>
                                            {isSelected && <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>}
                                        </div>
                                        <div className="w-full h-2 bg-gray-700 rounded mt-auto overflow-hidden">
                                            <div className="h-full" style={{ width: `${(car.maxSpeed / 8) * 100}%`, backgroundColor: car.color }}></div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-2 bg-gray-800/50 backdrop-blur p-6 rounded-2xl border border-gray-700 shadow-xl flex flex-col">
                    <h3 className="text-xl font-bold mb-6 text-purple-400 uppercase tracking-widest border-b border-gray-700 pb-2">{t.selectLevel}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {LEVEL_LIST.map((level) => {
                             const isLocked = level.locked;
                             const isSelected = selectedLevel === level.id;
                             return (
                                 <button
                                    key={level.id}
                                    disabled={isLocked}
                                    onClick={() => setSelectedLevel(level.id)}
                                    className={`relative p-6 rounded-xl border-2 transition-all duration-200 flex flex-col gap-2 h-40 text-left 
                                        ${isLocked 
                                            ? 'border-gray-800 bg-gray-900/50 text-gray-600 cursor-not-allowed' 
                                            : isSelected 
                                                ? 'border-yellow-500 bg-yellow-500/20 shadow-[0_0_20px_rgba(234,179,8,0.1)]' 
                                                : 'border-gray-700 bg-gray-800 hover:border-gray-500'
                                        }
                                    `}
                                 >
                                     {isLocked && <div className="absolute top-4 right-4 opacity-50"><Lock size={20}/></div>}
                                     <div className="text-3xl font-black italic opacity-20 absolute bottom-2 right-4">0{level.id}</div>
                                     <div className={`font-bold text-lg ${isSelected ? 'text-yellow-400' : 'text-gray-200'}`}>{t.levels[level.id as keyof typeof t.levels] || level.name}</div>
                                     <div className="text-xs text-gray-400 mt-2">{level.desc}</div>
                                 </button>
                             )
                        })}
                    </div>

                    <div className="mt-auto pt-8 flex justify-end">
                        <button 
                            onClick={start} 
                            className="group relative px-12 py-6 bg-yellow-500 text-black font-black text-3xl uppercase tracking-wider rounded-xl overflow-hidden shadow-2xl shadow-yellow-500/40 hover:scale-105 transition-transform w-full md:w-auto"
                        >
                            <div className="absolute inset-0 w-full h-full bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                            <span className="relative z-10 flex items-center justify-center gap-4">
                                {t.start} 
                                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                            </span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
};

const OptionRow: React.FC<{label: string, checked: boolean, onChange: (e: React.ChangeEvent<HTMLInputElement>) => void}> = ({label, checked, onChange}) => (
    <label className="flex items-center justify-between cursor-pointer group p-2 rounded hover:bg-white/5 transition-colors">
        <span className="text-gray-300 font-medium group-hover:text-white">{label}</span>
        <input type="checkbox" checked={checked} onChange={onChange} className="w-5 h-5 accent-yellow-500 bg-gray-700 border-gray-600 rounded focus:ring-yellow-500 focus:ring-offset-gray-800" />
    </label>
);


function App() {
  const [isInGame, setIsInGame] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [lang, setLang] = useState<Language>(Language.CN);
  
  const [level, setLevel] = useState(1);
  const [money, setMoney] = useState(100);
  const [levelData, setLevelData] = useState<LevelData | null>(null);
  const [rewardAnimation, setRewardAnimation] = useState<{show: boolean, amount: number, type: ParkingResultType}>({show: false, amount: 0, type: 'good'});
  
  // Auto Parking State
  const [autoParkTarget, setAutoParkTarget] = useState<ParkingSpot | null>(null);

  // Default Weather and Lights OFF
  const [weather, setWeather] = useState(WeatherType.SUNNY);
  const [dayTime, setDayTime] = useState(DayTime.DAY);
  const [currentCar, setCurrentCar] = useState<CarType>(CarType.SEDAN);
  
  const [settings, setSettings] = useState<UserSettings>({
    soundEnabled: true,
    volume: 0.2, 
    wheelGhost: false,
    autoTurnSignal: true, 
    weatherEnabled: false, 
    steeringSensitivity: 2.5, 
    pedalSensitivity: 1.0,
    turnAssist: false,
    orientation: 'landscape'
  });

  const [inputState, setInputState] = useState<InputState>({
    throttle: 0,
    gasPressed: false,
    shiftPressed: false,
    brake: 0,
    steeringWheelAngle: 0,
    gear: 0, 
    handbrake: true,
    lights: false, 
    engineStarted: false 
  });
  
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const inputRef = useRef<InputState>(inputState);
  
  // Centralized Input Update
  const updateInput = useCallback((updater: (prev: InputState) => InputState) => {
      if (isPaused) return; 
      setInputState(prev => {
          const next = updater(prev);
          inputRef.current = next;
          return next;
      });
  }, [isPaused]);

  useEffect(() => {
      inputRef.current = inputState;
  }, [inputState]);

  const lastInteractionRef = useRef(0);
  const carSpeedRef = useRef(0);

  // Helper to safely stop auto park and reset controls
  const stopAutoPark = useCallback(() => {
      if (autoParkTarget) {
          setAutoParkTarget(null);
          // RESET CONTROLS so manual driving works immediately
          updateInput(prev => ({
              ...prev,
              throttle: 0,
              gasPressed: false,
              brake: 0,
              steeringWheelAngle: 0,
              // Keep engine/gear state or reset gear to N? Better keep Gear if moving, but clear throttle
              // Let's reset to safe state
          }));
      }
  }, [autoParkTarget, updateInput]);

  useEffect(() => {
    const checkMobile = () => setIsMobile('ontouchstart' in window || navigator.maxTouchPoints > 0);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
      if (isPaused) return;
      const interval = setInterval(() => {
          const now = Date.now();
          const isInteracting = isDragging || (now - lastInteractionRef.current < 200);

          if (!isInteracting && !autoParkTarget) {
             if (inputRef.current.steeringWheelAngle !== 0) {
                 updateInput(prev => {
                     if (prev.steeringWheelAngle !== 0) {
                         const decay = 0.975; 
                         let newAngle = prev.steeringWheelAngle * decay;
                         if (Math.abs(newAngle) < 0.5) newAngle = 0;
                         return { ...prev, steeringWheelAngle: newAngle };
                     }
                     return prev;
                 });
             }
          }
      }, 16); 

      return () => clearInterval(interval);
  }, [updateInput, isDragging, isPaused, autoParkTarget]);

  const startLevel = (lvl: number) => {
    const data = GENERATE_LEVEL(lvl);
    
    let initWeather = WeatherType.SUNNY;
    let initDayTime = DayTime.DAY;
    
    if (settings.weatherEnabled) {
        const weathers = [WeatherType.SUNNY, WeatherType.RAINY, WeatherType.SUNNY, WeatherType.FOGGY];
        initWeather = weathers[Math.floor(Math.random() * weathers.length)];
        initDayTime = Math.random() > 0.7 ? DayTime.NIGHT : DayTime.DAY;
    }

    setLevelData(data);
    setWeather(initWeather);
    setDayTime(initDayTime);
    
    const initialInput = { 
        throttle: 0,
        gasPressed: false,
        shiftPressed: false,
        brake: 0, 
        steeringWheelAngle: 0, 
        gear: 0, 
        handbrake: true, 
        lights: false, 
        engineStarted: false 
    };
    setInputState(initialInput);
    inputRef.current = initialInput;
    setAutoParkTarget(null);
    
    lastInteractionRef.current = Date.now();
    carSpeedRef.current = 0;
    setRewardAnimation({show: false, amount: 0, type: 'good'});
    setIsPaused(false);
  };

  const resetCurrentLevel = () => {
      startLevel(level);
  };

  const startGame = () => {
      setIsInGame(true);
      startLevel(level);
  };

  // INPUT HANDLERS WITH INTERVENTION CHECK
  const handleManualIntervention = useCallback(() => {
      if (autoParkTarget) {
          stopAutoPark();
      }
      lastInteractionRef.current = Date.now();
  }, [autoParkTarget, stopAutoPark]);

  useEffect(() => {
    if (isMobile || !isInGame || isPaused) return;

    const applySteeringDelta = (delta: number) => {
        handleManualIntervention(); // Stop Auto Pilot on steer
        
        const currentSpeed = Math.abs(carSpeedRef.current);
        const damping = Math.max(0.2, 1 - (currentSpeed / 8)); 
        
        updateInput(prev => {
            const sensitivity = 0.2 * settings.steeringSensitivity * damping;
            let newAngle = prev.steeringWheelAngle + (delta * sensitivity);
            
            if (newAngle > STEERING_WHEEL_MAX_ROTATION) newAngle = STEERING_WHEEL_MAX_ROTATION;
            if (newAngle < -STEERING_WHEEL_MAX_ROTATION) newAngle = -STEERING_WHEEL_MAX_ROTATION;
            return { ...prev, steeringWheelAngle: newAngle };
        });
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault(); 
      applySteeringDelta(e.deltaY);
    };

    const handleMouseDown = (e: MouseEvent) => {
        if (e.button === 0) { 
            setIsDragging(true);
            setDragStartPos({ x: e.clientX, y: e.clientY });
            handleManualIntervention();
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleMouseMove = (e: MouseEvent) => {
        setMousePos({ x: e.clientX, y: e.clientY });
        
        if (isDragging) {
            applySteeringDelta(e.movementX * 2.5);
        }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.repeat) return;
        const k = e.key.toLowerCase();

        if (k === 'm') {
            window.dispatchEvent(new CustomEvent('toggle-settings'));
        }

        // Detect Driving Keys for intervention
        if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'q', 'e', ' '].includes(k)) {
            handleManualIntervention();
        }

        if (k === 'w' || k === 'arrowup') {
             updateInput(prev => ({ 
                 ...prev, 
                 gasPressed: true,
                 handbrake: (prev.gear !== 0 && prev.engineStarted) ? false : prev.handbrake 
             }));
        }
        if (k === 'shift') updateInput(prev => ({ ...prev, shiftPressed: true }));
        if (k === 'd' || k === 'arrowright') {
            updateInput(prev => {
                if (prev.gear === -1) return { ...prev, gear: 0 };
                if (prev.gear < 5) return { ...prev, gear: prev.gear + 1 };
                return prev;
            });
        }
        if (k === 'a' || k === 'arrowleft') {
            updateInput(prev => {
                if (prev.gear > 0) return { ...prev, gear: prev.gear - 1 };
                return prev;
            });
        }
        if (k === 'q') updateInput(prev => ({ ...prev, gear: -1 }));
        if (k === 'p') updateInput(prev => ({ ...prev, gear: 0, handbrake: true, throttle: 0, gasPressed: false }));
        if (k === 'e') updateInput(prev => ({ ...prev, brake: 1.0 }));
        if (k === ' ') updateInput(prev => ({ ...prev, handbrake: true }));
        if (k === 'l') updateInput(prev => ({ ...prev, lights: !prev.lights }));
        if (k === 'o') updateInput(prev => ({ ...prev, engineStarted: !prev.engineStarted }));
    };

    const handleKeyUp = (e: KeyboardEvent) => {
         const k = e.key.toLowerCase();
         if (k === 'w' || k === 'arrowup') updateInput(prev => ({ ...prev, gasPressed: false }));
         if (k === 'shift') updateInput(prev => ({ ...prev, shiftPressed: false }));
         if (k === 'e') updateInput(prev => ({ ...prev, brake: 0 }));
         if (k === ' ') updateInput(prev => ({ ...prev, handbrake: false }));
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
        window.removeEventListener('wheel', handleWheel);
        window.removeEventListener('mousedown', handleMouseDown);
        window.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isMobile, isInGame, settings.steeringSensitivity, updateInput, isDragging, isPaused, handleManualIntervention]);

  const handleCrash = useCallback((cost: number) => {
      setMoney(m => Math.max(0, m - cost)); 
      if (autoParkTarget) {
          stopAutoPark();
      }
  }, [autoParkTarget, stopAutoPark]);

  const handleParkingSuccess = useCallback((spotId: string, reward: number, type: ParkingResultType) => {
      setMoney(m => m + reward);
      setRewardAnimation({show: true, amount: reward, type});
      stopAutoPark(); // Success -> Stop
      setTimeout(() => setRewardAnimation({show: false, amount: 0, type: 'good'}), 2500);
  }, [stopAutoPark]);

  return (
    <div className="w-full h-full bg-black overflow-hidden relative select-none cursor-crosshair">
      {!isInGame ? (
        <Menu 
            start={startGame} 
            settings={settings} 
            updateSettings={(s) => setSettings(prev => ({...prev, ...s}))} 
            currentCar={currentCar}
            setCar={setCurrentCar}
            lang={lang}
            setLang={setLang}
            selectedLevel={level}
            setSelectedLevel={setLevel}
        />
      ) : (
        <>
          {levelData && (
              <GameCanvas 
                levelData={levelData}
                settings={settings}
                currentCarId={currentCar}
                weather={weather}
                dayTime={dayTime}
                isMobile={isMobile}
                inputRef={inputRef} // Pass the Ref instead of value
                onCrash={handleCrash}
                onParkingSuccess={handleParkingSuccess}
                carSpeedRef={carSpeedRef}
                isPaused={isPaused}
                autoParkingTarget={autoParkTarget}
                setAutoParkingTarget={setAutoParkTarget}
                updateInput={updateInput}
              />
          )}
          <UIOverlay 
            isMobile={isMobile}
            money={money}
            level={level}
            settings={settings}
            updateSettings={(s) => setSettings(prev => ({...prev, ...s}))}
            inputState={inputState}
            setInputState={setInputState}
            exitGame={() => setIsInGame(false)}
            resetLevel={resetCurrentLevel}
            lang={lang}
            setLang={setLang}
            showReward={rewardAnimation}
            carSpeed={carSpeedRef.current}
            cursorPos={isDragging ? dragStartPos : mousePos}
            isDragging={isDragging}
            onSettingsToggle={setIsPaused}
            currentCarId={currentCar}
            levelData={levelData}
            onAutoPark={(spot) => {
                if (spot === null) stopAutoPark();
                else setAutoParkTarget(spot);
            }}
            isAutoParking={!!autoParkTarget}
          />
        </>
      )}
    </div>
  );
}

export default App;