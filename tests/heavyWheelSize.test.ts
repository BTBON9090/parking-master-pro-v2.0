import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {CAR_MODELS} from '../constants';
import {CarType} from '../types';
import {MODEL_REGISTRY,CAR_TYPE_TO_MODEL,normalizeModel} from '../three/modelLoader';
import {buildNativeAuthoredVehicle} from '../three/blenderVehicle';
for(const id of [CarType.SEMI,CarType.US22]){
 const cfg=CAR_MODELS[id],def=MODEL_REGISTRY[CAR_TYPE_TO_MODEL[id]],b=fs.readFileSync('public/models/'+def.file);
 const gltf=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
 const root=gltf.scene.getObjectByName('CarRoot'),trailerRoot=gltf.scene.getObjectByName('TrailerRoot');
 assert(root?.userData.fixed_origin===true,`${id} fixed-origin metadata preserved`);
 for(const key of ['liner_belt_m','liner_floor_m','liner_front_m','liner_rear_m','seat_lift_game_units'])assert(Number.isFinite(root.userData[key]),`${id} ${key} metadata preserved`);
 assert(trailerRoot&&Number.isFinite(trailerRoot.userData.axle_from_hitch_m)&&Number.isFinite(trailerRoot.userData.length_m)&&Number.isFinite(trailerRoot.userData.hitch_m),`${id} trailer metadata preserved`);
 normalizeModel(gltf.scene,def);
 const parts=buildNativeAuthoredVehicle(gltf.scene,cfg);parts.group.updateMatrixWorld(true);
 assert.equal(cfg.dynamics.transmission.wheelRadiusM,.53);
 const body=parts.group.getObjectByName('Body');assert(body);
 assert.equal(parts.wheels.length,6);
 for(const wheel of parts.wheels){
  const size=new THREE.Box3().setFromObject(wheel,true).getSize(new THREE.Vector3());
  assert(Math.abs(size.y-10.6)<.1&&Math.abs(size.z-10.6)<.1,`${id} ${wheel.name} should remain a 1.06m circle, got ${size.toArray()}`);
  const origin=wheel.getWorldPosition(new THREE.Vector3());
  const steers=wheel.name.includes('Front')?[-cfg.dynamics.maxSteerAngle,0,cfg.dynamics.maxSteerAngle]:[0];
  const offsets=size.x>4?[-2.5,-1,0,1,2.5]:[-1,0,1];
  for(const steer of steers)for(const offset of offsets)for(const suspension of [-1,0,1])for(let i=0;i<32;i++){
   const axis=new THREE.Vector3(0,1,0),a=i*Math.PI/16;
   const rayOrigin=origin.clone().add(new THREE.Vector3(offset,suspension,0).applyAxisAngle(axis,steer));
   const direction=new THREE.Vector3(0,Math.sin(a),Math.cos(a)).applyAxisAngle(axis,steer);
   const ray=new THREE.Raycaster(rayOrigin,direction,0,5.05);
   assert.equal(ray.intersectObject(body,true).length,0,`${id} ${wheel.name} intersects chassis at ${i*11.25}°`);
  }
 }
 const trailer=parts.trailer as unknown as {wheels:Array<{roll:THREE.Object3D;radius:number;node:THREE.Object3D}>;step:(dt:number,surface:(x:number,z:number)=>number)=>void};
 assert(trailer&&trailer.wheels.length===(id===CarType.US22?12:8));
 const shell=parts.group.getObjectByName('TrailerShell');assert(shell);
 for(const [idx,w] of trailer.wheels.entries()){
  assert(Math.abs(w.radius-5.3)<.06,`${id} trailer computed radius ${w.radius}`);
  const origin=w.node.getWorldPosition(new THREE.Vector3());
  for(const offset of [-1,0,1])for(const suspension of [-1,0,1])for(let i=0;i<32;i++){
   const a=i*Math.PI/16,ray=new THREE.Raycaster(origin.clone().add(new THREE.Vector3(offset,suspension,0)),new THREE.Vector3(0,Math.sin(a),Math.cos(a)),0,5.05);
   assert.equal(ray.intersectObject(shell,true).length,0,`${id} trailer wheel ${idx} intersects shell at ${i*11.25}°`);
  }
 }
 const positions=trailer.wheels.map(w=>w.node.getWorldPosition(new THREE.Vector3()));
 for(let i=0;i<positions.length;i++)for(let j=i+1;j<positions.length;j++){
  const a=positions[i],b=positions[j];
  if(Math.abs(a.x-b.x)<.2)assert(Math.abs(a.z-b.z)>=10.8,`${id} adjacent tandem tyres too close`);
 }
 trailer.step(1/60,()=>0);
 for(const w of trailer.wheels){const pos=w.node.getWorldPosition(new THREE.Vector3());assert(Math.abs(pos.y-5.3)<.15,`${id} trailer tyre contact height ${pos.y}`);}
}
console.log('Heavy tyres PASS: 1.06m round tractor/trailer wheels, chassis clearance, trailer ground contact and radius');
