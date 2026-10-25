import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {CAR_MODELS,DEFAULT_VEHICLE_TUNING,GENERATE_LEVEL} from '../constants';
import {CarType} from '../types';
import {stepLongitudinal,createLongitudinalState} from '../utils/longitudinal';
import {getPowertrain,steeringWheelMaxDeg} from '../utils/powertrain';
import {effectiveSteeringWheelMaxDeg} from '../utils/steering';
import {brakeResponse} from '../utils/braking';
import {garageSurface,GARAGE_LEVELS,garageRampHeight} from '../utils/garage';
import {sampleWheelSupport} from '../utils/wheelObstacles';
import {sampleTerrainSurface} from '../utils/terrainSampling';
import {checkVehicleRectCollision,vehicleLayersCompatible} from '../utils/physics';
import {CrashDebris} from '../three/crashDebris';
import {MODEL_REGISTRY,CAR_TYPE_TO_MODEL,normalizeModel} from '../three/modelLoader';
import {buildNativeAuthoredVehicle} from '../three/blenderVehicle';
const cfg=CAR_MODELS[CarType.TAI7],pt=getPowertrain(cfg.id);
const results:any={brakes:[],garage:[],debris:[]};
for(const hz of [30,60,120])for(const mode of ['abs','locked','hand']){
 let state=createLongitudinalState(100/15),distance=0,t=0,locked=false;
 while(state.speed>.0001 && t<30){const previous=state.speed;
  const r=stepLongitudinal(state,{gear:0,engineStarted:true,throttle:0,gasPressed:false,shiftPressed:false,brake:mode==='hand'?0:1,handbrake:mode==='hand',absEnabled:mode!=='locked'},
   {carId:cfg.id,cc:cfg,pt,vehicleTune:DEFAULT_VEHICLE_TUNING[cfg.id],weatherGrip:1,slopeAlongCar:0,tunedShiftFrames:15,elapsedFrames:60/hz});
  state=r;locked ||= r.frontLocked;distance+=(previous+state.speed)/2*15/3.6/hz;t+=1/hz;
 }
 assert(t<15);if(mode==='abs'){assert(distance<60 && distance>30);assert(!locked);}if(mode==='locked')assert(locked);
 results.brakes.push({hz,mode,metres:distance,seconds:t});
}
assert(results.brakes[0].metres<results.brakes[1].metres);
assert(brakeResponse(0,true,5,true,pt.brakeMax,1).rearLocked);
assert(!brakeResponse(0,true,5,true,pt.brakeMax,1).frontLocked);
assert(!brakeResponse(0,false,5,false,pt.brakeMax,1).rearLocked);
assert.equal(effectiveSteeringWheelMaxDeg(cfg,12),steeringWheelMaxDeg(cfg));
assert(steeringWheelMaxDeg(cfg)>360,'at least a full revolution in each direction');
const l=GENERATE_LEVEL(6);assert(l.garage);assert.equal(l.obstacles.filter(o=>o.type==='car').length,36);
for(const m of l.markings.filter(m=>m.type==='arrow-straight')){const dy=m.y-[220,500,780].reduce((a,b)=>Math.abs(m.y-a)<Math.abs(m.y-b)?a:b);assert.equal(m.rotation,dy>0?0:Math.PI,'aisle arrows must keep right');}
const hits=(x:number,y:number,r:number,e:number)=>{
 const b={x,y,length:cfg.length,width:cfg.width,rotation:r,elevation:e,verticalHeight:cfg.height};
 return l.obstacles.filter(o=>vehicleLayersCompatible(b,o)&&checkVehicleRectCollision(b,o));
};
for(const f of [0,1])for(const direction of [1,-1]){
 let h:number=GARAGE_LEVELS[direction===1?f:f+1],maxStep=0;
 for(let i=0;i<=560;i++){
  const y=direction===1?220+i:780-i,x=direction===1?1575:1625;
  const s=sampleTerrainSurface(l,x,y,h);
  const wheel=sampleWheelSupport(l,{x,y,rotation:direction*Math.PI/2},{x:0,z:0,radius:4,halfWidth:1.3,steer:0},h);
  assert(Math.abs(wheel-s.height)<.12,'wheel must use negative basement support, never a phantom ground plane');
  maxStep=Math.max(maxStep,Math.abs(h-s.height));h=s.height;
  assert.equal(hits(x,y,direction*Math.PI/2,h).length,0,`ramp blocked f${f} ${x}/${y}: ${hits(x,y,direction*Math.PI/2,h).map(o=>o.id)}`);
 }
 assert(Math.abs(h-GARAGE_LEVELS[direction===1?f+1:f])<1e-7);assert(maxStep<.17);
 results.garage.push({from:direction===1?f+1:f+2,to:direction===1?f+2:f+1,endElevation:h,maxStep});
}
for(const e of GARAGE_LEVELS){assert.equal(garageSurface(800,500,e).height,e);assert.equal(hits(1360,220,0,e).length,0);}
for(let f=0;f<3;f++)for(const y of [220,780])if(y===220?f<2:f>0)for(let x=1360;x<=1600;x+=2)assert.equal(hits(x,y,0,GARAGE_LEVELS[f]).length,0,'ramp landing opening is unobstructed');
// Sweep a full-sized car around both landing turns, including its corners.
for(const f of [0,1])for(const up of [false,true]){
 const e=GARAGE_LEVELS[up?f:f+1];
 for(let i=0;i<=90;i++){
  const theta=(up?-1:1)*i*Math.PI/180;
  const x=(up?1550:1500)+75*Math.cos(theta),y=(up?280:720)+75*Math.sin(theta);
  const r=(up?-Math.PI/2:Math.PI/2)+theta;
  assert.equal(hits(x,y,r,e).length,0,`landing turn blocked f${f} up${up} angle${i}: ${hits(x,y,r,e).map(o=>o.id)}`);
 }
}
const def=MODEL_REGISTRY[CAR_TYPE_TO_MODEL[cfg.id]],data=fs.readFileSync('public/models/'+def.file);
const gltf=await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');normalizeModel(gltf.scene,def);
const parts=buildNativeAuthoredVehicle(gltf.scene,cfg);parts.group.rotation.y=Math.PI/2;parts.group.position.set(140,0,140);
for(const hz of [30,60,120]){
 const crash=new CrashDebris(parts.group,{x:420,y:90},0,[],()=>0,undefined,{bounds:{width:300,height:300}});
 for(let i=0;i<hz*25;i++)crash.step(1/hz);
 let maxGap=0,maxSpeed=0,fragments=0;
 for(const mesh of crash.group.children){const b=new THREE.Box3().setFromObject(mesh,true);assert(b.min.x>=-.5 && b.max.x<=300.5 && b.min.z>=-.5 && b.max.z<=300.5,'fragments stay in map');
  if(mesh.name.startsWith('body-fragment')){fragments++;maxGap=Math.max(maxGap,Math.abs(b.min.y));assert(b.min.y<.5 && b.min.y>-.5,`${mesh.name} not grounded: ${b.min.y}`);}}
 for(const b of crash.world.bodies)if(b.mass>0)maxSpeed=Math.max(maxSpeed,b.velocity.length());
 assert(fragments>=6,'verify actual body fragments');assert(maxSpeed<1,'wreck must settle, not fly forever');results.debris.push({hz,maxGap,maxSpeed});crash.dispose();
}
fs.writeFileSync('docs/round19/physics-report.json',JSON.stringify(results,null,2));console.log('Round19 brake, full steering travel, stacked garage connectivity, tight debris floor/boundary checks PASS',JSON.stringify(results,null,2));
