import type {GameProgress} from '../utils/progressStorage';
import React,{useState,useEffect} from 'react';
import {CarType,Language,UserSettings,DayTime} from '../types';
import {CAR_MODELS,LEVEL_LIST} from '../constants';
import {VehicleBrowser,MapBrowser} from './SelectionBrowser';
import {DriverSeatControls} from './DriverSeatControls';
import CarPreview3D from './CarPreview3D';
import {configureMenuAudio,playUiClick} from '../utils/menuAudio';
interface MainMenuProps {
  start: () => void;
  openSettings:()=>void;
  savedGame?:GameProgress|null;
  onContinue?:()=>void;
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

export default function MainMenu(p:MainMenuProps){
 const [step,setStep]=useState(p.initialStep??0);
 useEffect(()=>configureMenuAudio({enabled:p.settings.soundEnabled,volume:p.settings.volume}),[p.settings.soundEnabled,p.settings.volume]);
 const go=(value:0|1|2)=>{playUiClick();setStep(value);};
 const toggle=(key:keyof UserSettings,label:string)=><label key={key}><span>{label}</span><input type="checkbox" checked={!!p.settings[key]} onChange={e=>p.updateSettings({[key]:e.target.checked})}/></label>;
 const training=<><h3>训练设置</h3><p>按自己的节奏探索；途中可随时换车。</p>
  <label><span>驾驶时段</span><select aria-label="驾驶时段" value={p.settings.dayTime??DayTime.DAY} onChange={e=>p.updateSettings({dayTime:e.target.value as DayTime})}><option value={DayTime.DAY}>白天</option><option value={DayTime.NIGHT}>夜晚</option></select></label>
  {toggle('turnAssist','转弯辅助线')}{toggle('rearviewMirrors','显示后视镜')}{toggle('steeringReleaseAssist','松手自动回正')}
  {toggle('absEnabled','ABS 防抱死')}{toggle('autoTurnSignal','自动转向灯')}{toggle('weatherEnabled','天气效果')}
  {p.settings.weatherEnabled&&<>{toggle('weatherRain','降雨')}{toggle('weatherSnow','降雪')}{toggle('weatherFog','大雾')}</>}
  {toggle('shadowsEnabled','实时阴影')}{toggle('soundEnabled','音效')}{toggle('wheelGhost','车轮透视')}{toggle('logitechKnobMode','旋钮方向盘')}
  <DriverSeatControls car={p.currentCar} settings={p.settings} update={p.updateSettings} compact/>
  <label><span>音量</span><input aria-label="训练音量" type="range" min="0" max="1" step=".05" value={p.settings.volume} onChange={e=>p.updateSettings({volume:+e.target.value})}/></label>
  {(()=>{let saves:Record<string,any>={};try{saves=JSON.parse(localStorage.getItem('map-editor-saves-v2')??'{}');}catch{}return Object.keys(saves).length>0&&<div className="custom-saves"><h3>自定义地图</h3>{Object.entries(saves).map(([name,record])=><button key={name} onClick={()=>p.onPlayCustom?.(record)}>{name} ↗</button>)}</div>;})()}
 </>;
 return <div className="drive-menu" data-ui-control>
  <header><button className="menu-brand" onClick={()=>go(0)}>老司机是怎样炼成的 <span>自由驾驶 · 从容上路</span></button><nav aria-label="开始驾驶步骤"><button aria-current={step===1?'step':undefined} onClick={()=>go(1)}>01 选择座驾</button><button aria-current={step===2?'step':undefined} onClick={()=>go(2)}>02 选择出发地</button></nav><div className="menu-header-actions"><button aria-label="设置" onClick={p.openSettings}>设置</button><button onClick={()=>p.setLang(p.lang===Language.CN?Language.EN:Language.CN)}>{p.lang===Language.CN?'中文':'EN'}</button></div></header>
  {step===0?<main className="menu-welcome"><CarPreview3D carType={p.currentCar}/><div><span>自由驾驶 / 驾驶训练</span><h1>每一次转向，<br/>都是新的旅程。</h1><p>穿过城市、山路与地下车库。<br/>从一场精准的停车开始。</p><button className="menu-primary" onClick={()=>go(1)}>进入车库 →</button>{p.savedGame&&<button className="menu-continue" onClick={p.onContinue}>继续上次驾驶<small>{CAR_MODELS[p.savedGame.car].name} · {LEVEL_LIST.find(l=>l.id===p.savedGame?.levelId)?.name??"自定义地图"}</small></button>}</div></main>:step===1?<VehicleBrowser car={p.currentCar} select={p.setCar} audioEnabled={p.settings.soundEnabled&&p.settings.engineSoundEnabled} volume={p.settings.volume}/>:<MapBrowser level={p.selectedLevel} select={p.setSelectedLevel} training={training}/>}
  <footer><div><strong>{CAR_MODELS[p.currentCar].name}</strong><span>{LEVEL_LIST.find(l=>l.id===p.selectedLevel)?.name}</span></div><div>{step>0&&<button onClick={()=>go(step===2?1:0)}>返回</button>}{step===2&&p.onOpenEditor&&<button onClick={()=>p.onOpenEditor?.(step)}>地图编辑器</button>}{step===1?<button className="menu-primary" onClick={()=>go(2)}>选择出发地 →</button>:step===2?<button className="menu-primary" onClick={()=>{playUiClick('confirm');p.start();}}>启动引擎 →</button>:<small>横屏体验 · 键鼠 / 触屏</small>}</div></footer>
 </div>;
}
