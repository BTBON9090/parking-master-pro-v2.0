import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {CAR_MODELS} from '../constants';
import {CarType} from '../types';
import {MODEL_REGISTRY,CAR_TYPE_TO_MODEL,normalizeModel} from '../three/modelLoader';
import {buildNativeAuthoredVehicle} from '../three/blenderVehicle';
const cfg=CAR_MODELS[CarType.COACH],def=MODEL_REGISTRY[CAR_TYPE_TO_MODEL[CarType.COACH]];
const bytes=fs.readFileSync('public/models/'+def.file);
const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
normalizeModel(gltf.scene,def);const parts=buildNativeAuthoredVehicle(gltf.scene,cfg);parts.group.updateMatrixWorld(true);
assert.equal(parts.wheels.length,4);assert(Math.abs(cfg.dynamics.transmission.wheelRadiusM-.52175)<1e-8);
assert(Math.abs(cfg.width-25.5)<1e-8&&Math.abs(cfg.height-36.5)<1e-8,'car body width and collider height');
const vehicleBox=new THREE.Box3().setFromObject(parts.group,true);
assert(Math.abs(vehicleBox.max.y-cfg.height)<.025,`model top ${vehicleBox.max.y} vs configured height ${cfg.height}`);
assert(parts.nativeCockpit&&parts.nativeCockpit.eye.y<cfg.height-1,'driver eye below the roof');
const body=parts.group.getObjectByName('Body');assert(body,'coach shell exists');
// The roof shoulder should keep almost the full 2.55m body width, while
// remaining inside the body's existing collision width.
const roofX:number[]=[];
body.traverse(node=>{if(node instanceof THREE.Mesh){const positions=node.geometry.getAttribute('position');for(let i=0;i<positions.count;i++){
 const v=new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(node.matrixWorld);
 if(v.y>34&&Math.abs(v.z)<20)roofX.push(v.x);
}}});
assert(roofX.length>0,'roof sample must exist');
const roofWidth=Math.max(...roofX)-Math.min(...roofX);
assert(roofWidth>cfg.width*.95&&roofWidth<=cfg.width+.02,`roof width ${roofWidth} vs body width ${cfg.width}`);
body.traverse(o=>{if(o instanceof THREE.Mesh){const materials=Array.isArray(o.material)?o.material:[o.material];for(const m of materials)m.side=THREE.DoubleSide;}});
for(const wheel of parts.wheels){
 const radius=Number(wheel.userData.wheelRadius),width=Number(wheel.userData.wheelWidth);
 assert(Math.abs(radius-5.2175)<.02,`radius ${radius}`);assert(Math.abs(width-2.95)<.03,`width ${width}`);
 for(const rot of [0,Math.PI/4,Math.PI/2]){
  wheel.rotation.x=rot;parts.group.updateMatrixWorld(true);
  const s=new THREE.Box3().setFromObject(wheel,true).getSize(new THREE.Vector3());
  assert(Math.abs(s.y-s.z)<.1,`wheel is not round: ${s.y} vs ${s.z}`);
 }
 wheel.rotation.x=0;parts.group.updateMatrixWorld(true);
 const center=wheel.getWorldPosition(new THREE.Vector3());
 assert(Math.abs(center.y-radius)<.02,`nominal ground contact: centre ${center.y}, radius ${radius}`);
 for(const xShift of [-1.2,0,1.2])for(const bump of [0,1.0,1.8])for(let i=0;i<32;i++){
  const origin=center.clone().add(new THREE.Vector3(xShift,bump,0));const a=i*Math.PI/16;
  const ray=new THREE.Raycaster(origin,new THREE.Vector3(0,Math.sin(a),Math.cos(a)),0,radius-.06);
  assert.equal(ray.intersectObject(body,true).length,0,`${wheel.name} body contact, x ${xShift}, bump ${bump}, angle ${i*11.25}`);
 }
}
console.log('Coach wheel PASS: realistic-size circular tyres, width retained, physical radius and sampled arch/suspension clearance');
