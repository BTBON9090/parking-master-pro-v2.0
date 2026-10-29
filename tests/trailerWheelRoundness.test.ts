import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {CAR_MODELS} from '../constants';
import {CarType} from '../types';
import {MODEL_REGISTRY,CAR_TYPE_TO_MODEL,normalizeModel} from '../three/modelLoader';
import {buildNativeAuthoredVehicle} from '../three/blenderVehicle';
for(const id of [CarType.SEMI,CarType.US22]){
 const cfg=CAR_MODELS[id],def=MODEL_REGISTRY[CAR_TYPE_TO_MODEL[id]],bytes=fs.readFileSync('public/models/'+def.file);
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 normalizeModel(gltf.scene,def);const parts=buildNativeAuthoredVehicle(gltf.scene,cfg);
 const trailer=parts.trailer as unknown as {wheels:Array<{roll:THREE.Object3D}>};
 assert(trailer&&trailer.wheels.length===(id===CarType.US22?12:8));
 for(const [i,{roll}] of trailer.wheels.entries()){
  for(const angle of [0,Math.PI/4,Math.PI/2]){
   roll.rotation.x=angle;parts.group.updateMatrixWorld(true);
   const size=new THREE.Box3().setFromObject(roll,true).getSize(new THREE.Vector3());
   assert(Math.abs(size.y-size.z)<.08,`${id} trailer wheel ${i} elliptical at ${angle}: ${size.y} vs ${size.z}`);
   assert(Math.abs(size.y-10.6)<(angle===Math.PI/4?.56:.08),`${id} trailer wheel ${i} diameter at ${angle} = ${size.y} must be 1.06 m`);
  }
 }
}
console.log('Trailer tyre geometry PASS: 8 + 12 wheels remain circular across 0, 45 and 90 degrees.');
