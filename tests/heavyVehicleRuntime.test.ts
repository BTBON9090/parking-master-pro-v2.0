import assert from 'node:assert/strict';
import fs from 'node:fs';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {CAR_MODELS} from '../constants';
import {CarType} from '../types';
import {MODEL_REGISTRY,CAR_TYPE_TO_MODEL,normalizeModel} from '../three/modelLoader';
import {buildNativeAuthoredVehicle} from '../three/blenderVehicle';
import {createChassisState,stepChassis,type RigWheel} from '../utils/chassisSupport';
import {suspensionForCar} from '../utils/suspension';

for (const id of [CarType.SEMI,CarType.US22]) {
  const cfg=CAR_MODELS[id],def=MODEL_REGISTRY[CAR_TYPE_TO_MODEL[id]];
  const b=fs.readFileSync('public/models/'+def.file);
  const gltf=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
  const root=gltf.scene.getObjectByName('CarRoot');
  assert(root?.userData.fixed_origin, `${id}: authored tractor origin must survive GLB export`);
  for (const key of ['liner_front_m','liner_floor_m','liner_belt_m','liner_rear_m','seat_lift_game_units'])
    assert(Number.isFinite(root.userData[key]),`${id}: missing cockpit calibration ${key}`);
  normalizeModel(gltf.scene,def);
  const parts=buildNativeAuthoredVehicle(gltf.scene,cfg);
  const wheels:RigWheel[]=parts.wheelMounts.map((mount,i)=>({
    x:mount.position.x,y:mount.position.y,z:mount.position.z,
    radius:Number(parts.wheels[i].userData.wheelRadius),
    halfWidth:Number(parts.wheels[i].userData.wheelWidth)/2,steer:0,
  }));
  assert(wheels.some(w=>w.z>0)&&wheels.some(w=>w.z<0),`${id}: tractor front and rear axles must straddle its origin`);
  assert(wheels.some(w=>w.x>0)&&wheels.some(w=>w.x<0),`${id}: both sides must straddle its origin`);
  assert(parts.nativeCockpit && [parts.nativeCockpit.eye.x,parts.nativeCockpit.eye.y,parts.nativeCockpit.eye.z].every(Number.isFinite),`${id}: cockpit eye finite`);
  assert(parts.trailer,`${id}: articulated trailer bound`);
  const state=createChassisState();
  for (let n=0;n<120;n++) {
    const p=stepChassis(state,{wheels,spec:suspensionForCar(id),mass:cfg.weight,cgM:cfg.dynamics.cgHeightM,
      frontBias:cfg.dynamics.frontWeightBias,longG:0,latG:0,deltaLeft:0,deltaForward:0,rideHeight:0,dt:1/60,support:()=>0});
    assert([p.height,p.pitch,p.roll,p.neutralHeight,...p.offsets,...p.contacts.map(c=>c.gap)].every(Number.isFinite),`${id}: suspension simulation must not become NaN`);
    assert(!p.unstable&&!p.airborne,`${id}: stationary on flat ground must stay supported`);
  }
}
console.log('Heavy vehicle runtime PASS: origin/cockpit metadata, both axles and finite flat-ground suspension');
