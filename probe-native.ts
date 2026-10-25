import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CAR_MODELS } from './constants';
import { CarType } from './types';
import { MODEL_REGISTRY, normalizeModel } from './three/modelLoader';
import { buildNativeAuthoredVehicle } from './three/blenderVehicle';
for (const [carType, key] of [[CarType.SEAL08,'seal08'],[CarType.SUV,'l80'],[CarType.SEDAN,'seal08']] as const) {
  const buf=fs.readFileSync(`public/models/cars/${MODEL_REGISTRY[key].file.split('/').pop()}`);
  const gltf=await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),'');
  normalizeModel(gltf.scene, MODEL_REGISTRY[key]);
  const parts=buildNativeAuthoredVehicle(gltf.scene, CAR_MODELS[carType]);
  parts.group.updateWorldMatrix(true,true);
  const box=new THREE.Box3().setFromObject(parts.group,true); const size=box.getSize(new THREE.Vector3());
  console.log(carType,'wheels',parts.wheels.length,'mounts',parts.wheelMounts.length,'cockpit',!!parts.nativeCockpit,'eye',parts.nativeCockpit?.eye.toArray().map(v=>v.toFixed(2)),'box',size.toArray().map(v=>v.toFixed(2)),'minY',box.min.y.toFixed(3));
  parts.wheels.forEach((w,i)=>{const b=new THREE.Box3().setFromObject(w,true); console.log(' wheel',i,'center',w.getWorldPosition(new THREE.Vector3()).toArray().map(v=>v.toFixed(2)),'radius',w.userData.wheelRadius,'bottom',b.min.y.toFixed(3),'size',b.getSize(new THREE.Vector3()).toArray().map(v=>v.toFixed(2)));});
  console.log('steering',parts.extras?.steeringWheels.length, 'lights',parts.headlights.length,parts.taillights.length,parts.leftIndicators.length, 'footprint',parts.updateCollisionFootprint?.().length);
}
