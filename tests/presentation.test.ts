import {BASELINE_FLEET} from './baselineFleet';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {CAR_MODELS,GARAGE_CARS,hoodCameraDefaultForCar,DEFAULT_HOOD_CAMERA_ADJUSTMENT} from '../constants';
import {CarType} from '../types';
import {MODEL_REGISTRY,CAR_TYPE_TO_MODEL,normalizeModel} from '../three/modelLoader';
import {buildNativeAuthoredVehicle} from '../three/blenderVehicle';
import {followRelativeCoordinate,speedVisualStrength} from '../utils/cameraLook';
import {pointerButtonStillHeld} from '../utils/inputGuards';
import {gearRejectionReason,getPowertrain,isElectricVehicle} from '../utils/powertrain';

assert(!pointerButtonStillHeld(true,0,2),'missing mouseup: movement without button must release steering');
assert(!pointerButtonStillHeld(false,2,2),'late pointer lock must not start steering');
assert(!pointerButtonStillHeld(true,1,2),'left drag after right release must not steer');
assert(pointerButtonStillHeld(true,2,2));
for(const id of GARAGE_CARS) for(const gear of [2,3,4,5])
 assert.equal(gearRejectionReason(getPowertrain(id),0,gear),isElectricVehicle(id)?'single-speed':null);
for(const fps of [15,30,60,120]){
 let car=0,previous=0,camera=-72,look=20,maxError=0;
 for(let frame=0;frame<fps*8;frame++){
  const dt=(frame%2 ? .7 : 1.3)/fps;
  car+=100/3.6*10*dt;
  camera=followRelativeCoordinate(camera,car-previous,car-72,1-Math.pow(.84,dt*60));
  look=followRelativeCoordinate(look,car-previous,car+20,1-Math.pow(.78,dt*60));
  maxError=Math.max(maxError,Math.abs(car-camera-72),Math.abs(look-car-20));previous=car;
 }
 assert(maxError<1e-8,`${fps}fps variable frames: camera must not stretch fore/aft (${maxError})`);
}
assert.equal(speedVisualStrength(70),0);
assert(speedVisualStrength(100)>0 && speedVisualStrength(100)<speedVisualStrength(150));
assert.equal(speedVisualStrength(300),1);
for(const id of BASELINE_FLEET){
 const cfg=CAR_MODELS[id],def=MODEL_REGISTRY[CAR_TYPE_TO_MODEL[id]];
 const b=fs.readFileSync(new URL(`../public/models/${def.file}`,import.meta.url));
 const gltf=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
 normalizeModel(gltf.scene,def);
 const parts=buildNativeAuthoredVehicle(gltf.scene,cfg);parts.group.updateWorldMatrix(true,true);
 const eye=parts.nativeCockpit!.eye;
 for(let i=0;i<4;i++){
  const wheel=parts.wheels[i],box=new THREE.Box3().setFromObject(wheel,true),size=box.getSize(new THREE.Vector3());
  assert(Math.abs(size.y-size.z)<.015,`${id}: round tyre, not stretched ellipse`);
  assert(Math.abs(box.min.y)<.015,`${id}: tyre must rest on ground, bottom=${box.min.y}`);
  assert(size.x>2.4 && size.x<3.2,`${id}: passenger-car tyre width ${size.x}`);
 }
 assert(Math.abs(parts.wheelMounts[0].position.z-parts.wheelMounts[2].position.z-cfg.wheelbase)<.02,`${id}: authored wheelbase matches physics`);
 const rim=new THREE.Box3().setFromObject(parts.group.getObjectByName('InteriorSteeringWheel')!,true);
 const liner=parts.group.getObjectByName('InteriorCabinLiner')!;
 assert(eye.y-rim.max.y>1.3,`${id}: eye must clear steering rim (${eye.y-rim.max.y})`);
 // Rays towards every part of the cabin floor must hit an opaque interior,
 // before reaching the road. Include side seams and the firewall/footwell.
 const bounds=new THREE.Box3().setFromObject(liner,true);
 for(const x of [-.96,0,.96])for(const z of [-.96,0,.96]){
  const target=new THREE.Vector3(THREE.MathUtils.lerp(bounds.min.x,bounds.max.x,(x+1)/2),bounds.min.y-.5,
   THREE.MathUtils.lerp(bounds.min.z,bounds.max.z,(z+1)/2));
  const ray=new THREE.Raycaster(eye,target.clone().sub(eye).normalize(),0,eye.distanceTo(target));
  assert(ray.intersectObject(liner).length>0,`${id}: road visible through footwell ${x},${z}; bounds=${JSON.stringify(bounds)}`);
 }
 const tune=hoodCameraDefaultForCar(id);
 const adjusted=eye.clone().add(new THREE.Vector3(tune.lateral-DEFAULT_HOOD_CAMERA_ADJUSTMENT.lateral,tune.height-DEFAULT_HOOD_CAMERA_ADJUSTMENT.height,tune.forward-DEFAULT_HOOD_CAMERA_ADJUSTMENT.forward));
 for(const dx of [-.4,.4])for(const dy of [-.3,.3])for(const dz of [-.28,.28]){
  const movingEye=adjusted.clone().add(new THREE.Vector3(dx,dy,dz));
  assert(movingEye.y>rim.max.y+.15,`${id}: configured seat + neck travel must still clear rim`);
  for(const x of [-.95,0,.95])for(const z of [-.95,0,.95]){
   const target=new THREE.Vector3(THREE.MathUtils.lerp(bounds.min.x,bounds.max.x,(x+1)/2),bounds.min.y-.5,THREE.MathUtils.lerp(bounds.min.z,bounds.max.z,(z+1)/2));
   assert(new THREE.Raycaster(movingEye,target.clone().sub(movingEye).normalize(),0,movingEye.distanceTo(target)).intersectObject(liner).length>0,`${id}: inertial head motion exposes ground through cabin`);
  }
 }
 let triangles=0;parts.group.traverse(n=>{if(n instanceof THREE.Mesh)triangles+=(n.geometry.index?.count??n.geometry.getAttribute('position').count)/3;});
 assert(triangles<8000,`${id}: preserve low-poly budget (${triangles})`);
 console.log(id,{eye:eye.toArray(),rimClearanceM:(eye.y-rim.max.y)/10,triangles,linerBounds:bounds});
}
console.log('Camera/input/cockpit regression checks passed.');
