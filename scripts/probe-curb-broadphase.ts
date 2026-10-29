import {performance} from 'node:perf_hooks';
import {buildBeijingLevel} from '../utils/beijingMap';
import {CURB_WIDTH} from '../utils/terrainSampling';
import {nearbyWheelCurbs,type CurbSegment,type VehiclePose} from '../utils/wheelObstacles';
const curbs=buildBeijingLevel().curbSegments??[];
const old=(pose:VehiclePose,range:number)=>curbs.filter(curb=>{
 const dx=pose.x-curb.x,dy=pose.y-curb.y,c=Math.cos(curb.rotation),s=Math.sin(curb.rotation);
 return Math.abs(dx*c+dy*s)<=curb.length/2+range && Math.abs(-dx*s+dy*c)<=CURB_WIDTH/2+range;
});
const samples=Array.from({length:600},(_,i)=>{
 const p=curbs[(i*37)%curbs.length];return {pose:{x:p.x+(i%7-3)*19,y:p.y+(i%11-5)*13,rotation:0},range:i%2?50:120};
});
const run=(fn:(p:VehiclePose,r:number)=>CurbSegment[])=>{let n=0;const start=performance.now();for(const {pose,range} of samples)n+=fn(pose,range).length;return {ms:performance.now()-start,n};};
const faster=(p:VehiclePose,r:number)=>nearbyWheelCurbs(curbs,p,r);
for(let i=0;i<4;i++){run(old);run(faster);}
const previous:number[]=[],optimized:number[]=[];let n=-1;
for(let i=0;i<15;i++){
 const [a,b]=i%2?[run(faster),run(old)]:[run(old),run(faster)];
 const before=i%2?b:a,after=i%2?a:b;if(before.n!==after.n)throw Error('candidate count changed');n=before.n;
 previous.push(before.ms);optimized.push(after.ms);
}
const median=(x:number[])=>x.sort((a,b)=>a-b)[Math.floor(x.length/2)];
console.log(JSON.stringify({curbs:curbs.length,queriesPerRun:samples.length,matchingCandidates:n,beforeMs:median(previous),afterMs:median(optimized),runs:15,unit:'desktop ms for 600 queries; not Android frame time or temperature'},null,2));
