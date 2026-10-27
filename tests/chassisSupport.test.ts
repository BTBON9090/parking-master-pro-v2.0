import {BASELINE_FLEET} from './baselineFleet';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {GARAGE_CARS,CAR_MODELS} from '../constants';
import {MODEL_REGISTRY,CAR_TYPE_TO_MODEL,normalizeModel} from '../three/modelLoader';
import {buildNativeAuthoredVehicle} from '../three/blenderVehicle';
import {suspensionForCar} from '../utils/suspension';
import {createChassisState,stepChassis,cornerLoads,chassisRotation,type RigWheel,type SupportQuery} from '../utils/chassisSupport';
import {buildBeijingLevel} from '../utils/beijingMap';
import {sampleWheelSupport,wheelWorldPose} from '../utils/wheelObstacles';
import {DRIVING_TEST_POINTS} from '../utils/testPoints';
import {VehicleRollover} from '../three/vehicleRollover';
const report=[];
const level=buildBeijingLevel();
for(const id of BASELINE_FLEET){
 const cfg=CAR_MODELS[id],def=MODEL_REGISTRY[CAR_TYPE_TO_MODEL[id]],spec=suspensionForCar(id);
 const b=fs.readFileSync(new URL(`../public/models/${def.file}`,import.meta.url));
 const g=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
 normalizeModel(g.scene,def);const parts=buildNativeAuthoredVehicle(g.scene,cfg);
 const wheels:RigWheel[]=parts.wheelMounts.map((m,i)=>({x:m.position.x,y:m.position.y,z:m.position.z,
  radius:Number(parts.wheels[i].userData.wheelRadius),halfWidth:Number(parts.wheels[i].userData.wheelWidth)/2,steer:0}));
 const base={wheels,spec,mass:cfg.weight,cgM:cfg.dynamics.cgHeightM,frontBias:cfg.dynamics.frontWeightBias,longG:0,latG:0,rideHeight:0,dt:1/60,deltaLeft:0,deltaForward:0};
 let cases=0,maxGap=0,maxDrift=0,minTread=Infinity,maxTravel=0;
 for(const grade of [-.7,-.35,0,.35,.7])for(const bank of [-.7,0,.7])for(const steer of [-.55,0,.55]){
  wheels.forEach(w=>w.steer=steer);
  const support:SupportQuery=(i,h,a)=>{
   const w=wheels[i],dot=a.y-bank*a.x-grade*a.z;
   return bank*h.x+grade*h.z+w.radius*(Math.sqrt(1+bank*bank+grade*grade-dot*dot)-1)+w.halfWidth*Math.abs(dot);
  };
  const state=createChassisState();let p=stepChassis(state,{...base,support});
  for(let t=0;t<60;t++)p=stepChassis(state,{...base,support});
  assert(!p.airborne&&!p.unstable,`${id} ordinary bank stable`);
  parts.group.position.set(0,p.height,0);parts.group.quaternion.copy(chassisRotation(p.pitch,p.roll));
  parts.wheelMounts.forEach((m,i)=>{m.position.set(wheels[i].x,wheels[i].y+p.offsets[i],wheels[i].z);m.rotation.set(0,steer,0);});
  parts.group.updateWorldMatrix(true,true);
  p.contacts.forEach((c,i)=>{
   maxGap=Math.max(maxGap,Math.abs(c.gap));maxTravel=Math.max(maxTravel,Math.abs(p.offsets[i]));
   assert(Math.abs(c.gap)<.001,`${id} contact ${grade}/${bank}/${steer}: ${c.gap}`);
   assert(p.offsets[i]>=-spec.droopTravel!-.0001&&p.offsets[i]<=spec.bumpTravel!+.0001,'finite travel');
   const hub=parts.group.worldToLocal(parts.wheels[i].getWorldPosition(new THREE.Vector3()));
   maxDrift=Math.max(maxDrift,Math.abs(hub.z-wheels[i].z),Math.abs(hub.x-wheels[i].x));
   const expected=new THREE.Vector3(1,0,0).applyAxisAngle(new THREE.Vector3(0,1,0),steer);
   const actual=new THREE.Vector3(1,0,0).applyQuaternion(parts.wheelMounts[i].getWorldQuaternion(new THREE.Quaternion()))
    .applyQuaternion(parts.group.quaternion.clone().invert());
   assert(actual.distanceTo(expected)<1e-6,'no independent tyre camber or counter-pitch');
   parts.wheels[i].traverse(o=>{if(!(o instanceof THREE.Mesh)||!(Array.isArray(o.material)?o.material:[o.material]).some(m=>m.name==='Tyre'))return;
    const v=o.geometry.getAttribute('position');for(let j=0;j<v.count;j++){
     const q=new THREE.Vector3().fromBufferAttribute(v,j).applyMatrix4(o.matrixWorld);
     minTread=Math.min(minTread,(q.y-bank*q.x-grade*q.z)/Math.hypot(1,bank,grade));
    }});
  });cases++;
 }
 assert(maxDrift<1e-5);assert(minTread>-.02,`${id} tread penetrates ${minTread}`);
 wheels.forEach(w=>w.steer=0);
 // Full production terrain/curb sampler, including tilted finite-width tyres.
 for(const pointId of ['curb-one-side','curb-right-side','mountain-axle-up','mountain-axle-down','mountain-bank-left','mountain-bank-right']){
  const point=DRIVING_TEST_POINTS.find(p=>p.id===pointId)!,heading=point.rotation;
  const support:SupportQuery=(i,h,a)=>sampleWheelSupport(level,point,{x:h.x,z:h.z,radius:wheels[i].radius,halfWidth:wheels[i].halfWidth,steer:-wheels[i].steer,
    axis:{x:Math.sin(heading)*a.x+Math.cos(heading)*a.z,y:a.y,z:-Math.cos(heading)*a.x+Math.sin(heading)*a.z}},point.deckHeight??0);
  const state=createChassisState();let p=stepChassis(state,{...base,support});
  for(let f=0;f<60;f++)p=stepChassis(state,{...base,support});
  assert(p.contacts.every((c,i)=>c.gap>=-.03&&(c.gap<.03||Math.abs(p.offsets[i]+spec.droopTravel!)<.001)),`${id} ${pointId}: no unsupported wheel ${p.contacts.map(c=>c.gap)}`);
  parts.group.position.set(point.x,p.height,point.y);parts.group.rotation.set(p.pitch,Math.PI/2-heading,p.roll,'YXZ');
  parts.wheelMounts.forEach((m,i)=>{m.position.set(wheels[i].x,wheels[i].y+p.offsets[i],wheels[i].z);m.rotation.set(0,0,0);});parts.group.updateWorldMatrix(true,true);
  if(pointId.startsWith('curb')){
   for(const wheel of parts.wheels)wheel.traverse(o=>{
    if(!(o instanceof THREE.Mesh)||!(Array.isArray(o.material)?o.material:[o.material]).some(m=>m.name==='Tyre'))return;
    const attr=o.geometry.getAttribute('position');for(let v=0;v<attr.count;v++){
     const q=new THREE.Vector3().fromBufferAttribute(attr,v).applyMatrix4(o.matrixWorld);
     for(const curb of level.curbSegments??[]){
      const dx=q.x-curb.x,dz=q.z-curb.y,c=Math.cos(curb.rotation),ss=Math.sin(curb.rotation);
      if(Math.abs(dx*c+dz*ss)<curb.length/2&&Math.abs(-dx*ss+dz*c)<2.1)
       assert(q.y>=2.6-.05,`${id} ${pointId} actual tyre intersects solid kerb at ${q.y}`);
     }
    }
   });
  }
 }
 const up=cornerLoads(wheels,cfg.weight,base.cgM,base.frontBias,-.35,0,0,0);
 const down=cornerLoads(wheels,cfg.weight,base.cgM,base.frontBias,.35,0,0,0);
 assert(up.frontShare<base.frontBias&&down.frontShare>base.frontBias,'gravity loads downhill axle, not direction of travel');
 assert(cornerLoads(wheels,cfg.weight,base.cgM,base.frontBias,0,0,.25,0).frontShare<base.frontBias,'acceleration loads rear');
 assert(cornerLoads(wheels,cfg.weight,base.cgM,base.frontBias,0,0,-.25,0).frontShare>base.frontBias,'forward braking loads front');
 let fastestGap=0;
 for(const fps of [15,30,60,120])for(const direction of [-1,1]){
  const state=createChassisState(),dz=direction*8,grade=.4;let z=0;
  const support:SupportQuery=(i,h,a)=>{const w=wheels[i],dot=a.y-grade*a.z;return grade*(z+h.z)+w.radius*(Math.sqrt(1+grade*grade-dot*dot)-1)+w.halfWidth*Math.abs(dot);};
  stepChassis(state,{...base,support,dt:1/fps});
  for(let t=0;t<fps*2;t++){
   z+=dz;const p=stepChassis(state,{...base,support,dt:1/fps,deltaForward:dz});
   assert(!p.airborne,'smooth fast descent must not trigger free fall');
   fastestGap=Math.max(fastestGap,...p.contacts.map(c=>Math.abs(c.gap)));
  }
 }
 assert(fastestGap<.002,'no descending heave lag / detached wheels');
 if(id===BASELINE_FLEET[0]){
  const bank=Math.tan(60*Math.PI/180),state=createChassisState();
  const support:SupportQuery=(i,h,a)=>{const w=wheels[i],dot=a.y-bank*a.x;return bank*h.x+w.radius*(Math.sqrt(1+bank*bank-dot*dot)-1)+w.halfWidth*Math.abs(dot);};
  let p=stepChassis(state,{...base,support});for(let i=0;i<60;i++)p=stepChassis(state,{...base,support});
  assert(p.unstable,'60 degree side hill must cross support polygon');
  parts.group.position.set(0,p.height,0);parts.group.quaternion.copy(chassisRotation(p.pitch,p.roll));
  const rollover=new VehicleRollover(parts.group,{mass:cfg.weight,width:cfg.width,height:cfg.height,length:cfg.length,cgHeight:base.cgM*10,
   wheels:wheels.map((w,i)=>({position:new THREE.Vector3(w.x,w.y+p.offsets[i],w.z),radius:w.radius,width:2*w.halfWidth,steer:0})),
   velocity:new THREE.Vector3(),tipX:p.loads.tipX,tipZ:p.loads.tipZ,surface:x=>bank*x});
  const roadUp=new THREE.Vector3(-bank,1,0).normalize();let minUp=1;
  for(let i=0;i<360;i++){const r=rollover.step(1/120);minUp=Math.min(minUp,r.up.dot(roadUp));assert(Number.isFinite(r.position.y));}
  assert(minUp<0,`whole vehicle must tip beyond 90 degrees, minUp=${minUp}`);rollover.dispose();
 }
 report.push({id,cases,maxGapCm:maxGap*10,maxAxleDriftMm:maxDrift*100,minTreadGapCm:minTread*10,maxTravelCm:maxTravel*10,fastestGapCm:fastestGap*10});
}
fs.mkdirSync('docs/round16',{recursive:true});fs.writeFileSync('docs/round16/chassis-regression.json',JSON.stringify(report,null,2));
console.log('Actual GLBs: combined grades/banks/steer, tyre orientation/contact, gravity/braking loads, fast descents and rigid-body rollover PASS',report);
