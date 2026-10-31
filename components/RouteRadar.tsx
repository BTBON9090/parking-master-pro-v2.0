import React,{useEffect,useMemo,useRef} from 'react';
import type {LevelData} from '../types';
import {WORLD_ROUTES,mapCurveSamples} from '../utils/openWorld';
import {GARAGE_SPIRAL,GARAGE_NARROW_SPIRAL,garageSpiralPoint} from '../utils/garage';
import {MOUNTAIN_TUNNEL} from '../utils/mountainAdventure';
/** Game coordinates are 10 units/metre. Radius is exactly one kilometre. */
export function RouteRadar({level}:{level:LevelData}){
 const ref=useRef<HTMLCanvasElement>(null);
 const paths=useMemo(()=>[
 ...(level.curvedRoads??[]).map(mapCurveSamples),
 ...(level.openWorld?[...WORLD_ROUTES.map(r=>r.samples),MOUNTAIN_TUNNEL]:[]),
 ...(level.garage?[GARAGE_SPIRAL,GARAGE_NARROW_SPIRAL].map(s=>Array.from({length:181},(_,i)=>garageSpiralPoint(i/180,0,s))):[]),
 ...(level.roadSurfaces??[]).map(source=>{const r=source.width>=source.height?source:{...source,width:source.height,rotation:source.rotation+Math.PI/2};const d=r.width/2;return [{x:r.x-Math.cos(r.rotation)*d,y:r.y-Math.sin(r.rotation)*d},{x:r.x+Math.cos(r.rotation)*d,y:r.y+Math.sin(r.rotation)*d}];})
 ],[level]);
 useEffect(()=>{const draw=(e:Event)=>{const p=(e as CustomEvent).detail,c=ref.current;if(!c)return;const ctx=c.getContext('2d')!;
 const mirrors=[...document.querySelectorAll<HTMLElement>('.side-mirror-frame')].map(n=>n.getBoundingClientRect()).sort((a,b)=>a.left-b.left);const r=mirrors.at(-1);if(r){const shift=document.querySelector('.mobile-sideaux')?44:0;c.style.left=Math.max(0,r.left-shift)+'px';c.style.top=(r.bottom+8)+'px';c.style.width=r.width+'px';c.style.height=Math.min(r.width,180)+'px';}
 const W=400,H=320,S=H/2/10000;c.width=W;c.height=H;ctx.clearRect(0,0,W,H);ctx.save();ctx.translate(W/2,H/2);ctx.beginPath();ctx.arc(0,0,H/2-4,0,Math.PI*2);ctx.clip();ctx.rotate(-p.rotation-Math.PI/2);ctx.scale(S,S);ctx.translate(-p.x,-p.y);ctx.strokeStyle='#c8eee4';ctx.lineWidth=2/S;ctx.shadowColor='#0b1b21';ctx.shadowBlur=4;
 for(const path of paths){ctx.beginPath();path.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));ctx.stroke();}ctx.restore();ctx.fillStyle='#ffd17d';ctx.strokeStyle='#17262e';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(W/2,H/2-10);ctx.lineTo(W/2-7,H/2+8);ctx.lineTo(W/2,H/2+4);ctx.lineTo(W/2+7,H/2+8);ctx.closePath();ctx.fill();ctx.stroke();ctx.font='18px sans-serif';ctx.fillStyle='#fff';ctx.fillText('1 km',W-60,H-10);
 };window.addEventListener('car-map-position',draw);return()=>window.removeEventListener('car-map-position',draw);},[paths]);
 return <canvas className="route-radar" ref={ref} aria-label="周围一公里路线，车头始终朝上"/>;
}
