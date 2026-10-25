import React,{useRef,useEffect} from 'react';
import type {InputState,CarType} from '../types';
import {CAR_MODELS} from '../constants';
import {steeringWheelMaxDeg} from '../utils/powertrain';
export function MobileControls(p:{input:InputState;update:React.Dispatch<React.SetStateAction<InputState>>;car:CarType;settings:()=>void;camera:()=>void;map:()=>void;reset:()=>void;disabled:boolean}){
 const held=useRef(new Map<string,{id:number;y:number}>());const update=useRef(p.update);update.current=p.update;
 const steer=(active:boolean)=>window.dispatchEvent(new CustomEvent('mobile-steering-active',{detail:active}));
 const release=(control:string)=>{held.current.delete(control);if(control==='steer')steer(false);else update.current(v=>control==='gas'?{...v,throttle:0,gasPressed:false}:control==='brake'?{...v,brake:0}:{...v,handbrake:!!v.parkingBrake});};
 useEffect(()=>{const clear=()=>{for(const k of [...held.current.keys()])release(k);};window.addEventListener('blur',clear);document.addEventListener('visibilitychange',clear);return()=>{clear();window.removeEventListener('blur',clear);document.removeEventListener('visibilitychange',clear);};},[]);
 useEffect(()=>{if(p.disabled)for(const k of [...held.current.keys()])release(k);},[p.disabled]);
 const pedal=(key:'gas'|'brake'|'handbrake')=>({
 onPointerDown:(e:React.PointerEvent<HTMLButtonElement>)=>{e.preventDefault();if(p.disabled||held.current.has(key))return;e.currentTarget.setPointerCapture(e.pointerId);held.current.set(key,{id:e.pointerId,y:e.clientY});p.update(v=>key==='gas'?{...v,throttle:.25,gasPressed:true}:key==='brake'?{...v,brake:.22}:{...v,handbrake:true});},
 onPointerMove:(e:React.PointerEvent<HTMLButtonElement>)=>{const h=held.current.get(key);if(!h||h.id!==e.pointerId)return;const force=Math.min(1,Math.max(0,(h.y-e.clientY)/65));if(key!=='handbrake')p.update(v=>key==='gas'?{...v,throttle:.25+force*.35,gasPressed:true}:{...v,brake:.22+force*.78});},
 onPointerUp:(e:React.PointerEvent<HTMLButtonElement>)=>{if(held.current.get(key)?.id===e.pointerId)release(key);},
 onPointerCancel:()=>release(key),onLostPointerCapture:()=>{if(held.current.has(key))release(key);},
 });
 const lock=steeringWheelMaxDeg(CAR_MODELS[p.car]);
 return <div className="mobile-controls" data-ui-control>
 <div className="mobile-topbar"><button onClick={p.settings}>设置</button><button onClick={p.camera}>视角</button><button onClick={p.map}>地图</button><button onClick={p.reset}>重置 R</button></div>
 {!p.disabled&&<><div className="mobile-steer"><div className="mobile-wheel" style={{transform:`rotate(${p.input.steeringWheelAngle}deg)`}}><i/><b/></div><label>转向<input aria-label="触屏方向盘" type="range" min="-1" max="1" step=".005" value={Math.sign(p.input.steeringWheelAngle)*Math.pow(Math.abs(p.input.steeringWheelAngle)/lock,1/1.7)} onPointerDown={e=>{held.current.set('steer',{id:e.pointerId,y:0});steer(true);}} onPointerUp={()=>release('steer')} onPointerCancel={()=>release('steer')} onLostPointerCapture={()=>release('steer')} onChange={e=>{const v=Number(e.target.value);p.update(s=>({...s,steeringWheelAngle:Math.sign(v)*Math.pow(Math.abs(v),1.7)*lock}));}}/></label><small>中间轻调 · 两端大转向</small></div>
 <div className="mobile-drive"><div className="mobile-gears">{[-1,0,1].map(g=><button key={g} aria-pressed={p.input.gear===g||(g===1&&p.input.gear>0)} onClick={()=>p.update(v=>({...v,gear:g}))}>{g===-1?'R':g===0?'N':'D'}</button>)}<button aria-label="降挡" onClick={()=>p.update(v=>({...v,gear:Math.max(-1,v.gear-1)}))}>−</button><button aria-label="升挡" onClick={()=>p.update(v=>({...v,gear:Math.min(5,v.gear+1)}))}>＋</button></div><div className="mobile-pedals"><button className="mobile-brake" aria-label="触屏刹车" {...pedal('brake')}>刹车<small>上滑重刹</small></button><button className="mobile-gas" aria-label="触屏油门" {...pedal('gas')}>油门<small>上滑加力</small></button></div></div>
 <div className="mobile-aux"><button aria-pressed={p.input.engineStarted} onClick={()=>p.update(v=>({...v,engineStarted:!v.engineStarted}))}>启停</button><button onClick={()=>p.update(v=>{const mode=((v.headlightMode??0)+1)%3 as 0|1|2;return {...v,headlightMode:mode,lights:mode!==0};})}>{p.input.headlightMode===2?'远光':p.input.lights?'近光':'灯光'}</button><button aria-pressed={!!p.input.parkingBrake} onClick={()=>p.update(v=>({...v,parkingBrake:!v.parkingBrake,handbrake:!v.parkingBrake||held.current.has('handbrake')}))}>驻车 P</button><button aria-label="临时手刹" {...pedal('handbrake')}>手刹</button></div></>}
 </div>;
}
