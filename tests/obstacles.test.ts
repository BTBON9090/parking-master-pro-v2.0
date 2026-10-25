import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CAR_MODELS, GARAGE_CARS } from '../constants';
import { CarType } from '../types';
import { MODEL_REGISTRY, CAR_TYPE_TO_MODEL, normalizeModel } from '../three/modelLoader';
import { buildNativeAuthoredVehicle } from '../three/blenderVehicle';
import { wheelCurbSupport, resolveCurbMotion, WheelShape } from '../utils/wheelObstacles';
import { CURB_HEIGHT, CURB_WIDTH } from '../utils/terrainSampling';
import { createSuspensionState, roadRollTargetRad, stepContactSuspension, stepSprungHeave, suspensionForCar } from '../utils/suspension';
import { approachExponential } from '../utils/timeStep';
import { projectedWheelZ, solveWheelContact, minimumContactRootHeight } from '../utils/wheelContact';

const curb={x:0,y:0,length:200,rotation:0};
const advance=(p:{x:number;y:number;rotation:number},d:number)=>({...p,x:p.x+Math.cos(p.rotation)*d,y:p.y+Math.sin(p.rotation)*d});
const wheel={x:0,z:0,radius:3.9,halfWidth:1.3,steer:0};
assert(wheelCurbSupport({x:0,y:-4,rotation:Math.PI/2},wheel,[curb])>1,
  'tyre must contact the corner while its centre is still outside the kerb');
assert.equal(wheelCurbSupport({x:0,y:-10,rotation:0},wheel,[curb]),0);
assert.equal(wheelCurbSupport({x:0,y:0,rotation:0},wheel,[curb]),CURB_HEIGHT);
assert(wheelCurbSupport({x:0,y:-3,rotation:0},wheel,[curb])>0,'finite sidewall width must be included');
const top={x:0,y:0,rotation:Math.PI/2};
const reverseWheel={...wheel,steer:Math.PI};
assert.equal(wheelCurbSupport(top,wheel,[curb]),wheelCurbSupport(top,reverseWheel,[curb]));

for(const carId of GARAGE_CARS) {
  const cfg=CAR_MODELS[carId],def=MODEL_REGISTRY[CAR_TYPE_TO_MODEL[carId]];
  const file=fs.readFileSync(new URL(`../public/models/${def.file}`,import.meta.url));
  const gltf=await new GLTFLoader().parseAsync(file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength),'');
  normalizeModel(gltf.scene,def);
  const parts=buildNativeAuthoredVehicle(gltf.scene,cfg);
  const shapes:WheelShape[]=parts.wheelMounts.map((m,i)=>({x:m.position.x,z:m.position.z,
    radius:parts.wheels[i].userData.wheelRadius,halfWidth:parts.wheels[i].userData.wheelWidth/2,steer:0}));
  const base=parts.wheelMounts.map(m=>m.position.y),spec=suspensionForCar(carId);
  // Check the REAL body mesh, not just tyre contact gaps. The old code passed
  // wheel tests while rolling the body DOWN on the raised curb side.
  const bodyMesh=parts.group.getObjectByName('Body');
  assert(bodyMesh,`${carId}: authored body node`);
  parts.group.updateWorldMatrix(true,true);
  const points:THREE.Vector3[]=[];
  // glTF splits the multi-material body into meshes under a Body group.
  bodyMesh.traverse(node=>{
    if(!(node instanceof THREE.Mesh))return;
    const vertices=node.geometry.getAttribute('position');
    for(let i=0;i<vertices.count;i++) {
      points.push(parts.group.worldToLocal(new THREE.Vector3().fromBufferAttribute(vertices,i).applyMatrix4(node.matrixWorld)));
    }
  });
  const bodyTop=Math.max(...points.map(p=>p.y));
  const leftRoof=points.filter(p=>p.x>cfg.width*.25 && p.y>bodyTop*.82);
  const rightRoof=points.filter(p=>p.x<-cfg.width*.25 && p.y>bodyTop*.82);
  assert(leftRoof.length>3 && rightRoof.length>3,`${carId}: both roof edges sampled`);
  const averageY=(samples:THREE.Vector3[],matrix:THREE.Matrix4)=>
    samples.reduce((sum,p)=>sum+p.clone().applyMatrix4(matrix).y,0)/samples.length;
  const bodyTilt=new THREE.Object3D();
  const rootPose=new THREE.Object3D();rootPose.add(bodyTilt);
  for(const fps of [15,30,60,120]) {
    const rolls:number[]=[];
    for(const [left,right] of [[CURB_HEIGHT,0],[0,CURB_HEIGHT],[0,0]]) {
      const target=roadRollTargetRad(left,right,cfg.width*.92)*spec.roll*(1-spec.antiRoll*.30);
      let roll=0;
      for(let frame=0;frame<fps*3;frame++) roll=approachExponential(roll,target,spec.bodyResponse,60/fps);
      rolls.push(roll);
      // A turn of the car must not exchange world-height sign.
      for(const yaw of [0,Math.PI/2,Math.PI,3*Math.PI/2]) {
        rootPose.rotation.set(0,yaw,0);rootPose.position.y=(left+right)/2;
        bodyTilt.rotation.z=0;rootPose.updateMatrixWorld(true);
        const baseline=averageY(leftRoof,bodyTilt.matrixWorld)-averageY(rightRoof,bodyTilt.matrixWorld);
        bodyTilt.rotation.z=roll;rootPose.updateMatrixWorld(true);
        const heightDifference=averageY(leftRoof,bodyTilt.matrixWorld)-averageY(rightRoof,bodyTilt.matrixWorld)-baseline;
        if(left>right) assert(heightDifference>.4,`${carId} ${fps}fps: left roof must rise when left wheels climb (${heightDifference})`);
        else if(right>left) assert(heightDifference<-.4,`${carId} ${fps}fps: right roof must rise when right wheels climb (${heightDifference})`);
        else assert(Math.abs(heightDifference)<1e-8,`${carId}: flat ground must not roll the body`);
      }
    }
    assert(Math.abs(rolls[0]+rolls[1])<1e-10,`${carId}: left/right curb response must be symmetric`);
    let returning=rolls[0];
    for(let frame=0;frame<fps*3;frame++) returning=approachExponential(returning,0,spec.bodyResponse,60/fps);
    assert(Math.abs(returning)<1e-6,`${carId}: body must level after leaving curb`);
  }
  console.log(`${carId}: actual roof-edge height correct on left/right/flat ground at four headings and 15–120fps.`);
  for(const [approachAngle,steering] of [[Math.PI/2,0],[Math.PI/3,0],[2*Math.PI/3,0],[Math.PI/2,.5],[Math.PI/2,-.5]]) {
  shapes.forEach((shape,i)=>{shape.steer=i<2?steering:0;});
  const runs=[];
  for(const fps of [15,30,60,120]) {
    const dt=1/fps;
    let pose={x:0,y:-40,rotation:approachAngle},speed=4,energy=0,minGap=Infinity,maxTravel=0,pitch=0;
    const springs=createSuspensionState(),body={height:0,velocity:0};
    // Coast over both axle contacts, then settle. No throttle = no free energy.
    for(let frame=0;frame<fps*5;frame++) {
      const footprints=shapes.map((w,i)=>({...w,z:projectedWheelZ(base[i]+springs.offsetsM[i]*10,w.z,pitch)}));
      const result=resolveCurbMotion(pose,speed,speed,dt,cfg.weight,footprints,[curb],advance);
      pose=result;speed=result.speedMps;energy+=result.absorbedJoules;
      const contacts=footprints.map(w=>wheelCurbSupport(pose,w,[curb]));
      const front=(contacts[0]+contacts[1])/2,rear=(contacts[2]+contacts[3])/2;
      const targetPitch=-Math.atan2(front-rear,footprints[0].z-footprints[2].z);
      pitch=approachExponential(pitch,targetPitch,spec.bodyResponse,dt*60);
      const target=contacts.reduce((a,b)=>a+b,0)/4;
      let rootY=stepSprungHeave(body,target,spec,dt);
      const supportAt=(i:number,z:number)=>wheelCurbSupport(pose,{...shapes[i],z},[curb]);
      const bumpContacts=shapes.map((w,i)=>supportAt(i,projectedWheelZ(base[i]+spec.bumpTravel!,w.z,pitch)));
      const minRoot=minimumContactRootHeight(bumpContacts,shapes.map(w=>w.radius),base,shapes.map(w=>w.z),spec.bumpTravel!,pitch);
      if(rootY<minRoot){rootY=minRoot;body.height=rootY;body.velocity=Math.max(0,body.velocity);}
      const desired=shapes.map((w,i)=>solveWheelContact(rootY,w.radius,w.z,pitch,
        base[i]-spec.droopTravel!,base[i]+spec.bumpTravel!,z=>supportAt(i,z))-base[i]);
      const offsets=stepContactSuspension(springs,spec,dt,desired);
      parts.group.position.set(pose.x,rootY,pose.y);
      parts.group.rotation.order='YXZ';
      parts.group.rotation.set(pitch,Math.PI/2-pose.rotation,0);
      parts.wheelMounts.forEach((m,i)=>{
        m.position.y=base[i]+offsets[i];
        m.position.z=shapes[i].z;
        m.rotation.order='XYZ';m.rotation.x=-pitch;m.rotation.y=-shapes[i].steer;
        parts.wheels[i].rotation.x+=result.distance/shapes[i].radius;
        maxTravel=Math.max(maxTravel,Math.abs(offsets[i]));
      });
      parts.group.updateWorldMatrix(true,true);
      // Independent geometry check: actual GLB tyre vertices against the visible
      // rectangular solid, on EVERY frame, not just a settled height formula.
      for(const w of parts.wheels) w.traverse(node=>{
        if(!(node instanceof THREE.Mesh) || !(Array.isArray(node.material)?node.material:[node.material]).some(m=>m.name==='Tyre'))return;
        const vertices=node.geometry.getAttribute('position');
        for(let i=0;i<vertices.count;i++) {
          const p=new THREE.Vector3().fromBufferAttribute(vertices,i).applyMatrix4(node.matrixWorld);
          if(Math.abs(p.x)<curb.length/2 && Math.abs(p.z)<CURB_WIDTH/2) minGap=Math.min(minGap,p.y-CURB_HEIGHT);
        }
      });
    }
    assert(minGap>=-.03,`${carId} ${fps}Hz: actual tyre penetrated kerb by ${-minGap}u`);
    assert(maxTravel<=Math.max(spec.bumpTravel!,spec.droopTravel!)+1e-6);
    assert(speed<3.5 && speed>2,`${carId}: coasting must lose speed without sticking (${speed})`);
    assert(energy>4000,`${carId}: lifting the car must cost energy (${energy}J)`);
    runs.push({fps,endY:+pose.y.toFixed(3),speed:+speed.toFixed(3),minGap:+minGap.toFixed(4)});
  }
  assert(Math.max(...runs.map(r=>r.endY))-Math.min(...runs.map(r=>r.endY))<1.2,`${carId}: frame-rate variation`);
  console.log(carId,Math.round(approachAngle*180/Math.PI),steering,JSON.stringify(runs));
  }
  shapes.forEach(shape=>{shape.steer=0;});
  for(const direction of [-1,1]) {
    let pose={x:0,y:-40*direction,rotation:Math.PI/2},speed=.35*direction,blocked=false;
    for(let i=0;i<1200;i++) {
      const r=resolveCurbMotion(pose,speed,speed+.25*direction/60,1/60,cfg.weight,shapes,[curb],advance);
      pose=r;speed=r.speedMps;blocked ||=r.blocked;
    }
    assert(blocked && Math.abs(speed)<.05,`${carId}: weak drive should stop against tall kerb (${direction},${speed})`);
    assert(Math.abs(pose.y)>15,'weak drive cannot tunnel through the kerb');
  }
}
let sidePose={x:0,y:-10,rotation:0},sideSpeed=3,sideBlocked=false;
for(let i=0;i<240;i++) {
  const result=resolveCurbMotion(sidePose,sideSpeed,sideSpeed,1/60,2000,[wheel],[curb],
    (p,d)=>({...p,y:p.y+d}));
  sidePose=result;sideSpeed=result.speedMps;sideBlocked ||=result.blocked;
}
assert(sideBlocked && sideSpeed===0 && sidePose.y < -CURB_WIDTH/2-wheel.halfWidth,
  'sidewall strike must stop lateral drift before entering the kerb');
console.log('Dynamic wheel-volume, kerb work, reverse and frame-rate regressions passed.');
