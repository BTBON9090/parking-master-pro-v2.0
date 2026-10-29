import React,{useEffect,useRef,useState} from 'react';
import type {InputState,LevelData} from '../types';
import {newExam,stepExam,penaliseExam,advanceExam,type ExamTelemetry} from '../utils/drivingExam';
export function ExamPanel({level,input,update}:{level:LevelData;input:InputState;update:React.Dispatch<React.SetStateAction<InputState>>}){
 const session=useRef(newExam()),latest=useRef(input);latest.current=input;
 const [,redraw]=useState(0),[distance,setDistance]=useState(0),[green,setGreen]=useState(false);
 useEffect(()=>{session.current=newExam();const position=(e:Event)=>{const t=(e as CustomEvent<ExamTelemetry>).detail,s=session.current;const r=stepExam(s,level.exam!,t,latest.current);setGreen(!!r?.green);const c=level.exam![s.index];setDistance(c?Math.hypot(c.x-t.x,c.y-t.y)/10:0);redraw(v=>v+1);};
 const hit=()=>{const s=session.current;penaliseExam(s,'collision-'+s.index,'碰撞障碍物',10);};
 window.addEventListener('exam-telemetry',position);window.addEventListener('exam-collision',hit);
 return()=>{window.removeEventListener('exam-telemetry',position);window.removeEventListener('exam-collision',hit);};},[level]);
 const s=session.current,c=level.exam?.[s.index];
 return <aside className="exam-panel" data-ui-control>
  <div><strong>{s.score} 分</strong><span>{c?`${s.index+1}/${level.exam!.length} · ${c.name}`:'考试完成'}</span><small>{Math.round(distance)} m</small></div>
  <p>{c?(s.active?s.message:`前往考点 · ${c.hint}`):`${s.passed.length} 项完成，${s.penalties.length} 项扣分记录`}</p>
  {c?.kind==='signal'&&<b className={green?'exam-green':'exam-red'}>{green?'绿灯 · 通行':'红灯 · 停车'}</b>}
  <nav><button aria-pressed={input.indicator===-1} onPointerDown={e=>{e.stopPropagation();update(v=>({...v,indicator:v.indicator===-1?0:-1}));}}>← 左灯</button>
   <button aria-pressed={input.indicator===1} onPointerDown={e=>{e.stopPropagation();update(v=>({...v,indicator:v.indicator===1?0:1}));}}>右灯 →</button>
   <button aria-pressed={input.wipers} onPointerDown={e=>{e.stopPropagation();update(v=>({...v,wipers:!v.wipers}));}}>雨刮 K</button>
   <button onClick={()=>{if(c){penaliseExam(s,c.id+'skip','跳过考点',10);advanceExam(s,level.exam!);}else session.current=newExam();redraw(v=>v+1);}}>{c?'跳过 −10':'重考'}</button></nav>
 </aside>;
}
