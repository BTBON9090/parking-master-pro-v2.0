import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {CAR_MODELS} from '../constants';
import {CarType} from '../types';
import {MODEL_REGISTRY,CAR_TYPE_TO_MODEL,normalizeModel} from '../three/modelLoader';
import {buildNativeAuthoredVehicle} from '../three/blenderVehicle';
for(const id of [CarType.SEMI,CarType.US22]){
 const def=MODEL_REGISTRY[CAR_TYPE_TO_MODEL[id]],bytes=fs.readFileSync('public/models/'+def.file);
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');normalizeModel(gltf.scene,def);
 const parts=buildNativeAuthoredVehicle(gltf.scene,CAR_MODELS[id]),trailer=parts.trailer!,scene=new THREE.Scene();scene.add(parts.group);scene.updateMatrixWorld(true);
 trailer.step(1/60,()=>0);assert(trailer.detach(scene));assert(!trailer.isAttached);
 const parked=trailer.trailerHitchWorld().clone(),origin=parts.group.position.clone();parts.group.position.z+=100;scene.updateMatrixWorld(true);trailer.step(1/60,()=>0);
 assert(parked.distanceTo(trailer.trailerHitchWorld())<1e-6,'detached trailer stays where it was parked');assert(!trailer.couple(),'remote tractor cannot couple');
 parts.group.position.copy(origin);parts.group.rotation.y=.5;scene.updateMatrixWorld(true);assert(!trailer.couple(),'misaligned tractor cannot couple');
 parts.group.rotation.y=0;scene.updateMatrixWorld(true);assert(trailer.couple(),'aligned hitch couples');assert(trailer.isAttached);
 parts.group.position.z+=2;scene.updateMatrixWorld(true);trailer.step(1/60,()=>0);assert(trailer.trailerHitchWorld().distanceTo(parked)>1,'coupled trailer follows tractor');
}
console.log('Manual trailer PASS: parked world pose, distance/alignment guards, recoupling and follow on both trucks');
