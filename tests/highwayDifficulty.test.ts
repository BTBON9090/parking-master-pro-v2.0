import assert from 'node:assert/strict';
import {buildHighway} from '../utils/highway';
import {MAX_ACTIVE_TRAFFIC,trafficLimit,stepTrafficVehicle} from '../utils/traffic';
import {restoreSettings} from '../utils/settingsStorage';
import type {UserSettings} from '../types';
const level=buildHighway(),cars=level.obstacles.filter(o=>o.id.startsWith('highway-traffic-'));
assert.equal(cars.length,48);assert.equal(MAX_ACTIVE_TRAFFIC,48);
assert.deepEqual(['easy','normal','hard','extreme'].map(d=>trafficLimit(d as any)),[8,16,32,48]);
for(const car of cars){const lane=car.ai!.laneIndex!,kmh=car.ai!.maxSpeed*15;assert(kmh>=(lane===0?110:lane===3?80:90));assert(kmh<=120);}
const defaults={trafficDifficulty:'normal',dayTime:'DAY',renderQuality:'auto',volume:1,cabinVolume:1,exteriorVolume:1,steeringSensitivity:1} as UserSettings;
assert.equal(restoreSettings(defaults,JSON.stringify({trafficDifficulty:'extreme'})).trafficDifficulty,'extreme');
assert.equal(restoreSettings(defaults,JSON.stringify({trafficDifficulty:'invalid'})).trafficDifficulty,'normal');
const sample=cars[0],ai={...sample.ai!,path:sample.ai!.path.map(p=>({...p}))};const result=stepTrafficVehicle({id:sample.id,x:sample.x,y:sample.y,rotation:sample.rotation,ai,blockers:[],player:{x:-10000,y:-10000},dtSeconds:.1,nowMs:1});assert(result.speed>0&&!result.blocked);
console.log('Highway difficulty PASS: lane target speeds, four bounded traffic caps, persisted settings and free-flow motion');
