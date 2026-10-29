import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {CarType} from '../types';
import {CAR_MODELS} from '../constants';
import {isAutomaticVehicle} from '../utils/powertrain';
import {isDrivenWheel,stepAirborneWheelSpin,trackedYawRate,wheelGroundedFromTelemetry} from '../utils/wheelSpin';
import {normalizeModel,MODEL_REGISTRY} from '../three/modelLoader';
import {buildNativeAuthoredVehicle} from '../three/blenderVehicle';
assert(wheelGroundedFromTelemetry([true,true,true,true],5,false,false),'missing multi-axle telemetry falls back to chassis contact');
assert(!wheelGroundedFromTelemetry([true,true,true,true],5,true,false));
assert(!wheelGroundedFromTelemetry([true,true,true,true],5,false,true));
assert(!wheelGroundedFromTelemetry([true,false],1,false,false),'explicit per-wheel contact takes precedence');
assert(!isAutomaticVehicle(CarType.SEMI));
assert(!isAutomaticVehicle(CarType.US22));
assert.equal(CAR_MODELS[CarType.US22].dynamics.transmission.gearRatios.length,10);
assert(trackedYawRate(200,540,.5,1,true)>0);
assert(trackedYawRate(200,540,.5,-1,true)<0);
assert.equal(trackedYawRate(200,540,.5,1,false),0);
assert(isDrivenWheel('FWD',true)); assert(!isDrivenWheel('FWD',false));
assert(isDrivenWheel('RWD',false)); assert(!isDrivenWheel('RWD',true));
assert(isDrivenWheel('AWD',true)&&isDrivenWheel('AWD',false));
let driven=0,free=0;for(let i=0;i<60;i++){
 driven=stepAirborneWheelSpin(driven,1/60,true,1,1,false);
 free=stepAirborneWheelSpin(free,1/60,false,1,1,false);
}
assert(driven>10);assert.equal(free,0);
let reverse=0;for(let i=0;i<60;i++) reverse=stepAirborneWheelSpin(reverse,1/60,true,1,-1,false);
assert(reverse< -10);
const bytes=fs.readFileSync('public/models/cars/fleet-type100.glb');
const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
normalizeModel(gltf.scene,MODEL_REGISTRY.type100);
const parts=buildNativeAuthoredVehicle(gltf.scene,CAR_MODELS[CarType.TYPE100]);
assert.equal(parts.wheels.length,parts.wheelMounts.length);
const left=parts.group.getObjectByName('WheelRoad1L-roll-pivot')!;
const right=parts.group.getObjectByName('WheelRoad1R-roll-pivot')!;
assert(left&&right,'all intermediate road-wheel pivots bound');
assert(left.getObjectByName('WheelRoad1L'));
let steel:THREE.Mesh|undefined;
left.traverse(node=>{if(node instanceof THREE.Mesh&&(Array.isArray(node.material)?node.material:[node.material]).some(m=>m.name==='RoadWheelSteel'))steel=node;});
assert(steel,'solid tracked road wheel exists');
assert(((steel as THREE.Mesh).material as THREE.MeshStandardMaterial).metalness>.4,'road wheel is metallic');
assert(!left.getObjectByName('WheelRoad1L_Spoke'),'road wheel must not reuse open car spokes');
for(const side of ['L','R'])for(const axle of ['Front','Road1','Road2','Road3','Road4','Rear']){
 const name=`Wheel${axle}${side}`,wheel=parts.group.getObjectByName(name);
 assert(wheel,`${name}: missing track roller`);
 let metals=0,tyres=0,spokes=0;
 wheel.traverse(node=>{if(!(node instanceof THREE.Mesh))return;
  for(const mat of Array.isArray(node.material)?node.material:[node.material]){
   if(mat.name==='RoadWheelSteel')metals++;if(mat.name==='Tyre')tyres++;
  }
  if(node.name.includes('Spoke'))spokes++;
 });
 assert(metals>0&&tyres===0&&spokes===0,`${name}: expected metal roller without tyre or car spokes`);
}
parts.group.userData.updateTracks(10,0);
assert(Math.abs(left.rotation.x-2)<1e-5);assert(Math.abs(right.rotation.x-2)<1e-5);
parts.group.userData.updateTracks(0,.1);
assert(left.rotation.x>2,'left track advances on right turn');
assert(right.rotation.x<2,'right track reverses on right turn');
console.log('Wheel spin and tracked rig: PASS');
