import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {CrashDebris} from '../three/crashDebris';
import {MODEL_REGISTRY,CAR_TYPE_TO_MODEL,normalizeModel} from '../three/modelLoader';
import {buildNativeAuthoredVehicle} from '../three/blenderVehicle';
import {CAR_MODELS} from '../constants';
import {CarType} from '../types';
const cfg=CAR_MODELS[CarType.TAI7],def=MODEL_REGISTRY[CAR_TYPE_TO_MODEL[cfg.id]];
const data=fs.readFileSync('public/models/'+def.file);
const gltf=await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
normalizeModel(gltf.scene,def);const parts=buildNativeAuthoredVehicle(gltf.scene,cfg);parts.group.rotation.y=Math.PI/2;
const results=[];
for(const hz of [30,60,120]){
 const crash=new CrashDebris(parts.group,{x:200,y:0},0,[],()=>0);
 assert.equal(crash.group.children.filter(n=>n.name.startsWith('body-fragment-')).length,12);
 assert.equal(crash.group.children.filter(n=>n.name.startsWith('driver-')).length,6);
 assert.equal(crash.world.constraints.length,5);
 assert.equal(crash.group.children.filter(n=>n.name.startsWith('detached-wheel-')).length,4,'detach complete round tyres');
 for(const chunk of crash.group.children.filter(n=>n.name.startsWith('body-fragment-'))) {const size=new THREE.Box3().setFromObject(chunk,true).getSize(new THREE.Vector3());assert(Math.max(size.x,size.y,size.z)<cfg.length*.60,'fracture planes must clip long triangles without spikes');}
 const starts=new Map(crash.group.children.filter(n=>n.name.startsWith('body-fragment-')||n.name.startsWith('detached-wheel-')).map(n=>[n,n.position.x]));
 let maxVelocity=0,maxReach=0;
 for(let i=0;i<hz*20;i++){
  crash.step(1/hz);
  if(i===hz-1)for(const [mesh,x] of starts)assert(mesh.position.x-x>80,'every shell fragment and tyre must travel forwards during the first second');
  for(const b of crash.world.bodies){maxVelocity=Math.max(maxVelocity,b.velocity.length());maxReach=Math.max(maxReach,Math.hypot(b.position.x,b.position.z));assert(Number.isFinite(b.position.x+b.position.y+b.position.z));assert(b.position.y>-.1,'no debris falling through floor');}
 }
 assert(maxVelocity<300,'split shell must not explode from overlapping proxy bounds');
 assert(maxReach>100 && maxReach<800,'momentum must carry fragments beyond the impact point, without unbounded explosions');
 results.push({hz,maxVelocity,maxReach});
 crash.dispose();assert.equal(crash.world.bodies.length,0);
}
console.log('Authored mesh breakup + connected driver + stable settling + disposal PASS',results);
fs.writeFileSync('docs/round17/crash-simulation.json',JSON.stringify(results,null,2));
