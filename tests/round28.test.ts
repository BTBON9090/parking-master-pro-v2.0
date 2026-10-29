import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {CAR_MODELS,GENERATE_LEVEL,LEVEL_LIST} from '../constants';
import {CarType} from '../types';
import {CAR_TYPE_TO_MODEL,MODEL_REGISTRY,normalizeModel} from '../three/modelLoader';
import {buildNativeAuthoredVehicle} from '../three/blenderVehicle';
import {autoCenterWheelAngle} from '../utils/steering';
import {parkedCarImpact} from '../utils/parkedImpact';
import {checkVehicleCollision,vehicleLayersCompatible} from '../utils/physics';
import {mergeCurbVisuals} from '../utils/curbVisuals';
import {AccidentFire} from '../three/accidentFire';

for(const level of LEVEL_LIST){
 const cars=GENERATE_LEVEL(level.id).obstacles.filter(o=>o.type==='car');
 for(const [i,a] of cars.entries()){
  assert(a.movable&&a.weight>=500,`${level.id}: parked vehicle must have mass`);
  for(const b of cars.slice(i+1)){
   const shape={x:a.x,y:a.y,width:a.width,length:a.height,rotation:a.rotation,elevation:a.elevation,verticalHeight:a.verticalHeight};
   if(vehicleLayersCompatible(shape,b))assert(!checkVehicleCollision(shape,{x:b.x,y:b.y,width:b.width,length:b.height,rotation:b.rotation,elevation:b.elevation}),`${level.id}: ${a.id} overlaps ${b.id}`);
  }
 }
}
const collision=parkedCarImpact({x:10,y:2},{x:0,y:0},{x:-1,y:0},2000,1600);
assert(collision.parked.x>0,'impact pushes the parked vehicle in the incoming direction');
assert(Math.abs((2000*collision.player.x+1600*collision.parked.x)-20000)<1e-8,'normal momentum is conserved');
assert(2000*(collision.player.x**2+collision.player.y**2)+1600*(collision.parked.x**2+collision.parked.y**2)<2000*104,'collision must not gain kinetic energy');
const curb=mergeCurbVisuals([{x:0,y:0,rotation:0,length:10},{x:14,y:0,rotation:0,length:10},{x:100,y:0,rotation:0,length:10}]);
assert.equal(curb.length,2,'merge small seams but preserve the road opening');assert.equal(curb[0].length,24);
for(const explode of [false,true]){
 const fire=new AccidentFire(new THREE.Vector3(20,3,40),0,explode),driver=fire.group.getObjectByName('escaping-driver')!;
 for(let i=0;i<360;i++)fire.step(1/60);
 assert(driver.visible&&driver.position.length()>45,'driver must leave the fire while animation keeps running');
 assert(Math.abs(driver.rotation.z)<1e-8,'driver stands after crawling');fire.dispose();
}

for(const fps of [30,60,120]){
 let angle=180;
 for(let frame=0;frame<fps;frame++)angle=autoCenterWheelAngle(angle,.2,1,1000/fps,true);
 assert(angle<10 && angle>=0,`return must be quicker but controlled at ${fps} fps: ${angle}`);
 let zero=180;for(let frame=0;frame<fps*4;frame++)zero=autoCenterWheelAngle(zero,0,1,1000/fps,true);
 assert.equal(zero,0,'stationary assist reaches exact centre');
 assert.equal(autoCenterWheelAngle(180,1,0),180,'zero setting disables the assist');
}
for(const id of [CarType.MIDIBUS,CarType.COACH,CarType.VAN,CarType.LIGHT_TRUCK]){
 const cfg=CAR_MODELS[id],def=MODEL_REGISTRY[CAR_TYPE_TO_MODEL[id]];
 const bytes=fs.readFileSync(new URL(`../public/models/${def.file}`,import.meta.url));
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 normalizeModel(gltf.scene,def);const parts=buildNativeAuthoredVehicle(gltf.scene,cfg);parts.group.updateMatrixWorld(true);
 // Glass must exist on both sides beyond the body, with substantial area.
 const glass=parts.group.getObjectByName('Surface_CarRoot_MirrorGlass');assert(glass,`${id}: mirror glass`);
 const vertices:number[]=[];glass.traverse(node=>{if(node instanceof THREE.Mesh){const p=node.geometry.getAttribute('position');for(let i=0;i<p.count;i++)vertices.push(new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(node.matrixWorld).x);}});
 assert(Math.max(...vertices)>cfg.width/2&&Math.min(...vertices)<-cfg.width/2,`${id}: both mirrors outside body`);
 if(id===CarType.COACH){
  // Restore the simulated 295/80 R22.5 tyre radius after the oversized trial.
  assert(Math.abs(parts.wheels[0].userData.wheelRadius/10-.52175)<.003,'coach tyre radius matches simulated 295/80 R22.5');
  const eye=parts.nativeCockpit!.eye,camera=new THREE.PerspectiveCamera(65,1280/720,.1,1000);
  camera.position.copy(eye);camera.lookAt(eye.clone().add(new THREE.Vector3(0,-.09,1)));camera.updateMatrixWorld();
  for(const y of [0,.5,.9]){
   const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(-.6,y),camera);
   const hit=ray.intersectObject(parts.group,true)[0];
   assert(hit?.object.name.includes('Glass'),`coach windscreen is blocked at y=${y} by ${hit?.object.name}`);
  }
 }
}
console.log('Round28 PASS: faster centering, paired exterior mirrors, coach tyre and unobstructed windshield rays.');
