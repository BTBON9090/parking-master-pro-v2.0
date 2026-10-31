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
 const parts=buildNativeAuthoredVehicle(gltf.scene,CAR_MODELS[id]);parts.group.updateMatrixWorld(true);
 const frame=parts.group.getObjectByName('tractor-ladder-frame');assert(frame&&frame.children.length===5,'continuous frame is attached to tractor');
 const screen=parts.group.getObjectByName('InteriorInstrumentScreen');assert(!screen,'misplaced screen is removed from the active rig');
 const trim=parts.group.getObjectByName('Surface_CarRoot_BlackTrim') as THREE.Mesh,p=trim.geometry.getAttribute('position'),idx=trim.geometry.index!;
 const sill=(i:number)=>{const v=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(trim.matrixWorld);return Math.abs(v.x)>11.3&&Math.abs(v.x)<11.9&&v.y>2.6&&v.y<3.6&&v.z>-10&&v.z<22;};
 for(let i=0;i<idx.count;i+=3)assert(![0,1,2].every(j=>sill(idx.getX(i+j))),'passenger-car sill does not intersect truck wheels');
 if(id===CarType.US22){
  assert(!parts.group.getObjectByName('InteriorCenterScreen'),'car-derived centre screen does not protrude onto hood');
  for(const name of ['Interior_CarRoot_BlackTrim','Interior_CarRoot_InteriorDark']){
   const mesh=parts.group.getObjectByName(name) as THREE.Mesh,p=mesh.geometry.getAttribute('position'),idx=mesh.geometry.index!;
   const outside=(i:number)=>{const v=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);return name.endsWith('BlackTrim')?v.x>4.15&&v.x<5.3&&v.y>23&&v.y<26.1&&v.z>9&&v.z<37.2:Math.abs(v.x)<2.5&&v.y>23&&v.y<27&&v.z>35.8&&v.z<37.3;};
   for(let i=0;i<idx.count;i+=3)assert(![0,1,2].every(j=>outside(idx.getX(i+j))),`${name} floating hood fixture removed`);
  }
 }
}
console.log('Truck frame repair PASS: two tractor frames, hidden floating screens and removed long-nose hood fixtures');
