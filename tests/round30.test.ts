import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {CAR_MODELS,GARAGE_CARS,DEFAULT_VEHICLE_TUNING,GENERATE_LEVEL} from '../constants';
import {CarType,type InputState} from '../types';
import {FLEET30_IDS} from '../utils/fleet30';
import {createLongitudinalState,stepLongitudinal} from '../utils/longitudinal';
import {stepImpactRecovery} from '../utils/impactRecovery';
import {getPowertrain,steeringWheelMaxDeg} from '../utils/powertrain';
import {stepLateral,createLateralState,cornerDriveBudget} from '../utils/lateralDynamics';
import {createChassisState,stepChassis} from '../utils/chassisSupport';
import {suspensionForCar} from '../utils/suspension';
import {MobileInputController,steeringRulerTicks,steeringRulerZoom} from '../utils/mobileInput';
import {newExam,stepExam,examSignalGreen} from '../utils/drivingExam';
import {MODEL_REGISTRY,CAR_TYPE_TO_MODEL,normalizeModel} from '../three/modelLoader';
import {buildNativeAuthoredVehicle} from '../three/blenderVehicle';
import {ArticulatedTrailer} from '../three/articulatedTrailer';
const report:any={braking:[],launch:[],rollover:[],assets:[]};
// Reproduce the actual regression: brake the requested speed, then apply the
// collision's residual WORLD velocity, just as GameCanvas does each tick.
for(const id of GARAGE_CARS)for(const hz of [30,60,120]){
 const c=CAR_MODELS[id],pt=getPowertrain(id),ctx={carId:id,cc:c,pt,vehicleTune:DEFAULT_VEHICLE_TUNING[id],weatherGrip:1,slopeAlongCar:0,tunedShiftFrames:pt.shiftFrames,elapsedFrames:60/hz};
 const start=Math.min(100,c.maxSpeed*15),impact={x:start/3.6,y:0,yaw:0,time:3};
 let s=createLongitudinalState(start/15),meters=0,n=0;
 for(;n<hz*10&&Math.hypot(impact.x,impact.y)>.08;n++){
  const braked=stepLongitudinal(s,{gear:0,engineStarted:true,gasPressed:false,shiftPressed:false,throttle:0,brake:1,handbrake:false,absEnabled:true},ctx);
  const p=stepImpactRecovery(impact,{heading:0,speed:braked.speed*15/3.6,beta:0,steeringYaw:0,grip:c.dynamics.grip,dt:1/hz,brakeDeceleration:braked.brakeForce*250});
  s={...braked,speed:p.speed/(15/3.6)};meters+=Math.hypot(impact.x,impact.y)/hz;
 }
 assert(n<hz*5,`${id} recovery state must respect full service braking`);
 assert(meters<65,`${id} stop distance ${meters}`);report.braking.push({id,hz,startKmh:start,meters,seconds:n/hz});
 const lat=createLateralState();s={...createLongitudinalState(),ignitionBlend:1};let yaw=0, launchDistance=0;
 for(let k=0;k<hz*15;k++){
  s=stepLongitudinal(s,{gear:1,engineStarted:true,gasPressed:false,shiftPressed:false,throttle:1,brake:0,handbrake:false},{...ctx,driveGripBudget:cornerDriveBudget(s.speed*15/3.6,c.dynamics.maxSteerAngle,c.wheelbase/10,c.dynamics.grip)});
  const l=stepLateral(lat,{speed:s.speed*15/3.6,steer:c.dynamics.maxSteerAngle,rearSteer:0,wheelbase:c.wheelbase/10,rearOffset:c.wheelbase/20,frontBias:c.dynamics.frontWeightBias,grip:c.dynamics.grip,layout:c.dynamics.driveLayout,throttle:1,handbrake:false,frontLocked:false,dt:1/hz,understeer:c.dynamics.understeerGradient});
  s.speed=Math.max(0,s.speed-l.scrubAccel/hz/(15/3.6));yaw+=l.yawRate/hz;launchDistance+=s.speed*15/3.6/hz;
 }
 assert(s.speed*15<36,`${id} full-lock launch ran away`);assert(Math.abs(yaw)>launchDistance*Math.tan(c.dynamics.maxSteerAngle)/(c.wheelbase/10)*.62,`${id} must follow a tight curve proportional to its wheelbase and distance travelled`);
 if(hz===60)report.launch.push({id,kmh:s.speed*15,headingChange:yaw});
}
// Gentle inputs remain stable; a violent high-speed SUV flick can unload the
// inside support and hand over to the rigid-body rollover simulation.
for(const steer of [.025,.5]){
 const id=CarType.TAI7,c=CAR_MODELS[id],lat=createLateralState(),ch=createChassisState();let flipped=false,min=1;
 const wheels=[[-1,1],[1,1],[-1,-1],[1,-1]].map(([x,z])=>({x:x*c.trackWidth/2,z:z*c.wheelbase/2,y:4,radius:4,halfWidth:1.4,steer:0}));
 for(let n=0;n<240;n++){
 const l=stepLateral(lat,{speed:30,steer:n<20?0:steer,rearSteer:0,wheelbase:c.wheelbase/10,rearOffset:c.wheelbase/20,frontBias:c.dynamics.frontWeightBias,grip:c.dynamics.grip,layout:c.dynamics.driveLayout,throttle:.1,handbrake:false,frontLocked:false,dt:1/120,understeer:c.dynamics.understeerGradient});
 const p=stepChassis(ch,{wheels,spec:suspensionForCar(id),mass:c.weight,cgM:c.dynamics.cgHeightM,frontBias:c.dynamics.frontWeightBias,longG:0,latG:l.lateralG,deltaLeft:0,deltaForward:0,rideHeight:0,dt:1/120,support:(i,h,a)=>4*(Math.sqrt(1-a.y*a.y)-1)+1.4*Math.abs(a.y)});flipped ||=p.unstable;min=Math.min(min,p.loads.margin);
 }
 assert.equal(flipped,steer>.1);report.rollover.push({steer,flipped,minSupportMargin:min});
}
const mobile=new MobileInputController(),lock=540;
assert(mobile.begin('steer',1,100,50,0));assert(mobile.begin('gas',2,500,100));mobile.move('gas',2,500,56,lock);assert.equal(mobile.snapshot().throttle,1);
mobile.steerAt(1,100,0,200,lock);mobile.steerAt(1,0,0,200,lock);assert.equal(mobile.snapshot().steeringWheelAngle,-lock);mobile.steerAt(1,200,0,200,lock);assert.equal(mobile.snapshot().steeringWheelAngle,lock);
mobile.steerAt(1,100,0,200,lock);mobile.steerAt(1,100,0,200,lock,3.5);assert.equal(mobile.snapshot().steeringWheelAngle,0);
mobile.steerAt(1,200,0,200,lock,3.5);const edge=mobile.snapshot().steeringWheelAngle!;mobile.steerAt(1,350,0,200,lock,3.5);assert(mobile.snapshot().steeringWheelAngle!>edge);
assert.equal(mobile.snapshot().throttle,1);mobile.end('steer',1);assert.equal(mobile.snapshot().throttle,1);
for(const speed of [0,15,30,60,120]){const ticks=steeringRulerTicks(lock,0,steeringRulerZoom(speed));assert.equal(ticks.length,49);assert.equal(ticks.filter(t=>t.major).length,7);assert.equal(ticks.filter(t=>t.medium).length,13);for(let i=2;i<49;i++)assert(Math.abs(ticks[i].left-ticks[i-1].left-(ticks[1].left-ticks[0].left))<1e-9);}
const campus=GENERATE_LEVEL(4);assert.equal(campus.exam!.length,18);assert(campus.spots.length>200);assert(examSignalGreen(8000)&&!examSignalGreen(2000));
const input={gear:-1,headlightMode:1,indicator:0,wipers:false} as InputState;
for(const station of campus.exam!.filter(s=>s.kind==='park'||s.kind==='reverse')){
 const state=newExam(),stations=[station],t={x:station.x,y:station.y,rotation:station.targetHeading!,speedKmh:0,time:0,gear:-1,manual:true,width:19,length:48};
 assert(!campus.obstacles.some(o=>o.type==='car'&&Math.hypot(o.x-t.x,o.y-t.y)<30),'assigned exam bay occupied');
 for(let n=0;n<15;n++)stepExam(state,stations,{...t,time:n*200},input);assert.equal(state.index,1,'correct parking passes');
 const outside=newExam();for(let n=0;n<15;n++)stepExam(outside,stations,{...t,x:t.x+30,time:n*200},input);assert.equal(outside.index,0,'partial/outside parking must not pass');
}
const red=campus.exam!.find(s=>s.kind==='signal')!,state=newExam();stepExam(state,[red],{x:red.x+5,y:red.y,rotation:Math.PI,speedKmh:12,time:1000,gear:1,manual:true},input);stepExam(state,[red],{x:red.x-5,y:red.y,rotation:Math.PI,speedKmh:12,time:1100,gear:1,manual:true},input);assert.equal(state.score,80);
const highway=GENERATE_LEVEL(13);assert.equal(highway.curvedRoads![0].lanes,8);assert(highway.obstacles.filter(o=>o.ai).length>=16);assert(highway.elevatedRoads!.length&&highway.slopeZones!.length);
for(const id of FLEET30_IDS){
 const cfg=CAR_MODELS[id],def=MODEL_REGISTRY[CAR_TYPE_TO_MODEL[id]],buf=fs.readFileSync('public/models/'+def.file),gltf=await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),'');
 let triangles=0;gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh)triangles+=(o.geometry.index?.count??o.geometry.getAttribute('position').count)/3;});assert(triangles<=8000,`${id} triangle budget ${triangles}`);
 normalizeModel(gltf.scene,def);const parts=buildNativeAuthoredVehicle(gltf.scene,cfg);parts.group.updateMatrixWorld(true);
 assert.equal(parts.wheelMounts.length,id===CarType.TRIKE?3:id===CarType.SEMI?6:4);assert(parts.nativeCockpit);assert(steeringWheelMaxDeg(cfg)>100);
 for(let i=0;i<parts.wheelMounts.length;i++){const m=parts.wheelMounts[i],r=parts.wheels[i].userData.wheelRadius;assert(Math.abs(m.position.y-r)<.25,`${id} wheel contact ${m.position.y}/${r}`);}
 if(id===CarType.SEMI){const trailer=parts.trailer!;assert(trailer);trailer.step(1/60,()=>0);for(let i=0;i<100;i++){parts.group.position.z+=.5;parts.group.rotation.y+=.004;trailer.step(1/60,()=>0);}assert(trailer.collisionFootprint().length>=4);assert(Math.abs(trailer.root.rotation.y)>.01,'trailer must articulate');assert(Number.isFinite(trailer.root.quaternion.w));}
 report.assets.push({id,triangles,wheelMounts:parts.wheelMounts.length});
}
fs.writeFileSync('docs/round30/regression.json',JSON.stringify(report,null,2)+'\n');
console.log('Round30 PASS: 22-car braking after impact at 30/60/120 Hz, full-lock launch, gentle/flick rollover, multitouch zoom ruler, exam scoring, highway and 8 Blender rigs.');
