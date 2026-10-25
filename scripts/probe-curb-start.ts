import fs from 'node:fs';
import assert from 'node:assert/strict';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {CAR_MODELS,DEFAULT_VEHICLE_TUNING} from '../constants';
import {CarType} from '../types';
import {MODEL_REGISTRY,CAR_TYPE_TO_MODEL,normalizeModel} from '../three/modelLoader';
import {buildNativeAuthoredVehicle} from '../three/blenderVehicle';
import {buildBeijingLevel} from '../utils/beijingMap';
import {DRIVING_TEST_POINTS} from '../utils/testPoints';
import {createLongitudinalState,stepLongitudinal} from '../utils/longitudinal';
import {getPowertrain} from '../utils/powertrain';
import {resolveCurbMotion,wheelCurbSupport} from '../utils/wheelObstacles';

const level=buildBeijingLevel();
for(const id of [CarType.SEAL08,CarType.SUV]){
 const cfg=CAR_MODELS[id],def=MODEL_REGISTRY[CAR_TYPE_TO_MODEL[id]],pt=getPowertrain(id);
 const b=fs.readFileSync(`public/models/${def.file}`);
 const gltf=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
 normalizeModel(gltf.scene,def);
 const parts=buildNativeAuthoredVehicle(gltf.scene,cfg);
 const wheels=parts.wheelMounts.map((m,i)=>({x:m.position.x,z:m.position.z,radius:parts.wheels[i].userData.wheelRadius,halfWidth:parts.wheels[i].userData.wheelWidth/2,steer:0}));
 for(const label of ['curb-one-side','curb-contact','single-wheel'])for(const fps of [30,60,120]){
  const start=label==='single-wheel'?{x:0,y:-18,rotation:Math.PI/3}:DRIVING_TEST_POINTS.find(p=>p.id===label)!;
  const curbs=label==='single-wheel'?[{x:0,y:0,rotation:0,length:200}]:level.curbSegments!;
  let pose={...start},state=createLongitudinalState(),blocked=0;
  const contacts=wheels.map(w=>wheelCurbSupport(pose,w,curbs));
  let force=0;
  for(let i=0;i<fps*8;i++){
   const initial=state.speed;
   const next=stepLongitudinal(state,{gear:1,engineStarted:true,gasPressed:true,shiftPressed:true,throttle:0,brake:0,handbrake:false},
    {carId:id,cc:cfg,pt,vehicleTune:DEFAULT_VEHICLE_TUNING[id],weatherGrip:1,slopeAlongCar:0,tunedShiftFrames:pt.shiftFrames,elapsedFrames:60/fps});
   const move=resolveCurbMotion(pose,initial*15/3.6,next.speed*15/3.6,1/fps,cfg.weight,wheels,curbs,
    (p,d)=>({...p,x:p.x+Math.cos(p.rotation)*d,y:p.y+Math.sin(p.rotation)*d}));
   state={...next,speed:move.speedMps*3.6/15};pose={...pose,...move};if(move.blocked)blocked++;force=next.engineForce*250;
  }
  const travel=Math.hypot(pose.x-start.x,pose.y-start.y)/10;
  if(label==='single-wheel')assert.equal(contacts.filter(h=>h>1).length,1,'fixture starts with exactly one wheel on the kerb');
  assert(travel>20 && state.speed*15>20,`${id} ${label} ${fps}Hz: 30% throttle must move off the kerb (${travel}m)`);
  console.log(id,label,fps,JSON.stringify({travelM:+travel.toFixed(2),speedKmh:+(state.speed*15).toFixed(2),blocked}));
 }
}
