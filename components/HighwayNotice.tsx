import React,{useEffect,useState} from 'react';
export function HighwayNotice(){
 const [message,setMessage]=useState('');
 useEffect(()=>{const update=(e:Event)=>{const p=(e as CustomEvent).detail;
  if(p.level!==13||Math.abs(p.y-1800)>250||Math.cos(p.rotation)<.5){setMessage('');return;}
  const exit=[{x:6000,name:'服务区'},{x:15800,name:'互通'}].find(v=>v.x>p.x&&v.x-p.x<5000);
  setMessage(exit?`前方 ${Math.ceil((exit.x-p.x)/100)*10} m ${exit.name}出口 · 提前减速，右侧驶入减速车道。`:'');
 };window.addEventListener('car-map-position',update);return()=>window.removeEventListener('car-map-position',update);},[]);
 return message?<p role="status">{message}</p>:null;
}
