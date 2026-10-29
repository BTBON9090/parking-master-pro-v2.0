import {CarType, type CameraView, type LevelData} from '../types';
import {newExam, type ExamState} from './drivingExam';

export const PROGRESS_KEY = 'parking-master-progress-v1';
export const WORLD_REVISION = 43;
export interface SavedExam {score:number;passed:string[];skipped:string[];penalties:string[];flags:string[]}
export interface SavedMap {completedSpots:string[];exam?:SavedExam}
export interface GameProgress {
  schema:1; worldRevision:number; savedAt:number; car:CarType; levelId:number; money:number; camera:CameraView;
  pose:{x:number;y:number;rotation:number;elevation:number}; maps:Record<string,SavedMap>;
  customLevel?:LevelData;
}
const finite = (x:unknown):x is number => typeof x==='number' && Number.isFinite(x);
const strings = (x:unknown, limit=512):string[] => Array.isArray(x) ? [...new Set(x.filter(v=>typeof v==='string'&&v.length<180))].slice(0,limit) : [];
const cameras:CameraView[]=['HOOD','FOLLOW_NEAR','FOLLOW_FAR','TOP','REVERSE','REAR_RIGHT','REAR_LEFT','FRONT_LEFT','FRONT_RIGHT','SIDE_LEFT','SIDE_RIGHT','ORBIT'];
export function parseProgress(raw:string|null):GameProgress|null {
  try {
    if (!raw || raw.length>4_000_000) return null;
    const d=JSON.parse(raw);
    if(d?.schema!==1 || !Object.values(CarType).includes(d.car) || !finite(d.levelId) || !Number.isInteger(d.levelId) || d.levelId<0 || d.levelId>13
      || !finite(d.savedAt) || !finite(d.money) || !d.pose || !['x','y','rotation','elevation'].every(k=>finite(d.pose[k])))return null;
    const maps:Record<string,SavedMap>={};
    for(const [key,value] of Object.entries(d.maps??{}).slice(0,32)) {
      if(!/^\d+$/.test(key)||!value||typeof value!=='object')continue;
      const v=value as SavedMap;
      const exam=v.exam&&finite(v.exam.score)?{score:Math.max(0,Math.min(100,v.exam.score)),passed:strings(v.exam.passed),skipped:strings(v.exam.skipped),penalties:strings(v.exam.penalties),flags:strings(v.exam.flags)}:undefined;
      maps[key]={completedSpots:strings(v.completedSpots),...(exam?{exam}:{})};
    }
    const custom=d.customLevel;
    if((d.levelId===0)!==!!custom)return null;
    if(custom && (custom.levelId!==0 || !finite(custom.mapWidth)||!finite(custom.mapHeight)||custom.mapWidth<=0||custom.mapHeight<=0
      ||!custom.startPos||!['x','y','rotation'].every(k=>finite(custom.startPos[k]))
      ||!Array.isArray(custom.obstacles)||custom.obstacles.length>20000||!Array.isArray(custom.spots)||!Array.isArray(custom.markings)))return null;
    return {schema:1,worldRevision:finite(d.worldRevision)?d.worldRevision:0,savedAt:d.savedAt,car:d.car,levelId:d.levelId,
      money:Math.max(0,Math.min(1e9,d.money)),camera:cameras.includes(d.camera)?d.camera:'HOOD',pose:{x:d.pose.x,y:d.pose.y,rotation:d.pose.rotation,elevation:d.pose.elevation},maps,
      ...(custom?{customLevel:custom}:{})};
  } catch {return null;}
}
export function loadProgress():GameProgress|null {
  try{return parseProgress(localStorage.getItem(PROGRESS_KEY))??parseProgress(localStorage.getItem(PROGRESS_KEY+'-backup'));}catch{return null;}
}
export function saveProgress(progress:GameProgress):boolean {
  try {
    const raw=JSON.stringify(progress);
    if(!parseProgress(raw))return false;
    const previous=localStorage.getItem(PROGRESS_KEY);
    // A full backup quota must not prevent replacement of a smaller primary.
    if(parseProgress(previous))try{localStorage.setItem(PROGRESS_KEY+'-backup',previous!);}catch{}
    localStorage.setItem(PROGRESS_KEY,raw);return true;
  }catch{return false;}
}
export function savedExam(state:ExamState):SavedExam {
  return {score:state.score,passed:[...state.passed],skipped:[...state.skipped],penalties:[...state.penalties],flags:[...state.flags]};
}
export function restoreExam(data:SavedExam|undefined,level:LevelData):ExamState {
  const s=newExam();if(!data)return s;
  const ids=new Set(level.exam?.map(c=>c.id));
  s.score=data.score;s.passed=data.passed.filter(id=>ids.has(id));s.skipped=data.skipped.filter(id=>ids.has(id));
  s.penalties=[...data.penalties];s.flags=new Set(data.flags);
  s.index=level.exam?.findIndex(c=>!s.passed.includes(c.id)&&!s.skipped.includes(c.id))??0;
  if(s.index<0)s.index=level.exam?.length??0;
  return s; // Never restore a half-completed stop, held key or active attempt.
}
