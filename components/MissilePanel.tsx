import React,{useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import type {LevelData} from '../types';
const send=(detail:object)=>window.dispatchEvent(new CustomEvent('missile-command',{detail}));
export function MissilePanel({level}:{level:LevelData}){
 const [s,setS]=useState({phase:'stowed',countdown:0,stopped:true,target:false,vehicleView:false,retracting:false,launcherStored:true});
 const [target,setTarget]=useState<{x:number;y:number}|null>(null);
 useEffect(()=>{
  const update=(e:Event)=>{const state=(e as CustomEvent).detail;setS(state);if(!state.target&&['stowed','retracting'].includes(state.phase))setTarget(null);};
  const confirm=(e:Event)=>{const point=(e as CustomEvent<{x:number;y:number}>).detail;setTarget(point);};
  window.addEventListener('missile-status',update);window.addEventListener('missile-map-confirm',confirm);
  return()=>{window.removeEventListener('missile-status',update);window.removeEventListener('missile-map-confirm',confirm);};
 },[]);
 useEffect(()=>{setTarget(null);setS({phase:'stowed',countdown:0,stopped:true,target:false,vehicleView:false,retracting:false,launcherStored:true});},[level]);
 return <section className="missile-panel"><strong>运输起竖车 · 场景演出</strong><p>{s.phase==='stowed'?'停稳后展开支撑与起竖。':s.phase==='countdown'?`${s.countdown} 秒后发射`:s.phase==='ignition'?'点火 · 导弹缓慢出筒':s.phase==='flight'?'飞行跟随镜头':s.phase==='impact'?'目标点演出':s.phase==='deploying'?'警戒 · 支撑展开与缓慢起竖':s.phase==='retracting'?'警戒 · 降下发射筒并收回支撑':s.phase==='spent'?'演出结束，可收起支撑继续驾驶。':'准备就绪，在当前地图点选目标。'}</p>
 {s.phase==='stowed'&&<button disabled={!s.stopped} onClick={()=>send({action:'deploy'})}>支撑起竖</button>}
 {s.phase==='ready'&&<><button onClick={()=>window.dispatchEvent(new CustomEvent('missile-map-open'))}>打开全局地图选择目标</button>{target&&s.target&&<p>已确认目标：X {Math.round(target.x)} · Y {Math.round(target.y)}</p>}<button disabled={!s.target||!target} onClick={()=>send({action:'launch'})}>发射 · 5 秒倒数</button></>}
 {s.phase==='countdown'&&<button onClick={()=>send({action:'cancel'})}>取消发射</button>}
 {['ignition','flight','impact'].includes(s.phase)&&typeof document!=='undefined'&&createPortal(<div className="missile-quick-controls" data-ui-control><button onClick={()=>send({action:'view',vehicle:!s.vehicleView})}>{s.vehicleView?'返回演出镜头':'返回车身视角'}</button>{!s.launcherStored&&(s.retracting?<span>正在收回支撑</span>:s.phase!=='ignition'&&<button onClick={()=>send({action:'retract'})}>收起发射筒和支撑</button>)}</div>,document.body)}
 {s.retracting?<p>正在放下发射筒并收回支撑，完成后可驾驶。</p>:!s.launcherStored&&['ready','spent'].includes(s.phase)&&<button onClick={()=>send({action:'retract'})}>收起发射筒和支撑</button>}</section>;
}
