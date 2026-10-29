import assert from 'node:assert/strict';
import fs from 'node:fs';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {CrashDebris} from '../three/crashDebris';
import {MODEL_REGISTRY,CAR_TYPE_TO_MODEL,normalizeModel} from '../three/modelLoader';
import {buildNativeAuthoredVehicle} from '../three/blenderVehicle';
import {CAR_MODELS,GARAGE_CARS} from '../constants';

// The severe-impact path has to work with every garage asset, including long
// multi-axle and tracked vehicles, and release all Cannon bodies on recovery.
for(const id of GARAGE_CARS){
 const cfg=CAR_MODELS[id],def=MODEL_REGISTRY[CAR_TYPE_TO_MODEL[id]],b=fs.readFileSync('public/models/'+def.file);
 const gltf=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
 normalizeModel(gltf.scene,def);const parts=buildNativeAuthoredVehicle(gltf.scene,cfg);
 const wreck=new CrashDebris(parts.group,{x:260,y:0},0,[],()=>0,undefined,{mass:cfg.weight,spawnDriver:false});
 const fragments=wreck.group.children.filter(o=>o.name.startsWith('body-fragment-'));
 assert(fragments.length>0,`${id}: authored shell should create fragments`);
 assert.equal(wreck.group.children.filter(o=>o.name.startsWith('driver-')).length,0,`${id}: capped mobile crash work`);
 const bodies=wreck.world.bodies.filter(o=>o.mass>0);assert(bodies.some(o=>o.velocity.x>200),`${id}: fragments inherit forward momentum`);
 for(let n=0;n<15;n++)wreck.step(1/60);
 assert(bodies.every(o=>Number.isFinite(o.position.x+o.position.y+o.position.z)),`${id}: positions remain finite`);
 wreck.dispose();assert.equal(wreck.world.bodies.length,0,`${id}: crash bodies released`);
}
console.log(`Severe crash PASS: ${GARAGE_CARS.length} garage vehicle assets fracture, inherit momentum, stay finite and release bodies.`);
