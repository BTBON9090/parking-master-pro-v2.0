import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildGarageLevel,GARAGE_LEVELS,GARAGE_PILLAR_X,GARAGE_PILLAR_Y,GARAGE_SPEED_TABLES,garageBump} from '../utils/garage';
import {sampleWheelSurfaceHeight} from '../utils/terrainSampling';
import {sensedObstacle,parkingPulse} from '../utils/proximity';
import {CAR_MODELS,GARAGE_CARS} from '../constants';
import {CarType} from '../types';
import {checkVehicleRectCollision,vehicleLayersCompatible} from '../utils/physics';
import {WORLD_ROUTES,worldHeight} from '../utils/openWorld';
import {getPowertrain,isElectricVehicle} from '../utils/powertrain';
const garage=buildGarageLevel(),cfg=CAR_MODELS[CarType.TRUCK];
const report:any={radar:[],aisleSweeps:0,pickup:{fuel:!isElectricVehicle(cfg.id),gears:getPowertrain(cfg.id).gearTops.length}};
for(const e of GARAGE_LEVELS){
 // Every guide line end uses the actual current deck hint. With the old
 // omitted/default 0 this reproduced -48 even in B2 / B3.
 for(const direction of [-1,1])for(const distance of [8,20,36])for(const side of [-1,1]){
  const y=sampleWheelSurfaceHeight(garage,800+direction*distance,500+side*cfg.width/2,e);
  assert.equal(y,e,`guide projected onto wrong floor at ${e}`);
 }
 const sensed=garage.obstacles.filter(o=>sensedObstacle(o,e,cfg.height));
 assert(sensed.every(o=>Math.abs((o.elevation??0)-e)<42),'other-floor cars/columns must not trigger radar');
 assert(sensed.some(o=>o.type==='car'));
 for(const y of [198,242,478,522,758,802])for(let x=220;x<=1430;x+=5){
  const body={x,y,length:cfg.length,width:cfg.width,rotation:0,elevation:e,verticalHeight:cfg.height};
  assert(!garage.obstacles.some(o=>vehicleLayersCompatible(body,o)&&checkVehicleRectCollision(body,o)),`aisle blocked ${x}/${y}/${e}`);report.aisleSweeps++;
 }
 report.radar.push({floor:e,detected:sensed.length,guideElevation:e});
}
for(const p of garage.obstacles.filter(o=>o.id.includes('-pillar-'))){assert(GARAGE_PILLAR_X.includes(p.x));assert(GARAGE_PILLAR_Y.includes(p.y));
 assert(garage.spots.every(s=>Math.abs((s.elevation??0)-(p.elevation??0))>1||!checkVehicleRectCollision({x:s.x,y:s.y,length:s.width,width:s.height,rotation:s.rotation,elevation:s.elevation,verticalHeight:20},p)),'pillar inside a parking target');}
for(const type of ['line','marker','parking'] as any[])assert(!sensedObstacle({type,x:0,y:0,width:20,height:20,elevation:-96} as any,-96,20));
for(const d of [0,.1,1,5,14]){const p=parkingPulse(d,3,true,0);assert(p.enabled);assert(p.duration*1000<p.intervalMs/3,'short pulses must leave silence');}
assert(!parkingPulse(0,0,true,1800).enabled,'parked sensors stop');assert(!parkingPulse(0,25,true,0).enabled);assert(!parkingPulse(0,3,false,0).enabled);
for(const p of GARAGE_SPEED_TABLES){assert.equal(garageBump(p.x,p.y).height,.55);assert(Math.abs(garageBump(p.x-13,p.y).height)<1e-9);assert(Math.abs(garageBump(p.x+13,p.y).height)<1e-9);
 for(const e of GARAGE_LEVELS)assert.equal(sampleWheelSurfaceHeight(garage,p.x,p.y,e),e+.55);}
assert(GARAGE_CARS.includes(cfg.id));assert.equal(getPowertrain(cfg.id).gearTops.length,5);assert(!isElectricVehicle(cfg.id));
const trail=WORLD_ROUTES.find(r=>r.id==='forestry')!;assert(trail.gravel&&trail.closed);let maxStep=0;
for(let i=1;i<trail.samples.length;i++){const a=trail.samples[i-1],b=trail.samples[i];maxStep=Math.max(maxStep,Math.abs(worldHeight(a.x,a.y)-worldHeight(b.x,b.y)));}
assert(maxStep<4,'new route must not introduce height steps');report.trail={samples:trail.samples.length,lengthM:trail.samples.at(-1)!.distance/10,maxStep};
for(const name of ['ice-start','ice-stop','ev-start','ev-stop']){const b=fs.readFileSync(`public/audio/${name}.wav`);assert.equal(b.toString('ascii',0,4),'RIFF');assert(b.length>5000);}
fs.mkdirSync('docs/round20',{recursive:true});fs.writeFileSync('docs/round20/regression.json',JSON.stringify(report,null,2));console.log('Round20 floor projection, no cross-floor radar, clear aisles/bays, smooth bumps, pickup and trail PASS',report);
