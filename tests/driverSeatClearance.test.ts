import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {CAR_MODELS} from '../constants';
import {CarType} from '../types';
import {MODEL_REGISTRY,CAR_TYPE_TO_MODEL,normalizeModel} from '../three/modelLoader';
import {buildNativeAuthoredVehicle} from '../three/blenderVehicle';
import {SeatClearance} from '../three/seatClearance';
import {DRIVER_SEAT_LIMITS} from '../utils/driverSeat';

// Check the eye's motion through representative extremes for every locally
// parseable native cockpit. This checks the camera point, not the near plane
// or every possible interpolated seat position.
const ids=[CarType.CARGO_TRIKE,CarType.DF41,CarType.TYPE100,CarType.MINING,CarType.US22,CarType.TRIKE,CarType.TRACTOR,CarType.SEMI,CarType.CYBERTRUCK,CarType.REVUELTO,CarType.VEYRON,CarType.V800,CarType.MINI,CarType.TAI7,CarType.LI_I9,CarType.N90,CarType.JEEP,CarType.MIDIBUS,CarType.COACH,CarType.VAN,CarType.LIGHT_TRUCK,CarType.SEDAN,CarType.SEAL08,CarType.SUV,CarType.TRUCK];
for(const id of ids){
 const def=MODEL_REGISTRY[CAR_TYPE_TO_MODEL[id]];const bytes=fs.readFileSync('public/models/'+def.file);
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 normalizeModel(gltf.scene,def);const parts=buildNativeAuthoredVehicle(gltf.scene,CAR_MODELS[id]);
 assert(parts.nativeCockpit,`${id} has an authored driver eye`);parts.group.updateMatrixWorld(true);
 const eye=parts.nativeCockpit.eye.clone(),meshes:THREE.Mesh[]=[];
 parts.group.traverse(node=>{if(!(node instanceof THREE.Mesh))return;for(let p:THREE.Object3D|null=node;p;p=p.parent)if(p.name==='driver-hands')return;
  const copy=(m:THREE.Material)=>{const cloned=m.clone();cloned.side=THREE.DoubleSide;return cloned};node.material=Array.isArray(node.material)?node.material.map(copy):copy(node.material);meshes.push(node);
 });
 const clearance=new SeatClearance(parts.group,eye);
 for(const height of [DRIVER_SEAT_LIMITS.heightCm[0],0,DRIVER_SEAT_LIMITS.heightCm[1]])for(const forward of [DRIVER_SEAT_LIMITS.forwardCm[0],0,DRIVER_SEAT_LIMITS.forwardCm[1]]){
  const requested=eye.clone().add(new THREE.Vector3(0,height/10,forward/10));const delta=clearance.constrain(requested).clone().sub(eye);if(!delta.length())continue;
  const hit=new THREE.Raycaster(eye,delta.clone().normalize(),.001,delta.length()).intersectObjects(meshes,false)[0];
  assert(!hit,`${id}: eye path at height ${height} cm and forward ${forward} cm intersects ${hit?.object.name}`);
 }
}
console.log(`Driver-seat eye-path clearance PASS: ${ids.length} vehicle configurations at eight sampled extremes (near-plane clipping remains a visual check)`);
