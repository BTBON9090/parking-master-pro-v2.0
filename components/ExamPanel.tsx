import {restoreExam,savedExam,type SavedExam} from '../utils/progressStorage';
import React,{useEffect,useRef,useState} from 'react';
import type {InputState,LevelData} from '../types';
import {newExam,stepExam,penaliseExam,advanceExam,examStationDistance,type ExamTelemetry} from '../utils/drivingExam';
export function ExamPanel({level,input,update,saved}:{saved?:SavedExam;level:LevelData;input:InputState;update:React.Dispatch<React.SetStateAction<InputState>>}){
 const session=useRef(restoreExam(saved,level)),latest=useRef(input);latest.current=input;
 const [,redraw]=useState(0),[distance,setDistance]=useState(0),[green,setGreen]=useState(false);
 useEffect(()=>{session.current=restoreExam(saved,level);let lastDraw=-Infinity,lastStatus='';const position=(e:Event)=>{const t=(e as CustomEvent<ExamTelemetry>).detail,s=session.current;const r=stepExam(s,level.exam!,t,latest.current);window.dispatchEvent(new CustomEvent('exam-progress',{detail:{levelId:level.levelId,exam:savedExam(s)}}));const status=s.index+':'+s.active+':'+s.score;if(t.time-lastDraw>=200||status!==lastStatus){lastDraw=t.time;lastStatus=status;setGreen(!!r?.green);const c=level.exam![s.index];setDistance(c?examStationDistance(c,t.x,t.y)/10:0);redraw(v=>v+1);}};
 const hit=()=>{const s=session.current;if(s.active)penaliseExam(s,'collision-'+s.index,'碰撞障碍物',10);};
 window.addEventListener('exam-telemetry',position);window.addEventListener('exam-collision',hit);
 return()=>{window.removeEventListener('exam-telemetry',position);window.removeEventListener('exam-collision',hit);};},[level]);
 const s=session.current,c=level.exam?.[s.index];
 return <aside className="exam-panel" data-ui-control>
  <div><strong>{s.score} 分</strong><span>{c?`${c.name} · 已完成 ${s.passed.length}/${level.exam!.length}`:'练习结束'}</span><small>{Math.round(distance)} m</small></div>
  <p>{c?(s.active?s.message:`附近考点 · ${c.hint}`):`${s.passed.length} 项完成，${s.penalties.length} 项扣分记录`}</p>
  {s.active&&c?.kind==='signal'&&<b className={green?'exam-green':'exam-red'}>{green?'绿灯 · 通行':'红灯 · 停车'}</b>}
  <nav><button aria-pressed={input.indicator===-1} onPointerDown={e=>{e.stopPropagation();update(v=>({...v,indicator:v.indicator===-1?0:-1}));}}>← 左灯</button>
   <button aria-pressed={input.indicator===1} onPointerDown={e=>{e.stopPropagation();update(v=>({...v,indicator:v.indicator===1?0:1}));}}>右灯 →</button>
   <button aria-pressed={input.wipers} onPointerDown={e=>{e.stopPropagation();update(v=>({...v,wipers:!v.wipers}));}}>雨刮 K</button>
   <button onClick={()=>{if(c){penaliseExam(s,c.id+'skip','跳过考点',10);advanceExam(s,level.exam!);}else session.current=newExam();redraw(v=>v+1);}}>{c?'跳过此项 −10':'重新练习'}</button></nav>
 </aside>;
}
