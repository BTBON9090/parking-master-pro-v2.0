import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {CAR_MODELS} from '../constants';
import {CarType} from '../types';
import {MODEL_REGISTRY,CAR_TYPE_TO_MODEL,normalizeModel} from '../three/modelLoader';
import {buildNativeAuthoredVehicle} from '../three/blenderVehicle';
for(const id of [CarType.SEMI,CarType.US22])for(const grade of [0,.02,-.02]){
 const cfg=CAR_MODELS[id],def=MODEL_REGISTRY[CAR_TYPE_TO_MODEL[id]],bytes=fs.readFileSync('public/models/'+def.file);
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');normalizeModel(gltf.scene,def);
 const parts=buildNativeAuthoredVehicle(gltf.scene,cfg);const trailer=parts.trailer as unknown as {root:THREE.Group;wheels:Array<{node:THREE.Object3D;radius:number}>;step:(dt:number,surface:(x:number,z:number)=>number)=>void};
 assert(trailer);const bodies:THREE.Object3D[]=[];const model=trailer.root.getObjectByName('TrailerRoot');assert(model);
 model.traverse(node=>{if(node instanceof THREE.Mesh)bodies.push(node);});assert(bodies.some(b=>b.name==='TrailerShell'));
 const surface=(x:number,z:number)=>grade*z;parts.group.updateMatrixWorld(true);
 for(let frame=0;frame<120;frame++){
  parts.group.position.z+=.25;parts.group.position.y=surface(0,parts.group.position.z);parts.group.updateMatrixWorld(true);
  trailer.step(1/60,surface);parts.group.updateMatrixWorld(true);
  for(const [i,w] of trailer.wheels.entries()){
   const centre=w.node.getWorldPosition(new THREE.Vector3());
   assert(Math.abs(centre.y-w.radius-surface(centre.x,centre.z))<.2,`${id} grade ${grade} wheel ${i} failed contact frame ${frame}`);
   if(frame%20!==0)continue;
   const axial=new THREE.Vector3(1,0,0).transformDirection(trailer.root.matrixWorld);
   for(const offset of [-1,0,1])for(let k=0;k<32;k++){
    const a=k*Math.PI/16,radial=new THREE.Vector3(0,Math.sin(a),Math.cos(a)).transformDirection(trailer.root.matrixWorld);
    const ray=new THREE.Raycaster(centre.clone().addScaledVector(axial,offset),radial,0,w.radius-.25);
    const hit=ray.intersectObjects(bodies,true)[0];
    assert(!hit,`${id} grade ${grade} wheel ${i} intersects ${hit?.object.name} at frame ${frame} angle ${k*11.25}`);
   }
  }
 }
}
console.log('Heavy trailer dynamics PASS: both trucks, flat and ±2% grades, grounded tyres and body clearance through 120 frames');
