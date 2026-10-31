import assert from 'node:assert/strict';
import {buildHighway} from '../utils/highway';
import {MAX_ACTIVE_TRAFFIC,trafficLimit,stepTrafficVehicle,trafficLaneBoundary} from '../utils/traffic';
import {vehicleLayersCompatible} from '../utils/physics';
import {restoreSettings} from '../utils/settingsStorage';
import type {UserSettings} from '../types';
const level=buildHighway(),cars=level.obstacles.filter(o=>o.id.startsWith('highway-traffic-'));
assert.equal(cars.length,48);assert.equal(MAX_ACTIVE_TRAFFIC,48);
assert.deepEqual(['easy','normal','hard','extreme'].map(d=>trafficLimit(d as any)),[8,16,32,48]);
for(const car of cars){const lane=car.ai!.laneIndex!,kmh=car.ai!.maxSpeed*15;assert.equal(kmh,[110,100,90,80][lane],`lane ${lane} target speed`);}
const outer=cars.find(car=>car.ai!.laneIndex===3)!,changing=structuredClone(outer.ai!);
changing.blockedFor=1;
stepTrafficVehicle({id:outer.id,x:outer.x,y:outer.y,rotation:outer.rotation,ai:changing,blockers:[],player:{x:-10000,y:-10000},dtSeconds:.1,nowMs:20000});
assert.equal(changing.laneIndex,2,'an unobstructed adjacent lane can be selected');
assert.equal(changing.maxSpeed*15,90,'speed target follows the destination lane');
const defaults={trafficDifficulty:'normal',dayTime:'DAY',renderQuality:'auto',volume:1,cabinVolume:1,exteriorVolume:1,steeringSensitivity:1} as UserSettings;
assert.equal(restoreSettings(defaults,JSON.stringify({trafficDifficulty:'extreme'})).trafficDifficulty,'extreme');
assert.equal(restoreSettings(defaults,JSON.stringify({trafficDifficulty:'invalid'})).trafficDifficulty,'normal');
const sample=cars[0],ai={...sample.ai!,path:sample.ai!.path.map(p=>({...p}))};const result=stepTrafficVehicle({id:sample.id,x:sample.x,y:sample.y,rotation:sample.rotation,ai,blockers:[],player:{x:-10000,y:-10000},dtSeconds:.1,nowMs:1});assert(result.speed>0&&!result.blocked);
console.log('Highway difficulty PASS: lane target speeds, four bounded traffic caps, persisted settings and free-flow motion');
// A parallel guardrail has a long X extent, but is only two units thick.
// Treating its length as its lateral width froze most highway traffic.
const base={path:[{x:300,y:0},{x:600,y:0}],currentPathIndex:0,speed:6,maxSpeed:6,state:'drive' as const};
const drive=(obstacle:any)=>stepTrafficVehicle({id:'npc',x:0,y:0,rotation:0,ai:structuredClone(base),blockers:[obstacle],player:{x:-9999,y:-9999},dtSeconds:.1,nowMs:1000});
assert(!drive({id:'parallel',type:'wall',x:100,y:35,width:200,height:4,rotation:0}).blocked,'parallel barrier must not stop a lane');
assert(drive({id:'across',type:'wall',x:120,y:0,width:80,height:5,rotation:Math.PI/2}).blocked,'wall across lane must stop traffic');
// Exercise the actual authored highway, including its many long barriers.
const moving=level.obstacles.filter(o=>o.ai).slice(0,16),starts=moving.map(o=>({x:o.x,y:o.y}));
for(let frame=0;frame<200;frame++)for(const o of moving){
 const blockers=level.obstacles.filter(x=>x!==o&&(!x.ai||moving.includes(x))&&(x.type==='car'||x.type==='wall')&&!trafficLaneBoundary(x.id)&&Math.abs(x.x-o.x)<750&&Math.abs(x.y-o.y)<750&&(x.type!=='wall'||vehicleLayersCompatible({x:o.x,y:o.y,rotation:o.rotation,width:o.width,length:o.height,elevation:o.elevation,verticalHeight:20},x)));
 const result=stepTrafficVehicle({id:o.id,x:o.x,y:o.y,rotation:o.rotation,ai:o.ai!,blockers,player:{x:-10000,y:-10000},dtSeconds:.1,nowMs:frame*100});
 Object.assign(o,{x:result.x,y:result.y,rotation:result.rotation});Object.assign(o.ai!,{speed:result.speed,currentPathIndex:result.currentPathIndex});
}
for(const [i,o] of moving.entries())assert(Math.hypot(o.x-starts[i].x,o.y-starts[i].y)>1000,`${o.id} should travel at least 100 m over 20 s`);
console.log('Highway traffic PASS: all 16 normal-traffic cars move on the authored map over 20 seconds.');
