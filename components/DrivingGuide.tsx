import React,{useEffect,useState,useRef} from 'react';
import {DEFAULT_KEY_BINDINGS} from '../constants';
import type {UserSettings} from '../types';
export const GUIDE_VERSION='car-driving-guide-v2';
export function DrivingGuide({done,settings}:{done:()=>void;settings:UserSettings}){
 const [step,setStep]=useState(0),[seen,setSeen]=useState<string[]>([]),[angle,setAngle]=useState(0),[look,setLook]=useState(0);const drag=useRef<{x:number;button:number}|null>(null);
 const keys={...DEFAULT_KEY_BINDINGS,...settings.keyBindings};
 const label=(v:string)=>v===' '?'SPACE':v.toUpperCase();
 const lessons=[
  {title:'慢慢起步，随时停下',desc:'W 是很轻的油门，Shift+W 是轻油门；S 轻刹，Shift+S 重刹。试着按下这些按键。',keys:[keys.accelerate,keys.brake]},
  {title:'挡位与手刹',desc:'D 升挡、A 降挡，Q 倒挡、V 空挡。电车只有一个前进挡。空格按住拉起手刹，松开释放。',keys:[keys.gearUp,keys.gearDown,'q','v',keys.handbrake]},
  {title:'方向盘连续转动',desc:'在下面区域按住鼠标右键左右拖动，练习转向。松开停止输入；Alt+C 可让方向盘回正。',keys:[]},
  {title:'看向路边，也能回正',desc:'按住左键拖动观察。车外可以环视，车内转头范围有限；双击左键回正。F 切换视角。',keys:[keys.camera]},
  {title:'准备出发',desc:'B 启动或关闭动力；L 在关闭、近光和远光之间切换。M 或 Esc 暂停，随时换车、调节声音与画面。',keys:[keys.engine,keys.lights,keys.settings]},
 ];const lesson=lessons[step];
 useEffect(()=>{setSeen([]);const key=(e:KeyboardEvent)=>{if(e.key==='Tab'||e.key==='Enter')return;e.preventDefault();e.stopImmediatePropagation();const k=e.key.toLowerCase();setSeen(old=>old.includes(k)?old:[...old,k]);if(e.altKey&&k==='c')setAngle(0);};window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);},[step]);
 const close=()=>{localStorage.setItem(GUIDE_VERSION,'done');done();};
 return <div className="driving-guide" role="dialog" aria-modal="true" aria-label="新手驾驶引导"><div className="guide-card"><header><span>DRIVING ACADEMY · 操作练习</span><button onClick={close}>跳过引导</button></header><div className="guide-progress">{lessons.map((_,i)=><span key={i} className={i<=step?'active':''}/>)}</div><small>0{step+1} / 05 · 练习期间车辆暂停</small><h2>{lesson.title}</h2><p>{lesson.desc}</p>
 <div className="guide-practice" onContextMenu={e=>e.preventDefault()} onDoubleClick={()=>{setLook(0);setSeen(old=>[...old,'双击回正']);}} onPointerDown={e=>{if(step!==2&&step!==3)return;drag.current={x:e.clientX,button:e.button};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{const d=drag.current;if(!d)return;const dx=e.clientX-d.x;d.x=e.clientX;if(step===2&&d.button===2){setAngle(v=>Math.max(-540,Math.min(540,v+dx*2)));setSeen(['右键转向']);}if(step===3&&d.button===0){setLook(v=>Math.max(-70,Math.min(70,v+dx*.3)));setSeen(['左键观察']);}}} onPointerUp={()=>drag.current=null} onPointerCancel={()=>drag.current=null}>
 {(step===2||step===3)?<><div className="guide-wheel" style={{transform:`rotate(${step===2?angle:look}deg)`}}><i/><b/></div><span>{step===2?Math.round(angle)+'°':Math.round(look)+'° 转头'} · {step===2?'按住右键拖动':'左键拖动 / 双击回正'}</span></>:<div className="guide-keys">{lesson.keys.map(k=><kbd key={k} className={seen.includes(k)?'pressed':''}>{label(k)}</kbd>)}</div>}
 </div><div className="guide-feedback" aria-live="polite">{seen.length?'已识别：'+seen.map(label).join(' · '):'试一试，操作反馈会显示在这里。'}</div><footer><button disabled={step===0} onClick={()=>setStep(v=>v-1)}>上一步</button><button className="settings-primary" onClick={()=>step===4?close():setStep(v=>v+1)}>{step===4?'开始驾驶':'下一步 →'}</button></footer></div></div>
}
