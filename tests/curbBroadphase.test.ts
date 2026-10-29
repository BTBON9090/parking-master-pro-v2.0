import assert from 'node:assert/strict';
import {CURB_WIDTH} from '../utils/terrainSampling';
import {nearbyWheelCurbs, type CurbSegment, type VehiclePose} from '../utils/wheelObstacles';
import {buildBeijingLevel} from '../utils/beijingMap';

// Oracle is the original oriented-rectangle predicate: broad phase must not
// change either the candidates or their ordering, including tangent contacts.
function original(curbs:CurbSegment[],pose:VehiclePose,range:number) {
 return curbs.filter(curb=>{
  const dx=pose.x-curb.x,dy=pose.y-curb.y,c=Math.cos(curb.rotation),s=Math.sin(curb.rotation);
  return Math.abs(dx*c+dy*s)<=curb.length/2+range && Math.abs(-dx*s+dy*c)<=CURB_WIDTH/2+range;
 });
}
let seed=0x2c91e; const rand=()=>((seed=(1664525*seed+1013904223)>>>0)/2**32);
const same=(curbs:CurbSegment[],pose:VehiclePose,range:number)=>assert.deepEqual(nearbyWheelCurbs(curbs,pose,range),original(curbs,pose,range));
const curbs:CurbSegment[]=Array.from({length:900},()=>({x:(rand()-.5)*2e5,y:(rand()-.5)*2e5,length:1+rand()*3000,rotation:(rand()-.5)*Math.PI*4}));
for(let i=0;i<500;i++)same(curbs,{x:(rand()-.5)*2e5,y:(rand()-.5)*2e5,rotation:rand()*Math.PI*2},rand()*450);
for(const length of [0.001,56,1000,100000])for(const angle of [0,Math.PI/4,Math.PI/2,Math.PI*.913])for(const range of [0,5,100,1000]) {
 const curb={x:1e7,y:-1e7,rotation:angle,length};const c=Math.cos(angle),s=Math.sin(angle),a=length/2+range,b=CURB_WIDTH/2+range;
 for(const [u,v] of [[a,b],[a,-b],[-a,b],[-a,-b],[a+1e-4,b],[-a-1e-4,b],[a,b+1e-4]]) {
  same([curb],{x:curb.x+u*c-v*s,y:curb.y+u*s+v*c,rotation:0},range);
 }
}
const city=buildBeijingLevel().curbSegments??[];
for(let i=0;i<300;i++){
 const curb=city[Math.floor(rand()*city.length)],range=[5,25,75,200][i%4];
 same(city,{x:curb.x+(rand()-.5)*400,y:curb.y+(rand()-.5)*400,rotation:rand()*Math.PI*2},range);
}
console.log(`Curb broad phase PASS: rotated bounds, tangent edges, large vehicles and ${city.length} city kerbs preserve original candidates`);
