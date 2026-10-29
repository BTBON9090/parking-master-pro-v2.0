import type {ExamStation,InputState} from '../types';
export interface ExamTelemetry {x:number;y:number;rotation:number;speedKmh:number;time:number;gear:number;manual:boolean;width?:number;length?:number}
export const newExam=()=>({index:0,score:100,active:false,hold:0,distance:0,peak:0,entryHeading:0,entryGear:0,rollback:0,seenLeft:false,seenRight:false,seenHigh:false,seenLow:false,seenWiper:false,shifted:false,stopped:false,passed:[] as string[],skipped:[] as string[],penalties:[] as string[],last:null as ExamTelemetry|null,message:'驶入任意考点开始练习',flags:new Set<string>()});
export type ExamState=ReturnType<typeof newExam>;
const angle=(v:number)=>Math.atan2(Math.sin(v),Math.cos(v));
export function penaliseExam(s:ExamState,key:string,text:string,points:number){if(s.flags.has(key))return;s.flags.add(key);s.score=Math.max(0,s.score-points);s.penalties.push(text);s.message=`−${points} ${text}`;}
export const examSignalGreen=(timeMs:number)=>(timeMs/1000)%16>=7;
function segmentDistance(x:number,y:number,a:{x:number;y:number},b:typeof a){
 const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1)));
 return Math.hypot(x-a.x-t*dx,y-a.y-t*dy);
}
export function examStationDistance(c:ExamStation,x:number,y:number){
 if(c.kind==='park'||c.kind==='reverse')return Math.hypot(x-c.x,y-c.y);
 if(c.path?.length){let d=Infinity;for(let i=1;i<c.path.length;i++)d=Math.min(d,segmentDistance(x,y,c.path[i-1],c.path[i]));return d;}
 return segmentDistance(x,y,c,c.exit);
}
function resetAttempt(s:ExamState){
 s.rollback=0;s.active=false;s.hold=0;s.distance=0;s.peak=0;s.stopped=false;s.seenLeft=false;s.seenRight=false;s.seenHigh=false;s.seenLow=false;s.seenWiper=false;s.shifted=false;s.last=null;
}
export function nearestExamStation(s:ExamState,stations:ExamStation[],x:number,y:number){
 let best=stations.length,distance=Infinity;
 stations.forEach((c,i)=>{if(s.passed.includes(c.id)||s.skipped.includes(c.id))return;
  const d=examStationDistance(c,x,y);if(d<distance){distance=d;best=i;}});
 return best;
}
export function stepExam(s:ExamState,stations:ExamStation[],t:ExamTelemetry,input:InputState){
 const current=stations[s.index];
 const teleported=!!s.last&&Math.hypot(t.x-s.last.x,t.y-s.last.y)>180;
 if(!s.active||!current||teleported||examStationDistance(current,t.x,t.y)>current.radius){
  const index=nearestExamStation(s,stations,t.x,t.y);
  if(index!==s.index||s.active){resetAttempt(s);s.index=index;}
 }
 const c=stations[s.index];if(!c){s.message=`本次练习结束 · ${s.score} 分`;return;}
 const near=examStationDistance(c,t.x,t.y)<=c.radius;
 if(!s.active&&near){resetAttempt(s);s.active=true;s.entryHeading=t.rotation;s.entryGear=t.gear;s.message=c.hint;}
 const prev=s.last,dt=prev?Math.min(.25,Math.max(0,(t.time-prev.time)/1000)):0;s.last=t;
 if(!s.active){s.message='附近考点：'+c.hint;return {green:examSignalGreen(t.time),near:false,exit:false};}

 if(prev)s.distance+=Math.min(100,Math.hypot(t.x-prev.x,t.y-prev.y));
 s.peak=Math.max(s.peak,Math.abs(t.speedKmh));
 s.seenLeft ||= input.indicator===-1;s.seenRight ||= input.indicator===1;
 s.seenHigh ||= input.headlightMode===2;s.seenLow ||= input.headlightMode===1;s.seenWiper ||= !!input.wipers;
 s.shifted ||= t.gear>0&&t.gear!==s.entryGear;
 if(Math.abs(t.speedKmh)>c.speedLimit+3)penaliseExam(s,c.id+'speed','超过本项目限速',5);
 const stopped=Math.abs(t.speedKmh)<.6;
 const aligned=c.targetHeading===undefined||Math.abs(angle(t.rotation-c.targetHeading))<.16||Math.abs(angle(t.rotation-c.targetHeading-Math.PI))<.16;
 const parking=c.kind==='park'||c.kind==='reverse';
 const dx=t.x-c.x,dy=t.y-c.y,h=c.targetHeading??0;
 const along=Math.abs(dx*Math.cos(h)+dy*Math.sin(h)),across=Math.abs(-dx*Math.sin(h)+dy*Math.cos(h));
 const relative=t.rotation-h,halfLength=(t.length??48)/2,halfWidth=(t.width??19)/2;
 const contained=along+Math.abs(Math.cos(relative))*halfLength+Math.abs(Math.sin(relative))*halfWidth<=(c.bayLength??66)/2
  &&across+Math.abs(Math.sin(relative))*halfLength+Math.abs(Math.cos(relative))*halfWidth<=(c.bayWidth??32)/2;
 if(c.path&&c.laneWidth){let nearest=Infinity;for(let i=1;i<c.path.length;i++){const a=c.path[i-1],b=c.path[i],dx=b.x-a.x,dy=b.y-a.y,f=Math.max(0,Math.min(1,((t.x-a.x)*dx+(t.y-a.y)*dy)/(dx*dx+dy*dy||1)));nearest=Math.min(nearest,Math.hypot(t.x-a.x-dx*f,t.y-a.y-dy*f));}if(nearest+(t.width??19)/2>c.laneWidth/2+3)penaliseExam(s,c.id+'line','车轮越过边线',5);}
 const validStop=(parking?contained:Math.hypot(t.x-c.x,t.y-c.y)<=c.radius)&&stopped&&aligned&&(c.kind!=='reverse'||t.gear===-1);
 s.hold=validStop?s.hold+dt:0;if(s.hold>=2)s.stopped=true;
 if(c.kind==='hill'&&prev){const travel=Math.cos(s.entryHeading)*(t.x-prev.x)+Math.sin(s.entryHeading)*(t.y-prev.y);s.rollback=travel<0?s.rollback-travel:0;if(s.rollback>5)penaliseExam(s,c.id+'rollback','坡道溜车超过 0.5 米',10);}
 const green=examSignalGreen(t.time);
 if(c.kind==='signal'&&!green&&prev&&((prev.x-c.x)*(c.exit.x-c.x)+(prev.y-c.y)*(c.exit.y-c.y))<=0&&((t.x-c.x)*(c.exit.x-c.x)+(t.y-c.y)*(c.exit.y-c.y))>0)penaliseExam(s,c.id+'red','红灯未停车',20);
 let done=false;
 const exit=Math.hypot(t.x-c.exit.x,t.y-c.exit.y)<c.radius;
 switch(c.kind){
 case 'park':case 'reverse':done=s.stopped;break;
 case 'stop':case 'hill':done=s.stopped&&exit;break;
 case 'signal':done=exit&&green;break;
 case 'left':done=exit&&s.seenLeft;break;case 'right':done=exit&&s.seenRight;break;
 case 'highbeam':done=exit&&s.seenHigh&&input.headlightMode===1;break;
 case 'lowbeam':done=exit&&s.seenLow;break;case 'wiper':done=exit&&s.seenWiper;break;
 case 'accelerate':done=exit&&s.peak>=35&&Math.abs(t.speedKmh)<=15&&(!t.manual||s.shifted);break;
 case 'shift':done=exit&&(!t.manual||s.shifted);break;
 case 'merge':done=exit&&(s.seenLeft||s.seenRight);break;
 case 'overtake':done=exit&&s.seenLeft&&s.seenRight;break;
 case 'uturn':done=(s.seenLeft||s.seenRight)&&Math.abs(angle(t.rotation-s.entryHeading))>2.65;break;
 default:done=exit&&s.distance>=Math.hypot(c.x-c.exit.x,c.y-c.exit.y)*.9;
 }
 if(done&&!parking&&s.distance<10)done=false;
 if(done){s.passed.push(c.id);advanceExam(s,stations);}
 else if(exit){
  const missing=(c.kind==='left'&&!s.seenLeft)||(c.kind==='right'&&!s.seenRight)||((c.kind==='merge'||c.kind==='uturn')&&!s.seenLeft&&!s.seenRight)||(c.kind==='overtake'&&(!s.seenLeft||!s.seenRight));
  if(missing)penaliseExam(s,c.id+'indicator','未按要求使用转向灯',5);
  if((c.kind==='highbeam'&&(!s.seenHigh||input.headlightMode!==1))||(c.kind==='lowbeam'&&!s.seenLow))penaliseExam(s,c.id+'lights','灯光操作不符合项目要求',5);
  if((c.kind==='stop'||c.kind==='hill')&&!s.stopped)penaliseExam(s,c.id+'stop','未在指定位置停稳',10);
  s.message='条件尚未完成：'+c.hint;
 }
 return {green,near,exit};
}
export function advanceExam(s:ExamState,stations:ExamStation[]){
 const c=stations[s.index];
 if(c&&!s.passed.includes(c.id)&&!s.skipped.includes(c.id))s.skipped.push(c.id);
 const last=s.last;
 resetAttempt(s);
 s.index=last?nearestExamStation(s,stations,last.x,last.y):stations.findIndex(c=>!s.passed.includes(c.id)&&!s.skipped.includes(c.id));
 if(s.index<0)s.index=stations.length;
 s.message=stations[s.index]?'驶入任意未完成考点继续':`练习结束 · ${s.score} 分`;
}
