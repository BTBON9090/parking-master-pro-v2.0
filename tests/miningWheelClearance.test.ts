import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {CAR_MODELS} from '../constants';
import {CarType} from '../types';
import {MODEL_REGISTRY,CAR_TYPE_TO_MODEL,normalizeModel} from '../three/modelLoader';
import {buildNativeAuthoredVehicle} from '../three/blenderVehicle';
const id=CarType.MINING,cfg=CAR_MODELS[id],def=MODEL_REGISTRY[CAR_TYPE_TO_MODEL[id]],b=fs.readFileSync('public/models/'+def.file);
const gltf=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');normalizeModel(gltf.scene,def);
const parts=buildNativeAuthoredVehicle(gltf.scene,cfg);parts.group.updateMatrixWorld(true);
const body=parts.group.getObjectByName('Body');assert(body,'mining truck body');
for(const wheel of parts.wheels){
 const origin=wheel.getWorldPosition(new THREE.Vector3()),radius=Number(wheel.userData.wheelRadius);
 for(let i=0;i<32;i++){
  const a=i*Math.PI/16,ray=new THREE.Raycaster(origin,new THREE.Vector3(0,Math.sin(a),Math.cos(a)),0,radius-.3);
  assert.equal(ray.intersectObject(body,true).length,0,`${wheel.name} intersects chassis at ${i*11.25}°`);
 }
}
console.log('Mining wheel-well PASS: 4 wheel centres × 32 directions clear of body.');
